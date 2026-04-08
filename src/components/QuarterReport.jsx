import { useState, useCallback } from 'react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  PieChart, Pie, Cell, ResponsiveContainer, LineChart, Line,
} from 'recharts';
import { QUARTERS, YEARS, BUG_CRITERIA as DEFAULT_CRITERIA, STATUS_OPTIONS, MIN_BUG_THRESHOLD, QUARTER_MONTHS, getSprintLabel, getTShirtSize } from '../utils/constants';
import { generateBRDReport } from '../utils/pdfGenerator';
import { exportQuarterToExcel } from '../utils/excelExport';
import StatusBadge from './StatusBadge';
import { useTheme } from '../App';

const CHART_COLORS = ['#3b82f6', '#f43f5e', '#f59e0b', '#10b981', '#8b5cf6'];

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

export default function QuarterReport({ brds, bugs, criteria = DEFAULT_CRITERIA, brdTechLeads = [] }) {
  const { dark } = useTheme();
  const [quarter, setQuarter] = useState(QUARTERS[Math.floor(new Date().getMonth() / 3)]);
  const [year, setYear] = useState(new Date().getFullYear());
  const [generating, setGenerating] = useState(false);

  const axisColor = dark ? '#64748b' : '#94a3b8';

  const CARRY_STATUSES = ['in_progress', 'development', 'testing'];
  const isEarlierQ = (bq, by, cq, cy) =>
    Number(by) < Number(cy) || (Number(by) === Number(cy) && bq < cq);
  const quarterBRDs = brds.filter((b) => {
    if (b.quarter === quarter && String(b.year) === String(year)) return true;
    try { const ext = JSON.parse(b.extendedQuarters || '[]'); if (ext.includes(`${quarter}-${year}`)) return true; } catch { /* noop */ }
    if (CARRY_STATUSES.includes(b.status) && isEarlierQ(b.quarter, b.year, quarter, year)) return true;
    return false;
  });
  const isExtended = (b) => !(b.quarter === quarter && String(b.year) === String(year));
  const quarterBugs = bugs.filter((bug) => quarterBRDs.some((b) => b.id === bug.brdId));
  const launched = quarterBRDs.filter((b) => b.status === 'launched');
  const successful = launched.filter((b) => bugs.filter((bug) => bug.brdId === b.id).length <= MIN_BUG_THRESHOLD);
  const successRate = launched.length > 0 ? Math.round((successful.length / launched.length) * 100) : 0;

  const criteriaData = criteria.map((c) => ({
    name: c.label, value: quarterBugs.filter((b) => b.criteria === c.value).length,
  })).filter((d) => d.value > 0);

  const statusData = STATUS_OPTIONS.map((s) => ({
    name: s.label, count: quarterBRDs.filter((b) => b.status === s.value).length, fill: s.color,
  })).filter((d) => d.count > 0);

  const bugsPerBRD = quarterBRDs.map((b) => ({
    name: b.title.length > 18 ? b.title.slice(0, 18) + '…' : b.title,
    bugs: bugs.filter((bug) => bug.brdId === b.id).length,
    threshold: MIN_BUG_THRESHOLD,
  }));

  const trendData = QUARTERS.map((q) => {
    const qBRDs = brds.filter((b) => b.quarter === q && String(b.year) === String(year));
    const qLaunched = qBRDs.filter((b) => b.status === 'launched');
    return {
      quarter: q,
      'Total BRDs': qBRDs.length,
      Launched: qLaunched.length,
      Successful: qLaunched.filter((b) => bugs.filter((bug) => bug.brdId === b.id).length <= MIN_BUG_THRESHOLD).length,
      Bugs: bugs.filter((bug) => qBRDs.some((b) => b.id === bug.brdId)).length,
    };
  });

  const handlePDF = useCallback(async () => {
    setGenerating(true);
    try { await generateBRDReport(quarter, year, brds, bugs, criteria, brdTechLeads); }
    finally { setGenerating(false); }
  }, [quarter, year, brds, bugs, criteria]);

  const selectClass = 'px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 transition-colors';

  const KPI = [
    { label: 'Total BRDs', value: quarterBRDs.length, icon: '📋', color: 'blue' },
    { label: 'Launched', value: launched.length, icon: '🚀', color: 'emerald' },
    { label: `Success Rate`, value: `${successful.length} (${successRate}%)`, icon: '✅', color: 'green' },
    { label: 'Total Bugs', value: quarterBugs.length, icon: '🐛', color: quarterBugs.length > 10 ? 'red' : 'amber' },
  ];

  const colorMap = { blue: 'bg-blue-50 dark:bg-blue-950', emerald: 'bg-emerald-50 dark:bg-emerald-950', green: 'bg-green-50 dark:bg-green-950', amber: 'bg-amber-50 dark:bg-amber-950', red: 'bg-red-50 dark:bg-red-950' };
  const textMap = { blue: 'text-blue-600 dark:text-blue-400', emerald: 'text-emerald-600 dark:text-emerald-400', green: 'text-green-600 dark:text-green-400', amber: 'text-amber-600 dark:text-amber-400', red: 'text-red-600 dark:text-red-400' };

  return (
    <div className="space-y-6">
      {/* Controls */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 px-5 py-4 flex items-center justify-between flex-wrap gap-4">
        <div>
          <h2 className="font-semibold text-slate-900 dark:text-white">Quarter Report</h2>
          <p className="text-xs text-slate-400 mt-0.5">{QUARTER_MONTHS[quarter]} {year}</p>
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          <select value={quarter} onChange={(e) => setQuarter(e.target.value)} className={selectClass}>
            {QUARTERS.map((q) => <option key={q}>{q}</option>)}
          </select>
          <select value={year} onChange={(e) => setYear(Number(e.target.value))} className={selectClass}>
            {YEARS.map((y) => <option key={y}>{y}</option>)}
          </select>
          <button onClick={() => exportQuarterToExcel(quarter, year, brds, bugs)} className="flex items-center gap-1.5 px-3 py-2 rounded-xl border border-emerald-200 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-400 hover:bg-emerald-100 dark:hover:bg-emerald-900 text-sm font-medium transition-colors">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
            Excel
          </button>
          <button onClick={handlePDF} disabled={generating} className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white px-4 py-2 rounded-xl text-sm font-medium transition-colors shadow-sm">
            {generating ? (
              <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/></svg>
            ) : (
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
            )}
            {generating ? 'Generating…' : 'Export PDF'}
          </button>
        </div>
      </div>

      {/* KPI */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {KPI.map((k) => (
          <div key={k.label} className={`${colorMap[k.color]} rounded-2xl p-4 border border-transparent`}>
            <p className="text-2xl mb-1">{k.icon}</p>
            <p className={`text-2xl font-bold ${textMap[k.color]}`}>{k.value}</p>
            <p className="text-xs text-slate-500 dark:text-slate-400 font-medium mt-0.5">{k.label}</p>
          </div>
        ))}
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Trend */}
        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-5">
          <h3 className="font-semibold text-slate-900 dark:text-white mb-1">{year} Quarterly Trend</h3>
          <p className="text-xs text-slate-400 mb-4">BRDs, launches and bugs per quarter</p>
          <ResponsiveContainer width="100%" height={220}>
            <LineChart data={trendData}>
              <CartesianGrid strokeDasharray="3 3" stroke={dark ? '#1e293b' : '#f1f5f9'} />
              <XAxis dataKey="quarter" tick={{ fontSize: 12, fill: axisColor }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 12, fill: axisColor }} axisLine={false} tickLine={false} allowDecimals={false} />
              <Tooltip content={<CustomTooltip />} />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              <Line type="monotone" dataKey="Total BRDs" stroke="#3b82f6" strokeWidth={2.5} dot={{ r: 4, fill: '#3b82f6' }} />
              <Line type="monotone" dataKey="Launched" stroke="#10b981" strokeWidth={2.5} dot={{ r: 4, fill: '#10b981' }} />
              <Line type="monotone" dataKey="Bugs" stroke="#f43f5e" strokeWidth={2.5} dot={{ r: 4, fill: '#f43f5e' }} />
            </LineChart>
          </ResponsiveContainer>
        </div>

        {/* Bug Criteria Pie */}
        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-5">
          <h3 className="font-semibold text-slate-900 dark:text-white mb-1">Bug Criteria — {quarter} {year}</h3>
          <p className="text-xs text-slate-400 mb-4">Distribution by root cause</p>
          {criteriaData.length === 0 ? (
            <div className="h-[220px] flex flex-col items-center justify-center text-slate-400">
              <span className="text-3xl mb-2">🎉</span>
              <p className="text-sm font-medium">No bugs this quarter</p>
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={220}>
              <PieChart>
                <Pie data={criteriaData} cx="50%" cy="50%" outerRadius={80} innerRadius={30} dataKey="value" paddingAngle={3}>
                  {criteriaData.map((_, i) => <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />)}
                </Pie>
                <Tooltip content={<CustomTooltip />} />
                <Legend wrapperStyle={{ fontSize: 11 }} />
              </PieChart>
            </ResponsiveContainer>
          )}
        </div>

        {/* Status Distribution */}
        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-5">
          <h3 className="font-semibold text-slate-900 dark:text-white mb-1">Status Distribution</h3>
          <p className="text-xs text-slate-400 mb-4">{quarter} {year}</p>
          {statusData.length === 0 ? (
            <div className="h-[220px] flex items-center justify-center text-slate-400 text-sm">No BRDs this quarter</div>
          ) : (
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={statusData} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" stroke={dark ? '#1e293b' : '#f1f5f9'} />
                <XAxis type="number" tick={{ fontSize: 12, fill: axisColor }} axisLine={false} tickLine={false} allowDecimals={false} />
                <YAxis type="category" dataKey="name" tick={{ fontSize: 11, fill: axisColor }} width={95} axisLine={false} tickLine={false} />
                <Tooltip content={<CustomTooltip />} cursor={{ fill: dark ? '#1e293b' : '#f8fafc' }} />
                <Bar dataKey="count" name="BRDs" radius={[0, 6, 6, 0]} maxBarSize={24}>
                  {statusData.map((e, i) => <Cell key={i} fill={e.fill} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>

        {/* Bugs per BRD */}
        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-5">
          <h3 className="font-semibold text-slate-900 dark:text-white mb-1">Bugs per BRD</h3>
          <p className="text-xs text-slate-400 mb-4">{quarter} {year} — vs threshold ({MIN_BUG_THRESHOLD})</p>
          {bugsPerBRD.length === 0 ? (
            <div className="h-[220px] flex items-center justify-center text-slate-400 text-sm">No BRDs this quarter</div>
          ) : (
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={bugsPerBRD}>
                <CartesianGrid strokeDasharray="3 3" stroke={dark ? '#1e293b' : '#f1f5f9'} />
                <XAxis dataKey="name" tick={{ fontSize: 10, fill: axisColor }} interval={0} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 12, fill: axisColor }} axisLine={false} tickLine={false} allowDecimals={false} />
                <Tooltip content={<CustomTooltip />} cursor={{ fill: dark ? '#1e293b' : '#f8fafc' }} />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                <Bar dataKey="bugs" name="Bugs" fill="#f43f5e" radius={[6, 6, 0, 0]} maxBarSize={32} />
                <Bar dataKey="threshold" name="Min Threshold" fill="#10b981" radius={[6, 6, 0, 0]} maxBarSize={32} opacity={0.6} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      {/* Table */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800">
        <div className="px-5 py-4 border-b border-slate-100 dark:border-slate-800">
          <h3 className="font-semibold text-slate-900 dark:text-white">BRD Launch Summary</h3>
          <p className="text-xs text-slate-400 mt-0.5">Successful = Launched with ≤ {MIN_BUG_THRESHOLD} bugs · {quarter} {year}</p>
        </div>
        {quarterBRDs.length === 0 ? (
          <div className="py-10 text-center text-slate-400 text-sm">No BRDs for {quarter} {year}</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100 dark:border-slate-800">
                  {['BRD', 'Size', 'BA', 'Tech Lead', 'Sprint', 'Status', 'Bugs', 'Result', 'Links'].map((h) => (
                    <th key={h} className="text-left px-5 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wide">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50 dark:divide-slate-800/50">
                {quarterBRDs.map((brd) => {
                  const bugCount = bugs.filter((bug) => bug.brdId === brd.id).length;
                  const isSuccess = brd.status === 'launched' && bugCount <= MIN_BUG_THRESHOLD;
                  return (
                    <tr key={brd.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors">
                      <td className="px-5 py-3.5 font-medium text-slate-900 dark:text-white">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span>{brd.title}</span>
                          {isExtended(brd) && (
                            <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-semibold bg-indigo-50 dark:bg-indigo-950 text-indigo-600 dark:text-indigo-400 border border-indigo-200 dark:border-indigo-800 flex-shrink-0">
                              ← {brd.quarter} {brd.year}
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-5 py-3.5">
                        {brd.tshirtSize ? (() => {
                          const s = getTShirtSize(brd.tshirtSize);
                          return s ? (
                            <span className={`inline-flex items-center justify-center w-8 h-8 rounded-lg font-black text-xs ${s.bg} ${s.text}`} title={`${s.sprint} · ${s.days}`}>{s.label}</span>
                          ) : null;
                        })() : <span className="text-slate-400 text-xs">—</span>}
                      </td>
                      <td className="px-5 py-3.5">
                        {brd.baName ? (
                          <span className="inline-flex items-center gap-1.5 text-xs font-medium text-violet-700 dark:text-violet-400">
                            <span className="w-5 h-5 rounded-full bg-violet-100 dark:bg-violet-900 flex items-center justify-center text-violet-600 dark:text-violet-400 font-bold text-xs flex-shrink-0">{brd.baName.charAt(0)}</span>
                            {brd.baName}
                          </span>
                        ) : <span className="text-slate-400 text-xs">—</span>}
                      </td>
                      <td className="px-5 py-3.5">
                        {(() => {
                          const leads = brdTechLeads.filter((tl) => tl.brdId === brd.id);
                          if (!leads.length) return <span className="text-slate-400 text-xs">—</span>;
                          return (
                            <div className="flex flex-col gap-1">
                              {leads.map((tl) => (
                                <div key={tl.id} className="flex items-center gap-1.5">
                                  <span className="w-5 h-5 rounded-full bg-blue-100 dark:bg-blue-900 flex items-center justify-center text-blue-600 dark:text-blue-400 font-bold text-[10px] flex-shrink-0">{tl.name.charAt(0)}</span>
                                  <span className="text-xs font-medium text-blue-700 dark:text-blue-400">{tl.name}</span>
                                  {tl.expertise && <span className="text-[10px] text-slate-400 dark:text-slate-500">({tl.expertise})</span>}
                                </div>
                              ))}
                            </div>
                          );
                        })()}
                      </td>
                      <td className="px-5 py-3.5 text-slate-500 dark:text-slate-400 text-xs">{getSprintLabel(brd)}</td>
                      <td className="px-5 py-3.5"><StatusBadge status={brd.status} /></td>
                      <td className="px-5 py-3.5">
                        <span className={`font-bold text-sm ${bugCount > MIN_BUG_THRESHOLD ? 'text-red-500' : 'text-emerald-600 dark:text-emerald-400'}`}>{bugCount}</span>
                      </td>
                      <td className="px-5 py-3.5">
                        {brd.status === 'launched' ? (
                          <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-semibold ${isSuccess ? 'bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300' : 'bg-red-100 dark:bg-red-950 text-red-700 dark:text-red-300'}`}>
                            {isSuccess ? '✓ Success' : '✗ High Bugs'}
                          </span>
                        ) : <span className="text-slate-400 text-xs">—</span>}
                      </td>
                      <td className="px-5 py-3.5">
                        <div className="flex gap-2">
                          {brd.googleDocsLink && <a href={brd.googleDocsLink} target="_blank" rel="noopener noreferrer" className="text-blue-500 hover:text-blue-700 dark:hover:text-blue-300 text-xs font-medium">Docs</a>}
                          {brd.jiraLink && <a href={brd.jiraLink} target="_blank" rel="noopener noreferrer" className="text-blue-500 hover:text-blue-700 dark:hover:text-blue-300 text-xs font-medium">Jira</a>}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
