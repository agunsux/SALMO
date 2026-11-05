// tests/epic100g1_environment_guard.test.js
// SALMO EPIC 100G.1: Fail-Closed Environment Guard & Isolation Validation
// Verifies that all 7 isolation scenarios strictly enforce fail-closed boundaries.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const ts = require('typescript');
const Module = require('module');

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

const { EnvironmentGuard } = require('../src/lib/security/environmentGuard.ts');

const KNOWN_PROD_REF = 'rgkrfzxipkrwqccfuqfq';
const PROD_KEY_MOCK = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.prod_service_mock';
const STAGING_KEY_MOCK = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.staging_service_mock';

test('EPIC 100G.1 — Scenario 1: Staging variables missing must fail-closed (BLOCK)', () => {
  const res = EnvironmentGuard.validateStagingConfig({});
  assert.strictEqual(res.allowed, false);
  assert.strictEqual(res.errorCode, 'MISSING_STAGING_CONFIG');
});

test('EPIC 100G.1 — Scenario 2: Staging URL points to production must fail-closed (BLOCK)', () => {
  const res = EnvironmentGuard.validateStagingConfig({
    stagingSupabaseUrl: `https://${KNOWN_PROD_REF}.supabase.co`,
  });
  assert.strictEqual(res.allowed, false);
  assert.strictEqual(res.errorCode, 'PRODUCTION_URL_DETECTED');
});

test('EPIC 100G.1 — Scenario 3: Staging project reference equals production must fail-closed (BLOCK)', () => {
  const res = EnvironmentGuard.validateStagingConfig({
    stagingSupabaseUrl: `https://${KNOWN_PROD_REF}.supabase.co/`,
  });
  assert.strictEqual(res.allowed, false);
  assert.ok(res.errorCode === 'PRODUCTION_URL_DETECTED' || res.errorCode === 'PRODUCTION_PROJECT_REF_COLLISION');
});

test('EPIC 100G.1 — Scenario 4: Database host targets production pooler must fail-closed (BLOCK)', () => {
  const res = EnvironmentGuard.validateStagingConfig({
    stagingDatabaseUrl: `postgresql://postgres.${KNOWN_PROD_REF}:secret@aws-0-ap-southeast-1.pooler.supabase.com:6543/postgres`,
  });
  assert.strictEqual(res.allowed, false);
  assert.strictEqual(res.errorCode, 'PRODUCTION_URL_DETECTED');
});

test('EPIC 100G.1 — Scenario 5: Production credentials supplied to staging process must fail-closed (BLOCK)', () => {
  const res = EnvironmentGuard.validateStagingConfig({
    stagingSupabaseUrl: 'https://salmo-staging-abc12345.supabase.co',
    stagingSupabaseServiceRoleKey: PROD_KEY_MOCK,
    prodServiceRoleKey: PROD_KEY_MOCK,
  });
  assert.strictEqual(res.allowed, false);
  assert.strictEqual(res.errorCode, 'PRODUCTION_CREDENTIAL_IN_STAGING');
});

test('EPIC 100G.1 — Scenario 6: Unapproved staging identity must fail-closed (BLOCK)', () => {
  const res = EnvironmentGuard.validateStagingConfig({
    stagingSupabaseUrl: 'https://rogue-unknown-project.supabase.co',
    approvedStagingProjectRef: 'approved-staging-project-999',
  });
  assert.strictEqual(res.allowed, false);
  assert.strictEqual(res.errorCode, 'UNAPPROVED_STAGING_IDENTITY');
});

test('EPIC 100G.1 — Scenario 7: Verified genuine staging identity is permitted (ALLOW)', () => {
  const res = EnvironmentGuard.validateStagingConfig({
    stagingSupabaseUrl: 'https://salmo-staging-v1.supabase.co',
    stagingSupabaseAnonKey: 'staging_anon_valid_key',
    stagingSupabaseServiceRoleKey: STAGING_KEY_MOCK,
    prodServiceRoleKey: PROD_KEY_MOCK,
    approvedStagingProjectRef: 'salmo-staging-v1',
  });
  assert.strictEqual(res.allowed, true);
  assert.strictEqual(res.detectedStagingProjectRef, 'salmo-staging-v1');
});

test('EPIC 100G.1 — Scenario 8: Production write attempt during this epic throws fatal exception (BLOCK)', () => {
  assert.throws(
    () => {
      EnvironmentGuard.assertProductionWriteBlocked(`https://${KNOWN_PROD_REF}.supabase.co`, 'MIGRATION_DDL');
    },
    /FATAL: MIGRATION_DDL operation against PRODUCTION project \(rgkrfzxipkrwqccfuqfq\) is STRICTLY FORBIDDEN/
  );
});

test('EPIC 100G.1 — Scenario 9: Safe logging of environment summary suppresses all secrets', () => {
  const summary = EnvironmentGuard.getSanitizedEnvironmentSummary({
    stagingSupabaseUrl: 'https://salmo-staging-v1.supabase.co',
    stagingSupabaseServiceRoleKey: 'SUPER_SECRET_KEY_12345',
  });
  assert.strictEqual(summary.mode, 'STAGING_ISOLATION');
  assert.strictEqual(summary.stagingProjectRef, 'salmo-staging-v1');
  assert.strictEqual(summary.productionProjectRef, KNOWN_PROD_REF);
  assert.strictEqual(summary.isSeparateProject, 'true');
  assert.strictEqual(summary.hasServiceRoleKey, 'true');
  // Confirm secret string is nowhere in the logged summary values
  const stringified = JSON.stringify(summary);
  assert.ok(!stringified.includes('SUPER_SECRET_KEY_12345'));
});
