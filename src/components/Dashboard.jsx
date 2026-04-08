import { useMemo } from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import { STATUS_OPTIONS, MIN_BUG_THRESHOLD, QUARTERS, getSprintLabel } from '../utils/constants';
import StatusBadge from './StatusBadge';
import { useTheme } from '../App';
import { exportDashboardToExcel } from '../utils/excelExport';

const STAT_CARDS = [
  { key: 'total',      label: 'Total BRDs',  icon: '📋', from: 'from-blue-500',    to: 'to-blue-600' },
  { key: 'inProgress', label: 'In Progress', icon: '⚡', from: 'from-amber-500',   to: 'to-orange-500' },
  { key: 'launched',   label: 'Launched',    icon: '🚀', from: 'from-emerald-500', to: 'to-teal-600' },
  { key: 'successful', label: 'Successful',  icon: '✅', from: 'from-green-500',   to: 'to-emerald-600' },
  { key: 'totalBugs',  label: 'Total Bugs',  icon: '🐛', from: 'from-red-500',     to: 'to-rose-600' },
];

const CustomTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-3 shadow-xl text-xs">
      <p className="font-semibold text-slate-700 dark:text-slate-200 mb-1">{label}</p>
      {payload.map((p) => (
        <p key={p.name} className="text-slate-500 dark:text-slate-400">{p.name}: <span className="font-bold" style={{ color: p.fill || p.color }}>{p.value}</span></p>
      ))}
    </div>
  );
};

export default function Dashboard({ brds, bugs, onSelectBRD }) {
  const { dark } = useTheme();
  const currentYear = new Date().getFullYear();
  const currentQuarterIdx = Math.floor(new Date().getMonth() / 3);
  const currentQuarter = QUARTERS[currentQuarterIdx];

  const stats = useMemo(() => ({
    total: brds.length,
    inProgress: brds.filter((b) => ['inprogress', 'development'].includes(b.status)).length,
    launched: brds.filter((b) => b.status === 'launched').length,
    successful: brds.filter((b) => b.status === 'launched' && bugs.filter((bug) => bug.brdId === b.id).length <= MIN_BUG_THRESHOLD).length,
    totalBugs: bugs.length,
  }), [brds, bugs]);

  const quarterData = QUARTERS.map((q) => {
    const qBRDs = brds.filter((b) => b.quarter === q && String(b.year) === String(currentYear));
    return { quarter: q, BRDs: qBRDs.length, Bugs: bugs.filter((bug) => qBRDs.some((b) => b.id === bug.brdId)).length };
  });

  const recentBRDs = [...brds].sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt)).slice(0, 6);
  const currentQBRDs = brds.filter((b) => b.quarter === currentQuarter && String(b.year) === String(currentYear));
  const unscheduledBRDs = brds.filter((b) => b.status === 'planning' && (!b.quarter || !b.sprintStart));

  const axisColor = dark ? '#64748b' : '#94a3b8';

  return (
    <div className="space-y-6">
      {/* Toolbar */}
      <div className="flex justify-end">
        <button
          onClick={() => exportDashboardToExcel(brds, bugs)}
          className="flex items-center gap-1.5 px-3 py-2 rounded-xl border border-emerald-200 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-400 hover:bg-emerald-100 dark:hover:bg-emerald-900 text-sm font-medium transition-colors"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
          Export Excel
        </button>
      </div>

      {/* Stat Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
        {STAT_CARDS.map((card) => (
          <div key={card.key} className="relative bg-white dark:bg-slate-900 rounded-2xl p-4 border border-slate-200 dark:border-slate-800 overflow-hidden group hover:shadow-md dark:hover:shadow-slate-900 transition-shadow">
            <div className={`absolute -right-3 -top-3 w-16 h-16 rounded-full bg-gradient-to-br ${card.from} ${card.to} opacity-10 group-hover:opacity-20 transition-opacity`} />
            <p className="text-2xl mb-1">{card.icon}</p>
            <p className="text-2xl font-bold text-slate-900 dark:text-white">{stats[card.key]}</p>
            <p className="text-xs text-slate-500 dark:text-slate-400 font-medium mt-0.5">{card.label}</p>
          </div>
        ))}
      </div>

      {/* Still Planning — no quarter or sprint */}
      {unscheduledBRDs.length > 0 && (
        <div className="bg-indigo-50 dark:bg-indigo-950/40 border border-indigo-200 dark:border-indigo-800 rounded-2xl p-4">
          <div className="flex items-center gap-2.5 mb-3">
            <span className="w-2 h-2 rounded-full bg-indigo-500 animate-pulse" />
            <h3 className="font-semibold text-indigo-700 dark:text-indigo-300 text-sm">Still Planning</h3>
            <span className="ml-auto text-xs font-bold px-2 py-0.5 rounded-full bg-indigo-100 dark:bg-indigo-900 text-indigo-600 dark:text-indigo-400">{unscheduledBRDs.length}</span>
          </div>
          <p className="text-xs text-indigo-500 dark:text-indigo-400 mb-3">These BRDs have no quarter or sprint assigned yet.</p>
          <div className="space-y-1.5">
            {unscheduledBRDs.map((brd) => (
              <div key={brd.id} onClick={() => onSelectBRD(brd.id)} className="flex items-center gap-3 px-3 py-2.5 bg-white dark:bg-slate-900 rounded-xl border border-indigo-100 dark:border-indigo-900 cursor-pointer hover:border-indigo-300 dark:hover:border-indigo-700 transition-colors">
                <div className="w-7 h-7 rounded-lg bg-indigo-100 dark:bg-indigo-950 text-indigo-600 dark:text-indigo-400 flex items-center justify-center text-xs font-bold flex-shrink-0">
                  {brd.title.charAt(0).toUpperCase()}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-slate-900 dark:text-white truncate">{brd.title}</p>
                  {brd.baName && <p className="text-xs text-slate-400">BA: {brd.baName}</p>}
                </div>
                <span className="text-xs text-indigo-400 dark:text-indigo-500 flex-shrink-0">No schedule</span>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Bar Chart */}
        <div className="lg:col-span-2 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-5">
          <div className="flex items-center justify-between mb-5">
            <div>
              <h3 className="font-semibold text-slate-900 dark:text-white">Yearly Overview</h3>
              <p className="text-xs text-slate-400 mt-0.5">{currentYear} — BRDs vs Bugs per quarter</p>
            </div>
          </div>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={quarterData} barGap={4}>
              <CartesianGrid strokeDasharray="3 3" stroke={dark ? '#1e293b' : '#f1f5f9'} />
              <XAxis dataKey="quarter" tick={{ fontSize: 12, fill: axisColor }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 12, fill: axisColor }} axisLine={false} tickLine={false} allowDecimals={false} />
              <Tooltip content={<CustomTooltip />} cursor={{ fill: dark ? '#1e293b' : '#f8fafc' }} />
              <Bar dataKey="BRDs" fill="#3b82f6" radius={[6, 6, 0, 0]} maxBarSize={32} />
              <Bar dataKey="Bugs" fill="#f43f5e" radius={[6, 6, 0, 0]} maxBarSize={32} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Current Quarter */}
        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-5">
          <div className="mb-5">
            <div className="inline-flex items-center gap-2 px-2.5 py-1 bg-blue-50 dark:bg-blue-950 text-blue-600 dark:text-blue-400 rounded-lg text-xs font-semibold mb-2">
              <span className="w-1.5 h-1.5 rounded-full bg-blue-500 animate-pulse" />
              Current Quarter
            </div>
            <h3 className="font-semibold text-slate-900 dark:text-white">{currentQuarter} {currentYear}</h3>
          </div>
          <div className="space-y-2">
            {STATUS_OPTIONS.map((s) => {
              const count = currentQBRDs.filter((b) => b.status === s.value).length;
              if (!count) return null;
              const pct = Math.round((count / Math.max(currentQBRDs.length, 1)) * 100);
              return (
                <div key={s.value}>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs text-slate-600 dark:text-slate-400 font-medium">{s.label}</span>
                    <span className="text-xs font-bold text-slate-900 dark:text-white">{count}</span>
                  </div>
                  <div className="h-1.5 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                    <div className="h-full rounded-full transition-all duration-500" style={{ width: `${pct}%`, backgroundColor: s.color }} />
                  </div>
                </div>
              );
            })}
            {!currentQBRDs.length && <p className="text-sm text-slate-400 text-center py-4">No BRDs this quarter</p>}
          </div>
        </div>
      </div>

      {/* Recent BRDs */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800">
        <div className="px-5 py-4 border-b border-slate-100 dark:border-slate-800">
          <h3 className="font-semibold text-slate-900 dark:text-white">Recent BRDs</h3>
        </div>
        {recentBRDs.length === 0 ? (
          <div className="py-12 text-center text-slate-400 text-sm">No BRDs yet — create your first one</div>
        ) : (
          <div className="divide-y divide-slate-50 dark:divide-slate-800/50">
            {recentBRDs.map((brd) => {
              const bugCount = bugs.filter((b) => b.brdId === brd.id).length;
              const isSuccess = brd.status === 'launched' && bugCount <= MIN_BUG_THRESHOLD;
              return (
                <div key={brd.id} onClick={() => onSelectBRD(brd.id)} className="flex items-center justify-between gap-3 px-5 py-3.5 hover:bg-slate-50 dark:hover:bg-slate-800/50 cursor-pointer transition-colors">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className={`w-8 h-8 rounded-lg flex items-center justify-center text-xs font-bold flex-shrink-0 ${isSuccess ? 'bg-emerald-100 dark:bg-emerald-950 text-emerald-600 dark:text-emerald-400' : 'bg-blue-100 dark:bg-blue-950 text-blue-600 dark:text-blue-400'}`}>
                      {brd.title.charAt(0).toUpperCase()}
                    </div>
                    <div className="min-w-0">
                      <p className="font-medium text-sm text-slate-900 dark:text-white truncate">{brd.title}</p>
                      <p className="text-xs text-slate-400">{brd.quarter} {brd.year} · {getSprintLabel(brd)}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    {bugCount > 0 && (
                      <span className={`text-xs font-semibold px-2 py-0.5 rounded-md ${bugCount > MIN_BUG_THRESHOLD ? 'bg-red-50 dark:bg-red-950 text-red-500 dark:text-red-400' : 'bg-emerald-50 dark:bg-emerald-950 text-emerald-600 dark:text-emerald-400'}`}>
                        {bugCount} bug{bugCount !== 1 ? 's' : ''}
                      </span>
                    )}
                    <StatusBadge status={brd.status} />
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
