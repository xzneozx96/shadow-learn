FROM python:3.12-slim

RUN apt-get update && \
    apt-get install -y --no-install-recommends \
        ffmpeg \
        libasound2 \
        libssl3 \
        libgstreamer1.0-0 \
        libglib2.0-0 && \
    rm -rf /var/lib/apt/lists/*

# Node is only used as yt-dlp's JS runtime (js_runtimes in lessons/services/audio.py).
# Copy the official patched binary instead of Debian's unpatched nodejs package.
COPY --from=node:24.22.1-slim /usr/local/bin/node /usr/local/bin/node

WORKDIR /app

COPY pyproject.toml .
RUN pip install --no-cache-dir -e "."

COPY app/ app/
COPY alembic.ini .
COPY alembic/ alembic/

EXPOSE 8000

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
