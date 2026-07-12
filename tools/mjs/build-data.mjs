import { readFile, writeFile } from 'node:fs/promises';

const source = JSON.parse(await readFile(new URL('../../data/json/characters.json', import.meta.url), 'utf8'));
const output = `/* Generated from data/json/characters.json. Run: npm run build:data */\nwindow.WUWA_CHARACTER_DATA = ${JSON.stringify(source)};\n`;
await writeFile(new URL('../../data/js/data.generated.js', import.meta.url), output, 'utf8');
