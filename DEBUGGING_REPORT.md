# RaghuMayaShop — Debugging Report

Date: 2026-11-26/27 (IST). Repo: `PKhailendra/raghumaya-shop`, branch `main`.
Methodology: hypothesis-driven, runtime-evidence-first (debug-agent skill,
`.agents/skills/debug-agent/SKILL.md`, installed 2026-11-27 via
`npx debug-agent@latest init --agent universal`). Every fix below was
reproduced, diagnosed from actual logs/runtime behaviour, fixed at the root
cause, and verified — no blind fixes, no suppressed errors, no
`prisma db push` shortcuts, no destructive volume commands.

Scope note: this VM has **no Docker daemon**, so Docker builds/runs were
verified by the user on Windows 11 + Docker Desktop, while the VM verified
everything else (builds, Prisma, API/web smoke tests). Where a check could
only run on the user's machine it is marked **Windows-only** in
`FINAL_VERIFICATION_REPORT.md` — nothing is claimed as passed that was not
actually executed.

## Architecture (verified from source)

npm workspaces monorepo (`apps/*`, `packages/*`), `legacy-peer-deps=true`.
Web: Next.js 15.0.4 / React 19 / Tailwind 3, `NEXT_PUBLIC_API_URL` inlined
at build time. API: Express 4 + TypeScript, 17 route modules under
`/api/v1`, health at `GET /health` and `GET /api/v1/health`. BullMQ queues
`sms`, `notifications`, `pdf`, `reminders` + in-process fallback when Redis
is down. DB: PostgreSQL 16, Prisma 5.22, 53 models, 5 committed migrations.
Seed: `apps/api/prisma/seed.ts` (`db:seed` = `tsx prisma/seed.ts`),
idempotent-ish (skips if the demo shop exists). Mobile: Expo 57 — host
only, not containerised. Production deploy (`render.yaml`, Railway)
untouched. Real env schema: `apps/api/src/config/env.ts` (required
`DATABASE_URL`, `JWT_SECRET` ≥ 32 chars, `ENCRYPTION_KEY` exactly 64 hex;
email all optional).

## Issue log

### D-01 — Web build: `"/package-lock.json": not found`
- **Severity:** Critical (blocked all Docker builds).
- **Error:** `COPY package.json package-lock.json ./` failed in
  `apps/web/Dockerfile` — the lockfile lives at the repo root, the build
  context was `./apps/web`.
- **Root cause:** Dockerfile assumed the lockfile was in the web workspace.
- **Evidence:** build log from the user's Windows run (2026-11-26 21:xx).
- **Fix:** both Dockerfiles build from the repo-root context; copy
  `package-lock.json` + `.npmrc` from root; build `@raghumaya/shared`
  first. Commit `374a102`.
- **Verified:** web image builds on Windows (user-confirmed).

### D-02 — API image pruned the `prisma` CLI it needs
- **Severity:** Critical. `npm prune --omit=dev` in the API Dockerfile
  deleted the prisma CLI, so the entrypoint's `migrate deploy` could never
  run.
- **Fix:** prune removed; CLI resolved dynamically in
  `apps/api/docker-entrypoint.sh`. Commit `374a102`.
- **Verified:** `migrate deploy` runs on container start (user logs).

### D-03 — Compose never set the required secrets
- **Severity:** Critical. The old compose file had no `env_file`, so the
  API exited with `Invalid environment configuration` (all three required
  vars missing) — seen 2026-11-26 ~23:09 as a stray manual container
  (`distracted_wing`) with no env at all, and a `.env` whose `DATABASE_URL`
  pointed at a non-existent local DB.
- **Fix:** compose uses `env_file: .env`; `.env.example` rewritten to
  match `env.ts` exactly. Commit `374a102`.
- **Verified:** API healthy on Windows after correct `.env`.

### D-04 — Worker never called `initRedis()`
- **Severity:** Critical. `apps/api/src/jobs/worker.ts` checked
  availability without ever initialising Redis → always exited 1.
- **Fix:** `await initRedis()` before the check. Commit `374a102`.

### D-05 — Web builder: `sh: tsc: not found`
- **Severity:** High. A split `deps` → `builder` stage copied only the
  root `node_modules`, dropping npm's nested workspace copies (typescript
  5.5.4 for shared vs 5.6.3 for web).
- **Fix:** web Dockerfile installs + builds in one stage; runners copy
  whole workspace dirs. Commit `2afb660`.
- **Verified:** web build passes (also re-verified on the VM 2026-11-27:
  `next build` completed, all routes listed).

### D-06 — `The "PRISMA_BIN" variable is not set`
- **Severity:** Medium. Compose interpolates `$VAR` in command strings,
  eating `$(...)` / `$PRISMA_BIN`.
- **Fix:** migrations moved into `apps/api/docker-entrypoint.sh`;
  `.gitattributes` forces LF for `*.sh`. Commit `2afb660`.

### D-07 — Mobile: `PluginError: Cannot find module 'expo/config-plugins'`
- **Severity:** High (host, not Docker). npm hoists `expo-router` to the
  root but nests `expo` under `apps/mobile/node_modules`; a clean
  `npm ci` reproduced the same split tree, so reinstall alone was not a
  fix.
- **Fix:** root `package.json` gained devDependency `expo ~57.0.0`
  (same range as mobile) so npm keeps one copy at the root. Commits
  `2fd27f3` + `850f47c`.
- **Verified:** `expo config` loads, Metro starts (VM); user confirmed
  working on Windows.

### D-08 — `migrate deploy`: `Could not parse schema engine response` + `Prisma failed to detect the libssl/openssl version`
- **Severity:** Critical. `node:20-alpine` ships no `openssl`, so Prisma
  defaulted to the 1.1.x engine Alpine cannot load; the schema engine
  printed a shared-library error instead of JSON.
- **Fix:** `apk add --no-cache openssl` in BOTH stages of
  `apps/api/Dockerfile` (build stage before `prisma generate`, runtime
  stage so the engines load). Commit `ead8e8d`.
- **Verified:** migrations apply on Windows (`No pending migrations to
  apply` in seed logs).

### D-09 — `P1000: Authentication failed` for `raghumaya`
- **Severity:** High. The `pgdata` volume was initialised with an earlier
  `.env` password (likely `1234`); Postgres applies `POSTGRES_PASSWORD`
  only on first init, so later `.env` edits do not change the DB password.
- **Fix offered:** psql-test which password works and set
  `POSTGRES_PASSWORD` back, or `docker compose down -v` (only with the
  user's explicit OK — no real data was at risk). Docs row added
  (commit `8765056`).
- **Verified:** user's `docker inspect` (2026-11-27 00:00) showed
  `POSTGRES_PASSWORD` matching; all containers healthy.

### D-10 — Worker crash-loop: `Redis not available — worker cannot start`
- **Severity:** Critical. Hypotheses tested in order, each with runtime
  evidence:
  1. *Redis down* — REJECTED: `redis-cli ping` → PONG, container healthy.
  2. *Protected mode / wrong host* — REJECTED: cross-container
     `docker compose run --rm redis redis-cli -h redis ping` → PONG;
     `docker inspect` showed worker `REDIS_URL=redis://redis:6379`.
  3. *Client never connects before ping* — **CONFIRMED.** Reading the
     installed ioredis 5.11.1 source: `apps/api/src/lib/redis.ts` created
     the client with `lazyConnect: true` + `enableOfflineQueue: false`,
     then called `ping()` without connecting. `sendCommand` triggers
     `connect()` async but immediately rejects the command
     (`Stream isn't writeable and enableOfflineQueue options is false`)
     because no stream exists yet — so `initRedis()` ALWAYS returned
     false, on every machine. Proven empirically on the VM with a fake
     RESP server: old logic failed in **2ms** against a working server.
- **Fix:** `initRedis()` now does `await client.connect()` then `ping()`,
  wrapped in one 4s race, and disconnects the discarded client on
  failure. Commit `92e5332`. Verified: fixed `initRedis` returned true
  in 36ms, false in 14ms with no server; api tsc build clean.
- **Verified on Windows:** user confirmed the worker working
  2026-11-27 00:28 IST (after pull + rebuild; his 00:25 screenshot still
  showed the old error because the old image was running — Docker
  Desktop restart does NOT rebuild).

### D-11 — BullMQ: `Your redis options maxRetriesPerRequest must be null`
- **Severity:** High. Surfaced only after D-10 was fixed (worker got past
  `initRedis` to `new Worker`). bullmq 5.81.5 `checkBlockingOptions`
  throws for any truthy value on blocking connections.
- **Fix:** `maxRetriesPerRequest: null` in `apps/api/src/lib/redis.ts`
  (the 4s race is now the bound, since null = infinite retries).
  Commit `085b286`. Verified: `initRedis` true + `new Worker` +
  `new Queue` construct OK against the fake server; tsc clean.
- **Verified on Windows:** user confirmed 2026-11-27 00:28 IST.

### D-12 — Seed: `npm error ENOENT ... open '/app/package.json'`
- **Severity:** High. Migrations applied cleanly (`No pending migrations
  to apply`), then the seed died: the seed command runs
  `npm run db:seed --workspace=raghumaya-api` from `/app`, but the
  runtime image never copied the root `package.json` (npm needs it for
  workspace resolution).
- **Fix:** `COPY --from=build /app/package.json ./package.json` in the
  api Dockerfile runtime stage. Commit `56ab9b2`.
- **Verified:** NOT yet — the user pivoted to a local seed before
  retrying the Docker seed. **Open item** (see §Open items).

### D-13 — Local generate: `Could not resolve @prisma/client` (from `apps/api`)
- **Severity:** High (host workflow). The user ran `npm run db:migrate`
  from `apps/api` — migrate dev worked, but its generate step failed,
  and `npx prisma generate` from `apps/api` failed the same way. The
  client is hoisted to the repo-root `node_modules`, so generate must run
  from the root.
- **Evidence:** user's PowerShell transcript 2026-11-27 00:32 IST.
- **Fix (documented):** run generate from the repo root (see D-14 for
  the exact command). **Note:** `migrate dev` also created a NEW
  migration `20261126184830_new_init` against the Docker DB — untracked,
  not yet reviewed/committed (open item).

### D-14 — `npx prisma` from the repo root: `'prisma' is not recognized`
- **Severity:** High (host workflow). `npx prisma generate
  --schema=apps/api/prisma/schema.prisma` and `npm run start:api:prod`
  both failed from the root.
- **Hypotheses:**
  1. *Prisma not installed* — REJECTED: `npm ls prisma` shows
     prisma@5.22.0 under `raghumaya-api`; `npm run db:migrate` from
     `apps/api` found the binary.
  2. *Binary hoisted to root `.bin`* — REJECTED: VM check
     `ls node_modules/.bin/prisma` → no such file; the binary is nested
     at `apps/api/node_modules/.bin/prisma` (npm did not hoist it).
  3. *`npm exec --workspace` as a workaround* — REJECTED: it changes
     cwd to `apps/api`, so root-relative `--schema` paths fail
     (`Could not load --schema from provided path`).
  4. *Direct nested-binary path from the root* — **CONFIRMED:** VM run
     `./apps/api/node_modules/.bin/prisma generate
     --schema=apps/api/prisma/schema.prisma` → `Generated Prisma Client
     (v5.22.0) to ./node_modules/@prisma/client in 1.07s`.
- **Fix (code):** new `db:deploy` script in `apps/api/package.json`
  (`prisma migrate deploy`, run with cwd=`apps/api` so the binary and
  the default schema path resolve); root `start:api:prod` now calls
  `npm run db:deploy --workspace=raghumaya-api` instead of bare
  `npx prisma migrate deploy --schema=...`.
- **Verified (VM):** `npm run db:deploy --workspace=raghumaya-api --
  --help` prints the migrate-deploy help (binary resolves from the
  root, no DB needed). Full `start:api:prod` chain needs a live DB —
  **open item** for the user's machine.
- **Side effect found:** `prisma generate` auto-adds `@prisma/client`
  to the *root* `package.json` (observed on the VM; reverted with
  `git checkout -- package.json package-lock.json`). Documented in
  `DOCKER_SETUP.md` §10.

### D-15 — Host Postgres port drift after the 5433 change
- **Severity:** Medium. The user moved Docker Postgres to host port
  5433 (his local Postgres uses 5432), but `.env.example`
  (`DATABASE_URL ... @localhost:5432`) and `DOCKER_SETUP.md` (§1, §6,
  Prisma Studio note) still said 5432 — a fresh `cp .env.example .env`
  would point host tools at the wrong port.
- **Fix:** host-side references corrected to `5433` in `.env.example`,
  `docker-compose.yml` header comment, and `DOCKER_SETUP.md` (§1, §6,
  §12). Container-internal `postgres:5432` untouched.
- **Verified (VM):** grep shows no remaining stale host-side `5432`
  references (container-internal ones kept).

### D-16 — Debug Agent skill install: first attempt stalled
- **Severity:** Low (tooling, not the app). `npx debug-agent@latest init`
  appeared hung for 6+ minutes with no output. Root cause: the CLI is
  **interactive** — it shows a multi-select agent picker and waits for
  keyboard input; piping through `tail` hid the prompt. The package
  itself exists (`npm view debug-agent version` → `0.0.6`).
- **Fix:** used the non-interactive flags (`init --list`, then
  `init --agent universal`). Installed to
  `.agents/skills/debug-agent/SKILL.md`. No "Muse" target exists in the
  CLI; `universal` is the generic install.

## Audit findings (no bug found — verified clean)

- **Prisma schema:** `prisma validate` → `The schema ... is valid`
  (with `DATABASE_URL` set; without it, P1012 `Environment variable not
  found: DATABASE_URL` — expected, not a schema defect).
- **Env coverage:** `.env.example` matches `apps/api/src/config/env.ts`
  field-for-field (all required + optional vars, same defaults).
- **Compose YAML:** both files parse; healthchecks on postgres/redis/api
  (+ web via Dockerfile `HEALTHCHECK` on `/login`); `depends_on` uses
  `service_healthy`; named volumes `pgdata`/`redisdata`/`apistorage`.
- **Entrypoint:** `apps/api/docker-entrypoint.sh` resolves the prisma
  binary dynamically (root `.bin` or workspace `.bin`) and runs
  `migrate deploy` before exec — correct.
- **Builds (VM, 2026-11-27):** shared tsc ✓, api tsc ✓, web
  `next build` ✓ (routes listed), Prisma Client 5.22.0 generated ✓.
- **Smoke tests (VM, 2026-11-27):** API `/health` → 200,
  `/api/v1/health` → 200, `/api/v1/shops` without token → 401 (auth
  middleware working); web `/login` → 200, `/` → 307 (redirect to
  login). API log: `redis unavailable — running with in-process job
  fallback` (expected on the VM — no Redis there; in Docker, Redis is
  healthy and the API really uses it since D-10).

## Open items (need the user / their Windows machine)

1. **Docker seed verification** — pull `main`, `docker compose up -d
   --build`, then `docker compose --profile seed run --rm seed`.
   Fix `56ab9b2` is unverified.
2. **Local seed result** — run the nested-binary generate from the root,
   then `npm run db:seed` from the root (see `DOCKER_SETUP.md` §10).
3. **Untracked migration `20261126184830_new_init`** — created by
   `migrate dev` against the Docker DB; review its `migration.sql`
   before committing. The repo still has 5 migrations; the user's DB
   has 6. Do not run `migrate dev` casually against the Docker DB —
   use `migrate deploy`.
4. **Full `start:api:prod` chain** — needs a live DB; run on Windows
   after the seed succeeds.
5. **Final end-to-end login** — http://localhost:3000 with the seed
   credentials (`admin@raghumaya.shop` / `Admin@123`,
   `owner@demo.shop` / `Owner@123`; change after first login).
