import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import {
  BUNDLES,
  assembleBundle,
  checkBundles,
  verifySyntax,
  sha256,
} from '../scripts/build-bundles.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, '..');
const BUILD_SCRIPT = path.join(REPO_ROOT, 'scripts', 'build-bundles.mjs');

function runBuildCli(args, cwd = REPO_ROOT) {
  try {
    const stdout = execFileSync(process.execPath, [BUILD_SCRIPT, ...args], {
      cwd,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    return { status: 0, stdout, stderr: '' };
  } catch (err) {
    return {
      status: typeof err.status === 'number' ? err.status : 1,
      stdout: String(err.stdout || ''),
      stderr: String(err.stderr || ''),
    };
  }
}

function withIsolatedWorkspace(fn) {
  const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'creata-modular-test-'));
  try {
    for (const bundle of BUNDLES) {
      fs.copyFileSync(
        path.join(REPO_ROOT, bundle.outputFile),
        path.join(tmpRoot, bundle.outputFile)
      );
      fs.cpSync(
        path.join(REPO_ROOT, bundle.srcDir),
        path.join(tmpRoot, bundle.srcDir),
        { recursive: true }
      );
    }
    return fn(tmpRoot);
  } finally {
    fs.rmSync(tmpRoot, { recursive: true, force: true });
  }
}

test('Modular manifest declares 31 cohesive modules (7 fotos, 11 apps-script, 13 inventario) with zero duplicates or orphans', () => {
  const byId = new Map(BUNDLES.map((b) => [b.id, b]));
  assert.equal(BUNDLES.length, 3, 'Expected exactly 3 configured bundles');
  assert.equal(byId.get('fotos')?.modules.length, 7, 'Expected 7 src/fotos modules');
  assert.equal(byId.get('apps-script')?.modules.length, 11, 'Expected 11 src/apps-script modules');
  assert.equal(byId.get('inventario')?.modules.length, 13, 'Expected 13 src/inventario modules');

  const totalModules = BUNDLES.reduce((sum, b) => sum + b.modules.length, 0);
  assert.equal(totalModules, 31, 'Expected 31 total source modules');

  for (const bundle of BUNDLES) {
    const unique = new Set(bundle.modules);
    assert.equal(
      unique.size,
      bundle.modules.length,
      `Duplicate manifest entries in ${bundle.id}`
    );

    const srcRoot = path.join(REPO_ROOT, bundle.srcDir);
    const diskEntries = fs.readdirSync(srcRoot).sort();
    assert.deepEqual(
      diskEntries,
      [...bundle.modules].sort(),
      `Disk files in ${bundle.srcDir} must match manifest exactly (zero orphans / zero missing)`
    );

    for (const relMod of bundle.modules) {
      assert.ok(
        relMod.endsWith(bundle.moduleExtension),
        `${bundle.srcDir}/${relMod} must end with ${bundle.moduleExtension}`
      );
      const stat = fs.statSync(path.join(srcRoot, relMod));
      assert.ok(stat.isFile() && stat.size > 0, `${bundle.srcDir}/${relMod} must be non-empty`);
    }
  }
});

test('Zero-drift check: build-bundles.mjs --check exits 0 and matches all 3 root bundles byte-for-byte via SHA-256', () => {
  const cli = runBuildCli(['--check']);
  assert.equal(cli.status, 0, `Expected --check to exit 0, got ${cli.status}\n${cli.stderr}`);
  assert.match(cli.stdout, /CHECK OK: fotos-productos-app\.js/);
  assert.match(cli.stdout, /CHECK OK: AppsScript_Creata_Drive_Sheets\.gs/);
  assert.match(cli.stdout, /CHECK OK: inventario-app\.js/);

  const apiCheck = checkBundles({ rootDir: REPO_ROOT });
  assert.equal(apiCheck.ok, true, apiCheck.errors.join('\n'));
  assert.equal(apiCheck.results.length, 3);

  for (const bundle of BUNDLES) {
    const assembled = assembleBundle(bundle, REPO_ROOT);
    const diskContent = fs.readFileSync(path.join(REPO_ROOT, bundle.outputFile), 'utf8');
    assert.equal(
      assembled.sha256,
      sha256(diskContent),
      `SHA-256 mismatch on ${bundle.outputFile}`
    );
    assert.equal(
      assembled.bytes,
      Buffer.byteLength(diskContent, 'utf8'),
      `Byte-length mismatch on ${bundle.outputFile}`
    );
    assert.equal(assembled.content, diskContent, `Content mismatch on ${bundle.outputFile}`);
  }
});

test('Per-module & bundle syntax validation: --verify-syntax exits 0 for all 31 modules and 3 assembled root bundles (no ESM)', () => {
  const cli = runBuildCli(['--verify-syntax']);
  assert.equal(
    cli.status,
    0,
    `Expected --verify-syntax to exit 0, got ${cli.status}\n${cli.stderr}`
  );
  assert.match(cli.stdout, /SYNTAX SUMMARY: 31 modules \+ 3 bundles passed/);

  const syn = verifySyntax({ rootDir: REPO_ROOT });
  assert.equal(syn.ok, true, syn.errors.join('\n'));
  assert.equal(syn.moduleCount, 31);
  assert.equal(syn.bundleCount, 3);

  for (const bundle of BUNDLES) {
    for (const relMod of bundle.modules) {
      const modSrc = fs.readFileSync(path.join(REPO_ROOT, bundle.srcDir, relMod), 'utf8');
      assert.doesNotMatch(
        modSrc,
        /^\s*(import|export)\s+/m,
        `${bundle.srcDir}/${relMod} must remain classic JS/GAS without ES module import/export`
      );
    }
  }
});

test('Domain symbol placement: every one of the 31 source modules declares its designated domain entrypoints', () => {
  const expectedSymbolsByModule = {
    // src/fotos (7)
    'src/fotos/01-core-state-live-poll-and-api.js': [
      'const FOTOS_WAREHOUSES =',
      'const CATEGORIAS_DEST_FOLDERS =',
      'async function runSilentFotosLiveTick(',
      'function resolveCategoryDestFolderForProduct(',
      'function enqueueFotosWriteTask(',
    ],
    'src/fotos/02-cache-auth-and-inbox-catalog.js': [
      'const DELETED_QUEUE_TTL_MS =',
      'function saveFastCacheNow(',
      'function unlockFotosPortal(',
      'async function loadSheetsCatalog(',
    ],
    'src/fotos/03-sku-list-stage-and-gallery-ui.js': [
      'function applySkuFiltersAndRender(',
      'function renderSkuResultsList(',
      'function renderSelectedProductStage(',
      'function renderInboxGallery(',
    ],
    'src/fotos/04-upload-framing-local-folder-and-assign.js': [
      'function autoFrameStudioProductToDataUrl(',
      'window.uploadLocalFilesToSubir =',
      'window.assignSelectedPhotoToProduct =',
    ],
    'src/fotos/05-offline-idb-outbox-and-checkpoint.js': [
      'function openFotosOfflineIdb(',
      'async function flushFotosOfflineOutbox(',
      'function saveFotosUiCheckpointNow(',
      'async function hydrateFromLocalCompressedBundleIfEmpty(',
    ],
    'src/fotos/06-split-dock-back-nav-and-init.js': [
      'function applyFotosSplitDomState(',
      'function initFotosBackNav(',
      'window.__CREATA_FOTOS_BACK_NAV__ =',
      'function initFotosApp(',
    ],
    'src/fotos/07-visual-covers-fabrics-woods-and-bootstrap.js': [
      'const visualState =',
      'function findMatchingUploadedFabricForProduct(',
      'function findMatchingUploadedWoodForProduct(',
      'window.__CREATA_FOTOS_VISUAL_TEST__ =',
    ],

    // src/apps-script (11)
    'src/apps-script/01-config-auth-bootstrap-and-catalog-sync.gs': [
      'const CONFIG =',
      'function onOpen(',
      'function setupSheetsStructure(',
      'function syncDriveFolderToSheet(',
    ],
    'src/apps-script/02-web-entrypoints-and-catalog-crud.gs': [
      'function doGet(',
      'function doPost(',
      'function jsonResponse_(',
      'function scrubPublicText_(',
    ],
    'src/apps-script/03-inventory-setup-users-and-invitados.gs': [
      'function dejarTodoListoSinFotos(',
      'const ADMIN_PERM_COLUMNS_ =',
      'function crearVerificarHojaAdministrativos(',
      'function crearVerificarHojaInvitados(',
    ],
    'src/apps-script/04-auth-tokens-directory-and-quotes-ledger.gs': [
      'function issueInvAuthToken_(',
      'function verifyInvAuthToken_(',
      'function readAllBranchUsers_(',
      'function handleInvLogin_(',
    ],
    'src/apps-script/05-erp-wcf-client-submit-quote-and-pdf.gs': [
      'function getValidErpSession_(',
      'function callSmuebleriaWcf_(',
      'function handleInvSubmitQuote_(',
      'function handleInvDownloadErpQuotePdf_(',
    ],
    'src/apps-script/06-erp-inventory-sync-autocomplete-and-clients.gs': [
      'function instalarTriggerErpEnVivo(',
      'function sincronizarInventarioEnVivoDesdeERP(',
      'function handleInvSearchErpClients_(',
      'function handleInvUploadProductPhoto_(',
    ],
    'src/apps-script/07-fotos-project-a-manager.gs': [
      'const FORBIDDEN_PROJECT_B_FOLDER_IDS_ =',
      'function handleFotosSubirAssign_(',
      'function handleFotosUploadVisualOverride_(',
      'function handleFotosDelete_(',
    ],
    'src/apps-script/08-audit-historial-and-seguimiento-sync.gs': [
      'function analizarCausaFalloCodigo_(',
      'function registrarEventoHistorial_(',
      'function handleSegGetState_(',
      'function sincronizarCotizacionesSeguimientoDesdeERP(',
    ],
    'src/apps-script/09-presence-sessions-and-product-overrides.gs': [
      'const INV_PRESENCE_STATE_KEY_ =',
      'function handleInvMySessions_(',
      'function handleInvRevokeSession_(',
      'function handleInvProductOverrideSave_(',
    ],
    'src/apps-script/10-demand-and-purchase-suggestions.gs': [
      'const TAB_DEMANDA_SIN_STOCK_ =',
      'function handleInvRegisterDemandRequest_(',
      'function handleInvRegisterPurchaseSuggestion_(',
    ],
    'src/apps-script/11-kevin-archive-and-sales-analysis.gs': [
      'const KEVIN_EXCLUSIVE_EMAIL_ =',
      'function handleHistArchiveAndAnalyzeKevin_(',
      'function computeKevinExecutiveSalesAnalysis_(',
    ],

    // src/inventario (13)
    'src/inventario/01-core-config-and-utils.js': [
      'const DEFAULT_WAREHOUSES =',
      'function normSearch(',
      'function stemEs(',
      'function scoreTokenInGroup(',
    ],
    'src/inventario/02-fabric-vocab-and-normalization.js': [
      'function validateAndNormalizeFabricColorAgainstName(',
      'function rebuildLiveAutoVocab(',
      'function normalizeInventoryItemLive(',
      'function computeCategoryGroupIdentity(',
    ],
    'src/inventario/03-categories-visual-swatches-and-ranking.js': [
      'const MAIN_CATEGORY_ORDER =',
      'function matchFabricTextAgainstUploadedSwatches(',
      'function matchWoodTextAgainstUploadedSwatches(',
      'function compareCommercialGroupOrder(',
    ],
    'src/inventario/04-optfit-indexing-and-catalog-grid.js': [
      'function detectStudioContentBounds(',
      'window.__CREATA_OPTFIT_TEST__ =',
      'function indexItemsAndGroups(',
      'function applyFilter(',
      'window.clearInvSearch =',
    ],
    'src/inventario/05-scanner-variants-and-detail-modal.js': [
      'function resolveScannedBarcode(',
      'async function startLiveBarcodeCamera(',
      'window.__creataBtScanner =',
      'function renderGroupVariantsStep(',
      'function buildCleanProductSpecRows(',
    ],
    'src/inventario/06-photo-upload-and-related-items.js': [
      'function extractAdminPermissionsFromRowClient(',
      'function canManageProductPhotos(',
      'window.submitMultiProductPhotos =',
      'function getRelatedInStockItems(',
    ],
    'src/inventario/07-auth-presence-fab-and-modules.js': [
      'const AUTH_SESSION_KEY =',
      'window.openInAppSeguimiento =',
      'window.openInAppHistorial =',
      'window.submitAdvisorLogin =',
      'window.logoutAdvisorSession =',
    ],
    'src/inventario/08a-quotes-roles-and-drafts.js': [
      'function renderMyRecentQuotes(',
      'function getAdvisorRoleInfo(',
      'function getMaxDiscountPct(',
      'function initQuoteDraftsSystem(',
    ],
    'src/inventario/08b-clients-cart-pdf-and-submit.js': [
      'function renderSelectedErpClientBadge(',
      'window.downloadOriginalErpQuotePdf =',
      'window.submitQuoteToSystem =',
    ],
    'src/inventario/09-bt-wedge-live-sync-checkpoint-alerts-pwa.js': [
      'function resetGlobalScanBuffer(',
      'function applyLiveGvizTable(',
      'window.refreshLiveSheetNow =',
      'function initCreataLiveAlertsModule(',
    ],
    'src/inventario/10-split-dock-and-back-nav.js': [
      'function applyInvSplitDomState(',
      'function initInventarioBackNav(',
      'window.__CREATA_INV_BACK_NAV__ =',
      'function handleIncomingFotosPeerMessageInCotizador(',
    ],
    'src/inventario/11-settings-visual-picker-demand-and-suggestions.js': [
      'window.openSettingsModal =',
      'window.submitOutOfStockRequest =',
      'window.submitPurchaseSuggestion =',
    ],
    'src/inventario/12-price-calculator-and-audit-exports.js': [
      'function computePriceCalcBreakdown(',
      'function renderPriceCalculator(',
      'window.__creataPriceCalc =',
      'window.__CREATA_INV_AUDIT__ =',
    ],
  };

  assert.equal(Object.keys(expectedSymbolsByModule).length, 31);
  for (const [relPath, declarations] of Object.entries(expectedSymbolsByModule)) {
    const content = fs.readFileSync(path.join(REPO_ROOT, relPath), 'utf8');
    for (const decl of declarations) {
      assert.ok(content.includes(decl), `Expected declaration "${decl}" inside ${relPath}`);
    }
  }
});

test('Negative gates (isolated tmpdir): detects 1-byte drift, detects orphan file, re-syncs on build, and rejects syntax errors', () => {
  withIsolatedWorkspace((tmpRoot) => {
    // Baseline in isolated copy must pass cleanly
    const baseline = runBuildCli(['--root', tmpRoot, '--check', '--verify-syntax']);
    assert.equal(baseline.status, 0, baseline.stderr);

    // 1) Modify 1 byte in a source module -> --check MUST fail and report drift
    const targetMod = path.join(tmpRoot, 'src/fotos/01-core-state-live-poll-and-api.js');
    const origMod = fs.readFileSync(targetMod, 'utf8');
    fs.writeFileSync(targetMod, origMod + ' ', 'utf8');

    const drifted = runBuildCli(['--root', tmpRoot, '--check']);
    assert.notEqual(drifted.status, 0, 'Expected --check to fail on 1-byte drift');
    assert.match(drifted.stderr, /Drift detected in fotos-productos-app\.js/);

    // 2) Running default build mode re-syncs the drifted root bundle so --check passes again
    const rebuilt = runBuildCli(['--root', tmpRoot]);
    assert.equal(rebuilt.status, 0, rebuilt.stderr);
    const afterRebuild = runBuildCli(['--root', tmpRoot, '--check']);
    assert.equal(afterRebuild.status, 0, afterRebuild.stderr);

    // 3) Adding an unreferenced orphan file under src/fotos/ -> --check MUST fail
    const orphanPath = path.join(tmpRoot, 'src/fotos/99-orphan-unlisted.js');
    fs.writeFileSync(orphanPath, '// orphan\n', 'utf8');
    const withOrphan = runBuildCli(['--root', tmpRoot, '--check']);
    assert.notEqual(withOrphan.status, 0, 'Expected --check to fail when orphan file exists');
    assert.match(withOrphan.stderr, /Orphan file not in manifest: src\/fotos\/99-orphan-unlisted\.js/);
    fs.rmSync(orphanPath);

    // 4) Introducing a syntax error in a module -> --verify-syntax MUST fail
    fs.writeFileSync(targetMod, origMod + '\nfunction brokenSyntax( {\n', 'utf8');
    const brokenSyntax = runBuildCli(['--root', tmpRoot, '--verify-syntax']);
    assert.notEqual(brokenSyntax.status, 0, 'Expected --verify-syntax to fail on invalid JS');
    assert.match(
      brokenSyntax.stderr,
      /Syntax error in module src\/fotos\/01-core-state-live-poll-and-api\.js/
    );
  });
});

test('Negative gates (vm.Script grammar): rejects bare top-level return; and new.target across all 3 bundle families', () => {
  withIsolatedWorkspace((tmpRoot) => {
    const targets = [
      'src/apps-script/01-config-auth-bootstrap-and-catalog-sync.gs',
      'src/fotos/01-core-state-live-poll-and-api.js',
      'src/inventario/01-core-config-and-utils.js',
    ];

    for (const relMod of targets) {
      const modPath = path.join(tmpRoot, relMod);
      const orig = fs.readFileSync(modPath, 'utf8');
      try {
        fs.writeFileSync(modPath, orig + '\nreturn;\n', 'utf8');
        const res = runBuildCli(['--root', tmpRoot, '--verify-syntax']);
        assert.notEqual(res.status, 0, `Expected bare top-level return; in ${relMod} to fail`);
        assert.match(res.stderr, /Illegal return statement/i);
        assert.ok(res.stderr.includes(relMod), `Expected stderr to mention ${relMod}`);

        fs.writeFileSync(modPath, orig + '\nconst illegalTarget = new.target;\n', 'utf8');
        const ntRes = runBuildCli(['--root', tmpRoot, '--verify-syntax']);
        assert.notEqual(ntRes.status, 0, `Expected bare top-level new.target in ${relMod} to fail`);
        assert.match(ntRes.stderr, /new\.target/i);
      } finally {
        fs.writeFileSync(modPath, orig, 'utf8');
      }
    }

    const clean = runBuildCli(['--root', tmpRoot, '--check', '--verify-syntax']);
    assert.equal(clean.status, 0, clean.stderr);
  });
});

test('Negative gates (src/ tree orphans): rejects stray src/ file, stray src/ subdir, symlink, and empty dir', () => {
  withIsolatedWorkspace((tmpRoot) => {
    // 1) Stray file directly in src/
    const strayFile = path.join(tmpRoot, 'src/orphan.js');
    fs.writeFileSync(strayFile, '// stray root src file\n', 'utf8');
    const r1 = runBuildCli(['--root', tmpRoot, '--check']);
    assert.notEqual(r1.status, 0, 'Expected --check to fail for src/orphan.js');
    assert.match(r1.stderr, /src\/orphan\.js/);
    const r1Syn = runBuildCli(['--root', tmpRoot, '--verify-syntax']);
    assert.notEqual(r1Syn.status, 0, 'Expected --verify-syntax to fail for src/orphan.js');
    fs.rmSync(strayFile);

    // 2) Stray undeclared subdirectory under src/
    const strayDir = path.join(tmpRoot, 'src/rogue-bundle');
    fs.mkdirSync(strayDir, { recursive: true });
    fs.writeFileSync(path.join(strayDir, 'orphan.js'), '// stray subdir file\n', 'utf8');
    const r2 = runBuildCli(['--root', tmpRoot, '--check']);
    assert.notEqual(r2.status, 0, 'Expected --check to fail for src/rogue-bundle/');
    assert.match(r2.stderr, /src\/rogue-bundle\//);
    fs.rmSync(strayDir, { recursive: true, force: true });

    // 3) Symlink inside src/fotos/
    const symlinkPath = path.join(tmpRoot, 'src/fotos/99-symlink-orphan.js');
    fs.symlinkSync(
      path.join(tmpRoot, 'src/fotos/01-core-state-live-poll-and-api.js'),
      symlinkPath
    );
    const r3 = runBuildCli(['--root', tmpRoot, '--check']);
    assert.notEqual(r3.status, 0, 'Expected --check to fail for symlink in src/fotos/');
    assert.match(r3.stderr, /src\/fotos\/99-symlink-orphan\.js/);
    fs.rmSync(symlinkPath);

    // 4) Empty directory inside src/fotos/
    const emptyDirPath = path.join(tmpRoot, 'src/fotos/empty-orphan-dir');
    fs.mkdirSync(emptyDirPath);
    const r4 = runBuildCli(['--root', tmpRoot, '--check']);
    assert.notEqual(r4.status, 0, 'Expected --check to fail for empty dir in src/fotos/');
    assert.match(r4.stderr, /src\/fotos\/empty-orphan-dir\//);
    fs.rmSync(emptyDirPath, { recursive: true, force: true });

    const clean = runBuildCli(['--root', tmpRoot, '--check', '--verify-syntax']);
    assert.equal(clean.status, 0, clean.stderr);
  });
});

test('Negative gates (CLI safety & atomic buildBundles): rejects --root --check, handles bad --root cleanly, and prevents partial writes', () => {
  withIsolatedWorkspace((tmpRoot) => {
    // 1) --root followed by a flag must exit 2 without writing any files
    const badFlag = runBuildCli(['--root', '--check'], tmpRoot);
    assert.equal(badFlag.status, 2, `Expected exit 2 for --root --check, got ${badFlag.status}`);
    assert.match(badFlag.stderr, /ERROR: Missing value for --root/);

    // 2) Non-existent --root in build mode must exit 1 with clean ERROR: and zero stack trace
    const missingRoot = path.join(tmpRoot, 'does-not-exist-workspace');
    const badRoot = runBuildCli(['--root', missingRoot]);
    assert.equal(badRoot.status, 1, `Expected exit 1 for non-existent --root, got ${badRoot.status}`);
    assert.match(badRoot.stderr, /^ERROR: Root directory does not exist:/m);
    assert.doesNotMatch(badRoot.stderr, /at file:\/\//);
    assert.doesNotMatch(badRoot.stderr, /^\s+at\s+/m);

    // 3) Atomic buildBundles(): modifying bundle 1 while bundle 2 has a missing module must NOT overwrite bundle 1
    const fotosMod = path.join(tmpRoot, 'src/fotos/01-core-state-live-poll-and-api.js');
    const gsMod = path.join(tmpRoot, 'src/apps-script/01-config-auth-bootstrap-and-catalog-sync.gs');
    const fotosBundle = path.join(tmpRoot, 'fotos-productos-app.js');

    const origFotosMod = fs.readFileSync(fotosMod, 'utf8');
    const origGsMod = fs.readFileSync(gsMod, 'utf8');
    const fotosBundleShaBefore = sha256(fs.readFileSync(fotosBundle, 'utf8'));

    fs.writeFileSync(fotosMod, origFotosMod + '\n// pending edit\n', 'utf8');
    fs.rmSync(gsMod);

    const atomicFail = runBuildCli(['--root', tmpRoot]);
    assert.equal(atomicFail.status, 1, 'Expected build to fail when bundle 2 has missing module');
    assert.match(atomicFail.stderr, /^ERROR: \[apps-script\] Missing module file:/m);
    assert.doesNotMatch(atomicFail.stderr, /at file:\/\//);

    const fotosBundleShaAfter = sha256(fs.readFileSync(fotosBundle, 'utf8'));
    assert.equal(
      fotosBundleShaAfter,
      fotosBundleShaBefore,
      'Atomic build failure must leave bundle 1 (fotos-productos-app.js) untouched on disk'
    );

    // 4) Restore bundle 2 (bundle 1 still drifted vs root) -> --check --verify-syntax fails exit 1 but prints SYNTAX SUMMARY
    fs.writeFileSync(gsMod, origGsMod, 'utf8');
    const combo = runBuildCli(['--root', tmpRoot, '--check', '--verify-syntax']);
    assert.equal(combo.status, 1, 'Expected exit 1 when --check detects drift');
    assert.match(combo.stderr, /CHECK FAIL: \[fotos\] Drift detected/);
    assert.match(combo.stdout, /SYNTAX SUMMARY: 31 modules \+ 3 bundles passed/);
  });
});

test('CI workflow enforces build-bundles.mjs --check --verify-syntax and robots.txt disallows /src/ and /scripts/', () => {
  const ciYaml = fs.readFileSync(path.join(REPO_ROOT, '.github/workflows/test.yml'), 'utf8');
  assert.match(
    ciYaml,
    /node scripts\/build-bundles\.mjs --check --verify-syntax/,
    '.github/workflows/test.yml must run node scripts/build-bundles.mjs --check --verify-syntax'
  );

  const robots = fs.readFileSync(path.join(REPO_ROOT, 'robots.txt'), 'utf8');
  const wildcardIdx = robots.indexOf('User-agent: *');
  assert.ok(wildcardIdx >= 0, 'robots.txt must have a User-agent: * section');
  const wildcardSection = robots.slice(wildcardIdx);
  assert.match(
    wildcardSection,
    /^Disallow:\s*\/src\/\s*$/m,
    'robots.txt must disallow /src/ under User-agent: *'
  );
  assert.match(
    wildcardSection,
    /^Disallow:\s*\/scripts\/\s*$/m,
    'robots.txt must disallow /scripts/ under User-agent: *'
  );
});
