import { useState } from 'react';

const labelClass = 'block text-xs font-semibold text-slate-600 dark:text-slate-400 uppercase tracking-wide mb-1.5';
const inputClass = 'w-full px-3 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 placeholder-slate-400 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 transition-colors';

export default function TeamLeadSettings({ teamLeads, onRefresh, onCreate, onUpdate, onDelete, notify }) {
  const [showAdd, setShowAdd] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [confirmDelete, setConfirmDelete] = useState(null);
  const [addForm, setAddForm] = useState({ name: '' });
  const [editForm, setEditForm] = useState({});

  const handleAdd = async (e) => {
    e.preventDefault();
    if (!addForm.name.trim()) {
      notify('Name cannot be empty', 'error');
      return;
    }
    const sortOrder = teamLeads.length;
    const result = await onCreate({ name: addForm.name, sortOrder });
    if (result?.error) { notify(result.error, 'error'); return; }
    notify('Tech lead added');
    setShowAdd(false);
    setAddForm({ name: '' });
    onRefresh();
  };

  const handleEdit = async (e) => {
    e.preventDefault();
    const result = await onUpdate(editingId, editForm);
    if (result?.error) { notify(result.error, 'error'); return; }
    notify('Tech lead updated');
    setEditingId(null);
    onRefresh();
  };

  const handleDelete = async (item) => {
    const result = await onDelete(item.id);
    if (result?.brdCount > 0) {
      setConfirmDelete({ item, brdCount: result.brdCount });
      return;
    }
    if (result?.error) { notify(result.error, 'error'); return; }
    notify('Tech lead deleted');
    onRefresh();
  };

  const handleMoveUp = async (index) => {
    if (index === 0) return;
    const above = teamLeads[index - 1];
    const current = teamLeads[index];
    await Promise.all([
      onUpdate(above.id,   { ...above,   sortOrder: index     }),
      onUpdate(current.id, { ...current, sortOrder: index - 1 }),
    ]);
    onRefresh();
  };

  const handleMoveDown = async (index) => {
    if (index === teamLeads.length - 1) return;
    const below = teamLeads[index + 1];
    const current = teamLeads[index];
    await Promise.all([
      onUpdate(below.id,   { ...below,   sortOrder: index     }),
      onUpdate(current.id, { ...current, sortOrder: index + 1 }),
    ]);
    onRefresh();
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 px-5 py-4 flex items-center justify-between">
        <div>
          <h2 className="font-semibold text-slate-900 dark:text-white">Tech Leads</h2>
          <p className="text-xs text-slate-400 mt-0.5">Manage available team leads for BRD assignments</p>
        </div>
        <button onClick={() => setShowAdd(true)}
          className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-3.5 py-2 rounded-xl text-sm font-medium transition-colors shadow-sm">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
          Add Tech Lead
        </button>
      </div>

      {/* Add Form */}
      {showAdd && (
        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-blue-200 dark:border-blue-800 p-5">
          <h3 className="font-semibold text-slate-900 dark:text-white mb-4">New Tech Lead</h3>
          <form onSubmit={handleAdd} className="space-y-4">
            <div>
              <label className={labelClass}>Name *</label>
              <input
                type="text"
                value={addForm.name}
                onChange={(e) => setAddForm({ name: e.target.value })}
                placeholder="e.g. Sarah Johnson"
                className={inputClass}
                autoFocus
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

      {/* Team Leads List */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 divide-y divide-slate-100 dark:divide-slate-800">
        {teamLeads.length === 0 ? (
          <div className="px-5 py-8 text-center text-sm text-slate-500 dark:text-slate-400">
            No tech leads yet. Add one to get started.
          </div>
        ) : (
          teamLeads.map((item, index) => (
            <div key={item.id} className="px-5 py-4">
              {editingId === item.id ? (
                /* Inline Edit Form */
                <form onSubmit={handleEdit} className="space-y-3">
                  <div>
                    <label className={labelClass}>Name</label>
                    <input
                      type="text"
                      value={editForm.name || ''}
                      onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                      className={inputClass}
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
                  <div className="w-10 h-10 rounded-full bg-blue-100 dark:bg-blue-900 flex items-center justify-center flex-shrink-0">
                    <span className="text-sm font-bold text-blue-600 dark:text-blue-300">{item.name.charAt(0).toUpperCase()}</span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-slate-900 dark:text-white">{item.name}</p>
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
                      disabled={index === teamLeads.length - 1}
                      title="Move down"
                      className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
                    </button>
                    <button
                      onClick={() => { setEditingId(item.id); setEditForm({ name: item.name }); }}
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
          ))
        )}
      </div>

      {/* Delete Blocked Modal */}
      {confirmDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-white dark:bg-slate-900 rounded-2xl p-6 max-w-sm w-full mx-4 shadow-2xl border border-slate-200 dark:border-slate-800">
            <h3 className="font-semibold text-slate-900 dark:text-white mb-2">Cannot Delete</h3>
            <p className="text-sm text-slate-600 dark:text-slate-400 mb-4">
              <span className="font-semibold">{confirmDelete.item.name}</span> is assigned to <span className="font-bold text-red-500">{confirmDelete.brdCount}</span> {confirmDelete.brdCount === 1 ? 'BRD' : 'BRDs'}. Change the assignments first.
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
