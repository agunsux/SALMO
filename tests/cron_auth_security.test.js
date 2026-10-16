// ============================================================================
// SALMO — CRON AUTHENTICATION & SECURITY REGRESSION SUITE
// ============================================================================
// Tests cryptographic OIDC token verification, timing-safe Bearer secret checks,
// and prohibition of query-parameter tokens on SALMO cron endpoints.
// ============================================================================

const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const ts = require('typescript');

// Hook TypeScript compiler for ES2022 / Next.js modules in tests
require.extensions['.ts'] = (m, f) => {
  const source = fs.readFileSync(f, 'utf8');
  const out = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      esModuleInterop: true,
      resolveJsonModule: true,
    },
  });
  m._compile(out.outputText, f);
};

const {
  verifyCronRequest,
  setIdTokenVerifierForTesting,
  CANONICAL_SALMO_AUDIENCE,
  CANONICAL_SALMO_SCHEDULER_SA,
} = require('../src/lib/auth/cronAuth.ts');

const TEST_SECRET = 'salmo_super_secure_cron_secret_2026_test';

const validPayload = {
  iss: 'https://accounts.google.com',
  aud: CANONICAL_SALMO_AUDIENCE,
  exp: Math.floor(Date.now() / 1000) + 3600,
  email: CANONICAL_SALMO_SCHEDULER_SA,
  email_verified: true,
};

const defaultMockVerifier = {
  async verifyIdToken(options) {
    const { idToken, audience } = options;
    if (idToken === 'valid_google_oidc_jwt') {
      return { getPayload: () => ({ ...validPayload, aud: audience }) };
    }
    if (idToken === 'wrong_aud_token') {
      return { getPayload: () => ({ ...validPayload, aud: 'https://wrong-service.run.app' }) };
    }
    if (idToken === 'evil_issuer_token') {
      return { getPayload: () => ({ ...validPayload, iss: 'https://evil-issuer.com' }) };
    }
    if (idToken === 'expired_token') {
      return { getPayload: () => ({ ...validPayload, exp: Math.floor(Date.now() / 1000) - 60 }) };
    }
    if (idToken === 'unauthorized_sa_token') {
      return { getPayload: () => ({ ...validPayload, email: 'unauthorized-attacker@other-project.iam.gserviceaccount.com' }) };
    }
    if (idToken === 'unverified_email_token') {
      return { getPayload: () => ({ ...validPayload, email_verified: false }) };
    }
    throw new Error('Signature verification failed against Google certs');
  },
};

test.beforeEach(() => {
  process.env.CRON_SECRET = TEST_SECRET;
  setIdTokenVerifierForTesting(defaultMockVerifier);
});

test.afterEach(() => {
  delete process.env.CRON_SECRET;
  setIdTokenVerifierForTesting(null);
});

test('CronAuth: Rejects request missing Authorization header', async () => {
  const req = new Request('http://localhost:3000/api/cron/predict');
  const res = await verifyCronRequest(req);
  assert.strictEqual(res.authorized, false);
  assert.strictEqual(res.reason, 'MISSING_OR_MALFORMED_AUTHORIZATION_HEADER');
});

test('CronAuth: Rejects request with non-Bearer Authorization header', async () => {
  const req = new Request('http://localhost:3000/api/cron/predict', {
    headers: { Authorization: 'Basic dXNlcjpwYXNz' },
  });
  const res = await verifyCronRequest(req);
  assert.strictEqual(res.authorized, false);
  assert.strictEqual(res.reason, 'MISSING_OR_MALFORMED_AUTHORIZATION_HEADER');
});

test('CronAuth: Rejects query-parameter credential attempts (?key=...)', async () => {
  const req = new Request(`http://localhost:3000/api/cron/predict?key=${TEST_SECRET}`, {
    headers: { Authorization: `Bearer ${TEST_SECRET}` },
  });
  const res = await verifyCronRequest(req);
  assert.strictEqual(res.authorized, false);
  assert.strictEqual(res.reason, 'QUERY_PARAMETER_AUTH_PROHIBITED');
});

test('CronAuth: Rejects query-parameter credential attempts (?token=...)', async () => {
  const req = new Request(`http://localhost:3000/api/cron/predict?token=${TEST_SECRET}`);
  const res = await verifyCronRequest(req);
  assert.strictEqual(res.authorized, false);
  assert.strictEqual(res.reason, 'QUERY_PARAMETER_AUTH_PROHIBITED');
});

test('CronAuth: Rejects invalid or forged Bearer secret', async () => {
  const req = new Request('http://localhost:3000/api/cron/predict', {
    headers: { Authorization: 'Bearer invalid_forged_secret_token' },
  });
  const res = await verifyCronRequest(req);
  assert.strictEqual(res.authorized, false);
  assert.ok(res.reason.includes('CRYPTOGRAPHIC_VERIFICATION_FAILED'));
});

test('CronAuth: Authorizes legitimate Bearer CRON_SECRET with timingSafeCompare', async () => {
  const req = new Request('http://localhost:3000/api/cron/predict', {
    headers: { Authorization: `Bearer ${TEST_SECRET}` },
  });
  const res = await verifyCronRequest(req);
  assert.strictEqual(res.authorized, true);
  assert.strictEqual(res.identity, 'bearer_cron_secret');
});

test('CronAuth: Authorizes valid Google Cloud Scheduler OIDC ID Token', async () => {
  const req = new Request('http://localhost:3000/api/cron/predict', {
    headers: { Authorization: 'Bearer valid_google_oidc_jwt' },
  });
  process.env.CRON_SECRET = 'different_secret';

  const res = await verifyCronRequest(req);
  assert.strictEqual(res.authorized, true);
  assert.strictEqual(res.identity, CANONICAL_SALMO_SCHEDULER_SA);
});

test('CronAuth: Rejects OIDC token with invalid issuer', async () => {
  const req = new Request('http://localhost:3000/api/cron/predict', {
    headers: { Authorization: 'Bearer evil_issuer_token' },
  });
  process.env.CRON_SECRET = 'different_secret';

  const res = await verifyCronRequest(req);
  assert.strictEqual(res.authorized, false);
  assert.ok(res.reason.includes('INVALID_ISSUER'));
});

test('CronAuth: Rejects OIDC token with audience mismatch', async () => {
  const req = new Request('http://localhost:3000/api/cron/predict', {
    headers: { Authorization: 'Bearer wrong_aud_token' },
  });
  process.env.CRON_SECRET = 'different_secret';

  const res = await verifyCronRequest(req);
  assert.strictEqual(res.authorized, false);
  assert.ok(res.reason.includes('AUDIENCE_MISMATCH'));
});

test('CronAuth: Rejects expired OIDC token', async () => {
  const req = new Request('http://localhost:3000/api/cron/predict', {
    headers: { Authorization: 'Bearer expired_token' },
  });
  process.env.CRON_SECRET = 'different_secret';

  const res = await verifyCronRequest(req);
  assert.strictEqual(res.authorized, false);
  assert.strictEqual(res.reason, 'TOKEN_EXPIRED');
});

test('CronAuth: Rejects unauthorized service account email', async () => {
  const req = new Request('http://localhost:3000/api/cron/predict', {
    headers: { Authorization: 'Bearer unauthorized_sa_token' },
  });
  process.env.CRON_SECRET = 'different_secret';

  const res = await verifyCronRequest(req);
  assert.strictEqual(res.authorized, false);
  assert.ok(res.reason.includes('UNAUTHORIZED_SERVICE_ACCOUNT'));
});

test('CronAuth: Rejects unverified email claim', async () => {
  const req = new Request('http://localhost:3000/api/cron/predict', {
    headers: { Authorization: 'Bearer unverified_email_token' },
  });
  process.env.CRON_SECRET = 'different_secret';

  const res = await verifyCronRequest(req);
  assert.strictEqual(res.authorized, false);
  assert.strictEqual(res.reason, 'EMAIL_NOT_VERIFIED');
});
