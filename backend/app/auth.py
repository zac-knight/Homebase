import time

import jwt
from fastapi import Depends, Header, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.config import get_settings
from app.db import User, get_db


def _token(user_id: int, typ: str, ttl_seconds: int) -> str:
    payload = {"sub": str(user_id), "typ": typ, "exp": int(time.time()) + ttl_seconds}
    return jwt.encode(payload, get_settings().jwt_secret, algorithm="HS256")


def issue_tokens(user: User) -> dict:
    s = get_settings()
    return {
        "access_token": _token(user.id, "access", s.access_token_minutes * 60),
        "refresh_token": _token(user.id, "refresh", s.refresh_token_days * 86400),
        "expires_in": s.access_token_minutes * 60,
        "email": user.email,
    }


def decode(token: str, typ: str) -> int:
    try:
        payload = jwt.decode(token, get_settings().jwt_secret, algorithms=["HS256"])
    except jwt.PyJWTError as exc:
        raise HTTPException(401, "Invalid or expired token") from exc
    if payload.get("typ") != typ:
        raise HTTPException(401, "Wrong token type")
    return int(payload["sub"])


def verify_google_id_token(token: str) -> dict:
    """Returns the verified claims. Split out so tests can stub the network call."""
    from google.auth.transport import requests as google_requests
    from google.oauth2 import id_token

    return id_token.verify_oauth2_token(token, google_requests.Request(), get_settings().google_client_id)


def get_or_create_user(db: Session, email: str, google_sub: str | None = None) -> User:
    email = email.strip().lower()
    user = db.scalar(select(User).where(User.email == email))
    if user is None:
        user = User(email=email, google_sub=google_sub)
        db.add(user)
        db.commit()
    return user


def current_user(authorization: str = Header(default=""), db: Session = Depends(get_db)) -> User:
    scheme, _, token = authorization.partition(" ")
    if scheme.lower() != "bearer" or not token:
        raise HTTPException(401, "Missing bearer token")
    user = db.get(User, decode(token, "access"))
    if user is None:
        raise HTTPException(401, "Unknown user")
    return user
