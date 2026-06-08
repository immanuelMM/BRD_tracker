# BRD Insight — Tech Stack

A detailed breakdown of every technology in the stack: **what it is**, the
**version** in use, **why it was chosen**, **how it's used here**, and the
**alternatives considered**. For the higher-level system design see
[`ARCHITECTURE.md`](./ARCHITECTURE.md).

**Runtime baseline:** Node.js **v20.20** (LTS), ES Modules (`"type": "module"`).

---

## Stack at a glance

| Layer | Technology | Version |
|-------|-----------|---------|
| UI framework | React + React DOM | `19.2.4` |
| Build / dev server | Vite | `8.0.1` |
| Styling | Tailwind CSS (+ Vite plugin) | `4.2.2` |
| Charts | Recharts | `3.8.1` |
| 2D rendering | PixiJS (+ legacy) | `7.4.3` |
| 3D rendering | Three.js | `0.184.0` |
| Uniform engine | @qstrike/builder | local `2.15.2` |
| PDF / Word / Excel | jsPDF · mammoth · xlsx · html2canvas | `4.2.1 / 1.12 / 0.18.5 / 1.4.1` |
| Dates | date-fns | `4.1.0` |
| API server | Express + cors | `5.2.1 / 2.8.6` |
| Database driver | mssql (SQL Server) | `12.2.1` |
| Config | dotenv | `17.3.1` |
| AI client | @anthropic-ai/sdk (+ OpenAI/Gemini REST) | `0.88.0` |
| Tooling | concurrently · ESLint · Playwright | `9.2.1 / 9.39.4 / 1.60.0` |

---

## Frontend

### React 19 (`react`, `react-dom` — 19.2.4)
- **What:** Component-based UI library.
- **Why chosen:** Mature, ubiquitous, huge ecosystem; hooks give simple local
  state without boilerplate. v19's improved effects/Suspense behaviour suits an
  interactive dashboard. The team already knows React.
- **How used here:** Pure function components + hooks throughout `src/`. A single
  `App.jsx` shell holds top-level state and switches "pages" by an `activeTab`
  string — **no router library** (see alternatives). Refs + `useImperativeHandle`
  bridge React to the imperative PixiJS/Three.js canvases.
- **Alternatives considered:** Vue (the customizer-core itself is Vue 3, but this
  tool is standalone and React was preferred for the dashboard); Svelte/Solid
  (smaller ecosystem for the charting/PDF libs needed).

### Vite 8 (`vite`, `@vitejs/plugin-react` — 8.0.1 / 6.0.1)
- **What:** Front-end build tool and dev server (esbuild/Rollup based).
- **Why chosen:** Near-instant cold start and HMR, zero-config React + JSX,
  trivial dev proxy to the API. Far lighter than a webpack setup.
- **How used here:** `npm run dev` serves the SPA; `vite.config.js` proxies
  `/api/*` to the Express server on `:3001` so the browser talks to one origin.
  `npm run build` produces the production bundle. Tailwind is wired in as a Vite
  plugin.
- **Alternatives considered:** Create React App (deprecated, slow); Next.js
  (SSR/router overkill for an internal tab-based SPA); webpack (heavier config).

### Tailwind CSS v4 (`tailwindcss`, `@tailwindcss/vite` — 4.2.2)
- **What:** Utility-first CSS framework.
- **Why chosen:** Fast iteration with no separate CSS files, consistent spacing
  and colour scales, first-class dark mode. v4's Vite plugin removes the old
  PostCSS config step.
- **How used here:** All component styling is inline utility classes; dark mode
  via `dark:` variants toggled on `<html>`. Gradients/rings/animations power the
  cards, badges, progress bar, and modals.
- **Alternatives considered:** CSS Modules / styled-components (more ceremony);
  a component kit like MUI (heavier, less control over the bespoke look).

### Recharts (`recharts` — 3.8.1)
- **What:** Declarative React charting library on SVG.
- **Why chosen:** React-native API (charts are components), responsive, good
  enough for bar/line/pie dashboards without a D3 learning curve.
- **How used here:** Dashboard metrics, Quarter View, BA View, and Quarter
  Report visualisations.
- **Alternatives considered:** Chart.js (imperative, needs a wrapper); raw D3
  (powerful but far more code); Nivo (heavier bundle).

### PixiJS 7 (`pixi.js` + `pixi.js-legacy` — 7.4.3)
- **What:** Fast 2D WebGL renderer.
- **Why chosen:** It's the renderer `@qstrike/builder` itself uses, so the real
  uniform render pipeline drops straight in. The **`-legacy`** build adds a
  Canvas2D fallback so it still renders on machines/headless envs without WebGL.
- **How used here:** `GarmentZoneSimulator.jsx` mounts a Pixi `Application`,
  loads a brand-style uniform, renders all four perspectives, and exposes
  `captureImage()` / `captureAllViews()` for the 3D step. Pinned to **v7** to
  match the builder's expected API (v8 changed the renderer init).
- **Alternatives considered:** Plain Canvas2D (couldn't reuse the builder's
  pipeline); Konva (not compatible with the builder's Pixi display objects).

### Three.js (`three` — 0.184.0)
- **What:** WebGL 3D engine.
- **Why chosen:** The de-facto standard for browser 3D; rich material/lighting/
  environment support needed for a believable garment render.
- **How used here:** `Garment3DView.jsx` merges the four captured 2D views into a
  single texture wrapped on a tapered cylinder, lit with `RoomEnvironment` IBL +
  ACES tone-mapping, with orbit-style drag/zoom. Loaded via dynamic `import()` so
  the ~150 KB engine isn't in the main bundle.
- **Alternatives considered:** react-three-fiber (nice, but the imperative scene
  is small and self-contained — raw Three.js avoided an extra abstraction);
  Babylon.js (larger, more than needed).

### @qstrike/builder (local file dep — 2.15.2)
- **What:** QStrike's private uniform-rendering engine (loads brand styles, builds
  the Pixi display tree, renders perspectives).
- **Why chosen:** It produces the *real* uniform exactly as the production
  customizer does — essential for an accurate preview and for the affected-module
  analysis to reflect reality.
- **How used here:** `loadUniform()` + `renderUniform()` inside the simulator;
  configured against the QStrike staging QX7/Vectorsoft APIs.
- **Note:** Installed as a **`file:` dependency** pointing at the sibling
  `laravel-docker/core/src/customizer-core/node_modules/@qstrike/builder` checkout,
  because it's a private GitHub Packages module (the npm token approach hit auth
  limits). It transitively pulls the QStrike uniform/core/pixi-wrapper packages.

### Document & data libraries
| Library | Version | What / why / how |
|---------|---------|------------------|
| **jsPDF** | `4.2.1` | Pure-JS PDF generation. Builds the multi-page Affected-Module PDF report (gauge, module list, code blocks, action plan) entirely client-side — no server render needed. |
| **mammoth** | `1.12.0` | `.docx` → plain text. Lets users upload a Word BRD spec; the text feeds the AI analysis. Chosen for reliable Word extraction without a backend converter. |
| **xlsx (SheetJS)** | `0.18.5` | Excel import/export of BRD/bug data. Ubiquitous, handles `.xlsx` round-trips. |
| **html2canvas** | `1.4.1` | DOM → raster capture for image-based exports. |
| **date-fns** | `4.1.0` | Tree-shakeable date math/formatting. Lighter and immutable vs Moment. |

---

## Backend

### Node.js 20 + ES Modules
- **What:** JavaScript runtime.
- **Why chosen:** Same language as the frontend (one mental model, shared JSON
  shapes), v20 is the active LTS. ESM (`import`) keeps syntax consistent with the
  React side.
- **How used here:** Runs `server.js`. `Date.now()`, `crypto`, and `fs` are used
  for IDs, hashing the AI cache key, and reading customizer-core source files.

### Express 5 (`express` — 5.2.1) + cors (2.8.6)
- **What:** Minimal HTTP server framework.
- **Why chosen:** Smallest viable way to expose ~55 REST routes; v5 brings native
  async error handling. `cors` allows the Vite dev origin during development.
- **How used here:** All CRUD, AI, OAuth, query, export, and backup endpoints live
  in one `server.js`. JSON body parsing via `express.json()`.
- **Alternatives considered:** Fastify (faster, but Express's familiarity won for
  an internal tool); NestJS (far too much structure for a single-file API).

### SQL Server via mssql (`mssql` — 12.2.1)
- **What:** Microsoft SQL Server driver for Node.
- **Why chosen:** SQL Server is the team's existing database; `mssql` supports
  named instances and Windows/SQL auth, and parameterised queries guard against
  injection.
- **How used here:** A connection pool created on startup. `init()` auto-creates
  the database and **10 tables**, runs idempotent `IF NOT EXISTS … ALTER TABLE`
  migrations, and seeds defaults. Every query uses typed `.input()` bindings.
- **Alternatives considered:** An ORM (Prisma/Sequelize/TypeORM) — skipped to keep
  the schema explicit and the dependency surface small; SQLite (team standardises
  on SQL Server, though `sql.js` is kept for the in-browser SQL Explorer).

### dotenv (`dotenv` — 17.3.1)
- **What:** Loads `.env` into `process.env`.
- **Why chosen:** Standard, zero-friction secret management; keeps keys out of code.
- **How used here:** All DB creds, AI keys, Google OAuth creds, and the customizer
  repo path. `.env` is git-ignored; `.env.example` documents the keys.

### AI clients — @anthropic-ai/sdk (0.88.0) + OpenAI/Gemini REST
- **What:** Official Claude SDK; OpenAI and Gemini are called via plain `fetch`.
- **Why chosen:** Anthropic ships a typed SDK; OpenAI's `/responses` and Gemini's
  `generateContent` are simple enough to call directly without extra deps. This
  keeps three providers behind one fallback abstraction.
- **How used here:** `runAnalysisWithFallback()` tries the configured provider then
  the others (Gemini → OpenAI → Anthropic → local rules); Gemini additionally
  cycles a model chain. Gemini's **Nano Banana** image model powers the AI 3D
  render. Results are cached in SQL by a SHA-256 of the inputs.

### sql.js (`sql.js` — 1.14.1)
- **What:** SQLite compiled to WebAssembly (runs in the browser).
- **Why / how:** Supports the in-browser **SQL Explorer** helper without round-trips.
  (Primary persistence is still SQL Server via the API.)

---

## Tooling

| Tool | Version | Role |
|------|---------|------|
| **concurrently** | `9.2.1` | Runs API + Vite together via `npm run dev:full` with labelled, colourised output. |
| **ESLint** | `9.39.4` | Linting with `@eslint/js`, `eslint-plugin-react-hooks`, `eslint-plugin-react-refresh` (flat config). |
| **Playwright** | `1.60.0` | Headless Chromium checks — used to verify UI changes (e.g. the simulator renders, modals open) by screenshotting real pages. |

---

## Version & compatibility notes

- **PixiJS pinned to v7** to match `@qstrike/builder`'s renderer API; v8 changed
  `Application` init and would break the builder's display objects.
- **`pixi.js-legacy`** is required (not just `pixi.js`) for the Canvas2D fallback,
  so the simulator renders even without WebGL (e.g. headless/CI).
- **Three.js** is loaded lazily (`import('three')`) to keep it out of the initial
  bundle; only the 3D modal pays the cost.
- **`@qstrike/builder`** as a `file:` dependency means a teammate must have the
  sibling `laravel-docker` checkout for the simulator to work; everything else in
  the app runs without it.
- **No router**: navigation is a single `activeTab` state in `App.jsx`. Acceptable
  for an internal tool with ~13 tabs and no deep-linking requirement; a router
  (React Router) would be the first add if shareable URLs become needed.
