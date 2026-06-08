# BRD Insight — Architecture & Tech Stack

> Internal tool for tracking Business Requirements Documents (BRDs), bugs, sprint
> planning, and AI-assisted architectural impact analysis against the QStrike /
> ProLook **customizer-core** codebase.

---

## 1. Overview

**BRD Insight** is a single-page React application backed by an Express + SQL Server
API. It helps the team:

- Track BRDs, bugs, T-shirt sizing, tech leads, dev assignees, and PM notes.
- Visualise delivery across quarters, sprints, BAs, and a workflow board.
- Maintain an **AI Knowledge Base** about the customizer system.
- Run **AI-assisted analysis** of a BRD to predict which real files, functions,
  and product features in the customizer-core repo will be affected.
- Render live **PixiJS 2D** and **Three.js 3D** previews of uniform styles via
  the `@qstrike/builder` package.

```
┌──────────────────────────────────────────────────────────────────────┐
│                          Browser (SPA)                                 │
│   React 19 + Vite + Tailwind v4                                        │
│   ├─ Dashboard / BRDs / Quarter / BA / Workflow / Reports             │
│   ├─ AI Analyzer (KB + Affected-Module scan)                          │
│   ├─ Garment Zone Simulator (PixiJS)  →  3D View (Three.js)           │
│   └─ SQL Explorer / Settings (Google OAuth)                           │
└───────────────────────────────┬──────────────────────────────────────┘
                                 │  fetch  /api/*   (Vite proxy → :3001)
┌───────────────────────────────▼──────────────────────────────────────┐
│                    Express API  (server.js, ~3000 LOC, 55 routes)      │
│   ├─ CRUD: brds, bugs, criteria, team-leads, tshirt-sizes, kb, …      │
│   ├─ AI:  /ai/analyze  ·  /ai/analyze-affected-modules  ·  /ai/render-3d│
│   │       provider fallback → Gemini → OpenAI → Anthropic → local     │
│   │       + SHA-256 result cache (ai_analysis_cache)                  │
│   ├─ Google Docs OAuth2 (read private BRD spec docs)                  │
│   └─ Reads customizer-core repo files for code-block extraction       │
└──────┬───────────────────────────────┬───────────────────────────────┘
       │ mssql                          │ https
┌──────▼─────────┐         ┌────────────▼─────────────┐  ┌───────────────┐
│  SQL Server    │         │  AI providers            │  │ customizer-   │
│  (brd_tracker) │         │  Gemini / OpenAI / Claude│  │ core repo     │
│  10 tables     │         │  + Google Drive API      │  │ (local files) │
└────────────────┘         └──────────────────────────┘  └───────────────┘
```

---

## 2. Tech Stack

> For the full breakdown — what each technology is, **why it was chosen**, how
> it's used here, and alternatives considered — see [`TECH_STACK.md`](./TECH_STACK.md).

### Frontend
| Layer | Technology | Notes |
|-------|-----------|-------|
| UI framework | **React 19** | Function components + hooks, no router (tab-based SPA) |
| Build tool | **Vite** | Dev server + HMR, `@vitejs/plugin-react` |
| Styling | **Tailwind CSS v4** | Via `@tailwindcss/vite`, dark-mode support |
| Charts | **Recharts** | Quarter/BA reports and dashboards |
| 2D rendering | **PixiJS 7** (`pixi.js-legacy`) | Garment Zone Simulator (WebGL + Canvas2D fallback) |
| 3D rendering | **Three.js** | 3D uniform preview (cylinder-wrapped multi-view) |
| Uniform engine | **@qstrike/builder** | Loads & renders real brand-style uniforms |
| Docs/exports | **jsPDF**, **mammoth**, **xlsx**, **html2canvas** | PDF / Word / Excel export, .docx import |
| Dev/test | **Playwright**, **ESLint** | Headless UI verification, linting |

### Backend
| Layer | Technology | Notes |
|-------|-----------|-------|
| Runtime | **Node.js** (ESM) | `"type": "module"` |
| HTTP | **Express** + **cors** | 55 REST routes |
| Database | **SQL Server** via **mssql** | Named-instance & Windows-auth support |
| Config | **dotenv** | All secrets in `.env` (git-ignored) |
| AI SDKs | **@anthropic-ai/sdk** + REST | Anthropic SDK; OpenAI & Gemini via `fetch` |

### External services
- **Google Gemini** (primary AI) + **Nano Banana** image model for 3D AI renders.
- **OpenAI** and **Anthropic Claude** as automatic fallbacks.
- **Google Drive API** (OAuth2) for reading private Google Docs BRD specs.
- **QStrike QX7 / Vectorsoft staging APIs** consumed by `@qstrike/builder`.

### Exact versions (from `package.json`)

Runtime: **Node.js v20.20** · ES Modules (`"type": "module"`)

#### Dependencies
| Package | Version | Used for |
|---------|---------|----------|
| `react` / `react-dom` | `^19.2.4` | UI framework (hooks, function components) |
| `vite` | `^8.0.1` | Dev server, HMR, production bundler |
| `@vitejs/plugin-react` | `^6.0.1` | React Fast Refresh + JSX transform |
| `tailwindcss` + `@tailwindcss/vite` | `^4.2.2` | Utility-first styling (v4, Vite plugin) |
| `recharts` | `^3.8.1` | Dashboard & quarter/BA charts |
| `pixi.js` + `pixi.js-legacy` | `^7.4.3` | 2D garment canvas (WebGL + Canvas2D fallback) |
| `three` | `^0.184.0` | 3D uniform preview |
| `@qstrike/builder` | `file:` (local 2.15.2) | Loads/renders real brand-style uniforms |
| `jspdf` | `^4.2.1` | PDF report generation |
| `mammoth` | `^1.12.0` | `.docx` → text import for BRD specs |
| `xlsx` | `^0.18.5` | Excel import/export |
| `html2canvas` | `^1.4.1` | DOM → image capture |
| `date-fns` | `^4.1.0` | Date math/formatting |
| `express` | `^5.2.1` | HTTP API server |
| `cors` | `^2.8.6` | Cross-origin for the API |
| `mssql` | `^12.2.1` | SQL Server driver |
| `dotenv` | `^17.3.1` | Env/secret loading |
| `@anthropic-ai/sdk` | `^0.88.0` | Claude API client (OpenAI/Gemini via `fetch`) |
| `sql.js` | `^1.14.1` | In-browser SQLite (SQL Explorer helper) |

#### Dev dependencies
| Package | Version | Used for |
|---------|---------|----------|
| `concurrently` | `^9.2.1` | Run API + UI together (`dev:full`) |
| `eslint` | `^9.39.4` | Linting (+ react-hooks / react-refresh plugins) |
| `playwright` | `^1.60.0` | Headless browser checks of the UI |

> `@qstrike/builder` is installed as a **local file dependency** pointing at the
> sibling `laravel-docker` checkout, since it is a private GitHub Packages module.
> It transitively pulls in the QStrike uniform/core/pixi-wrapper packages.

---

## 3. Repository Layout

```
brd-tracker/
├─ server.js                  # Express API + SQL schema + AI orchestration (single file)
├─ .env / .env.example        # Secrets (ignored) / template
├─ vite.config.js             # Dev server + /api proxy to :3001
├─ src/
│  ├─ main.jsx                # React entry
│  ├─ App.jsx                 # Shell: sidebar nav, tab routing, data loading
│  ├─ components/             # One file per page / feature
│  │   ├─ Dashboard, BRDList, BRDDetail, BRDForm, BugForm
│  │   ├─ QuarterView, QuarterReport, BAPage, WorkflowPage, PMNotesPage
│  │   ├─ TShirtSizePage, *Settings (Criteria/TeamLead/TShirt/DevMember)
│  │   ├─ KnowledgeBasePage           # AI KB CRUD + BRD analysis
│  │   ├─ AnalyseAffectedModule.jsx   # Affected-module scan + exports
│  │   ├─ GarmentZoneSimulator.jsx    # PixiJS uniform render
│  │   ├─ Garment3DView.jsx           # Three.js 3D + AI photo render
│  │   ├─ GoogleSettings.jsx          # Google OAuth connect/test
│  │   └─ SQLExplorer.jsx             # Raw SQL console
│  └─ utils/
│      ├─ db.js               # API client (thin fetch wrapper) + fmtTitle
│      ├─ constants.js        # Default criteria, T-shirt sizes
│      ├─ pdfGenerator.js     # jsPDF helpers
│      └─ excelExport.js      # xlsx helpers
└─ docs/
   └─ ARCHITECTURE.md         # (this file)
```

**Design choice:** the backend is intentionally a **single `server.js`** — schema
creation/migration, all CRUD, AI orchestration, and OAuth live together for an
internal tool that prioritises easy reading over micro-modularisation.

---

## 4. Data Model (SQL Server — `brd_tracker`)

Tables are auto-created and migrated on server start (`init()` in `server.js`):

| Table | Purpose |
|-------|---------|
| `brds` | Core BRD records (title, description, quarter/year, sprint, status, size, tickets, dev assignees) |
| `bugs` | Bugs linked to a BRD (`FK brdId`), severity, criteria, root cause, story ticket |
| `bug_criteria` | Configurable bug-classification taxonomy (seeded defaults) |
| `team_leads` | Available tech leads |
| `brd_tech_leads` | Many-to-many BRD ↔ tech lead with expertise + ordering |
| `tshirt_sizes` | Sizing scale (XS–XXL) with day ranges, risk, colour (seeded) |
| `dev_members` | FE/BE developers |
| `knowledge_base` | AI context entries (category + markdown content) |
| `ai_analysis_cache` | SHA-256-keyed cache of AI analysis results |
| `pm_notes` | PM planning notes linked to BRDs/quarters |

Seeding runs only when a table is empty; column additions use idempotent
`IF NOT EXISTS … ALTER TABLE` guards so existing databases migrate forward safely.

---

## 5. Key Subsystems

### 5.1 AI Analyzer
Two endpoints power the AI features, both with the same resilience pattern:

- **`POST /api/ai/analyze`** — scores a BRD's quality/risk against the Knowledge Base.
- **`POST /api/ai/analyze-affected-modules`** — maps a BRD to the real customizer
  files, functions, product features, and extracted code blocks it will affect.

**Provider fallback chain** (`runAnalysisWithFallback`):
```
configured provider (Gemini) → OpenAI → Anthropic → local rule-based
```
Each provider is tried in order; on quota (429), overload (503), or error it
advances to the next. Within Gemini, a **model chain** is also tried
(`gemini-2.5-flash → 2.5-flash-lite → 2.0-flash → flash-latest`).

**Result cache** (`ai_analysis_cache`): a SHA-256 hash of all inputs (BRD fields,
bugs, tech leads, KB content, document text) keys a persistent cache, so identical
input always returns identical output instantly and without spending AI quota.

**Codebase awareness:** the affected-module prompt embeds a **91-module registry**
(`CUSTOMIZER_MODULES`) spanning Color, Fabric, Canvas/Stage, Text, Logo,
Embellishment, Pattern, Orders, Cart, Checkout, Saved Designs, Sales-Rep/Dealer,
End-User, and more — plus **live source snippets** read from the local
customizer-core repo (`CUSTOMIZER_REPO_PATH`). It also extracts the actual code
blocks for the affected functions so the report shows real source.

### 5.2 Garment Simulator (PixiJS) & 3D View (Three.js)
- `GarmentZoneSimulator.jsx` loads a real brand-style uniform via `@qstrike/builder`,
  renders all perspectives (front/back/left/right) on a PixiJS canvas, and exposes
  `captureImage()` / `captureAllViews()`.
- `Garment3DView.jsx` merges the four captured perspectives into a seamless
  texture wrapped on a tapered cylinder (Three.js, IBL lighting, ACES tone-mapping),
  with an optional **AI Photo Render** via Gemini's image model.
- Style auto-detection: BRDs mentioning *twill / reversible / stock* swap to the
  matching sample style IDs; reversible shows two uniforms side by side.

### 5.3 Google Docs integration
OAuth2 (`scope: openid email drive.readonly`). Connected via Settings → Google Docs.
`fetchGoogleDocText()` reads private BRD spec docs through the Drive export API and
falls back to the public export URL, with precise error messages naming the
connected account.

### 5.4 Document export
Analysis results export to **PDF** (jsPDF), **Word** (Word-compatible HTML `.doc`),
and a structured **Technical Specification** document — each with affected modules,
functions, concepts, code blocks, and an action plan.

---

## 6. Request / Data Flow

1. `App.jsx` loads all collections on mount via `src/utils/db.js` (thin `fetch`
   wrapper over `/api/*`). Vite proxies `/api` → `http://localhost:3001`.
2. CRUD actions call the API and re-fetch; a background `syncLocalBackup()` keeps
   `brd-local-backup.json` current after BRD create/update/delete.
3. AI analysis posts the BRD + bugs + KB to the server, which checks the cache,
   else fetches any linked Google Doc, builds a codebase-aware prompt, runs the
   provider chain, extracts affected code blocks, caches, and returns JSON.

---

## 7. Running Locally

```bash
# 1. Install
npm install

# 2. Configure — copy the template and fill in real values
cp .env.example .env
#   DB_*           SQL Server connection
#   AI_PROVIDER    gemini | openai | anthropic | auto
#   GEMINI_API_KEY / OPENAI_API_KEY / ANTHROPIC_API_KEY
#   GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET  (optional, for private Google Docs)
#   CUSTOMIZER_REPO_PATH   path to laravel-docker/core/src/customizer-core

# 3. Run API + UI together
npm run dev:full      # API on :3001, Vite UI on :5173
```

> **Note:** `node server.js` does **not** hot-reload — after editing `server.js`,
> restart the backend. Run only **one** `dev:full` instance to avoid stale
> servers fighting for port 3001.

### Scripts
| Script | Action |
|--------|--------|
| `npm run dev` | Vite UI only |
| `npm run server` | Express API only |
| `npm run dev:full` | API + UI concurrently |
| `npm run build` | Production build |
| `npm run lint` | ESLint |

---

## 8. Configuration & Secrets

All secrets live in `.env` (git-ignored; template in `.env.example`):

| Group | Keys |
|-------|------|
| Database | `DB_SERVER`, `DB_PORT`, `DB_NAME`, `DB_TRUSTED`, `DB_USER`, `DB_PASSWORD` |
| Server | `PORT` (default 3001) |
| AI selection | `AI_PROVIDER` (with automatic fallback) |
| Gemini | `GEMINI_API_KEY`, `GEMINI_MODEL`, `GEMINI_IMAGE_MODEL`, `GEMINI_FALLBACK_MODELS` |
| OpenAI | `OPENAI_API_KEY`, `OPENAI_MODEL` |
| Anthropic | `ANTHROPIC_API_KEY`, `ANTHROPIC_MODEL` |
| Google OAuth | `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` |
| Customizer repo | `CUSTOMIZER_REPO_PATH` |

> Secrets must never be committed. `.env`, `.npmrc`, `google-tokens.json`, and
> `brd-local-backup.json` are git-ignored.

---

## 9. Notable Design Decisions

- **Single-file backend** for an internal tool — fast to read and modify.
- **Graceful AI degradation** — provider + model fallback chains, then a
  deterministic local rule-based scanner, so analysis always returns something.
- **Deterministic caching** — identical input ⇒ identical output, saving quota
  and giving consistent reports.
- **Codebase-grounded analysis** — the analyzer reasons against a real module
  registry and live source snippets, not just the BRD title.
- **Idempotent schema migrations** — the app provisions and upgrades its own
  SQL schema on startup, no external migration tool required.
