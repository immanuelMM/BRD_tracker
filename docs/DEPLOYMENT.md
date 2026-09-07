# BRD Insight — Deployment & Cloud Readiness

> What has to change to run this app somewhere other than a developer's own
> Mac, and the specific things in the current codebase that are wired to this
> machine and will silently break (or fail outright) elsewhere. Companion to
> [`ARCHITECTURE.md`](./ARCHITECTURE.md) and [`TECH_STACK.md`](./TECH_STACK.md).

**Bottom line:** the app is currently built and configured to run on one
developer's laptop, next to two sibling repos, with a database on the same
network. Two of its features (Google OAuth login, the "Affected Module" AI
analyzer) depend on that specific local arrangement. Everything else — the
BRDs/bugs/sprints tracker itself — is a normal Express + SQL Server app and is
straightforward to deploy once the items below are addressed.

---

## 1. What production/cloud deployment needs

### 1.1 A database the app can reach over the network
- Today `DB_SERVER` defaults to `localhost` and the setup scripts
  (`restart-sql.ps1`, `setup-sqlauth.ps1`) assume a local SQL Server instance.
- For cloud, point `DB_SERVER` at a real hosted SQL Server — **Azure SQL
  Database**, an **Azure SQL Managed Instance**, or a SQL Server container/VM
  reachable from the app's network. `init()` in `server.js` auto-creates the
  database and all 10 tables on first boot, so no manual schema migration is
  needed — just credentials and network access (firewall rule / VNet peering).
- `DB_TRUSTED=true` (Windows Integrated Auth) **will not work** on a Linux
  container or most managed cloud hosts — it requires a domain-joined Windows
  box. Use SQL authentication (`DB_USER` / `DB_PASSWORD`) instead, or Azure AD
  auth if the target is Azure SQL.

### 1.2 A place to run Node
- The Express API (`server.js`) needs a persistent Node 20 process — a
  container (Docker) on any container host (Azure App Service, AWS ECS/App
  Runner, Fly.io, Render, etc.), or a VM. Not a natural fit for pure
  request/response serverless (Lambda-style) because of the long-lived SQL
  connection pool and the SSE-based progress stream (§2's mini-terminal).
- Health check endpoint already exists: `GET /api/health` — wire it into
  whatever platform's readiness/liveness probe.

### 1.3 A build + static-serving step for the frontend
- `npm run build` produces `dist/`. In dev, Vite's own server proxies `/api`
  to `:3001` (`vite.config.js`); **that proxy does not exist in production**.
  Pick one:
  - Serve `dist/` as static files from the same Express app (add
    `express.static('dist')` + a catch-all route), so one origin serves both
    the SPA and the API, or
  - Serve `dist/` from a CDN/static host (S3+CloudFront, Netlify, Azure
    Static Web Apps) and put a reverse proxy / API gateway in front of
    `server.js` for `/api/*`.

### 1.4 Secrets, not a checked-in `.env`
- Every key in `.env.example` (DB creds, `ANTHROPIC_API_KEY`,
  `OPENAI_API_KEY`, `GEMINI_API_KEY`, `GOOGLE_CLIENT_ID/SECRET`) needs to move
  into the cloud platform's secret manager (Azure Key Vault / App Service
  config, AWS Secrets Manager, etc.) rather than a `.env` file on disk.
- **A live `.env` and `google-tokens.json` currently exist in this working
  directory with real values.** Confirm neither is committed to git before
  pushing (both should stay in `.gitignore`) and rotate any key that has been
  shared or exposed.

### 1.5 A public HTTPS domain
- Needed for the Google OAuth2 redirect (see §2.4) and for the app generally
  — Google's OAuth consent flow requires an HTTPS authorized redirect URI in
  production, not `http://localhost`.

### 1.6 Tightened CORS
- `app.use(cors())` currently allows any origin. Fine behind the local Vite
  proxy; on the public internet this should be restricted to the app's own
  production origin.

---

## 2. Local-only dependencies that will NOT work as-is in the cloud

These are the specific things to fix, ranked by how much functionality breaks
if ignored.

### 2.1 Hardcoded paths to sibling repos (`CUSTOMIZER_REPO_PATH`, `QSTRIKE_BUILDER_REPO_PATH`)
- `server.js:77-84` defaults these to
  `/Users/qip-innovation/laravel-docker/core/src/customizer-core` and
  `/Users/qip-innovation/qstrike-builder` — paths that only exist on this
  machine.
- The entire **"Affected Module" AI analyzer** — reading real source files
  (`readRepoFile()`), extracting code blocks, walking the knowledge graph,
  git-blame attribution — reads these repos directly off local disk. In a
  cloud container neither repo exists, so this feature degrades to "no
  matches found" silently rather than erroring loudly.
- To keep this feature working in the cloud: check out read-only copies of
  both repos into the deployed container/VM (or a mounted network volume) at
  build/deploy time, and point the env vars at those paths. This adds real
  operational weight (keeping two extra repos in sync inside the deploy
  pipeline) — worth confirming with the team whether this feature is needed
  in the hosted version at all, or should stay a local-only/dev-only tool.

### 2.2 graphify knowledge graphs (`graphify-out/graph.json`)
- graphify is a CLI (`~/.local/bin/graphify`) run manually against the two
  sibling repos to pre-build `graph.json` files that the analyzer reads for
  richer (call/import/inherit-aware) impact analysis. The app itself never
  invokes `graphify` at runtime — it only reads the file — but that file
  lives inside the sibling repos from §2.1, so it inherits the same problem:
  no sibling repo checkout in the cloud → no graph.json → the analyzer falls
  back to the plain keyword-matching path silently.

### 2.3 `git blame` via `execFileSync('git', …)`
- `server.js:3499` shells out to the `git` binary against
  `CUSTOMIZER_REPO_PATH` to attribute code blocks to their last author/commit.
  Requires (a) `git` installed in the runtime image and (b) the actual `.git`
  history of customizer-core present on disk — not just source files.
  Already fails gracefully (returns `null`) if either is missing, so it's not
  a crash risk, just another piece of §2.1's feature that quietly goes dark.

### 2.4 Google OAuth redirect hardcoded to `localhost`
- `server.js:19`: `GOOGLE_REDIRECT_URI = http://localhost:${PORT}/api/google/callback`.
  This needs to become an env-driven production HTTPS URL (e.g.
  `https://brd-tracker.yourcompany.com/api/google/callback`), and that exact
  URL must be added as an **Authorized redirect URI** in the Google Cloud
  Console OAuth client — the current one only has the localhost URI
  registered.

### 2.5 OAuth tokens persisted to a local JSON file (`google-tokens.json`)
- `saveGoogleTokens()`/`loadGoogleTokens()` read and write this file on local
  disk (`server.js:24-40`). Most cloud runtimes have an ephemeral or
  read-only filesystem (a redeploy or restart wipes it) and/or run multiple
  instances with no shared disk, so tokens would vanish on the next deploy or
  be inconsistent across instances. Move this into the SQL database (there's
  already a connection pool and several tables it could live alongside) or a
  proper secret store.

### 2.6 Local JSON backup file (`brd-local-backup.json`)
- `writeBRDLocalBackup()` writes the full BRD dataset to a local file on every
  create/update as a fire-and-forget safety net (`server.js:13, 787, 934`).
  Same ephemeral-filesystem issue as §2.5, and redundant once the cloud DB has
  its own backup/point-in-time-restore story — this can likely be dropped
  entirely in the cloud deployment rather than replicated.

### 2.7 `@qstrike/builder` — a local filesystem `npm` dependency
- `package.json` declares:
  `"@qstrike/builder": "file:../laravel-docker/core/src/customizer-core/node_modules/@qstrike/builder"`.
  This is a private package installed via a relative path, not the npm
  registry. **`npm install` / `npm ci` will fail in any CI or cloud build
  environment** that doesn't have that exact sibling folder checked out at
  that exact relative location (see `TECH_STACK.md`'s own note on this).
  - The frontend build itself doesn't strictly need the real package —
    `vite.config.js` already aliases `@qstrike/builder` to a local stub
    (`src/lib/qstrike-builder-stub.js`) — but the stub only satisfies Vite's
    bundler; `npm install` still resolves `package.json` and errors first.
  - Fix for cloud CI/build: either get real registry/GitHub-Packages access
    working (the original blocker noted in `TECH_STACK.md`), vendor the
    package into this repo, or make it an optional dependency the install
    step tolerates failing.

### 2.8 Windows-only setup scripts
- `restart-sql.ps1`, `setup-sqlauth.ps1` are PowerShell, for configuring a
  local Windows SQL Server instance. Not invoked by the app itself, so not a
  runtime blocker — just note they're dev-machine tooling, irrelevant once
  the cloud DB is a managed service.

### 2.9 Vite dev proxy
- `vite.config.js`'s `server.proxy['/api'] → http://localhost:3001` only
  applies to `vite dev`. It does nothing for the production build — see
  §1.3 for what replaces it.

---

## 3. Not a blocker, but worth knowing
- **Browser `localStorage`** (theme, saved view, and a one-time legacy-data
  migration in `src/utils/db.js`) is client-side and works fine in the cloud
  as-is — it's just per-browser/per-device, not synced.
- **`sql.js`** (SQLite-in-WASM) only powers the in-browser "SQL Explorer"
  helper; it's not the app's real datastore and needs nothing extra for
  deployment.
- **AI provider fallback chain** (Gemini → OpenAI → Anthropic → local
  rule-based matching) already degrades gracefully without any of the three
  API keys — good default behavior for a first cloud deploy before all keys
  are provisioned.

---

## 4. Estimated cloud costs

Rough monthly/annual costs for running this app in the cloud, split into the
fixed infrastructure spend (compute, database, domain) and the variable
per-request AI spend (§2.1's analyzer). These are **list prices captured
mid-2026** for order-of-magnitude planning, not a quote — actual bills depend
on region, usage, and reserved/savings-plan discounts.

### 4.1 Infrastructure & hosting

Matches the options already named in §1.1–§1.5.

| Item | Cheapest viable option | Typical production option |
| --- | --- | --- |
| Node hosting (§1.2) | Azure App Service **B1 Basic**: ~$13/mo (single instance, no auto-scale) | Azure App Service **S1 Standard**: ~$73/mo (auto-scale, staging slots) |
| Database (§1.1) | Azure SQL Database **Basic**: ~$5/mo (5 DTU, 2 GB — fine for demo/dev data volumes) | Azure SQL Database **S0 Standard**: ~$15/mo (10 DTU, 250 GB) — likely the realistic floor once real BRD/bug/sprint data accumulates |
| Domain (§1.5) | ~$1–15 first year (registrar promo pricing) | ~$12–25/year at renewal (`.com`) — budget the renewal price, not the promo price |
| HTTPS/TLS certificate | Free — Azure App Service issues a free managed certificate for custom domains; Let's Encrypt is the free option on non-Azure hosts | Same — there's no paid tier needed here for a standard app |
| Static frontend hosting (if split from Express per §1.3's second option) | Azure Static Web Apps free tier / Netlify free tier | Usually unnecessary — serving `dist/` from the same Express app (§1.3's first option) avoids this cost entirely |

**Rough floor for a low-traffic production deploy on Azure:** ~$13 (App
Service B1) + ~$15 (SQL S0) + ~$1–2/mo amortized domain ≈ **$30–35/month**,
before any AI provider usage. AWS (ECS/App Runner + RDS), Fly.io, and Render
are the other options named in §1.2/§1.1 — their pricing calculators are the
authoritative source since exact tiers and regions vary; this table is Azure
because §1.1's suggested defaults (Azure SQL, Azure App Service) point there
first.

### 4.2 AI provider costs (Claude / OpenAI / Gemini)

The **"Affected Module" AI analyzer** (§2.1) calls whichever of the three
provider keys is configured, in the fallback order **Gemini → OpenAI →
Anthropic → local rule-based matching** (§3). Cost is billed per request to
whichever provider actually answers, based on the model each `*_MODEL` env var
resolves to (`server.js:376-382`):

| Env var | App default | List price (input / output per 1M tokens) |
| --- | --- | --- |
| `ANTHROPIC_MODEL` | `claude-opus-4-6` | $5.00 / $25.00 |
| `OPENAI_MODEL` | `gpt-4o-mini` | $0.15 / $0.60 (batch: $0.075 / $0.30) |
| `GEMINI_MODEL` | `gemini-1.5-flash` | not listed — see caveat below |
| `GEMINI_IMAGE_MODEL` | `gemini-2.5-flash-image` | separate image-output pricing, not plain per-token — check current Gemini pricing before relying on it |

Gemini fallback chain actually tried at runtime (`server.js:2487`,
`gemini-2.5-flash,gemini-2.5-flash-lite,gemini-2.0-flash,gemini-flash-latest`):

| Model | Input / output per 1M tokens |
| --- | --- |
| `gemini-2.5-flash` | $0.30 / $2.50 |
| `gemini-2.5-flash-lite` | $0.10 / $0.40 |
| `gemini-2.0-flash` | **shut down** — no longer callable |
| `gemini-flash-latest` | alias; resolves to whatever Google currently points it at |

**Before cloud rollout:**
- `GEMINI_MODEL`'s configured default (`gemini-1.5-flash`) is a legacy model
  with no current listed pricing, and the third entry in its own fallback
  chain (`gemini-2.0-flash`) has already been shut down — update
  `GEMINI_MODEL` to `gemini-2.5-flash-lite` (cheapest) or `gemini-2.5-flash`
  before depending on this path in production, rather than relying on the
  chain to skip past dead models correctly.
- Anthropic is priced ~15–30x higher per token than the Gemini/OpenAI options
  here — since it's last in the fallback order it should only be billed on
  requests where both other providers are unavailable or unconfigured; if a
  key is present for all three, most cost exposure is Gemini/OpenAI.
- Per-analysis cost depends on how much repo context (§2.1's code blocks,
  graphify results) gets sent as input tokens — there's no fixed number
  without measuring actual prompt sizes for this codebase. Enable
  usage/budget alerts on each provider's dashboard rather than estimating a
  fixed per-request cost.
- These are list prices captured mid-2026 and change over time — re-check the
  current pricing pages for Anthropic, OpenAI, and Google before finalizing a
  cost budget.

---

## 5. Suggested rollout order
1. Stand up the cloud SQL Server (or Azure SQL) instance; point `DB_SERVER`/
   `DB_USER`/`DB_PASSWORD` at it; let `init()` create the schema.
2. Move all secrets out of `.env` into the platform's secret manager.
3. Fix the `@qstrike/builder` local `file:` dependency so `npm ci` succeeds
   in CI (§2.7) — this blocks the build before anything else matters.
4. Add static-serving/reverse-proxy for `dist/` (§1.3); restrict CORS (§1.6).
5. Decide whether the Affected-Module analyzer (§2.1–2.3) ships in the cloud
   version at all. If yes, add the sibling-repo checkouts to the deploy
   pipeline; if no, feature-flag it off for the hosted build.
6. Move `google-tokens.json` into SQL (§2.5); update the OAuth redirect URI
   to the production HTTPS domain and register it in Google Cloud Console
   (§2.4); drop or replace `brd-local-backup.json` (§2.6).
7. Deploy, point health checks at `/api/health`, then re-test Google OAuth
   login and (if kept) the Affected-Module analyzer end-to-end in the cloud
   environment specifically — both are the two features most likely to look
   fine locally and fail silently once deployed.
