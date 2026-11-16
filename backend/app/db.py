import json
import time
from collections.abc import Iterator

from sqlalchemy import JSON, BigInteger, ForeignKey, SmallInteger, String, Text, UniqueConstraint, create_engine, text
from sqlalchemy.orm import DeclarativeBase, Mapped, Session, mapped_column, sessionmaker
from sqlalchemy.pool import StaticPool
from sqlalchemy.types import TypeDecorator

from app.config import get_settings

EMBED_DIM = 384


def now_ms() -> int:
    return int(time.time() * 1000)


class EmbeddingType(TypeDecorator):
    """pgvector `vector(n)` on PostgreSQL, JSON everywhere else (tests, local SQLite)."""

    impl = JSON
    cache_ok = True

    def load_dialect_impl(self, dialect):
        if dialect.name == "postgresql":
            from pgvector.sqlalchemy import Vector

            return dialect.type_descriptor(Vector(EMBED_DIM))
        return dialect.type_descriptor(JSON())

    def process_bind_param(self, value, dialect):
        return None if value is None else [float(x) for x in value]

    def process_result_value(self, value, dialect):
        if value is None:
            return None
        if isinstance(value, str):
            value = json.loads(value)
        return [float(x) for x in value]


class Base(DeclarativeBase):
    pass


class User(Base):
    __tablename__ = "users"
    id: Mapped[int] = mapped_column(primary_key=True)
    email: Mapped[str] = mapped_column(String(320), unique=True, index=True)
    google_sub: Mapped[str | None] = mapped_column(String(64), unique=True, default=None)
    # Bumped on every change to this user's bookmarks; used to invalidate the search index cache.
    rev: Mapped[int] = mapped_column(default=0)
    created_at: Mapped[int] = mapped_column(BigInteger, default=now_ms)


class Bookmark(Base):
    __tablename__ = "bookmarks"
    __table_args__ = (UniqueConstraint("user_id", "canonical_url"),)
    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    url: Mapped[str] = mapped_column(Text)
    canonical_url: Mapped[str] = mapped_column(Text)
    title: Mapped[str] = mapped_column(Text, default="")
    folder: Mapped[str] = mapped_column(Text, default="")
    # Folder label confirmed by the user through active learning; overrides `folder` as training label.
    label: Mapped[str | None] = mapped_column(Text, default=None)
    description: Mapped[str] = mapped_column(Text, default="")
    text: Mapped[str] = mapped_column(Text, default="")
    added_at: Mapped[int] = mapped_column(BigInteger, default=0)
    updated_at: Mapped[int] = mapped_column(BigInteger, default=0)
    deleted: Mapped[bool] = mapped_column(default=False)
    link_status: Mapped[int | None] = mapped_column(default=None)
    link_checked_at: Mapped[int | None] = mapped_column(BigInteger, default=None)
    embedding: Mapped[list[float] | None] = mapped_column(EmbeddingType, default=None)
    embed_hash: Mapped[str | None] = mapped_column(String(40), default=None)


class Event(Base):
    __tablename__ = "events"
    __table_args__ = (UniqueConstraint("user_id", "client_event_id"),)
    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    client_event_id: Mapped[str] = mapped_column(String(64))
    type: Mapped[str] = mapped_column(String(16))
    url: Mapped[str | None] = mapped_column(Text, default=None)
    canonical_url: Mapped[str | None] = mapped_column(Text, default=None)
    source: Mapped[str | None] = mapped_column(String(32), default=None)
    query: Mapped[str | None] = mapped_column(Text, default=None)
    variant: Mapped[str | None] = mapped_column(String(16), default=None)
    ts: Mapped[int] = mapped_column(BigInteger)
    hour: Mapped[int] = mapped_column(SmallInteger, default=0)
    dow: Mapped[int] = mapped_column(SmallInteger, default=0)


def _make_engine():
    url = get_settings().database_url
    if url.startswith("postgresql://"):
        url = url.replace("postgresql://", "postgresql+psycopg://", 1)
    if url.startswith("sqlite"):
        kwargs: dict = {"connect_args": {"check_same_thread": False}}
        if url in ("sqlite://", "sqlite:///:memory:"):
            kwargs["poolclass"] = StaticPool
        return create_engine(url, **kwargs)
    return create_engine(url, pool_pre_ping=True)


engine = _make_engine()
SessionLocal = sessionmaker(engine, expire_on_commit=False)


def init_db() -> None:
    if engine.dialect.name == "postgresql":
        with engine.begin() as conn:
            conn.execute(text("CREATE EXTENSION IF NOT EXISTS vector"))
    Base.metadata.create_all(engine)


def get_db() -> Iterator[Session]:
    with SessionLocal() as session:
        yield session
