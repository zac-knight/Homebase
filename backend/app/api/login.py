"""Sign in: Google ID tokens or (development only) email, exchanged for short-lived tokens."""

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app import auth
from app.config import get_settings
from app.db import User, get_db

router = APIRouter()


class GoogleLogin(BaseModel):
    id_token: str


class DevLogin(BaseModel):
    email: str = Field(pattern=r"^[^@\s]+@[^@\s]+$", max_length=320)


class Refresh(BaseModel):
    refresh_token: str


@router.post("/auth/google", tags=["auth"])
def login_google(body: GoogleLogin, db: Session = Depends(get_db)):
    if not get_settings().google_client_id:
        raise HTTPException(503, "Google sign in is not configured on this server")
    try:
        claims = auth.verify_google_id_token(body.id_token)
    except Exception as exc:
        raise HTTPException(401, "Google token rejected") from exc
    if not claims.get("email") or not claims.get("email_verified"):
        raise HTTPException(401, "Google account has no verified email")
    return auth.issue_tokens(auth.get_or_create_user(db, claims["email"], claims.get("sub")))


@router.post("/auth/dev", tags=["auth"])
def login_dev(body: DevLogin, db: Session = Depends(get_db)):
    if not get_settings().dev_auth:
        raise HTTPException(404, "Not found")
    return auth.issue_tokens(auth.get_or_create_user(db, body.email))


@router.post("/auth/refresh", tags=["auth"])
def refresh(body: Refresh, db: Session = Depends(get_db)):
    user = db.get(User, auth.decode(body.refresh_token, "refresh"))
    if user is None:
        raise HTTPException(401, "Unknown user")
    return auth.issue_tokens(user)
