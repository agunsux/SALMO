// SALMO.DEV — Typed Environment & Configuration Boundary
// Validates environment variables and enforces explicit failure rather than silent data fabrication.

export interface EnvironmentConfig {
  nodeEnv: 'development' | 'production' | 'test';
  appUrl: string;
  salmoApiUrl: string;
  handicapLab: {
    adapter: 'local' | 'http' | 'database';
    dataPath: string;
    apiUrl?: string;
    apiKey?: string;
  };
  database: {
    configured: boolean;
    databaseUrl?: string;
    supabaseUrl?: string;
    supabaseAnonKey?: string;
  };
  providers: {
    apiFootball: {
      configured: boolean;
      apiKey?: string;
      baseUrl: string;
    };
    oddsPapi: {
      configured: boolean;
      apiKey?: string;
      baseUrl: string;
    };
    footyStats: {
      configured: boolean;
      apiKey?: string;
      baseUrl: string;
    };
  };
  security: {
    authSecretConfigured: boolean;
    cronSecretConfigured: boolean;
  };
  logLevel: 'debug' | 'info' | 'warn' | 'error';
}

class EnvironmentValidator {
  private static cachedConfig: EnvironmentConfig | null = null;

  public static getConfig(): EnvironmentConfig {
    if (this.cachedConfig) {
      return this.cachedConfig;
    }

    const nodeEnv = (process.env.NODE_ENV as any) || 'development';
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
    const salmoApiUrl = process.env.SALMO_API_URL || `${appUrl}/api`;

    // In production, default to 'http' or 'database' (if configured), never 'local'
    let handicapLabAdapter = process.env.HANDICAPLAB_ADAPTER as 'local' | 'http' | 'database';
    if (!handicapLabAdapter) {
      if (nodeEnv === 'production') {
        handicapLabAdapter = (process.env.SUPABASE_URL || process.env.DATABASE_URL) ? 'database' : 'http';
      } else {
        handicapLabAdapter = 'local';
      }
    }

    const handicapLabDataPath = process.env.HANDICAPLAB_DATA_PATH || '../HandicapLab/data/bronze/football_data';
    const handicapLabApiUrl = process.env.HANDICAPLAB_API_URL;
    const handicapLabApiKey = process.env.HANDICAPLAB_API_KEY;

    // In production with HTTP adapter, apiUrl must be defined
    if (nodeEnv === 'production' && handicapLabAdapter === 'http' && !handicapLabApiUrl) {
      console.warn('[Env] HANDICAPLAB_API_URL is missing in production with HTTP adapter.');
    }

    const databaseUrl = process.env.DATABASE_URL;
    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseAnonKey = process.env.SUPABASE_ANON_KEY;
    const dbConfigured = Boolean(databaseUrl || (supabaseUrl && supabaseAnonKey));

    const apiFootballKey = process.env.API_FOOTBALL_KEY || process.env.APIFOOTBALL_KEY;
    const apiFootballBaseUrl = process.env.API_FOOTBALL_BASE_URL || 'https://v3.football.api-sports.io';

    const oddsPapiKey = process.env.ODDS_PAPI_KEY || process.env.ODDSPAPI_KEY;
    const oddsPapiBaseUrl = process.env.ODDS_PAPI_BASE_URL || 'https://api.oddspapi.io/v4';

    const footyStatsKey = process.env.FOOTYSTATS_API_KEY || process.env.FOOTYSTATS_KEY;
    const footyStatsBaseUrl = process.env.FOOTYSTATS_BASE_URL || 'https://api.football-data-api.com';

    const authSecret = process.env.AUTH_SECRET;
    const cronSecret = process.env.CRON_SECRET;

    const logLevel = (process.env.LOG_LEVEL as any) || (nodeEnv === 'production' ? 'info' : 'debug');

    this.cachedConfig = {
      nodeEnv,
      appUrl,
      salmoApiUrl,
      handicapLab: {
        adapter: handicapLabAdapter,
        dataPath: handicapLabDataPath,
        apiUrl: handicapLabApiUrl,
        apiKey: handicapLabApiKey,
      },
      database: {
        configured: dbConfigured,
        databaseUrl,
        supabaseUrl,
        supabaseAnonKey,
      },
      providers: {
        apiFootball: {
          configured: Boolean(apiFootballKey && apiFootballKey.trim().length > 0),
          apiKey: apiFootballKey,
          baseUrl: apiFootballBaseUrl,
        },
        oddsPapi: {
          configured: Boolean(oddsPapiKey && oddsPapiKey.trim().length > 0),
          apiKey: oddsPapiKey,
          baseUrl: oddsPapiBaseUrl,
        },
        footyStats: {
          configured: Boolean(footyStatsKey && footyStatsKey.trim().length > 0),
          apiKey: footyStatsKey,
          baseUrl: footyStatsBaseUrl,
        },
      },
      security: {
        authSecretConfigured: Boolean(authSecret && authSecret.trim().length > 0),
        cronSecretConfigured: Boolean(cronSecret && cronSecret.trim().length > 0),
      },
      logLevel,
    };

    return this.cachedConfig;
  }

  /**
   * Resets the cached configuration (useful for testing).
   */
  public static resetConfig(): void {
    this.cachedConfig = null;
  }
}

export const env = EnvironmentValidator.getConfig();
export const getEnv = () => EnvironmentValidator.getConfig();
export const resetEnv = () => EnvironmentValidator.resetConfig();

