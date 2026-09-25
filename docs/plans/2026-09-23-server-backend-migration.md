# Server backend migration plan

ShadowLearn moves every user's data out of the browser's IndexedDB and into the existing FastAPI backend, with Postgres for records, MinIO for media, and email and password accounts.
Offline support is dropped. The server is the only source of truth, and IndexedDB survives only as a read-only v21 reader for the importer.
A mandatory importer moves each device's local data to the account, verifies it against a server-computed manifest, and deletes the local copy only on a full match.
Provider keys move server-side, encrypted with `SHADOWLEARN_ENCRYPTION_KEY`, with an unlimited fallback to the operator's env keys plus per-account rate limiting and usage logging.
The program is one frozen stack of nine PRs. PR6 is split in two because it touches about 40 consumer files across two areas of the app.
The stack lands together because Vercel may auto-deploy `main` and a half-migrated app must never ship.
Order is PR1, PR2, PR3, PR4, PR5, PR6a, PR6b, PR7, PR8.

## How to read this

One box is one unit of work. Every box names the evidence that checks it. A nested box is a sub-step of the box above it. Check a box only when its evidence exists, a file, a log line, a screenshot, a test run, or a SHA. The body is a how-to. The appendices explain and record.

The program runs `skills/poteto-mode/playbooks/autopilot-stack.md` under the installed plugin. No owner merges. The operator lands the frozen stack herself, bottom to top, so every PR is her item and stops at merge-ready. Browser lanes are driven through Claude Code's `verify` skill. Backend-only PRs drive the API with curl and pytest through Claude Code's `run` skill, still on ten live lanes.

Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked.

The operator trimmed live verification on 2026-09-23. PR3 and PR7 keep all ten lanes. Every other PR runs three lanes, and each skipped lane stays in its list marked `Skip.` with its original scenario.

## Program checklist

### Arm the program

- [ ] State the protocol and this plan to the operator, then stop. Start execution only on the operator's explicit go.
- [ ] On the operator's go, write the program objective into the standing orders and your todolist with this exact text. "Plan `docs/plans/2026-09-23-server-backend-migration.md`. PR order PR1, PR2, PR3, PR4, PR5, PR6a, PR6b, PR7, PR8, one frozen stack. Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked. No owner merges. The operator lands the stack bottom to top. Done when every PR carries a clean verdict at its head SHA, PR2, PR3, PR6a, PR6b, and PR7 have passed the operator's review gate, and the frozen list is delivered."
- [ ] Read these from the installed plugin at program start. Re-read them at every tick.
  - [ ] `skills/poteto-mode/playbooks/autopilot-stack.md`
  - [ ] `skills/swarm/SKILL.md`
  - [ ] Claude Code's built-in `verify` skill for browser lanes and `run` skill for API lanes. Both are built into Claude Code, not the plugin. Load them with the Skill tool.
  - [ ] `skills/poteto-mode/playbooks/opening-a-pr.md`
  - [ ] `skills/poteto-mode/playbooks/shipping.md`
  - [ ] `skills/show-me-your-work/SKILL.md`
  - [ ] `skills/deslop/SKILL.md` and `skills/no-comments/SKILL.md`
  - [ ] `skills/how/SKILL.md` for PR6a, PR6b, and PR7 owners, and `skills/interrogate/SKILL.md` for PR2, PR3, and PR7 owners.
- [ ] Arm the 30-minute audit tick as a real cadence with `/loop` in dynamic mode. Never leave the cadence to memory.
- [ ] Use this tick prompt, verbatim. "Re-read the execution playbook from the installed plugin and the standing orders. Audit the operation against both and fix drift in this tick. Probe every active lane and judge progress by side effects only. Stand down a lane only on affirmative failure evidence, and dispatch its replacement in the same tick. Then send the operator a status message, whether or not anything changed, with the queue table of PR, owner, state, and head SHA, the verdicts since the last tick, what merged, open operator gates, and blockers."
- [ ] On the operator's hold or stand-down, send every owner a zero-writes order at once.

### Spawn owners

- [ ] Spawn one owner per PR with the full lifecycle the execution playbook names. Every owner starts `decisions.tsv` within 15 minutes and keeps it uncommitted.
- [ ] Follow this dependency graph. Start dependent work only after its parent merges, or rebase its branch onto the parent's exact tip when the execution playbook stacks. A same-repository child PR targets its parent branch. A fork child PR targets trunk while retaining local parent ancestry. Freeze the bottom-to-top order because fork PR bases do not encode it.
  - [ ] PR1 is first and branches from `main`.
  - [ ] PR2 after PR1.
  - [ ] PR3 and PR4 both branch from PR2's tip and build in parallel. The frozen order is PR3 then PR4. The root rebases PR4 onto PR3's tip before it appends PR4.
  - [ ] PR5 after PR4.
  - [ ] PR6a after PR5.
  - [ ] PR6b after PR6a.
  - [ ] PR7 after PR6b.
  - [ ] PR8 after PR7.
- [ ] Hold the file boundaries.
  - [ ] PR1 touches only `docker-compose.yml`, `docker-compose.china.yml`, `backend/**`, `.github/workflows/backend-tests.yml`, and `docs/deployment_guideline.md`.
  - [ ] PR2 touches `backend/app/accounts/**`, `backend/app/main.py`, `backend/app/settings.py`, `backend/app/job_store.py`, `backend/app/background/router.py`, the router files that create jobs, `backend/alembic/versions/0002_*`, `backend/tests/**`, `backend/.env.example`, `frontend/src/shared/lib/api.ts`, `frontend/src/app/**`, the frontend files that call `fetch` with `API_BASE`, and `docs/deployment_guideline.md`.
  - [ ] PR3 touches `backend/app/keys/**`, `backend/app/internal/**`, `backend/app/speak/**`, `backend/livekit_agent/**`, every backend file that names a provider key field, `backend/alembic/versions/0003_*`, `docker-compose*.yml`, `frontend/src/features/settings/**`, `frontend/src/app/**`, and the frontend files that send key fields.
  - [ ] PR4 touches only `backend/app/userdata/**`, `backend/app/speak/situations.py`, `backend/app/speak/router.py`, `backend/app/main.py`, `backend/alembic/versions/0004_*`, and `backend/tests/**`.
  - [ ] PR5 touches only `backend/**`.
  - [ ] PR6a touches `frontend/src/db/**`, `frontend/src/app/**`, `frontend/src/features/lesson/**`, `frontend/src/features/settings/**`, `frontend/src/features/agent/application/useZoberChat.ts`, `frontend/tests/**`, `frontend/playwright.config.ts`, `.github/workflows/e2e-tests.yml`, and `backend/app/testing/**`.
  - [ ] PR6b touches `frontend/src/db/**`, `frontend/src/app/providers/AuthContext.tsx`, `frontend/src/features/{study,vocabulary,speak,shadowing,learning-materials,agent}/**`, `frontend/src/shared/hooks/**`, and `frontend/tests/**`.
  - [ ] PR7 touches `backend/app/importer/**`, `backend/pyproject.toml`, `backend/tests/**`, `frontend/src/features/migration/**`, `frontend/src/app/App.tsx`, `frontend/package.json`, and `frontend/tests/**`.
  - [ ] PR8 touches deletions and docs only, plus the files that reference what it deletes.
- [ ] Hold the review gate. PR2, PR3, PR6a, PR6b, and PR7 change an interaction. They wait for the operator's review in chat with screenshots and a video before merge.

### PR mechanics, for every PR

- [ ] Resolve the forge once. Default to `gh`; if `command -v origin` succeeds and Origin can resolve the repository, use `origin pr` for every PR operation. Record any fallback to `gh`. Record the intended PR base repository as canonical `<base-repo>` and validate it through the active forge. Do not infer it from the checkout's default remote. The checkout's remote today is `git@github.com:xzneozx96/shadow-learn.git`, so the expected value is `xzneozx96/shadow-learn`, but validate it. Capture it as a shell variable and pass `--repo "$base_repo"` to every `gh pr` command. Resolve and validate `<head-url>` through Shipping step 1 and capture it as `head_url` for the live-lane fetch. When the head repository is a fork, validate its identity and record its owner and repository name as `<fork-owner>` and `<head-name>`. Never require `gt`.
- [ ] Open the PR before self-proof and follow the readiness rule in `skills/poteto-mode/playbooks/opening-a-pr.md`. Open it ready by default. When repository instructions require a draft until named evidence exists, keep it draft until that evidence is recorded. Use `origin pr create --status open --base "$base_branch"` or `gh pr create --base "$base_branch" --repo "$base_repo"` for a ready same-repository PR. A same-repository stack child targets its parent branch. Every fork PR targets trunk. With GitHub, capture the approved PR title and body as `<title>` and `<body>`, then create it with `gh api --method POST "repos/$base_repo/pulls" -f "title=$title" -f "body=$body" -f "head=$fork_owner:$branch" -f "head_repo=$head_name" -f "base=$trunk" --jq .html_url`; add `-F draft=true` when repository instructions require a draft. Otherwise use the resolved Origin command. Stacked fork branches retain local parent ancestry.
- [ ] Run the repo's lint and typecheck once before the PR-facing push. Frontend PRs run `cd frontend && pnpm lint && npx tsc -b && pnpm test`. Backend PRs run `cd backend && uvx ruff check . && uv run pytest`. Push with hooks on. The root `package.json` runs lint-staged with eslint and ruff on commit, so never pass `--no-verify`.
- [ ] Run `/deslop` before each commit and `/no-comments` before review.
- [ ] Triage every Bugbot and security-reviewer comment per `skills/poteto-mode/references/bugbot-triage.md` under the installed plugin.
- [ ] Before babysit, rebase each independent PR and stack root onto current trunk. Rebase each unmerged stack child onto its parent's exact tip. After its parent merges, use Shipping's explicit old-base-to-trunk rebase before the child's merge-ready report.

### Verdict and merge, for every PR

- [ ] At the merge-ready head SHA, run the swarm per `skills/swarm/SKILL.md`. One gates lane. The ten live lanes from the PR's **Verify, live** block. The perf lane from its **Verify, perf** block. One audit lane that reads the diff and the receipts and distrusts the PR body.
- [ ] Clean only when every lane is `PASS`. Findings go back to the owner. A new head gets a fresh swarm and a fresh verdict.
- [ ] On a clean verdict the root appends the PR to the frozen bottom-to-top list and records the verdict SHA, the current landing SHA, and the recorded patch base. Nobody merges. When trunk moves, the root rebases the chain bottom to top per Shipping step 4, compares `git patch-id` of each PR's patch-base-to-head diff against its verdict, keeps the verdict only when the patch ID is unchanged, and sends any changed patch back through the swarm. The operator lands the bottom PR through `skills/poteto-mode/playbooks/shipping.md`, one at a time, and lands all nine in one sitting so `main` never holds a partial migration.

### Boot recipe, for every live lane

Each live lane is one `swarm workers` lane at the PR head, resolved through provider dispatch, in its own worktree or output directory, with its own receipt. Drive the surface only through the driver skill this plan names. Lane `n` runs from 1 to 10 and owns backend port `81<nn>`, frontend port `52<nn>`, Postgres database `lane_<n>`, and MinIO bucket `lane-<n>`, so lanes never share state.

- [ ] `git fetch -- "$head_url" "refs/heads/$head_branch" && git checkout --detach "$head_sha"` in the lane's worktree.
- [ ] Start the shared local services once per host with `docker compose up -d postgres minio` from the repo root (PR1 adds both services bound to `127.0.0.1`). Create the lane database with `psql "postgresql://shadowlearn:shadowlearn@127.0.0.1:5433/postgres" -c 'create database lane_<n>'`.
- [ ] Start the backend with `cd backend && SHADOWLEARN_DATABASE_URL="postgresql+asyncpg://shadowlearn:shadowlearn@127.0.0.1:5433/lane_<n>" SHADOWLEARN_S3_BUCKET="lane-<n>" SHADOWLEARN_FRONTEND_ORIGIN_ALLOWLIST='["http://127.0.0.1:52<nn>"]' uv run alembic upgrade head && uv run uvicorn app.main:app --port 81<nn>`. Wait for `curl -sf http://127.0.0.1:81<nn>/api/health/deps` to return `{"db":"ok","s3":"ok"}`. At trunk, or at a head below PR1, start the backend the old way with `uv run uvicorn app.main:app --port 81<nn>` and its `.env`.
- [ ] Start the frontend with `cd frontend && VITE_API_BASE="http://127.0.0.1:81<nn>" pnpm dev -- --port 52<nn> --strictPort`. Wait for `Local:` in the Vite output.
- [ ] Deliver input only through the driver skill's commands. Browser lanes use `verify` against `http://127.0.0.1:52<nn>`. API lanes use `run` with `curl` against `http://127.0.0.1:81<nn>`. Read-only diagnostics are `docker compose logs backend`, `psql ... -c 'select ...'`, `mc ls --recursive local/lane-<n>`, and the browser devtools network log through `verify`.
- [ ] Kill the uvicorn and Vite processes the lane started, and drop `lane_<n>` and `lane-<n>`, before the lane returns.
- [ ] Save every screenshot to `docs/plans/media/server-backend-migration/swarm-<pr-id>/worker-<n>/<slug>.png` and return the paths with the receipt path. `.gitignore` line 50 ignores `/docs/` as local-only dev docs, so these files never enter a commit.

## Stand up Postgres, MinIO, Alembic, and backend CI (PR1)

**Depends on.** None.

**Files.**

- [ ] Edit `docker-compose.yml` and `docker-compose.china.yml`.
- [ ] Edit `backend/pyproject.toml`, `backend/uv.lock`, `backend/Dockerfile`, `backend/.env.example`, `backend/app/settings.py`, `backend/app/main.py`, and `backend/tests/conftest.py`.
- [ ] Create `backend/app/db.py`, `backend/app/storage.py`, `backend/alembic.ini`, `backend/alembic/env.py`, `backend/alembic/script.py.mako`, and `backend/alembic/versions/0001_baseline.py`.
- [ ] Create `backend/tests/test_db_fixture.py` and `backend/tests/test_health_deps.py`.
- [ ] Create `.github/workflows/backend-tests.yml`.
- [ ] Edit `docs/deployment_guideline.md`.

**Build.**

- [ ] Add `sqlalchemy[asyncio]>=2.0`, `asyncpg>=0.30`, `alembic>=1.13`, and `aiobotocore>=2.15` to `backend/pyproject.toml` and run `uv lock`. Appendix A records the resolved versions.
- [ ] Add to `Settings` in `backend/app/settings.py` the fields `database_url` (default `postgresql+asyncpg://shadowlearn:shadowlearn@127.0.0.1:5433/shadowlearn`), `s3_endpoint` (default `http://127.0.0.1:9002`), `s3_access_key`, `s3_secret_key`, `s3_bucket` (default `shadowlearn`), `s3_region` (default `us-east-1`), and `temp_dir` (default `/tmp/shadowlearn`).
- [ ] Create `backend/app/db.py` with `Base(DeclarativeBase)`, `engine = create_async_engine(settings.database_url)`, `SessionLocal = async_sessionmaker(engine, expire_on_commit=False)`, and the `get_session` dependency.
- [ ] Create `backend/app/storage.py` with `create_s3_client(settings)` built on `aiobotocore.session.get_session().create_client("s3", ...)` and `ensure_bucket(s3, name)` that creates the bucket when `head_bucket` raises.
- [ ] In the `lifespan` of `backend/app/main.py`, open the S3 client in an `AsyncExitStack`, store it as `app.state.s3`, call `ensure_bucket`, and dispose `engine` on shutdown.
- [ ] Add `GET /api/health/deps` in `backend/app/main.py`. It runs `SELECT 1` and `head_bucket` and returns `{"db":"ok","s3":"ok"}` with 200, or 503 with the failing name.
- [ ] Configure Alembic for async in `backend/alembic/env.py`, reading `settings.database_url`. `0001_baseline.py` creates nothing. `backend/Dockerfile` copies `alembic.ini` and `alembic/` next to `app/`.
- [ ] In both compose files add `postgres` (`postgres:16-alpine`, volume `pgdata`, port `127.0.0.1:5433:5432`, healthcheck `pg_isready -U shadowlearn`) and `minio` (`minio/minio`, command `server /data`, volume `miniodata`, port `127.0.0.1:9002:9000`, healthcheck on `/minio/health/live`). The `backend` service depends on both with `condition: service_healthy` and its command becomes `sh -c "alembic upgrade head && uvicorn app.main:app --host 0.0.0.0 --port 8000"`. Host ports are `5433` and `9002` because this development machine already runs other projects on `5432` and `9000`.
- [ ] Add `db_session` and `s3` fixtures to `backend/tests/conftest.py`. `db_session` runs `alembic upgrade head` once per session against `SHADOWLEARN_TEST_DATABASE_URL` (default `postgresql+asyncpg://shadowlearn:shadowlearn@127.0.0.1:5433/shadowlearn_test`) and truncates every table after each test. `s3` creates bucket `shadowlearn-test-<pid>` for the session and removes it at the end.
- [ ] Create `.github/workflows/backend-tests.yml` with a `postgres:16-alpine` service mapped to host port `5433`, a step that runs `docker run -d -p 9002:9000 -e MINIO_ROOT_USER -e MINIO_ROOT_PASSWORD minio/minio server /data` and waits for `/minio/health/live` (GitHub service containers cannot set a command), then `uv sync --extra dev` and `uv run pytest`. Trigger on `pull_request` and `push` to `main`.
- [ ] Add the new env vars with comments to `backend/.env.example`, which Git tracks. Add the same vars, the two volumes, and the backup commands `docker compose exec postgres pg_dump -U shadowlearn shadowlearn | gzip > backup.sql.gz` and `mc mirror local/shadowlearn /backups/minio` to `docs/deployment_guideline.md`, which `.gitignore` line 50 keeps local-only, so that edit lives only on the operator's machine.

**You see.**

- [ ] `docker compose up -d` brings `postgres`, `minio`, and `backend` to `healthy`, and `docker compose logs backend` contains `Running upgrade  -> 0001_baseline`.
- [ ] `curl -s http://127.0.0.1:8001/api/health/deps` prints `{"db":"ok","s3":"ok"}`.
- [ ] `uv run pytest` passes the two new files and every existing file, and the PR's `Backend tests` check is green on GitHub.

**Verify, unit.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked.

- [ ] `backend/tests/test_db_fixture.py` creates a throwaway table through `db_session`, inserts one row, and reads it back. Run `cd backend && uv sync --extra dev && uv run pytest tests/test_db_fixture.py`.
- [ ] `backend/tests/test_health_deps.py` asserts 200 with both `ok`, and 503 with `"s3":"error"` when `app.state.s3.head_bucket` raises. Run `cd backend && uv run pytest tests/test_health_deps.py`.
- [ ] The full suite still passes. Run `cd backend && uv run pytest`.

**Verify, live.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked. Ten lanes on the configured `swarm workers` role at the PR head, per the boot recipe. All lanes are API lanes driven with `curl` through `run`.

- [ ] Lane 1. Regression lane against trunk. Run `GET /api/health` at trunk and at head, then `GET /api/health/deps` at head. Save `pr1-health-trunk-head.png`. Pass when both heads return 200 `{"status":"ok"}` and head deps returns `{"db":"ok","s3":"ok"}`.
- [ ] Lane 2. Skip. The operator trimmed this PR to three live lanes on 2026-09-23. Original scenario follows. Cold start. Run `docker compose down -v && docker compose up -d`, then `docker compose ps`. Save `pr1-compose-up.png`. Pass when all three services show `healthy` and the backend log shows `alembic upgrade head` ran before uvicorn started.
- [ ] Lane 3. Migration idempotency. Run `uv run alembic upgrade head` twice against `lane_<n>`. Save `pr1-alembic-twice.png`. Pass when the second run prints no `Running upgrade` line and `select version_num from alembic_version` returns `0001_baseline`.
- [ ] Lane 4. Skip. The operator trimmed this PR to three live lanes on 2026-09-23. Original scenario follows. Postgres down. Run `docker compose stop postgres`, then both health routes. Save `pr1-pg-down.png`. Pass when `/api/health` returns 200 and `/api/health/deps` returns 503 with `"db"` in the body.
- [ ] Lane 5. Skip. The operator trimmed this PR to three live lanes on 2026-09-23. Original scenario follows. MinIO down. Run `docker compose stop minio`, then both health routes. Save `pr1-minio-down.png`. Pass when `/api/health` returns 200 and `/api/health/deps` returns 503 with `"s3"` in the body.
- [ ] Lane 6. Skip. The operator trimmed this PR to three live lanes on 2026-09-23. Original scenario follows. Bucket bootstrap. Start the backend against a fresh MinIO volume and run `mc ls local/` and `mc anonymous get local/lane-<n>`. Save `pr1-bucket.png`. Pass when the bucket is listed and the anonymous policy prints `none`.
- [ ] Lane 7. China compose. Run `docker compose -f docker-compose.china.yml config` and `up -d`. Save `pr1-china-compose.png`. Pass when the rendered config contains `postgres` and `minio` and all services reach `healthy`.
- [ ] Lane 8. Skip. The operator trimmed this PR to three live lanes on 2026-09-23. Original scenario follows. Real Postgres fixture. Run `uv run pytest tests/test_db_fixture.py -v` with `SHADOWLEARN_TEST_DATABASE_URL` pointing at the compose Postgres, then `psql ... -c '\dt'` on `shadowlearn_test`. Save `pr1-pytest-pg.png`. Pass when the test passes and the schema holds only `alembic_version` after teardown.
- [ ] Lane 9. Skip. The operator trimmed this PR to three live lanes on 2026-09-23. Original scenario follows. CI. Run `gh run view --repo "$base_repo"` for the `Backend tests` run at the head SHA and open its log. Save `pr1-ci-green.png`. Pass when the conclusion is `success` and the log shows the MinIO wait loop succeeded.
- [ ] Lane 10. Skip. The operator trimmed this PR to three live lanes on 2026-09-23. Original scenario follows. Existing pipeline untouched. Run `POST /api/lessons/generate` with `source=blog` and a short `blog_text` using the env keys, then poll `/api/jobs/{id}`. Save `pr1-lesson-pipeline.png`. Pass when the job reaches `complete` with segments in the result.

**Verify, perf.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked.

- [ ] Metric. The p50 of 200 sequential `GET /api/health` requests at trunk and at head, and the p50 of 200 `GET /api/health/deps` requests at head.
- [ ] Probe. `for i in $(seq 200); do curl -s -o /dev/null -w '%{time_total}\n' "$API/api/health"; done | sort -n | sed -n '100p'`, run alternately at trunk and at head for three rounds each.
- [ ] Baseline. Record the trunk `/api/health` p50 first.
- [ ] Rule. Head `/api/health` p50 fails when it exceeds trunk by more than 20 percent. Head `/api/health/deps` p50 fails when it exceeds 50 ms.

**Review gate.** None. PR1 is not review-gated.

**Merge.**

- [ ] Root's clean verdict at the exact head SHA.
- [ ] Bugbot triage done.
- [ ] After the verdict, the root uses Shipping step 4 to move the PR from its recorded patch base onto current trunk. Record the current landing SHA. Preserve the verdict only when the patch ID stays unchanged.
- [ ] The root appends PR1 as the bottom of the frozen stack. The operator lands it first. Same-repository child PRs target parent branches. Fork child PRs target trunk while retaining local parent ancestry.

## Add accounts with JWT access and refresh tokens (PR2)

**Depends on.** PR1.

**Files.**

- [ ] Edit `backend/pyproject.toml` and `backend/uv.lock`.
- [ ] Create `backend/app/accounts/__init__.py`, `models.py`, `schemas.py`, `manager.py`, `auth.py`, `deps.py`, `email.py`, and `router.py`.
- [ ] Create `backend/alembic/versions/0002_users.py`.
- [ ] Edit `backend/app/settings.py`, `backend/app/main.py`, `backend/app/job_store.py`, `backend/app/background/router.py`, `backend/app/lessons/router.py`, `backend/app/tips/services/transcript.py`, and `backend/app/tips/services/studio.py`.
- [ ] Edit `backend/tests/conftest.py` and `backend/tests/test_jobs_router.py`. Create `backend/tests/test_accounts_router.py` and `backend/tests/test_auth_required.py`.
- [ ] Create `frontend/src/shared/lib/api.ts`, `frontend/src/app/onboarding/Login.tsx`, `Signup.tsx`, `ForgotPassword.tsx`, and `ResetPassword.tsx`.
- [ ] Edit `frontend/src/app/providers/AuthContext.tsx`, `frontend/src/app/App.tsx`, `frontend/src/features/agent/application/useZoberChat.ts`, and every file listed by `grep -rl 'API_BASE' frontend/src --include=*.ts --include=*.tsx`.
- [ ] Edit `frontend/tests/AuthContext-trial.test.ts`. Create `frontend/tests/api-client.test.ts`.
- [ ] Edit `backend/.env.example` and the local-only `docs/deployment_guideline.md`.

**Build.**

- [ ] Add `fastapi-users[sqlalchemy]>=14` to `backend/pyproject.toml`. Appendix A shows it resolves to 15.0.5 with the existing `openai==2.6.0` and `livekit-api`.
- [ ] Define `User(SQLAlchemyBaseUserTableUUID, Base)` in `accounts/models.py` with `created_at` and `token_version int default 0`. `0002_users.py` creates the `user` table.
- [ ] Define `VersionedJWTStrategy(JWTStrategy)` in `accounts/auth.py`. `write_token` adds a `ver` claim from `user.token_version`. `read_token` rejects a token whose `ver` differs. The access strategy uses `settings.jwt_secret`, lifetime `settings.access_token_minutes` (default 15), audience `shadowlearn:access`. The refresh strategy uses `settings.jwt_refresh_secret`, lifetime `settings.refresh_token_days` (default 30), audience `shadowlearn:refresh`. Appendix A proved the pair pattern.
- [ ] Add to `Settings` the fields `jwt_secret`, `jwt_refresh_secret`, `access_token_minutes`, `refresh_token_days`, `smtp_host`, `smtp_port`, `smtp_user`, `smtp_password`, `smtp_from`, `smtp_security`, `public_app_url`, and `frontend_origin_regex`. `smtp_security` is one of `none`, `starttls`, or `ssl`, and `ssl` sends through `smtplib.SMTP_SSL`, because the operator's relay listens on implicit TLS port 465. A validator fails startup when either JWT secret is shorter than 32 characters, because PyJWT warns below 32 bytes.
- [ ] Mount in `accounts/router.py` under `/api/auth` the fastapi-users register router, `POST /api/auth/login` (form body, returns `{"access_token","refresh_token","token_type"}`), `POST /api/auth/refresh` (JSON `{"refresh_token"}`, returns a new pair), the reset-password router (`forgot-password`, `reset-password`), and `GET /api/users/me`. Do not mount the verification router. `reset-password` increments `token_version`.
- [ ] Implement `send_reset_email(to, token)` in `accounts/email.py` with `smtplib` inside `asyncio.to_thread`. The link is `{public_app_url}/reset-password?token=...`. When `smtp_host` is empty, log the link at INFO instead.
- [ ] Export `current_active_user = fastapi_users.current_user(active=True)` from `accounts/deps.py`.
- [ ] Replace the CORS block in `backend/app/main.py` with `allow_origins=settings.frontend_origin_allowlist`, `allow_origin_regex=settings.frontend_origin_regex or None`, `allow_credentials=False`, `allow_methods=["*"]`, and `allow_headers=["Authorization", "Content-Type"]`. The dev default allowlist is `["http://localhost:5173", "http://127.0.0.1:5173"]`.
- [ ] Add `dependencies=[Depends(current_active_user)]` to every `APIRouter` in `backend/app/main.py` except `/api/health`, `/api/health/deps`, `/api/config`, and the accounts router.
- [ ] Give `Job` in `backend/app/job_store.py` a `user_id: str | None` field. `register_job`, `kick_off_job`, and `kick_off_keyed_job` take `user_id`. Lesson jobs in `backend/app/lessons/router.py` pass the caller. Tips keyed jobs pass `None` because their result is global.
- [ ] Make `GET` and `DELETE /api/jobs/{job_id}` in `backend/app/background/router.py` require `current_active_user` and return 404 when `job.user_id` is set and differs from the caller.
- [ ] Add `user` and `auth_headers` fixtures to `backend/tests/conftest.py` that register a user through the app and return a bearer header.
- [ ] Create `apiFetch(path, init)` in `frontend/src/shared/lib/api.ts`. It prefixes `API_BASE`, adds `Authorization: Bearer <access>`, and on 401 runs one single-flight `POST /api/auth/refresh` then retries once. The access token lives in module memory. The refresh token lives in `localStorage` under `shadowlearn.refresh`. On refresh failure it calls the registered `onSessionLost`.
- [ ] Add to `AuthContext` the state `session: {userId, email} | null` and the actions `login`, `signup`, `logout`, `requestPasswordReset`, and `resetPassword`. Keep `db`, `keys`, `unlock`, `setup`, `isUnlocked`, `isFirstSetup`, and `trialMode` unchanged in this PR.
- [ ] Order the gate in `frontend/src/app/App.tsx`. No session shows `Login` with links to `Signup` and `ForgotPassword`. A session with `isFirstSetup` shows the existing `Setup`. A session that is locked shows the existing `Unlock`. Add the route `/reset-password`.
- [ ] Replace every `fetch(\`${API_BASE}...\`)` in the frontend with `apiFetch`, including the job pollers in `useJobPoller.ts`, `useTipStudio.ts`, `useTipCards.ts`, and `useTipTranscript.ts`. Pass `fetch: apiFetch` to `DefaultChatTransport` in `useZoberChat.ts` so the chat stream carries the bearer and survives a refresh.
- [ ] Document `SHADOWLEARN_JWT_SECRET`, `SHADOWLEARN_JWT_REFRESH_SECRET`, the SMTP settings, `SHADOWLEARN_PUBLIC_APP_URL`, and the origin allowlist in `backend/.env.example`, which Git tracks, and in the local-only `docs/deployment_guideline.md`, with `openssl rand -hex 32` as the secret generator.

**You see.**

- [ ] `curl -i $API/api/jobs/anything` prints `HTTP/1.1 401` and `{"detail":"Unauthorized"}`.
- [ ] The browser shows the Login screen first. After Signup, the existing key setup appears, then PIN unlock, then the Library as before.
- [ ] With SMTP unset, `POST /api/auth/forgot-password` writes `reset link http://localhost:5173/reset-password?token=` to the backend log.
- [ ] A request with `Origin: http://localhost:5999` gets no `Access-Control-Allow-Origin` header. A request with `Origin: http://localhost:5173` gets one.

**Verify, unit.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked.

- [ ] `backend/tests/test_accounts_router.py` covers register, login pair, `me` with the access token, 401 for `me` with the refresh token, refresh, 401 for refresh with an access token, and reset-password invalidating the old refresh token through `token_version`. Run `cd backend && uv run pytest tests/test_accounts_router.py`.
- [ ] `backend/tests/test_auth_required.py` walks `app.routes` and asserts 401 without a token for every route outside the allowlist of health, config, and auth. Run `cd backend && uv run pytest tests/test_auth_required.py`.
- [ ] `backend/tests/test_jobs_router.py` gains the case where user B reads user A's job and gets 404. Run `cd backend && uv run pytest tests/test_jobs_router.py`.
- [ ] `frontend/tests/api-client.test.ts` covers a 401 that triggers one refresh and a retry, and two concurrent 401s that share one refresh call. Run `cd frontend && pnpm test tests/api-client.test.ts`.

**Verify, live.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked. Ten lanes on the configured `swarm workers` role at the PR head, per the boot recipe. Browser lanes use `verify`. Lanes 8 and 9 use `run` with `curl`.

- [ ] Lane 1. Regression lane against trunk. Create a blog lesson from pasted text and open it, at trunk with no login and at head after signup, key setup, and PIN unlock. Save `pr2-lesson-trunk-head.png`. Pass when both reach the lesson view with segments and the head network log shows `Authorization` on every `/api/jobs/` request.
- [ ] Lane 2. Skip. The operator trimmed this PR to three live lanes on 2026-09-23. Original scenario follows. Signup, logout, login. Sign up, log out from the header menu, log in again. Save `pr2-signup-login.png`. Pass when the Library renders after the second login and `GET /api/users/me` returned the same `id` both times.
- [ ] Lane 3. Skip. The operator trimmed this PR to three live lanes on 2026-09-23. Original scenario follows. Wrong password. Attempt login with a wrong password. Save `pr2-bad-password.png`. Pass when the form shows the error and `localStorage.getItem('shadowlearn.refresh')` is `null`.
- [ ] Lane 4. Skip. The operator trimmed this PR to three live lanes on 2026-09-23. Original scenario follows. Access expiry. Start the backend with `SHADOWLEARN_ACCESS_TOKEN_MINUTES=1`, log in, wait 70 seconds, open the Library. Save `pr2-refresh.png`. Pass when the network log shows one `POST /api/auth/refresh` with 200 and no Login screen appears.
- [ ] Lane 5. Skip. The operator trimmed this PR to three live lanes on 2026-09-23. Original scenario follows. Revocation. Log in on tab A, reset the password from tab B, then act in tab A. Save `pr2-revoked.png`. Pass when tab A's next request gets 401, the refresh fails, and tab A returns to Login.
- [ ] Lane 6. Skip. The operator trimmed this PR to three live lanes on 2026-09-23. Original scenario follows. Reset without SMTP. Request a reset, copy the link from the backend log, set a new password, log in with it. Save `pr2-reset.png`. Pass when the new password logs in and the old one is rejected.
- [ ] Lane 7. Reset with SMTP. Run `docker run -d -p 1025:1025 -p 8025:8025 axllent/mailpit`, start the backend with `SHADOWLEARN_SMTP_HOST=127.0.0.1` `SHADOWLEARN_SMTP_PORT=1025`, and `SHADOWLEARN_SMTP_SECURITY=none`, request a reset, open `http://127.0.0.1:8025`. Save `pr2-mailpit.png`. Pass when the mail arrives and its link completes a reset.
- [ ] Lane 8. Skip. The operator trimmed this PR to three live lanes on 2026-09-23. Original scenario follows. CORS. Run `curl -I -H 'Origin: https://evil.example' $API/api/config` and again with the allowlisted origin. Save `pr2-cors.png`. Pass when the first response has no `Access-Control-Allow-Origin` header and the second echoes the origin.
- [ ] Lane 9. Job ownership. Register users A and B, start a lesson job as A, `GET /api/jobs/{id}` as B and as A. Save `pr2-job-owner.png`. Pass when B gets 404 and A gets 200.
- [ ] Lane 10. Skip. The operator trimmed this PR to three live lanes on 2026-09-23. Original scenario follows. Streams and pollers. Send an agent chat message and open a tips course that triggers a studio job, after an access token expiry. Save `pr2-chat-bearer.png`. Pass when the chat streams a reply and every `/api/jobs/tip-` poll returns 200.

**Verify, perf.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked.

- [ ] Metric. The p50 of 200 `GET /api/jobs/{id}` requests for an existing job at trunk without auth and at head with a bearer, and the p50 of 20 `POST /api/auth/login` requests at head.
- [ ] Probe. The curl loop from PR1 with `-H "Authorization: Bearer $TOKEN"` at head, interleaved with trunk for three rounds, then 20 login calls with `-d 'username=...&password=...'`.
- [ ] Baseline. Record the trunk jobs p50 first.
- [ ] Rule. Head jobs p50 fails when it exceeds trunk by more than 20 percent or by more than 10 ms. Login p50 fails when it exceeds 500 ms, because argon2 hashing dominates.

**Review gate.** The operator reviews before merge.

- [ ] Copy lane 2 and lane 4 screenshots into `docs/plans/media/server-backend-migration/pr2-review-login.png` and `docs/plans/media/server-backend-migration/pr2-review-refresh.png`.
- [ ] Record a 30 to 60 second video of signup, logout, login, and the transparent refresh on a live lane. Save it as `docs/plans/media/server-backend-migration/pr2-review.mp4`.
- [ ] Post the screenshots and the video in chat. Stop at merge-ready. Wait for the operator's click.

**Merge.**

- [ ] Root's clean verdict at the exact head SHA.
- [ ] Bugbot triage done.
- [ ] After the verdict, the root uses Shipping step 4 to move the PR onto PR1's exact tip. Record the current landing SHA. Preserve the verdict only when the patch ID stays unchanged.
- [ ] The root appends PR2 above PR1 in the frozen stack. The operator lands it after PR1. Same-repository child PRs target parent branches. Fork child PRs target trunk while retaining local parent ancestry.

## Move provider keys server-side (PR3)

**Depends on.** PR2.

**Files.**

- [ ] Create `backend/app/keys/__init__.py`, `models.py`, `crypto.py`, `service.py`, `usage.py`, and `router.py`.
- [ ] Create `backend/app/internal/__init__.py` and `backend/app/internal/router.py`.
- [ ] Create `backend/alembic/versions/0003_provider_keys_usage_speak_live.py`.
- [ ] Delete `backend/app/shared/utils.py`, `backend/app/lessons/services/_utils.py`, and `backend/tests/test_resolve_key.py`.
- [ ] Edit `backend/app/models.py`, `backend/app/settings.py`, `backend/app/main.py`, `backend/app/config/router.py`, and every file listed by `grep -rlE 'openrouter_api_key|azure_speech_key|azure_key|google_key' backend/app`, which is 20 files today including `lessons/router.py`, `tts/router.py`, `translation/router.py`, `vocab/router.py`, `quiz/router.py`, `agent/router.py`, `pronunciation/router.py`, `daily_review/router.py`, `speak/router.py`, `speak/generation.py`, and `speak/offshore_client.py`.
- [ ] Edit `backend/livekit_agent/agent.py`, `backend/livekit_agent/.env.example`, `docker-compose.yml`, `docker-compose.china.yml`, and `docker-compose.offshore.yml`.
- [ ] Create `backend/tests/test_keys_router.py`, `test_key_resolver.py`, `test_rate_limit.py`, and `backend/livekit_agent/tests/test_key_fetch.py`. Edit `backend/tests/test_pronunciation_router.py`, `test_speak_router.py`, `test_lessons_router.py`, `test_tts_router.py`, `test_quiz_router.py`, `test_agent_router.py`, `test_daily_review_router.py`, `test_vocab_router.py`, and `test_translation.py`.
- [ ] Edit `frontend/src/features/settings/ui/Settings.tsx`. Create `frontend/src/features/settings/api/keys.ts` and `frontend/tests/Settings.keys.test.tsx`.
- [ ] Edit `frontend/src/app/providers/AuthContext.tsx` and `frontend/src/app/App.tsx`. Delete `frontend/src/app/onboarding/Setup.tsx` and `frontend/src/app/onboarding/Unlock.tsx` and their tests `frontend/tests/Setup.test.tsx`.
- [ ] Edit the 16 frontend files that send key fields, listed by `grep -rlE 'openrouter_api_key|azure_speech_key|azure_key|google_key|azure_region' frontend/src | grep -v test`, and their three tests `CreateLesson.stt.test.tsx`, `usePronunciationAssessment.test.ts`, and `useTTS.test.ts`.

**Build.**

- [ ] Define `ProviderKey` in `keys/models.py` with primary key `(user_id, provider)`, `provider` as an enum of `openrouter`, `azure_speech`, and `google`, `ciphertext bytes`, `region text null`, and `updated_at`. `0003` creates it, `provider_usage`, and `speak_live_sessions`.
- [ ] Build `fernet = Fernet(settings.encryption_key)` in `keys/crypto.py`. Startup fails with a clear message when `encryption_key` is unset. `encrypt(value)` and `decrypt(ciphertext)` wrap it.
- [ ] Implement `resolve_provider_key(session, user, provider) -> ResolvedKey(value, region, source)` in `keys/service.py`. `source` is `user` or `env`. The env fallback reads `settings.openrouter_api_key`, `settings.azure_speech_key` with `settings.azure_speech_region`, and the new `settings.google_api_key`. When neither exists it raises 400 `No <provider> key configured. Add one in Settings.` Every call records one `provider_usage` row.
- [ ] Implement `RateLimiter` in `keys/usage.py` as an in-memory sliding window per user with `settings.rate_limit_per_minute` (default 60). Apply it as a router dependency on lessons, tts, translation, quiz, agent, vocab, daily_review, pronunciation, and speak. Over the limit returns 429 with `Retry-After`. The single uvicorn worker makes in-memory correct today.
- [ ] Mount `/api/keys` in `keys/router.py`. `GET` returns each provider's state with the last four characters and `source`. `PUT /api/keys/{provider}` takes `{"value", "region"}`. `DELETE /api/keys/{provider}` removes the row.
- [ ] Remove `openrouter_api_key`, `azure_speech_key`, `azure_speech_region`, `azure_key`, `azure_region`, and `google_key` from every request model and form in the backend. Set `model_config = ConfigDict(extra="forbid")` on those models so a leaked key in a body fails with 422. Each router calls `resolve_provider_key` instead of `_resolve_key`.
- [ ] Delete the `print` at `backend/app/pronunciation/router.py:134` that logs the key suffix.
- [ ] Add `speak_live_sessions(session_id text primary key, user_id, created_at)`. `session_start` inserts a row and stops writing `google_key` into the LiveKit metadata. `session_end` deletes the row.
- [ ] Mount `GET /api/internal/speak-sessions/{session_id}/google-key` in `internal/router.py`, guarded by `require_internal_token`, which mirrors `backend/livekit_agent/http_server.py:31` and checks `settings.offshore_internal_token`. It resolves the session's user and returns `{"google_key", "source"}`. This router does not use `current_active_user`.
- [ ] Replace the `google_key` read at `backend/livekit_agent/agent.py:103` with an `httpx` call to `{SHADOWLEARN_BACKEND_URL}/api/internal/speak-sessions/{session_id}/google-key` with header `Authorization: Bearer {INTERNAL_TOKEN}`. Add `SHADOWLEARN_BACKEND_URL` to `livekit_agent/.env.example` and to the agent's environment in all three compose files.
- [ ] Change `GET /api/config` to return `shared_keys: {"openrouter": bool, "azure_speech": bool, "google": bool}` in place of `free_trial_available`, computed from the env settings.
- [ ] Add a "Provider keys" card to `Settings.tsx` with one row per provider, an input, a Save button that calls `PUT /api/keys/{provider}` through `frontend/src/features/settings/api/keys.ts`, a Remove button, and a status of "Using your key ...ab12", "Using shared key", or "Not configured".
- [ ] Remove `keys`, `unlock`, `setup`, `resetKeys`, `isUnlocked`, and `isFirstSetup` from `AuthContext`. Keep `db`, `session`, and `trialMode`. Remove the `Setup` and `Unlock` steps from the gate in `App.tsx`, so a session goes straight to the Library. Keep `frontend/src/shared/lib/crypto` because the PR7 modal decrypts stored keys with it.
- [ ] Remove the key fields from every frontend request body and form, and remove each `if (!keys)` guard that only existed to send them.

**You see.**

- [ ] The Settings page shows the Provider keys card. After saving an OpenRouter key the row reads "Using your key ...ab12" and `psql -c 'select provider, length(ciphertext) from provider_keys'` shows a row whose ciphertext does not contain the key.
- [ ] `curl -X POST $API/api/tts -H "$AUTH" -d '{"text":"你好","azure_speech_key":"x"}'` returns 422.
- [ ] The backend log during a pronunciation assessment contains no `key=` line.
- [ ] The LiveKit agent log prints `[SESSION] google key fetched from backend source=user`.
- [ ] `psql -c 'select provider, source, count(*) from provider_usage group by 1,2'` shows rows after a lesson is created.

**Verify, unit.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked.

- [ ] `backend/tests/test_keys_router.py` covers PUT, masked GET, DELETE, and asserts the stored ciphertext differs from the plaintext. Run `cd backend && uv run pytest tests/test_keys_router.py`.
- [ ] `backend/tests/test_key_resolver.py` covers user key wins over env, env fallback with `source=env`, 400 when neither, and one usage row per call. Run `cd backend && uv run pytest tests/test_key_resolver.py`.
- [ ] `backend/tests/test_rate_limit.py` asserts the 61st request in a minute returns 429 with `Retry-After`. Run `cd backend && uv run pytest tests/test_rate_limit.py`.
- [ ] `backend/tests/test_pronunciation_router.py` asserts `capsys` output contains no `key=`. `backend/livekit_agent/tests/test_key_fetch.py` mocks the internal route with `respx` and asserts the agent uses the returned key. Run `cd backend && uv run pytest` and `cd backend/livekit_agent && uv run pytest`.
- [ ] `frontend/tests/Settings.keys.test.tsx` covers save, masked display, and remove against a fake `apiFetch`. Run `cd frontend && pnpm test tests/Settings.keys.test.tsx`.

**Verify, live.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked. Ten lanes on the configured `swarm workers` role at the PR head, per the boot recipe. Browser lanes use `verify`. Lanes 8, 9, and 10 use `run` with `curl`.

- [ ] Lane 1. Regression lane against trunk. Create a blog lesson at trunk with the OpenRouter key in the request body, and at head with the key saved in Settings. Save `pr3-lesson-trunk-head.png`. Pass when both lessons complete and the head request body for `/api/lessons/generate` contains no key field.
- [ ] Lane 2. Save and mask. Save an OpenRouter key and an Azure key with region in Settings, reload. Save `pr3-settings-keys.png`. Pass when both rows show "Using your key" with the right last four characters after reload.
- [ ] Lane 3. Remove and fall back. Remove the OpenRouter key while the backend has `SHADOWLEARN_OPENROUTER_API_KEY` set, then generate a quiz. Save `pr3-fallback.png`. Pass when the row reads "Using shared key" and the quiz generates.
- [ ] Lane 4. No key anywhere. Start the backend without `SHADOWLEARN_OPENROUTER_API_KEY`, remove the user key, generate a quiz. Save `pr3-no-key.png`. Pass when the UI shows the 400 message naming Settings and no request reaches OpenRouter.
- [ ] Lane 5. Rate limit. Start the backend with `SHADOWLEARN_RATE_LIMIT_PER_MINUTE=5`, play TTS six times. Save `pr3-rate-limit.png`. Pass when the sixth call returns 429 and the UI shows a retry message rather than a blank.
- [ ] Lane 6. Pronunciation. Record a pronunciation attempt in a study session. Save `pr3-pronunciation.png`. Pass when the score renders and `docker compose logs backend` has no line containing `key=`.
- [ ] Lane 7. Speak session. Start the LiveKit agent from compose with `SHADOWLEARN_BACKEND_URL` set and run a speak session. Save `pr3-speak.png`. Pass when the agent answers and its log shows the key fetched from the backend with `source=user`.
- [ ] Lane 8. Internal route locked. Run `curl -i $API/api/internal/speak-sessions/x/google-key` without a token, with a user bearer, and with the internal token. Save `pr3-internal-auth.png`. Pass when the first two return 401 and the third returns 404 for the unknown session.
- [ ] Lane 9. Leaked key rejected. Run `POST /api/lessons/generate` with `openrouter_api_key` in the body. Save `pr3-leaked-key-422.png`. Pass when the response is 422 naming the extra field.
- [ ] Lane 10. Usage log. After lanes 1 to 5, run `psql -c 'select provider, source, endpoint, count(*) from provider_usage group by 1,2,3'`. Save `pr3-usage.png`. Pass when rows exist for both `user` and `env` sources.

**Verify, perf.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked.

- [ ] Metric. The p50 of 20 `POST /api/tts` requests for the text `你好` at trunk with the key in the body and at head with the server key, and the head-only resolver time from the INFO line `resolve_provider_key provider=<p> source=<s> took <ms>`.
- [ ] Probe. `curl -s -o /dev/null -w '%{time_total}\n'` on `/api/tts`, alternating trunk and head for three rounds of 20, then `grep 'resolve_provider_key' backend.log | awk '{print $NF}' | sort -n | sed -n '30p'` for the resolver p50 over the head runs.
- [ ] Baseline. Record the trunk TTS p50 first.
- [ ] Rule. Head TTS p50 fails when it exceeds trunk by more than 20 percent. Resolver p50 fails when it exceeds 10 ms.

**Review gate.** The operator reviews before merge.

- [ ] Copy lane 2 and lane 3 screenshots into `docs/plans/media/server-backend-migration/pr3-review-keys.png` and `docs/plans/media/server-backend-migration/pr3-review-fallback.png`.
- [ ] Record a 30 to 60 second video of saving a key, generating a quiz, removing the key, and the shared-key state on a live lane. Save it as `docs/plans/media/server-backend-migration/pr3-review.mp4`.
- [ ] Post the screenshots and the video in chat. Stop at merge-ready. Wait for the operator's click.

**Merge.**

- [ ] Root's clean verdict at the exact head SHA.
- [ ] Bugbot triage done.
- [ ] After the verdict, the root uses Shipping step 4 to move the PR onto PR2's exact tip. Record the current landing SHA. Preserve the verdict only when the patch ID stays unchanged.
- [ ] The root appends PR3 above PR2 in the frozen stack. The operator lands it after PR2. Same-repository child PRs target parent branches. Fork child PRs target trunk while retaining local parent ancestry.

## Serve client-written stores from Postgres (PR4)

**Depends on.** PR2 for auth. PR4 builds in parallel with PR3 from PR2's tip and is frozen above PR3.

**Files.**

- [ ] Create `backend/app/userdata/__init__.py`, `specs.py`, `models.py`, `schemas.py`, `merge.py`, and `router.py`.
- [ ] Create `backend/alembic/versions/0004_userdata_stores.py`.
- [ ] Edit `backend/app/speak/situations.py`, `backend/app/speak/router.py`, and `backend/app/main.py`.
- [ ] Create `backend/tests/test_userdata_specs.py`, `test_userdata_router.py`, and `test_userdata_merge.py`. Edit `backend/tests/test_speak_situations.py` and `test_speak_router.py`.

**Build.**

- [ ] Define `StoreSpec(name, table, indexed: list[IndexedField], merge: MergeRule, schema: type[BaseModel])` and `IndexedField(column, json_path, type, unique)` in `userdata/specs.py`. `STORES` holds 19 specs named after the IndexedDB stores in `frontend/src/db/index.ts`. They are `settings`, `vocabulary`, `learner-profile`, `progress-db`, `mastery-db`, `spaced-repetition`, `session-logs`, `mistakes-db`, `agent-memory`, `exercise-stats`, `daily-tasks`, `speak-sessions`, `shadowing-bests`, `tip-progress`, `tip-notes`, `user-materials`, `threads`, `thread-summaries`, and the new `speak-custom-situations`.
- [ ] Implement `build_table(spec)` in `userdata/models.py`. Every table is `userdata_<store>` with `user_id uuid` referencing `user.id` on delete cascade, `id text`, `data jsonb`, `updated_at timestamptz`, and primary key `(user_id, id)`. Indexed columns are filled from `data` on every write and mirror today's IndexedDB indexes. They are `vocabulary.source_lesson_id` and `vocabulary.created_at`, `spaced_repetition.due_date`, `agent_memory.importance` plus a GIN index on `data->'tags'`, `speak_sessions.started_at`, `shadowing_bests.lesson_id` and `segment_id`, `tip_progress.course_id` and `video_id`, `tip_notes.video_id`, `user_materials.external_id` unique per user and `user_materials.skill`, `threads.surface`, `threads.owner_id`, and `threads.updated_at`, and `exercise_stats.vocab_id` and `exercise_type`. `0004` creates all 19 tables from the specs.
- [ ] Map keys. Composite IndexedDB keys join with `:`, so `shadowing-bests` uses `<lessonId>:<segmentId>` and `tip-notes` uses `<videoId>:<id>`. `exercise-stats` already uses `<vocabId>:<exerciseType>`. Singletons keep the fixed ids the helpers use today, `settings` for `settings`, `global` for `progress-db` and `mastery-db`, and `profile` for `learner-profile`.
- [ ] Write one Pydantic model per store in `userdata/schemas.py`, mirroring the interfaces in `frontend/src/db/index.ts`, `frontend/src/shared/types.ts`, `frontend/src/features/learning-materials/domain/collection.ts`, and `frontend/src/features/learning-materials/domain/tips.ts`, with `extra="allow"` so an old optional field never blocks a write. The router validates `data` with the store's model on every write.
- [ ] Implement `MergeRule` in `userdata/merge.py` for `mode=import`. `union` inserts missing ids and leaves existing ids untouched. `keep_server` applies to `settings`. `learner-profile` takes `max` of `currentStreakDays`, `sum` of `totalSessions` and `totalStudyMinutes`, `max` of `lastStudyDate`, `min` of `profileCreated`, and keeps the server's name, languages, and level. `progress-db` sums `totalSessions`, `totalExercises`, `totalCorrect`, `totalIncorrect`, and `totalStudyMinutes`, recomputes `accuracyRate`, unions `accuracyTrend` by `date` keeping the entry with more `exercises`, and per skill sums `sessions`, weights `accuracy` by `sessions`, and takes `max` of `lastPracticed`. `mastery-db` per skill takes `max` of `masteryLevel` and `confidenceScore`, `sum` of `totalPracticeTime`, and `max` of `lastPracticed`. `exercise-stats` sums `correct` and `total` and takes `max` of `lastAttempt`. `mistakes-db` sums `frequency`, takes `max` of `lastOccurred`, and concatenates `examples` capped at 20. `shadowing-bests` keeps the higher `score`. `user-materials` on an `externalId` clash keeps the server row. `tip-progress` keeps the row with the later `lastSeenAt`. Every other store is `union`. Outside import mode every write is `replace`.
- [ ] Mount `/api/store/{store}` in `userdata/router.py` with `GET` list (optional `index`, `value`, and `op` of `eq` or `lte` for the by-due range), `GET /{id}`, `PUT /{id}`, `DELETE /{id}`, `DELETE` by index for `deleteSpeakingBestsByLesson` and friends, and `POST /bulk` with body `{"mode": "import" | "replace", "records": [...]}`. Import mode applies the merge rule and returns `{"count", "after"}` where `after` holds the stored records for every store whose rule is not `union`. An unknown store returns 404. Every route is scoped to `current_active_user`.
- [ ] Replace `_custom_cache` in `backend/app/speak/situations.py` with reads and writes to `userdata_speak_custom_situations`, scoped to the caller. Drop the one hour TTL. `get_custom_situation(session, user, situation_id)` raises `KeyError` when the row is missing.

**You see.**

- [ ] `curl -X PUT $API/api/store/vocabulary/abc -H "$AUTH" -d '{"id":"abc","word":"你好","sourceLessonId":"L1","createdAt":"2026-09-23T00:00:00Z"}'` returns 200 and `GET /api/store/vocabulary?index=by-lesson&value=L1` lists it.
- [ ] `psql -c '\d userdata_vocabulary'` shows `source_lesson_id` and its index.
- [ ] `GET /api/store/nope` returns 404 `{"detail":"unknown store"}` and a `PUT` with `data` of the wrong shape returns 422.
- [ ] A custom speak situation generated before `docker compose restart backend` still starts a session after it.

**Verify, unit.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked.

- [ ] `backend/tests/test_userdata_specs.py` asserts 19 specs, table names matching `^userdata_[a-z_]+$`, one schema each, and that every indexed `json_path` exists in the schema. Run `cd backend && uv run pytest tests/test_userdata_specs.py`.
- [ ] `backend/tests/test_userdata_router.py` parametrizes CRUD over every store, covers index queries including `by-due` with `op=lte`, delete by index, 404 for an unknown store, 422 for bad data, and isolation where user B cannot read user A's rows. Run `cd backend && uv run pytest tests/test_userdata_router.py`.
- [ ] `backend/tests/test_userdata_merge.py` covers each named rule with fixtures and asserts that importing the same batch twice leaves counts and counters unchanged. Run `cd backend && uv run pytest tests/test_userdata_merge.py`.
- [ ] `backend/tests/test_speak_situations.py` asserts custom situations persist across a fresh session and are invisible to another user. Run `cd backend && uv run pytest tests/test_speak_situations.py tests/test_speak_router.py`.

**Verify, live.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked. Ten lanes on the configured `swarm workers` role at the PR head, per the boot recipe. All lanes are API lanes driven with `curl` through `run`.

- [ ] Lane 1. Regression lane against trunk. Trunk has no `/api/store` route, so record that `GET /api/store/vocabulary` returns 404 at trunk. At head, PUT one vocabulary record, GET it, DELETE it, GET again. Save `pr4-crud-roundtrip.png`. Pass when trunk returns 404 and head returns 200, 200 with the record, 204, and 404 in order.
- [ ] Lane 2. Skip. The operator trimmed this PR to three live lanes on 2026-09-23. Original scenario follows. Due items. PUT three `spaced-repetition` records with `dueDate` yesterday, today, and tomorrow, then `GET ?index=by-due&op=lte&value=<today>`. Save `pr4-due-items.png`. Pass when exactly two records return.
- [ ] Lane 3. Skip. The operator trimmed this PR to three live lanes on 2026-09-23. Original scenario follows. Threads. PUT a lesson thread and a global thread, `GET ?index=by-surface&value=global`, PUT a summary, GET it. Save `pr4-threads.png`. Pass when the surface filter returns one thread and the summary reads back.
- [ ] Lane 4. Skip. The operator trimmed this PR to three live lanes on 2026-09-23. Original scenario follows. Composite keys. PUT `shadowing-bests` for `L1:s1` and `L1:s2`, then `DELETE ?index=by-lesson&value=L1`, then GET list. Save `pr4-composite-delete.png`. Pass when the list is empty after the delete.
- [ ] Lane 5. Skip. The operator trimmed this PR to three live lanes on 2026-09-23. Original scenario follows. Unique external id. Import two `user-materials` with the same `externalId` under different ids. Save `pr4-external-unique.png`. Pass when the second import keeps the server row and the list holds one record.
- [ ] Lane 6. Singleton merge. Import `learner-profile` with `totalSessions=3`, then import another with `totalSessions=4` and a longer streak. Save `pr4-singleton-merge.png`. Pass when GET shows `totalSessions=7` and the larger `currentStreakDays`.
- [ ] Lane 7. Isolation. Register users A and B, PUT as A, GET as B. Save `pr4-isolation.png`. Pass when B receives an empty list and 404 for A's id.
- [ ] Lane 8. Skip. The operator trimmed this PR to three live lanes on 2026-09-23. Original scenario follows. Bulk idempotency. `POST /bulk` with 1,000 vocabulary records in import mode, twice. Save `pr4-bulk-idempotent.png`. Pass when both responses report `count=1000` and `select count(*)` is 1,000.
- [ ] Lane 9. Skip. The operator trimmed this PR to three live lanes on 2026-09-23. Original scenario follows. Custom situation survives restart. `POST /api/speak/situations/generate`, `docker compose restart backend`, then `POST /api/speak/session-start` with that id. Save `pr4-situation-restart.png`. Pass when session-start returns 200 with the same title.
- [ ] Lane 10. Skip. The operator trimmed this PR to three live lanes on 2026-09-23. Original scenario follows. Validation. `GET /api/store/nope` and `PUT /api/store/vocabulary/x` with `{"id": 5}`. Save `pr4-validation.png`. Pass when the responses are 404 and 422.

**Verify, perf.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked.

- [ ] Metric. Trunk has no store API, so the metric is the diff-added work. The p50 of 20 `POST /api/store/vocabulary/bulk` calls with 500 records and of 20 `GET /api/store/vocabulary` calls returning 500 records, and the end state the user waits for is those 500 records visible on GET.
- [ ] Probe. `curl -s -o /dev/null -w '%{time_total}\n'` on both routes at head, 20 runs each, after warming once.
- [ ] Baseline. Record first that trunk returns 404 for `/api/store/vocabulary`, then record the head p50 values.
- [ ] Rule. Bulk p50 fails when it exceeds 1500 ms. List p50 fails when it exceeds 300 ms.

**Review gate.** None. PR4 is not review-gated.

**Merge.**

- [ ] Root's clean verdict at the exact head SHA.
- [ ] Bugbot triage done.
- [ ] After the verdict, the root uses Shipping step 4 to move the PR onto PR3's exact tip. Record the current landing SHA. Preserve the verdict only when the patch ID stays unchanged.
- [ ] The root appends PR4 above PR3 in the frozen stack. The operator lands it after PR3. Same-repository child PRs target parent branches. Fork child PRs target trunk while retaining local parent ancestry.

## Persist lessons, jobs, and media on the server (PR5)

**Depends on.** PR4. PR3 sits below it in the stack and supplies `resolve_provider_key` to the pipeline.

**Files.**

- [ ] Create `backend/app/lessons/models.py`, `backend/app/media/__init__.py`, `models.py`, `service.py`, `router.py`, `backend/app/jobs/models.py`, `backend/app/catalog/__init__.py`, `models.py`, and `service.py`.
- [ ] Create `backend/alembic/versions/0005_lessons_media_jobs_catalog.py`.
- [ ] Edit `backend/app/job_store.py`, `backend/app/background/router.py`, `backend/app/lessons/router.py`, `backend/app/lessons/services/audio.py`, `backend/app/lessons/services/youtube_subtitles.py`, `backend/app/tts/router.py`, `backend/app/vocab/router.py`, `backend/app/tips/router.py`, `backend/app/tips/services/transcript.py`, `backend/app/tips/services/studio.py`, `backend/app/settings.py`, and `backend/app/main.py`.
- [ ] Create `backend/tests/test_media_router.py`, `test_lessons_persistence.py`, `test_catalog.py`, and `test_shadowing_audio.py`. Edit `backend/tests/test_job_store.py`, `test_jobs_router.py`, `test_lessons_router.py`, `test_tts_router.py`, `test_vocab_router.py`, `test_tips_transcript.py`, and `test_tips_studio_router.py`.

**Build.**

- [ ] Define `Lesson` with `id uuid`, `user_id`, `title`, `source`, `source_url`, `duration_s`, `source_language`, `translation_languages jsonb`, `created_at`, `last_opened_at`, and `meta jsonb` for the client-owned `LessonMeta` fields, and `LessonSegment` with `lesson_id`, `position`, `data jsonb`, `start_s`, `end_s`, and primary key `(lesson_id, position)`, in `lessons/models.py`.
- [ ] Define `MediaObject` in `media/models.py` with `id uuid`, `user_id`, `kind` in `video`, `audio`, `shadowing`, `lesson_id`, `segment_id null`, `object_key`, `size bigint`, `sha256 text`, `content_type`, and `created_at`. Object keys follow `users/<user_id>/lessons/<lesson_id>/<kind>/<media_id>.<ext>`.
- [ ] Implement `store_file(user, kind, lesson_id, source_path) -> MediaObject` in `media/service.py`. It streams the file through `hashlib.sha256` into `put_object`, records `size` and `sha256`, and unlinks the temp file. Implement `stream(media, range_header)` per Appendix A. Without `Range` it returns 200 with `Content-Length` and `Accept-Ranges: bytes`. With a satisfiable single range it calls `get_object(Range=...)` and returns 206 with `Content-Range`. An unsatisfiable range returns 416 with `Content-Range: bytes */<size>`. The generator closes the body in `finally`.
- [ ] Mount `GET /api/media/{id}` in `media/router.py`. It accepts either the user bearer or `?token=<jwt>` with audience `shadowlearn:media`, claim `mid` equal to the id, and lifetime `settings.media_token_minutes` (default 10), because `<video>` cannot send headers. Mount `POST /api/media/{id}/ticket` to mint a fresh token. Mount `PUT` and `GET /api/lessons/{lesson_id}/segments/{segment_id}/shadowing-audio` for the shadowing recordings, keyed by `(user_id, lesson_id, segment_id)`.
- [ ] Persist jobs. Define `JobRow` with `id text`, `user_id null`, `key text null`, `status`, `step`, `result jsonb`, `error`, `created_at`, and `updated_at`, plus a partial unique index on `key` where `status <> 'error'`. The functions in `job_store.py` keep their names and become `async` database operations. `prune_expired_jobs` deletes rows older than one hour. Startup marks every `processing` row as `error` with `server restarted`.
- [ ] Rewrite `_process_youtube_lesson`, `_process_upload_lesson`, and `_process_blog_lesson` in `lessons/router.py` to insert the `Lesson` and its `LessonSegment` rows, upload the video or audio through `store_file`, and set the job result to `{"lesson": {...}, "video_url", "audio_url"}` with the same field names as today, so `useJobPoller.ts` at this head keeps working. The URLs now point at `/api/media/<id>?token=...`.
- [ ] Add `GET /api/lessons`, `GET /api/lessons/{id}` (returns the lesson, its segments, and fresh media URLs), `PATCH /api/lessons/{id}` for `meta` and `last_opened_at`, and `DELETE /api/lessons/{id}`, which removes the rows and the MinIO objects. Delete `get_video` and `get_audio` from `lessons/router.py`.
- [ ] Read the temp directory from `settings.temp_dir` in `lessons/router.py:42`, `audio.py:17`, and `youtube_subtitles.py:17`, and unlink every temp file after upload.
- [ ] Create the global catalog tables `catalog_tts(key text primary key, media_id)` keyed by `sha256(provider|voice|lang|text)`, `catalog_word_breakdowns(word, lang, data)`, `catalog_tip_transcripts(video_id primary key, data)`, `catalog_tip_studio(video_id, kind, locale, data)`, and `catalog_tip_cards(video_id, locale, data)`. `tts/router.py` and `vocab/router.py` check the catalog before calling a provider and write after. `tips/router.py` returns `ready` from the catalog before probing yt-dlp, and the studio and transcript jobs write their results into it.

**You see.**

- [ ] After a YouTube lesson completes, `psql -c 'select id, title from lessons'` shows the row, `mc ls --recursive local/lane-<n>/users/` shows the `video/` object, and `ls /tmp/shadowlearn` is empty.
- [ ] `curl -i -H 'Range: bytes=0-99' "$API/api/media/$ID?token=$T"` prints `HTTP/1.1 206`, `Content-Range: bytes 0-99/<size>`, and 100 bytes.
- [ ] `docker compose restart backend` during a lesson job leaves the job in `error` with `server restarted`, and a job completed before the restart still answers `GET /api/jobs/{id}`.
- [ ] The second `POST /api/tts` for the same text logs `catalog hit key=...` and makes no provider call.

**Verify, unit.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked.

- [ ] `backend/tests/test_media_router.py` covers the Range table from Appendix A (no range, `100-199`, open end, suffix, `0-`, unsatisfiable 416), 404 for a missing object, 401 for a media token with the wrong `mid`, and 401 for an expired token. Run `cd backend && uv run pytest tests/test_media_router.py`.
- [ ] `backend/tests/test_lessons_persistence.py` runs a pipeline with mocked providers and asserts the lesson row, the segment rows in order, the media object, and the job result shape. Run `cd backend && uv run pytest tests/test_lessons_persistence.py`.
- [ ] `backend/tests/test_job_store.py` covers persistence across a new session, startup marking of `processing` rows, keyed dedupe through the partial unique index, and pruning. Run `cd backend && uv run pytest tests/test_job_store.py tests/test_jobs_router.py`.
- [ ] `backend/tests/test_catalog.py` asserts two identical TTS requests make one provider call through `respx`, and the same for a word breakdown and a tip transcript. `backend/tests/test_shadowing_audio.py` asserts a PUT then GET returns identical bytes and the stored `sha256` matches. Run `cd backend && uv run pytest tests/test_catalog.py tests/test_shadowing_audio.py`.

**Verify, live.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked. Ten lanes on the configured `swarm workers` role at the PR head, per the boot recipe. Lanes 1 to 9 use `run` with `curl`. Lane 2 also uses `verify` on a scratch HTML page with one `<video>` element.

- [ ] Lane 1. Regression lane against trunk. Run a YouTube lesson job to completion at trunk and at head, then GET the `video_url` from each result. Save `pr5-video-trunk-head.png`. Pass when trunk streams the full file once from `/api/lessons/video/`, head streams the same size from `/api/media/`, and a second GET at head still returns 200 while trunk returns 404.
- [ ] Lane 2. Seek. Load the head `video_url` into a `<video>` element and seek to the middle. Save `pr5-seek-206.png`. Pass when the devtools network log shows `206` responses with `Content-Range` for the seek.
- [ ] Lane 3. Skip. The operator trimmed this PR to three live lanes on 2026-09-23. Original scenario follows. Expired ticket. Mint a ticket with `SHADOWLEARN_MEDIA_TOKEN_MINUTES=1`, wait 70 seconds, GET. Save `pr5-ticket-expired.png`. Pass when the response is 401 and `POST /api/media/{id}/ticket` yields a token that returns 200.
- [ ] Lane 4. Ownership. GET user A's media id as user B with a bearer, and with a ticket minted by A. Save `pr5-media-owner.png`. Pass when the bearer request returns 404 and the ticket request returns 200, because the ticket is the capability.
- [ ] Lane 5. Skip. The operator trimmed this PR to three live lanes on 2026-09-23. Original scenario follows. Shadowing audio. PUT a 3 second WAV for `L1/s1`, GET it, compare `sha256sum`. Save `pr5-shadowing-audio.png`. Pass when the digests match and `select sha256 from media_objects where kind='shadowing'` equals them.
- [ ] Lane 6. Skip. The operator trimmed this PR to three live lanes on 2026-09-23. Original scenario follows. Job persistence. Start a lesson job, `docker compose restart backend` mid-run, then poll. Save `pr5-job-restart.png`. Pass when the job reads `error` with `server restarted` and a job completed before the restart still returns its result.
- [ ] Lane 7. Skip. The operator trimmed this PR to three live lanes on 2026-09-23. Original scenario follows. Keyed dedupe. Fire two concurrent `POST /api/tips/studio/summary` for the same video and locale. Save `pr5-keyed-dedupe.png`. Pass when both return the same `jobId` and `select count(*) from jobs where key like 'tip-studio:%'` is 1.
- [ ] Lane 8. Skip. The operator trimmed this PR to three live lanes on 2026-09-23. Original scenario follows. Catalog hit. Call `POST /api/tts` twice with the same text and `POST /api/vocab/breakdown-story` twice with the same word. Save `pr5-catalog-hit.png`. Pass when the backend log shows `catalog hit` on each second call and the response bodies match.
- [ ] Lane 9. Skip. The operator trimmed this PR to three live lanes on 2026-09-23. Original scenario follows. Lesson delete. `DELETE /api/lessons/{id}`, then `GET` it and `mc ls --recursive local/lane-<n>/users/<uid>/lessons/<id>/`. Save `pr5-lesson-delete.png`. Pass when GET returns 404 and the listing is empty.
- [ ] Lane 10. Skip. The operator trimmed this PR to three live lanes on 2026-09-23. Original scenario follows. Large upload. `POST /api/lessons/generate-upload` with a 200 MB MP4 through a local nginx configured like `docs/deployment_guideline.md` step 7. Save `pr5-large-upload.png`. Pass when the job completes, the object size matches, and `ls /tmp/shadowlearn` is empty afterwards.

**Verify, perf.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked.

- [ ] Metric. Pipeline wall time for a fixed 60 second upload fixture, at trunk and at head, and time to first byte for a 50 MB media GET with `Range: bytes=0-`, at trunk against `/api/lessons/video/<file>` and at head against `/api/media/<id>?token=`.
- [ ] Probe. Time `POST /api/lessons/generate-upload` to job `complete` with a polling loop, five runs alternating trunk and head. Then `curl -s -o /dev/null -w '%{time_starttransfer}\n' -H 'Range: bytes=0-'` 20 times per side, alternating.
- [ ] Baseline. Record the trunk pipeline wall time and trunk first byte first.
- [ ] Rule. Head pipeline fails when it exceeds trunk by more than 20 percent. Head first byte fails when it exceeds 200 ms or exceeds trunk by more than 50 ms.

**Review gate.** None. PR5 is not review-gated.

**Merge.**

- [ ] Root's clean verdict at the exact head SHA.
- [ ] Bugbot triage done.
- [ ] After the verdict, the root uses Shipping step 4 to move the PR onto PR4's exact tip. Record the current landing SHA. Preserve the verdict only when the patch ID stays unchanged.
- [ ] The root appends PR5 above PR4 in the frozen stack. The operator lands it after PR4. Same-repository child PRs target parent branches. Fork child PRs target trunk while retaining local parent ancestry.

## Cut the session and lesson data over to HTTP (PR6a)

**Depends on.** PR5.

**Files.**

- [ ] Create `frontend/src/db/client.ts` and `frontend/src/db/legacy.ts`.
- [ ] Edit `frontend/src/db/index.ts`, `frontend/src/app/providers/AuthContext.tsx`, `frontend/src/app/App.tsx`, `frontend/src/features/lesson/application/LessonsContext.tsx`, `useLesson.ts`, `useJobPoller.ts`, `useUploadThumbnail.ts`, `frontend/src/features/lesson/ui/library/Library.tsx`, `frontend/src/features/lesson/ui/LessonView.tsx`, `frontend/src/features/lesson/ui/create/CreateLesson.tsx`, the video player component under `frontend/src/features/lesson/ui/`, `frontend/src/features/settings/ui/Settings.tsx`, and `frontend/src/features/agent/application/useZoberChat.ts`.
- [ ] Edit the six direct IndexedDB files `frontend/src/features/speak/adapters/speakSessions.ts`, `frontend/src/features/vocabulary/application/VocabularyContext.tsx`, `frontend/src/features/agent/lib/tools/data/getStudyContext.ts`, `getVocabulary.ts`, `frontend/src/features/agent/lib/tools/render/renderStudySession.ts`, and `renderVocabCard.ts` for the mechanical `db.legacy.` rename only.
- [ ] Create `frontend/tests/fake-api.ts`, `frontend/tests/db-lessons.test.ts`, and `frontend/tests/e2e/support/api-helpers.ts`. Edit `frontend/tests/LessonsContext.test.tsx`, `frontend/tests/useJobPoller.test.ts`, `frontend/tests/e2e/create-lesson/helpers.ts`, the create-lesson specs, `frontend/tests/e2e/debug-sidebar.spec.ts`, and `frontend/playwright.config.ts`.
- [ ] Create `backend/app/testing/__init__.py`, `backend/app/testing/router.py`, and `backend/tests/test_testing_router.py`. Edit `backend/app/main.py` and `backend/app/settings.py`.
- [ ] Edit `.github/workflows/e2e-tests.yml`.

**Build.**

- [ ] Define `ApiClient` in `frontend/src/db/client.ts` with `get`, `list`, `put`, `del`, `bulk`, and `fetch`, all built on `apiFetch`, and `DataClient = { api: ApiClient; legacy: ShadowLearnDB }`. `useAuth().db` becomes `DataClient | null`. `AuthContext` builds `api` on login and opens `legacy` through `legacy.initDB` until PR6b removes it.
- [ ] Move `initDB`, the `ShadowLearnSchema` interfaces, and the whole `upgrade` function from `frontend/src/db/index.ts` into `frontend/src/db/legacy.ts` unchanged. The importer in PR7 reads through this file.
- [ ] Convert the lesson-domain helpers in `frontend/src/db/index.ts` to HTTP with the same names and argument lists. `getAllLessonMetas` calls `GET /api/lessons`. `getLessonMeta` calls `GET /api/lessons/{id}`. `saveLessonMeta` calls `PATCH /api/lessons/{id}` with the client-owned fields. `deleteLessonMeta` calls `DELETE /api/lessons/{id}`, which also removes segments and media, so `deleteSegments` and `deleteVideo` become no-ops that PR8 deletes. `getSegments` reads the segments from `GET /api/lessons/{id}`. `getVideo` returns the media URL string instead of a `Blob`, and its callers set it as `src`. `saveVideo` and `saveSegments` are deleted, because the server pipeline writes segments and media, and the PR7 importer uploads legacy copies through its own routes. `saveSettings` and `getSettings` use `/api/store/settings/settings`. `getThread`, `saveThreadMessages`, `deleteThread`, `listThreadsBySurface`, `putThreadSummary`, and `getLatestSummary` use `/api/store/threads` and `/api/store/thread-summaries`. `saveChatMessages`, `getChatMessages`, and `deleteChatMessages` drop the dead `chats` store and keep only the thread path.
- [ ] Rename every remaining IndexedDB access in `frontend/src/db/index.ts` and in the six direct files from `db.<op>(` to `db.legacy.<op>(`. Record the count from `grep -rho '\.legacy\.' frontend/src | wc -l` in the PR body. PR6b drives it to 0.
- [ ] Give `LessonsContext` the shape `{ lessons, status: 'loading' | 'ready' | 'error', error, reload }`. `Library.tsx` renders a skeleton while loading and an error card with a Retry button. `LessonView.tsx` renders a loading state and a "Lesson not found" state.
- [ ] Set the player's `<video src>` to the media URL from `GET /api/lessons/{id}`. On the element's `error` event after a 401 or 403, call `POST /api/media/{id}/ticket` once and reassign `src`.
- [ ] Make `useJobPoller.ts` call `reload()` on `complete` instead of downloading the video and audio into IndexedDB.
- [ ] Add `POST /api/testing/lessons` in `backend/app/testing/router.py`, mounted only when `settings.enable_test_routes` is true, which inserts lesson and segment rows for the caller from a JSON body. It replaces the IndexedDB seeding in `frontend/tests/e2e/support/idb-helpers.ts` for lesson specs. Production compose files never set the flag.
- [ ] Write `frontend/tests/e2e/support/api-helpers.ts` with `signUpAndLogin(page)`, `seedLesson(request, lesson)`, and `seedSettings(request, settings)` over HTTP. Point `frontend/tests/e2e/create-lesson/helpers.ts`, the create-lesson specs, and `debug-sidebar.spec.ts` at them.
- [ ] Add to `.github/workflows/e2e-tests.yml` a `postgres:16-alpine` service, the MinIO `docker run` step from PR1, `uv sync`, `uv run alembic upgrade head`, and a backgrounded `uv run uvicorn app.main:app --port 8000` with `SHADOWLEARN_ENABLE_TEST_ROUTES=true`, `SHADOWLEARN_JWT_SECRET`, `SHADOWLEARN_JWT_REFRESH_SECRET`, `SHADOWLEARN_ENCRYPTION_KEY`, and the origin allowlist for `http://localhost:5173`, before `pnpm test:e2e`. Add a `webServer` entry for the backend health URL in `playwright.config.ts`.
- [ ] Write `frontend/tests/fake-api.ts` exporting `FakeApiClient`, an in-memory `ApiClient` keyed by path, for vitest.

**You see.**

- [ ] The Library shows a skeleton, then the list from `GET /api/lessons` in the network log, and devtools Application shows the IndexedDB `lessons` store count unchanged from before the login.
- [ ] Seeking in a lesson video shows `206` responses from `/api/media/` in the network log.
- [ ] `grep -rho '\.legacy\.' frontend/src | wc -l` prints the recorded count, and `npx tsc -b` passes.
- [ ] The `Playwright E2E` and `Create Lesson` checks are green with the backend started in the workflow log.

**Verify, unit.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked.

- [ ] `frontend/tests/db-lessons.test.ts` drives every converted helper against `FakeApiClient` and asserts the paths, methods, and bodies. Run `cd frontend && pnpm test tests/db-lessons.test.ts`.
- [ ] `frontend/tests/LessonsContext.test.tsx` covers `loading` to `ready`, `loading` to `error` with `reload` recovering, and `useJobPoller.test.ts` asserts no `saveVideo` call on `complete`. Run `cd frontend && pnpm test tests/LessonsContext.test.tsx tests/useJobPoller.test.ts`.
- [ ] The player test covers one ticket refresh after a 401 `error` event. Run `cd frontend && pnpm test && pnpm lint && npx tsc -b`.
- [ ] `backend/tests/test_testing_router.py` asserts the route is 404 when the flag is off and inserts rows when on. Run `cd backend && uv run pytest tests/test_testing_router.py`.

**Verify, live.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked. Ten lanes on the configured `swarm workers` role at the PR head, per the boot recipe. All lanes use `verify`. Lane 10 also reads the GitHub check through `run`.

- [ ] Lane 1. Regression lane against trunk. Seed three lessons, open the Library, open one lesson, play, and seek, at trunk with IndexedDB seeding and at head with `api-helpers.ts`. Save `pr6a-library-trunk-head.png`. Pass when both render the same three titles and the same segment count, and playback advances after the seek on both.
- [ ] Lane 2. Skip. The operator trimmed this PR to three live lanes on 2026-09-23. Original scenario follows. Empty account. Sign up on a fresh profile and open the Library. Save `pr6a-empty-state.png`. Pass when the empty state renders with a Create Lesson call to action and no console error.
- [ ] Lane 3. YouTube lesson. Create a YouTube lesson, wait for the job, open it, play. Save `pr6a-youtube-lesson.png`. Pass when the lesson appears in the Library without a reload and the video plays from `/api/media/`.
- [ ] Lane 4. Skip. The operator trimmed this PR to three live lanes on 2026-09-23. Original scenario follows. Upload lesson. Create a lesson from a local MP4, wait, open, play. Save `pr6a-upload-lesson.png`. Pass when segments render and the network log shows no request to `/api/lessons/video/`.
- [ ] Lane 5. Two devices. Delete a lesson in browser context A, reload the Library in context B logged in as the same user. Save `pr6a-two-devices.png`. Pass when the lesson is gone in B.
- [ ] Lane 6. Skip. The operator trimmed this PR to three live lanes on 2026-09-23. Original scenario follows. Settings. Change the interface language in Settings in context A, reload in context B. Save `pr6a-settings-sync.png`. Pass when B shows the new language.
- [ ] Lane 7. Skip. The operator trimmed this PR to three live lanes on 2026-09-23. Original scenario follows. Threads. Chat with the agent inside a lesson, reload, open the same lesson in context B. Save `pr6a-thread-sync.png`. Pass when both contexts show the same messages.
- [ ] Lane 8. Skip. The operator trimmed this PR to three live lanes on 2026-09-23. Original scenario follows. Ticket expiry mid-playback. Start the backend with `SHADOWLEARN_MEDIA_TOKEN_MINUTES=1`, open a lesson, wait 70 seconds, seek. Save `pr6a-ticket-refresh.png`. Pass when the network log shows one `POST /api/media/<id>/ticket` and playback continues.
- [ ] Lane 9. Skip. The operator trimmed this PR to three live lanes on 2026-09-23. Original scenario follows. Backend down. Stop the backend, reload the Library, start it, click Retry. Save `pr6a-error-retry.png`. Pass when the error card renders instead of a blank page and Retry restores the list.
- [ ] Lane 10. Skip. The operator trimmed this PR to three live lanes on 2026-09-23. Original scenario follows. CI. Open the `Playwright E2E` and `Create Lesson` check logs for the head SHA. Save `pr6a-ci-green.png`. Pass when both are `success` and the log shows the backend health wait succeeded.

**Verify, perf.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked.

- [ ] Metric. Library time to list with 20 seeded lessons, and time from opening a lesson to the `<video>` `canplay` event for a 50 MB video, at trunk from IndexedDB and at head from HTTP.
- [ ] Probe. Through `verify`, record `performance.now()` at navigation and at the list render, and at lesson open and `canplay`, 10 runs per side, alternating trunk and head.
- [ ] Baseline. Record the trunk time to list and trunk `canplay` first.
- [ ] Rule. Head time to list fails when it exceeds trunk by more than 500 ms. Head `canplay` fails when it exceeds trunk by more than 500 ms.

**Review gate.** The operator reviews before merge.

- [ ] Copy lane 1 and lane 9 screenshots into `docs/plans/media/server-backend-migration/pr6a-review-library.png` and `docs/plans/media/server-backend-migration/pr6a-review-error.png`.
- [ ] Record a 30 to 60 second video of login, Library loading, opening a lesson, seeking, and the two-device delete on a live lane. Save it as `docs/plans/media/server-backend-migration/pr6a-review.mp4`.
- [ ] Post the screenshots and the video in chat. Stop at merge-ready. Wait for the operator's click.

**Merge.**

- [ ] Root's clean verdict at the exact head SHA.
- [ ] Bugbot triage done.
- [ ] After the verdict, the root uses Shipping step 4 to move the PR onto PR5's exact tip. Record the current landing SHA. Preserve the verdict only when the patch ID stays unchanged.
- [ ] The root appends PR6a above PR5 in the frozen stack. The operator lands it after PR5. Same-repository child PRs target parent branches. Fork child PRs target trunk while retaining local parent ancestry.

## Cut study, vocabulary, speak, and tips data over to HTTP (PR6b)

**Depends on.** PR6a.

**Files.**

- [ ] Edit `frontend/src/db/index.ts`, `frontend/src/db/client.ts`, and `frontend/src/app/providers/AuthContext.tsx`.
- [ ] Edit the six direct IndexedDB files from PR6a, `frontend/src/shared/hooks/useSpeakingBests.ts`, `frontend/src/shared/hooks/useTTS.ts`, `frontend/src/features/vocabulary/application/useWordBreakdown.ts`, `frontend/src/features/learning-materials/application/useTipTranscript.ts`, `useTipStudio.ts`, `useTipCards.ts`, the tip-progress, tip-notes, and user-materials adapters under `frontend/src/features/learning-materials/`, `frontend/src/features/study/application/useStudyQueue.ts`, `DailyReviewContext.tsx`, `StudyQueueContext.tsx`, the study exercise components that read stats, `frontend/src/features/shadowing/**` recording code, and `frontend/src/app/pages/WorkbookPage.tsx`.
- [ ] Edit `frontend/tests/agent-tools.test.ts`, `frontend/tests/useTTS.test.ts`, and every vitest file under `frontend/tests` that exercises a converted helper. Create `frontend/tests/db-study.test.ts`. Edit `frontend/tests/e2e/vocabulary/vocabulary-workbook.spec.ts`, `frontend/tests/e2e/dictation/dictation.spec.ts`, and `frontend/tests/e2e/support/api-helpers.ts`.

**Build.**

- [ ] Convert the remaining helpers in `frontend/src/db/index.ts` to `/api/store/<store>` with the same names and argument lists. `getDueItems` calls `GET /api/store/spaced-repetition?index=by-due&op=lte&value=<today>`. `getRecentMistakes` sorts the list by `lastOccurred` client-side. `getAgentMemoriesByTag` uses `index=tags`. `deleteSpeakingBestsByLesson` and `deleteSpeakingAudioByLesson` use the delete-by-index route. `getSpeakingAudio` returns the media URL and `saveSpeakingAudio` uploads through `PUT /api/lessons/{lesson_id}/segments/{segment_id}/shadowing-audio`. `getTTSCache`, `saveTTSCache`, `getBreakdown`, `saveBreakdown`, `getTipTranscript`, `putTipTranscript`, `getTipStudio`, `putTipStudio`, `getTipCards`, `putTipCards`, `getTipCourse`, `putTipCourse`, `getTipChat`, `putTipChat`, and `appendAgentLog` are deleted, because the server catalog and the dropped stores replace them.
- [ ] Convert `speakSessions.ts` to `/api/store/speak-sessions`, `VocabularyContext.tsx` to `/api/store/vocabulary` with a `status` field, and the four agent tools to the same helpers.
- [ ] Make `useTTS.ts` call `POST /api/tts` and play the returned audio without a local cache. Make `useWordBreakdown.ts`, `useTipTranscript.ts`, `useTipStudio.ts`, and `useTipCards.ts` read the server response without writing a local cache.
- [ ] Add loading and error states to the Workbook, the study session start, the daily review, the speak history, and the tips course pages, following the `status` shape from PR6a.
- [ ] Remove `legacy` from `DataClient`. `AuthContext` stops calling `initDB`. `grep -rho '\.legacy\.' frontend/src | wc -l` prints 0.
- [ ] Convert the vocabulary and dictation e2e specs to `api-helpers.ts` with `seedVocabEntries(request, entries)` over `POST /api/store/vocabulary/bulk`.

**You see.**

- [ ] `grep -rho '\.legacy\.' frontend/src | wc -l` prints 0 and `npx tsc -b` passes.
- [ ] The Workbook lists entries from `GET /api/store/vocabulary` in the network log, and devtools Application shows no `shadowlearn` IndexedDB on a fresh profile.
- [ ] Playing the same TTS phrase twice shows two `POST /api/tts` requests and the backend log shows `catalog hit` on the second.

**Verify, unit.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked.

- [ ] `frontend/tests/db-study.test.ts` drives every converted helper against `FakeApiClient`, including the `by-due` query string and the shadowing audio upload. Run `cd frontend && pnpm test tests/db-study.test.ts`.
- [ ] `frontend/tests/agent-tools.test.ts` asserts `getVocabulary`, `renderVocabCard`, `renderStudySession`, and `getStudyContext` read through the API client. `useTTS.test.ts` asserts no cache read or write. Run `cd frontend && pnpm test tests/agent-tools.test.ts tests/useTTS.test.ts`.
- [ ] The VocabularyContext test covers `loading`, `ready`, and `error`. Run `cd frontend && pnpm test && pnpm lint && npx tsc -b`.

**Verify, live.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked. Ten lanes on the configured `swarm workers` role at the PR head, per the boot recipe. All lanes use `verify`.

- [ ] Lane 1. Regression lane against trunk. Seed 20 vocabulary entries with due items and run a study session to completion, at trunk and at head. Save `pr6b-study-trunk-head.png`. Pass when both sessions complete and the summary shows the same exercise count.
- [ ] Lane 2. Workbook across devices. Add, edit, and delete an entry in context A, reload the Workbook in context B. Save `pr6b-workbook-sync.png`. Pass when B shows the edit and not the deleted entry.
- [ ] Lane 3. Skip. The operator trimmed this PR to three live lanes on 2026-09-23. Original scenario follows. Due list. Seed items due yesterday, today, and tomorrow, open the daily queue. Save `pr6b-due-list.png`. Pass when the queue holds exactly two items.
- [ ] Lane 4. Skip. The operator trimmed this PR to three live lanes on 2026-09-23. Original scenario follows. Daily review persists. Complete the daily review, reload, open it again. Save `pr6b-daily-review.png`. Pass when the review shows as done for today after reload.
- [ ] Lane 5. Skip. The operator trimmed this PR to three live lanes on 2026-09-23. Original scenario follows. Shadowing. Record a shadowing attempt, then open the same segment in context B and play the recording. Save `pr6b-shadowing.png`. Pass when the best score shows in B and the recording plays from `/api/media/`.
- [ ] Lane 6. Skip. The operator trimmed this PR to three live lanes on 2026-09-23. Original scenario follows. Speak history. Run a speak session, then open the speak history in context B. Save `pr6b-speak-history.png`. Pass when the session appears with its transcript.
- [ ] Lane 7. Skip. The operator trimmed this PR to three live lanes on 2026-09-23. Original scenario follows. Tips. Open a tips course, mark a video complete, add a note, reload in context B. Save `pr6b-tips-sync.png`. Pass when progress and the note show in B.
- [ ] Lane 8. Skip. The operator trimmed this PR to three live lanes on 2026-09-23. Original scenario follows. TTS catalog. Play one phrase twice. Save `pr6b-tts-catalog.png`. Pass when both plays produce audio and the backend log shows `catalog hit` once.
- [ ] Lane 9. Skip. The operator trimmed this PR to three live lanes on 2026-09-23. Original scenario follows. Word breakdown. Open a breakdown for the same word twice. Save `pr6b-breakdown.png`. Pass when the second open renders from the catalog with no OpenRouter call in the backend log.
- [ ] Lane 10. Agent tools. Ask the agent to show a vocabulary card and start a study session from chat. Save `pr6b-agent-tools.png`. Pass when the card shows a server-stored entry and the session opens.

**Verify, perf.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked.

- [ ] Metric. Time from clicking Start to the first exercise render with 200 vocabulary entries, and Workbook time to list with 500 entries, at trunk from IndexedDB and at head from HTTP. Head-only time from click to audio start for a catalog-hit TTS phrase.
- [ ] Probe. Through `verify`, record `performance.now()` deltas, 10 runs per side, alternating trunk and head. For TTS, record 10 head runs of the second play.
- [ ] Baseline. Record the trunk study start and trunk Workbook list first.
- [ ] Rule. Head study start fails when it exceeds trunk by more than 500 ms. Head Workbook list fails when it exceeds trunk by more than 500 ms. Catalog-hit TTS fails when it exceeds 300 ms.

**Review gate.** The operator reviews before merge.

- [ ] Copy lane 2 and lane 5 screenshots into `docs/plans/media/server-backend-migration/pr6b-review-workbook.png` and `docs/plans/media/server-backend-migration/pr6b-review-shadowing.png`.
- [ ] Record a 30 to 60 second video of a study session, the Workbook sync, and a shadowing recording on a live lane. Save it as `docs/plans/media/server-backend-migration/pr6b-review.mp4`.
- [ ] Post the screenshots and the video in chat. Stop at merge-ready. Wait for the operator's click.

**Merge.**

- [ ] Root's clean verdict at the exact head SHA.
- [ ] Bugbot triage done.
- [ ] After the verdict, the root uses Shipping step 4 to move the PR onto PR6a's exact tip. Record the current landing SHA. Preserve the verdict only when the patch ID stays unchanged.
- [ ] The root appends PR6b above PR6a in the frozen stack. The operator lands it after PR6a. Same-repository child PRs target parent branches. Fork child PRs target trunk while retaining local parent ancestry.

## Import legacy IndexedDB data with verified deletion (PR7)

**Depends on.** PR6b.

**Files.**

- [ ] Create `backend/app/importer/__init__.py`, `canonical.py`, `manifest.py`, and `router.py`. Edit `backend/pyproject.toml` to add `rfc8785`.
- [ ] Create `backend/tests/test_importer_router.py`, `test_canonical_parity.py`, and `backend/tests/fixtures/canonical-fixtures.json`.
- [ ] Create `frontend/src/features/migration/detectLegacyData.ts`, `exportStores.ts`, `canonical.ts`, `manifest.ts`, `uploadMedia.ts`, `useMigration.ts`, and `MigrationModal.tsx`. Edit `frontend/src/app/App.tsx` and `frontend/package.json` to add `hash-wasm`.
- [ ] Create `frontend/tests/migration/canonical.test.ts`, `manifest.test.ts`, `detectLegacyData.test.ts`, `MigrationModal.test.tsx`, `generate-canonical-fixtures.test.ts`, and `frontend/tests/e2e/support/legacy-seed.ts`. Create `frontend/tests/e2e/migration/migration.spec.ts`.

**Build.**

- [ ] Implement `detectLegacyData()` in `detectLegacyData.ts`. It opens `shadowlearn` through `legacy.initDB`, which upgrades any older schema to v21, counts the in-scope stores, and returns `{present, counts}`. The in-scope stores are `lessons`, `segments`, `videos`, `settings`, `vocabulary`, `learner-profile`, `progress-db`, `mastery-db`, `spaced-repetition`, `session-logs`, `mistakes-db`, `agent-memory`, `exercise-stats`, `daily-tasks`, `speak-sessions`, `shadowing-bests`, `shadowing-audio`, `tip-progress`, `tip-notes`, `user-materials`, `threads`, and `thread-summaries`. When only out-of-scope stores hold rows, it deletes the database and returns `present=false`.
- [ ] Gate the app in `App.tsx`. After signup or login, when `detectLegacyData()` reports `present`, render `MigrationModal` over the app with no dismiss control until the run ends in success.
- [ ] Build `MigrationModal.tsx` with the steps Explain, Keys, Records, Media, Verify, Delete, and Done. Keys asks for the old PIN, calls `decryptKeys` from `frontend/src/shared/lib/crypto`, and saves each key through `PUT /api/keys/{provider}`, with a Skip button that says "re-enter keys in Settings". Records and Media show `n of N` progress. Verify shows each store's result. On any failure the modal lists the failing stores and offers Retry.
- [ ] Implement `exportStores.ts` to read each in-scope store through `legacy` in the order `lessons`, `segments`, then the 19 stores of PR4, and `uploadMedia.ts` to read `videos` and `shadowing-audio` last. Records upload through `POST /api/import/lessons` for lessons with their segments and through `POST /api/store/<store>/bulk` with `mode=import` for the rest. Blobs upload through `POST /api/import/media` as multipart with `lesson_id`, `segment_id`, and `kind`. Every upload is an upsert, so a rerun after a reload converges.
- [ ] Define the canonical form in `canonical.ts` and `backend/app/importer/canonical.py`. A record's canonical form is RFC 8785 JSON, which `JSON.stringify` with recursively sorted keys produces for this data, and `rfc8785.dumps` produces in Python. A store's hash is SHA-256 over the concatenation of each record's canonical form plus a newline, with records sorted by the UTF-8 bytes of their id. A blob's hash is SHA-256 over its bytes, computed with `hash-wasm` `createSHA256()` over `blob.stream()` in the browser and `hashlib.sha256` while the server writes the upload. Lessons hash their `LessonMeta` as sent, which the server stores verbatim in `lessons.meta`. Segments hash the `Segment[]` array per lesson, which the server rebuilds from `lesson_segments.data` in `position` order.
- [ ] Implement `POST /api/import/manifest` in `importer/router.py`. The body lists, per store, the ids this device sent, plus the `(lesson_id, segment_id, kind)` of every blob it sent. It returns, per store, `{count, sha256}` over only the caller's stored records with those ids, and per listed media object `{size, sha256}`. Scoping to the sent ids keeps the check valid when another device already imported records into the same account, because a union store then holds more rows than this device has. For every store whose merge rule is not `union`, the client hashes the `after` records the bulk response returned instead of its local records, and also checks that every local id is present on the server. The client compares the full manifest and deletes the local database with `indexedDB.deleteDatabase('shadowlearn')` only when every store and every blob matches.
- [ ] Skip `agent-logs`, `chats`, `tip-chats`, `tip-courses`, `crypto`, `tts-cache`, `word-breakdowns`, `tip-transcripts`, `tip-studio`, and `tip-cards`. They are dropped when the database is deleted.
- [ ] Add `SHADOWLEARN_IMPORT_FAULT=<store>` to `Settings` for lanes only. When set, the manifest drops one record's hash contribution for that store so the mismatch path can be exercised. Production compose never sets it.
- [ ] Write `frontend/tests/e2e/support/legacy-seed.ts`, which opens `shadowlearn` at version 21 through `page.evaluate` with the store names from `legacy.ts` and puts fixture records and blobs, because the app itself no longer writes IndexedDB.
- [ ] Generate `backend/tests/fixtures/canonical-fixtures.json` from `frontend/tests/migration/generate-canonical-fixtures.test.ts`. The fixture holds values with `1.0`, `1e21`, `0.1 + 0.2`, negative zero, unicode outside the BMP, nested arrays, `null`, and empty objects, each with the hash the browser side computed. `test_canonical_parity.py` recomputes every hash in Python.

**You see.**

- [ ] On a device with legacy data, the modal appears right after signup and cannot be closed. Progress bars advance through Records and Media. The final step reads "Verified 22 stores and 12 media files. Local copy deleted."
- [ ] Devtools Application shows no `shadowlearn` database afterwards, and the next login on the same device shows no modal.
- [ ] With `SHADOWLEARN_IMPORT_FAULT=vocabulary`, the Verify step lists `vocabulary` as failing, the database stays, and Retry after removing the fault completes the run.

**Verify, unit.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked.

- [ ] `backend/tests/test_canonical_parity.py` recomputes every hash in `canonical-fixtures.json` and asserts equality. Run `cd backend && uv run pytest tests/test_canonical_parity.py`.
- [ ] `backend/tests/test_importer_router.py` covers lessons with segments, media with `sha256`, manifest equality for a seeded user, idempotent second import, and the fault flag producing a mismatch. Run `cd backend && uv run pytest tests/test_importer_router.py`.
- [ ] `frontend/tests/migration/*.test.ts` covers detection with in-scope and out-of-scope data, canonical output for the fixture values, manifest comparison with one mismatching store, the singleton `after` path, and a modal that renders no close control. These tests keep `fake-indexeddb` because they exercise the legacy reader. Run `cd frontend && pnpm test tests/migration`.
- [ ] `frontend/tests/e2e/migration/migration.spec.ts` seeds through `legacy-seed.ts`, signs up, runs the modal, and asserts the database is gone. Run `cd frontend && pnpm test:e2e tests/e2e/migration`.

**Verify, live.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked. Ten lanes on the configured `swarm workers` role at the PR head, per the boot recipe. All lanes use `verify`. Each lane seeds legacy data with `legacy-seed.ts` through `verify` before it starts.

- [ ] Lane 1. Regression lane against trunk. Trunk lacks the importer, so record that a seeded v21 database at trunk serves the app as before. At head, seed the same fixture, sign up, and run the modal to Done. Save `pr7-import-done.png`. Pass when the Library shows the seeded lessons from the server and devtools shows no `shadowlearn` database.
- [ ] Lane 2. Fresh device. Sign up on a profile with no IndexedDB. Save `pr7-no-modal.png`. Pass when no modal appears and the Library empty state renders.
- [ ] Lane 3. PIN accepted. Seed encrypted keys with a known PIN, run the modal, enter the PIN. Save `pr7-pin-keys.png`. Pass when Settings shows "Using your key" for the seeded providers after Done.
- [ ] Lane 4. PIN skipped. Run the modal and click Skip on Keys. Save `pr7-pin-skip.png`. Pass when the run completes and Settings shows "Not configured" or "Using shared key" with a banner pointing to Settings.
- [ ] Lane 5. Wrong PIN. Enter a wrong PIN twice, then the right one. Save `pr7-pin-wrong.png`. Pass when the error shows twice and the third attempt proceeds.
- [ ] Lane 6. Mismatch. Start the backend with `SHADOWLEARN_IMPORT_FAULT=vocabulary`, run the modal. Save `pr7-mismatch.png`. Pass when Verify lists `vocabulary` as failing, the database still exists, and Retry stays available.
- [ ] Lane 7. Retry. Continue lane 6 with the fault removed and the backend restarted, click Retry. Save `pr7-retry.png`. Pass when the run completes, counts are unchanged from the first attempt, and the database is gone.
- [ ] Lane 8. Second device merge. Import fixture A as a user, then on a second profile seed fixture B with a different lesson and `learner-profile.totalSessions=4` and import as the same user. Save `pr7-second-device.png`. Pass when the Library shows both lessons and the profile shows the summed session count.
- [ ] Lane 9. Media progress. Seed a 60 MB video and three shadowing recordings, run the modal. Save `pr7-media-progress.png`. Pass when the Media bar reaches `4 of 4`, the video plays from `/api/media/` after Done, and `select sha256 from media_objects` matches `sha256sum` of the seeded files.
- [ ] Lane 10. Reload mid-run and old schema. Seed a version 10 database with the `idb-helpers.ts` shape, start the modal, reload the page during Records, log in again. Save `pr7-reload-resume.png`. Pass when the modal reappears, the run completes with the expected counts, and the database is gone.

**Verify, perf.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked.

- [ ] Metric. Trunk lacks the importer, so the metric is the diff-added work. Wall time from clicking Start to Done for a fixture of 1,000 vocabulary entries, 20 lessons with segments, and 50 MB of media on localhost, plus the client manifest compute time and the server `POST /api/import/manifest` time, and the end state the user waits for is Done with the database deleted.
- [ ] Probe. Through `verify`, record `performance.now()` at Start and at Done and the console timing lines `manifest client <ms>` and `manifest server <ms>`, five runs at head.
- [ ] Baseline. Record first that trunk has no `/api/import/manifest` route, then record the head values.
- [ ] Rule. Import wall time fails when it exceeds 120 seconds. Client manifest fails when it exceeds 5 seconds. Server manifest fails when it exceeds 3 seconds.

**Review gate.** The operator reviews before merge.

- [ ] Copy lane 1 and lane 6 screenshots into `docs/plans/media/server-backend-migration/pr7-review-done.png` and `docs/plans/media/server-backend-migration/pr7-review-mismatch.png`.
- [ ] Record a 30 to 60 second video of the modal from signup through Done, and the mismatch path, on a live lane. Save it as `docs/plans/media/server-backend-migration/pr7-review.mp4`.
- [ ] Post the screenshots and the video in chat. Stop at merge-ready. Wait for the operator's click.

**Merge.**

- [ ] Root's clean verdict at the exact head SHA.
- [ ] Bugbot triage done.
- [ ] After the verdict, the root uses Shipping step 4 to move the PR onto PR6b's exact tip. Record the current landing SHA. Preserve the verdict only when the patch ID stays unchanged.
- [ ] The root appends PR7 above PR6b in the frozen stack. The operator lands it after PR6b. Same-repository child PRs target parent branches. Fork child PRs target trunk while retaining local parent ancestry.

## Delete the IndexedDB write paths and stale docs (PR8)

**Depends on.** PR7.

**Files.**

- [ ] Edit `frontend/src/db/legacy.ts` and `frontend/src/db/index.ts`.
- [ ] Delete `frontend/src/shared/lib/crypto/index.ts` and `frontend/src/shared/lib/crypto/crypto.test.ts`. Create `frontend/src/features/migration/legacyCrypto.ts` and `frontend/tests/migration/legacyCrypto.test.ts`.
- [ ] Edit `frontend/src/app/providers/AuthContext.tsx`, `frontend/src/app/Layout.tsx`, `frontend/src/features/learning-materials/ui/collection/VideoCard.tsx`, `frontend/src/features/lesson/ui/create/CreateLesson.tsx`, `frontend/src/features/lesson/ui/library/Library.tsx`, and `frontend/src/features/settings/ui/Settings.tsx`.
- [ ] Delete `frontend/tests/AuthContext-trial.test.ts`, `frontend/tests/e2e/support/idb-helpers.ts`, and every vitest file listed by `grep -rl fake-indexeddb frontend/tests frontend/src --include=*.ts --include=*.tsx` outside `frontend/tests/migration/`, which is 36 files today, after moving any behavior assertion they still carry onto `FakeApiClient`. Move `frontend/tests/db/migration-v15-to-v16.test.ts` and `frontend/tests/db-migration-v14-to-v15.test.ts` into `frontend/tests/migration/` instead of deleting them, because they test the `upgrade` path the importer depends on.
- [ ] Create `frontend/tests/migration/legacy-readonly.test.ts`.
- [ ] Edit `frontend/tests/setup.ts` and `frontend/package.json`.
- [ ] Edit `backend/app/config/router.py` and `backend/tests/test_config_router.py`.
- [ ] Edit `.claude/CLAUDE.md`, `frontend/CLAUDE.md`, `docs/deployment_guideline.md`, and `README.md`.

**Build.**

- [ ] Reduce `frontend/src/db/legacy.ts` to `initDB`, the schema interfaces, the `upgrade` function, and the read helpers the importer uses. Delete every function that writes IndexedDB. Delete the no-op `deleteSegments` and `deleteVideo` from `frontend/src/db/index.ts` and their callers.
- [ ] Move `decryptKeys` and `EncryptedData` into `frontend/src/features/migration/legacyCrypto.ts`. Delete `encryptKeys` and the `frontend/src/shared/lib/crypto/` directory.
- [ ] Remove `trialMode`, `startTrial`, and `TRIAL_SESSION_KEY` from `AuthContext`, and the trial branches in `Layout.tsx`, `VideoCard.tsx`, `CreateLesson.tsx`, `Library.tsx`, and `Settings.tsx`. `grep -rn 'shadowlearn_trial\|trialMode\|startTrial' frontend/src` prints nothing.
- [ ] Remove `_compute_free_trial_available` from `backend/app/config/router.py`, which PR3 stopped serving.
- [ ] Scope the `fake-indexeddb` import in `frontend/tests/setup.ts` so it loads only for `frontend/tests/migration/`. Keep `fake-indexeddb` and `idb` in `package.json` because the legacy reader and its tests need them.
- [ ] Rewrite the stale sections of `.claude/CLAUDE.md`. Replace the `contexts/` and `components/` layout with the `features/`, `app/`, and `shared/` layout that exists, replace the `AuthContext` description with the login session and `ApiClient`, and replace the IndexedDB persistence paragraph with Postgres, MinIO, `/api/store`, and the read-only legacy reader. Rewrite the IndexedDB and API key rules in `frontend/CLAUDE.md`. Remove offline and PIN references from `docs/deployment_guideline.md` and `README.md`.

**You see.**

- [ ] `grep -rl fake-indexeddb frontend/tests frontend/src --include=*.ts --include=*.tsx` lists only files under `frontend/tests/migration/`.
- [ ] `grep -rn 'shadowlearn_trial\|trialMode\|startTrial\|encryptKeys' frontend/src` prints nothing.
- [ ] `pnpm test`, `pnpm lint`, `npx tsc -b`, and `uv run pytest` pass, and `pnpm build` reports a smaller main bundle than trunk.

**Verify, unit.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked.

- [ ] `frontend/tests/migration/legacyCrypto.test.ts` decrypts a fixture produced by the deleted `encryptKeys` and checked into the test as constants. Run `cd frontend && pnpm test tests/migration/legacyCrypto.test.ts`.
- [ ] A new `frontend/tests/migration/legacy-readonly.test.ts` asserts `legacy.ts` exports no symbol whose name starts with `save`, `put`, `upsert`, `append`, or `delete`. Run `cd frontend && pnpm test tests/migration/legacy-readonly.test.ts`.
- [ ] The full suites pass. Run `cd frontend && pnpm test && pnpm lint && npx tsc -b` and `cd backend && uv run pytest`.

**Verify, live.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked. Ten lanes on the configured `swarm workers` role at the PR head, per the boot recipe. All lanes use `verify`. Lane 10 also reads the GitHub checks through `run`.

- [ ] Lane 1. Regression lane against trunk. Sign up, create a blog lesson, and complete one study exercise at trunk and at head. Save `pr8-flow-trunk-head.png`. Pass when both flows complete and head shows no trial or PIN screen anywhere.
- [ ] Lane 2. Skip. The operator trimmed this PR to three live lanes on 2026-09-23. Original scenario follows. Settings. Open Settings. Save `pr8-settings.png`. Pass when no trial banner or PIN section renders and the Provider keys card is present.
- [ ] Lane 3. Migration still works. Seed a v21 fixture with `legacy-seed.ts`, sign up, run the modal. Save `pr8-migration-still-works.png`. Pass when the run reaches Done with the expected counts.
- [ ] Lane 4. Skip. The operator trimmed this PR to three live lanes on 2026-09-23. Original scenario follows. PIN keys still decrypt. Seed encrypted keys, run the modal, enter the PIN. Save `pr8-legacy-crypto.png`. Pass when Settings shows "Using your key".
- [ ] Lane 5. Fresh profile writes no IndexedDB. Sign up and use the app for five minutes on a fresh profile. Save `pr8-no-idb.png`. Pass when devtools Application lists no `shadowlearn` database.
- [ ] Lane 6. Skip. The operator trimmed this PR to three live lanes on 2026-09-23. Original scenario follows. Config. Open `GET /api/config` in the browser. Save `pr8-config.png`. Pass when the body has `shared_keys` and no `free_trial_available`.
- [ ] Lane 7. Skip. The operator trimmed this PR to three live lanes on 2026-09-23. Original scenario follows. Docs. Open `.claude/CLAUDE.md` and `frontend/CLAUDE.md` in the repo view. Save `pr8-docs.png`. Pass when neither mentions `contexts/`, `schema v3`, PIN, or `useAuth().db` as an IndexedDB handle.
- [ ] Lane 8. Skip. The operator trimmed this PR to three live lanes on 2026-09-23. Original scenario follows. Backend down. Stop the backend and reload the app. Save `pr8-backend-down.png`. Pass when the error boundary renders with Retry and no uncaught exception appears in the console.
- [ ] Lane 9. Skip. The operator trimmed this PR to three live lanes on 2026-09-23. Original scenario follows. Bundle. Run `pnpm build` at trunk and at head and open `dist/assets`. Save `pr8-bundle.png`. Pass when the head main chunk is smaller than trunk's.
- [ ] Lane 10. Skip. The operator trimmed this PR to three live lanes on 2026-09-23. Original scenario follows. CI. Open every check for the head SHA. Save `pr8-ci-green.png`. Pass when `Backend tests`, `Playwright E2E`, and `Create Lesson` are all `success`.

**Verify, perf.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked.

- [ ] Metric. Total JavaScript bytes in `frontend/dist/assets` after `pnpm build`, and `pnpm test` wall time, at trunk and at head.
- [ ] Probe. `pnpm build && du -cb dist/assets/*.js | tail -1` and `time pnpm test`, three runs per side, alternating trunk and head.
- [ ] Baseline. Record the trunk bytes and trunk test time first.
- [ ] Rule. Head bytes fail when they exceed trunk bytes by 1 byte or more. Head test time fails when it exceeds trunk by more than 10 percent.

**Review gate.** None. PR8 is not review-gated.

**Merge.**

- [ ] Root's clean verdict at the exact head SHA.
- [ ] Bugbot triage done.
- [ ] After the verdict, the root uses Shipping step 4 to move the PR onto PR7's exact tip. Record the current landing SHA. Preserve the verdict only when the patch ID stays unchanged.
- [ ] The root appends PR8 as the top of the frozen stack. The operator lands it last, in the same sitting as the rest. Same-repository child PRs target parent branches. Fork child PRs target trunk while retaining local parent ancestry.

## Close the program

- [ ] Every box above is checked with its evidence.
- [ ] Reply to the operator with the report the execution playbook names. Links to the stack root and tip, a one-line verdict per link, and anything parked or excluded with the reason.

## Appendix A. Prototype evidence

Both prototypes live on branch `proto/server-backend-2026-09-23` at SHA `15c506f54411c72f2e03a8de4d56edaf8b374a46` in this repository. The branch holds `proto/proto_auth.py`, `proto/proto_range.py`, and the `backend/pyproject.toml` and `backend/uv.lock` changes. The worktree was removed. The code is throwaway and is not the shape of the real build.

Question one. Does `fastapi-users` with JWT bearer access and refresh tokens install and resolve against `backend/pyproject.toml`? Yes. `uv add "fastapi-users[sqlalchemy]>=14" "sqlalchemy[asyncio]>=2.0" "asyncpg>=0.30" "alembic>=1.13" "aiobotocore>=2.15" "cryptography>=43"` resolved in one pass with the existing `fastapi>=0.115`, `pydantic-settings>=2.7`, `openai==2.6.0`, and `livekit-api>=1.1.0`. Resolved versions were

```
fastapi==0.135.1
starlette==0.52.1
pydantic==2.12.5
pydantic-settings==2.13.1
fastapi-users==15.0.5
fastapi-users-db-sqlalchemy==7.0.0
sqlalchemy==2.0.54
asyncpg==0.31.0
alembic==1.20.0
aiobotocore==3.9.1
botocore==1.43.75
cryptography==46.0.7
pyjwt==2.12.1
pwdlib==0.3.0
openai==2.6.0
livekit-api==1.1.0
```

`proto/proto_auth.py` ran against a throwaway `postgres:16-alpine` container through `asyncpg`, created the fastapi-users table with `Base.metadata.create_all`, and exercised two `JWTStrategy` instances with different secrets and audiences plus a `/auth/jwt/refresh` route that reads the refresh token and mints a new pair. Output was

```
register 201
login-pair 200
me with access token 200 {'id': 'b47b38f5-2447-46af-9763-ae1e9c02cfa9', 'email': 'proto-b974c3@example.com'}
me with refresh token (expect 401) 401
refresh 200
me with refreshed access token 200
refresh with an access token (expect 401) 401
[proto] forgot-password hook fired for proto-b974c3@example.com, token prefix eyJhbGciOiJI
forgot-password 202
me without token (expect 401) 401
stock login with wrong password (expect 400) 400
```

PyJWT printed `InsecureKeyLengthWarning` for the 19 and 20 byte prototype secrets. PR2 therefore requires 32 character secrets.

Question two. Does a FastAPI `StreamingResponse` that proxies an HTTP Range request to MinIO return 206 correctly? Yes, against a real `minio/minio` container, not a file stand-in. `proto/proto_range.py` uploaded a 1 MiB random object with `aiobotocore`, then served it through a route that parses the `Range` header, calls `get_object(Range=...)`, and streams `Body.iter_chunks(65536)`. Output was

```
no Range: 200 len 1048576 ok Accept-Ranges bytes type video/mp4
bytes=100-199: 206 bytes 100-199/1048576 len 100 ok
bytes=1048000-: 206 bytes 1048000-1048575/1048576 len 576 ok
bytes=-500: 206 bytes 1048076-1048575/1048576 len 500 ok
bytes=0- (Chromium first video request): 206 bytes 0-1048575/1048576 len 1048576 ok
bytes=2000000- (expect 416): 416 bytes */1048576
missing key (expect 404): 404
```

Every body matched the uploaded bytes for its range. The S3 client had to outlive the response generator, so the real build keeps one client on `app.state.s3` for the process lifetime, as PR1 specifies.

Not prototyped, and therefore unproven. The Alembic async `env.py` against this codebase. The pytest fixture against a Postgres service container in GitHub Actions and the MinIO `docker run` step there. Fernet round trips with `SHADOWLEARN_ENCRYPTION_KEY`. RFC 8785 parity between `JSON.stringify` with sorted keys and `rfc8785.dumps` for this data, which PR7 pins with a checked-in fixture. `hash-wasm` streaming SHA-256 over `blob.stream()` for a 60 MB video in the browser. The LiveKit agent's server-to-server key fetch across the offshore network path. SMTP delivery through `smtplib`. `<video>` Range requests with `?token=` through the production nginx with `proxy_buffering off`. `DefaultChatTransport` with a custom `fetch` that refreshes tokens mid-stream. Vercel preview origins against the CORS allowlist.

## Appendix B. Alternatives rejected

A hosted BaaS such as Supabase or Firebase. The operator decided against it before this plan. The existing FastAPI app already owns the pipeline, the providers, and the LiveKit integration, so a second backend would split ownership of every request.

Full normalization of the 32 IndexedDB stores into relational tables. Rejected because every store already has a stable TypeScript shape and one helper module. One table per store with a JSONB `data` column plus the columns that IndexedDB indexes today keeps every `frontend/src/db/index.ts` helper signature, lets the importer do one bulk upsert per store, and lets Pydantic validate at the boundary. Normalizing would touch about 40 consumer files for no query the app makes. Server-generated entities, lessons, segments, jobs, and media, get typed columns because the server writes them and queries them by column.

Cookie sessions. Rejected because the frontend on `*.vercel.app` is cross-site to `learning.matrixforce.tech:8444`, so cookies would need `SameSite=None` and per-preview CORS with credentials. Bearer access tokens with refresh tokens keep CORS credential-free.

Opaque server-side sessions instead of JWT refresh tokens. Rejected because fastapi-users ships JWT strategies and the prototype showed the pair pattern in a few lines. Revocation on password reset comes from the `token_version` claim instead of a session table.

Keeping a request-body key override next to server-held keys. Rejected because two paths for the same secret is the bug the migration removes, and a leaked key in a body is now a 422.

Passing the Google key through LiveKit participant metadata, which is what `speak/router.py:142` does today. Rejected because the key rides in a JWT the browser holds. The agent fetches it server-to-server with the shared internal token instead, in the same PR that removes the metadata field.

Presigned MinIO URLs handed to the browser. Rejected because MinIO is private and reached only by the backend. The backend streams with Range support, proven in Appendix A, and authorizes with a short-lived media token because `<video>` cannot send headers.

One PR for the frontend cutover. Rejected because about 40 consumer files, the 93 exported helpers in `frontend/src/db/index.ts` (count them with `awk '/^export (async )?function/{n++} END{print n}' frontend/src/db/index.ts`) plus the feature adapters, and two areas of the app, lessons and media on one side and study, speak, and tips on the other, would leave ten lanes covering too little. The split costs one mechanical `db.legacy.` rename that PR6b removes, and buys twenty lanes plus a verified media player before the study screens move.

Splitting PR4 by domain. Rejected because the 19 stores share one mechanism, a `StoreSpec` registry that generates the tables and the routes. Three PRs would repeat the same code review three times.

Dual writes to IndexedDB during the transition. Rejected because offline support is dropped and two sources of truth would make the manifest meaningless.

A hand-rolled canonical JSON on the Python side. Rejected in favor of the `rfc8785` package, because float formatting is where a hand-rolled serializer diverges from `JSON.stringify`, and a checked-in parity fixture pins the pair.

WebCrypto `crypto.subtle.digest` for media hashes. Rejected because it needs the whole blob in one `ArrayBuffer`. `hash-wasm` hashes `blob.stream()` incrementally.

Keeping the refresh token in memory only. Rejected because every reload would log the user out. `localStorage` is the trade, and Appendix C names the risk.

Deleting `frontend/src/shared/lib/crypto` outright in PR8, as the operator's list reads. The importer still needs `decryptKeys` to read stored keys, so PR8 moves that one function into `frontend/src/features/migration/legacyCrypto.ts` and deletes the directory. The write half, `encryptKeys`, goes.

## Appendix C. Risks

Cost abuse through the unlimited env-key fallback, PR3. Any account with no keys spends the operator's OpenRouter, Azure, and Google credit. The mitigation is the per-account rate limit and the `provider_usage` table. The owner watches `select user_id, count(*) from provider_usage where source='env' group by 1 order by 2 desc` after each lane and the operator decides later whether a quota follows.

Refresh token in `localStorage`, PR2. An XSS in the frontend would read it. The mitigation is the 30 day lifetime, the `token_version` revocation on password reset, and the existing sanitization of rendered markdown. The owner watches for any `dangerouslySetInnerHTML` in the diff.

Media token in the URL, PR5. The `?token=` appears in access logs and browser history. The mitigation is the 10 minute lifetime and audience scoping to one media id. The owner masks the query string in the uvicorn access log format.

Canonicalization parity, PR7. If the browser and the server hash differently, every import shows a mismatch and no data is deleted, which fails safe but blocks every user. The fixture test in `test_canonical_parity.py` is the guard. The owner adds any new value shape the fixture lacks before the review gate.

Singleton merges change visible numbers, PR4 and PR7. A second device sums session counts and keeps the server's settings. The modal states this on the Explain step. The owner watches lane 8 of PR7 for a merged value the operator would not expect.

Vercel auto-deploys `main`, whole program. A landed PR2 without PR6a would show a login screen in front of an IndexedDB app that still works, but a landed PR6a without PR7 would show empty libraries to every existing user. This is why the stack lands together and why the operator lands all nine in one sitting.

Server data is now the only copy, PR1 onward. Postgres and MinIO volumes on the VPS hold everything. PR1 documents `pg_dump` and `mc mirror` commands, and the operator schedules them before PR7 lands. The owner watches disk usage on the VPS as media accumulates, because uploads allow 2 GB files.

Long uploads through nginx, PR5. `proxy_read_timeout 300s` and `proxy_send_timeout 300s` in `docs/deployment_guideline.md` cut a 2 GB upload on a slow uplink. The owner adds `client_body_timeout` and raises the send timeout in the guideline and tests lane 10 through a local nginx with the production values.

GitHub Actions service containers cannot set a command, PR1 and PR6a. MinIO needs `server /data`, so the workflows start it with `docker run`. The owner watches the wait loop in the CI log.

The Dockerfile copies only `app/`, PR1. Alembic would be missing in the image. PR1 copies `alembic.ini` and `alembic/` and lane 2 boots from the image.

Single uvicorn worker, PR3 and PR5. The in-memory rate limiter and `asyncio.create_task` background jobs assume one process, as `job_store.py` already states. A restart resets limits and fails running jobs, which PR5 marks as `server restarted`. Moving to workers later needs a shared limiter and a queue. The owner keeps the compose command at one worker.

LiveKit agent reaches the backend across the offshore path, PR3. The agent runs on the offshore host and now calls the China-side backend once per session. A blocked or slow path fails the session start. The owner sets a 5 second timeout with one retry in the agent and watches lane 7.

Vercel preview deployments, PR2. Each preview has a unique origin that the exact allowlist rejects. `SHADOWLEARN_FRONTEND_ORIGIN_REGEX` can admit `https://.*\.vercel\.app`, which also admits every other Vercel site. The operator chooses per environment.

Users who skip the PIN, PR7. Their keys stay encrypted in a database the modal then deletes. The Skip button says so, and the banner after Done points to Settings. The owner keeps the Skip confirmation text explicit.

Dropped stores, PR7. `agent-logs`, `chats`, `tip-chats`, `tip-courses`, and the derived caches are not imported. `chats` and `tip-chats` have zero production call sites today and `threads` holds the live history. The owner confirms the zero counts with the store inventory script before the review gate.

Browser memory during export, PR7. Reading a 60 MB video from IndexedDB is one `Blob` and hashing it streams, but uploading through `fetch` with `FormData` buffers it. Lane 9 covers 60 MB. Larger videos are bounded by the 20 minute lesson limit in `settings.max_video_duration_seconds`.

Every backend router requires auth from PR2, PR2. Any external caller of the API, such as a script the operator runs, needs a token. The owner lists the routes in the PR body.

No driver skill for the LiveKit agent process, PR3. Lane 7 drives it through the browser speak session and reads its container log, which is the only way to drive it.

## Appendix D. Links and reading list

Read before editing. `frontend/src/db/index.ts` lines 179 to 286 for the schema and 290 to 540 for the upgrade history. `backend/app/job_store.py` for the job contract every feature relies on. `backend/app/settings.py` for the `SHADOWLEARN_` prefix and the existing `frontend_origin_allowlist`. `backend/livekit_agent/http_server.py` for the internal token pattern PR3 mirrors. `docs/deployment_guideline.md` step 7 for the nginx limits. `.github/workflows/e2e-tests.yml` for the pnpm and Playwright setup PR6a extends. `frontend/tests/e2e/support/idb-helpers.ts` for the seeding shape PR6a replaces and PR7 reuses in `legacy-seed.ts`. The store inventory script at `/tmp/claude-1000/-home-ross-geller-Projects-personal-shadowing-companion/80afbdc9-7100-4012-9104-49d7d827e9c9/scratchpad/stores.sh`, run with `FRONTEND=<repo>/frontend`, lists helpers and call sites per store.

External references. fastapi-users documentation on the JWT strategy, the SQLAlchemy adapter, and the reset-password router. SQLAlchemy 2 asyncio documentation. The Alembic async template from `alembic init -t async`. aiobotocore `get_object` and `StreamingBody.iter_chunks`. RFC 8785 JSON Canonicalization Scheme and the `rfc8785` package on PyPI. `hash-wasm` `createSHA256` on npm. MinIO documentation on bucket policies and `mc mirror`. RFC 9110 section 14 for Range requests and 206, 416 semantics.

Skills per PR. PR6a, PR6b, and PR7 owners run `skills/how/SKILL.md` on `AuthContext.tsx`, `db/index.ts`, and the consumer graph before editing. PR2, PR3, and PR7 owners run `skills/interrogate/SKILL.md` on their diff before the review gate, because they hold the auth, secret, and deletion paths.

Trail. Every owner keeps `decisions.tsv` per `skills/show-me-your-work/SKILL.md`, one row per decision with what, why, evidence, and result, uncommitted, and returns it in the merge-ready report. The root keeps its own trail for topology writes.

Where this plan lives. `.gitignore` line 50 ignores `/docs/` as local-only dev docs, and `docs/deployment_guideline.md` is untracked. The nine files under `docs/superpowers/` are tracked because they were force-added. To keep this plan in history, run `git add -f docs/plans/2026-09-23-server-backend-migration.md`. Otherwise it lives only on this machine.
