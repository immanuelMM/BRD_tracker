import { useState, useRef, useEffect } from 'react';
import { runQuery } from '../utils/db';

const PRESETS = [
  { label: 'All BRDs',         sql: 'SELECT id, title, quarter, year, status, baName, techLead, tshirtSize FROM brds ORDER BY createdAt DESC;' },
  { label: 'All Bugs',         sql: 'SELECT id, brdId, title, criteria, severity, status FROM bugs ORDER BY createdAt DESC;' },
  { label: 'BRD count',        sql: 'SELECT COUNT(*) AS total_brds FROM brds;' },
  { label: 'Bug count',        sql: 'SELECT COUNT(*) AS total_bugs FROM bugs;' },
  { label: 'Bugs per BRD',     sql: 'SELECT b.title AS brd, COUNT(g.id) AS bugs\nFROM brds b\nLEFT JOIN bugs g ON g.brdId = b.id\nGROUP BY b.id\nORDER BY bugs DESC;' },
  { label: 'Launched BRDs',    sql: "SELECT title, quarter, year, baName, techLead, tshirtSize FROM brds WHERE status = 'launched';"},
  { label: 'Open bugs',        sql: "SELECT g.title, g.criteria, g.severity, b.title AS brd\nFROM bugs g\nJOIN brds b ON b.id = g.brdId\nWHERE g.status = 'open'\nORDER BY g.severity;"},
  { label: 'By T-Shirt size',  sql: 'SELECT tshirtSize AS size, COUNT(*) AS count FROM brds GROUP BY tshirtSize ORDER BY count DESC;' },
  { label: 'Bugs by criteria', sql: 'SELECT criteria, COUNT(*) AS count FROM bugs GROUP BY criteria ORDER BY count DESC;' },
  { label: 'Tables info',      sql: "SELECT TABLE_NAME, TABLE_TYPE FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_CATALOG = DB_NAME();"},
];

const SEVERITY_COLOR = { critical: '#ef4444', high: '#f97316', medium: '#f59e0b', low: '#10b981' };
const STATUS_COLOR   = { open: '#ef4444', in_progress: '#f59e0b', resolved: '#10b981', closed: '#64748b', launched: '#10b981', development: '#3b82f6', planning: '#6366f1', testing: '#8b5cf6', onhold: '#ef4444' };

function cellStyle(col, val) {
  if (val === null || val === undefined) return null;
  if (col === 'severity' && SEVERITY_COLOR[val]) return { color: SEVERITY_COLOR[val], fontWeight: 600 };
  if (col === 'status'   && STATUS_COLOR[val])   return { color: STATUS_COLOR[val],   fontWeight: 600 };
  return null;
}

export default function SQLExplorer() {
  const [query, setQuery]     = useState(PRESETS[0].sql);
  const [result, setResult]   = useState(null);
  const [history, setHistory] = useState([]);
  const [elapsed, setElapsed] = useState(null);
  const textareaRef = useRef(null);

  const active = true;

  const execute = async (sql = query) => {
    const q = sql.trim();
    if (!q) return;
    const t0 = performance.now();
    const res = await runQuery(q);
    setElapsed((performance.now() - t0).toFixed(2));
    setResult(res);
    setHistory((h) => [{ sql: q, ok: !res.error, time: new Date().toLocaleTimeString() }, ...h.slice(0, 19)]);
  };

  const handleKey = (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') { e.preventDefault(); execute(); }
    // Tab → 2 spaces
    if (e.key === 'Tab') {
      e.preventDefault();
      const el = textareaRef.current;
      const s = el.selectionStart, end = el.selectionEnd;
      setQuery(query.slice(0, s) + '  ' + query.slice(end));
      requestAnimationFrame(() => { el.selectionStart = el.selectionEnd = s + 2; });
    }
  };

  // Auto-run first preset on load
  useEffect(() => { if (active) execute(PRESETS[0].sql); }, [active]); // eslint-disable-line

  const rowCount = result?.rows?.length ?? 0;

  return (
    <div className="space-y-4">

      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
            <span className="text-xl">🗄️</span> SQL Explorer
          </h2>
          <p className="text-xs text-slate-400 mt-0.5">Query your SQL Server database directly</p>
        </div>
        <span className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-400 rounded-xl text-xs font-semibold ring-1 ring-emerald-300 dark:ring-emerald-700"><span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />SQL Server Active</span>
      </div>

      {(
        <>
          <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">

            {/* Editor panel */}
            <div className="lg:col-span-3 space-y-3">

              {/* Preset buttons */}
              <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-3">
                <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-2 px-1">Quick Queries</p>
                <div className="flex flex-wrap gap-2">
                  {PRESETS.map((p) => (
                    <button key={p.label} onClick={() => { setQuery(p.sql); execute(p.sql); }}
                      className="px-3 py-1.5 text-xs font-medium rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-blue-100 dark:hover:bg-blue-950 hover:text-blue-700 dark:hover:text-blue-300 transition-colors">
                      {p.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Query editor */}
              <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 overflow-hidden">
                <div className="flex items-center justify-between px-4 py-2.5 border-b border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50">
                  <span className="text-xs font-semibold text-slate-500 dark:text-slate-400 flex items-center gap-1.5">
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4"/></svg>
                    SQL Editor
                    <span className="text-slate-400 font-normal ml-1">Ctrl+Enter to run</span>
                  </span>
                  <div className="flex gap-2">
                    <button onClick={() => setQuery('')} className="text-xs text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors">Clear</button>
                    <button onClick={() => execute()} className="flex items-center gap-1.5 bg-blue-600 hover:bg-blue-700 text-white px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors">
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z"/><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
                      Run
                    </button>
                  </div>
                </div>
                <textarea
                  ref={textareaRef}
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  onKeyDown={handleKey}
                  rows={6}
                  spellCheck={false}
                  className="w-full px-4 py-3 bg-slate-950 text-emerald-400 font-mono text-sm resize-none focus:outline-none leading-relaxed"
                  placeholder="SELECT * FROM brds;"
                />
              </div>

              {/* Results */}
              <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 overflow-hidden">
                {/* Result header */}
                <div className="flex items-center justify-between px-4 py-2.5 border-b border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50">
                  <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">Results</span>
                  {result && !result.error && (
                    <span className="text-xs text-slate-400">
                      {rowCount} row{rowCount !== 1 ? 's' : ''}
                      {elapsed && <span className="ml-2 text-slate-300 dark:text-slate-600">· {elapsed}ms</span>}
                    </span>
                  )}
                </div>

                {!result && (
                  <div className="py-12 text-center text-slate-400 text-sm">Run a query to see results</div>
                )}

                {result?.error && (
                  <div className="p-4 flex items-start gap-3">
                    <svg className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
                    <div>
                      <p className="text-sm font-semibold text-red-600 dark:text-red-400">SQL Error</p>
                      <p className="text-xs text-red-500 dark:text-red-400 mt-0.5 font-mono">{result.error}</p>
                    </div>
                  </div>
                )}

                {result && !result.error && result.columns?.length === 0 && (
                  <div className="py-8 text-center">
                    <p className="text-sm font-medium text-emerald-600 dark:text-emerald-400">✓ Query executed successfully</p>
                    {result.rowsAffected > 0 && <p className="text-xs text-slate-400 mt-1">{result.rowsAffected} row{result.rowsAffected !== 1 ? 's' : ''} affected</p>}
                  </div>
                )}

                {result && !result.error && result.columns?.length > 0 && (
                  <div className="overflow-x-auto max-h-96 overflow-y-auto">
                    <table className="w-full text-xs">
                      <thead className="sticky top-0 z-10">
                        <tr className="bg-slate-100 dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700">
                          <th className="px-3 py-2 text-left font-semibold text-slate-400 w-8">#</th>
                          {result.columns.map((col) => (
                            <th key={col} className="px-3 py-2 text-left font-semibold text-slate-600 dark:text-slate-300 whitespace-nowrap">{col}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-50 dark:divide-slate-800/50">
                        {result.rows.map((row, i) => (
                          <tr key={i} className="hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors">
                            <td className="px-3 py-2 text-slate-400 select-none">{i + 1}</td>
                            {row.map((cell, j) => {
                              const col = result.columns[j];
                              const style = cellStyle(col, cell);
                              const isNull = cell === null || cell === undefined;
                              return (
                                <td key={j} className="px-3 py-2 font-mono max-w-xs truncate" style={style || {}}>
                                  {isNull
                                    ? <span className="text-slate-300 dark:text-slate-600 italic">null</span>
                                    : <span className={style ? '' : 'text-slate-700 dark:text-slate-300'}>{String(cell)}</span>
                                  }
                                </td>
                              );
                            })}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>

            {/* Sidebar: schema + history */}
            <div className="space-y-4">

              {/* Schema browser */}
              <SchemaPanel />

              {/* Query history */}
              {history.length > 0 && (
                <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800">
                  <div className="px-4 py-3 border-b border-slate-100 dark:border-slate-800">
                    <p className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide">History</p>
                  </div>
                  <div className="divide-y divide-slate-50 dark:divide-slate-800/50 max-h-64 overflow-y-auto">
                    {history.map((h, i) => (
                      <div key={i} onClick={() => { setQuery(h.sql); execute(h.sql); }}
                        className="px-4 py-2.5 cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors">
                        <div className="flex items-center gap-2 mb-0.5">
                          <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${h.ok ? 'bg-emerald-500' : 'bg-red-500'}`} />
                          <span className="text-xs text-slate-400">{h.time}</span>
                        </div>
                        <p className="text-xs font-mono text-slate-600 dark:text-slate-400 truncate">{h.sql}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function SchemaPanel() {
  const tables = ['brds', 'bugs'];
  const schemas = {
    brds: ['id', 'title', 'description', 'googleDocsLink', 'quarter', 'year', 'sprintStart', 'sprintEnd', 'jiraLink', 'status', 'bugLogLink', 'baName', 'techLead', 'tshirtSize', 'createdAt', 'updatedAt'],
    bugs: ['id', 'brdId', 'title', 'description', 'criteria', 'severity', 'status', 'createdAt'],
  };
  const [open, setOpen] = useState({ brds: true, bugs: false });

  return (
    <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800">
      <div className="px-4 py-3 border-b border-slate-100 dark:border-slate-800">
        <p className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide">Schema</p>
      </div>
      <div className="divide-y divide-slate-50 dark:divide-slate-800/50">
        {tables.map((tbl) => (
          <div key={tbl}>
            <button onClick={() => setOpen((o) => ({ ...o, [tbl]: !o[tbl] }))}
              className="w-full flex items-center justify-between px-4 py-2.5 hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors">
              <span className="flex items-center gap-2 text-xs font-semibold text-slate-700 dark:text-slate-300">
                <svg className="w-3.5 h-3.5 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h18M3 6h18M3 14h18M3 18h18"/></svg>
                {tbl}
              </span>
              <svg className={`w-3.5 h-3.5 text-slate-400 transition-transform ${open[tbl] ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7"/></svg>
            </button>
            {open[tbl] && (
              <div className="px-4 pb-3 space-y-1">
                {schemas[tbl].map((col) => (
                  <div key={col} className="flex items-center gap-2">
                    <span className="w-1.5 h-1.5 rounded-full bg-slate-300 dark:bg-slate-600 flex-shrink-0" />
                    <span className="text-xs font-mono text-slate-500 dark:text-slate-400">{col}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
