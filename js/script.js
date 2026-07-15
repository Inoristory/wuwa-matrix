// ==================== POLYFILL ====================
if (typeof requestIdleCallback !== 'function') {
  self.requestIdleCallback = function(cb) {
    const start = Date.now();
    return setTimeout(function() {
      cb({ didTimeout: false, timeRemaining: function() { return Math.max(0, 50 - (Date.now() - start)); } });
    }, 1);
  };
  self.cancelIdleCallback = function(id) { clearTimeout(id); };
}

// ==================== LOAD DATA ====================
let ALL_CHARACTERS = [];
let DEFAULT_MAX_USES = {};
let NANOKA_IDS = {};
let LOCAL_IMAGES = {};
let ELEMENT_ORDER, ELEMENT_ICONS, ELEMENT_LABELS, GROUP_ORDER, GROUP_CONFIG_MAP, DEFAULT_GROUP_CFG, EXTRA_PINYIN;

function applyData(data) {
  ALL_CHARACTERS = data.characters || [];
  DEFAULT_MAX_USES = data.defaultMaxUses || {};
  NANOKA_IDS = data.nanokaIds || {};
  LOCAL_IMAGES = data.localImages || {};
  ELEMENT_ORDER = data.elementOrder;
  ELEMENT_ICONS = data.elementIcons || {};
  ELEMENT_LABELS = data.elementLabels || {};
  GROUP_ORDER = data.groupOrder;
  GROUP_CONFIG_MAP = {};
  if (data.groupConfig) {
    for (const [key, cfg] of Object.entries(data.groupConfig)) {
      GROUP_CONFIG_MAP[key] = { key, label: cfg.label, color: cfg.style };
    }
  }
  DEFAULT_GROUP_CFG = GROUP_CONFIG_MAP.limited;
  EXTRA_PINYIN = data.extraPinyin || {};
}

applyData(self.WUWA_CHARACTER_DATA);

async function loadCharacterData() {
  const data = await WUWA_DATA_LOADER.load();
  applyData(data);
  if (!WUWA_DATA_LOADER.validate(data)) throw new Error('invalid character data');
}

/**
 * 从角色 ID 中自动提取拼音音节（用于拼音搜索）。
 * 例如 "xiangliyao" → ["xiang", "li", "yao"]
 */
function splitPinyin(id) {
  const result = [];
  let cur = '';
  for (let i = 0; i < id.length; i++) {
    const c = id[i];
    const next = id[i + 1];
    if ((c === 'z' && next === 'h') || (c === 'c' && next === 'h') || (c === 's' && next === 'h')) {
      if (cur) result.push(cur);
      cur = c + next;
      i++;
    } else if (/[bcdfghjklmnpqrstvwxyz]/.test(c)) {
      if (cur) result.push(cur);
      cur = c;
    } else {
      cur += c;
    }
  }
  if (cur) result.push(cur);
  return result;
}

// Derived data (built after load)
let CHAR_MAP;
const roverUtils = {
  ids: null,
  forms: null,
  baseId: 'rover',
  belongs(id) { return this.ids ? this.ids.has(id) : false; },
  isBase(id) { return id === this.baseId; },
  isForm(id) { return this.belongs(id) && !this.isBase(id); },
  isMain(id) { return !this.belongs(id) || this.isBase(id); },
  iconsHtml() {
    if (!this.forms) return '';
    return this.forms.map(f => elementIconHtml(f.element)).join('<span style="display:inline-block;width:2px"></span>');
  },
  labelHtml(ch) {
    return {
      iconHtml: this.isBase(ch.id) ? this.iconsHtml() : elementIconHtml(ch.element),
      name: this.isBase(ch.id) ? '漂泊者' : ch.name,
    };
  },
};
let SEARCH_INDEX;
let NAME_TO_PINYIN;

// --- 游戏规则常量 ---
const MAX_PER_TEAM = 3;
const CURRENT_VERSION_CHARACTER_IDS = new Set(['suisui', 'sp_yangyang']);
const MIN_USES = 1;
const MAX_USES = 3;
const COLLAPSED_DEFAULT = ['beta', 'satellite'];

// --- 交互常量 ---
const DOUBLE_TAP_MS = 400;
const LONG_PRESS_MS = 180;
const DRAG_THRESHOLD = 8;
const SEARCH_DELAY_POOL = 150;
const SEARCH_DELAY_MGMT = 100;
const TOAST_DURATION = 3000;
const EDGE_SCROLL_THRESHOLD = 30;
const EDGE_SCROLL_SPEED = 8;
const MAX_TEAM_NAME_LENGTH = 32;

// --- 存储常量 ---
const STORAGE_KEY = 'wuwa_matrix_v3';
const DATA_VERSION = 3;
let _stateNeedsPersist = false;
const IDS = {
  poolGrid: 'pool-grid', poolEmpty: 'pool-empty', poolCount: 'pool-count',
  teamsList: 'teams-list', teamsCount: 'teams-count', teamsEmpty: 'teams-empty',
  statsText: 'stats-text', toast: 'toast', poolSection: 'pool-section',
  addTeamBtn: 'add-team-btn', poolSearch: 'pool-search', filterBtns: 'filter-btns',
  mgmtToolbarArea: 'mgmt-toolbar-area', mgmtGrid: 'mgmt-grid',
  mgmtModal: 'mgmt-modal', mgmtModalStats: 'mgmt-modal-stats',
  customizeGrid: 'customize-grid', customizeModal: 'customize-modal',
  poolEmptyText: 'pool-empty-text',
  btnMgmt: 'btn-mgmt', btnCustomize: 'btn-customize',
  btnExport: 'btn-export', btnImport: 'btn-import', btnReset: 'btn-reset',
  actionsMenu: 'actions-menu',
  btnMgmtClose: 'btn-mgmt-close', btnMgmtCloseX: 'btn-mgmt-close-x',
  btnCustomizeClose: 'btn-customize-close', btnCustomizeCloseX: 'btn-customize-close-x',
  themeToggle: 'theme-toggle',
  btnLayoutToggle: 'btn-layout-toggle',
  btnHide: 'btn-hide',
  saveIndicator: 'save-indicator',
  teamsSection: 'teams-section',
};

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, ch => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[ch]));
}

function elementIconHtml(element) {
  const id = ELEMENT_ICONS[element];
  if (!id) return '';
  return `<img class="char-element" src="https://wuthering.wiki/img/element_${id}.png" alt="${element}" loading="lazy" decoding="async">`;
}



const _iconUrlCache = new Map();

function getIconUrl(ch) {
  let url = _iconUrlCache.get(ch.id);
  if (url !== undefined) return url;
  const cdnId = NANOKA_IDS[ch.id];
  if (cdnId) url = `https://static.nanoka.cc/assets/ww/UIResources/Common/Image/IconRoleHead256/T_IconRoleHead256_${cdnId}_UI.webp`;
  else url = LOCAL_IMAGES[ch.id] || null;
  _iconUrlCache.set(ch.id, url);
  return url;
}

function charIconHtml(ch) {
  const url = getIconUrl(ch);
  const placeholder = `<span class="char-placeholder ${ch.element}"></span>`;
  const img = url ? `<img class="char-icon-img" src="${url}" alt="${escapeHtml(ch.name)}" loading="lazy" decoding="async" onerror="this.style.display='none'">` : '';
  return `<span class="char-icon-wrap">${placeholder}${img}</span>`;
}



function getCharName(id) {
  const ch = CHAR_MAP.get(id);
  return ch ? ch.name : id;
}

function getGroup(ch) { return ch.rarity || 'limited'; }

function getGroupCfg(key) { return GROUP_CONFIG_MAP[key] || DEFAULT_GROUP_CFG; }

let _groupedChars = null;
function buildGroupedCharacters() {
  if (_groupedChars) return _groupedChars;
  const groups = { limited: [], standard: [], rover: [], beta: [], satellite: [], four: [] };
  for (const ch of ALL_CHARACTERS) {
    if (roverUtils.isForm(ch.id)) continue;
    groups[getGroup(ch)].push(ch);
  }
  _groupedChars = groups;
  return groups;
}

function createFilterBar(container, filterSet, onChange) {
  const allBtn = document.createElement('button');
  allBtn.className = 'filter-btn active';
  allBtn.innerHTML = '<span class="filter-all-text">全</span>';
  allBtn.setAttribute('aria-label', '全部属性');
  allBtn.addEventListener('click', () => {
    container.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
    allBtn.classList.add('active');
    filterSet.clear();
    onChange();
  });
  container.appendChild(allBtn);
  for (const el of ELEMENT_ORDER) {
    const btn = document.createElement('button');
    btn.className = 'filter-btn';
    btn.dataset.element = el;
    btn.innerHTML = elementIconHtml(el);
    btn.setAttribute('aria-label', ELEMENT_LABELS[el] || el);
    btn.addEventListener('click', () => {
      if (filterSet.has(el)) {
        filterSet.delete(el);
        btn.classList.remove('active');
      } else {
        filterSet.add(el);
        btn.classList.add('active');
      }
      allBtn.classList.toggle('active', filterSet.size === 0);
      onChange();
    });
    container.appendChild(btn);
  }
}

function getPoolEmptyMsg() {
  const ownedTotal = getOwnedCount();
  if (ownedTotal === 0) return '暂无显示角色，请先点击「管理角色」显示角色。';
  if (poolSearchQuery || poolFilterElement.size > 0) return '没有角色匹配当前搜索或筛选条件。';
  return '所有角色已使用完毕。';
}

function setPoolEmptyText(text) {
  $DOM['pool-empty-text'].textContent = text;
}

function scrollToNewTeam() {
  const list = $DOM['teams-list'];
  const card = list.lastElementChild;
  if (card) {
    card.classList.add('entering');
    card.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }
}

function dismissLoadingScreen() {
  const screen = document.getElementById('loading-screen');
  if (!screen) return;
  screen.classList.add('fade-out');
  screen.addEventListener('animationend', () => screen.remove(), { once: true });
}

function setShellAriaHidden(hidden) {
  const shell = document.querySelector('.app-shell');
  if (hidden) {
    shell.setAttribute('aria-hidden', 'true');
  } else {
    shell.removeAttribute('aria-hidden');
  }
}

function onEscape(modalEl, closeFn) {
  modalEl.onkeydown = function(e) {
    if (e.key === 'Escape') closeFn();
  };
}

// ==================== DOM CACHE ====================
const $DOM = {};
function initDOMCache() {
  for (const key of Object.keys(IDS)) {
    $DOM[IDS[key]] = document.getElementById(IDS[key]);
  }
}
initDOMCache();

// ==================== STATE ====================
let state = {
  owned: [],
  maxUses: {},
  teams: [],
  teamsNames: [],
  teamsLocked: [],
  teamsLayout: 'single',
};
function isTeamLocked(idx) { return !!(state.teamsLocked && state.teamsLocked[idx]); }
let _ownedSet = new Set();
let _ownedCount = 0;
function syncOwnedSet() {
  _ownedSet = new Set(state.owned);
  _ownedCount = 0;
  for (const id of state.owned) if (roverUtils.isMain(id)) _ownedCount++;
}
let collapsedGroups = new Set();
let poolSearchQuery = '';
let poolFilterElement = new Set();
let _mgmtCache = null;
let _customizeCache = null;

function matchCharName(ch, query) {
  return SEARCH_INDEX[ch.id].includes(query);
}

// ==================== STATE MANAGEMENT ====================
function getDefaultUses(id) { return DEFAULT_MAX_USES[id] || 1; }

function normalizeTeamName(value, idx) {
  if (typeof value !== 'string') return `编队 ${idx + 1}`;
  const name = value.replace(/\s+/g, ' ').trim().slice(0, MAX_TEAM_NAME_LENGTH);
  return name || `编队 ${idx + 1}`;
}

function normalizeState(data) {
  if (!data || typeof data !== 'object') data = {};
  const ID_MAP = { aalto: 'qiushui' };
  const validIds = new Set(ALL_CHARACTERS.map(c => c.id));
  const normalizeId = id => typeof id === 'string' ? ID_MAP[id] || id : null;

  const owned = Array.isArray(data.owned) ? data.owned.map(normalizeId) : [];
  data.owned = [...new Set(owned)].filter(id => id && validIds.has(id) && roverUtils.isMain(id));

  data.teams = (Array.isArray(data.teams) ? data.teams : []).map(team => {
    if (!Array.isArray(team)) return [];
    return team.slice(0, MAX_PER_TEAM).map(id => {
      const normalized = normalizeId(id);
      return normalized && validIds.has(normalized) ? normalized : null;
    });
  });

  const rawMaxUses = data.maxUses && typeof data.maxUses === 'object' && !Array.isArray(data.maxUses)
    ? data.maxUses : {};
  data.maxUses = {};
  for (const ch of ALL_CHARACTERS) {
    const n = Number(rawMaxUses[ch.id]);
    const val = Number.isFinite(n) ? Math.trunc(n) : getDefaultUses(ch.id);
    data.maxUses[ch.id] = Math.max(MIN_USES, Math.min(MAX_USES, val));
  }

  const rawNames = Array.isArray(data.teamsNames) ? data.teamsNames : [];
  data.teamsNames = data.teams.map((_, idx) => normalizeTeamName(rawNames[idx], idx));
  const rawLocks = Array.isArray(data.teamsLocked) ? data.teamsLocked : [];
  data.teamsLocked = data.teams.map((_, idx) => rawLocks[idx] === true);
  const validGroups = new Set(GROUP_ORDER || []);
  data.collapsed = (Array.isArray(data.collapsed) ? data.collapsed : COLLAPSED_DEFAULT)
    .filter(group => validGroups.has(group));
  data.teamsLayout = data.teamsLayout === 'grid' ? 'grid' : 'single';
  data._ver = DATA_VERSION;
  return data;
}

function loadState() {
  try {
    const saved = WUWA_STORAGE.read(STORAGE_KEY);
    if (saved) {
      const raw = JSON.parse(saved);
      const parsed = normalizeState(raw);
      _stateNeedsPersist = raw._ver !== DATA_VERSION;
      state.owned = parsed.owned;
      state.maxUses = parsed.maxUses;
      state.teams = parsed.teams;
      collapsedGroups = new Set(parsed.collapsed);
      state.teamsNames = parsed.teamsNames;
      state.teamsLocked = parsed.teamsLocked;
      state.teamsLayout = parsed.teamsLayout;
    }
  } catch(e) {
    console.warn('[wuwa] loadState error, resetting to defaults', e);
    showToast('数据加载失败，已重置为默认设置');
    state.owned = [];
    state.teams = [];
    state.teamsNames = [];
    state.teamsLocked = [];
    state.maxUses = {};
    collapsedGroups = new Set(COLLAPSED_DEFAULT);
  }

  while (state.teamsNames.length < state.teams.length) state.teamsNames.push('');
  while (state.teamsLocked.length < state.teams.length) state.teamsLocked.push(false);

  for (const ch of ALL_CHARACTERS) {
    if (state.maxUses[ch.id] == null) {
      state.maxUses[ch.id] = getDefaultUses(ch.id);
    }
  }
}

let _remainingGen = 0;
let _remainingCache = null;

/**
 * 计算每个角色的剩余可用次数（maxUses - 已分配次数）。
 * 使用 generation counter 管理缓存生命周期。
 * @returns {Object<string, number>}
 */
function computeRemaining() {
  if (_remainingCache && _remainingCache.gen === _remainingGen) return _remainingCache.data;
  const remaining = Object.assign({}, state.maxUses);
  let roverRemaining = remaining.rover || 1;
  for (const team of state.teams) {
    for (const id of team) {
      if (id == null) continue;
      if (roverUtils.belongs(id)) { roverRemaining--; continue; }
      if (remaining[id] > 0) remaining[id]--;
    }
  }
  roverRemaining = Math.max(0, roverRemaining);
  for (const rf of roverUtils.forms) {
    remaining[rf.id] = roverRemaining;
  }
  _remainingCache = { gen: _remainingGen, data: remaining };
  return remaining;
}

/**
 * @param {string} searchQuery
 * @param {Set<string>} filterSet
 * @returns {{ groups: Object<string, Array>, groupTotal: Object<string, number>, remaining: Object<string, number> }}
 */
function computeVisibleCharacters(searchQuery, filterSet) {
  const query = searchQuery.toLowerCase();
  const remaining = computeRemaining();
  const groups = { limited: [], standard: [], rover: [], beta: [], satellite: [], four: [] };
  const groupTotal = {};
  for (const key of GROUP_ORDER) groupTotal[key] = 0;
  for (const ch of ALL_CHARACTERS) {
    if (roverUtils.belongs(ch.id)) continue;
    if (_ownedSet.has(ch.id)) {
      groupTotal[getGroup(ch)]++;
      if (remaining[ch.id] > 0) {
        if (query && !matchCharName(ch, query)) continue;
        if (filterSet.size > 0 && !filterSet.has(ch.element)) continue;
        groups[getGroup(ch)].push(ch);
      }
    }
  }
  if (_ownedSet.has('rover')) {
    groupTotal['rover'] = Math.min(roverUtils.forms.length, state.maxUses['rover'] || 1);
  }
  if (_ownedSet.has('rover') && remaining['rover'] > 0) {
    for (const rf of roverUtils.forms) {
      if (query && !matchCharName(rf, query)) continue;
      if (filterSet.size > 0 && !filterSet.has(rf.element)) continue;
      groups['rover'].push(rf);
    }
  }
  return { groups, groupTotal, remaining };
}

function getOwnedCount() {
  return _ownedCount;
}

/**
 * 检查角色是否可以放入指定编队（重复检测 + 剩余次数检测）。
 * @param {string} charId
 * @param {number} teamIdx
 * @returns {boolean}
 */
function canUseChar(charId, teamIdx) {
  if (isCharInTeam(charId, teamIdx)) {
    showToast(`"${getCharName(charId)}" 已在该编队中`);
    return false;
  }
  const rem = computeRemaining();
  if (rem[charId] <= 0) {
    showToast(`"${getCharName(charId)}" 已使用完毕`);
    return false;
  }
  return true;
}

let _savePending = false;

function getStateSnapshot(extra) {
  return {
    owned: state.owned,
    maxUses: state.maxUses,
    teams: state.teams,
    teamsNames: state.teamsNames,
    teamsLocked: state.teamsLocked,
    collapsed: Array.from(collapsedGroups),
    teamsLayout: state.teamsLayout,
    _ver: DATA_VERSION,
    ...extra,
  };
}

function markStateDirty() {
  _remainingGen++;
}

let _saveIndicateTimer = null;
function flashSaveIndicator() {
  const el = $DOM['save-indicator'];
  if (!el) return;
  el.classList.add('active');
  clearTimeout(_saveIndicateTimer);
  _saveIndicateTimer = setTimeout(() => el.classList.remove('active'), 600);
}

function flushState() {
  let saved = false;
  try {
    saved = WUWA_STORAGE.write(STORAGE_KEY, JSON.stringify(getStateSnapshot()));
  } catch(e) {
    console.warn('[wuwa] saveState', e);
    showToast('数据保存失败：存储空间不足');
  }
  if (saved) flashSaveIndicator();
  return saved;
}

function saveState() {
  markStateDirty();
  flushState();
}

/**
 * 延迟版 saveState：数据立即标记为脏，localStorage 写入延迟到下一帧合并。
 * 适用于高频率拖拽操作，避免连续 setItem 造成写入压力。
 */
function saveStateDeferred() {
  markStateDirty();
  if (_savePending) return;
  _savePending = true;
  requestAnimationFrame(() => {
    _savePending = false;
    flushState();
  });
}

function flushPendingState() {
  if (!_savePending) return;
  _savePending = false;
  flushState();
}

function exportData() {
  const data = getStateSnapshot({
    exportVersion: 2,
    exportDate: new Date().toISOString(),
  });
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `矩阵叠兵_${new Date().toISOString().slice(0, 19).replace(/:/g, '')}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
  showToast('数据已导出');
}

function importData() {
  if (!confirm('导入将覆盖当前所有数据，确定继续吗？')) return;
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = '.json';
  input.addEventListener('change', () => {
    const file = input.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = JSON.parse(reader.result);
        if (!Array.isArray(data.owned) || !Array.isArray(data.teams)) {
          showToast('无效的导入文件');
          return;
        }
        const knownIds = new Set(ALL_CHARACTERS.map(c => c.id));
        const ID_MAP = { aalto: 'qiushui' };
        const isValidImportedId = (id, allowRoverForms) => {
          if (id == null) return true;
          if (typeof id !== 'string') return false;
          const normalized = ID_MAP[id] || id;
          if (!knownIds.has(normalized)) return false;
          return roverUtils.isMain(normalized) || allowRoverForms && roverUtils.isForm(normalized);
        };
        if (data.owned.some(id => !isValidImportedId(id, false)) || data.teams.some(team =>
          !Array.isArray(team) || team.some(id => !isValidImportedId(id, true)))) {
          showToast('导入失败：包含无法识别的角色'); return;
        }
        for (let i = 0; i < data.teams.length; i++) {
          if (!Array.isArray(data.teams[i]) || data.teams[i].length > MAX_PER_TEAM) {
            showToast(`导入失败：编队 ${i + 1} 数据异常`); return;
          }
        }
        const normalized = normalizeState(data);
        state.owned = normalized.owned;
        state.maxUses = normalized.maxUses;
        state.teams = normalized.teams;
        state.teamsNames = normalized.teamsNames;
        state.teamsLocked = normalized.teamsLocked;
        state.teamsLayout = normalized.teamsLayout;
        collapsedGroups = new Set(normalized.collapsed);
        syncOwnedSet();
        saveState();
        renderAll();
        showToast(`已导入 ${normalized.owned.length} 个角色，${normalized.teams.length} 个编队`);
      } catch(err) {
        console.warn('[wuwa] import error', err);
        showToast('导入失败：文件格式错误');
      }
    };
    reader.readAsText(file);
  });
  input.click();
}

// ==================== RENDER ====================
let _renderScheduled = false;
let _pendingFlags = 0;
const RENDER_POOL = 1;
const RENDER_TEAMS = 2;
let _pendingTeamIdx;
let _renderNeedsFull = false;

let _statsIdleId = null;
function requestStatsUpdate() {
  if (_statsIdleId) cancelIdleCallback(_statsIdleId);
  _statsIdleId = requestIdleCallback(() => {
    _statsIdleId = null;
    updateStats();
  });
}

let _renderErrorCount = 0;

function renderAll(mode, teamIdx) {
  if (mode === undefined) {
    _renderNeedsFull = true;
    _pendingFlags = RENDER_POOL | RENDER_TEAMS;
  } else if (!_renderNeedsFull) {
    if (mode === 'pool') _pendingFlags |= RENDER_POOL;
    else if (mode === 'teams') _pendingFlags |= RENDER_TEAMS;
    else if (mode === 'incremental') {
      _pendingFlags |= RENDER_POOL;
      if (teamIdx != null) _pendingTeamIdx = teamIdx;
    }
  }
  if (_renderScheduled) return;
  _renderScheduled = true;
  requestAnimationFrame(() => {
    _renderScheduled = false;
    const full = _renderNeedsFull;
    const flags = _pendingFlags;
    const tidx = _pendingTeamIdx;
    _pendingFlags = 0;
    _pendingTeamIdx = undefined;
    _renderNeedsFull = false;
    try {
      if (full || flags === (RENDER_POOL | RENDER_TEAMS)) {
        renderPool();
        renderTeams();
      } else {
        if (flags & RENDER_POOL) refreshPoolCards();
        if (flags & RENDER_TEAMS) renderTeams();
        else if (tidx != null) renderTeamByIndex(tidx);
      }
    } catch(e) {
      _renderErrorCount++;
      console.error('[wuwa] renderAll error:', e);
      if (_renderErrorCount <= 3) {
        showToast('渲染异常，请尝试刷新页面');
      }
    }
  });
  requestStatsUpdate();
}

// ----- Pool -----
function renderPool() {
  const grid = $DOM['pool-grid'];
  const empty = $DOM['pool-empty'];
  grid.innerHTML = '';

  const { groups, groupTotal, remaining } = computeVisibleCharacters(poolSearchQuery, poolFilterElement);

  let availableCount = 0;
  for (const key of GROUP_ORDER) availableCount += groups[key].length;

  if (availableCount === 0) {
    empty.style.display = 'block';
    grid.style.display = 'none';
    const ownedTotal = getOwnedCount();
    $DOM['pool-count'].textContent = ownedTotal > 0 ? `0 / ${ownedTotal}` : '0 / 0';
    setPoolEmptyText(getPoolEmptyMsg());
    return;
  }
  empty.style.display = 'none';
  grid.style.display = 'flex';

  const fragment = document.createDocumentFragment();
  for (const key of GROUP_ORDER) {
    const chars = groups[key];
    if (chars.length === 0) continue;

    const cfg = getGroupCfg(key);
    const isCollapsed = collapsedGroups.has(key);
    const header = document.createElement('div');
    header.className = 'group-label' + (isCollapsed ? ' collapsed' : '');
    header.tabIndex = 0;
    header.setAttribute('role', 'button');
    header.setAttribute('aria-expanded', String(!isCollapsed));
    header.innerHTML = `
      <span>${escapeHtml(cfg.label)}<span class="group-count">${chars.length}/${groupTotal[key]}</span></span>
      <span class="collapse-arrow">▼</span>
    `;
    applyGroupStyle(header.querySelector('span:first-child'), cfg);

    const block = document.createElement('div');
    block.className = 'group-block';
    block.dataset.groupKey = key;

    const wrapper = document.createElement('div');
    wrapper.className = 'group-cards' + (isCollapsed ? ' collapsed' : '');
    wrapper.id = `pool-group-${key}`;
    header.setAttribute('aria-controls', wrapper.id);
    function toggleGroup() {
      const isNow = header.classList.toggle('collapsed');
      wrapper.classList.toggle('collapsed', isNow);
      header.setAttribute('aria-expanded', String(!isNow));
      collapsedGroups[isNow ? 'add' : 'delete'](key);
      saveState();
    }
    header.addEventListener('click', toggleGroup);
    onEnterSpace(header, toggleGroup);

    block.appendChild(header);
    block.appendChild(wrapper);
    for (const ch of chars) {
      wrapper.appendChild(createPoolCard(ch, remaining[ch.id]));
    }
    fragment.appendChild(block);
  }
  grid.appendChild(fragment);

  const ownedTotal = getOwnedCount();
  $DOM['pool-count'].textContent = `${availableCount} / ${ownedTotal}`;
}

function buildCharCardEl(ch, opts) {
  const el = document.createElement('div');
  el.className = `char-card ${ch.element}`;
  el.draggable = true;
  el.dataset.charId = ch.id;
  if (opts) {
    if (opts.teamIdx != null) { el.dataset.teamIdx = opts.teamIdx; el.dataset.slotIdx = opts.slotIdx; }
    if (opts.title) el.title = opts.title;
  }
  el.innerHTML = `
    ${charIconHtml(ch)}
    <span class="char-name">${elementIconHtml(ch.element)}${escapeHtml(ch.name)}</span>
    ${opts && opts.uses != null ? `<span class="char-uses">×${opts.uses}</span>` : ''}
  `;
  if (opts && opts.uses != null) {
    el.tabIndex = 0;
    el.setAttribute('role', 'button');
    el.setAttribute('aria-label', `${ch.name}，剩余${opts.uses}次`);
  }
  return el;
}

function createPoolCard(ch, remaining) {
  const card = buildCharCardEl(ch, { uses: remaining });
  if (CURRENT_VERSION_CHARACTER_IDS.has(ch.id)) {
    card.classList.add('is-current-version');
    card.insertAdjacentHTML('afterbegin', '<span class="char-new-badge" role="img" aria-label="当期新角色">NEW</span>');
  }
  return card;
}

// ----- Pool Incremental Update -----
/**
 * 增量更新角色池：保留分组结构（group-block），只 diff 卡片元素。
 * 回退：如果不存在分组块则调用全量 renderPool()。
 */
function refreshPoolCards() {
  const grid = $DOM['pool-grid'];
  const empty = $DOM['pool-empty'];
  const blocks = grid.querySelectorAll('.group-block');

  if (blocks.length === 0) { renderPool(); return; }

  const { groups: visibleByGroup, groupTotal, remaining } = computeVisibleCharacters(poolSearchQuery, poolFilterElement);

  for (const block of blocks) {
    const key = block.dataset.groupKey;
    const wrapper = block.querySelector('.group-cards');
    const header = block.querySelector('.group-label');
    const visible = visibleByGroup[key] || [];
    const visibleIds = new Set(visible.map(c => c.id));

    const existingCards = wrapper.querySelectorAll('.char-card');
    const existingArr = Array.from(existingCards);
    const cardMap = new Map();
    for (const card of existingArr) {
      cardMap.set(card.dataset.charId, card);
    }

    for (const [id, card] of cardMap) {
      if (!visibleIds.has(id)) card.remove();
    }

    for (let i = 0; i < visible.length; i++) {
      const ch = visible[i];
      const existing = cardMap.get(ch.id);
      if (existing) {
        existing.querySelector('.char-uses').textContent = `×${remaining[ch.id]}`;
      } else {
        const newCard = createPoolCard(ch, remaining[ch.id]);
        const nextCard = existingArr[i];
        if (nextCard && nextCard.isConnected) nextCard.before(newCard); else wrapper.appendChild(newCard);
      }
    }

    const countSpan = header.querySelector('.group-count');
    if (countSpan) countSpan.textContent = `${visible.length}/${groupTotal[key]}`;
  }

  for (const key of GROUP_ORDER) {
    const visible = visibleByGroup[key] || [];
    if (visible.length > 0 && !grid.querySelector(`.group-block[data-group-key="${key}"]`)) {
      renderPool();
      return;
    }
  }

  let visibleCount = 0;
  for (const key of GROUP_ORDER) visibleCount += (visibleByGroup[key] || []).length;
  const isEmpty = visibleCount === 0;
  empty.style.display = isEmpty ? 'block' : 'none';
  grid.style.display = isEmpty ? 'none' : 'flex';
  if (isEmpty) {
    setPoolEmptyText(getPoolEmptyMsg());
  }
  $DOM['pool-count'].textContent = `${visibleCount} / ${getOwnedCount()}`;
}

// ----- Teams -----
const _teamCardCache = new Map(); // teamIdx → { card, badge, slots[], teamNameEl }
let _teamOrderSwaps = [];

function clearTeamCardCache() {
  _teamCardCache.clear();
}

function getCachedTeamEntry(teamIdx) {
  let entry = _teamCardCache.get(teamIdx);
  if (entry && entry.card.isConnected) return entry;
  const card = document.querySelector(`.team-card[data-team-idx="${teamIdx}"]`);
  if (!card) return null;
  entry = {
    card,
    badge: card.querySelector('.badge'),
    slots: Array.from(card.querySelectorAll('.team-slot-item')),
    teamNameEl: card.querySelector('.team-label .team-name'),
  };
  _teamCardCache.set(teamIdx, entry);
  return entry;
}

function renderTeams() {
  const list = $DOM['teams-list'];
  const count = state.teams.length;

  if (_teamOrderSwaps.length > 0 && list.children.length === count) {
    const cards = Array.from(list.children);
    for (const [a, b] of _teamOrderSwaps) [cards[a], cards[b]] = [cards[b], cards[a]];
    for (let i = 0; i < cards.length; i++) {
      list.appendChild(cards[i]);
      cards[i].dataset.teamIdx = i;
      cards[i].querySelectorAll('[data-team-idx]').forEach(el => { el.dataset.teamIdx = i; });
    }
    _teamOrderSwaps = [];
    clearTeamCardCache();
    $DOM['teams-count'].textContent = `${count} 个编队`;
    $DOM['teams-empty'].style.display = count === 0 ? 'block' : 'none';
    list.classList.toggle('grid-layout', state.teamsLayout === 'grid');
    return;
  }

  while (list.children.length > count) list.lastChild.remove();
  clearTeamCardCache();
  _teamOrderSwaps = [];
  for (let i = 0; i < count; i++) {
    renderTeamByIndex(i);
  }

  $DOM['teams-count'].textContent = `${count} 个编队`;
  $DOM['teams-empty'].style.display = count === 0 ? 'block' : 'none';
  list.classList.toggle('grid-layout', state.teamsLayout === 'grid');
}

function toggleTeamsLayout() {
  state.teamsLayout = state.teamsLayout === 'grid' ? 'single' : 'grid';
  saveStateDeferred();
  renderTeams();
  updateLayoutToggleBtn();
}

function countFilledSlots(team) {
  let count = 0;
  for (const id of team) if (id != null) count++;
  return count;
}

function updateLayoutToggleBtn() {
  const btn = $DOM['btn-layout-toggle'];
  const isGrid = state.teamsLayout === 'grid';
  btn.innerHTML = isGrid
    ? '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="4" width="16" height="16" rx="2"/></svg>'
    : '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="7" height="18" rx="1"/><rect x="14" y="3" width="7" height="18" rx="1"/></svg>';
  btn.setAttribute('aria-label', isGrid ? '切换到单列' : '切换到双列');
}



function getTeamElement(team) {
  const elements = {};
  for (const id of team) {
    if (id == null) continue;
    const ch = CHAR_MAP.get(id);
    if (ch) elements[ch.element] = (elements[ch.element] || 0) + 1;
  }
  let max = 0, best = null;
  for (const [el, n] of Object.entries(elements)) {
    if (n > max) { max = n; best = el; }
  }
  return best;
}

function createTeamCard(idx, team) {
  const card = document.createElement('div');
  const locked = isTeamLocked(idx);
  card.className = 'team-card' + (locked ? ' locked' : '');
  card.dataset.teamIdx = idx;

  const count = countFilledSlots(team);
  const isFull = count >= MAX_PER_TEAM;

  const teamElem = getTeamElement(team);
  if (teamElem) card.style.setProperty('--team-elem', `var(--${teamElem})`);

  const header = document.createElement('div');
  header.className = 'team-header';
  const lockSvg = locked
    ? '<path d="M7 11V7a5 5 0 0 1 10 0v4"/>'
    : '<path d="M7 11V7a5 5 0 0 1 9.9-2"/>';
  header.innerHTML = `
    <div class="team-label">
      <span class="team-drag-handle" draggable="${!locked}" role="button" tabindex="${locked ? -1 : 0}" title="拖拽排序编队" aria-label="拖拽排序编队">⋮⋮</span>
      <span class="team-name" aria-label="编队名称"></span>
      <span class="badge ${isFull ? 'full' : 'incomplete'}">${count}/${MAX_PER_TEAM}</span>
    </div>
    <div class="team-actions">
      <span class="team-lock" role="button" tabindex="0" title="${locked ? '解锁此编队' : '锁定此编队'}" aria-label="${locked ? '解锁' : '锁定'}">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
          ${lockSvg}
        </svg>
      </span>
      <span class="team-del" role="button" tabindex="0" title="删除此编队">×</span>
    </div>
  `;
  const teamNameEl = header.querySelector('.team-name');
  teamNameEl.textContent = normalizeTeamName(state.teamsNames[idx], idx);
  function curIdx() { return parseInt(card.dataset.teamIdx); }

  const delEl = header.querySelector('.team-del');
  delEl.addEventListener('click', () => deleteTeam(curIdx()));
  onEnterSpace(delEl, () => deleteTeam(curIdx()));

  const lockEl = header.querySelector('.team-lock');
  function toggleLock() {
    const ci = curIdx();
    state.teamsLocked[ci] = !state.teamsLocked[ci];
    saveState();
    if (_teamOrderSwaps.length > 0) renderTeams();
    else renderTeamByIndex(ci);
  }
  lockEl.addEventListener('click', toggleLock);
  onEnterSpace(lockEl, toggleLock);

  const dragHandle = header.querySelector('.team-drag-handle');
  if (!locked) {
    dragHandle.addEventListener('keydown', (e) => {
      if (e.key !== 'ArrowUp' && e.key !== 'ArrowDown') return;
      e.preventDefault();
      const ci = curIdx();
      const next = ci + (e.key === 'ArrowUp' ? -1 : 1);
      if (next < 0 || next >= state.teams.length || isTeamLocked(next)) return;
      swapTeams(ci, next);
      saveStateDeferred();
      renderAll('teams');
    });
    dragHandle.addEventListener('dragstart', (e) => {
      e.dataTransfer.setData('text/plain', JSON.stringify({ teamDrag: true, teamIdx: curIdx() }));
      e.dataTransfer.setData('application/x-team-drag', '1');
      card.classList.add('dragging-team');
      e.stopPropagation();
    });
    dragHandle.addEventListener('dragend', () => {
      card.classList.remove('dragging-team');
    });
  }

  const slotsContainer = document.createElement('div');
  slotsContainer.className = 'team-slots';

  function makeCharCard(charId, slotIdx) {
    const ch = CHAR_MAP.get(charId);
    if (!ch) return null;
    return buildCharCardEl(ch, { teamIdx: idx, slotIdx, title: '拖回角色池即可移回' });
  }

  for (let si = 0; si < MAX_PER_TEAM; si++) {
    const slotItem = document.createElement('div');
    slotItem.className = 'team-slot-item';
    slotItem.dataset.slotIdx = si;
    slotItem.dataset.teamIdx = idx;

    const charId = team[si];
    if (charId) {
      const cardEl = makeCharCard(charId, si);
      if (cardEl) slotItem.appendChild(cardEl);
    } else {
      slotItem.insertAdjacentHTML('beforeend', createEmptySlotHTML());
    }

    slotsContainer.appendChild(slotItem);
  }

  card.appendChild(header);
  card.appendChild(slotsContainer);
  _teamCardCache.set(idx, {
    card, badge: card.querySelector('.badge'),
    slots: Array.from(card.querySelectorAll('.team-slot-item')),
    teamNameEl: card.querySelector('.team-label .team-name'),
  });
  return card;
}

function renderTeamByIndex(idx) {
  const list = $DOM['teams-list'];
  const newCard = createTeamCard(idx, state.teams[idx]);
  if (idx < list.children.length) {
    list.replaceChild(newCard, list.children[idx]);
  } else {
    list.appendChild(newCard);
  }
}

// ----- Stats -----
function updateStats() {
  const remaining = computeRemaining();
  const totalOwned = getOwnedCount();
  let totalUsed = 0;
  for (const team of state.teams) {
    for (const id of team) if (id != null) totalUsed++;
  }
  const remainingSum = Object.values(remaining).reduce((a, b) => a + b, 0);
  $DOM['stats-text'].textContent =
    `显示 ${totalOwned} 人 · 已分配 ${totalUsed} 个位置 · 剩余 ${remainingSum} 次使用`;
}

// ==================== ACTIONS ====================
function isCharInTeam(charId, teamIdx) {
  const isRover = roverUtils.belongs(charId);
  const team = state.teams[teamIdx];
  if (!team) return false;
  for (const id of team) {
    if (id == null) continue;
    if (id === charId) return true;
    if (isRover && roverUtils.belongs(id)) return true;
  }
  return false;
}

function teamSetSlot(teamIdx, slotIdx, charId) {
  state.teams[teamIdx][slotIdx] = charId;
}

function teamClearSlot(teamIdx, slotIdx) {
  state.teams[teamIdx][slotIdx] = undefined;
}

function updateSlotDOM(teamIdx, slotIdx) {
  const entry = getCachedTeamEntry(teamIdx);
  if (!entry) return;
  const slot = entry.slots[slotIdx];
  if (!slot) return;
  const charId = state.teams[teamIdx] && state.teams[teamIdx][slotIdx];
  if (charId) {
    const ch = CHAR_MAP.get(charId);
    if (!ch) return;
    const cardEl = buildCharCardEl(ch, { teamIdx, slotIdx, title: '拖回角色池即可移回' });
    cardEl.classList.add('slot-entering');
    slot.innerHTML = '';
    slot.appendChild(cardEl);
  } else {
    slot.innerHTML = createEmptySlotHTML();
  }
}

function updateTeamBadgeDOM(teamIdx) {
  const entry = getCachedTeamEntry(teamIdx);
  if (!entry || !entry.badge) return;
  const team = state.teams[teamIdx];
  if (!team) return;
  const count = countFilledSlots(team);
  entry.badge.className = `badge ${count >= MAX_PER_TEAM ? 'full' : 'incomplete'}`;
  entry.badge.textContent = `${count}/${MAX_PER_TEAM}`;
}

function removeFromTeam(teamIdx, charId) {
  const team = state.teams[teamIdx];
  if (!team) return;
  const idx = team.indexOf(charId);
  if (idx !== -1) {
    teamClearSlot(teamIdx, idx);
    updateSlotDOM(teamIdx, idx);
    updateTeamBadgeDOM(teamIdx);
    saveStateDeferred();
    renderAll('incremental', teamIdx);
  }
}

function swapTeams(a, b) {
  [state.teams[a], state.teams[b]] = [state.teams[b], state.teams[a]];
  [state.teamsNames[a], state.teamsNames[b]] = [state.teamsNames[b], state.teamsNames[a]];
  [state.teamsLocked[a], state.teamsLocked[b]] = [state.teamsLocked[b], state.teamsLocked[a]];
  _teamOrderSwaps.push([a, b]);
}

function addTeam() {
  state.teams.push([]);
  state.teamsNames.push('');
  state.teamsLocked.push(false);
  saveState();
  const list = $DOM['teams-list'];
  const card = createTeamCard(state.teams.length - 1, state.teams[state.teams.length - 1]);
  card.classList.add('entering');
  list.appendChild(card);
  scrollToNewTeam();
  $DOM['teams-empty'].style.display = 'none';
  $DOM['teams-count'].textContent = `${state.teams.length} 个编队`;
  requestStatsUpdate();
}

function deleteTeam(idx) {
  if (state.teams.length <= 1) {
    showToast('至少保留一个编队');
    return;
  }
  if (isTeamLocked(idx)) {
    showToast('编队已锁定，请先解锁后再删除');
    return;
  }
  if (!confirm(`确定要删除「${state.teamsNames[idx] || '编队 ' + (idx + 1)}」吗？`)) return;
  state.teams.splice(idx, 1);
  state.teamsNames.splice(idx, 1);
  state.teamsLocked.splice(idx, 1);
  saveState();
  const list = $DOM['teams-list'];
  list.children[idx].remove();
  _teamCardCache.delete(idx);
  // Shift cache entries for higher indices
  _teamCardCache.forEach((v, k) => { if (k > idx) { _teamCardCache.set(k - 1, v); _teamCardCache.delete(k); } });
  // Update dataset indices on remaining cards
  for (let i = idx; i < state.teams.length; i++) {
    const entry = getCachedTeamEntry(i);
    if (!entry) continue;
    entry.card.dataset.teamIdx = i;
    for (const s of entry.slots) s.dataset.teamIdx = i;
    const nameText = state.teamsNames[i] || `编队 ${i + 1}`;
    if (entry.teamNameEl) entry.teamNameEl.textContent = nameText;
    if (entry.badge) {
      const count = countFilledSlots(state.teams[i]);
      entry.badge.className = `badge ${count >= MAX_PER_TEAM ? 'full' : 'incomplete'}`;
      entry.badge.textContent = `${count}/${MAX_PER_TEAM}`;
    }
  }
  $DOM['teams-empty'].style.display = state.teams.length === 0 ? 'block' : 'none';
  $DOM['teams-count'].textContent = `${state.teams.length} 个编队`;
  requestStatsUpdate();
}

function resetAll() {
  if (!confirm('确定要清除所有角色和编队数据吗？此操作不可撤销')) return;
  const allIds = ALL_CHARACTERS
    .filter(c => roverUtils.isMain(c.id))
    .map(c => c.id);
  state.owned = allIds;
  state.teams = [];
  state.teamsNames = [];
  state.teamsLocked = [];
  state.teamsLayout = 'single';
  collapsedGroups = new Set(COLLAPSED_DEFAULT);
  poolSearchQuery = '';
  poolFilterElement.clear();
  if ($DOM['pool-search']) $DOM['pool-search'].value = '';
  if ($DOM['filter-btns']) {
    $DOM['filter-btns'].querySelectorAll('.filter-btn').forEach(btn => btn.classList.remove('active'));
    $DOM['filter-btns'].firstElementChild?.classList.add('active');
  }
  document.querySelector('.filter-clear-btn')?.classList.remove('visible');
  for (const ch of ALL_CHARACTERS) {
    state.maxUses[ch.id] = getDefaultUses(ch.id);
  }
  syncOwnedSet();
  saveState();
  renderAll();
  showToast('已重置为全角色');
}

// ----- Toast Queue (stacking) -----
const MAX_TOASTS = 5;
function showToast(msg) {
  const container = $DOM['toast'];
  while (container.children.length >= MAX_TOASTS) {
    container.firstChild.remove();
  }
  const el = document.createElement('div');
  el.className = 'toast-item';
  el.textContent = msg;
  container.appendChild(el);
  setTimeout(() => {
    el.classList.add('removing');
    el.addEventListener('animationend', () => el.remove(), { once: true });
  }, TOAST_DURATION);
}

function setupTapHandler(el, getTarget, handler) {
  let lastTap = 0;
  function onTouchEnd(e) {
    const t = Date.now();
    const target = getTarget(e);
    if (!target) return;
    if (t - lastTap < DOUBLE_TAP_MS && e.changedTouches.length === 1) {
      lastTap = 0;
      e.preventDefault();
      handler(target, e);
    } else { lastTap = t; }
  }
  function onDblClick(e) {
    const target = getTarget(e);
    if (!target) return;
    e.preventDefault();
    handler(target, e);
  }
  el.addEventListener('touchend', onTouchEnd, { passive: false });
  el.addEventListener('dblclick', onDblClick);
  return function cleanup() {
    el.removeEventListener('touchend', onTouchEnd);
    el.removeEventListener('dblclick', onDblClick);
  };
}

function applyGroupStyle(el, cfg) {
  if (cfg.color) el.style.color = cfg.color;
}

function createEmptySlotHTML() {
  return '<span class="slot-hint"><span>空</span></span>';
}

function onEnterSpace(el, fn) {
  el.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); fn(e); }
  });
}

function trapFocus(modalEl) {
  const focusable = modalEl._focusable ??= modalEl.querySelectorAll('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])');
  if (!focusable.length) return;
  const first = focusable[0];
  const last = focusable[focusable.length - 1];
  modalEl._focusLast = last;
  first.focus();
  modalEl.addEventListener('keydown', modalEl._focusHandler = function(e) {
    if (e.key !== 'Tab') return;
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  });
}

function releaseFocus(modalEl) {
  if (modalEl._focusHandler) {
    modalEl.removeEventListener('keydown', modalEl._focusHandler);
    modalEl._focusHandler = null;
  }
  delete modalEl._focusable;
}

function openModal(modalEl) {
  modalEl.classList.add('active');
  trapFocus(modalEl);
  setShellAriaHidden(true);
}

function closeModal(modalEl, returnFocusId) {
  releaseFocus(modalEl);
  modalEl.onkeydown = null;
  modalEl.classList.remove('active');
  setShellAriaHidden(false);
  if (returnFocusId) $DOM[returnFocusId].focus();
}

// ==================== MODALS ====================
// --- Management modal module-level helpers ---
function updateMgmtStatsUI() {
  const totalChars = ALL_CHARACTERS.filter(c => roverUtils.isMain(c.id)).length;
  const ownedCount = getOwnedCount();
  $DOM['mgmt-modal-stats'].textContent = `已显示${ownedCount} / ${totalChars}`;
}

function updateGroupBtn(block) {
  const visible = block.items.filter(it => it.el.style.display !== 'none');
  const allOwned = visible.length > 0 && visible.every(it => _ownedSet.has(it.ch.id));
  const noneOwned = visible.length > 0 && visible.every(it => !_ownedSet.has(it.ch.id));
  block.btnSelAll.classList.toggle('dimmed', allOwned);
  block.btnSelNone.classList.toggle('dimmed', noneOwned);
}

function updateAllGroupBtns() {
  if (!_mgmtCache) return;
  _mgmtCache.groupBlocks.forEach(b => updateGroupBtn(b));
}

function applyMgmtFilter() {
  if (!_mgmtCache) return;
  const { search, groupBlocks, mgmtFilterSet } = _mgmtCache;
  const q = search.value.trim().toLowerCase();
  let totalVisible = 0;
  for (const block of groupBlocks) {
    let anyVisible = false;
    for (const item of block.items) {
      const matchSearch = !q || matchCharName(item.ch, q);
      const matchElem = mgmtFilterSet.size === 0 || mgmtFilterSet.has(item.ch.element);
      const show = matchSearch && matchElem;
      item.el.style.display = show ? '' : 'none';
      if (show) { anyVisible = true; totalVisible++; }
    }
    block.header.style.display = anyVisible ? '' : 'none';
  }
  updateAllGroupBtns();
  const emptyMsg = document.getElementById('mgmt-empty-msg');
  if (emptyMsg) emptyMsg.style.display = totalVisible === 0 ? '' : 'none';
}

function refreshMgmtUI() {
  if (!_mgmtCache) return;
  const { groupBlocks } = _mgmtCache;
  for (const block of groupBlocks) {
    for (const item of block.items) {
      item.el.classList.toggle('owned', _ownedSet.has(item.ch.id));
    }
  }
  updateMgmtStatsUI();
  updateAllGroupBtns();
}

function resetMgmtFilter() {
  if (!_mgmtCache) return;
  const { search, groupBlocks, mgmtFilterSet, filterContainer } = _mgmtCache;
  search.value = '';
  mgmtFilterSet.clear();
  for (const block of groupBlocks) {
    for (const item of block.items) item.el.style.display = '';
    block.header.style.display = '';
  }
  filterContainer.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
  const allBtn = filterContainer.firstElementChild;
  if (allBtn) allBtn.classList.add('active');
}

function openMgmt() {
  const toolbarArea = $DOM['mgmt-toolbar-area'];
  const grid = $DOM['mgmt-grid'];

  if (_mgmtCache) {
    resetMgmtFilter();
    refreshMgmtUI();
    onEscape($DOM['mgmt-modal'], closeMgmt);
    openModal($DOM['mgmt-modal']);
    _mgmtCache.focusTimer = setTimeout(() => _mgmtCache.search.focus(), 100);
    return;
  }

  toolbarArea.innerHTML = '';
  grid.innerHTML = '';

  const toolbar = document.createElement('div');
  toolbar.className = 'mgmt-toolbar';

  const search = document.createElement('input');
  search.type = 'text';
  search.className = 'mgmt-search';
  search.placeholder = '搜索角色（支持拼音）...';
  search.setAttribute('aria-label', '搜索角色');

  const filterContainer = document.createElement('div');
  filterContainer.className = 'filter-btns';

  toolbar.appendChild(search);
  toolbar.appendChild(filterContainer);
  toolbarArea.appendChild(toolbar);
  const focusTimer = setTimeout(() => search.focus(), 100);

  const mgmtFilterSet = new Set();
  let mgmtSearchTimer;
  createFilterBar(filterContainer, mgmtFilterSet, applyMgmtFilter);

  const groups = buildGroupedCharacters();
  const groupBlocks = [];

  for (const key of GROUP_ORDER) {
    const chars = groups[key];
    if (chars.length === 0) continue;

    const cfg = getGroupCfg(key);

    const header = document.createElement('div');
    header.className = 'mgmt-group-header';

    const labelSpan = document.createElement('span');
    labelSpan.textContent = cfg.label;
    applyGroupStyle(labelSpan, cfg);

    const actionsSpan = document.createElement('span');
    actionsSpan.className = 'group-actions';

    const btnSelAll = document.createElement('button');
    btnSelAll.className = 'btn-sel-all';
    btnSelAll.textContent = '全部显示';
    btnSelAll.addEventListener('click', () => {
      for (const ch of chars) {
        if (!_ownedSet.has(ch.id)) state.owned.push(ch.id);
      }
      syncOwnedSet();
      saveState();
      refreshMgmtUI();
    });

    const btnSelNone = document.createElement('button');
    btnSelNone.className = 'btn-sel-none';
    btnSelNone.textContent = '全部隐藏';
    btnSelNone.addEventListener('click', () => {
      const removeIds = new Set(chars.filter(ch => _ownedSet.has(ch.id)).map(ch => ch.id));
      for (const id of removeIds) removeCharFromAllTeams(id);
      state.owned = state.owned.filter(id => !removeIds.has(id));
      syncOwnedSet();
      saveState();
      refreshMgmtUI();
    });

    actionsSpan.appendChild(btnSelAll);
    actionsSpan.appendChild(btnSelNone);
    header.appendChild(labelSpan);
    header.appendChild(actionsSpan);
    grid.appendChild(header);

    const blockItems = [];
    for (const ch of chars) {
      const div = document.createElement('div');
      div.className = `char-mgmt-item-wrapper ${_ownedSet.has(ch.id) ? 'owned' : ''}`;
      div.tabIndex = 0;
      div.setAttribute('role', 'button');
      div.setAttribute('aria-label', `切换 ${ch.name} 显示状态`);
      div.dataset.charId = ch.id;
      const { iconHtml, name } = roverUtils.labelHtml(ch);
      div.innerHTML = `${iconHtml}<span>${escapeHtml(name)}</span>`;
      grid.appendChild(div);
      blockItems.push({ el: div, ch: ch });
    }

    groupBlocks.push({ key, header, items: blockItems, btnSelAll, btnSelNone });
  }

  const mgmtEmptyMsg = document.createElement('div');
  mgmtEmptyMsg.id = 'mgmt-empty-msg';
  mgmtEmptyMsg.textContent = '没有角色匹配当前搜索或筛选条件。';
  grid.appendChild(mgmtEmptyMsg);

  function toggleMgmtItem(el) {
    if (!el) return;
    toggleVisibility(el.dataset.charId, el);
    if (_mgmtCache) {
      const block = _mgmtCache.groupBlocks.find(b => b.items.some(it => it.el === el));
      if (block) updateGroupBtn(block);
    }
  }
  grid.addEventListener('click', (e) => {
    toggleMgmtItem(e.target.closest('.char-mgmt-item-wrapper'));
  });
  grid.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      const item = e.target.closest('.char-mgmt-item-wrapper');
      if (item) { e.preventDefault(); toggleMgmtItem(item); }
    }
  });

  search.addEventListener('input', () => {
    clearTimeout(mgmtSearchTimer);
    mgmtSearchTimer = setTimeout(applyMgmtFilter, SEARCH_DELAY_MGMT);
  });

  updateMgmtStatsUI();
  updateAllGroupBtns();
  onEscape($DOM['mgmt-modal'], closeMgmt);
  openModal($DOM['mgmt-modal']);

  _mgmtCache = {
    search, groupBlocks, mgmtFilterSet, filterContainer, focusTimer,
  };
}

function closeMgmt() {
  clearTimeout(_mgmtCache?.focusTimer);
  closeModal($DOM['mgmt-modal'], 'btn-mgmt');
  renderAll('pool');
}

function removeCharFromAllTeams(id) {
  const isRover = roverUtils.belongs(id);
  for (const team of state.teams) {
    for (let i = 0; i < team.length; i++) {
      if (team[i] == null) continue;
      if (team[i] === id || (isRover && roverUtils.belongs(team[i]))) {
        team[i] = undefined;
      }
    }
  }
}

function toggleVisibility(id, el) {
  const idx = state.owned.indexOf(id);
  if (idx === -1) {
    state.owned.push(id);
    if (el) el.classList.add('owned');
  } else {
    const inTeam = state.teams.some(t => t.some(si => si === id || (roverUtils.belongs(id) && roverUtils.belongs(si))));
    if (inTeam && !confirm(`"${getCharName(id)}" 当前在编队中，隐藏后会将其移出，确定继续吗？`)) return;
    removeCharFromAllTeams(id);
    state.owned.splice(idx, 1);
    if (el) el.classList.remove('owned');
  }
  syncOwnedSet();
  saveState();
  if (el && _mgmtCache) {
    refreshMgmtUI();
  } else {
    renderAll();
  }
}

function openCustomize() {
  const grid = $DOM['customize-grid'];

  if (_customizeCache) {
    for (const el of _customizeCache) {
      const valEl = el.querySelector('.uses-val');
      if (valEl) {
        const id = el.dataset.charId;
        valEl.textContent = state.maxUses[id] || 1;
      }
    }
    onEscape($DOM['customize-modal'], closeCustomize);
    openModal($DOM['customize-modal']);
    return;
  }

  grid.innerHTML = '';

  const groups = buildGroupedCharacters();
  const customizeItems = [];

  function appendChar(ch) {
    const div = document.createElement('div');
    div.className = 'char-mgmt-item-wrapper';
    div.style.cursor = 'default';
    div.dataset.charId = ch.id;
    const { iconHtml, name } = roverUtils.labelHtml(ch);
    div.innerHTML = `${iconHtml}<span>${escapeHtml(name)}</span>
      <span class="uses-adjust">
        <button class="mini" data-id="${ch.id}" data-dir="-1" aria-label="减少${name}使用次数">−</button>
        <span class="uses-val">${state.maxUses[ch.id] || 1}</span>
        <button class="mini" data-id="${ch.id}" data-dir="1" aria-label="增加${name}使用次数">+</button>
      </span>
    `;
    grid.appendChild(div);
    customizeItems.push(div);
  }

  grid.addEventListener('click', (e) => {
    const btn = e.target.closest('button.mini');
    if (!btn) return;
    const id = btn.dataset.id;
    const dir = parseInt(btn.dataset.dir);
    const current = state.maxUses[id] || 1;
    const newVal = Math.max(MIN_USES, Math.min(MAX_USES, current + dir));
    if (newVal !== current) {
      state.maxUses[id] = newVal;
      saveState();
      const gridEl = btn.closest('#customize-grid');
      if (gridEl) {
        const valEl = btn.parentElement.querySelector('.uses-val');
        if (valEl) valEl.textContent = newVal;
      }
    }
  });

  for (const key of GROUP_ORDER) {
    const chars = groups[key];
    if (chars.length === 0) continue;

    const cfg = getGroupCfg(key);
    const header = document.createElement('div');
    header.className = 'mgmt-group-header';
    const labelSpan = document.createElement('span');
    labelSpan.textContent = cfg.label;
    applyGroupStyle(labelSpan, cfg);
    header.appendChild(labelSpan);
    grid.appendChild(header);

    chars.forEach(appendChar);
  }

  _customizeCache = customizeItems;

  onEscape($DOM['customize-modal'], closeCustomize);
  openModal($DOM['customize-modal']);
}

function closeCustomize() {
  closeModal($DOM['customize-modal'], 'btn-customize');
  saveState();
  renderAll('pool');
}

// ==================== DATA LOADING ====================
function buildDerivedData() {
  CHAR_MAP = new Map(ALL_CHARACTERS.map(c => [c.id, c]));
  roverUtils.ids = new Set(ALL_CHARACTERS.filter(c => c.rarity === 'rover').map(c => c.id));
  roverUtils.forms = ALL_CHARACTERS.filter(c => c.rarity === 'rover');

  NAME_TO_PINYIN = {};
  for (const ch of ALL_CHARACTERS) {
    NAME_TO_PINYIN[ch.name] = ch.id.replace(/[^a-z0-9]/g, '');
  }

  const extraRoverPy = EXTRA_PINYIN.rover;
  SEARCH_INDEX = {};
  for (const ch of ALL_CHARACTERS) {
    const parts = [ch.name.toLowerCase()];
    const fullPy = NAME_TO_PINYIN[ch.name];
    if (fullPy) {
      parts.push(fullPy);
      const syllables = splitPinyin(fullPy);
      parts.push(...syllables);
    }
    const extra = EXTRA_PINYIN[ch.id] || (roverUtils.belongs(ch.id) ? extraRoverPy : null);
    if (extra) parts.push(...extra);
    SEARCH_INDEX[ch.id] = parts.join(' ');
  }
}

// ==================== START ====================// --- Drag & drop helpers ---
function addCharToTeam(charId) {
  let teamIdx = state.teams.length - 1;
  let isNewTeam = false;
  if (teamIdx < 0 || countFilledSlots(state.teams[teamIdx]) >= MAX_PER_TEAM || isTeamLocked(teamIdx)) {
    teamIdx = -1;
    for (let i = state.teams.length - 1; i >= 0; i--) {
      if (!isTeamLocked(i) && countFilledSlots(state.teams[i]) < MAX_PER_TEAM) {
        teamIdx = i; break;
      }
    }
    if (teamIdx === -1) {
      state.teams.push([]);
      state.teamsNames.push('');
      state.teamsLocked.push(false);
      teamIdx = state.teams.length - 1;
      isNewTeam = true;
    }
  }
  if (!canUseChar(charId, teamIdx)) { if (isNewTeam) { state.teams.pop(); state.teamsNames.pop(); } return; }
  const team = state.teams[teamIdx];
  const emptyIdx = team.findIndex(id => id == null);
  if (emptyIdx !== -1) {
    teamSetSlot(teamIdx, emptyIdx, charId);
  } else {
    team.push(charId);
  }
  saveStateDeferred();
  renderAll('incremental', teamIdx);
  if (isNewTeam) {
    setTimeout(scrollToNewTeam, 50);
  }
}

function handleSlotDrop(data, dstTeamIdx, dstSlotIdx) {
  const dstTeam = state.teams[dstTeamIdx];
  const existingId = dstTeam[dstSlotIdx];

  if (data.fromTeam && data.teamIdx === dstTeamIdx) {
    const srcSi = data.slotIdx != null ? data.slotIdx : dstTeam.indexOf(data.id);
    if (srcSi === dstSlotIdx || srcSi === -1) return false;
    [dstTeam[dstSlotIdx], dstTeam[srcSi]] = [dstTeam[srcSi], dstTeam[dstSlotIdx]];
    return true;
  }

  if (data.fromTeam) {
    if (existingId == null && isCharInTeam(data.id, dstTeamIdx)) {
      showToast(`"${getCharName(data.id)}" 已在该编队中`);
      return false;
    }
    const srcTeam = state.teams[data.teamIdx];
    const srcIdx = srcTeam.indexOf(data.id);
    if (srcIdx === -1) return false;
    if (existingId != null) {
      const hasDestRover = dstTeam.some((id, i) => id != null && i !== dstSlotIdx && roverUtils.belongs(id));
      if (roverUtils.belongs(data.id) && hasDestRover) {
        showToast(`"${getCharName(data.id)}" 已在该编队中`); return false;
      }
      const hasSrcRover = srcTeam.some((id, i) => id != null && i !== srcIdx && roverUtils.belongs(id));
      if (roverUtils.belongs(existingId) && hasSrcRover) {
        showToast(`"${getCharName(existingId)}" 已在该编队中`); return false;
      }
    }
    srcTeam[srcIdx] = existingId;
    dstTeam[dstSlotIdx] = data.id;
    return true;
  }

  if (!canUseChar(data.id, dstTeamIdx)) return false;
  dstTeam[dstSlotIdx] = data.id;
  return true;
}

function createTeamFromChar(data) {
  if (!data.fromTeam) {
    const rem = computeRemaining();
    if (rem[data.id] <= 0) { showToast(`"${getCharName(data.id)}" 已使用完毕`); return false; }
  }
  if (data.fromTeam) {
    const src = state.teams[data.teamIdx];
    if (src) { const ci = src.indexOf(data.id); if (ci !== -1) src[ci] = undefined; }
  }
  state.teams.push([]);
  const ni = state.teams.length - 1;
  teamSetSlot(ni, 0, data.id);
  saveStateDeferred();
  renderAll();
  showToast(`已创建编队${ni + 1}`);
  setTimeout(scrollToNewTeam, 50);
  return true;
}

function readDragPayload(dataTransfer) {
  if (!dataTransfer) return null;
  try {
    const raw = dataTransfer.getData('text/plain');
    const data = raw ? JSON.parse(raw) : null;
    return data && typeof data === 'object' ? data : null;
  } catch (err) {
    console.warn('[wuwa] invalid drag payload', err);
    return null;
  }
}

// --- Pointer events drag (mobile support) ---
function initPointerDrag() {
  let ptr = null;
  let _activeFeedback = null;
  let _moveRaf = null;
  const feedbackClasses = ['drag-over', 'drag-over-team', 'drop-receive', 'drag-over-add'];

  function clearFeedback() {
    if (_activeFeedback) {
      _activeFeedback.classList.remove(...feedbackClasses);
      _activeFeedback = null;
    }
  }

  function clearPtr() {
    if (!ptr) return;
    if (ptr.source) {
      ptr.source.classList.remove('dragging');
      ptr.source.classList.remove('dragging-team');
      if (ptr.source.releasePointerCapture && ptr.source.hasPointerCapture?.(ptr.pointerId)) {
        ptr.source.releasePointerCapture(ptr.pointerId);
      }
    }
    document.body.classList.remove('pointer-dragging');
    clearFeedback();
    if (_moveRaf) { cancelAnimationFrame(_moveRaf); _moveRaf = null; }
    ptr = null;
  }

  function dropTarget(x, y) {
    const el = document.elementFromPoint(x, y);
    if (!el) return {};
    return { slot: el.closest('.team-slot-item'), card: el.closest('.team-card'),
      pool: el.closest('#pool-section'), add: el.closest('#add-team-btn') };
  }

  function showFeedback(t) {
    clearFeedback();
    if (t.slot) {
      const tc = t.slot.closest('.team-card');
      if (tc && isTeamLocked(parseInt(tc.dataset.teamIdx))) return;
      t.slot.classList.add('drag-over'); _activeFeedback = t.slot;
    }
    else if (t.card && ptr && ptr.data && ptr.data.teamDrag) {
      if (isTeamLocked(parseInt(t.card.dataset.teamIdx))) return;
      t.card.classList.add('drag-over-team'); _activeFeedback = t.card;
    }
    else if (t.add && ptr && (!ptr.data || !ptr.data.teamDrag)) { t.add.classList.add('drag-over-add'); _activeFeedback = t.add; }
    else if (t.card && ptr && ptr.data && !ptr.data.teamDrag) {
      if (isTeamLocked(parseInt(t.card.dataset.teamIdx))) return;
      t.card.classList.add('drag-over-team'); _activeFeedback = t.card;
    }
  }

  function onPointerDown(e) {
    if (e.pointerType === 'mouse') return;
    const card = e.target.closest('.char-card[draggable]');
    const handle = e.target.closest('.team-drag-handle');
    if (!card && !handle) return;
    const isTeamDrag = !!handle && !card;
    let data, source;
    if (isTeamDrag) {
      const teamCard = handle.closest('.team-card');
      if (!teamCard) return;
      if (isTeamLocked(parseInt(teamCard.dataset.teamIdx))) { showToast('该编队已锁定，无法排序'); return; }
      source = teamCard;
      data = { teamDrag: true, teamIdx: parseInt(teamCard.dataset.teamIdx) };
    } else {
      source = card;
      data = { id: card.dataset.charId };
      if (card.dataset.teamIdx != null) {
        if (isTeamLocked(parseInt(card.dataset.teamIdx))) return;
        data.fromTeam = true; data.teamIdx = parseInt(card.dataset.teamIdx);
        data.slotIdx = parseInt(card.dataset.slotIdx);
      }
    }
    ptr = { source, data, longPress: false, sx: e.clientX, sy: e.clientY, isTeamDrag, pointerId: e.pointerId };
    ptr._timer = setTimeout(() => {
      if (!ptr || ptr.longPress) return;
      ptr.longPress = true;
      document.body.classList.add('pointer-dragging');
      if (ptr.source.setPointerCapture && ptr.pointerId != null) ptr.source.setPointerCapture(ptr.pointerId);
      if (isTeamDrag) {
        ptr.source.classList.add('dragging-team');
      } else {
        ptr.source.classList.add('dragging');
      }
    }, LONG_PRESS_MS);
  }
  const poolGrid = $DOM['pool-grid'];
  const teamsList = $DOM['teams-list'];
  poolGrid.addEventListener('pointerdown', onPointerDown);
  teamsList.addEventListener('pointerdown', onPointerDown);

  document.addEventListener('pointermove', (e) => {
    if (!ptr) return;
    if (!ptr.longPress) {
      if (Math.abs(e.clientX - ptr.sx) > DRAG_THRESHOLD || Math.abs(e.clientY - ptr.sy) > DRAG_THRESHOLD) {
        clearTimeout(ptr._timer); clearPtr();
      }
      return;
    }
    e.preventDefault();
    if (_moveRaf) return;
    _moveRaf = requestAnimationFrame(() => {
      _moveRaf = null;
      if (!ptr) return;
      showFeedback(dropTarget(e.clientX, e.clientY));
    });
  }, { passive: false });

  document.addEventListener('pointerup', (e) => {
    if (!ptr) return;
    clearTimeout(ptr._timer);
    if (!ptr.longPress) { clearPtr(); return; }
    const targets = dropTarget(e.clientX, e.clientY);
    const d = ptr.data;
    clearPtr();
    if (!d) return;

    if (targets.slot && !d.teamDrag) {
      const tc = targets.slot.closest('.team-card');
      if (!tc) return;
      const idx = parseInt(tc.dataset.teamIdx);
      if (isTeamLocked(idx)) { clearPtr(); showToast('该编队已锁定，无法修改'); return; }
      const si = parseInt(targets.slot.dataset.slotIdx);
      if (handleSlotDrop(d, idx, si)) { saveStateDeferred(); renderAll(d.fromTeam && d.teamIdx !== idx ? 'teams' : 'incremental', idx); }
      return;
    }
    if (targets.pool && d.fromTeam && !d.teamDrag) { removeFromTeam(d.teamIdx, d.id); return; }
    if (d.teamDrag && targets.card) {
      const dstIdx = parseInt(targets.card.dataset.teamIdx);
      const srcIdx = d.teamIdx;
      if (srcIdx !== dstIdx) {
        if (isTeamLocked(srcIdx) || isTeamLocked(dstIdx)) { showToast('无法对已锁定的编队进行排序'); return; }
        swapTeams(srcIdx, dstIdx);
        saveStateDeferred(); renderAll('teams');
      }
      return;
    }
    if (targets.card && !d.teamDrag) {
      const dstIdx = parseInt(targets.card.dataset.teamIdx);
      if (isTeamLocked(dstIdx)) { showToast('该编队已锁定，无法修改'); return; }
      const dstTeam = state.teams[dstIdx];
      if (dstTeam) {
        const si = dstTeam.findIndex(id => id == null);
        if (si !== -1) { if (handleSlotDrop(d, dstIdx, si)) { saveStateDeferred(); renderAll('incremental', dstIdx); } }
        else showToast('该编队已满');
      }
      return;
    }
    if (targets.add && !d.teamDrag) {
      createTeamFromChar(d);
    }
  });

  document.addEventListener('pointercancel', clearPtr);
}

// --- Edge scroll on drag ---
function initEdgeScroll() {
  let rafId = null;
  let scrollDir = 0;
  function updateDirection(clientY) {
    const nextDir = clientY < EDGE_SCROLL_THRESHOLD ? -EDGE_SCROLL_SPEED : clientY > window.innerHeight - EDGE_SCROLL_THRESHOLD ? EDGE_SCROLL_SPEED : 0;
    if (nextDir === scrollDir) return;
    scrollDir = nextDir;
    if (rafId) { cancelAnimationFrame(rafId); rafId = null; }
    if (scrollDir !== 0) rafId = requestAnimationFrame(scrollStep);
  }
  function scrollStep() {
    if (scrollDir !== 0) {
      window.scrollBy(0, scrollDir);
      rafId = requestAnimationFrame(scrollStep);
    }
  }
  document.addEventListener('drag', (e) => {
    updateDirection(e.clientY);
  });
  document.addEventListener('pointermove', (e) => {
    if (document.body.classList.contains('pointer-dragging')) updateDirection(e.clientY);
  }, { passive: true });
  document.addEventListener('dragend', () => {
    scrollDir = 0;
    if (rafId) { cancelAnimationFrame(rafId); rafId = null; }
  });
  document.addEventListener('pointerup', () => {
    if (!document.body.classList.contains('pointer-dragging')) return;
    scrollDir = 0;
    if (rafId) { cancelAnimationFrame(rafId); rafId = null; }
  }, { passive: true });
}

function initPoolDragDrop() {
  const poolGrid = $DOM['pool-grid'];
  poolGrid.addEventListener('dragstart', (e) => {
    const card = e.target.closest('.char-card');
    if (!card) return;
    e.dataTransfer.setData('text/plain', JSON.stringify({ id: card.dataset.charId }));
    card.classList.add('dragging');
  });
  poolGrid.addEventListener('dragend', (e) => {
    const card = e.target.closest('.char-card');
    if (card) card.classList.remove('dragging');
  });

  setupTapHandler(poolGrid,
    e => e.target.closest('.char-card'),
    card => addCharToTeam(card.dataset.charId)
  );
  onEnterSpace(poolGrid, (e) => {
    const card = e.target.closest('.char-card');
    if (card) addCharToTeam(card.dataset.charId);
  });
}

function initTeamsDragDrop() {
  const poolGrid = $DOM['pool-grid'];
  const teamsList = $DOM['teams-list'];
  const pool = $DOM['pool-section'];
  const addBtn = $DOM['add-team-btn'];

  // Add team button
  addBtn.tabIndex = 0;
  addBtn.setAttribute('role', 'button');
  addBtn.addEventListener('click', addTeam);
  onEnterSpace(addBtn, addTeam);
  addBtn.addEventListener('dragover', (e) => {
    if (e.dataTransfer.types.includes('application/x-team-drag')) return;
    e.preventDefault();
    addBtn.classList.add('drag-over-add');
  });
  addBtn.addEventListener('dragleave', () => addBtn.classList.remove('drag-over-add'));
  addBtn.addEventListener('drop', (e) => {
    e.preventDefault();
    addBtn.classList.remove('drag-over-add');
    const data = readDragPayload(e.dataTransfer);
    if (data && !data.teamDrag) createTeamFromChar(data);
  });

  // Pool section drop
  pool.addEventListener('dragover', (e) => {
    if (e.dataTransfer.types.includes('application/x-team-drag')) return;
    e.preventDefault();
    pool.classList.add('drop-receive');
  });
  pool.addEventListener('dragleave', (e) => {
    if (!pool.contains(e.relatedTarget)) pool.classList.remove('drop-receive');
  });
  pool.addEventListener('drop', (e) => {
    e.preventDefault();
    pool.classList.remove('drop-receive');
    const data = readDragPayload(e.dataTransfer);
    if (data && !data.teamDrag && data.fromTeam) {
      if (isTeamLocked(data.teamIdx)) { showToast('该编队已锁定，无法移出'); return; }
      removeFromTeam(data.teamIdx, data.id);
    }
  });

  // Teams list drag/drop
  teamsList.addEventListener('dragstart', (e) => {
    const card = e.target.closest('.char-card');
    if (!card || !card.closest('.team-slot-item')) return;
    const tci = parseInt(card.dataset.teamIdx);
    if (isTeamLocked(tci)) { e.preventDefault(); showToast('该编队已锁定，无法移出'); return; }
    e.dataTransfer.setData('text/plain', JSON.stringify({
      id: card.dataset.charId,
      fromTeam: true,
      teamIdx: tci,
      slotIdx: parseInt(card.dataset.slotIdx),
    }));
    card.classList.add('dragging');
  });
  teamsList.addEventListener('dragend', (e) => {
    const card = e.target.closest('.char-card');
    if (card) card.classList.remove('dragging');
  });

  setupTapHandler(teamsList,
    e => e.target.closest('.char-card'),
    card => {
      const slot = card.closest('.team-slot-item');
      const teamCard = slot.closest('.team-card');
      const tci = parseInt(teamCard.dataset.teamIdx);
      if (isTeamLocked(tci)) { showToast('该编队已锁定，无法移出'); return; }
      removeFromTeam(tci, card.dataset.charId);
    }
  );
  teamsList.addEventListener('dragover', (e) => {
    const slot = e.target.closest('.team-slot-item');
    const card = e.target.closest('.team-card');
    const isTeamDrag = e.dataTransfer.types.includes('application/x-team-drag');
    if (slot && !isTeamDrag) {
      if (isTeamLocked(parseInt(slot.closest('.team-card').dataset.teamIdx))) return;
      e.preventDefault();
      slot.classList.add('drag-over');
      return;
    }
    if (card && isTeamDrag) {
      if (isTeamLocked(parseInt(card.dataset.teamIdx))) return;
      e.preventDefault();
      card.classList.add('drag-over-team');
      return;
    }
    if (card && !slot && !isTeamDrag) {
      if (isTeamLocked(parseInt(card.dataset.teamIdx))) return;
      e.preventDefault();
      card.classList.add('drag-over-team');
    }
  });
  teamsList.addEventListener('dragleave', (e) => {
    const slot = e.target.closest('.team-slot-item');
    if (slot && !slot.contains(e.relatedTarget)) {
      slot.classList.remove('drag-over');
    }
    const card = e.target.closest('.team-card');
    if (card && !card.contains(e.relatedTarget)) {
      card.classList.remove('drag-over-team');
    }
  });

  teamsList.addEventListener('drop', (e) => {
    const slot = e.target.closest('.team-slot-item');
    if (slot) {
      if (e.dataTransfer.types.includes('application/x-team-drag')) return;
      e.preventDefault();
      slot.classList.remove('drag-over');
      const data = readDragPayload(e.dataTransfer);
      const teamCard = slot.closest('.team-card');
      const idx = parseInt(teamCard.dataset.teamIdx);
      if (!data) return;
      if (isTeamLocked(idx)) { showToast('该编队已锁定，无法修改'); return; }
      const si = parseInt(slot.dataset.slotIdx);
      if (handleSlotDrop(data, idx, si)) { saveStateDeferred(); renderAll(data.fromTeam && data.teamIdx !== idx ? 'teams' : 'incremental', idx); }
      return;
    }
    const card = e.target.closest('.team-card');
    if (!card) return;
    card.classList.remove('drag-over-team');
    const data = readDragPayload(e.dataTransfer);
    if (!data) return;
    {
        const dstIdx = parseInt(card.dataset.teamIdx);
      if (!data.teamDrag) {
        if (isTeamLocked(dstIdx)) { showToast('该编队已锁定，无法修改'); return; }
        e.preventDefault();
        e.stopPropagation();
        const dstTeam = state.teams[dstIdx];
        if (dstTeam) {
          const si = dstTeam.findIndex(id => id == null);
          if (si !== -1) { if (handleSlotDrop(data, dstIdx, si)) { saveStateDeferred(); renderAll('incremental', dstIdx); } }
          else showToast('该编队已满');
        }
        return;
      }
      e.preventDefault();
      e.stopPropagation();
      const srcIdx = data.teamIdx;
      if (srcIdx === dstIdx) return;
      if (isTeamLocked(srcIdx) || isTeamLocked(dstIdx)) { showToast('无法对已锁定的编队进行排序'); return; }
      swapTeams(srcIdx, dstIdx);
      saveStateDeferred();
      renderAll('teams');
    }
  });

  teamsList.addEventListener('keydown', (e) => {
    const charCard = e.target.closest('.team-slot-item .char-card');
    if (!charCard || !['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(e.key)) return;
    const teamIdx = parseInt(charCard.dataset.teamIdx);
    const slotIdx = parseInt(charCard.dataset.slotIdx);
    const direction = e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? -1 : 1;
    const targetSlot = slotIdx + direction;
    if (targetSlot < 0 || targetSlot >= MAX_PER_TEAM || isTeamLocked(teamIdx)) return;
    e.preventDefault();
    const moved = handleSlotDrop({ id: charCard.dataset.charId, fromTeam: true, teamIdx, slotIdx }, teamIdx, targetSlot);
    if (moved) {
      saveStateDeferred();
      renderAll('incremental', teamIdx);
    }
  });
}

function initScrollButtons() {
  ['pool-section', 'teams-section'].forEach(id => {
    const sec = $DOM[id];
    if (!sec) return;
    const topBtn = sec.querySelector('.scroll-top');
    const btmBtn = sec.querySelector('.scroll-bottom');
    if (!topBtn || !btmBtn) return;
    function update() {
      const st = sec.scrollTop;
      const maxScroll = sec.scrollHeight - sec.clientHeight;
      topBtn.classList.toggle('visible', st > 2);
      btmBtn.classList.toggle('visible', st < maxScroll - 2);
    }
    sec.addEventListener('scroll', update, { passive: true });
    update();
    topBtn.addEventListener('click', () => sec.scrollTo({ top: 0, behavior: 'smooth' }));
    btmBtn.addEventListener('click', () => sec.scrollTo({ top: sec.scrollHeight, behavior: 'smooth' }));
  });
}

function initHideContent() {
  let contentHidden = false;

  function showContent() {
    if (contentHidden) {
      document.body.classList.remove('content-hidden');
      contentHidden = false;
    }
  }

  function hideContent() {
    if (!contentHidden) {
      document.body.classList.add('content-hidden');
      contentHidden = true;
    }
  }

  $DOM['btn-hide'].addEventListener('click', () => {
    if (contentHidden) {
      showContent();
    } else {
      hideContent();
    }
    $DOM['btn-hide'].setAttribute('aria-label', contentHidden ? '显示内容' : '隐藏内容');
  });

  document.addEventListener('mousemove', showContent, { passive: true });
  document.addEventListener('touchstart', showContent, { passive: true });
}

function initActionButtons() {
  $DOM['btn-mgmt'].addEventListener('click', openMgmt);
  $DOM['btn-customize'].addEventListener('click', openCustomize);
  $DOM['btn-export'].addEventListener('click', exportData);
  $DOM['btn-import'].addEventListener('click', importData);
  $DOM['btn-reset'].addEventListener('click', resetAll);
  $DOM['btn-mgmt-close'].addEventListener('click', closeMgmt);
  $DOM['btn-mgmt-close-x'].addEventListener('click', closeMgmt);
  $DOM['btn-customize-close'].addEventListener('click', closeCustomize);
  $DOM['btn-customize-close-x'].addEventListener('click', closeCustomize);
  $DOM['theme-toggle'].addEventListener('click', toggleTheme);
  $DOM['btn-layout-toggle'].addEventListener('click', toggleTeamsLayout);
  const menu = $DOM['actions-menu'];
  if (menu) {
    [$DOM['btn-export'], $DOM['btn-import'], $DOM['btn-reset']].forEach(btn => {
      btn.addEventListener('click', () => { menu.open = false; });
    });
    document.addEventListener('click', (e) => {
      if (menu.open && !menu.contains(e.target)) menu.open = false;
    });
  }
  updateLayoutToggleBtn();
}

function startApp() {
  loadState();
  if (state.owned.length === 0) {
    const allIds = ALL_CHARACTERS
      .filter(c => roverUtils.isMain(c.id))
      .map(c => c.id);
    state.owned = allIds;
    saveState();
  }
  syncOwnedSet();
  if (_stateNeedsPersist) {
    _stateNeedsPersist = false;
    flushState();
  }

  // Pool filter bar & search
  const container = $DOM['filter-btns'];
  createFilterBar(container, poolFilterElement, () => { updateClearBtn(); refreshPoolCards(); });

  const filterBar = document.getElementById('pool-filter-bar');
  const clearBtn = document.createElement('button');
  clearBtn.className = 'filter-clear-btn';
  clearBtn.setAttribute('aria-label', '清除筛选');
  filterBar.insertBefore(clearBtn, container);

  function updateClearBtn() {
    clearBtn.classList.toggle('visible', poolSearchQuery !== '' || poolFilterElement.size > 0);
  }

  clearBtn.addEventListener('click', () => {
    poolSearchQuery = '';
    poolFilterElement.clear();
    $DOM['pool-search'].value = '';
    container.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
    const allBtn = container.firstElementChild;
    if (allBtn) allBtn.classList.add('active');
    updateClearBtn();
    refreshPoolCards();
  });

  let searchTimer;
  $DOM['pool-search'].addEventListener('input', (e) => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => {
      poolSearchQuery = e.target.value.trim();
      updateClearBtn();
      refreshPoolCards();
    }, SEARCH_DELAY_POOL);
  });

  WUWA_DRAG.init();
  initScrollButtons();
  initHideContent();
  initActionButtons();
  window.addEventListener('pagehide', flushPendingState);

  renderAll();
  dismissLoadingScreen();
}

initTheme();
try { initThemedBackground(); } catch(e) { console.warn('[wuwa] themed background init error', e); }

loadCharacterData().then(() => {
  buildDerivedData();
  startApp();
}).catch(e => {
  console.error('[wuwa] Failed to load character data', e);
  const el = document.getElementById('loading-text');
  if (el) el.textContent = '角色数据加载失败';
  const retry = document.getElementById('loading-retry');
  if (retry) { retry.style.display = ''; retry.addEventListener('click', () => location.reload()); }
});
