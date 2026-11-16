import json
import os
from pathlib import Path

# CI also runs this suite against PostgreSQL + pgvector by presetting HOMEBASE_DATABASE_URL.
os.environ.setdefault("HOMEBASE_DATABASE_URL", "sqlite://")
os.environ["HOMEBASE_DEV_AUTH"] = "true"
os.environ["HOMEBASE_EMBEDDER"] = "hashing"
os.environ["HOMEBASE_JWT_SECRET"] = "test-secret-that-is-long-enough-for-hs256"

import pytest  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402

from app import services  # noqa: E402
from app.db import Base, engine, init_db  # noqa: E402
from app.main import app  # noqa: E402

DEMO = Path(__file__).resolve().parents[2] / "sample-data" / "bookmarks.json"


@pytest.fixture
def client():
    Base.metadata.drop_all(engine)
    init_db()
    services._cache.clear()
    with TestClient(app) as c:
        yield c


@pytest.fixture
def demo() -> list[dict]:
    return json.loads(DEMO.read_text())


def login(client, email="ada@example.com") -> dict:
    r = client.post("/auth/dev", json={"email": email})
    assert r.status_code == 200, r.text
    return {"Authorization": f"Bearer {r.json()['access_token']}"}
