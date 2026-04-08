import { useState } from 'react';
import { BUG_CRITERIA as DEFAULT_CRITERIA, BUG_SEVERITY } from '../utils/constants';

const empty = {
  title: '',
  description: '',
  criteria: 'new_requirements',
  severity: 'medium',
  status: 'open',
  jiraLink: '',
  rootCause: '',
  storyTicket: '',
};

const inputClass = 'w-full px-3 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 placeholder-slate-400 dark:placeholder-slate-500 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-colors';
const labelClass = 'block text-xs font-semibold text-slate-600 dark:text-slate-400 uppercase tracking-wide mb-1.5';

const BUG_STATUS = [
  { value: 'open', label: 'Open', color: 'bg-red-100 dark:bg-red-950 text-red-700 dark:text-red-300 border-red-200 dark:border-red-800' },
  { value: 'in_progress', label: 'In Progress', color: 'bg-amber-100 dark:bg-amber-950 text-amber-700 dark:text-amber-300 border-amber-200 dark:border-amber-800' },
  { value: 'resolved', label: 'Resolved', color: 'bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800' },
  { value: 'closed', label: 'Closed', color: 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 border-slate-200 dark:border-slate-700' },
];

export default function BugForm({ brdId, initial = {}, onSave, onCancel, criteria = DEFAULT_CRITERIA }) {
  const [form, setForm] = useState({ ...empty, ...initial });
  const [errors, setErrors] = useState({});

  const set = (field) => (e) => setForm((f) => ({ ...f, [field]: e.target.value }));

  const validate = () => {
    const errs = {};
    if (!form.title.trim()) errs.title = 'Bug title is required';
    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (validate()) onSave({ ...form, brdId });
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label className={labelClass}>Bug Title *</label>
        <input value={form.title} onChange={set('title')} placeholder="Describe the bug..." className={`${inputClass} ${errors.title ? 'border-red-400 focus:ring-red-400' : ''}`} />
        {errors.title && <p className="text-xs text-red-500 mt-1.5">{errors.title}</p>}
      </div>

      <div>
        <label className={labelClass}>Description</label>
        <textarea value={form.description} onChange={set('description')} rows={2} placeholder="Additional details..." className={`${inputClass} resize-none`} />
      </div>

      <div>
        <label className={labelClass}>
          <span className="flex items-center gap-1.5">
            <svg className="w-3.5 h-3.5 text-blue-500" fill="currentColor" viewBox="0 0 24 24"><path d="M11.571 11.513H0a5.218 5.218 0 0 0 5.232 5.215h2.13v2.057A5.215 5.215 0 0 0 12.575 24V12.518a1.005 1.005 0 0 0-1.004-1.005zm5.723-5.756H5.757a5.215 5.215 0 0 0 5.215 5.214h2.129v2.058a5.218 5.218 0 0 0 5.215 5.214V6.762a1.005 1.005 0 0 0-1.022-1.005zM23.013 0H11.455a5.215 5.215 0 0 0 5.215 5.215h2.129v2.057A5.215 5.215 0 0 0 24 12.483V1.005A1.005 1.005 0 0 0 23.013 0z"/></svg>
            Jira Ticket Link
          </span>
        </label>
        <input value={form.jiraLink} onChange={set('jiraLink')} placeholder="https://company.atlassian.net/browse/..." className={inputClass} />
      </div>

      <div>
        <label className={labelClass}>
          <span className="flex items-center gap-1.5">
            <svg className="w-3.5 h-3.5 text-blue-500" fill="currentColor" viewBox="0 0 24 24"><path d="M11.571 11.513H0a5.218 5.218 0 0 0 5.232 5.215h2.13v2.057A5.215 5.215 0 0 0 12.575 24V12.518a1.005 1.005 0 0 0-1.004-1.005zm5.723-5.756H5.757a5.215 5.215 0 0 0 5.215 5.214h2.129v2.058a5.218 5.218 0 0 0 5.215 5.214V6.762a1.005 1.005 0 0 0-1.022-1.005zM23.013 0H11.455a5.215 5.215 0 0 0 5.215 5.215h2.129v2.057A5.215 5.215 0 0 0 24 12.483V1.005A1.005 1.005 0 0 0 23.013 0z"/></svg>
            Story Ticket Link
          </span>
        </label>
        <input value={form.storyTicket} onChange={set('storyTicket')} placeholder="https://... story ticket link" className={inputClass} />
      </div>

      <div>
        <label className={labelClass}>Root Cause Analysis</label>
        <textarea value={form.rootCause} onChange={set('rootCause')} rows={3} placeholder="Describe the root cause of this bug..." className={`${inputClass} resize-none`} />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className={labelClass}>Criteria</label>
          <select value={form.criteria} onChange={set('criteria')} title={criteria.find((c) => c.value === form.criteria)?.description || ''} className={inputClass}>
            {criteria.map((c) => <option key={c.value} value={c.value} title={c.description}>{c.label}</option>)}
          </select>
          {criteria.find((c) => c.value === form.criteria)?.description && (
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1.5">{criteria.find((c) => c.value === form.criteria).description}</p>
          )}
        </div>
        <div>
          <label className={labelClass}>Severity</label>
          <select value={form.severity} onChange={set('severity')} className={inputClass}>
            {BUG_SEVERITY.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
          </select>
        </div>
      </div>

      <div>
        <label className={labelClass}>Bug Status</label>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          {BUG_STATUS.map((s) => (
            <label key={s.value} className={`flex items-center justify-center px-3 py-2 rounded-xl border-2 cursor-pointer text-xs font-semibold transition-all ${form.status === s.value ? s.color + ' border-current' : 'border-slate-200 dark:border-slate-700 text-slate-500 dark:text-slate-400 hover:border-slate-300 dark:hover:border-slate-600'}`}>
              <input type="radio" name="bugStatus" value={s.value} checked={form.status === s.value} onChange={set('status')} className="sr-only" />
              {s.label}
            </label>
          ))}
        </div>
      </div>

      <div className="flex gap-3 pt-1">
        <button type="submit" className="flex-1 bg-rose-600 hover:bg-rose-700 text-white font-semibold py-2.5 px-4 rounded-xl transition-colors text-sm">
          {initial.id ? 'Update Bug' : 'Log Bug'}
        </button>
        {onCancel && (
          <button type="button" onClick={onCancel} className="px-4 py-2.5 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 rounded-xl text-sm font-medium transition-colors">
            Cancel
          </button>
        )}
      </div>
    </form>
  );
}
