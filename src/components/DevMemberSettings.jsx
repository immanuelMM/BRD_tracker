import { useState } from 'react';

const labelClass = 'block text-xs font-semibold text-slate-600 dark:text-slate-400 uppercase tracking-wide mb-1.5';
const inputClass = 'w-full px-3 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 placeholder-slate-400 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 transition-colors';
const selectClass = inputClass;

const TEAM_COLORS = {
  FE:  'bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-300',
  BE:  'bg-emerald-100 dark:bg-emerald-900 text-emerald-700 dark:text-emerald-300',
  RND: 'bg-violet-100 dark:bg-violet-900 text-violet-700 dark:text-violet-300',
};
const teamColor = (t) => TEAM_COLORS[t] || 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300';

export default function DevMemberSettings({ devMembers, onRefresh, onCreate, onUpdate, onDelete, notify }) {
  const [showAdd, setShowAdd]     = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [addForm, setAddForm]     = useState({ name: '', team: 'FE' });
  const [editForm, setEditForm]   = useState({});
  const [showAddTeam, setShowAddTeam] = useState(false);
  const [newTeamName, setNewTeamName] = useState('');
  const [customTeams, setCustomTeams] = useState([]);

  // Derive unique teams: builtin + from existing members + any newly added custom ones
  const existingTeams = [...new Set(devMembers.map((d) => d.team))];
  const allTeams      = [...new Set(['FE', 'BE', 'RND', ...existingTeams, ...customTeams])].sort();

  const handleAdd = async (e) => {
    e.preventDefault();
    if (!addForm.name.trim()) { notify('Name cannot be empty', 'error'); return; }
    const sortOrder = devMembers.filter((d) => d.team === addForm.team).length;
    const result = await onCreate({ name: addForm.name.trim(), team: addForm.team, sortOrder });
    if (result?.error) { notify(result.error, 'error'); return; }
    notify('Developer added');
    setShowAdd(false);
    setAddForm({ name: '', team: 'FE' });
    onRefresh();
  };

  const handleEdit = async (e) => {
    e.preventDefault();
    const result = await onUpdate(editingId, editForm);
    if (result?.error) { notify(result.error, 'error'); return; }
    notify('Developer updated');
    setEditingId(null);
    onRefresh();
  };

  const handleDelete = async (item) => {
    const result = await onDelete(item.id);
    if (result?.error) { notify(result.error, 'error'); return; }
    notify('Developer removed');
    onRefresh();
  };

  const handleAddTeam = () => {
    const t = newTeamName.trim().toUpperCase();
    if (!t) return;
    // Register the new team so it appears in the dropdown immediately
    setCustomTeams((prev) => [...new Set([...prev, t])]);
    setAddForm({ name: '', team: t });
    setShowAddTeam(false);
    setNewTeamName('');
    setShowAdd(true);
  };

  // Group members by team
  const grouped = allTeams.reduce((acc, team) => {
    const members = devMembers.filter((d) => d.team === team);
    if (members.length > 0) acc[team] = members;
    return acc;
  }, {});

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 px-5 py-4 flex items-center justify-between">
        <div>
          <h2 className="font-semibold text-slate-900 dark:text-white">Dev Members</h2>
          <p className="text-xs text-slate-400 mt-0.5">Manage developers by team for BRD assignments</p>
        </div>
        <div className="flex gap-2">
          <button onClick={() => setShowAddTeam(true)}
            className="flex items-center gap-2 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 px-3.5 py-2 rounded-xl text-sm font-medium transition-colors">
            + New Team
          </button>
          <button onClick={() => setShowAdd(true)}
            className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-3.5 py-2 rounded-xl text-sm font-medium transition-colors shadow-sm">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
            Add Developer
          </button>
        </div>
      </div>

      {/* Add Team modal */}
      {showAddTeam && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-white dark:bg-slate-900 rounded-2xl p-6 max-w-sm w-full mx-4 shadow-2xl border border-slate-200 dark:border-slate-800 space-y-4">
            <h3 className="font-semibold text-slate-900 dark:text-white">New Team</h3>
            <div>
              <label className={labelClass}>Team name (e.g. RND, QA, DevOps)</label>
              <input autoFocus value={newTeamName} onChange={(e) => setNewTeamName(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleAddTeam()}
                placeholder="e.g. RND" className={inputClass} />
            </div>
            <div className="flex gap-3">
              <button onClick={handleAddTeam} className="flex-1 bg-blue-600 hover:bg-blue-700 text-white py-2.5 rounded-xl text-sm font-medium transition-colors">Create</button>
              <button onClick={() => { setShowAddTeam(false); setNewTeamName(''); }} className="px-4 py-2.5 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 rounded-xl text-sm font-medium transition-colors">Cancel</button>
            </div>
          </div>
        </div>
      )}

      {/* Add Form */}
      {showAdd && (
        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-blue-200 dark:border-blue-800 p-5">
          <h3 className="font-semibold text-slate-900 dark:text-white mb-4">New Developer</h3>
          <form onSubmit={handleAdd} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className={labelClass}>Name *</label>
                <input type="text" value={addForm.name} onChange={(e) => setAddForm({ ...addForm, name: e.target.value })}
                  placeholder="e.g. Marco" className={inputClass} autoFocus />
              </div>
              <div>
                <label className={labelClass}>Team *</label>
                <select value={addForm.team} onChange={(e) => setAddForm({ ...addForm, team: e.target.value })} className={selectClass}>
                  {allTeams.map((t) => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>
            </div>
            <div className="flex gap-3 pt-2">
              <button type="submit" className="flex-1 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2.5 rounded-xl text-sm font-medium transition-colors">Create</button>
              <button type="button" onClick={() => setShowAdd(false)} className="px-4 py-2.5 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 rounded-xl text-sm font-medium transition-colors">Cancel</button>
            </div>
          </form>
        </div>
      )}

      {/* Grouped list */}
      {Object.keys(grouped).length === 0 ? (
        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 px-5 py-8 text-center text-sm text-slate-500 dark:text-slate-400">
          No developers yet. Add one to get started.
        </div>
      ) : (
        Object.entries(grouped).map(([team, members]) => (
          <div key={team} className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 overflow-hidden">
            {/* Team header */}
            <div className="px-5 py-3 border-b border-slate-100 dark:border-slate-800 flex items-center gap-2">
              <span className={`px-2.5 py-0.5 rounded-lg text-xs font-bold ${teamColor(team)}`}>{team}</span>
              <span className="text-xs text-slate-400">{members.length} developer{members.length !== 1 ? 's' : ''}</span>
            </div>
            <div className="divide-y divide-slate-100 dark:divide-slate-800">
              {members.map((item) => (
                <div key={item.id} className="px-5 py-3">
                  {editingId === item.id ? (
                    <form onSubmit={handleEdit} className="flex items-center gap-3">
                      <input type="text" value={editForm.name || ''} onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                        className="flex-1 px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500" autoFocus />
                      <select value={editForm.team || ''} onChange={(e) => setEditForm({ ...editForm, team: e.target.value })}
                        className="px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500">
                        {allTeams.map((t) => <option key={t} value={t}>{t}</option>)}
                      </select>
                      <button type="submit" className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-medium rounded-lg transition-colors">Save</button>
                      <button type="button" onClick={() => setEditingId(null)} className="px-3 py-1.5 bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 text-xs font-medium rounded-lg transition-colors">Cancel</button>
                    </form>
                  ) : (
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full bg-blue-100 dark:bg-blue-900 flex items-center justify-center flex-shrink-0">
                        <span className="text-xs font-bold text-blue-600 dark:text-blue-300">{item.name.charAt(0).toUpperCase()}</span>
                      </div>
                      <p className="text-sm font-semibold text-slate-900 dark:text-white flex-1">{item.name}</p>
                      <div className="flex items-center gap-1">
                        <button onClick={() => { setEditingId(item.id); setEditForm({ name: item.name, team: item.team }); }}
                          className="p-1.5 rounded-lg text-slate-400 hover:text-blue-600 dark:hover:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-950 transition-colors">
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>
                        </button>
                        <button onClick={() => handleDelete(item)}
                          className="p-1.5 rounded-lg text-slate-400 hover:text-red-600 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-950 transition-colors">
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        ))
      )}
    </div>
  );
}
