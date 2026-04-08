import express from 'express';
import cors from 'cors';
import sql from 'mssql';
import { randomUUID } from 'crypto';
import { config as dotenv } from 'dotenv';
dotenv();

const app = express();
app.use(cors());
app.use(express.json());

const DB_SERVER  = process.env.DB_SERVER   || 'localhost';
const DB_PORT    = parseInt(process.env.DB_PORT) || 1433;
const DB_USER    = process.env.DB_USER     || '';
const DB_PASS    = process.env.DB_PASSWORD || '';
const DB_NAME    = process.env.DB_NAME     || 'brd_tracker';
const DB_TRUSTED = process.env.DB_TRUSTED  === 'true';
const PORT       = parseInt(process.env.PORT) || 3001;

// Named instance support — split "HOSTNAME\INSTANCE" into separate fields
// mssql requires server and instanceName to be separate; when instanceName is set,
// SQL Server Browser resolves the port automatically (do NOT hard-code port).
const [DB_HOST, DB_INSTANCE] = DB_SERVER.split('\\');

// ─── Type shortcuts ───────────────────────────────────────────────────────────
const NV  = (n) => sql.NVarChar(n || sql.MAX);
const INT = sql.Int;
const BIG = sql.BigInt;

let pool;


const dbConfig = (database) => {
  const base = {
    server: DB_HOST,
    // Only specify port when NOT using a named instance (named instances use Browser service)
    ...(DB_INSTANCE ? {} : { port: DB_PORT }),
    database,
    options: {
      encrypt: false,
      trustServerCertificate: true,
      ...(DB_INSTANCE ? { instanceName: DB_INSTANCE } : {}),
    },
    pool: { max: 10, min: 0, idleTimeoutMillis: 30000 },
  };

  if (DB_TRUSTED) {
    base.authentication = {
      type: 'integrated',
    };
  } else {
    base.user = DB_USER;
    base.password = DB_PASS;
  }

  return base;
};

// ─── Init ──────────────────────────────────────────────────────────────────────
async function init() {
  // Auto-create database by connecting to master first
  const master = await new sql.ConnectionPool(dbConfig('master')).connect();
  await master.request().query(`
    IF NOT EXISTS (SELECT name FROM sys.databases WHERE name = '${DB_NAME}')
      CREATE DATABASE [${DB_NAME}]
  `);
  await master.close();

  pool = await new sql.ConnectionPool(dbConfig(DB_NAME)).connect();

  // Create brds table
  await pool.request().query(`
    IF NOT EXISTS (SELECT * FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME = 'brds')
    CREATE TABLE brds (
      id             NVARCHAR(36)  PRIMARY KEY,
      title          NVARCHAR(255) NOT NULL DEFAULT '',
      description    NVARCHAR(MAX),
      quarter        NVARCHAR(5),
      year           INT,
      sprintStart    NVARCHAR(20),
      sprintEnd      NVARCHAR(20),
      status         NVARCHAR(50)  DEFAULT 'planning',
      googleDocsLink NVARCHAR(MAX),
      jiraLink       NVARCHAR(MAX),
      bugLogLink     NVARCHAR(MAX),
      baName         NVARCHAR(255),
      techLead           NVARCHAR(255),
      tshirtSize         NVARCHAR(10),
      extendedQuarters   NVARCHAR(MAX),
      beTicket           NVARCHAR(MAX),
      feTicket           NVARCHAR(MAX),
      anciliaryTicket    NVARCHAR(MAX),
      rndTicket          NVARCHAR(MAX),
      devAssignee        NVARCHAR(MAX),
      createdAt          BIGINT,
      updatedAt          BIGINT
    )
  `);
  // Migrate: add extendedQuarters column if it doesn't exist yet
  await pool.request().query(`
    IF NOT EXISTS (
      SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_NAME = 'brds' AND COLUMN_NAME = 'extendedQuarters'
    )
    ALTER TABLE brds ADD extendedQuarters NVARCHAR(MAX)
  `);
  // Migrate: add story ticket columns if missing
  for (const col of ['beTicket', 'feTicket', 'anciliaryTicket', 'rndTicket']) {
    await pool.request().query(`
      IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME='brds' AND COLUMN_NAME='${col}')
        ALTER TABLE brds ADD ${col} NVARCHAR(MAX)
    `);
  }
  await pool.request().query(`
    IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME='brds' AND COLUMN_NAME='devAssignee')
      ALTER TABLE brds ADD devAssignee NVARCHAR(MAX)
  `);
  // Migrate: widen devAssignee to MAX if it was created as NVARCHAR(255)
  await pool.request().query(`
    IF EXISTS (
      SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_NAME='brds' AND COLUMN_NAME='devAssignee' AND CHARACTER_MAXIMUM_LENGTH = 255
    )
    ALTER TABLE brds ALTER COLUMN devAssignee NVARCHAR(MAX)
  `);

  // Create bugs table
  await pool.request().query(`
    IF NOT EXISTS (SELECT * FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME = 'bugs')
    CREATE TABLE bugs (
      id          NVARCHAR(36) PRIMARY KEY,
      brdId       NVARCHAR(36),
      title       NVARCHAR(255),
      criteria    NVARCHAR(100),
      severity    NVARCHAR(50)  DEFAULT 'medium',
      description NVARCHAR(MAX),
      status      NVARCHAR(50)  DEFAULT 'open',
      jiraLink    NVARCHAR(MAX),
      rootCause   NVARCHAR(MAX),
      storyTicket NVARCHAR(MAX),
      createdAt   BIGINT,
      CONSTRAINT FK_bugs_brds FOREIGN KEY (brdId)
        REFERENCES brds(id) ON DELETE CASCADE
    )
  `);
  // Migrate existing tables: add columns if missing
  await pool.request().query(`
    IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME='bugs' AND COLUMN_NAME='jiraLink')
      ALTER TABLE bugs ADD jiraLink NVARCHAR(MAX)
  `);
  await pool.request().query(`
    IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME='bugs' AND COLUMN_NAME='rootCause')
      ALTER TABLE bugs ADD rootCause NVARCHAR(MAX)
  `);
  await pool.request().query(`
    IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME='bugs' AND COLUMN_NAME='storyTicket')
      ALTER TABLE bugs ADD storyTicket NVARCHAR(MAX)
  `);

  // Create bug_criteria table
  await pool.request().query(`
    IF NOT EXISTS (SELECT * FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME = 'bug_criteria')
    CREATE TABLE bug_criteria (
      id          NVARCHAR(36)  PRIMARY KEY,
      value       NVARCHAR(100) NOT NULL,
      label       NVARCHAR(255) NOT NULL,
      color       NVARCHAR(20)  NOT NULL DEFAULT '#3b82f6',
      description NVARCHAR(MAX),
      sortOrder   INT           NOT NULL DEFAULT 0,
      createdAt   BIGINT,
      CONSTRAINT UQ_bug_criteria_value UNIQUE (value)
    )
  `);

  // Seed bug_criteria defaults if empty
  const { recordset: [{ critCnt }] } = await pool.request()
    .query('SELECT COUNT(*) AS critCnt FROM bug_criteria');
  if (critCnt === 0) {
    const defaultCriteria = [
      { value: 'new_requirements',    label: 'New Requirements',    color: '#3b82f6', description: 'Requirements discovered during development not in original spec',         sortOrder: 0 },
      { value: 'missed_requirements', label: 'Missed Requirements',  color: '#f59e0b', description: 'Features or functionality missed from initial requirements',           sortOrder: 1 },
      { value: 'code_logic_issue',    label: 'Code Logic Issue',    color: '#ef4444', description: 'Bug in code implementation or logic',                                sortOrder: 2 },
      { value: 'known_issue',         label: 'Known Issue',         color: '#6366f1', description: 'Pre-identified issue documented and accepted',                       sortOrder: 3 },
      { value: 'affected_by_dev',     label: 'Affected by Dev',     color: '#8b5cf6', description: 'Issue caused by changes from other development work',                sortOrder: 4 },
    ];
    const now = Date.now();
    for (const c of defaultCriteria) {
      const id = randomUUID();
      await pool.request()
        .input('id',          NV(36),  id)
        .input('value',       NV(100), c.value)
        .input('label',       NV(255), c.label)
        .input('color',       NV(20),  c.color)
        .input('description', NV(),    c.description)
        .input('sortOrder',   INT,     c.sortOrder)
        .input('createdAt',   BIG,     now)
        .query(`INSERT INTO bug_criteria (id,value,label,color,description,sortOrder,createdAt)
                VALUES (@id,@value,@label,@color,@description,@sortOrder,@createdAt)`);
    }
  }

  // Create team_leads table
  await pool.request().query(`
    IF NOT EXISTS (SELECT * FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME = 'team_leads')
    CREATE TABLE team_leads (
      id        NVARCHAR(36)  PRIMARY KEY,
      name      NVARCHAR(255) NOT NULL,
      sortOrder INT           NOT NULL DEFAULT 0,
      createdAt BIGINT
    )
  `);

  // Seed team_leads defaults if empty
  const { recordset: [{ tlCnt }] } = await pool.request()
    .query('SELECT COUNT(*) AS tlCnt FROM team_leads');
  if (tlCnt === 0) {
    const defaultTeamLeads = [
      { name: 'Bob Martinez', sortOrder: 0 },
      { name: 'Carlos Rivera', sortOrder: 1 },
      { name: 'Frank White', sortOrder: 2 },
      { name: 'Henry Brown', sortOrder: 3 },
    ];
    const now = Date.now();
    for (const tl of defaultTeamLeads) {
      const id = randomUUID();
      await pool.request()
        .input('id',        NV(36),  id)
        .input('name',      NV(255), tl.name)
        .input('sortOrder', INT,     tl.sortOrder)
        .input('createdAt', BIG,     now)
        .query(`INSERT INTO team_leads (id,name,sortOrder,createdAt)
                VALUES (@id,@name,@sortOrder,@createdAt)`);
    }
  }

  // Create brd_tech_leads table
  await pool.request().query(`
    IF NOT EXISTS (SELECT * FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME = 'brd_tech_leads')
    CREATE TABLE brd_tech_leads (
      id        NVARCHAR(36)  PRIMARY KEY,
      brdId     NVARCHAR(36)  NOT NULL,
      teamLeadId NVARCHAR(36) NOT NULL,
      expertise NVARCHAR(255),
      sortOrder INT           NOT NULL DEFAULT 0,
      createdAt BIGINT,
      CONSTRAINT FK_brd_tech_leads_brds FOREIGN KEY (brdId)
        REFERENCES brds(id) ON DELETE CASCADE,
      CONSTRAINT FK_brd_tech_leads_team_leads FOREIGN KEY (teamLeadId)
        REFERENCES team_leads(id) ON DELETE CASCADE,
      CONSTRAINT UQ_brd_tech_lead UNIQUE (brdId, teamLeadId)
    )
  `);

  // Create tshirt_sizes table
  await pool.request().query(`
    IF NOT EXISTS (SELECT * FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME = 'tshirt_sizes')
    CREATE TABLE tshirt_sizes (
      id          NVARCHAR(36)  PRIMARY KEY,
      value       NVARCHAR(10)  NOT NULL,
      label       NVARCHAR(50)  NOT NULL,
      minDays     INT,
      maxDays     INT,
      description NVARCHAR(MAX),
      risk        NVARCHAR(50),
      color       NVARCHAR(7)   NOT NULL DEFAULT '#3b82f6',
      sortOrder   INT           NOT NULL DEFAULT 0,
      createdAt   BIGINT,
      CONSTRAINT UQ_tshirt_sizes_value UNIQUE (value)
    )
  `);

  // Seed tshirt_sizes defaults if empty
  const { recordset: [{ tsCnt }] } = await pool.request()
    .query('SELECT COUNT(*) AS tsCnt FROM tshirt_sizes');
  if (tsCnt === 0) {
    const defaultSizes = [
      { value: 'XS',  label: 'XS',  minDays: null, maxDays: 10,   description: 'Very small feature. Minimal effort, very low risk. No dependencies.',                                                                 risk: 'Very Low',  color: '#10b981', sortOrder: 0 },
      { value: 'S',   label: 'S',   minDays: null, maxDays: 20,   description: 'Simple and isolated task. Clear scope. Might require 1–2 people.',                                                                    risk: 'Low',       color: '#3b82f6', sortOrder: 1 },
      { value: 'M',   label: 'M',   minDays: 20,   maxDays: 40,   description: 'Moderate effort. Might require collaboration across team members. Some complexity or testing.',                                        risk: 'Medium',    color: '#f59e0b', sortOrder: 2 },
      { value: 'L',   label: 'L',   minDays: 40,   maxDays: 60,   description: 'Complex features. Cross-functional work. May involve back-end, front-end, QA, or coordination. Moderate risk.',                      risk: 'Moderate',  color: '#f97316', sortOrder: 3 },
      { value: 'XL',  label: 'XL',  minDays: 60,   maxDays: 100,  description: 'Large initiative. Many moving parts or dependencies. Needs coordination across teams. Higher risk.',                                  risk: 'High',      color: '#ef4444', sortOrder: 4 },
      { value: 'XXL', label: 'XXL', minDays: 100,  maxDays: null, description: 'Epic-level work. Needs to be broken down. Too big to plan effectively as-is. High uncertainty.',                                      risk: 'Very High', color: '#7c3aed', sortOrder: 5 },
    ];
    const now2 = Date.now();
    for (const s of defaultSizes) {
      const id = randomUUID();
      await pool.request()
        .input('id',          NV(36),  id)
        .input('value',       NV(10),  s.value)
        .input('label',       NV(50),  s.label)
        .input('minDays',     INT,     s.minDays)
        .input('maxDays',     INT,     s.maxDays)
        .input('description', NV(),    s.description)
        .input('risk',        NV(50),  s.risk)
        .input('color',       NV(7),   s.color)
        .input('sortOrder',   INT,     s.sortOrder)
        .input('createdAt',   BIG,     now2)
        .query(`INSERT INTO tshirt_sizes (id,value,label,minDays,maxDays,description,risk,color,sortOrder,createdAt)
                VALUES (@id,@value,@label,@minDays,@maxDays,@description,@risk,@color,@sortOrder,@createdAt)`);
    }
  }

  // Create dev_members table
  await pool.request().query(`
    IF NOT EXISTS (SELECT * FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME = 'dev_members')
    CREATE TABLE dev_members (
      id        NVARCHAR(36)  PRIMARY KEY,
      name      NVARCHAR(255) NOT NULL,
      team      NVARCHAR(50)  NOT NULL DEFAULT 'FE',
      sortOrder INT           NOT NULL DEFAULT 0,
      createdAt BIGINT
    )
  `);
  // Seed dev_members defaults if empty
  const { recordset: [{ dmCnt }] } = await pool.request()
    .query('SELECT COUNT(*) AS dmCnt FROM dev_members');
  if (dmCnt === 0) {
    const defaultDevs = [
      { name: 'Eric',    team: 'BE', sortOrder: 0 },
      { name: 'Eloisa',  team: 'FE', sortOrder: 1 },
      { name: 'Marco',   team: 'FE', sortOrder: 2 },
      { name: 'Jessie',  team: 'FE', sortOrder: 3 },
      { name: 'Cristian',team: 'FE', sortOrder: 4 },
      { name: 'Russel',  team: 'FE', sortOrder: 5 },
      { name: 'Yves',    team: 'FE', sortOrder: 6 },
    ];
    const dmNow = Date.now();
    for (const d of defaultDevs) {
      await pool.request()
        .input('id',        NV(36),  randomUUID())
        .input('name',      NV(255), d.name)
        .input('team',      NV(50),  d.team)
        .input('sortOrder', INT,     d.sortOrder)
        .input('createdAt', BIG,     dmNow)
        .query(`INSERT INTO dev_members (id,name,team,sortOrder,createdAt)
                VALUES (@id,@name,@team,@sortOrder,@createdAt)`);
    }
  }

  // Create pm_notes table
  await pool.request().query(`
    IF NOT EXISTS (SELECT * FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME = 'pm_notes')
    CREATE TABLE pm_notes (
      id        NVARCHAR(36)  PRIMARY KEY,
      title     NVARCHAR(255) NOT NULL DEFAULT '',
      content   NVARCHAR(MAX),
      quarter   NVARCHAR(5),
      year      INT,
      sprint    NVARCHAR(20),
      priority  NVARCHAR(20)  NOT NULL DEFAULT 'medium',
      status    NVARCHAR(20)  NOT NULL DEFAULT 'todo',
      brdId     NVARCHAR(MAX),
      createdAt BIGINT,
      updatedAt BIGINT
    )
  `);
  // Migrate existing brdId column from NVARCHAR(36) to NVARCHAR(MAX) to support JSON arrays
  await pool.request().query(`
    IF EXISTS (
      SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_NAME = 'pm_notes' AND COLUMN_NAME = 'brdId' AND CHARACTER_MAXIMUM_LENGTH = 36
    )
    ALTER TABLE pm_notes ALTER COLUMN brdId NVARCHAR(MAX)
  `);

  // Seed if empty
  const { recordset: [{ cnt }] } = await pool.request()
    .query('SELECT COUNT(*) AS cnt FROM brds');
  if (cnt > 0) return;

  const now = Date.now();
  const samples = [
    { title: 'User Authentication Module', description: 'Implement OAuth2 login with Google and GitHub', quarter: 'Q1', year: 2025, sprintStart: '1', sprintEnd: '2', status: 'launched', baName: 'Alice Chen', techLead: 'Bob Martinez', tshirtSize: 'M' },
    { title: 'Dashboard Analytics', description: 'Real-time charts for KPI tracking', quarter: 'Q1', year: 2025, sprintStart: '3', sprintEnd: '4', status: 'launched', baName: 'Diana Lee', techLead: 'Carlos Rivera', tshirtSize: 'L' },
    { title: 'Mobile Responsive UI', description: 'Redesign for mobile-first approach', quarter: 'Q2', year: 2025, sprintStart: '5', sprintEnd: '6', status: 'testing', baName: 'Eve Johnson', techLead: 'Frank White', tshirtSize: 'S' },
    { title: 'Payment Integration', description: 'Stripe + PayPal gateway integration', quarter: 'Q2', year: 2025, sprintStart: '9', sprintEnd: '10', status: 'in_progress', baName: 'Grace Kim', techLead: 'Henry Brown', tshirtSize: 'XL' },
  ];

  const brdIds = [];
  for (let i = 0; i < samples.length; i++) {
    const id = randomUUID();
    brdIds.push(id);
    await _insertBRD({ id, ...samples[i], googleDocsLink: '', jiraLink: '', bugLogLink: '', createdAt: now - (4 - i) * 1e6, updatedAt: now });
  }

  const bugs = [
    { brdId: brdIds[0], title: 'Login redirect fails on mobile', criteria: 'code_logic_issue', severity: 'high', status: 'resolved' },
    { brdId: brdIds[0], title: 'Token expiry not handled', criteria: 'missed_requirements', severity: 'medium', status: 'closed' },
    { brdId: brdIds[1], title: 'Chart flickers on data update', criteria: 'code_logic_issue', severity: 'low', status: 'open' },
  ];
  for (const bug of bugs) {
    await _insertBug({ id: randomUUID(), ...bug, description: '', createdAt: now });
  }
}

// ─── DB helpers ───────────────────────────────────────────────────────────────
async function _insertBRD(b) {
  await pool.request()
    .input('id', NV(36), b.id)
    .input('title', NV(255), b.title || '')
    .input('description', NV(), b.description || '')
    .input('quarter', NV(5), b.quarter || 'Q1')
    .input('year', INT, b.year || new Date().getFullYear())
    .input('sprintStart', NV(20), b.sprintStart || '')
    .input('sprintEnd', NV(20), b.sprintEnd || '')
    .input('status', NV(50), b.status || 'planning')
    .input('googleDocsLink', NV(), b.googleDocsLink || '')
    .input('jiraLink', NV(), b.jiraLink || '')
    .input('bugLogLink', NV(), b.bugLogLink || '')
    .input('baName', NV(255), b.baName || '')
    .input('techLead', NV(255), b.techLead || '')
    .input('tshirtSize', NV(10), b.tshirtSize || '')
    .input('extendedQuarters', NV(), b.extendedQuarters || null)
    .input('beTicket', NV(), b.beTicket || null)
    .input('feTicket', NV(), b.feTicket || null)
    .input('anciliaryTicket', NV(), b.anciliaryTicket || null)
    .input('rndTicket', NV(), b.rndTicket || null)
    .input('devAssignee', NV(), b.devAssignee || '')
    .input('createdAt', BIG, b.createdAt)
    .input('updatedAt', BIG, b.updatedAt)
    .query(`INSERT INTO brds
      (id,title,description,quarter,year,sprintStart,sprintEnd,status,
       googleDocsLink,jiraLink,bugLogLink,baName,techLead,tshirtSize,extendedQuarters,
       beTicket,feTicket,anciliaryTicket,rndTicket,devAssignee,createdAt,updatedAt)
      VALUES
      (@id,@title,@description,@quarter,@year,@sprintStart,@sprintEnd,@status,
       @googleDocsLink,@jiraLink,@bugLogLink,@baName,@techLead,@tshirtSize,@extendedQuarters,
       @beTicket,@feTicket,@anciliaryTicket,@rndTicket,@devAssignee,@createdAt,@updatedAt)`);
}

async function _insertBug(bug) {
  await pool.request()
    .input('id', NV(36), bug.id)
    .input('brdId', NV(36), bug.brdId || '')
    .input('title', NV(255), bug.title || '')
    .input('criteria', NV(100), bug.criteria || '')
    .input('severity', NV(50), bug.severity || 'medium')
    .input('description', NV(), bug.description || '')
    .input('status', NV(50), bug.status || 'open')
    .input('jiraLink', NV(), bug.jiraLink || '')
    .input('rootCause', NV(), bug.rootCause || '')
    .input('storyTicket', NV(), bug.storyTicket || null)
    .input('createdAt', BIG, bug.createdAt)
    .query(`INSERT INTO bugs (id,brdId,title,criteria,severity,description,status,jiraLink,rootCause,storyTicket,createdAt)
            VALUES (@id,@brdId,@title,@criteria,@severity,@description,@status,@jiraLink,@rootCause,@storyTicket,@createdAt)`);
}

// ─── Health ───────────────────────────────────────────────────────────────────
app.get('/api/health', (req, res) => res.json({ status: 'ok', engine: 'MSSQL' }));

// ─── BRDs ─────────────────────────────────────────────────────────────────────
app.get('/api/brds', async (req, res) => {
  try {
    const { recordset } = await pool.request()
      .query('SELECT * FROM brds ORDER BY createdAt DESC');
    res.json(recordset);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/brds/:id', async (req, res) => {
  try {
    const { recordset } = await pool.request()
      .input('id', NV(36), req.params.id)
      .query('SELECT * FROM brds WHERE id = @id');
    recordset.length ? res.json(recordset[0]) : res.status(404).json({ error: 'Not found' });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/brds', async (req, res) => {
  try {
    const now = Date.now();
    const id = randomUUID();
    await _insertBRD({ id, ...req.body, createdAt: now, updatedAt: now });
    res.json({ id, ...req.body, createdAt: now, updatedAt: now });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.put('/api/brds/:id', async (req, res) => {
  try {
    const now = Date.now();
    const b = req.body;
    await pool.request()
      .input('id', NV(36), req.params.id)
      .input('title', NV(255), b.title || '')
      .input('description', NV(), b.description || '')
      .input('quarter', NV(5), b.quarter || 'Q1')
      .input('year', INT, b.year || new Date().getFullYear())
      .input('sprintStart', NV(20), b.sprintStart || '')
      .input('sprintEnd', NV(20), b.sprintEnd || '')
      .input('status', NV(50), b.status || 'planning')
      .input('googleDocsLink', NV(), b.googleDocsLink || '')
      .input('jiraLink', NV(), b.jiraLink || '')
      .input('bugLogLink', NV(), b.bugLogLink || '')
      .input('baName', NV(255), b.baName || '')
      .input('techLead', NV(255), b.techLead || '')
      .input('tshirtSize', NV(10), b.tshirtSize || '')
      .input('extendedQuarters', NV(), b.extendedQuarters || null)
      .input('beTicket', NV(), b.beTicket || null)
      .input('feTicket', NV(), b.feTicket || null)
      .input('anciliaryTicket', NV(), b.anciliaryTicket || null)
      .input('rndTicket', NV(), b.rndTicket || null)
      .input('devAssignee', NV(), b.devAssignee || '')
      .input('updatedAt', BIG, now)
      .query(`UPDATE brds SET
        title=@title, description=@description, quarter=@quarter, year=@year,
        sprintStart=@sprintStart, sprintEnd=@sprintEnd, status=@status,
        googleDocsLink=@googleDocsLink, jiraLink=@jiraLink, bugLogLink=@bugLogLink,
        baName=@baName, techLead=@techLead, tshirtSize=@tshirtSize,
        extendedQuarters=@extendedQuarters,
        beTicket=@beTicket, feTicket=@feTicket, anciliaryTicket=@anciliaryTicket, rndTicket=@rndTicket,
        devAssignee=@devAssignee,
        updatedAt=@updatedAt
        WHERE id=@id`);
    res.json({ id: req.params.id, ...b, updatedAt: now });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.delete('/api/brds/:id', async (req, res) => {
  try {
    await pool.request().input('id', NV(36), req.params.id)
      .query('DELETE FROM brds WHERE id = @id');
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ─── Bugs ─────────────────────────────────────────────────────────────────────
app.get('/api/bugs', async (req, res) => {
  try {
    const { recordset } = await pool.request()
      .query('SELECT * FROM bugs ORDER BY createdAt DESC');
    res.json(recordset);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/bugs/brd/:brdId', async (req, res) => {
  try {
    const { recordset } = await pool.request()
      .input('brdId', NV(36), req.params.brdId)
      .query('SELECT * FROM bugs WHERE brdId = @brdId ORDER BY createdAt DESC');
    res.json(recordset);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/bugs', async (req, res) => {
  try {
    const id = randomUUID();
    const createdAt = Date.now();
    await _insertBug({ id, ...req.body, createdAt });
    res.json({ id, ...req.body, createdAt });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.put('/api/bugs/:id', async (req, res) => {
  try {
    const b = req.body;
    await pool.request()
      .input('id', NV(36), req.params.id)
      .input('title', NV(255), b.title || '')
      .input('criteria', NV(100), b.criteria || '')
      .input('severity', NV(50), b.severity || 'medium')
      .input('description', NV(), b.description || '')
      .input('status', NV(50), b.status || 'open')
      .input('jiraLink', NV(), b.jiraLink || '')
      .input('rootCause', NV(), b.rootCause || '')
      .input('storyTicket', NV(), b.storyTicket || null)
      .query(`UPDATE bugs SET title=@title, criteria=@criteria, severity=@severity,
              description=@description, status=@status, jiraLink=@jiraLink, rootCause=@rootCause,
              storyTicket=@storyTicket
              WHERE id=@id`);
    res.json({ id: req.params.id, ...b });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.delete('/api/bugs/:id', async (req, res) => {
  try {
    await pool.request().input('id', NV(36), req.params.id)
      .query('DELETE FROM bugs WHERE id = @id');
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ─── Bug Criteria ──────────────────────────────────────────────────────────────
app.get('/api/criteria', async (req, res) => {
  try {
    const { recordset } = await pool.request()
      .query('SELECT * FROM bug_criteria ORDER BY sortOrder ASC, createdAt ASC');
    res.json(recordset);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/criteria', async (req, res) => {
  try {
    const { label, value, color, description, sortOrder } = req.body;
    if (!label || !value) return res.status(400).json({ error: 'label and value are required' });
    const id = randomUUID();
    const createdAt = Date.now();
    await pool.request()
      .input('id',          NV(36),  id)
      .input('value',       NV(100), value)
      .input('label',       NV(255), label)
      .input('color',       NV(20),  color || '#3b82f6')
      .input('description', NV(),    description || '')
      .input('sortOrder',   INT,     sortOrder ?? 99)
      .input('createdAt',   BIG,     createdAt)
      .query(`INSERT INTO bug_criteria (id,value,label,color,description,sortOrder,createdAt)
              VALUES (@id,@value,@label,@color,@description,@sortOrder,@createdAt)`);
    res.json({ id, value, label, color, description, sortOrder, createdAt });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.put('/api/criteria/:id', async (req, res) => {
  try {
    const { label, color, description, sortOrder } = req.body;
    await pool.request()
      .input('id',          NV(36),  req.params.id)
      .input('label',       NV(255), label || '')
      .input('color',       NV(20),  color || '#3b82f6')
      .input('description', NV(),    description || '')
      .input('sortOrder',   INT,     sortOrder ?? 0)
      .query(`UPDATE bug_criteria SET label=@label, color=@color,
              description=@description, sortOrder=@sortOrder WHERE id=@id`);
    res.json({ id: req.params.id, ...req.body });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.delete('/api/criteria/:id', async (req, res) => {
  try {
    const { recordset: rows } = await pool.request()
      .input('id', NV(36), req.params.id)
      .query('SELECT value FROM bug_criteria WHERE id = @id');
    if (!rows.length) return res.status(404).json({ error: 'Not found' });

    const { value } = rows[0];
    const { recordset: [{ bugCount }] } = await pool.request()
      .input('criteria', NV(100), value)
      .query('SELECT COUNT(*) AS bugCount FROM bugs WHERE criteria = @criteria');

    if (bugCount > 0) {
      return res.status(409).json({ error: `Cannot delete: ${bugCount} bug(s) use this criterion`, bugCount });
    }

    await pool.request().input('id', NV(36), req.params.id)
      .query('DELETE FROM bug_criteria WHERE id = @id');
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ─── Team Leads ────────────────────────────────────────────────────────────────
app.get('/api/teamleads', async (req, res) => {
  try {
    const { recordset } = await pool.request()
      .query('SELECT * FROM team_leads ORDER BY sortOrder ASC, createdAt ASC');
    res.json(recordset);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/teamleads', async (req, res) => {
  try {
    const { name, sortOrder } = req.body;
    if (!name) return res.status(400).json({ error: 'name is required' });
    const id = randomUUID();
    const createdAt = Date.now();
    await pool.request()
      .input('id',        NV(36),  id)
      .input('name',      NV(255), name)
      .input('sortOrder', INT,     sortOrder ?? 99)
      .input('createdAt', BIG,     createdAt)
      .query(`INSERT INTO team_leads (id,name,sortOrder,createdAt)
              VALUES (@id,@name,@sortOrder,@createdAt)`);
    res.json({ id, name, sortOrder, createdAt });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.put('/api/teamleads/:id', async (req, res) => {
  try {
    const { name, sortOrder } = req.body;
    await pool.request()
      .input('id',        NV(36),  req.params.id)
      .input('name',      NV(255), name || '')
      .input('sortOrder', INT,     sortOrder ?? 0)
      .query(`UPDATE team_leads SET name=@name, sortOrder=@sortOrder WHERE id=@id`);
    res.json({ id: req.params.id, ...req.body });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.delete('/api/teamleads/:id', async (req, res) => {
  try {
    const { recordset: rows } = await pool.request()
      .input('id', NV(36), req.params.id)
      .query('SELECT name FROM team_leads WHERE id = @id');
    if (!rows.length) return res.status(404).json({ error: 'Not found' });

    const { name } = rows[0];
    const { recordset: [{ brdCount }] } = await pool.request()
      .input('teamLeadId', NV(36), req.params.id)
      .query('SELECT COUNT(*) AS brdCount FROM brd_tech_leads WHERE teamLeadId = @teamLeadId');

    if (brdCount > 0) {
      return res.status(409).json({ error: `Cannot delete: ${brdCount} BRD(s) use this tech lead`, brdCount });
    }

    await pool.request().input('id', NV(36), req.params.id)
      .query('DELETE FROM team_leads WHERE id = @id');
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ─── Dev Members ───────────────────────────────────────────────────────────────
app.get('/api/dev-members', async (_req, res) => {
  try {
    const { recordset } = await pool.request()
      .query('SELECT * FROM dev_members ORDER BY team ASC, sortOrder ASC, createdAt ASC');
    res.json(recordset);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/dev-members', async (req, res) => {
  try {
    const { name, team, sortOrder } = req.body;
    if (!name) return res.status(400).json({ error: 'name is required' });
    const id = randomUUID();
    const createdAt = Date.now();
    await pool.request()
      .input('id',        NV(36),  id)
      .input('name',      NV(255), name)
      .input('team',      NV(50),  team || 'FE')
      .input('sortOrder', INT,     sortOrder ?? 99)
      .input('createdAt', BIG,     createdAt)
      .query(`INSERT INTO dev_members (id,name,team,sortOrder,createdAt)
              VALUES (@id,@name,@team,@sortOrder,@createdAt)`);
    res.json({ id, name, team: team || 'FE', sortOrder, createdAt });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.put('/api/dev-members/:id', async (req, res) => {
  try {
    const { name, team, sortOrder } = req.body;
    await pool.request()
      .input('id',        NV(36),  req.params.id)
      .input('name',      NV(255), name || '')
      .input('team',      NV(50),  team || 'FE')
      .input('sortOrder', INT,     sortOrder ?? 0)
      .query(`UPDATE dev_members SET name=@name, team=@team, sortOrder=@sortOrder WHERE id=@id`);
    res.json({ id: req.params.id, ...req.body });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.delete('/api/dev-members/:id', async (req, res) => {
  try {
    await pool.request()
      .input('id', NV(36), req.params.id)
      .query('DELETE FROM dev_members WHERE id = @id');
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ─── BRD Tech Leads ────────────────────────────────────────────────────────────
app.get('/api/brd-tech-leads', async (_req, res) => {
  try {
    const { recordset } = await pool.request().query(`
      SELECT btl.id, btl.brdId, btl.teamLeadId, tl.name, btl.expertise, btl.sortOrder, btl.createdAt
      FROM brd_tech_leads btl
      JOIN team_leads tl ON btl.teamLeadId = tl.id
      ORDER BY btl.brdId, btl.sortOrder ASC
    `);
    res.json(recordset);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/brd-tech-leads/:brdId', async (req, res) => {
  try {
    const { recordset } = await pool.request()
      .input('brdId', NV(36), req.params.brdId)
      .query(`
        SELECT btl.id, btl.brdId, btl.teamLeadId, tl.name, btl.expertise, btl.sortOrder, btl.createdAt
        FROM brd_tech_leads btl
        JOIN team_leads tl ON btl.teamLeadId = tl.id
        WHERE btl.brdId = @brdId
        ORDER BY btl.sortOrder ASC
      `);
    res.json(recordset);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ─── T-Shirt Sizes ────────────────────────────────────────────────────────────
app.get('/api/tshirt-sizes', async (req, res) => {
  try {
    const { recordset } = await pool.request()
      .query('SELECT * FROM tshirt_sizes ORDER BY sortOrder ASC');
    res.json(recordset);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/tshirt-sizes', async (req, res) => {
  try {
    const { value, label, minDays, maxDays, description, risk, color, sortOrder } = req.body;
    if (!value || !label) return res.status(400).json({ error: 'value and label are required' });
    const id = randomUUID();
    const createdAt = Date.now();
    await pool.request()
      .input('id',          NV(36),  id)
      .input('value',       NV(10),  value)
      .input('label',       NV(50),  label)
      .input('minDays',     INT,     minDays ?? null)
      .input('maxDays',     INT,     maxDays ?? null)
      .input('description', NV(),    description || '')
      .input('risk',        NV(50),  risk || '')
      .input('color',       NV(7),   color || '#3b82f6')
      .input('sortOrder',   INT,     sortOrder ?? 0)
      .input('createdAt',   BIG,     createdAt)
      .query(`INSERT INTO tshirt_sizes (id,value,label,minDays,maxDays,description,risk,color,sortOrder,createdAt)
              VALUES (@id,@value,@label,@minDays,@maxDays,@description,@risk,@color,@sortOrder,@createdAt)`);
    res.json({ id, value, label, minDays, maxDays, description, risk, color, sortOrder, createdAt });
  } catch (e) {
    if (e.message.includes('UQ_tshirt_sizes_value')) return res.status(409).json({ error: 'A size with this value already exists' });
    res.status(500).json({ error: e.message });
  }
});

app.put('/api/tshirt-sizes/:id', async (req, res) => {
  try {
    const { label, minDays, maxDays, description, risk, color, sortOrder } = req.body;
    await pool.request()
      .input('id',          NV(36),  req.params.id)
      .input('label',       NV(50),  label)
      .input('minDays',     INT,     minDays ?? null)
      .input('maxDays',     INT,     maxDays ?? null)
      .input('description', NV(),    description || '')
      .input('risk',        NV(50),  risk || '')
      .input('color',       NV(7),   color || '#3b82f6')
      .input('sortOrder',   INT,     sortOrder ?? 0)
      .query(`UPDATE tshirt_sizes SET label=@label, minDays=@minDays, maxDays=@maxDays,
              description=@description, risk=@risk, color=@color, sortOrder=@sortOrder
              WHERE id=@id`);
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.delete('/api/tshirt-sizes/:id', async (req, res) => {
  try {
    const { recordset: rows } = await pool.request()
      .input('id', NV(36), req.params.id)
      .query('SELECT value FROM tshirt_sizes WHERE id = @id');
    if (!rows.length) return res.status(404).json({ error: 'Not found' });

    const { value } = rows[0];
    const { recordset: [{ brdCount }] } = await pool.request()
      .input('tshirtSize', NV(10), value)
      .query('SELECT COUNT(*) AS brdCount FROM brds WHERE tshirtSize = @tshirtSize');

    if (brdCount > 0) {
      return res.status(409).json({ error: `Cannot delete: ${brdCount} BRD(s) use this size`, brdCount });
    }

    await pool.request().input('id', NV(36), req.params.id)
      .query('DELETE FROM tshirt_sizes WHERE id = @id');
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ─── PM Notes ─────────────────────────────────────────────────────────────────
app.get('/api/pm-notes', async (req, res) => {
  try {
    const { recordset } = await pool.request()
      .query('SELECT * FROM pm_notes ORDER BY createdAt DESC');
    res.json(recordset);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/pm-notes', async (req, res) => {
  try {
    const { title, content, quarter, year, sprint, priority, status, brdId } = req.body;
    const id = randomUUID();
    const now = Date.now();
    await pool.request()
      .input('id',        NV(36),  id)
      .input('title',     NV(255), title || '')
      .input('content',   NV(),    content || '')
      .input('quarter',   NV(5),   quarter || null)
      .input('year',      INT,     year || new Date().getFullYear())
      .input('sprint',    NV(20),  sprint || null)
      .input('priority',  NV(20),  priority || 'medium')
      .input('status',    NV(20),  status || 'todo')
      .input('brdId',     NV(),    brdId || null)
      .input('createdAt', BIG,     now)
      .input('updatedAt', BIG,     now)
      .query(`INSERT INTO pm_notes (id,title,content,quarter,year,sprint,priority,status,brdId,createdAt,updatedAt)
              VALUES (@id,@title,@content,@quarter,@year,@sprint,@priority,@status,@brdId,@createdAt,@updatedAt)`);
    res.json({ id, title, content, quarter, year, sprint, priority, status, brdId, createdAt: now, updatedAt: now });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.put('/api/pm-notes/:id', async (req, res) => {
  try {
    const { title, content, quarter, year, sprint, priority, status, brdId } = req.body;
    const updatedAt = Date.now();
    await pool.request()
      .input('id',        NV(36),  req.params.id)
      .input('title',     NV(255), title || '')
      .input('content',   NV(),    content || '')
      .input('quarter',   NV(5),   quarter || null)
      .input('year',      INT,     year || new Date().getFullYear())
      .input('sprint',    NV(20),  sprint || null)
      .input('priority',  NV(20),  priority || 'medium')
      .input('status',    NV(20),  status || 'todo')
      .input('brdId',     NV(),    brdId || null)
      .input('updatedAt', BIG,     updatedAt)
      .query(`UPDATE pm_notes SET title=@title,content=@content,quarter=@quarter,year=@year,
              sprint=@sprint,priority=@priority,status=@status,brdId=@brdId,updatedAt=@updatedAt
              WHERE id=@id`);
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.delete('/api/pm-notes/:id', async (req, res) => {
  try {
    await pool.request().input('id', NV(36), req.params.id)
      .query('DELETE FROM pm_notes WHERE id = @id');
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/brd-tech-leads', async (req, res) => {
  try {
    const { brdId, teamLeadId, expertise } = req.body;
    const id = randomUUID();
    const createdAt = Date.now();

    // Get max sortOrder for this BRD
    const { recordset: [{ maxSort }] } = await pool.request()
      .input('brdId', NV(36), brdId)
      .query('SELECT ISNULL(MAX(sortOrder), -1) AS maxSort FROM brd_tech_leads WHERE brdId = @brdId');

    const sortOrder = maxSort + 1;

    await pool.request()
      .input('id', NV(36), id)
      .input('brdId', NV(36), brdId)
      .input('teamLeadId', NV(36), teamLeadId)
      .input('expertise', NV(255), expertise || '')
      .input('sortOrder', INT, sortOrder)
      .input('createdAt', BIG, createdAt)
      .query(`INSERT INTO brd_tech_leads (id, brdId, teamLeadId, expertise, sortOrder, createdAt)
              VALUES (@id, @brdId, @teamLeadId, @expertise, @sortOrder, @createdAt)`);

    res.json({ id, brdId, teamLeadId, expertise, sortOrder, createdAt });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.put('/api/brd-tech-leads/:id', async (req, res) => {
  try {
    const { expertise } = req.body;
    await pool.request()
      .input('id', NV(36), req.params.id)
      .input('expertise', NV(255), expertise || '')
      .query('UPDATE brd_tech_leads SET expertise = @expertise WHERE id = @id');
    res.json({ id: req.params.id, expertise });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.delete('/api/brd-tech-leads/:id', async (req, res) => {
  try {
    await pool.request()
      .input('id', NV(36), req.params.id)
      .query('DELETE FROM brd_tech_leads WHERE id = @id');
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.put('/api/brd-tech-leads/reorder/:brdId', async (req, res) => {
  try {
    const { order } = req.body; // [{id, sortOrder}, ...]
    for (const item of order) {
      await pool.request()
        .input('id', NV(36), item.id)
        .input('sortOrder', INT, item.sortOrder)
        .query('UPDATE brd_tech_leads SET sortOrder = @sortOrder WHERE id = @id');
    }
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ─── SQL Explorer ─────────────────────────────────────────────────────────────
app.post('/api/query', async (req, res) => {
  try {
    const { sql: sqlStr } = req.body;
    if (!sqlStr) return res.status(400).json({ error: 'No SQL provided' });
    const result = await pool.request().query(sqlStr);
    const rs = result.recordset;
    if (rs && rs.columns) {
      const columns = Object.keys(rs.columns);
      const rows = rs.map((r) => columns.map((c) => r[c] ?? null));
      res.json({ columns, rows });
    } else if (rs && rs.length > 0) {
      const columns = Object.keys(rs[0]);
      const rows = rs.map((r) => columns.map((c) => r[c] ?? null));
      res.json({ columns, rows });
    } else {
      res.json({ columns: [], rows: [], rowsAffected: result.rowsAffected?.[0] || 0 });
    }
  } catch (e) { res.status(200).json({ error: e.message }); }
});

// ─── Export / Import ──────────────────────────────────────────────────────────
app.get('/api/export', async (req, res) => {
  try {
    const { recordset: brds } = await pool.request().query('SELECT * FROM brds ORDER BY createdAt');
    const { recordset: bugs } = await pool.request().query('SELECT * FROM bugs ORDER BY createdAt');
    res.json({ brds, bugs });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/import', async (req, res) => {
  try {
    const { brds = [], bugs = [] } = req.body;
    const transaction = new sql.Transaction(pool);
    await transaction.begin();
    try {
      await new sql.Request(transaction).query('DELETE FROM bugs');
      await new sql.Request(transaction).query('DELETE FROM brds');
      for (const b of brds) {
        await new sql.Request(transaction)
          .input('id', NV(36), b.id || randomUUID())
          .input('title', NV(255), b.title || '')
          .input('description', NV(), b.description || '')
          .input('quarter', NV(5), b.quarter || 'Q1')
          .input('year', INT, b.year || 2025)
          .input('sprintStart', NV(20), b.sprintStart || b.sprint || '')
          .input('sprintEnd', NV(20), b.sprintEnd || '')
          .input('status', NV(50), b.status || 'planning')
          .input('googleDocsLink', NV(), b.googleDocsLink || '')
          .input('jiraLink', NV(), b.jiraLink || '')
          .input('bugLogLink', NV(), b.bugLogLink || '')
          .input('baName', NV(255), b.baName || '')
          .input('techLead', NV(255), b.techLead || '')
          .input('tshirtSize', NV(10), b.tshirtSize || '')
          .input('createdAt', BIG, b.createdAt || Date.now())
          .input('updatedAt', BIG, b.updatedAt || Date.now())
          .query(`INSERT INTO brds
            (id,title,description,quarter,year,sprintStart,sprintEnd,status,
             googleDocsLink,jiraLink,bugLogLink,baName,techLead,tshirtSize,createdAt,updatedAt)
            VALUES
            (@id,@title,@description,@quarter,@year,@sprintStart,@sprintEnd,@status,
             @googleDocsLink,@jiraLink,@bugLogLink,@baName,@techLead,@tshirtSize,@createdAt,@updatedAt)`);
      }
      for (const bug of bugs) {
        await new sql.Request(transaction)
          .input('id', NV(36), bug.id || randomUUID())
          .input('brdId', NV(36), bug.brdId || '')
          .input('title', NV(255), bug.title || '')
          .input('criteria', NV(100), bug.criteria || '')
          .input('severity', NV(50), bug.severity || 'medium')
          .input('description', NV(), bug.description || '')
          .input('status', NV(50), bug.status || 'open')
          .input('createdAt', BIG, bug.createdAt || Date.now())
          .query(`INSERT INTO bugs (id,brdId,title,criteria,severity,description,status,createdAt)
                  VALUES (@id,@brdId,@title,@criteria,@severity,@description,@status,@createdAt)`);
      }
      await transaction.commit();
      res.json({ ok: true, brds: brds.length, bugs: bugs.length });
    } catch (e) {
      await transaction.rollback();
      throw e;
    }
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ─── Migrate from localStorage ────────────────────────────────────────────────
app.post('/api/migrate', async (req, res) => {
  try {
    const { brds = [], bugs = [] } = req.body;
    let brdCount = 0, bugCount = 0;
    for (const b of brds) {
      const { recordset } = await pool.request()
        .input('id', NV(36), b.id).query('SELECT id FROM brds WHERE id = @id');
      if (!recordset.length) { await _insertBRD({ ...b, sprintStart: b.sprintStart || b.sprint || '', updatedAt: b.updatedAt || Date.now() }); brdCount++; }
    }
    for (const bug of bugs) {
      const { recordset } = await pool.request()
        .input('id', NV(36), bug.id).query('SELECT id FROM bugs WHERE id = @id');
      if (!recordset.length) { await _insertBug(bug); bugCount++; }
    }
    res.json({ ok: true, brds: brdCount, bugs: bugCount });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ─── Start ────────────────────────────────────────────────────────────────────
init()
  .then(() => {
    app.listen(PORT, () => {
      console.log(`\n  BRD Insight API  →  http://localhost:${PORT}/api/health`);
      console.log(`  Database         →  ${DB_HOST}${DB_INSTANCE ? '\\' + DB_INSTANCE : ':' + DB_PORT}/${DB_NAME}`);
      console.log(`  Auth             →  ${(DB_TRUSTED || !DB_USER) ? 'Windows Authentication' : `SQL Server (${DB_USER})`}\n`);
    });
  })
  .catch((err) => {
    console.error('\n  ✗ Failed to connect to SQL Server:', err.message);
    console.error('  Check your .env file and make sure SQL Server is running.\n');
    process.exit(1);
  });
