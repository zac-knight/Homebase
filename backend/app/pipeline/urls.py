"""URL canonicalisation. Mirrors extension/src/lib/urls.ts; keep the two in step."""

import re
from urllib.parse import parse_qsl, urlencode, urlsplit, urlunsplit

TRACKING_PARAMS = {
    "fbclid", "gclid", "dclid", "gbraid", "wbraid", "msclkid", "mc_cid", "mc_eid", "igshid",
    "ref_src", "ref_url", "_hsenc", "_hsmi", "yclid", "si", "spm", "mkt_tok", "s_cid",
}  # fmt: skip


def canonicalise(url: str) -> str:
    """Normalised form used as the identity of a bookmark and for exact-duplicate detection."""
    url = url.strip()
    try:
        p = urlsplit(url)
        port = p.port
    except ValueError:
        return url
    if p.scheme not in ("http", "https") or not p.hostname:
        return url
    host = p.hostname.lower().rstrip(".")
    if host.startswith("www."):
        host = host[4:]
    if port and port != (80 if p.scheme == "http" else 443):
        host = f"{host}:{port}"
    path = re.sub(r"/{2,}", "/", p.path).rstrip("/")
    query = sorted(
        (k, v)
        for k, v in parse_qsl(p.query, keep_blank_values=True)
        if not k.lower().startswith("utm_") and k.lower() not in TRACKING_PARAMS
    )
    # Keep fragments only when they look like client-side routes (#/inbox, #!/page).
    fragment = p.fragment if p.fragment.startswith(("/", "!")) else ""
    return urlunsplit(("https", host, path, urlencode(query), fragment))[:2000]


def domain(url: str) -> str:
    try:
        host = urlsplit(url).hostname or ""
    except ValueError:
        return ""
    return host.lower().removeprefix("www.")


def path_depth(url: str) -> int:
    try:
        return len([seg for seg in urlsplit(url).path.split("/") if seg])
    except ValueError:
        return 0
