const API = '/api';

// Strip leading "BRD_", "BRD ", "RD_", "RD " prefixes from titles for display
export const fmtTitle = (title) =>
  (title || '').replace(/^(BRD|RD)[_ ]+/i, '').trim();

const call = async (method, path, body) => {
  const res = await fetch(`${API}${path}`, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : {},
    body: body ? JSON.stringify(body) : undefined,
  });
  return res.json();
};

// ─── Init ──────────────────────────────────────────────────────────────────────
export const initDB = async () => {
  try {
    const data = await call('GET', '/health');
    return data.status === 'ok';
  } catch {
    return false;
  }
};

export const isUsingSQLite = () => false;
export const getMigrationResult = () => null;

// ─── Seed / Migrate ────────────────────────────────────────────────────────────
// Seeding is handled server-side on startup.
// On first run this migrates any existing localStorage JSON data into SQL Server.
export const seedSampleData = async () => {
  const MIGRATE_KEY = 'brd_tracker_migrated_mssql';
  if (localStorage.getItem(MIGRATE_KEY)) return null;

  // Try both the old JSON key and the old SQLite-era JSON key
  const raw = localStorage.getItem('brd_tracker_db');
  localStorage.setItem(MIGRATE_KEY, '1');
  if (!raw) return null;

  try {
    const parsed = JSON.parse(raw);
    const brds = parsed.brds || [];
    const bugs = parsed.bugs || [];
    if (brds.length === 0) return null;
    const result = await call('POST', '/migrate', { brds, bugs });
    return result.ok ? { brds: result.brds, bugs: result.bugs } : null;
  } catch {
    return null;
  }
};

// ─── BRDs ──────────────────────────────────────────────────────────────────────
export const getAllBRDs    = ()         => call('GET',    '/brds');
export const getBRDById   = (id)       => call('GET',    `/brds/${id}`);
export const createBRD    = (data)     => call('POST',   '/brds', data);
export const updateBRD    = (id, data) => call('PUT',    `/brds/${id}`, data);
export const deleteBRD    = (id)       => call('DELETE', `/brds/${id}`);

// ─── Bugs ──────────────────────────────────────────────────────────────────────
export const getAllBugs    = ()         => call('GET',    '/bugs');
export const getBugsByBRD = (brdId)    => call('GET',    `/bugs/brd/${brdId}`);
export const createBug    = (data)     => call('POST',   '/bugs', data);
export const updateBug    = (id, data) => call('PUT',    `/bugs/${id}`, data);
export const deleteBug    = (id)       => call('DELETE', `/bugs/${id}`);

// ─── Bug Criteria ──────────────────────────────────────────────────────────────
export const getAllCriteria  = ()         => call('GET',    '/criteria');
export const createCriteria  = (data)     => call('POST',   '/criteria', data);
export const updateCriteria  = (id, data) => call('PUT',    `/criteria/${id}`, data);
export const deleteCriteria  = (id)       => call('DELETE', `/criteria/${id}`);

// ─── Team Leads ────────────────────────────────────────────────────────────────
export const getAllTeamLeads  = ()         => call('GET',    '/teamleads');
export const createTeamLead   = (data)     => call('POST',   '/teamleads', data);
export const updateTeamLead   = (id, data) => call('PUT',    `/teamleads/${id}`, data);
export const deleteTeamLead   = (id)       => call('DELETE', `/teamleads/${id}`);

// ─── T-Shirt Sizes ─────────────────────────────────────────────────────────────
export const getAllTShirtSizes  = ()         => call('GET',    '/tshirt-sizes');
export const createTShirtSize   = (data)     => call('POST',   '/tshirt-sizes', data);
export const updateTShirtSize   = (id, data) => call('PUT',    `/tshirt-sizes/${id}`, data);
export const deleteTShirtSize   = (id)       => call('DELETE', `/tshirt-sizes/${id}`);

// ─── Knowledge Base ────────────────────────────────────────────────────────────
export const getAllKBEntries   = ()         => call('GET',    '/knowledge-base');
export const createKBEntry     = (data)     => call('POST',   '/knowledge-base', data);
export const updateKBEntry     = (id, data) => call('PUT',    `/knowledge-base/${id}`, data);
export const deleteKBEntry     = (id)       => call('DELETE', `/knowledge-base/${id}`);
export const analyzeWithAI          = (data) => call('POST', '/ai/analyze', data);
export const analyzeAffectedModules = (data) => call('POST', '/ai/analyze-affected-modules', data);

// Silently refresh brd-local-backup.json on the server — no browser download
export const syncLocalBackup = () => call('POST', '/brd-backup/sync');

// ─── Dev Members ───────────────────────────────────────────────────────────────
export const getAllDevMembers  = ()         => call('GET',    '/dev-members');
export const createDevMember   = (data)     => call('POST',   '/dev-members', data);
export const updateDevMember   = (id, data) => call('PUT',    `/dev-members/${id}`, data);
export const deleteDevMember   = (id)       => call('DELETE', `/dev-members/${id}`);

// ─── BRD Tech Leads ────────────────────────────────────────────────────────────
export const getAllBRDTechLeads     = ()                   => call('GET',    '/brd-tech-leads');
export const getTeamLeadsForBRD    = (brdId)              => call('GET',    `/brd-tech-leads/${brdId}`);
export const addBRDTechLead        = (brdId, data)        => call('POST',   '/brd-tech-leads', { brdId, ...data });
export const updateBRDTechLead     = (id, data)           => call('PUT',    `/brd-tech-leads/${id}`, data);
export const deleteBRDTechLead     = (id)                 => call('DELETE', `/brd-tech-leads/${id}`);
export const reorderBRDTechLeads   = (brdId, order)       => call('PUT',    `/brd-tech-leads/reorder/${brdId}`, { order });

// ─── PM Notes ──────────────────────────────────────────────────────────────────
export const getAllPMNotes  = ()         => call('GET',    '/pm-notes');
export const createPMNote   = (data)     => call('POST',   '/pm-notes', data);
export const updatePMNote   = (id, data) => call('PUT',    `/pm-notes/${id}`, data);
export const deletePMNote   = (id)       => call('DELETE', `/pm-notes/${id}`);

// ─── Style Features ────────────────────────────────────────────────────────────
export const getAllStyleFeatures  = ()         => call('GET',    '/style-features');
export const createStyleFeature   = (data)     => call('POST',   '/style-features', data);
export const updateStyleFeature   = (id, data) => call('PUT',    `/style-features/${id}`, data);
export const deleteStyleFeature   = (id)       => call('DELETE', `/style-features/${id}`);

// ─── SQL Explorer ──────────────────────────────────────────────────────────────
export const runQuery = (sql) => call('POST', '/query', { sql });

// ─── Export / Import ───────────────────────────────────────────────────────────
export const exportDB = async () => {
  const data = await call('GET', '/export');
  return JSON.stringify(data, null, 2);
};

export const importDB = async (jsonStr) => {
  try {
    const data = JSON.parse(jsonStr);
    const result = await call('POST', '/import', data);
    return !!result.ok;
  } catch {
    return false;
  }
};
