import { useState } from 'react';

const RISK_OPTIONS = ['Very Low', 'Low', 'Medium', 'Moderate', 'High', 'Very High'];

const labelClass = 'block text-xs font-semibold text-slate-600 dark:text-slate-400 uppercase tracking-wide mb-1.5';
const inputClass = 'w-full px-3 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 placeholder-slate-400 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 transition-colors';

// Build readable days label from minDays / maxDays
const daysLabel = (minDays, maxDays) => {
  if (minDays == null && maxDays == null) return '—';
  if (minDays == null) return `< ${maxDays} days`;
  if (maxDays == null) return `${minDays}+ days`;
  return `${minDays}–${maxDays} days`;
};

export default function TShirtSizeSettings({ tshirtSizes, onRefresh, onCreate, onUpdate, onDelete, notify }) {
  const [showAdd, setShowAdd] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [confirmDelete, setConfirmDelete] = useState(null);
  const [addForm, setAddForm] = useState({ value: '', label: '', minDays: '', maxDays: '', description: '', risk: 'Medium', color: '#3b82f6' });
  const [editForm, setEditForm] = useState({});

  const handleAdd = async (e) => {
    e.preventDefault();
    const { value, label, minDays, maxDays, description, risk, color } = addForm;
    if (!value.trim() || !label.trim()) { notify('Value and label are required', 'error'); return; }
    if (tshirtSizes.some(s => s.value === value.trim().toUpperCase())) { notify('A size with this value already exists', 'error'); return; }
    const sortOrder = tshirtSizes.length;
    const result = await onCreate({
      value: value.trim().toUpperCase(),
      label: label.trim(),
      minDays: minDays !== '' ? Number(minDays) : null,
      maxDays: maxDays !== '' ? Number(maxDays) : null,
      description,
      risk,
      color,
      sortOrder,
    });
    if (result?.error) { notify(result.error, 'error'); return; }
    notify('Size added');
    setShowAdd(false);
    setAddForm({ value: '', label: '', minDays: '', maxDays: '', description: '', risk: 'Medium', color: '#3b82f6' });
    onRefresh();
  };

  const handleEdit = async (e) => {
    e.preventDefault();
    const result = await onUpdate(editingId, {
      ...editForm,
      minDays: editForm.minDays !== '' ? Number(editForm.minDays) : null,
      maxDays: editForm.maxDays !== '' ? Number(editForm.maxDays) : null,
    });
    if (result?.error) { notify(result.error, 'error'); return; }
    notify('Size updated');
    setEditingId(null);
    onRefresh();
  };

  const handleDelete = async (item) => {
    const result = await onDelete(item.id);
    if (result?.brdCount > 0) { setConfirmDelete({ item, brdCount: result.brdCount }); return; }
    if (result?.error) { notify(result.error, 'error'); return; }
    notify('Size deleted');
    onRefresh();
  };

  const handleMoveUp = async (index) => {
    if (index === 0) return;
    const above = tshirtSizes[index - 1];
    const current = tshirtSizes[index];
    await Promise.all([
      onUpdate(current.id, { ...current, minDays: current.minDays ?? null, maxDays: current.maxDays ?? null, sortOrder: above.sortOrder }),
      onUpdate(above.id,   { ...above,   minDays: above.minDays ?? null,   maxDays: above.maxDays ?? null,   sortOrder: current.sortOrder }),
    ]);
    onRefresh();
  };

  const handleMoveDown = async (index) => {
    if (index === tshirtSizes.length - 1) return;
    const below = tshirtSizes[index + 1];
    const current = tshirtSizes[index];
    await Promise.all([
      onUpdate(current.id, { ...current, minDays: current.minDays ?? null, maxDays: current.maxDays ?? null, sortOrder: below.sortOrder }),
      onUpdate(below.id,   { ...below,   minDays: below.minDays ?? null,   maxDays: below.maxDays ?? null,   sortOrder: current.sortOrder }),
    ]);
    onRefresh();
  };

  return (
    <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 dark:border-slate-800">
        <div>
          <h3 className="font-semibold text-slate-900 dark:text-white">T-Shirt Sizes</h3>
          <p className="text-xs text-slate-400 mt-0.5">Edit size labels, day ranges, risk, and colors</p>
        </div>
        <button onClick={() => setShowAdd(v => !v)}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold rounded-lg transition-colors">
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          Add Size
        </button>
      </div>

      {/* Add form */}
      {showAdd && (
        <form onSubmit={handleAdd} className="px-5 py-4 border-b border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50">
          <p className="text-xs font-bold text-slate-700 dark:text-slate-300 mb-3 uppercase tracking-wide">New T-Shirt Size</p>
          <div className="grid grid-cols-2 gap-3 mb-3">
            <div>
              <label className={labelClass}>Value (e.g. XS, S, M)</label>
              <input value={addForm.value} onChange={e => setAddForm(f => ({ ...f, value: e.target.value }))}
                placeholder="XS" className={inputClass} required />
            </div>
            <div>
              <label className={labelClass}>Display Label</label>
              <input value={addForm.label} onChange={e => setAddForm(f => ({ ...f, label: e.target.value }))}
                placeholder="Extra Small" className={inputClass} required />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3 mb-3">
            <div>
              <label className={labelClass}>Min Days (blank = no min)</label>
              <input type="number" min="0" value={addForm.minDays} onChange={e => setAddForm(f => ({ ...f, minDays: e.target.value }))}
                placeholder="e.g. 20" className={inputClass} />
            </div>
            <div>
              <label className={labelClass}>Max Days (blank = no max)</label>
              <input type="number" min="0" value={addForm.maxDays} onChange={e => setAddForm(f => ({ ...f, maxDays: e.target.value }))}
                placeholder="e.g. 40" className={inputClass} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3 mb-3">
            <div>
              <label className={labelClass}>Risk Level</label>
              <select value={addForm.risk} onChange={e => setAddForm(f => ({ ...f, risk: e.target.value }))} className={inputClass}>
                {RISK_OPTIONS.map(r => <option key={r} value={r}>{r}</option>)}
              </select>
            </div>
            <div>
              <label className={labelClass}>Color</label>
              <div className="flex gap-2 items-center">
                <input type="color" value={addForm.color} onChange={e => setAddForm(f => ({ ...f, color: e.target.value }))}
                  className="w-10 h-10 rounded-lg border border-slate-200 dark:border-slate-700 cursor-pointer p-1" />
                <input value={addForm.color} onChange={e => setAddForm(f => ({ ...f, color: e.target.value }))}
                  placeholder="#3b82f6" className={`${inputClass} flex-1`} />
              </div>
            </div>
          </div>
          <div className="mb-3">
            <label className={labelClass}>Description</label>
            <textarea value={addForm.description} onChange={e => setAddForm(f => ({ ...f, description: e.target.value }))}
              rows={2} placeholder="Describe this size..." className={`${inputClass} resize-none`} />
          </div>
          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => setShowAdd(false)} className="px-3 py-1.5 text-xs font-medium text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg transition-colors">Cancel</button>
            <button type="submit" className="px-3 py-1.5 text-xs font-semibold bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors">Add</button>
          </div>
        </form>
      )}

      {/* Size list */}
      <div className="divide-y divide-slate-100 dark:divide-slate-800">
        {tshirtSizes.length === 0 && (
          <div className="px-5 py-8 text-center text-slate-400 text-sm">No sizes defined</div>
        )}
        {tshirtSizes.map((size, index) => (
          <div key={size.id}>
            {editingId === size.id ? (
              /* Edit form */
              <form onSubmit={handleEdit} className="px-5 py-4 bg-blue-50 dark:bg-blue-950/30">
                <p className="text-xs font-bold text-slate-700 dark:text-slate-300 mb-3 uppercase tracking-wide">Editing — {size.value}</p>
                <div className="grid grid-cols-2 gap-3 mb-3">
                  <div>
                    <label className={labelClass}>Min Days (blank = no min)</label>
                    <input type="number" min="0" value={editForm.minDays ?? ''} onChange={e => setEditForm(f => ({ ...f, minDays: e.target.value }))}
                      placeholder="no min" className={inputClass} />
                  </div>
                  <div>
                    <label className={labelClass}>Max Days (blank = no max)</label>
                    <input type="number" min="0" value={editForm.maxDays ?? ''} onChange={e => setEditForm(f => ({ ...f, maxDays: e.target.value }))}
                      placeholder="no max" className={inputClass} />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3 mb-3">
                  <div>
                    <label className={labelClass}>Risk Level</label>
                    <select value={editForm.risk || ''} onChange={e => setEditForm(f => ({ ...f, risk: e.target.value }))} className={inputClass}>
                      {RISK_OPTIONS.map(r => <option key={r} value={r}>{r}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className={labelClass}>Color</label>
                    <div className="flex gap-2 items-center">
                      <input type="color" value={editForm.color || '#3b82f6'} onChange={e => setEditForm(f => ({ ...f, color: e.target.value }))}
                        className="w-10 h-10 rounded-lg border border-slate-200 dark:border-slate-700 cursor-pointer p-1" />
                      <input value={editForm.color || ''} onChange={e => setEditForm(f => ({ ...f, color: e.target.value }))}
                        className={`${inputClass} flex-1`} />
                    </div>
                  </div>
                </div>
                <div className="mb-3">
                  <label className={labelClass}>Description</label>
                  <textarea value={editForm.description || ''} onChange={e => setEditForm(f => ({ ...f, description: e.target.value }))}
                    rows={2} className={`${inputClass} resize-none`} />
                </div>
                <div className="flex justify-end gap-2">
                  <button type="button" onClick={() => setEditingId(null)} className="px-3 py-1.5 text-xs font-medium text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg transition-colors">Cancel</button>
                  <button type="submit" className="px-3 py-1.5 text-xs font-semibold bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors">Save</button>
                </div>
              </form>
            ) : (
              /* Row */
              <div className="flex items-center gap-4 px-5 py-3.5">
                {/* Color swatch + label */}
                <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 font-black text-sm text-white"
                  style={{ backgroundColor: size.color || '#3b82f6' }}>
                  {size.value}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-semibold text-sm text-slate-900 dark:text-white">{size.label || size.value}</span>
                    <span className="text-xs text-slate-500 dark:text-slate-400 bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded-full font-medium">
                      {daysLabel(size.minDays, size.maxDays)}
                    </span>
                    {size.risk && (
                      <span className="text-xs font-medium px-2 py-0.5 rounded-full" style={{ backgroundColor: `${size.color}22`, color: size.color }}>
                        {size.risk} Risk
                      </span>
                    )}
                  </div>
                  {size.description && <p className="text-xs text-slate-400 mt-0.5 truncate">{size.description}</p>}
                </div>

                {/* Actions */}
                <div className="flex items-center gap-1 flex-shrink-0">
                  {/* Reorder */}
                  <button onClick={() => handleMoveUp(index)} disabled={index === 0}
                    className="p-1.5 rounded-lg text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-30 transition-colors">
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" /></svg>
                  </button>
                  <button onClick={() => handleMoveDown(index)} disabled={index === tshirtSizes.length - 1}
                    className="p-1.5 rounded-lg text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-30 transition-colors">
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
                  </button>
                  {/* Edit */}
                  <button onClick={() => { setEditingId(size.id); setEditForm({ label: size.label, minDays: size.minDays ?? '', maxDays: size.maxDays ?? '', description: size.description || '', risk: size.risk || 'Medium', color: size.color || '#3b82f6', sortOrder: size.sortOrder }); }}
                    className="p-1.5 rounded-lg text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors ml-1">
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>
                  </button>
                  {/* Delete */}
                  <button onClick={() => handleDelete(size)}
                    className="p-1.5 rounded-lg text-red-400 hover:bg-red-50 dark:hover:bg-red-950 transition-colors">
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                  </button>
                </div>
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Delete blocked modal */}
      {confirmDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
          <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-6 max-w-sm w-full mx-4 shadow-2xl">
            <div className="w-10 h-10 bg-red-100 dark:bg-red-950 rounded-xl flex items-center justify-center mb-3">
              <svg className="w-5 h-5 text-red-600 dark:text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg>
            </div>
            <h4 className="font-bold text-slate-900 dark:text-white mb-1">Cannot Delete Size</h4>
            <p className="text-sm text-slate-600 dark:text-slate-400 mb-4">
              <strong>{confirmDelete.item.value}</strong> is used by {confirmDelete.brdCount} BRD{confirmDelete.brdCount > 1 ? 's' : ''}.
              Update those BRDs first before deleting this size.
            </p>
            <button onClick={() => setConfirmDelete(null)} className="w-full py-2 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-900 dark:text-white rounded-xl text-sm font-medium transition-colors">
              OK
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
