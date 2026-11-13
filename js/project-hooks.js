// js/project-hooks.js
// Сборка/восстановление полного состояния проекта (для .dxfnest.json и автосохранения).
import { state, profilesStore, createJob } from './state.js';
import { readParams, applyParams, saveProfiles, renderProfileSelect, updateGaParamsUI, updateStockDxfUI, updateStockMiniInfo } from './params.js';
import { parseDxfText } from './dxf-import.js';
import { resetCamera, draw } from './canvas.js';
import { renderJobSelect, renderPartsTable } from './parts.js';
import { updateReport } from './report/report.js';
import { refreshPartsStatus } from './part-status.js';
import { initHistory, pushHistory } from './history.js';

function collectPartForSave(p) {
    const rec = {
        name: p.name, qty: p.qty, dxfText: p.dxfText || null,
        bbox: p.bbox || null, area: p.area || 0,
        width: p.width || 0, height: p.height || 0, length: p.length || 0,
    };
    if (!p.dxfText && Array.isArray(p.polygons)) rec.polygons = p.polygons;
    return rec;
}

function collectSheetForSave(s) {
    return {
        placed: (s.placed || []).map(pl => ({
            partIdx: pl.partIdx, polygons: pl.polygons || [],
            x: pl.x || 0, y: pl.y || 0, bbox: pl.bbox || [0, 0, 0, 0],
            _fixed: !!pl._fixed, _manual: !!pl._manual,
            _fromArray: !!pl._fromArray, _fromDuplicate: !!pl._fromDuplicate,
        })),
        cuts: Array.isArray(s.cuts) ? s.cuts.map(c => ({ ...c })) : [],
        remnants: Array.isArray(s.remnants) ? s.remnants.map(r => ({
            type: r.type, cut: { ...r.cut }, rect: { ...r.rect },
            polygon: Array.isArray(r.polygon) ? r.polygon.map(p => [p[0], p[1]]) : null,
            area: r.area || 0, w: r.w, h: r.h, _manual: !!r._manual,
        })) : null,
        obstacles: Array.isArray(s.obstacles) ? s.obstacles.map(o => ({ ...o })) : [],
    };
}

function restorePartFromSave(pd) {
    const part = {
        name: pd.name || 'part.dxf', qty: Math.max(1, +pd.qty || 1),
        dxfText: pd.dxfText || null, bbox: pd.bbox || null,
        area: pd.area || 0, width: pd.width || 0, height: pd.height || 0, length: pd.length || 0,
        polygons: Array.isArray(pd.polygons) ? pd.polygons : null,
    };
    if (part.dxfText) {
        try {
            const parsed = parseDxfText(part.dxfText, part.name);
            part.polygons = parsed.polygons;
            part.bbox = parsed.bbox || part.bbox;
            part.area = parsed.area || part.area;
            part.width = parsed.width || part.width;
            part.height = parsed.height || part.height;
            part.length = parsed.length || part.length;
        } catch (e) {
            console.warn('[ProjectIO] re-parse DXF failed:', part.name, e);
        }
    }
    if (!part.polygons) part.polygons = [];
    return part;
}

function restoreSheetFromSave(sd) {
    return {
        placed: (sd.placed || []).map(pl => ({
            partIdx: pl.partIdx, polygons: pl.polygons || [],
            x: pl.x || 0, y: pl.y || 0, bbox: pl.bbox || [0, 0, 0, 0],
            _fixed: !!pl._fixed, _manual: !!pl._manual,
            _fromArray: !!pl._fromArray, _fromDuplicate: !!pl._fromDuplicate,
        })),
        cuts: Array.isArray(sd.cuts) ? sd.cuts.map(c => ({ ...c })) : [],
        remnants: Array.isArray(sd.remnants) ? sd.remnants.map(r => ({
            type: r.type, cut: { ...r.cut }, rect: { ...r.rect },
            w: r.w, h: r.h,
            polygon: Array.isArray(r.polygon) ? r.polygon.map(p => [p[0], p[1]]) : null,
            area: r.area || 0, _manual: !!r._manual,
        })) : null,
        obstacles: Array.isArray(sd.obstacles) ? sd.obstacles.map(o => ({ ...o })) : [],
    };
}

export function collectProject() {
    let params = {};
    try { params = readParams(); } catch (e) { console.warn('readParams:', e); }
    return {
        params,
        activeProfileId: profilesStore.activeId,
        profiles: profilesStore.profiles.map(p => ({
            id: p.id, name: p.name, nameCustom: !!p.nameCustom, params: { ...(p.params || {}) },
        })),
        stockDxfText: window.stockDxfText || null,
        stockDxfName: window.stockDxfName || null,
        jobs: state.jobs.map(job => ({
            id: job.id, name: job.name,
            paramsSnapshot: job.paramsSnapshot || null,
            createdAt: job.createdAt || null,
            parts: (job.parts || []).map(collectPartForSave),
            sheets: (job.sheets || []).map(collectSheetForSave),
        })),
        activeJobId: state.activeJobId,
        measurements: (state.measurements || []).map(m => ({ a: { ...m.a }, b: { ...m.b } })),
    };
}

export async function restoreProject(s) {
    if (!s || typeof s !== 'object') return;

    if (Array.isArray(s.profiles) && s.profiles.length) {
        profilesStore.profiles = s.profiles.map(p => ({
            id: p.id || ('p_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 6)),
            name: p.name || 'Профиль',
            nameCustom: !!p.nameCustom,
            params: p.params || {},
        }));
        profilesStore.activeId = s.activeProfileId || profilesStore.profiles[0].id;
        saveProfiles();
        renderProfileSelect();
    }

    if (s.params) { try { applyParams(s.params); } catch (e) { console.warn('applyParams:', e); } }
    try { updateGaParamsUI(); } catch (_) {}
    try { updateStockDxfUI(); } catch (_) {}

    window.stockDxfText = s.stockDxfText || null;
    window.stockDxfName = s.stockDxfName || null;

    const savedJobs = Array.isArray(s.jobs) ? s.jobs : [];
    const activeIdx = s.activeJobId ? savedJobs.findIndex(j => j.id === s.activeJobId) : 0;
    state.jobs.length = 0;
    state.activeJobId = null;

    for (const jd of savedJobs) {
        const job = createJob(jd.name || 'Задание');
        job.paramsSnapshot = jd.paramsSnapshot || null;
        if (jd.createdAt) job.createdAt = jd.createdAt;
        job.parts = (jd.parts || []).map(restorePartFromSave);
        job.sheets = (jd.sheets || []).map(restoreSheetFromSave);
    }

    if (!state.jobs.length) createJob('Задание №1');
    if (activeIdx >= 0 && activeIdx < state.jobs.length) state.activeJobId = state.jobs[activeIdx].id;
    else state.activeJobId = state.jobs[0].id;

    state.measurements = (s.measurements || []).map(m => ({ a: { ...m.a }, b: { ...m.b } }));
    state.measurePoints = [];
    state.measurePreview = null;
    state.selectedPart = null;
    state.selectedParts = [];
    state.selectedRows = new Set();
    state.cutMode = false;
    state.cutPoints = [];
    state.cutPreview = null;
    state.remnantMode = false;
    state.remnantPreview = null;
    state.pendingEmptySelection = null;
    state.duplicateMode = false;
    state.duplicateGhost = null;
    state.duplicateSource = null;
    state.drag = null;
    state.groupDrag = null;
    state.groupSelectDrag = null;
    state.dropPreview = null;
    state.draggedPartIdx = null;

    resetCamera();
    renderJobSelect();
    renderPartsTable();
    try { updateReport([], '0'); } catch (_) {}
    try { refreshPartsStatus(); } catch (_) {}
    try { updateStockDxfUI(); } catch (_) {}
    try { updateStockMiniInfo(); } catch (_) {}
    draw();
    try { initHistory(); } catch (_) {}
    try { pushHistory(); } catch (_) {}
}

export function installProjectHooks() {
    window.ProjectHooks = { collect: collectProject, restore: restoreProject };
}