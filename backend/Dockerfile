FROM python:3.12-slim

COPY --from=ghcr.io/astral-sh/uv:latest /uv /usr/local/bin/uv
WORKDIR /app
ENV UV_COMPILE_BYTECODE=1 UV_LINK_MODE=copy HF_HOME=/app/.cache/huggingface

# Set to "" to build a small image that uses the hashing embedder instead of PyTorch.
ARG EXTRAS="--extra embeddings"
COPY pyproject.toml uv.lock ./
RUN uv sync --frozen --no-dev ${EXTRAS}

COPY app ./app
RUN useradd --create-home homebase && mkdir -p /app/.cache && chown -R homebase /app/.cache
USER homebase

EXPOSE 8000
CMD ["uv", "run", "--no-sync", "uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
