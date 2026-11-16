import time

from app import crawler
from tests.conftest import login


def push(client, headers, demo, **extra):
    now = int(time.time() * 1000)
    body = {"upserts": [{**b, "added_at": now - 40 * 86_400_000, "updated_at": 1} for b in demo], **extra}
    r = client.post("/sync", json=body, headers=headers)
    assert r.status_code == 200, r.text
    return r.json()


def test_requires_auth(client):
    for path in ("/bookmarks", "/search?q=x", "/stats", "/export", "/recommendations", "/clusters"):
        assert client.get(path).status_code == 401
    assert client.get("/bookmarks", headers={"Authorization": "Bearer nonsense"}).status_code == 401


def test_refresh_flow_and_token_types(client):
    tokens = client.post("/auth/dev", json={"email": "ada@example.com"}).json()
    assert client.get("/bookmarks", headers={"Authorization": f"Bearer {tokens['refresh_token']}"}).status_code == 401
    assert client.post("/auth/refresh", json={"refresh_token": tokens["access_token"]}).status_code == 401
    fresh = client.post("/auth/refresh", json={"refresh_token": tokens["refresh_token"]}).json()
    assert client.get("/bookmarks", headers={"Authorization": f"Bearer {fresh['access_token']}"}).status_code == 200


def test_google_login_needs_configuration(client):
    assert client.post("/auth/google", json={"id_token": "x"}).status_code == 503


def test_sync_is_idempotent_and_newest_write_wins(client, demo):
    h = login(client)
    first = push(client, h, demo)
    assert first["upserted"] == len(demo) == first["bookmarks"]
    assert push(client, h, demo)["bookmarks"] == len(demo)

    url = demo[0]["url"]
    client.post("/sync", headers=h, json={"upserts": [{"url": url, "title": "Newer", "updated_at": 5}]})
    client.post(
        "/sync", headers=h, json={"upserts": [{"url": url + "?utm_source=x", "title": "Stale", "updated_at": 2}]}
    )
    titles = {b["url"]: b["title"] for b in client.get("/bookmarks", headers=h).json()}
    assert titles[url] == "Newer" and len(titles) == len(demo)

    gone = client.post("/sync", headers=h, json={"deletes": [url]}).json()
    assert gone["deleted"] == 1 and gone["bookmarks"] == len(demo) - 1


def test_events_are_deduplicated(client, demo):
    h = login(client)
    event = {"id": "e1", "type": "open", "url": demo[0]["url"], "source": "folder", "ts": 1000, "hour": 9, "dow": 1}
    assert push(client, h, demo, events=[event])["events"] == 1
    assert client.post("/sync", headers=h, json={"events": [event]}).json()["events"] == 0
    assert client.get("/stats", headers=h).json()["opens"] == 1


def test_users_cannot_see_each_other(client, demo):
    ada, bob = login(client), login(client, "bob@example.com")
    push(client, ada, demo)
    assert client.get("/bookmarks", headers=bob).json() == []
    assert client.get("/search", params={"q": "sql index"}, headers=bob).json()["results"] == []
    assert client.get("/export", headers=bob).json()["bookmarks"] == []
    client.post("/sync", headers=bob, json={"deletes": [demo[0]["url"]]})
    assert len(client.get("/bookmarks", headers=ada).json()) == len(demo)


def test_search_and_ask(client, demo):
    h = login(client)
    push(client, h, demo)
    for mode in ("keyword", "vector", "hybrid"):
        body = client.get("/search", params={"q": "b-tree index sql performance", "mode": mode}, headers=h).json()
        assert "use-the-index-luke" in body["results"][0]["url"], mode
    for mode in ("vector", "hybrid"):
        junk = client.get("/search", params={"q": "xylophone quokka zeppelin", "mode": mode}, headers=h).json()
        assert junk["results"] == [], mode
    answer = client.post("/ask", json={"question": "what did I save about database indexing?"}, headers=h).json()
    assert answer["grounded"] and answer["sources"]
    assert all(f"[{s['n']}]" in answer["answer"] for s in answer["sources"])
    urls = {b["url"] for b in demo}
    assert all(s["url"] in urls for s in answer["sources"])
    nothing = client.post("/ask", json={"question": "xylophone quokka zeppelin"}, headers=h).json()
    assert nothing["grounded"] is False and nothing["answer"] is None and nothing["sources"] == []


def test_clusters_duplicates_tags_and_recommendations(client, demo):
    h = login(client)
    now = int(time.time() * 1000)
    events = [
        {
            "id": f"o{i}",
            "type": "open",
            "url": demo[19]["url"],
            "source": "folder",
            "ts": now - i * 86_400_000,
            "hour": 10,
            "dow": 2,
        }
        for i in range(1, 6)
    ]
    push(client, h, demo, events=events)

    clusters = client.get("/clusters", headers=h).json()
    assert len(clusters["clusters"]) >= 2 and all(c["terms"] for c in clusters["clusters"])
    assert sum(c["size"] for c in clusters["clusters"]) == len(demo)

    assert client.get("/duplicates", headers=h).json()["pairs"] == []

    tags = client.get("/tags/suggestions", headers=h).json()
    unfiled = [b["url"] for b in demo if not b["folder"]]
    assert sorted(s["url"] for s in tags["suggestions"]) == sorted(unfiled) and tags["ask_me"]
    target = tags["ask_me"][0]["url"]
    assert client.post("/tags/confirm", json={"url": target, "folder": "Dev"}, headers=h).status_code == 200
    assert target not in [s["url"] for s in client.get("/tags/suggestions", headers=h).json()["suggestions"]]

    recs = client.get("/recommendations", params={"hour": 10}, headers=h).json()["results"]
    assert recs and recs[0]["url"] == demo[19]["url"] and recs[0]["reason"]


def test_stats(client, demo):
    h = login(client)
    events = [
        {"id": "i1", "type": "impression", "variant": "recommended", "ts": 1, "hour": 9, "dow": 0},
        {"id": "i2", "type": "impression", "variant": "recommended", "ts": 2, "hour": 9, "dow": 0},
        {"id": "i3", "type": "impression", "variant": "recent", "ts": 3, "hour": 9, "dow": 0},
        {
            "id": "o1",
            "type": "open",
            "url": demo[0]["url"],
            "source": "rightnow",
            "variant": "recommended",
            "ts": 4,
            "hour": 9,
            "dow": 0,
        },
    ]
    push(client, h, demo, events=events)
    s = client.get("/stats", headers=h).json()
    assert s["bookmarks"] == len(demo) and s["opens_by_hour"][9] == 1
    lo, hi = s["never_opened_ci95"]
    assert lo <= s["never_opened_share"] <= hi < 1.0001
    ab = {v["variant"]: v for v in s["ab_test"]}
    assert ab["recommended"]["ctr"] == 0.5 and ab["recent"]["ctr"] == 0
    assert s["link_health"] == {"unchecked": len(demo)}
    assert sum(b["bookmarks"] for b in s["interest_by_age"]) == len(demo)


def test_link_check_records_status_and_fills_text(client, demo, monkeypatch):
    h = login(client)
    push(client, h, [{**demo[0], "description": ""}, demo[1]])

    def fake_fetch(url, want_text, client=None):
        if "mozilla" in url:
            return 200, "<title>x</title><meta name='description' content='Fetched description about closures'>"
        return 404, None

    monkeypatch.setattr(crawler, "fetch", fake_fetch)
    assert client.post("/jobs/check-links", params={"fetch_text": True}, headers=h).json()["queued"] == 50
    states = {b["url"]: b["link_state"] for b in client.get("/bookmarks", headers=h).json()}
    assert states == {demo[0]["url"]: "ok", demo[1]["url"]: "dead"}
    exported = {b["url"]: b for b in client.get("/export", headers=h).json()["bookmarks"]}
    assert exported[demo[0]["url"]]["description"] == "Fetched description about closures"
    assert exported[demo[1]["url"]]["description"] == demo[1]["description"]


def test_link_check_records_nothing_when_everything_fails(client, demo, monkeypatch):
    h = login(client)
    push(client, h, demo[:4])
    monkeypatch.setattr(crawler, "fetch", lambda url, want_text, client=None: (0, None))
    client.post("/jobs/check-links", headers=h)
    assert {b["link_state"] for b in client.get("/bookmarks", headers=h).json()} == {"unchecked"}


def test_export_and_delete_everything(client, demo):
    h = login(client)
    push(client, h, demo[:5], events=[{"id": "e", "type": "search", "query": "sql", "ts": 1, "hour": 1, "dow": 1}])
    data = client.get("/export", headers=h).json()
    assert (
        len(data["bookmarks"]) == 5
        and len(data["bookmarks"][0]["embedding"]) == 384
        and data["events"][0]["query"] == "sql"
    )
    assert client.delete("/account", headers=h).json() == {"deleted": True}
    assert client.get("/bookmarks", headers=h).status_code == 401
    assert client.get("/export", headers=login(client)).json()["bookmarks"] == []


def test_openapi_documents_every_area(client):
    paths = client.get("/openapi.json").json()["paths"]
    for path in ("/sync", "/bookmarks", "/search", "/clusters", "/recommendations", "/stats", "/ask"):
        assert path in paths
