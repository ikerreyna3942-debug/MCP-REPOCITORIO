import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const REPO_ROOT = path.resolve(import.meta.dirname, '..');

function runNodeCheck(filePath) {
  const src = fs.readFileSync(filePath, 'utf8');
  execFileSync(process.execPath, ['--check'], {
    input: src,
    stdio: ['pipe', 'pipe', 'pipe']
  });
}

test('Syntax check (node --check) passes for all Apps Script (.gs) and frontend JS/SW files', () => {
  const filesToCheck = [
    'AppsScript_Creata_Drive_Sheets.gs',
    'AppsScript_Prompts_Odoo.gs',
    'fotos-productos-app.js',
    'fotos-sw.js',
    'prompts-app.js',
    'prompts-sw.js',
    'panel-app.js'
  ];
  for (const rel of filesToCheck) {
    const abs = path.join(REPO_ROOT, rel);
    assert.ok(fs.existsSync(abs), `File must exist: ${rel}`);
    assert.doesNotThrow(() => runNodeCheck(abs), `node --check failed on ${rel}`);
  }
});

test('PWA manifests parse as valid JSON with isolated scopes and valid PNG icon headers', () => {
  const promptsManifest = JSON.parse(fs.readFileSync(path.join(REPO_ROOT, 'prompts-manifest.json'), 'utf8'));
  const fotosManifest = JSON.parse(fs.readFileSync(path.join(REPO_ROOT, 'fotos-manifest.json'), 'utf8'));

  assert.equal(promptsManifest.scope, './prompts');
  assert.equal(fotosManifest.scope, './fotos-productos');

  const promptsAppSrc = fs.readFileSync(path.join(REPO_ROOT, 'prompts-app.js'), 'utf8');
  const fotosAppSrc = fs.readFileSync(path.join(REPO_ROOT, 'fotos-productos-app.js'), 'utf8');
  assert.match(promptsAppSrc, /register\(['"]\.\/prompts-sw\.js['"],\s*\{\s*scope:\s*['"]\.\/prompts['"]\s*\}/);
  assert.match(fotosAppSrc, /register\(['"]\.\/fotos-sw\.js['"],\s*\{\s*scope:\s*['"]\.\/fotos-productos['"]\s*\}/);

  const promptsSwSrc = fs.readFileSync(path.join(REPO_ROOT, 'prompts-sw.js'), 'utf8');
  const fotosSwSrc = fs.readFileSync(path.join(REPO_ROOT, 'fotos-sw.js'), 'utf8');
  assert.match(promptsSwSrc, /CACHE_PREFIX\s*\+\s*['"]v2['"]/);
  assert.match(fotosSwSrc, /CACHE_PREFIX\s*\+\s*['"]v4['"]/);
  assert.match(fotosSwSrc, /CACHE_PREFIX\s*\+\s*['"]img-v4['"]/);

  const pngMagic = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  for (const iconRel of ['prompts-icon-192.png', 'prompts-icon-512.png', 'prompts-apple-icon.png']) {
    const abs = path.join(REPO_ROOT, iconRel);
    assert.ok(fs.existsSync(abs), `Missing icon: ${iconRel}`);
    const header = fs.readFileSync(abs).subarray(0, 8);
    assert.deepEqual(header, pngMagic, `Invalid PNG header on ${iconRel}`);
  }
});

test('robots.txt disallows /prompts.html, /*.gs, and /AppsScript_Prompts_Odoo.gs', () => {
  const robots = fs.readFileSync(path.join(REPO_ROOT, 'robots.txt'), 'utf8');
  assert.match(robots, /^Disallow:\s*\/prompts\.html$/m);
  assert.match(robots, /^Disallow:\s*\/\*\.gs$/m);
  assert.match(robots, /^Disallow:\s*\/AppsScript_Prompts_Odoo\.gs$/m);
});

test('Zero locked files from ESTRUCTURA_Y_BASE_BLOQUEADA_PROYECTO.txt are modified relative to origin/main', () => {
  const diffOut = execFileSync('git', ['diff', '--name-only', 'origin/main'], {
    cwd: REPO_ROOT,
    encoding: 'utf8'
  });
  const changedFiles = diffOut.split(/\r?\n/).map((s) => s.trim()).filter(Boolean);

  const lockedMatchers = [
    /^index\.html$/,
    /^catalog-/,
    /^admin/,
    /^inventario-sw\.js$/,
    /^ESTRUCTURA_Y_BASE_BLOQUEADA_PROYECTO\.txt$/
  ];

  const violations = changedFiles.filter((f) => lockedMatchers.some((re) => re.test(f)));
  assert.deepEqual(violations, [], `Locked files must NEVER be modified: ${violations.join(', ')}`);
});

test('Static cross-project isolation invariants hold across Project A, Project B, and Prompts frontend', () => {
  const projA = fs.readFileSync(path.join(REPO_ROOT, 'AppsScript_Creata_Drive_Sheets.gs'), 'utf8');
  const projB = fs.readFileSync(path.join(REPO_ROOT, 'AppsScript_Prompts_Odoo.gs'), 'utf8');
  const promptsJs = fs.readFileSync(path.join(REPO_ROOT, 'prompts-app.js'), 'utf8');
  const fotosHtml = fs.readFileSync(path.join(REPO_ROOT, 'fotos-productos.html'), 'utf8');
  const fotosJs = fs.readFileSync(path.join(REPO_ROOT, 'fotos-productos-app.js'), 'utf8');

  // 1. SUBIR PROPT ID never passed to DriveApp.getFolderById in Project A
  assert.ok(
    !/DriveApp\.getFolderById\(\s*['"]1Xc-gaDUJHNSd_XSTob3b39CNYoC9UreX['"]\s*\)/.test(projA),
    'Project A must never call DriveApp.getFolderById on SUBIR PROPT'
  );
  // SUBIR PROPT only appears in Project A inside FORBIDDEN_PROJECT_B_FOLDER_IDS_
  const proptLinesA = projA.split(/\r?\n/).filter((l) => l.includes('1Xc-gaDUJHNSd_XSTob3b39CNYoC9UreX'));
  assert.equal(proptLinesA.length, 1);
  assert.match(proptLinesA[0], /'1Xc-gaDUJHNSd_XSTob3b39CNYoC9UreX':\s*'SUBIR PROPT'/);

  // 2. SUBIR PREN & Control de Productos never passed to DriveApp.getFolderById or SpreadsheetApp.openById in Project B
  assert.ok(
    !/DriveApp\.getFolderById\(\s*['"]11_rR-qhgM02Sfx9zw7uHU5AwXvTpKD4p['"]\s*\)/.test(projB),
    'Project B must never open SUBIR PREN'
  );
  assert.ok(
    !/SpreadsheetApp\.openById\(\s*['"]1xewqWPOlR5LMEFQXq1KsqvObg9PPlTkRGqfZ_4Iiv-8['"]\s*\)/.test(projB),
    'Project B must never open Control de Productos'
  );

  // 3. prompts-app.js never references SUBIR PREN or Control de Productos
  assert.ok(!promptsJs.includes('11_rR-qhgM02Sfx9zw7uHU5AwXvTpKD4p'), 'prompts-app.js must not reference SUBIR PREN ID');
  assert.ok(!/SUBIR PREN/i.test(promptsJs), 'prompts-app.js must not reference SUBIR PREN');
  assert.ok(!promptsJs.includes('1xewqWPOlR5LMEFQXq1KsqvObg9PPlTkRGqfZ_4Iiv-8'), 'prompts-app.js must not reference Control de Productos');

  // 4. App #9 labels updated from SUBIR COTIZACION to SUBIR PREN and cache bumped to ?v=15
  assert.ok(!fotosHtml.includes('SUBIR COTIZACION'), 'fotos-productos.html should use SUBIR PREN label');
  assert.ok(!fotosJs.includes('SUBIR COTIZACION'), 'fotos-productos-app.js should use SUBIR PREN label');
  assert.match(fotosHtml, /fotos-productos-app\.js\?v=15/);
});
