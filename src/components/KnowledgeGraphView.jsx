import { useEffect, useMemo, useRef, useState } from 'react';
import { Network, DataSet } from 'vis-network/standalone';

// Mixes a hex color toward white — used for the twinkle flare
function lighten(hex, amt) {
  const n = parseInt(hex.slice(1), 16);
  const ch = (v) => Math.min(255, Math.round(v + (255 - v) * amt));
  const r = ch((n >> 16) & 255), g = ch((n >> 8) & 255), b = ch(n & 255);
  return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, '0')}`;
}

// ─── graphify-style palette (tableau10, same family as graphify-out/graph.html) ─
const PALETTE = [
  '#4E79A7', '#F28E2B', '#E15759', '#76B7B2', '#59A14F',
  '#EDC948', '#B07AA1', '#FF9DA7', '#9C755F', '#BAB0AC',
  '#86BCB6', '#D37295', '#FABFD2', '#B6992D', '#499894',
];

const STOPWORDS = new Set([
  'the', 'and', 'for', 'are', 'this', 'that', 'with', 'from', 'have', 'has',
  'was', 'were', 'will', 'when', 'then', 'than', 'them', 'they', 'their',
  'there', 'these', 'those', 'been', 'being', 'each', 'which', 'while',
  'should', 'would', 'could', 'must', 'into', 'onto', 'only', 'also', 'both',
  'all', 'any', 'can', 'not', 'but', 'you', 'your', 'our', 'its', 'it’s',
  'use', 'used', 'using', 'may', 'might', 'shall', 'does', 'done', 'did',
  'per', 'via', 'etc', 'more', 'most', 'some', 'such', 'other', 'out', 'over',
  'under', 'after', 'before', 'between', 'during', 'above', 'below', 'about',
]);

// Significant terms of a KB entry — lowercase words > 3 chars minus stopwords,
// weighted so title terms count more than body terms.
function extractTerms(entry) {
  const weigh = (text, weight) => {
    const counts = new Map();
    for (const w of (text || '').toLowerCase().split(/[^a-z0-9_-]+/)) {
      if (w.length < 4 || STOPWORDS.has(w) || /^\d+$/.test(w)) continue;
      counts.set(w, (counts.get(w) || 0) + weight);
    }
    return counts;
  };
  const terms = weigh(entry.content, 1);
  for (const [w, c] of weigh(entry.title, 3)) terms.set(w, (terms.get(w) || 0) + c);
  // keep the top 25 heaviest terms per entry
  return new Map([...terms.entries()].sort((a, b) => b[1] - a[1]).slice(0, 25));
}

// Builds nodes + edges for vis-network from raw KB entries:
//  · one hub node per category (diamond, like graphify god nodes)
//  · one dot node per entry, colored by category, sized by content length
//  · "contains" edges hub→entry, "mentions" edges when one entry's text contains
//    another's title, "related" edges from shared significant terms
function buildGraph(entries) {
  const categories = [...new Set(entries.map(e => e.category || 'General'))].sort();
  const colorOf = Object.fromEntries(categories.map((c, i) => [c, PALETTE[i % PALETTE.length]]));

  const nodes = [];
  const edges = [];

  for (const cat of categories) {
    nodes.push({
      id: `cat:${cat}`, label: cat, shape: 'diamond', size: 22,
      color: { background: colorOf[cat], border: '#ffffff' },
      font: { color: '#e0e0e0', size: 16, face: 'inherit' },
      kind: 'category', category: cat,
    });
  }

  const termsById = new Map(entries.map(e => [e.id, extractTerms(e)]));

  for (const e of entries) {
    const cat = e.category || 'General';
    const len = (e.content || '').length;
    nodes.push({
      id: e.id,
      label: e.title.length > 34 ? e.title.slice(0, 32) + '…' : e.title,
      shape: 'dot',
      size: Math.max(9, Math.min(20, 8 + Math.sqrt(len) / 5)),
      color: { background: colorOf[cat], border: '#0f0f1a' },
      font: { color: '#c0c0d0', size: 12, face: 'inherit' },
      kind: 'entry', category: cat,
    });
    edges.push({ from: `cat:${cat}`, to: e.id, relation: 'contains', color: { color: '#2a2a4e' }, width: 1 });
  }

  // mentions: entry text contains another entry's title (strong, directed intent)
  const seenPair = new Set();
  for (const a of entries) {
    const text = `${a.title} ${a.content}`.toLowerCase();
    for (const b of entries) {
      if (a.id === b.id || b.title.length < 6) continue;
      const key = a.id < b.id ? `${a.id}|${b.id}` : `${b.id}|${a.id}`;
      if (seenPair.has(key)) continue;
      if (text.includes(b.title.toLowerCase())) {
        seenPair.add(key);
        edges.push({ from: a.id, to: b.id, relation: 'mentions', color: { color: '#B07AA1' }, width: 2, dashes: false });
      }
    }
  }

  // related: shared significant terms between entries (cap 4 per node so the
  // graph stays readable instead of becoming a hairball)
  const relatedCount = new Map();
  const candidates = [];
  for (let i = 0; i < entries.length; i++) {
    for (let j = i + 1; j < entries.length; j++) {
      const a = entries[i], b = entries[j];
      const key = a.id < b.id ? `${a.id}|${b.id}` : `${b.id}|${a.id}`;
      if (seenPair.has(key)) continue;
      const ta = termsById.get(a.id), tb = termsById.get(b.id);
      let score = 0; const shared = [];
      for (const [w, c] of ta) if (tb.has(w)) { score += Math.min(c, tb.get(w)); shared.push(w); }
      if (shared.length >= 2) candidates.push({ a: a.id, b: b.id, key, score, shared: shared.slice(0, 5) });
    }
  }
  candidates.sort((x, y) => y.score - x.score);
  for (const c of candidates) {
    if ((relatedCount.get(c.a) || 0) >= 4 || (relatedCount.get(c.b) || 0) >= 4) continue;
    relatedCount.set(c.a, (relatedCount.get(c.a) || 0) + 1);
    relatedCount.set(c.b, (relatedCount.get(c.b) || 0) + 1);
    seenPair.add(c.key);
    edges.push({
      from: c.a, to: c.b, relation: 'related', sharedTerms: c.shared,
      color: { color: '#3a3a5e' }, width: 1.5, dashes: [4, 4],
    });
  }

  return { nodes, edges, categories, colorOf };
}

// Builds nodes + edges from a /api/code-graph/:key payload — one node per source
// file colored by its graphify community, edges are real extracted call/import
// relationships collapsed to file level (width = how many symbol links).
function buildRepoGraph(data) {
  const rawCat = (f) => f.communityLabel || (f.community != null ? `Community ${f.community}` : 'Ungrouped');

  // graphify communities can be very fine-grained (hundreds) — keep the largest
  // 14 as named groups and bucket the long tail as "Other" so the legend stays usable
  const counts = new Map();
  for (const f of data.files) counts.set(rawCat(f), (counts.get(rawCat(f)) || 0) + 1);
  const top = new Set([...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 14).map(([c]) => c));
  const catOf = (f) => (top.has(rawCat(f)) ? rawCat(f) : 'Other');

  const categories = [...new Set(data.files.map(catOf))].sort((a, b) =>
    a === 'Other' ? 1 : b === 'Other' ? -1 : (counts.get(b) || 0) - (counts.get(a) || 0));
  const colorOf = Object.fromEntries(categories.map((c, i) => [c, c === 'Other' ? '#5a5a72' : PALETTE[i % PALETTE.length]]));

  const nodes = data.files.map(f => ({
    id: f.id,
    label: f.label.length > 30 ? f.label.slice(0, 28) + '…' : f.label,
    shape: 'dot',
    size: Math.max(7, Math.min(22, 6 + Math.sqrt(f.symbolCount) * 2.2)),
    color: { background: colorOf[catOf(f)], border: '#0f0f1a' },
    font: { color: '#c0c0d0', size: 11, face: 'inherit' },
    kind: 'entry',
    category: catOf(f),
    detail: { title: f.path, meta: rawCat(f), body: f.symbols.join(', '), count: f.symbolCount },
  }));

  const edges = data.edges.map(e => ({
    from: e.from, to: e.to, relation: e.relation,
    width: Math.min(4, 0.8 + Math.log2(e.weight + 1)),
    color: { color: '#2a2a4e' },
  }));

  return { nodes, edges, categories, colorOf };
}

const GRAPH_TABS = [
  { id: 'kb', label: 'Knowledge Base' },
  { id: 'customizer-core', label: 'Customizer' },
  { id: 'qstrike-builder', label: 'QStrike Builder' },
];

export default function KnowledgeGraphView({ entries, onOpenEntry }) {
  const containerRef = useRef(null);
  const networkRef = useRef(null);
  const rootRef = useRef(null);                            // outermost panel — the element that goes fullscreen
  const [selected, setSelected] = useState(null);          // selected entry node data
  const [neighbors, setNeighbors] = useState([]);          // [{id,label,relation}]
  const [search, setSearch] = useState('');
  const [dimmedCats, setDimmedCats] = useState(new Set()); // hidden categories
  const [physics, setPhysics] = useState(true);
  const [viewing, setViewing] = useState(null);            // entry shown in the full-content modal
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [graphTab, setGraphTab] = useState('kb');          // 'kb' | 'customizer-core' | 'qstrike-builder'
  const [repoGraphs, setRepoGraphs] = useState({});        // key -> { status, data, error }

  // Fetch a repo code-graph the first time its tab is opened
  useEffect(() => {
    if (graphTab === 'kb' || repoGraphs[graphTab]) return;
    setRepoGraphs(p => ({ ...p, [graphTab]: { status: 'loading' } }));
    fetch(`/api/code-graph/${graphTab}`)
      .then(async r => { const d = await r.json(); if (!r.ok) throw new Error(d.error || r.statusText); return d; })
      .then(d => setRepoGraphs(p => ({ ...p, [graphTab]: { status: 'ready', data: d } })))
      .catch(e => setRepoGraphs(p => ({ ...p, [graphTab]: { status: 'error', error: e.message } })));
  }, [graphTab, repoGraphs]);

  // Clear selection/filters when switching between the three graphs
  useEffect(() => {
    setSelected(null); setNeighbors([]); setDimmedCats(new Set()); setSearch('');
  }, [graphTab]);

  const graph = useMemo(() => {
    if (graphTab === 'kb') return buildGraph(entries);
    const rg = repoGraphs[graphTab];
    if (rg?.status === 'ready') return buildRepoGraph(rg.data);
    return { nodes: [], edges: [], categories: [], colorOf: {} };
  }, [entries, graphTab, repoGraphs]);
  const entriesById = useMemo(() => new Map(entries.map(e => [e.id, e])), [entries]);

  // (re)build the network when data or category filter changes
  useEffect(() => {
    if (!containerRef.current) return;
    const visibleNodes = graph.nodes.filter(n => !dimmedCats.has(n.category));
    const visibleIds = new Set(visibleNodes.map(n => n.id));
    const visibleEdges = graph.edges.filter(e => visibleIds.has(e.from) && visibleIds.has(e.to));

    // DataSets so nodes/edges can be live-updated for the twinkle animation
    const nodesDS = new DataSet(visibleNodes.map(n => ({ ...n })));
    const edgesDS = new DataSet(visibleEdges.map((e, i) => ({ id: `e${i}`, ...e })));

    const network = new Network(containerRef.current, { nodes: nodesDS, edges: edgesDS }, {
      // improvedLayout is O(n²)-ish — skip it for large repo graphs
      layout: { improvedLayout: visibleNodes.length <= 400 },
      physics: {
        enabled: physics,
        solver: 'forceAtlas2Based',
        forceAtlas2Based: { gravitationalConstant: -60, springLength: 110, springConstant: 0.06, damping: 0.4 },
        stabilization: { iterations: visibleNodes.length > 400 ? 80 : 150, fit: true },
      },
      interaction: { hover: true, tooltipDelay: 120 },
      edges: { smooth: { type: 'continuous' } },
      nodes: { borderWidth: 1.5 },
    });
    networkRef.current = network;

    network.on('click', (params) => {
      const id = params.nodes[0];
      if (!id) { setSelected(null); setNeighbors([]); return; }
      const node = graph.nodes.find(n => n.id === id);
      setSelected(node || null);
      const nb = [];
      for (const e of graph.edges) {
        if (e.from !== id && e.to !== id) continue;
        const otherId = e.from === id ? e.to : e.from;
        const other = graph.nodes.find(n => n.id === otherId);
        if (other && !dimmedCats.has(other.category)) nb.push({ id: otherId, label: other.label, relation: e.relation, shared: e.sharedTerms });
      }
      setNeighbors(nb);
    });

    // ── "Living brain" animation ─────────────────────────────────────────────
    // Twinkle: every beat a few random nodes flare up (brighter, bigger, with a
    // colored glow) then settle back — like synapses firing.
    const entryIds = visibleNodes.filter(n => n.kind === 'entry').map(n => n.id);
    const flaring = new Set();
    const timeouts = new Set();
    const later = (fn, ms) => { const t = setTimeout(() => { timeouts.delete(t); fn(); }, ms); timeouts.add(t); };

    const twinkle = setInterval(() => {
      if (!entryIds.length || document.hidden) return;
      const count = 1 + Math.floor(Math.random() * 3);
      for (let k = 0; k < count; k++) {
        const id = entryIds[Math.floor(Math.random() * entryIds.length)];
        if (flaring.has(id)) continue;
        const orig = graph.nodes.find(n => n.id === id);
        if (!orig) continue;
        flaring.add(id);
        const base = orig.color.background;
        // star-like sparkle: barely grows, core goes white-hot, wide soft glow
        try {
          nodesDS.update({
            id, size: orig.size * 1.15,
            color: { background: lighten(base, 0.9), border: '#ffffff' },
            shadow: { enabled: true, color: lighten(base, 0.6), size: 30, x: 0, y: 0 },
            font: { ...orig.font, color: '#ffffff' },
          });
        } catch { /* dataset may be gone mid-teardown */ }
        // brief bright peak, then a dimmer afterglow before settling back
        later(() => {
          try {
            nodesDS.update({
              id, size: orig.size * 1.05,
              color: { background: lighten(base, 0.35), border: lighten(base, 0.7) },
              shadow: { enabled: true, color: base, size: 14, x: 0, y: 0 },
              font: orig.font,
            });
          } catch { /* ignore */ }
        }, 260 + Math.random() * 140);
        later(() => {
          flaring.delete(id);
          try { nodesDS.update({ id, size: orig.size, color: orig.color, shadow: { enabled: false }, font: orig.font }); } catch { /* ignore */ }
        }, 750 + Math.random() * 300);
      }
      // occasionally pulse a relationship edge along with the nodes
      if (Math.random() < 0.45) {
        const rel = edgesDS.get({ filter: e => e.relation !== 'contains' });
        if (rel.length) {
          const e = rel[Math.floor(Math.random() * rel.length)];
          try { edgesDS.update({ id: e.id, width: 3.5, color: { color: '#8ab4e8' } }); } catch { /* ignore */ }
          later(() => { try { edgesDS.update({ id: e.id, width: e.relation === 'mentions' ? 2 : 1.5, color: e.color }); } catch { /* ignore */ } }, 700);
        }
      }
    }, 850);

    // Drift: gently nudge a few nodes so the springs keep the whole layout
    // breathing instead of freezing solid (only while physics is on).
    const drift = physics ? setInterval(() => {
      if (!entryIds.length || document.hidden) return;
      const ids = Array.from({ length: Math.min(3, entryIds.length) },
        () => entryIds[Math.floor(Math.random() * entryIds.length)]);
      const pos = network.getPositions(ids);
      for (const id of ids) {
        if (!pos[id]) continue;
        network.moveNode(id, pos[id].x + (Math.random() - 0.5) * 26, pos[id].y + (Math.random() - 0.5) * 26);
      }
    }, 2200) : null;

    return () => {
      clearInterval(twinkle);
      if (drift) clearInterval(drift);
      for (const t of timeouts) clearTimeout(t);
      network.destroy();
    };
  }, [graph, dimmedCats, physics]);

  const focusNode = (id) => {
    const net = networkRef.current;
    if (!net) return;
    net.selectNodes([id]);
    net.focus(id, { scale: 1.2, animation: { duration: 500 } });
    const node = graph.nodes.find(n => n.id === id);
    setSelected(node || null);
    const nb = [];
    for (const e of graph.edges) {
      if (e.from !== id && e.to !== id) continue;
      const otherId = e.from === id ? e.to : e.from;
      const other = graph.nodes.find(n => n.id === otherId);
      if (other) nb.push({ id: otherId, label: other.label, relation: e.relation, shared: e.sharedTerms });
    }
    setNeighbors(nb);
  };

  // Track fullscreen state and re-fit the canvas when the panel size jumps
  useEffect(() => {
    const onChange = () => {
      const fs = document.fullscreenElement === rootRef.current;
      setIsFullscreen(fs);
      setTimeout(() => {
        const net = networkRef.current;
        if (net) { net.redraw(); net.fit({ animation: { duration: 300 } }); }
      }, 150);
    };
    document.addEventListener('fullscreenchange', onChange);
    return () => document.removeEventListener('fullscreenchange', onChange);
  }, []);

  const toggleFullscreen = () => {
    if (document.fullscreenElement) document.exitFullscreen();
    else rootRef.current?.requestFullscreen?.();
  };

  const toggleCategory = (cat) => {
    setDimmedCats(prev => {
      const next = new Set(prev);
      if (next.has(cat)) next.delete(cat); else next.add(cat);
      return next;
    });
  };

  const searchHits = search.trim()
    ? graph.nodes.filter(n => n.kind === 'entry' && n.label.toLowerCase().includes(search.toLowerCase())).slice(0, 12)
    : [];

  const isKB = graphTab === 'kb';
  const selectedEntry = isKB && selected && selected.kind === 'entry' ? entriesById.get(selected.id) : null;
  const selectedDetail = selected?.detail || null;
  const entryCount = graph.nodes.filter(n => n.kind === 'entry').length;
  const relEdgeCount = graph.edges.filter(e => e.relation !== 'contains').length;
  const repoState = isKB ? null : repoGraphs[graphTab];
  const unitWord = isKB ? 'entries' : 'files';
  const groupWord = isKB ? 'categories' : 'communities';

  return (
    <div className="flex-1 min-h-0 flex flex-col gap-3">
      {/* Graph switcher — Knowledge Base / Customizer / QStrike Builder */}
      <div className="flex items-center gap-1 bg-slate-100 dark:bg-slate-800 rounded-xl p-1 self-start">
        {GRAPH_TABS.map(t => (
          <button key={t.id} onClick={() => setGraphTab(t.id)}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${graphTab === t.id ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-sm' : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-300'}`}>
            {t.label}
          </button>
        ))}
      </div>

    <div ref={rootRef}
      className={`flex-1 flex overflow-hidden border border-slate-200 dark:border-slate-800 ${isFullscreen ? 'rounded-none w-full h-full' : 'rounded-2xl min-h-[560px] h-[calc(100vh-215px)]'}`}
      style={{ background: '#0f0f1a' }}>
      {/* Graph canvas */}
      <div className="flex-1 min-w-0 relative">
        <div ref={containerRef} className="absolute inset-0" />
        {isKB && !entries.length && (
          <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
            <p className="text-sm font-medium" style={{ color: '#888' }}>No knowledge base entries yet</p>
            <p className="text-xs mt-1" style={{ color: '#555' }}>Add entries in the Knowledge Base tab to see them as a graph.</p>
          </div>
        )}
        {repoState?.status === 'loading' && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 pointer-events-none">
            <div className="w-7 h-7 border-2 border-t-transparent rounded-full animate-spin" style={{ borderColor: '#4E79A7', borderTopColor: 'transparent' }} />
            <p className="text-xs" style={{ color: '#888' }}>Loading {GRAPH_TABS.find(t => t.id === graphTab)?.label} code graph…</p>
          </div>
        )}
        {repoState?.status === 'error' && (
          <div className="absolute inset-0 flex flex-col items-center justify-center px-8 text-center pointer-events-none">
            <p className="text-sm font-medium" style={{ color: '#E15759' }}>Couldn't load this graph</p>
            <p className="text-xs mt-1" style={{ color: '#888' }}>{repoState.error}</p>
          </div>
        )}
        <button onClick={toggleFullscreen}
          title={isFullscreen ? 'Exit full screen (Esc)' : 'Full screen'}
          className="absolute top-3 right-3 z-10 p-2 rounded-lg border transition-colors hover:bg-[#2a2a4e]"
          style={{ background: '#1a1a2e', borderColor: '#3a3a5e', color: '#aaa' }}>
          {isFullscreen ? (
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 9L4 4m5 5V5m0 4H5m10 0l5-5m-5 5V5m0 4h4M9 15l-5 5m5-5v4m0-4H5m10 0l5 5m-5-5v4m0-4h4" />
            </svg>
          ) : (
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 8V5a1 1 0 011-1h3m8 0h3a1 1 0 011 1v3m0 8v3a1 1 0 01-1 1h-3m-8 0H5a1 1 0 01-1-1v-3" />
            </svg>
          )}
        </button>
      </div>

      {/* graphify-style sidebar */}
      <div className="w-[280px] flex-shrink-0 flex flex-col border-l" style={{ background: '#1a1a2e', borderColor: '#2a2a4e' }}>

        {/* Search */}
        <div className="p-3 border-b" style={{ borderColor: '#2a2a4e' }}>
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search entries…"
            className="w-full px-2.5 py-1.5 rounded-md text-[13px] outline-none border"
            style={{ background: '#0f0f1a', borderColor: '#3a3a5e', color: '#e0e0e0' }}
          />
          {searchHits.length > 0 && (
            <div className="mt-1.5 max-h-[130px] overflow-y-auto">
              {searchHits.map(n => (
                <div key={n.id}
                  onClick={() => { focusNode(n.id); setSearch(''); }}
                  className="px-1.5 py-1 rounded text-xs cursor-pointer truncate hover:bg-[#2a2a4e]"
                  style={{ color: '#ccc' }}>
                  <span className="inline-block w-2 h-2 rounded-full mr-1.5" style={{ background: graph.colorOf[n.category] }} />
                  {n.label}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Info panel */}
        <div className="p-3.5 border-b overflow-y-auto" style={{ borderColor: '#2a2a4e', minHeight: 150, maxHeight: 300 }}>
          <h3 className="text-[11px] uppercase tracking-wider mb-2" style={{ color: '#aaa' }}>Node Info</h3>
          {!selected ? (
            <p className="text-xs italic" style={{ color: '#555' }}>Click a node to inspect it.</p>
          ) : (
            <div className="text-[13px] leading-relaxed" style={{ color: '#ccc' }}>
              <div className="mb-1 break-words"><b style={{ color: '#e0e0e0' }}>{selected.kind === 'category' ? `${isKB ? 'Category' : 'Community'}: ${selected.category}` : (selectedDetail ? selectedDetail.title : entriesById.get(selected.id)?.title)}</b></div>
              {selectedDetail && (
                <>
                  <div className="mb-1 text-xs">
                    <span className="inline-block w-2 h-2 rounded-full mr-1.5" style={{ background: graph.colorOf[selected.category] }} />
                    {selected.category} · {selectedDetail.count} symbol{selectedDetail.count === 1 ? '' : 's'}
                  </div>
                  {selectedDetail.body && (
                    <p className="text-xs mb-2 break-words font-mono" style={{ color: '#9a9ab0' }}>{selectedDetail.body}</p>
                  )}
                </>
              )}
              {selectedEntry && (
                <>
                  <div className="mb-1 text-xs">
                    <span className="inline-block w-2 h-2 rounded-full mr-1.5" style={{ background: graph.colorOf[selected.category] }} />
                    {selected.category}
                  </div>
                  <p className="text-xs mb-2 whitespace-pre-wrap" style={{ color: '#9a9ab0' }}>
                    {(selectedEntry.content || '').slice(0, 320)}{(selectedEntry.content || '').length > 320 ? '…' : ''}
                  </p>
                  <button onClick={() => (onOpenEntry ? onOpenEntry(selectedEntry) : setViewing(selectedEntry))}
                    className="text-xs px-2.5 py-1 rounded-md font-semibold"
                    style={{ background: '#4E79A7', color: '#fff' }}>
                    Open entry
                  </button>
                </>
              )}
              {neighbors.length > 0 && (
                <div className="mt-2.5">
                  <h3 className="text-[11px] uppercase tracking-wider mb-1" style={{ color: '#aaa' }}>Connections ({neighbors.length})</h3>
                  <div className="max-h-[120px] overflow-y-auto">
                    {neighbors.map(nb => (
                      <div key={nb.id} onClick={() => focusNode(nb.id)}
                        className="px-1.5 py-0.5 my-0.5 rounded text-xs cursor-pointer truncate hover:bg-[#2a2a4e]"
                        style={{ borderLeft: `3px solid ${nb.relation === 'mentions' ? '#B07AA1' : nb.relation === 'related' ? '#3a3a5e' : '#2a2a4e'}`, color: '#ccc' }}
                        title={nb.shared ? `shared: ${nb.shared.join(', ')}` : nb.relation}>
                        <span style={{ color: '#777' }}>{nb.relation}</span> {nb.label}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Legend */}
        <div className="flex-1 overflow-y-auto p-3">
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-[11px] uppercase tracking-wider" style={{ color: '#aaa' }}>{isKB ? 'Categories' : 'Communities'}</h3>
            <label className="flex items-center gap-1.5 text-[11px] cursor-pointer" style={{ color: '#888' }}>
              <input type="checkbox" checked={physics} onChange={(e) => setPhysics(e.target.checked)} />
              physics
            </label>
          </div>
          {graph.categories.map(cat => {
            const count = graph.nodes.filter(n => n.kind === 'entry' && n.category === cat).length;
            return (
              <div key={cat} onClick={() => toggleCategory(cat)}
                className={`flex items-center gap-2 py-1 px-1 rounded cursor-pointer text-xs hover:bg-[#2a2a4e] ${dimmedCats.has(cat) ? 'opacity-35' : ''}`}
                style={{ color: '#ccc' }}>
                <span className="w-3 h-3 rounded-full flex-shrink-0" style={{ background: graph.colorOf[cat] }} />
                <span className="flex-1 truncate">{cat}</span>
                <span className="text-[11px]" style={{ color: '#666' }}>{count}</span>
              </div>
            );
          })}
          {isKB ? (
            <p className="mt-3 text-[11px] leading-relaxed" style={{ color: '#555' }}>
              <span style={{ color: '#B07AA1' }}>━</span> mentions &nbsp;
              <span style={{ color: '#3a3a5e' }}>╌</span> related (shared terms) &nbsp;
              ◆ category hub. Click a category to hide/show it.
            </p>
          ) : (
            <p className="mt-3 text-[11px] leading-relaxed" style={{ color: '#555' }}>
              One dot per source file, sized by symbol count. Edges are real call/import
              relationships extracted by graphify. Click a community to hide/show it.
            </p>
          )}
        </div>

        {/* Stats */}
        <div className="px-3.5 py-2.5 border-t text-[11px]" style={{ borderColor: '#2a2a4e', color: '#555' }}>
          {entryCount} {unitWord} · {graph.categories.length} {groupWord} · {relEdgeCount} relationships
        </div>
      </div>

      {/* Full-content entry modal */}
      {viewing && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-6" style={{ background: 'rgba(0,0,0,0.6)' }} onClick={() => setViewing(null)}>
          <div className="w-full max-w-2xl max-h-[80vh] rounded-2xl flex flex-col overflow-hidden border"
            style={{ background: '#1a1a2e', borderColor: '#2a2a4e' }} onClick={(e) => e.stopPropagation()}>
            <div className="flex items-start justify-between gap-3 px-5 py-4 border-b" style={{ borderColor: '#2a2a4e' }}>
              <div>
                <h3 className="text-sm font-bold" style={{ color: '#e0e0e0' }}>{viewing.title}</h3>
                <span className="inline-flex items-center gap-1.5 mt-1 text-[11px]" style={{ color: '#9a9ab0' }}>
                  <span className="w-2 h-2 rounded-full" style={{ background: graph.colorOf[viewing.category || 'General'] }} />
                  {viewing.category || 'General'}
                </span>
              </div>
              <button onClick={() => setViewing(null)} className="text-lg leading-none px-2 py-1 rounded hover:bg-[#2a2a4e]" style={{ color: '#888' }}>×</button>
            </div>
            <div className="px-5 py-4 overflow-y-auto text-[13px] leading-relaxed whitespace-pre-wrap" style={{ color: '#ccc' }}>
              {viewing.content}
            </div>
          </div>
        </div>
      )}
    </div>
    </div>
  );
}
