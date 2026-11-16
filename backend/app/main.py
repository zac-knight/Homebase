from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api import account, insights, jobs, login, organise, search, sync
from app.config import get_settings
from app.db import init_db


@asynccontextmanager
async def lifespan(_: FastAPI):
    init_db()
    yield


app = FastAPI(
    title="Homebase API",
    version="0.1.0",
    description="Sync, search and recommendations for the Homebase bookmark hub. Interactive docs at /docs.",
    lifespan=lifespan,
)
app.add_middleware(
    CORSMiddleware,
    allow_origin_regex=get_settings().cors_origin_regex,
    allow_methods=["*"],
    allow_headers=["Authorization", "Content-Type"],
)
for module in (login, sync, search, organise, insights, jobs, account):
    app.include_router(module.router)


@app.get("/health", tags=["meta"])
def health():
    s = get_settings()
    return {"ok": True, "dev_auth": s.dev_auth, "google_sign_in": bool(s.google_client_id)}
