// GsCAM/gcode-parser.js
export function parseGcode(text) {
  const lines = String(text || '').split(/\r?\n/);
  const ops = [];

  let x = 0, y = 0;
  let mode = 'G00';
  let torch = false;
  let lineNo = 0;
  let leadInPending = false;
  let currentContourId = 0;
  let currentFeed = 1500; 

  for (const raw of lines) {
    lineNo++;

    const cmStart = raw.match(/\(CONTOUR-START:(\d+)\)/i);
    if (cmStart) {
      currentContourId = parseInt(cmStart[1], 10) || 0;
      continue;
    }
    const cmEnd = raw.match(/\(CONTOUR-END:(\d+)\)/i);
    if (cmEnd) {
      currentContourId = 0;
      continue;
    }

    if (/\(LEAD-IN\)/i.test(raw)) { leadInPending = true; continue; }

    let s = raw.replace(/\(.*?\)/g, '').replace(/;.*$/, '').trim();
    if (!s) continue;

    s = s.replace(/^N\d+\s+/i, '').trim();
    if (!s) continue;

    // ═══ Сначала читаем F, потом M03 ═══
    const fm = s.match(/F(-?\d+(?:\.\d+)?)/i);
    if (fm) {
      currentFeed = parseFloat(fm[1]);
    }

    if (/\bM03\b/.test(s)) { torch = true; continue; }
    if (/\bM05\b/.test(s)) { torch = false; continue; }

    const gm = s.match(/G0?([0-3])\b/i);
    if (gm) {
      const n = parseInt(gm[1], 10);
      mode = 'G0' + n;
    }

    const xm = s.match(/X(-?\d+(?:\.\d+)?)/i);
    const ym = s.match(/Y(-?\d+(?:\.\d+)?)/i);
    const im = s.match(/I(-?\d+(?:\.\d+)?)/i);
    const jm = s.match(/J(-?\d+(?:\.\d+)?)/i);

    if (mode === 'G02' || mode === 'G03') {
      if (!xm && !ym) continue;
      const nx = xm ? parseFloat(xm[1]) : x;
      const ny = ym ? parseFloat(ym[1]) : y;
      const cx = x + (im ? parseFloat(im[1]) : 0);
      const cy = y + (jm ? parseFloat(jm[1]) : 0);
      ops.push({
        type: 'arc',
        from: [x, y], to: [nx, ny], center: [cx, cy],
        ccw: mode === 'G03', torch, leadIn: leadInPending,
        contourId: currentContourId, lineNo, feed: currentFeed,
      });
      leadInPending = false;
      x = nx; y = ny;
      continue;
    }

    if (!xm && !ym) continue;
    const nx = xm ? parseFloat(xm[1]) : x;
    const ny = ym ? parseFloat(ym[1]) : y;
    ops.push({
      type: mode === 'G00' ? 'rapid' : 'cut',
      from: [x, y], to: [nx, ny],
      torch, leadIn: leadInPending, contourId: currentContourId, lineNo, feed: currentFeed,
    });
    leadInPending = false;
    x = nx; y = ny;
  }

  return ops;
}

export function segmentOps(ops, arcSteps = 24) {
  const segs = [];
  let opIdx = 0;

  for (const op of ops) {
    if (op.type === 'arc') {
      const pts = arcPoints(op, arcSteps);
      for (let i = 0; i < pts.length - 1; i++) {
        const a = pts[i], b = pts[i + 1];
        segs.push({
          type: 'cut', a, b, len: Math.hypot(b[0] - a[0], b[1] - a[1]),
          torch: op.torch, leadIn: !!op.leadIn, contourId: op.contourId || 0,
          lineNo: op.lineNo || 0, opIdx, feed: op.feed || 1500,
        });
      }
    } else {
      const a = op.from, b = op.to;
      segs.push({
        type: op.type, a, b, len: Math.hypot(b[0] - a[0], b[1] - a[1]),
        torch: op.torch, leadIn: !!op.leadIn, contourId: op.contourId || 0,
        lineNo: op.lineNo || 0, opIdx, feed: op.feed || 1500,
      });
    }
    opIdx++;
  }
  return segs;
}

function arcPoints(op, steps) {
  const [sx, sy] = op.from, [ex, ey] = op.to, [cx, cy] = op.center;
  const r = Math.hypot(sx - cx, sy - cy);
  let a1 = Math.atan2(sy - cy, sx - cx);
  let a2 = Math.atan2(ey - cy, ex - cx);
  let sweep;
  if (op.ccw) { sweep = a2 - a1; while (sweep <= 0) sweep += Math.PI * 2; }
  else        { sweep = a2 - a1; while (sweep >= 0) sweep -= Math.PI * 2; }
  const n = Math.max(4, Math.ceil(Math.abs(sweep) / (Math.PI * 2) * steps * 2));
  const pts = [];
  for (let i = 0; i <= n; i++) {
    const t = a1 + sweep * i / n;
    pts.push([cx + r * Math.cos(t), cy + r * Math.sin(t)]);
  }
  return pts;
}