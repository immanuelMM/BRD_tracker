import { useState } from 'react';
import { STATUS_OPTIONS, QUARTERS, YEARS, MIN_BUG_THRESHOLD, getSprintLabel, getTShirtSize } from '../utils/constants';
import StatusBadge from './StatusBadge';
import { exportBRDsToExcel } from '../utils/excelExport';

const COLUMN_STYLES = {
  planning:    { top: 'bg-indigo-500',  header: 'bg-slate-50 dark:bg-slate-800/60',  label: 'text-slate-700 dark:text-slate-200', count: 'bg-indigo-100 dark:bg-indigo-900/60 text-indigo-700 dark:text-indigo-300' },
  inprogress:  { top: 'bg-amber-400',   header: 'bg-slate-50 dark:bg-slate-800/60',  label: 'text-slate-700 dark:text-slate-200', count: 'bg-amber-100 dark:bg-amber-900/60 text-amber-700 dark:text-amber-300' },
  development: { top: 'bg-blue-500',    header: 'bg-slate-50 dark:bg-slate-800/60',  label: 'text-slate-700 dark:text-slate-200', count: 'bg-blue-100 dark:bg-blue-900/60 text-blue-700 dark:text-blue-300' },
  testing:     { top: 'bg-violet-500',  header: 'bg-slate-50 dark:bg-slate-800/60',  label: 'text-slate-700 dark:text-slate-200', count: 'bg-violet-100 dark:bg-violet-900/60 text-violet-700 dark:text-violet-300' },
  launched:    { top: 'bg-emerald-500', header: 'bg-slate-50 dark:bg-slate-800/60',  label: 'text-slate-700 dark:text-slate-200', count: 'bg-emerald-100 dark:bg-emerald-900/60 text-emerald-700 dark:text-emerald-300' },
  onhold:      { top: 'bg-red-400',     header: 'bg-slate-50 dark:bg-slate-800/60',  label: 'text-slate-700 dark:text-slate-200', count: 'bg-red-100 dark:bg-red-900/60 text-red-600 dark:text-red-400' },
};

const AVATAR_COLORS = [
  'bg-blue-500', 'bg-violet-500', 'bg-emerald-500', 'bg-amber-500',
  'bg-rose-500',  'bg-cyan-500',  'bg-indigo-500',  'bg-teal-500',
];
const avatarColor = (name = '') => AVATAR_COLORS[name.charCodeAt(0) % AVATAR_COLORS.length];

function Avatar({ name, size = 'sm' }) {
  if (!name) return null;
  const initials = name.split(' ').map((w) => w[0]).join('').slice(0, 2).toUpperCase();
  const sz = size === 'sm' ? 'w-6 h-6 text-[10px]' : 'w-7 h-7 text-xs';
  return (
    <span title={name} className={`${sz} ${avatarColor(name)} rounded-full flex items-center justify-center text-white font-bold flex-shrink-0`}>
      {initials}
    </span>
  );
}

function BRDCard({ brd, bugCount, onSelect, onDelete }) {
  const isSuccess = brd.status === 'launched' && bugCount <= MIN_BUG_THRESHOLD;
  const s = getTShirtSize(brd.tshirtSize);

  // Parse dev assignees
  let devs = [];
  try { const p = JSON.parse(brd.devAssignee || '[]'); devs = Array.isArray(p) ? p : (brd.devAssignee ? [brd.devAssignee] : []); } catch { devs = brd.devAssignee ? [brd.devAssignee] : []; }

  return (
    <div
      onClick={() => onSelect(brd.id)}
      className="group bg-white dark:bg-slate-900 rounded-lg border border-slate-200 dark:border-slate-700 hover:border-blue-300 dark:hover:border-blue-600 hover:shadow-md dark:hover:shadow-slate-950/50 cursor-pointer transition-all duration-150"
    >
      {/* Jira-style top priority stripe */}
      {isSuccess && <div className="h-0.5 rounded-t-lg bg-emerald-400" />}

      <div className="p-3">
        {/* Title row */}
        <div className="flex items-start justify-between gap-2 mb-2">
          <p className="text-sm font-medium text-slate-800 dark:text-slate-100 leading-snug line-clamp-2 flex-1">{brd.title}</p>
          <button
            onClick={(e) => { e.stopPropagation(); if (confirm('Delete this BRD and all its bugs?')) onDelete(brd.id); }}
            className="opacity-0 group-hover:opacity-100 p-1 rounded text-slate-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-950 transition-all flex-shrink-0 -mt-0.5 -mr-1"
          >
            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        </div>

        {/* Meta row: quarter · sprint */}
        <div className="flex items-center gap-1.5 mb-2.5 flex-wrap">
          <span className="text-[10px] font-medium text-slate-400 bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5 rounded">
            {brd.quarter} {brd.year}
          </span>
          {brd.sprintStart && (
            <span className="text-[10px] text-slate-400 bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5 rounded">
              {getSprintLabel(brd)}
            </span>
          )}
          {isSuccess && (
            <span className="text-[10px] font-semibold text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950 px-1.5 py-0.5 rounded">✓ Success</span>
          )}
        </div>

        {/* Bottom row: size + bugs | links + avatars */}
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-1.5">
            {/* Story-point style size badge */}
            {s && (
              <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ring-1 ${s.bg} ${s.text} ${s.ring}`}>{s.label}</span>
            )}
            {bugCount > 0 && (
              <span className={`flex items-center gap-0.5 text-[10px] font-semibold px-1.5 py-0.5 rounded ${bugCount > MIN_BUG_THRESHOLD ? 'bg-red-50 dark:bg-red-950/60 text-red-500' : 'bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400'}`}>
                <svg className="w-2.5 h-2.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                {bugCount}
              </span>
            )}
          </div>

          <div className="flex items-center gap-1.5">
            {/* Quick links */}
            {brd.jiraLink && (
              <a href={brd.jiraLink} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()}
                className="p-1 rounded text-slate-400 hover:text-[#0052CC] dark:hover:text-blue-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors" title="Jira">
                <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 24 24"><path d="M11.571 11.513H0a5.218 5.218 0 0 0 5.232 5.215h2.13v2.057A5.215 5.215 0 0 0 12.575 24V12.518a1.005 1.005 0 0 0-1.004-1.005zm5.723-5.756H5.757a5.215 5.215 0 0 0 5.215 5.214h2.129v2.058a5.218 5.218 0 0 0 5.215 5.214V6.762a1.005 1.005 0 0 0-1.022-1.005zM23.013 0H11.455a5.215 5.215 0 0 0 5.215 5.215h2.129v2.057A5.215 5.215 0 0 0 24 12.483V1.005A1.005 1.005 0 0 0 23.013 0z"/></svg>
              </a>
            )}
            {/* Assignee avatars */}
            <div className="flex -space-x-1">
              {brd.baName && <Avatar name={brd.baName} />}
              {devs.slice(0, 2).map((d) => <Avatar key={d} name={d} />)}
              {devs.length > 2 && (
                <span className="w-6 h-6 rounded-full bg-slate-200 dark:bg-slate-700 flex items-center justify-center text-[9px] font-bold text-slate-500 dark:text-slate-400">+{devs.length - 2}</span>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function BRDList({ brds, bugs, onSelect, onNew, onDelete }) {
  const [search, setSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState('all');
  const [filterQuarter, setFilterQuarter] = useState('all');
  const [filterYear, setFilterYear] = useState('all');
  const [view, setView] = useState(() => localStorage.getItem('brd_view') || 'grid');
  const changeView = (v) => { setView(v); localStorage.setItem('brd_view', v); };

  const getBugCount = (brdId) => bugs.filter((b) => b.brdId === brdId).length;

  const filtered = brds.filter((b) => {
    const matchSearch = !search || b.title.toLowerCase().includes(search.toLowerCase());
    const matchStatus = filterStatus === 'all' || b.status === filterStatus;
    const matchQ = filterQuarter === 'all' || b.quarter === filterQuarter;
    const matchY = filterYear === 'all' || String(b.year) === String(filterYear);
    return matchSearch && matchStatus && matchQ && matchY;
  });

  const selectClass = 'px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 transition-colors';

  return (
    <div className="space-y-4">
      {/* Filter bar */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-4">
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search BRDs..." className="w-full pl-9 pr-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 placeholder-slate-400 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 transition-colors" />
          </div>
          <div className="flex gap-3 flex-wrap">
            {view === 'grid' && (
              <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)} className={selectClass}>
                <option value="all">All Statuses</option>
                {STATUS_OPTIONS.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
              </select>
            )}
            <select value={filterQuarter} onChange={(e) => setFilterQuarter(e.target.value)} className={selectClass}>
              <option value="all">All Quarters</option>
              {QUARTERS.map((q) => <option key={q}>{q}</option>)}
            </select>
            <select value={filterYear} onChange={(e) => setFilterYear(e.target.value)} className={selectClass}>
              <option value="all">All Years</option>
              {YEARS.map((y) => <option key={y}>{y}</option>)}
            </select>
            {/* Excel export */}
            <button
              onClick={() => exportBRDsToExcel(filtered, bugs)}
              title="Export to Excel"
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl border border-emerald-200 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-400 hover:bg-emerald-100 dark:hover:bg-emerald-900 text-sm font-medium transition-colors"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
              Excel
            </button>
            {/* View toggle */}
            <div className="flex rounded-xl border border-slate-200 dark:border-slate-700 overflow-hidden">
              <button
                onClick={() => changeView('grid')}
                title="Grid view"
                className={`px-3 py-2 transition-colors ${view === 'grid' ? 'bg-blue-600 text-white' : 'bg-white dark:bg-slate-800 text-slate-500 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-700'}`}
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" /></svg>
              </button>
              <button
                onClick={() => changeView('board')}
                title="Board view"
                className={`px-3 py-2 transition-colors border-l border-slate-200 dark:border-slate-700 ${view === 'board' ? 'bg-blue-600 text-white' : 'bg-white dark:bg-slate-800 text-slate-500 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-700'}`}
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 17V7m0 10a2 2 0 01-2 2H5a2 2 0 01-2-2V7a2 2 0 012-2h2a2 2 0 012 2m0 10a2 2 0 002 2h2a2 2 0 002-2M9 7a2 2 0 012-2h2a2 2 0 012 2m0 10V7m0 10a2 2 0 002 2h2a2 2 0 002-2V7a2 2 0 00-2-2h-2a2 2 0 00-2 2" /></svg>
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Count */}
      {filtered.length > 0 && (
        <p className="text-xs text-slate-400 px-1">{filtered.length} BRD{filtered.length !== 1 ? 's' : ''} found</p>
      )}

      {filtered.length === 0 ? (
        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 py-16 text-center">
          <div className="w-14 h-14 rounded-2xl bg-slate-100 dark:bg-slate-800 flex items-center justify-center mx-auto mb-4">
            <svg className="w-7 h-7 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
          </div>
          <p className="font-semibold text-slate-700 dark:text-slate-300">No BRDs found</p>
          <p className="text-sm text-slate-400 mt-1 mb-5">Create your first BRD to get started</p>
          <button onClick={onNew} className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-xl text-sm font-medium transition-colors">
            Create BRD
          </button>
        </div>
      ) : view === 'grid' ? (
        /* ── Grid view ── */
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
          {filtered.map((brd) => {
            const bugCount = getBugCount(brd.id);
            const isSuccess = brd.status === 'launched' && bugCount <= MIN_BUG_THRESHOLD;
            return (
              <div
                key={brd.id}
                onClick={() => onSelect(brd.id)}
                className={`group relative bg-white dark:bg-slate-900 rounded-2xl border-2 p-5 cursor-pointer hover:shadow-lg dark:hover:shadow-slate-950 transition-all duration-200 ${isSuccess ? 'border-emerald-200 dark:border-emerald-800 hover:border-emerald-300 dark:hover:border-emerald-700' : 'border-slate-200 dark:border-slate-800 hover:border-blue-200 dark:hover:border-blue-800'}`}
              >
                {isSuccess && <div className="absolute inset-0 rounded-2xl bg-emerald-400/5 pointer-events-none" />}
                <div className="flex items-start justify-between gap-2 mb-3">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div className={`w-9 h-9 rounded-xl flex items-center justify-center text-sm font-bold flex-shrink-0 ${isSuccess ? 'bg-emerald-100 dark:bg-emerald-950 text-emerald-600 dark:text-emerald-400' : 'bg-blue-100 dark:bg-blue-950 text-blue-600 dark:text-blue-400'}`}>
                      {brd.title.charAt(0).toUpperCase()}
                    </div>
                    <div className="min-w-0">
                      <h3 className="font-semibold text-sm text-slate-900 dark:text-white truncate">{brd.title}</h3>
                      <p className="text-xs text-slate-400">{brd.quarter} {brd.year}</p>
                    </div>
                  </div>
                  <button
                    onClick={(e) => { e.stopPropagation(); if (confirm('Delete this BRD and all its bugs?')) onDelete(brd.id); }}
                    className="opacity-0 group-hover:opacity-100 p-1.5 rounded-lg text-slate-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-950 transition-all flex-shrink-0"
                  >
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                  </button>
                </div>
                {brd.description && <p className="text-xs text-slate-500 dark:text-slate-400 mb-3 line-clamp-2">{brd.description}</p>}
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <StatusBadge status={brd.status} />
                    {brd.tshirtSize && (() => {
                      const s = getTShirtSize(brd.tshirtSize);
                      return s ? <span className={`inline-flex items-center px-2 py-0.5 rounded-md text-xs font-bold ring-1 ${s.bg} ${s.text} ${s.ring}`}>{s.label}</span> : null;
                    })()}
                  </div>
                  <div className="flex items-center gap-2">
                    {isSuccess && <span className="text-xs font-semibold text-emerald-600 dark:text-emerald-400">✓ Success</span>}
                    {bugCount > 0 && (
                      <span className={`text-xs font-semibold px-2 py-0.5 rounded-md ${bugCount > MIN_BUG_THRESHOLD ? 'bg-red-50 dark:bg-red-950 text-red-500' : 'bg-emerald-50 dark:bg-emerald-950 text-emerald-600 dark:text-emerald-400'}`}>
                        {bugCount} bug{bugCount !== 1 ? 's' : ''}
                      </span>
                    )}
                  </div>
                </div>
                <div className="mt-3 pt-3 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between">
                  <span className="text-xs text-slate-400">{getSprintLabel(brd)}</span>
                  <div className="flex gap-1.5">
                    {brd.googleDocsLink && (
                      <a href={brd.googleDocsLink} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()} className="p-1.5 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 hover:bg-blue-50 dark:hover:bg-blue-950 hover:text-blue-600 dark:hover:text-blue-400 transition-colors" title="Google Docs">
                        <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 24 24"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-6-6zm4 18H6V4h7v5h5v11z"/></svg>
                      </a>
                    )}
                    {brd.jiraLink && (
                      <a href={brd.jiraLink} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()} className="p-1.5 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 hover:bg-blue-50 dark:hover:bg-blue-950 hover:text-blue-600 dark:hover:text-blue-400 transition-colors" title="Jira">
                        <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 24 24"><path d="M11.571 11.513H0a5.218 5.218 0 0 0 5.232 5.215h2.13v2.057A5.215 5.215 0 0 0 12.575 24V12.518a1.005 1.005 0 0 0-1.004-1.005zm5.723-5.756H5.757a5.215 5.215 0 0 0 5.215 5.214h2.129v2.058a5.218 5.218 0 0 0 5.215 5.214V6.762a1.005 1.005 0 0 0-1.022-1.005zM23.013 0H11.455a5.215 5.215 0 0 0 5.215 5.215h2.129v2.057A5.215 5.215 0 0 0 24 12.483V1.005A1.005 1.005 0 0 0 23.013 0z"/></svg>
                      </a>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        /* ── Board view (Jira-style) ── */
        <div className="overflow-x-auto pb-2 -mx-1 px-1">
          <div className="flex gap-3 min-w-max items-start">
            {STATUS_OPTIONS.map((status) => {
              const col = COLUMN_STYLES[status.value];
              const cards = filtered.filter((b) => b.status === status.value);
              return (
                <div key={status.value} className="w-64 flex flex-col rounded-xl overflow-hidden border border-slate-200 dark:border-slate-700/60 bg-slate-50 dark:bg-slate-800/40" style={{ minHeight: 120 }}>
                  {/* Coloured top stripe */}
                  <div className={`h-1 w-full ${col.top}`} />

                  {/* Column header */}
                  <div className={`flex items-center justify-between px-3 py-2.5 ${col.header} border-b border-slate-200 dark:border-slate-700/60`}>
                    <span className={`text-xs font-semibold uppercase tracking-wide ${col.label}`}>{status.label}</span>
                    <span className={`text-[11px] font-bold min-w-[20px] text-center px-1.5 py-0.5 rounded-full ${col.count}`}>{cards.length}</span>
                  </div>

                  {/* Cards — independently scrollable */}
                  <div className="flex flex-col gap-2 p-2 overflow-y-auto" style={{ maxHeight: 'calc(100vh - 260px)' }}>
                    {cards.length === 0 ? (
                      <div className="py-8 text-center">
                        <p className="text-xs text-slate-400 dark:text-slate-600">No issues</p>
                      </div>
                    ) : (
                      cards.map((brd) => (
                        <BRDCard
                          key={brd.id}
                          brd={brd}
                          bugCount={getBugCount(brd.id)}
                          onSelect={onSelect}
                          onDelete={onDelete}
                        />
                      ))
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
