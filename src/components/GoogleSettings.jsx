import { useState, useEffect, useCallback } from 'react';

const API = (method, path, body) =>
  fetch(`/api${path}`, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : {},
    body: body ? JSON.stringify(body) : undefined,
  }).then(r => r.json());

const REDIRECT_URI = 'http://localhost:3001/api/google/callback';

export default function GoogleSettings({ notify }) {
  const [status, setStatus]         = useState(null);
  const [loading, setLoading]       = useState(true);
  const [testUrl, setTestUrl]       = useState('');
  const [testResult, setTestResult] = useState(null);
  const [testing, setTesting]       = useState(false);
  const [copied, setCopied]         = useState(false);

  const refresh = useCallback(async () => {
    try { const s = await API('GET', '/google/status'); setStatus(s); }
    catch {}
    setLoading(false);
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  // Redirect the whole tab to Google OAuth — no popup, no cross-origin issues
  const handleConnect = async () => {
    try {
      const { url, error } = await API('GET', '/google/auth-url');
      if (error) { notify(error, 'error'); return; }
      window.location.href = url; // full-page redirect to Google
    } catch (e) {
      notify(e.message, 'error');
    }
  };

  const handleDisconnect = async () => {
    await API('DELETE', '/google/disconnect');
    setStatus(s => ({ ...s, connected: false, email: null }));
    setTestResult(null);
    notify('Google Docs disconnected');
  };

  const handleTestDoc = async () => {
    if (!testUrl.trim()) return;
    setTesting(true);
    setTestResult(null);
    try {
      const result = await API('POST', '/google/test-doc', { url: testUrl.trim() });
      setTestResult(result);
    } catch (e) {
      setTestResult({ error: e.message });
    }
    setTesting(false);
  };

  const copyRedirectUri = () => {
    navigator.clipboard?.writeText(REDIRECT_URI);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (loading) return (
    <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6">
      <div className="h-4 w-48 bg-slate-100 dark:bg-slate-800 rounded animate-pulse" />
    </div>
  );

  const { configured, connected, email } = status || {};

  return (
    <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 space-y-5">

      {/* ── Header ── */}
      <div className="flex items-center gap-3">
        <div className="w-8 h-8 rounded-lg bg-white border border-slate-200 dark:border-slate-700 flex items-center justify-center shadow-sm flex-shrink-0">
          <svg viewBox="0 0 24 24" className="w-4 h-4">
            <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
            <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
            <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
            <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
          </svg>
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="text-sm font-bold text-slate-800 dark:text-slate-100">Google Docs Integration</h3>
          <p className="text-xs text-slate-400">Read private BRD specification documents automatically</p>
        </div>
        <span className={`text-[10px] font-bold px-2.5 py-1 rounded-full flex-shrink-0 ${
          connected
            ? 'bg-emerald-100 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-400'
            : 'bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400'
        }`}>
          {connected ? '● Connected' : '○ Not connected'}
        </span>
      </div>

      {/* ── Connected banner ── */}
      {connected && (
        <div className="flex items-center justify-between p-3 bg-emerald-50 dark:bg-emerald-950/20 border border-emerald-200 dark:border-emerald-800/50 rounded-xl">
          <div className="flex items-center gap-2.5">
            <svg className="w-4 h-4 text-emerald-500 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <p className="text-xs font-semibold text-emerald-800 dark:text-emerald-300">
              {email ? `Connected as ${email}` : 'Google account connected'}
            </p>
          </div>
          <button
            onClick={handleDisconnect}
            className="text-xs font-semibold text-slate-500 hover:text-red-500 transition-colors px-2 py-1 rounded-lg hover:bg-red-50 dark:hover:bg-red-950/30 cursor-pointer"
          >
            Disconnect
          </button>
        </div>
      )}

      {/* ── Step-by-step setup (when not configured) ── */}
      {!configured && (
        <div className="p-4 bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800/50 rounded-xl space-y-3 text-xs">
          <p className="font-bold text-amber-900 dark:text-amber-200">Setup required — follow these steps:</p>
          <ol className="list-decimal ml-4 space-y-2 text-amber-800 dark:text-amber-300">
            <li>Open <a href="https://console.cloud.google.com/" target="_blank" rel="noopener noreferrer" className="underline font-semibold">Google Cloud Console</a> → create / select a project</li>
            <li><strong>APIs &amp; Services → Library</strong> → search and enable <strong>Google Drive API</strong></li>
            <li><strong>APIs &amp; Services → Credentials → + Create Credentials → OAuth 2.0 Client ID</strong></li>
            <li>Application type: <strong>Web application</strong></li>
            <li>Under <strong>Authorised redirect URIs</strong> — add exactly:</li>
          </ol>
          <div className="flex items-center gap-2 bg-white dark:bg-slate-900 border border-amber-300 dark:border-amber-700 rounded-lg px-3 py-2">
            <code className="flex-1 text-[11px] font-mono text-amber-900 dark:text-amber-200 select-all">{REDIRECT_URI}</code>
            <button onClick={copyRedirectUri} className="text-[10px] font-semibold text-amber-700 hover:text-amber-900 dark:text-amber-400 dark:hover:text-amber-200 transition-colors flex-shrink-0 cursor-pointer">
              {copied ? '✓ Copied' : 'Copy'}
            </button>
          </div>
          <p className="text-amber-700 dark:text-amber-400">Then copy the Client ID and Client Secret into <code className="bg-amber-100 dark:bg-amber-900/40 px-1 rounded">.env</code>:</p>
          <pre className="bg-amber-100 dark:bg-amber-900/40 rounded-lg p-2 text-[10px] font-mono overflow-x-auto text-amber-900 dark:text-amber-200">
{`GOOGLE_CLIENT_ID=…your client id….apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=…your client secret…`}
          </pre>
          <p className="text-amber-700 dark:text-amber-400 text-[11px]">Restart the server after saving <code>.env</code>, then click Connect below.</p>
        </div>
      )}

      {/* ── Redirect URI reminder (when configured but not connected) ── */}
      {configured && !connected && (
        <div className="space-y-2">
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Make sure your Google Cloud Console OAuth app has this exact redirect URI:
          </p>
          <div className="flex items-center gap-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2">
            <code className="flex-1 text-[11px] font-mono text-slate-600 dark:text-slate-300 select-all">{REDIRECT_URI}</code>
            <button onClick={copyRedirectUri} className="text-[10px] font-semibold text-blue-600 hover:text-blue-800 dark:text-blue-400 transition-colors flex-shrink-0 cursor-pointer">
              {copied ? '✓ Copied' : 'Copy'}
            </button>
          </div>
        </div>
      )}

      {/* ── Connect button ── */}
      {!connected && (
        <button
          onClick={handleConnect}
          disabled={!configured}
          className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 disabled:bg-slate-200 dark:disabled:bg-slate-800 disabled:text-slate-400 text-white text-sm font-semibold transition-all shadow-sm disabled:cursor-not-allowed cursor-pointer"
        >
          Connect Google Account
        </button>
      )}

      {/* ── Test doc fetch ── */}
      <div className="space-y-2 pt-1">
        <label className="text-xs font-semibold text-slate-600 dark:text-slate-300 block">
          Test a Google Docs URL
        </label>
        <div className="flex gap-2">
          <input
            type="url"
            value={testUrl}
            onChange={e => setTestUrl(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleTestDoc()}
            placeholder="https://docs.google.com/document/d/…"
            className="flex-1 px-3 py-2 text-xs rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-800 dark:text-slate-100 focus:ring-2 focus:ring-blue-500 focus:outline-none transition-colors"
          />
          <button
            onClick={handleTestDoc}
            disabled={!testUrl.trim() || testing}
            className="px-3 py-2 rounded-xl bg-slate-800 dark:bg-slate-100 text-white dark:text-slate-900 text-xs font-semibold hover:bg-slate-700 dark:hover:bg-slate-200 disabled:opacity-50 transition-colors cursor-pointer"
          >
            {testing ? '…' : 'Test'}
          </button>
        </div>

        {/* Test result */}
        {testResult && (
          <div className={`p-3 rounded-xl border text-xs space-y-1.5 ${
            testResult.text
              ? 'bg-emerald-50 dark:bg-emerald-950/20 border-emerald-200 dark:border-emerald-800/50'
              : 'bg-red-50 dark:bg-red-950/20 border-red-200 dark:border-red-800/50'
          }`}>
            <div className="flex items-center gap-2 font-semibold">
              {testResult.text ? (
                <><span className="text-emerald-600">✓</span>
                <span className="text-emerald-800 dark:text-emerald-300">
                  Document read via {testResult.via === 'oauth' ? 'Google OAuth' : 'public URL'} — {testResult.wordCount} words
                </span></>
              ) : (
                <><span className="text-red-500">✕</span>
                <span className="text-red-700 dark:text-red-400">{testResult.error}</span></>
              )}
            </div>
            <div className="flex gap-3 text-[10px]">
              <span className={`px-1.5 py-0.5 rounded font-mono ${testResult.hasToken ? 'bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700' : 'bg-slate-100 dark:bg-slate-800 text-slate-500'}`}>
                token: {testResult.hasToken ? 'yes' : 'no'}
              </span>
              <span className={`px-1.5 py-0.5 rounded font-mono ${testResult.connected ? 'bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700' : 'bg-slate-100 dark:bg-slate-800 text-slate-500'}`}>
                connected: {testResult.connected ? 'yes' : 'no'}
              </span>
            </div>
            {testResult.preview && (
              <p className="text-slate-500 dark:text-slate-400 text-[10px] font-mono leading-relaxed bg-white dark:bg-slate-900/50 p-2 rounded-lg border border-slate-100 dark:border-slate-800 truncate">
                {testResult.preview}
              </p>
            )}
          </div>
        )}
      </div>

      <p className="text-[10px] text-slate-400 dark:text-slate-500 leading-relaxed">
        Once connected, any BRD with a Google Docs link will have its full specification automatically fetched during analysis — no need to make the document public.
      </p>
    </div>
  );
}
