import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, '..');

function readRepo(relPath) {
  return fs.readFileSync(path.join(REPO_ROOT, relPath), 'utf8');
}

test('SKANOR & BARSA dates: inventario-app.js, fotos-productos-app.js and AppsScript_Creata_Drive_Sheets.gs enforce "Solicitar información con compras" without touching other providers', () => {
  const invBundle = readRepo('inventario-app.js');
  const fotosBundle = readRepo('fotos-productos-app.js');
  const gasBundle = readRepo('AppsScript_Creata_Drive_Sheets.gs');

  assert.match(invBundle, /const COMPRAS_DATE_NOTICE = 'Solicitar información con compras';/);
  assert.match(invBundle, /function isComprasManagedDateProvider\(provRaw\)/);
  assert.match(invBundle, /function itemRequiresComprasDateNotice\(it\)/);
  assert.match(invBundle, /return 'LPPT: ' \+ qty \+ ' ' \+ dispWord \+ ' · ' \+ COMPRAS_DATE_NOTICE;/);

  assert.match(fotosBundle, /const COMPRAS_DATE_NOTICE = 'Solicitar información con compras';/);
  assert.match(fotosBundle, /const isComprasProvFotos = isComprasManagedDateProvider\(prov \|\| \(liveLppt && liveLppt\.prov\)\);/);

  assert.match(gasBundle, /fechaLlegadaMap\[sk\] = 'Solicitar información con compras';/);
  assert.match(gasBundle, /const isComprasDateProv = \/\\b\(\?:SKANOR\|BARSA\)\\b\/i\.test\(provHoja\);/);
  assert.match(gasBundle, /const fechaEst = isComprasDateProv\s*\?\s*'Solicitar información con compras'/);
});

test('Historial Store Heads Summary: historial-app.js exposes 1-click "📲 Resumen Cabezas de Tienda" action in Kevin archive modal', () => {
  const histCode = readRepo('historial-app.js');
  assert.match(histCode, /function buildKevinStoreHeadsSummaryText\(rep\)/);
  assert.match(histCode, /function copyKevinStoreHeadsSummary\(\)/);
  assert.match(histCode, /data-hist-action="kevin-copy-heads-summary"/);
  assert.match(histCode, /else if \(action === 'kevin-copy-heads-summary'\)/);
});

test('In-place Drive photo revisions (&v=...): inventario-app.js and fotos-productos-app.js propagate ?v= on lh3 URLs and namespace optFit keys without altering unversioned URLs', () => {
  const invBundle = readRepo('inventario-app.js');
  const fotosBundle = readRepo('fotos-productos-app.js');

  assert.match(invBundle, /function extractDrivePhotoRev\(raw\)/);
  assert.match(invBundle, /function buildDriveLh3Url\(fid, sizeToken, rev\)/);
  assert.match(invBundle, /function buildOptFitKey\(fid, rev\)/);
  assert.match(invBundle, /data-rev="' \+ escapeHtml\(rev\)/);

  assert.match(fotosBundle, /function extractDrivePhotoRevInFotos\(url\)/);
  assert.match(fotosBundle, /\(rev \? \('\?v=' \+ encodeURIComponent\(rev\)\) : ''\)/);
});
