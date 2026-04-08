import { useState, useEffect } from 'react';
import { BUG_CRITERIA as DEFAULT_CRITERIA, BUG_SEVERITY, MIN_BUG_THRESHOLD, getSprintLabel, getTShirtSize } from '../utils/constants';
import { createBug, updateBug, deleteBug, updateBRD } from '../utils/db';
import BugForm from './BugForm';
import StatusBadge from './StatusBadge';

const parseTickets = (val) => {
  if (!val) return [];
  try { const p = JSON.parse(val); return Array.isArray(p) ? p.filter(Boolean) : (val ? [val] : []); } catch { return val ? [val] : []; }
};

const EXPERTISE_OPTIONS = [
  'FE - Customizer',
  'BE - Qx7',
  'Anciliary - PDF',
  'Vectorsoft and Design drops',
  'FE - API',
];

const severityConfig = {
  critical: { cls: 'bg-red-100 dark:bg-red-950 text-red-700 dark:text-red-300', dot: 'bg-red-500' },
  high:     { cls: 'bg-orange-100 dark:bg-orange-950 text-orange-700 dark:text-orange-300', dot: 'bg-orange-500' },
  medium:   { cls: 'bg-amber-100 dark:bg-amber-950 text-amber-700 dark:text-amber-300', dot: 'bg-amber-500' },
  low:      { cls: 'bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300', dot: 'bg-emerald-500' },
};

const criteriaConfig = {
  new_requirements:   'bg-blue-100 dark:bg-blue-950 text-blue-700 dark:text-blue-300',
  missed_requirements:'bg-purple-100 dark:bg-purple-950 text-purple-700 dark:text-purple-300',
  code_logic_issue:   'bg-red-100 dark:bg-red-950 text-red-700 dark:text-red-300',
  known_issue:        'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400',
  affected_by_dev:    'bg-orange-100 dark:bg-orange-950 text-orange-700 dark:text-orange-300',
};

const SeverityBadge = ({ severity }) => {
  const cfg = severityConfig[severity] || { cls: 'bg-slate-100 text-slate-600', dot: 'bg-slate-400' };
  const label = BUG_SEVERITY.find((s) => s.value === severity)?.label || severity;
  return <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md text-xs font-semibold ${cfg.cls}`}><span className={`w-1.5 h-1.5 rounded-full ${cfg.dot}`} />{label}</span>;
};

const CriteriaBadge = ({ criteriaValue, criteriaDef = DEFAULT_CRITERIA }) => {
  const label = criteriaDef.find((c) => c.value === criteriaValue)?.label || criteriaValue;
  return <span className={`px-2 py-0.5 rounded-md text-xs font-semibold ${criteriaConfig[criteriaValue] || 'bg-slate-100 text-slate-600'}`}>{label}</span>;
};

const bugStatusLabel = (s) => ({ open: 'Open', in_progress: 'In Progress', resolved: 'Resolved', closed: 'Closed' }[s] || s);
const bugStatusCls = (s) => ({
  open: 'bg-red-50 dark:bg-red-950 text-red-600 dark:text-red-400',
  in_progress: 'bg-amber-50 dark:bg-amber-950 text-amber-600 dark:text-amber-400',
  resolved: 'bg-emerald-50 dark:bg-emerald-950 text-emerald-600 dark:text-emerald-400',
  closed: 'bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400',
}[s] || '');

export default function BRDDetail({ brd, bugs, onEdit, onBack, onRefresh, criteria = DEFAULT_CRITERIA, teamLeads = [], getTeamLeadsForBRD, addBRDTechLead, updateBRDTechLead, deleteBRDTechLead, reorderBRDTechLeads, devMembers = [] }) {
  const [showBugForm, setShowBugForm] = useState(false);
  const [editBug, setEditBug] = useState(null);
  const [brdTechLeads, setBrdTechLeads] = useState([]);
  const [loadingTechLeads, setLoadingTechLeads] = useState(false);
  const [showAddTechLead, setShowAddTechLead] = useState(false);
  const [editingTechLead, setEditingTechLead] = useState(null);
  const [addForm, setAddForm] = useState({ teamLeadId: '', expertise: '' });
  const parseDevs = (val) => {
    if (!val) return [];
    try { const p = JSON.parse(val); if (Array.isArray(p)) return p; } catch {}
    return val ? [val] : [];
  };
  const [devList, setDevList] = useState(() => parseDevs(brd.devAssignee));
  const [selectedDev, setSelectedDev] = useState('');
  const [showAddDev, setShowAddDev] = useState(false);

  // Fetch tech leads for this BRD
  useEffect(() => {
    if (getTeamLeadsForBRD && brd.id) {
      setLoadingTechLeads(true);
      getTeamLeadsForBRD(brd.id).then(setBrdTechLeads).finally(() => setLoadingTechLeads(false));
    }
  }, [brd.id, getTeamLeadsForBRD]);

  const isDev = ['development', 'testing', 'launched'].includes(brd.status);
  const isSuccess = brd.status === 'launched' && bugs.length <= MIN_BUG_THRESHOLD;

  const handleAddBug = async (data) => { await createBug(data); setShowBugForm(false); onRefresh(); };
  const handleUpdateBug = async (data) => { await updateBug(editBug.id, data); setEditBug(null); onRefresh(); };
  const handleDeleteBug = async (id) => { if (confirm('Delete this bug?')) { await deleteBug(id); onRefresh(); } };

  // Dev Assignee handlers
  const saveDevList = async (list) => {
    await updateBRD(brd.id, { ...brd, devAssignee: JSON.stringify(list) });
    onRefresh();
  };
  const handleAddDev = async () => {
    const name = selectedDev.trim();
    if (!name || devList.includes(name)) return;
    const updated = [...devList, name];
    setDevList(updated);
    setSelectedDev('');
    setShowAddDev(false);
    await saveDevList(updated);
  };
  const handleRemoveDev = async (idx) => {
    const updated = devList.filter((_, i) => i !== idx);
    setDevList(updated);
    await saveDevList(updated);
  };

  // Tech leads handlers
  const handleAddTechLead = async () => {
    if (!addForm.teamLeadId) return;
    await addBRDTechLead(brd.id, { teamLeadId: addForm.teamLeadId, expertise: addForm.expertise });
    setAddForm({ teamLeadId: '', expertise: '' });
    setShowAddTechLead(false);
    const updated = await getTeamLeadsForBRD(brd.id);
    setBrdTechLeads(updated);
  };

  const handleUpdateTechLead = async (id, expertise) => {
    await updateBRDTechLead(id, { expertise });
    setEditingTechLead(null);
    const updated = await getTeamLeadsForBRD(brd.id);
    setBrdTechLeads(updated);
  };

  const handleDeleteTechLead = async (id) => {
    if (!confirm('Remove this tech lead from the BRD?')) return;
    await deleteBRDTechLead(id);
    const updated = await getTeamLeadsForBRD(brd.id);
    setBrdTechLeads(updated);
  };

  const handleReorderTechLeads = async (direction, index) => {
    if ((direction === 'up' && index === 0) || (direction === 'down' && index === brdTechLeads.length - 1)) return;
    const newIndex = direction === 'up' ? index - 1 : index + 1;
    const newOrder = [...brdTechLeads];
    [newOrder[index], newOrder[newIndex]] = [newOrder[newIndex], newOrder[index]];
    const order = newOrder.map((tl, i) => ({ id: tl.id, sortOrder: i }));
    await reorderBRDTechLeads(brd.id, order);
    setBrdTechLeads(newOrder);
  };

  // Get available team leads (not already assigned)
  const availableTeamLeads = teamLeads.filter((tl) => !brdTechLeads.some((btl) => btl.teamLeadId === tl.id));

  const criteriaCounts = criteria.reduce((acc, c) => ({ ...acc, [c.value]: bugs.filter((b) => b.criteria === c.value).length }), {});

  return (
    <div className="space-y-5">
      {/* Back + Edit */}
      <div className="flex items-center justify-between">
        <button onClick={onBack} className="flex items-center gap-2 text-sm font-medium text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white transition-colors">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
          Back to BRDs
        </button>
        <button onClick={onEdit} className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-xl text-sm font-medium transition-colors shadow-sm">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>
          Edit
        </button>
      </div>

      {/* BRD Header Card */}
      <div className={`rounded-2xl border-2 p-6 ${isSuccess ? 'bg-emerald-50 dark:bg-emerald-950/20 border-emerald-200 dark:border-emerald-800' : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800'}`}>
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div className="min-w-0">
            <h2 className="text-xl font-bold text-slate-900 dark:text-white">{brd.title}</h2>
            {brd.description && <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">{brd.description}</p>}
          </div>
          <div className="flex flex-col items-end gap-2 flex-shrink-0">
            <StatusBadge status={brd.status} />
            {brd.tshirtSize && (() => {
              const s = getTShirtSize(brd.tshirtSize);
              return s ? (
                <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-bold ring-1 ${s.bg} ${s.text} ${s.ring}`}>
                  <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6.5 4h11l2.5 4-4 2v10H8V10L4 8l2.5-4z" /></svg>
                  {s.label} · {s.sprint}
                </span>
              ) : null;
            })()}
            {isSuccess && (
              <span className="inline-flex items-center gap-1.5 px-3 py-1 bg-emerald-100 dark:bg-emerald-900 text-emerald-700 dark:text-emerald-300 rounded-xl text-xs font-bold ring-1 ring-emerald-200 dark:ring-emerald-700">
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                Successful Launch
              </span>
            )}
          </div>
        </div>

        {/* Meta grid */}
        <div className="mt-5 grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { label: 'Quarter', value: `${brd.quarter} ${brd.year}` },
            { label: 'Sprint', value: getSprintLabel(brd) },
            { label: 'Total Bugs', value: bugs.length, highlight: bugs.length > MIN_BUG_THRESHOLD ? 'text-red-500 dark:text-red-400' : 'text-emerald-600 dark:text-emerald-400' },
            { label: 'Created', value: new Date(brd.createdAt).toLocaleDateString() },
          ].map((m) => (
            <div key={m.label} className="bg-white dark:bg-slate-800 rounded-xl p-3 border border-slate-100 dark:border-slate-700">
              <p className="text-xs text-slate-400 font-medium">{m.label}</p>
              <p className={`font-bold text-sm mt-0.5 ${m.highlight || 'text-slate-900 dark:text-white'}`}>{m.value}</p>
            </div>
          ))}
        </div>

        {/* People */}
        <div className="mt-3 space-y-3">
          {brd.baName && (
            <div className="flex items-center gap-3 bg-violet-50 dark:bg-violet-950/30 border border-violet-100 dark:border-violet-800 rounded-xl px-4 py-3">
              <div className="w-8 h-8 rounded-lg bg-violet-100 dark:bg-violet-900 flex items-center justify-center flex-shrink-0">
                <svg className="w-4 h-4 text-violet-600 dark:text-violet-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" /></svg>
              </div>
              <div>
                <p className="text-xs font-semibold text-violet-500 dark:text-violet-400 uppercase tracking-wide">BA — BRD Author</p>
                <p className="text-sm font-bold text-slate-900 dark:text-white">{brd.baName}</p>
              </div>
            </div>
          )}

          {/* Dev Assignees — visible once past planning */}
          {brd.status !== 'planning' && (
            <div className="bg-blue-50 dark:bg-blue-950/30 border border-blue-100 dark:border-blue-800 rounded-xl px-4 py-3">
              <div className="flex items-center justify-between mb-2">
                <p className="text-xs font-semibold text-blue-500 dark:text-blue-400 uppercase tracking-wide">Dev Assignees</p>
                {!showAddDev && <button onClick={() => setShowAddDev(true)} className="text-xs font-medium text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300">+ Add</button>}
              </div>

              {devList.length > 0 ? (
                <div className="space-y-2">
                  {devList.map((dev, idx) => (
                    <div key={idx} className="flex items-center justify-between gap-2 p-2 bg-white dark:bg-slate-800 rounded-lg">
                      <div className="flex items-center gap-2 flex-1 min-w-0">
                        <div className="w-6 h-6 rounded-full bg-blue-100 dark:bg-blue-900 flex items-center justify-center flex-shrink-0">
                          <svg className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4" /></svg>
                        </div>
                        <p className="text-sm font-medium text-slate-900 dark:text-white truncate">{dev}</p>
                      </div>
                      <button onClick={() => handleRemoveDev(idx)} className="p-1 text-slate-400 hover:text-red-600 dark:hover:text-red-400 text-xs flex-shrink-0" title="Remove">🗑️</button>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-slate-500 dark:text-slate-400">{showAddDev ? '' : 'No developers assigned'}</p>
              )}

              {showAddDev && (
                <div className="mt-2 p-2 bg-white dark:bg-slate-800 rounded-lg space-y-2">
                  {devMembers.length > 0 ? (
                    <select autoFocus value={selectedDev} onChange={(e) => setSelectedDev(e.target.value)}
                      className="w-full px-2 py-1.5 text-sm rounded-lg border border-blue-200 dark:border-blue-700 bg-white dark:bg-slate-700 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500">
                      <option value="">— Select developer —</option>
                      {Object.entries(
                        devMembers.reduce((acc, d) => { (acc[d.team] = acc[d.team] || []).push(d); return acc; }, {})
                      ).sort(([a], [b]) => a.localeCompare(b)).map(([team, members]) => (
                        <optgroup key={team} label={team}>
                          {members.filter((d) => !devList.includes(d.name)).map((d) => (
                            <option key={d.id} value={d.name}>{d.name}</option>
                          ))}
                        </optgroup>
                      ))}
                    </select>
                  ) : (
                    <input autoFocus value={selectedDev} onChange={(e) => setSelectedDev(e.target.value)}
                      placeholder="Developer name"
                      className="w-full px-2 py-1.5 text-sm rounded-lg border border-blue-200 dark:border-blue-700 bg-white dark:bg-slate-700 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500" />
                  )}
                  <div className="flex gap-2">
                    <button onClick={handleAddDev} disabled={!selectedDev.trim()} className="flex-1 px-2 py-1 bg-blue-600 hover:bg-blue-700 disabled:bg-slate-300 text-white text-xs font-medium rounded-lg transition-colors">Add</button>
                    <button onClick={() => { setShowAddDev(false); setSelectedDev(''); }} className="flex-1 px-2 py-1 bg-slate-200 dark:bg-slate-700 hover:bg-slate-300 dark:hover:bg-slate-600 text-slate-900 dark:text-white text-xs font-medium rounded-lg transition-colors">Cancel</button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Tech Leads Section */}
          {getTeamLeadsForBRD && (
            <div className="bg-blue-50 dark:bg-blue-950/30 border border-blue-100 dark:border-blue-800 rounded-xl px-4 py-3">
              <div className="flex items-center justify-between mb-2">
                <p className="text-xs font-semibold text-blue-500 dark:text-blue-400 uppercase tracking-wide">Tech Leads — Assessors</p>
                {!showAddTechLead && <button onClick={() => setShowAddTechLead(true)} className="text-xs font-medium text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300">+ Add</button>}
              </div>

              {brdTechLeads.length > 0 ? (
                <div className="space-y-2">
                  {brdTechLeads.map((tl, idx) => (
                    <div key={tl.id} className="flex items-center justify-between gap-2 p-2 bg-white dark:bg-slate-800 rounded-lg">
                      {editingTechLead?.id === tl.id ? (
                        <select autoFocus value={editingTechLead.expertise} onChange={(e) => setEditingTechLead({ ...editingTechLead, expertise: e.target.value })} className="flex-1 px-2 py-1 text-sm rounded border border-blue-200 dark:border-blue-700 bg-white dark:bg-slate-700 text-slate-900 dark:text-white">
                          <option value="">— Select expertise —</option>
                          {EXPERTISE_OPTIONS.map((o) => <option key={o} value={o}>{o}</option>)}
                        </select>
                      ) : (
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-slate-900 dark:text-white">{tl.name}</p>
                          {tl.expertise && <p className="text-xs text-slate-500 dark:text-slate-400">{tl.expertise}</p>}
                        </div>
                      )}
                      <div className="flex items-center gap-1 flex-shrink-0">
                        {editingTechLead?.id === tl.id ? (
                          <>
                            <button onClick={() => handleUpdateTechLead(tl.id, editingTechLead.expertise)} className="p-1 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-100 dark:hover:bg-emerald-900 rounded text-xs">✓</button>
                            <button onClick={() => setEditingTechLead(null)} className="p-1 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 text-xs">✕</button>
                          </>
                        ) : (
                          <>
                            <button onClick={() => setEditingTechLead({ id: tl.id, expertise: tl.expertise })} className="p-1 text-slate-400 hover:text-blue-600 dark:hover:text-blue-400 text-xs" title="Edit">✎</button>
                            <button onClick={() => handleReorderTechLeads('up', idx)} disabled={idx === 0} className="p-1 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 disabled:opacity-30 text-xs" title="Move up">↑</button>
                            <button onClick={() => handleReorderTechLeads('down', idx)} disabled={idx === brdTechLeads.length - 1} className="p-1 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 disabled:opacity-30 text-xs" title="Move down">↓</button>
                            <button onClick={() => handleDeleteTechLead(tl.id)} className="p-1 text-slate-400 hover:text-red-600 dark:hover:text-red-400 text-xs" title="Delete">🗑️</button>
                          </>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-slate-500 dark:text-slate-400">{showAddTechLead ? '' : 'No tech leads assigned'}</p>
              )}

              {showAddTechLead && (
                <div className="mt-2 p-2 bg-white dark:bg-slate-800 rounded-lg space-y-2">
                  <select value={addForm.teamLeadId} onChange={(e) => setAddForm({ ...addForm, teamLeadId: e.target.value })} className="w-full px-2 py-1 text-sm rounded border border-blue-200 dark:border-blue-700 bg-white dark:bg-slate-700 text-slate-900 dark:text-white">
                    <option value="">Select tech lead...</option>
                    {availableTeamLeads.map((tl) => <option key={tl.id} value={tl.id}>{tl.name}</option>)}
                  </select>
                  <select value={addForm.expertise} onChange={(e) => setAddForm({ ...addForm, expertise: e.target.value })} className="w-full px-2 py-1 text-sm rounded border border-blue-200 dark:border-blue-700 bg-white dark:bg-slate-700 text-slate-900 dark:text-white">
                    <option value="">— Select expertise —</option>
                    {EXPERTISE_OPTIONS.map((o) => <option key={o} value={o}>{o}</option>)}
                  </select>
                  <div className="flex gap-2">
                    <button onClick={handleAddTechLead} disabled={!addForm.teamLeadId} className="flex-1 px-2 py-1 bg-blue-600 hover:bg-blue-700 disabled:bg-slate-300 text-white text-xs font-medium rounded transition-colors">Add</button>
                    <button onClick={() => { setShowAddTechLead(false); setAddForm({ teamLeadId: '', expertise: '' }); }} className="flex-1 px-2 py-1 bg-slate-200 dark:bg-slate-700 hover:bg-slate-300 dark:hover:bg-slate-600 text-slate-900 dark:text-white text-xs font-medium rounded transition-colors">Cancel</button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Links */}
        <div className="mt-4 flex flex-wrap gap-2">
          {brd.googleDocsLink && (
            <a href={brd.googleDocsLink} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2 px-3.5 py-2 bg-white dark:bg-slate-800 hover:bg-blue-50 dark:hover:bg-blue-950 text-slate-700 dark:text-slate-300 hover:text-blue-700 dark:hover:text-blue-400 rounded-xl text-sm font-medium transition-colors border border-slate-200 dark:border-slate-700 shadow-sm">
              <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-6-6zm4 18H6V4h7v5h5v11z"/></svg>
              Google Docs
            </a>
          )}
          {brd.jiraLink && (
            <a href={brd.jiraLink} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2 px-3.5 py-2 bg-white dark:bg-slate-800 hover:bg-blue-50 dark:hover:bg-blue-950 text-slate-700 dark:text-slate-300 hover:text-blue-700 dark:hover:text-blue-400 rounded-xl text-sm font-medium transition-colors border border-slate-200 dark:border-slate-700 shadow-sm">
              <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24"><path d="M11.571 11.513H0a5.218 5.218 0 0 0 5.232 5.215h2.13v2.057A5.215 5.215 0 0 0 12.575 24V12.518a1.005 1.005 0 0 0-1.004-1.005zm5.723-5.756H5.757a5.215 5.215 0 0 0 5.215 5.214h2.129v2.058a5.218 5.218 0 0 0 5.215 5.214V6.762a1.005 1.005 0 0 0-1.022-1.005zM23.013 0H11.455a5.215 5.215 0 0 0 5.215 5.215h2.129v2.057A5.215 5.215 0 0 0 24 12.483V1.005A1.005 1.005 0 0 0 23.013 0z"/></svg>
              Jira Ticket
            </a>
          )}
          {brd.bugLogLink && (
            <a href={brd.bugLogLink} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2 px-3.5 py-2 bg-white dark:bg-slate-800 hover:bg-red-50 dark:hover:bg-red-950 text-slate-700 dark:text-slate-300 hover:text-red-700 dark:hover:text-red-400 rounded-xl text-sm font-medium transition-colors border border-slate-200 dark:border-slate-700 shadow-sm">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg>
              Bug Log
            </a>
          )}
          {[
            { key: 'beTicket',        label: 'BE Story',        hoverCls: 'hover:bg-blue-50 dark:hover:bg-blue-950 hover:text-blue-700 dark:hover:text-blue-400' },
            { key: 'feTicket',        label: 'FE Story',        hoverCls: 'hover:bg-violet-50 dark:hover:bg-violet-950 hover:text-violet-700 dark:hover:text-violet-400' },
            { key: 'anciliaryTicket', label: 'Anciliary Story', hoverCls: 'hover:bg-emerald-50 dark:hover:bg-emerald-950 hover:text-emerald-700 dark:hover:text-emerald-400' },
            { key: 'rndTicket',       label: 'RND Story',       hoverCls: 'hover:bg-orange-50 dark:hover:bg-orange-950 hover:text-orange-700 dark:hover:text-orange-400' },
          ].flatMap(({ key, label, hoverCls }) =>
            parseTickets(brd[key]).map((url, i) => (
              <a key={`${key}-${i}`} href={url} target="_blank" rel="noopener noreferrer"
                className={`inline-flex items-center gap-2 px-3.5 py-2 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 rounded-xl text-sm font-medium transition-colors border border-slate-200 dark:border-slate-700 shadow-sm ${hoverCls}`}>
                <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24"><path d="M11.571 11.513H0a5.218 5.218 0 0 0 5.232 5.215h2.13v2.057A5.215 5.215 0 0 0 12.575 24V12.518a1.005 1.005 0 0 0-1.004-1.005zm5.723-5.756H5.757a5.215 5.215 0 0 0 5.215 5.214h2.129v2.058a5.218 5.218 0 0 0 5.215 5.214V6.762a1.005 1.005 0 0 0-1.022-1.005zM23.013 0H11.455a5.215 5.215 0 0 0 5.215 5.215h2.129v2.057A5.215 5.215 0 0 0 24 12.483V1.005A1.005 1.005 0 0 0 23.013 0z"/></svg>
                {label}{parseTickets(brd[key]).length > 1 ? ` #${i + 1}` : ''}
              </a>
            ))
          )}
        </div>
      </div>

      {/* Bug Criteria Breakdown */}
      {isDev && (
        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-5">
          <h3 className="font-semibold text-slate-900 dark:text-white mb-4">Bug Criteria Breakdown</h3>
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
            {criteria.map((c) => (
              <div key={c.value} className="text-center p-3.5 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-100 dark:border-slate-700">
                <p className="text-2xl font-bold text-slate-900 dark:text-white">{criteriaCounts[c.value]}</p>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 leading-tight">{c.label}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Bug Log */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800">
        <div className="px-5 py-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
          <div>
            <h3 className="font-semibold text-slate-900 dark:text-white">Bug Log</h3>
            <p className="text-xs text-slate-400 mt-0.5">{bugs.length} bug{bugs.length !== 1 ? 's' : ''} logged</p>
          </div>
          {!showBugForm && !editBug && (
            <button onClick={() => setShowBugForm(true)} className="flex items-center gap-2 bg-rose-600 hover:bg-rose-700 text-white px-3.5 py-2 rounded-xl text-sm font-medium transition-colors shadow-sm">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
              Log Bug
            </button>
          )}
        </div>

        {showBugForm && (
          <div className="p-5 border-b border-slate-100 dark:border-slate-800 bg-rose-50 dark:bg-rose-950/20">
            <h4 className="font-medium text-slate-900 dark:text-white mb-4">New Bug Entry</h4>
            <BugForm brdId={brd.id} onSave={handleAddBug} onCancel={() => setShowBugForm(false)} criteria={criteria} />
          </div>
        )}

        {editBug && (
          <div className="p-5 border-b border-slate-100 dark:border-slate-800 bg-amber-50 dark:bg-amber-950/20">
            <h4 className="font-medium text-slate-900 dark:text-white mb-4">Edit Bug</h4>
            <BugForm brdId={brd.id} initial={editBug} onSave={handleUpdateBug} onCancel={() => setEditBug(null)} criteria={criteria} />
          </div>
        )}

        <div className="divide-y divide-slate-50 dark:divide-slate-800/50">
          {bugs.length === 0 ? (
            <div className="py-12 text-center">
              <div className="w-12 h-12 rounded-2xl bg-slate-100 dark:bg-slate-800 flex items-center justify-center mx-auto mb-3">
                <svg className="w-6 h-6 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
              </div>
              <p className="text-sm font-medium text-slate-500 dark:text-slate-400">No bugs logged yet</p>
            </div>
          ) : (
            bugs.map((bug) => (
              <div key={bug.id} className="px-5 py-4 hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors group">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className={`font-medium text-sm ${bug.status === 'resolved' || bug.status === 'closed' ? 'line-through text-slate-400' : 'text-slate-900 dark:text-white'}`}>{bug.title}</p>
                    </div>
                    <div className="flex items-center gap-2 flex-wrap mt-1.5">
                      <CriteriaBadge criteriaValue={bug.criteria} criteriaDef={criteria} />
                      <SeverityBadge severity={bug.severity} />
                      <span className={`px-2 py-0.5 rounded-md text-xs font-semibold ${bugStatusCls(bug.status)}`}>{bugStatusLabel(bug.status)}</span>
                    </div>
                    {bug.description && <p className="text-xs text-slate-500 dark:text-slate-400 mt-1.5">{bug.description}</p>}
                    {bug.rootCause && (
                      <div className="mt-1.5 px-2.5 py-1.5 bg-amber-50 dark:bg-amber-950/30 border border-amber-100 dark:border-amber-900 rounded-lg">
                        <p className="text-xs font-semibold text-amber-600 dark:text-amber-400 mb-0.5">Root Cause</p>
                        <p className="text-xs text-slate-600 dark:text-slate-300">{bug.rootCause}</p>
                      </div>
                    )}
                    <div className="flex items-center gap-3 mt-1.5 flex-wrap">
                      <p className="text-xs text-slate-400">{new Date(bug.createdAt).toLocaleDateString()}</p>
                      {bug.jiraLink && (
                        <a href={bug.jiraLink} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()} className="inline-flex items-center gap-1 text-xs text-blue-600 dark:text-blue-400 hover:underline font-medium">
                          <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 24 24"><path d="M11.571 11.513H0a5.218 5.218 0 0 0 5.232 5.215h2.13v2.057A5.215 5.215 0 0 0 12.575 24V12.518a1.005 1.005 0 0 0-1.004-1.005zm5.723-5.756H5.757a5.215 5.215 0 0 0 5.215 5.214h2.129v2.058a5.218 5.218 0 0 0 5.215 5.214V6.762a1.005 1.005 0 0 0-1.022-1.005zM23.013 0H11.455a5.215 5.215 0 0 0 5.215 5.215h2.129v2.057A5.215 5.215 0 0 0 24 12.483V1.005A1.005 1.005 0 0 0 23.013 0z"/></svg>
                          Jira
                        </a>
                      )}
                      {bug.storyTicket && (
                        <a href={bug.storyTicket} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()} className="inline-flex items-center gap-1 text-xs text-violet-600 dark:text-violet-400 hover:underline font-medium">
                          <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 24 24"><path d="M11.571 11.513H0a5.218 5.218 0 0 0 5.232 5.215h2.13v2.057A5.215 5.215 0 0 0 12.575 24V12.518a1.005 1.005 0 0 0-1.004-1.005zm5.723-5.756H5.757a5.215 5.215 0 0 0 5.215 5.214h2.129v2.058a5.218 5.218 0 0 0 5.215 5.214V6.762a1.005 1.005 0 0 0-1.022-1.005zM23.013 0H11.455a5.215 5.215 0 0 0 5.215 5.215h2.129v2.057A5.215 5.215 0 0 0 24 12.483V1.005A1.005 1.005 0 0 0 23.013 0z"/></svg>
                          Story
                        </a>
                      )}
                    </div>
                  </div>
                  <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0">
                    <button onClick={() => setEditBug(bug)} className="p-1.5 rounded-lg text-slate-400 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-950 transition-colors">
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>
                    </button>
                    <button onClick={() => handleDeleteBug(bug.id)} className="p-1.5 rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950 transition-colors">
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                    </button>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
