export function ringBBox(ring){
  let a=Infinity,b=Infinity,c=-Infinity,d=-Infinity;
  for(const [x,y] of ring){ if(x<a)a=x; if(x>c)c=x; if(y<b)b=y; if(y>d)d=y; }
  return [a,b,c,d];
}
export function polysBBox(polys){
  let a=Infinity,b=Infinity,c=-Infinity,d=-Infinity;
  for(const r of polys) for(const [x,y] of r){ if(x<a)a=x; if(x>c)c=x; if(y<b)b=y; if(y>d)d=y; }
  return [a,b,c,d];
}
export function polygonArea(pts){
  let a=0; for(let i=0,j=pts.length-1;i<pts.length;j=i++) a += pts[j][0]*pts[i][1] - pts[i][0]*pts[j][1];
  return a/2;
}
export function ringLength(ring){
  let L=0; const n=ring.length;
  for(let i=0;i<n-1;i++){ const dx=ring[i+1][0]-ring[i][0], dy=ring[i+1][1]-ring[i][1]; L+=Math.hypot(dx,dy); }
  if(n>1){ const dx=ring[0][0]-ring[n-1][0], dy=ring[0][1]-ring[n-1][1]; L+=Math.hypot(dx,dy); }
  return L;
}
export function polysLength(polys){ let L=0; for(const r of polys) L+=ringLength(r); return L; }

function cross(o,a,b){ return (a[0]-o[0])*(b[1]-o[1]) - (a[1]-o[1])*(b[0]-o[0]); }
function onSeg(a,b,p){
  return Math.min(a[0],b[0])<=p[0] && p[0]<=Math.max(a[0],b[0]) &&
         Math.min(a[1],b[1])<=p[1] && p[1]<=Math.max(a[1],b[1]);
}
function pointSegDist(p,a,b){
  const dx=b[0]-a[0], dy=b[1]-a[1]; const len2=dx*dx+dy*dy;
  if(len2<1e-12) return Math.hypot(p[0]-a[0],p[1]-a[1]);
  let t=((p[0]-a[0])*dx+(p[1]-a[1])*dy)/len2;
  if(t<0)t=0; else if(t>1)t=1;
  return Math.hypot(p[0]-(a[0]+t*dx), p[1]-(a[1]+t*dy));
}
export function pointInRing(p, ring){
  let inside=false; const n=ring.length;
  for(let i=0,j=n-1;i<n;j=i++){
    const xi=ring[i][0], yi=ring[i][1], xj=ring[j][0], yj=ring[j][1];
    if(((yi>p[1])!==(yj>p[1])) && (p[0] < (xj-xi)*(p[1]-yi)/(yj-yi)+xi)) inside=!inside;
  }
  return inside;
}
function ringsCollide(ra, rb, buffer){
  const na=ra.length, nb=rb.length;
  for(let i=0;i<na;i++){
    const a1=ra[i], a2=ra[(i+1)%na];
    for(let j=0;j<nb;j++){
      const b1=rb[j], b2=rb[(j+1)%nb];
      const D1=cross(b1,b2,a1), D2=cross(b1,b2,a2), D3=cross(a1,a2,b1), D4=cross(a1,a2,b2);
      if(((D1>0&&D2<0)||(D1<0&&D2>0)) && ((D3>0&&D4<0)||(D3<0&&D4>0))) return true;
      if(D1===0&&onSeg(b1,b2,a1)) return true;
      if(D2===0&&onSeg(b1,b2,a2)) return true;
      if(D3===0&&onSeg(a1,a2,b1)) return true;
      if(D4===0&&onSeg(a1,a2,b2)) return true;
      const d=Math.min(
        pointSegDist(a1,b1,b2), pointSegDist(a2,b1,b2),
        pointSegDist(b1,a1,a2), pointSegDist(b2,a1,a2)
      );
      if(d<buffer) return true;
    }
  }
  if(pointInRing(ra[0], rb)) return true;
  if(pointInRing(rb[0], ra)) return true;
  return false;
}
export function polysCollide(A, B, buffer){
  for(const a of A){
    const aBB=ringBBox(a);
    for(const b of B){
      const bBB=ringBBox(b);
      if(aBB[0]-buffer>bBB[2]) continue;
      if(aBB[2]+buffer<bBB[0]) continue;
      if(aBB[1]-buffer>bBB[3]) continue;
      if(aBB[3]+buffer<bBB[1]) continue;
      if(ringsCollide(a,b,buffer)) return true;
    }
  }
  return false;
}
export function normalizeRings(rings){
  const bb=polysBBox(rings);
  const norm=rings.map(r=>r.map(([x,y])=>[x-bb[0],y-bb[1]]));
  return { polygons:norm, w:bb[2]-bb[0], h:bb[3]-bb[1] };
}
export function rotatePart(part, deg){
  if(deg===0) return normalizeRings(part.polygons);
  const a=deg*Math.PI/180, c=Math.cos(a), s=Math.sin(a);
  const rotated=part.polygons.map(ring=>ring.map(([x,y])=>[x*c-y*s, x*s+y*c]));
  return normalizeRings(rotated);
}
export function arcToPoints(cx,cy,r,a1,a2){
  while(a2<=a1) a2+=Math.PI*2;
  const span=a2-a1;
  const n=Math.max(8, Math.ceil(span/(Math.PI/12)));
  const pts=[];
  for(let i=0;i<=n;i++){ const a=a1+span*i/n; pts.push([cx+r*Math.cos(a), cy+r*Math.sin(a)]); }
  return pts;
}

export function chainSegments(segments, tolerance){
  if(!segments || !segments.length) return [];
  const tol      = Math.max(tolerance || 0.05, 1e-4);
  const snapTol  = tol * 3;
  const closeTol = tol * 10;

  const N = segments.length;

  const allPts = new Array(N * 2);
  for(let i = 0; i < N; i++){
    allPts[i*2]     = segments[i].start;
    allPts[i*2 + 1] = segments[i].end;
  }

  const parent = allPts.map((_, i) => i);
  function find(i){
    while(parent[i] !== i){ parent[i] = parent[parent[i]]; i = parent[i]; }
    return i;
  }
  function union(a, b){
    const ra = find(a), rb = find(b);
    if(ra !== rb) parent[ra] = rb;
  }

  const cellSize = snapTol;
  const grid = new Map();
  const ckey = (cx, cy) => cx + ':' + cy;
  for(let i = 0; i < allPts.length; i++){
    const [x, y] = allPts[i];
    const cx = Math.floor(x / cellSize), cy = Math.floor(y / cellSize);
    const k = ckey(cx, cy);
    if(!grid.has(k)) grid.set(k, []);
    grid.get(k).push(i);
  }

  for(let i = 0; i < allPts.length; i++){
    const [x, y] = allPts[i];
    const cx = Math.floor(x / cellSize), cy = Math.floor(y / cellSize);
    for(let dx = -1; dx <= 1; dx++){
      for(let dy = -1; dy <= 1; dy++){
        const lst = grid.get(ckey(cx+dx, cy+dy));
        if(!lst) continue;
        for(const j of lst){
          if(j <= i) continue;
          const dx2 = x - allPts[j][0], dy2 = y - allPts[j][1];
          if(dx2*dx2 + dy2*dy2 <= snapTol * snapTol) union(i, j);
        }
      }
    }
  }

  const startRoot = new Array(N);
  const endRoot   = new Array(N);
  for(let i = 0; i < N; i++){
    startRoot[i] = find(i*2);
    endRoot[i]   = find(i*2 + 1);
  }

  const clusterMembers = new Map();
  function addMember(root, segIdx, end){
    if(!clusterMembers.has(root)) clusterMembers.set(root, []);
    clusterMembers.get(root).push({ segIdx, end });
  }
  for(let i = 0; i < N; i++){
    addMember(startRoot[i], i, 'start');
    addMember(endRoot[i],   i, 'end');
  }

  const used = new Array(N).fill(false);
  const rings = [];

  for(let s0 = 0; s0 < N; s0++){
    if(used[s0]) continue;
    used[s0] = true;

    let headRoot = startRoot[s0];
    let tailRoot = endRoot[s0];
    const chain = [segments[s0].start, segments[s0].end];

    let extended = true;
    while(extended){
      extended = false;

      const tailList = clusterMembers.get(tailRoot) || [];
      for(const m of tailList){
        if(used[m.segIdx]) continue;
        if(m.end === 'end'){
          used[m.segIdx] = true;
          chain.push(segments[m.segIdx].start);
          tailRoot = startRoot[m.segIdx];
        } else {
          used[m.segIdx] = true;
          chain.push(segments[m.segIdx].end);
          tailRoot = endRoot[m.segIdx];
        }
        extended = true;
        break;
      }
      if(extended) continue;

      const headList = clusterMembers.get(headRoot) || [];
      for(const m of headList){
        if(used[m.segIdx]) continue;
        if(m.end === 'end'){
          used[m.segIdx] = true;
          chain.unshift(segments[m.segIdx].start);
          headRoot = startRoot[m.segIdx];
        } else {
          used[m.segIdx] = true;
          chain.unshift(segments[m.segIdx].end);
          headRoot = endRoot[m.segIdx];
        }
        extended = true;
        break;
      }
    }

    if(chain.length >= 4){
      const f = chain[0], l = chain[chain.length - 1];
      const dx = f[0] - l[0], dy = f[1] - l[1];
      if(dx*dx + dy*dy <= closeTol * closeTol){
        const cleaned = [chain[0]];
        for(let i = 1; i < chain.length; i++){
          const prev = cleaned[cleaned.length - 1];
          const cur = chain[i];
          const ddx = cur[0] - prev[0], ddy = cur[1] - prev[1];
          if(ddx*ddx + ddy*ddy > 1e-9) cleaned.push(cur);
        }
        if(cleaned.length >= 2){
          const a = cleaned[0], b = cleaned[cleaned.length - 1];
          const ddx = a[0] - b[0], ddy = a[1] - b[1];
          if(ddx*ddx + ddy*ddy <= closeTol * closeTol) cleaned.pop();
        }
        if(cleaned.length >= 3) rings.push(cleaned);
      }
    }
  }

  return rings;
}

// ============================================================
// Проверка: все ли контуры детали лежат внутри контура листа
// ============================================================
function _segSegIntersect(p1,p2,p3,p4){
  const d1=cross(p3,p4,p1), d2=cross(p3,p4,p2);
  const d3=cross(p1,p2,p3), d4=cross(p1,p2,p4);
  if(((d1>0&&d2<0)||(d1<0&&d2>0)) && ((d3>0&&d4<0)||(d3<0&&d4>0))) return true;
  if(d1===0&&onSeg(p3,p4,p1)) return true;
  if(d2===0&&onSeg(p3,p4,p2)) return true;
  if(d3===0&&onSeg(p1,p2,p3)) return true;
  if(d4===0&&onSeg(p1,p2,p4)) return true;
  return false;
}

export function ringsIntersect(r1, r2){
  for(let i=0;i<r1.length;i++){
    const a1=r1[i], a2=r1[(i+1)%r1.length];
    for(let j=0;j<r2.length;j++){
      const b1=r2[j], b2=r2[(j+1)%r2.length];
      if(_segSegIntersect(a1,a2,b1,b2)) return true;
    }
  }
  return false;
}

function _pointRingDist(p, ring){
  let m = Infinity;
  for(let i=0;i<ring.length;i++){
    const d = pointSegDist(p, ring[i], ring[(i+1)%ring.length]);
    if(d < m) m = d;
  }
  return m;
}

export function isPartInsideSheetPolygon(partAbsPolys, sheetPolys, edge){
  if(!sheetPolys || !sheetPolys.length) return true;

  let outerIdx = 0, bestArea = -1;
  for(let i=0;i<sheetPolys.length;i++){
    const a = Math.abs(polygonArea(sheetPolys[i]));
    if(a > bestArea){ bestArea = a; outerIdx = i; }
  }
  const outer = sheetPolys[outerIdx];
  const holes = sheetPolys.filter((_, i) => i !== outerIdx);

  // Допуск для компенсации погрешности вычислений
  const tol = edge > 0 ? Math.min(0.05, edge * 0.02) : 0;

  for(const ring of partAbsPolys){
    for(const [x,y] of ring){
      const pt = [x,y];
      if(!pointInRing(pt, outer)) return false;
      for(const h of holes) if(pointInRing(pt, h)) return false;
      if(edge > 0){
        if(_pointRingDist(pt, outer) < edge - tol) return false;
        for(const h of holes) if(_pointRingDist(pt, h) < edge - tol) return false;
      }
    }
  }

  for(const ring of partAbsPolys){
    if(ringsIntersect(ring, outer)) return false;
    for(const h of holes) if(ringsIntersect(ring, h)) return false;
  }

  return true;
}