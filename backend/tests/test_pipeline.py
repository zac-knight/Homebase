import numpy as np
import pytest

from app import crawler
from app.pipeline.features import bookmark_features
from app.pipeline.stats import bootstrap_ci, wilson_interval
from app.pipeline.urls import canonicalise, domain, path_depth


@pytest.mark.parametrize(
    "a,b",
    [
        ("http://www.Example.com/post/", "https://example.com/post"),
        ("https://example.com/a?utm_source=x&utm_medium=y&id=3", "https://example.com/a?id=3"),
        ("https://example.com/a?b=2&a=1&fbclid=zzz", "https://example.com/a?a=1&b=2"),
        ("https://example.com:443/a#section-2", "https://example.com/a"),
        ("https://example.com//a///b", "https://example.com/a/b"),
    ],
)
def test_canonicalise_merges_equivalent_urls(a, b):
    assert canonicalise(a) == canonicalise(b)


def test_canonicalise_keeps_meaningful_differences():
    assert canonicalise("https://example.com/a?id=1") != canonicalise("https://example.com/a?id=2")
    assert canonicalise("https://app.example.com/#/inbox") != canonicalise("https://app.example.com/#/sent")
    assert canonicalise("https://example.com:8443/a") != canonicalise("https://example.com/a")
    assert canonicalise("chrome://settings") == "chrome://settings"
    assert canonicalise("not a url") == "not a url"


def test_domain_and_depth():
    assert domain("https://www.Example.com/a/b") == "example.com"
    assert path_depth("https://example.com/a/b/") == 2


def test_wilson_interval_brackets_the_estimate():
    lo, hi = wilson_interval(8, 20)
    assert lo < 0.4 < hi
    assert wilson_interval(0, 0) == (0.0, 0.0)
    assert wilson_interval(0, 10)[0] == 0.0


def test_bootstrap_ci_is_reproducible_and_sane():
    values = np.array([1] * 30 + [0] * 70)
    assert bootstrap_ci(values) == bootstrap_ci(values)
    lo, hi = bootstrap_ci(values)
    assert 0.15 < lo < 0.3 < hi < 0.45


def test_bookmark_features():
    now = 100 * 86_400_000
    bookmarks = [
        {
            "url": "https://a.com/x/y",
            "canonical_url": "https://a.com/x/y",
            "title": "T",
            "added_at": now - 10 * 86_400_000,
        }
    ]
    events = [{"type": "open", "canonical_url": "https://a.com/x/y", "ts": now - 86_400_000, "hour": 9, "dow": 1}] * 2
    row = bookmark_features(bookmarks, events, now)[0]
    assert row["open_count"] == 2 and row["modal_hour"] == 9 and row["path_depth"] == 2
    assert row["age_days"] == 10 and row["days_since_last_open"] == 1


def test_extract_pulls_title_description_and_body_text():
    html = """<html><head><title> My  Page </title><meta name="description" content="A summary."></head>
    <body><nav><p>Navigation links that should be ignored entirely here</p></nav>
    <p>This is the first real paragraph of the article body.</p><script>var x = "<p>not text</p>"</script></body></html>"""
    page = crawler.extract(html)
    assert page["title"] == "My Page" and page["description"] == "A summary."
    assert "first real paragraph" in page["text"] and "Navigation" not in page["text"] and "var x" not in page["text"]


def test_crawler_refuses_private_addresses():
    assert crawler.is_public_host("127.0.0.1") is False
    assert crawler.is_public_host("10.0.0.5") is False
    assert crawler.is_public_host("169.254.169.254") is False
    assert crawler.is_public_host("no-such-host.invalid") is None
    assert crawler.fetch("https://no-such-host.invalid/page", want_text=False) == (0, None)
    assert crawler.fetch("http://127.0.0.1:1/admin", want_text=True) == (-1, None)
    assert crawler.fetch("file:///etc/passwd", want_text=True) == (-1, None)


def test_link_state():
    assert [crawler.link_state(s) for s in (None, 200, 404, 0, 403, 503)] == [
        "unchecked",
        "ok",
        "dead",
        "dead",
        "unclear",
        "unclear",
    ]
