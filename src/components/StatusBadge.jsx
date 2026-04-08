import { STATUS_OPTIONS } from '../utils/constants';

export default function StatusBadge({ status }) {
  const opt = STATUS_OPTIONS.find((s) => s.value === status);
  if (!opt) return null;

  const colorMap = {
    planning:    'bg-violet-100 text-violet-700 dark:bg-violet-950 dark:text-violet-300 ring-violet-200 dark:ring-violet-800',
    inprogress:  'bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300 ring-amber-200 dark:ring-amber-800',
    development: 'bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300 ring-blue-200 dark:ring-blue-800',
    testing:     'bg-purple-100 text-purple-700 dark:bg-purple-950 dark:text-purple-300 ring-purple-200 dark:ring-purple-800',
    launched:    'bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300 ring-emerald-200 dark:ring-emerald-800',
    onhold:      'bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300 ring-red-200 dark:ring-red-800',
  };

  const dotMap = {
    planning: 'bg-violet-500', inprogress: 'bg-amber-500', development: 'bg-blue-500',
    testing: 'bg-purple-500', launched: 'bg-emerald-500', onhold: 'bg-red-500',
  };

  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold ring-1 ${colorMap[status] || 'bg-slate-100 text-slate-600 ring-slate-200'}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${dotMap[status] || 'bg-slate-400'}`} />
      {opt.label}
    </span>
  );
}
