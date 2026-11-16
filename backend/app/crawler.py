"""Link health checks and (opt-in) page text extraction."""

import ipaddress
import socket
from html.parser import HTMLParser
from urllib.parse import urljoin, urlsplit

import httpx

MAX_BYTES = 500_000
SKIP_TAGS = {"script", "style", "noscript", "nav", "footer", "header", "aside", "form", "svg", "template"}
TEXT_TAGS = {"p", "h1", "h2", "h3", "li", "blockquote", "pre"}
HEADERS = {"User-Agent": "HomebaseLinkCheck/0.1", "Accept": "text/html,*/*;q=0.5"}


def is_public_host(host: str) -> bool | None:
    """True for a public address, False for loopback/private/link-local ones (basic SSRF guard),
    None when the name does not resolve at all."""
    try:
        infos = socket.getaddrinfo(host, None)
    except OSError:
        return None
    return bool(infos) and all(ipaddress.ip_address(info[4][0].split("%")[0]).is_global for info in infos)


class _Extractor(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.title = ""
        self.description = ""
        self.chunks: list[str] = []
        self._skip = 0
        self._in_title = False
        self._in_text = 0

    def handle_starttag(self, tag, attrs):
        if tag in SKIP_TAGS:
            self._skip += 1
        elif tag == "title":
            self._in_title = True
        elif tag in TEXT_TAGS:
            self._in_text += 1
        elif tag == "meta":
            a = dict(attrs)
            if (a.get("name") or a.get("property") or "").lower() in ("description", "og:description"):
                self.description = self.description or (a.get("content") or "").strip()

    def handle_endtag(self, tag):
        if tag in SKIP_TAGS:
            self._skip = max(0, self._skip - 1)
        elif tag == "title":
            self._in_title = False
        elif tag in TEXT_TAGS:
            self._in_text = max(0, self._in_text - 1)
            self.chunks.append("\n")

    def handle_data(self, data):
        if self._in_title:
            self.title += data
        elif self._in_text and not self._skip:
            self.chunks.append(data)


def extract(html: str) -> dict:
    parser = _Extractor()
    try:
        parser.feed(html)
    except Exception:
        pass
    lines = [" ".join(line.split()) for line in "".join(parser.chunks).split("\n")]
    text = "\n".join(line for line in lines if len(line) > 30)
    return {"title": " ".join(parser.title.split()), "description": parser.description[:500], "text": text[:5000]}


def fetch(url: str, want_text: bool, client: httpx.Client | None = None) -> tuple[int, str | None]:
    """Returns (status, html). Status 0 means the request failed outright; -1 means we refused it."""
    own = client is None
    client = client or httpx.Client(timeout=10.0, headers=HEADERS)
    try:
        for _ in range(6):
            parts = urlsplit(url)
            if parts.scheme not in ("http", "https") or not parts.hostname:
                return -1, None
            public = is_public_host(parts.hostname)
            if public is None:
                return 0, None  # the domain no longer resolves: the most common kind of link rot
            if not public:
                return -1, None
            with client.stream("GET", url, follow_redirects=False) as r:
                if r.is_redirect and r.headers.get("location"):
                    url = urljoin(url, r.headers["location"])
                    continue
                body = None
                if want_text and r.status_code < 400 and "html" in r.headers.get("content-type", ""):
                    buf = b""
                    for chunk in r.iter_bytes():
                        buf += chunk
                        if len(buf) >= MAX_BYTES:
                            break
                    body = buf.decode(r.encoding or "utf-8", errors="replace")
                return r.status_code, body
        return 0, None
    except httpx.HTTPError:
        return 0, None
    finally:
        if own:
            client.close()


def link_state(status: int | None) -> str:
    if status is None or status == -1:
        return "unchecked"
    if status in (0, 404, 410):
        return "dead"
    if status in (401, 403, 429) or status >= 500:
        return "unclear"  # blocked bots, rate limits and server hiccups are not proof of link rot
    return "ok"
