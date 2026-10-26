export const state = {
  jobs: [],
  activeJobId: null,
  drag: null,
  view: null,
  draggedPartIdx: null,
  dropPreview: null,
  _dropHandled: false,
  snapGuides: null,
  snapDisabled: false,
  gridSnapMode: false,
  measureMode: false,
  measurePoints: [],
  measurements: [],
  measurePreview: null,
  groupSelectMode: false,
  groupSelectDrag: null,
  groupDrag: null,
  cutMode: false,
  cutPoints: [],
  cutPreview: null,

  duplicateMode: false,
  duplicateGhost: null,
  duplicateSource: null,
};

export function getActiveJob(){
  return state.jobs.find(j => j.id === state.activeJobId) || null;
}

function defineJobProp(key, fallbackFactory){
  Object.defineProperty(state, key, {
    get(){
      const j = getActiveJob();
      return j ? j[key] : fallbackFactory();
    },
    set(v){
      const j = getActiveJob();
      if(j) j[key] = v;
    },
    configurable: true,
    enumerable: true,
  });
}

defineJobProp('parts',         () => []);
defineJobProp('sheets',        () => []);
defineJobProp('selectedRows',  () => new Set());
defineJobProp('selectedPart',  () => null);
defineJobProp('selectedParts', () => []);

export function createJob(name){
  const id = 'job_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 6);
  const job = {
    id,
    name: name || `Задание №${state.jobs.length + 1}`,
    parts: [],
    sheets: [],
    selectedRows: new Set(),
    selectedPart: null,
    selectedParts: [],
    paramsSnapshot: null,
    createdAt: Date.now(),
  };
  state.jobs.push(job);
  if(!state.activeJobId) state.activeJobId = id;
  return job;
}

export function switchJob(id){
  if(!state.jobs.some(j => j.id === id)) return null;
  state.activeJobId = id;
  state.drag = null;
  state.measurePoints = [];
  state.measurePreview = null;
  state.measurements = [];
  state.groupSelectMode = false;
  state.groupSelectDrag = null;
  state.groupDrag = null;
  state.cutMode = false;
  state.cutPoints = [];
  state.cutPreview = null;
  state.duplicateMode = false;
  state.duplicateGhost = null;
  state.duplicateSource = null;
  return getActiveJob();
}

export function deleteJob(id){
  if(state.jobs.length <= 1) return false;
  const idx = state.jobs.findIndex(j => j.id === id);
  if(idx < 0) return false;
  state.jobs.splice(idx, 1);
  if(state.activeJobId === id) state.activeJobId = state.jobs[0].id;
  return true;
}

export function renameJob(id, name){
  const j = state.jobs.find(x => x.id === id);
  if(j) j.name = name;
}

export const DEFAULT_PARAMS = {
  sheetW:3000, sheetH:1500, thickness:6, edge:5, kerf:5, gap:2,
  rotMode:4, maxSheets:5, strategy:'all',   // ← было 'area'
  remnantOn:false, remnantMin:300,
  snapThreshold:10,
  gridStep:10,
  gridShow:false,
  sheetPolygons:null,
  afMode:'fixX', afCriterion:'area',
  afXFrom:2000, afXTo:4000, afXStep:100,
  afYFrom:500, afYTo:1000, afYStep:50,
  gaPop:16, gaGen:25, gaMut:20
};

export const HAS_OPEN_PICKER = 'showOpenFilePicker' in window;
export const HAS_SAVE_PICKER = 'showSaveFilePicker' in window;
export const FS_IDS = { open:'dxf-nesting-open-v19', save:'dxf-nesting-save-v19' };
export const PROFILES_KEY = 'raskladka.profiles.v4';
export const ACTIVE_KEY   = 'raskladka.activeProfile.v4';
export const AUTOFIT_MAX_STEPS = 30;

export const profilesStore = { profiles: [], activeId: null };

export function genId(){
  return 'p_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2,6);
}