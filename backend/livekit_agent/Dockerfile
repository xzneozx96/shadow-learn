# syntax=docker/dockerfile:1

ARG PYTHON_VERSION=3.13
FROM ghcr.io/astral-sh/uv:python${PYTHON_VERSION}-bookworm-slim AS base

ENV PYTHONUNBUFFERED=1
ENV UV_CACHE_DIR=/opt/uv-cache
ENV UV_PROJECT_ENVIRONMENT=/opt/venv
ENV PATH="/opt/venv/bin:$PATH"

ARG UID=1000
RUN adduser \
    --disabled-password \
    --gecos "" \
    --home "/app" \
    --shell "/sbin/nologin" \
    --uid "${UID}" \
    appuser

RUN apt-get update && apt-get install -y \
    ffmpeg \
    libasound2 \
    libssl3 \
    libgstreamer1.0-0 \
    libglib2.0-0 \
    gcc \
    g++ \
    python3-dev \
  && rm -rf /var/lib/apt/lists/*

RUN mkdir -p /opt/uv-cache /opt/venv /app && \
    chown -R appuser:appuser /opt/uv-cache /opt/venv /app

WORKDIR /app
USER appuser

# Copy workspace root manifests first (backend/pyproject.toml + backend/uv.lock)
# then the livekit_agent member pyproject so uv can resolve the workspace.
COPY --chown=appuser:appuser pyproject.toml uv.lock ./
COPY --chown=appuser:appuser livekit_agent/pyproject.toml livekit_agent/pyproject.toml

# Install only livekit-agent's deps from the shared workspace lock.
RUN uv sync --locked --no-dev --package livekit-agent

# Copy source after deps are cached.
COPY --chown=appuser:appuser livekit_agent/ livekit_agent/

# Pre-download VAD / noise-cancellation model files at build time
# so containers start immediately without a network fetch on first run.
WORKDIR /app/livekit_agent
RUN uv run python agent.py download-files || true

# 8081: legacy health-check exposed by AgentServer.
# 8082: offshore FastAPI proxy (see http_server.py).
EXPOSE 8081 8082

# Run from livekit_agent/ so bare imports (userdata, agents, http_server,
# schemas, gemini_client) resolve correctly. entrypoint.py runs the LiveKit
# agent worker AND the FastAPI proxy concurrently in one process.
CMD ["uv", "run", "python", "entrypoint.py"]
