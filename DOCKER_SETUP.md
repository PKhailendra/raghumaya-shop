# RaghuMayaShop — Docker Setup (Windows 11 + Docker Desktop)

Run the whole app — PostgreSQL, Redis, Express API, BullMQ worker, Next.js
dashboard — with one command. No Node, Postgres, or Redis to install on
Windows; Docker provides everything. The mobile app (Expo) is **not** in
Docker — run it on the host, see §11.

## 1. Architecture (verified from source)

| Piece | Tech | In Docker |
| --- | --- | --- |
| Web dashboard | Next.js 15.0.4, React 19, Tailwind 3, shadcn-style components, TanStack Query | `web` — port 3000 |
| API | Express 4 + TypeScript, 17 route modules (`auth`, `shops`, `inventory`, `stock`, `purchases`, `billing`, `customers`, `finance`, `analytics`, `reports`, `subscriptions`, `referrals`, `audit`, `notifications`, `hr`, `expenses`, `admin`) | `api` — port 4000 |
| Background jobs | BullMQ 5 queues: `sms`, `notifications`, `pdf`, `reminders` (in-process fallback when Redis is down) | `worker` (shares the API image) |
| Shared code | `@raghumaya/shared` workspace (Zod schemas, permissions, API constants) — built inside the images | — |
| Database | PostgreSQL 16, Prisma 5.22 ORM, 53 models, 5 migrations | `postgres` — port 5432 |
| Cache / queues | Redis 7 | `redis` — port 6379 |
| Package manager | npm workspaces (`apps/*`, `packages/*`), `legacy-peer-deps=true` (see `.npmrc`) | — |
| Mobile | Expo 57 / React Native — **host only**, not containerised | — |

Production deploy (Railway/Render, `render.yaml`) is untouched by this setup.

## 2. Prerequisites

- **Windows 11** with virtualisation enabled in BIOS (Docker Desktop will tell
  you if it is off).
- **Docker Desktop for Windows** (free): https://www.docker.com/products/docker-desktop/
  - During install, keep **WSL 2** as the backend (default). After install,
    open Docker Desktop once and wait until it says **Engine running** (green).
  - In Docker Desktop → Settings → Resources, give WSL at least **4 GB RAM**
    and 2 CPUs if you can — the web build is the hungriest step.
- **Git** for Windows: https://git-scm.com/download/win
- About **10 GB** free disk (images + Postgres/Redis volumes + build cache).
- No Node.js, PostgreSQL, or Redis needed on Windows for the Docker path.

Check Docker works before going further (PowerShell):

```powershell
docker --version
docker compose version
docker run hello-world
```

## 3. Initial setup

```powershell
git clone https://github.com/PKhailendra/raghumaya-shop.git
cd raghumaya-shop
copy .env.example .env
```

### 3.1 Fill in `.env` — two values you MUST provide

Open `.env` in a text editor. Only two values have no usable default:

| Variable | How to generate it |
| --- | --- |
| `JWT_SECRET` | At least 32 characters. Git Bash: `openssl rand -base64 48`. PowerShell: `[Convert]::ToBase64String((1..48 \| ForEach-Object { Get-Random -Maximum 256 }))` |
| `ENCRYPTION_KEY` | Exactly **64 hex characters** (32 bytes). Git Bash: `openssl rand -hex 32`. PowerShell: `([BitConverter]::ToString((1..32 \| ForEach-Object { Get-Random -Maximum 256 }) -as [byte[]]) -replace '-','').ToLower()` |

Everything else in `.env.example` already has a working local value:

- `POSTGRES_USER=raghumaya`, `POSTGRES_PASSWORD=raghumaya_dev_password`,
  `POSTGRES_DB=raghumaya` — local dev only; change the password if this
  machine is shared.
- `DATABASE_URL` / `REDIS_URL` with `localhost` in `.env` are for commands
  run **on the host**. Inside containers, `docker-compose.yml` overrides
  them to `postgres:5432` / `redis:6379` — you do not need a second file.
- Email (`SMTP_*`, `RESEND_*`, `GMAIL_*`) is **optional**. Leave it blank:
  shop creation still works, the welcome-credentials email is just skipped.
  See `apps/api/.env.example` for the Gmail/Resend/SMTP setup notes.
- `NEXT_PUBLIC_API_URL=http://localhost:4000/api/v1` — this is what your
  **browser** calls, so it stays `localhost`.

Never commit `.env` (it is gitignored and dockerignored). Never invent API
credentials — the only keys in this file are the two you generate above.

## 4. Build and start (production builds)

```powershell
docker compose up -d --build
```

First run takes several minutes (image builds + `prisma migrate deploy`).
After that, plain `docker compose up -d` is fast.

```powershell
docker compose ps            # running containers + health
docker compose logs -f        # all logs (Ctrl+C to stop watching)
docker compose logs -f api    # one service: api | worker | web | postgres | redis
```

Wait for `api` to report `(healthy)`. Then open:

| What | URL |
| --- | --- |
| Web dashboard | http://localhost:3000 |
| API health | http://localhost:4000/health |
| API v1 health | http://localhost:4000/api/v1/health |

### 4.1 Demo data (once)

The seed creates a super admin, a demo shop with products/customers/
invoices, and subscription plans. It skips if the demo shop already exists:

```powershell
docker compose --profile seed run --rm seed
```

Log in with:

- Super admin: `admin@raghumaya.shop` / `Admin@123`
- Demo shop owner: `owner@demo.shop` / `Owner@123`

(Change these passwords after first login — they are demo credentials from
`apps/api/prisma/seed.ts`.)

## 5. Development mode (hot reload) — recommended for coding

```powershell
docker compose -f docker-compose.yml -f docker-compose.dev.yml up --build
```

Differences from the default run:

- `api` runs `tsx watch` from source and migrates on start; edits to
  `apps/api/src` restart it automatically.
- `web` runs `next dev`; edits to `apps/web` hot-reload in the browser.
- Source is bind-mounted (`.:/app`); `node_modules` stay inside the
  containers (Linux-built), so Windows `node_modules` never leak in.
- File watchers use polling (`CHOKIDAR_USEPOLLING` / `WATCHPACK_POLLING`)
  because WSL bind mounts don't always emit filesystem events.
- The same URLs apply: web http://localhost:3000, api http://localhost:4000.

Stop with `Ctrl+C` (foreground) or `docker compose -f docker-compose.yml -f docker-compose.dev.yml down`.

> Note: in dev mode the first start also runs `prisma migrate deploy`, so a
> fresh database is ready without any extra step.

## 6. Database

- Host: `localhost`, port `5432`, database `raghumaya`, user `raghumaya`,
  password = `POSTGRES_PASSWORD` from `.env` (`raghumaya_dev_password`).
- Data lives in the named volume `pgdata` — it survives `docker compose down`
  and container rebuilds. Only `docker compose down -v` (see §9) deletes it.
- Connect from the host with any Postgres client (psql, DBeaver, pgAdmin)
  using the details above.
- Migrations live in `apps/api/prisma/migrations/` (5 migrations). The api
  container applies them on every start (`migrate deploy` — safe, never
  drops data). To apply them from the host instead:

```powershell
npm install
npm run db:migrate --workspace=raghumaya-api   # prisma migrate dev (host DB)
```

### Prisma Studio (database browser)

Run it from the host (needs the host `.env` + a local install). Studio
talks to the Docker Postgres on `localhost:5432` — that is why `.env`
keeps the `localhost` DATABASE_URL:

```powershell
npm install
npx --workspace=raghumaya-api prisma studio
```

Then open http://localhost:5555.

## 7. Everyday commands

```powershell
docker compose up -d --build          # build + start everything
docker compose ps                      # status + health
docker compose logs -f                 # all logs
docker compose logs -f api             # api | worker | web | postgres | redis
docker compose restart                 # restart everything
docker compose restart web             # restart one service
docker compose up -d --build web       # rebuild just the web image
docker compose up -d --build api       # rebuild just the api/worker image
docker compose down                    # stop, KEEP database data
docker compose down -v                 # stop and DELETE all data (see §9)
```

## 8. Logs, restart, rebuild

- `docker compose logs -f api` — follow the API. Startup lines to expect:
  `[server] redis connected` and `[server] RaghuMayaShop API listening on :4000`.
  `redis unavailable — running with in-process job fallback` means Redis
  wasn't reachable; jobs still run inline, but check `docker compose ps`
  (redis should be `healthy`).
- `docker compose restart api` — restarts only the API (migrations re-run,
  safe).
- After pulling new code: `docker compose up -d --build` (rebuilds changed
  images; the api re-runs migrations on start).
- After changing `NEXT_PUBLIC_API_URL`: rebuild web — it is baked into the
  bundle at build time, a restart alone won't pick it up:
  `docker compose up -d --build web`.

## 9. Preserving data / full reset

- **Normal stop keeps everything:** `docker compose down` stops containers
  but keeps the `pgdata`, `redisdata`, and `apistorage` volumes.
- **Full reset (⚠️ DELETES ALL LOCAL DATA — shops, users, products,
  invoices):**

```powershell
docker compose down -v
```

  Only run this when you really want an empty database. Afterwards,
  `docker compose up -d --build` + the seed command (§4.1) start you over.
- Never run `docker volume rm` / `docker system prune -a` casually — those
  delete data outside this project too. The one destructive command in this
  guide is `docker compose down -v`, and only with your say-so.

## 10. Troubleshooting

| Symptom | Fix |
| --- | --- |
| `"/package-lock.json": not found` during the web build | Fixed — both Dockerfiles now build from the repo root, where the lockfile lives. If you still see it, you are on an old checkout: `git pull` and retry. |
| `version is obsolete` warning | Fixed — `version:` was removed from `docker-compose.yml`. Harmless if you see it on an old file. |
| Build context is hundreds of MB / very slow | Fixed — root `.dockerignore` excludes `node_modules`, `.next`, `dist`, `.git`, `.env`. Context is now a few MB. |
| api exits: `Invalid environment configuration: ENCRYPTION_KEY …` | `.env` is missing or `ENCRYPTION_KEY` isn't exactly 64 hex chars. Regenerate it (§3.1) and `docker compose up -d api`. |
| api exits: `Invalid environment configuration: JWT_SECRET …` | `JWT_SECRET` missing or shorter than 32 chars. Regenerate it (§3.1). |
| `docker compose up` fails: `.env` not found / `env_file … not found` | You skipped §3: `copy .env.example .env` in the repo root first. |
| `web` builds but the browser can't reach the API | `NEXT_PUBLIC_API_URL` is baked at build time. Check it in `.env`, then `docker compose up -d --build web`. Default is `http://localhost:4000/api/v1`. |
| Login page loads but login fails | Check `docker compose logs -f api`: if it says `redis unavailable`, check `docker compose ps` — redis must be `healthy`. If the API isn't `healthy`, check its logs for the env error above. |
| `worker` keeps restarting with `Redis not available` | Fixed — a code bug in `apps/api/src/lib/redis.ts`, not a Redis problem: `lazyConnect:true` + `enableOfflineQueue:false` made the first `ping()` reject immediately (`Stream isn't writeable...`) before the connection existed, so `initRedis()` always returned false even with Redis healthy. `initRedis()` now awaits `client.connect()` first (proven on the VM: old logic failed in 2ms against a working server, fixed logic connects in 36ms). A follow-up fix in the same file: BullMQ requires `maxRetriesPerRequest:null` — its Workers use blocking commands and throw otherwise. If you still see either error, `git pull` and rebuild. The API was affected too — it silently used its in-process fallback; it now really uses Redis. |
| Port already in use (`5432` / `4000` / `3000`) | Something else on Windows uses that port (e.g. a local Postgres or an old `npm run dev`). Stop it, or move Docker's service to another host port: in `docker-compose.yml` change only the left side of the mapping (e.g. postgres `"5432:5432"` → `"5433:5432"`), then in `.env` change only the port in `DATABASE_URL` to `localhost:5433` — keep the `raghumaya` user / `raghumaya_dev_password` / `raghumaya` database, and never change the `postgres:5432` inside the containers' URLs. If your own Postgres runs on 5432 (e.g. `postgres:1234@localhost:5432`), leave it alone — it stays on 5432 and Docker's Postgres lives on 5433. Then `docker compose down && docker compose up -d`. |
| `prisma migrate deploy` fails with "database does not exist" | Postgres wasn't healthy yet, or `POSTGRES_DB` in `.env` differs from the database in `DATABASE_URL`. `docker compose logs -f postgres`, then `docker compose restart api`. |
| Seed fails with `npm error ... open '/app/package.json'` | Fixed — the runtime image didn't include the root `package.json`, which `npm run --workspace=...` needs to resolve the workspace. `apps/api/Dockerfile` now copies it into the runtime image. If you still see it, `git pull` and rebuild. |
| `P1000: Authentication failed` for `raghumaya` | The `pgdata` volume was created with an earlier `.env` password — Postgres only applies `POSTGRES_USER`/`POSTGRES_PASSWORD` on first init; editing `.env` later does not change the database's password. Either set `POSTGRES_PASSWORD` in `.env` back to the password from the first run (and match it in `DATABASE_URL`), or wipe the volume with `docker compose down -v` (deletes all local data — do this only if you accept losing it) and `up -d` again. |
| Hot reload doesn't pick up a change (dev mode) | Save the file, wait a few seconds (polling). If still stale, `docker compose -f docker-compose.yml -f docker-compose.dev.yml restart web` (or `api`). |
| `docker` command not found in PowerShell | Docker Desktop isn't installed or isn't running. Install it (§2) and wait for **Engine running**. |
| `sh: tsc: not found` during the web build | Fixed — the web Dockerfile installed in one stage and copied only the root `node_modules` into the builder, but npm nests a second copy of a package when two workspaces need different versions (typescript 5.5.4 vs 5.6.3). Install and build now happen in the same stage. If you still see it, `git pull` and retry. |
| `The "PRISMA_BIN" variable is not set` warning at `up` | Fixed — Compose was eating the `$PRISMA_BIN` in the inline command. Migrations now run from `apps/api/docker-entrypoint.sh` instead of an inline `sh -c` string, so there is nothing for Compose to interpolate. |
| `Could not parse schema engine response` + `Prisma failed to detect the libssl/openssl version` | Fixed — `node:20-alpine` ships no `openssl`, so Prisma defaulted to the openssl-1.1.x engine, which Alpine cannot load (the schema engine then prints `Error loading shared library...` instead of JSON). Both stages of `apps/api/Dockerfile` now `apk add openssl`, so the 3.0.x engines are used. If you still see it, `git pull` and rebuild. |
| Build fails with a network error | Docker needs internet for the first image pull / npm install. Retry; if you are on a restricted network, build once on an open network — later builds use the cache. |
| First build takes ~9 minutes | Normal the first time: the web `npm install` downloads the whole Next toolchain. Later builds reuse the cache and are minutes faster. Don't cancel it mid-install — a half-built layer just rebuilds. |

### The errors this setup fixed (2026-11-26)

The original `apps/web/Dockerfile` used build context `./apps/web` and ran
`COPY package.json package-lock.json ./` — but `package-lock.json` only
exists at the repo root, so the web build died with
`"/package-lock.json": not found`. The same pass also fixed four failures
that would have hit immediately after it: the API image pruned the `prisma`
CLI it needs for `migrate deploy`; the compose file never set the required
`ENCRYPTION_KEY`; the worker never called `initRedis()` so it always exited
1; and there was no root `.dockerignore`, so the web build context was
408 MB of `node_modules`.

A second pass (same day) fixed the next two failures: `tsc: not found` in
the web builder (partial `node_modules` copies across stages drop npm's
nested workspace copies — install and build now share one stage, and both
runners copy whole workspace dirs) and the `PRISMA_BIN is not set` warning
(Compose interpolates `$VAR` in command strings — migrations moved into
`apps/api/docker-entrypoint.sh`).

## 11. Mobile app (not in Docker)

Expo needs a phone/emulator and Metro on the host. **Always install from
the repo root, never inside `apps/mobile`** — see the troubleshooting note
below. From the repo root:

```powershell
npm install
npm run dev:mobile
```

Point it at the Docker API with `EXPO_PUBLIC_API_URL=http://localhost:4000/api/v1`
(or your machine's LAN IP when testing on a physical phone).

### Mobile troubleshooting: `PluginError: Cannot find module 'expo/config-plugins'`

Symptom: `npm run start` in `apps/mobile` dies while loading the Expo
config, with a require stack ending in
`node_modules\expo-router\plugin\build\withRouter.js`.

Cause: a split `node_modules` tree. npm hoists `expo-router` to the repo
root but nests `expo` itself under `apps/mobile/node_modules`, so the
hoisted router can't see `expo/config-plugins`. A clean reinstall alone
does **not** fix it — npm rebuilds the same split tree. This usually comes
from running `npm install` inside `apps/mobile` (or another workspace
folder) instead of the repo root.

Fix (already in the repo — `expo` is pinned as a root devDependency so npm
keeps one copy at the root, where the hoisted router can see it):

```powershell
cd D:\Projects\raghumaya-shop
git pull
npm install          # from the REPO ROOT, not apps/mobile
npm run dev:mobile
```

If the error still appears after that, delete the broken trees and install
once from the root (safe — `node_modules` is regenerable, nothing in it
is source code):

```powershell
Remove-Item -Recurse -Force node_modules, apps\api\node_modules, apps\web\node_modules, apps\mobile\node_modules, packages\shared\node_modules
npm install
npm run dev:mobile
```

Then start Metro with `npm run dev:mobile` from the root. You should see
`Starting Metro Bundler` and `Waiting on http://localhost:8081`.

## 12. Files changed for Docker (2026-11-26)

- `docker-compose.yml` — rewritten: no `version:`, `env_file: .env`,
  correct `DATABASE_URL`/`REDIS_URL` (service names), API + web
  healthchecks, `seed` profile service, named volumes incl. `apistorage`.
  api/seed start via `apps/api/docker-entrypoint.sh` (migrate + exec).
- `docker-compose.dev.yml` — new: hot-reload override (tsx watch + next dev).
- `apps/web/Dockerfile` — rewritten: repo-root context, workspace install,
  builds `@raghumaya/shared` first, `NEXT_PUBLIC_API_URL` as build arg.
  Install + build share one stage (a split stage dropped npm's nested
  workspace `node_modules` and broke with `tsc: not found`); the runner
  copies whole workspace dirs.
- `apps/api/Dockerfile` — fixed: copies `package-lock.json` + `.npmrc`,
  no longer prunes the `prisma` CLI, resolves the prisma binary
  dynamically (npm hoisting puts it in the root or the workspace `.bin`),
  runtime copies the whole `apps/api` dir, API healthcheck.
- `apps/api/docker-entrypoint.sh` — new: `prisma migrate deploy`, then
  execs the given command. `.gitattributes` forces LF endings for `*.sh`
  so Windows checkouts don't break it with CRLF.
- `apps/api/src/jobs/worker.ts` — bug fix: calls `await initRedis()` before
  checking availability (previously always exited 1).
- `package.json` + `package-lock.json` — `expo ~57.0.0` added as a root
  devDependency so npm hoists one copy to the repo root (fixes the mobile
  `expo/config-plugins` error; the Docker api/web filtered installs do
  not pull it in — verified with a scratch filtered install: 174
  packages, no `expo`).
- `.dockerignore` — new: keeps `node_modules`/`.next`/`dist`/`.git`/`.env`
  out of build contexts.
- `.env.example` — rewritten to match the real env schema in
  `apps/api/src/config/env.ts` (stale `JWT_ACCESS_SECRET`,
  `JWT_REFRESH_SECRET`, `S3_*`, `SMS_PROVIDER` removed; required
  `JWT_SECRET` + `ENCRYPTION_KEY` documented with generation commands).
- `DOCKER_SETUP.md` — this file.
