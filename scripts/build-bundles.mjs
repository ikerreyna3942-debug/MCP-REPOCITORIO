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
];

export function sha256(content) {
  return crypto.createHash('sha256').update(content, 'utf8').digest('hex');
}

function listFilesRecursive(dirPath, baseDir = dirPath) {
  if (!fs.existsSync(dirPath)) return [];
  const entries = fs.readdirSync(dirPath, { withFileTypes: true });
  const results = [];
  for (const entry of entries) {
    const full = path.join(dirPath, entry.name);
    if (entry.isDirectory()) {
      results.push(...listFilesRecursive(full, baseDir));
    } else if (entry.isFile()) {
      results.push(path.relative(baseDir, full).split(path.sep).join('/'));
    }
  }
  return results.sort();
}

export function validateBundleManifest(bundle, rootDir = DEFAULT_ROOT) {
  const errors = [];
  const srcRoot = path.join(rootDir, bundle.srcDir);

  if (!Array.isArray(bundle.modules) || bundle.modules.length === 0) {
    errors.push(`[${bundle.id}] Manifest has no modules declared.`);
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
    if (!fs.existsSync(modPath)) {
      missing.push(relMod);
      errors.push(`[${bundle.id}] Missing module file: ${bundle.srcDir}/${relMod}`);
    } else {
      const stat = fs.statSync(modPath);
      if (!stat.isFile() || stat.size === 0) {
        errors.push(`[${bundle.id}] Empty or invalid module file: ${bundle.srcDir}/${relMod}`);
      }
    }
  }

  const diskFiles = listFilesRecursive(srcRoot);
  const orphans = diskFiles.filter((f) => !seen.has(f));
  for (const orphan of orphans) {
    errors.push(`[${bundle.id}] Orphan file not in manifest: ${bundle.srcDir}/${orphan}`);
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
  const results = [];
  const errors = [];

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
  const results = [];
  const errors = [];
  let moduleCount = 0;
  let bundleCount = 0;

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
          new Function("'use strict';\n" + src);
        } else {
          new Function(src);
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
      new Function(assembled.content);
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
  const written = [];

  for (const bundle of bundles) {
    const assembled = assembleBundle(bundle, rootDir);
    const outPath = path.join(rootDir, bundle.outputFile);
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
      if (!next) throw new Error('Missing value for --root');
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

  if (!opts.check && !opts.verifySyntax) {
    const built = buildBundles({ rootDir: opts.rootDir });
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
    if (!failed) {
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
