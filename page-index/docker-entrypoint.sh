#!/usr/bin/env bash
set -e

# The worker passes its own command (celery ...) as args — run it as-is,
# with no migrations (only the api container migrates).
if [ "$1" = "celery" ]; then
  exec "$@"
fi

# api container: run DB migrations, then serve.
# UVICORN_WORKERS controls process-level parallelism (CPU-bound PyPDF2 retrieval
# is GIL-locked, so scale with vCPUs). The resume-on-startup is Redis-locked so
# multiple workers don't duplicate-dispatch pending tasks.
alembic upgrade head
exec uvicorn api.main:app --host 0.0.0.0 --port 8000 --workers "${UVICORN_WORKERS:-1}"
