// SALMO.DEV — Decoupled Reads Verification Test Suite
// Proves SALMO can read prediction ledger, daily picks, and validation summaries
// entirely independently of HandicapLab filesystem presence.

const test = require('node:test');
const assert = require('node:assert');
const path = require('node:path');
const fs = require('fs');
const ts = require('typescript');
const Module = require('module');

// Module resolution for '@/...' aliases
const origResolveFilename = Module._resolveFilename;
Module._resolveFilename = function (request, parent, isMain, options) {
  if (typeof request === 'string' && request.startsWith('@/')) {
    const mapped = path.join(process.cwd(), 'src', request.slice(2));
    for (const candidate of [mapped, `${mapped}.ts`, `${mapped}.tsx`, path.join(mapped, 'index.ts')]) {
      if (fs.existsSync(candidate)) {
        return origResolveFilename.call(this, candidate, parent, isMain, options);
      }
    }
  }
  return origResolveFilename.call(this, request, parent, isMain, options);
};

// TypeScript require hook with JSON module support
require.extensions['.ts'] = function (module, filename) {
  const content = fs.readFileSync(filename, 'utf8');
  const compiled = ts.transpileModule(content, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      esModuleInterop: true,
      resolveJsonModule: true,
    },
  });
  module._compile(compiled.outputText, filename);
};

const { LocalHandicapLabAdapter, DatabaseHandicapLabAdapter } = require('../src/contracts/handicapLabAdapter.ts');
const { HandicapLabClient } = require('../src/contracts/handicapLabClient.ts');

test('Decoupled Reads: LocalHandicapLabAdapter reads SalmoSync from internal sync ledger', async () => {
  const adapter = new LocalHandicapLabAdapter();
  const syncData = await adapter.getSalmoSync();
  assert.ok(syncData !== null, 'SalmoSync must return internal sync data');
  assert.strictEqual(syncData.success, true);
  assert.ok(Array.isArray(syncData.predictions), 'Internal sync predictions must be an array');
  assert.ok(syncData.counts.totalArchived > 0, 'Internal sync records count must be > 0');
});

test('Decoupled Reads: LocalHandicapLabAdapter reads LiveValidationSummary from internal storage', async () => {
  const adapter = new LocalHandicapLabAdapter();
  const summary = await adapter.getLiveValidationSummary();
  assert.ok(summary !== null, 'Live validation summary must load from internal SALMO data/verification');
  assert.ok(summary.validationStatus || summary.matrix || summary.generatedAt, 'Summary must contain validation metrics');
});

test('Decoupled Reads: LocalHandicapLabAdapter fails gracefully when dataDir is absent', async () => {
  // Override data directory to non-existent path
  const adapter = new LocalHandicapLabAdapter('C:\\non_existent_path_handicaplab');
  const records = await adapter.getAllRecords();
  assert.deepStrictEqual(records, [], 'Must return empty array without crashing');
});

test('Decoupled Reads: HandicapLabClient returns empty array when directory is absent', () => {
  const dir = HandicapLabClient.getDataDirectory();
  // In isolated environment without override, it returns null or local mirrored
  if (!dir) {
    const records = HandicapLabClient.getAllRecords();
    assert.deepStrictEqual(records, [], 'Must return empty records without throwing');
  }
});
