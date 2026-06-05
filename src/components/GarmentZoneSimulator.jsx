import { useEffect, useRef, useState, forwardRef, useImperativeHandle } from 'react';
import { Application, Container } from 'pixi.js-legacy';
import { loadUniform, renderUniform } from '@qstrike/builder';

const BUILDER_BASE = {
  isBrandStyle: true,
  type: 'brand',
  qx7_host: 'https://staging-qx7.prolook.com',
  apiUrl: 'https://api-qstrike-v2-stg.qstrike.net',
  vectorsoft_host: 'https://vectorsoft-api-service-stg.qstrike.net',
  cdn: 'https://resources.qstrike.net',
};

// Resolve brand_id for a given style ID from QX7
async function resolveBrandId(styleId) {
  try {
    const res = await fetch(`${BUILDER_BASE.qx7_host}/api/brand_style/${styleId}/formatted`);
    const data = await res.json();
    return data?.brand_style?.brand_id || 55;
  } catch {
    return 55;
  }
}

const VIEW_ORDER = ['front', 'back', 'left', 'right'];

const GarmentZoneSimulator = forwardRef(function GarmentZoneSimulator(
  { brandStyleId = 123, setHoveredZone, width = 200, height = 240 },
  ref
) {
  const mountRef        = useRef(null);
  const appRef          = useRef(null);
  const uniformLayerRef = useRef(null);
  const requestedIdRef  = useRef(brandStyleId);
  const uniformRef      = useRef(null);   // loaded activeUniform (has containerView per view)

  const [builderStatus, setBuilderStatus]   = useState('loading');
  const [view, setView]                     = useState('front');
  const [availViews, setAvailViews]         = useState([]);

  // Fit + center a single view container, hiding the others
  const showView = (v) => {
    const app = appRef.current;
    const uniform = uniformRef.current;
    if (!app || !uniform?.containerView) return;

    const cw = app.renderer.width  / (app.renderer.resolution || 1);
    const ch = app.renderer.height / (app.renderer.resolution || 1);

    Object.entries(uniform.containerView).forEach(([name, c]) => {
      if (c) c.visible = (name === v);
    });

    uniform.stage.scale.set(1);
    uniform.stage.position.set(0, 0);
    const active = uniform.containerView[v];
    if (active) {
      const b = active.getBounds();
      if (b.width > 0 && b.height > 0) {
        const scale = Math.min((cw * 0.92) / b.width, (ch * 0.92) / b.height);
        uniform.stage.scale.set(scale);
        uniform.stage.x = (cw - b.width  * scale) / 2 - b.x * scale;
        uniform.stage.y = (ch - b.height * scale) / 2 - b.y * scale;
      }
    }
  };

  // ── PixiJS canvas setup — runs once on mount ───────────────────────────────
  useEffect(() => {
    if (!mountRef.current) return;

    const app = new Application({ width, height, backgroundAlpha: 0, antialias: true, preserveDrawingBuffer: true });
    app.view.style.width  = '100%';
    app.view.style.height = '100%';
    mountRef.current.appendChild(app.view);
    appRef.current = app;

    // Single layer that holds the real uniform — nothing else is drawn
    const uniformLayer = new Container();
    app.stage.addChild(uniformLayer);
    uniformLayerRef.current = uniformLayer;

    return () => {
      app.destroy(true, { children: true });
      appRef.current        = null;
      uniformLayerRef.current = null;
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Reload uniform whenever brandStyleId changes ───────────────────────────
  useEffect(() => {
    if (!appRef.current || !uniformLayerRef.current) return;

    const id = brandStyleId;
    requestedIdRef.current = id;

    // Per-run cancellation flag — set by this effect's cleanup. Survives
    // StrictMode's mount→unmount→mount so a stale in-flight load fully aborts
    // instead of touching a destroyed PixiJS app (the "updateTransform of null").
    let cancelled = false;
    const app   = appRef.current;       // capture THIS run's app instance
    const layer = uniformLayerRef.current;
    const alive = () => !cancelled && appRef.current === app && !app.renderer?.destroyed;

    // Clear any previous uniform — show only the loading spinner until ready
    setBuilderStatus('loading');
    setView('front');
    setAvailViews([]);
    uniformRef.current = null;
    while (layer.children.length > 0) layer.removeChildAt(0);

    const REQUEST_VIEWS = ['front', 'back', 'left', 'right'];

    (async () => {
      try {
        const brandId = await resolveBrandId(id);
        if (!alive()) return;

        // Load + render ALL perspectives
        const { activeUniform } = await loadUniform({ ...BUILDER_BASE, ids: [id], brandId, views: REQUEST_VIEWS });
        if (!alive()) return;

        layer.addChild(activeUniform.stage);
        await renderUniform(activeUniform, REQUEST_VIEWS, BUILDER_BASE.cdn);
        if (!alive()) return;

        uniformRef.current = activeUniform;

        const present = VIEW_ORDER.filter(v => activeUniform.containerView?.[v]);
        setAvailViews(present.length ? present : ['front']);

        setView('front');
        showView('front');
        setBuilderStatus('ready');
      } catch (err) {
        if (!alive()) return;
        console.warn(`[GarmentZoneSimulator] style #${id} failed:`, err.message);
        setBuilderStatus('fallback');
      }
    })();

    return () => { cancelled = true; };
  }, [brandStyleId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Re-fit when the selected view changes
  useEffect(() => {
    if (builderStatus === 'ready') showView(view);
  }, [view]); // eslint-disable-line react-hooks/exhaustive-deps

  // Expose capture helpers for the 3D view
  useImperativeHandle(ref, () => ({
    // Single current frame
    captureImage: () => {
      const app = appRef.current;
      if (!app) return null;
      try {
        app.renderer.render(app.stage);
        return app.view.toDataURL('image/png');
      } catch (e) {
        console.warn('[GarmentZoneSimulator] captureImage failed:', e.message);
        return null;
      }
    },
    // Capture every loaded perspective → { front, back, left, right } PNG data-URLs
    captureAllViews: () => {
      const app = appRef.current;
      const uniform = uniformRef.current;
      if (!app) return null;
      try {
        if (!uniform?.containerView) {
          app.renderer.render(app.stage);
          return { front: app.view.toDataURL('image/png') };
        }
        const cw = app.renderer.width  / (app.renderer.resolution || 1);
        const ch = app.renderer.height / (app.renderer.resolution || 1);
        const fit = (v) => {
          Object.entries(uniform.containerView).forEach(([n, c]) => { if (c) c.visible = (n === v); });
          uniform.stage.scale.set(1);
          uniform.stage.position.set(0, 0);
          const active = uniform.containerView[v];
          if (!active) return false;
          const b = active.getBounds();
          if (b.width <= 0 || b.height <= 0) return false;
          const s = Math.min((cw * 0.92) / b.width, (ch * 0.92) / b.height);
          uniform.stage.scale.set(s);
          uniform.stage.x = (cw - b.width  * s) / 2 - b.x * s;
          uniform.stage.y = (ch - b.height * s) / 2 - b.y * s;
          return true;
        };
        const out = {};
        VIEW_ORDER.forEach((v) => {
          if (!uniform.containerView[v]) return;
          if (fit(v)) {
            app.renderer.render(app.stage);
            out[v] = app.view.toDataURL('image/png');
          }
        });
        fit('front');
        app.renderer.render(app.stage);
        return Object.keys(out).length ? out : { front: app.view.toDataURL('image/png') };
      } catch (e) {
        console.warn('[GarmentZoneSimulator] captureAllViews failed:', e.message);
        return null;
      }
    },
  }), []);

  return (
    <div
      className="relative"
      style={{ width, height }}
      onMouseLeave={() => setHoveredZone?.(null)}
    >
      <div ref={mountRef} className="w-full h-full" />

      {/* Loading spinner — shown until the real uniform is rendered */}
      {builderStatus !== 'ready' && (
        <div className="absolute inset-0 flex items-center justify-center bg-slate-50/50 dark:bg-slate-900/50 rounded-xl pointer-events-none">
          <div className="w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
        </div>
      )}

      {/* Status badge — only when the real uniform is rendered */}
      {builderStatus === 'ready' && (
        <div className="absolute bottom-1 right-1 text-[9px] font-mono px-1.5 py-0.5 rounded pointer-events-none bg-emerald-100 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400">
          @qstrike/builder · #{brandStyleId}
        </div>
      )}

      {/* View switcher — Front / Back / Left / Right */}
      {builderStatus === 'ready' && availViews.length > 1 && (
        <div className="absolute top-1 left-1/2 -translate-x-1/2 flex items-center gap-0.5 p-0.5 bg-slate-900/80 dark:bg-slate-950/80 rounded-lg backdrop-blur-sm">
          {availViews.map((v) => (
            <button
              key={v}
              onClick={() => setView(v)}
              className={`px-2 py-0.5 rounded-md text-[9px] font-bold uppercase tracking-wide transition-colors cursor-pointer ${
                view === v ? 'bg-white text-slate-900' : 'text-white/60 hover:text-white'
              }`}
            >
              {v}
            </button>
          ))}
        </div>
      )}
    </div>
  );
});

export default GarmentZoneSimulator;
