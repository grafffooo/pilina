// M14 spike (throwaway): how big is a workshop's data after years of use, and what does each
// storage/sync layout cost? Run: node web/spike/bench.mjs [projects] [offcuts]
import { DatabaseSync } from 'node:sqlite';
import { mkdtempSync, writeFileSync, readFileSync, readdirSync, statSync, rmSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { gzipSync } from 'node:zlib';
import { randomUUID } from 'node:crypto';

const N_PROJECTS = +(process.argv[2] ?? 500);
const N_OFFCUTS = +(process.argv[3] ?? 1000);
const N_MATERIALS = 300;
const N_BANDS = 150;
const N_RECORDS = 5000;

let seed = 42;
const rnd = () => ((seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296);
const pick = (a) => a[Math.floor(rnd() * a.length)];
const NAMES = ['Skrinka', 'Polica', 'Stôl', 'Komoda', 'Šatník', 'Kuchyňa', 'Posteľ', 'Regál'];
const now = Date.now();

const edges = () => ({ top: rnd() < 0.5, bottom: rnd() < 0.5, left: rnd() < 0.5, right: rnd() < 0.5 });
const materials = Array.from({ length: N_MATERIALS }, (_, i) => ({
  id: randomUUID(), name: `DTD ${i} 18 mm`, thickness: 18, price: 40 + i, currency: 'EUR', updatedAt: now - i * 1e6,
}));
const bands = Array.from({ length: N_BANDS }, (_, i) => ({ id: randomUUID(), name: `ABS ${i}`, price: 1.2, updatedAt: now }));
const project = (i) => ({
  schema: 5, id: randomUUID(), name: `${pick(NAMES)} ${i}`, createdAt: now - i * 864e5, updatedAt: now - i * 864e5 + 1e6,
  kerf: 3, trim: 10,
  parts: Array.from({ length: 20 + Math.floor(rnd() * 40) }, (_, k) => ({
    id: randomUUID(), length: 300 + Math.floor(rnd() * 1500), width: 100 + Math.floor(rnd() * 600), qty: 1 + Math.floor(rnd() * 4),
    label: `part ${k}`, grain: 'none', edges: edges(), enabled: true, materialId: pick(materials).id, edgeBandId: pick(bands).id,
  })),
  stock: Array.from({ length: 3 }, () => ({ id: randomUUID(), materialId: pick(materials).id, length: 2800, width: 2070, qty: 10 })),
  pricing: { mode: 'sheets', wastePct: 10, offcutCredit: true, extras: [] },
  defaultEdgeBandId: null, useOffcuts: true, cutAt: now, summary: { pieces: 90, sheets: 4, usedPct: 78, cost: 321 },
});
const projects = Array.from({ length: N_PROJECTS }, (_, i) => project(i));
const offcuts = Array.from({ length: N_OFFCUTS }, (_, i) => ({
  id: randomUUID(), code: `OC-${String(i).padStart(4, '0')}`, length: 200 + Math.floor(rnd() * 1500), width: 150 + Math.floor(rnd() * 600),
  materialId: pick(materials).id, grain: 'none', status: 'available', label: 'printed', updatedAt: now, usedAt: null,
}));
const records = Array.from({ length: N_RECORDS }, (_, i) => ({
  id: randomUUID(), at: now - i * 36e5, projectId: pick(projects).id, projectName: 'Skrinka', materialId: pick(materials).id,
  materialName: 'DTD 18 mm', sheetLength: 2800, sheetWidth: 2070, usedArea: 4e6, keptArea: 1e6, fromOffcut: false, offcutCode: null, cost: 55, currency: 'EUR',
}));

const kb = (n) => (n / 1024).toFixed(0) + ' KB';
const mb = (n) => (n / 1048576).toFixed(2) + ' MB';
const ms = (t) => (performance.now() - t).toFixed(1) + ' ms';
const time = (fn) => { const t = performance.now(); const r = fn(); return [r, performance.now() - t]; };
const dir = mkdtempSync(join(tmpdir(), 'pilina-spike-'));
const out = {};
console.log(`Data set: ${N_PROJECTS} projects, ${N_OFFCUTS} offcuts, ${N_MATERIALS} materials, ${N_BANDS} bands, ${N_RECORDS} cut records\n`);

// ---- A. Today's layout: one JSON file per project + 4 shared files.
const A = join(dir, 'A'); mkdirSync(A);
for (const p of projects) writeFileSync(join(A, `${p.name}-${p.id.slice(0, 8)}.pilina.json`), JSON.stringify(p));
writeFileSync(join(A, 'pilina-library.json'), JSON.stringify({ materials, edgeBands: bands }));
writeFileSync(join(A, 'pilina-offcuts.json'), JSON.stringify({ offcuts }));
writeFileSync(join(A, 'pilina-cut-records.json'), JSON.stringify({ records }));
const files = readdirSync(A);
const total = files.reduce((s, f) => s + statSync(join(A, f)).size, 0);
const [, tA] = time(() => files.map((f) => JSON.parse(readFileSync(join(A, f), 'utf8'))));
console.log(`A. Files today: ${files.length} files, ${mb(total)}; read + parse all from local disk: ${tA.toFixed(0)} ms`);
console.log(`   One-project edit uploads: ${kb(statSync(join(A, files[0])).size)} (1 file)\n`);

// ---- B. Everything in one SQLite file.
const dbPath = join(dir, 'pilina.sqlite');
const sql = new DatabaseSync(dbPath);
sql.exec('PRAGMA journal_mode=DELETE; PRAGMA page_size=4096;');
for (const t of ['projects', 'materials', 'bands', 'offcuts', 'records'])
  sql.exec(`CREATE TABLE ${t}(id TEXT PRIMARY KEY, updated INTEGER, doc TEXT)`);
const ins = (t, rows) => { const st = sql.prepare(`INSERT INTO ${t} VALUES (?,?,?)`); sql.exec('BEGIN'); for (const r of rows) st.run(r.id, r.updatedAt ?? r.at ?? 0, JSON.stringify(r)); sql.exec('COMMIT'); };
const [, tIns] = time(() => { ins('projects', projects); ins('materials', materials); ins('bands', bands); ins('offcuts', offcuts); ins('records', records); });
sql.close();
const dbSize = statSync(dbPath).size;
const before = readFileSync(dbPath);
const sql2 = new DatabaseSync(dbPath);
const edited = { ...projects[7], name: 'Skrinka edited', updatedAt: now + 5, parts: projects[7].parts.slice(0, -2) };
sql2.prepare('UPDATE projects SET doc=?, updated=? WHERE id=?').run(JSON.stringify(edited), edited.updatedAt, edited.id);
sql2.close();
const after = readFileSync(dbPath);
let changedPages = 0;
for (let o = 0; o < Math.max(before.length, after.length); o += 4096) if (!before.subarray(o, o + 4096).equals(after.subarray(o, o + 4096))) changedPages++;
console.log(`B. One SQLite file: ${mb(dbSize)} (insert ${tIns.toFixed(0)} ms)`);
console.log(`   One-project edit: ${changedPages} of ${Math.ceil(dbSize / 4096)} pages differ (${kb(changedPages * 4096)}), but Drive/OneDrive APIs re-upload the whole ${mb(dbSize)} file`);
console.log(`   Two devices editing before syncing -> two whole-file copies, no way to merge them by hand\n`);

// ---- C. One export archive (all data in one file the user owns).
const archive = JSON.stringify({ format: 'pilina-archive', version: 1, projects, materials, edgeBands: bands, offcuts, cutRecords: records });
const [, tPar] = time(() => JSON.parse(archive));
const gz = gzipSync(archive);
console.log(`C. Export archive: JSON ${mb(archive.length)}, gzip ${mb(gz.length)}, parse ${tPar.toFixed(0)} ms`);
console.log(`   (SQLite file for comparison: ${mb(dbSize)}, gzip ${mb(gzipSync(before).length)})\n`);

// ---- D. Per-device change logs: each device appends to its own segment files.
// A change = one record version (a project edit ~ one project JSON). Segments close at 256 KB.
const SEG = 256 * 1024;
function simulate(edits) {
  const segs = []; let cur = { name: 's0', bytes: 0, lines: 0 };
  for (let i = 0; i < edits; i++) {
    const line = JSON.stringify({ t: 'project', at: now + i, doc: projects[i % N_PROJECTS] }) + '\n';
    if (cur.bytes + line.length > SEG) { segs.push(cur); cur = { name: `s${segs.length}`, bytes: 0, lines: 0 }; }
    cur.bytes += line.length; cur.lines++;
  }
  segs.push(cur);
  return segs;
}
const snapshot = gz.length;
for (const edits of [100, 1000, 5000]) {
  const segs = simulate(edits);
  const logBytes = segs.reduce((s, x) => s + x.bytes, 0);
  console.log(`D. Change log after ${edits} edits: ${segs.length} segments, ${mb(logBytes)} raw; a new device reads snapshot ${mb(snapshot)} + ${segs.length} segments instead of replaying (compaction folds it back to ${mb(snapshot)})`);
}
console.log(`   Normal sync after an edit on the other device: 1 manifest request + 1 small segment (about ${kb(JSON.stringify(projects[0]).length)} appended)\n`);

// ---- Cloud request-count model (the part a local disk can't show).
const RTT = 0.15; // seconds per API call, typical Drive/Graph; assumption to be replaced by a real measurement
const PAR = 6; // parallel requests
const line = (name, calls) => console.log(`   ${name}: ${calls} calls -> about ${(Math.ceil(calls / PAR) * RTT).toFixed(1)} s`);
console.log(`Cloud sync estimates (assumed ${RTT * 1000} ms per call, ${PAR} in parallel; to be verified against the real APIs):`);
line('Today\'s files, full read each sync (first sync)', files.length);
line('Today\'s files, changed-since check each minute (list + stat)', Math.ceil(files.length / 100)); // listing pages of 100
line('Change log, first sync on a new phone', 1 + 1 + simulate(1000).length);
line('Change log, a normal poll', 1);

rmSync(dir, { recursive: true, force: true });
