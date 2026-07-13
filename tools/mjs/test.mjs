import { access, readFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const fail = message => { throw new Error(message); };
const scriptPath = new URL('../../js/script.js', import.meta.url);
const loaderPath = new URL('../../js/data/loader.js', import.meta.url);
const storagePath = new URL('../../js/core/storage.js', import.meta.url);
const dragPath = new URL('../../js/interaction/drag.js', import.meta.url);
const source = await readFile(scriptPath, 'utf8');
const loaderSource = await readFile(loaderPath, 'utf8');
const storageSource = await readFile(storagePath, 'utf8');
const dragSource = await readFile(dragPath, 'utf8');
const data = JSON.parse(await readFile(new URL('../../data/json/characters.json', import.meta.url), 'utf8'));
const generated = await readFile(new URL('../../data/js/data.generated.js', import.meta.url), 'utf8');
const generatedJson = generated.match(/window\.WUWA_CHARACTER_DATA = (.*);\s*$/s)?.[1];

if (!generatedJson) fail('generated data is missing');
const generatedData = JSON.parse(generatedJson);
if (generatedData.characters.length !== data.characters.length) fail('generated data is stale');
if (new Set(data.characters.map(ch => ch.id)).size !== data.characters.length) fail('duplicate character id');
for (const image of Object.values(data.localImages || {})) await access(new URL(`../../${image}`, import.meta.url));
if (!source.includes('function normalizeState') || !source.includes('document.createDocumentFragment') || source.includes('MIN_LOADING_MS')) {
  fail('state/loading optimization missing');
}
if (source.includes('localStorage.getItem') || source.includes('localStorage.setItem')) fail('storage access is not centralized');
if (!loaderSource.includes('WUWA_DATA_LOADER') || !storageSource.includes('WUWA_STORAGE') || !dragSource.includes('WUWA_DRAG')) fail('feature modules are missing');
if (data.characters.find(ch => ch.id === 'sp_yangyang')?.rarity === 'beta') fail('formal character remains in beta group');
if (data.characters[0]?.id !== 'suisui' || data.characters[1]?.id !== 'sp_yangyang') fail('current version phase order is incorrect');
if (data.nanokaIds.sp_yangyang !== 70 || data.nanokaIds.suisui !== 71) fail('formal avatar ids are incorrect');

const syntax = spawnSync(process.execPath, ['--check', fileURLToPath(scriptPath)], { encoding: 'utf8' });
if (syntax.status !== 0) fail(syntax.stderr || 'script syntax check failed');

const start = source.indexOf('function normalizeTeamName');
const end = source.indexOf('function loadState');
const context = {
  ALL_CHARACTERS: [{ id: 'a', element: 'aero' }, { id: 'rover', element: 'spectro' }, { id: 'rover_aero', element: 'aero' }],
  GROUP_ORDER: ['limited'],
  COLLAPSED_DEFAULT: ['beta'],
  DATA_VERSION: 3,
  MAX_PER_TEAM: 3,
  MIN_USES: 1,
  MAX_USES: 3,
  MAX_TEAM_NAME_LENGTH: 32,
  DEFAULT_MAX_USES: { a: 2 },
  roverUtils: { isMain: id => id !== 'rover_aero', isForm: id => id === 'rover_aero' },
  getDefaultUses: id => id === 'a' ? 2 : 1,
  input: { owned: ['a', 'a', 'rover_aero'], teams: [['a', 'bad', null]], teamsNames: ['  <b>队伍</b>  '], teamsLocked: [1], maxUses: { a: '9x' }, teamsLayout: 'grid' },
};
vm.runInNewContext(source.slice(start, end) + ';result = normalizeState(input);', context);
const normalized = context.result;
if (normalized.owned.join(',') !== 'a') fail('owned normalization failed');
if (normalized.teams[0][1] !== null) fail('team id normalization failed');
if (normalized.teamsNames[0] !== '<b>队伍</b>') fail('team name normalization failed');
if (normalized.maxUses.a !== 2 || normalized.teamsLayout !== 'grid') fail('settings normalization failed');

console.log(`OK: ${data.characters.length} characters, generated data current, syntax and state checks passed`);
