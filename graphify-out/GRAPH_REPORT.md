# Graph Report - BRD_tracker  (2026-08-04)

## Corpus Check
- 44 files · ~94,475 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 580 nodes · 1022 edges · 52 communities (30 shown, 22 thin omitted)
- Extraction: 99% EXTRACTED · 1% INFERRED · 0% AMBIGUOUS · INFERRED: 11 edges (avg confidence: 0.78)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `4c68ea3a`
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
- TShirtSizeSettings.jsx
- PM Notes Page
- Workflow Diagram Page
- Garment Simulator (2D/3D)
- CriteriaSettings.jsx
- Social Icon Sprite Sheet
- Dev Member Settings
- NV
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
- graphSourceByKey
- localAnalyzeAffectedModules
- keyStatus
- callProvider
- getGoogleAccessToken
- BRD Insight — Architecture & Tech Stack
- SQLExplorer.jsx

## God Nodes (most connected - your core abstractions)
1. `call()` - 53 edges
2. `fmtTitle()` - 29 edges
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

## Communities (52 total, 22 thin omitted)

### Community 0 - "BRD Form & BA Page"
Cohesion: 0.07
Nodes (61): useTheme(), BA_COLORS, BAPage(), SeverityBadge(), BRDForm(), empty, parseExtendedQuarters(), parseTickets() (+53 more)

### Community 1 - "App Shell & Navigation"
Cohesion: 0.07
Nodes (63): App(), NAV, PAGE_TITLES, ThemeContext, BRDDetail(), bugStatusCls(), bugStatusLabel(), criteriaConfig (+55 more)

### Community 2 - "AI Analysis Backend"
Cohesion: 0.08
Nodes (18): AI_PROVIDER, app, CRITICAL_FILES, CUSTOMIZER_GRAPH_PATH, CUSTOMIZER_REPO, customizerContext, [DB_HOST, DB_INSTANCE], filterRelevantKbEntries() (+10 more)

### Community 3 - "Build & Lint Tooling"
Cohesion: 0.05
Nodes (40): concurrently, eslint, @eslint/js, eslint-plugin-react-hooks, eslint-plugin-react-refresh, globals, @locator/runtime, devDependencies (+32 more)

### Community 4 - "Backend Dependencies"
Cohesion: 0.05
Nodes (44): @anthropic-ai/sdk, cors, date-fns, dotenv, express, html2canvas, mammoth, mssql (+36 more)

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

### Community 9 - "TShirtSizeSettings.jsx"
Cohesion: 0.67
Nodes (3): daysLabel(), RISK_OPTIONS, TShirtSizeSettings()

### Community 10 - "PM Notes Page"
Cohesion: 0.25
Nodes (13): getPriority(), getStatus(), HIGHLIGHT_COLORS, NoteCard(), NoteForm(), parseBrdIds(), PMNotesPage(), PRIORITY (+5 more)

### Community 11 - "Workflow Diagram Page"
Cohesion: 0.06
Nodes (29): Activities, BRD Insight — Implementation Plan, Implementation Activities (2-Month Timeline), Phase 1 – BA Pilot (5 Users), Phase 2 – Engineering Rollout, Review Cycle, Scope, Scope (+21 more)

### Community 12 - "Garment Simulator (2D/3D)"
Cohesion: 0.32
Nodes (8): Garment3DView.jsx (Three.js), GarmentZoneSimulator.jsx (PixiJS), @qstrike/builder package, PixiJS 7 (+ legacy), PixiJS pinned to v7, @qstrike/builder (local dep), Three.js, Three.js lazy import

### Community 13 - "CriteriaSettings.jsx"
Cohesion: 0.09
Nodes (23): 1.1 A database the app can reach over the network, 1.2 A place to run Node, 1.3 A build + static-serving step for the frontend, 1.4 Secrets, not a checked-in `.env`, 1.5 A public HTTPS domain, 1.6 Tightened CORS, 1. What production/cloud deployment needs, 2.1 Hardcoded paths to sibling repos (`CUSTOMIZER_REPO_PATH`, `QSTRIKE_BUILDER_REPO_PATH`) (+15 more)

### Community 14 - "Social Icon Sprite Sheet"
Cohesion: 0.43
Nodes (7): Bluesky Icon Symbol, Discord Icon Symbol, Documentation Icon Symbol, GitHub Icon Symbol, Social (Community) Icon Symbol, public/icons.svg Sprite Sheet, X (Twitter) Icon Symbol

### Community 15 - "Dev Member Settings"
Cohesion: 0.67
Nodes (3): DevMemberSettings(), TEAM_COLORS, teamColor()

### Community 16 - "NV"
Cohesion: 0.28
Nodes (9): dbConfig(), getCachedAnalysis(), init(), _insertBRD(), _insertBug(), NV(), saveCachedAnalysis(), seedStyleFeatures() (+1 more)

### Community 17 - "Document Export Subsystem"
Cohesion: 0.67
Nodes (3): Document export subsystem (PDF/Word/Tech Spec), src/utils/pdfGenerator.js, jsPDF

### Community 32 - "Node.js Runtime"
Cohesion: 0.33
Nodes (10): buildFunctionGraph(), buildGraph(), buildKBFunctionGraph(), buildRepoGraph(), extractTerms(), GRAPH_TABS, KnowledgeGraphView(), lighten() (+2 more)

### Community 45 - "graphSourceByKey"
Cohesion: 0.24
Nodes (10): buildCustomizerContext(), CUSTOMIZER_MODULES, extractCodeBlock(), getGitBlame(), GRAPH_SOURCES, graphSourceByKey(), lookupGraphSourceLine(), parseGitBlamePorcelain() (+2 more)

### Community 46 - "localAnalyzeAffectedModules"
Cohesion: 0.29
Nodes (7): buildContentToScan(), findMentionedSymbols(), GRAPH_TRAVERSAL_RELATIONS, localAnalyzeAffectedModules(), matchCustomizerModules(), mentionedInContent(), queryCustomizerGraphNeighborhood()

### Community 47 - "keyStatus"
Cohesion: 0.29
Nodes (7): keyStatus(), localReasonForProvider(), normalizeUsage(), PLACEHOLDER_API_KEYS, resolveAIProvider(), resolveProviderChain(), runAnalysisWithFallback()

### Community 48 - "callProvider"
Cohesion: 0.33
Nodes (6): analyzeWithAnthropic(), analyzeWithGemini(), analyzeWithOpenAI(), callGeminiModel(), callProvider(), geminiModelChain()

### Community 49 - "getGoogleAccessToken"
Cohesion: 0.50
Nodes (4): fetchGoogleDocText(), getGoogleAccessToken(), refreshGoogleAccessToken(), saveGoogleTokens()

### Community 50 - "BRD Insight — Architecture & Tech Stack"
Cohesion: 0.10
Nodes (21): 1. Overview, 2. Tech Stack, 3. Repository Layout, 4. Data Model (SQL Server — `brd_tracker`), 5.1 AI Analyzer, 5.2 Garment Simulator (PixiJS) & 3D View (Three.js), 5.3 Google Docs integration, 5.4 Document export (+13 more)

### Community 51 - "SQLExplorer.jsx"
Cohesion: 0.32
Nodes (6): cellStyle(), PRESETS, SEVERITY_COLOR, SQLExplorer(), STATUS_COLOR, runQuery()

## Knowledge Gaps
- **194 isolated node(s):** `name`, `private`, `version`, `type`, `dev` (+189 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **22 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `dependencies` connect `Backend Dependencies` to `Build & Lint Tooling`, `Report Export (PDF/DOCX)`?**
  _High betweenness centrality (0.125) - this node is a cross-community bridge._
- **Why does `jspdf` connect `Report Export (PDF/DOCX)` to `Knowledge Base Page`, `BRD Form & BA Page`, `Backend Dependencies`?**
  _High betweenness centrality (0.099) - this node is a cross-community bridge._
- **Why does `KnowledgeBasePage()` connect `Knowledge Base Page` to `BRD Form & BA Page`, `App Shell & Navigation`, `Report Export (PDF/DOCX)`?**
  _High betweenness centrality (0.075) - this node is a cross-community bridge._
- **What connects `name`, `private`, `version` to the rest of the system?**
  _194 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `BRD Form & BA Page` be split into smaller, more focused modules?**
  _Cohesion score 0.06750700280112044 - nodes in this community are weakly interconnected._
- **Should `App Shell & Navigation` be split into smaller, more focused modules?**
  _Cohesion score 0.07404664938911515 - nodes in this community are weakly interconnected._
- **Should `AI Analysis Backend` be split into smaller, more focused modules?**
  _Cohesion score 0.07671957671957672 - nodes in this community are weakly interconnected._