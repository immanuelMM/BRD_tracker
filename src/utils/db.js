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

// ─── Repository pattern ─────────────────────────────────────────────────────────
// A Repository wraps the REST calls for one entity behind a small set of
// generic verbs. Every exported function below is a thin wrapper delegating
// to a Repository instance, so existing call sites don't change.
class Repository {
  constructor(path) {
    this.path = path;
  }
  list() { return call('GET', this.path); }
  getById(id) { return call('GET', `${this.path}/${id}`); }
  create(data) { return call('POST', this.path, data); }
  update(id, data) { return call('PUT', `${this.path}/${id}`, data); }
  remove(id) { return call('DELETE', `${this.path}/${id}`); }
}

class BugRepository extends Repository {
  getByBrd(brdId) { return call('GET', `${this.path}/brd/${brdId}`); }
}

class BrdTechLeadRepository extends Repository {
  getForBrd(brdId) { return call('GET', `${this.path}/${brdId}`); }
  addTo(brdId, data) { return this.create({ brdId, ...data }); }
  reorder(brdId, order) { return call('PUT', `${this.path}/reorder/${brdId}`, { order }); }
}

const brdRepo = new Repository('/brds');
const bugRepo = new BugRepository('/bugs');
const criteriaRepo = new Repository('/criteria');
const teamLeadRepo = new Repository('/teamleads');
const tshirtSizeRepo = new Repository('/tshirt-sizes');
const kbRepo = new Repository('/knowledge-base');
const devMemberRepo = new Repository('/dev-members');
const brdTechLeadRepo = new BrdTechLeadRepository('/brd-tech-leads');
const pmNoteRepo = new Repository('/pm-notes');
const styleFeatureRepo = new Repository('/style-features');

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
export const getAllBRDs  = ()         => brdRepo.list();
export const getBRDById  = (id)       => brdRepo.getById(id);
export const createBRD   = (data)     => brdRepo.create(data);
export const updateBRD   = (id, data) => brdRepo.update(id, data);
export const deleteBRD   = (id)       => brdRepo.remove(id);

// ─── Bugs ──────────────────────────────────────────────────────────────────────
export const getAllBugs   = ()         => bugRepo.list();
export const getBugsByBRD = (brdId)    => bugRepo.getByBrd(brdId);
export const createBug    = (data)     => bugRepo.create(data);
export const updateBug    = (id, data) => bugRepo.update(id, data);
export const deleteBug    = (id)       => bugRepo.remove(id);

// ─── Bug Criteria ──────────────────────────────────────────────────────────────
export const getAllCriteria = ()         => criteriaRepo.list();
export const createCriteria = (data)     => criteriaRepo.create(data);
export const updateCriteria = (id, data) => criteriaRepo.update(id, data);
export const deleteCriteria = (id)       => criteriaRepo.remove(id);

// ─── Team Leads ────────────────────────────────────────────────────────────────
export const getAllTeamLeads = ()         => teamLeadRepo.list();
export const createTeamLead  = (data)     => teamLeadRepo.create(data);
export const updateTeamLead  = (id, data) => teamLeadRepo.update(id, data);
export const deleteTeamLead  = (id)       => teamLeadRepo.remove(id);

// ─── T-Shirt Sizes ─────────────────────────────────────────────────────────────
export const getAllTShirtSizes = ()         => tshirtSizeRepo.list();
export const createTShirtSize  = (data)     => tshirtSizeRepo.create(data);
export const updateTShirtSize  = (id, data) => tshirtSizeRepo.update(id, data);
export const deleteTShirtSize  = (id)       => tshirtSizeRepo.remove(id);

// ─── Knowledge Base ────────────────────────────────────────────────────────────
export const getAllKBEntries = ()         => kbRepo.list();
export const createKBEntry   = (data)     => kbRepo.create(data);
export const updateKBEntry   = (id, data) => kbRepo.update(id, data);
export const deleteKBEntry   = (id)       => kbRepo.remove(id);
export const analyzeWithAI          = (data) => call('POST', '/ai/analyze', data);
export const analyzeAffectedModules = (data) => call('POST', '/ai/analyze-affected-modules', data);

// Silently refresh brd-local-backup.json on the server — no browser download
export const syncLocalBackup = () => call('POST', '/brd-backup/sync');

// ─── Dev Members ───────────────────────────────────────────────────────────────
export const getAllDevMembers = ()         => devMemberRepo.list();
export const createDevMember  = (data)     => devMemberRepo.create(data);
export const updateDevMember  = (id, data) => devMemberRepo.update(id, data);
export const deleteDevMember  = (id)       => devMemberRepo.remove(id);

// ─── BRD Tech Leads ────────────────────────────────────────────────────────────
export const getAllBRDTechLeads   = ()             => brdTechLeadRepo.list();
export const getTeamLeadsForBRD   = (brdId)        => brdTechLeadRepo.getForBrd(brdId);
export const addBRDTechLead       = (brdId, data)  => brdTechLeadRepo.addTo(brdId, data);
export const updateBRDTechLead    = (id, data)     => brdTechLeadRepo.update(id, data);
export const deleteBRDTechLead    = (id)           => brdTechLeadRepo.remove(id);
export const reorderBRDTechLeads  = (brdId, order) => brdTechLeadRepo.reorder(brdId, order);

// ─── PM Notes ──────────────────────────────────────────────────────────────────
export const getAllPMNotes = ()         => pmNoteRepo.list();
export const createPMNote  = (data)     => pmNoteRepo.create(data);
export const updatePMNote  = (id, data) => pmNoteRepo.update(id, data);
export const deletePMNote  = (id)       => pmNoteRepo.remove(id);

// ─── Style Features ────────────────────────────────────────────────────────────
export const getAllStyleFeatures = ()         => styleFeatureRepo.list();
export const createStyleFeature  = (data)     => styleFeatureRepo.create(data);
export const updateStyleFeature  = (id, data) => styleFeatureRepo.update(id, data);
export const deleteStyleFeature  = (id)       => styleFeatureRepo.remove(id);

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
