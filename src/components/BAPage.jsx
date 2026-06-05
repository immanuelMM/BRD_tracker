import { useState } from 'react';
import { BA_OPTIONS, STATUS_OPTIONS, QUARTERS, YEARS, MIN_BUG_THRESHOLD, getSprintLabel, getTShirtSize } from '../utils/constants';
import { fmtTitle } from '../utils/db';
import StatusBadge from './StatusBadge';
import { exportBAViewToExcel } from '../utils/excelExport';

const BA_COLORS = {
  Patricia: { dot: 'bg-violet-500', header: 'bg-violet-50 dark:bg-violet-950/40 border-violet-200 dark:border-violet-800', label: 'text-violet-700 dark:text-violet-300', count: 'bg-violet-100 dark:bg-violet-900 text-violet-600 dark:text-violet-400', avatar: 'bg-violet-100 dark:bg-violet-950 text-violet-600 dark:text-violet-400' },
  JR:       { dot: 'bg-blue-500',   header: 'bg-blue-50 dark:bg-blue-950/40 border-blue-200 dark:border-blue-800',         label: 'text-blue-700 dark:text-blue-300',     count: 'bg-blue-100 dark:bg-blue-900 text-blue-600 dark:text-blue-400',     avatar: 'bg-blue-100 dark:bg-blue-950 text-blue-600 dark:text-blue-400' },
  ERMS:     { dot: 'bg-amber-500',  header: 'bg-amber-50 dark:bg-amber-950/40 border-amber-200 dark:border-amber-800',     label: 'text-amber-700 dark:text-amber-300',   count: 'bg-amber-100 dark:bg-amber-900 text-amber-600 dark:text-amber-400', avatar: 'bg-amber-100 dark:bg-amber-950 text-amber-600 dark:text-amber-400' },
  Joyce:    { dot: 'bg-emerald-500',header: 'bg-emerald-50 dark:bg-emerald-950/40 border-emerald-200 dark:border-emerald-800', label: 'text-emerald-700 dark:text-emerald-300', count: 'bg-emerald-100 dark:bg-emerald-900 text-emerald-600 dark:text-emerald-400', avatar: 'bg-emerald-100 dark:bg-emerald-950 text-emerald-600 dark:text-emerald-400' },
};

export default function BAPage({ brds, bugs, onSelectBRD }) {
  const [search, setSearch] = useState('');
  const [filterQuarter, setFilterQuarter] = useState('all');
  const [filterYear, setFilterYear] = useState('all');
  const [filterStatus, setFilterStatus] = useState('all');

  const getBugCount = (brdId) => bugs.filter((b) => b.brdId === brdId).length;

  const filtered = brds.filter((b) => {
    const matchSearch = !search || b.title.toLowerCase().includes(search.toLowerCase());
    const matchQ = filterQuarter === 'all' || b.quarter === filterQuarter;
    const matchY = filterYear === 'all' || String(b.year) === String(filterYear);
    const matchS = filterStatus === 'all' || b.status === filterStatus;
    return matchSearch && matchQ && matchY && matchS;
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
            <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)} className={selectClass}>
              <option value="all">All Statuses</option>
              {STATUS_OPTIONS.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
            </select>
            <select value={filterQuarter} onChange={(e) => setFilterQuarter(e.target.value)} className={selectClass}>
              <option value="all">All Quarters</option>
              {QUARTERS.map((q) => <option key={q}>{q}</option>)}
            </select>
            <select value={filterYear} onChange={(e) => setFilterYear(e.target.value)} className={selectClass}>
              <option value="all">All Years</option>
              {YEARS.map((y) => <option key={y}>{y}</option>)}
            </select>
            <button
              onClick={() => exportBAViewToExcel(brds, bugs)}
              title="Export to Excel"
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl border border-emerald-200 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-400 hover:bg-emerald-100 dark:hover:bg-emerald-900 text-sm font-medium transition-colors"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
              Excel
            </button>
          </div>
        </div>
      </div>

      {/* Kanban columns — one per BA */}
      <div className="overflow-x-auto pb-4">
        <div className="flex gap-4 min-w-max">
          {BA_OPTIONS.map((ba) => {
            const col = BA_COLORS[ba];
            const cards = filtered.filter((b) => b.baName === ba);
            const unassigned = ba === BA_OPTIONS[0]
              ? filtered.filter((b) => !b.baName || !BA_OPTIONS.includes(b.baName))
              : [];

            return (
              <div key={ba} className="w-72 flex flex-col">
                {/* Column header */}
                <div className={`flex items-center justify-between px-3 py-2.5 rounded-xl border mb-3 ${col.header}`}>
                  <div className="flex items-center gap-2.5">
                    <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold ${col.avatar}`}>
                      {ba.charAt(0)}
                    </div>
                    <span className={`text-sm font-semibold ${col.label}`}>{ba}</span>
                  </div>
                  <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${col.count}`}>
                    {cards.length + unassigned.length}
                  </span>
                </div>

                {/* Cards */}
                <div className="flex flex-col gap-2 flex-1">
                  {[...cards, ...unassigned].length === 0 ? (
                    <div className="border-2 border-dashed border-slate-200 dark:border-slate-800 rounded-xl py-8 text-center">
                      <p className="text-xs text-slate-400">No BRDs</p>
                    </div>
                  ) : (
                    [...cards, ...unassigned].map((brd) => {
                      const bugCount = getBugCount(brd.id);
                      const isSuccess = brd.status === 'launched' && bugCount <= MIN_BUG_THRESHOLD;
                      const isUnassigned = !brd.baName || !BA_OPTIONS.includes(brd.baName);
                      return (
                        <div
                          key={brd.id}
                          onClick={() => onSelectBRD(brd.id)}
                          className={`group relative bg-white dark:bg-slate-900 rounded-xl border-2 p-4 cursor-pointer hover:shadow-md transition-all duration-200 ${isSuccess ? 'border-emerald-200 dark:border-emerald-800 hover:border-emerald-300' : 'border-slate-200 dark:border-slate-800 hover:border-blue-200 dark:hover:border-blue-800'}`}
                        >
                          {isSuccess && <div className="absolute inset-0 rounded-xl bg-emerald-400/5 pointer-events-none" />}

                          <div className="flex items-start gap-2 mb-2">
                            <div className={`w-8 h-8 rounded-lg flex items-center justify-center text-xs font-bold flex-shrink-0 ${isSuccess ? 'bg-emerald-100 dark:bg-emerald-950 text-emerald-600 dark:text-emerald-400' : col.avatar}`}>
                              {fmtTitle(brd.title).charAt(0).toUpperCase()}
                            </div>
                            <div className="min-w-0 flex-1">
                              <h3 className="font-semibold text-sm text-slate-900 dark:text-white truncate">{fmtTitle(brd.title)}</h3>
                              <p className="text-xs text-slate-400">{brd.quarter} {brd.year}</p>
                            </div>
                          </div>

                          {brd.description && (
                            <p className="text-xs text-slate-500 dark:text-slate-400 mb-2 line-clamp-2">{brd.description}</p>
                          )}

                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-1.5">
                              <StatusBadge status={brd.status} />
                              {brd.tshirtSize && (() => {
                                const s = getTShirtSize(brd.tshirtSize);
                                return s ? <span className={`px-1.5 py-0.5 rounded text-xs font-bold ring-1 ${s.bg} ${s.text} ${s.ring}`}>{s.label}</span> : null;
                              })()}
                            </div>
                            {bugCount > 0 && (
                              <span className={`text-xs font-semibold px-1.5 py-0.5 rounded ${bugCount > MIN_BUG_THRESHOLD ? 'bg-red-50 dark:bg-red-950 text-red-500' : 'bg-emerald-50 dark:bg-emerald-950 text-emerald-600 dark:text-emerald-400'}`}>
                                {bugCount} bug{bugCount !== 1 ? 's' : ''}
                              </span>
                            )}
                          </div>

                          <div className="mt-2 pt-2 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between">
                            <span className="text-xs text-slate-400 truncate">{getSprintLabel(brd)}</span>
                            {isUnassigned && (
                              <span className="text-xs text-slate-400 italic">unassigned</span>
                            )}
                            {isSuccess && (
                              <span className="text-xs font-semibold text-emerald-600 dark:text-emerald-400">✓ Success</span>
                            )}
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
