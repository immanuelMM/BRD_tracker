import { useEffect, useRef, useState } from 'react';
import mammoth from 'mammoth';
import * as XLSX from 'xlsx';
import { fmtTitle } from '../utils/db';

const CATEGORY_BY_EXT = {
  md: 'Markdown', txt: 'Text', csv: 'Spreadsheet',
  xlsx: 'Spreadsheet', xls: 'Spreadsheet', docx: 'Word', doc: 'Word',
};

const TYPE_STYLES = {
  Regression: 'bg-violet-500/15 text-violet-600 dark:text-violet-300',
  'Edge Case': 'bg-rose-500/15 text-rose-600 dark:text-rose-300',
  Integration: 'bg-sky-500/15 text-sky-600 dark:text-sky-300',
  Functional: 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-300',
};
const PRIORITY_STYLES = {
  High: 'bg-red-100 dark:bg-red-950/40 text-red-600 dark:text-red-400 border-red-200 dark:border-red-900',
  Medium: 'bg-amber-100 dark:bg-amber-950/40 text-amber-600 dark:text-amber-400 border-amber-200 dark:border-amber-900',
  Low: 'bg-emerald-100 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400 border-emerald-200 dark:border-emerald-900',
};

// Extracts plain text from an uploaded test-case file (.md/.txt/.csv raw,
// .docx via mammoth, .xlsx/.xls via SheetJS one CSV block per sheet)
async function extractFileText(file) {
  const ext = file.name.split('.').pop().toLowerCase();
  if (ext === 'docx' || ext === 'doc') {
    const arrayBuffer = await file.arrayBuffer();
    const { value } = await mammoth.extractRawText({ arrayBuffer }); // .doc (legacy) will throw — caught by caller
    return value;
  }
  if (ext === 'xlsx' || ext === 'xls') {
    const wb = XLSX.read(await file.arrayBuffer(), { type: 'array' });
    return wb.SheetNames.map(name =>
      `## Sheet: ${name}\n${XLSX.utils.sheet_to_csv(wb.Sheets[name])}`
    ).join('\n\n');
  }
  return file.text(); // md / txt / csv
}

export default function TestScenarioPage({ brds, bugs, kbEntries, notify }) {
  // ── Test-case knowledge base ──
  const [entries, setEntries] = useState([]);
  const [loadingKB, setLoadingKB] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [search, setSearch] = useState('');
  const [viewing, setViewing] = useState(null);
  const [editing, setEditing] = useState(null);
  const [editForm, setEditForm] = useState({ title: '', category: '', content: '' });
  const fileInputRef = useRef(null);

  // ── Scenario generation ──
  const [selectedBRDId, setSelectedBRDId] = useState('');
  const [generating, setGenerating] = useState(false);
  const [scenarios, setScenarios] = useState(null);
  const [genMeta, setGenMeta] = useState(null);
  const [error, setError] = useState('');

  const loadEntries = async () => {
    setLoadingKB(true);
    try {
      const res = await fetch('/api/test-scenario-kb');
      const data = await res.json();
      setEntries(Array.isArray(data) ? data : []);
    } catch { notify?.('Failed to load test-case knowledge base', 'error'); }
    finally { setLoadingKB(false); }
  };
  useEffect(() => { loadEntries(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const handleUpload = async (e) => {
    const files = Array.from(e.target.files || []);
    if (!files.length) return;
    setUploading(true);
    let ok = 0;
    for (const file of files) {
      try {
        const content = await extractFileText(file);
        if (!content?.trim()) { notify?.(`${file.name}: no readable text found`, 'error'); continue; }
        const ext = file.name.split('.').pop().toLowerCase();
        const res = await fetch('/api/test-scenario-kb', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            title: file.name.replace(/\.[^.]+$/, '').replace(/[-_]/g, ' '),
            category: CATEGORY_BY_EXT[ext] || 'General',
            fileName: file.name,
            content,
          }),
        });
        if (res.ok) ok++;
        else notify?.(`${file.name}: upload failed`, 'error');
      } catch {
        notify?.(`${file.name}: could not read this file${file.name.endsWith('.doc') ? ' — legacy .doc is not supported, save it as .docx' : ''}`, 'error');
      }
    }
    if (ok) notify?.(`Registered ${ok} test case document${ok > 1 ? 's' : ''}`);
    setUploading(false);
    if (fileInputRef.current) fileInputRef.current.value = '';
    loadEntries();
  };

  const handleDelete = async (id) => {
    await fetch(`/api/test-scenario-kb/${id}`, { method: 'DELETE' });
    notify?.('Test case document removed');
    loadEntries();
  };

  const handleSaveEdit = async () => {
    if (!editForm.title.trim() || !editForm.content.trim()) { notify?.('Title and content are required', 'error'); return; }
    await fetch(`/api/test-scenario-kb/${editing.id}`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...editing, title: editForm.title, category: editForm.category || 'General', content: editForm.content }),
    });
    notify?.('Test case document updated');
    setEditing(null);
    loadEntries();
  };

  const handleGenerate = async () => {
    const brd = brds.find(b => b.id === selectedBRDId);
    if (!brd) return;
    setGenerating(true); setError(''); setScenarios(null); setGenMeta(null);
    try {
      const res = await fetch('/api/ai/generate-test-scenarios', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          brd,
          bugs: bugs.filter(b => b.brdId === brd.id),
          knowledgeBase: kbEntries,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Generation failed');
      setScenarios(data.testScenarios || []);
      setGenMeta({ mode: data.mode, provider: data.provider, cached: !!data.cached });
    } catch (err) { setError(err.message); }
    finally { setGenerating(false); }
  };

  const visible = entries.filter(en => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return en.title?.toLowerCase().includes(q) || en.category?.toLowerCase().includes(q) || en.content?.toLowerCase().includes(q);
  });

  return (
    <div className="flex flex-col xl:flex-row gap-6">

      {/* ── LEFT: Test-case knowledge base ─────────────────────────────── */}
      <div className="xl:w-[440px] flex-shrink-0 flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-base font-bold text-slate-900 dark:text-white">Test Case Knowledge Base</h1>
              <span
                title="This feature is under development & assessment — behaviour and results may change. Register test case documents here; they are matched against BRDs when generating scenarios."
                className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-wide bg-amber-100 dark:bg-amber-950/50 text-amber-600 dark:text-amber-400 border border-amber-200 dark:border-amber-900/60 cursor-help">
                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/>
                </svg>
                Under Development · Assessment
              </span>
            </div>
            <p className="text-xs text-slate-400 mt-0.5">{entries.length} registered document{entries.length === 1 ? '' : 's'} · used when generating scenarios</p>
          </div>
          <input ref={fileInputRef} type="file" accept=".md,.txt,.csv,.docx,.doc,.xlsx,.xls" multiple className="hidden" onChange={handleUpload} />
          <button onClick={() => fileInputRef.current?.click()} disabled={uploading}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-600 disabled:opacity-60 text-white text-xs font-medium transition-colors shadow-sm">
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v2a2 2 0 002 2h12a2 2 0 002-2v-2M12 4v12m0-12l-4 4m4-4l4 4"/></svg>
            {uploading ? 'Reading…' : 'Upload docs'}
          </button>
        </div>
        <p className="text-[11px] text-slate-400 -mt-1">Accepts .md · .txt · .csv · .docx · .xlsx — each file becomes a registered test case document.</p>

        <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search registered test cases…"
          className="w-full px-3 py-2 rounded-xl text-xs bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 outline-none focus:border-amber-400" />

        <div className="space-y-2 overflow-y-auto max-h-[calc(100vh-320px)] pr-1">
          {loadingKB ? (
            <p className="text-xs text-slate-400 py-6 text-center">Loading…</p>
          ) : visible.length === 0 ? (
            <div className="text-center py-10 border border-dashed border-slate-200 dark:border-slate-700 rounded-2xl">
              <p className="text-sm font-medium text-slate-500 dark:text-slate-400">No test case documents yet</p>
              <p className="text-xs text-slate-400 mt-1">Upload .md, .docx or Excel files to register them.</p>
            </div>
          ) : visible.map(en => (
            <div key={en.id} className="p-3 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 hover:shadow-sm transition-all">
              <div className="flex items-start justify-between gap-2">
                <button onClick={() => setViewing(en)} className="text-left min-w-0 cursor-pointer">
                  <h4 className="text-xs font-bold text-slate-800 dark:text-slate-100 truncate">{en.title}</h4>
                  <p className="text-[10px] text-slate-400 mt-0.5">
                    <span className="font-semibold text-amber-600 dark:text-amber-400">{en.category}</span>
                    {en.fileName ? <span className="font-mono"> · {en.fileName}</span> : null}
                  </p>
                </button>
                <div className="flex items-center gap-1 flex-shrink-0">
                  <button onClick={() => { setEditing(en); setEditForm({ title: en.title, category: en.category, content: en.content }); }}
                    className="p-1.5 rounded-lg text-slate-400 hover:text-blue-500 hover:bg-blue-50 dark:hover:bg-blue-950/40" title="Edit">
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"/></svg>
                  </button>
                  <button onClick={() => handleDelete(en.id)}
                    className="p-1.5 rounded-lg text-slate-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-950/40" title="Delete">
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg>
                  </button>
                </div>
              </div>
              <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1.5 line-clamp-2">{en.content}</p>
            </div>
          ))}
        </div>
      </div>

      {/* ── RIGHT: Scenario generation ─────────────────────────────────── */}
      <div className="flex-1 min-w-0 flex flex-col gap-3">
        <div>
          <h1 className="text-base font-bold text-slate-900 dark:text-white">Generate Test Scenarios</h1>
          <p className="text-xs text-slate-400 mt-0.5">Scenarios are grounded in the BRD + its spec document, your registered test cases, and the affected-code analysis.</p>
        </div>

        <div className="flex items-center gap-2">
          <select value={selectedBRDId} onChange={(e) => setSelectedBRDId(e.target.value)}
            className="flex-1 px-3 py-2 rounded-xl text-xs bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 outline-none focus:border-amber-400">
            <option value="">Select a BRD…</option>
            {brds.map(b => <option key={b.id} value={b.id}>{fmtTitle(b.title)}</option>)}
          </select>
          <button onClick={handleGenerate} disabled={!selectedBRDId || generating}
            className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-600 disabled:opacity-50 text-white text-xs font-bold transition-colors shadow-sm">
            {generating ? (
              <><span className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" /> Generating…</>
            ) : 'Generate Scenarios'}
          </button>
        </div>

        {error && (
          <div className="p-3 rounded-xl bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-900 text-xs text-red-600 dark:text-red-400">{error}</div>
        )}

        {genMeta && (
          <p className="text-[11px] text-slate-400">
            {scenarios?.length || 0} scenario{scenarios?.length === 1 ? '' : 's'} · {genMeta.mode === 'ai' ? `AI (${genMeta.provider})` : 'rule-based (no AI provider)'}{genMeta.cached ? ' · cached' : ''}
          </p>
        )}

        {!scenarios && !generating && !error && (
          <div className="flex flex-col items-center justify-center py-16 border border-dashed border-slate-200 dark:border-slate-700 rounded-3xl text-center">
            <svg className="w-8 h-8 text-amber-400 mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4"/></svg>
            <p className="text-sm font-medium text-slate-500 dark:text-slate-400">Select a BRD and generate</p>
            <p className="text-xs text-slate-400 mt-1 max-w-sm">Registered test case documents on the left are matched against the BRD and reused where they apply.</p>
          </div>
        )}

        {scenarios && (
          <div className="space-y-4 overflow-y-auto pr-1">
            {scenarios.length === 0 && <p className="text-xs text-slate-400 py-6 text-center">No scenarios were produced for this BRD.</p>}
            {scenarios.map((tc, ti) => (
              <div key={tc.id || ti} className="rounded-2xl border border-slate-200 dark:border-slate-700 overflow-hidden bg-white dark:bg-slate-900">
                <div className="flex items-center justify-between gap-2 px-4 py-2.5 bg-amber-50/60 dark:bg-amber-950/20 border-b border-slate-200 dark:border-slate-800">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="text-[10px] font-mono font-bold text-amber-600 dark:text-amber-400 flex-shrink-0">{tc.id || `TC-${ti + 1}`}</span>
                    <h5 className="text-xs font-bold text-slate-800 dark:text-slate-100 truncate">{tc.title}</h5>
                  </div>
                  <div className="flex items-center gap-1.5 flex-shrink-0">
                    <span className={`text-[9px] font-bold px-2 py-0.5 rounded-full ${TYPE_STYLES[tc.type] || TYPE_STYLES.Functional}`}>{tc.type || 'Functional'}</span>
                    <span className={`text-[9px] font-bold px-2 py-0.5 rounded-full border ${PRIORITY_STYLES[tc.priority] || PRIORITY_STYLES.Medium}`}>{tc.priority || 'Medium'}</span>
                  </div>
                </div>
                <div className="p-4 space-y-2.5">
                  {tc.requirement && (
                    <p className="text-[11px] text-slate-600 dark:text-slate-300 bg-slate-50 dark:bg-slate-950/40 rounded-lg p-2.5 border border-slate-100 dark:border-slate-800">
                      <strong className="text-slate-700 dark:text-slate-200">Verifies:</strong> {tc.requirement}
                    </p>
                  )}
                  {(tc.relatedFile || tc.relatedFunctions?.length > 0) && (
                    <p className="text-[10px] font-mono text-slate-400">
                      {tc.relatedFile}{tc.relatedFunctions?.length ? ` · ${tc.relatedFunctions.join(', ')}` : ''}
                    </p>
                  )}
                  {tc.preconditions && (
                    <p className="text-[11px] text-slate-500 dark:text-slate-400"><strong className="text-slate-600 dark:text-slate-300">Preconditions:</strong> {tc.preconditions}</p>
                  )}
                  {tc.steps?.length > 0 && (
                    <ol className="list-decimal list-inside space-y-1">
                      {tc.steps.map((s, si) => <li key={si} className="text-[11px] text-slate-600 dark:text-slate-300">{s}</li>)}
                    </ol>
                  )}
                  {tc.expectedResult && (
                    <p className="text-[11px] text-emerald-700 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-950/20 rounded-lg p-2.5 border border-emerald-100 dark:border-emerald-900/40">
                      <strong>Expected:</strong> {tc.expectedResult}
                    </p>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── View modal ── */}
      {viewing && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-6 bg-black/50" onClick={() => setViewing(null)}>
          <div className="w-full max-w-2xl max-h-[80vh] rounded-2xl flex flex-col overflow-hidden bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-start justify-between gap-3 px-5 py-4 border-b border-slate-100 dark:border-slate-800">
              <div>
                <h3 className="text-sm font-bold text-slate-900 dark:text-white">{viewing.title}</h3>
                <p className="text-[11px] text-slate-400 mt-0.5">{viewing.category}{viewing.fileName ? ` · ${viewing.fileName}` : ''}</p>
              </div>
              <button onClick={() => setViewing(null)} className="text-lg leading-none px-2 py-1 rounded text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800">×</button>
            </div>
            <div className="px-5 py-4 overflow-y-auto text-xs leading-relaxed whitespace-pre-wrap text-slate-600 dark:text-slate-300">{viewing.content}</div>
          </div>
        </div>
      )}

      {/* ── Edit modal ── */}
      {editing && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-6 bg-black/50" onClick={() => setEditing(null)}>
          <div className="w-full max-w-2xl rounded-2xl flex flex-col overflow-hidden bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700" onClick={(e) => e.stopPropagation()}>
            <div className="px-5 py-4 border-b border-slate-100 dark:border-slate-800">
              <h3 className="text-sm font-bold text-slate-900 dark:text-white">Edit Test Case Document</h3>
            </div>
            <div className="p-5 space-y-3">
              <input value={editForm.title} onChange={(e) => setEditForm(f => ({ ...f, title: e.target.value }))} placeholder="Title"
                className="w-full px-3 py-2 rounded-xl text-xs bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 outline-none focus:border-amber-400" />
              <input value={editForm.category} onChange={(e) => setEditForm(f => ({ ...f, category: e.target.value }))} placeholder="Category"
                className="w-full px-3 py-2 rounded-xl text-xs bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 outline-none focus:border-amber-400" />
              <textarea value={editForm.content} onChange={(e) => setEditForm(f => ({ ...f, content: e.target.value }))} rows={12} placeholder="Content"
                className="w-full px-3 py-2 rounded-xl text-xs font-mono bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 outline-none focus:border-amber-400 resize-y" />
              <div className="flex justify-end gap-2">
                <button onClick={() => setEditing(null)} className="px-3 py-1.5 rounded-lg text-xs font-medium text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800">Cancel</button>
                <button onClick={handleSaveEdit} className="px-4 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-600 text-white text-xs font-bold">Save</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
