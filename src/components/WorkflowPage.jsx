import { useState, useMemo } from 'react';
import { MIN_BUG_THRESHOLD, getSprintLabel, YEARS } from '../utils/constants';
import { fmtTitle } from '../utils/db';
import { exportWorkflowToExcel } from '../utils/excelExport';

// ── Shape Components ──────────────────────────────────────────────────────────

const OvalNode = ({ label, sub }) => (
  <div className="flex justify-center">
    <div className="px-8 py-2 rounded-full border-2 border-slate-600 dark:border-slate-400 bg-white dark:bg-slate-900 text-sm font-bold text-slate-900 dark:text-white text-center min-w-[140px]">
      {label}
      {sub && <p className="text-xs font-normal text-slate-500 mt-0.5">{sub}</p>}
    </div>
  </div>
);

const RectNode = ({ label, people = [], children, highlight }) => (
  <div className={`border-2 bg-white dark:bg-slate-900 p-3 min-w-[180px] ${highlight ? 'border-blue-400 dark:border-blue-600' : 'border-slate-400 dark:border-slate-600'}`}>
    <p className="text-xs font-bold text-center text-slate-900 dark:text-white leading-tight">{label}</p>
    {people.length > 0 && (
      <div className="flex flex-wrap justify-center gap-x-2 gap-y-0 mt-1.5">
        {people.map(p => <span key={p} className="text-xs text-slate-600 dark:text-slate-400">{p}</span>)}
      </div>
    )}
    {children && <div className="mt-2 space-y-1">{children}</div>}
  </div>
);

const DocNode = ({ label, children }) => (
  <div className="relative border-2 border-slate-400 dark:border-slate-600 bg-white dark:bg-slate-900 px-3 pt-3 pb-3 min-w-[160px]"
    style={{ clipPath: 'polygon(0 0, calc(100% - 18px) 0, 100% 18px, 100% 100%, 0 100%)' }}>
    <div className="absolute top-0 right-0 w-[18px] h-[18px] border-l-2 border-b-2 border-slate-400 dark:border-slate-600 bg-slate-100 dark:bg-slate-800" />
    <p className="text-xs font-bold text-center text-slate-900 dark:text-white">{label}</p>
    {children && <div className="mt-2 space-y-1">{children}</div>}
  </div>
);

const DiamondNode = ({ label }) => (
  <div className="flex justify-center">
    <div className="relative flex items-center justify-center" style={{ width: 140, height: 72 }}>
      <svg viewBox="0 0 140 72" className="absolute inset-0 w-full h-full" fill="none">
        <polygon points="70,4 136,36 70,68 4,36" stroke="currentColor" strokeWidth="2" className="text-slate-500 dark:text-slate-400" fill="white" />
      </svg>
      <svg viewBox="0 0 140 72" className="absolute inset-0 w-full h-full dark:hidden" fill="none">
        <polygon points="70,4 136,36 70,68 4,36" stroke="#64748b" strokeWidth="2" fill="white" />
      </svg>
      <svg viewBox="0 0 140 72" className="absolute inset-0 w-full h-full hidden dark:block" fill="none">
        <polygon points="70,4 136,36 70,68 4,36" stroke="#94a3b8" strokeWidth="2" fill="#0f172a" />
      </svg>
      <span className="relative z-10 text-xs font-bold text-center text-slate-900 dark:text-white leading-tight px-6">{label}</span>
    </div>
  </div>
);

const ParallelNode = ({ label }) => (
  <div className="flex justify-center">
    <div className="border-2 border-slate-400 dark:border-slate-600 bg-white dark:bg-slate-900 px-5 py-2 min-w-[180px] text-center"
      style={{ transform: 'skewX(-12deg)' }}>
      <span className="text-xs font-semibold text-slate-900 dark:text-white" style={{ display: 'inline-block', transform: 'skewX(12deg)' }}>
        {label}
      </span>
    </div>
  </div>
);

const ArrowDown = ({ label, dashed = true, length = 'h-12' }) => (
  <div className="flex flex-col items-center">
    <div className={`w-0 ${length} border-l-2 ${dashed ? 'border-dashed border-slate-400 dark:border-slate-500' : 'border-solid border-slate-400 dark:border-slate-500'}`} />
    {label && <span className="text-xs text-slate-500 dark:text-slate-400 my-1">{label}</span>}
    <div className="w-0 h-0 border-l-[5px] border-l-transparent border-r-[5px] border-r-transparent border-t-[7px] border-t-slate-400 dark:border-t-slate-500" />
  </div>
);

const ArrowRight = ({ label, width = 'w-12' }) => (
  <div className="flex items-center">
    <div className={`h-0 ${width} border-t-2 border-dashed border-slate-400 dark:border-slate-500`} />
    {label && <span className="text-xs text-slate-500 dark:text-slate-400 mx-1.5">{label}</span>}
    <div className="w-0 h-0 border-t-[5px] border-t-transparent border-b-[5px] border-b-transparent border-l-[7px] border-l-slate-400 dark:border-l-slate-500" />
  </div>
);

const LayerBracket = ({ label, children }) => (
  <div className="flex items-stretch gap-2">
    <div className="flex items-center">
      <div className="flex flex-col items-center">
        <div className="w-4 h-4 border-t-2 border-l-2 border-slate-500 dark:border-slate-400" />
        <div className="w-0 flex-1 border-l-2 border-slate-500 dark:border-slate-400" />
        <div className="w-4 h-4 border-b-2 border-l-2 border-slate-500 dark:border-slate-400" />
      </div>
      <span className="text-xs font-bold text-slate-600 dark:text-slate-400 uppercase tracking-widest rotate-[-90deg] ml-1 whitespace-nowrap"
        style={{ writingMode: 'horizontal-tb', transform: 'rotate(-90deg)', transformOrigin: 'center', minWidth: 60, textAlign: 'center' }}>
        {label}
      </span>
    </div>
    <div className="flex-1">{children}</div>
  </div>
);

// ── BRD Mini Card ─────────────────────────────────────────────────────────────
const BrdCard = ({ brd, bugs, onSelectBRD }) => {
  const bugCount = bugs.filter(b => b.brdId === brd.id).length;
  return (
    <button onClick={() => onSelectBRD(brd.id)}
      className="w-full text-left bg-blue-50 dark:bg-blue-950 border border-blue-200 dark:border-blue-800 rounded px-2 py-1.5 hover:bg-blue-100 dark:hover:bg-blue-900 transition-colors">
      <p className="text-xs font-semibold text-slate-900 dark:text-white truncate leading-snug">{fmtTitle(brd.title)}</p>
      <div className="flex items-center justify-between mt-0.5 gap-1">
        <span className="text-xs text-slate-500 dark:text-slate-400 truncate">{brd.baName || '—'}</span>
        {bugCount > 0 && (
          <span className={`text-xs font-bold flex-shrink-0 ${bugCount > MIN_BUG_THRESHOLD ? 'text-red-500' : 'text-slate-400'}`}>
            {bugCount}🐛
          </span>
        )}
      </div>
    </button>
  );
};

// ── BRD Count Badge ───────────────────────────────────────────────────────────
const CountBadge = ({ count, color = 'bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-300' }) =>
  count > 0 ? <span className={`inline-flex items-center justify-center w-5 h-5 rounded-full text-xs font-bold ${color}`}>{count}</span> : null;

// ── Main Component ────────────────────────────────────────────────────────────
export default function WorkflowPage({ brds, bugs, onSelectBRD }) {
  const [view, setView] = useState('flow');
  const [filterYear, setFilterYear] = useState(new Date().getFullYear());
  const [filterBA, setFilterBA] = useState('');

  const uniqueBAs = useMemo(() => [...new Set(brds.map(b => b.baName).filter(Boolean))].sort(), [brds]);

  const filteredBRDs = useMemo(() => brds.filter(b => {
    if (filterYear && b.year !== filterYear) return false;
    if (filterBA && b.baName !== filterBA) return false;
    return true;
  }), [brds, filterYear, filterBA]);

  const by = (status) => filteredBRDs.filter(b => b.status === status);
  const planning = by('planning');
  const inprogress = by('inprogress');
  const development = by('development');
  const testing = by('testing');
  const launched = by('launched');
  const onhold = by('onhold');

  // ── Table view state
  const WORKFLOW_STAGES = [
    { value: 'planning',    label: 'BA / SA Review',  bg: 'bg-indigo-50 dark:bg-indigo-950', text: 'text-indigo-700 dark:text-indigo-300' },
    { value: 'inprogress',  label: 'DEV Review',       bg: 'bg-amber-50 dark:bg-amber-950',   text: 'text-amber-700 dark:text-amber-300' },
    { value: 'development', label: 'Development',       bg: 'bg-blue-50 dark:bg-blue-950',     text: 'text-blue-700 dark:text-blue-300' },
    { value: 'testing',     label: 'Testing / QA',      bg: 'bg-violet-50 dark:bg-violet-950', text: 'text-violet-700 dark:text-violet-300' },
    { value: 'launched',    label: 'Launched',           bg: 'bg-emerald-50 dark:bg-emerald-950', text: 'text-emerald-700 dark:text-emerald-300' },
    { value: 'onhold',      label: 'On Hold',            bg: 'bg-red-50 dark:bg-red-950',       text: 'text-red-700 dark:text-red-300' },
  ];

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-5">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="font-semibold text-slate-900 dark:text-white">Workflow Pipeline</h2>
            <p className="text-xs text-slate-400 mt-0.5">BRD development process flowchart</p>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={() => setView('flow')} title="Flow view"
              className={`p-2 rounded-lg transition-colors ${view === 'flow' ? 'bg-blue-100 dark:bg-blue-950 text-blue-600 dark:text-blue-400' : 'text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'}`}>
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 17V7m0 10a2 2 0 01-2 2H5a2 2 0 01-2-2v-2a2 2 0 012-2h2a2 2 0 012 2m0-10a2 2 0 00-2-2H5a2 2 0 00-2 2v2a2 2 0 002 2h2a2 2 0 002-2m10 10v-6a2 2 0 00-2-2h-2a2 2 0 00-2 2v2a2 2 0 002 2h2a2 2 0 002-2" />
              </svg>
            </button>
            <button onClick={() => setView('table')} title="Table view"
              className={`p-2 rounded-lg transition-colors ${view === 'table' ? 'bg-blue-100 dark:bg-blue-950 text-blue-600 dark:text-blue-400' : 'text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'}`}>
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
              </svg>
            </button>
            <div className="w-px h-5 bg-slate-200 dark:bg-slate-700" />
            <button onClick={() => exportWorkflowToExcel(filteredBRDs, bugs)}
              className="flex items-center gap-2 bg-green-600 hover:bg-green-700 text-white px-3 py-1.5 rounded-lg text-xs font-medium transition-colors">
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
              Export
            </button>
          </div>
        </div>

        {/* Filters */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-semibold text-slate-600 dark:text-slate-400 uppercase tracking-wide mb-1">Year</label>
            <select value={filterYear} onChange={e => setFilterYear(Number(e.target.value))}
              className="w-full px-2 py-1.5 text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500">
              {YEARS.map(y => <option key={y} value={y}>{y}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-600 dark:text-slate-400 uppercase tracking-wide mb-1">BA</label>
            <select value={filterBA} onChange={e => setFilterBA(e.target.value)}
              className="w-full px-2 py-1.5 text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500">
              <option value="">All BAs</option>
              {uniqueBAs.map(ba => <option key={ba} value={ba}>{ba}</option>)}
            </select>
          </div>
        </div>
      </div>

      {/* ── FLOWCHART VIEW ─────────────────────────────────────────────────── */}
      {view === 'flow' && (
        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-6 overflow-x-auto">
          <div className="min-w-[900px]">

            {/* Legend - top right */}
            <div className="flex justify-end gap-8 mb-6 text-xs text-slate-600 dark:text-slate-400">
              <div className="text-center">
                <p className="font-bold bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 px-2 py-0.5 mb-1">Acting solution analysis</p>
                <p>Imman, Leslie, Jowin</p>
              </div>
              <div className="text-center">
                <p className="font-bold text-slate-700 dark:text-slate-300 mb-1">Technical Expert</p>
                <p>Arvin</p>
                <p>Eric</p>
                <p>Cors</p>
                <p>Nino</p>
                <p>Dani</p>
              </div>
              <div className="text-center">
                <p className="font-bold text-slate-700 dark:text-slate-300 mb-1">PACKAGE APP</p>
                <p>Quickstrike Builder</p>
                <p>PDF Service</p>
                <p>Picker Package App</p>
                <p className="mt-1 font-semibold">QX7 API</p>
                <div className="flex gap-3 mt-1">
                  <div className="text-center"><p>Vector Soft</p></div>
                  <div className="text-center"><p>Inksoft</p></div>
                </div>
              </div>
            </div>

            {/* Main flowchart - simplified structure matching image exactly */}
            <div className="flex gap-8">

              {/* LEFT: Layer Brackets */}
              <div className="flex flex-col gap-0 flex-shrink-0" style={{ minWidth: 60 }}>
                {/* LAYER 1 */}
                <div className="flex items-center" style={{ height: 280 }}>
                  <div className="flex flex-col items-center h-full">
                    <div className="w-4 h-4 border-t-2 border-l-2 border-slate-500 dark:border-slate-400" />
                    <div className="flex-1 border-l-2 border-slate-500 dark:border-slate-400" />
                    <div className="w-4 h-4 border-b-2 border-l-2 border-slate-500 dark:border-slate-400" />
                  </div>
                  <p className="text-xs font-bold text-slate-600 dark:text-slate-400 ml-2" style={{ writingMode: 'vertical-rl', transform: 'rotate(180deg)' }}>LAYER 1</p>
                </div>

                {/* Spacer */}
                <div style={{ height: 240 }} />

                {/* LAYER 2 */}
                <div className="flex items-center" style={{ height: 280 }}>
                  <div className="flex flex-col items-center h-full">
                    <div className="w-4 h-4 border-t-2 border-l-2 border-slate-500 dark:border-slate-400" />
                    <div className="flex-1 border-l-2 border-slate-500 dark:border-slate-400" />
                    <div className="w-4 h-4 border-b-2 border-l-2 border-slate-500 dark:border-slate-400" />
                  </div>
                  <p className="text-xs font-bold text-slate-600 dark:text-slate-400 ml-2" style={{ writingMode: 'vertical-rl', transform: 'rotate(180deg)' }}>LAYER 2</p>
                </div>
              </div>

              {/* CENTER: Main Flow */}
              <div className="flex flex-col items-center gap-0 flex-shrink-0" style={{ minWidth: 200 }}>
                <OvalNode label="START" />
                <div style={{ height: 32 }} className="flex justify-center"><div className="w-0 h-full border-l-2 border-dashed border-slate-400 dark:border-slate-500" /></div>

                <RectNode label="BA gathers initial requirements" />
                <div style={{ height: 32 }} className="flex justify-center"><div className="w-0 h-full border-l-2 border-dashed border-slate-400 dark:border-slate-500" /></div>

                <DocNode label="BA creates RD">
                  {planning.slice(0, 2).map(brd => <BrdCard key={brd.id} brd={brd} bugs={bugs} onSelectBRD={onSelectBRD} />)}
                  {planning.length > 2 && <p className="text-xs text-slate-400 text-center">+{planning.length - 2} more</p>}
                </DocNode>
                <div style={{ height: 32 }} className="flex justify-center"><div className="w-0 h-full border-l-2 border-dashed border-slate-400 dark:border-slate-500" /></div>

                <RectNode label="SA reviews RD" people={['Imman Cors', 'Leslie', 'Arvin Jowin', 'Nino']} />
                <div style={{ height: 32 }} className="flex justify-center"><div className="w-0 h-full border-l-2 border-dashed border-slate-400 dark:border-slate-500" /></div>

                <DiamondNode label="Clarification needed?" />
                <div style={{ height: 32 }} className="flex justify-center"><div className="w-0 h-full border-l-2 border-dashed border-slate-400 dark:border-slate-500" /><span className="text-xs text-slate-500 mx-1">NO</span></div>

                <RectNode label="Assign to DEV">
                  {inprogress.map(brd => <BrdCard key={brd.id} brd={brd} bugs={bugs} onSelectBRD={onSelectBRD} />)}
                  {inprogress.length === 0 && <p className="text-xs text-slate-400 text-center mt-1">—</p>}
                </RectNode>
                <div style={{ height: 32 }} className="flex justify-center"><div className="w-0 h-full border-l-2 border-dashed border-slate-400 dark:border-slate-500" /></div>

                <RectNode label="DEV technical review" highlight />
                <div style={{ height: 32 }} className="flex justify-center"><div className="w-0 h-full border-l-2 border-dashed border-slate-400 dark:border-slate-500" /></div>

                <DiamondNode label="Technical conflict / risk?" />
                <div style={{ height: 32 }} className="flex justify-center"><div className="w-0 h-full border-l-2 border-dashed border-slate-400 dark:border-slate-500" /><span className="text-xs text-slate-500 mx-1">NO</span></div>

                <RectNode label="DEV estimation">
                  {development.map(brd => <BrdCard key={brd.id} brd={brd} bugs={bugs} onSelectBRD={onSelectBRD} />)}
                  {development.length === 0 && <p className="text-xs text-slate-400 text-center mt-1">—</p>}
                </RectNode>
                <div style={{ height: 32 }} className="flex justify-center"><div className="w-0 h-full border-l-2 border-dashed border-slate-400 dark:border-slate-500" /></div>

                <RectNode label="PM creates development ticket" />
                <div style={{ height: 32 }} className="flex justify-center"><div className="w-0 h-full border-l-2 border-dashed border-slate-400 dark:border-slate-500" /></div>

                <OvalNode label="Approved for Development / End" sub={launched.length > 0 ? `${launched.length} BRD${launched.length > 1 ? 's' : ''} launched` : undefined} />
              </div>

              {/* RIGHT: Branches */}
              <div className="flex flex-col gap-0 flex-shrink-0" style={{ minWidth: 400 }}>
                {/* Clarification loop - positioned at top */}
                <div style={{ height: 160 }}>
                  <div className="flex items-center gap-2 h-12">
                    <div className="border-2 border-slate-400 dark:border-slate-600 bg-white dark:bg-slate-900 px-2 py-1.5 text-xs font-bold text-slate-900 dark:text-white" style={{ minWidth: 100 }}>BA updates RD</div>
                    <div className="h-0 w-6 border-t-2 border-dashed border-slate-400" /><div className="w-0 h-0 border-t-[4px] border-t-transparent border-b-[4px] border-b-transparent border-l-[6px] border-l-slate-400" />
                    <div className="border-2 border-slate-400 bg-white px-2 py-1.5 text-xs font-bold" style={{ minWidth: 110, transform: 'skewX(-10deg)' }}><span style={{ transform: 'skewX(10deg)' }}>US provides clarification</span></div>
                    <div className="h-0 w-6 border-t-2 border-dashed border-slate-400" /><div className="w-0 h-0 border-t-[4px] border-t-transparent border-b-[4px] border-b-transparent border-l-[6px] border-l-slate-400" />
                    <div className="border-2 border-slate-400 bg-white px-2 py-1.5 text-xs font-bold" style={{ minWidth: 100, transform: 'skewX(-10deg)' }}><span style={{ transform: 'skewX(10deg)' }}>BA asks US team</span></div>
                  </div>
                </div>

                {/* YES branch to SA sends questions */}
                <div style={{ height: 100 }} className="flex items-center gap-2">
                  <div className="h-full w-0.5 border-l-2 border-dashed border-slate-400" />
                  <div className="h-0 w-6 border-t-2 border-dashed border-slate-400" /><span className="text-xs text-slate-500">YES</span><div className="h-0 w-6 border-t-2 border-dashed border-slate-400" />
                  <div className="border-2 border-slate-400 bg-white px-2 py-1.5 text-xs font-bold" style={{ minWidth: 130, transform: 'skewX(-10deg)' }}><span style={{ transform: 'skewX(10deg)' }}>SA sends questions to BA</span></div>
                </div>

                {/* Tech conflict section */}
                <div style={{ height: 140 }} className="flex flex-col items-start">
                  <div style={{ height: 50 }} />
                  <div className="flex items-center gap-2">
                    <div className="h-0 w-8 border-t-2 border-dashed border-slate-400" /><span className="text-xs text-slate-500">YES</span>
                    <div className="flex flex-col items-center">
                      <div className="border-2 border-slate-400 bg-white px-2 py-1.5 text-xs font-bold" style={{ minWidth: 130 }}>DEV raises issue to SA/BA</div>
                      <div className="h-6 w-0 border-l-2 border-dashed border-slate-400" />
                      <div className="border-2 border-slate-400 bg-white px-2 py-1.5 text-xs font-bold" style={{ minWidth: 150 }}>
                        {onhold.length > 0 ? <>Alignment & Solution<div className="mt-1 space-y-1">{onhold.map(brd => <BrdCard key={brd.id} brd={brd} bugs={bugs} onSelectBRD={onSelectBRD} />)}</div></> : 'Alignment & Solution'}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Tech Spec track */}
                <div style={{ height: 100 }} className="flex items-center gap-2">
                  <div className="h-0 w-8 border-t-2 border-dashed border-slate-400" />
                  <div className="flex flex-col items-center gap-0">
                    <div className="relative border-2 border-slate-400 bg-white px-2 py-1.5 text-xs font-bold text-center" style={{ minWidth: 130, clipPath: 'polygon(0 0, calc(100% - 12px) 0, 100% 12px, 100% 100%, 0 100%)' }}>
                      <div className="absolute top-0 right-0 w-3 h-3 border-l-2 border-b-2 border-slate-400 bg-slate-100" />Tech Spec Creation
                    </div>
                    <div className="h-6 w-0 border-l-2 border-slate-400" />
                    <div className="border-2 border-slate-400 bg-white px-2 py-1.5 text-xs font-bold" style={{ minWidth: 130 }}>Initial (Benchmark)</div>
                    <div className="h-6 w-0 border-l-2 border-slate-400" />
                    <div className="border-2 border-slate-400 bg-white px-2 py-1.5 text-xs font-bold" style={{ minWidth: 130 }}>Mid Development</div>
                    <div className="h-6 w-0 border-l-2 border-slate-400" />
                    <div className="relative border-2 border-slate-400 bg-white px-2 py-1.5 text-xs font-bold text-center" style={{ minWidth: 130, clipPath: 'polygon(0 0, calc(100% - 12px) 0, 100% 12px, 100% 100%, 0 100%)' }}>
                      <div className="absolute top-0 right-0 w-3 h-3 border-l-2 border-b-2 border-slate-400 bg-slate-100" />Final Tech Spec
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Status summary bar */}
            <div className="mt-8 pt-4 border-t border-slate-200 dark:border-slate-800 flex flex-wrap gap-3">
              {[
                { label: 'BA / SA Review', count: planning.length, color: 'bg-indigo-100 dark:bg-indigo-900 text-indigo-700 dark:text-indigo-300' },
                { label: 'DEV Review', count: inprogress.length, color: 'bg-amber-100 dark:bg-amber-900 text-amber-700 dark:text-amber-300' },
                { label: 'Development', count: development.length, color: 'bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-300' },
                { label: 'Testing / QA', count: testing.length, color: 'bg-violet-100 dark:bg-violet-900 text-violet-700 dark:text-violet-300' },
                { label: 'Launched', count: launched.length, color: 'bg-emerald-100 dark:bg-emerald-900 text-emerald-700 dark:text-emerald-300' },
                { label: 'On Hold', count: onhold.length, color: 'bg-red-100 dark:bg-red-900 text-red-700 dark:text-red-300' },
              ].map(s => (
                <span key={s.label} className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold ${s.color}`}>
                  <span>{s.label}</span>
                  <span className="font-bold">{s.count}</span>
                </span>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ── TABLE VIEW ────────────────────────────────────────────────────── */}
      {view === 'table' && (
        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700">
              <tr>
                {['#', 'BRD Title', 'Stage', 'BA', 'Sprint', 'Size', 'Bugs', 'Quarter'].map(h => (
                  <th key={h} className="px-4 py-2.5 text-left font-semibold text-slate-700 dark:text-slate-300 text-xs">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {filteredBRDs.length === 0 ? (
                <tr><td colSpan={8} className="px-4 py-8 text-center text-slate-400">No BRDs match filters</td></tr>
              ) : (
                filteredBRDs.map((brd, idx) => {
                  const bugCount = bugs.filter(b => b.brdId === brd.id).length;
                  const stageInfo = WORKFLOW_STAGES.find(s => s.value === brd.status);
                  return (
                    <tr key={brd.id} onClick={() => onSelectBRD(brd.id)}
                      className="hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer transition-colors">
                      <td className="px-4 py-2.5 text-slate-400">{idx + 1}</td>
                      <td className="px-4 py-2.5 font-medium text-slate-900 dark:text-white">{fmtTitle(brd.title)}</td>
                      <td className="px-4 py-2.5">
                        {stageInfo && <span className={`inline-block px-2 py-0.5 rounded-md text-xs font-semibold ${stageInfo.bg} ${stageInfo.text}`}>{stageInfo.label}</span>}
                      </td>
                      <td className="px-4 py-2.5 text-slate-600 dark:text-slate-400">{brd.baName || '—'}</td>
                      <td className="px-4 py-2.5 text-slate-600 dark:text-slate-400 text-xs">{getSprintLabel(brd)}</td>
                      <td className="px-4 py-2.5 text-slate-600 dark:text-slate-400">{brd.tshirtSize || '—'}</td>
                      <td className={`px-4 py-2.5 font-semibold ${bugCount > MIN_BUG_THRESHOLD ? 'text-red-600 dark:text-red-400' : 'text-slate-600 dark:text-slate-400'}`}>{bugCount}</td>
                      <td className="px-4 py-2.5 text-slate-600 dark:text-slate-400">{brd.quarter && brd.year ? `${brd.quarter} ${brd.year}` : '—'}</td>
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
