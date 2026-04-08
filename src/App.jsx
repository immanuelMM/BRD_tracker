import { useState, useCallback, useEffect, createContext, useContext } from 'react';
import Dashboard from './components/Dashboard';
import BRDList from './components/BRDList';
import BRDForm from './components/BRDForm';
import BRDDetail from './components/BRDDetail';
import QuarterReport from './components/QuarterReport';
import TShirtSizePage from './components/TShirtSizePage';
import SQLExplorer from './components/SQLExplorer';
import BAPage from './components/BAPage';
import QuarterView from './components/QuarterView';
import WorkflowPage from './components/WorkflowPage';
import PMNotesPage from './components/PMNotesPage';
import { getAllBRDs, getAllBugs, createBRD, updateBRD, deleteBRD, exportDB, importDB, seedSampleData, initDB, getAllCriteria, createCriteria, updateCriteria, deleteCriteria, getAllTeamLeads, createTeamLead, updateTeamLead, deleteTeamLead, getAllBRDTechLeads, getTeamLeadsForBRD, addBRDTechLead, updateBRDTechLead, deleteBRDTechLead, reorderBRDTechLeads, getAllTShirtSizes, createTShirtSize, updateTShirtSize, deleteTShirtSize, getAllPMNotes, createPMNote, updatePMNote, deletePMNote, getAllDevMembers, createDevMember, updateDevMember, deleteDevMember } from './utils/db';
import { BUG_CRITERIA as DEFAULT_CRITERIA, TSHIRT_SIZES as DEFAULT_TSHIRT_SIZES } from './utils/constants';
import CriteriaSettings from './components/CriteriaSettings';
import TeamLeadSettings from './components/TeamLeadSettings';
import TShirtSizeSettings from './components/TShirtSizeSettings';
import DevMemberSettings from './components/DevMemberSettings';

export const ThemeContext = createContext({ dark: false, toggle: () => {} });
export const useTheme = () => useContext(ThemeContext);

const NAV = [
  {
    id: 'dashboard', label: 'Dashboard',
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
      </svg>
    ),
  },
  {
    id: 'brds', label: 'BRDs',
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
      </svg>
    ),
  },
  {
    id: 'tshirt', label: 'T-Shirt Sizes',
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M6.5 4h11l2.5 4-4 2v10H8V10L4 8l2.5-4z" />
      </svg>
    ),
  },
  {
    id: 'quarters', label: 'Quarter View',
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
      </svg>
    ),
  },
  {
    id: 'ba', label: 'BA View',
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
      </svg>
    ),
  },
  {
    id: 'pmnotes', label: 'PM Notes',
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01" />
      </svg>
    ),
  },
  {
    id: 'workflow', label: 'Workflow',
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
      </svg>
    ),
  },
  {
    id: 'report', label: 'Reports',
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
      </svg>
    ),
  },
  {
    id: 'sql', label: 'SQL Explorer',
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M4 7a3 3 0 013-3h10a3 3 0 013 3v2a3 3 0 01-3 3H7a3 3 0 01-3-3V7zm0 8a3 3 0 013-3h10a3 3 0 013 3v2a3 3 0 01-3 3H7a3 3 0 01-3-3v-2z" />
      </svg>
    ),
  },
  {
    id: 'settings', label: 'Settings',
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8}
          d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
      </svg>
    ),
  },
];

const PAGE_TITLES = { dashboard: 'Dashboard', brds: 'BRD Tracker', report: 'Reports', tshirt: 'T-Shirt Sizes', quarters: 'Quarter View', ba: 'BA View', pmnotes: 'PM Notes', workflow: 'Workflow', sql: 'SQL Explorer', settings: 'Settings' };

function Notification({ msg, type }) {
  return (
    <div className={`fixed top-5 right-5 z-[100] flex items-center gap-3 px-4 py-3 rounded-xl shadow-2xl text-sm font-medium animate-in slide-in-from-top-2 ${type === 'error' ? 'bg-red-500 text-white' : 'bg-emerald-500 text-white'}`}>
      {type === 'error'
        ? <svg className="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
        : <svg className="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
      }
      {msg}
    </div>
  );
}

export default function App() {
  const [dark, setDark] = useState(() => localStorage.getItem('theme') === 'dark');
  const [dbReady, setDbReady] = useState(false);
  const [dbEngine, setDbEngine] = useState('');
  const [activeTab, setActiveTab] = useState('dashboard');
  const [brds, setBRDs] = useState([]);
  const [bugs, setBugs] = useState([]);
  const [criteria, setCriteria] = useState(DEFAULT_CRITERIA);
  const [teamLeads, setTeamLeads] = useState([]);
  const [tshirtSizes, setTShirtSizes] = useState(DEFAULT_TSHIRT_SIZES);
  const [pmNotes, setPMNotes] = useState([]);
  const [brdTechLeads, setBRDTechLeads] = useState([]);
  const [devMembers, setDevMembers] = useState([]);
  const [selectedBRDId, setSelectedBRDId] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [editingBRD, setEditingBRD] = useState(null);
  const [notification, setNotification] = useState(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);

  useEffect(() => {
    document.documentElement.classList.toggle('dark', dark);
    document.body.classList.toggle('dark', dark);
    localStorage.setItem('theme', dark ? 'dark' : 'light');
  }, [dark]);

  const refresh = useCallback(async () => {
    const [b, g] = await Promise.all([getAllBRDs(), getAllBugs()]);
    setBRDs(Array.isArray(b) ? b : []);
    setBugs(Array.isArray(g) ? g : []);
  }, []);

  useEffect(() => {
    initDB().then(async (ok) => {
      setDbEngine(ok ? 'SQL Server' : 'Offline');
      const migrated = await seedSampleData();
      const [, fetchedCriteria, fetchedTeamLeads, fetchedSizes, fetchedNotes, fetchedBRDTechLeads, fetchedDevMembers] = await Promise.all([
        refresh(),
        getAllCriteria(),
        getAllTeamLeads(),
        getAllTShirtSizes(),
        getAllPMNotes(),
        getAllBRDTechLeads(),
        getAllDevMembers(),
      ]);
      if (Array.isArray(fetchedCriteria) && fetchedCriteria.length > 0) {
        setCriteria(fetchedCriteria);
      }
      if (Array.isArray(fetchedTeamLeads) && fetchedTeamLeads.length > 0) {
        setTeamLeads(fetchedTeamLeads);
      }
      if (Array.isArray(fetchedSizes) && fetchedSizes.length > 0) {
        setTShirtSizes(fetchedSizes);
      }
      if (Array.isArray(fetchedNotes)) {
        setPMNotes(fetchedNotes);
      }
      if (Array.isArray(fetchedBRDTechLeads)) {
        setBRDTechLeads(fetchedBRDTechLeads);
      }
      if (Array.isArray(fetchedDevMembers)) {
        setDevMembers(fetchedDevMembers);
      }
      setDbReady(true);
      if (migrated && (migrated.brds > 0 || migrated.bugs > 0)) {
        notify(`Migrated ${migrated.brds} BRDs + ${migrated.bugs} bugs → SQL Server`);
      }
    });
  }, [refresh]);

  const notify = (msg, type = 'success') => {
    setNotification({ msg, type });
    setTimeout(() => setNotification(null), 3000);
  };

  const navigate = (tab) => {
    setActiveTab(tab);
    setSelectedBRDId(null);
    setShowForm(false);
    setEditingBRD(null);
    setSidebarOpen(false);
  };

  const refreshCriteria = useCallback(async () => {
    const fetched = await getAllCriteria();
    if (Array.isArray(fetched) && fetched.length > 0) setCriteria(fetched);
  }, []);

  const refreshTeamLeads = useCallback(async () => {
    const fetched = await getAllTeamLeads();
    if (Array.isArray(fetched) && fetched.length > 0) setTeamLeads(fetched);
  }, []);

  const refreshTShirtSizes = useCallback(async () => {
    const fetched = await getAllTShirtSizes();
    if (Array.isArray(fetched) && fetched.length > 0) setTShirtSizes(fetched);
  }, []);

  const refreshPMNotes = useCallback(async () => {
    const fetched = await getAllPMNotes();
    if (Array.isArray(fetched)) setPMNotes(fetched);
  }, []);

  const refreshDevMembers = useCallback(async () => {
    const fetched = await getAllDevMembers();
    if (Array.isArray(fetched)) setDevMembers(fetched);
  }, []);

  const handleSaveBRD = async (data) => {
    if (editingBRD) { await updateBRD(editingBRD.id, data); notify('BRD updated'); }
    else { await createBRD(data); notify('BRD created'); }
    setShowForm(false);
    setEditingBRD(null);
    refresh();
  };

  const handleDeleteBRD = async (id) => {
    await deleteBRD(id);
    notify('BRD deleted', 'error');
    if (selectedBRDId === id) setSelectedBRDId(null);
    refresh();
  };

  const handleExport = async () => {
    const json = await exportDB();
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `brd_export_${new Date().toISOString().split('T')[0]}.json`;
    a.click();
    URL.revokeObjectURL(url);
    notify('Data exported');
  };

  const handleImport = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async (ev) => {
      const ok = await importDB(ev.target.result);
      ok ? (await refresh(), notify('Data imported')) : notify('Invalid file', 'error');
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  const selectedBRD = selectedBRDId ? brds.find((b) => b.id === selectedBRDId) : null;

  const breadcrumb = () => {
    if (showForm) return editingBRD ? 'Edit BRD' : 'New BRD';
    if (selectedBRD) return selectedBRD.title;
    return PAGE_TITLES[activeTab];
  };

  const renderContent = () => {
    if (activeTab === 'brds') {
      if (showForm) return <BRDForm initial={editingBRD || {}} onSave={handleSaveBRD} onCancel={() => { setShowForm(false); setEditingBRD(null); }} teamLeads={teamLeads} />;
      if (selectedBRD) return <BRDDetail brd={selectedBRD} bugs={bugs.filter((b) => b.brdId === selectedBRDId)} onBack={() => setSelectedBRDId(null)} onEdit={() => { setEditingBRD(selectedBRD); setShowForm(true); setSelectedBRDId(null); }} onRefresh={refresh} criteria={criteria} teamLeads={teamLeads} getTeamLeadsForBRD={getTeamLeadsForBRD} addBRDTechLead={addBRDTechLead} updateBRDTechLead={updateBRDTechLead} deleteBRDTechLead={deleteBRDTechLead} reorderBRDTechLeads={reorderBRDTechLeads} devMembers={devMembers} />;
      return <BRDList brds={brds} bugs={bugs} onSelect={setSelectedBRDId} onNew={() => { setEditingBRD(null); setShowForm(true); }} onDelete={handleDeleteBRD} />;
    }
    if (activeTab === 'report') return <QuarterReport brds={brds} bugs={bugs} criteria={criteria} brdTechLeads={brdTechLeads} />;
    if (activeTab === 'tshirt') return <TShirtSizePage brds={brds} bugs={bugs} tshirtSizes={tshirtSizes} />;
    if (activeTab === 'quarters') return <QuarterView brds={brds} bugs={bugs} onSelectBRD={(id) => { setSelectedBRDId(id); setActiveTab('brds'); }} />;
    if (activeTab === 'ba') return <BAPage brds={brds} bugs={bugs} onSelectBRD={(id) => { setSelectedBRDId(id); setActiveTab('brds'); }} />;
    if (activeTab === 'pmnotes') return <PMNotesPage notes={pmNotes} brds={brds} onCreate={createPMNote} onUpdate={updatePMNote} onDelete={deletePMNote} onRefresh={refreshPMNotes} notify={notify} onSelectBRD={(id) => { setSelectedBRDId(id); setActiveTab('brds'); }} />;
    if (activeTab === 'workflow') return <WorkflowPage brds={brds} bugs={bugs} onSelectBRD={(id) => { setSelectedBRDId(id); setActiveTab('brds'); }} />;
    if (activeTab === 'sql') return <SQLExplorer />;
    if (activeTab === 'settings') return (
      <div className="space-y-8">
        <TeamLeadSettings
          teamLeads={teamLeads}
          onRefresh={refreshTeamLeads}
          onCreate={createTeamLead}
          onUpdate={updateTeamLead}
          onDelete={deleteTeamLead}
          notify={notify}
        />
        <CriteriaSettings
          criteria={criteria}
          onRefresh={refreshCriteria}
          onCreate={createCriteria}
          onUpdate={updateCriteria}
          onDelete={deleteCriteria}
          notify={notify}
        />
        <TShirtSizeSettings
          tshirtSizes={tshirtSizes}
          onRefresh={refreshTShirtSizes}
          onCreate={createTShirtSize}
          onUpdate={updateTShirtSize}
          onDelete={deleteTShirtSize}
          notify={notify}
        />
        <DevMemberSettings
          devMembers={devMembers}
          onRefresh={refreshDevMembers}
          onCreate={createDevMember}
          onUpdate={updateDevMember}
          onDelete={deleteDevMember}
          notify={notify}
        />
      </div>
    );
    return <Dashboard brds={brds} bugs={bugs} onSelectBRD={(id) => { setSelectedBRDId(id); setActiveTab('brds'); }} />;
  };

  if (!dbReady) {
    return (
      <div className={`flex h-screen items-center justify-center bg-slate-50 dark:bg-slate-950 ${dark ? 'dark' : ''}`}>
        <div className="text-center space-y-4">
          <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center mx-auto shadow-lg">
            <svg className="w-7 h-7 text-white animate-spin" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
            </svg>
          </div>
          <div>
            <p className="font-bold text-slate-900 dark:text-white">BRD Insight</p>
            <p className="text-sm text-slate-400 mt-1">Initialising database…</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <ThemeContext.Provider value={{ dark, toggle: () => setDark((d) => !d) }}>
      <div className={`flex h-screen overflow-hidden bg-slate-100 dark:bg-slate-950 transition-colors duration-200`}>

        {/* Sidebar overlay (mobile) */}
        {sidebarOpen && <div className="fixed inset-0 z-40 bg-black/50 lg:hidden" onClick={() => setSidebarOpen(false)} />}

        {/* Sidebar */}
        <aside className={`fixed inset-y-0 left-0 z-50 flex flex-col w-60 bg-white dark:bg-slate-900 border-r border-slate-200 dark:border-slate-800 transform transition-transform duration-200 lg:translate-x-0 lg:static lg:z-auto ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'}`}>
          {/* Logo */}
          <div className="flex items-center gap-3 px-5 h-16 border-b border-slate-200 dark:border-slate-800 flex-shrink-0">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center shadow-sm flex-shrink-0">
              <svg className="w-4 h-4 text-white" fill="currentColor" viewBox="0 0 24 24"><path d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/></svg>
            </div>
            <div>
              <p className="font-bold text-sm text-slate-900 dark:text-white leading-none">BRD Insight</p>
              <p className="text-xs text-slate-400 mt-0.5">Project management</p>
            </div>
          </div>

          {/* Nav */}
          <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
            {NAV.map((item) => (
              <button key={item.id} onClick={() => navigate(item.id)} className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-150 ${activeTab === item.id ? 'bg-blue-50 dark:bg-blue-950 text-blue-600 dark:text-blue-400 shadow-sm' : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-900 dark:hover:text-slate-200'}`}>
                {item.icon}
                {item.label}
                {item.id === 'brds' && brds.length > 0 && (
                  <span className={`ml-auto text-xs px-1.5 py-0.5 rounded-md font-semibold ${activeTab === item.id ? 'bg-blue-100 dark:bg-blue-900 text-blue-600 dark:text-blue-300' : 'bg-slate-200 dark:bg-slate-700 text-slate-500 dark:text-slate-400'}`}>{brds.length}</span>
                )}
              </button>
            ))}
          </nav>

          {/* Sidebar footer */}
          <div className="px-4 py-4 border-t border-slate-200 dark:border-slate-800 space-y-2 flex-shrink-0">
            <button onClick={handleExport} className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs font-medium text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-700 dark:hover:text-slate-200 transition-colors">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>
              Export Data
            </button>
            <label className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs font-medium text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-700 dark:hover:text-slate-200 transition-colors cursor-pointer">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" /></svg>
              Import Data
              <input type="file" accept=".json" onChange={handleImport} className="sr-only" />
            </label>

            {/* DB engine indicator */}
            <div className={`flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-medium ${dbEngine === 'SQL Server' ? 'bg-emerald-50 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-400' : 'bg-red-50 dark:bg-red-950 text-red-700 dark:text-red-400'}`}>
              <span className={`w-2 h-2 rounded-full flex-shrink-0 ${dbEngine === 'SQL Server' ? 'bg-emerald-500 animate-pulse' : 'bg-red-500'}`} />
              {dbEngine || 'Connecting…'}
            </div>
          </div>
        </aside>

        {/* Main */}
        <div className="flex-1 flex flex-col min-w-0 overflow-hidden">

          {/* Top bar */}
          <header className="flex-shrink-0 h-16 flex items-center justify-between px-4 sm:px-6 bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800">
            <div className="flex items-center gap-3">
              <button onClick={() => setSidebarOpen(true)} className="lg:hidden p-2 rounded-lg text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" /></svg>
              </button>
              <div>
                <h1 className="text-base font-semibold text-slate-900 dark:text-white">{breadcrumb()}</h1>
                <p className="text-xs text-slate-400 hidden sm:block">{new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}</p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              {activeTab === 'brds' && !showForm && !selectedBRD && (
                <button onClick={() => { setEditingBRD(null); setShowForm(true); }} className="hidden sm:flex items-center gap-2 bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white px-3.5 py-2 rounded-xl text-sm font-medium transition-colors shadow-sm">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
                  New BRD
                </button>
              )}

              {/* Theme toggle */}
              <button
                onClick={() => setDark((d) => !d)}
                className="relative w-10 h-10 flex items-center justify-center rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700 transition-all duration-200"
                title={dark ? 'Switch to light mode' : 'Switch to dark mode'}
              >
                {dark ? (
                  <svg className="w-5 h-5 text-amber-400" fill="currentColor" viewBox="0 0 24 24"><path d="M12 2.25a.75.75 0 01.75.75v2.25a.75.75 0 01-1.5 0V3a.75.75 0 01.75-.75zM7.5 12a4.5 4.5 0 119 0 4.5 4.5 0 01-9 0zM18.894 6.166a.75.75 0 00-1.06-1.06l-1.591 1.59a.75.75 0 101.06 1.061l1.591-1.59zM21.75 12a.75.75 0 01-.75.75h-2.25a.75.75 0 010-1.5H21a.75.75 0 01.75.75zM17.834 18.894a.75.75 0 001.06-1.06l-1.59-1.591a.75.75 0 10-1.061 1.06l1.59 1.591zM12 18a.75.75 0 01.75.75V21a.75.75 0 01-1.5 0v-2.25A.75.75 0 0112 18zM7.166 17.834a.75.75 0 00-1.06 1.06l1.59 1.591a.75.75 0 001.061-1.06l-1.59-1.591zM6 12a.75.75 0 01-.75.75H3a.75.75 0 010-1.5h2.25A.75.75 0 016 12zM6.166 6.166a.75.75 0 001.06 1.06l1.591-1.59a.75.75 0 10-1.061-1.061l-1.59 1.59z"/></svg>
                ) : (
                  <svg className="w-5 h-5 text-slate-600" fill="currentColor" viewBox="0 0 24 24"><path fillRule="evenodd" d="M9.528 1.718a.75.75 0 01.162.819A8.97 8.97 0 009 6a9 9 0 009 9 8.97 8.97 0 003.463-.69.75.75 0 01.981.98 10.503 10.503 0 01-9.694 6.46c-5.799 0-10.5-4.701-10.5-10.5 0-4.368 2.667-8.112 6.46-9.694a.75.75 0 01.818.162z" clipRule="evenodd"/></svg>
                )}
              </button>
            </div>
          </header>

          {/* Content */}
          <main className="flex-1 overflow-y-auto p-4 sm:p-6">
            {/* Mobile new BRD button */}
            {activeTab === 'brds' && !showForm && !selectedBRD && (
              <div className="sm:hidden mb-4">
                <button onClick={() => { setEditingBRD(null); setShowForm(true); }} className="w-full flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-700 text-white py-2.5 rounded-xl text-sm font-medium transition-colors">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
                  New BRD
                </button>
              </div>
            )}
            {renderContent()}
          </main>
        </div>

        {notification && <Notification {...notification} />}
      </div>
    </ThemeContext.Provider>
  );
}
