// GsCAM/sheet-to-gcode.js
import { GcodeEmitter } from './emitter.js';
import { prepareContoursForPart } from './offset.js';
import { makeTangentLeadIn } from './lead-in.js';
import { nearestNeighborOrder } from './tsp.js';
import { ringCentroid, ringArea } from './geometry-cam.js';
import { detectArcs } from './arc-detect.js';
import { state } from '../js/state.js';

function validateInputs(sheet, params, post) {
  if (!sheet || typeof sheet !== 'object') throw new Error('sheetToGcode: не передан объект листа');
  if (!Array.isArray(sheet.placed)) throw new Error('sheetToGcode: у листа нет массива placed');
  if (!params || typeof params !== 'object') throw new Error('sheetToGcode: не переданы параметры раскладки');
  if (typeof params.kerf !== 'number' || params.kerf < 0) throw new Error(`sheetToGcode: некорректный kerf (${params.kerf})`);
  if (!post || !post.header || !post.torchOn || !post.torchOff || !post.footer) throw new Error('sheetToGcode: некорректный постпроцессор');
}

export function sheetToGcode(sheet, params, post, ctx, options = {}) {
  validateInputs(sheet, params, post);

  const {
    leadInRadius = 1.28, useTsp = true, cutCw = true,
    entryMode = 'lowest', useArcs = false,
    arcTolerance = 0.15, arcMinAngle = 0.15, arcMaxRadius = 2000,
    partByPart = false,
    cutFeed = null,
    bridgesEnabled = false, bridgeLength = 4, bridgeCount = 2,
    slowPierceHoles = false, // <--- 
    slowPiercePercent = 40,  // <--- НОВЫЙ ПАРАМЕТР (по умолчанию 40%)
  } = options;

  const e = new GcodeEmitter(post);
  e.header(ctx);
  e.partComment(ctx);

  const arcOpts = { tolerance: arcTolerance, minArcAngle: arcMinAngle, maxRadius: arcMaxRadius };

  const currentFeed = (cutFeed != null && cutFeed > 0)
    ? cutFeed
    : (post.getCutFeed ? post.getCutFeed(params.thickness) : (post.defaults?.cutFeed || 1500));

  const emitOpts = { 
    leadInRadius, entryMode, cutCw, useArcs, arcOpts, feedRate: currentFeed,
    bridgesEnabled, bridgeLength, bridgeCount,
    slowPierceHoles, slowPiercePercent, // <--- ПЕРЕДАЕМ ДАЛЬШЕ
  };

  const layersMap = new Map();
  for (const l of (state && state.layers ? state.layers : [])) {
    layersMap.set(l.id, { layerDef: l, parts: [], cuts: [] });
  }
  if (!layersMap.has(1)) layersMap.set(1, { layerDef: { id: 1, name: 'Детали', order: 1 }, parts: [], cuts: [] });

  for (let plIdx = 0; plIdx < sheet.placed.length; plIdx++) {
    const pl = sheet.placed[plIdx];
    if (!pl || !Array.isArray(pl.polygons) || !pl.polygons.length) continue;
    
    const lid = pl.layerId || 1;
    const layerDef = state.layers.find(l => l.id === lid);
    if (layerDef && layerDef.visible === false) continue;

    if (!layersMap.has(lid)) layersMap.set(lid, { layerDef: { id: lid, name: `Слой ${lid}`, order: lid }, parts: [], cuts: [] });
    layersMap.get(lid).parts.push(pl);
  }

  const cutLayerId = 2;
  if (!layersMap.has(cutLayerId)) layersMap.set(cutLayerId, { layerDef: { id: cutLayerId, name: 'Рез остатка', order: 2 }, parts: [], cuts: [] });
  if (sheet.cuts) layersMap.get(cutLayerId).cuts.push(...sheet.cuts);
  if (sheet.remnants) {
    for (const r of sheet.remnants) {
      if (r.cut) layersMap.get(cutLayerId).cuts.push(r.cut);
    }
  }

  const sortedLayers = [...layersMap.values()].sort((a, b) => {
    const orderA = a.layerDef.order !== undefined ? a.layerDef.order : a.layerDef.id;
    const orderB = b.layerDef.order !== undefined ? b.layerDef.order : b.layerDef.id;
    return orderA - orderB;
  });

  for (const layer of sortedLayers) {
    if (layer.parts.length === 0 && layer.cuts.length === 0) continue;

    const layerParts = [];
    for (const pl of layer.parts) {
      try {
        const contours = prepareContoursForPart(pl, params);
        if (!contours.length) continue;
        
        const partContours = {
          plIdx: sheet.placed.indexOf(pl),
          holes: [], outers: [],
          centroid: [pl.x + (pl.bbox[2] - pl.bbox[0]) / 2, pl.y + (pl.bbox[3] - pl.bbox[1]) / 2],
        };

        for (const c of contours) {
          if (!c.ring || c.ring.length < 3) continue;
          const item = { ring: c.ring, isOuter: c.isOuter, centroid: ringCentroid(c.ring), orient: ringArea(c.ring) > 0 ? +1 : -1 };
          if (c.isOuter) partContours.outers.push(item);
          else partContours.holes.push(item);
        }
        if (partContours.outers.length) layerParts.push(partContours);
      } catch (err) {
        console.warn(`[sheetToGcode] ошибка контура:`, err);
      }
    }

    let orderedParts = [];
    
    const sortedParts = [...layer.parts].sort((a, b) => {
      const ordA = a._cutOrder || 9999;
      const ordB = b._cutOrder || 9999;
      return ordA - ordB;
    });

    for (const pl of sortedParts) {
      const idx = sheet.placed.indexOf(pl);
      const op = layerParts.find(p => p.plIdx === idx);
      if (op) orderedParts.push(op);
    }

    if (partByPart) {
      for (const part of orderedParts) {
        const holeOrder = useTsp ? nearestNeighborOrder(part.holes.map(h => h.centroid)).map(i => part.holes[i]) : part.holes;
        for (const c of holeOrder) emitContour(e, c, emitOpts);
        const outerOrder = useTsp ? nearestNeighborOrder(part.outers.map(o => o.centroid)).map(i => part.outers[i]) : part.outers;
        for (const c of outerOrder) emitContour(e, c, emitOpts);
      }
    } else {
      const allHoles = orderedParts.flatMap(p => p.holes);
      const allOuters = orderedParts.flatMap(p => p.outers);
      let orderedHoles = allHoles, orderedOuters = allOuters;
      if (useTsp) {
        orderedHoles = nearestNeighborOrder(allHoles.map(h => h.centroid)).map(i => allHoles[i]);
        orderedOuters = nearestNeighborOrder(allOuters.map(o => o.centroid)).map(i => allOuters[i]);
      }
      for (const c of orderedHoles) emitContour(e, c, emitOpts);
      for (const c of orderedOuters) emitContour(e, c, emitOpts);
    }

    if (layer.cuts.length > 0) {
      for (const c of layer.cuts) {
        if (Math.hypot(c.x2 - c.x1, c.y2 - c.y1) < 1e-3) continue;
        const cid = e.contourStart();
        e.rapid(c.x1, c.y1);
        e.torchOn(emitOpts.feedRate);
        e.move(c.x2, c.y2);
        e.torchOff();
        e.contourEnd(cid);
      }
    }
  }

  e.footer();
  return e.toString();
}

function emitContour(e, c, emitOpts) {
  const { 
    leadInRadius, entryMode, cutCw, useArcs, arcOpts, feedRate, 
    slowPierceHoles, slowPiercePercent 
  } = emitOpts;
  
  if (!c.ring || c.ring.length < 3) return;

  const lead = makeTangentLeadIn(c.ring, { leadInRadius, entryMode, isOuter: c.isOuter, cw: cutCw });
  if (!lead) return;

  const cid = e.contourStart();

  // ═══ ЛОГИКА МЕДЛЕННОГО ВРЕЗА ДЛЯ ОТВЕРСТИЙ ═══
  // Если это не внешний контур (отверстие) и опция включена — снижаем подачу
  let pierceFeed = feedRate;
  if (!c.isOuter && slowPierceHoles) {
    const factor = Math.max(5, Math.min(100, slowPiercePercent)) / 100;
    pierceFeed = feedRate * factor;
  }

  e.rapid(lead.start[0], lead.start[1]);
  e.torchOn(pierceFeed);
  e.leadInStart();
  e.arc(lead.center[0], lead.center[1], lead.end[0], lead.end[1], lead.arcCcw);

  // Если подача была снижена, возвращаем нормальную скорость после вреза
  if (Math.abs(pierceFeed - feedRate) > 1e-3) {
    e.numbered(`F${e.fmt(feedRate)}`);
  }

  if (useArcs) {
    emitContourWithArcs(e, c.ring, lead, arcOpts, emitOpts);
  } else {
    emitContourLines(e, c.ring, lead, emitOpts);
  }

  e.torchOff();
  e.contourEnd(cid);
}

function emitContourWithArcs(e, ring, lead, arcOpts, emitOpts) {
  const N = ring.length;
  const segments = detectArcs(ring, arcOpts);
  if (!segments.length) { emitContourLines(e, ring, lead, emitOpts); return; }

  const startIdx = lead.entryType === 'edge' ? lead.startVertexIdx : lead.entryIndex;
  let startSegIdx = -1;
  for (let k = 0; k < segments.length; k++) {
    const seg = segments[k];
    for (let off = 0; off < seg.length; off++) {
      if ((seg.startIdx + off) % N === startIdx) { startSegIdx = k; break; }
    }
    if (startSegIdx >= 0) break;
  }
  if (startSegIdx < 0) startSegIdx = 0;

  const firstSeg = segments[startSegIdx];
  const isFirstFull = firstSeg.startIdx === startIdx;

  if (isFirstFull && firstSeg.type === 'arc' && lead.entryType === 'vertex' && firstSeg.startIdx === lead.entryIndex) {
    e.arc(firstSeg.center[0], firstSeg.center[1], ring[firstSeg.endIdx][0], ring[firstSeg.endIdx][1], firstSeg.ccw);
  } else {
    e.move(ring[firstSeg.endIdx][0], ring[firstSeg.endIdx][1]);
  }

  let k = (startSegIdx + 1) % segments.length;
  let guard = 0;
  while (k !== startSegIdx && guard < segments.length * 2) {
    guard++;
    const seg = segments[k];
    if (seg.type === 'arc') {
      e.arc(seg.center[0], seg.center[1], ring[seg.endIdx][0], ring[seg.endIdx][1], seg.ccw);
    } else {
      e.move(ring[seg.endIdx][0], ring[seg.endIdx][1]);
    }
    k = (k + 1) % segments.length;
  }

  const closePt = lead.entryType === 'edge' ? lead.end : ring[lead.entryIndex];
  const lastX = e._lastXnum ?? 0;
  const lastY = e._lastYnum ?? 0;
  if (Math.hypot(closePt[0] - lastX, closePt[1] - lastY) > 1e-6) {
    e.move(closePt[0], closePt[1]);
  }
}

function emitContourLines(e, ring, lead, emitOpts) {
  const N = ring.length;
  const { bridgesEnabled, bridgeLength, bridgeCount, feedRate } = emitOpts;

  let perim = 0;
  for (let i = 1; i < N; i++) {
    perim += Math.hypot(ring[i][0] - ring[i-1][0], ring[i][1] - ring[i-1][1]);
  }
  perim += Math.hypot(ring[0][0] - ring[N-1][0], ring[0][1] - ring[N-1][1]);

  let bridges = [];
  if (bridgesEnabled && perim > 30) {
    const step = perim / bridgeCount;
    for (let i = 0; i < bridgeCount; i++) {
      const center = i * step + step / 2;
      let start = center - bridgeLength / 2;
      let end = center + bridgeLength / 2;
      
      if (start < 0) { start += perim; end += perim; }
      if (end > perim) {
         bridges.push({ start: start, end: perim });
         bridges.push({ start: 0, end: end - perim });
      } else {
         bridges.push({ start, end });
      }
    }
    bridges.sort((a, b) => a.start - b.start);
  }

  function getIdx(k) {
    if (lead.entryType === 'edge') {
      const firstIdx = lead.walkDir > 0 ? lead.endVertexIdx : lead.startVertexIdx;
      return (firstIdx + k * lead.walkDir + N * 1000) % N;
    } else {
      return (lead.entryIndex + k * lead.walkDir + N * 1000) % N;
    }
  }

  const interp = (px, py, cx, cy, t) => [px + (cx - px) * t, py + (cy - py) * t];

  let accLen = 0;
  const firstIdx = getIdx(0);
  e.move(ring[firstIdx][0], ring[firstIdx][1]);

  for (let k = 1; k <= N; k++) {
    const prevIdx = getIdx(k - 1);
    const curIdx = getIdx(k);
    const px = ring[prevIdx][0], py = ring[prevIdx][1];
    const cx = ring[curIdx][0], cy = ring[curIdx][1];
    
    const segLen = Math.hypot(cx - px, cy - py);
    if (segLen < 1e-6) continue;

    let t0 = accLen;
    let t1 = accLen + segLen;
    let currentT = t0;

    for (const b of bridges) {
      if (b.end <= currentT || b.start >= t1) continue;

      let cutEndT = Math.max(currentT, b.start);
      if (cutEndT > currentT + 1e-4) {
         const [ex, ey] = interp(px, py, cx, cy, (cutEndT - t0) / segLen);
         e.move(ex, ey);
      }

      let rapidEndT = Math.min(t1, b.end);
      if (rapidEndT > cutEndT + 1e-4) {
         e.torchOff();
         const [rx, ry] = interp(px, py, cx, cy, (rapidEndT - t0) / segLen);
         e.rapid(rx, ry);
         e.torchOn(feedRate);
      }
      currentT = Math.max(currentT, rapidEndT);
    }

    if (currentT < t1 - 1e-4) {
      e.move(cx, cy);
    }

    accLen = t1;
  }

  const closePt = lead.entryType === 'edge' ? lead.end : ring[lead.entryIndex];
  const lastX = e._lastXnum ?? 0;
  const lastY = e._lastYnum ?? 0;
  if (Math.hypot(closePt[0] - lastX, closePt[1] - lastY) > 1e-6) {
    e.move(closePt[0], closePt[1]);
  }
}