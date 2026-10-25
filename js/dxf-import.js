import { polysBBox, polygonArea, polysLength, chainSegments } from './geometry.js';

const M_IDENT = {a:1,b:0,c:0,d:1,e:0,f:0};
const mApply = (m,x,y) => [m.a*x + m.c*y + m.e, m.b*x + m.d*y + m.f];
function mMul(p, l){
  return {
    a: p.a*l.a + p.c*l.b,
    b: p.b*l.a + p.d*l.b,
    c: p.a*l.c + p.c*l.d,
    d: p.b*l.c + p.d*l.d,
    e: p.a*l.e + p.c*l.f + p.e,
    f: p.b*l.e + p.d*l.f + p.f
  };
}
function expandBulgeLocal(p1, p2, bulge){
  if(!bulge || Math.abs(bulge)<1e-9) return [p1, p2];
  const theta = 4 * Math.atan(bulge);
  const dx=p2[0]-p1[0], dy=p2[1]-p1[1];
  const chord = Math.hypot(dx,dy);
  if(chord<1e-9) return [p1, p2];
  const rMag = Math.abs(chord / (2*Math.sin(theta/2)));
  const mx=(p1[0]+p2[0])/2, my=(p1[1]+p2[1])/2;
  const d = (chord/2) / Math.tan(theta/2);
  const perpX = -dy/chord, perpY = dx/chord;
  const cx = mx + d*perpX, cy = my + d*perpY;
  const a1 = Math.atan2(p1[1]-cy, p1[0]-cx);
  const a2 = Math.atan2(p2[1]-cy, p2[0]-cx);
  let sweep = a2 - a1;
  if(bulge>0){ while(sweep<0) sweep+=Math.PI*2; while(sweep>Math.PI*2) sweep-=Math.PI*2; }
  else       { while(sweep>0) sweep-=Math.PI*2; while(sweep<-Math.PI*2) sweep+=Math.PI*2; }
  const n = Math.max(4, Math.ceil(Math.abs(sweep)/(Math.PI/16)));
  const pts = [];
  for(let i=1;i<=n;i++){
    const a = a1 + sweep*i/n;
    pts.push([cx + rMag*Math.cos(a), cy + rMag*Math.sin(a)]);
  }
  return [p1, ...pts];
}
function ellipseToPoints(e){
  const cx=e.center.x, cy=e.center.y;
  const maj=e.majorAxisEndPoint || {x:1,y:0};
  const majLen=Math.hypot(maj.x, maj.y);
  const minLen=majLen*(e.axisRatio!=null?e.axisRatio:1);
  const rot=Math.atan2(maj.y, maj.x);
  const cs=Math.cos(rot), sn=Math.sin(rot);
  const a1 = e.startAngle!=null ? e.startAngle : 0;
  let a2 = e.endAngle!=null ? e.endAngle : Math.PI*2;
  const isFull = (e.startAngle==null || e.endAngle==null);
  let span = isFull ? Math.PI*2 : (a2-a1);
  if(!isFull && span<=0) span += Math.PI*2;
  const N = Math.max(32, Math.ceil(span/(Math.PI/32)));
  const pts=[];
  for(let i=0;i<=N;i++){
    const t=a1+span*i/N;
    const xl=majLen*Math.cos(t), yl=minLen*Math.sin(t);
    pts.push([cx + xl*cs - yl*sn, cy + xl*sn + yl*cs]);
  }
  return pts;
}
function deBoorEval(p, U, P, t){
  const n=P.length-1;
  let k=p;
  for(let i=p;i<=n;i++){
    if(t>=U[i] && t<U[i+1]){ k=i; break; }
    if(i===n) k=n;
  }
  if(t>=U[n+1]) k=n;
  const d=[];
  for(let j=0;j<=p;j++) d[j] = {x:P[k-p+j].x, y:P[k-p+j].y};
  for(let r=1;r<=p;r++){
    for(let j=p;j>=r;j--){
      const i=k-p+j;
      const denom=U[i+p-r+1]-U[i];
      const alpha=denom>0 ? (t-U[i])/denom : 0;
      d[j]={ x:(1-alpha)*d[j-1].x + alpha*d[j].x, y:(1-alpha)*d[j-1].y + alpha*d[j].y };
    }
  }
  return d[p];
}
function splineToPoints(e){
  const cps=e.controlPoints;
  if(!cps || cps.length<2){
    if(Array.isArray(e.fitPoints) && e.fitPoints.length>=2) return e.fitPoints.map(p=>[p.x,p.y]);
    return [];
  }
  const degree = (e.degreeOfSplineCurve!=null) ? e.degreeOfSplineCurve : (e.degree!=null ? e.degree : 3);
  const knots = e.knotValues;
  if(!knots || knots.length < cps.length + degree + 1) return cps.map(p=>[p.x,p.y]);
  const n = cps.length - 1;
  const t0 = knots[degree];
  const t1 = knots[n + 1];
  const N = Math.max(24, cps.length*6);
  const out=[];
  for(let i=0;i<=N;i++){
    const t = t0 + (t1-t0)*i/N;
    const pt = deBoorEval(degree, knots, cps, t);
    out.push([pt.x, pt.y]);
  }
  return out;
}

function arcToPointsLocal(cx,cy,r,a1,a2){
  while(a2<=a1) a2+=Math.PI*2;
  const span=a2-a1;
  const n=Math.max(8, Math.ceil(span/(Math.PI/12)));
  const pts=[];
  for(let i=0;i<=n;i++){ const a=a1+span*i/n; pts.push([cx+r*Math.cos(a), cy+r*Math.sin(a)]); }
  return pts;
}

export function parseDxfText(text, name){
  if(typeof DxfParser === 'undefined') throw new Error('Библиотека dxf-parser не загрузилась.');
  const parser = new DxfParser();
  let dxf;
  try { dxf = parser.parseSync(text); }
  catch(e){ throw new Error('Ошибка разбора DXF: ' + e.message); }

  const closedRings = [];
  const segments = [];
  const blocks = dxf.blocks || {};
  const stats = { layers:{}, types:{}, skipped:{} };

  const emitSeg = (p1,p2) => segments.push({start:p1, end:p2});
  const emitRing = pts => { if(pts.length>=3) closedRings.push(pts); };

  function handleEntity(e, mat, depth){
    if(!e || !e.type) return;
    stats.types[e.type] = (stats.types[e.type]||0) + 1;
    const lname = (e.layer && String(e.layer)) || '0';
    stats.layers[lname] = (stats.layers[lname]||0) + 1;

    if(e.type==='LWPOLYLINE' || e.type==='POLYLINE'){
      if(!e.vertices || e.vertices.length<2) return;
      const v=e.vertices;
      let closed = !!(e.shape || e.closed);
      const n = v.length;

      // Если флаг closed не выставлен, но первая и последняя вершины совпадают —
      // считаем контур замкнутым. Иначе теряется последнее ребро (v[n-1] → v[0]).
      if(!closed && n >= 3){
        const f = v[0], l = v[n-1];
        const dx = f.x - l.x, dy = f.y - l.y;
        if(dx*dx + dy*dy < 0.01) closed = true;
      }

      const local=[];
      for(let i=0;i<n;i++){
        local.push([v[i].x, v[i].y]);
        const hasNext = (i+1<n) || closed;
        if(!hasNext) break;
        const bulge = v[i].bulge;
        if(bulge && Math.abs(bulge)>1e-9){
          const nv = (i+1<n) ? v[i+1] : v[0];
          const arc = expandBulgeLocal([v[i].x,v[i].y], [nv.x,nv.y], bulge);
          for(let k=1;k<arc.length;k++) local.push(arc[k]);
        }
      }
      if(closed && local.length>1){
        const f=local[0], l=local[local.length-1];
        if(Math.abs(f[0]-l[0])<1e-6 && Math.abs(f[1]-l[1])<1e-6) local.pop();
      }
      const pts = local.map(p=>mApply(mat, p[0], p[1]));
      if(closed) emitRing(pts);
      else for(let i=0;i<pts.length-1;i++) emitSeg(pts[i], pts[i+1]);
    }
    else if(e.type==='CIRCLE'){
      const N=48, pts=[];
      for(let i=0;i<N;i++){
        const a=i/N*Math.PI*2;
        pts.push(mApply(mat, e.center.x + e.radius*Math.cos(a), e.center.y + e.radius*Math.sin(a)));
      }
      emitRing(pts);
    }
    else if(e.type==='LINE' && e.vertices && e.vertices.length>=2){
      emitSeg(mApply(mat, e.vertices[0].x, e.vertices[0].y),
              mApply(mat, e.vertices[1].x, e.vertices[1].y));
    }
    else if(e.type==='ARC'){
      const local = arcToPointsLocal(e.center.x, e.center.y, e.radius, e.startAngle, e.endAngle);
      for(let i=0;i<local.length-1;i++)
        emitSeg(mApply(mat, local[i][0], local[i][1]), mApply(mat, local[i+1][0], local[i+1][1]));
    }
    else if(e.type==='ELLIPSE'){
      const local = ellipseToPoints(e);
      for(let i=0;i<local.length-1;i++)
        emitSeg(mApply(mat, local[i][0], local[i][1]), mApply(mat, local[i+1][0], local[i+1][1]));
    }
    else if(e.type==='SPLINE'){
      const local = splineToPoints(e);
      if(local.length>1){
        const pts = local.map(p=>mApply(mat, p[0], p[1]));
        if(e.closed) emitRing(pts);
        else for(let i=0;i<pts.length-1;i++) emitSeg(pts[i], pts[i+1]);
      }
    }
    else if(e.type==='INSERT' && depth<8){
      const blk = blocks[e.name];
      if(!blk || !blk.entities) return;
      const bp  = blk.position || {x:0,y:0};
      const pos = e.position   || {x:0,y:0};
      const sx  = (e.xScale!=null && isFinite(e.xScale)) ? e.xScale : 1;
      const sy  = (e.yScale!=null && isFinite(e.yScale)) ? e.yScale : 1;
      const rot = e.rotation || 0;
      const cs=Math.cos(rot), sn=Math.sin(rot);
      const a=sx*cs, b=sx*sn, c=-sy*sn, d=sy*cs;
      const e2 = pos.x - (a*bp.x + c*bp.y);
      const f2 = pos.y - (b*bp.x + d*bp.y);
      const combined = mMul(mat, {a,b,c,d,e:e2,f:f2});
      for(const ent of blk.entities) handleEntity(ent, combined, depth+1);
    }
    else { stats.skipped[e.type] = (stats.skipped[e.type]||0) + 1; }
  }

  const entities = (dxf && dxf.entities) || [];
  for(const e of entities){ try { handleEntity(e, M_IDENT, 0); } catch(_){} }

  // Сшиваем сегменты в кольца. 0.1 мм — рабочий допуск для большинства DXF.
  let allRings = [...closedRings, ...chainSegments(segments, 0.1)];

  // Fallback: если контуры не замкнулись — пробуем с большим допуском.
  if(!allRings.length && segments.length){
    allRings = chainSegments(segments, 0.3);
  }

  // Последний fallback: возвращаем открытые полилинии как псевдо-кольца,
  // чтобы деталь не потерялась полностью.
  if(!allRings.length && segments.length){
    for(const s of segments) allRings.push([s.start, s.end]);
  }

  if(!allRings.length){
    const t = Object.entries(stats.types).map(([k,v])=>k+':'+v).join(', ');
    throw new Error('В файле нет замкнутых контуров. Найдено сущностей: ' + (t || 'нет'));
  }

  const bb = polysBBox(allRings);
  const norm = allRings.map(r=>r.map(([x,y])=>[x-bb[0], y-bb[1]]));
  let outerArea=0;
  for(const r of norm){ const a=Math.abs(polygonArea(r)); if(a>outerArea) outerArea=a; }
  const length = polysLength(norm);
  return {
    name, polygons: norm,
    bbox: [0,0,bb[2]-bb[0], bb[3]-bb[1]],
    area: outerArea,
    width: bb[2]-bb[0], height: bb[3]-bb[1],
    length
  };
}