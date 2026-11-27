#!/usr/bin/env node
/**
 * Deterministic zero-dependency bundle assembler & drift/syntax verifier.
 *
 * Source-of-truth modules live under `src/{fotos,apps-script,inventario}/`.
 * Root deployable files (`fotos-productos-app.js`, `AppsScript_Creata_Drive_Sheets.gs`,
 * `inventario-app.js`) are assembled deterministically from `src/` so GitHub Pages,
 * Service Workers, Apps Script manual copy-paste deployment, and all existing tests
 * keep working with 100% behavior & byte identity.
 *
 * Usage:
 *   node scripts/build-bundles.mjs                     # Build all root bundles from src/
 *   node scripts/build-bundles.mjs --check             # Verify zero drift, missing modules, or orphans
 *   node scripts/build-bundles.mjs --verify-syntax     # Verify syntax of every module + root bundle
 *   node scripts/build-bundles.mjs --check --verify-syntax
 *   node scripts/build-bundles.mjs --root <dir> ...    # Target an alternate workspace directory
 */

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
export const DEFAULT_ROOT = path.resolve(__dirname, '..');

export const BUNDLES = [
  {
    id: 'fotos',
    outputFile: 'fotos-productos-app.js',
    srcDir: 'src/fotos',
    moduleExtension: '.js',
    syntaxMode: 'iife-body',
    header: "(function () {\n    'use strict';\n\n",
    separator: '\n',
    footer: '})();\n',
    modules: [
      '01-core-state-live-poll-and-api.js',
      '02-cache-auth-and-inbox-catalog.js',
      '03-sku-list-stage-and-gallery-ui.js',
      '04-upload-framing-local-folder-and-assign.js',
      '05-offline-idb-outbox-and-checkpoint.js',
      '06-split-dock-back-nav-and-init.js',
      '07-visual-covers-fabrics-woods-and-bootstrap.js',
    ],
  },
  {
    id: 'apps-script',
    outputFile: 'AppsScript_Creata_Drive_Sheets.gs',
    srcDir: 'src/apps-script',
    moduleExtension: '.gs',
    syntaxMode: 'global',
    header: '',
    separator: '\n',
    footer: '',
    modules: [
      '01-config-auth-bootstrap-and-catalog-sync.gs',
      '02-web-entrypoints-and-catalog-crud.gs',
      '03-inventory-setup-users-and-invitados.gs',
      '04-auth-tokens-directory-and-quotes-ledger.gs',
      '05-erp-wcf-client-submit-quote-and-pdf.gs',
      '06-erp-inventory-sync-autocomplete-and-clients.gs',
      '07-fotos-project-a-manager.gs',
      '08-audit-historial-and-seguimiento-sync.gs',
      '09-presence-sessions-and-product-overrides.gs',
      '10-demand-and-purchase-suggestions.gs',
      '11-kevin-archive-and-sales-analysis.gs',
    ],
  },
  {
    id: 'inventario',
    outputFile: 'inventario-app.js',
    srcDir: 'src/inventario',
    moduleExtension: '.js',
    syntaxMode: 'iife-body',
    header:
      "(function () {\n    'use strict';\n    if (window.CreataGuard && (window.CreataGuard.blocked || window.CreataGuard.isBlocked)) return;\n\n",
    separator: '\n',
    footer: '})();\n',
    modules: [
      '01-core-config-and-utils.js',
      '02-fabric-vocab-and-normalization.js',
      '03-categories-visual-swatches-and-ranking.js',
      '04-optfit-indexing-and-catalog-grid.js',
      '05-scanner-variants-and-detail-modal.js',
      '06-photo-upload-and-related-items.js',
      '07-auth-presence-fab-and-modules.js',
      '08a-quotes-roles-and-drafts.js',
      '08b-clients-cart-pdf-and-submit.js',
      '09-bt-wedge-live-sync-checkpoint-alerts-pwa.js',
      '10-split-dock-and-back-nav.js',
      '11-settings-visual-picker-demand-and-suggestions.js',
      '12-price-calculator-and-audit-exports.js',
    ],
  },
];

export function sha256(content) {
  return crypto.createHash('sha256').update(content, 'utf8').digest('hex');
}

function validateRootDir(rootDir) {
  let stat;
  try {
    stat = fs.statSync(rootDir);
  } catch {
    return { ok: false, error: `Root directory does not exist: ${rootDir}` };
  }
  if (!stat.isDirectory()) {
    return { ok: false, error: `Root path is not a directory: ${rootDir}` };
  }
  return { ok: true, error: null };
}

export function validateSrcTree(rootDir = DEFAULT_ROOT, bundles = BUNDLES) {
  const errors = [];
  const orphans = [];
  const srcRoot = path.join(rootDir, 'src');

  let srcStat;
  try {
    srcStat = fs.lstatSync(srcRoot);
  } catch {
    errors.push('[src] Missing source directory: src');
    return { ok: false, errors, orphans };
  }

  if (srcStat.isSymbolicLink()) {
    errors.push('[src] Source directory must not be a symlink: src');
    return { ok: false, errors, orphans };
  }

  if (!srcStat.isDirectory()) {
    errors.push('[src] Source path is not a directory: src');
    return { ok: false, errors, orphans };
  }

  const declaredTopDirs = new Set();
  for (const bundle of bundles) {
    const normalized = String(bundle.srcDir || '').split(path.sep).join('/');
    if (normalized.startsWith('src/')) {
      const topSegment = normalized.slice('src/'.length).split('/')[0];
      if (topSegment) declaredTopDirs.add(topSegment);
    }
  }

  const entries = fs
    .readdirSync(srcRoot, { withFileTypes: true })
    .sort((a, b) => a.name.localeCompare(b.name));

  for (const entry of entries) {
    const relPath = `src/${entry.name}`;
    if (entry.isSymbolicLink()) {
      orphans.push(relPath);
      errors.push(`[src] Orphan symlink not allowed in src/: ${relPath}`);
    } else if (!entry.isDirectory()) {
      orphans.push(relPath);
      errors.push(`[src] Orphan file not in any bundle manifest: ${relPath}`);
    } else if (!declaredTopDirs.has(entry.name)) {
      orphans.push(`${relPath}/`);
      errors.push(`[src] Orphan directory not declared in any bundle: ${relPath}/`);
    }
  }

  return {
    ok: errors.length === 0,
    errors,
    orphans,
  };
}

function listEntriesRecursive(dirPath, baseDir = dirPath) {
  const result = { files: [], symlinks: [], emptyDirs: [], other: [] };
  if (!fs.existsSync(dirPath)) return result;

  const entries = fs
    .readdirSync(dirPath, { withFileTypes: true })
    .sort((a, b) => a.name.localeCompare(b.name));

  for (const entry of entries) {
    const full = path.join(dirPath, entry.name);
    const rel = path.relative(baseDir, full).split(path.sep).join('/');

    if (entry.isSymbolicLink()) {
      result.symlinks.push(rel);
    } else if (entry.isDirectory()) {
      const sub = listEntriesRecursive(full, baseDir);
      const subHasContent =
        sub.files.length > 0 ||
        sub.symlinks.length > 0 ||
        sub.emptyDirs.length > 0 ||
        sub.other.length > 0;
      if (!subHasContent) {
        result.emptyDirs.push(rel);
      } else {
        result.files.push(...sub.files);
        result.symlinks.push(...sub.symlinks);
        result.emptyDirs.push(...sub.emptyDirs);
        result.other.push(...sub.other);
      }
    } else if (entry.isFile()) {
      result.files.push(rel);
    } else {
      result.other.push(rel);
    }
  }

  result.files.sort();
  result.symlinks.sort();
  result.emptyDirs.sort();
  result.other.sort();
  return result;
}

export function validateBundleManifest(bundle, rootDir = DEFAULT_ROOT) {
  const errors = [];
  const srcRoot = path.join(rootDir, bundle.srcDir);

  if (!Array.isArray(bundle.modules) || bundle.modules.length === 0) {
    errors.push(`[${bundle.id}] Manifest has no modules declared.`);
    return { ok: false, errors, orphans: [], duplicates: [], missing: [] };
  }

  let srcStat;
  try {
    srcStat = fs.lstatSync(srcRoot);
  } catch {
    srcStat = null;
  }

  if (!srcStat) {
    errors.push(`[${bundle.id}] Missing source directory: ${bundle.srcDir}`);
    return { ok: false, errors, orphans: [], duplicates: [], missing: [...bundle.modules] };
  }

  if (srcStat.isSymbolicLink() || !srcStat.isDirectory()) {
    errors.push(`[${bundle.id}] Source path is not a regular directory: ${bundle.srcDir}`);
    return { ok: false, errors, orphans: [], duplicates: [], missing: [] };
  }

  const seen = new Set();
  const duplicates = [];
  const missing = [];

  for (const relMod of bundle.modules) {
    if (seen.has(relMod)) {
      duplicates.push(relMod);
      errors.push(`[${bundle.id}] Duplicate manifest entry: ${relMod}`);
      continue;
    }
    seen.add(relMod);

    const modPath = path.join(srcRoot, relMod);
    let modStat;
    try {
      modStat = fs.lstatSync(modPath);
    } catch {
      modStat = null;
    }

    if (!modStat) {
      missing.push(relMod);
      errors.push(`[${bundle.id}] Missing module file: ${bundle.srcDir}/${relMod}`);
    } else if (modStat.isSymbolicLink()) {
      errors.push(`[${bundle.id}] Module file must not be a symlink: ${bundle.srcDir}/${relMod}`);
    } else if (!modStat.isFile() || modStat.size === 0) {
      errors.push(`[${bundle.id}] Empty or invalid module file: ${bundle.srcDir}/${relMod}`);
    }
  }

  const diskEntries = listEntriesRecursive(srcRoot);
  const orphanFiles = diskEntries.files.filter((f) => !seen.has(f));
  const orphanSymlinks = diskEntries.symlinks.filter((s) => !seen.has(s));
  const orphans = [
    ...orphanFiles,
    ...orphanSymlinks,
    ...diskEntries.emptyDirs.map((d) => `${d}/`),
    ...diskEntries.other,
  ];

  for (const orphan of orphanFiles) {
    errors.push(`[${bundle.id}] Orphan file not in manifest: ${bundle.srcDir}/${orphan}`);
  }
  for (const sym of orphanSymlinks) {
    errors.push(`[${bundle.id}] Orphan symlink not in manifest: ${bundle.srcDir}/${sym}`);
  }
  for (const dir of diskEntries.emptyDirs) {
    errors.push(`[${bundle.id}] Orphan empty directory not in manifest: ${bundle.srcDir}/${dir}/`);
  }
  for (const other of diskEntries.other) {
    errors.push(`[${bundle.id}] Unexpected non-regular entry not in manifest: ${bundle.srcDir}/${other}`);
  }

  return {
    ok: errors.length === 0,
    errors,
    orphans,
    duplicates,
    missing,
  };
}

export function assembleBundle(bundle, rootDir = DEFAULT_ROOT) {
  const manifestCheck = validateBundleManifest(bundle, rootDir);
  if (!manifestCheck.ok) {
    const err = new Error(manifestCheck.errors.join('\n'));
    err.details = manifestCheck;
    throw err;
  }

  const srcRoot = path.join(rootDir, bundle.srcDir);
  const parts = [];
  const moduleStats = [];

  for (const relMod of bundle.modules) {
    const modPath = path.join(srcRoot, relMod);
    const content = fs.readFileSync(modPath, 'utf8');
    const bytes = Buffer.byteLength(content, 'utf8');
    const lines = content.length === 0 ? 0 : content.split('\n').length - (content.endsWith('\n') ? 1 : 0);
    parts.push(content);
    moduleStats.push({
      file: `${bundle.srcDir}/${relMod}`,
      bytes,
      lines,
      sha256: sha256(content),
    });
  }

  const header = bundle.header || '';
  const separator = bundle.separator ?? '\n';
  const footer = bundle.footer || '';
  const content = header + parts.join(separator) + footer;
  const bytes = Buffer.byteLength(content, 'utf8');

  return {
    id: bundle.id,
    outputFile: bundle.outputFile,
    content,
    bytes,
    sha256: sha256(content),
    moduleStats,
  };
}

export function checkBundles({ rootDir = DEFAULT_ROOT, bundles = BUNDLES } = {}) {
  const rootCheck = validateRootDir(rootDir);
  if (!rootCheck.ok) {
    return {
      ok: false,
      results: [{ id: 'root', outputFile: rootDir, ok: false, errors: [rootCheck.error] }],
      errors: [rootCheck.error],
    };
  }

  const results = [];
  const errors = [];

  const treeCheck = validateSrcTree(rootDir, bundles);
  if (!treeCheck.ok) {
    errors.push(...treeCheck.errors);
    results.push({
      id: 'src',
      outputFile: 'src/',
      ok: false,
      errors: treeCheck.errors,
      orphans: treeCheck.orphans,
    });
  }

  for (const bundle of bundles) {
    const manifestCheck = validateBundleManifest(bundle, rootDir);
    if (!manifestCheck.ok) {
      errors.push(...manifestCheck.errors);
      results.push({
        id: bundle.id,
        outputFile: bundle.outputFile,
        ok: false,
        errors: manifestCheck.errors,
        orphans: manifestCheck.orphans,
        missing: manifestCheck.missing,
        duplicates: manifestCheck.duplicates,
      });
      continue;
    }

    const assembled = assembleBundle(bundle, rootDir);
    const outPath = path.join(rootDir, bundle.outputFile);
    if (!fs.existsSync(outPath)) {
      const msg = `[${bundle.id}] Missing root output bundle: ${bundle.outputFile}`;
      errors.push(msg);
      results.push({
        id: bundle.id,
        outputFile: bundle.outputFile,
        ok: false,
        errors: [msg],
        expectedSha256: assembled.sha256,
        actualSha256: null,
      });
      continue;
    }

    const diskContent = fs.readFileSync(outPath, 'utf8');
    const diskBytes = Buffer.byteLength(diskContent, 'utf8');
    const diskSha = sha256(diskContent);
    const matches = diskSha === assembled.sha256 && diskBytes === assembled.bytes && diskContent === assembled.content;

    if (!matches) {
      const msg =
        `[${bundle.id}] Drift detected in ${bundle.outputFile}: ` +
        `assembled (${assembled.bytes}B, ${assembled.sha256.slice(0, 12)}) != ` +
        `disk (${diskBytes}B, ${diskSha.slice(0, 12)}). Run: node scripts/build-bundles.mjs`;
      errors.push(msg);
    }

    results.push({
      id: bundle.id,
      outputFile: bundle.outputFile,
      ok: matches,
      moduleCount: bundle.modules.length,
      bytes: assembled.bytes,
      diskBytes,
      sha256: assembled.sha256,
      diskSha256: diskSha,
      errors: matches ? [] : [errors[errors.length - 1]],
    });
  }

  return {
    ok: errors.length === 0,
    results,
    errors,
  };
}

export function verifySyntax({ rootDir = DEFAULT_ROOT, bundles = BUNDLES } = {}) {
  const rootCheck = validateRootDir(rootDir);
  if (!rootCheck.ok) {
    return {
      ok: false,
      moduleCount: 0,
      bundleCount: 0,
      results: [{ id: 'root', ok: false, errors: [rootCheck.error] }],
      errors: [rootCheck.error],
    };
  }

  const results = [];
  const errors = [];
  let moduleCount = 0;
  let bundleCount = 0;

  const treeCheck = validateSrcTree(rootDir, bundles);
  if (!treeCheck.ok) {
    errors.push(...treeCheck.errors);
    results.push({ id: 'src', ok: false, errors: treeCheck.errors });
  }

  for (const bundle of bundles) {
    const manifestCheck = validateBundleManifest(bundle, rootDir);
    if (!manifestCheck.ok) {
      errors.push(...manifestCheck.errors);
      results.push({ id: bundle.id, ok: false, errors: manifestCheck.errors });
      continue;
    }

    const srcRoot = path.join(rootDir, bundle.srcDir);
    const bundleErrors = [];

    for (const relMod of bundle.modules) {
      const modRelPath = `${bundle.srcDir}/${relMod}`;
      const modPath = path.join(srcRoot, relMod);
      const src = fs.readFileSync(modPath, 'utf8');
      moduleCount += 1;
      try {
        if (bundle.syntaxMode === 'iife-body') {
          new vm.Script("'use strict';\n" + src, { filename: modRelPath });
        } else {
          new vm.Script(src, { filename: modRelPath });
        }
      } catch (err) {
        const msg = `[${bundle.id}] Syntax error in module ${modRelPath}: ${err.message}`;
        bundleErrors.push(msg);
        errors.push(msg);
      }
    }

    const assembled = assembleBundle(bundle, rootDir);
    bundleCount += 1;
    try {
      new vm.Script(assembled.content, { filename: bundle.outputFile });
    } catch (err) {
      const msg = `[${bundle.id}] Syntax error in assembled bundle ${bundle.outputFile}: ${err.message}`;
      bundleErrors.push(msg);
      errors.push(msg);
    }

    results.push({
      id: bundle.id,
      outputFile: bundle.outputFile,
      ok: bundleErrors.length === 0,
      modulesChecked: bundle.modules.length,
      errors: bundleErrors,
    });
  }

  return {
    ok: errors.length === 0,
    moduleCount,
    bundleCount,
    results,
    errors,
  };
}

export function buildBundles({ rootDir = DEFAULT_ROOT, bundles = BUNDLES } = {}) {
  const rootCheck = validateRootDir(rootDir);
  if (!rootCheck.ok) {
    throw new Error(rootCheck.error);
  }

  const errors = [];
  const treeCheck = validateSrcTree(rootDir, bundles);
  if (!treeCheck.ok) {
    errors.push(...treeCheck.errors);
  }

  const planned = [];
  for (const bundle of bundles) {
    try {
      const assembled = assembleBundle(bundle, rootDir);
      planned.push({
        bundle,
        assembled,
        outPath: path.join(rootDir, bundle.outputFile),
      });
    } catch (err) {
      errors.push(err.message);
    }
  }

  if (errors.length > 0) {
    throw new Error(errors.join('\n'));
  }

  const written = [];
  for (const { bundle, assembled, outPath } of planned) {
    fs.writeFileSync(outPath, assembled.content, 'utf8');
    written.push({
      id: bundle.id,
      outputFile: bundle.outputFile,
      moduleCount: bundle.modules.length,
      bytes: assembled.bytes,
      sha256: assembled.sha256,
    });
  }

  return { ok: true, written };
}

export function parseCliArgs(argv) {
  const opts = {
    check: false,
    verifySyntax: false,
    help: false,
    rootDir: DEFAULT_ROOT,
  };

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--check') {
      opts.check = true;
    } else if (arg === '--verify-syntax') {
      opts.verifySyntax = true;
    } else if (arg === '--help' || arg === '-h') {
      opts.help = true;
    } else if (arg === '--root') {
      const next = argv[i + 1];
      if (!next || next.startsWith('-')) {
        throw new Error('Missing value for --root');
      }
      opts.rootDir = path.resolve(next);
      i += 1;
    } else {
      throw new Error(`Unknown CLI argument: ${arg}`);
    }
  }

  return opts;
}

function runCli(argv) {
  let opts;
  try {
    opts = parseCliArgs(argv);
  } catch (err) {
    console.error(`ERROR: ${err.message}`);
    process.exit(2);
  }

  if (opts.help) {
    console.log(
      'Usage: node scripts/build-bundles.mjs [--check] [--verify-syntax] [--root <dir>]'
    );
    process.exit(0);
  }

  const rootCheck = validateRootDir(opts.rootDir);
  if (!rootCheck.ok) {
    console.error(`ERROR: ${rootCheck.error}`);
    process.exit(1);
  }

  if (!opts.check && !opts.verifySyntax) {
    let built;
    try {
      built = buildBundles({ rootDir: opts.rootDir });
    } catch (err) {
      const lines = String(err && err.message ? err.message : err)
        .split('\n')
        .filter(Boolean);
      for (const line of lines) {
        console.error(`ERROR: ${line}`);
      }
      process.exit(1);
    }
    for (const item of built.written) {
      console.log(
        `BUILT: ${item.outputFile} (${item.moduleCount} modules, ${item.bytes} bytes, sha256=${item.sha256})`
      );
    }
    process.exit(0);
  }

  let failed = false;

  if (opts.check) {
    const check = checkBundles({ rootDir: opts.rootDir });
    for (const r of check.results) {
      if (r.ok) {
        console.log(
          `CHECK OK: ${r.outputFile} (${r.moduleCount} modules, ${r.bytes} bytes, sha256=${r.sha256})`
        );
      } else {
        failed = true;
        for (const e of r.errors) console.error(`CHECK FAIL: ${e}`);
      }
    }
  }

  if (opts.verifySyntax) {
    const syn = verifySyntax({ rootDir: opts.rootDir });
    for (const r of syn.results) {
      if (r.ok) {
        console.log(
          `SYNTAX OK: ${r.outputFile} (${r.modulesChecked} modules + assembled bundle)`
        );
      } else {
        failed = true;
        for (const e of r.errors) console.error(`SYNTAX FAIL: ${e}`);
      }
    }
    if (syn.ok) {
      console.log(
        `SYNTAX SUMMARY: ${syn.moduleCount} modules + ${syn.bundleCount} bundles passed`
      );
    }
  }

  process.exit(failed ? 1 : 0);
}

const isMain =
  process.argv[1] && path.resolve(process.argv[1]) === path.resolve(__filename);
if (isMain) {
  runCli(process.argv.slice(2));
}
