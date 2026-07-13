import express from 'express';
import cors from 'cors';
import sql from 'mssql';
import { randomUUID, createHash } from 'crypto';
import { config as dotenv } from 'dotenv';
import Anthropic from '@anthropic-ai/sdk';
import { readFileSync, existsSync, writeFileSync } from 'fs';
import { join, resolve } from 'path';

dotenv(); // must run before any process.env reads below

const LOCAL_BACKUP_PATH = resolve('./brd-local-backup.json');
const GOOGLE_TOKENS_PATH = resolve('./google-tokens.json');

// ─── Google OAuth2 ─────────────────────────────────────────────────────────────
const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID || '';
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET || '';
const GOOGLE_REDIRECT_URI = `http://localhost:${process.env.PORT || 3001}/api/google/callback`;
const GOOGLE_SCOPE = 'openid email https://www.googleapis.com/auth/drive.readonly';

let googleTokens = null;

function loadGoogleTokens() {
  try {
    if (existsSync(GOOGLE_TOKENS_PATH)) {
      googleTokens = JSON.parse(readFileSync(GOOGLE_TOKENS_PATH, 'utf-8'));
    }
  } catch { googleTokens = null; }
}

function saveGoogleTokens(tokens) {
  googleTokens = tokens;
  try { writeFileSync(GOOGLE_TOKENS_PATH, JSON.stringify(tokens, null, 2), 'utf-8'); } catch { }
}

function clearGoogleTokens() {
  googleTokens = null;
  try { if (existsSync(GOOGLE_TOKENS_PATH)) require('fs').unlinkSync(GOOGLE_TOKENS_PATH); } catch { }
}

async function refreshGoogleAccessToken() {
  if (!googleTokens?.refresh_token) return null;
  try {
    const res = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: GOOGLE_CLIENT_ID,
        client_secret: GOOGLE_CLIENT_SECRET,
        refresh_token: googleTokens.refresh_token,
        grant_type: 'refresh_token',
      }),
    });
    if (!res.ok) return null;
    const data = await res.json();
    if (!data.access_token) return null;
    saveGoogleTokens({
      ...googleTokens,
      access_token: data.access_token,
      expiry_date: Date.now() + (data.expires_in || 3600) * 1000,
    });
    return data.access_token;
  } catch { return null; }
}

async function getGoogleAccessToken() {
  if (!googleTokens) return null;
  const expired = !googleTokens.expiry_date || Date.now() > googleTokens.expiry_date - 60_000;
  if (expired) return await refreshGoogleAccessToken();
  return googleTokens.access_token || null;
}

loadGoogleTokens(); // load any stored tokens on startup

// ─── Customizer Repo ──────────────────────────────────────────────────────────
const CUSTOMIZER_REPO = (process.env.CUSTOMIZER_REPO_PATH ||
  '/Users/qip-innovation/laravel-docker/core/src/customizer-core').replace(/\\/g, '/');

function readRepoFile(relPath, maxChars = 3000) {
  try {
    const full = join(CUSTOMIZER_REPO, relPath);
    if (!existsSync(full)) return null;
    return readFileSync(full, 'utf-8').slice(0, maxChars);
  } catch { return null; }
}

const app = express();
app.use(cors());
app.use(express.json());

const DB_SERVER = process.env.DB_SERVER || 'localhost';
const DB_PORT = parseInt(process.env.DB_PORT) || 1433;
const DB_USER = process.env.DB_USER || '';
const DB_PASS = process.env.DB_PASSWORD || '';
const DB_NAME = process.env.DB_NAME || 'brd_tracker';
const DB_TRUSTED = process.env.DB_TRUSTED === 'true';
const PORT = parseInt(process.env.PORT) || 3001;
const AI_PROVIDER = (process.env.AI_PROVIDER || 'anthropic').trim().toLowerCase();

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY || '';
const ANTHROPIC_MODEL = process.env.ANTHROPIC_MODEL || 'claude-opus-4-6';
const OPENAI_API_KEY = process.env.OPENAI_API_KEY || '';
const OPENAI_MODEL = process.env.OPENAI_MODEL || 'gpt-4o-mini';
const GEMINI_API_KEY = process.env.GEMINI_API_KEY || '';
const GEMINI_MODEL = process.env.GEMINI_MODEL || 'gemini-1.5-flash';
const GEMINI_IMAGE_MODEL = process.env.GEMINI_IMAGE_MODEL || 'gemini-2.5-flash-image';

// Named instance support — split "HOSTNAME\INSTANCE" into separate fields
// mssql requires server and instanceName to be separate; when instanceName is set,
// SQL Server Browser resolves the port automatically (do NOT hard-code port).
const [DB_HOST, DB_INSTANCE] = DB_SERVER.split('\\');

// ─── Type shortcuts ───────────────────────────────────────────────────────────
const NV = (n) => sql.NVarChar(n || sql.MAX);
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
      { value: 'new_requirements', label: 'New Requirements', color: '#3b82f6', description: 'Requirements discovered during development not in original spec', sortOrder: 0 },
      { value: 'missed_requirements', label: 'Missed Requirements', color: '#f59e0b', description: 'Features or functionality missed from initial requirements', sortOrder: 1 },
      { value: 'code_logic_issue', label: 'Code Logic Issue', color: '#ef4444', description: 'Bug in code implementation or logic', sortOrder: 2 },
      { value: 'known_issue', label: 'Known Issue', color: '#6366f1', description: 'Pre-identified issue documented and accepted', sortOrder: 3 },
      { value: 'affected_by_dev', label: 'Affected by Dev', color: '#8b5cf6', description: 'Issue caused by changes from other development work', sortOrder: 4 },
    ];
    const now = Date.now();
    for (const c of defaultCriteria) {
      const id = randomUUID();
      await pool.request()
        .input('id', NV(36), id)
        .input('value', NV(100), c.value)
        .input('label', NV(255), c.label)
        .input('color', NV(20), c.color)
        .input('description', NV(), c.description)
        .input('sortOrder', INT, c.sortOrder)
        .input('createdAt', BIG, now)
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
        .input('id', NV(36), id)
        .input('name', NV(255), tl.name)
        .input('sortOrder', INT, tl.sortOrder)
        .input('createdAt', BIG, now)
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
      { value: 'XS', label: 'XS', minDays: null, maxDays: 10, description: 'Very small feature. Minimal effort, very low risk. No dependencies.', risk: 'Very Low', color: '#10b981', sortOrder: 0 },
      { value: 'S', label: 'S', minDays: null, maxDays: 20, description: 'Simple and isolated task. Clear scope. Might require 1–2 people.', risk: 'Low', color: '#3b82f6', sortOrder: 1 },
      { value: 'M', label: 'M', minDays: 20, maxDays: 40, description: 'Moderate effort. Might require collaboration across team members. Some complexity or testing.', risk: 'Medium', color: '#f59e0b', sortOrder: 2 },
      { value: 'L', label: 'L', minDays: 40, maxDays: 60, description: 'Complex features. Cross-functional work. May involve back-end, front-end, QA, or coordination. Moderate risk.', risk: 'Moderate', color: '#f97316', sortOrder: 3 },
      { value: 'XL', label: 'XL', minDays: 60, maxDays: 100, description: 'Large initiative. Many moving parts or dependencies. Needs coordination across teams. Higher risk.', risk: 'High', color: '#ef4444', sortOrder: 4 },
      { value: 'XXL', label: 'XXL', minDays: 100, maxDays: null, description: 'Epic-level work. Needs to be broken down. Too big to plan effectively as-is. High uncertainty.', risk: 'Very High', color: '#7c3aed', sortOrder: 5 },
    ];
    const now2 = Date.now();
    for (const s of defaultSizes) {
      const id = randomUUID();
      await pool.request()
        .input('id', NV(36), id)
        .input('value', NV(10), s.value)
        .input('label', NV(50), s.label)
        .input('minDays', INT, s.minDays)
        .input('maxDays', INT, s.maxDays)
        .input('description', NV(), s.description)
        .input('risk', NV(50), s.risk)
        .input('color', NV(7), s.color)
        .input('sortOrder', INT, s.sortOrder)
        .input('createdAt', BIG, now2)
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
      { name: 'Eric', team: 'BE', sortOrder: 0 },
      { name: 'Eloisa', team: 'FE', sortOrder: 1 },
      { name: 'Marco', team: 'FE', sortOrder: 2 },
      { name: 'Jessie', team: 'FE', sortOrder: 3 },
      { name: 'Cristian', team: 'FE', sortOrder: 4 },
      { name: 'Russel', team: 'FE', sortOrder: 5 },
      { name: 'Yves', team: 'FE', sortOrder: 6 },
    ];
    const dmNow = Date.now();
    for (const d of defaultDevs) {
      await pool.request()
        .input('id', NV(36), randomUUID())
        .input('name', NV(255), d.name)
        .input('team', NV(50), d.team)
        .input('sortOrder', INT, d.sortOrder)
        .input('createdAt', BIG, dmNow)
        .query(`INSERT INTO dev_members (id,name,team,sortOrder,createdAt)
                VALUES (@id,@name,@team,@sortOrder,@createdAt)`);
    }
  }

  // Create knowledge_base table
  await pool.request().query(`
    IF NOT EXISTS (SELECT * FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME = 'knowledge_base')
    CREATE TABLE knowledge_base (
      id        NVARCHAR(36)  PRIMARY KEY,
      title     NVARCHAR(255) NOT NULL,
      category  NVARCHAR(100) NOT NULL DEFAULT 'General',
      content   NVARCHAR(MAX) NOT NULL,
      sortOrder INT           NOT NULL DEFAULT 0,
      createdAt BIGINT,
      updatedAt BIGINT
    )
  `);

  // Create style_features table
  await pool.request().query(`
    IF NOT EXISTS (SELECT * FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME = 'style_features')
    CREATE TABLE style_features (
      id        NVARCHAR(36)  PRIMARY KEY,
      feature   NVARCHAR(255) NOT NULL DEFAULT '',
      tab       NVARCHAR(100) NOT NULL DEFAULT 'General',
      status    NVARCHAR(50)  NOT NULL DEFAULT 'stable',
      keywords  NVARCHAR(MAX) NOT NULL DEFAULT '[]',
      sortOrder INT           NOT NULL DEFAULT 0,
      createdAt BIGINT,
      updatedAt BIGINT
    )
  `);

  // Create ai_analysis_cache table — same input hash ⇒ same stored output
  await pool.request().query(`
    IF NOT EXISTS (SELECT * FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME = 'ai_analysis_cache')
    CREATE TABLE ai_analysis_cache (
      cacheKey  NVARCHAR(64)  PRIMARY KEY,
      endpoint  NVARCHAR(50)  NOT NULL,
      provider  NVARCHAR(30),
      result    NVARCHAR(MAX) NOT NULL,
      createdAt BIGINT
    )
  `);

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

  // Write initial local backup (non-blocking)
  writeBRDLocalBackup();

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

// ─── Style Features — seed from hardcoded list if table is empty ──────────────
async function seedStyleFeatures() {
  const { recordset: [{ sfCnt }] } = await pool.request()
    .query('SELECT COUNT(*) AS sfCnt FROM style_features');
  if (sfCnt > 0) return;
  const sfNow = Date.now();
  for (let i = 0; i < STYLE_FEATURES_SEED.length; i++) {
    const sf = STYLE_FEATURES_SEED[i];
    // Some seed entries use `features` (typo) or missing `feature` — guard gracefully
    const featureName = sf.feature || sf.features || '';
    const tabName = sf.tab || sf.customizer || 'General';
    await pool.request()
      .input('id', NV(36), randomUUID())
      .input('feature', NV(255), featureName)
      .input('tab', NV(100), tabName)
      .input('status', NV(50), sf.status || 'stable')
      .input('keywords', NV(), JSON.stringify(sf.keywords || []))
      .input('sortOrder', INT, i)
      .input('createdAt', BIG, sfNow)
      .input('updatedAt', BIG, sfNow)
      .query(`INSERT INTO style_features (id,feature,tab,status,keywords,sortOrder,createdAt,updatedAt)
              VALUES (@id,@feature,@tab,@status,@keywords,@sortOrder,@createdAt,@updatedAt)`);
  }
}

// ─── Style Features — load from DB ────────────────────────────────────────────
async function loadStyleFeatures() {
  const { recordset } = await pool.request()
    .query('SELECT * FROM style_features ORDER BY tab ASC, sortOrder ASC');
  return recordset.map(sf => ({
    ...sf,
    keywords: JSON.parse(sf.keywords || '[]'),
  }));
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
    writeBRDLocalBackup(); // fire-and-forget: update local backup file
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
    writeBRDLocalBackup(); // fire-and-forget: update local backup file
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.delete('/api/brds/:id', async (req, res) => {
  try {
    await pool.request().input('id', NV(36), req.params.id)
      .query('DELETE FROM brds WHERE id = @id');
    res.json({ ok: true });
    writeBRDLocalBackup(); // fire-and-forget: update local backup file
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
      .input('id', NV(36), id)
      .input('value', NV(100), value)
      .input('label', NV(255), label)
      .input('color', NV(20), color || '#3b82f6')
      .input('description', NV(), description || '')
      .input('sortOrder', INT, sortOrder ?? 99)
      .input('createdAt', BIG, createdAt)
      .query(`INSERT INTO bug_criteria (id,value,label,color,description,sortOrder,createdAt)
              VALUES (@id,@value,@label,@color,@description,@sortOrder,@createdAt)`);
    res.json({ id, value, label, color, description, sortOrder, createdAt });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.put('/api/criteria/:id', async (req, res) => {
  try {
    const { label, color, description, sortOrder } = req.body;
    await pool.request()
      .input('id', NV(36), req.params.id)
      .input('label', NV(255), label || '')
      .input('color', NV(20), color || '#3b82f6')
      .input('description', NV(), description || '')
      .input('sortOrder', INT, sortOrder ?? 0)
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
      .input('id', NV(36), id)
      .input('name', NV(255), name)
      .input('sortOrder', INT, sortOrder ?? 99)
      .input('createdAt', BIG, createdAt)
      .query(`INSERT INTO team_leads (id,name,sortOrder,createdAt)
              VALUES (@id,@name,@sortOrder,@createdAt)`);
    res.json({ id, name, sortOrder, createdAt });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.put('/api/teamleads/:id', async (req, res) => {
  try {
    const { name, sortOrder } = req.body;
    await pool.request()
      .input('id', NV(36), req.params.id)
      .input('name', NV(255), name || '')
      .input('sortOrder', INT, sortOrder ?? 0)
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
      .input('id', NV(36), id)
      .input('name', NV(255), name)
      .input('team', NV(50), team || 'FE')
      .input('sortOrder', INT, sortOrder ?? 99)
      .input('createdAt', BIG, createdAt)
      .query(`INSERT INTO dev_members (id,name,team,sortOrder,createdAt)
              VALUES (@id,@name,@team,@sortOrder,@createdAt)`);
    res.json({ id, name, team: team || 'FE', sortOrder, createdAt });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.put('/api/dev-members/:id', async (req, res) => {
  try {
    const { name, team, sortOrder } = req.body;
    await pool.request()
      .input('id', NV(36), req.params.id)
      .input('name', NV(255), name || '')
      .input('team', NV(50), team || 'FE')
      .input('sortOrder', INT, sortOrder ?? 0)
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
      .input('id', NV(36), id)
      .input('value', NV(10), value)
      .input('label', NV(50), label)
      .input('minDays', INT, minDays ?? null)
      .input('maxDays', INT, maxDays ?? null)
      .input('description', NV(), description || '')
      .input('risk', NV(50), risk || '')
      .input('color', NV(7), color || '#3b82f6')
      .input('sortOrder', INT, sortOrder ?? 0)
      .input('createdAt', BIG, createdAt)
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
      .input('id', NV(36), req.params.id)
      .input('label', NV(50), label)
      .input('minDays', INT, minDays ?? null)
      .input('maxDays', INT, maxDays ?? null)
      .input('description', NV(), description || '')
      .input('risk', NV(50), risk || '')
      .input('color', NV(7), color || '#3b82f6')
      .input('sortOrder', INT, sortOrder ?? 0)
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
      .input('id', NV(36), id)
      .input('title', NV(255), title || '')
      .input('content', NV(), content || '')
      .input('quarter', NV(5), quarter || null)
      .input('year', INT, year || new Date().getFullYear())
      .input('sprint', NV(20), sprint || null)
      .input('priority', NV(20), priority || 'medium')
      .input('status', NV(20), status || 'todo')
      .input('brdId', NV(), brdId || null)
      .input('createdAt', BIG, now)
      .input('updatedAt', BIG, now)
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
      .input('id', NV(36), req.params.id)
      .input('title', NV(255), title || '')
      .input('content', NV(), content || '')
      .input('quarter', NV(5), quarter || null)
      .input('year', INT, year || new Date().getFullYear())
      .input('sprint', NV(20), sprint || null)
      .input('priority', NV(20), priority || 'medium')
      .input('status', NV(20), status || 'todo')
      .input('brdId', NV(), brdId || null)
      .input('updatedAt', BIG, updatedAt)
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

// ─── Knowledge Base ────────────────────────────────────────────────────────────
app.get('/api/knowledge-base', async (_req, res) => {
  try {
    const { recordset } = await pool.request()
      .query('SELECT * FROM knowledge_base ORDER BY category ASC, sortOrder ASC, createdAt ASC');
    res.json(recordset);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/knowledge-base', async (req, res) => {
  try {
    const { title, category, content, sortOrder } = req.body;
    if (!title || !content) return res.status(400).json({ error: 'title and content are required' });
    const id = randomUUID();
    const now = Date.now();
    await pool.request()
      .input('id', NV(36), id)
      .input('title', NV(255), title)
      .input('category', NV(100), category || 'General')
      .input('content', NV(), content)
      .input('sortOrder', INT, sortOrder ?? 99)
      .input('createdAt', BIG, now)
      .input('updatedAt', BIG, now)
      .query(`INSERT INTO knowledge_base (id,title,category,content,sortOrder,createdAt,updatedAt)
              VALUES (@id,@title,@category,@content,@sortOrder,@createdAt,@updatedAt)`);
    res.json({ id, title, category: category || 'General', content, sortOrder, createdAt: now, updatedAt: now });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.put('/api/knowledge-base/:id', async (req, res) => {
  try {
    const { title, category, content, sortOrder } = req.body;
    const now = Date.now();
    await pool.request()
      .input('id', NV(36), req.params.id)
      .input('title', NV(255), title || '')
      .input('category', NV(100), category || 'General')
      .input('content', NV(), content || '')
      .input('sortOrder', INT, sortOrder ?? 0)
      .input('updatedAt', BIG, now)
      .query(`UPDATE knowledge_base SET title=@title, category=@category, content=@content,
              sortOrder=@sortOrder, updatedAt=@updatedAt WHERE id=@id`);
    res.json({ id: req.params.id, ...req.body, updatedAt: now });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.delete('/api/knowledge-base/:id', async (req, res) => {
  try {
    await pool.request()
      .input('id', NV(36), req.params.id)
      .query('DELETE FROM knowledge_base WHERE id = @id');
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ─── Style Features ────────────────────────────────────────────────────────────
app.get('/api/style-features', async (_req, res) => {
  try {
    const features = await loadStyleFeatures();
    res.json(features);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/style-features', async (req, res) => {
  try {
    const { feature, tab, status, keywords, sortOrder } = req.body;
    if (!feature) return res.status(400).json({ error: 'feature is required' });
    const id = randomUUID();
    const now = Date.now();
    const keywordsJson = JSON.stringify(Array.isArray(keywords) ? keywords : []);
    await pool.request()
      .input('id', NV(36), id)
      .input('feature', NV(255), feature)
      .input('tab', NV(100), tab || 'General')
      .input('status', NV(50), status || 'stable')
      .input('keywords', NV(), keywordsJson)
      .input('sortOrder', INT, sortOrder ?? 99)
      .input('createdAt', BIG, now)
      .input('updatedAt', BIG, now)
      .query(`INSERT INTO style_features (id,feature,tab,status,keywords,sortOrder,createdAt,updatedAt)
              VALUES (@id,@feature,@tab,@status,@keywords,@sortOrder,@createdAt,@updatedAt)`);
    res.json({ id, feature, tab: tab || 'General', status: status || 'stable', keywords: Array.isArray(keywords) ? keywords : [], sortOrder, createdAt: now, updatedAt: now });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.put('/api/style-features/:id', async (req, res) => {
  try {
    const { feature, tab, status, keywords, sortOrder } = req.body;
    const now = Date.now();
    const keywordsJson = JSON.stringify(Array.isArray(keywords) ? keywords : []);
    await pool.request()
      .input('id', NV(36), req.params.id)
      .input('feature', NV(255), feature || '')
      .input('tab', NV(100), tab || 'General')
      .input('status', NV(50), status || 'stable')
      .input('keywords', NV(), keywordsJson)
      .input('sortOrder', INT, sortOrder ?? 0)
      .input('updatedAt', BIG, now)
      .query(`UPDATE style_features SET feature=@feature, tab=@tab, status=@status,
              keywords=@keywords, sortOrder=@sortOrder, updatedAt=@updatedAt WHERE id=@id`);
    res.json({ id: req.params.id, feature, tab, status, keywords: Array.isArray(keywords) ? keywords : [], sortOrder, updatedAt: now });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.delete('/api/style-features/:id', async (req, res) => {
  try {
    await pool.request()
      .input('id', NV(36), req.params.id)
      .query('DELETE FROM style_features WHERE id = @id');
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ─── Google Docs fetcher ───────────────────────────────────────────────────────
async function fetchGoogleDocText(url) {
  try {
    const match = url.match(/\/document\/d\/([a-zA-Z0-9_-]+)/);
    if (!match) return { text: null, error: 'Could not extract document ID from URL.' };
    const docId = match[1];

    // ── Try OAuth2 first (reads private docs the user owns / has access to) ──
    const accessToken = await getGoogleAccessToken();
    const connectedEmail = googleTokens?.email || null;
    let driveDenied = false;   // true when Drive said 403/404 for this account

    if (accessToken) {
      try {
        const oauthRes = await fetch(
          `https://www.googleapis.com/drive/v3/files/${docId}/export?mimeType=text/plain`,
          { headers: { Authorization: `Bearer ${accessToken}` }, signal: AbortSignal.timeout(12000) }
        );
        if (oauthRes.ok) {
          const text = (await oauthRes.text())?.trim();
          return { text: text || null, error: text ? null : 'Document appears to be empty.', via: 'oauth' };
        }

        // Capture the real Drive reason for a precise message
        let reason = '';
        try {
          const body = await oauthRes.json();
          reason = body?.error?.errors?.[0]?.reason || body?.error?.status || '';
        } catch { /* ignore */ }

        if (oauthRes.status === 403 || oauthRes.status === 404) {
          driveDenied = true; // file exists but this account can't open it — try public next
        } else if (oauthRes.status === 401) {
          return { text: null, error: 'Google session expired. Reconnect your Google account in Settings → Google Docs.' };
        } else {
          return { text: null, error: `Google Drive API error (${oauthRes.status})${reason ? ` — ${reason}` : ''}.` };
        }
      } catch { /* network/timeout — fall through to public URL */ }
    }

    // ── Fall back to public export URL ─────────────────────────────────────
    const exportUrl = `https://docs.google.com/document/d/${docId}/export?format=txt`;
    const res = await fetch(exportUrl, { signal: AbortSignal.timeout(12000) });
    if (!res.ok) {
      if (res.status === 401 || res.status === 403) {
        let hint;
        if (accessToken && driveDenied) {
          // Connected, but the document isn't shared with THIS account
          hint = connectedEmail
            ? `This document is not shared with the connected Google account (${connectedEmail}). Open the doc → Share → add ${connectedEmail} (Viewer), or sign in to Settings → Google Docs with the account that owns this document.`
            : 'This document is not shared with the connected Google account. Share it with that account (Viewer), or set the document to "Anyone with the link can view".';
        } else if (accessToken) {
          hint = connectedEmail
            ? `Could not read the document with the connected account (${connectedEmail}). Make sure it is shared with that account, or set it to "Anyone with the link can view".`
            : 'Could not read the document with the connected account. Make sure it is shared with that account.';
        } else {
          hint = 'Document is not publicly shared. Connect your Google account in Settings → Google Docs to read private documents, or set it to "Anyone with the link can view".';
        }
        return { text: null, error: hint };
      }
      return { text: null, error: `Failed to fetch document (HTTP ${res.status}).` };
    }
    const text = (await res.text())?.trim();
    return { text: text || null, error: text ? null : 'Document appears to be empty.', via: accessToken ? 'public (account lacked access)' : 'public' };
  } catch (e) {
    return { text: null, error: e.name === 'TimeoutError' ? 'Request timed out fetching the Google Doc.' : e.message };
  }
}

// ─── Local (no-API-key) BRD analysis ──────────────────────────────────────────
function localAnalyzeBRD({ brd, bugs, techLeads, devAssignees, knowledgeBase, docContent, docError }) {
  const lines = [];
  const push = (s) => lines.push(s);

  // ── 1. Quality Score ────────────────────────────────────────────────────────
  const checks = [
    { label: 'Title', ok: !!brd.title?.trim(), pts: 10 },
    { label: 'Description', ok: !!brd.description?.trim(), pts: 10 },
    { label: 'BA assigned', ok: !!brd.baName, pts: 10 },
    { label: 'Quarter/Year', ok: !!brd.quarter && !!brd.year, pts: 10 },
    { label: 'Sprint assigned', ok: !!brd.sprintStart, pts: 10 },
    { label: 'T-Shirt size', ok: !!brd.tshirtSize, pts: 10 },
    { label: 'Tech Lead(s)', ok: techLeads.length > 0, pts: 10 },
    { label: 'Dev Assignee(s)', ok: devAssignees.length > 0, pts: 10 },
    { label: 'Jira link', ok: !!brd.jiraLink, pts: 5 },
    { label: 'Google Docs', ok: !!brd.googleDocsLink, pts: 5 },
  ];
  const score = checks.filter((c) => c.ok).reduce((s, c) => s + c.pts, 0);
  const missing = checks.filter((c) => !c.ok);

  push(`## 1. BRD Quality Score`);
  push(`**Score: ${score}/100**`);
  push(`${score >= 80 ? '✅ Good quality BRD.' : score >= 50 ? '⚠️ Moderate quality — several gaps to address.' : '❌ Low quality — significant information is missing.'}`);
  push('');

  // ── 2. Completeness Check ───────────────────────────────────────────────────
  push(`## 2. Completeness Check`);
  if (missing.length === 0) {
    push('- All key fields are filled in.');
  } else {
    missing.forEach((m) => push(`- ❌ Missing: **${m.label}** (−${m.pts} pts)`));
  }
  push('');

  // ── 3. Risk Assessment ──────────────────────────────────────────────────────
  push(`## 3. Risk Assessment`);
  const highBugs = bugs.filter((b) => b.severity === 'high' && !['resolved', 'closed'].includes(b.status));
  const openBugs = bugs.filter((b) => !['resolved', 'closed'].includes(b.status));
  const sizeRisk = { XS: 'Very Low', S: 'Low', M: 'Medium', L: 'Moderate', XL: 'High', XXL: 'Very High' }[brd.tshirtSize] || 'Unknown';
  const bugRisk = openBugs.length === 0 ? 'Low' : openBugs.length <= 3 ? 'Medium' : 'High';
  const scopeRisk = !brd.sprintStart ? 'High (no sprint assigned)' : 'Low';

  push(`- **Technical risk:** ${sizeRisk}${brd.tshirtSize ? ` (size ${brd.tshirtSize})` : ' (no size set)'}`);
  push(`- **Delivery risk:** ${scopeRisk}`);
  push(`- **Bug risk:** ${bugRisk} — ${openBugs.length} open bug(s), ${highBugs.length} high-severity`);
  push('');

  // ── 4. Knowledge Base Alignment ─────────────────────────────────────────────
  push(`## 4. Alignment with Knowledge Base`);
  if (!knowledgeBase.length) {
    push('- No knowledge base entries found. Add entries to get alignment insights.');
  } else {
    const brdText = `${brd.title} ${brd.description || ''}`.toLowerCase();
    const matched = knowledgeBase.filter((kb) => {
      const words = kb.content.toLowerCase().split(/\W+/).filter((w) => w.length > 4);
      return words.some((w) => brdText.includes(w));
    });
    if (matched.length) {
      push(`${matched.length} knowledge base ${matched.length === 1 ? 'entry matches' : 'entries match'} this BRD:`);
      matched.forEach((kb) => push(`- ✅ **${kb.title}** (${kb.category})`));
    } else {
      push('- ⚠️ No direct keyword matches found in the knowledge base against the BRD title/description.');
      push('- Consider reviewing KB entries or expanding the BRD description.');
    }
    const unmatched = knowledgeBase.filter((kb) => !matched.includes(kb));
    if (unmatched.length) {
      push(`- ${unmatched.length} KB ${unmatched.length === 1 ? 'entry does' : 'entries do'} not appear relevant to this BRD.`);
    }
  }
  push('');

  // ── 5. Sprint & Sizing Validation ───────────────────────────────────────────
  push(`## 5. Sprint & Sizing Validation`);
  const sprintNums = [brd.sprintStart, brd.sprintEnd]
    .filter(Boolean)
    .map((s) => parseInt(String(s).replace(/\D/g, ''), 10))
    .filter((n) => !isNaN(n));
  const sprintSpan = sprintNums.length === 2 ? Math.abs(sprintNums[1] - sprintNums[0]) + 1 : (sprintNums.length === 1 ? 1 : 0);
  const sizeSprintMap = { XS: [1, 1], S: [1, 2], M: [2, 3], L: [3, 4], XL: [4, 6], XXL: [6, 99] };
  const expectedRange = sizeSprintMap[brd.tshirtSize];

  if (!brd.sprintStart) {
    push('- ⚠️ No sprint assigned — planning or backlog item.');
  } else if (expectedRange && sprintSpan) {
    if (sprintSpan < expectedRange[0]) {
      push(`- ⚠️ Sprint span (${sprintSpan}) may be **too short** for a ${brd.tshirtSize} item (expected ${expectedRange[0]}–${expectedRange[1]} sprints).`);
    } else if (sprintSpan > expectedRange[1]) {
      push(`- ⚠️ Sprint span (${sprintSpan}) may be **too long** for a ${brd.tshirtSize} item (expected ${expectedRange[0]}–${expectedRange[1]} sprints).`);
    } else {
      push(`- ✅ Sprint span (${sprintSpan}) is appropriate for a ${brd.tshirtSize} item.`);
    }
  } else {
    push(`- Sprint: ${brd.sprintStart}${brd.sprintEnd && brd.sprintEnd !== brd.sprintStart ? ' – ' + brd.sprintEnd : ''}`);
  }
  if (!brd.tshirtSize) push('- ⚠️ T-shirt size not set — sizing review recommended.');
  push('');

  // ── 6. Bug Pattern Insights ─────────────────────────────────────────────────
  push(`## 6. Bug Pattern Insights`);
  if (!bugs.length) {
    push('- No bugs logged for this BRD.');
  } else {
    const bySeverity = bugs.reduce((acc, b) => { acc[b.severity] = (acc[b.severity] || 0) + 1; return acc; }, {});
    const byStatus = bugs.reduce((acc, b) => { acc[b.status] = (acc[b.status] || 0) + 1; return acc; }, {});
    push(`- Total bugs: **${bugs.length}** — ${Object.entries(bySeverity).map(([k, v]) => `${v} ${k}`).join(', ')}`);
    push(`- By status: ${Object.entries(byStatus).map(([k, v]) => `${v} ${k}`).join(', ')}`);
    if (highBugs.length) push(`- ⚠️ ${highBugs.length} unresolved high-severity bug(s) — requires attention before launch.`);
    const storyBugs = bugs.filter((b) => b.storyTicket);
    if (storyBugs.length) push(`- ${storyBugs.length} item(s) are story/enhancement tickets (not real defects).`);
  }
  push('');

  // ── 7. Recommendations ──────────────────────────────────────────────────────
  push(`## 7. Recommendations`);
  const recs = [];
  if (!brd.description?.trim()) recs.push('Add a clear description to the BRD to improve understanding and alignment.');
  if (!brd.sprintStart) recs.push('Assign a sprint to this BRD to move it out of the backlog.');
  if (!brd.tshirtSize) recs.push('Size the BRD with a T-shirt estimate for better sprint planning.');
  if (techLeads.length === 0) recs.push('Assign at least one tech lead to ensure technical oversight.');
  if (devAssignees.length === 0) recs.push('Assign developer(s) so ownership is clear.');
  if (!brd.jiraLink) recs.push('Link a Jira ticket for end-to-end traceability.');
  if (highBugs.length > 0) recs.push(`Resolve ${highBugs.length} open high-severity bug(s) before proceeding.`);
  if (knowledgeBase.length === 0) recs.push('Populate the knowledge base so future analyses have richer context.');
  if (recs.length === 0) recs.push('BRD looks well-formed. Perform a final stakeholder review before launch.');
  recs.slice(0, 5).forEach((r, i) => push(`${i + 1}. ${r}`));
  push('');

  // ── 8. Document Content Insights ────────────────────────────────────────────
  push(`## 8. Document Content Insights`);
  if (!docContent) {
    if (!brd.googleDocsLink) {
      push('- No document attached. Upload a local .txt / .md / .docx file, or attach a public Google Docs link to get document-level insights.');
    } else {
      push(`- ⚠️ Google Doc could not be read — ${docError || 'ensure it is publicly shared. You can also download the doc locally and upload it.'}`)
    }
  } else {
    const words = docContent.toLowerCase().split(/\W+/).filter((w) => w.length > 3);
    const wordCount = words.length;
    const lineCount = docContent.split('\n').filter((l) => l.trim()).length;
    push(`- ✅ Document read successfully — **${wordCount} words**, ${lineCount} lines.`);

    // Check KB keyword coverage inside the doc
    const kbMatches = knowledgeBase.filter((kb) => {
      const kbWords = kb.content.toLowerCase().split(/\W+/).filter((w) => w.length > 4);
      return kbWords.some((w) => docContent.toLowerCase().includes(w));
    });
    if (kbMatches.length) {
      push(`- ${kbMatches.length} knowledge base ${kbMatches.length === 1 ? 'entry matches' : 'entries match'} content in the document:`);
      kbMatches.forEach((kb) => push(`  - ✅ **${kb.title}** (${kb.category})`));
    } else {
      push('- ⚠️ No knowledge base keywords found in the document — consider enriching the KB or the doc.');
    }

    // Surface heading structure
    const headings = docContent.split('\n').filter((l) => /^#{1,3}\s/.test(l) || /^[A-Z][A-Z\s]{4,}$/.test(l.trim()));
    if (headings.length) {
      push(`- Document sections detected: ${headings.slice(0, 5).map((h) => `"${h.replace(/^#+\s*/, '').trim()}"`).join(', ')}${headings.length > 5 ? ` (+${headings.length - 5} more)` : ''}`);
    }
  }
  push('');

  // ── 9. Overall Verdict ──────────────────────────────────────────────────────
  push(`## 9. Overall Verdict`);
  const statusLabel = { planning: 'in planning', inprogress: 'in progress', development: 'in development', testing: 'in testing', launched: 'launched', onhold: 'on hold' }[brd.status] || brd.status;
  push(`This BRD ("**${brd.title}**") is currently **${statusLabel}** and scored **${score}/100** on the quality check. ` +
    `${missing.length ? `Key gaps include: ${missing.map((m) => m.label).join(', ')}.` : 'All key fields are present.'} ` +
    `${openBugs.length ? `There are ${openBugs.length} open bug(s) that need attention.` : 'No open bugs.'} ` +
    `${docContent ? 'Document content was included in this analysis.' : 'No document content was available.'} ` +
    `${knowledgeBase.length ? `${knowledgeBase.length} knowledge base ${knowledgeBase.length === 1 ? 'entry was' : 'entries were'} used for context.` : 'No knowledge base context was available.'}`
  );

  return lines.join('\n');
}

// ─── AI BRD Analysis ───────────────────────────────────────────────────────────
const PLACEHOLDER_API_KEYS = new Set([
  'your-api-key-here',
  'your-openai-key-here',
  'your-gemini-key-here',
  'replace-with-real-key',
]);

const keyStatus = (value) => {
  const key = (value || '').trim();
  if (!key) return 'missing';
  if (PLACEHOLDER_API_KEYS.has(key.toLowerCase())) return 'placeholder';
  return 'ok';
};

const localReasonForProvider = (provider, status) => {
  if (status === 'missing') return `missing_${provider}_api_key`;
  if (status === 'placeholder') return `placeholder_${provider}_api_key`;
  return 'provider_unavailable';
};

function resolveAIProvider() {
  const providerOrder = ['anthropic', 'openai', 'gemini'];
  const statuses = {
    anthropic: keyStatus(ANTHROPIC_API_KEY),
    openai: keyStatus(OPENAI_API_KEY),
    gemini: keyStatus(GEMINI_API_KEY),
  };

  if (AI_PROVIDER === 'auto') {
    const selected = providerOrder.find((p) => statuses[p] === 'ok');
    if (selected) return { provider: selected, reason: null };
    return { provider: null, reason: 'missing_all_ai_api_keys' };
  }

  if (!providerOrder.includes(AI_PROVIDER)) {
    return { provider: null, reason: 'invalid_ai_provider' };
  }

  const status = statuses[AI_PROVIDER];
  if (status === 'ok') return { provider: AI_PROVIDER, reason: null };
  return { provider: null, reason: localReasonForProvider(AI_PROVIDER, status) };
}

// Ordered list of providers to try: the configured provider first, then every
// other provider with a valid key — enables automatic fallback when the primary
// one fails (e.g. Gemini 429 quota → OpenAI → Anthropic).
function resolveProviderChain() {
  const DEFAULT_ORDER = ['gemini', 'openai', 'anthropic'];
  const keys = { gemini: GEMINI_API_KEY, openai: OPENAI_API_KEY, anthropic: ANTHROPIC_API_KEY };
  const ok = (p) => keyStatus(keys[p]) === 'ok';

  const chain = [];
  if (AI_PROVIDER !== 'auto' && DEFAULT_ORDER.includes(AI_PROVIDER) && ok(AI_PROVIDER)) {
    chain.push(AI_PROVIDER);
  }
  for (const p of DEFAULT_ORDER) {
    if (ok(p) && !chain.includes(p)) chain.push(p);
  }
  return chain;
}

const callProvider = (provider, prompt) =>
  provider === 'anthropic' ? analyzeWithAnthropic(prompt)
    : provider === 'openai' ? analyzeWithOpenAI(prompt)
      : analyzeWithGemini(prompt);

// ─── AI analysis cache ─────────────────────────────────────────────────────────
// Deterministic key from everything that affects the output, so the same BRD +
// same content (bugs, KB, uploaded/fetched doc) always returns the same result.
function computeCacheKey(endpoint, { brd = {}, bugs = [], techLeads = [], devAssignees = [], knowledgeBase = [], docContent = '' }) {
  const canonical = JSON.stringify({
    endpoint,
    brd: {
      title: brd.title || '', description: brd.description || '', status: brd.status || '',
      quarter: brd.quarter || '', year: brd.year || '', tshirtSize: brd.tshirtSize || '',
      feTicket: brd.feTicket || '', beTicket: brd.beTicket || '',
      anciliaryTicket: brd.anciliaryTicket || '', rndTicket: brd.rndTicket || '',
      googleDocsLink: brd.googleDocsLink || '',
    },
    bugs: bugs.map(b => [b.title, b.description, b.criteria, b.severity, b.status, b.rootCause]),
    techLeads: techLeads.map(t => [t.name, t.expertise]),
    devAssignees,
    knowledgeBase: knowledgeBase.map(k => [k.title, k.category, k.content]),
    docContent: docContent || '',
  });
  return createHash('sha256').update(canonical).digest('hex');
}

async function getCachedAnalysis(cacheKey) {
  try {
    const { recordset } = await pool.request()
      .input('k', NV(64), cacheKey)
      .query('SELECT result FROM ai_analysis_cache WHERE cacheKey = @k');
    return recordset.length ? JSON.parse(recordset[0].result) : null;
  } catch { return null; }
}

async function saveCachedAnalysis(cacheKey, endpoint, provider, resultObj) {
  try {
    await pool.request()
      .input('k', NV(64), cacheKey)
      .input('e', NV(50), endpoint)
      .input('p', NV(30), provider || 'ai')
      .input('r', NV(), JSON.stringify(resultObj))
      .input('c', BIG, Date.now())
      .query(`MERGE ai_analysis_cache AS t
              USING (SELECT @k AS cacheKey) AS s ON t.cacheKey = s.cacheKey
              WHEN MATCHED THEN UPDATE SET result=@r, provider=@p, endpoint=@e, createdAt=@c
              WHEN NOT MATCHED THEN INSERT (cacheKey,endpoint,provider,result,createdAt)
                VALUES (@k,@e,@p,@r,@c);`);
  } catch (e) { console.warn('[cache] save failed:', e.message); }
}

// Try each provider in the chain; on failure (quota/error) fall through to the
// next. Returns { analysis, usage, provider } on success, or { provider: null }.
async function runAnalysisWithFallback(prompt) {
  const chain = resolveProviderChain();
  console.log(`\n━━━ AI ANALYSIS ━━━ provider chain: ${chain.join(' → ') || '(none)'}`);
  if (!chain.length) {
    console.warn('[AI] no provider with a valid key — using local rule-based analysis');
    return { provider: null, reason: 'missing_all_ai_api_keys', tried: [] };
  }

  const tried = [];
  for (const provider of chain) {
    console.log(`▶ [AI] attempting provider: ${provider.toUpperCase()}`);
    try {
      const result = await callProvider(provider, prompt);
      const modelInfo = result.model ? ` (model: ${result.model})` : '';
      console.log(`✅ [AI] SUCCESS via ${provider.toUpperCase()}${modelInfo}${tried.length ? ` — after ${tried.map(t => t.provider).join(', ')} failed` : ''}\n`);
      return { ...result, provider, reason: null, tried };
    } catch (e) {
      const msg = (e?.message || String(e)).slice(0, 160);
      console.warn(`❌ [AI] ${provider.toUpperCase()} failed: ${msg} — trying next provider`);
      tried.push({ provider, error: msg });
    }
  }
  console.error(`⛔ [AI] ALL providers failed (${tried.map(t => t.provider).join(', ')}) — falling back to local analysis\n`);
  return { provider: null, reason: 'all_ai_providers_failed', tried };
}

const buildAnalysisPrompt = ({ brd, bugs, techLeads, devAssignees, knowledgeBase, docContent, docError }) => {
  const kbSections = knowledgeBase.length
    ? knowledgeBase.map((k) => `### ${k.category}: ${k.title}\n${k.content}`).join('\n\n')
    : 'No knowledge base entries provided.';

  const bugSummary = bugs.length
    ? bugs.map((b) => `- [${b.severity?.toUpperCase() || 'UNKNOWN'}] ${b.title} (${b.status}) - ${b.criteria || 'no criteria'}`).join('\n')
    : 'No bugs logged.';

  const docSection = docContent
    ? `## DOCUMENT CONTENT\n${docContent.slice(0, 8000)}\n\n---\n\n`
    : docError
      ? `## DOCUMENT CONTENT\nCould not read document: ${docError}\n\n---\n\n`
      : '';

  return `You are a senior product analyst and software architect reviewing a Business Requirements Document (BRD).

## SYSTEM KNOWLEDGE BASE
${kbSections}

---

${docSection}## BRD DETAILS
**Title:** ${brd.title}
**Description:** ${brd.description || 'Not provided'}
**Quarter:** ${brd.quarter} ${brd.year}
**Sprint:** ${brd.sprintStart ? `${brd.sprintStart}${brd.sprintEnd && brd.sprintEnd !== brd.sprintStart ? ' - ' + brd.sprintEnd : ''}` : 'Not assigned'}
**Status:** ${brd.status}
**T-Shirt Size:** ${brd.tshirtSize || 'Not sized'}
**BA / Author:** ${brd.baName || 'Not assigned'}
**Tech Leads:** ${techLeads.length ? techLeads.map((t) => `${t.name}${t.expertise ? ' (' + t.expertise + ')' : ''}`).join(', ') : 'None assigned'}
**Dev Assignees:** ${devAssignees.length ? devAssignees.join(', ') : 'None assigned'}
**Jira Link:** ${brd.jiraLink || 'Not linked'}
**Google Docs Link:** ${brd.googleDocsLink || 'Not linked'}

**Logged Bugs (${bugs.length}):**
${bugSummary}

---

Please analyze this BRD against the system knowledge base${docContent ? ' and the attached Google Docs content' : ''} and provide a structured report with these sections:

1. **BRD Quality Score** (0-100) with a one-line justification
2. **Completeness Check** - what key information is missing or incomplete
3. **Risk Assessment** - technical, scope, and delivery risks (High/Medium/Low each)
4. **Alignment with System Knowledge** - how well this BRD aligns with the known system context
5. **Sprint & Sizing Validation** - is the T-shirt size and sprint range realistic?
6. **Bug Pattern Insights** - what the logged bugs reveal about the BRD's quality or gaps
7. **Recommendations** - top 3-5 actionable improvements
${docContent ? '8. **Google Doc Insights** - key observations from reading the attached Google Doc\n9. **Overall Verdict** - one paragraph summary' : '8. **Overall Verdict** - one paragraph summary'}

Be concise, specific, and use bullet points where appropriate.`;
};

async function analyzeWithAnthropic(prompt) {
  const client = new Anthropic({ apiKey: ANTHROPIC_API_KEY });
  const message = await client.messages.create({
    model: ANTHROPIC_MODEL,
    max_tokens: 2048,
    messages: [{ role: 'user', content: prompt }],
  });
  const analysis = message.content.find((c) => c.type === 'text')?.text || '';
  return { analysis, usage: message.usage || null };
}

async function analyzeWithOpenAI(prompt) {
  const resp = await fetch('https://api.openai.com/v1/responses', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${OPENAI_API_KEY}`,
    },
    body: JSON.stringify({
      model: OPENAI_MODEL,
      input: prompt,
      max_output_tokens: 2048,
    }),
  });

  if (!resp.ok) {
    const body = await resp.text();
    throw new Error(`OpenAI API error (${resp.status}): ${body.slice(0, 400)}`);
  }

  const data = await resp.json();
  const chunks = [];
  if (Array.isArray(data.output)) {
    for (const item of data.output) {
      if (item?.type === 'message' && Array.isArray(item.content)) {
        for (const part of item.content) {
          if (part?.type === 'output_text' && typeof part.text === 'string') {
            chunks.push(part.text);
          }
        }
      }
    }
  }

  const analysis = chunks.join('\n').trim() || (typeof data.output_text === 'string' ? data.output_text : '');
  if (!analysis) throw new Error('OpenAI API returned no text response.');
  return { analysis, usage: data.usage || null };
}

// Ordered list of Gemini text models to try: the configured one first, then
// stable fallbacks. If a model is rate-limited (429), overloaded (503), down
// (500/404), the next model is tried automatically before giving up on Gemini.
const GEMINI_FALLBACK_MODELS = (process.env.GEMINI_FALLBACK_MODELS ||
  'gemini-2.5-flash,gemini-2.5-flash-lite,gemini-2.0-flash,gemini-flash-latest')
  .split(',').map(s => s.trim()).filter(Boolean);

function geminiModelChain() {
  const chain = [];
  if (GEMINI_MODEL) chain.push(GEMINI_MODEL);
  for (const m of GEMINI_FALLBACK_MODELS) if (!chain.includes(m)) chain.push(m);
  return chain;
}

async function callGeminiModel(model, prompt) {
  console.log(`  🔹 [Gemini] trying model: ${model}`);
  const t0 = Date.now();
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(GEMINI_API_KEY)}`;
  const resp = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] }),
  });
  const data = await resp.json().catch(() => ({}));
  if (!resp.ok) {
    const err = new Error(`Gemini ${model} error (${resp.status}): ${(data?.error?.message || '').slice(0, 200)}`);
    // 429 quota, 503 overloaded, 500 server, 404 model-not-found → try next model
    err.retriable = [429, 500, 503, 404].includes(resp.status);
    console.warn(`  ⚠️  [Gemini] ${model} → HTTP ${resp.status} (${data?.error?.status || 'error'})`);
    throw err;
  }
  const parts = data?.candidates?.[0]?.content?.parts || [];
  const analysis = parts.map((p) => p?.text || '').join('\n').trim();
  if (!analysis) {
    const err = new Error(`Gemini ${model} returned no text response.`);
    err.retriable = true;
    console.warn(`  ⚠️  [Gemini] ${model} → empty response (finishReason: ${data?.candidates?.[0]?.finishReason || 'unknown'})`);
    throw err;
  }
  console.log(`  ✅ [Gemini] model ${model} responded in ${Date.now() - t0}ms (${analysis.length} chars)`);
  return { analysis, usage: data.usageMetadata || null, model };
}

async function analyzeWithGemini(prompt) {
  const chain = geminiModelChain();
  console.log(`🤖 [Gemini] model chain: ${chain.join(' → ')}`);
  let lastErr;
  for (const model of chain) {
    try {
      const result = await callGeminiModel(model, prompt);
      if (result.model !== chain[0]) console.log(`🔁 [Gemini] used FALLBACK model: ${result.model} (primary ${chain[0]} was unavailable)`);
      return result;
    } catch (e) {
      lastErr = e;
      if (!e.retriable) { console.error(`  ⛔ [Gemini] ${model} non-retriable — stopping: ${e.message}`); throw e; }
    }
  }
  throw lastErr || new Error('All Gemini models failed.');
}

// ─── AI 3D Uniform Render (Gemini "Nano Banana" image generation) ─────────────
app.post('/api/ai/render-3d', async (req, res) => {
  try {
    const { imageBase64 } = req.body;
    if (!imageBase64) return res.status(400).json({ error: 'imageBase64 is required' });
    if (!GEMINI_API_KEY) return res.status(400).json({ error: 'GEMINI_API_KEY not configured' });

    // Strip any data-URL prefix
    const b64 = imageBase64.replace(/^data:image\/\w+;base64,/, '');

    const prompt = `Take this flat 2D sports uniform/jersey design and render it as a single, photorealistic 3D sports jersey worn on an invisible mannequin (ghost mannequin / hollow-man product photography style).
- Keep the EXACT colors, patterns, logos, text, numbers and design layout from the input image.
- Show a realistic fabric with natural folds, soft studio lighting, and subtle shadows.
- Render only ONE jersey, front view, slightly angled three-quarter perspective.
- Use a clean, seamless light-grey studio background.
- High detail, e-commerce product photo quality.`;

    const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(GEMINI_IMAGE_MODEL)}:generateContent?key=${encodeURIComponent(GEMINI_API_KEY)}`;
    const resp = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{
          parts: [
            { text: prompt },
            { inline_data: { mime_type: 'image/png', data: b64 } },
          ]
        }],
      }),
    });

    const data = await resp.json();
    if (!resp.ok) {
      const msg = data?.error?.message || `HTTP ${resp.status}`;
      const isQuota = resp.status === 429 || /quota|rate/i.test(msg);
      return res.status(resp.status).json({
        error: isQuota
          ? 'Gemini image generation quota reached. The free tier allows a limited number of AI renders per day — try again later or use the geometry preview.'
          : `AI render failed: ${msg.slice(0, 200)}`,
        quota: isQuota,
      });
    }

    const parts = data?.candidates?.[0]?.content?.parts || [];
    const imgPart = parts.find(p => p.inlineData || p.inline_data);
    if (!imgPart) {
      const txt = parts.find(p => p.text)?.text;
      return res.status(502).json({ error: txt ? `Model returned text instead of an image: ${txt.slice(0, 150)}` : 'No image returned by the model.' });
    }

    const out = imgPart.inlineData || imgPart.inline_data;
    return res.json({ image: `data:${out.mimeType || out.mime_type || 'image/png'};base64,${out.data}` });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
});

app.post('/api/ai/analyze', async (req, res) => {
  try {
    const { brd, bugs = [], techLeads = [], devAssignees = [], knowledgeBase = [], docContent: uploadedDoc } = req.body;

    let docContent = uploadedDoc || null;
    let docError = null;
    if (!docContent && brd.googleDocsLink) {
      const result = await fetchGoogleDocText(brd.googleDocsLink);
      docContent = result.text;
      docError = result.error;
    }

    // ── Cache: identical BRD + content ⇒ identical stored output ──────────
    const cacheKey = computeCacheKey('analyze', { brd, bugs, techLeads, devAssignees, knowledgeBase, docContent });
    const cached = await getCachedAnalysis(cacheKey);
    if (cached) {
      console.log(`💾 [cache] HIT for /analyze (${cacheKey.slice(0, 12)}…) — returning stored result`);
      return res.json({ ...cached, cached: true });
    }

    const prompt = buildAnalysisPrompt({ brd, bugs, techLeads, devAssignees, knowledgeBase, docContent, docError });

    // Try the configured provider, then fall back to the others; only drop to
    // the local rule-based analyzer if every AI provider fails.
    const r = await runAnalysisWithFallback(prompt);
    if (!r.provider) {
      const analysis = localAnalyzeBRD({ brd, bugs, techLeads, devAssignees, knowledgeBase, docContent, docError });
      return res.json({
        analysis,
        mode: 'local',
        provider: 'local',
        modeReason: r.reason,
        docFetched: !!docContent,
      });
    }

    const payload = {
      analysis: r.analysis,
      mode: 'ai',
      provider: r.provider,
      model: r.model || null,
      modeReason: r.tried.length ? `fell_back_from_${r.tried.map(t => t.provider).join('_')}` : null,
      usage: r.usage,
      docFetched: !!docContent,
    };
    // Persist so the same input returns the same output next time
    await saveCachedAnalysis(cacheKey, 'analyze', r.provider, payload);
    return res.json(payload);
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
});

// ─── Style-Specific Feature Registry (from KB: Style-Specific Requirements) ───
// Each entry maps a named builder feature to keywords for BRD keyword-scanning.
const STYLE_FEATURES_SEED = [
  // Options Tab — Fabric
  { feature: 'No Default Fabric', tab: 'Options Tab', status: 'new', keywords: ['no default fabric', 'default fabric', 'fabric required', 'no fabric selected', 'without fabric', 'cart without fabric'] },
  { feature: 'Fabric Flow (Upgrade)', tab: 'Options Tab', status: 'stable', keywords: ['fabric upgrade', 'upgrade fee', 'upgrade flow', 'fabric flow upgrade', 'primary material', 'upgrade price'] },
  { feature: 'Fabric Selection', tab: 'Options Tab', status: 'stable', keywords: ['fabric selection', 'select fabric', 'fabric picker', 'choose fabric', 'fabric group', 'material selection'] },
  { feature: 'Fabric Flow (Downgrade)', tab: 'Options Tab', status: 'ongoing', keywords: ['fabric downgrade', 'downgrade flow', 'fabric flow downgrade', 'downgrade fabric'] },
  { feature: 'Fabric Style Part (Twill)', tab: 'Options Tab', status: 'assessment', keywords: ['fabric twill', 'twill style', 'twill fabric', 'tackle twill fabric part', 'hybrid fabric'] },

  // Customize Tab — Trims & Brand Logo
  { feature: 'Trims Functionality', tab: 'Customize Tab', status: 'stable', keywords: ['trim', 'trims', 'trim functionality', 'brand trim', 'multiple trim', 'trim color'] },
  { feature: 'Locker Tag', tab: 'Customize Tab', status: 'stable', keywords: ['locker tag', 'lockertag', 'locker tag sublimated'] },
  { feature: '3D Trim', tab: 'Customize Tab', status: 'stable', keywords: ['3d trim', '3d embroidered', 'tackle twill trim', 'twill trim'] },
  { feature: 'Brand Logo Color Rule', tab: 'Customize Tab', status: 'stable', keywords: ['brand logo color', 'logo color rule', 'color rule', 'logo contrast', 'logo visibility', 'color conflict', 'logo brand color'] },
  { feature: 'Brand Logo Intersecting Parts', tab: 'Customize Tab', status: 'stable', keywords: ['intersect', 'logo intersect', 'brand logo intersect', 'intersecting', 'logo across parts', 'logo overlap'] },
  { feature: 'Reversible Color Combination', tab: 'Customize Tab', status: 'ongoing', keywords: ['reversible color', 'color combination', 'reversible combination', 'reversible binding', 'reversible uniform', 'color binding'] },

  // Customize Tab — Body Parts & Application Hover
  { feature: 'Color Combination Functionality', tab: 'Customize Tab', status: 'stable', keywords: ['color combination', 'combo color', 'color zone', 'color group combination', 'body color', 'sleeve color'] },
  { feature: 'Color Indexing', tab: 'Customize Tab', status: 'stable', keywords: ['color index', 'indexing', 'color indexing', 'color order', 'index color'] },
  { feature: 'Pattern Functionality', tab: 'Customize Tab', status: 'stable', keywords: ['pattern', 'fabric pattern', 'pattern color', 'pattern position', 'pattern flow', 'sublimated pattern'] },

  // Applications Tab
  { feature: 'Application Soft/Hard Limits', tab: 'Applications Tab', status: 'stable', keywords: ['soft limit', 'hard limit', 'application limit', 'app limit', 'application count', 'limit application'] },
  { feature: 'Vectorsoft Integration', tab: 'Applications Tab', status: 'stable', keywords: ['vectorsoft', 'vector soft', 'pds', 'vectorsoft pds', 'vector art', 'logo digitizing'] },
  { feature: 'Text Application Customization', tab: 'Applications Tab', status: 'stable', keywords: ['text application', 'text customization', 'pixi text', 'custom text', 'player name', 'player number', 'team name', 'font', 'text stroke'] },
  { feature: 'Application Layer Draggable', tab: 'Applications Tab', status: 'stable', keywords: ['drag', 'draggable', 'application layer drag', 'drag drop', 'layer drag', 'drag application'] },
  { feature: 'Cowl Functionality', tab: 'Applications Tab', status: 'stable', keywords: ['cowl', 'cowl functionality', 'cowl neck', 'cowl design'] },
  { feature: 'View Perspective Application', tab: 'Applications Tab', status: 'stable', keywords: ['view perspective', 'perspective application', 'left view', 'right view', 'back view', 'front view', 'perspective add'] },
  { feature: 'Text Application Custom Stroke', tab: 'Applications Tab', status: 'stable', keywords: ['text stroke', 'custom stroke', 'stroke color', 'text outline', 'stroke text'] },

  // Roster Tab
  { feature: 'Copy Roster', tab: 'Roster Tab', status: 'stable', keywords: ['copy roster', 'roster copy', 'top-to-top', 'bottom-to-bottom', 'roster duplicate'] },
  { feature: 'Upload Roster', tab: 'Roster Tab', status: 'stable', keywords: ['upload roster', 'roster upload', 'bulk upload', 'roster file', 'import roster'] },
  { feature: 'Roster Error Notification', tab: 'Roster Tab', status: 'stable', keywords: ['roster error', 'application error notification', 'roster notification', 'roster alert'] },
  { feature: 'Football Pant Thigh Pad Pocket', tab: 'Roster Tab', status: 'stable', keywords: ['thigh pad', 'pocket', 'football pant', 'pant pocket', 'thigh pad pocket'] },
  { feature: 'Roster Football Hemline', tab: 'Roster Tab', status: 'stable', keywords: ['hemline', 'hem line', 'same hemline', 'football hemline', 'pant size hemline'] },

  // Stock Items
  { feature: 'Brand-Specific Stock Check (GM1/Alli/PL)', tab: 'Stock Items', status: 'stable', keywords: ['gm1', 'alli', 'prolook', 'pl brand', 'brand specific', 'brand check', 'brand stock', 'brand item'] },
  { feature: 'Color Group Functionality', tab: 'Stock Items', status: 'new', keywords: ['color group', 'colour group', 'trim color wheel', 'color wheel', 'team colors', 'primary color', 'default color group', 'color group default', 'predefined trim', 'color order', 'logo color order', 'brand logo local', 'color group tile'] },
  { feature: 'Available Color Groups Per Uniform', tab: 'Stock Items', status: 'new', keywords: ['pullover sideline', '1/4-zip', 'qxx', 'logo option', 'white/black logo', 'black/white logo', 'heathered gray base', 'black base', 'silicone poly', 'fusion polo', 'blade collar', 'spread collar', 'parka adult', 'dugout jacket', 'triple crown tee', 'color group per uniform', 'non-stock item', 'blocks'] },
  { feature: 'Sizes by Color Offering', tab: 'Stock Items', status: 'new', keywords: ['sizes by color', 'size color offering', 'translation layer', 'monster digital', 'mdj', 'color bubble', 'youth size', 'adult size', 'roster size filter', 'size filter color', 'slate gray', 'khaki', 'size 28', 'pop-up modal', 'picker modal', 'go back proceed', 'color set brand', 'factory color', 'qts', 'hcm stock', 'monster rgb', 'next level', 'bella canvas', 'gildan', 'triblend', 'premium tee', 'hoodie', 'long sleeve'] },
  { feature: 'Trim Color Rules (Brand Logo)', tab: 'Stock Items', status: 'new', keywords: ['trim color rule', 'brand logo trim', 'body color trim', 'trim static', 'trim auto', 'metallic silver logo', 'black/black logo', 'black/white logo', 'heathered gray base', 'sideline polo', 'sideline pullover', 'logo color mapping', 'trim color match', 'body color logo', 'trim not changeable', 'color code pdf', 'full color name pdf'] },
  { feature: 'Trim Color Rules (Zipper)', tab: 'Stock Items', status: 'new', keywords: ['zipper trim', 'trim zipper', 'zipper color rule', 'zipper body color', 'zipper auto color'] },
  { feature: 'Hidden Inseam Measurements', tab: 'Stock Items', status: 'new', keywords: ['inseam', 'inseam measurement', 'hidden inseam', 'standard inseam', 'tall inseam', 'inseam description', 'inseam pdf', 'jogger tapered', 'hcm jogger', 'inseam inches', 'inseam label'] },
  { feature: 'Hemline Property in PDF (All Products)', tab: 'Stock Items', status: 'new', keywords: ['hemline', 'hemline pdf', 'inseam pdf', 'length measurement pdf', 'product hemline', 'hemline sport', 'product type hemline'] },
  { feature: 'Remove Team Color Palette (Colors Tab)', tab: 'Stock Items', status: 'new', keywords: ['remove team color', 'color palette remove', 'team color palette', 'body color top', 'color tab stock', 'colors tab stock', 'body color section', 'text patterns tab'] },
  { feature: 'Color Selection Requirements for Stock Items', tab: 'Stock Items', status: 'new', keywords: ['one color selection', 'single color stock', 'color selection stock', 'stock color requirement', 'single application color', 'one body color', 'two colors picker', 'color grouping stock', 'customize experience colors'] },
  { feature: 'Application Toggle Behavior (Stock Items)', tab: 'Stock Items', status: 'new', keywords: ['application toggle', 'toggle application', 'toggle off application', 'enable location', 'disable front application', 'disable back application', 'mascot guide location', 'toggle message', 'front back toggle', 'toggle proceed', 'application location toggle'] },
  // Tackle Twill
  { feature: 'Twill Product', tab: 'Tackle Twill', status: 'stable', keywords: ['twill', 'tackle twill', 'twill item', 'twill', 'Twill color', 'Fabric Color', 'Suggested fabric Color'] },
  // Reversible
  { feature: 'Reversible', tab: 'Reversible', status: 'stable', keywords: ['reversible basketball', 'reversible', 'reversible uniform', 'reversible Football'] },
  // master style
  { features: 'Master style Customizer', customizer: 'Master style', status: 'stable', keywords: ['Web GA', 'Web Ga customizer'] },
  // Custom Pro
  { feature: 'Custom Pro / Manual Order', tab: 'Custom Pro', status: 'stable', keywords: ['custom pro', 'manual order', 'pdf', 'order page', 'custom pro badge', 'add ons'] },

  // Pricing
  { feature: 'Pricing Toggle (MOQ by item)', tab: 'Pricing', status: 'stable', keywords: ['pricing toggle', 'moq', 'add-on price', 'pricing item', 'minimum order', 'price item'] },
  { feature: 'Fabric Upgrade Pricing', tab: 'Pricing', status: 'stable', keywords: ['fabric upgrade price', 'upgrade fee', 'fabric price', 'upgrade pricing', 'material upgrade fee'] },

  // Notifications
  { feature: 'Builder Auto-Update Notification', tab: 'System', status: 'new', keywords: ['notification', 'auto update', 'back to builder', 'design update', 'builder notification'] },
  { feature: 'Issue and Logs from Rejection', tab: 'System', status: 'new', keywords: ['rejection', 'issue log', 'rejection log', 'rejection issue', 'log from rejection'] },
];

// ─── Customizer-Core Full Module Registry ─────────────────────────────────────
// Covers all domains: Color, Fabric, Canvas/Stage, Text, Logo, Embellishment,
// Pattern, Pricing/Cart, Approval, Roster, API, Composables, Stores.
const CUSTOMIZER_MODULES = [
  // ── CORE STORES ───────────────────────────────────────────────────────────
  {
    name: 'customizer.js', path: 'resources/js/stores/customizer.js', domain: 'Core Store',
    role: 'Primary Pinia store: uniform state, team colors, fabric groups, pricing, textures, history.',
    keyExports: ['useCustomizerStore', 'setTeamColors', 'setupFabricGroup', 'renderUniform', 'setColorsByActiveFabric', 'setPulloverTexture', 'setAgnosticTrimColor'],
    keywords: ['store', 'pinia', 'state', 'upgrade fee', 'setteamcolors', 'setupfabricgroup', 'pullover', 'heathered', 'heather', 'zipper', 'twill', 'sublimation', 'sublimated', 'reversible', 'uniform state', 'activeuniform']
  },

  {
    name: 'colors.js (store)', path: 'resources/js/stores/colors.js', domain: 'Color',
    role: 'Pinia store for team color data and filtering.',
    keyExports: ['useColorsStore'],
    keywords: ['team color', 'brand color', 'color list', 'color filter', 'palette', 'color store']
  },

  {
    name: 'fabric.js (store)', path: 'resources/js/stores/fabric.js', domain: 'Fabric',
    role: 'Pinia store tracking selected fabric groups and fabric state.',
    keyExports: ['useFabricStore'],
    keywords: ['fabric store', 'fabric group', 'material group', 'fabric state']
  },

  {
    name: 'approval.js (store)', path: 'resources/js/stores/approval.js', domain: 'Approval',
    role: 'Pinia store for design approval workflow state.',
    keyExports: ['useApprovalStore', 'isEmbellishment', 'isMascot', 'isPlayerName', 'isPlayerNumber', 'isTeamName'],
    keywords: ['approval', 'approve', 'review', 'sign off', 'customer approval', 'ask for changes', 'rejection']
  },

  {
    name: 'logos.js (store)', path: 'resources/js/stores/logos.js', domain: 'Logo',
    role: 'Pinia store for saved logos, filtering, and logo upload management.',
    keyExports: ['useLogosStore'],
    keywords: ['logo', 'brand logo', 'saved logo', 'logo library', 'logo upload', 'logo store']
  },

  {
    name: 'tailsweep.js (store)', path: 'resources/js/stores/tailsweep.js', domain: 'Embellishment',
    role: 'Pinia store for tailsweep embellishment configuration.',
    keyExports: ['useTailsweepStore'],
    keywords: ['tailsweep', 'tail sweep', 'embellishment', 'decoration']
  },

  {
    name: 'text-shapes.ts (store)', path: 'resources/js/stores/text-shapes.ts', domain: 'Text',
    role: 'Pinia store for text shape objects (curved/shaped text).',
    keyExports: ['useTextShapesStore'],
    keywords: ['text shape', 'curved text', 'shaped text', 'text object']
  },

  {
    name: 'roster.js (store)', path: 'resources/js/stores/roster.js', domain: 'Roster',
    role: 'Pinia store for team roster data (player names, numbers).',
    keyExports: ['useRosterStore'],
    keywords: ['roster', 'player name', 'player number', 'team roster', 'bulk upload']
  },

  {
    name: 'cart.js (store)', path: 'resources/js/stores/cart.js', domain: 'Pricing/Cart',
    role: 'Pinia store for shopping cart state.',
    keyExports: ['useCartStore'],
    keywords: ['cart', 'shopping cart', 'add to cart', 'cart state', 'order']
  },

  {
    name: 'saved-designs.js (store)', path: 'resources/js/stores/saved-designs.js', domain: 'Design',
    role: 'Pinia store for managing saved uniform designs.',
    keyExports: ['useSavedDesignsStore'],
    keywords: ['saved design', 'save design', 'load design', 'design template']
  },

  {
    name: 'brand-info.js (store)', path: 'resources/js/stores/brand-info.js', domain: 'Brand',
    role: 'Pinia store for brand settings and brand-specific config.',
    keyExports: ['useBrandInfoStore'],
    keywords: ['brand', 'brand info', 'brand settings', 'brand config', 'brand code']
  },

  {
    name: 'decorations.js (store)', path: 'resources/js/stores/decorations.js', domain: 'Embellishment',
    role: 'Pinia store for decoration/embellishment data.',
    keyExports: ['useDecorationsStore'],
    keywords: ['decoration', 'embellishment', 'add-on', 'mascot', 'stock art']
  },

  {
    name: 'history.js (store)', path: 'resources/js/stores/history.js', domain: 'History',
    role: 'Pinia store for undo/redo history.',
    keyExports: ['useHistoryStore'],
    keywords: ['undo', 'redo', 'history', 'revert', 'rollback']
  },

  {
    name: 'master-feature.js (store)', path: 'resources/js/stores/master-feature.js', domain: 'Feature Flags',
    role: 'Pinia store for feature flags and feature toggles.',
    keyExports: ['useMasterFeatureStore'],
    keywords: ['feature flag', 'feature toggle', 'feature switch', 'rollout', 'enable feature']
  },

  // ── CORE CUSTOMIZER MODULES ──────────────────────────────────────────────
  {
    name: 'color.ts', path: 'resources/js/core/customizer/color.ts', domain: 'Color / Canvas',
    role: 'Core color engine: maps color arrays to garment parts, converts hex to PixiJS tints (remixColors).',
    keyExports: ['remixColors', 'changeColorGroup', 'changeColorGroupBySide', 'changeMaterialColor', 'colorObjectsFromCodes', 'teamColorSettingCodes', 'mergeColors', 'rearrangeColors', 'updateOtherSideTrimColor'],
    keywords: ['remix', 'tint', 'canvas', 'parsehexcode', 'remixcolors', 'canvas rendering', 'numeric tint', 'partobject', 'color zone', 'color mapping', 'hex to tint']
  },

  {
    name: 'fabric.ts', path: 'resources/js/core/customizer/fabric.ts', domain: 'Fabric',
    role: 'Core fabric engine: persists fabric selections, triggers downstream color/texture updates.',
    keyExports: ['changeFabric', 'setSelected', 'isSelected', 'initializeFabricSelectionProperty', 'hasColorConflict'],
    keywords: ['changefabric', 'fabric selection', 'material selection', 'texture update', 'fabric conflict', 'fabric rule']
  },

  {
    name: 'application.ts', path: 'resources/js/core/customizer/application.ts', domain: 'Canvas / Applications',
    role: 'Core application engine: renders logos, text, mascots; manages placement, scale, rotation on canvas.',
    keyExports: ['renderApplication', 'createTextApplication', 'renderStockMascot', 'setApplicationOpacity', 'setApplicationScale', 'setApplicationPosition', 'setApplicationAngle', 'deleteApplication', 'changeApplicationType', 'getApplicationLocations', 'findLogoApplicationByLocation', 'findTextApplicationByLocationAndType'],
    keywords: ['application', 'render', 'logo placement', 'text placement', 'mascot', 'emblem', 'opacity', 'scale', 'rotate', 'canvas object', 'placement', 'location', 'application layer']
  },

  {
    name: 'text-shape.ts', path: 'resources/js/core/customizer/text-shape.ts', domain: 'Text',
    role: 'Core text-shape engine: creates curved/shaped text objects and handles S3 upload for embellishments.',
    keyExports: ['createTextShape', 'reloadTextShape', 's3UploadEmbellishments'],
    keywords: ['text shape', 'curved text', 'arc text', 'shaped text', 's3 upload', 'embellishment upload']
  },

  {
    name: 'pattern.ts', path: 'resources/js/core/customizer/pattern.ts', domain: 'Pattern',
    role: 'Core pattern engine: assigns/removes patterns, handles position and color on parts.',
    keyExports: ['setPattern', 'setPatternColor', 'setPatternPosition', 'setPatternStatus', 'removePattern', 'createApplicationPattern', 'changeApplicationPatternPosition'],
    keywords: ['pattern', 'fabric pattern', 'background pattern', 'pattern color', 'pattern position', 'camouflage', 'sublimated pattern']
  },

  {
    name: 'piping.ts', path: 'resources/js/core/customizer/piping.ts', domain: 'Embellishment / Piping',
    role: 'Core piping engine: creates, configures, and deletes piping/trim on uniform seams.',
    keyExports: ['createPiping', 'setPipingStatus', 'changePipingColor', 'changePipingSize', 'deletePiping'],
    keywords: ['piping', 'trim', 'seam', 'accent', 'border', 'piping color', 'piping size', 'collar', 'cuff']
  },

  {
    name: 'tailsweep.ts', path: 'resources/js/core/customizer/tailsweep.ts', domain: 'Embellishment',
    role: 'Core tailsweep engine: creates tailsweep embellishments, handles color and dimension sync.',
    keyExports: ['createTailsweep', 'changeTailsweepColor', 'syncDimension'],
    keywords: ['tailsweep', 'tail sweep', 'jersey tail', 'tail embellishment']
  },

  {
    name: 'brand-logo.ts', path: 'resources/js/core/customizer/brand-logo.ts', domain: 'Logo',
    role: 'Core brand logo renderer: places brand logo onto the garment canvas.',
    keyExports: ['renderBrandLogo', 'updateBrandLogo'],
    keywords: ['brand logo', 'logo render', 'chest logo', 'logo layer', 'brand mark']
  },

  {
    name: 'uniform.ts', path: 'resources/js/core/customizer/uniform.ts', domain: 'Canvas / Stage',
    role: 'Core uniform renderer: loads uniform, highlights parts, manages builder customization properties.',
    keyExports: ['createUniform', 'loadUniform', 'renderUniform', 'highlightParts', 'resetHighLights', 'highlightLogo', 'highlightText', 'setBuilderCustomizationProperty'],
    keywords: ['load uniform', 'render uniform', 'highlight', 'builder customization', 'uniform loading', 'active uniform', 'uniform initialization']
  },

  {
    name: 'perspective.ts', path: 'resources/js/core/customizer/perspective.ts', domain: 'Canvas / Stage',
    role: 'Manages front/back/left/right view switching and reversible uniform logic.',
    keyExports: ['changeActiveView', 'getPrimaryViews', 'isReversible'],
    keywords: ['view', 'perspective', 'front view', 'back view', 'reversible', 'side view', 'active view', 'switch view']
  },

  {
    name: 'thumbnails.ts', path: 'resources/js/core/customizer/thumbnails.ts', domain: 'Rendering',
    role: 'Generates and refreshes uniform design thumbnails for all views.',
    keyExports: ['generateThumbnail', 'generateAllThumbnail', 'generateReversibleThumbnails', 'generateAllReversibleThumbnail'],
    keywords: ['thumbnail', 'preview image', 'design preview', 'generate image', 'snapshot']
  },

  {
    name: 'stage.ts', path: 'resources/js/core/stage/stage.ts', domain: 'Canvas / Stage',
    role: 'PixiJS Application manager: creates/resizes the PIXI renderer canvas, controls visibility and scale.',
    keyExports: ['createStage', 'setStage', 'setStageVisibility', 'setPosition', 'setScale', 'resizeRenderer', 'disableStageInteractive', 'enableStageInteractive'],
    keywords: ['stage', 'pixi', 'canvas', 'renderer', 'webgl', 'stage resize', 'canvas size', 'stage scale', 'stage visibility']
  },

  {
    name: 'stageEvents.js', path: 'resources/js/core/stage/stageEvents.js', domain: 'Canvas / Stage',
    role: 'PixiJS stage interaction: mouse/touch events, zone hit-testing, part highlighting on hover/click.',
    keyExports: ['initializeStageEvents', 'destroyStageEvents', 'defaultScale'],
    keywords: ['stage event', 'mouse event', 'touch event', 'hit test', 'hover', 'click zone', 'interactive', 'point in polygon']
  },

  {
    name: 'add-ons.ts', path: 'resources/js/core/customizer/add-ons.ts', domain: 'Embellishment',
    role: 'Core add-on engine: renders and manages add-on decorative embellishments.',
    keyExports: ['renderAddOn', 'updateAddOn'],
    keywords: ['add-on', 'addon', 'decoration', 'stock mascot', 'custom mascot', 'art piece']
  },

  {
    name: 'brand-trims.ts', path: 'resources/js/core/customizer/brand-trims.ts', domain: 'Embellishment',
    role: 'Manages brand-specific trim decorations on the garment.',
    keyExports: ['renderBrandTrim', 'updateBrandTrim'],
    keywords: ['brand trim', 'trim decoration', '3d trim', 'tackle twill trim']
  },

  {
    name: 'block-pattern.ts', path: 'resources/js/core/customizer/block-pattern.ts', domain: 'Pattern',
    role: 'Manages block pattern rules for sublimated/cut-and-sew garment layouts.',
    keyExports: ['applyBlockPattern', 'getBlockPatternRule'],
    keywords: ['block pattern', 'cut and sew', 'sublimated layout', 'block rule', 'panel layout']
  },

  {
    name: 'cart-items.ts', path: 'resources/js/core/customizer/cart-items.ts', domain: 'Pricing/Cart',
    role: 'Maps customization data to cart line items including upgrade fees.',
    keyExports: ['buildCartItem', 'mapUpgradeFees'],
    keywords: ['cart item', 'line item', 'upgrade fee', 'pricing', 'cost calculation', 'cart mapping']
  },

  {
    name: 'color-selection.ts (composable)', path: 'resources/js/composables/color-selection.ts', domain: 'Color',
    role: 'Reusable composable for color picker logic shared across color panels.',
    keyExports: ['useColorSelection'],
    keywords: ['color selection', 'color picker', 'pick color', 'select color', 'composable color']
  },

  // ── BUILDER COMPONENTS ────────────────────────────────────────────────────
  {
    name: 'ColorGroupPanel.vue', path: 'resources/js/Components/Builder/Colors/ColorGroupPanel.vue', domain: 'Color / UI',
    role: 'Zone-by-zone color assignment panel; shows body/sleeve/piping accordions and team color swatches.',
    keyExports: ['ColorGroupPanel'],
    keywords: ['color group', 'zone color', 'body color', 'sleeve color', 'piping accordion', 'color panel', 'team color picker', 'manual order color', 'twill color', 'hybrid color']
  },

  {
    name: 'ColorSelection.vue', path: 'resources/js/Components/Builder/Modals/ColorSelection.vue', domain: 'Color / UI',
    role: 'Modal for selecting brand colors; checkbox-based picker that saves team color choices.',
    keyExports: ['ColorSelection'],
    keywords: ['color selection', 'brand color', 'color modal', 'color checkbox', 'save color', 'color picker modal']
  },

  {
    name: 'ColorConflictAlertModal.vue', path: 'resources/js/Components/Builder/Modals/ColorConflictAlertModal.vue', domain: 'Color / Validation',
    role: 'Shows conflict warnings when brand logo visibility or color contrast rules are violated.',
    keyExports: ['ColorConflictAlertModal'],
    keywords: ['conflict', 'contrast', 'color conflict', 'logo visibility', 'brand contrast', 'warning', 'clash', 'alert modal']
  },

  {
    name: 'FabricPanel.vue', path: 'resources/js/Components/Builder/Fabric/FabricPanel.vue', domain: 'Fabric / UI',
    role: 'Fabric selection accordion; shows fabric groups, recommended fabrics, and upgrade fees.',
    keyExports: ['FabricPanel'],
    keywords: ['fabric panel', 'fabric group', 'upgrade fee', 'material selection', 'fabric accordion', 'suggested fabric', 'fabric weight', 'composition']
  },

  {
    name: 'TwillSelectionColor.vue', path: 'resources/js/Components/Builder/Modals/TwillSelectionColor.vue', domain: 'Color / Twill',
    role: 'Color selection modal for tackle twill and hybrid products (up to 15 colors).',
    keyExports: ['TwillSelectionColor'],
    keywords: ['twill', 'tackle twill', 'hybrid', '15 colors', 'twill color', 'tackle color']
  },

  {
    name: 'TextPanel.vue', path: 'resources/js/Components/Builder/Text/TextPanel.vue', domain: 'Text / UI',
    role: 'Main text customization panel: player names, numbers, team names, graduation year.',
    keyExports: ['TextPanel'],
    keywords: ['text', 'player name', 'player number', 'team name', 'graduation year', 'name panel', 'number panel', 'text customization']
  },

  {
    name: 'PlayerName.vue', path: 'resources/js/Components/Builder/Text/PlayerName.vue', domain: 'Text / UI',
    role: 'Input component for individual player name application.',
    keyExports: ['PlayerName'],
    keywords: ['player name', 'name input', 'roster name', 'athlete name']
  },

  {
    name: 'PlayerNumber.vue', path: 'resources/js/Components/Builder/Text/PlayerNumber.vue', domain: 'Text / UI',
    role: 'Input component for player number application.',
    keyExports: ['PlayerNumber'],
    keywords: ['player number', 'number input', 'jersey number', 'roster number']
  },

  {
    name: 'TeamName.vue', path: 'resources/js/Components/Builder/Text/TeamName.vue', domain: 'Text / UI',
    role: 'Input component for team name text application on the garment.',
    keyExports: ['TeamName'],
    keywords: ['team name', 'school name', 'club name', 'organization name', 'text application']
  },

  {
    name: 'FontModal.vue', path: 'resources/js/Components/Builder/Modals/FontModal.vue', domain: 'Text / UI',
    role: 'Font selection modal for text applications.',
    keyExports: ['FontModal'],
    keywords: ['font', 'typeface', 'font selection', 'font picker', 'font style', 'typography']
  },

  {
    name: 'LogoPanel.vue', path: 'resources/js/Components/Builder/Logo/LogoPanel.vue', domain: 'Logo / UI',
    role: 'Logo selection and placement panel: saved logos, brand logos, logo locations.',
    keyExports: ['LogoPanel'],
    keywords: ['logo', 'logo panel', 'logo placement', 'logo location', 'logo library', 'brand logo', 'saved logo', 'logo upload']
  },

  {
    name: 'ArtPanel.vue', path: 'resources/js/Components/Builder/Art/ArtPanel.vue', domain: 'Logo / UI',
    role: 'Art/logo upload panel: file upload, URL input, and load saved design options.',
    keyExports: ['ArtPanel'],
    keywords: ['art', 'upload art', 'logo upload', 'custom art', 'artwork', 'design upload', 'art panel']
  },

  {
    name: 'PatternGroupPanel.vue', path: 'resources/js/Components/Builder/Pattern/PatternGroupPanel.vue', domain: 'Pattern / UI',
    role: 'Pattern selection panel for sublimated and fabric pattern application.',
    keyExports: ['PatternGroupPanel'],
    keywords: ['pattern', 'fabric pattern', 'background pattern', 'pattern panel', 'camouflage', 'design pattern']
  },

  {
    name: 'PipingPanel.vue', path: 'resources/js/Components/Builder/Piping/PipingPanel.vue', domain: 'Embellishment / UI',
    role: 'Piping selection panel: adds/removes piping trim on seams and borders.',
    keyExports: ['PipingPanel'],
    keywords: ['piping', 'trim', 'seam trim', 'border trim', 'piping panel', 'piping color', 'piping size']
  },

  {
    name: 'AddOnsPanel.vue', path: 'resources/js/Components/Builder/AddOns/AddOnsPanel.vue', domain: 'Embellishment / UI',
    role: 'Add-on embellishment selector panel: mascots, stock art, custom decorations.',
    keyExports: ['AddOnsPanel'],
    keywords: ['add-on', 'addon', 'mascot', 'stock art', 'custom mascot', 'embellishment panel', 'decoration']
  },

  {
    name: 'Application.vue', path: 'resources/js/Components/Builder/Application/Application.vue', domain: 'Applications / UI',
    role: 'Application editor panel: adjusts position, size, rotation, opacity for placed applications.',
    keyExports: ['Application'],
    keywords: ['application editor', 'position', 'size', 'rotation', 'opacity', 'placement editor', 'application control']
  },

  {
    name: 'ApplicationColors.vue', path: 'resources/js/Components/Builder/Application/ApplicationColors.vue', domain: 'Applications / UI',
    role: 'Color editor for individual applications (logos, text, emblems).',
    keyExports: ['ApplicationColors'],
    keywords: ['application color', 'logo color', 'text color', 'emblem color', 'application fill', 'application stroke']
  },

  {
    name: 'RosterPanel.vue', path: 'resources/js/Components/Builder/Roster/RosterPanel.vue', domain: 'Roster / UI',
    role: 'Team roster upload and management panel: bulk name/number input.',
    keyExports: ['RosterPanel'],
    keywords: ['roster', 'player roster', 'team roster', 'bulk names', 'bulk numbers', 'roster upload', 'roster import']
  },

  {
    name: 'CartForm.vue', path: 'resources/js/Components/Builder/Cart/CartForm.vue', domain: 'Pricing/Cart / UI',
    role: 'Cart form component: maps uniform design to cart line items and triggers checkout.',
    keyExports: ['CartForm'],
    keywords: ['cart form', 'add to cart', 'checkout', 'order form', 'cart submit', 'pricing form']
  },

  {
    name: 'SaveAndShare.vue', path: 'resources/js/Components/Builder/Modals/SaveAndShare.vue', domain: 'Design / UI',
    role: 'Modal for saving the current design and generating a shareable link.',
    keyExports: ['SaveAndShare'],
    keywords: ['save design', 'share design', 'save link', 'design link', 'export design', 'share link']
  },

  // ── BUILDER RESKIN COMPONENTS ─────────────────────────────────────────────
  {
    name: 'BuilderReskin.vue', path: 'resources/js/Components/BuilderReskin/BuilderReskin.vue', domain: 'Canvas / UI',
    role: 'Modern redesigned builder layout: full canvas + sidebar tabs.',
    keyExports: ['BuilderReskin'],
    keywords: ['builder reskin', 'new builder', 'reskin', 'modern builder', 'builder layout']
  },

  {
    name: 'ApplicationEditor.vue', path: 'resources/js/Components/BuilderReskin/Applications/ApplicationEditor.vue', domain: 'Applications / UI',
    role: 'Reskin application editor: controls for selected application in the new UI.',
    keyExports: ['ApplicationEditor'],
    keywords: ['application editor', 'reskin editor', 'application controls', 'edit application']
  },

  {
    name: 'ReskinPatternEditor.vue', path: 'resources/js/Components/BuilderReskin/Pattern/ReskinPatternEditor.vue', domain: 'Pattern / UI',
    role: 'Reskin pattern editor: pattern color and position controls in the new UI.',
    keyExports: ['ReskinPatternEditor'],
    keywords: ['pattern editor', 'reskin pattern', 'pattern controls']
  },

  // ── APPROVAL COMPONENTS ───────────────────────────────────────────────────
  {
    name: 'Approval/Index.vue', path: 'resources/js/Components/Approval/Index.vue', domain: 'Approval / UI',
    role: 'Main approval view: displays design for customer review and approval.',
    keyExports: ['ApprovalIndex'],
    keywords: ['approval view', 'design review', 'customer approval', 'approve design', 'review page']
  },

  {
    name: 'AskForChanges/Index.vue', path: 'resources/js/Components/Approval/AskForChanges/Index.vue', domain: 'Approval / UI',
    role: 'Ask-for-changes flow: allows customer to annotate and submit change requests.',
    keyExports: ['AskForChanges'],
    keywords: ['ask for changes', 'change request', 'revision request', 'feedback', 'annotation', 'design feedback']
  },

  // ── API LAYER ─────────────────────────────────────────────────────────────
  {
    name: 'qx7.js (api)', path: 'resources/js/api/qx7.js', domain: 'Backend API',
    role: 'QX7 backend API client: fetches brand styles, resources, fonts, patterns.',
    keyExports: ['getBrandStylesResources', 'transformFonts', 'transformPatterns'],
    keywords: ['qx7', 'brand style', 'api fetch', 'brand resources', 'api endpoint', 'backend api']
  },

  {
    name: 'colors.js (api)', path: 'resources/js/api/colors.js', domain: 'Color / API',
    role: 'Color API: fetches brand colors, sublimated colors, QX7 colors.',
    keyExports: ['fetchColors', 'fetchSublimatedColors', 'fetchQx7Colors'],
    keywords: ['color api', 'fetch colors', 'brand colors api', 'sublimated colors', 'color endpoint']
  },

  {
    name: 'logos.js (api)', path: 'resources/js/api/logos.js', domain: 'Logo / API',
    role: 'Logo management API: CRUD for saved logos, favoriting, archiving.',
    keyExports: ['getSavedLogos', 'addLogo', 'updateLogo', 'archiveSavedLogo', 'deleteSavedLogo'],
    keywords: ['logo api', 'saved logos', 'logo crud', 'logo endpoint', 'logo management api']
  },

  {
    name: 'carts.js (api)', path: 'resources/js/api/carts.js', domain: 'Pricing/Cart / API',
    role: 'Cart management API: create, update, delete cart and cart items.',
    keyExports: ['createCart', 'updateCart', 'deleteCart'],
    keywords: ['cart api', 'cart endpoint', 'order api', 'add to cart api', 'cart management']
  },

  {
    name: 'saved-designs.js (api)', path: 'resources/js/api/saved-designs.js', domain: 'Design / API',
    role: 'Saved designs API: persist and retrieve design configurations.',
    keyExports: ['saveDesign', 'loadDesign', 'deleteDesign'],
    keywords: ['saved design api', 'design persistence', 'design api', 'save design endpoint']
  },

  {
    name: 'pdf.js (api)', path: 'resources/js/api/pdf.js', domain: 'Export / API',
    role: 'PDF generation API: builds payload and triggers PDF export of the design.',
    keyExports: ['generatePdfPayload'],
    keywords: ['pdf', 'export pdf', 'design pdf', 'order sheet', 'spec sheet', 'pdf generation']
  },

  {
    name: 'vectorsoft.js (api)', path: 'resources/js/api/vectorsoft.js', domain: 'Logo / API',
    role: 'Vectorsoft integration API: logo digitizing and vector art services.',
    keyExports: ['uploadToVectorsoft', 'getVectorsoftStatus'],
    keywords: ['vectorsoft', 'vector art', 'logo digitizing', 'art digitizing', 'vector logo']
  },

  // ── ORDERS ──────────────────────────────────────────────────────────────────
  {
    name: 'orders.js (store)', path: 'resources/js/stores/orders.js', domain: 'Orders',
    role: 'Pinia store for order history: in-production / shipped tabs, pagination, search, sort, filter, pricing toggle.',
    keyExports: ['useOrdersStore', 'setOrderQuotations', 'archiveOrderQuotation', 'deleteOrder', 'initSubmittedOrders', 'initShippedOrders', 'handleSearch', 'handleSort', 'handleFilter', 'handleDateFilter', 'setActiveTab', 'setPricingToggleOn', 'resetForTrackerMode'],
    keywords: ['order', 'orders', 'order history', 'order tracker', 'in production', 'shipped', 'quotation', 'reorder', 'order status', 'order tracking', 'submitted order', 'order page', 'pricing toggle']
  },

  {
    name: 'orders.js (api)', path: 'resources/js/api/orders.js', domain: 'Orders / API',
    role: 'Order API: fetch in-production orders, split part item IDs, update/sync order shipping.',
    keyExports: ['fetchOrdersInProduction', 'getSplitPartItemIdsByOrderItemId', 'updateOrderShipping', 'syncOrderShipping'],
    keywords: ['order api', 'fetch orders', 'order shipping', 'sync order', 'order production', 'order endpoint']
  },

  {
    name: 'Pages/User/Order.vue', path: 'resources/js/Pages/User/Order.vue', domain: 'Orders / UI',
    role: 'End-user order history page (with OrderNew.vue / OrderOld.vue tracker variants).',
    keyExports: ['Order'],
    keywords: ['order page', 'my orders', 'order history page', 'order list', 'user order', 'order tracker page']
  },

  {
    name: 'Orders/Dealer.vue', path: 'resources/js/Components/Orders/Dealer.vue', domain: 'Orders / Dealer',
    role: 'Dealer order management: order tracker, pending internal approval, quotations (OrderTrackerNew/Old.vue).',
    keyExports: ['Dealer', 'OrderTrackerNew', 'OrderTrackerOld', 'PendingInternalApproval', 'Quotations'],
    keywords: ['dealer order', 'order tracker', 'pending approval', 'internal approval', 'dealer quotation', 'dealer orders']
  },

  {
    name: 'CartItem/EditReorder.vue', path: 'resources/js/Pages/CartItem/EditReorder.vue', domain: 'Orders / Reorder',
    role: 'Reorder flow: edit / show / duplicate an existing order item (ShowReorder, ShowDuplicate).',
    keyExports: ['EditReorder', 'ShowReorder', 'ShowDuplicate'],
    keywords: ['reorder', 're-order', 'duplicate order', 'edit reorder', 'order item', 'reorder item', 'duplicate item']
  },

  // ── SAVED DESIGNS ───────────────────────────────────────────────────────────
  {
    name: 'saved-designs.js (store)', path: 'resources/js/stores/saved-designs.js', domain: 'Saved Designs',
    role: 'Pinia store for the saved-design gallery: fetch, paginate, filter by category/user/sport, search, sort, favorite, archive, delete.',
    keyExports: ['useSavedDesignsStore', 'fetchSavedDesigns', 'fetchAllSavedDesigns', 'filterSavedDesignByCategory', 'filterSavedDesignBySports', 'filterSearchSavedDesign', 'sortSavedDesigns', 'favoriteDesign', 'archiveDesign', 'deleteDesign', 'createUniformConfig', 'fetchProductInfo'],
    keywords: ['saved design', 'save design', 'saved designs', 'design gallery', 'design library', 'favorite design', 'archive design', 'my designs', 'load design', 'design list']
  },

  {
    name: 'saved-designs.js (api)', path: 'resources/js/api/saved-designs.js', domain: 'Saved Designs / API',
    role: 'Saved-design API: CRUD, filter by category/sport/user, search, sort, favorite, archive, create/update design.',
    keyExports: ['getSavedDesigns', 'getAllSavedDesign', 'filterByCategory', 'filterBySport', 'filterByUser', 'searchSavedDesigns', 'sortSavedDesigns', 'archiveSavedDesign', 'favoriteSavedDesign', 'deleteSavedDesign', 'createSaveDesign', 'updateSaveDesign'],
    keywords: ['saved design api', 'create save design', 'update design', 'filter design', 'design persistence', 'save design endpoint']
  },

  {
    name: 'Pages/User/SavedDesign.vue', path: 'resources/js/Pages/User/SavedDesign.vue', domain: 'Saved Designs / UI',
    role: 'Saved designs gallery page with filter/share modals (SavedDesignItems, ShareDesignModal, SelectFilterModal).',
    keyExports: ['SavedDesign', 'SavedDesignItems', 'ShareDesignModal'],
    keywords: ['saved design page', 'design gallery page', 'share design', 'design filter', 'saved design items', 'design grid']
  },

  // ── CART / SHOPPING CART / MY CARTS ─────────────────────────────────────────
  {
    name: 'shopping-cart.js (store)', path: 'resources/js/stores/shopping-cart.js', domain: 'Cart',
    role: 'Active shopping cart: items, grand totals, MOQ tracking, discount validation, shipment dates, thumbnails, missing-info checks.',
    keyExports: ['useShoppingCartStore', 'initialize', 'processCartItems', 'updateCart', 'validateDiscountCode', 'fetchDiscountDetails', 'fetchShipmentDates', 'setMissingRoster', 'setMissingApplicationSizes', 'setNoFabricSelectedItemsId', 'getGrandTotals', 'getAppliedDiscountCode'],
    keywords: ['shopping cart', 'cart total', 'grand total', 'moq', 'minimum order', 'discount code', 'promo code', 'cart item', 'shipment date', 'missing roster', 'add to cart', 'cart checkout']
  },

  {
    name: 'cart.js (store)', path: 'resources/js/stores/cart.js', domain: 'Cart',
    role: 'Cart list + selection: cart list, selected cart, default cart, rush order detection, next cart name.',
    keyExports: ['useCartStore', 'setCartList', 'setSelectedCart', 'setDefaultCart', 'fetchCarts', 'getNextCartName', 'hasActiveRushOrder'],
    keywords: ['cart', 'cart list', 'selected cart', 'default cart', 'save cart', 'my cart', 'rush order', 'cart name']
  },

  {
    name: 'my-carts.js (store)', path: 'resources/js/stores/my-carts.js', domain: 'Cart / UI',
    role: 'My Carts page store: paginated carts + quote requests, search, sort, tabs.',
    keyExports: ['useMyCartsStore', 'initCarts', 'initAllCarts', 'initQuotations', 'handleSort', 'handleSearch', 'refreshData', 'setActiveTab'],
    keywords: ['my carts', 'saved carts', 'cart page', 'quote request', 'cart pagination', 'cart tab']
  },

  {
    name: 'cart-items.js (store)', path: 'resources/js/stores/cart-items.js', domain: 'Cart',
    role: 'Cart item state: change logs, rejection form, active item, fixed logs by type.',
    keyExports: ['useCartItemsStore', 'setCartItems', 'setActiveCartItem', 'setCartItemLogs', 'getRejectionDetails', 'getFixedLogsByType', 'isRejected'],
    keywords: ['cart item', 'change log', 'rejection', 'rejected item', 'item log', 'fix request', 'cart item detail']
  },

  {
    name: 'carts.js (api)', path: 'resources/js/api/carts.js', domain: 'Cart / API',
    role: 'Cart API: paginated/minimized cart fetch, set default cart, paginated quotations.',
    keyExports: ['fetchCartsPaginated', 'fetchCartsMinimized', 'setCartAsDefault', 'fetchQuotationsPaginated'],
    keywords: ['cart api', 'fetch carts', 'default cart api', 'quotation api', 'cart endpoint']
  },

  {
    name: 'Pages/ShoppingCart/ShoppingCart.vue', path: 'resources/js/Pages/ShoppingCart/ShoppingCart.vue', domain: 'Cart / UI',
    role: 'Main shopping cart page: items, approval, cart info, continue shopping, quote-request flow.',
    keyExports: ['ShoppingCart', 'ApprovalPage', 'CartInformation', 'ShoppingCartItem'],
    keywords: ['shopping cart page', 'cart page', 'cart approval', 'cart information', 'continue shopping', 'request submitted', 'cart item page']
  },

  // ── CHECKOUT ────────────────────────────────────────────────────────────────
  {
    name: 'checkout.js (store)', path: 'resources/js/stores/checkout.js', domain: 'Checkout',
    role: 'Full checkout flow: shipping/billing addresses, payment (card / terms / pro-code), customer & dealer selection, tax, order summary, sales-rep id.',
    keyExports: ['useCheckoutStore', 'setShippingState', 'setBillingState', 'setTotalTaxByState', 'setPaymentType', 'setCardType', 'setOrderSummary', 'setCustomerInformation', 'setDealerSelectedCustomer', 'setAccountRepId', 'getShipping', 'getBilling', 'getSaleRepInformation', 'getPaymentTerms', 'getSalesRepId', 'getOrderSummary'],
    keywords: ['checkout', 'payment', 'shipping', 'billing', 'address', 'credit card', 'payment terms', 'net terms', 'tax', 'order summary', 'place order', 'submit order', 'promo code', 'checkout page']
  },

  {
    name: 'addresses.js (api)', path: 'resources/js/api/addresses.js', domain: 'Checkout / API',
    role: 'Address book API: fetch saved addresses by user.',
    keyExports: ['fetchAddressesByUserId'],
    keywords: ['address', 'address book', 'shipping address', 'billing address', 'saved address']
  },

  {
    name: 'discount-code.js (api)', path: 'resources/js/api/discount-code.js', domain: 'Checkout / Pricing',
    role: 'Discount / promo code API: apply, remove, fetch discount details.',
    keyExports: ['applyDiscount', 'removeDiscount', 'getDiscountDetails'],
    keywords: ['discount', 'promo code', 'coupon', 'discount code', 'apply discount', 'voucher']
  },

  {
    name: 'Checkout/Index.vue', path: 'resources/js/Pages/Checkout/Index.vue', domain: 'Checkout / UI',
    role: 'Main checkout page with shipping/billing/payment components and Success / UnsuccessOrder result pages.',
    keyExports: ['CheckoutIndex', 'Success', 'UnsuccessOrder'],
    keywords: ['checkout page', 'checkout form', 'order confirmation', 'order success', 'payment page', 'checkout flow']
  },

  {
    name: 'Checkout/PaymentWithCreditCard.vue', path: 'resources/js/Components/Checkout/PaymentWithCreditCard.vue', domain: 'Checkout / Payment',
    role: 'Payment components: credit card, net terms, promo code, order summary, policy acceptance.',
    keyExports: ['PaymentWithCreditCard', 'PaymentWithTerms', 'PromoCode', 'OrderSummary', 'Policy'],
    keywords: ['credit card', 'payment', 'net terms', 'promo code', 'order summary', 'payment method', 'card payment', 'policy']
  },

  // ── SALES REP / DEALER ──────────────────────────────────────────────────────
  {
    name: 'dealer.js (store)', path: 'resources/js/stores/dealer.js', domain: 'Sales Rep / Dealer',
    role: 'Dealers + sales reps: filter by brand, find dealer / sales rep, dealer & rep near-me lookups.',
    keyExports: ['useDealerStore', 'getDealers', 'setSalesReps', 'filterDealerByBrand', 'getSalesReps', 'dealerNearMe', 'findDealer', 'findSalesReps', 'salesRepsNearMe'],
    keywords: ['dealer', 'sales rep', 'sales representative', 'sale ref', 'rep', 'dealer near me', 'find dealer', 'find rep', 'dealer brand', 'preferred dealer']
  },

  {
    name: 'user.js (api)', path: 'resources/js/api/user.js', domain: 'Sales Rep / API',
    role: 'User/dealer/rep API: fetch users & teams, dealer cost, rep cost, search sales representatives.',
    keyExports: ['fetchUsers', 'getProductProInfo', 'getTeams', 'fetchDealerCost', 'getRepCost', 'searchSalesRepresentatives'],
    keywords: ['sales rep api', 'rep cost', 'dealer cost', 'search sales rep', 'product pro', 'dealer pricing', 'rep pricing']
  },

  {
    name: 'cost-settings.js (store)', path: 'resources/js/stores/cost-settings.js', domain: 'Sales Rep / Pricing',
    role: 'Determines dealer vs retail cost / pricing formula based on user role.',
    keyExports: ['useCostSettingsStore'],
    keywords: ['cost setting', 'dealer cost', 'retail cost', 'rep cost', 'pricing formula', 'cost formula', 'markup']
  },

  // ── END USER / USER ─────────────────────────────────────────────────────────
  {
    name: 'user.js (store)', path: 'resources/js/stores/user.js', domain: 'End User',
    role: 'User profile + role gates (end-user, dealer, sales-rep, admin, brand manager, product-pro), associated users/customers, orders, sales-rep linkage.',
    keyExports: ['useUserStore', 'initUser', 'fetchAssociatedUsers', 'isEndUser', 'isDealer', 'isSalesRep', 'isManagingRep', 'isAdmin', 'isBrandManager', 'isProductPro', 'getUserRole', 'getSalesRepId', 'getAssociatedCustomer'],
    keywords: ['end user', 'enduser', 'customer', 'user role', 'dealer', 'sales rep', 'account', 'login', 'logged in', 'guest', 'customer account', 'user profile', 'role', 'permission']
  },

  {
    name: 'Orders/Customer.vue', path: 'resources/js/Components/Orders/Customer.vue', domain: 'End User / UI',
    role: 'Customer-facing order history display (end-user view of orders).',
    keyExports: ['Customer'],
    keywords: ['customer order', 'end user order', 'customer view', 'my orders', 'customer order history']
  },

  {
    name: 'Checkout/EndUser.vue', path: 'resources/js/Components/Checkout/EndUser.vue', domain: 'End User / UI',
    role: 'End-user checkout flow (vs dealer checkout); customer self-service ordering.',
    keyExports: ['EndUser'],
    keywords: ['end user checkout', 'customer checkout', 'self service', 'guest checkout', 'enduser flow']
  },

  {
    name: 'Pages/User/Index.vue', path: 'resources/js/Pages/User/Index.vue', domain: 'End User / UI',
    role: 'End-user account hub: dashboard, profile, address book, saved designs/logos, carts, orders.',
    keyExports: ['UserIndex', 'Profile', 'Address', 'Customers'],
    keywords: ['user dashboard', 'account page', 'profile', 'address book', 'my account', 'user page', 'customer dashboard']
  },

  // ── MANUAL ORDER ────────────────────────────────────────────────────────────
  {
    name: 'manual-order.js (store)', path: 'resources/js/stores/manual-order.js', domain: 'Custom Pro / Manual Order',
    role: 'Manual (Custom Pro) order flow: main body color, add-ons, design-file upload, notes, fabric, estimated ship date.',
    keyExports: ['useManualOrderStore', 'setMainBodyColor', 'setAddon', 'isManualOrderAllowed', 'saveDesignFile', 'getManualOrderEstimatedShipDate', 'setActiveFabric', 'initializeManualOrderCartItem'],
    keywords: ['manual order', 'custom pro', 'design file', 'upload design', 'manual order file', 'main body color', 'manual fabric', 'custom order', 'bags']
  },
];

// ─── Live file snippet reader (top 12 most architecturally critical files) ───
const CRITICAL_FILES = [
  'resources/js/stores/customizer.js',
  'resources/js/core/customizer/color.ts',
  'resources/js/core/customizer/fabric.ts',
  'resources/js/core/customizer/application.ts',
  'resources/js/core/stage/stage.ts',
  'resources/js/core/stage/stageEvents.js',
  'resources/js/Components/Builder/Colors/ColorGroupPanel.vue',
  'resources/js/Components/Builder/Fabric/FabricPanel.vue',
  'resources/js/Components/Builder/Text/TextPanel.vue',
  'resources/js/Components/Builder/Logo/LogoPanel.vue',
  'resources/js/stores/approval.js',
  'resources/js/stores/cart.js',
  'resources/js/stores/orders.js',
  'resources/js/stores/checkout.js',
  'resources/js/stores/shopping-cart.js',
  'resources/js/stores/saved-designs.js',
  'resources/js/stores/user.js',
];

function buildCustomizerContext() {
  const snippets = [];
  for (const relPath of CRITICAL_FILES) {
    const content = readRepoFile(relPath, 2000);
    if (content) snippets.push({ path: relPath, snippet: content });
  }
  return { modules: CUSTOMIZER_MODULES, snippets };
}

// Build once at startup and cache
const customizerContext = buildCustomizerContext();
const repoAvailable = customizerContext.snippets.length > 0;

// ─── Code-block extractor ──────────────────────────────────────────────────────
// Reads a file from the customizer repo and extracts the code around a named symbol.
// Returns { code, lineStart, lineEnd } or null if not found.
function extractCodeBlock(relPath, symbolName, contextLines = 40) {
  const content = readRepoFile(relPath, 999999); // read full file
  if (!content) return null;

  const lines = content.split('\n');
  // Find the line containing the symbol definition
  const patterns = [
    new RegExp(`\\b(async\\s+)?function\\s+${symbolName}\\b`),
    new RegExp(`\\b${symbolName}\\s*[:=]\\s*(async\\s+)?\\(`),
    new RegExp(`\\b${symbolName}\\s*[:=]\\s*(async\\s+)?function`),
    new RegExp(`\\b${symbolName}\\s*\\([^)]*\\)\\s*\\{`),
    new RegExp(`'${symbolName}'`),
    new RegExp(`"${symbolName}"`),
  ];

  let startIdx = -1;
  for (let i = 0; i < lines.length; i++) {
    if (patterns.some(p => p.test(lines[i]))) { startIdx = i; break; }
  }
  if (startIdx === -1) return null;

  // Walk forward to find the closing brace, up to contextLines
  let braceDepth = 0, endIdx = startIdx;
  for (let i = startIdx; i < Math.min(lines.length, startIdx + contextLines * 2); i++) {
    braceDepth += (lines[i].match(/\{/g) || []).length;
    braceDepth -= (lines[i].match(/\}/g) || []).length;
    endIdx = i;
    if (braceDepth <= 0 && i > startIdx) break;
  }
  // Cap at contextLines from start
  const end = Math.min(endIdx, startIdx + contextLines - 1);

  return {
    lineStart: startIdx + 1,
    lineEnd: end + 1,
    code: lines.slice(startIdx, end + 1).join('\n'),
  };
}

// Reads affected code blocks for a list of modules + function names
function readAffectedCodeBlocks(affectedModules) {
  const blocks = [];
  for (const mod of affectedModules) {
    const functions = mod.affectedFunctions || [];
    // Always try at least the keyExports from the registry as a fallback
    const registry = CUSTOMIZER_MODULES.find(m => m.name === mod.name || m.path === mod.path);
    const candidates = functions.length > 0 ? functions : (registry?.keyExports?.slice(0, 4) || []);

    const fileBlocks = [];
    for (const fn of candidates) {
      const block = extractCodeBlock(mod.path, fn);
      if (block && block.code.trim().length > 10) {
        fileBlocks.push({ functionName: fn, ...block });
      }
    }

    if (fileBlocks.length > 0 || candidates.length > 0) {
      blocks.push({
        name: mod.name,
        path: mod.path,
        severity: mod.severity,
        reason: mod.explanation || '',
        functions: fileBlocks,
        fileAvailable: fileBlocks.length > 0,
      });
    }
  }
  return blocks;
}

// ─── Affected Modules Local Scanner ───────────────────────────────────────────
function localAnalyzeAffectedModules({ brd, bugs = [], knowledgeBase, docContent, styleFeatures = STYLE_FEATURES_SEED }) {
  // Build the fullest possible content corpus from every available BRD field
  const bugContent = bugs.map(b =>
    [b.title, b.description, b.criteria, b.rootCause].filter(Boolean).join(' ')
  ).join(' ');

  const contentToScan = [
    brd.title,
    brd.description,
    brd.feTicket,
    brd.beTicket,
    brd.anciliaryTicket,
    brd.rndTicket,
    brd.baName,
    bugContent,
    docContent,
  ].filter(Boolean).join(' ').toLowerCase();

  const affectedModules = [];
  const affectedConcepts = new Set();
  const recommendations = [];
  let scorePoints = 10;

  for (const mod of CUSTOMIZER_MODULES) {
    const matchedKws = mod.keywords.filter(kw => contentToScan.includes(kw));
    if (matchedKws.length === 0) continue;

    const isCoreEngine = ['customizer.js', 'color.ts', 'application.ts', 'fabric.ts', 'uniform.ts', 'stage.ts'].includes(mod.name);
    const severity = isCoreEngine ? 'High' : matchedKws.length >= 3 ? 'High' : 'Medium';
    scorePoints += severity === 'High' ? 15 : 10;

    affectedModules.push({
      name: mod.name,
      path: mod.path,
      role: mod.role,
      severity,
      explanation: `Analysis indicates this BRD touches ${matchedKws.slice(0, 4).join(', ')}. As part of the ${mod.domain} domain, this file should be reviewed and likely modified for this requirement.`
    });
    affectedConcepts.add(mod.domain);
  }

  // Also check KB entries for extra coverage
  for (const kb of knowledgeBase) {
    const kbWords = kb.content.toLowerCase().split(/\W+/).filter(w => w.length > 4);
    if (kbWords.some(w => contentToScan.includes(w))) {
      affectedConcepts.add(kb.category);
    }
  }

  // Fallback
  if (affectedModules.length === 0) {
    affectedModules.push({
      name: 'customizer.js', path: 'resources/js/stores/customizer.js',
      role: 'Primary Pinia store managing customizer state.',
      severity: 'Low',
      explanation: 'Analysis did not surface a specific domain for this BRD. General uniform changes typically begin in the central customizer store, so it should be reviewed first.'
    });
    affectedConcepts.add('Core Store');
    recommendations.push('Audit customizer.js to register any new uniform properties in ActiveUniform.settings.');
  }

  // Concept-based recommendations
  const concepts = [...affectedConcepts];
  if (concepts.some(c => c.includes('Color'))) recommendations.push('Verify color zone mappings in color.ts remixColors() are updated for new zone definitions.');
  if (concepts.some(c => c.includes('Fabric'))) recommendations.push('Ensure fabric upgrade fee triggers in customizer.js setupFabricGroup() handle new material rules.');
  if (concepts.some(c => c.includes('Text'))) recommendations.push('Check font/layout constraints in TextPanel.vue and FontModal.vue for new text application rules.');
  if (concepts.some(c => c.includes('Logo'))) recommendations.push('Validate logo placement hit areas in stageEvents.js and logo conflict checks in ColorConflictAlertModal.vue.');
  if (concepts.some(c => c.includes('Embellishment'))) recommendations.push('Review embellishment layer order in application.ts and piping limits in piping.ts.');
  if (concepts.some(c => c.includes('Canvas'))) recommendations.push('Test PixiJS stage rendering changes across all views (front/back/left/right) via perspective.ts.');
  if (concepts.some(c => c.includes('Approval'))) recommendations.push('Update approval workflow in AskForChanges/Index.vue if new change-request fields are required.');
  if (concepts.some(c => c.includes('Pricing'))) recommendations.push('Validate cart line item mapping in cart-items.ts and CartForm.vue for new pricing rules.');
  if (concepts.some(c => c.includes('Roster'))) recommendations.push('Ensure roster bulk-upload parser in RosterPanel.vue handles new field requirements.');

  // ── Style-specific feature matching ────────────────────────────────────────
  const affectedStyleFeatures = [];
  for (const sf of styleFeatures) {
    const matchedKws = sf.keywords.filter(kw => contentToScan.includes(kw));
    if (matchedKws.length === 0) continue;
    const kwList = matchedKws.slice(0, 3).join(', ');
    affectedStyleFeatures.push({
      feature: sf.feature,
      tab: sf.tab,
      status: sf.status,
      impact: matchedKws.length >= 3 ? 'High' : 'Medium',
      explanation: 'Analysis indicates this BRD involves ' + kwList + ', so this function will need review and testing as part of this requirement.',
    });
  }

  const impactScore = Math.min(scorePoints, 100);
  const verdict = `Impact score ${impactScore}/100. ` +
    (impactScore > 60 ? `HIGH impact: touches core ${concepts.slice(0, 3).join(', ')} engines. Full regression testing required.`
      : impactScore > 30 ? `MODERATE impact: affects ${concepts.slice(0, 3).join(', ')} layer(s). Targeted QA across affected panels.`
        : `LOW impact: isolated to ${concepts.slice(0, 2).join(', ')} UI. Spot-check affected components.`);

  const affectedCodeBlocks = repoAvailable ? readAffectedCodeBlocks(affectedModules) : [];
  return { impactScore, verdict, affectedModules, affectedConcepts: concepts, recommendations: recommendations.slice(0, 6), affectedStyleFeatures, affectedCodeBlocks };
}

// ─── Default instructions for affected-modules prompt (editable by the user) ─
const DEFAULT_AFFECTED_MODULES_INSTRUCTIONS = `═══════════════════════════════════════════════════════
INSTRUCTIONS — ANALYSIS OUTPUT
═══════════════════════════════════════════════════════
You have now read:
  ✓ Section 1 — The BRD requirement
  ✓ Section 2 — AI Knowledge Base (domain rules and hardcoded logic relevant to this BRD)
  ✓ Section 3 — Codebase module index (real file paths and roles)
  ✓ Section 4 — Live code snippets (actual functions and exports in the repository)
  ✓ Section 5 — Builder function registry

Now produce your analysis using ONLY information found in those sections. Every file path, function name, and KB reference in your output must exist in the material above.

PART A — Affected Files
- List only files from Section 3 that are directly impacted by the BRD requirement
- Each file must include the exact path from Section 3 and real function names from Section 4
- Explain specifically HOW the requirement changes or touches that file — reference the KB context (Section 2) where it confirms the impact
- Severity: High = core store/engine/factory logic | Medium = component, service, or store helper | Low = UI-only or config tweak

PART B — Affected Builder Functions
- List only functions from Section 5 that the BRD will change, add, or remove
- Use the exact feature name and tab from Section 5
- Explain HOW the BRD impacts that function — tie it back to KB entries or code snippets where applicable

RULES:
- Do NOT include files or functions that are not touched by this specific requirement
- Do NOT invent paths, function names, or KB entries — only use what is in Sections 1–5
- If the KB (Section 2) contains a hardcoded rule directly related to the BRD, it MUST appear in your verdict and relevant explanations
- impactScore 0-100: reflects actual code surface area affected (High severity files raise the score)

Output ONLY a single valid JSON object — no markdown, no text outside the JSON:

{
  "impactScore": <0-100>,
  "verdict": "<one paragraph: summarise what the BRD changes, which KB rules are relevant, and which core files/functions are affected — use real names>",
  "affectedModules": [
    {
      "name": "<filename from Section 3>",
      "path": "<exact path from Section 3>",
      "role": "<role of this file>",
      "severity": "High|Medium|Low",
      "explanation": "<specific explanation: what in this file changes, which function is touched, and why — tie to BRD requirement and KB context>",
      "affectedFunctions": ["<real function name from Section 4 code snippets>"]
    }
  ],
  "affectedConcepts": ["<domain concept derived from BRD + KB — e.g. 'TCG', 'Sideline Size Restriction', 'MDJ Color Init'>"],
  "recommendations": ["<actionable step referencing real file or function names>"],
  "affectedStyleFeatures": [
    {
      "feature": "<exact feature name from Section 5>",
      "tab": "<exact tab from Section 5>",
      "status": "<status from Section 5: new|stable|ongoing|assessment>",
      "impact": "High|Medium|Low",
      "explanation": "<how this BRD specifically impacts this feature — reference the KB entry or code line that confirms it>"
    }
  ]
}`;

app.get('/api/affected-modules-prompt-template', (_req, res) => {
  res.json({ instructions: DEFAULT_AFFECTED_MODULES_INSTRUCTIONS });
});

// ─── Post Affected Modules Endpoint ──────────────────────────────────────────
app.post('/api/ai/analyze-affected-modules', async (req, res) => {
  try {
    const { brd, bugs = [], techLeads = [], devAssignees = [], knowledgeBase = [], docContent: uploadedDoc, customInstructions } = req.body;

    let docContent = uploadedDoc || null;
    if (!docContent && brd.googleDocsLink) {
      const { text } = await fetchGoogleDocText(brd.googleDocsLink);
      docContent = text;
    }

    // ── Cache: identical BRD + content ⇒ identical stored output ──────────
    const cacheKey = computeCacheKey('affected-modules', { brd, bugs, techLeads, devAssignees, knowledgeBase, docContent });
    const cachedResult = await getCachedAnalysis(cacheKey);
    if (cachedResult) {
      console.log(`💾 [cache] HIT for /analyze-affected-modules (${cacheKey.slice(0, 12)}…) — returning stored result`);
      return res.json({ ...cachedResult, cached: true });
    }

    // If no AI provider has a valid key, go straight to the local scanner
    const styleFeatures = await loadStyleFeatures();
    if (resolveProviderChain().length === 0) {
      const localResult = localAnalyzeAffectedModules({ brd, bugs, techLeads, devAssignees, knowledgeBase, docContent, styleFeatures });
      return res.json({ ...localResult, mode: 'local', provider: 'local', modeReason: 'missing_all_ai_api_keys', docFetched: !!docContent });
    }

    // ── Build full codebase-aware AI prompt ───────────────────────────────
    const kbSections = knowledgeBase.length
      ? knowledgeBase.map(k => `### ${k.category}: ${k.title}\n${k.content}`).join('\n\n')
      : '';

    // Module index: all 60+ modules as a compact table
    const moduleIndex = CUSTOMIZER_MODULES.map(m =>
      `• [${m.domain}] ${m.name} — ${m.path}\n  Role: ${m.role}\n  Key exports: ${m.keyExports.join(', ')}`
    ).join('\n\n');

    // Live file snippets from the actual repo
    const snippetSection = repoAvailable
      ? customizerContext.snippets.map(s =>
        `### ${s.path}\n\`\`\`\n${s.snippet}\n\`\`\``
      ).join('\n\n')
      : '(Repository not accessible — using module index only)';

    // Style-feature index for prompt — compact list Gemini can reference
    const styleFeatureIndex = styleFeatures.map(sf =>
      `• [${sf.tab}] ${sf.feature} (status: ${sf.status})`
    ).join('\n');

    const instructions = customInstructions || DEFAULT_AFFECTED_MODULES_INSTRUCTIONS;

    const prompt = `You are a senior technical architect for a sports apparel customizer platform (QStrike / ProLook Builder).

You will analyse a BRD (Business Requirements Document) by following a strict 3-step flow before producing any output:

  STEP 1 — Read the BRD (Section 1) to fully understand WHAT is being built or changed.
  STEP 2 — Cross-reference the AI Knowledge Base (Section 2) to find domain rules, hardcoded logic, brand-specific behaviours, and existing patterns that are relevant to this requirement.
  STEP 3 — Scan the Codebase (Section 3 module index + Section 4 live code snippets) to identify the EXACT files and functions that implement or will be impacted by what you found in Steps 1 and 2.

Only after completing all three steps, produce the output using the INSTRUCTIONS at the bottom.

Your results must be grounded in the actual repository files and KB entries — do not guess or invent paths or function names.

═══════════════════════════════════════════════════════
SECTION 1 — BRD REQUIREMENT (read this first — understand the requirement)
═══════════════════════════════════════════════════════
Title:       ${brd.title}
Status:      ${brd.status || '—'}
Quarter:     ${brd.quarter || '—'} ${brd.year || ''}
Sprint:      ${brd.sprintStart ? `${brd.sprintStart}${brd.sprintEnd && brd.sprintEnd !== brd.sprintStart ? ' – ' + brd.sprintEnd : ''}` : 'Not assigned'}
T-Shirt:     ${brd.tshirtSize || 'Not sized'}
BA / Author: ${brd.baName || 'Not assigned'}
Jira:        ${brd.jiraLink || 'None'}
FE Ticket:   ${brd.feTicket || 'None'}
BE Ticket:   ${brd.beTicket || 'None'}
R&D Ticket:  ${brd.rndTicket || 'None'}

── DESCRIPTION ──────────────────────────────────────
${brd.description || 'No description provided.'}

── BUGS / LINKED REQUIREMENTS (${bugs.length}) ─────
${bugs.length
        ? bugs.map(b =>
          `[${(b.severity || 'medium').toUpperCase()}] ${b.title}\n` +
          `  Status: ${b.status || 'open'} | Criteria: ${b.criteria || 'N/A'}\n` +
          (b.description ? `  Details: ${b.description.slice(0, 400)}\n` : '') +
          (b.rootCause ? `  Root cause: ${b.rootCause.slice(0, 200)}\n` : '')
        ).join('\n')
        : 'No bugs logged.'}

── FULL SPECIFICATION ───────────────────────────────
${docContent
        ? docContent.slice(0, 12000)
        : brd.googleDocsLink
          ? `(Google Doc present at ${brd.googleDocsLink} but could not be fetched — ensure the document is publicly shared.)`
          : 'No specification document attached. Analyse based on title, description, and bugs above.'
      }

═══════════════════════════════════════════════════════
SECTION 2 — AI KNOWLEDGE BASE (read second — find domain rules relevant to the BRD above)
After reading the BRD, scan every KB entry below. Extract entries whose subject matter overlaps with the BRD's requirements — these entries identify hardcoded behaviours, brand-specific rules, and existing system patterns your affected-file results must reference.
═══════════════════════════════════════════════════════
${kbSections || 'No KB entries.'}

═══════════════════════════════════════════════════════
SECTION 3 — CODEBASE MODULE INDEX (read third — map BRD + KB findings to real files)
Using the requirement (Section 1) and the KB context (Section 2), identify which of the ${CUSTOMIZER_MODULES.length} modules below are affected. Use exact file names and paths. Do not include files that are unrelated to the requirement.
═══════════════════════════════════════════════════════
${moduleIndex}

═══════════════════════════════════════════════════════
SECTION 4 — LIVE CODE SNIPPETS (actual source code from repository)
These are real code snippets pulled from the repository. Use them to confirm which functions, getters, and exports are impacted. Reference actual function names found here in your output.
═══════════════════════════════════════════════════════
${snippetSection}

═══════════════════════════════════════════════════════
SECTION 5 — BUILDER FUNCTION REGISTRY (${styleFeatures.length} functions)
These are the known builder features across all tabs. Cross-reference this against the BRD and KB to identify which features this requirement will affect.
═══════════════════════════════════════════════════════
${styleFeatureIndex}

${instructions}`;

    // Try configured provider → fall back through the others on quota/error
    const r = await runAnalysisWithFallback(prompt);
    if (!r.provider) {
      const localResult = localAnalyzeAffectedModules({ brd, bugs, techLeads, devAssignees, knowledgeBase, docContent, styleFeatures });
      return res.json({ ...localResult, mode: 'local', provider: 'local', modeReason: 'all_ai_providers_failed', docFetched: !!docContent });
    }
    const result = r;
    const usedProvider = r.provider;
    const fellBack = r.tried.length ? `fell_back_from_${r.tried.map(t => t.provider).join('_')}` : null;

    let parsedJson = null;
    try {
      let clean = (result.analysis || '').replace(/```json/g, '').replace(/```/g, '').trim();
      // Some models prepend prose before the JSON object despite instructions —
      // fall back to the outermost {...} span so leading/trailing text doesn't break parsing.
      const start = clean.indexOf('{');
      const end = clean.lastIndexOf('}');
      if (start !== -1 && end !== -1 && end > start) clean = clean.slice(start, end + 1);
      parsedJson = JSON.parse(clean);
    } catch (parseErr) {
      console.error(`⛔ [AI] ${usedProvider.toUpperCase()} returned unparseable JSON — falling back to local. Parse error: ${parseErr.message}`);
      console.error(`   Raw response (first 500 chars): ${(result.analysis || '').slice(0, 500)}`);
      const localResult = localAnalyzeAffectedModules({ brd, bugs, techLeads, devAssignees, knowledgeBase, docContent, styleFeatures });
      return res.json({ ...localResult, mode: 'local', provider: 'local', modeReason: 'ai_parse_error', docFetched: !!docContent });
    }

    // Read actual code blocks from the local repo for each affected module
    const affectedCodeBlocks = repoAvailable
      ? readAffectedCodeBlocks(parsedJson.affectedModules || [])
      : [];

    const payload = { ...parsedJson, affectedCodeBlocks, mode: 'ai', provider: usedProvider, model: r.model || null, modeReason: fellBack, docFetched: !!docContent };
    // Persist so the same BRD + content returns the same output next time
    await saveCachedAnalysis(cacheKey, 'affected-modules', usedProvider, payload);
    return res.json(payload);

  } catch (e) {
    try {
      const { brd, bugs = [], techLeads = [], devAssignees = [], knowledgeBase = [], docContent: uploadedDoc } = req.body;
      const sfFallback = await loadStyleFeatures().catch(() => STYLE_FEATURES_SEED);
      const localResult = localAnalyzeAffectedModules({ brd, bugs, techLeads, devAssignees, knowledgeBase, docContent: uploadedDoc, styleFeatures: sfFallback });
      return res.json({ ...localResult, mode: 'local', provider: 'local', modeReason: 'error_fallback', docFetched: !!uploadedDoc });
    } catch { return res.status(500).json({ error: e.message }); }
  }
});

// ─── Google OAuth2 Routes ─────────────────────────────────────────────────────

// Returns connection status and whether credentials are configured
app.get('/api/google/status', (_req, res) => {
  res.json({
    connected: !!googleTokens?.refresh_token,
    configured: !!(GOOGLE_CLIENT_ID && GOOGLE_CLIENT_SECRET),
    email: googleTokens?.email || null,
  });
});

// Returns the Google consent URL for the user to open in their browser
app.get('/api/google/auth-url', (_req, res) => {
  if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET) {
    return res.status(400).json({ error: 'GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET are not set in .env' });
  }
  const params = new URLSearchParams({
    client_id: GOOGLE_CLIENT_ID,
    redirect_uri: GOOGLE_REDIRECT_URI,
    response_type: 'code',
    scope: GOOGLE_SCOPE,
    access_type: 'offline',
    prompt: 'consent',
  });
  res.json({ url: `https://accounts.google.com/o/oauth2/auth?${params}` });
});

// OAuth2 callback — exchanges the auth code for tokens and saves them
app.get('/api/google/callback', async (req, res) => {
  const { code, error } = req.query;
  console.log('[google/callback] received —', error ? `error: ${error}` : `code: ${code?.slice(0, 12)}…`);
  if (error) return res.status(400).send(`<h2>Google denied access: ${error}</h2><p>Close this tab and try again.</p>`);
  if (!code) return res.status(400).send('<h2>Missing authorization code</h2>');

  try {
    const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: GOOGLE_CLIENT_ID,
        client_secret: GOOGLE_CLIENT_SECRET,
        code,
        grant_type: 'authorization_code',
        redirect_uri: GOOGLE_REDIRECT_URI,
      }),
    });
    if (!tokenRes.ok) {
      const body = await tokenRes.text();
      console.error('[google/callback] ❌ token exchange failed:', tokenRes.status, body.slice(0, 200));
      return res.status(400).send(`<h2>Token exchange failed (${tokenRes.status})</h2><pre>${body}</pre><p>Check that GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET in .env are correct.</p>`);
    }
    const tokens = await tokenRes.json();

    // Optionally fetch the user's email for display
    let email = null;
    try {
      const infoRes = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
        headers: { Authorization: `Bearer ${tokens.access_token}` },
      });
      if (infoRes.ok) { const info = await infoRes.json(); email = info.email; }
    } catch { }

    saveGoogleTokens({
      ...tokens,
      email,
      expiry_date: Date.now() + (tokens.expires_in || 3600) * 1000,
    });
    console.log(`[google/callback] ✅ tokens saved${email ? ' for ' + email : ''}, has_refresh=${!!tokens.refresh_token}`);

    // Redirect back to the app — same-tab flow, no popup needed
    const appUrl = `http://localhost:5173/?google=connected&email=${encodeURIComponent(email || '')}`;
    res.redirect(appUrl);
  } catch (e) {
    res.status(500).send(`<h2>Error: ${e.message}</h2>`);
  }
});

// Disconnect Google — removes stored tokens
app.delete('/api/google/disconnect', (_req, res) => {
  clearGoogleTokens();
  res.json({ ok: true });
});

// Test doc fetch — returns exactly what fetchGoogleDocText returns so the UI can show debug info
app.post('/api/google/test-doc', async (req, res) => {
  const { url } = req.body || {};
  if (!url) return res.status(400).json({ error: 'url is required' });
  const result = await fetchGoogleDocText(url);
  const token = await getGoogleAccessToken();
  res.json({
    ...result,
    hasToken: !!token,
    connected: !!googleTokens?.refresh_token,
    wordCount: result.text ? result.text.split(/\s+/).filter(Boolean).length : 0,
    preview: result.text ? result.text.slice(0, 300) : null,
  });
});

// ─── Local BRD Backup ─────────────────────────────────────────────────────────
async function writeBRDLocalBackup() {
  try {
    const [{ recordset: brds }, { recordset: bugs }] = await Promise.all([
      pool.request().query('SELECT * FROM brds ORDER BY createdAt DESC'),
      pool.request().query('SELECT * FROM bugs ORDER BY createdAt DESC'),
    ]);
    const payload = {
      version: 1,
      exportedAt: new Date().toISOString(),
      source: 'BRD Insight Auto-Sync',
      totalBRDs: brds.length,
      totalBugs: bugs.length,
      brds,
      bugs,
    };
    writeFileSync(LOCAL_BACKUP_PATH, JSON.stringify(payload, null, 2), 'utf-8');
  } catch (e) {
    console.error('[backup] write failed:', e.message);
  }
}

// Serve the latest backup as a download; always regenerates so it is fresh
// Route is /api/brd-backup (not under /api/brds/ to avoid :id param clash)
app.get('/api/brd-backup', async (_req, res) => {
  try {
    await writeBRDLocalBackup();
    const date = new Date().toISOString().slice(0, 10);
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', `attachment; filename="brd-backup-${date}.json"`);
    res.send(readFileSync(LOCAL_BACKUP_PATH, 'utf-8'));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Silently refresh the local backup file — no download, just writes to disk
app.post('/api/brd-backup/sync', async (_req, res) => {
  try {
    await writeBRDLocalBackup();
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ─── Start ────────────────────────────────────────────────────────────────────
init()
  .then(() => seedStyleFeatures())
  .then(() => {
    app.listen(PORT, () => {
      const aiStatus = resolveAIProvider();
      const aiLine = aiStatus.provider
        ? `${aiStatus.provider} (key OK)`
        : `UNAVAILABLE — ${aiStatus.reason}`;
      console.log(`\n  BRD Insight API  →  http://localhost:${PORT}/api/health`);
      console.log(`  Database         →  ${DB_HOST}${DB_INSTANCE ? '\\' + DB_INSTANCE : ':' + DB_PORT}/${DB_NAME}`);
      console.log(`  Auth             →  ${(DB_TRUSTED || !DB_USER) ? 'Windows Authentication' : `SQL Server (${DB_USER})`}`);
      console.log(`  AI Provider      →  ${aiLine}\n`);
    });
  })
  .catch((err) => {
    console.error('\n  ✗ Failed to connect to SQL Server:', err.message);
    console.error('  Check your .env file and make sure SQL Server is running.\n');
    process.exit(1);
  });

