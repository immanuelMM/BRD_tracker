import { useMemo } from 'react';
import { TSHIRT_SIZES as DEFAULT_SIZES, SPRINT_DAYS } from '../utils/constants';
import { fmtTitle } from '../utils/db';
import { exportTShirtToExcel } from '../utils/excelExport';

const RISK_ICON = {
  'Very Low': '🟢',
  'Low': '🔵',
  'Medium': '🟡',
  'Moderate': '🟠',
  'High': '🔴',
  'Very High': '🟣',
};

// Derive a human-readable days label from minDays / maxDays
const daysLabel = (minDays, maxDays) => {
  if (minDays == null && maxDays == null) return '—';
  if (minDays == null) return `< ${maxDays} days`;
  if (maxDays == null) return `${minDays}+ days`;
  return `${minDays}–${maxDays} days`;
};

// Derive sprint label from days (1 sprint = SPRINT_DAYS working days)
const sprintLabel = (minDays, maxDays) => {
  const toSprint = (d) => +(d / SPRINT_DAYS).toFixed(1);
  if (minDays == null && maxDays != null) return `< ${toSprint(maxDays)} sprint`;
  if (maxDays == null && minDays != null) return `${toSprint(minDays)}+ sprints`;
  if (minDays != null && maxDays != null) return `${toSprint(minDays)}–${toSprint(maxDays)} sprints`;
  return '—';
};

// Width bar percentage — proportional to maxDays (or minDays for open-ended)
const barWidth = (size, allSizes) => {
  const refDays = allSizes.reduce((max, s) => {
    const d = s.maxDays ?? s.minDays ?? 0;
    return d > max ? d : max;
  }, 1);
  const d = size.maxDays ?? (size.minDays != null ? size.minDays * 1.5 : 0);
  return Math.min(100, Math.round((d / refDays) * 100));
};

export default function TShirtSizePage({ brds, bugs = [], tshirtSizes = DEFAULT_SIZES }) {
  // Normalise: dynamic sizes from DB don't have Tailwind class fields — use color inline
  const sizes = tshirtSizes.length > 0 ? tshirtSizes : DEFAULT_SIZES;

  // Count BRDs per size
  const sizeCounts = useMemo(() => {
    const counts = {};
    sizes.forEach((s) => { counts[s.value] = 0; });
    brds.forEach((b) => { if (b.tshirtSize && counts[b.tshirtSize] !== undefined) counts[b.tshirtSize]++; });
    // Also count sizes not in the sizes array (edge case)
    brds.forEach((b) => { if (b.tshirtSize && counts[b.tshirtSize] === undefined) counts[b.tshirtSize] = (counts[b.tshirtSize] || 0) + 1; });
    return counts;
  }, [brds]);

  const totalSized = Object.values(sizeCounts).reduce((a, b) => a + b, 0);

  return (
    <div className="space-y-6">

      {/* Header */}
      <div className="bg-gradient-to-br from-slate-900 to-slate-800 dark:from-slate-950 dark:to-slate-900 rounded-2xl p-6 text-white border border-slate-700">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <div className="inline-flex items-center gap-2 px-3 py-1 bg-white/10 rounded-lg text-xs font-semibold mb-3">
              <span>👕</span> T-Shirt Sizing Guide
            </div>
            <h2 className="text-2xl font-bold">BRD T-Shirt Sizes</h2>
            <p className="text-slate-400 text-sm mt-1 max-w-lg">
              Effort estimation framework for Business Requirements Documents.
              Helps teams quickly gauge complexity, sprint impact, and risk level.
            </p>
          </div>
          <div className="flex flex-col items-end gap-3 flex-shrink-0">
            <div className="bg-white/10 rounded-xl px-4 py-3 text-center">
              <p className="text-2xl font-bold">1 Sprint</p>
              <p className="text-xs text-slate-400 mt-0.5">= 4 weeks = {SPRINT_DAYS} working days</p>
            </div>
            <button
              onClick={() => exportTShirtToExcel(brds, bugs)}
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-white/10 hover:bg-white/20 text-white text-sm font-medium transition-colors"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
              Export Excel
            </button>
          </div>
        </div>
      </div>

      {/* Size cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
        {sizes.map((size) => {
          const count = sizeCounts[size.value] || 0;
          const pct = totalSized > 0 ? Math.round((count / totalSized) * 100) : 0;
          const col = size.color || '#3b82f6';
          const sLabel = size.sprint ?? sprintLabel(size.minDays, size.maxDays);
          const dLabel = size.days ?? daysLabel(size.minDays, size.maxDays);
          return (
            <div key={size.value} className="bg-white dark:bg-slate-900 rounded-2xl border-2 p-5 flex flex-col gap-4"
              style={{ borderColor: col + '55' }}>
              {/* Top row */}
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0"
                    style={{ backgroundColor: col + '22' }}>
                    <span className="text-xl font-black" style={{ color: col }}>{size.label}</span>
                  </div>
                  <div>
                    <p className="font-bold text-slate-900 dark:text-white text-sm">{sLabel}</p>
                    <p className="text-xs text-slate-400">{dLabel}</p>
                  </div>
                </div>
                <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-semibold"
                  style={{ backgroundColor: col + '22', color: col }}>
                  {RISK_ICON[size.risk]} {size.risk} Risk
                </span>
              </div>

              {/* Description */}
              <p className="text-sm text-slate-600 dark:text-slate-400 leading-relaxed">{size.description}</p>

              {/* Sprint bar */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-xs text-slate-400 font-medium">Sprint Impact</span>
                  <span className="text-xs font-bold" style={{ color: col }}>{sLabel}</span>
                </div>
                <div className="h-2 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                  <div className="h-full rounded-full transition-all"
                    style={{ width: `${barWidth(size, sizes)}%`, backgroundColor: col }} />
                </div>
              </div>

              {/* BRD usage */}
              <div className="pt-3 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between">
                <span className="text-xs text-slate-500 dark:text-slate-400">BRDs with this size</span>
                <div className="flex items-center gap-2">
                  <span className="text-sm font-bold" style={{ color: count > 0 ? col : undefined }}>{count}</span>
                  {count > 0 && <span className="text-xs text-slate-400">({pct}%)</span>}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Reference table */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800">
        <div className="px-5 py-4 border-b border-slate-100 dark:border-slate-800">
          <h3 className="font-semibold text-slate-900 dark:text-white">Quick Reference Table</h3>
          <p className="text-xs text-slate-400 mt-0.5">1 sprint = 4 weeks = {SPRINT_DAYS} working days</p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100 dark:border-slate-800">
                {['Size', 'Sprint Impact', 'Working Days', 'Risk', 'Description', 'BRDs'].map((h) => (
                  <th key={h} className="text-left px-5 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wide">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50 dark:divide-slate-800/50">
              {sizes.map((size) => {
                const col = size.color || '#3b82f6';
                const sLabel = size.sprint ?? sprintLabel(size.minDays, size.maxDays);
                const dLabel = size.days ?? daysLabel(size.minDays, size.maxDays);
                return (
                  <tr key={size.value} className="hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors">
                    <td className="px-5 py-3.5">
                      <span className="inline-flex items-center justify-center w-9 h-9 rounded-xl font-black text-sm"
                        style={{ backgroundColor: col + '22', color: col }}>{size.label}</span>
                    </td>
                    <td className="px-5 py-3.5 font-medium text-slate-900 dark:text-white">{sLabel}</td>
                    <td className="px-5 py-3.5 text-slate-500 dark:text-slate-400">{dLabel}</td>
                    <td className="px-5 py-3.5">
                      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold"
                        style={{ backgroundColor: col + '22', color: col }}>
                        {RISK_ICON[size.risk]} {size.risk}
                      </span>
                    </td>
                    <td className="px-5 py-3.5 text-slate-600 dark:text-slate-400 max-w-xs">{size.description}</td>
                    <td className="px-5 py-3.5">
                      <span className="font-bold" style={{ color: sizeCounts[size.value] > 0 ? col : undefined }}>
                        {sizeCounts[size.value] || 0}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* BRDs with size assigned */}
      {brds.filter((b) => b.tshirtSize).length > 0 && (
        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800">
          <div className="px-5 py-4 border-b border-slate-100 dark:border-slate-800">
            <h3 className="font-semibold text-slate-900 dark:text-white">BRDs by Size</h3>
          </div>
          <div className="divide-y divide-slate-50 dark:divide-slate-800/50">
            {sizes.map((size) => {
              const col = size.color || '#3b82f6';
              const sLabel = size.sprint ?? sprintLabel(size.minDays, size.maxDays);
              const sizedBRDs = brds.filter((b) => b.tshirtSize === size.value);
              if (!sizedBRDs.length) return null;
              return (
                <div key={size.value} className="px-5 py-4">
                  <div className="flex items-center gap-2 mb-3">
                    <span className="inline-flex items-center justify-center w-7 h-7 rounded-lg font-black text-xs"
                      style={{ backgroundColor: col + '22', color: col }}>{size.label}</span>
                    <span className="text-sm font-semibold text-slate-900 dark:text-white">{sLabel}</span>
                    <span className="text-xs text-slate-400">— {sizedBRDs.length} BRD{sizedBRDs.length !== 1 ? 's' : ''}</span>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {sizedBRDs.map((brd) => (
                      <span key={brd.id} className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 rounded-lg text-xs font-medium">
                        <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: col }} />
                        {fmtTitle(brd.title)}
                      </span>
                    ))}
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
