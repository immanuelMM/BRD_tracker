# Graph Report - BRD_tracker  (2026-07-15)

## Corpus Check
- 41 files · ~83,994 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 526 nodes · 951 edges · 45 communities (23 shown, 22 thin omitted)
- Extraction: 99% EXTRACTED · 1% INFERRED · 0% AMBIGUOUS · INFERRED: 11 edges (avg confidence: 0.78)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `1b288434`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- BRD Form & BA Page
- App Shell & Navigation
- AI Analysis Backend
- Build & Lint Tooling
- Backend Dependencies
- AI Analyzer Subsystem Design
- LocalStorage Backup & Migration
- Report Export (PDF/DOCX)
- Knowledge Base Page
- BRD Detail & Criteria
- PM Notes Page
- Workflow Diagram Page
- Garment Simulator (2D/3D)
- SQL Explorer
- Social Icon Sprite Sheet
- Dev Member Settings
- T-Shirt Size Settings
- Document Export Subsystem
- In-Browser SQLite
- Vite Config
- Affected Module Analysis
- App Constants
- Env Configuration
- Excel Export Utility
- Knowledge Base Entry
- Concurrently Dependency
- date-fns Dependency
- dotenv Dependency
- ESLint Dependency
- html2canvas Dependency
- mammoth Dependency
- Node.js Runtime
- Playwright Dependency
- Recharts Dependency
- Tailwind CSS Dependency
- xlsx/SheetJS Dependency
- Favicon Brand Mark
- Hero Brand Graphic
- React Logo Asset
- Vite Logo Asset
- CLAUDE.md

## God Nodes (most connected - your core abstractions)
1. `call()` - 53 edges
2. `fmtTitle()` - 27 edges
3. `getSprintLabel()` - 20 edges
4. `App()` - 19 edges
5. `server.js (Express API)` - 19 edges
6. `BRDDetail()` - 17 edges
7. `getTShirtSize()` - 13 edges
8. `KnowledgeBasePage()` - 12 edges
9. `STATUS_OPTIONS` - 12 edges
10. `brdRow()` - 10 edges

## Surprising Connections (you probably didn't know these)
- `React + Vite Template` --semantically_similar_to--> `Vite 8`  [INFERRED] [semantically similar]
  README.md → docs/TECH_STACK.md
- `BRD Tracker LocalStorage Backup Page` --semantically_similar_to--> `syncLocalBackup()`  [INFERRED] [semantically similar]
  backup-localstorage.html → docs/ARCHITECTURE.md
- `POST /api/migrate endpoint` --shares_data_with--> `server.js (Express API)`  [INFERRED]
  backup-localstorage.html → docs/ARCHITECTURE.md
- `KnowledgeBasePage()` --references--> `jspdf`  [EXTRACTED]
  src/components/KnowledgeBasePage.jsx → package.json
- `exportChartAsPDF()` --references--> `jspdf`  [EXTRACTED]
  src/utils/pdfGenerator.js → package.json

## Import Cycles
- None detected.

## Hyperedges (group relationships)
- **Garment 2D/3D Render Pipeline** — docs_architecture_garment_zone_simulator, docs_architecture_garment3dview, docs_architecture_qstrike_builder, docs_tech_stack_pixijs7, docs_tech_stack_threejs [EXTRACTED 0.90]
- **AI Analysis Request Flow** — docs_architecture_endpoint_ai_analyze, docs_architecture_endpoint_ai_analyze_affected_modules, docs_architecture_run_analysis_with_fallback, docs_architecture_ai_providers, docs_architecture_table_ai_analysis_cache, docs_architecture_customizer_modules_registry [EXTRACTED 0.90]
- **LocalStorage Backup and Migration Flow** — backup_localstorage_html_getdata, backup_localstorage_html_downloadbackup, backup_localstorage_html_uploadtodatabase, backup_localstorage_html_api_migrate_endpoint, docs_architecture_sync_local_backup, docs_architecture_brd_local_backup_json [INFERRED 0.75]
- **Social Platform Icon Group (Bluesky, Discord, GitHub, X)** — public_icons_svg_bluesky_icon, public_icons_svg_discord_icon, public_icons_svg_github_icon, public_icons_svg_x_icon [INFERRED 0.75]

## Communities (45 total, 22 thin omitted)

### Community 0 - "BRD Form & BA Page"
Cohesion: 0.07
Nodes (56): useTheme(), BA_COLORS, BAPage(), BRDForm(), empty, parseExtendedQuarters(), parseTickets(), Avatar() (+48 more)

### Community 1 - "App Shell & Navigation"
Cohesion: 0.09
Nodes (56): App(), NAV, PAGE_TITLES, ThemeContext, BRDDetail(), CriteriaSettings(), slugify(), API() (+48 more)

### Community 2 - "AI Analysis Backend"
Cohesion: 0.06
Nodes (52): AI_PROVIDER, analyzeWithAnthropic(), analyzeWithGemini(), analyzeWithOpenAI(), app, buildContentToScan(), buildCustomizerContext(), callGeminiModel() (+44 more)

### Community 3 - "Build & Lint Tooling"
Cohesion: 0.05
Nodes (40): concurrently, eslint, @eslint/js, eslint-plugin-react-hooks, eslint-plugin-react-refresh, globals, @locator/runtime, devDependencies (+32 more)

### Community 4 - "Backend Dependencies"
Cohesion: 0.05
Nodes (39): @anthropic-ai/sdk, cors, date-fns, dotenv, express, html2canvas, mammoth, mssql (+31 more)

### Community 5 - "AI Analyzer Subsystem Design"
Cohesion: 0.07
Nodes (34): AI Analyzer subsystem, AI providers (Gemini/OpenAI/Anthropic), BRD Insight Application, Codebase-grounded analysis, customizer-core repo (QStrike/ProLook), CUSTOMIZER_MODULES registry (91 modules), CUSTOMIZER_REPO_PATH env var, Deterministic caching (+26 more)

### Community 6 - "LocalStorage Backup & Migration"
Cohesion: 0.09
Nodes (25): BRD Tracker LocalStorage Backup Page, POST /api/migrate endpoint, brd_tracker_db localStorage key, downloadBackup, getData, brd_tracker_migrated_mssql localStorage flag, showContents, uploadToDatabase (+17 more)

### Community 7 - "Report Export (PDF/DOCX)"
Cohesion: 0.13
Nodes (16): jspdf, jspdf, AnalyseAffectedModule(), downloadResultsDocx(), downloadResultsPDF(), downloadTechSpec(), SEV_HEX, SEV_RGB (+8 more)

### Community 8 - "Knowledge Base Page"
Cohesion: 0.18
Nodes (16): CAT_BORDERS, CAT_COLORS, catBorder(), catColor(), KB_CATEGORIES, KnowledgeBasePage(), MarkdownRenderer(), parseInline() (+8 more)

### Community 9 - "BRD Detail & Criteria"
Cohesion: 0.18
Nodes (11): bugStatusCls(), bugStatusLabel(), criteriaConfig, EXPERTISE_OPTIONS, parseTickets(), SeverityBadge(), severityConfig, BUG_STATUS (+3 more)

### Community 10 - "PM Notes Page"
Cohesion: 0.25
Nodes (13): getPriority(), getStatus(), HIGHLIGHT_COLORS, NoteCard(), NoteForm(), parseBrdIds(), PMNotesPage(), PRIORITY (+5 more)

### Community 11 - "Workflow Diagram Page"
Cohesion: 0.05
Nodes (41): 1. Overview, 2. Tech Stack, 3. Repository Layout, 4. Data Model (SQL Server — `brd_tracker`), 5.1 AI Analyzer, 5.2 Garment Simulator (PixiJS) & 3D View (Three.js), 5.3 Google Docs integration, 5.4 Document export (+33 more)

### Community 12 - "Garment Simulator (2D/3D)"
Cohesion: 0.32
Nodes (8): Garment3DView.jsx (Three.js), GarmentZoneSimulator.jsx (PixiJS), @qstrike/builder package, PixiJS 7 (+ legacy), PixiJS pinned to v7, @qstrike/builder (local dep), Three.js, Three.js lazy import

### Community 13 - "SQL Explorer"
Cohesion: 0.32
Nodes (6): cellStyle(), PRESETS, SEVERITY_COLOR, SQLExplorer(), STATUS_COLOR, runQuery()

### Community 14 - "Social Icon Sprite Sheet"
Cohesion: 0.43
Nodes (7): Bluesky Icon Symbol, Discord Icon Symbol, Documentation Icon Symbol, GitHub Icon Symbol, Social (Community) Icon Symbol, public/icons.svg Sprite Sheet, X (Twitter) Icon Symbol

### Community 15 - "Dev Member Settings"
Cohesion: 0.67
Nodes (3): DevMemberSettings(), TEAM_COLORS, teamColor()

### Community 16 - "T-Shirt Size Settings"
Cohesion: 0.67
Nodes (3): daysLabel(), RISK_OPTIONS, TShirtSizeSettings()

### Community 17 - "Document Export Subsystem"
Cohesion: 0.67
Nodes (3): Document export subsystem (PDF/Word/Tech Spec), src/utils/pdfGenerator.js, jsPDF

### Community 32 - "Node.js Runtime"
Cohesion: 0.39
Nodes (8): buildGraph(), buildRepoGraph(), extractTerms(), GRAPH_TABS, KnowledgeGraphView(), lighten(), PALETTE, STOPWORDS

## Knowledge Gaps
- **165 isolated node(s):** `name`, `private`, `version`, `type`, `dev` (+160 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **22 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `dependencies` connect `Backend Dependencies` to `Build & Lint Tooling`, `Report Export (PDF/DOCX)`?**
  _High betweenness centrality (0.148) - this node is a cross-community bridge._
- **Why does `jspdf` connect `Report Export (PDF/DOCX)` to `Knowledge Base Page`, `BRD Form & BA Page`, `Backend Dependencies`?**
  _High betweenness centrality (0.120) - this node is a cross-community bridge._
- **Why does `KnowledgeBasePage()` connect `Knowledge Base Page` to `BRD Form & BA Page`, `App Shell & Navigation`, `Report Export (PDF/DOCX)`?**
  _High betweenness centrality (0.090) - this node is a cross-community bridge._
- **What connects `name`, `private`, `version` to the rest of the system?**
  _165 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `BRD Form & BA Page` be split into smaller, more focused modules?**
  _Cohesion score 0.07497565725413827 - nodes in this community are weakly interconnected._
- **Should `App Shell & Navigation` be split into smaller, more focused modules?**
  _Cohesion score 0.08701923076923077 - nodes in this community are weakly interconnected._
- **Should `AI Analysis Backend` be split into smaller, more focused modules?**
  _Cohesion score 0.05536723163841808 - nodes in this community are weakly interconnected._