import { useEffect, useRef, useState } from 'react';

export default function Garment3DView({ views, brandStyleId, onClose }) {
  const mountRef = useRef(null);
  const [loading, setLoading] = useState(true);
  const [hint, setHint]       = useState('');

  const front = views?.front || null;

  // AI render state
  const [aiImage, setAiImage]     = useState(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError]     = useState('');
  const [mode, setMode]           = useState('geometry');

  const runAIRender = async () => {
    if (aiImage) { setMode('ai'); return; }
    setAiLoading(true); setAiError(''); setMode('ai');
    try {
      const res = await fetch('/api/ai/render-3d', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ imageBase64: front }),
      });
      const data = await res.json();
      if (data.image) setAiImage(data.image);
      else setAiError(data.error || 'AI render failed.');
    } catch (e) { setAiError(e.message); }
    finally { setAiLoading(false); }
  };

  // ── Merge the captured views into one seamless 360° strip, wrapped on a
  //    smooth tapered cylinder (high radial segments → no visible edges) ──────
  useEffect(() => {
    if (mode !== 'geometry' || !mountRef.current || !front) return;
    const container = mountRef.current;
    let renderer, animId, cleanup, disposeList = [];

    // Build a horizontal strip canvas: panels ordered around the circumference
    const buildStrip = () => new Promise((resolve) => {
      // Circumferential order so neighbours blend naturally:
      // front → right → back → left → (wraps to front)
      const order = ['front', 'right', 'back', 'left'].filter(v => views[v]);
      if (order.length === 0) { resolve(null); return; }

      const loadImg = (src) => new Promise((res) => {
        const im = new Image();
        im.onload = () => res(im);
        im.onerror = () => res(null);
        im.src = src;
      });

      Promise.all(order.map(v => loadImg(views[v]))).then((imgs) => {
        const valid = imgs.filter(Boolean);
        if (!valid.length) { resolve(null); return; }

        const PW = 512, PH = 640;                 // per-panel resolution
        const n  = order.length;
        const canvas = document.createElement('canvas');
        canvas.width  = PW * n;
        canvas.height = PH;
        const ctx = canvas.getContext('2d');

        // Dark fabric backdrop so transparent gaps read as continuous garment
        const grad = ctx.createLinearGradient(0, 0, 0, PH);
        grad.addColorStop(0, '#1e293b');
        grad.addColorStop(1, '#0f172a');
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        imgs.forEach((im, i) => {
          if (!im) return;
          const scale = Math.min(PW / im.width, PH / im.height) * 0.96;
          const w = im.width * scale, h = im.height * scale;
          ctx.drawImage(im, i * PW + (PW - w) / 2, (PH - h) / 2, w, h);
        });
        resolve({ canvas, panels: n });
      });
    });

    Promise.all([
      import('three'),
      import('three/examples/jsm/environments/RoomEnvironment.js'),
      buildStrip(),
    ]).then(([THREE, { RoomEnvironment }, strip]) => {
      if (!strip) { setLoading(false); setHint('Could not build 3D'); return; }

      const W = Math.min(window.innerWidth  - 48, 660);
      const H = Math.min(window.innerHeight - 210, 680);

      renderer = new THREE.WebGLRenderer({ antialias: true });
      renderer.setSize(W, H);
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
      renderer.toneMapping         = THREE.ACESFilmicToneMapping;
      renderer.toneMappingExposure = 1.1;
      renderer.outputColorSpace    = THREE.SRGBColorSpace;
      renderer.shadowMap.enabled   = true;
      renderer.shadowMap.type      = THREE.PCFSoftShadowMap;
      container.innerHTML = '';
      container.appendChild(renderer.domElement);

      const scene = new THREE.Scene();
      scene.background = new THREE.Color(0x0b1120);
      const pmrem  = new THREE.PMREMGenerator(renderer);
      const envTex = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
      scene.environment = envTex;
      disposeList.push(pmrem, envTex);

      const camera = new THREE.PerspectiveCamera(40, W / H, 0.1, 100);
      camera.position.set(0, 0.1, 4.2);

      const group = new THREE.Group();
      scene.add(group);

      // ── Seamless texture from the merged strip ──────────────────────────────
      const tex = new THREE.CanvasTexture(strip.canvas);
      tex.colorSpace = THREE.SRGBColorSpace;
      tex.anisotropy = renderer.capabilities.getMaxAnisotropy();
      tex.wrapS = THREE.RepeatWrapping;
      tex.wrapT = THREE.ClampToEdgeWrapping;
      disposeList.push(tex);

      // ── Tapered body cylinder — high radial segments = perfectly smooth ─────
      const RTOP = 0.82, RBOT = 0.92, HGT = 2.25;
      const bodyGeo = new THREE.CylinderGeometry(RTOP, RBOT, HGT, 160, 1, true);
      const bodyMat = new THREE.MeshStandardMaterial({
        map: tex, roughness: 0.6, metalness: 0.0, envMapIntensity: 0.9, side: THREE.DoubleSide,
      });
      const body = new THREE.Mesh(bodyGeo, bodyMat);
      body.castShadow = true;
      // Rotate so the FRONT panel faces the camera (+z). The strip starts at the
      // cylinder's default seam; quarter-turn aligns front to view.
      body.rotation.y = Math.PI / 2;
      group.add(body);
      disposeList.push(bodyGeo, bodyMat);

      // ── Rounded shoulder cap (smooth top, no open hole) ─────────────────────
      const capGeo = new THREE.SphereGeometry(RTOP, 160, 32, 0, Math.PI * 2, 0, Math.PI / 2);
      const capMat = new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.8, metalness: 0, envMapIntensity: 0.5 });
      const cap = new THREE.Mesh(capGeo, capMat);
      cap.position.y = HGT / 2;
      cap.scale.set(1, 0.45, 1);
      cap.castShadow = true;
      group.add(cap);
      disposeList.push(capGeo, capMat);

      // ── Bottom hem cap ──────────────────────────────────────────────────────
      const hemGeo = new THREE.CircleGeometry(RBOT, 160);
      const hemMat = new THREE.MeshStandardMaterial({ color: 0x0f172a, roughness: 0.9, metalness: 0, side: THREE.DoubleSide });
      const hem = new THREE.Mesh(hemGeo, hemMat);
      hem.rotation.x = Math.PI / 2;
      hem.position.y = -HGT / 2;
      group.add(hem);
      disposeList.push(hemGeo, hemMat);

      // ── Contact shadow ──────────────────────────────────────────────────────
      const shGeo = new THREE.PlaneGeometry(7, 7);
      const shMat = new THREE.ShadowMaterial({ opacity: 0.4 });
      const sp = new THREE.Mesh(shGeo, shMat);
      sp.rotation.x = -Math.PI / 2; sp.position.y = -HGT / 2 - 0.05; sp.receiveShadow = true;
      scene.add(sp); disposeList.push(shGeo, shMat);

      // ── Lights ──────────────────────────────────────────────────────────────
      const key = new THREE.DirectionalLight(0xffffff, 1.5);
      key.position.set(3, 6, 5); key.castShadow = true;
      key.shadow.mapSize.set(2048, 2048); key.shadow.bias = -0.0004;
      Object.assign(key.shadow.camera, { near: 0.5, far: 20, left: -4, right: 4, top: 4, bottom: -4 });
      scene.add(key);
      const fill = new THREE.DirectionalLight(0x88aaff, 0.35); fill.position.set(-4, 2, 1); scene.add(fill);
      const rim  = new THREE.PointLight(0x818cf8, 0.8, 12); rim.position.set(-2, 1.5, -3); scene.add(rim);

      setLoading(false);
      setHint('Drag to rotate · Scroll to zoom');
      setTimeout(() => setHint(''), 3200);

      // ── Interaction ──────────────────────────────────────────────────────────
      let drag = false, px = 0, py = 0, auto = true;
      const down = (e) => { drag = true; auto = false; px = e.touches?e.touches[0].clientX:e.clientX; py = e.touches?e.touches[0].clientY:e.clientY; };
      const move = (e) => { if (!drag) return; const cx = e.touches?e.touches[0].clientX:e.clientX, cy = e.touches?e.touches[0].clientY:e.clientY; group.rotation.y += (cx-px)*0.012; group.rotation.x = Math.max(-0.4,Math.min(0.4,group.rotation.x+(cy-py)*0.005)); px=cx; py=cy; };
      const up = () => { drag = false; };
      const wheel = (e) => { camera.position.z = Math.max(2.6, Math.min(7, camera.position.z + e.deltaY*0.004)); };
      const el = renderer.domElement;
      el.addEventListener('mousedown', down); el.addEventListener('touchstart', down, {passive:true});
      window.addEventListener('mousemove', move); window.addEventListener('touchmove', move, {passive:true});
      window.addEventListener('mouseup', up); window.addEventListener('touchend', up);
      el.addEventListener('wheel', wheel, {passive:true});
      cleanup = () => {
        el.removeEventListener('mousedown', down); el.removeEventListener('touchstart', down);
        window.removeEventListener('mousemove', move); window.removeEventListener('touchmove', move);
        window.removeEventListener('mouseup', up); window.removeEventListener('touchend', up);
        el.removeEventListener('wheel', wheel);
      };

      const animate = () => {
        animId = requestAnimationFrame(animate);
        if (auto && !drag) group.rotation.y += 0.006;
        renderer.render(scene, camera);
      };
      animate();
    }).catch((e) => { console.error('[Garment3DView] render failed:', e); setLoading(false); setHint('3D engine failed to load'); });

    return () => {
      cancelAnimationFrame(animId); cleanup?.();
      disposeList.forEach(o => o?.dispose?.());
      if (renderer) { renderer.dispose(); if (renderer.domElement.parentNode === container) container.removeChild(renderer.domElement); }
    };
  }, [front, mode]); // eslint-disable-line react-hooks/exhaustive-deps

  const viewCount = views ? Object.keys(views).length : 0;

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/85 backdrop-blur-sm" onClick={onClose}>
      <div className="relative flex flex-col items-center gap-3" onClick={e => e.stopPropagation()}>

        {/* Header */}
        <div className="flex items-center justify-between w-full px-1">
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded-lg bg-gradient-to-br from-blue-500 to-violet-600 flex items-center justify-center">
              <svg className="w-3.5 h-3.5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 10l-2 1m0 0l-2-1m2 1v2.5M20 7l-2 1m2-1l-2-1m2 1v2.5M14 4l-2-1-2 1M4 7l2-1M4 7l2 1M4 7v2.5M12 21l-2-1m2 1l2-1m-2 1v-2.5M6 18l-2-1v-2.5M18 18l2-1v-2.5"/>
              </svg>
            </div>
            <span className="text-sm font-bold text-white">3D Uniform Preview</span>
            {brandStyleId && <span className="text-[10px] font-mono text-blue-300 bg-blue-500/20 px-2 py-0.5 rounded-full">#{brandStyleId}</span>}
            {viewCount > 1 && <span className="text-[10px] font-semibold text-emerald-300 bg-emerald-500/20 px-2 py-0.5 rounded-full">{viewCount} views merged</span>}
          </div>
          <button onClick={onClose} className="w-7 h-7 rounded-lg bg-white/10 hover:bg-white/20 flex items-center justify-center text-white/70 hover:text-white transition-colors cursor-pointer">
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12"/></svg>
          </button>
        </div>

        {/* Mode toggle */}
        <div className="flex items-center gap-1 p-1 bg-white/10 rounded-xl">
          <button onClick={() => setMode('geometry')}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${mode === 'geometry' ? 'bg-white text-slate-900' : 'text-white/70 hover:text-white'}`}>
            3D Geometry
          </button>
          <button onClick={runAIRender}
            className={`flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${mode === 'ai' ? 'bg-gradient-to-r from-blue-500 to-violet-500 text-white' : 'text-white/70 hover:text-white'}`}>
            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z"/></svg>
            AI Photo Render
          </button>
        </div>

        {/* Canvas / AI image */}
        <div className="relative rounded-2xl overflow-hidden shadow-2xl ring-1 ring-white/10 bg-slate-950" style={{ minWidth: 320, minHeight: 360 }}>
          {mode === 'geometry' && (
            <>
              {loading && (
                <div className="absolute inset-0 flex flex-col items-center justify-center bg-slate-950 z-10">
                  <div className="w-10 h-10 border-2 border-blue-500 border-t-transparent rounded-full animate-spin mb-3"/>
                  <p className="text-xs text-slate-400">Merging {viewCount} view{viewCount>1?'s':''} into 3D…</p>
                </div>
              )}
              <div ref={mountRef} />
            </>
          )}

          {mode === 'ai' && (
            <div className="flex items-center justify-center" style={{ width: 640, height: 640, maxWidth: '90vw', maxHeight: '70vh' }}>
              {aiLoading && (
                <div className="flex flex-col items-center justify-center gap-3 p-10 text-center">
                  <div className="relative w-12 h-12">
                    <div className="absolute inset-0 rounded-full border-2 border-violet-500/30"/>
                    <div className="absolute inset-0 rounded-full border-2 border-violet-500 border-t-transparent animate-spin"/>
                  </div>
                  <p className="text-sm font-semibold text-white">AI is rendering your uniform…</p>
                  <p className="text-xs text-slate-400 max-w-xs">Gemini is generating a photorealistic 3D product photo. This can take 10–20 seconds.</p>
                </div>
              )}
              {!aiLoading && aiImage && <img src={aiImage} alt="AI 3D render" className="w-full h-full object-contain" />}
              {!aiLoading && aiError && (
                <div className="flex flex-col items-center justify-center gap-3 p-10 text-center">
                  <div className="w-12 h-12 rounded-xl bg-amber-500/10 flex items-center justify-center text-amber-400">
                    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M12 9v2m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
                  </div>
                  <p className="text-sm font-semibold text-white">AI render unavailable</p>
                  <p className="text-xs text-slate-400 max-w-sm">{aiError}</p>
                  <button onClick={() => setMode('geometry')} className="mt-1 px-4 py-2 rounded-xl bg-white/10 hover:bg-white/20 text-white text-xs font-semibold transition-colors cursor-pointer">← Back to 3D Geometry</button>
                </div>
              )}
            </div>
          )}
        </div>

        {hint && mode === 'geometry' && (
          <p className="text-[11px] text-slate-400 flex items-center gap-1.5">
            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 15l-2 5L9 9l11 4-5 2zm0 0l5 5"/></svg>
            {hint}
          </p>
        )}
        {mode === 'ai' && aiImage && (
          <a href={aiImage} download={`uniform-3d-${brandStyleId || 'render'}.png`} className="text-[11px] text-blue-300 hover:text-blue-200 flex items-center gap-1 cursor-pointer">
            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"/></svg>
            Download render
          </a>
        )}
      </div>
    </div>
  );
}
