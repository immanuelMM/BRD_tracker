import * as XLSX from 'xlsx';
import { getSprintLabel, STATUS_OPTIONS, BA_OPTIONS, QUARTER_MONTHS, MIN_BUG_THRESHOLD } from './constants';

const getStatusLabel = (val) => STATUS_OPTIONS.find((s) => s.value === val)?.label || val;

const brdRow = (brd, bugs = [], techLeadsMap = {}) => {
  const bugCount = bugs.filter((b) => b.brdId === brd.id).length;
  const techLeads = techLeadsMap[brd.id] || [];
  const techLeadStr = techLeads.length > 0
    ? techLeads.map((tl) => `${tl.name}${tl.expertise ? ` (${tl.expertise})` : ''}`).join(', ')
    : brd.techLead || '';

  return {
    Title: brd.title || '',
    Description: brd.description || '',
    Status: getStatusLabel(brd.status),
    Quarter: brd.quarter || '',
    Year: brd.year || '',
    Sprint: getSprintLabel(brd),
    BA: brd.baName || '',
    'Tech Leads': techLeadStr,
    'T-Shirt Size': brd.tshirtSize || '',
    'Bug Count': bugCount,
    Result: brd.status === 'launched' ? (bugCount <= MIN_BUG_THRESHOLD ? 'Success' : 'High Bugs') : '',
    'Google Docs': brd.googleDocsLink || '',
    'Jira Link': brd.jiraLink || '',
    'Bug Log': brd.bugLogLink || '',
  };
};

const bugRow = (bug, brds = []) => {
  const brd = brds.find((b) => b.id === bug.brdId);
  return {
    BRD: brd?.title || '',
    'Bug Title': bug.title || '',
    Criteria: bug.criteria || '',
    Severity: bug.severity || '',
    Status: bug.status || '',
    Description: bug.description || '',
  };
};

const save = (wb, filename) => {
  XLSX.writeFile(wb, filename);
};

const autoWidth = (ws, rows) => {
  if (!rows.length) return;
  const keys = Object.keys(rows[0]);
  const colWidths = keys.map((k) => ({
    wch: Math.max(k.length, ...rows.map((r) => String(r[k] ?? '').length)) + 2,
  }));
  ws['!cols'] = colWidths;
};

// ─── BRD List export ───────────────────────────────────────────────────────
export const exportBRDsToExcel = (brds, bugs, filename = 'BRDs.xlsx') => {
  const rows = brds.map((b) => brdRow(b, bugs));
  const ws = XLSX.utils.json_to_sheet(rows);
  autoWidth(ws, rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'BRDs');
  save(wb, filename);
};

// ─── Quarter export ────────────────────────────────────────────────────────
export const exportQuarterToExcel = (quarter, year, brds, bugs) => {
  const qBRDs = brds.filter((b) => b.quarter === quarter && String(b.year) === String(year));
  const qBugs = bugs.filter((bug) => qBRDs.some((b) => b.id === bug.brdId));

  const brdRows = qBRDs.map((b) => brdRow(b, bugs));
  const bugRows = qBugs.map((bug) => bugRow(bug, brds));

  const wsBRDs = XLSX.utils.json_to_sheet(brdRows);
  const wsBugs = XLSX.utils.json_to_sheet(bugRows.length ? bugRows : [{ Note: 'No bugs this quarter' }]);
  autoWidth(wsBRDs, brdRows);
  autoWidth(wsBugs, bugRows.length ? bugRows : []);

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, wsBRDs, `${quarter} ${year} BRDs`);
  XLSX.utils.book_append_sheet(wb, wsBugs, `${quarter} ${year} Bugs`);
  save(wb, `BRD_Report_${quarter}_${year}.xlsx`);
};

// ─── Quarter View export (all quarters) ───────────────────────────────────
export const exportQuarterViewToExcel = (year, brds, bugs) => {
  const wb = XLSX.utils.book_new();
  ['Q1', 'Q2', 'Q3', 'Q4'].forEach((q) => {
    const qBRDs = brds.filter((b) => b.quarter === q && String(b.year) === String(year) && b.sprintStart);
    if (!qBRDs.length) return;
    const rows = qBRDs.map((b) => brdRow(b, bugs));
    const ws = XLSX.utils.json_to_sheet(rows);
    autoWidth(ws, rows);
    XLSX.utils.book_append_sheet(wb, ws, `${q} ${year}`);
  });
  // Unscheduled sheet
  const unscheduled = brds.filter((b) => b.status === 'planning' && (!b.quarter || !b.sprintStart));
  if (unscheduled.length) {
    const rows = unscheduled.map((b) => brdRow(b, bugs));
    const ws = XLSX.utils.json_to_sheet(rows);
    autoWidth(ws, rows);
    XLSX.utils.book_append_sheet(wb, ws, 'No Schedule');
  }
  if (wb.SheetNames.length === 0) XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet([{ Note: 'No data' }]), 'Empty');
  save(wb, `Quarter_View_${year}.xlsx`);
};

// ─── BA View export ────────────────────────────────────────────────────────
export const exportBAViewToExcel = (brds, bugs) => {
  const wb = XLSX.utils.book_new();
  BA_OPTIONS.forEach((ba) => {
    const baRows = brds.filter((b) => b.baName === ba).map((b) => brdRow(b, bugs));
    if (!baRows.length) return;
    const ws = XLSX.utils.json_to_sheet(baRows);
    autoWidth(ws, baRows);
    XLSX.utils.book_append_sheet(wb, ws, ba);
  });
  // Unassigned
  const unassigned = brds.filter((b) => !b.baName || !BA_OPTIONS.includes(b.baName));
  if (unassigned.length) {
    const rows = unassigned.map((b) => brdRow(b, bugs));
    const ws = XLSX.utils.json_to_sheet(rows);
    autoWidth(ws, rows);
    XLSX.utils.book_append_sheet(wb, ws, 'Unassigned');
  }
  if (wb.SheetNames.length === 0) XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet([{ Note: 'No data' }]), 'Empty');
  save(wb, 'BA_View.xlsx');
};

// ─── T-Shirt Size export ───────────────────────────────────────────────────
export const exportTShirtToExcel = (brds, bugs) => {
  const rows = brds.map((b) => brdRow(b, bugs)).sort((a, b) => a['T-Shirt Size'].localeCompare(b['T-Shirt Size']));
  const ws = XLSX.utils.json_to_sheet(rows.length ? rows : [{ Note: 'No BRDs' }]);
  autoWidth(ws, rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'T-Shirt Sizes');
  save(wb, 'TShirt_Sizes.xlsx');
};

// ─── Dashboard summary export ──────────────────────────────────────────────
export const exportDashboardToExcel = (brds, bugs) => {
  const wb = XLSX.utils.book_new();

  // All BRDs sheet
  const allRows = brds.map((b) => brdRow(b, bugs));
  const wsAll = XLSX.utils.json_to_sheet(allRows.length ? allRows : [{ Note: 'No BRDs' }]);
  autoWidth(wsAll, allRows);
  XLSX.utils.book_append_sheet(wb, wsAll, 'All BRDs');

  // Status summary sheet
  const summaryRows = STATUS_OPTIONS.map((s) => ({
    Status: s.label,
    Count: brds.filter((b) => b.status === s.value).length,
  }));
  const wsSummary = XLSX.utils.json_to_sheet(summaryRows);
  autoWidth(wsSummary, summaryRows);
  XLSX.utils.book_append_sheet(wb, wsSummary, 'Summary');

  save(wb, 'Dashboard_Export.xlsx');
};

// ─── Workflow export ───────────────────────────────────────────────────────
export const exportWorkflowToExcel = (brds, bugs) => {
  const wb = XLSX.utils.book_new();

  // All BRDs sheet grouped by workflow stage
  STATUS_OPTIONS.forEach((status) => {
    const stageRows = brds
      .filter((b) => b.status === status.value)
      .map((b) => brdRow(b, bugs));

    if (!stageRows.length) return;

    const ws = XLSX.utils.json_to_sheet(stageRows);
    autoWidth(ws, stageRows);
    XLSX.utils.book_append_sheet(wb, ws, status.label);
  });

  if (wb.SheetNames.length === 0) {
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet([{ Note: 'No BRDs' }]), 'Empty');
  }

  save(wb, 'Workflow_Pipeline.xlsx');
};
