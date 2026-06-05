import { useState, useMemo, useCallback, useRef, useEffect } from 'react';
import DOMPurify from 'dompurify';
import { QUARTERS, YEARS } from '../utils/constants';
import { fmtTitle } from '../utils/db';

const HIGHLIGHT_COLORS = [
  { color: '#fef08a', label: 'Yellow' },
  { color: '#bbf7d0', label: 'Green' },
  { color: '#bae6fd', label: 'Sky' },
  { color: '#fbcfe8', label: 'Pink' },
  { color: '#fed7aa', label: 'Orange' },
  { color: '#e9d5ff', label: 'Purple' },
  { color: '#fca5a5', label: 'Red' },
];

const TEXT_COLORS = [
  { color: '#ef4444', label: 'Red' },
  { color: '#f97316', label: 'Orange' },
  { color: '#ca8a04', label: 'Yellow' },
  { color: '#16a34a', label: 'Green' },
  { color: '#2563eb', label: 'Blue' },
  { color: '#7c3aed', label: 'Purple' },
  { color: '#db2777', label: 'Pink' },
];

// Strip HTML for plain-text previews
const stripHtml = (html) => (html || '').replace(/<[^>]*>/g, '').replace(/&nbsp;/g, ' ').trim();

// Parse brdId field — may be a JSON array string, a single UUID string, or null
const parseBrdIds = (val) => {
  if (!val) return [];
  try {
    const parsed = JSON.parse(val);
    return Array.isArray(parsed) ? parsed : [String(val)];
  } catch {
    return [String(val)];
  }
};

// ── Constants ─────────────────────────────────────────────────────────────────

const PRIORITY = [
  { value: 'critical', label: 'Critical', color: '#ef4444', bg: 'bg-red-50 dark:bg-red-950', text: 'text-red-700 dark:text-red-300', border: 'border-red-300 dark:border-red-700' },
  { value: 'high',     label: 'High',     color: '#f97316', bg: 'bg-orange-50 dark:bg-orange-950', text: 'text-orange-700 dark:text-orange-300', border: 'border-orange-300 dark:border-orange-700' },
  { value: 'medium',   label: 'Medium',   color: '#f59e0b', bg: 'bg-amber-50 dark:bg-amber-950', text: 'text-amber-700 dark:text-amber-300', border: 'border-amber-300 dark:border-amber-700' },
  { value: 'low',      label: 'Low',      color: '#10b981', bg: 'bg-emerald-50 dark:bg-emerald-950', text: 'text-emerald-700 dark:text-emerald-300', border: 'border-emerald-300 dark:border-emerald-700' },
];

const STATUS = [
  { value: 'todo',       label: 'To Do',       icon: '○', color: '#94a3b8' },
  { value: 'inprogress', label: 'In Progress',  icon: '◑', color: '#3b82f6' },
  { value: 'done',       label: 'Done',         icon: '●', color: '#10b981' },
];

const getPriority = (v) => PRIORITY.find(p => p.value === v) || PRIORITY[2];
const getStatus   = (v) => STATUS.find(s => s.value === v)   || STATUS[0];

// ── Sub-components ────────────────────────────────────────────────────────────

const PriorityBadge = ({ value }) => {
  const p = getPriority(value);
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-bold border ${p.bg} ${p.text} ${p.border}`}>
      <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: p.color }} />
      {p.label}
    </span>
  );
};

const StatusPill = ({ value, onChange }) => {
  const s = getStatus(value);
  const next = STATUS[(STATUS.findIndex(x => x.value === value) + 1) % STATUS.length];
  return (
    <button onClick={() => onChange(next.value)} title={`Mark as ${next.label}`}
      className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold transition-colors hover:opacity-80"
      style={{ backgroundColor: s.color + '22', color: s.color }}>
      <span>{s.icon}</span>
      {s.label}
    </button>
  );
};

const inputClass = 'w-full px-3 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 placeholder-slate-400 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 transition-colors';
const labelClass = 'block text-xs font-semibold text-slate-600 dark:text-slate-400 uppercase tracking-wide mb-1.5';

// ── Note Form (shared for Add/Edit) ──────────────────────────────────────────

function NoteForm({ initial = {}, brds = [], onSave, onCancel }) {
  const [form, setForm] = useState({
    title:    initial.title    || '',
    content:  initial.content  || '',
    quarter:  initial.quarter  || '',
    year:     initial.year     || new Date().getFullYear(),
    sprint:   initial.sprint   || '',
    priority: initial.priority || 'medium',
    status:   initial.status   || 'todo',
    brdIds:   parseBrdIds(initial.brdId),
  });
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const editorRef = useRef(null);

  // Populate editor with initial HTML on first mount only
  useEffect(() => {
    if (editorRef.current) {
      editorRef.current.innerHTML = initial.content || '';
    }
  }, []); // eslint-disable-line

  const syncContent = () => {
    set('content', editorRef.current?.innerHTML || '');
  };

  const cmd = (command, value = null) => {
    editorRef.current?.focus();
    document.execCommand('styleWithCSS', false, true);
    document.execCommand(command, false, value);
    syncContent();
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!form.title.trim()) return;
    const { brdIds, ...rest } = form;
    onSave({
      ...rest,
      content: editorRef.current?.innerHTML || form.content,
      year:    Number(form.year),
      brdId:   brdIds.length > 0 ? JSON.stringify(brdIds) : null,
      quarter: form.quarter || null,
      sprint:  form.sprint  || null,
    });
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {/* Title */}
      <div>
        <label className={labelClass}>Title *</label>
        <input value={form.title} onChange={e => set('title', e.target.value)}
          placeholder="Note title..." className={inputClass} required autoFocus />
      </div>

      {/* Quarter / Year / Sprint row */}
      <div className="grid grid-cols-3 gap-3">
        <div>
          <label className={labelClass}>Quarter</label>
          <select value={form.quarter} onChange={e => set('quarter', e.target.value)} className={inputClass}>
            <option value="">— All —</option>
            {QUARTERS.map(q => <option key={q} value={q}>{q}</option>)}
          </select>
        </div>
        <div>
          <label className={labelClass}>Year</label>
          <select value={form.year} onChange={e => set('year', e.target.value)} className={inputClass}>
            {YEARS.map(y => <option key={y} value={y}>{y}</option>)}
          </select>
        </div>
        <div>
          <label className={labelClass}>Sprint</label>
          <select value={form.sprint} onChange={e => set('sprint', e.target.value)} className={inputClass}>
            <option value="">— None —</option>
            {Array.from({ length: 26 }, (_, i) => i + 1).map(n => (
              <option key={n} value={String(n)}>Sprint {n}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Priority / Status row */}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className={labelClass}>Priority</label>
          <select value={form.priority} onChange={e => set('priority', e.target.value)} className={inputClass}>
            {PRIORITY.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
          </select>
        </div>
        <div>
          <label className={labelClass}>Status</label>
          <select value={form.status} onChange={e => set('status', e.target.value)} className={inputClass}>
            {STATUS.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
          </select>
        </div>
      </div>

      {/* Linked BRDs — multi-select */}
      <div>
        <label className={labelClass}>Linked BRDs (optional)</label>
        {/* Chips for selected BRDs */}
        {form.brdIds.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mb-2">
            {form.brdIds.map(id => {
              const brd = brds.find(b => b.id === id);
              return (
                <span key={id} className="inline-flex items-center gap-1 pl-2.5 pr-1 py-1 rounded-lg text-xs font-medium bg-blue-50 dark:bg-blue-950 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-800">
                  {brd ? fmtTitle(brd.title) : id}
                  <button type="button" onClick={() => set('brdIds', form.brdIds.filter(x => x !== id))}
                    className="ml-0.5 w-4 h-4 rounded-full flex items-center justify-center hover:bg-blue-200 dark:hover:bg-blue-800 transition-colors text-blue-500">
                    ×
                  </button>
                </span>
              );
            })}
          </div>
        )}
        {/* Dropdown to add more */}
        <select
          value=""
          onChange={e => { if (e.target.value) set('brdIds', [...form.brdIds, e.target.value]); }}
          className={inputClass}
        >
          <option value="">+ Add a BRD…</option>
          {brds.filter(b => !form.brdIds.includes(b.id)).map(b => (
            <option key={b.id} value={b.id}>{fmtTitle(b.title)}</option>
          ))}
        </select>
      </div>

      {/* Content — Rich Text Editor */}
      <div>
        <label className={labelClass}>Notes / Details</label>
        {/* Toolbar */}
        <div className="flex flex-wrap items-center gap-1.5 px-2.5 py-2 bg-slate-50 dark:bg-slate-800 border border-b-0 border-slate-200 dark:border-slate-700 rounded-t-xl">
          {/* Format buttons */}
          <button type="button" title="Bold" onMouseDown={e => { e.preventDefault(); cmd('bold'); }}
            className="px-2 py-1 rounded text-xs font-bold text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors">B</button>
          <button type="button" title="Italic" onMouseDown={e => { e.preventDefault(); cmd('italic'); }}
            className="px-2 py-1 rounded text-xs italic text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors">I</button>
          <button type="button" title="Underline" onMouseDown={e => { e.preventDefault(); cmd('underline'); }}
            className="px-2 py-1 rounded text-xs underline text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors">U</button>
          <div className="w-px h-4 bg-slate-300 dark:bg-slate-600 mx-0.5" />
          {/* Highlight swatches */}
          <span className="text-[10px] text-slate-400 font-medium">Highlight:</span>
          {HIGHLIGHT_COLORS.map(({ color, label }) => (
            <button key={color} type="button" title={`Highlight ${label}`}
              onMouseDown={e => { e.preventDefault(); cmd('hiliteColor', color); }}
              className="w-5 h-5 rounded-full border-2 border-white dark:border-slate-600 shadow-sm hover:scale-110 transition-transform flex-shrink-0"
              style={{ backgroundColor: color }} />
          ))}
          <div className="w-px h-4 bg-slate-300 dark:bg-slate-600 mx-0.5" />
          {/* Text color swatches */}
          <span className="text-[10px] text-slate-400 font-medium">Color:</span>
          {TEXT_COLORS.map(({ color, label }) => (
            <button key={color} type="button" title={`Text ${label}`}
              onMouseDown={e => { e.preventDefault(); cmd('foreColor', color); }}
              className="w-5 h-5 rounded-full border-2 border-white dark:border-slate-600 shadow-sm hover:scale-110 transition-transform flex-shrink-0"
              style={{ backgroundColor: color }} />
          ))}
          <div className="w-px h-4 bg-slate-300 dark:bg-slate-600 mx-0.5" />
          <button type="button" title="Remove formatting" onMouseDown={e => { e.preventDefault(); cmd('removeFormat'); }}
            className="px-2 py-1 rounded text-[10px] text-slate-500 hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors">✕ Clear</button>
        </div>
        {/* Editable area */}
        <div
          ref={editorRef}
          contentEditable
          suppressContentEditableWarning
          onInput={syncContent}
          data-placeholder="Write your notes here..."
          className="w-full px-3 py-2.5 min-h-[120px] border border-slate-200 dark:border-slate-700 rounded-b-xl bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 transition-colors [&:empty]:before:content-[attr(data-placeholder)] [&:empty]:before:text-slate-400"
        />
      </div>

      <div className="flex justify-end gap-2 pt-1">
        <button type="button" onClick={onCancel}
          className="px-4 py-2 text-sm font-medium text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl transition-colors">
          Cancel
        </button>
        <button type="submit"
          className="px-4 py-2 text-sm font-semibold bg-blue-600 hover:bg-blue-700 text-white rounded-xl transition-colors">
          {initial.id ? 'Save Changes' : 'Add Note'}
        </button>
      </div>
    </form>
  );
}

// ── Note Card ─────────────────────────────────────────────────────────────────

function NoteCard({ note, brds, onEdit, onDelete, onStatusChange, onSelectBRD }) {
  const linkedBRDs = brds.filter(b => parseBrdIds(note.brdId).includes(b.id));
  const p = getPriority(note.priority);
  const isDone = note.status === 'done';

  return (
    <div className={`bg-white dark:bg-slate-900 rounded-2xl border-2 p-4 flex flex-col gap-3 transition-opacity ${isDone ? 'opacity-60' : ''} ${p.border}`}>
      {/* Header */}
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <p className={`font-semibold text-sm text-slate-900 dark:text-white leading-snug ${isDone ? 'line-through' : ''}`}>{note.title}</p>
          <div className="flex flex-wrap items-center gap-1.5 mt-1.5">
            {note.quarter && (
              <span className="text-xs bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 px-2 py-0.5 rounded-full font-medium">
                {note.quarter} {note.year}
              </span>
            )}
            {note.sprint && (
              <span className="text-xs bg-blue-50 dark:bg-blue-950 text-blue-600 dark:text-blue-400 px-2 py-0.5 rounded-full font-medium">
                Sprint {note.sprint}
              </span>
            )}
          </div>
        </div>
        <PriorityBadge value={note.priority} />
      </div>

      {/* Content */}
      {note.content && (
        <div className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed prose prose-xs dark:prose-invert max-w-none"
          dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(note.content) }} />
      )}

      {/* Linked BRDs */}
      {linkedBRDs.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {linkedBRDs.map(brd => (
            <button key={brd.id} type="button" onClick={() => onSelectBRD?.(brd.id)}
              className="inline-flex items-center gap-1.5 text-xs text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-950 hover:bg-blue-100 dark:hover:bg-blue-900 px-2.5 py-1.5 rounded-lg transition-colors cursor-pointer">
              <svg className="w-3 h-3 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
              <span className="font-medium">{fmtTitle(brd.title)}</span>
              <svg className="w-2.5 h-2.5 opacity-50" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </button>
          ))}
        </div>
      )}

      {/* Footer */}
      <div className="flex items-center justify-between pt-1 border-t border-slate-100 dark:border-slate-800">
        <StatusPill value={note.status} onChange={(v) => onStatusChange(note.id, v)} />
        <div className="flex items-center gap-1">
          <button onClick={() => onEdit(note)}
            className="p-1.5 rounded-lg text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors">
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
            </svg>
          </button>
          <button onClick={() => onDelete(note.id)}
            className="p-1.5 rounded-lg text-red-400 hover:bg-red-50 dark:hover:bg-red-950 transition-colors">
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
            </svg>
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function PMNotesPage({ notes = [], brds = [], onCreate, onUpdate, onDelete, onRefresh, notify, onSelectBRD }) {
  const [view, setView] = useState('board'); // board | list
  const [showForm, setShowForm] = useState(false);
  const [editingNote, setEditingNote] = useState(null);
  const [confirmDelete, setConfirmDelete] = useState(null);

  // Filters
  const currentYear = new Date().getFullYear();
  const [filterYear,     setFilterYear]     = useState(currentYear);
  const [filterQuarter,  setFilterQuarter]  = useState('');
  const [filterSprint,   setFilterSprint]   = useState('');
  const [filterPriority, setFilterPriority] = useState('');
  const [filterStatus,   setFilterStatus]   = useState('');

  // ── Filtered notes
  const filtered = useMemo(() => notes.filter(n => {
    if (filterYear    && n.year     !== filterYear)    return false;
    if (filterQuarter && n.quarter  !== filterQuarter) return false;
    if (filterSprint  && String(n.sprint) !== filterSprint) return false;
    if (filterPriority && n.priority !== filterPriority) return false;
    if (filterStatus   && n.status   !== filterStatus)   return false;
    return true;
  }), [notes, filterYear, filterQuarter, filterSprint, filterPriority, filterStatus]);

  // Group by quarter+sprint for board view
  const groups = useMemo(() => {
    const map = new Map();
    filtered.forEach(n => {
      const key = n.quarter
        ? (n.sprint ? `${n.quarter} ${n.year} · Sprint ${n.sprint}` : `${n.quarter} ${n.year}`)
        : `${n.year}`;
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(n);
    });
    // Sort keys: Q1 → Q4, then sprint ascending
    return Array.from(map.entries()).sort(([a], [b]) => a.localeCompare(b));
  }, [filtered]);

  // ── Stats
  const stats = useMemo(() => ({
    total:      filtered.length,
    todo:       filtered.filter(n => n.status === 'todo').length,
    inprogress: filtered.filter(n => n.status === 'inprogress').length,
    done:       filtered.filter(n => n.status === 'done').length,
    critical:   filtered.filter(n => n.priority === 'critical').length,
    high:       filtered.filter(n => n.priority === 'high').length,
  }), [filtered]);

  // ── Handlers
  const handleSave = useCallback(async (data) => {
    let result;
    if (editingNote) {
      result = await onUpdate(editingNote.id, data);
    } else {
      result = await onCreate(data);
    }
    if (result?.error) { notify(result.error, 'error'); return; }
    notify(editingNote ? 'Note updated' : 'Note added');
    setShowForm(false);
    setEditingNote(null);
    onRefresh();
  }, [editingNote, onCreate, onUpdate, onRefresh, notify]);

  const handleStatusChange = useCallback(async (id, newStatus) => {
    const note = notes.find(n => n.id === id);
    if (!note) return;
    await onUpdate(id, { ...note, status: newStatus });
    onRefresh();
  }, [notes, onUpdate, onRefresh]);

  const handleDelete = useCallback(async (id) => {
    await onDelete(id);
    notify('Note deleted');
    setConfirmDelete(null);
    onRefresh();
  }, [onDelete, onRefresh, notify]);

  const openEdit = (note) => { setEditingNote(note); setShowForm(true); };
  const openNew  = () => { setEditingNote(null); setShowForm(true); };

  return (
    <div className="space-y-4">

      {/* ── Header ── */}
      <div className="bg-gradient-to-br from-slate-900 to-slate-800 dark:from-slate-950 dark:to-slate-900 rounded-2xl p-5 text-white border border-slate-700">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-4">
            {/* Avatar */}
            <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center flex-shrink-0 shadow-lg text-xl font-black">
              EP
            </div>
            <div>
              <p className="text-xs text-slate-400 font-medium tracking-wide uppercase">Project Management Head · DPM</p>
              <h2 className="text-xl font-bold mt-0.5">Eric Pangilinan</h2>
              <p className="text-xs text-slate-400 mt-0.5">Priority notes &amp; sprint planning board</p>
            </div>
          </div>

          {/* Stat pills */}
          <div className="flex flex-wrap gap-2">
            <div className="bg-white/10 rounded-xl px-3 py-2 text-center min-w-[56px]">
              <p className="text-lg font-bold">{stats.total}</p>
              <p className="text-xs text-slate-400">Total</p>
            </div>
            <div className="bg-white/10 rounded-xl px-3 py-2 text-center min-w-[56px]">
              <p className="text-lg font-bold text-amber-400">{stats.todo}</p>
              <p className="text-xs text-slate-400">To Do</p>
            </div>
            <div className="bg-white/10 rounded-xl px-3 py-2 text-center min-w-[56px]">
              <p className="text-lg font-bold text-blue-400">{stats.inprogress}</p>
              <p className="text-xs text-slate-400">Active</p>
            </div>
            <div className="bg-white/10 rounded-xl px-3 py-2 text-center min-w-[56px]">
              <p className="text-lg font-bold text-emerald-400">{stats.done}</p>
              <p className="text-xs text-slate-400">Done</p>
            </div>
            {stats.critical > 0 && (
              <div className="bg-red-500/20 rounded-xl px-3 py-2 text-center min-w-[56px]">
                <p className="text-lg font-bold text-red-400">{stats.critical}</p>
                <p className="text-xs text-slate-400">Critical</p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── Controls bar ── */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-4">
        <div className="flex items-center justify-between mb-3 gap-3 flex-wrap">
          {/* View toggles */}
          <div className="flex items-center gap-1 bg-slate-100 dark:bg-slate-800 rounded-xl p-1">
            <button onClick={() => setView('board')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${view === 'board' ? 'bg-white dark:bg-slate-700 text-blue-600 dark:text-blue-400 shadow-sm' : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'}`}>
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 5a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1H5a1 1 0 01-1-1V5zM14 5a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1h-4a1 1 0 01-1-1V5zM4 15a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1H5a1 1 0 01-1-1v-4zM14 15a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1h-4a1 1 0 01-1-1v-4z" />
              </svg>
              Board
            </button>
            <button onClick={() => setView('list')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${view === 'list' ? 'bg-white dark:bg-slate-700 text-blue-600 dark:text-blue-400 shadow-sm' : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'}`}>
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
              </svg>
              List
            </button>
          </div>

          <button onClick={openNew}
            className="flex items-center gap-1.5 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold rounded-xl transition-colors">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            Add Note
          </button>
        </div>

        {/* Filters */}
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
          <select value={filterYear} onChange={e => setFilterYear(Number(e.target.value))}
            className="px-2 py-1.5 text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500">
            {YEARS.map(y => <option key={y} value={y}>{y}</option>)}
          </select>
          <select value={filterQuarter} onChange={e => setFilterQuarter(e.target.value)}
            className="px-2 py-1.5 text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500">
            <option value="">All Quarters</option>
            {QUARTERS.map(q => <option key={q} value={q}>{q}</option>)}
          </select>
          <select value={filterSprint} onChange={e => setFilterSprint(e.target.value)}
            className="px-2 py-1.5 text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500">
            <option value="">All Sprints</option>
            {Array.from({ length: 26 }, (_, i) => i + 1).map(n => (
              <option key={n} value={String(n)}>Sprint {n}</option>
            ))}
          </select>
          <select value={filterPriority} onChange={e => setFilterPriority(e.target.value)}
            className="px-2 py-1.5 text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500">
            <option value="">All Priorities</option>
            {PRIORITY.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
          </select>
          <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)}
            className="px-2 py-1.5 text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500">
            <option value="">All Status</option>
            {STATUS.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
          </select>
        </div>
      </div>

      {/* ── Add / Edit Modal ── */}
      {showForm && (
        <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/50 backdrop-blur-sm overflow-y-auto pt-10 pb-10">
          <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-6 w-full max-w-lg mx-4 shadow-2xl">
            <div className="flex items-center justify-between mb-5">
              <h3 className="font-bold text-slate-900 dark:text-white">
                {editingNote ? 'Edit Note' : 'New Priority Note'}
              </h3>
              <button onClick={() => { setShowForm(false); setEditingNote(null); }}
                className="p-1.5 rounded-lg text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <NoteForm initial={editingNote || {}} brds={brds} onSave={handleSave}
              onCancel={() => { setShowForm(false); setEditingNote(null); }} />
          </div>
        </div>
      )}

      {/* ── Delete Confirm ── */}
      {confirmDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
          <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-6 max-w-sm w-full mx-4 shadow-2xl">
            <p className="font-bold text-slate-900 dark:text-white mb-2">Delete this note?</p>
            <p className="text-sm text-slate-500 dark:text-slate-400 mb-4">This action cannot be undone.</p>
            <div className="flex gap-2">
              <button onClick={() => setConfirmDelete(null)}
                className="flex-1 py-2 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-xl text-sm font-medium transition-colors">
                Cancel
              </button>
              <button onClick={() => handleDelete(confirmDelete)}
                className="flex-1 py-2 bg-red-600 hover:bg-red-700 text-white rounded-xl text-sm font-semibold transition-colors">
                Delete
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── BOARD VIEW ── grouped by Quarter/Sprint ── */}
      {view === 'board' && (
        <div className="space-y-6">
          {filtered.length === 0 ? (
            <div className="bg-white dark:bg-slate-900 rounded-2xl border border-dashed border-slate-300 dark:border-slate-700 py-16 text-center">
              <div className="w-12 h-12 bg-slate-100 dark:bg-slate-800 rounded-2xl flex items-center justify-center mx-auto mb-3">
                <svg className="w-6 h-6 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                </svg>
              </div>
              <p className="text-slate-500 dark:text-slate-400 font-medium">No notes found</p>
              <p className="text-xs text-slate-400 mt-1">Add a note to get started</p>
              <button onClick={openNew}
                className="mt-4 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold rounded-xl transition-colors">
                Add Note
              </button>
            </div>
          ) : (
            groups.map(([groupKey, groupNotes]) => {
              const doneCount = groupNotes.filter(n => n.status === 'done').length;
              return (
                <div key={groupKey}>
                  {/* Group header */}
                  <div className="flex items-center gap-3 mb-3">
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-slate-900 dark:text-white text-sm">{groupKey}</span>
                      <span className="text-xs bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 px-2 py-0.5 rounded-full">
                        {groupNotes.length} note{groupNotes.length !== 1 ? 's' : ''}
                      </span>
                      {doneCount > 0 && (
                        <span className="text-xs bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300 px-2 py-0.5 rounded-full">
                          {doneCount} done
                        </span>
                      )}
                    </div>
                    <div className="flex-1 h-px bg-slate-200 dark:bg-slate-800" />
                    {/* Progress bar */}
                    <span className="text-xs text-slate-400">{Math.round((doneCount / groupNotes.length) * 100)}%</span>
                  </div>
                  {/* Progress bar */}
                  <div className="h-1 bg-slate-100 dark:bg-slate-800 rounded-full mb-3 overflow-hidden">
                    <div className="h-full bg-emerald-500 rounded-full transition-all"
                      style={{ width: `${(doneCount / groupNotes.length) * 100}%` }} />
                  </div>
                  {/* Cards grid */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                    {groupNotes
                      .sort((a, b) => {
                        const po = { critical: 0, high: 1, medium: 2, low: 3 };
                        return (po[a.priority] ?? 2) - (po[b.priority] ?? 2);
                      })
                      .map(note => (
                        <NoteCard key={note.id} note={note} brds={brds}
                          onEdit={openEdit}
                          onDelete={(id) => setConfirmDelete(id)}
                          onStatusChange={handleStatusChange}
                          onSelectBRD={onSelectBRD} />
                      ))}
                  </div>
                </div>
              );
            })
          )}
        </div>
      )}

      {/* ── LIST VIEW ── */}
      {view === 'list' && (
        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700">
              <tr>
                {['Priority', 'Title', 'Quarter', 'Sprint', 'Status', 'Linked BRD', ''].map(h => (
                  <th key={h} className="px-4 py-2.5 text-left text-xs font-semibold text-slate-600 dark:text-slate-400 uppercase tracking-wide">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {filtered.length === 0 ? (
                <tr><td colSpan={7} className="px-4 py-10 text-center text-slate-400">No notes found</td></tr>
              ) : (
                filtered
                  .sort((a, b) => {
                    const po = { critical: 0, high: 1, medium: 2, low: 3 };
                    return (po[a.priority] ?? 2) - (po[b.priority] ?? 2);
                  })
                  .map(note => {
                    const linkedBRDs = brds.filter(b => parseBrdIds(note.brdId).includes(b.id));
                    return (
                      <tr key={note.id} className={`hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors ${note.status === 'done' ? 'opacity-60' : ''}`}>
                        <td className="px-4 py-2.5"><PriorityBadge value={note.priority} /></td>
                        <td className="px-4 py-2.5 font-medium text-slate-900 dark:text-white max-w-xs">
                          <span className={note.status === 'done' ? 'line-through' : ''}>{note.title}</span>
                          {note.content && <p className="text-xs text-slate-400 truncate mt-0.5">{stripHtml(note.content)}</p>}
                        </td>
                        <td className="px-4 py-2.5 text-slate-500 dark:text-slate-400 text-xs">
                          {note.quarter ? `${note.quarter} ${note.year}` : `${note.year}`}
                        </td>
                        <td className="px-4 py-2.5 text-slate-500 dark:text-slate-400 text-xs">
                          {note.sprint ? `Sprint ${note.sprint}` : '—'}
                        </td>
                        <td className="px-4 py-2.5">
                          <StatusPill value={note.status} onChange={(v) => handleStatusChange(note.id, v)} />
                        </td>
                        <td className="px-4 py-2.5 text-xs max-w-[160px]">
                          {linkedBRDs.length > 0 ? (
                            <div className="flex flex-wrap gap-1">
                              {linkedBRDs.map(b => (
                                <button key={b.id} type="button" onClick={() => onSelectBRD?.(b.id)}
                                  className="text-blue-600 dark:text-blue-400 hover:underline hover:text-blue-800 dark:hover:text-blue-200 transition-colors text-left">
                                  {fmtTitle(b.title)}
                                </button>
                              ))}
                            </div>
                          ) : '—'}
                        </td>
                        <td className="px-4 py-2.5">
                          <div className="flex items-center gap-1">
                            <button onClick={() => openEdit(note)}
                              className="p-1.5 rounded-lg text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors">
                              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                              </svg>
                            </button>
                            <button onClick={() => setConfirmDelete(note.id)}
                              className="p-1.5 rounded-lg text-red-400 hover:bg-red-50 dark:hover:bg-red-950 transition-colors">
                              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                              </svg>
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
