import { useState } from 'react';
import { STATUS_OPTIONS, QUARTERS, SPRINTS, YEARS, TSHIRT_SIZES, BA_OPTIONS } from '../utils/constants';

const parseExtendedQuarters = (val) => {
  if (!val) return [];
  try { const p = JSON.parse(val); return Array.isArray(p) ? p : []; } catch { return []; }
};

const parseTickets = (val) => {
  if (!val) return [];
  try { const p = JSON.parse(val); return Array.isArray(p) ? p.filter(Boolean) : (val ? [val] : []); } catch { return val ? [val] : []; }
};

const empty = {
  title: '',
  googleDocsLink: '',
  quarter: '',
  year: new Date().getFullYear(),
  sprintStart: '',
  sprintEnd: '',
  jiraLink: '',
  status: 'planning',
  description: '',
  bugLogLink: '',
  baName: '',
  techLead: '',
  tshirtSize: '',
  extendedQuarters: [],
  beTickets: [],
  feTickets: [],
  anciliaryTickets: [],
  rndTickets: [],
  devAssignee: '',
};

const inputClass = 'w-full px-3 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 placeholder-slate-400 dark:placeholder-slate-500 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-colors';
const selectClass = `${inputClass} cursor-pointer`;
const labelClass = 'block text-xs font-semibold text-slate-600 dark:text-slate-400 uppercase tracking-wide mb-1.5';

export default function BRDForm({ initial = {}, onSave, onCancel, teamLeads = [] }) {
  const [form, setForm] = useState({
    ...empty,
    ...initial,
    extendedQuarters: parseExtendedQuarters(initial.extendedQuarters),
    beTickets: parseTickets(initial.beTicket),
    feTickets: parseTickets(initial.feTicket),
    anciliaryTickets: parseTickets(initial.anciliaryTicket),
    rndTickets: parseTickets(initial.rndTicket),
  });
  const [errors, setErrors] = useState({});

  const set = (field) => (e) => setForm((f) => ({ ...f, [field]: e.target.value }));
  const setVal = (field, val) => setForm((f) => ({ ...f, [field]: val }));

  const validate = () => {
    const errs = {};
    if (!form.title.trim()) errs.title = 'BRD title is required';
    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!validate()) return;
    const { extendedQuarters, beTickets, feTickets, anciliaryTickets, rndTickets, ...rest } = form;
    onSave({
      ...rest,
      extendedQuarters: extendedQuarters.length > 0 ? JSON.stringify(extendedQuarters) : null,
      beTicket:        beTickets.filter(Boolean).length        ? JSON.stringify(beTickets.filter(Boolean))        : null,
      feTicket:        feTickets.filter(Boolean).length        ? JSON.stringify(feTickets.filter(Boolean))        : null,
      anciliaryTicket: anciliaryTickets.filter(Boolean).length ? JSON.stringify(anciliaryTickets.filter(Boolean)) : null,
      rndTicket:       rndTickets.filter(Boolean).length       ? JSON.stringify(rndTickets.filter(Boolean))       : null,
    });
  };

  const addTicket   = (field) => setForm((f) => ({ ...f, [field]: [...f[field], ''] }));
  const removeTicket = (field, idx) => setForm((f) => ({ ...f, [field]: f[field].filter((_, i) => i !== idx) }));
  const setTicket   = (field, idx, val) => setForm((f) => ({ ...f, [field]: f[field].map((v, i) => i === idx ? val : v) }));

  const isDev = ['development', 'testing', 'launched'].includes(form.status);

  return (
    <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800">
      <div className="px-6 py-5 border-b border-slate-100 dark:border-slate-800">
        <h2 className="font-semibold text-slate-900 dark:text-white">{initial.id ? 'Edit BRD' : 'Create New BRD'}</h2>
        <p className="text-sm text-slate-400 mt-0.5">Fill in the details below</p>
      </div>
      <form onSubmit={handleSubmit} className="p-6 space-y-5">

        {/* Title */}
        <div>
          <label className={labelClass}>BRD Title *</label>
          <input value={form.title} onChange={set('title')} placeholder="e.g. Customer Portal Redesign" className={`${inputClass} ${errors.title ? 'border-red-400 focus:ring-red-400' : ''}`} />
          {errors.title && <p className="text-xs text-red-500 mt-1.5 flex items-center gap-1"><svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd"/></svg>{errors.title}</p>}
        </div>

        {/* Description */}
        <div>
          <label className={labelClass}>Description</label>
          <textarea value={form.description} onChange={set('description')} rows={3} placeholder="Brief description of this BRD..." className={`${inputClass} resize-none`} />
        </div>

        {/* BA + Tech Lead */}
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className={labelClass}>
              <span className="flex items-center gap-1.5">
                <svg className="w-3.5 h-3.5 text-violet-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" /></svg>
                BA (BRD Author)
              </span>
            </label>
            <select value={form.baName} onChange={set('baName')} className={selectClass}>
              <option value="">— Select BA —</option>
              {BA_OPTIONS.map((ba) => <option key={ba} value={ba}>{ba}</option>)}
            </select>
          </div>
          <div>
            <label className={labelClass}>
              <span className="flex items-center gap-1.5">
                <svg className="w-3.5 h-3.5 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4" /></svg>
                Tech Leads (Assessors)
              </span>
            </label>
            <div className="px-3 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50 text-sm text-slate-600 dark:text-slate-400">
              {initial.id ? 'Manage in BRD detail view →' : 'Add after creating BRD'}
            </div>
          </div>
        </div>

        {/* Google Docs */}
        <div>
          <label className={labelClass}>
            <span className="flex items-center gap-1.5">
              <svg className="w-3.5 h-3.5 text-blue-500" fill="currentColor" viewBox="0 0 24 24"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-6-6zm4 18H6V4h7v5h5v11z"/></svg>
              Google Docs Link
            </span>
          </label>
          <input value={form.googleDocsLink} onChange={set('googleDocsLink')} placeholder="https://docs.google.com/..." className={inputClass} />
        </div>

        {/* Quarter + Year */}
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className={labelClass}>Quarter</label>
            <select value={form.quarter} onChange={set('quarter')} className={selectClass}>
              <option value="">— No Quarter —</option>
              {QUARTERS.map((q) => <option key={q}>{q}</option>)}
            </select>
          </div>
          <div>
            <label className={labelClass}>Year</label>
            <select value={form.year} onChange={set('year')} className={selectClass}>
              {YEARS.map((y) => <option key={y}>{y}</option>)}
            </select>
          </div>
        </div>

        {/* Extended Quarters */}
        <div>
          <label className={labelClass}>Extends Into Quarters</label>
          <p className="text-xs text-slate-400 mb-2">BRD will appear in these quarters' reports even if not its primary quarter</p>
          {form.extendedQuarters.length > 0 && (
            <div className="flex flex-wrap gap-1.5 mb-2">
              {form.extendedQuarters.map(key => (
                <span key={key} className="inline-flex items-center gap-1 pl-2.5 pr-1 py-1 rounded-lg text-xs font-semibold bg-indigo-50 dark:bg-indigo-950 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800">
                  {key.replace('-', ' ')}
                  <button type="button"
                    onClick={() => setVal('extendedQuarters', form.extendedQuarters.filter(x => x !== key))}
                    className="ml-0.5 w-4 h-4 rounded-full flex items-center justify-center hover:bg-indigo-200 dark:hover:bg-indigo-800 transition-colors text-indigo-500">×</button>
                </span>
              ))}
            </div>
          )}
          <select value="" onChange={e => {
            if (e.target.value && !form.extendedQuarters.includes(e.target.value))
              setVal('extendedQuarters', [...form.extendedQuarters, e.target.value]);
          }} className={selectClass}>
            <option value="">+ Add quarter extension…</option>
            {YEARS.flatMap(y => QUARTERS.map(q => `${q}-${y}`))
              .filter(key => key !== `${form.quarter}-${form.year}` && !form.extendedQuarters.includes(key))
              .map(key => <option key={key} value={key}>{key.replace('-', ' ')}</option>)}
          </select>
        </div>

        {/* Sprint Range */}
        <div>
          <label className={labelClass}>Sprint Range</label>
          <div className="flex items-center gap-3">
            <select value={form.sprintStart} onChange={set('sprintStart')} className={`${selectClass} flex-1`}>
              <option value="">— No Sprint —</option>
              {SPRINTS.map((s) => <option key={s}>{s}</option>)}
            </select>
            <span className="text-slate-400 dark:text-slate-500 text-sm font-medium flex-shrink-0">→</span>
            <select value={form.sprintEnd} onChange={set('sprintEnd')} className={`${selectClass} flex-1`}>
              <option value="">— No Sprint —</option>
              {SPRINTS.map((s) => <option key={s}>{s}</option>)}
            </select>
          </div>
          {form.sprintStart === form.sprintEnd && (
            <p className="text-xs text-slate-400 mt-1.5">Single sprint — change end sprint for a range</p>
          )}
        </div>

        {/* Jira */}
        <div>
          <label className={labelClass}>
            <span className="flex items-center gap-1.5">
              <svg className="w-3.5 h-3.5 text-blue-600" fill="currentColor" viewBox="0 0 24 24"><path d="M11.571 11.513H0a5.218 5.218 0 0 0 5.232 5.215h2.13v2.057A5.215 5.215 0 0 0 12.575 24V12.518a1.005 1.005 0 0 0-1.004-1.005zm5.723-5.756H5.757a5.215 5.215 0 0 0 5.215 5.214h2.129v2.058a5.218 5.218 0 0 0 5.215 5.214V6.762a1.005 1.005 0 0 0-1.022-1.005zM23.013 0H11.455a5.215 5.215 0 0 0 5.215 5.215h2.129v2.057A5.215 5.215 0 0 0 24 12.483V1.005A1.005 1.005 0 0 0 23.013 0z"/></svg>
              Jira Ticket Link
            </span>
          </label>
          <input value={form.jiraLink} onChange={set('jiraLink')} placeholder="https://company.atlassian.net/browse/..." className={inputClass} />
        </div>

        {/* Story Tickets by Team */}
        <div className="p-4 bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-xl space-y-3">
          <label className={labelClass}>Story Tickets by Team</label>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {[
              { field: 'beTickets',        label: 'BE',        color: 'text-blue-600',    btn: 'bg-blue-50 dark:bg-blue-950 text-blue-600 hover:bg-blue-100 dark:hover:bg-blue-900' },
              { field: 'feTickets',        label: 'FE',        color: 'text-violet-600',  btn: 'bg-violet-50 dark:bg-violet-950 text-violet-600 hover:bg-violet-100 dark:hover:bg-violet-900' },
              { field: 'anciliaryTickets', label: 'Anciliary', color: 'text-emerald-600', btn: 'bg-emerald-50 dark:bg-emerald-950 text-emerald-600 hover:bg-emerald-100 dark:hover:bg-emerald-900' },
              { field: 'rndTickets',       label: 'RND',       color: 'text-orange-600',  btn: 'bg-orange-50 dark:bg-orange-950 text-orange-600 hover:bg-orange-100 dark:hover:bg-orange-900' },
            ].map(({ field, label, color, btn }) => (
              <div key={field} className="space-y-1.5">
                <span className={`block text-[11px] font-bold uppercase tracking-wide ${color}`}>{label}</span>
                {form[field].map((url, idx) => (
                  <div key={idx} className="flex gap-1.5">
                    <input
                      value={url}
                      onChange={(e) => setTicket(field, idx, e.target.value)}
                      placeholder="https://... ticket link"
                      className={inputClass}
                    />
                    <button type="button" onClick={() => removeTicket(field, idx)}
                      className="flex-shrink-0 w-8 h-[42px] flex items-center justify-center rounded-xl bg-slate-100 dark:bg-slate-700 hover:bg-red-100 dark:hover:bg-red-950 text-slate-400 hover:text-red-500 transition-colors text-lg leading-none">
                      ×
                    </button>
                  </div>
                ))}
                <button type="button" onClick={() => addTicket(field)}
                  className={`w-full py-1.5 rounded-xl text-xs font-semibold transition-colors border border-dashed border-current/30 ${btn}`}>
                  + Add {label} Ticket
                </button>
              </div>
            ))}
          </div>
        </div>

        {/* T-Shirt Size */}
        <div>
          <label className={labelClass}>
            <span className="flex items-center gap-1.5">
              <svg className="w-3.5 h-3.5 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6.5 4h11l2.5 4-4 2v10H8V10L4 8l2.5-4z" /></svg>
              T-Shirt Size
            </span>
          </label>
          <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
            {TSHIRT_SIZES.map((size) => (
              <label key={size.value} className={`flex flex-col items-center gap-1.5 p-3 rounded-xl border-2 cursor-pointer transition-all duration-150 ${form.tshirtSize === size.value ? `${size.border} ${size.bg}` : 'border-slate-200 dark:border-slate-700 hover:border-slate-300 dark:hover:border-slate-600'}`}>
                <input type="radio" name="tshirtSize" value={size.value} checked={form.tshirtSize === size.value} onChange={set('tshirtSize')} className="sr-only" />
                <span className={`text-base font-black ${form.tshirtSize === size.value ? size.text : 'text-slate-500 dark:text-slate-400'}`}>{size.label}</span>
                <span className="text-xs text-slate-400 text-center leading-tight">{size.sprint}</span>
              </label>
            ))}
          </div>
          {form.tshirtSize && (() => {
            const s = TSHIRT_SIZES.find((x) => x.value === form.tshirtSize);
            return s ? (
              <p className={`text-xs mt-2 px-3 py-2 rounded-lg ${s.bg} ${s.text}`}>
                <span className="font-semibold">{s.label} — {s.sprint} ({s.days}):</span> {s.description}
              </p>
            ) : null;
          })()}
        </div>

        {/* Status */}
        <div>
          <label className={labelClass}>Status</label>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            {STATUS_OPTIONS.map((opt) => (
              <label key={opt.value} className={`flex items-center gap-2.5 p-3 rounded-xl border-2 cursor-pointer transition-all duration-150 ${form.status === opt.value ? 'border-blue-500 bg-blue-50 dark:bg-blue-950' : 'border-slate-200 dark:border-slate-700 hover:border-slate-300 dark:hover:border-slate-600 bg-white dark:bg-slate-800'}`}>
                <input type="radio" name="status" value={opt.value} checked={form.status === opt.value} onChange={set('status')} className="sr-only" />
                <span className="w-2.5 h-2.5 rounded-full flex-shrink-0 ring-2 ring-white dark:ring-slate-800" style={{ backgroundColor: opt.color }} />
                <span className={`text-sm font-medium ${form.status === opt.value ? 'text-blue-700 dark:text-blue-300' : 'text-slate-700 dark:text-slate-300'}`}>{opt.label}</span>
              </label>
            ))}
          </div>
        </div>

        {/* Bug Log Link */}
        {isDev && (
          <div className="p-4 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded-xl">
            <label className="block text-xs font-semibold text-amber-700 dark:text-amber-400 uppercase tracking-wide mb-1.5">
              Bug Log Link
            </label>
            <input value={form.bugLogLink} onChange={set('bugLogLink')} placeholder="https://... (link to bug log spreadsheet or doc)" className="w-full px-3 py-2.5 rounded-xl border border-amber-300 dark:border-amber-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400 transition-colors" />
            <p className="text-xs text-amber-600 dark:text-amber-500 mt-1.5">You can also log individual bugs in the BRD detail view</p>
          </div>
        )}

        {/* Actions */}
        <div className="flex gap-3 pt-1">
          <button type="submit" className="flex-1 bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white font-semibold py-2.5 px-5 rounded-xl transition-colors text-sm shadow-sm">
            {initial.id ? 'Save Changes' : 'Create BRD'}
          </button>
          {onCancel && (
            <button type="button" onClick={onCancel} className="flex-1 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 font-semibold py-2.5 px-5 rounded-xl transition-colors text-sm">
              Cancel
            </button>
          )}
        </div>
      </form>
    </div>
  );
}
