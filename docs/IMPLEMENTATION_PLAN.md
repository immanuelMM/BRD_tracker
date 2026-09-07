# BRD Insight — Implementation Plan

> Phased rollout plan for onboarding users onto the AI Knowledge Base
> workflow, starting with a small Business Analyst pilot before expanding to
> Engineering.

---

## Phase 1 – BA Pilot (5 Users)

### Scope
- Limited to 5 Business Analysts (BA)
- Local environment setup only
- Initial validation of the AI Knowledge Base workflow before expanding to
  other teams

### Implementation Activities (2-Month Timeline)

One 1-hour session every other Monday, spread across 8 weeks (2 months) to
give each BA time to practice between sessions.

- **Weeks 1–2 – Environment Setup**
  - Objective: prepare each BA's local development environment.
  - Install Git
  - Install Node.js
  - Install Docker Desktop
  - Database setup using Docker
  - Install required IDE (VS Code)
  - Configure environment variables (`.env`)
  - Install project dependencies (`npm install`)
  - Basic terminal/Git commands
  - Verify local application is running successfully

- **Weeks 3–4 – Account & Local Configuration**
  - Objective: configure access for every BA.
  - Repository access
  - GitHub permissions
  - Local account configuration
  - Application login/setup
  - Connect to local database
  - Verify all required services are working

- **Weeks 5–6 – Repository & Code Familiarization**
  - Objective: understand the project structure.
  - Clone required repositories
  - Repository overview (Customizer, Knowledge Base, APIs, etc.)
  - Folder structure
  - Where features are implemented
  - Understanding impacted files
  - Basic Git workflow (Pull, Branch, Commit, Push)

- **Weeks 7–8 – System Usage & Knowledge Base Training**
  - Objective: learn how to use the Knowledge Base AI.
  - Running the application locally
  - Importing existing data
  - Exporting analyzed data
  - Creating and reviewing BRDs
  - Detecting impacted modules
  - Detecting conflicts between features/BRDs
  - Understanding affected functions (MOQ, Pricing Toggle, Fabric Flow, etc.)
  - Hands-on exercises

### Success Criteria
- All 5 BA users can successfully run the system locally.
- All users can use the Knowledge Base AI independently.
- Users can analyze BRDs and identify impacted modules and potential
  conflicts.
- Feedback is collected for future improvements.

---

## Phase 2 – Engineering Rollout

### Scope

Expand implementation to the Engineering Department, including:
- Development Team
- Solution Analysts
- Team Leads
- Engineering Managers

### Activities
- Conduct Engineering onboarding sessions.
- Integrate the Knowledge Base AI into the engineering workflow.
- Gather feedback from technical teams.
- Improve AI recommendations based on engineering use cases.
- Standardize the analysis process across teams.

### Review Cycle

Progress and adoption will be reviewed every quarter, considering
dependencies, ongoing projects, and team readiness before expanding to
additional users or departments. This includes re-checking the status of the
[local-only dependencies](./DEPLOYMENT.md#2-local-only-dependencies-that-will-not-work-as-is-in-the-cloud)
that currently tie the "Affected Module" AI analyzer to a single machine
(hardcoded sibling-repo paths, graphify knowledge graphs, `git blame`), since
those must be resolved before the Engineering rollout can move beyond
local/dev environments.

---

This phased approach allows the BA pilot to validate the process first,
minimizing risk before a broader rollout across Engineering.
