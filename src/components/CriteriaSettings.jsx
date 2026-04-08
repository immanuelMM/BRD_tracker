import { useState } from 'react';

const labelClass = 'block text-xs font-semibold text-slate-600 dark:text-slate-400 uppercase tracking-wide mb-1.5';
const inputClass = 'w-full px-3 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 placeholder-slate-400 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 transition-colors';

const slugify = (label) =>
  label.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/(^_|_$)/g, '');

export default function CriteriaSettings({ criteria, onRefresh, onCreate, onUpdate, onDelete, notify }) {
  const [showAdd, setShowAdd] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [confirmDelete, setConfirmDelete] = useState(null);
  const [addForm, setAddForm] = useState({ label: '', color: '#3b82f6', description: '' });
  const [editForm, setEditForm] = useState({});

  const handleAdd = async (e) => {
    e.preventDefault();
    const value = slugify(addForm.label);
    if (!value) {
      notify('Label cannot be empty', 'error');
      return;
    }
    if (criteria.some((c) => c.value === value)) {
      notify('A criterion with this name already exists', 'error');
      return;
    }
    const sortOrder = criteria.length;
    const result = await onCreate({ ...addForm, value, sortOrder });
    if (result?.error) { notify(result.error, 'error'); return; }
    notify('Criterion added');
    setShowAdd(false);
    setAddForm({ label: '', color: '#3b82f6', description: '' });
    onRefresh();
  };

  const handleEdit = async (e) => {
    e.preventDefault();
    const result = await onUpdate(editingId, editForm);
    if (result?.error) { notify(result.error, 'error'); return; }
    notify('Criterion updated');
    setEditingId(null);
    onRefresh();
  };

  const handleDelete = async (item) => {
    const result = await onDelete(item.id);
    if (result?.bugCount > 0) {
      setConfirmDelete({ item, bugCount: result.bugCount });
      return;
    }
    if (result?.error) { notify(result.error, 'error'); return; }
    notify('Criterion deleted');
    onRefresh();
  };

  const handleMoveUp = async (index) => {
    if (index === 0) return;
    const above = criteria[index - 1];
    const current = criteria[index];
    await Promise.all([
      onUpdate(above.id,   { ...above,   sortOrder: index     }),
      onUpdate(current.id, { ...current, sortOrder: index - 1 }),
    ]);
    onRefresh();
  };

  const handleMoveDown = async (index) => {
    if (index === criteria.length - 1) return;
    const below = criteria[index + 1];
    const current = criteria[index];
    await Promise.all([
      onUpdate(below.id,   { ...below,   sortOrder: index     }),
      onUpdate(current.id, { ...current, sortOrder: index + 1 }),
    ]);
    onRefresh();
  };

  return (
    <div className="max-w-2xl space-y-6">
      {/* Header */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 px-5 py-4 flex items-center justify-between">
        <div>
          <h2 className="font-semibold text-slate-900 dark:text-white">Bug Criteria</h2>
          <p className="text-xs text-slate-400 mt-0.5">Manage the root-cause categories used when logging bugs</p>
        </div>
        <button onClick={() => setShowAdd(true)}
          className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-3.5 py-2 rounded-xl text-sm font-medium transition-colors shadow-sm">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
          Add Criterion
        </button>
      </div>

      {/* Add Form */}
      {showAdd && (
        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-blue-200 dark:border-blue-800 p-5">
          <h3 className="font-semibold text-slate-900 dark:text-white mb-4">New Criterion</h3>
          <form onSubmit={handleAdd} className="space-y-4">
            <div>
              <label className={labelClass}>Label *</label>
              <input
                type="text"
                value={addForm.label}
                onChange={(e) => setAddForm({ ...addForm, label: e.target.value })}
                placeholder="e.g. Database Issue"
                className={inputClass}
                autoFocus
              />
            </div>

            <div>
              <label className={labelClass}>System Value (Auto-generated)</label>
              <input
                type="text"
                value={slugify(addForm.label)}
                disabled
                className={`${inputClass} bg-slate-50 dark:bg-slate-800 text-slate-500 dark:text-slate-400 cursor-not-allowed`}
              />
              <p className="text-xs text-slate-400 mt-1">This will be stored in the database</p>
            </div>

            <div>
              <label className={labelClass}>Color</label>
              <div className="flex gap-2 items-end">
                <input
                  type="color"
                  value={addForm.color}
                  onChange={(e) => setAddForm({ ...addForm, color: e.target.value })}
                  className="w-12 h-10 rounded-lg border border-slate-200 dark:border-slate-700 cursor-pointer"
                />
                <input
                  type="text"
                  value={addForm.color}
                  onChange={(e) => setAddForm({ ...addForm, color: e.target.value })}
                  placeholder="#3b82f6"
                  className={`${inputClass} flex-1`}
                />
              </div>
            </div>

            <div>
              <label className={labelClass}>Description</label>
              <textarea
                value={addForm.description}
                onChange={(e) => setAddForm({ ...addForm, description: e.target.value })}
                rows={2}
                placeholder="When would this criterion be used?"
                className={`${inputClass} resize-none`}
              />
            </div>

            <div className="flex gap-3 pt-2">
              <button type="submit" className="flex-1 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2.5 rounded-xl text-sm font-medium transition-colors">
                Create
              </button>
              <button type="button" onClick={() => setShowAdd(false)} className="px-4 py-2.5 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 rounded-xl text-sm font-medium transition-colors">
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Criteria List */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 divide-y divide-slate-100 dark:divide-slate-800">
        {criteria.map((item, index) => (
          <div key={item.id} className="px-5 py-4">
            {editingId === item.id ? (
              /* Inline Edit Form */
              <form onSubmit={handleEdit} className="space-y-3">
                <div>
                  <label className={labelClass}>Label</label>
                  <input
                    type="text"
                    value={editForm.label || ''}
                    onChange={(e) => setEditForm({ ...editForm, label: e.target.value })}
                    className={inputClass}
                  />
                </div>

                <div>
                  <label className={labelClass}>System Value</label>
                  <input
                    type="text"
                    value={item.value}
                    disabled
                    className={`${inputClass} bg-slate-50 dark:bg-slate-800 text-slate-500 dark:text-slate-400 cursor-not-allowed`}
                  />
                  <p className="text-xs text-slate-400 mt-1">Cannot be changed (stored in bugs)</p>
                </div>

                <div>
                  <label className={labelClass}>Color</label>
                  <div className="flex gap-2 items-end">
                    <input
                      type="color"
                      value={editForm.color || item.color}
                      onChange={(e) => setEditForm({ ...editForm, color: e.target.value })}
                      className="w-12 h-10 rounded-lg border border-slate-200 dark:border-slate-700 cursor-pointer"
                    />
                    <input
                      type="text"
                      value={editForm.color || item.color}
                      onChange={(e) => setEditForm({ ...editForm, color: e.target.value })}
                      className={`${inputClass} flex-1`}
                    />
                  </div>
                </div>

                <div>
                  <label className={labelClass}>Description</label>
                  <textarea
                    value={editForm.description !== undefined ? editForm.description : (item.description || '')}
                    onChange={(e) => setEditForm({ ...editForm, description: e.target.value })}
                    rows={2}
                    className={`${inputClass} resize-none`}
                  />
                </div>

                <div className="flex gap-2 pt-2">
                  <button type="submit" className="flex-1 bg-blue-600 hover:bg-blue-700 text-white px-3 py-2 rounded-xl text-sm font-medium transition-colors">
                    Save
                  </button>
                  <button type="button" onClick={() => setEditingId(null)} className="px-3 py-2 bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 rounded-xl text-sm font-medium transition-colors">
                    Cancel
                  </button>
                </div>
              </form>
            ) : (
              /* Read View */
              <div className="flex items-center gap-4">
                <div className="w-5 h-5 rounded-lg flex-shrink-0" style={{ backgroundColor: item.color }} />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-slate-900 dark:text-white">{item.label}</p>
                  <p className="text-xs text-slate-500 dark:text-slate-400 font-mono mt-0.5">{item.value}</p>
                  {item.description && <p className="text-xs text-slate-600 dark:text-slate-400 mt-1.5">{item.description}</p>}
                </div>
                <div className="flex items-center gap-1 flex-shrink-0">
                  <button
                    onClick={() => handleMoveUp(index)}
                    disabled={index === 0}
                    title="Move up"
                    className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" /></svg>
                  </button>
                  <button
                    onClick={() => handleMoveDown(index)}
                    disabled={index === criteria.length - 1}
                    title="Move down"
                    className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
                  </button>
                  <button
                    onClick={() => { setEditingId(item.id); setEditForm({ label: item.label, color: item.color, description: item.description || '' }); }}
                    className="p-1.5 rounded-lg text-slate-400 hover:text-blue-600 dark:hover:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-950 transition-colors"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>
                  </button>
                  <button
                    onClick={() => handleDelete(item)}
                    className="p-1.5 rounded-lg text-slate-400 hover:text-red-600 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-950 transition-colors"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                  </button>
                </div>
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Delete Blocked Modal */}
      {confirmDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-white dark:bg-slate-900 rounded-2xl p-6 max-w-sm w-full mx-4 shadow-2xl border border-slate-200 dark:border-slate-800">
            <h3 className="font-semibold text-slate-900 dark:text-white mb-2">Cannot Delete</h3>
            <p className="text-sm text-slate-600 dark:text-slate-400 mb-4">
              <span className="font-semibold">{confirmDelete.item.label}</span> is used by <span className="font-bold text-red-500">{confirmDelete.bugCount}</span> {confirmDelete.bugCount === 1 ? 'bug' : 'bugs'}. Reassign or delete those bugs first.
            </p>
            <button
              onClick={() => setConfirmDelete(null)}
              className="w-full bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 py-2.5 rounded-xl text-sm font-medium transition-colors"
            >
              Close
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
