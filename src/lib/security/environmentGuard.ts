// src/lib/security/environmentGuard.ts
// SALMO.DEV — Fail-Closed Environment Guard & Database Identity Enforcer
// Prevents cross-environment credential leakage, accidental production writes,
// and silent production fallbacks.

export interface StagingEnvironmentConfig {
  stagingSupabaseUrl?: string;
  stagingSupabaseAnonKey?: string;
  stagingSupabaseServiceRoleKey?: string;
  stagingDatabaseUrl?: string;
  approvedStagingProjectRef?: string;
  prodSupabaseUrl?: string;
  prodAnonKey?: string;
  prodServiceRoleKey?: string;
}

export interface EnvironmentValidationResult {
  allowed: boolean;
  errorCode?:
    | 'MISSING_STAGING_CONFIG'
    | 'PRODUCTION_URL_DETECTED'
    | 'PRODUCTION_PROJECT_REF_COLLISION'
    | 'PRODUCTION_CREDENTIAL_IN_STAGING'
    | 'UNAPPROVED_STAGING_IDENTITY'
    | 'INVALID_URL_FORMAT';
  errorMessage?: string;
  detectedStagingProjectRef?: string;
}

export class EnvironmentGuard {
  // Authoritative production project reference documented in EPIC 81/82/100G
  public static readonly KNOWN_PRODUCTION_PROJECT_REF = 'rgkrfzxipkrwqccfuqfq';
  public static readonly KNOWN_PRODUCTION_HOST = 'rgkrfzxipkrwqccfuqfq.supabase.co';

  /**
   * Extracts the Supabase project reference from a URL or connection string.
   */
  public static extractProjectRef(rawInput?: string): string | null {
    if (!rawInput || typeof rawInput !== 'string') return null;

    const trimmed = rawInput.trim().replace(/^["']|["']$/g, '');

    // Match https://<project-ref>.supabase.co
    const httpMatch = trimmed.match(/https?:\/\/([a-z0-9_-]+)\.supabase\.co/i);
    if (httpMatch && httpMatch[1]) {
      return httpMatch[1].toLowerCase();
    }

    // Match postgresql://postgres.<project-ref>:... or host=...
    const poolerMatch = trimmed.match(/postgres(?:ql)?:\/\/(?:[^:@]+(?:\.[^:@]+)?@)?([^:/]+)/i);
    if (poolerMatch && poolerMatch[1]) {
      const host = poolerMatch[1].toLowerCase();
      // e.g. aws-0-ap-southeast-1.pooler.supabase.com with username postgres.<project-ref>
      const userMatch = trimmed.match(/postgres(?:ql)?:\/\/([^:]+):/i);
      if (userMatch && userMatch[1] && userMatch[1].includes('.')) {
        return userMatch[1].split('.')[1].toLowerCase();
      }
      if (host.includes('.')) {
        const sub = host.split('.')[0];
        if (sub !== 'db' && sub !== 'aws-0' && sub !== 'postgres') {
          return sub;
        }
      }
    }

    return null;
  }

  /**
   * Evaluates if a given input targets the production environment.
   */
  public static isProductionTarget(rawInput?: string): boolean {
    if (!rawInput) return false;
    const ref = this.extractProjectRef(rawInput);
    if (ref && ref.toLowerCase() === this.KNOWN_PRODUCTION_PROJECT_REF.toLowerCase()) {
      return true;
    }
    const lower = rawInput.toLowerCase();
    return lower.includes(this.KNOWN_PRODUCTION_PROJECT_REF.toLowerCase()) ||
           lower.includes(this.KNOWN_PRODUCTION_HOST.toLowerCase());
  }

  /**
   * Validates staging environment configuration against all fail-closed criteria.
   */
  public static validateStagingConfig(config: StagingEnvironmentConfig): EnvironmentValidationResult {
    const stagingUrl = config.stagingSupabaseUrl;
    const stagingAnon = config.stagingSupabaseAnonKey;
    const stagingService = config.stagingSupabaseServiceRoleKey;
    const stagingDb = config.stagingDatabaseUrl;

    // SCENARIO 1: Staging variables missing
    if (!stagingUrl && !stagingDb) {
      return {
        allowed: false,
        errorCode: 'MISSING_STAGING_CONFIG',
        errorMessage: 'Staging configuration is missing: STAGING_SUPABASE_URL or STAGING_DATABASE_URL required.',
      };
    }

    // SCENARIO 2 & 3: Staging URL points to production or project ref collision
    if (stagingUrl) {
      if (this.isProductionTarget(stagingUrl)) {
        return {
          allowed: false,
          errorCode: 'PRODUCTION_URL_DETECTED',
          errorMessage: 'CRITICAL SECURITY BREACH: STAGING_SUPABASE_URL points to the LIVE PRODUCTION project.',
        };
      }

      const stagingRef = this.extractProjectRef(stagingUrl);
      if (stagingRef && stagingRef === this.KNOWN_PRODUCTION_PROJECT_REF) {
        return {
          allowed: false,
          errorCode: 'PRODUCTION_PROJECT_REF_COLLISION',
          errorMessage: `CRITICAL: Staging project reference (${stagingRef}) equals the PRODUCTION project reference.`,
        };
      }
    }

    // SCENARIO 4: Staging Database URL points to production
    if (stagingDb) {
      if (this.isProductionTarget(stagingDb)) {
        return {
          allowed: false,
          errorCode: 'PRODUCTION_URL_DETECTED',
          errorMessage: 'CRITICAL SECURITY BREACH: STAGING_DATABASE_URL targets the LIVE PRODUCTION database host.',
        };
      }
    }

    // SCENARIO 5: Production credentials supplied to staging process
    const prodService = config.prodServiceRoleKey || process.env.SUPABASE_SERVICE_ROLE_KEY;
    const prodAnon = config.prodAnonKey || process.env.SUPABASE_ANON_KEY;

    if (stagingService && prodService && stagingService.trim() === prodService.trim()) {
      return {
        allowed: false,
        errorCode: 'PRODUCTION_CREDENTIAL_IN_STAGING',
        errorMessage: 'CRITICAL: Production SUPABASE_SERVICE_ROLE_KEY was supplied to STAGING_SUPABASE_SERVICE_ROLE_KEY.',
      };
    }

    if (stagingAnon && prodAnon && stagingAnon.trim() === prodAnon.trim()) {
      return {
        allowed: false,
        errorCode: 'PRODUCTION_CREDENTIAL_IN_STAGING',
        errorMessage: 'CRITICAL: Production SUPABASE_ANON_KEY was supplied to STAGING_SUPABASE_ANON_KEY.',
      };
    }

    // SCENARIO 6: Staging identity must match approved staging identity if specified
    const detectedRef = this.extractProjectRef(stagingUrl || stagingDb);
    if (config.approvedStagingProjectRef && detectedRef) {
      if (detectedRef.toLowerCase() !== config.approvedStagingProjectRef.toLowerCase()) {
        return {
          allowed: false,
          errorCode: 'UNAPPROVED_STAGING_IDENTITY',
          errorMessage: `Detected staging reference (${detectedRef}) does not match approved staging reference (${config.approvedStagingProjectRef}).`,
        };
      }
    }

    return {
      allowed: true,
      detectedStagingProjectRef: detectedRef || 'unextracted',
    };
  }

  /**
   * Asserts that production writes are strictly blocked.
   */
  public static assertProductionWriteBlocked(target: string, operation: string = 'WRITE'): void {
    if (this.isProductionTarget(target)) {
      throw new Error(
        `[EnvironmentGuard] FATAL: ${operation} operation against PRODUCTION project (${this.KNOWN_PRODUCTION_PROJECT_REF}) is STRICTLY FORBIDDEN.`
      );
    }
  }

  /**
   * Safely logs environment metadata without exposing secrets.
   */
  public static getSanitizedEnvironmentSummary(config: StagingEnvironmentConfig): Record<string, string> {
    const stagingRef = this.extractProjectRef(config.stagingSupabaseUrl || config.stagingDatabaseUrl);
    return {
      mode: 'STAGING_ISOLATION',
      productionProjectRef: this.KNOWN_PRODUCTION_PROJECT_REF,
      stagingProjectRef: stagingRef || 'NOT_CONFIGURED',
      isSeparateProject: stagingRef ? String(stagingRef !== this.KNOWN_PRODUCTION_PROJECT_REF) : 'UNKNOWN',
      hasExplicitStagingUrl: String(Boolean(config.stagingSupabaseUrl)),
      hasExplicitStagingDb: String(Boolean(config.stagingDatabaseUrl)),
      hasServiceRoleKey: String(Boolean(config.stagingSupabaseServiceRoleKey)),
      hasAnonKey: String(Boolean(config.stagingSupabaseAnonKey)),
    };
  }
}
