import { useState } from 'react';
import { QUARTERS, YEARS, QUARTER_MONTHS, STATUS_OPTIONS, MIN_BUG_THRESHOLD, getSprintLabel, getTShirtSize } from '../utils/constants';
import { fmtTitle } from '../utils/db';
import StatusBadge from './StatusBadge';
import { exportQuarterViewToExcel } from '../utils/excelExport';

const Q_STYLES = {
  Q1: { header: 'bg-blue-50 dark:bg-blue-950/40 border-blue-200 dark:border-blue-800',     dot: 'bg-blue-500',   label: 'text-blue-700 dark:text-blue-300',     count: 'bg-blue-100 dark:bg-blue-900 text-blue-600 dark:text-blue-400' },
  Q2: { header: 'bg-violet-50 dark:bg-violet-950/40 border-violet-200 dark:border-violet-800', dot: 'bg-violet-500', label: 'text-violet-700 dark:text-violet-300', count: 'bg-violet-100 dark:bg-violet-900 text-violet-600 dark:text-violet-400' },
  Q3: { header: 'bg-amber-50 dark:bg-amber-950/40 border-amber-200 dark:border-amber-800',   dot: 'bg-amber-500',  label: 'text-amber-700 dark:text-amber-300',   count: 'bg-amber-100 dark:bg-amber-900 text-amber-600 dark:text-amber-400' },
  Q4: { header: 'bg-emerald-50 dark:bg-emerald-950/40 border-emerald-200 dark:border-emerald-800', dot: 'bg-emerald-500', label: 'text-emerald-700 dark:text-emerald-300', count: 'bg-emerald-100 dark:bg-emerald-900 text-emerald-600 dark:text-emerald-400' },
};

export default function QuarterView({ brds, bugs, onSelectBRD }) {
  const [year, setYear] = useState(new Date().getFullYear());
  const [filterStatus, setFilterStatus] = useState('all');

  const currentQuarter = QUARTERS[Math.floor(new Date().getMonth() / 3)];
  const currentYear = new Date().getFullYear();

  const getBugCount = (brdId) => bugs.filter((b) => b.brdId === brdId).length;

  const selectClass = 'px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 transition-colors';

  return (
    <div className="space-y-4">
      {/* Controls */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="font-semibold text-slate-900 dark:text-white">Quarter View</h2>
          <p className="text-xs text-slate-400 mt-0.5">Active BRDs by quarter — {year}</p>
        </div>
        <div className="flex gap-3 flex-wrap">
          <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)} className={selectClass}>
            <option value="all">All Statuses</option>
            {STATUS_OPTIONS.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
          </select>
          <select value={year} onChange={(e) => setYear(Number(e.target.value))} className={selectClass}>
            {YEARS.map((y) => <option key={y}>{y}</option>)}
          </select>
          <button
            onClick={() => exportQuarterViewToExcel(year, brds, bugs)}
            title="Export to Excel"
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl border border-emerald-200 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-400 hover:bg-emerald-100 dark:hover:bg-emerald-900 text-sm font-medium transition-colors"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
            Excel
          </button>
        </div>
      </div>

      {/* Quarter columns */}
      <div className="overflow-x-auto pb-4">
        <div className="flex gap-4 min-w-max">
          {QUARTERS.map((q) => {
            const col = Q_STYLES[q];
            const isCurrentQ = q === currentQuarter && year === currentYear;
            const cards = brds.filter((b) => {
              const matchQ = b.quarter === q && String(b.year) === String(year);
              const matchS = filterStatus === 'all' || b.status === filterStatus;
              const hasSchedule = b.quarter && b.sprintStart;
              return matchQ && matchS && hasSchedule;
            });

            const launched = cards.filter((b) => b.status === 'launched').length;
            const inProgress = cards.filter((b) => ['inprogress', 'development', 'testing'].includes(b.status)).length;

            return (
              <div key={q} className="w-72 flex flex-col">
                {/* Column header */}
                <div className={`rounded-xl border px-3 py-2.5 mb-3 ${col.header}`}>
                  <div className="flex items-center justify-between mb-1">
                    <div className="flex items-center gap-2">
                      <span className={`w-2.5 h-2.5 rounded-full ${col.dot} ${isCurrentQ ? 'animate-pulse' : ''}`} />
                      <span className={`text-sm font-semibold ${col.label}`}>{q} {year}</span>
                      {isCurrentQ && (
                        <span className="text-xs font-semibold px-1.5 py-0.5 rounded-full bg-blue-600 text-white">Current</span>
                      )}
                    </div>
                    <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${col.count}`}>{cards.length}</span>
                  </div>
                  <p className="text-xs text-slate-400 pl-4">{QUARTER_MONTHS[q]}</p>
                  {cards.length > 0 && (
                    <div className="flex gap-2 mt-1.5 pl-4">
                      {inProgress > 0 && <span className="text-xs text-amber-600 dark:text-amber-400">{inProgress} active</span>}
                      {launched > 0 && <span className="text-xs text-emerald-600 dark:text-emerald-400">{launched} launched</span>}
                    </div>
                  )}
                </div>

                {/* BRD cards */}
                <div className="flex flex-col gap-2 flex-1">
                  {cards.length === 0 ? (
                    <div className="border-2 border-dashed border-slate-200 dark:border-slate-800 rounded-xl py-8 text-center">
                      <p className="text-xs text-slate-400">No BRDs</p>
                    </div>
                  ) : (
                    cards.map((brd) => {
                      const bugCount = getBugCount(brd.id);
                      const isSuccess = brd.status === 'launched' && bugCount <= MIN_BUG_THRESHOLD;
                      return (
                        <div
                          key={brd.id}
                          onClick={() => onSelectBRD(brd.id)}
                          className={`group relative bg-white dark:bg-slate-900 rounded-xl border-2 p-4 cursor-pointer hover:shadow-md transition-all duration-200 ${isSuccess ? 'border-emerald-200 dark:border-emerald-800 hover:border-emerald-300' : 'border-slate-200 dark:border-slate-800 hover:border-blue-200 dark:hover:border-blue-800'}`}
                        >
                          {isSuccess && <div className="absolute inset-0 rounded-xl bg-emerald-400/5 pointer-events-none" />}

                          <div className="flex items-start gap-2 mb-2">
                            <div className={`w-8 h-8 rounded-lg flex items-center justify-center text-xs font-bold flex-shrink-0 ${isSuccess ? 'bg-emerald-100 dark:bg-emerald-950 text-emerald-600 dark:text-emerald-400' : 'bg-blue-100 dark:bg-blue-950 text-blue-600 dark:text-blue-400'}`}>
                              {fmtTitle(brd.title).charAt(0).toUpperCase()}
                            </div>
                            <div className="min-w-0 flex-1">
                              <h3 className="font-semibold text-sm text-slate-900 dark:text-white truncate">{fmtTitle(brd.title)}</h3>
                              {brd.baName && <p className="text-xs text-slate-400">BA: {brd.baName}</p>}
                            </div>
                          </div>

                          <div className="flex items-center justify-between mb-2">
                            <StatusBadge status={brd.status} />
                            <div className="flex items-center gap-1.5">
                              {brd.tshirtSize && (() => {
                                const s = getTShirtSize(brd.tshirtSize);
                                return s ? <span className={`px-1.5 py-0.5 rounded text-xs font-bold ring-1 ${s.bg} ${s.text} ${s.ring}`}>{s.label}</span> : null;
                              })()}
                              {bugCount > 0 && (
                                <span className={`text-xs font-semibold px-1.5 py-0.5 rounded ${bugCount > MIN_BUG_THRESHOLD ? 'bg-red-50 dark:bg-red-950 text-red-500' : 'bg-emerald-50 dark:bg-emerald-950 text-emerald-600 dark:text-emerald-400'}`}>
                                  {bugCount} bug{bugCount !== 1 ? 's' : ''}
                                </span>
                              )}
                            </div>
                          </div>

                          {brd.sprintStart && (
                            <p className="text-xs text-slate-400 border-t border-slate-100 dark:border-slate-800 pt-2">
                              {getSprintLabel(brd)}
                            </p>
                          )}

                          {isSuccess && (
                            <span className="text-xs font-semibold text-emerald-600 dark:text-emerald-400">✓ Success</span>
                          )}
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

      {/* Unscheduled planning BRDs */}
      {(() => {
        const unscheduled = brds.filter((b) => b.status === 'planning' && (!b.quarter || !b.sprintStart));
        if (unscheduled.length === 0) return null;
        return (
          <div className="bg-indigo-50 dark:bg-indigo-950/40 border border-indigo-200 dark:border-indigo-800 rounded-2xl p-4">
            <div className="flex items-center gap-2 mb-3">
              <span className="w-2 h-2 rounded-full bg-indigo-500 animate-pulse" />
              <h3 className="text-sm font-semibold text-indigo-700 dark:text-indigo-300">Still Planning — No Schedule</h3>
              <span className="ml-auto text-xs font-bold px-2 py-0.5 rounded-full bg-indigo-100 dark:bg-indigo-900 text-indigo-600 dark:text-indigo-400">{unscheduled.length}</span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
              {unscheduled.map((brd) => (
                <div key={brd.id} onClick={() => onSelectBRD(brd.id)} className="flex items-center gap-3 px-3 py-2.5 bg-white dark:bg-slate-900 rounded-xl border border-indigo-100 dark:border-indigo-900 cursor-pointer hover:border-indigo-300 dark:hover:border-indigo-700 transition-colors">
                  <div className="w-7 h-7 rounded-lg bg-indigo-100 dark:bg-indigo-950 text-indigo-600 dark:text-indigo-400 flex items-center justify-center text-xs font-bold flex-shrink-0">
                    {fmtTitle(brd.title).charAt(0).toUpperCase()}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-slate-900 dark:text-white truncate">{fmtTitle(brd.title)}</p>
                    {brd.baName && <p className="text-xs text-slate-400">{brd.baName}</p>}
                  </div>
                  <span className="text-xs text-indigo-400 flex-shrink-0">No schedule</span>
                </div>
              ))}
            </div>
          </div>
        );
      })()}
    </div>
  );
}
