// ============================================================================
// CRON REQUEST AUTHENTICATION & OIDC VERIFICATION (SALMO HARDENED)
// ============================================================================
// Location: src/lib/auth/cronAuth.ts
//
// Strictly enforces cryptographic verification of Google Cloud Scheduler
// OIDC ID tokens and timing-safe Bearer CRON_SECRET verification.
//
// Invariants:
// 1. Never trust decoded JWT claims without cryptographic signature verification.
// 2. Prohibit query-parameter authentication (?key=... / ?token=...).
// 3. Verify signature against Google certificates via google-auth-library.
// 4. Validate exact issuer, exact audience, expiration, and authorized email.
// 5. Constant-time secret comparison to prevent timing-oracle attacks.
// 6. Fail closed in all environments if credentials fail.
// ============================================================================

import crypto from 'crypto';
import { OAuth2Client } from 'google-auth-library';
import type { NextRequest } from 'next/server';

export interface CronAuthResult {
  authorized: boolean;
  reason?: string;
  identity?: string;
}

export const CANONICAL_SALMO_AUDIENCE =
  process.env.SALMO_OIDC_AUDIENCE ||
  process.env.NEXT_PUBLIC_APP_URL ||
  'https://salmo.dev';

export const CANONICAL_SALMO_SCHEDULER_SA =
  process.env.CRON_SERVICE_ACCOUNT_EMAIL ||
  'handicaplab-run@handicap-salmo.iam.gserviceaccount.com';

function timingSafeCompare(a: string, b: string): boolean {
  if (!a || !b) return false;
  // Use SHA-256 fixed-length buffers to eliminate length-leakage timing attacks
  const hashA = crypto.createHash('sha256').update(a, 'utf8').digest();
  const hashB = crypto.createHash('sha256').update(b, 'utf8').digest();
  return crypto.timingSafeEqual(hashA, hashB);
}

export interface IdTokenVerifier {
  verifyIdToken(options: { idToken: string; audience: string | string[] }): Promise<{
    getPayload(): any;
  }>;
}

let defaultVerifier: IdTokenVerifier = new OAuth2Client();

/**
 * Dependency injection hook for deterministic unit tests.
 */
export function setIdTokenVerifierForTesting(verifier: IdTokenVerifier | null): void {
  defaultVerifier = verifier || new OAuth2Client();
}

/**
 * Authenticates an incoming cron request using either:
 * A) Timing-safe Bearer CRON_SECRET comparison.
 * B) Cryptographically verified Google Cloud Scheduler OIDC ID Token.
 *
 * Query-parameter authentication (?key=... / ?token=...) is strictly prohibited.
 */
export async function verifyCronRequest(
  request: NextRequest | Request,
  expectedAudience: string = CANONICAL_SALMO_AUDIENCE,
  authorizedEmail: string = CANONICAL_SALMO_SCHEDULER_SA
): Promise<CronAuthResult> {
  // 1. Strictly reject query parameters containing credentials to prevent secret leakage in logs
  const urlObj = new URL(request.url);
  if (urlObj.searchParams.has('key') || urlObj.searchParams.has('token') || urlObj.searchParams.has('secret')) {
    return {
      authorized: false,
      reason: 'QUERY_PARAMETER_AUTH_PROHIBITED',
    };
  }

  const authHeader = request.headers.get('authorization')?.trim();

  // 2. Enforce Bearer token header
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return {
      authorized: false,
      reason: 'MISSING_OR_MALFORMED_AUTHORIZATION_HEADER',
    };
  }

  const token = authHeader.slice(7).trim();
  if (!token) {
    return {
      authorized: false,
      reason: 'EMPTY_BEARER_TOKEN',
    };
  }

  // 3. Direct match with configured CRON_SECRET (timing-safe)
  const cronSecret = process.env.CRON_SECRET?.trim();
  if (cronSecret && timingSafeCompare(token, cronSecret)) {
    return {
      authorized: true,
      identity: 'bearer_cron_secret',
    };
  }

  // 4. Google Cloud Scheduler OIDC ID Token verification
  try {
    const ticket = await defaultVerifier.verifyIdToken({
      idToken: token,
      audience: expectedAudience,
    });

    const payload = ticket.getPayload();
    if (!payload) {
      return {
        authorized: false,
        reason: 'NULL_TOKEN_PAYLOAD',
      };
    }

    // A. Validate Issuer
    const isGoogleIssuer =
      payload.iss === 'https://accounts.google.com' ||
      payload.iss === 'accounts.google.com';
    if (!isGoogleIssuer) {
      return {
        authorized: false,
        reason: `INVALID_ISSUER: ${payload.iss}`,
      };
    }

    // B. Validate Audience
    const audMatches =
      payload.aud === expectedAudience ||
      (Array.isArray(payload.aud) && payload.aud.includes(expectedAudience));
    if (!audMatches) {
      return {
        authorized: false,
        reason: `AUDIENCE_MISMATCH: expected ${expectedAudience}, got ${payload.aud}`,
      };
    }

    // C. Validate Expiration
    const nowSec = Math.floor(Date.now() / 1000);
    if (!payload.exp || payload.exp <= nowSec) {
      return {
        authorized: false,
        reason: 'TOKEN_EXPIRED',
      };
    }

    // D. Validate Service Account Identity
    const emailMatches =
      payload.email === authorizedEmail ||
      (payload.email && payload.email.endsWith('@handicap-salmo.iam.gserviceaccount.com'));
    if (!emailMatches) {
      return {
        authorized: false,
        reason: `UNAUTHORIZED_SERVICE_ACCOUNT: ${payload.email}`,
      };
    }

    // E. Validate Email Verified claim
    if (payload.email_verified !== true && payload.email_verified !== 'true') {
      return {
        authorized: false,
        reason: 'EMAIL_NOT_VERIFIED',
      };
    }

    return {
      authorized: true,
      identity: payload.email,
    };
  } catch (error: any) {
    return {
      authorized: false,
      reason: `CRYPTOGRAPHIC_VERIFICATION_FAILED: ${error?.message || 'invalid token'}`,
    };
  }
}
