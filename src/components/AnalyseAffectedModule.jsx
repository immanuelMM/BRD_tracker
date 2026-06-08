import { useState, useEffect, useRef } from 'react';
import mammoth from 'mammoth';
import { jsPDF } from 'jspdf';
import { analyzeAffectedModules, fmtTitle } from '../utils/db';
import GarmentZoneSimulator from './GarmentZoneSimulator';
import Garment3DView        from './Garment3DView';

// ── Severity colour helpers ────────────────────────────────────────────────────
const SEV_RGB   = { High: [239,68,68], Medium: [245,158,11], Low: [16,185,129] };
const SEV_HEX   = { High: '#ef4444',   Medium: '#f59e0b',   Low:  '#10b981'   };

// ── PDF export ────────────────────────────────────────────────────────────────
function downloadResultsPDF(analysis, brd) {
  const doc  = new jsPDF({ unit: 'mm', format: 'a4' });
  const W    = doc.internal.pageSize.getWidth();
  const H    = doc.internal.pageSize.getHeight();
  const ML   = 14;          // margin left
  const MR   = W - ML;      // margin right
  const CW   = W - ML * 2;  // content width
  let y      = 0;

  const checkPage = (need = 10) => {
    if (y + need > H - 14) { doc.addPage(); y = 16; }
  };

  const txt = (text, size, style, rgb = [30,30,30]) => {
    doc.setFontSize(size); doc.setFont('helvetica', style);
    doc.setTextColor(...rgb);
  };

  const wrappedText = (text, x, maxW, lineH) => {
    const lines = doc.splitTextToSize(String(text || ''), maxW);
    lines.forEach(ln => { checkPage(lineH); doc.text(ln, x, y); y += lineH; });
    return lines.length;
  };

  // ── Header band ──────────────────────────────────────────────────────────────
  doc.setFillColor(30, 58, 138);          // dark navy
  doc.rect(0, 0, W, 22, 'F');
  doc.setFillColor(37, 99, 235);          // blue accent stripe
  doc.rect(0, 19, W, 3, 'F');

  txt('ARCHITECTURAL IMPACT ANALYSIS', 11, 'bold', [255,255,255]);
  doc.text('ARCHITECTURAL IMPACT ANALYSIS', ML, 8);

  txt(new Date().toLocaleDateString('en-GB', { day:'2-digit', month:'short', year:'numeric' }), 7, 'normal', [147,197,253]);
  doc.text(new Date().toLocaleDateString('en-GB', { day:'2-digit', month:'short', year:'numeric' }), W - ML, 8, { align: 'right' });

  const title = (brd?.title || 'Affected Module Report').slice(0, 90);
  txt(title, 9, 'normal', [186, 212, 253]);
  doc.text(title, ML, 15);

  const providerLabel = analysis.provider === 'gemini' ? 'Gemini AI' : analysis.provider === 'anthropic' ? 'Claude AI' : analysis.provider === 'openai' ? 'OpenAI' : 'Rule-based';
  txt(providerLabel, 7, 'bold', [147,197,253]);
  doc.text(providerLabel, W - ML, 15, { align: 'right' });
  y = 30;

  // ── Impact Score row ─────────────────────────────────────────────────────────
  const score = analysis.impactScore ?? 0;
  const scoreColor = score >= 70 ? [239,68,68] : score >= 40 ? [245,158,11] : [16,185,129];
  const label = score >= 70 ? 'HIGH IMPACT' : score >= 40 ? 'MODERATE IMPACT' : 'LOW IMPACT';

  // Score circle
  doc.setDrawColor(...scoreColor); doc.setLineWidth(2.5);
  doc.circle(ML + 13, y + 10, 11, 'S');
  txt(String(score), 14, 'bold', scoreColor);
  doc.text(String(score), ML + 13, y + 12, { align: 'center' });

  // Label + verdict text
  doc.setFillColor(...scoreColor);
  doc.roundedRect(ML + 28, y, 34, 6, 1.5, 1.5, 'F');
  txt(label, 7, 'bold', [255,255,255]);
  doc.text(label, ML + 45, y + 4.2, { align: 'center' });

  y += 8;
  txt(analysis.verdict || '', 8, 'normal', [71,85,105]);
  const verdictLines = doc.splitTextToSize(analysis.verdict || '', CW - 30);
  verdictLines.slice(0, 4).forEach(ln => { doc.text(ln, ML + 28, y); y += 4.5; });
  y += 4;

  // ── Section helper ────────────────────────────────────────────────────────────
  const sectionHeader = (title) => {
    checkPage(10);
    doc.setFillColor(241, 245, 249);
    doc.rect(ML - 1, y - 4, CW + 2, 7, 'F');
    doc.setDrawColor(203, 213, 225);
    doc.setLineWidth(0.3);
    doc.line(ML - 1, y - 4, ML - 1, y + 3);
    doc.setFillColor(37, 99, 235);
    doc.rect(ML - 1, y - 4, 2.5, 7, 'F');
    txt(title, 8, 'bold', [30, 64, 175]);
    doc.text(title, ML + 4, y + 0.5);
    y += 7;
  };

  // ── Affected Modules ─────────────────────────────────────────────────────────
  sectionHeader(`AFFECTED MODULES  (${(analysis.affectedModules || []).length})`);

  (analysis.affectedModules || []).forEach((mod, i) => {
    checkPage(22);

    const sRgb = SEV_RGB[mod.severity] || [100,116,139];
    const isAlt = i % 2 === 1;
    if (isAlt) {
      doc.setFillColor(248, 250, 252); doc.rect(ML, y - 1, CW, 20, 'F');
    }

    // Severity badge
    doc.setFillColor(...sRgb);
    doc.roundedRect(ML, y, 18, 5, 1.2, 1.2, 'F');
    txt(mod.severity?.toUpperCase() || '', 5.5, 'bold', [255,255,255]);
    doc.text(mod.severity?.toUpperCase() || '', ML + 9, y + 3.6, { align:'center' });

    // Module name
    txt(mod.name || '', 8, 'bold', [15,23,42]);
    doc.text(mod.name || '', ML + 21, y + 3.5);

    y += 7;

    // Path
    txt(mod.path || '', 6.5, 'normal', [100,116,139]);
    doc.text(doc.splitTextToSize(mod.path || '', CW - 4)[0], ML + 2, y);
    y += 4.5;

    // Role
    if (mod.role) {
      txt('Role: ' + (mod.role || ''), 7, 'italic', [71,85,105]);
      const roleLines = doc.splitTextToSize('Role: ' + mod.role, CW - 4);
      roleLines.slice(0,2).forEach(ln => { checkPage(4.5); doc.text(ln, ML + 2, y); y += 4.5; });
    }

    // Explanation
    if (mod.explanation) {
      txt(mod.explanation, 7, 'normal', [71,85,105]);
      const expLines = doc.splitTextToSize(mod.explanation, CW - 4);
      expLines.slice(0, 3).forEach(ln => { checkPage(4.5); doc.text(ln, ML + 2, y); y += 4.5; });
    }

    y += 2;

    // Divider
    doc.setDrawColor(226,232,240); doc.setLineWidth(0.2);
    doc.line(ML, y, MR, y);
    y += 3;
  });

  y += 2;

  // ── Architectural Concepts ───────────────────────────────────────────────────
  if ((analysis.affectedConcepts || []).length > 0) {
    sectionHeader('ARCHITECTURAL CONCEPTS');
    const concepts = analysis.affectedConcepts || [];
    let cx = ML;
    const pillH = 6; const pillPadX = 4; const pillGap = 3;
    concepts.forEach(concept => {
      const pw = doc.getTextWidth(concept) + pillPadX * 2;
      if (cx + pw > MR) { cx = ML; y += pillH + 3; checkPage(pillH + 3); }
      doc.setFillColor(239, 246, 255);
      doc.setDrawColor(147, 197, 253);
      doc.setLineWidth(0.3);
      doc.roundedRect(cx, y, pw, pillH, 1.5, 1.5, 'FD');
      txt(concept, 6.5, 'normal', [29, 78, 216]);
      doc.text(concept, cx + pillPadX, y + 4);
      cx += pw + pillGap;
    });
    y += pillH + 6;
  }

  // ── Developer Action Plan ────────────────────────────────────────────────────
  if ((analysis.recommendations || []).length > 0) {
    checkPage(14);
    sectionHeader('DEVELOPER ACTION PLAN');
    (analysis.recommendations || []).forEach((rec, i) => {
      checkPage(10);
      // Number circle
      doc.setFillColor(37, 99, 235);
      doc.circle(ML + 3, y + 1.5, 3, 'F');
      txt(String(i + 1), 6, 'bold', [255,255,255]);
      doc.text(String(i + 1), ML + 3, y + 3, { align: 'center' });

      txt(rec, 7.5, 'normal', [30,41,59]);
      const recLines = doc.splitTextToSize(rec, CW - 10);
      recLines.forEach((ln, li) => {
        checkPage(5);
        doc.text(ln, ML + 9, y + (li === 0 ? 3 : 0));
        if (li > 0) y += 5;
      });
      y += recLines.length > 1 ? 5 : 8;
    });
  }

  // ── Functions Affected ────────────────────────────────────────────────────────
  if ((analysis.affectedStyleFeatures || []).length > 0) {
    checkPage(14);
    sectionHeader(`FUNCTIONS AFFECTED  (${analysis.affectedStyleFeatures.length})`);

    const impRgb = { High:[239,68,68], Medium:[245,158,11], Low:[16,185,129] };
    const stRgb  = { new:[59,130,246], ongoing:[245,158,11], assessment:[139,92,246], stable:[148,163,184] };
    // Only treat short strings as severity labels (High/Medium/Low)
    const isSeverity = (v) => ['high','medium','low'].includes((v||'').toLowerCase());

    analysis.affectedStyleFeatures.forEach((sf, i) => {
      // Estimate row height: name row (6) + tab row (4.5) + explanation rows
      const expText = sf.explanation || '';
      const expLines = doc.splitTextToSize(expText, CW - 4);
      const rowH = 6 + 4.5 + Math.min(expLines.length, 3) * 4.5 + 6;
      checkPage(rowH);

      const isAlt = i % 2 === 1;
      if (isAlt) { doc.setFillColor(248, 250, 252); doc.rect(ML - 1, y - 1, CW + 2, rowH - 2, 'F'); }

      // ── Row 1: status pill | feature name | impact badge ──────────────────
      // Status pill
      const sRgb = stRgb[sf.status] || stRgb.stable;
      doc.setFillColor(...sRgb);
      doc.roundedRect(ML, y, 26, 5, 1.2, 1.2, 'F');
      txt((sf.status || 'stable').toUpperCase(), 5, 'bold', [255, 255, 255]);
      doc.text((sf.status || 'stable').toUpperCase(), ML + 13, y + 3.6, { align: 'center' });

      // Feature name — limited to space between pill and impact badge
      const featMaxW = CW - 30 - 24;
      txt(sf.feature || '', 8.5, 'bold', [15, 23, 42]);
      const featLine = doc.splitTextToSize(sf.feature || '', featMaxW)[0];
      doc.text(featLine, ML + 29, y + 3.8);

      // Impact badge — right-aligned, only render if it's a severity label
      if (isSeverity(sf.impact)) {
        const iRgb = impRgb[sf.impact] || impRgb.Medium;
        doc.setFillColor(...iRgb);
        doc.roundedRect(MR - 22, y, 22, 5, 1.2, 1.2, 'F');
        txt(sf.impact.toUpperCase(), 5.5, 'bold', [255, 255, 255]);
        doc.text(sf.impact.toUpperCase(), MR - 11, y + 3.6, { align: 'center' });
      }
      y += 7;

      // ── Row 2: tab label ───────────────────────────────────────────────────
      txt(sf.tab || '', 7, 'normal', [100, 116, 139]);
      doc.text(sf.tab || '', ML + 2, y);
      y += 5;

      // ── Row 3: explanation text (wraps up to 3 lines) ─────────────────────
      if (expText) {
        txt(expText, 7.5, 'normal', [71, 85, 105]);
        expLines.slice(0, 3).forEach(ln => {
          checkPage(4.5);
          doc.text(ln, ML + 2, y);
          y += 4.5;
        });
      }

      // Divider
      doc.setDrawColor(226, 232, 240); doc.setLineWidth(0.2);
      doc.line(ML, y + 1, MR, y + 1);
      y += 4;
    });
  }

  // ── Footer ───────────────────────────────────────────────────────────────────
  const totalPages = doc.getNumberOfPages();
  for (let p = 1; p <= totalPages; p++) {
    doc.setPage(p);
    doc.setFillColor(248, 250, 252);
    doc.rect(0, H - 10, W, 10, 'F');
    doc.setDrawColor(203, 213, 225); doc.setLineWidth(0.3);
    doc.line(0, H - 10, W, H - 10);
    txt('BRD Insight · Affected Module Analysis', 6.5, 'normal', [100,116,139]);
    doc.text('BRD Insight · Affected Module Analysis', ML, H - 4);
    txt(`Page ${p} / ${totalPages}`, 6.5, 'normal', [100,116,139]);
    doc.text(`Page ${p} / ${totalPages}`, W - ML, H - 4, { align: 'right' });
  }

  const slug = (brd?.title || 'analysis').replace(/[^a-z0-9]/gi, '-').toLowerCase().slice(0,40);
  doc.save(`affected-modules-${slug}.pdf`);
}

// ── Word / DOCX export (Word-compatible HTML → .doc blob) ─────────────────────
// Rules for Word table alignment:
//   • Use width/bgcolor/valign/align as HTML attributes (not CSS-only)
//   • No display:inline-block, no border-collapse CSS — use cellspacing="0" instead
//   • Severity badges: solid-background <td> cells, no <span> wrapping
//   • Row striping: apply bgcolor to every <td>, never the <tr>
function downloadResultsDocx(analysis, brd) {
  const title    = brd?.title || 'Affected Module Analysis';
  const date     = new Date().toLocaleDateString('en-GB', { day:'2-digit', month:'long', year:'numeric' });
  const score    = analysis.impactScore ?? 0;
  const scoreHex = score >= 70 ? '#dc2626' : score >= 40 ? '#d97706' : '#059669';
  const label    = score >= 70 ? 'HIGH IMPACT' : score >= 40 ? 'MODERATE IMPACT' : 'LOW IMPACT';
  const provider = { gemini:'Gemini AI', anthropic:'Claude AI', openai:'OpenAI' }[analysis.provider] || 'Rule-based';

  const sevBg  = (s) => SEV_HEX[s] || '#64748b';
  const rowBg  = (i) => i % 2 === 0 ? '#f8fafc' : '#ffffff';

  // ── Modules table rows — every style is an HTML attr, not CSS only ─────────
  const moduleRows = (analysis.affectedModules || []).map((m, i) => `
<tr>
  <td width="80" bgcolor="${rowBg(i)}" valign="top"
      style="padding:7px 9px;border:1px solid #cbd5e1;">
    <table cellpadding="2" cellspacing="0" border="0" width="72">
      <tr><td bgcolor="${sevBg(m.severity)}" align="center"
              style="border-radius:3px;padding:2px 6px;">
        <font color="#ffffff" style="font-size:8.5pt;font-weight:bold;">${(m.severity||'').toUpperCase()}</font>
      </td></tr>
    </table>
  </td>
  <td width="200" bgcolor="${rowBg(i)}" valign="top"
      style="padding:7px 9px;border:1px solid #cbd5e1;">
    <p style="margin:0;font-size:10.5pt;font-weight:bold;color:#0f172a;">${m.name}</p>
    <p style="margin:2px 0 0;font-size:7.5pt;font-family:Courier New,monospace;color:#64748b;">${m.path}</p>
    ${m.role ? `<p style="margin:3px 0 0;font-size:8.5pt;color:#475569;font-style:italic;">${m.role}</p>` : ''}
  </td>
  <td bgcolor="${rowBg(i)}" valign="top"
      style="padding:7px 9px;border:1px solid #cbd5e1;font-size:9.5pt;color:#334155;line-height:1.5;">
    ${m.explanation || '&mdash;'}
  </td>
</tr>`).join('');

  // ── Concepts: one row per concept in a tight table (no inline-block) ────────
  const conceptCells = (analysis.affectedConcepts || []).map(c => `
  <td style="padding:3px 10px;border:1px solid #93c5fd;background:#eff6ff;border-radius:10px;white-space:nowrap;">
    <font color="#1d4ed8" style="font-size:9.5pt;">${c}</font>
  </td>
  <td width="6"></td>`).join('');

  const conceptsSection = (analysis.affectedConcepts || []).length ? `
<h2>Architectural Concepts</h2>
<table cellpadding="0" cellspacing="0" border="0"><tr>${conceptCells}</tr></table>
<p></p>` : '';

  // ── Recommendations as a numbered list ──────────────────────────────────────
  const recItems = (analysis.recommendations || []).map((r, i) => `
<tr>
  <td width="28" valign="top" style="padding:4px 6px 4px 0;">
    <table cellpadding="2" cellspacing="0" border="0" width="22">
      <tr><td bgcolor="#1e3a8a" align="center" style="border-radius:11px;">
        <font color="#ffffff" style="font-size:8.5pt;font-weight:bold;">${i+1}</font>
      </td></tr>
    </table>
  </td>
  <td valign="top" style="padding:4px 0;font-size:10pt;color:#1e293b;line-height:1.5;">${r}</td>
</tr>`).join('');

  const recsSection = (analysis.recommendations || []).length ? `
<h2>Developer Action Plan</h2>
<table cellpadding="0" cellspacing="0" border="0" width="100%">${recItems}</table>` : '';

  const html = `
<html xmlns:o='urn:schemas-microsoft-com:office:office'
      xmlns:w='urn:schemas-microsoft-com:office:word'
      xmlns='http://www.w3.org/TR/REC-html40'>
<head><meta charset='utf-8'>
<style>
  body  { font-family:Calibri,sans-serif; font-size:11pt; margin:1.8cm 2cm; color:#1e293b; }
  h1    { font-size:15pt; font-weight:bold; margin:0; }
  h2    { font-size:11.5pt; color:#1d4ed8; margin:16pt 0 7pt;
          border-bottom:2pt solid #bfdbfe; padding-bottom:4pt; }
  p     { margin:0 0 6pt; line-height:1.5; }
</style>
</head>
<body>

<!-- ── HEADER BAND ───────────────────────────────────────────────────────── -->
<table width="100%" cellpadding="0" cellspacing="0" border="0">
  <tr>
    <td bgcolor="#1e3a8a" style="padding:14px 18px;" width="75%" valign="middle">
      <p style="color:#bfdbfe;font-size:8pt;margin:0 0 5pt;letter-spacing:1px;">
        ARCHITECTURAL IMPACT ANALYSIS &nbsp;·&nbsp; ${date} &nbsp;·&nbsp; ${provider}
      </p>
      <h1 style="color:#ffffff;">${title}</h1>
    </td>
    <td bgcolor="#1e3a8a" style="padding:14px 18px;" width="25%" valign="middle" align="right">
      <p style="font-size:30pt;font-weight:900;color:${scoreHex};margin:0;line-height:1;">${score}</p>
      <p style="font-size:8pt;font-weight:bold;color:#93c5fd;margin:2pt 0 0;letter-spacing:1px;">${label}</p>
    </td>
  </tr>
</table>
<table width="100%" cellpadding="0" cellspacing="0" border="0">
  <tr><td bgcolor="#dbeafe" style="padding:5px 18px;font-size:8.5pt;color:#1e40af;">
    ${(analysis.affectedModules||[]).length} modules affected &nbsp;·&nbsp; Score: ${score}/100
    ${analysis.docFetched ? ' &nbsp;·&nbsp; Specification document included' : ''}
  </td></tr>
</table>

<p></p>

<!-- ── VERDICT ───────────────────────────────────────────────────────────── -->
<h2>Scan Verdict</h2>
<p style="font-size:10.5pt;color:#334155;">${analysis.verdict || ''}</p>

<!-- ── AFFECTED MODULES ──────────────────────────────────────────────────── -->
<h2>Affected Modules &nbsp; <font color="#64748b" style="font-size:9pt;font-weight:normal;">(${(analysis.affectedModules||[]).length} identified)</font></h2>
<table width="100%" cellpadding="0" cellspacing="0" border="0">
  <tr>
    <td bgcolor="#1e3a8a" width="80"  style="padding:7px 9px;border:1px solid #1e3a8a;">
      <font color="#ffffff" style="font-size:9pt;font-weight:bold;">Severity</font>
    </td>
    <td bgcolor="#1e3a8a" width="200" style="padding:7px 9px;border:1px solid #1e3a8a;">
      <font color="#ffffff" style="font-size:9pt;font-weight:bold;">Module / Path</font>
    </td>
    <td bgcolor="#1e3a8a" style="padding:7px 9px;border:1px solid #1e3a8a;">
      <font color="#ffffff" style="font-size:9pt;font-weight:bold;">Impact &amp; Required Change</font>
    </td>
  </tr>
  ${moduleRows}
</table>

${conceptsSection}

${recsSection}

<!-- ── FUNCTIONS AFFECTED ──────────────────────────────────────────────── -->
${(analysis.affectedStyleFeatures || []).length ? `
<h2>Functions Affected</h2>
<table width="100%" cellpadding="0" cellspacing="0" border="0">
  <tr>
    <td width="160" bgcolor="#1e3a8a" style="padding:7px 9px;border:1px solid #1e3a8a;">
      <font color="#ffffff" style="font-size:9pt;font-weight:bold;">Function</font>
    </td>
    <td width="120" bgcolor="#1e3a8a" style="padding:7px 9px;border:1px solid #1e3a8a;">
      <font color="#ffffff" style="font-size:9pt;font-weight:bold;">Tab / Section</font>
    </td>
    <td width="70" align="center" bgcolor="#1e3a8a" style="padding:7px 9px;border:1px solid #1e3a8a;">
      <font color="#ffffff" style="font-size:9pt;font-weight:bold;">Impact</font>
    </td>
    <td bgcolor="#1e3a8a" style="padding:7px 9px;border:1px solid #1e3a8a;">
      <font color="#ffffff" style="font-size:9pt;font-weight:bold;">How It Is Affected</font>
    </td>
  </tr>
  ${(analysis.affectedStyleFeatures || []).map((sf, i) => {
    const bg = i % 2 === 0 ? '#f8fafc' : '#ffffff';
    const impBg = { High: '#ef4444', Medium: '#f59e0b', Low: '#10b981' }[sf.impact] || '#64748b';
    const stBg  = { new: '#3b82f6', ongoing: '#f59e0b', assessment: '#8b5cf6', stable: '#94a3b8' }[sf.status] || '#94a3b8';
    return `<tr>
    <td bgcolor="${bg}" valign="top" style="padding:7px 9px;border:1px solid #cbd5e1;font-size:9.5pt;font-weight:bold;color:#0f172a;">
      ${sf.feature}
      <br/><table cellpadding="1" cellspacing="0" border="0" style="margin-top:3px;"><tr>
        <td bgcolor="${stBg}" style="padding:1px 5px;border-radius:3px;">
          <font color="#ffffff" style="font-size:7.5pt;font-weight:bold;">${sf.status}</font>
        </td>
      </tr></table>
    </td>
    <td bgcolor="${bg}" valign="top" style="padding:7px 9px;border:1px solid #cbd5e1;font-size:9pt;color:#475569;">${sf.tab}</td>
    <td bgcolor="${bg}" valign="top" align="center" style="padding:7px 9px;border:1px solid #cbd5e1;">
      <table cellpadding="2" cellspacing="0" border="0" width="56" align="center"><tr>
        <td bgcolor="${impBg}" align="center" style="border-radius:3px;padding:2px 5px;">
          <font color="#ffffff" style="font-size:8pt;font-weight:bold;">${sf.impact || '—'}</font>
        </td>
      </tr></table>
    </td>
    <td bgcolor="${bg}" valign="top" style="padding:7px 9px;border:1px solid #cbd5e1;font-size:9pt;color:#334155;line-height:1.5;">${sf.explanation || '—'}</td>
  </tr>`;
  }).join('')}
</table>` : ''}

<!-- ── FOOTER ────────────────────────────────────────────────────────────── -->
<p style="margin-top:22pt;border-top:1px solid #e2e8f0;padding-top:7pt;font-size:8pt;color:#94a3b8;">
  Generated by BRD Insight &nbsp;·&nbsp; ${date} &nbsp;·&nbsp; AI Provider: ${provider}
</p>

</body></html>`;

  const blob = new Blob([html], { type: 'application/msword' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href     = url;
  a.download = `affected-modules-${(brd?.title||'analysis').replace(/[^a-z0-9]/gi,'-').toLowerCase().slice(0,40)}.doc`;
  a.click();
  URL.revokeObjectURL(url);
}

// ── Technical Specification export (.doc) ─────────────────────────────────────
function downloadTechSpec(analysis, brd) {
  const title    = brd?.title || 'Untitled BRD';
  const date     = new Date().toLocaleDateString('en-GB', { day:'2-digit', month:'long', year:'numeric' });
  const score    = analysis.impactScore ?? 0;
  const scoreHex = score >= 70 ? '#dc2626' : score >= 40 ? '#d97706' : '#059669';
  const riskLabel = score >= 70 ? 'HIGH' : score >= 40 ? 'MODERATE' : 'LOW';
  const provider  = { gemini:'Gemini AI', anthropic:'Claude AI', openai:'OpenAI' }[analysis.provider] || 'Rule-based';
  const modules   = analysis.affectedModules  || [];
  const concepts  = analysis.affectedConcepts || [];
  const recs      = analysis.recommendations  || [];

  const slug = title.replace(/[^a-z0-9]/gi,'-').toLowerCase().slice(0,40);

  // ── Group modules by domain (first word of path segment after resources/js/) ──
  const domainMap = {};
  modules.forEach(m => {
    const seg = (m.path || '').split('resources/js/')[1] || m.path;
    const domain = seg?.split('/')[0] || 'other';
    if (!domainMap[domain]) domainMap[domain] = [];
    domainMap[domain].push(m);
  });

  const rowBg2 = (i) => i % 2 === 0 ? '#f8fafc' : '#ffffff';

  // ── Module registry rows (HTML attrs for Word alignment) ──────────────────
  const modRows = modules.map((m, i) => `
<tr>
  <td width="160" bgcolor="${rowBg2(i)}" valign="top"
      style="padding:7px 9px;border:1px solid #cbd5e1;font-size:9.5pt;font-weight:bold;color:#0f172a;">
    ${m.name}
  </td>
  <td bgcolor="${rowBg2(i)}" valign="top"
      style="padding:7px 9px;border:1px solid #cbd5e1;font-size:8pt;font-family:Courier New,monospace;color:#475569;">
    ${m.path}
  </td>
  <td width="80" bgcolor="${rowBg2(i)}" valign="top" align="center"
      style="padding:7px 9px;border:1px solid #cbd5e1;">
    <table cellpadding="2" cellspacing="0" border="0" width="64" align="center">
      <tr><td bgcolor="${SEV_HEX[m.severity]||'#64748b'}" align="center"
              style="border-radius:3px;padding:2px 5px;">
        <font color="#ffffff" style="font-size:8pt;font-weight:bold;">${m.severity}</font>
      </td></tr>
    </table>
  </td>
  <td bgcolor="${rowBg2(i)}" valign="top"
      style="padding:7px 9px;border:1px solid #cbd5e1;font-size:9pt;color:#334155;">
    ${m.role || '&mdash;'}
  </td>
</tr>`).join('');

  // ── Change impact blocks — use tables instead of div+float ───────────────
  const changeBlocks = modules.map((m, i) => `
<table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-bottom:10pt;">
  <tr>
    <td width="4" bgcolor="${SEV_HEX[m.severity]||'#64748b'}" style="padding:0;">&nbsp;</td>
    <td bgcolor="#f8fafc" style="padding:9px 12px;border:1px solid #e2e8f0;">
      <table width="100%" cellpadding="0" cellspacing="0" border="0">
        <tr>
          <td valign="middle" style="font-size:10.5pt;font-weight:bold;color:#0f172a;">
            ${i+1}. ${m.name}
          </td>
          <td align="right" valign="middle" width="80">
            <table cellpadding="2" cellspacing="0" border="0"><tr>
              <td bgcolor="${SEV_HEX[m.severity]||'#64748b'}" align="center"
                  style="border-radius:3px;padding:2px 7px;">
                <font color="#ffffff" style="font-size:8pt;font-weight:bold;">${m.severity}</font>
              </td>
            </tr></table>
          </td>
        </tr>
      </table>
      <p style="margin:4pt 0 3pt;font-size:8pt;font-family:Courier New,monospace;color:#64748b;">${m.path}</p>
      ${m.role ? `<p style="margin:0 0 4pt;font-size:9pt;color:#475569;"><strong>Role:</strong> ${m.role}</p>` : ''}
      <p style="margin:0;font-size:9.5pt;color:#334155;line-height:1.5;"><strong>Required change:</strong> ${m.explanation || '&mdash;'}</p>
    </td>
  </tr>
</table>`).join('');

  // ── Formal requirements ───────────────────────────────────────────────────
  const reqRows = recs.map((r, i) => `
<tr>
  <td width="72" bgcolor="#eff6ff" valign="top"
      style="padding:7px 10px;border:1px solid #bfdbfe;font-family:Courier New,monospace;font-size:9pt;font-weight:bold;color:#1d4ed8;">
    REQ-${String(i+1).padStart(3,'0')}
  </td>
  <td valign="top"
      style="padding:7px 10px;border:1px solid #bfdbfe;font-size:9.5pt;color:#1e293b;">
    ${r}
  </td>
  <td width="60" align="center" valign="top"
      style="padding:7px 10px;border:1px solid #bfdbfe;font-size:9pt;color:#64748b;">
    Open
  </td>
</tr>`).join('');

  // ── Domain distribution ───────────────────────────────────────────────────
  const domainRows = Object.entries(domainMap).map(([d, mods]) => {
    const maxSev = mods.some(m=>m.severity==='High') ? 'High' : mods.some(m=>m.severity==='Medium') ? 'Medium' : 'Low';
    return `
<tr>
  <td width="130" valign="top" style="padding:6px 10px;border:1px solid #cbd5e1;font-size:9.5pt;font-weight:bold;color:#1e293b;">
    ${d}
  </td>
  <td valign="top" style="padding:6px 10px;border:1px solid #cbd5e1;font-size:9pt;color:#475569;">
    ${mods.map(m=>m.name).join(', ')}
  </td>
  <td width="80" align="center" valign="top" style="padding:6px 10px;border:1px solid #cbd5e1;">
    <table cellpadding="2" cellspacing="0" border="0" width="60" align="center"><tr>
      <td bgcolor="${SEV_HEX[maxSev]||'#64748b'}" align="center"
          style="border-radius:3px;padding:2px 5px;">
        <font color="#ffffff" style="font-size:8pt;font-weight:bold;">${maxSev.toUpperCase()}</font>
      </td>
    </tr></table>
  </td>
</tr>`; }).join('');

  const html = `
<html xmlns:o='urn:schemas-microsoft-com:office:office'
      xmlns:w='urn:schemas-microsoft-com:office:word'
      xmlns='http://www.w3.org/TR/REC-html40'>
<head><meta charset='utf-8'>
<style>
  body { font-family:Calibri,sans-serif; font-size:11pt; margin:1.8cm 2cm; color:#1e293b; }
  h1   { font-size:16pt; font-weight:bold; color:#ffffff; margin:0; }
  h2   { font-size:11.5pt; color:#1d4ed8; border-bottom:2pt solid #bfdbfe;
         padding-bottom:4pt; margin:18pt 0 8pt; }
  p    { line-height:1.5; margin:0 0 7pt; }
</style>
</head>
<body>

<!-- COVER HEADER ──────────────────────────────────────────────────────── -->
<table width="100%" cellpadding="0" cellspacing="0" border="0">
  <tr>
    <td bgcolor="#1e3a8a" width="75%" valign="middle" style="padding:16px 18px;">
      <p style="color:#bfdbfe;font-size:7.5pt;margin:0 0 5pt;letter-spacing:1px;">
        TECHNICAL SPECIFICATION &nbsp;·&nbsp; AFFECTED MODULE ANALYSIS &nbsp;·&nbsp; ${date}
      </p>
      <h1>${title}</h1>
      <p style="color:#93c5fd;font-size:8.5pt;margin:5pt 0 0;">
        ${provider} &nbsp;·&nbsp; ${modules.length} modules identified
      </p>
    </td>
    <td bgcolor="#1e3a8a" width="25%" valign="middle" align="right" style="padding:16px 18px;">
      <p style="color:#bfdbfe;font-size:8.5pt;margin:0 0 3pt;">Impact Score</p>
      <p style="font-size:30pt;font-weight:900;color:${scoreHex};margin:0;line-height:1;">${score}</p>
      <p style="font-size:8pt;font-weight:bold;color:#93c5fd;margin:3pt 0 0;">${riskLabel} RISK</p>
    </td>
  </tr>
</table>
<table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-bottom:16pt;">
  <tr>
    <td bgcolor="#f1f5f9" style="padding:6px 18px;font-size:8.5pt;color:#475569;border-bottom:1px solid #e2e8f0;">
      <strong>Type:</strong> Technical Architecture Impact Specification &nbsp;|&nbsp;
      <strong>Status:</strong> Draft &nbsp;|&nbsp;
      <strong>Version:</strong> 1.0 &nbsp;|&nbsp;
      <strong>Date:</strong> ${date}
    </td>
  </tr>
</table>

<!-- 1. EXECUTIVE SUMMARY ──────────────────────────────────────────────── -->
<h2>1. Executive Summary</h2>
<p>${analysis.verdict || ''}</p>
<table cellpadding="0" cellspacing="0" border="0" style="margin-bottom:14pt;">
  <tr>
    <td width="200" bgcolor="#f8fafc" valign="middle"
        style="padding:5px 12px;border:1px solid #e2e8f0;font-size:9pt;font-weight:bold;color:#475569;">
      Total modules affected
    </td>
    <td valign="middle" style="padding:5px 12px;border:1px solid #e2e8f0;font-size:9.5pt;">${modules.length}</td>
  </tr>
  <tr>
    <td bgcolor="#f8fafc" valign="middle"
        style="padding:5px 12px;border:1px solid #e2e8f0;font-size:9pt;font-weight:bold;color:#475569;">
      High severity modules
    </td>
    <td valign="middle" style="padding:5px 12px;border:1px solid #e2e8f0;font-size:9.5pt;font-weight:bold;color:#dc2626;">
      ${modules.filter(m=>m.severity==='High').length}
    </td>
  </tr>
  <tr>
    <td bgcolor="#f8fafc" valign="middle"
        style="padding:5px 12px;border:1px solid #e2e8f0;font-size:9pt;font-weight:bold;color:#475569;">
      Medium severity modules
    </td>
    <td valign="middle" style="padding:5px 12px;border:1px solid #e2e8f0;font-size:9.5pt;font-weight:bold;color:#d97706;">
      ${modules.filter(m=>m.severity==='Medium').length}
    </td>
  </tr>
  <tr>
    <td bgcolor="#f8fafc" valign="middle"
        style="padding:5px 12px;border:1px solid #e2e8f0;font-size:9pt;font-weight:bold;color:#475569;">
      Architectural domains
    </td>
    <td valign="middle" style="padding:5px 12px;border:1px solid #e2e8f0;font-size:9.5pt;">
      ${Object.keys(domainMap).join(', ')}
    </td>
  </tr>
  <tr>
    <td bgcolor="#f8fafc" valign="middle"
        style="padding:5px 12px;border:1px solid #e2e8f0;font-size:9pt;font-weight:bold;color:#475569;">
      AI Analysis provider
    </td>
    <td valign="middle" style="padding:5px 12px;border:1px solid #e2e8f0;font-size:9.5pt;">
      ${provider}${analysis.docFetched ? ' &nbsp;·&nbsp; Specification document included' : ''}
    </td>
  </tr>
</table>

<!-- 2. AFFECTED MODULES REGISTRY ──────────────────────────────────────── -->
<h2>2. Affected Modules Registry</h2>
<table width="100%" cellpadding="0" cellspacing="0" border="0">
  <tr>
    <td width="160" bgcolor="#1e3a8a" style="padding:7px 9px;border:1px solid #1e3a8a;">
      <font color="#ffffff" style="font-size:9pt;font-weight:bold;">Module</font>
    </td>
    <td bgcolor="#1e3a8a" style="padding:7px 9px;border:1px solid #1e3a8a;">
      <font color="#ffffff" style="font-size:9pt;font-weight:bold;">File Path</font>
    </td>
    <td width="80" align="center" bgcolor="#1e3a8a" style="padding:7px 9px;border:1px solid #1e3a8a;">
      <font color="#ffffff" style="font-size:9pt;font-weight:bold;">Severity</font>
    </td>
    <td bgcolor="#1e3a8a" style="padding:7px 9px;border:1px solid #1e3a8a;">
      <font color="#ffffff" style="font-size:9pt;font-weight:bold;">Role</font>
    </td>
  </tr>
  ${modRows}
</table>

<!-- 3. DOMAIN IMPACT DISTRIBUTION ────────────────────────────────────── -->
<h2>3. Domain Impact Distribution</h2>
<table width="100%" cellpadding="0" cellspacing="0" border="0">
  <tr>
    <td width="130" bgcolor="#1e3a8a" style="padding:7px 9px;border:1px solid #1e3a8a;">
      <font color="#ffffff" style="font-size:9pt;font-weight:bold;">Domain Layer</font>
    </td>
    <td bgcolor="#1e3a8a" style="padding:7px 9px;border:1px solid #1e3a8a;">
      <font color="#ffffff" style="font-size:9pt;font-weight:bold;">Affected Files</font>
    </td>
    <td width="90" align="center" bgcolor="#1e3a8a" style="padding:7px 9px;border:1px solid #1e3a8a;">
      <font color="#ffffff" style="font-size:9pt;font-weight:bold;">Max Severity</font>
    </td>
  </tr>
  ${domainRows}
</table>

<!-- 4. CHANGE IMPACT ANALYSIS ─────────────────────────────────────────── -->
<h2>4. Change Impact Analysis</h2>
<p style="font-size:8.5pt;color:#64748b;">Detailed breakdown of required changes per module.</p>
${changeBlocks}

<!-- 5. TECHNICAL REQUIREMENTS ─────────────────────────────────────────── -->
${reqRows.length ? `
<h2>5. Technical Requirements</h2>
<table width="100%" cellpadding="0" cellspacing="0" border="0">
  <tr>
    <td width="72" bgcolor="#1e3a8a" style="padding:7px 10px;border:1px solid #1e3a8a;">
      <font color="#ffffff" style="font-size:9pt;font-weight:bold;">Req. ID</font>
    </td>
    <td bgcolor="#1e3a8a" style="padding:7px 10px;border:1px solid #1e3a8a;">
      <font color="#ffffff" style="font-size:9pt;font-weight:bold;">Requirement Description</font>
    </td>
    <td width="60" align="center" bgcolor="#1e3a8a" style="padding:7px 10px;border:1px solid #1e3a8a;">
      <font color="#ffffff" style="font-size:9pt;font-weight:bold;">Status</font>
    </td>
  </tr>
  ${reqRows}
</table>` : ''}

<!-- 6. FUNCTIONS AFFECTED ─────────────────────────────────────────────── -->
${(analysis.affectedStyleFeatures || []).length ? `
<h2>6. Functions Affected</h2>
<table width="100%" cellpadding="0" cellspacing="0" border="0">
  <tr>
    <td width="160" bgcolor="#1e3a8a" style="padding:7px 9px;border:1px solid #1e3a8a;">
      <font color="#ffffff" style="font-size:9pt;font-weight:bold;">Function</font>
    </td>
    <td width="110" bgcolor="#1e3a8a" style="padding:7px 9px;border:1px solid #1e3a8a;">
      <font color="#ffffff" style="font-size:9pt;font-weight:bold;">Tab / Section</font>
    </td>
    <td width="65" align="center" bgcolor="#1e3a8a" style="padding:7px 9px;border:1px solid #1e3a8a;">
      <font color="#ffffff" style="font-size:9pt;font-weight:bold;">Impact</font>
    </td>
    <td bgcolor="#1e3a8a" style="padding:7px 9px;border:1px solid #1e3a8a;">
      <font color="#ffffff" style="font-size:9pt;font-weight:bold;">How It Is Affected</font>
    </td>
  </tr>
  ${(analysis.affectedStyleFeatures || []).map((sf, i) => {
    const bg = i % 2 === 0 ? '#f8fafc' : '#ffffff';
    const impBg = { High: '#ef4444', Medium: '#f59e0b', Low: '#10b981' }[sf.impact] || '#64748b';
    const stBg  = { new: '#3b82f6', ongoing: '#f59e0b', assessment: '#8b5cf6', stable: '#94a3b8' }[sf.status] || '#94a3b8';
    return `<tr>
  <td bgcolor="${bg}" valign="top" style="padding:7px 9px;border:1px solid #cbd5e1;font-size:9.5pt;font-weight:bold;color:#0f172a;">
    ${sf.feature}
    <br/><table cellpadding="1" cellspacing="0" border="0" style="margin-top:3px;"><tr>
      <td bgcolor="${stBg}" style="padding:1px 5px;border-radius:3px;">
        <font color="#ffffff" style="font-size:7.5pt;font-weight:bold;">${sf.status}</font>
      </td>
    </tr></table>
  </td>
  <td bgcolor="${bg}" valign="top" style="padding:7px 9px;border:1px solid #cbd5e1;font-size:9pt;color:#475569;">${sf.tab}</td>
  <td bgcolor="${bg}" valign="top" align="center" style="padding:7px 9px;border:1px solid #cbd5e1;">
    <table cellpadding="2" cellspacing="0" border="0" width="54" align="center"><tr>
      <td bgcolor="${impBg}" align="center" style="border-radius:3px;padding:2px 5px;">
        <font color="#ffffff" style="font-size:8pt;font-weight:bold;">${sf.impact || '—'}</font>
      </td>
    </tr></table>
  </td>
  <td bgcolor="${bg}" valign="top" style="padding:7px 9px;border:1px solid #cbd5e1;font-size:9pt;color:#334155;line-height:1.5;">${sf.explanation || '—'}</td>
</tr>`; }).join('')}
</table>` : ''}

<!-- 7. ARCHITECTURAL CONCEPTS ─────────────────────────────────────────── -->
${concepts.length ? `
<h2>7. Architectural Concepts Impacted</h2>
<table cellpadding="0" cellspacing="0" border="0">
  <tr>
    ${concepts.map(c => `
    <td style="padding:3px 10px;border:1px solid #93c5fd;background:#eff6ff;border-radius:8px;" nowrap>
      <font color="#1d4ed8" style="font-size:9.5pt;">${c}</font>
    </td>
    <td width="6"></td>`).join('')}
  </tr>
</table>
<p style="margin-top:8pt;font-size:8.5pt;color:#64748b;">The concepts above are the primary architectural domains requiring review for this BRD implementation.</p>` : ''}

<!-- 8. IMPLEMENTATION CHECKLIST ───────────────────────────────────────── -->
<h2>8. Implementation Checklist</h2>
<table width="100%" cellpadding="0" cellspacing="0" border="0">
  ${modules.map(m => `
  <tr>
    <td width="26" valign="top" align="center"
        style="padding:6px 8px;border:1px solid #e2e8f0;font-size:12pt;color:#94a3b8;">
      &#9744;
    </td>
    <td width="160" valign="top"
        style="padding:6px 9px;border:1px solid #e2e8f0;font-size:9.5pt;font-weight:bold;color:#0f172a;">
      ${m.name}
    </td>
    <td valign="top"
        style="padding:6px 9px;border:1px solid #e2e8f0;font-size:9pt;color:#475569;">
      ${(m.explanation||'').slice(0,120)}${(m.explanation||'').length>120?'&hellip;':''}
    </td>
    <td width="70" align="center" valign="top"
        style="padding:6px 9px;border:1px solid #e2e8f0;">
      <table cellpadding="2" cellspacing="0" border="0" width="60" align="center"><tr>
        <td bgcolor="${SEV_HEX[m.severity]||'#64748b'}" align="center"
            style="border-radius:3px;padding:2px 5px;">
          <font color="#ffffff" style="font-size:8pt;font-weight:bold;">${m.severity}</font>
        </td>
      </tr></table>
    </td>
  </tr>`).join('')}
</table>

<!-- FOOTER ────────────────────────────────────────────────────────────── -->
<table width="100%" cellpadding="0" cellspacing="0" border="0"
       style="margin-top:24pt;border-top:1px solid #e2e8f0;padding-top:8pt;">
  <tr>
    <td style="font-size:8pt;color:#94a3b8;">
      <strong>BRD Insight</strong> &nbsp;·&nbsp; Technical Architecture Specification &nbsp;·&nbsp; ${date}
    </td>
    <td align="right" style="font-size:8pt;color:#94a3b8;">
      AI Provider: ${provider} &nbsp;·&nbsp; Modules: ${modules.length} &nbsp;·&nbsp; Impact: ${score}/100
    </td>
  </tr>
</table>

</body></html>`;

  const blob = new Blob([html], { type: 'application/msword' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href     = url;
  a.download = `tech-spec-${slug}.doc`;
  a.click();
  URL.revokeObjectURL(url);
}

const ZONE_DETAILS = {
  body: {
    title: 'Garment Body Zone',
    files: [
      'stores/customizer.js',
      'core/customizer/color.ts',
      'core/customizer/fabric.ts',
      'Components/Builder/Fabric/FabricPanel.vue',
    ],
    desc: 'Primary body color, fabric material selection, and upgrade fee pricing. Touches useCustomizerStore, remixColors(), and changeFabric().'
  },
  sleeves: {
    title: 'Sleeves & Color-Group Zone',
    files: [
      'Components/Builder/Colors/ColorGroupPanel.vue',
      'composables/color-selection.ts',
      'stores/customizer.js',
      'core/customizer/color.ts',
    ],
    desc: 'Zone-by-zone sleeve color mappings, piping accordion, and per-part color group logic via changeColorGroup() and ColorGroupPanel.'
  },
  piping: {
    title: 'Piping & Accent Zone',
    files: [
      'core/customizer/piping.ts',
      'Components/Builder/Piping/PipingPanel.vue',
      'Components/Builder/Colors/ColorGroupPanel.vue',
      'stores/customizer.js',
    ],
    desc: 'Accent seams and collar/cuff borders. Uses createPiping(), changePipingColor(), and the PipingPanel accordion.'
  },
  logo: {
    title: 'Logo & Application Layer',
    files: [
      'core/customizer/application.ts',
      'Components/Builder/Logo/LogoPanel.vue',
      'core/customizer/brand-logo.ts',
      'Components/Builder/Modals/ColorConflictAlertModal.vue',
      'core/stage/stageEvents.js',
    ],
    desc: 'Brand logo placement, visibility contrast checks, and hit-zone detection. Uses renderApplication(), findLogoApplicationByLocation(), and ColorConflictAlertModal.'
  },
  trim: {
    title: 'Trim, Twill & Embellishment Zone',
    files: [
      'core/customizer/add-ons.ts',
      'core/customizer/tailsweep.ts',
      'Components/Builder/Modals/TwillSelectionColor.vue',
      'Components/Builder/AddOns/AddOnsPanel.vue',
      'core/customizer/brand-trims.ts',
    ],
    desc: '3D embroidered trims, tackle twill (up to 15 colors), tailsweep, and add-on embellishments via TwillSelectionColor, createTailsweep(), and AddOnsPanel.'
  }
};

export default function AnalyseAffectedModule({ brds, bugs, brdTechLeads, kbEntries, notify }) {
  const [selectedBRDId, setSelectedBRDId] = useState('');
  const [localDocText, setLocalDocText]   = useState(null);
  const [localDocName, setLocalDocName]   = useState('');
  const [analyzing, setAnalyzing]         = useState(false);
  const [analysis, setAnalysis]           = useState(null);
  const [error, setError]                 = useState('');
  const [progress, setProgress]           = useState(0);

  // Simulated 1→100% progress bar while a scan is running. Real analysis is a
  // single async request with no progress events, so we ease toward 95% and
  // snap to 100% the moment the result arrives.
  useEffect(() => {
    if (!analyzing) return;
    setProgress(1);
    const id = setInterval(() => {
      setProgress((p) => {
        if (p >= 95) return p;            // hold near the top until done
        const step = p < 60 ? 4 : p < 85 ? 2 : 1; // slow down as it climbs
        return Math.min(95, p + step);
      });
    }, 180);
    return () => clearInterval(id);
  }, [analyzing]);
  
  // Interactive UI States
  const [hoveredZone, setHoveredZone]     = useState(null);
  const [activeTab, setActiveTab]         = useState('modules');
  const [checkedRecs, setCheckedRecs]     = useState({});

  // Garment Zone Simulator — brand style ID control
  const [brandStyleId, setBrandStyleId]     = useState(123);
  const [styleInput, setStyleInput]         = useState('123');
  const [styleInputError, setStyleInputError] = useState('');
  const [autoDetectedLabel, setAutoDetectedLabel] = useState('');
  const [show3D, setShow3D]       = useState(null); // base64 dataUrl when 3D modal is open
  const simulatorRefA = useRef(null);               // ref for single / Side-A simulator
  const simulatorRefB = useRef(null);               // ref for reversible Side-B simulator

  // Auto-detect style based on BRD keywords (uses selectedBRDId + brds to avoid
  // referencing selectedBRD before it is derived further down in the component)
  useEffect(() => {
    const brd = brds.find(b => b.id === selectedBRDId);
    const text = [
      brd?.title,
      brd?.description,
      localDocText,
    ].filter(Boolean).join(' ').toLowerCase();

    let id = 123;
    let label = '';
    if (text.includes('reversible')) { id = 17427; label = 'Reversible'; }
    else if (text.includes('twill') || text.includes('tackle twill')) { id = 13082; label = 'Twill'; }
    else if (text.includes('stock')) { id = 5604;  label = 'Stock';    }

    setBrandStyleId(id);
    setStyleInput(String(id));
    setAutoDetectedLabel(label);
  }, [selectedBRDId, brds, localDocText]);

  const applyStyleId = () => {
    const parsed = parseInt(styleInput, 10);
    if (isNaN(parsed) || parsed < 1) { setStyleInputError('Enter a valid positive ID'); return; }
    setStyleInputError('');
    if (parsed !== brandStyleId) {
      setBrandStyleId(parsed);
      setAutoDetectedLabel(''); // clear auto-detect badge on manual override
    }
  };

  const docFileRef = useRef(null);
  const resultsRef = useRef(null);

  const selectedBRD = brds.find((b) => b.id === selectedBRDId);
  const brdBugs     = bugs.filter((b) => b.brdId === selectedBRDId);
  const techLeads   = brdTechLeads.filter((tl) => tl.brdId === selectedBRDId);

  const devAssignees = (() => {
    if (!selectedBRD?.devAssignee) return [];
    try {
      const p = JSON.parse(selectedBRD.devAssignee);
      return Array.isArray(p) ? p : [selectedBRD.devAssignee];
    } catch {
      return selectedBRD.devAssignee ? [selectedBRD.devAssignee] : [];
    }
  })();

  const handleDocFileUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setLocalDocName(file.name);
    setError('');
    try {
      if (file.name.endsWith('.docx')) {
        const arrayBuffer = await file.arrayBuffer();
        const { value } = await mammoth.extractRawText({ arrayBuffer });
        setLocalDocText(value || '');
      } else {
        const reader = new FileReader();
        reader.onload = (ev) => setLocalDocText(ev.target.result || '');
        reader.readAsText(file);
      }
    } catch (err) {
      setError('Failed to parse uploaded document: ' + err.message);
    }
    e.target.value = '';
  };

  const handleAnalyze = async () => {
    if (!selectedBRD && !localDocText) {
      setError('Please select a BRD or upload a document to scan.');
      return;
    }
    setAnalyzing(true);
    setError('');
    setAnalysis(null);
    setCheckedRecs({});

    // When using a selected BRD, pass the full record (including googleDocsLink so
    // the server can fetch the Google Doc spec).  When using an uploaded doc, send
    // the full text as docContent — never truncate the specification.
    const brdPayload = selectedBRD || {
      title: localDocName || 'Uploaded Document',
      status: 'unknown',
      description: '',
    };

    try {
      const result = await analyzeAffectedModules({
        brd: brdPayload,
        bugs: brdBugs,
        techLeads,
        devAssignees,
        knowledgeBase: kbEntries,
        // Always send uploaded doc as docContent (not crammed into description)
        ...(localDocText ? { docContent: localDocText } : {}),
      });

      if (result.error) {
        setError(result.error);
        setAnalyzing(false);
      } else {
        // Snap the bar to 100%, let it show briefly, then reveal the results
        setProgress(100);
        notify('Architectural scan completed');
        setTimeout(() => {
          setAnalysis(result);
          setAnalyzing(false);
        }, 450);
      }
    } catch (err) {
      setError(err.message || 'Affected module analysis failed.');
      setAnalyzing(false);
    }
  };

  useEffect(() => {
    if (analysis && resultsRef.current) {
      resultsRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }, [analysis]);

  // Determine if a zone is affected based on the analysis output
  const isZoneAffected = (zoneKey) => {
    if (!analysis?.affectedModules) return false;
    const affectedFileNames = analysis.affectedModules.map((m) => m.name.toLowerCase());
    const zoneFiles = ZONE_DETAILS[zoneKey].files.map((f) => f.split(' ')[0].toLowerCase());
    return zoneFiles.some((zf) => affectedFileNames.some((af) => af.includes(zf)));
  };

  // Determine severity style
  const getSeverityStyle = (severity) => {
    switch (severity?.toLowerCase()) {
      case 'high':
        return 'bg-red-500/10 border-red-500/20 text-red-500';
      case 'medium':
        return 'bg-amber-500/10 border-amber-500/20 text-amber-500';
      default:
        return 'bg-emerald-500/10 border-emerald-500/20 text-emerald-500';
    }
  };

  const getImpactColor = (score) => {
    if (score >= 70) return 'text-red-500 stroke-red-500';
    if (score >= 40) return 'text-amber-500 stroke-amber-500';
    return 'text-emerald-500 stroke-emerald-500';
  };

  return (
    <>
    <div className="space-y-6">
      
      {/* ── STUNNING GLASSMORPHIC INTRO CARD ── */}
      <div className="relative overflow-hidden bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-6 shadow-sm">
        <div className="absolute top-0 right-0 -mt-12 -mr-12 w-64 h-64 bg-gradient-to-br from-blue-500/10 to-violet-500/10 rounded-full blur-3xl" />
        <div className="relative flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="space-y-1">
            <h2 className="text-xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <span className="p-2 rounded-xl bg-blue-500/10 text-blue-500">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 3v2m6-2v2M9 19v2m6-2v2M5 9H3m2 6H3m18-6h-2m2 6h-2M7 19h10a2 2 0 002-2V7a2 2 0 00-2-2H7a2 2 0 00-2 2v10a2 2 0 002 2zM9 9h6v6H9V9z" />
                </svg>
              </span>
              Analyse Affected Module
            </h2>
            <p className="text-sm text-slate-500 dark:text-slate-400 max-w-2xl">
              Architectural Scanner that correlates BRD specifications against builder knowledge bases (color stores, fabric groups, canvas rules) to outline affected modules and code blocks.
            </p>
          </div>
        </div>
      </div>

      {/* ── GRID INPUT LAYOUT ── */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        
        {/* LEFT COLUMN: Input Selector & Uniform Simulator (Lg: 5/12) */}
        <div className="lg:col-span-5 flex flex-col gap-6">
          
          {/* INPUT PANEL CARD */}
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-6 shadow-sm space-y-4">
            <h3 className="text-sm font-bold text-slate-800 dark:text-slate-200 uppercase tracking-wider">Configure Scanning Scope</h3>
            
            {/* BRD Selection */}
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-slate-500 dark:text-slate-400 block">Select Target BRD</label>
              <select 
                value={selectedBRDId} 
                onChange={(e) => { setSelectedBRDId(e.target.value); setError(''); }}
                className="w-full px-3 py-2 text-sm rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-800 dark:text-slate-100 focus:ring-2 focus:ring-blue-500 focus:outline-none transition-all"
              >
                <option value="">{localDocText ? 'Optional - Linked to Doc' : 'Select a BRD...'}</option>
                {brds.map((b) => (
                  <option key={b.id} value={b.id}>{fmtTitle(b.title)} · {b.quarter} {b.year}</option>
                ))}
              </select>
            </div>

            <div className="flex items-center gap-2">
              <div className="flex-1 h-px bg-slate-100 dark:bg-slate-800" />
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">or Upload Specification Document</span>
              <div className="flex-1 h-px bg-slate-100 dark:bg-slate-800" />
            </div>

            {/* Document Upload */}
            <input 
              ref={docFileRef} 
              type="file" 
              accept=".txt,.md,.docx" 
              className="hidden" 
              onChange={handleDocFileUpload} 
            />
            {localDocName ? (
              <div className="flex items-center gap-2.5 p-3 bg-emerald-50 dark:bg-emerald-950/20 border border-emerald-200 dark:border-emerald-800/50 rounded-2xl">
                <svg className="w-4 h-4 text-emerald-500 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
                <span className="text-xs text-emerald-700 dark:text-emerald-400 font-semibold truncate flex-1">{localDocName}</span>
                <button 
                  onClick={() => { setLocalDocText(null); setLocalDocName(''); }} 
                  className="p-1 rounded text-slate-400 hover:text-red-500 transition-colors"
                >
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            ) : (
              <button 
                onClick={() => docFileRef.current?.click()}
                className="flex items-center justify-center gap-2 w-full px-4 py-3 rounded-2xl border border-dashed border-slate-300 dark:border-slate-700 text-slate-500 hover:text-blue-500 hover:border-blue-500 text-xs font-semibold bg-slate-50/50 dark:bg-slate-900/50 transition-all cursor-pointer"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
                </svg>
                Upload Word (.docx), .txt or .md
              </button>
            )}

            {/* Error Message */}
            {error && (
              <div className="p-3 rounded-2xl bg-red-500/10 border border-red-500/20 text-red-500 text-xs font-medium">
                {error}
              </div>
            )}

            {/* Scan Trigger */}
            <button
              onClick={handleAnalyze}
              disabled={analyzing}
              className="w-full flex items-center justify-center gap-2 px-5 py-3.5 rounded-2xl bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white font-bold text-sm shadow-md hover:shadow-lg active:scale-[0.98] transition-all disabled:opacity-50 cursor-pointer"
            >
              {analyzing ? (
                <>
                  <svg className="animate-spin w-4 h-4 text-white" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                  Scanning Builder Codebase...
                </>
              ) : (
                <>
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                  </svg>
                  Analyse Affected Modules
                </>
              )}
            </button>

          </div>

          {/* INTERACTIVE UNIFORM SIMULATOR */}
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-6 shadow-sm flex flex-col items-center relative overflow-hidden">
            <div className="w-full flex items-center justify-between self-start mb-1">
              <h3 className="text-sm font-bold text-slate-800 dark:text-slate-200 uppercase tracking-wider">Garment Zone Simulator</h3>
              {/* 3D button */}
              <button
                onClick={() => {
                  const sim = simulatorRefA.current || simulatorRefB.current;
                  // Prefer all 4 perspectives for an accurate 3D form; fall back to single frame
                  const views = sim?.captureAllViews?.();
                  if (views && Object.keys(views).length) { setShow3D(views); return; }
                  const single = sim?.captureImage?.();
                  if (single) setShow3D({ front: single });
                }}
                title="View in 3D"
                className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl bg-gradient-to-r from-blue-600 to-violet-600 hover:from-blue-700 hover:to-violet-700 text-white text-xs font-bold shadow-sm hover:shadow-md active:scale-95 transition-all cursor-pointer"
              >
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 10l-2 1m0 0l-2-1m2 1v2.5M20 7l-2 1m2-1l-2-1m2 1v2.5M14 4l-2-1-2 1M4 7l2-1M4 7l2 1M4 7v2.5M12 21l-2-1m2 1l2-1m-2 1v-2.5M6 18l-2-1v-2.5M18 18l2-1v-2.5"/>
                </svg>
                3D
              </button>
            </div>
            <p className="text-xs text-slate-400 self-start mb-3">Hover over elements to see underlying modules; affected areas glow after analysis.</p>

            {/* ── Brand Style ID input ── */}
            <div className="w-full self-start mb-4">
              <div className="flex items-center gap-2">
                <label className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 whitespace-nowrap">Style #</label>
                <input
                  type="number"
                  min="1"
                  value={styleInput}
                  onChange={e => { setStyleInput(e.target.value); setStyleInputError(''); }}
                  onKeyDown={e => e.key === 'Enter' && applyStyleId()}
                  onBlur={applyStyleId}
                  className={`w-20 px-2 py-1.5 text-sm rounded-xl border ${styleInputError ? 'border-red-400 dark:border-red-600' : 'border-slate-200 dark:border-slate-700'} bg-slate-50 dark:bg-slate-800 text-slate-800 dark:text-slate-100 focus:ring-2 focus:ring-blue-500 focus:outline-none transition-colors [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none`}
                  placeholder="123"
                />
                <button
                  onClick={applyStyleId}
                  title="Load style"
                  className="flex items-center gap-1 px-2.5 py-1.5 rounded-xl bg-blue-600 hover:bg-blue-700 active:scale-95 text-white text-xs font-semibold transition-all cursor-pointer"
                >
                  <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                  </svg>
                  Load
                </button>
                {styleInputError && (
                  <span className="text-[10px] text-red-500 font-medium">{styleInputError}</span>
                )}
                {autoDetectedLabel && !styleInputError && (
                  <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-violet-100 dark:bg-violet-950/40 text-violet-600 dark:text-violet-400 flex items-center gap-1">
                    <svg className="w-2.5 h-2.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M13 10V3L4 14h7v7l9-11h-7z"/>
                    </svg>
                    {autoDetectedLabel}
                  </span>
                )}
              </div>
            </div>

            {autoDetectedLabel === 'Reversible' ? (
              /* ── Dual simulator: Reversible Side A + Side B ─────────────── */
              <div className="w-full flex gap-3 justify-center">
                {[{ id: 17427, side: 'Side A', simRef: simulatorRefA }, { id: 17424, side: 'Side B', simRef: simulatorRefB }].map(({ id, side, simRef }) => (
                  <div key={id} className="flex flex-col items-center gap-1.5">
                    <span className="text-[10px] font-bold text-slate-500 dark:text-slate-400 tracking-wide">
                      {side} · <span className="text-violet-500 font-mono">#{id}</span>
                    </span>
                    <GarmentZoneSimulator
                      ref={simRef}
                      brandStyleId={id}
                      width={130}
                      height={156}
                      hoveredZone={hoveredZone}
                      setHoveredZone={setHoveredZone}
                      isZoneAffected={isZoneAffected}
                    />
                  </div>
                ))}
              </div>
            ) : (
              /* ── Single simulator ───────────────────────────────────────── */
              <div className="w-full max-w-[280px] h-[320px] relative flex items-center justify-center">
                <GarmentZoneSimulator
                  ref={simulatorRefA}
                  brandStyleId={brandStyleId}
                  hoveredZone={hoveredZone}
                  setHoveredZone={setHoveredZone}
                  isZoneAffected={isZoneAffected}
                />

                {/* OVERLAY FLOATING DIALOG */}
                {hoveredZone && (
                  <div className="absolute bottom-2 left-2 right-2 bg-slate-900/95 dark:bg-slate-950/95 text-white p-3 rounded-2xl shadow-xl text-xs space-y-1 z-20 border border-slate-700 animate-in fade-in duration-200">
                    <p className="font-bold flex items-center gap-1.5">
                      <span className={`w-2 h-2 rounded-full ${isZoneAffected(hoveredZone) ? 'bg-amber-500 animate-ping' : 'bg-blue-500'}`} />
                      {ZONE_DETAILS[hoveredZone].title}
                    </p>
                    <p className="text-slate-300 text-[10px] leading-relaxed">{ZONE_DETAILS[hoveredZone].desc}</p>
                    <div className="pt-1.5 border-t border-slate-800 flex flex-wrap gap-1">
                      {ZONE_DETAILS[hoveredZone].files.map((file) => (
                        <span key={file} className="bg-slate-800 px-1.5 py-0.5 rounded font-mono text-[9px] text-blue-300">{file.split(' ')[0]}</span>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {analysis && (
              <div className="w-full text-center mt-3 pt-3 border-t border-slate-100 dark:border-slate-800">
                <p className="text-xs font-semibold text-slate-600 dark:text-slate-400">
                  Zones Gowing <span className="text-amber-500 font-bold uppercase animate-pulse">Amber</span> indicate detected changes.
                </p>
              </div>
            )}

          </div>

        </div>

        {/* RIGHT COLUMN: Results Dashboard (Lg: 7/12) */}
        <div className="lg:col-span-7 flex flex-col gap-6" ref={resultsRef}>
          
          {/* PLACEHOLDER WHEN NO SCAN */}
          {!analysis && !analyzing && (
            <div className="flex flex-col items-center justify-center text-center p-16 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl h-full shadow-sm">
              <div className="w-16 h-16 bg-blue-500/10 rounded-2xl flex items-center justify-center text-blue-500 mb-4 animate-bounce">
                <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <h3 className="font-bold text-slate-800 dark:text-slate-200 text-lg">Architectural Scan Awaiting Trigger</h3>
              <p className="text-sm text-slate-400 dark:text-slate-500 mt-2 max-w-sm">
                Select a Business Requirements Document or upload a specification document on the left and trigger the scan to fetch system implications.
              </p>
            </div>
          )}

          {/* LOADING STATE */}
          {analyzing && (
            <div className="flex flex-col items-center justify-center p-20 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl h-full shadow-sm space-y-6">
              <div className="w-20 h-20 relative flex items-center justify-center">
                <div className="absolute inset-0 rounded-full border-4 border-blue-500/20 border-t-blue-500 animate-spin" />
                <span className="text-base font-extrabold text-blue-600 dark:text-blue-400 tabular-nums">{progress}%</span>
              </div>
              <div className="text-center space-y-2">
                <h4 className="font-bold text-slate-800 dark:text-slate-200">Reading BRD &amp; Scanning Codebase...</h4>
                <p className="text-xs text-slate-400 max-w-xs leading-relaxed">
                  {selectedBRD?.googleDocsLink
                    ? 'Fetching Google Doc spec, then mapping requirements to builder modules.'
                    : 'Correlating BRD requirements with Pinia stores, canvas handlers, and components.'}
                </p>
              </div>

              {/* Progress bar 1 → 100% */}
              <div className="w-full max-w-xs">
                <div className="h-2 w-full rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-blue-500 to-indigo-600 transition-all duration-200 ease-out"
                    style={{ width: `${progress}%` }}
                  />
                </div>
                <div className="flex justify-between mt-1.5 text-[10px] font-medium text-slate-400">
                  <span>{progress < 100 ? 'Analysing…' : 'Done'}</span>
                  <span className="tabular-nums">{progress}%</span>
                </div>
              </div>
            </div>
          )}

          {/* MAIN RESULTS BOARD */}
          {analysis && (
            <div className="space-y-6 animate-in fade-in duration-300">
              
              {/* TOP SUMMARY DIAL CARD */}
              <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-6 shadow-sm grid grid-cols-1 md:grid-cols-12 gap-6 items-center">
                
                {/* SVG Risk Dial */}
                <div className="md:col-span-4 flex justify-center">
                  <div className="relative w-36 h-36 flex items-center justify-center">
                    <svg viewBox="0 0 100 100" className="w-full h-full transform -rotate-90">
                      {/* Grey track */}
                      <circle cx="50" cy="50" r="40" fill="none" stroke="#e2e8f0" className="dark:stroke-slate-800" strokeWidth="8" />
                      {/* Coloured bar */}
                      <circle 
                        cx="50" cy="50" r="40" 
                        fill="none" 
                        strokeWidth="8" 
                        strokeDasharray={251.2}
                        strokeDashoffset={251.2 - (251.2 * analysis.impactScore) / 100}
                        strokeLinecap="round"
                        className={`transition-all duration-1000 ${getImpactColor(analysis.impactScore)}`}
                      />
                    </svg>
                    <div className="absolute text-center space-y-0.5">
                      <span className="text-3xl font-extrabold text-slate-800 dark:text-slate-100 leading-none">{analysis.impactScore}</span>
                      <span className="text-[10px] font-bold text-slate-400 block uppercase tracking-wider">Impact Rating</span>
                    </div>
                  </div>
                </div>

                {/* Score verdict details */}
                <div className="md:col-span-8 space-y-3">
                  <div className="flex items-center flex-wrap gap-2">
                    <span className="text-xs font-bold px-2.5 py-1 rounded-full uppercase bg-blue-500/10 text-blue-500 dark:text-blue-400">
                      Scan Verdict
                    </span>
                    <span className="text-xs text-slate-400">
                      Mode: <span className="font-semibold text-slate-600 dark:text-slate-300 capitalize">{analysis.mode || 'local'}</span>
                    </span>
                    {/* Doc source badge */}
                    {analysis.docFetched && (
                      <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-emerald-100 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-400 flex items-center gap-1">
                        <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
                        Spec doc read
                      </span>
                    )}
                    {!analysis.docFetched && selectedBRD?.googleDocsLink && (
                      <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-amber-100 dark:bg-amber-950/40 text-amber-700 dark:text-amber-400 flex items-center gap-1">
                        <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                        Google Doc not public
                      </span>
                    )}
                  </div>
                  <h4 className="text-sm font-semibold text-slate-800 dark:text-slate-100 leading-relaxed">
                    {analysis.verdict}
                  </h4>

                  {/* ── Download buttons ── */}
                  <div className="flex items-center flex-wrap gap-2 pt-1">
                    <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide">Export</span>

                    {/* PDF */}
                    <button
                      onClick={() => downloadResultsPDF(analysis, selectedBRD)}
                      title="Download PDF report"
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-red-50 dark:bg-red-950/30 hover:bg-red-100 dark:hover:bg-red-950/50 border border-red-200 dark:border-red-800/60 text-red-600 dark:text-red-400 text-xs font-semibold transition-all cursor-pointer"
                    >
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z"/>
                      </svg>
                      PDF
                    </button>

                    {/* Word */}
                    <button
                      onClick={() => downloadResultsDocx(analysis, selectedBRD)}
                      title="Download Word summary"
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-blue-50 dark:bg-blue-950/30 hover:bg-blue-100 dark:hover:bg-blue-950/50 border border-blue-200 dark:border-blue-800/60 text-blue-600 dark:text-blue-400 text-xs font-semibold transition-all cursor-pointer"
                    >
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/>
                      </svg>
                      Word
                    </button>

                    {/* Tech Spec */}
                    <button
                      onClick={() => downloadTechSpec(analysis, selectedBRD)}
                      title="Download full Technical Specification document"
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-violet-50 dark:bg-violet-950/30 hover:bg-violet-100 dark:hover:bg-violet-950/50 border border-violet-200 dark:border-violet-800/60 text-violet-600 dark:text-violet-400 text-xs font-semibold transition-all cursor-pointer"
                    >
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 3v2m6-2v2M9 19v2m6-2v2M5 9H3m2 6H3m18-6h-2m2 6h-2M7 19h10a2 2 0 002-2V7a2 2 0 00-2-2H7a2 2 0 00-2 2v10a2 2 0 002 2zM9 9h6v6H9V9z"/>
                      </svg>
                      Tech Spec
                    </button>
                  </div>
                </div>

              </div>

              {/* INTERACTIVE TAB PANEL */}
              <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl overflow-hidden shadow-sm flex flex-col">
                
                {/* Tabs selection */}
                <div className="flex border-b border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-950/20">
                  <button 
                    onClick={() => setActiveTab('modules')}
                    className={`flex-1 py-3 text-xs font-bold border-b-2 uppercase tracking-wide transition-all cursor-pointer ${activeTab === 'modules' ? 'border-blue-500 text-blue-600 dark:text-blue-400 bg-white dark:bg-slate-900' : 'border-transparent text-slate-400 hover:text-slate-600 dark:hover:text-slate-300'}`}
                  >
                    Affected Modules ({analysis.affectedModules?.length || 0})
                  </button>
                  <button 
                    onClick={() => setActiveTab('concepts')}
                    className={`flex-1 py-3 text-xs font-bold border-b-2 uppercase tracking-wide transition-all cursor-pointer ${activeTab === 'concepts' ? 'border-blue-500 text-blue-600 dark:text-blue-400 bg-white dark:bg-slate-900' : 'border-transparent text-slate-400 hover:text-slate-600 dark:hover:text-slate-300'}`}
                  >
                    Architectural Concepts ({analysis.affectedConcepts?.length || 0})
                  </button>
                  <button
                    onClick={() => setActiveTab('action-plan')}
                    className={`flex-1 py-3 text-xs font-bold border-b-2 uppercase tracking-wide transition-all cursor-pointer ${activeTab === 'action-plan' ? 'border-blue-500 text-blue-600 dark:text-blue-400 bg-white dark:bg-slate-900' : 'border-transparent text-slate-400 hover:text-slate-600 dark:hover:text-slate-300'}`}
                  >
                    Developer Action Plan
                  </button>
                  <button
                    onClick={() => setActiveTab('style-features')}
                    className={`flex-1 py-3 text-xs font-bold border-b-2 uppercase tracking-wide transition-all cursor-pointer ${activeTab === 'style-features' ? 'border-violet-500 text-violet-600 dark:text-violet-400 bg-white dark:bg-slate-900' : 'border-transparent text-slate-400 hover:text-slate-600 dark:hover:text-slate-300'}`}
                  >
                    Functions Affected
                    {(analysis.affectedStyleFeatures?.length || 0) > 0 && (
                      <span className="ml-1.5 inline-flex items-center justify-center w-4 h-4 rounded-full bg-violet-500 text-white text-[9px] font-bold">
                        {analysis.affectedStyleFeatures.length}
                      </span>
                    )}
                  </button>

                  {/* Tab 5: Affected Code */}
                  <button
                    onClick={() => setActiveTab('code-blocks')}
                    className={`flex-1 py-3 text-xs font-bold border-b-2 uppercase tracking-wide transition-all cursor-pointer ${activeTab === 'code-blocks' ? 'border-emerald-500 text-emerald-600 dark:text-emerald-400 bg-white dark:bg-slate-900' : 'border-transparent text-slate-400 hover:text-slate-600 dark:hover:text-slate-300'}`}
                  >
                    Affected Code
                    {(analysis.affectedCodeBlocks?.filter(b => b.fileAvailable).length || 0) > 0 && (
                      <span className="ml-1.5 inline-flex items-center justify-center w-4 h-4 rounded-full bg-emerald-500 text-white text-[9px] font-bold">
                        {analysis.affectedCodeBlocks.filter(b => b.fileAvailable).length}
                      </span>
                    )}
                  </button>
                </div>

                {/* TAB WINDOW CONTENT */}
                <div className="p-6 flex-1 min-h-[300px]">
                  
                  {/* TAB 1: MODULES GRID */}
                  {activeTab === 'modules' && (
                    <div className="space-y-4">
                      {analysis.affectedModules?.map((mod) => (
                        <div 
                          key={mod.name} 
                          className="p-4 border border-slate-100 dark:border-slate-800 hover:border-slate-200 dark:hover:border-slate-700 bg-slate-50/30 dark:bg-slate-900/20 rounded-2xl space-y-3 hover:shadow-sm transition-all"
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div className="space-y-0.5">
                              <div className="flex items-center gap-2">
                                <h5 className="font-bold text-slate-800 dark:text-slate-100 text-sm">{mod.name}</h5>
                                <span className={`text-[10px] font-bold px-2 py-0.5 border rounded-full uppercase ${getSeverityStyle(mod.severity)}`}>
                                  {mod.severity} Impact
                                </span>
                              </div>
                              <p className="text-[10px] font-mono text-slate-400 select-all cursor-copy" title="Copy Path">
                                {mod.path}
                              </p>
                            </div>
                          </div>
                          
                          <p className="text-xs font-medium text-slate-500 dark:text-slate-400 italic">
                            <strong className="text-slate-700 dark:text-slate-300 not-italic">Role:</strong> {mod.role}
                          </p>
                          <p className="text-xs text-slate-600 dark:text-slate-300 bg-white dark:bg-slate-950/40 p-2.5 rounded-xl border border-slate-100 dark:border-slate-800/80 leading-relaxed">
                            {mod.explanation}
                          </p>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* TAB 2: ARCHITECTURAL CONCEPTS */}
                  {activeTab === 'concepts' && (
                    <div className="space-y-6">
                      <div className="flex flex-wrap gap-2.5">
                        {analysis.affectedConcepts?.map((concept) => (
                          <span 
                            key={concept}
                            className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-xs font-semibold bg-gradient-to-br from-blue-50 to-indigo-50 dark:from-blue-950/20 dark:to-indigo-950/20 border border-blue-200/50 dark:border-blue-900/30 text-blue-600 dark:text-blue-300"
                          >
                            <span className="w-1.5 h-1.5 rounded-full bg-blue-500" />
                            {concept}
                          </span>
                        ))}
                      </div>

                      <div className="p-4 bg-slate-50 dark:bg-slate-950/40 border border-slate-100 dark:border-slate-850 rounded-2xl">
                        <h5 className="text-xs font-bold text-slate-800 dark:text-slate-200 uppercase tracking-wide mb-2">Concept Context from Knowledge Base</h5>
                        <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
                          The listed concepts drive key validation constraints in the customizer workspace. Ensure twill boundaries (max 15 colors), pullover zipper colorizations, contrast checks, and fabric upgrade cart line items are carefully synced to prevent downstream pricing or canvas rendering defects.
                        </p>
                      </div>
                    </div>
                  )}

                  {/* TAB 3: DEVELOPER ACTION PLAN */}
                  {activeTab === 'action-plan' && (
                    <div className="space-y-4">
                      <div className="p-3 bg-indigo-500/10 border border-indigo-500/20 text-indigo-600 dark:text-indigo-400 rounded-2xl text-xs flex items-start gap-2.5">
                        <svg className="w-4 h-4 mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                        <div>
                          <p className="font-semibold">Interactive Implementation Guide</p>
                          <p className="opacity-90 mt-0.5">Check off recommendations as you implement or verify each requirement in the codebase.</p>
                        </div>
                      </div>

                      <div className="divide-y divide-slate-100 dark:divide-slate-800">
                        {analysis.recommendations?.map((rec, idx) => (
                          <div 
                            key={idx} 
                            onClick={() => {
                              setCheckedRecs(prev => ({ ...prev, [idx]: !prev[idx] }));
                            }}
                            className={`flex items-start gap-3 py-3 cursor-pointer select-none transition-all ${checkedRecs[idx] ? 'opacity-50' : ''}`}
                          >
                            <span className={`w-5 h-5 rounded-md border flex items-center justify-center flex-shrink-0 mt-0.5 transition-colors ${checkedRecs[idx] ? 'bg-blue-500 border-blue-500 text-white' : 'border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900'}`}>
                              {checkedRecs[idx] && (
                                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                                </svg>
                              )}
                            </span>
                            <span className={`text-xs text-slate-700 dark:text-slate-300 leading-normal ${checkedRecs[idx] ? 'line-through' : ''}`}>
                              {rec}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* TAB 4: FUNCTIONS AFFECTED */}
                  {activeTab === 'style-features' && (
                    <div className="space-y-3">
                      {(!analysis.affectedStyleFeatures || analysis.affectedStyleFeatures.length === 0) ? (
                        <div className="flex flex-col items-center justify-center py-12 text-center">
                          <div className="w-10 h-10 rounded-xl bg-violet-500/10 flex items-center justify-center text-violet-500 mb-3">
                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M9 3v2m6-2v2M9 19v2m6-2v2M5 9H3m2 6H3m18-6h-2m2 6h-2M7 19h10a2 2 0 002-2V7a2 2 0 00-2-2H7a2 2 0 00-2 2v10a2 2 0 002 2zM9 9h6v6H9V9z" />
                            </svg>
                          </div>
                          <p className="text-sm font-medium text-slate-500 dark:text-slate-400">No builder functions matched</p>
                          <p className="text-xs text-slate-400 dark:text-slate-500 mt-1 max-w-xs">Try adding more detail to the BRD description or uploading the specification document.</p>
                        </div>
                      ) : (
                        <>
                          {/* Group by tab */}
                          {(() => {
                            const grouped = {};
                            (analysis.affectedStyleFeatures || []).forEach(sf => {
                              if (!grouped[sf.tab]) grouped[sf.tab] = [];
                              grouped[sf.tab].push(sf);
                            });
                            const impactColors = {
                              High:   'bg-red-500/10 border-red-500/20 text-red-500',
                              Medium: 'bg-amber-500/10 border-amber-500/20 text-amber-500',
                              Low:    'bg-emerald-500/10 border-emerald-500/20 text-emerald-500',
                            };
                            const statusColors = {
                              new:        'bg-blue-100 dark:bg-blue-950/40 text-blue-600 dark:text-blue-400',
                              stable:     'bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400',
                              ongoing:    'bg-amber-100 dark:bg-amber-950/40 text-amber-600 dark:text-amber-400',
                              assessment: 'bg-violet-100 dark:bg-violet-950/40 text-violet-600 dark:text-violet-400',
                            };
                            return Object.entries(grouped).map(([tab, features]) => (
                              <div key={tab} className="space-y-2">
                                {/* Tab group header */}
                                <div className="flex items-center gap-2">
                                  <div className="h-px flex-1 bg-slate-100 dark:bg-slate-800" />
                                  <span className="text-[10px] font-bold text-violet-600 dark:text-violet-400 uppercase tracking-widest px-2 py-0.5 rounded-full bg-violet-50 dark:bg-violet-950/30 border border-violet-200 dark:border-violet-800/50">
                                    {tab}
                                  </span>
                                  <div className="h-px flex-1 bg-slate-100 dark:bg-slate-800" />
                                </div>
                                {/* Feature cards */}
                                {features.map(sf => (
                                  <div key={sf.feature} className="p-3.5 rounded-2xl border border-slate-100 dark:border-slate-800 bg-slate-50/40 dark:bg-slate-900/30 space-y-2">
                                    <div className="flex items-start justify-between gap-2">
                                      <div className="flex items-center gap-2 flex-wrap">
                                        <h5 className="text-sm font-bold text-slate-800 dark:text-slate-100">{sf.feature}</h5>
                                        {/* Status badge */}
                                        <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded uppercase tracking-wide ${statusColors[sf.status] || statusColors.stable}`}>
                                          {sf.status}
                                        </span>
                                      </div>
                                      {/* Impact badge */}
                                      {sf.impact && (
                                        <span className={`text-[10px] font-bold px-2 py-0.5 border rounded-full uppercase flex-shrink-0 ${impactColors[sf.impact] || impactColors.Medium}`}>
                                          {sf.impact} Impact
                                        </span>
                                      )}
                                    </div>
                                    {sf.explanation && (
                                      <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">{sf.explanation}</p>
                                    )}
                                  </div>
                                ))}
                              </div>
                            ));
                          })()}
                        </>
                      )}
                    </div>
                  )}

                  {/* TAB 5: AFFECTED CODE BLOCKS */}
                  {activeTab === 'code-blocks' && (
                    <div className="space-y-4">
                      {(!analysis.affectedCodeBlocks || analysis.affectedCodeBlocks.length === 0) ? (
                        <div className="flex flex-col items-center justify-center py-12 text-center">
                          <div className="w-10 h-10 rounded-xl bg-emerald-500/10 flex items-center justify-center text-emerald-500 mb-3">
                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4"/>
                            </svg>
                          </div>
                          <p className="text-sm font-medium text-slate-500 dark:text-slate-400">No code blocks extracted</p>
                          <p className="text-xs text-slate-400 dark:text-slate-500 mt-1 max-w-xs">The customizer repository may not be accessible, or no matching functions were found.</p>
                        </div>
                      ) : (
                        analysis.affectedCodeBlocks.map((block, bi) => (
                          <div key={bi} className={`rounded-2xl border overflow-hidden ${block.fileAvailable ? 'border-slate-200 dark:border-slate-700' : 'border-dashed border-slate-200 dark:border-slate-700 opacity-60'}`}>
                            {/* File header */}
                            <div className={`flex items-center justify-between px-4 py-2.5 ${block.fileAvailable ? 'bg-slate-800 dark:bg-slate-950' : 'bg-slate-100 dark:bg-slate-800'}`}>
                              <div className="flex items-center gap-2 min-w-0">
                                <svg className="w-3.5 h-3.5 text-emerald-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4"/>
                                </svg>
                                <span className="text-[11px] font-mono text-emerald-400 truncate">{block.path}</span>
                              </div>
                              <span className={`text-[9px] font-bold px-2 py-0.5 rounded-full flex-shrink-0 ml-2 ${
                                block.severity === 'High' ? 'bg-red-500/20 text-red-400' :
                                block.severity === 'Medium' ? 'bg-amber-500/20 text-amber-400' :
                                'bg-emerald-500/20 text-emerald-400'
                              }`}>{block.severity}</span>
                            </div>

                            {/* Why this file */}
                            {block.reason && (
                              <div className="px-4 py-2 bg-slate-50 dark:bg-slate-900/50 border-b border-slate-200 dark:border-slate-800">
                                <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-relaxed">{block.reason.slice(0, 200)}{block.reason.length > 200 ? '…' : ''}</p>
                              </div>
                            )}

                            {/* Code blocks */}
                            {block.fileAvailable ? (
                              <div className="divide-y divide-slate-700 dark:divide-slate-800">
                                {block.functions.map((fn, fi) => (
                                  <div key={fi}>
                                    {/* Function header */}
                                    <div className="flex items-center gap-3 px-4 py-2 bg-slate-700 dark:bg-slate-900/80">
                                      <span className="text-[10px] font-mono font-bold text-yellow-400">{fn.functionName}</span>
                                      <span className="text-[10px] text-slate-400 font-mono">lines {fn.lineStart}–{fn.lineEnd}</span>
                                    </div>
                                    {/* Code */}
                                    <pre className="p-4 overflow-x-auto text-[11px] leading-relaxed bg-[#1e1e1e] text-[#d4d4d4] font-mono">
                                      {fn.code.split('\n').map((line, li) => (
                                        <div key={li} className="flex gap-3">
                                          <span className="select-none text-[#858585] w-7 text-right flex-shrink-0">{fn.lineStart + li}</span>
                                          <span>{line}</span>
                                        </div>
                                      ))}
                                    </pre>
                                  </div>
                                ))}
                              </div>
                            ) : (
                              <div className="px-4 py-3 bg-white dark:bg-slate-900">
                                <p className="text-xs text-slate-400 italic">File not found in local repository — ensure the customizer-core path is accessible.</p>
                              </div>
                            )}
                          </div>
                        ))
                      )}
                    </div>
                  )}

                </div>

              </div>

            </div>
          )}

        </div>

      </div>

    </div>

    {/* ── 3D Uniform Modal ── */}
    {show3D && (
      <Garment3DView
        views={show3D}
        brandStyleId={brandStyleId}
        onClose={() => setShow3D(null)}
      />
    )}
    </>
  );
}
