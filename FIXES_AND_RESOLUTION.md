# RaghuMayaShop — Fixes & Resolution

Companion to `DEBUGGING_REPORT.md` (issue IDs D-01…D-16). This file records
what was changed, why the change is the right one, and what is still
limited. Full setup instructions live in `DOCKER_SETUP.md`.

## Resolved issues

### Docker build & compose (D-01, D-02, D-03, D-05, D-06)
**Why it happened:** the Dockerfiles were written against an assumed
layout (lockfile in the web workspace, prisma CLI surviving a prune,
secrets present without `env_file`) that did not match the real monorepo.
**What changed:**
- Both Dockerfiles build from the **repo-root context** and copy
  `package-lock.json` + `.npmrc` from the root; `@raghumaya/shared` is
  built before the apps that depend on it.
- `npm prune --omit=dev` removed from the API Dockerfile — the prisma
  CLI is a devDependency and is needed at runtime for `migrate deploy`.
- Compose uses `env_file: .env`; only `DATABASE_URL`/`REDIS_URL`/
  `CORS_ORIGINS` are overridden to Docker service names.
- Web install + build share one stage (a split stage dropped npm's nested
  workspace `node_modules` and broke with `tsc: not found`); runners copy
  whole workspace dirs.
- Migrations moved into `apps/api/docker-entrypoint.sh` (Compose eats
  `$VAR` in inline command strings); `.gitattributes` forces LF for
  `*.sh`.
- Root `.dockerignore` keeps the build context to a few MB.
**Why this is correct:** each fix addresses the mechanism that produced
the error (wrong path, pruned binary, missing env, partial module tree,
Compose interpolation) rather than papering over the symptom. No
business logic was touched.

### Prisma on Alpine (D-08)
**Why it happened:** `node:20-alpine` ships no `openssl`, so Prisma fell
back to the 1.1.x engine, which Alpine cannot load; the schema engine
then printed a shared-library error instead of JSON.
**What changed:** `apk add --no-cache openssl` in BOTH stages of
`apps/api/Dockerfile` — the build stage (so `prisma generate` downloads
the 3.0.x engines) and the runtime stage (so the schema + query engines
load at runtime).
**Why this is correct:** it fixes the engine selection at the source
instead of pinning an older engine or switching base images.

### Postgres password (D-09)
**Why it happened:** Postgres applies `POSTGRES_PASSWORD` only when the
`pgdata` volume is first initialised; editing `.env` afterwards changes
nothing in the database.
**What changed:** no code change — the fix is operational (restore the
original password in `.env`, or `docker compose down -v` with explicit
approval). Documented in `DOCKER_SETUP.md` §10.
**Why this is correct:** it respects the data — no volume was deleted
without the user's say-so.

### Worker Redis bugs (D-10, D-11) — the only app-code fixes
**Why it happened:** two independent defects in
`apps/api/src/lib/redis.ts`, both proven with runtime evidence, not
guessed:
1. `lazyConnect: true` + `enableOfflineQueue: false` + `ping()` without
   connecting → ioredis rejects the first command immediately, so
   `initRedis()` ALWAYS returned false, on every machine. Proven with a
   fake RESP server: old logic failed in 2ms against a working server.
2. BullMQ 5.81.5 requires `maxRetriesPerRequest: null` on Workers
   (blocking connections) — surfaced only after (1) was fixed.
**What changed:** `initRedis()` now awaits `client.connect()` then
`ping()`, wrapped in one 4s race, disconnecting the discarded client on
failure; `maxRetriesPerRequest: null` in the same file (the 4s race is
now the bound). `worker.ts` also awaits `initRedis()` before checking
availability (D-04).
**Why this is correct:** it follows the libraries' actual contracts
(ioredis needs a connection before a command; BullMQ needs null
`maxRetriesPerRequest` for blocking connections). Side benefit: the API
was silently on its in-process fallback too — it now really uses Redis.

### Seed image (D-12)
**Why it happened:** the seed runs `npm run db:seed --workspace=...`
from `/app`, and npm needs the root `package.json` (the `workspaces`
field) to resolve that — but the runtime image never copied it.
**What changed:** one `COPY --from=build /app/package.json
./package.json` line in the API Dockerfile runtime stage.
**Why this is correct:** minimal, targeted; `tsx` was already in the
copied `node_modules`.

### Host Prisma workflow (D-13, D-14)
**Why it happened:** npm nests the prisma CLI binary under
`apps/api/node_modules/.bin` (it is not hoisted to the root `.bin`), so
`npx prisma` fails from the repo root, while running generate from
`apps/api` fails because the client is hoisted to the root
`node_modules`. Two opposite cwd requirements, one tool.
**What changed:**
- New `db:deploy` script in `apps/api/package.json`
  (`prisma migrate deploy`, no `--schema` — cwd is `apps/api`, where
  the binary and the default schema path resolve).
- Root `start:api:prod` now runs
  `npm run db:deploy --workspace=raghumaya-api` instead of bare
  `npx prisma migrate deploy --schema=...`.
- Documented the working generate command (nested-binary path from the
  root) in `DOCKER_SETUP.md` §10, including the side effect that
  `prisma generate` auto-adds `@prisma/client` to the root
  `package.json` (revert with `git checkout -- package.json
  package-lock.json`).
**Why this is correct:** the fix uses npm's own workspace mechanics
instead of depending on hoisting behaviour that varies by install.

### Port drift (D-15)
**Why it happened:** the user moved Docker Postgres to host port 5433
(his local Postgres uses 5432), but the template and docs still said
5432.
**What changed:** host-side references corrected to `5433` in
`.env.example`, the compose header comment, and `DOCKER_SETUP.md`.
Container-internal `postgres:5432` untouched.
**Why this is correct:** the template must match the compose mapping,
or a fresh setup points host tools at the wrong port.

### Mobile (D-07)
**Why it happened:** npm hoists `expo-router` to the root but nests
`expo` under `apps/mobile/node_modules`; a clean `npm ci` reproduced
the split tree, so reinstall alone could not fix it.
**What changed:** root `package.json` gained devDependency
`expo ~57.0.0` (same range as mobile) so npm keeps one copy at the
root. Verified: `expo config` loads, Metro starts; user confirmed on
Windows.

### Tooling (D-16)
**Why it happened:** `debug-agent init` is interactive (multi-select
agent picker); piping through `tail` hid the prompt, so the first
attempt looked hung.
**What changed:** installed non-interactively with
`npx debug-agent@latest init --agent universal` → 
`.agents/skills/debug-agent/SKILL.md`. No "Muse" target exists in the
CLI; `universal` is the generic install. The skill's methodology
(hypotheses → runtime evidence → fix → verify) is the one used for
every issue in this report.

## Configuration changes (summary)

| File | Change |
| --- | --- |
| `apps/api/Dockerfile` | `openssl` in both stages; root `package.json` copied into runtime image; no prune of the prisma CLI |
| `apps/web/Dockerfile` | Repo-root context; install + build in one stage; whole workspace dirs copied to runner |
| `docker-compose.yml` | No `version:`; `env_file: .env`; service-name URLs; healthchecks; `seed` profile service; named volumes; entrypoint command; host Postgres port 5433 |
| `docker-compose.dev.yml` | New: hot-reload override (tsx watch + next dev, bind mounts, polling watchers) |
| `apps/api/docker-entrypoint.sh` | New: dynamic prisma-binary resolution, `migrate deploy`, then exec |
| `apps/api/src/lib/redis.ts` | `await client.connect()` before `ping()` (4s race); `maxRetriesPerRequest: null` |
| `apps/api/src/jobs/worker.ts` | `await initRedis()` before the availability check |
| `apps/api/package.json` | New `db:deploy` script |
| `package.json` (root) | `start:api:prod` uses `db:deploy` (no bare `npx prisma`); `expo ~57.0.0` root devDependency (mobile fix) |
| `.env.example` | Rewritten to match `env.ts`; host `DATABASE_URL` port 5433 |
| `.dockerignore`, `.gitattributes` | New: slim contexts; LF for `*.sh` |

## Remaining limitations

- **No Docker daemon on the audit VM** — Docker builds/runs were verified
  on the user's Windows machine, not here. `FINAL_VERIFICATION_REPORT.md`
  separates VM-verified from Windows-only checks.
- **Docker seed fix (D-12) unverified** — needs the user's
  `docker compose --profile seed run --rm seed`.
- **Untracked migration `20261126184830_new_init`** — created by
  `migrate dev` against the Docker DB; review its `migration.sql` before
  committing. The repo has 5 migrations; the user's DB has 6.
- **Full `start:api:prod` chain** — the `db:deploy` step is proven to
  resolve; the migrate → seed → start chain needs a live DB.
- **No unit/integration test suite exists in the repo** — regression
  verification is builds + smoke tests (see the final report). Adding a
  test suite is out of scope for this stabilisation pass.
