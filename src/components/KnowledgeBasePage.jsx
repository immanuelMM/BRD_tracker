import { useState, useRef, useEffect, useCallback } from 'react';
import mammoth from 'mammoth';
import { jsPDF } from 'jspdf';
import { analyzeWithAI, fmtTitle, getAllStyleFeatures, createStyleFeature, updateStyleFeature, deleteStyleFeature } from '../utils/db';

const KB_CATEGORIES = ['System Overview', 'Tech Stack', 'Business Rules', 'Integration', 'Standards & Guidelines', 'Domain Knowledge', 'General'];

const CAT_COLORS = {
  'System Overview':        'bg-blue-100 dark:bg-blue-900/50 text-blue-700 dark:text-blue-300',
  'Tech Stack':             'bg-violet-100 dark:bg-violet-900/50 text-violet-700 dark:text-violet-300',
  'Business Rules':         'bg-amber-100 dark:bg-amber-900/50 text-amber-700 dark:text-amber-300',
  'Integration':            'bg-cyan-100 dark:bg-cyan-900/50 text-cyan-700 dark:text-cyan-300',
  'Standards & Guidelines': 'bg-emerald-100 dark:bg-emerald-900/50 text-emerald-700 dark:text-emerald-300',
  'Domain Knowledge':       'bg-rose-100 dark:bg-rose-900/50 text-rose-700 dark:text-rose-300',
  'General':                'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400',
};
const CAT_BORDERS = {
  'System Overview':        'border-l-blue-500 dark:border-l-blue-400',
  'Tech Stack':             'border-l-violet-500 dark:border-l-violet-400',
  'Business Rules':         'border-l-amber-500 dark:border-l-amber-400',
  'Integration':            'border-l-cyan-500 dark:border-l-cyan-400',
  'Standards & Guidelines': 'border-l-emerald-500 dark:border-l-emerald-400',
  'Domain Knowledge':       'border-l-rose-500 dark:border-l-rose-400',
  'General':                'border-l-slate-400 dark:border-l-slate-500',
};
const catColor = (c) => CAT_COLORS[c] || CAT_COLORS['General'];
const catBorder = (c) => CAT_BORDERS[c] || CAT_BORDERS['General'];

// Parse inline markdown tokens into React nodes (bold, italic, code, links, strikethrough)
function parseInline(text, baseKey = 0) {
  const result = [];
  let remaining = text;
  let k = baseKey;
  const patterns = [
    { re: /\*\*\*(.+?)\*\*\*/, tag: (m, key) => <strong key={key}><em>{m[1]}</em></strong> },
    { re: /\*\*(.+?)\*\*/, tag: (m, key) => <strong key={key} className="font-semibold text-slate-900 dark:text-white">{m[1]}</strong> },
    { re: /\*(.+?)\*/, tag: (m, key) => <em key={key}>{m[1]}</em> },
    { re: /~~(.+?)~~/, tag: (m, key) => <del key={key} className="opacity-50">{m[1]}</del> },
    { re: /`([^`]+)`/, tag: (m, key) => <code key={key} className="bg-slate-100 dark:bg-[#2d2d2d] text-rose-500 dark:text-rose-400 px-1 py-0.5 rounded text-[0.82em] font-mono">{m[1]}</code> },
    { re: /\[([^\]]+)\]\(([^)]+)\)/, tag: (m, key) => <a key={key} href={m[2]} className="text-blue-500 hover:underline" target="_blank" rel="noopener noreferrer">{m[1]}</a> },
  ];
  while (remaining.length > 0) {
    let earliest = null;
    let earliestIdx = Infinity;
    for (const p of patterns) {
      const m = remaining.match(p.re);
      if (m && m.index < earliestIdx) { earliest = { match: m, pattern: p }; earliestIdx = m.index; }
    }
    if (!earliest) { result.push(remaining); break; }
    if (earliestIdx > 0) result.push(remaining.slice(0, earliestIdx));
    result.push(earliest.pattern.tag(earliest.match, k++));
    remaining = remaining.slice(earliestIdx + earliest.match[0].length);
  }
  return result;
}

// VS Code-style markdown renderer
function MarkdownRenderer({ text, className = '' }) {
  const blocks = [];
  const lines = (text || '').split('\n');
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    // Fenced code block
    if (line.startsWith('```')) {
      const lang = line.slice(3).trim();
      const codeLines = [];
      i++;
      while (i < lines.length && !lines[i].startsWith('```')) { codeLines.push(lines[i]); i++; }
      blocks.push({ type: 'code', lang, content: codeLines.join('\n') });
      i++; continue;
    }
    // Heading
    const hm = line.match(/^(#{1,6})\s+(.*)/);
    if (hm) { blocks.push({ type: 'heading', level: hm[1].length, content: hm[2] }); i++; continue; }
    // Blockquote
    if (line.startsWith('> ')) { blocks.push({ type: 'blockquote', content: line.slice(2) }); i++; continue; }
    // Horizontal rule
    if (/^[-*_]{3,}\s*$/.test(line) && line.trim().length >= 3) { blocks.push({ type: 'hr' }); i++; continue; }
    // Unordered list
    const ulm = line.match(/^(\s*)[-*+]\s(.*)/);
    if (ulm) { blocks.push({ type: 'li', indent: ulm[1].length, content: ulm[2] }); i++; continue; }
    // Ordered list
    const olm = line.match(/^(\s*)(\d+)\.\s(.*)/);
    if (olm) { blocks.push({ type: 'oli', indent: olm[1].length, num: olm[2], content: olm[3] }); i++; continue; }
    // Empty
    if (line.trim() === '') { blocks.push({ type: 'empty' }); i++; continue; }
    // Paragraph
    blocks.push({ type: 'p', content: line });
    i++;
  }

  const headingCls = [
    'text-lg font-bold text-blue-600 dark:text-blue-400 mt-5 mb-2 pb-1 border-b border-slate-200 dark:border-slate-700 first:mt-0',
    'text-base font-bold text-blue-500 dark:text-blue-300 mt-4 mb-1.5 first:mt-0',
    'text-sm font-bold text-violet-600 dark:text-violet-400 mt-3 mb-1 first:mt-0',
    'text-sm font-semibold text-violet-500 dark:text-violet-300 mt-2 mb-1',
    'text-xs font-semibold text-violet-400 dark:text-violet-300 mt-2',
    'text-xs font-semibold text-slate-500 dark:text-slate-400 mt-1',
  ];

  return (
    <div className={`text-sm text-slate-700 dark:text-slate-300 leading-relaxed ${className}`}>
      {blocks.map((block, idx) => {
        switch (block.type) {
          case 'heading':
            return <div key={idx} className={headingCls[block.level - 1] || headingCls[5]}>{parseInline(block.content, idx * 100)}</div>;
          case 'code':
            return (
              <pre key={idx} className="bg-[#1e1e1e] text-[#d4d4d4] rounded-lg p-3 my-2 overflow-x-auto text-xs font-mono leading-relaxed border border-slate-700 dark:border-slate-600">
                {block.lang && <div className="text-[10px] text-[#858585] mb-2 font-sans not-italic">{block.lang}</div>}
                <code>{block.content}</code>
              </pre>
            );
          case 'blockquote':
            return <div key={idx} className="border-l-4 border-blue-400 dark:border-blue-500 pl-3 my-1.5 text-slate-500 dark:text-slate-400 italic">{parseInline(block.content, idx * 100)}</div>;
          case 'hr':
            return <hr key={idx} className="my-3 border-slate-200 dark:border-slate-700" />;
          case 'li':
            return (
              <div key={idx} className="flex gap-2 my-0.5" style={{ paddingLeft: `${block.indent * 12 + 8}px` }}>
                <span className="text-blue-500 dark:text-blue-400 flex-shrink-0 mt-0.5 text-[10px]">●</span>
                <span>{parseInline(block.content, idx * 100)}</span>
              </div>
            );
          case 'oli':
            return (
              <div key={idx} className="flex gap-2 my-0.5" style={{ paddingLeft: `${block.indent * 12 + 8}px` }}>
                <span className="text-blue-500 dark:text-blue-400 font-mono text-xs flex-shrink-0 min-w-[1.5em]">{block.num}.</span>
                <span>{parseInline(block.content, idx * 100)}</span>
              </div>
            );
          case 'empty':
            return <div key={idx} className="h-2" />;
          case 'p':
            return <p key={idx} className="my-0.5">{parseInline(block.content, idx * 100)}</p>;
          default:
            return null;
        }
      })}
    </div>
  );
}

const SF_STATUSES = ['stable', 'new', 'ongoing', 'assessment'];
const SF_STATUS_COLORS = {
  stable:     'bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300',
  new:        'bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300',
  ongoing:    'bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300',
  assessment: 'bg-violet-100 dark:bg-violet-900/40 text-violet-700 dark:text-violet-300',
};
const sfStatusColor = (s) => SF_STATUS_COLORS[s] || SF_STATUS_COLORS.stable;

export default function KnowledgeBasePage({ brds, bugs, brdTechLeads, kbEntries, onRefreshKB, onCreateKB, onUpdateKB, onDeleteKB, notify }) {
  // Left-panel tab: 'kb' | 'functions'
  const [leftTab, setLeftTab] = useState('kb');

  // KB management
  const [showAddKB, setShowAddKB]   = useState(false);
  const [editingKB, setEditingKB]   = useState(null);
  const [viewingEntry, setViewingEntry] = useState(null);
  const [kbForm, setKbForm]         = useState({ title: '', category: 'General', content: '' });
  const [activeCategory, setActiveCategory] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [uploading, setUploading]   = useState(false);
  const fileInputRef = useRef(null);

  // Function Registry (style features)
  const [styleFeatures, setStyleFeatures]   = useState([]);
  const [sfLoading, setSfLoading]           = useState(false);
  const [sfSearch, setSfSearch]             = useState('');
  const [sfTabFilter, setSfTabFilter]       = useState('all');
  const [showAddSF, setShowAddSF]           = useState(false);
  const [editingSF, setEditingSF]           = useState(null);
  const [sfForm, setSfForm]                 = useState({ feature: '', tab: '', status: 'stable', keywords: '' });

  const loadSF = useCallback(async () => {
    setSfLoading(true);
    try {
      const data = await getAllStyleFeatures();
      setStyleFeatures(Array.isArray(data) ? data : []);
    } catch { /* silently ignore */ }
    finally { setSfLoading(false); }
  }, []);

  useEffect(() => { if (leftTab === 'functions') loadSF(); }, [leftTab, loadSF]);

  const sfTabs = ['all', ...Array.from(new Set(styleFeatures.map(sf => sf.tab).filter(Boolean))).sort()];

  const visibleSF = styleFeatures.filter(sf => {
    const matchTab = sfTabFilter === 'all' || sf.tab === sfTabFilter;
    if (!sfSearch.trim()) return matchTab;
    const q = sfSearch.toLowerCase();
    return matchTab && (
      sf.feature?.toLowerCase().includes(q) ||
      sf.tab?.toLowerCase().includes(q) ||
      (Array.isArray(sf.keywords) ? sf.keywords : []).some(kw => kw.toLowerCase().includes(q))
    );
  });

  const handleSaveSF = async (e) => {
    e.preventDefault();
    if (!sfForm.feature.trim()) { notify('Feature name is required', 'error'); return; }
    const keywords = sfForm.keywords.split(',').map(k => k.trim()).filter(Boolean);
    const payload = { feature: sfForm.feature.trim(), tab: sfForm.tab.trim() || 'General', status: sfForm.status, keywords };
    if (editingSF) {
      await updateStyleFeature(editingSF.id, payload);
      notify('Feature updated');
      setEditingSF(null);
    } else {
      await createStyleFeature({ ...payload, sortOrder: styleFeatures.length });
      notify('Feature added');
      setShowAddSF(false);
    }
    setSfForm({ feature: '', tab: '', status: 'stable', keywords: '' });
    loadSF();
  };

  const handleDeleteSF = async (id) => {
    await deleteStyleFeature(id);
    notify('Feature deleted');
    loadSF();
  };

  // BRD analysis
  const [selectedBRDId, setSelectedBRDId] = useState('');
  const [analysis, setAnalysis]           = useState(null);
  const [analysisMode, setAnalysisMode]   = useState(''); // 'ai' | 'local'
  const [analysisReason, setAnalysisReason] = useState('');
  const [analysisProvider, setAnalysisProvider] = useState('');
  const [docFetched, setDocFetched]       = useState(false);
  const [localDocText, setLocalDocText]   = useState(null);   // text from uploaded file
  const [localDocName, setLocalDocName]   = useState('');
  const [analyzing, setAnalyzing]         = useState(false);
  const [error, setError]                 = useState('');
  const analysisRef = useRef(null);
  const docFileRef  = useRef(null);

  const selectedBRD = brds.find((b) => b.id === selectedBRDId);
  const brdBugs     = bugs.filter((b) => b.brdId === selectedBRDId);
  const techLeads   = brdTechLeads.filter((tl) => tl.brdId === selectedBRDId);

  // Parse dev assignees
  const devAssignees = (() => {
    if (!selectedBRD?.devAssignee) return [];
    try { const p = JSON.parse(selectedBRD.devAssignee); return Array.isArray(p) ? p : [selectedBRD.devAssignee]; }
    catch { return selectedBRD.devAssignee ? [selectedBRD.devAssignee] : []; }
  })();

  const filteredKB = activeCategory === 'all' ? kbEntries : kbEntries.filter((e) => e.category === activeCategory);
  const aiProviderLabel = analysisProvider === 'openai'
    ? 'OpenAI'
    : analysisProvider === 'gemini'
      ? 'Google Gemini'
      : 'Claude AI';
  const localReasonMessage = (() => {
    if (analysisReason === 'missing_all_ai_api_keys') return 'Local analysis used because no AI API keys are configured.';
    if (analysisReason === 'invalid_ai_provider') return 'Local analysis used because AI_PROVIDER is invalid.';
    if (analysisReason.includes('anthropic')) return 'Local analysis used because the Anthropic API key is not configured.';
    if (analysisReason.includes('openai')) return 'Local analysis used because the OpenAI API key is not configured.';
    if (analysisReason.includes('gemini')) return 'Local analysis used because the Gemini API key is not configured.';
    return 'Local analysis used (AI provider unavailable).';
  })();

  const handleSaveKB = async (e) => {
    e.preventDefault();
    if (!kbForm.title.trim() || !kbForm.content.trim()) { notify('Title and content are required', 'error'); return; }
    if (editingKB) {
      await onUpdateKB(editingKB.id, kbForm);
      notify('Entry updated');
      setEditingKB(null);
    } else {
      await onCreateKB({ ...kbForm, sortOrder: kbEntries.length });
      notify('Entry added');
      setShowAddKB(false);
    }
    setKbForm({ title: '', category: 'General', content: '' });
    onRefreshKB();
  };

  const handleDeleteKB = async (id) => {
    await onDeleteKB(id);
    notify('Entry deleted');
    onRefreshKB();
  };

  const handleMDUpload = (e) => {
    const files = Array.from(e.target.files || []);
    if (!files.length) return;
    // Reset so the same file can be re-uploaded if needed
    e.target.value = '';
    setUploading(true);
    let completed = 0;
    files.forEach((file) => {
      if (!file.name.endsWith('.md')) {
        notify(`${file.name} is not a .md file`, 'error');
        completed++;
        if (completed === files.length) setUploading(false);
        return;
      }
      const reader = new FileReader();
      reader.onload = (ev) => {
        const content = ev.target.result || '';
        const title = file.name.replace(/\.md$/i, '').replace(/[-_]/g, ' ');
        // Pre-fill the form and open it so the user can confirm/adjust
        setEditingKB(null);
        setKbForm({ title, category: 'General', content });
        setShowAddKB(true);
        completed++;
        if (completed === files.length) setUploading(false);
      };
      reader.onerror = () => {
        notify(`Failed to read ${file.name}`, 'error');
        completed++;
        if (completed === files.length) setUploading(false);
      };
      reader.readAsText(file);
    });
  };

  const handleDocFileUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setLocalDocName(file.name);
    if (file.name.endsWith('.docx')) {
      const arrayBuffer = await file.arrayBuffer();
      const { value } = await mammoth.extractRawText({ arrayBuffer });
      setLocalDocText(value || '');
    } else {
      const reader = new FileReader();
      reader.onload = (ev) => setLocalDocText(ev.target.result || '');
      reader.readAsText(file);
    }
    // reset so same file can be re-selected
    e.target.value = '';
  };

  const handleAnalyze = async () => {
    if (!selectedBRD && !localDocText) { setError('Select a BRD or upload a document file to analyze.'); return; }
    if (kbEntries.length === 0 && !localDocText) { setError('Add at least one knowledge base entry, or upload a local document file to analyze.'); return; }
    setAnalyzing(true);
    setError('');
    setAnalysis(null);
    setAnalysisReason('');
    setAnalysisProvider('');
    // When no BRD is selected, use a minimal placeholder so the server can still run
    const brdPayload = selectedBRD || { title: localDocName || 'Uploaded Document', status: 'unknown', description: '' };
    try {
      const result = await analyzeWithAI({
        brd: brdPayload,
        bugs: brdBugs,
        techLeads,
        devAssignees,
        knowledgeBase: kbEntries,
        ...(localDocText ? { docContent: localDocText } : {}),
      });
      if (result.error) { setError(result.error); }
      else {
        setAnalysis(result.analysis);
        setAnalysisMode(result.mode === 'local' ? 'local' : 'ai');
        setAnalysisReason(result.modeReason || '');
        setAnalysisProvider(result.provider || (result.mode === 'local' ? 'local' : 'anthropic'));
        setDocFetched(!!result.docFetched);
      }
    } catch (err) {
      setError(err.message || 'Analysis failed.');
    } finally {
      setAnalyzing(false);
    }
  };

  const downloadDocx = () => {
    const title = selectedBRD?.title || localDocName || 'Document';
    const lines = (analysis || '').split('\n');
    const htmlLines = lines.map((line) => {
      if (/^# /.test(line))   return `<h1>${line.slice(2)}</h1>`;
      if (/^## /.test(line))  return `<h2>${line.slice(3)}</h2>`;
      if (/^### /.test(line)) return `<h3>${line.slice(4)}</h3>`;
      if (/^[-*+] /.test(line)) return `<li>${line.replace(/^[-*+] /, '').replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>').replace(/\*(.+?)\*/g, '<em>$1</em>')}</li>`;
      if (/^\d+\. /.test(line)) return `<li>${line.replace(/^\d+\. /, '').replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>').replace(/\*(.+?)\*/g, '<em>$1</em>')}</li>`;
      if (/^> /.test(line))  return `<blockquote>${line.slice(2)}</blockquote>`;
      if (line.trim() === '') return '<br/>';
      return `<p>${line.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>').replace(/\*(.+?)\*/g, '<em>$1</em>').replace(/`(.+?)`/g, '<code>$1</code>')}</p>`;
    }).join('\n');

    const html = `<html xmlns:o='urn:schemas-microsoft-com:office:office' xmlns:w='urn:schemas-microsoft-com:office:word' xmlns='http://www.w3.org/TR/REC-html40'>
<head><meta charset='utf-8'>
<style>
  body { font-family: Calibri, sans-serif; font-size: 11pt; margin: 2.5cm; }
  h1 { font-size: 18pt; color: #1d4ed8; border-bottom: 1px solid #e2e8f0; padding-bottom: 4pt; }
  h2 { font-size: 14pt; color: #2563eb; }
  h3 { font-size: 12pt; color: #7c3aed; }
  li { margin-bottom: 4pt; }
  code { font-family: Consolas, monospace; background: #f1f5f9; padding: 1pt 3pt; }
  blockquote { border-left: 3pt solid #93c5fd; padding-left: 8pt; color: #64748b; font-style: italic; }
  p { margin: 4pt 0; line-height: 1.5; }
</style>
</head>
<body>
<h1>${title}</h1>
<p style="color:#94a3b8;font-size:9pt">Generated: ${new Date().toLocaleString()} &nbsp;·&nbsp; Mode: ${analysisMode === 'local' ? 'Rule-based' : aiProviderLabel}</p>
<hr/>
${htmlLines}
</body></html>`;

    const blob = new Blob([html], { type: 'application/msword' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `analysis-${title.replace(/[^a-z0-9]/gi, '-').toLowerCase()}.doc`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const downloadTxt = () => {
    const title = selectedBRD?.title || localDocName || 'Document';
    const header = `BRD Analysis — ${title}\nGenerated: ${new Date().toLocaleString()}\nMode: ${analysisMode === 'local' ? 'Rule-based' : aiProviderLabel}\n${'─'.repeat(60)}\n\n`;
    const blob = new Blob([header + analysis], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `analysis-${title.replace(/[^a-z0-9]/gi, '-').toLowerCase()}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const downloadPdf = () => {
    const title = selectedBRD?.title || localDocName || 'Document';
    const doc = new jsPDF({ unit: 'mm', format: 'a4' });
    const pageW = doc.internal.pageSize.getWidth();
    const margin = 15;
    const maxW = pageW - margin * 2;
    let y = 20;

    const addText = (text, size = 10, style = 'normal', color = [30, 30, 30]) => {
      doc.setFontSize(size);
      doc.setFont('helvetica', style);
      doc.setTextColor(...color);
      const lines = doc.splitTextToSize(text, maxW);
      lines.forEach((line) => {
        if (y > 275) { doc.addPage(); y = 20; }
        doc.text(line, margin, y);
        y += size * 0.45;
      });
    };

    // Header
    doc.setFillColor(59, 130, 246);
    doc.rect(0, 0, pageW, 14, 'F');
    doc.setFontSize(11);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(255, 255, 255);
    doc.text('BRD Analysis Report', margin, 9.5);
    doc.setFontSize(8);
    doc.setFont('helvetica', 'normal');
    doc.text(`${new Date().toLocaleString()}  ·  ${analysisMode === 'local' ? 'Rule-based' : aiProviderLabel}`, pageW - margin, 9.5, { align: 'right' });
    y = 24;

    addText(title, 14, 'bold', [15, 23, 42]);
    y += 3;

    // Body — parse sections
    analysis.split('\n').forEach((line) => {
      if (!line.trim()) { y += 3; return; }
      if (/^##\s/.test(line)) {
        y += 2;
        if (y > 270) { doc.addPage(); y = 20; }
        doc.setFillColor(241, 245, 249);
        doc.rect(margin - 2, y - 5, maxW + 4, 7, 'F');
        addText(line.replace(/^##\s/, ''), 10, 'bold', [30, 64, 175]);
        y += 1;
      } else if (/^[-•]\s/.test(line)) {
        const txt = line.replace(/^[-•]\s/, '').replace(/\*\*(.+?)\*\*/g, '$1');
        if (y > 275) { doc.addPage(); y = 20; }
        doc.setFontSize(9); doc.setFont('helvetica', 'normal'); doc.setTextColor(71, 85, 105);
        doc.text('•', margin + 1, y);
        const wrapped = doc.splitTextToSize(txt, maxW - 6);
        wrapped.forEach((l) => {
          if (y > 275) { doc.addPage(); y = 20; }
          doc.text(l, margin + 5, y);
          y += 4.5;
        });
      } else {
        const clean = line.replace(/\*\*(.+?)\*\*/g, '$1');
        addText(clean, 9, 'normal', [71, 85, 105]);
        y += 1;
      }
    });

    const slug = title.replace(/[^a-z0-9]/gi, '-').toLowerCase().slice(0, 60);
    doc.setProperties({ title: `${title} — BRD Analysis Report` });
    doc.save(`${slug}-brd-analysis.pdf`);
  };

  const downloadKBEntryDocx = (entry) => {
    const htmlLines = (entry.content || '').split('\n').map((line) => {
      if (/^# /.test(line))   return `<h1>${line.slice(2)}</h1>`;
      if (/^## /.test(line))  return `<h2>${line.slice(3)}</h2>`;
      if (/^### /.test(line)) return `<h3>${line.slice(4)}</h3>`;
      if (/^[-*+] /.test(line)) return `<li>${line.replace(/^[-*+] /, '').replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>').replace(/\*(.+?)\*/g, '<em>$1</em>')}</li>`;
      if (/^\d+\. /.test(line)) return `<li>${line.replace(/^\d+\. /, '').replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>').replace(/\*(.+?)\*/g, '<em>$1</em>')}</li>`;
      if (/^> /.test(line))  return `<blockquote>${line.slice(2)}</blockquote>`;
      if (line.trim() === '') return '<br/>';
      return `<p>${line.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>').replace(/\*(.+?)\*/g, '<em>$1</em>').replace(/`(.+?)`/g, '<code>$1</code>')}</p>`;
    }).join('\n');

    const html = `<html xmlns:o='urn:schemas-microsoft-com:office:office' xmlns:w='urn:schemas-microsoft-com:office:word' xmlns='http://www.w3.org/TR/REC-html40'>
<head><meta charset='utf-8'>
<style>
  body { font-family: Calibri, sans-serif; font-size: 11pt; margin: 2.5cm; }
  h1 { font-size: 18pt; color: #1d4ed8; border-bottom: 1px solid #e2e8f0; padding-bottom: 4pt; }
  h2 { font-size: 14pt; color: #2563eb; }
  h3 { font-size: 12pt; color: #7c3aed; }
  li { margin-bottom: 4pt; }
  code { font-family: Consolas, monospace; background: #f1f5f9; padding: 1pt 3pt; }
  blockquote { border-left: 3pt solid #93c5fd; padding-left: 8pt; color: #64748b; font-style: italic; }
  p { margin: 4pt 0; line-height: 1.5; }
</style>
</head>
<body>
<h1>${entry.title}</h1>
<p style="color:#94a3b8;font-size:9pt">Category: ${entry.category} &nbsp;·&nbsp; Exported: ${new Date().toLocaleString()}</p>
<hr/>
${htmlLines}
</body></html>`;

    const blob = new Blob([html], { type: 'application/msword' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `kb-${entry.title.replace(/[^a-z0-9]/gi, '-').toLowerCase()}.doc`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const downloadKBEntryPdf = (entry) => {
    const doc = new jsPDF({ unit: 'mm', format: 'a4' });
    const pageW = doc.internal.pageSize.getWidth();
    const margin = 15;
    const maxW = pageW - margin * 2;
    let y = 20;

    const addText = (text, size = 10, style = 'normal', color = [30, 30, 30]) => {
      doc.setFontSize(size); doc.setFont('helvetica', style); doc.setTextColor(...color);
      const lines = doc.splitTextToSize(text, maxW);
      lines.forEach((line) => {
        if (y > 275) { doc.addPage(); y = 20; }
        doc.text(line, margin, y);
        y += size * 0.45;
      });
    };

    // Header bar
    doc.setFillColor(59, 130, 246);
    doc.rect(0, 0, pageW, 14, 'F');
    doc.setFontSize(11); doc.setFont('helvetica', 'bold'); doc.setTextColor(255, 255, 255);
    doc.text('Knowledge Base', margin, 9.5);
    doc.setFontSize(8); doc.setFont('helvetica', 'normal');
    doc.text(`${entry.category}  ·  ${new Date().toLocaleString()}`, pageW - margin, 9.5, { align: 'right' });
    y = 24;

    addText(entry.title, 14, 'bold', [15, 23, 42]);
    y += 3;

    (entry.content || '').split('\n').forEach((line) => {
      if (!line.trim()) { y += 3; return; }
      if (/^#{1,3}\s/.test(line)) {
        y += 2;
        if (y > 270) { doc.addPage(); y = 20; }
        doc.setFillColor(241, 245, 249);
        doc.rect(margin - 2, y - 5, maxW + 4, 7, 'F');
        addText(line.replace(/^#{1,3}\s/, ''), 10, 'bold', [30, 64, 175]);
        y += 1;
      } else if (/^[-*+]\s/.test(line)) {
        const txt = line.replace(/^[-*+]\s/, '').replace(/\*\*(.+?)\*\*/g, '$1');
        if (y > 275) { doc.addPage(); y = 20; }
        doc.setFontSize(9); doc.setFont('helvetica', 'normal'); doc.setTextColor(71, 85, 105);
        doc.text('•', margin + 1, y);
        doc.splitTextToSize(txt, maxW - 6).forEach((l) => {
          if (y > 275) { doc.addPage(); y = 20; }
          doc.text(l, margin + 5, y); y += 4.5;
        });
      } else {
        addText(line.replace(/\*\*(.+?)\*\*/g, '$1'), 9, 'normal', [71, 85, 105]);
        y += 1;
      }
    });

    doc.save(`kb-${entry.title.replace(/[^a-z0-9]/gi, '-').toLowerCase()}.pdf`);
  };

  useEffect(() => {
    if (analysis && analysisRef.current) {
      analysisRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }, [analysis]);

  const [expandedEntry, setExpandedEntry] = useState(null);

  const CAT_DOT = {
    'System Overview': 'bg-blue-500', 'Tech Stack': 'bg-violet-500',
    'Business Rules': 'bg-amber-500', 'Integration': 'bg-cyan-500',
    'Standards & Guidelines': 'bg-emerald-500', 'Domain Knowledge': 'bg-rose-500', 'General': 'bg-slate-400',
  };

  const visibleEntries = filteredKB.filter((e) => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    return e.title.toLowerCase().includes(q) || e.content.toLowerCase().includes(q);
  });

  return (
    <div className="flex gap-5" style={{ height: 'calc(100vh - 130px)' }}>

      {/* ── Full-page KB entry viewer modal ── */}
      {viewingEntry && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-6 bg-black/60 backdrop-blur-sm" onClick={() => setViewingEntry(null)}>
          <div className="relative bg-white dark:bg-slate-900 rounded-2xl shadow-2xl w-full max-w-3xl max-h-[90vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
            {/* Modal header */}
            <div className="flex items-start justify-between gap-4 px-6 py-4 border-b border-slate-100 dark:border-slate-800">
              <div className="min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <span className={`inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full flex-shrink-0 ${catColor(viewingEntry.category)}`}>
                    <span className={`w-1.5 h-1.5 rounded-full ${CAT_DOT[viewingEntry.category] || 'bg-slate-400'}`} />
                    {viewingEntry.category}
                  </span>
                </div>
                <h2 className="text-base font-bold text-slate-900 dark:text-white leading-snug">{viewingEntry.title}</h2>
              </div>
              <div className="flex items-center gap-1 flex-shrink-0">
                <button onClick={() => downloadKBEntryDocx(viewingEntry)} title="Download Word Doc"
                  className="p-2 rounded-lg text-slate-400 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-950/40 transition-colors">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
                </button>
                <button onClick={() => downloadKBEntryPdf(viewingEntry)} title="Download PDF"
                  className="p-2 rounded-lg text-slate-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-950/40 transition-colors">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" /></svg>
                </button>
                <button onClick={() => setViewingEntry(null)} title="Close"
                  className="p-2 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors ml-1">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                </button>
              </div>
            </div>
            {/* Modal body */}
            <div className="overflow-y-auto flex-1 px-6 py-5">
              <MarkdownRenderer text={viewingEntry.content} className="text-base leading-7" />
            </div>
          </div>
        </div>
      )}

      {/* ════════════════════════════════════════
          LEFT PANEL — Knowledge Base / Function Registry
      ════════════════════════════════════════ */}
      <div className="flex-1 min-w-0 flex flex-col gap-3">

        {/* Tab switcher */}
        <div className="flex items-center gap-1 bg-slate-100 dark:bg-slate-800 rounded-xl p-1 self-start">
          <button onClick={() => setLeftTab('kb')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${leftTab === 'kb' ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-sm' : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-300'}`}>
            Knowledge Base
          </button>
          <button onClick={() => setLeftTab('functions')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${leftTab === 'functions' ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-sm' : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-300'}`}>
            Function Registry
          </button>
        </div>

        {/* ── FUNCTION REGISTRY PANEL ── */}
        {leftTab === 'functions' && (
          <div className="flex flex-col gap-3 flex-1 min-h-0">
            {/* Header */}
            <div className="flex items-center justify-between">
              <div>
                <h1 className="text-base font-bold text-slate-900 dark:text-white">Function Registry</h1>
                <p className="text-xs text-slate-400 mt-0.5">{styleFeatures.length} builder {styleFeatures.length === 1 ? 'feature' : 'features'} · used for AI impact analysis</p>
              </div>
              <button onClick={() => { setShowAddSF(true); setEditingSF(null); setSfForm({ feature: '', tab: '', status: 'stable', keywords: '' }); }}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-medium transition-colors shadow-sm">
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
                New Feature
              </button>
            </div>

            {/* Tab filter chips */}
            <div className="flex items-center gap-1.5 overflow-x-auto pb-0.5 scrollbar-hide">
              {sfTabs.map(t => (
                <button key={t} onClick={() => setSfTabFilter(t)}
                  className={`px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap flex-shrink-0 transition-all ${
                    sfTabFilter === t
                      ? 'bg-slate-900 dark:bg-white text-white dark:text-slate-900 shadow-sm'
                      : 'bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 hover:border-slate-300'
                  }`}>
                  {t === 'all' ? `All (${styleFeatures.length})` : t}
                </button>
              ))}
            </div>

            {/* Search */}
            <div className="relative">
              <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400 pointer-events-none" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
              <input value={sfSearch} onChange={e => setSfSearch(e.target.value)}
                placeholder="Search features or keywords…"
                className="w-full pl-9 pr-3 py-2 text-sm rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 transition-colors" />
              {sfSearch && (
                <button onClick={() => setSfSearch('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                </button>
              )}
            </div>

            {/* Feature list */}
            <div className="flex flex-col gap-2 overflow-y-auto flex-1 pr-0.5">
              {sfLoading ? (
                <div className="flex items-center justify-center py-16 text-slate-400 text-sm">Loading…</div>
              ) : visibleSF.length === 0 ? (
                <div className="flex flex-col items-center justify-center gap-3 py-20 text-center border-2 border-dashed border-slate-200 dark:border-slate-700 rounded-2xl">
                  <p className="text-sm font-medium text-slate-500 dark:text-slate-400">{sfSearch ? 'No results found' : 'No features yet'}</p>
                  <p className="text-xs text-slate-400">{sfSearch ? 'Try a different search' : 'Click "New Feature" to add a builder function'}</p>
                </div>
              ) : visibleSF.map(sf => (
                <div key={sf.id} className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-3.5 group hover:shadow-md transition-all">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap mb-1">
                        <span className={`inline-flex items-center text-[10px] font-semibold px-2 py-0.5 rounded-full ${sfStatusColor(sf.status)}`}>
                          {sf.status}
                        </span>
                        <span className="text-[11px] text-slate-400 dark:text-slate-500 font-medium truncate">{sf.tab}</span>
                      </div>
                      <p className="text-sm font-semibold text-slate-800 dark:text-slate-100 leading-snug">{sf.feature}</p>
                      {Array.isArray(sf.keywords) && sf.keywords.length > 0 && (
                        <div className="flex flex-wrap gap-1 mt-2">
                          {sf.keywords.slice(0, 6).map((kw, i) => (
                            <span key={i} className="text-[10px] px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400">{kw}</span>
                          ))}
                          {sf.keywords.length > 6 && (
                            <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-400">+{sf.keywords.length - 6}</span>
                          )}
                        </div>
                      )}
                    </div>
                    <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0">
                      <button onClick={() => { setEditingSF(sf); setShowAddSF(false); setSfForm({ feature: sf.feature, tab: sf.tab, status: sf.status, keywords: Array.isArray(sf.keywords) ? sf.keywords.join(', ') : '' }); }}
                        title="Edit"
                        className="p-1.5 rounded-lg text-slate-400 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-950/40 transition-colors">
                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>
                      </button>
                      <button onClick={() => handleDeleteSF(sf.id)}
                        title="Delete"
                        className="p-1.5 rounded-lg text-slate-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-950/40 transition-colors">
                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {/* Add / Edit Function modal */}
            {(showAddSF || editingSF) && (
              <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4"
                onClick={() => { setShowAddSF(false); setEditingSF(null); }}>
                <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-700 w-full max-w-lg shadow-2xl"
                  onClick={e => e.stopPropagation()}>
                  <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 dark:border-slate-800">
                    <h3 className="font-bold text-slate-900 dark:text-white">{editingSF ? 'Edit Feature' : 'New Builder Feature'}</h3>
                    <button onClick={() => { setShowAddSF(false); setEditingSF(null); }}
                      className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors">
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                    </button>
                  </div>
                  <form onSubmit={handleSaveSF} className="p-6 space-y-4">
                    <div>
                      <label className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide mb-1.5 block">Feature Name</label>
                      <input value={sfForm.feature} onChange={e => setSfForm({ ...sfForm, feature: e.target.value })}
                        placeholder="e.g. Fabric Flow (Upgrade)"
                        autoFocus
                        className="w-full px-3 py-2.5 text-sm rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 transition-colors" />
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide mb-1.5 block">Tab / Section</label>
                        <input value={sfForm.tab} onChange={e => setSfForm({ ...sfForm, tab: e.target.value })}
                          placeholder="e.g. Options Tab"
                          className="w-full px-3 py-2.5 text-sm rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 transition-colors" />
                      </div>
                      <div>
                        <label className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide mb-1.5 block">Status</label>
                        <select value={sfForm.status} onChange={e => setSfForm({ ...sfForm, status: e.target.value })}
                          className="w-full px-3 py-2.5 text-sm rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 transition-colors">
                          {SF_STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
                        </select>
                      </div>
                    </div>
                    <div>
                      <label className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide mb-1.5 block">Keywords</label>
                      <textarea value={sfForm.keywords} onChange={e => setSfForm({ ...sfForm, keywords: e.target.value })}
                        placeholder="comma-separated keywords, e.g. fabric upgrade, upgrade fee, upgrade flow"
                        rows={3}
                        className="w-full px-3 py-2.5 text-sm rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none transition-colors" />
                      <p className="text-[11px] text-slate-400 mt-1">Comma-separated. Used to match BRD descriptions during analysis.</p>
                    </div>
                    <div className="flex gap-2 pt-1">
                      <button type="submit"
                        className="flex-1 bg-blue-600 hover:bg-blue-700 text-white py-2.5 rounded-xl text-sm font-semibold transition-colors shadow-sm">
                        {editingSF ? 'Save Changes' : 'Create Feature'}
                      </button>
                      <button type="button" onClick={() => { setShowAddSF(false); setEditingSF(null); }}
                        className="px-5 py-2.5 bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 rounded-xl text-sm font-medium transition-colors hover:bg-slate-200 dark:hover:bg-slate-700">
                        Cancel
                      </button>
                    </div>
                  </form>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── KNOWLEDGE BASE PANEL ── */}
        {leftTab === 'kb' && (<>

        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-base font-bold text-slate-900 dark:text-white">Knowledge Base</h1>
            <p className="text-xs text-slate-400 mt-0.5">{kbEntries.length} {kbEntries.length === 1 ? 'entry' : 'entries'} · used as AI analysis context</p>
          </div>
          <div className="flex items-center gap-2">
            <input ref={fileInputRef} type="file" accept=".md" multiple className="hidden" onChange={handleMDUpload} />
            <button onClick={() => fileInputRef.current?.click()} disabled={uploading}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 text-xs font-medium transition-colors disabled:opacity-50">
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" /></svg>
              {uploading ? 'Reading…' : 'Upload .md'}
            </button>
            <button onClick={() => { setShowAddKB(true); setEditingKB(null); setKbForm({ title: '', category: 'General', content: '' }); }}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-medium transition-colors shadow-sm">
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
              New Entry
            </button>
          </div>
        </div>

        {/* Category tabs */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-0.5 scrollbar-hide">
          {[{ key: 'all', label: 'All', count: kbEntries.length },
            ...KB_CATEGORIES.map((c) => ({ key: c, label: c, count: kbEntries.filter((e) => e.category === c).length }))
          ].filter(({ key, count }) => key === 'all' || count > 0).map(({ key, label, count }) => (
            <button key={key} onClick={() => { setActiveCategory(key); setSearchQuery(''); }}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition-all flex-shrink-0 ${
                activeCategory === key
                  ? 'bg-slate-900 dark:bg-white text-white dark:text-slate-900 shadow-sm'
                  : 'bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 hover:border-slate-300 dark:hover:border-slate-600'
              }`}>
              {key !== 'all' && <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${CAT_DOT[key] || 'bg-slate-400'}`} />}
              {label}
              <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${activeCategory === key ? 'bg-white/20 text-white dark:bg-black/20 dark:text-slate-900' : 'bg-slate-100 dark:bg-slate-700 text-slate-500 dark:text-slate-400'}`}>{count}</span>
            </button>
          ))}
        </div>

        {/* Search */}
        <div className="relative">
          <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400 pointer-events-none" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
          <input value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search entries…"
            className="w-full pl-9 pr-3 py-2 text-sm rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 transition-colors" />
          {searchQuery && (
            <button onClick={() => setSearchQuery('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
            </button>
          )}
        </div>

        {/* Entry list */}
        <div className="flex flex-col gap-2.5 overflow-y-auto flex-1 pr-0.5">
          {visibleEntries.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-3 py-20 text-center border-2 border-dashed border-slate-200 dark:border-slate-700 rounded-2xl">
              <div className="w-12 h-12 bg-slate-100 dark:bg-slate-800 rounded-xl flex items-center justify-center">
                <svg className="w-6 h-6 text-slate-300 dark:text-slate-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" /></svg>
              </div>
              <div>
                <p className="text-sm font-medium text-slate-500 dark:text-slate-400">{searchQuery ? 'No results found' : 'No entries yet'}</p>
                <p className="text-xs text-slate-400 dark:text-slate-500 mt-1">{searchQuery ? 'Try a different search term' : 'Click "New Entry" to add your first knowledge base entry'}</p>
              </div>
            </div>
          ) : visibleEntries.map((entry) => {
            const isExpanded = expandedEntry === entry.id;
            const wordCount = entry.content?.trim().split(/\s+/).filter(Boolean).length || 0;
            return (
              <div key={entry.id}
                className={`bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 border-l-4 ${catBorder(entry.category)} group hover:shadow-md transition-all`}>
                <div className="p-4">
                  {/* Card top row */}
                  <div className="flex items-start justify-between gap-3 mb-2">
                    <div className="flex items-center gap-2 min-w-0 flex-1">
                      <span className={`inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full flex-shrink-0 ${catColor(entry.category)}`}>
                        <span className={`w-1.5 h-1.5 rounded-full ${CAT_DOT[entry.category] || 'bg-slate-400'}`} />
                        {entry.category}
                      </span>
                    </div>
                    <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0">
                      <button onClick={() => setViewingEntry(entry)}
                        title="View full page"
                        className="p-1.5 rounded-lg text-slate-400 hover:text-violet-600 hover:bg-violet-50 dark:hover:bg-violet-950/40 transition-colors">
                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" /></svg>
                      </button>
                      <button onClick={() => { setEditingKB(entry); setShowAddKB(false); setKbForm({ title: entry.title, category: entry.category, content: entry.content }); }}
                        title="Edit"
                        className="p-1.5 rounded-lg text-slate-400 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-950/40 transition-colors">
                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>
                      </button>
                      <button onClick={() => downloadKBEntryDocx(entry)}
                        title="Download Word Doc"
                        className="p-1.5 rounded-lg text-slate-400 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-950/40 transition-colors">
                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
                      </button>
                      <button onClick={() => downloadKBEntryPdf(entry)}
                        title="Download PDF"
                        className="p-1.5 rounded-lg text-slate-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-950/40 transition-colors">
                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" /></svg>
                      </button>
                      <button onClick={() => handleDeleteKB(entry.id)}
                        title="Delete"
                        className="p-1.5 rounded-lg text-slate-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-950/40 transition-colors">
                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                      </button>
                    </div>
                  </div>

                  {/* Title */}
                  <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-100 mb-2 leading-snug">{entry.title}</h3>

                  {/* Content */}
                  <div className={`overflow-y-auto transition-all ${isExpanded ? 'max-h-72' : 'max-h-16 overflow-hidden'}`}>
                    <MarkdownRenderer text={entry.content} />
                  </div>

                  {/* Footer */}
                  <div className="flex items-center justify-between mt-3 pt-2.5 border-t border-slate-100 dark:border-slate-800">
                    <span className="text-[11px] text-slate-400">{wordCount} {wordCount === 1 ? 'word' : 'words'}</span>
                    {entry.content?.length > 150 && (
                      <button onClick={() => setExpandedEntry(isExpanded ? null : entry.id)}
                        className="text-xs text-blue-500 hover:text-blue-700 dark:hover:text-blue-400 font-medium flex items-center gap-1 transition-colors">
                        {isExpanded
                          ? <><svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" /></svg>Collapse</>
                          : <><svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>Read more</>
                        }
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
        </>)}
      </div>

      {/* ════════════════════════════════════════
          RIGHT PANEL — AI Analysis
      ════════════════════════════════════════ */}
      <div className="w-96 flex-shrink-0 flex flex-col gap-3 overflow-y-auto">

        {/* Panel title */}
        <div className="flex items-center gap-2.5 px-1">
          <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-blue-500 to-violet-600 flex items-center justify-center flex-shrink-0">
            <svg className="w-3.5 h-3.5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" /></svg>
          </div>
          <div>
            <h2 className="text-sm font-bold text-slate-900 dark:text-white">AI Analysis</h2>
            <p className="text-[11px] text-slate-400">Compares BRD or doc against KB</p>
          </div>
        </div>

        {/* Input card */}
        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-4 flex flex-col gap-3">

          {/* BRD selector */}
          <div>
            <label className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide mb-1.5 block">BRD</label>
            <select value={selectedBRDId} onChange={(e) => { setSelectedBRDId(e.target.value); setAnalysis(null); setError(''); }}
              className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-800 dark:text-slate-100 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 transition-colors">
              <option value="">{localDocText ? 'Optional — link to a BRD' : 'Select a BRD…'}</option>
              {brds.map((b) => <option key={b.id} value={b.id}>{fmtTitle(b.title)} · {b.quarter} {b.year}</option>)}
            </select>
          </div>

          {/* Selected BRD chip */}
          {selectedBRD && (
            <div className="flex flex-wrap gap-1.5">
              {[`${selectedBRD.quarter} ${selectedBRD.year}`, selectedBRD.status, selectedBRD.tshirtSize && `Size ${selectedBRD.tshirtSize}`, `${brdBugs.length} bugs`].filter(Boolean).map((chip) => (
                <span key={chip} className="text-[11px] px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 capitalize">{chip}</span>
              ))}
            </div>
          )}

          {/* Divider */}
          <div className="flex items-center gap-2">
            <div className="flex-1 h-px bg-slate-100 dark:bg-slate-800" />
            <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">or upload doc</span>
            <div className="flex-1 h-px bg-slate-100 dark:bg-slate-800" />
          </div>

          {/* Doc upload */}
          <input ref={docFileRef} type="file" accept=".txt,.md,.docx" className="hidden" onChange={handleDocFileUpload} />
          {localDocName ? (
            <div className="flex items-center gap-2 p-2.5 bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800 rounded-xl">
              <svg className="w-4 h-4 text-emerald-500 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
              <span className="text-xs text-emerald-700 dark:text-emerald-400 font-medium truncate flex-1">{localDocName}</span>
              <button onClick={() => { setLocalDocText(null); setLocalDocName(''); }} className="text-slate-400 hover:text-red-500 flex-shrink-0 transition-colors">
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>
          ) : (
            <button onClick={() => docFileRef.current?.click()}
              className="flex items-center justify-center gap-2 w-full px-3 py-2.5 rounded-xl border-2 border-dashed border-slate-200 dark:border-slate-700 hover:border-blue-300 dark:hover:border-blue-700 text-slate-500 dark:text-slate-400 hover:text-blue-600 dark:hover:text-blue-400 text-xs font-medium transition-all">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" /></svg>
              Upload .txt / .md / .docx
            </button>
          )}

          {/* Error */}
          {error && (
            <div className="flex items-start gap-2 p-3 bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800 rounded-xl">
              <svg className="w-4 h-4 text-red-500 mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
              <p className="text-xs text-red-700 dark:text-red-400">{error}</p>
            </div>
          )}

          {/* Analyze button */}
          <button onClick={handleAnalyze}
            disabled={(!selectedBRDId && !localDocText) || analyzing || (kbEntries.length === 0 && !localDocText)}
            className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl bg-gradient-to-r from-blue-600 to-violet-600 hover:from-blue-700 hover:to-violet-700 disabled:from-slate-200 disabled:to-slate-200 dark:disabled:from-slate-700 dark:disabled:to-slate-700 text-white disabled:text-slate-400 dark:disabled:text-slate-500 text-sm font-semibold transition-all shadow-sm hover:shadow-md disabled:shadow-none disabled:cursor-not-allowed">
            {analyzing
              ? <><svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg>Analyzing…</>
              : <><svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>Analyze</>
            }
          </button>
        </div>

        {/* Spinner */}
        {analyzing && (
          <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-8 flex flex-col items-center gap-3">
            <div className="relative w-12 h-12">
              <div className="absolute inset-0 rounded-full border-4 border-blue-100 dark:border-blue-900/50" />
              <div className="absolute inset-0 rounded-full border-4 border-blue-500 border-t-transparent animate-spin" />
            </div>
            <p className="text-xs text-slate-400 font-medium">Analyzing against {kbEntries.length} KB {kbEntries.length === 1 ? 'entry' : 'entries'}…</p>
          </div>
        )}

        {/* Empty state */}
        {!analysis && !analyzing && !error && (
          <div className="flex-1 flex flex-col items-center justify-center gap-3 p-8 text-center border-2 border-dashed border-slate-200 dark:border-slate-700 rounded-2xl">
            <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-blue-50 to-violet-50 dark:from-blue-950/30 dark:to-violet-950/30 flex items-center justify-center">
              <svg className="w-6 h-6 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" /></svg>
            </div>
            <p className="text-sm font-medium text-slate-500 dark:text-slate-400">Select a BRD or upload a document, then click Analyze</p>
            {kbEntries.length === 0 && (
              <p className="text-xs text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 px-3 py-2 rounded-xl">
                Add KB entries first for richer analysis
              </p>
            )}
          </div>
        )}

        {/* Analysis result */}
        {analysis && !analyzing && (
          <div ref={analysisRef} className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 overflow-hidden">
            {/* Result header */}
            <div className="px-4 py-3 bg-gradient-to-r from-blue-50 to-violet-50 dark:from-blue-950/20 dark:to-violet-950/20 border-b border-slate-100 dark:border-slate-800">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-sm font-bold text-slate-900 dark:text-white truncate">{selectedBRD ? fmtTitle(selectedBRD.title) : (localDocName || 'Document')}</p>
	                  <div className="flex items-center gap-1.5 mt-1 flex-wrap">
	                    <span className={`inline-flex items-center gap-1 text-[11px] font-medium px-2 py-0.5 rounded-full ${analysisMode === 'local' ? 'bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300' : 'bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300'}`}>
	                      <span className={`w-1.5 h-1.5 rounded-full ${analysisMode === 'local' ? 'bg-amber-500' : 'bg-emerald-500'}`} />
		                      {analysisMode === 'local' ? 'Rule-based' : aiProviderLabel}
	                    </span>
                    {docFetched && (
                      <span className="text-[11px] px-2 py-0.5 rounded-full bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300 font-medium">
                        {localDocName ? '📄 Local doc' : '🔗 Google Doc'}
                      </span>
	                    )}
	                  </div>
                    {analysisMode === 'local' && (
                      <p className="mt-1 text-[11px] text-amber-700 dark:text-amber-300">
	                        {localReasonMessage}
                      </p>
                    )}
	                </div>
	                <div className="flex items-center gap-1 flex-shrink-0">
                  <button onClick={() => { navigator.clipboard?.writeText(analysis); notify('Copied'); }}
                    title="Copy" className="p-1.5 rounded-lg text-slate-400 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-950/40 transition-colors">
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" /></svg>
                  </button>
                  <button onClick={downloadTxt} title="Download TXT"
                    className="p-1.5 rounded-lg text-slate-400 hover:text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-950/40 transition-colors">
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>
                  </button>
                  <button onClick={downloadDocx} title="Download Word Doc"
                    className="p-1.5 rounded-lg text-slate-400 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-950/40 transition-colors">
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
                  </button>
                  <button onClick={downloadPdf} title="Download PDF"
                    className="p-1.5 rounded-lg text-slate-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-950/40 transition-colors">
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" /></svg>
                  </button>
                </div>
              </div>
            </div>
            {/* Result body */}
            <div className="p-4 overflow-y-auto" style={{ maxHeight: 'calc(100vh - 420px)' }}>
              <MarkdownRenderer text={analysis} />
            </div>
          </div>
        )}
      </div>

      {/* ════════════════════════════════════════
          ADD / EDIT MODAL
      ════════════════════════════════════════ */}
      {(showAddKB || editingKB) && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4"
          onClick={() => { setShowAddKB(false); setEditingKB(null); }}>
          <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-700 w-full max-w-xl shadow-2xl"
            onClick={(e) => e.stopPropagation()}>
            {/* Modal header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 dark:border-slate-800">
              <h3 className="font-bold text-slate-900 dark:text-white">{editingKB ? 'Edit Entry' : 'New Knowledge Base Entry'}</h3>
              <button onClick={() => { setShowAddKB(false); setEditingKB(null); }}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>
            <form onSubmit={handleSaveKB} className="p-6 space-y-4">
              {/* Title */}
              <div>
                <label className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide mb-1.5 block">Title</label>
                <input value={kbForm.title} onChange={(e) => setKbForm({ ...kbForm, title: e.target.value })}
                  placeholder="e.g. API Authentication Standards"
                  autoFocus
                  className="w-full px-3 py-2.5 text-sm rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 transition-colors" />
              </div>
              {/* Category */}
              <div>
                <label className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide mb-1.5 block">Category</label>
                <div className="flex flex-wrap gap-2">
                  {KB_CATEGORIES.map((c) => (
                    <button key={c} type="button" onClick={() => setKbForm({ ...kbForm, category: c })}
                      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-all ${kbForm.category === c ? catColor(c) + ' shadow-sm ring-2 ring-offset-1 ring-blue-400' : 'bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700'}`}>
                      <span className={`w-1.5 h-1.5 rounded-full ${CAT_DOT[c] || 'bg-slate-400'}`} />
                      {c}
                    </button>
                  ))}
                </div>
              </div>
              {/* Content */}
              <div>
                <label className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide mb-1.5 block">Content</label>
                <textarea value={kbForm.content} onChange={(e) => setKbForm({ ...kbForm, content: e.target.value })}
                  placeholder="Describe this knowledge base entry in detail. The richer the content, the better the AI analysis will be."
                  rows={8}
                  className="w-full px-3 py-2.5 text-sm rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none transition-colors" />
                <p className="text-[11px] text-slate-400 mt-1">{kbForm.content.trim().split(/\s+/).filter(Boolean).length} words</p>
              </div>
              {/* Actions */}
              <div className="flex gap-2 pt-1">
                <button type="submit"
                  className="flex-1 bg-blue-600 hover:bg-blue-700 text-white py-2.5 rounded-xl text-sm font-semibold transition-colors shadow-sm">
                  {editingKB ? 'Save Changes' : 'Create Entry'}
                </button>
                <button type="button" onClick={() => { setShowAddKB(false); setEditingKB(null); }}
                  className="px-5 py-2.5 bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 rounded-xl text-sm font-medium transition-colors hover:bg-slate-200 dark:hover:bg-slate-700">
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
