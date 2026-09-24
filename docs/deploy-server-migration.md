# Deploy the server backend

This page lists what a deploy needs once user data lives on the server: accounts, Postgres, MinIO, and server-held provider keys.
Land the whole migration stack in one sitting. A partial stack on `main` ships a half-migrated app.

## Before the first deploy

1. Generate a Fernet key and set it as `SHADOWLEARN_ENCRYPTION_KEY` in the backend env.
   `uv run python -c 'from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())'`
   Back the key up off the server. Without it, every stored provider key is unreadable, and startup refuses a missing or malformed key.
2. Set `SHADOWLEARN_JWT_SECRET` and `SHADOWLEARN_JWT_REFRESH_SECRET` to two different random values of at least 32 characters.
3. Set `SHADOWLEARN_DATABASE_URL`, and set `SHADOWLEARN_S3_ENDPOINT`, `SHADOWLEARN_S3_ACCESS_KEY`, `SHADOWLEARN_S3_SECRET_KEY`, and `SHADOWLEARN_S3_BUCKET`. The backend creates the bucket at startup. The compose `backend` service runs `alembic upgrade head` before uvicorn.
4. Set `SHADOWLEARN_PUBLIC_APP_URL` to the public frontend URL, and set the `SHADOWLEARN_SMTP_*` settings. Startup refuses a non-local `public_app_url` without SMTP, because password reset needs mail.
5. Set `SHADOWLEARN_FRONTEND_ORIGIN_ALLOWLIST` (or `SHADOWLEARN_FRONTEND_ORIGIN_REGEX`) to the frontend origins. On Vercel, set `VITE_API_BASE` to the backend URL.
6. Move `GOOGLE_API_KEY` out of `backend/livekit_agent/.env` and into the backend env as `SHADOWLEARN_GOOGLE_API_KEY`. The LiveKit agent now asks the backend for the key of each speak session.
7. Set `SHADOWLEARN_BACKEND_URL` for the offshore LiveKit agent to the China-side backend's public URL. Compose sets it to `http://backend:8000` only for the local agent.
8. Keep `SHADOWLEARN_ENABLE_TEST_ROUTES` and `SHADOWLEARN_IMPORT_FAULT` unset. Startup refuses both outside local dev.

## Host nginx

- For `location /api/media/`, drop `$args` from the access log format, so that `?token=` media tickets are not logged. The backend already redacts them from its own access log.
- For `location /api/media/`, set `proxy_buffering off` so that Range streams start at once.
- Raise `client_body_timeout` and `proxy_send_timeout` so that 2 GB uploads to `/api/lessons/generate-upload` and `/api/import/media` finish.

## Backend service

- Run a single uvicorn worker. The startup sweep marks in-flight jobs as failed, and the rate limiter keeps its counts in process.
- Set `stop_grace_period: 30s` on the backend service. A graceful shutdown during a job took about 20 seconds in testing.

## After the deploy

1. `curl -sf https://<backend>/api/health/deps` returns `{"db":"ok","s3":"ok"}`.
2. Sign up, create a lesson, and open it.
3. Run one real speak session end to end. The agent's answer was not proven before deploy, because it needs LiveKit Cloud and Gemini.
4. On a browser that still holds data from the offline version, sign in and let the import modal reach Done.
