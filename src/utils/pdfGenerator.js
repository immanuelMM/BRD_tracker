import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';
import { BUG_CRITERIA as DEFAULT_CRITERIA, BUG_SEVERITY, MIN_BUG_THRESHOLD, QUARTER_MONTHS, getSprintLabel, hexToRgb } from './constants';

const getCriteriaLabel = (criteria, val) => criteria.find((c) => c.value === val)?.label || val;
const getSeverityLabel = (val) => BUG_SEVERITY.find((s) => s.value === val)?.label || val;

export const generateBRDReport = async (quarter, year, brds, bugs, criteria = DEFAULT_CRITERIA, brdTechLeads = []) => {
  const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const pageWidth = pdf.internal.pageSize.getWidth();
  const margin = 15;
  const contentWidth = pageWidth - margin * 2;
  let y = margin;

  const addLine = (text, x, fontSize = 10, style = 'normal', color = [30, 30, 30]) => {
    pdf.setFontSize(fontSize);
    pdf.setFont('helvetica', style);
    pdf.setTextColor(...color);
    pdf.text(text, x, y);
  };

  const nextLine = (gap = 6) => { y += gap; };

  const checkPage = (needed = 20) => {
    if (y + needed > pdf.internal.pageSize.getHeight() - margin) {
      pdf.addPage();
      y = margin;
    }
  };

  // Header
  pdf.setFillColor(37, 99, 235);
  pdf.rect(0, 0, pageWidth, 30, 'F');
  pdf.setFontSize(18);
  pdf.setFont('helvetica', 'bold');
  pdf.setTextColor(255, 255, 255);
  pdf.text(`BRD Insight — ${quarter} ${year} Report`, margin, 18);
  pdf.setFontSize(10);
  pdf.setFont('helvetica', 'normal');
  pdf.text(`Generated: ${new Date().toLocaleDateString()}`, margin, 25);
  y = 40;

  // Quarter summary — includes manual extensions + auto-carry for in-progress/testing
  const CARRY_STATUSES = ['in_progress', 'development', 'testing'];
  const isEarlierQuarter = (bq, by, cq, cy) =>
    Number(by) < Number(cy) || (Number(by) === Number(cy) && bq < cq);
  const quarterBRDs = brds.filter((b) => {
    if (b.quarter === quarter && String(b.year) === String(year)) return true;
    try {
      const ext = JSON.parse(b.extendedQuarters || '[]');
      if (ext.includes(`${quarter}-${year}`)) return true;
    } catch { /* noop */ }
    if (CARRY_STATUSES.includes(b.status) && isEarlierQuarter(b.quarter, b.year, quarter, year)) return true;
    // Planning BRDs with no sprint assigned appear in every quarter's report
    if (b.status === 'planning' && !b.sprintStart) return true;
    return false;
  });
  const isExtended = (b) =>
    !(b.quarter === quarter && String(b.year) === String(year));
  // Append "← Q1 2025" suffix for extended/carried BRDs so the PDF is self-explanatory
  const brdTitle = (b) => isExtended(b) ? `${b.title} \u2190 ${b.quarter} ${b.year}` : b.title;
  // In PDF tables strip "Sprint " from the second value only to save space
  // e.g. "Sprint 9 - Sprint 10" → "Sprint 9 - 10",  "Sprint 5" → "Sprint 5"
  const pdfSprintLabel = (b) => getSprintLabel(b).replace(/ - Sprint\s+/, ' - ');

  // Build newline-separated "Name (Expertise)" string for a BRD's tech leads
  const getTechLeadsStr = (brdId) => {
    const leads = brdTechLeads.filter((tl) => tl.brdId === brdId);
    if (!leads.length) return '—';
    return leads.map((tl) => tl.expertise ? `${tl.name} (${tl.expertise})` : tl.name).join('\n');
  };
  // Parse devAssignee (JSON array or legacy plain string) into newline-separated string
  const getDevStr = (val) => {
    if (!val) return '—';
    try { const p = JSON.parse(val); if (Array.isArray(p) && p.length) return p.join('\n'); } catch {}
    return val;
  };
  const quarterBugs = bugs.filter((bug) => quarterBRDs.some((b) => b.id === bug.brdId));
  const launched = quarterBRDs.filter((b) => b.status === 'launched');
  const successful = launched.filter((b) => {
    const activeBugCount = bugs.filter((bug) => bug.brdId === b.id && !['resolved', 'closed'].includes(bug.status)).length;
    return activeBugCount <= MIN_BUG_THRESHOLD;
  });

  // Summary Box
  pdf.setFillColor(239, 246, 255);
  pdf.roundedRect(margin, y, contentWidth, 35, 3, 3, 'F');
  pdf.setDrawColor(147, 197, 253);
  pdf.roundedRect(margin, y, contentWidth, 35, 3, 3, 'S');
  y += 8;
  addLine('Quarter Summary', margin + 5, 13, 'bold', [37, 99, 235]);
  nextLine(7);
  addLine(`Period: ${QUARTER_MONTHS[quarter]} ${year}`, margin + 5, 10);
  nextLine(5);
  const colW = contentWidth / 4;
  const summaryItems = [
    { label: 'Total BRDs', value: quarterBRDs.length },
    { label: 'Launched', value: launched.length },
    { label: 'Successful', value: successful.length },
    { label: 'Total Bugs', value: quarterBugs.length },
  ];
  summaryItems.forEach((item, i) => {
    pdf.setFontSize(9);
    pdf.setFont('helvetica', 'normal');
    pdf.setTextColor(100, 100, 100);
    pdf.text(item.label, margin + 5 + i * colW, y);
    pdf.setFontSize(14);
    pdf.setFont('helvetica', 'bold');
    pdf.setTextColor(30, 30, 30);
    pdf.text(String(item.value), margin + 5 + i * colW, y + 7);
  });
  y += 20;

  // ── Analytics / Charts (continue on same page after summary) ─────────────
  {
    let cy = y + 4; // pick up directly below the summary box

    // ── Pie slice helper (polygon approximation) ──────────────────────────────
    const drawPieSlice = (cx, pcy, r, startAngle, endAngle, rgb) => {
      const steps = Math.max(6, Math.ceil(Math.abs(endAngle - startAngle) / (Math.PI / 16)));
      pdf.setFillColor(...rgb);
      pdf.moveTo(cx, pcy);
      for (let i = 0; i <= steps; i++) {
        const a = startAngle + (endAngle - startAngle) * (i / steps);
        pdf.lineTo(cx + r * Math.cos(a), pcy + r * Math.sin(a));
      }
      pdf.close();
      pdf.fill();
    };

    // ── Data ──────────────────────────────────────────────────────────────────
    const COLORS6 = [
      [59, 130, 246], [244, 63, 94], [245, 158, 11],
      [16, 185, 129], [139, 92, 246], [20, 184, 166],
    ];
    const pieData = criteria
      .map((c, i) => ({
        label: c.label,
        value: quarterBugs.filter((b) => b.criteria === c.value).length,
        color: c.color ? hexToRgb(c.color) : COLORS6[i % COLORS6.length],
      }))
      .filter((d) => d.value > 0);

    const statusBars = [
      { label: 'Launched',    color: [16, 185, 129], value: quarterBRDs.filter((b) => b.status === 'launched').length    },
      { label: 'Development', color: [59, 130, 246], value: quarterBRDs.filter((b) => b.status === 'development').length },
      { label: 'Testing',     color: [139, 92, 246], value: quarterBRDs.filter((b) => b.status === 'testing').length     },
      { label: 'In Progress', color: [245, 158, 11], value: quarterBRDs.filter((b) => b.status === 'in_progress').length },
      { label: 'On Hold',     color: [239, 68, 68],  value: quarterBRDs.filter((b) => b.status === 'onhold').length      },
      { label: 'Planning',    color: [99, 102, 241], value: quarterBRDs.filter((b) => b.status === 'planning').length    },
    ].filter((s) => s.value > 0);

    const trendPts = ['Q1', 'Q2', 'Q3', 'Q4'].map((q) => {
      const qBs = brds.filter((b) => b.quarter === q && String(b.year) === String(year));
      return {
        q,
        total:    qBs.length,
        launched: qBs.filter((b) => b.status === 'launched').length,
        bugs:     bugs.filter((bug) => qBs.some((b) => b.id === bug.brdId)).length,
      };
    });

    // ─────────────────────────────────────────────────────────────────────────
    // ROW 1: Bug Criteria Donut (left) + Status Distribution bars (right)
    // ─────────────────────────────────────────────────────────────────────────
    const row1Y = cy;
    const half = contentWidth / 2 - 3;

    // LEFT: Donut ─────────────────────────────────────────────────────────────
    pdf.setFontSize(9);
    pdf.setFont('helvetica', 'bold');
    pdf.setTextColor(30, 30, 30);
    pdf.text('Bug Criteria', margin, cy);
    cy += 5;

    const pieCX = margin + 24;
    const pieCYC = cy + 24;
    const pieRad = 20;
    const holeRad = 8;

    if (pieData.length === 0) {
      pdf.setFontSize(8);
      pdf.setFont('helvetica', 'italic');
      pdf.setTextColor(160, 160, 160);
      pdf.text('No bugs this quarter', margin, cy + 15);
    } else {
      const pieTotal = pieData.reduce((s, d) => s + d.value, 0);
      let startA = -Math.PI / 2;
      pieData.forEach((d) => {
        const sweep = (d.value / pieTotal) * Math.PI * 2;
        drawPieSlice(pieCX, pieCYC, pieRad, startA, startA + sweep, d.color);
        startA += sweep;
      });
      // White donut hole
      pdf.setFillColor(255, 255, 255);
      pdf.circle(pieCX, pieCYC, holeRad, 'F');
      // Total in centre
      pdf.setFontSize(8);
      pdf.setFont('helvetica', 'bold');
      pdf.setTextColor(30, 30, 30);
      const tStr = String(pieTotal);
      pdf.text(tStr, pieCX - tStr.length * 1.2, pieCYC + 1.5);
      // Legend
      let lY = cy + 2;
      const lX = margin + 50;
      pieData.forEach((d) => {
        pdf.setFillColor(...d.color);
        pdf.rect(lX, lY - 3, 4, 4, 'F');
        pdf.setFontSize(7);
        pdf.setFont('helvetica', 'normal');
        pdf.setTextColor(40, 40, 40);
        const lb = d.label.length > 22 ? d.label.slice(0, 21) + '…' : d.label;
        pdf.text(`${lb} (${d.value})`, lX + 6, lY);
        lY += 7;
      });
    }

    // RIGHT: Status horizontal bars ───────────────────────────────────────────
    const rX = margin + half + 6;
    let rY = row1Y;
    pdf.setFontSize(9);
    pdf.setFont('helvetica', 'bold');
    pdf.setTextColor(30, 30, 30);
    pdf.text('Status Distribution', rX, rY);
    rY += 7;

    const maxSB = Math.max(1, ...statusBars.map((s) => s.value));
    const sbW = half - 30;
    statusBars.forEach((s) => {
      const bw = Math.max(4, (s.value / maxSB) * sbW);
      pdf.setFontSize(7.5);
      pdf.setFont('helvetica', 'normal');
      pdf.setTextColor(50, 50, 50);
      pdf.text(s.label.length > 12 ? s.label.slice(0, 11) + '…' : s.label, rX, rY + 4.5);
      pdf.setFillColor(...s.color);
      pdf.roundedRect(rX + 28, rY, bw, 6.5, 1, 1, 'F');
      pdf.setFontSize(7.5);
      pdf.setFont('helvetica', 'bold');
      pdf.setTextColor(...s.color);
      pdf.text(String(s.value), rX + 30 + bw, rY + 4.5);
      rY += 9.5;
    });

    cy = Math.max(row1Y + 58, rY) + 8;

    // ─────────────────────────────────────────────────────────────────────────
    // ROW 2: Quarterly Trend Line Chart (full width)
    // ─────────────────────────────────────────────────────────────────────────
    pdf.setFontSize(9);
    pdf.setFont('helvetica', 'bold');
    pdf.setTextColor(30, 30, 30);
    pdf.text('Quarterly Trend', margin, cy);
    cy += 5;

    const tcH = 40;
    const tcX = margin + 10;
    const tcW = contentWidth - 12;
    const tcY0 = cy + tcH;

    pdf.setFillColor(248, 250, 252);
    pdf.rect(margin, cy, contentWidth, tcH + 12, 'F');

    const tcMax = Math.max(1, ...trendPts.flatMap((d) => [d.total, d.launched, d.bugs]));
    const tcPt = (qi, v) => ({ px: tcX + (qi / 3) * tcW, py: tcY0 - (v / tcMax) * tcH + 6 });

    // Gridlines
    const tcStep = Math.max(1, Math.ceil(tcMax / 4));
    for (let v = 0; v <= tcMax; v += tcStep) {
      const gpy = tcY0 - (v / tcMax) * tcH + 6;
      pdf.setDrawColor(225, 225, 225);
      pdf.setLineWidth(0.2);
      pdf.line(tcX, gpy, tcX + tcW, gpy);
      pdf.setFontSize(5.5);
      pdf.setFont('helvetica', 'normal');
      pdf.setTextColor(160, 160, 160);
      pdf.text(String(v), margin, gpy + 1.5);
    }
    // X axis + Q labels
    pdf.setDrawColor(180, 180, 180);
    pdf.setLineWidth(0.4);
    pdf.line(tcX, tcY0 + 6, tcX + tcW, tcY0 + 6);
    ['Q1', 'Q2', 'Q3', 'Q4'].forEach((q, i) => {
      const { px } = tcPt(i, 0);
      pdf.setFontSize(7);
      pdf.setFont('helvetica', 'bold');
      pdf.setTextColor(80, 80, 80);
      pdf.text(q, px - 3, tcY0 + 11);
    });
    // Lines + dots
    const tcLines = [
      { key: 'total',    color: [59, 130, 246],  label: 'Total BRDs' },
      { key: 'launched', color: [16, 185, 129],  label: 'Launched'   },
      { key: 'bugs',     color: [239, 68, 68],   label: 'Bugs'       },
    ];
    tcLines.forEach(({ key, color }) => {
      pdf.setDrawColor(...color);
      pdf.setLineWidth(0.9);
      trendPts.forEach((d, i) => {
        const { px, py } = tcPt(i, d[key]);
        if (i > 0) {
          const prev = tcPt(i - 1, trendPts[i - 1][key]);
          pdf.line(prev.px, prev.py, px, py);
        }
        pdf.setFillColor(...color);
        pdf.circle(px, py, 1.2, 'F');
      });
    });
    // Trend legend
    let tcLegX = margin + 10;
    tcLines.forEach(({ color, label }) => {
      pdf.setFillColor(...color);
      pdf.rect(tcLegX, tcY0 + 14, 7, 3, 'F');
      pdf.setFontSize(7);
      pdf.setFont('helvetica', 'normal');
      pdf.setTextColor(40, 40, 40);
      pdf.text(label, tcLegX + 9, tcY0 + 16.5);
      tcLegX += 40;
    });
    cy = tcY0 + 22;

    // ─────────────────────────────────────────────────────────────────────────
    // ROW 3: Dev Assignee Status Distribution (full width)
    // ─────────────────────────────────────────────────────────────────────────
    const devStatusMap = new Map(); // devName → { status: count }
    quarterBRDs.forEach((brd) => {
      const devs = [];
      if (brd.devAssignee) {
        try { const p = JSON.parse(brd.devAssignee); if (Array.isArray(p)) devs.push(...p); else devs.push(brd.devAssignee); }
        catch { devs.push(brd.devAssignee); }
      }
      devs.filter(Boolean).forEach((d) => {
        if (!devStatusMap.has(d)) devStatusMap.set(d, {});
        const m = devStatusMap.get(d);
        m[brd.status] = (m[brd.status] || 0) + 1;
      });
    });

    if (devStatusMap.size > 0) {
      const devStatusColors = {
        launched:    [16, 185, 129],
        testing:     [139, 92, 246],
        development: [59, 130, 246],
        inprogress:  [245, 158, 11],
        onhold:      [239, 68, 68],
        planning:    [156, 163, 175],
      };
      const devStatusLabels = { launched: 'Launched', testing: 'Testing', development: 'Dev', inprogress: 'In Progress', onhold: 'On Hold', planning: 'Planning' };

      // Check if we need a new page for this chart
      const needed = devStatusMap.size * 10 + 22;
      if (cy + needed > pdf.internal.pageSize.getHeight() - margin) {
        pdf.addPage();
        cy = margin;
      }

      pdf.setFontSize(9);
      pdf.setFont('helvetica', 'bold');
      pdf.setTextColor(30, 30, 30);
      pdf.text('Dev Assignee BRD Distribution', margin, cy);
      cy += 7;

      const devNameW = 42;
      const devBarW  = contentWidth - devNameW - 12;
      const maxDevTotal = Math.max(1, ...[...devStatusMap.values()].map((m) => Object.values(m).reduce((a, b) => a + b, 0)));

      devStatusMap.forEach((statuses, devName) => {
        // page-overflow guard inside loop
        if (cy + 10 > pdf.internal.pageSize.getHeight() - margin) { pdf.addPage(); cy = margin; }

        const total = Object.values(statuses).reduce((a, b) => a + b, 0);
        const truncName = devName.length > 19 ? devName.slice(0, 18) + '…' : devName;
        pdf.setFontSize(7.5);
        pdf.setFont('helvetica', 'normal');
        pdf.setTextColor(50, 50, 50);
        pdf.text(truncName, margin, cy + 4.5);

        // Stacked bar proportional to maxDevTotal
        let bx = margin + devNameW;
        const totalBarW = (total / maxDevTotal) * devBarW;
        Object.entries(statuses).forEach(([status, count]) => {
          const segW = (count / total) * totalBarW;
          pdf.setFillColor(...(devStatusColors[status] || [156, 163, 175]));
          pdf.roundedRect(bx, cy, segW, 6.5, 1, 1, 'F');
          bx += segW;
        });
        // Count label
        pdf.setFontSize(7.5);
        pdf.setFont('helvetica', 'bold');
        pdf.setTextColor(50, 50, 50);
        pdf.text(String(total), margin + devNameW + totalBarW + 3, cy + 4.5);
        cy += 9.5;
      });

      // Legend
      let devLegX = margin;
      Object.entries(devStatusLabels).forEach(([status, label]) => {
        pdf.setFillColor(...(devStatusColors[status] || [156, 163, 175]));
        pdf.rect(devLegX, cy, 4, 4, 'F');
        pdf.setFontSize(6.5);
        pdf.setFont('helvetica', 'normal');
        pdf.setTextColor(40, 40, 40);
        pdf.text(label, devLegX + 6, cy + 3.5);
        devLegX += 30;
      });
      cy += 10;
    }

  }
  // Tables start on a fresh page after the charts
  pdf.addPage();
  y = margin;

  // ── Table helper ──────────────────────────────────────────────────────────
  const ROW_H = 8;
  const HEADER_H = 9;

  // ── One table per status, in order ────────────────────────────────────────
  const STATUS_SECTIONS = [
    {
      value: 'launched',
      title: 'Launched Products',
      subtitle: 'Completed and deployed this quarter',
      headerColor: [16, 185, 129],
      cols: [
        { key: 'no',     label: '#',         w: 8  },
        { key: 'title',  label: 'BRD Title', w: 46 },
        { key: 'ba',     label: 'BA',        w: 22 },
        { key: 'dev',    label: 'Dev',        w: 22, wrap: true },
        { key: 'sprint', label: 'Sprint',    w: 30 },
        { key: 'size',   label: 'Size',      w: 12 },
        { key: 'bugs',   label: 'Bugs',      w: 10 },
        { key: 'req',    label: 'Req.',      w: 10 },
        { key: 'result', label: 'Result',    w: 20 },
      ],
      buildRow: (brd, i) => {
        const realBugs   = bugs.filter((b) => b.brdId === brd.id && !b.storyTicket);
        const activeBugs = realBugs.filter((b) => !['resolved', 'closed'].includes(b.status)).length;
        const reqCount   = bugs.filter((b) => b.brdId === brd.id && b.storyTicket).length;
        return { no: i + 1, title: brdTitle(brd), ba: brd.baName || '—', dev: getDevStr(brd.devAssignee), sprint: brd.sprintStart ? pdfSprintLabel(brd) : '—', size: brd.tshirtSize || '—', bugs: realBugs.length, req: reqCount || '—', result: activeBugs <= MIN_BUG_THRESHOLD ? 'Success' : 'High Bugs', _rawStatus: brd.status };
      },
    },
    {
      value: 'testing',
      title: 'Testing',
      subtitle: 'Possible to continue into next sprint',
      headerColor: [139, 92, 246],
      cols: [
        { key: 'no',       label: '#',         w: 8  },
        { key: 'title',    label: 'BRD Title', w: 50 },
        { key: 'ba',       label: 'BA',        w: 22 },
        { key: 'dev',      label: 'Dev',        w: 22, wrap: true },
        { key: 'sprint',   label: 'Sprint',    w: 33 },
        { key: 'size',     label: 'Size',      w: 13 },
        { key: 'techlead', label: 'Tech Lead', w: 32, wrap: true },
      ],
      buildRow: (brd, i) => ({ no: i + 1, title: brdTitle(brd), ba: brd.baName || '—', dev: getDevStr(brd.devAssignee), sprint: brd.sprintStart ? pdfSprintLabel(brd) : '—', size: brd.tshirtSize || '—', techlead: getTechLeadsStr(brd.id), _rawStatus: brd.status }),
    },
    {
      value: 'development',
      title: 'Development',
      subtitle: 'Possible flow to next sprint',
      headerColor: [59, 130, 246],
      cols: [
        { key: 'no',       label: '#',         w: 8  },
        { key: 'title',    label: 'BRD Title', w: 50 },
        { key: 'ba',       label: 'BA',        w: 22 },
        { key: 'dev',      label: 'Dev',        w: 22, wrap: true },
        { key: 'sprint',   label: 'Sprint',    w: 33 },
        { key: 'size',     label: 'Size',      w: 13 },
        { key: 'techlead', label: 'Tech Lead', w: 32, wrap: true },
      ],
      buildRow: (brd, i) => ({ no: i + 1, title: brdTitle(brd), ba: brd.baName || '—', dev: getDevStr(brd.devAssignee), sprint: brd.sprintStart ? pdfSprintLabel(brd) : '—', size: brd.tshirtSize || '—', techlead: getTechLeadsStr(brd.id), _rawStatus: brd.status }),
    },
    {
      value: 'inprogress',
      title: 'In Progress',
      subtitle: 'Currently under active assessment',
      headerColor: [245, 158, 11],
      cols: [
        { key: 'no',       label: '#',         w: 8  },
        { key: 'title',    label: 'BRD Title', w: 50 },
        { key: 'ba',       label: 'BA',        w: 22 },
        { key: 'dev',      label: 'Dev',        w: 22, wrap: true },
        { key: 'sprint',   label: 'Sprint',    w: 33 },
        { key: 'size',     label: 'Size',      w: 13 },
        { key: 'techlead', label: 'Tech Lead', w: 32, wrap: true },
      ],
      buildRow: (brd, i) => ({ no: i + 1, title: brdTitle(brd), ba: brd.baName || '—', dev: getDevStr(brd.devAssignee), sprint: brd.sprintStart ? pdfSprintLabel(brd) : '—', size: brd.tshirtSize || '—', techlead: getTechLeadsStr(brd.id), _rawStatus: brd.status }),
    },
    {
      value: 'onhold',
      title: 'On Hold',
      subtitle: 'Paused — pending decision for next sprint',
      headerColor: [239, 68, 68],
      cols: [
        { key: 'no',     label: '#',         w: 8  },
        { key: 'title',  label: 'BRD Title', w: 52 },
        { key: 'ba',     label: 'BA',        w: 22 },
        { key: 'dev',    label: 'Dev',        w: 25, wrap: true },
        { key: 'sprint', label: 'Sprint',    w: 35 },
        { key: 'size',   label: 'Size',      w: 38 },
      ],
      buildRow: (brd, i) => ({ no: i + 1, title: brdTitle(brd), ba: brd.baName || '—', dev: getDevStr(brd.devAssignee), sprint: brd.sprintStart ? pdfSprintLabel(brd) : '—', size: brd.tshirtSize || '—', _rawStatus: brd.status }),
    },
    {
      value: 'planning',
      title: 'Planning',
      subtitle: 'No sprint or quarter assigned yet',
      headerColor: [99, 102, 241],
      cols: [
        { key: 'no',    label: '#',         w: 8  },
        { key: 'title', label: 'BRD Title', w: 70 },
        { key: 'ba',    label: 'BA',        w: 25 },
        { key: 'size',  label: 'Size',      w: 15 },
        { key: 'techlead', label: 'Tech Lead', w: 62, wrap: true },
      ],
      buildRow: (brd, i) => ({ no: i + 1, title: brdTitle(brd), ba: brd.baName || '—', size: brd.tshirtSize || '—', techlead: getTechLeadsStr(brd.id), _rawStatus: brd.status }),
    },
  ];

  STATUS_SECTIONS.forEach((section) => {
    const sectionBRDs = quarterBRDs.filter((b) => b.status === section.value);
    if (sectionBRDs.length === 0) return;

    const rows = sectionBRDs.map(section.buildRow);

    nextLine(8);
    checkPage(HEADER_H + ROW_H * Math.min(rows.length, 3) + 20);

    // Section heading block
    addLine(section.title, margin, 12, 'bold', section.headerColor);
    nextLine(5.5);
    addLine(section.subtitle, margin, 8.5, 'italic', [120, 120, 120]);
    nextLine(5);

    if (rows.length === 0) { addLine('No records.', margin, 9, 'normal', [150, 150, 150]); nextLine(6); return; }

    // Header row
    pdf.setFillColor(...section.headerColor);
    pdf.rect(margin, y, contentWidth, HEADER_H, 'F');
    pdf.setFontSize(8);
    pdf.setFont('helvetica', 'bold');
    pdf.setTextColor(255, 255, 255);
    let hx = margin + 2;
    section.cols.forEach((col) => { pdf.text(col.label, hx, y + 6); hx += col.w; });
    nextLine(HEADER_H);

    // Data rows — supports dynamic height for wrap:true columns
    const LINE_H = 5.5;
    rows.forEach((row, ri) => {
      // Pre-calculate row height based on max lines needed
      let maxLines = 1;
      section.cols.forEach((col) => {
        if (col.wrap) {
          const lines = String(row[col.key] ?? '').split('\n').filter(Boolean);
          maxLines = Math.max(maxLines, lines.length);
        }
      });
      const rowH = Math.max(ROW_H, maxLines * LINE_H + 3);

      checkPage(rowH + 4);
      if (ri % 2 === 0) { pdf.setFillColor(248, 250, 252); pdf.rect(margin, y, contentWidth, rowH, 'F'); }
      pdf.setDrawColor(226, 232, 240);
      pdf.rect(margin, y, contentWidth, rowH, 'S');

      let rx = margin + 2;
      section.cols.forEach((col) => {
        const val = String(row[col.key] ?? '');
        pdf.setFontSize(8);

        if (col.wrap) {
          // Multi-line: render each line separately
          pdf.setFont('helvetica', 'normal');
          pdf.setTextColor(40, 40, 40);
          const lines = val.split('\n').filter(Boolean);
          const maxChars = Math.floor(col.w / 1.8);
          lines.forEach((line, li) => {
            const display = line.length > maxChars ? line.slice(0, maxChars - 1) + '…' : line;
            pdf.text(display, rx, y + LINE_H + li * LINE_H);
          });
        } else {
          const maxChars = Math.floor(col.w / 1.8);
          const display = val.length > maxChars ? val.slice(0, maxChars - 1) + '…' : val;
          if (col.key === 'result') {
            pdf.setFont('helvetica', 'bold');
            pdf.setTextColor(...(val === 'Success' ? [22, 163, 74] : val === 'High Bugs' ? [220, 38, 38] : [100, 100, 100]));
          } else {
            pdf.setFont('helvetica', 'normal');
            pdf.setTextColor(40, 40, 40);
          }
          pdf.text(display, rx, y + 5.5);
        }
        rx += col.w;
      });
      nextLine(rowH);
    });
  });

  // Bug Log Table — grouped by BRD
  const brdsWithBugs = quarterBRDs.filter((b) => bugs.some((bug) => bug.brdId === b.id));
  if (brdsWithBugs.length > 0) {
    checkPage(30);
    nextLine(8);
    addLine('Bug Log', margin, 13, 'bold', [37, 99, 235]);
    nextLine(5);
    addLine('All bugs found this quarter, grouped by BRD', margin, 8.5, 'italic', [120, 120, 120]);
    nextLine(6);

    const BUG_COLS = [
      { key: 'no',       label: '#',         w: 7  },
      { key: 'title',    label: 'Bug Title',  w: 40 },
      { key: 'criteria', label: 'Criteria',   w: 30 },
      { key: 'severity', label: 'Severity',   w: 20 },
      { key: 'status',   label: 'Status',     w: 18 },
      { key: 'root',     label: 'Root Cause', w: 35 },
      { key: 'jira',     label: 'Jira',       w: 15 },
      { key: 'story',    label: 'Story',      w: 15 },
    ];

    brdsWithBugs.forEach((brd) => {
      const brdBugs = bugs.filter((bug) => bug.brdId === brd.id);

      checkPage(HEADER_H + ROW_H * Math.min(brdBugs.length, 2) + 16);

      // BRD sub-header
      pdf.setFillColor(226, 232, 240);
      pdf.rect(margin, y, contentWidth, 7, 'F');
      pdf.setFontSize(8.5);
      pdf.setFont('helvetica', 'bold');
      pdf.setTextColor(30, 30, 60);
      const brdTitle = brd.title.length > 80 ? brd.title.slice(0, 79) + '…' : brd.title;
      pdf.text(`BRD: ${brdTitle}`, margin + 2, y + 5);
      nextLine(7);

      // Column header row
      pdf.setFillColor(37, 99, 235);
      pdf.rect(margin, y, contentWidth, HEADER_H, 'F');
      pdf.setFontSize(7.5);
      pdf.setFont('helvetica', 'bold');
      pdf.setTextColor(255, 255, 255);
      let hx = margin + 2;
      BUG_COLS.forEach((col) => { pdf.text(col.label, hx, y + 6); hx += col.w; });
      nextLine(HEADER_H);

      // Bug rows
      brdBugs.forEach((bug, bi) => {
        checkPage(ROW_H + 4);
        if (bi % 2 === 0) { pdf.setFillColor(248, 250, 252); pdf.rect(margin, y, contentWidth, ROW_H, 'F'); }
        pdf.setDrawColor(226, 232, 240);
        pdf.rect(margin, y, contentWidth, ROW_H, 'S');

        const bugRow = {
          no: bi + 1,
          title: bug.title,
          criteria: getCriteriaLabel(criteria, bug.criteria),
          severity: getSeverityLabel(bug.severity),
          status: bug.status ? bug.status.replace('_', ' ') : '—',
          root: bug.rootCause || '—',
          jira:  bug.jiraLink    ? 'Yes' : '—',
          story: bug.storyTicket ? 'Yes' : '—',
        };

        let rx = margin + 2;
        BUG_COLS.forEach((col) => {
          const val = String(bugRow[col.key] ?? '');
          const maxChars = Math.floor(col.w / 1.7);
          const display = val.length > maxChars ? val.slice(0, maxChars - 1) + '…' : val;

          pdf.setFontSize(7.5);
          if (col.key === 'severity') {
            const sev = bug.severity;
            pdf.setFont('helvetica', 'bold');
            pdf.setTextColor(...(sev === 'critical' ? [220, 38, 38] : sev === 'high' ? [234, 88, 12] : sev === 'medium' ? [161, 98, 7] : [22, 163, 74]));
          } else if (col.key === 'criteria') {
            const criteriaObj = criteria.find((c) => c.value === bug.criteria);
            const [r, g, b] = criteriaObj?.color ? hexToRgb(criteriaObj.color) : [40, 40, 40];
            pdf.setFont('helvetica', 'bold');
            pdf.setTextColor(r, g, b);
          } else if (col.key === 'status') {
            pdf.setFont('helvetica', 'normal');
            pdf.setTextColor(...(bug.status === 'open' ? [220, 38, 38] : bug.status === 'resolved' || bug.status === 'closed' ? [22, 163, 74] : [161, 98, 7]));
          } else {
            pdf.setFont('helvetica', 'normal');
            pdf.setTextColor(40, 40, 40);
          }
          pdf.text(display, rx, y + 5.5);
          rx += col.w;
        });
        nextLine(ROW_H);
      });

      nextLine(4);
    });
  }

  // Bug Criteria Breakdown
  if (quarterBugs.length > 0) {
    checkPage(60);
    nextLine(4);
    addLine('Bug Criteria Breakdown', margin, 13, 'bold', [37, 99, 235]);
    nextLine(8);

    const criteriaCounts = {};
    quarterBugs.forEach((bug) => {
      criteriaCounts[bug.criteria] = (criteriaCounts[bug.criteria] || 0) + 1;
    });

    const maxCount = Math.max(...Object.values(criteriaCounts));
    Object.entries(criteriaCounts).forEach(([criteriaValue, count]) => {
      checkPage(12);
      const label = getCriteriaLabel(criteria, criteriaValue);
      const criteriaObj = criteria.find((c) => c.value === criteriaValue);
      const [r, g, b] = criteriaObj?.color ? hexToRgb(criteriaObj.color) : [59, 130, 246];
      const barWidth = ((count / maxCount) * (contentWidth - 60));

      pdf.setFontSize(9);
      pdf.setFont('helvetica', 'bold');
      pdf.setTextColor(r, g, b);
      pdf.text(label, margin, y + 4);

      // Light background bar (lighter shade of the color)
      const lightR = Math.round(r + (255 - r) * 0.7);
      const lightG = Math.round(g + (255 - g) * 0.7);
      const lightB = Math.round(b + (255 - b) * 0.7);
      pdf.setFillColor(lightR, lightG, lightB);
      pdf.roundedRect(margin + 55, y, barWidth, 7, 1, 1, 'F');

      // Darker filled bar
      pdf.setFillColor(r, g, b);
      pdf.roundedRect(margin + 55, y, Math.min(barWidth, 10), 7, 1, 1, 'F');

      pdf.setFontSize(9);
      pdf.setFont('helvetica', 'bold');
      pdf.setTextColor(r, g, b);
      pdf.text(String(count), margin + 57 + barWidth, y + 5);

      nextLine(10);
    });
  }

  // Footer
  const totalPages = pdf.internal.getNumberOfPages();
  for (let i = 1; i <= totalPages; i++) {
    pdf.setPage(i);
    pdf.setFontSize(8);
    pdf.setFont('helvetica', 'normal');
    pdf.setTextColor(150, 150, 150);
    pdf.text(
      `BRD Insight Report — ${quarter} ${year} | Page ${i} of ${totalPages}`,
      margin,
      pdf.internal.pageSize.getHeight() - 8
    );
  }

  pdf.save(`BRD_Report_${quarter}_${year}.pdf`);
};

export const exportChartAsPDF = async (elementId, filename) => {
  const element = document.getElementById(elementId);
  if (!element) return;
  const canvas = await html2canvas(element, { scale: 2, backgroundColor: '#ffffff' });
  const imgData = canvas.toDataURL('image/png');
  const pdf = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
  const pageWidth = pdf.internal.pageSize.getWidth();
  const pageHeight = pdf.internal.pageSize.getHeight();
  const ratio = canvas.width / canvas.height;
  const imgWidth = pageWidth - 20;
  const imgHeight = imgWidth / ratio;
  pdf.addImage(imgData, 'PNG', 10, 10, imgWidth, Math.min(imgHeight, pageHeight - 20));
  pdf.save(filename || 'chart_export.pdf');
};
