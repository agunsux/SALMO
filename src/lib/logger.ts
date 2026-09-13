// SALMO.DEV — Structured Server-Side Observability Logger
// Enforces JSON format in production and strict sanitization of API keys, tokens, and secrets.

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export interface LogContext {
  requestId?: string;
  endpoint?: string;
  latencyMs?: number;
  provider?: string;
  dataStatus?: string;
  errorCategory?: string;
  [key: string]: unknown;
}

export class Logger {
  private static readonly REDACTED_KEYS = new Set([
    'key',
    'apikey',
    'api_key',
    'secret',
    'token',
    'auth',
    'authorization',
    'password',
    'cookie',
    'cookies',
    'bearer',
    'credentials',
    'service_role',
    'service_role_key',
  ]);

  /**
   * Recursively redacts sensitive keys from log payloads.
   */
  public static sanitize(data: unknown, depth = 0): unknown {
    if (depth > 5 || data === null || data === undefined) {
      return data;
    }

    if (typeof data === 'string') {
      // Redact potential Bearer tokens or API keys embedded in strings
      if (data.toLowerCase().startsWith('bearer ') && data.length > 15) {
        return 'Bearer [REDACTED]';
      }
      return data;
    }

    if (Array.isArray(data)) {
      return data.map(item => this.sanitize(item, depth + 1));
    }

    if (typeof data === 'object') {
      const sanitized: Record<string, unknown> = {};
      for (const [key, value] of Object.entries(data as Record<string, unknown>)) {
        const lowerKey = key.toLowerCase();
        if (this.REDACTED_KEYS.has(lowerKey) || lowerKey.includes('secret') || lowerKey.includes('token') || lowerKey.includes('password')) {
          sanitized[key] = '[REDACTED]';
        } else {
          sanitized[key] = this.sanitize(value, depth + 1);
        }
      }
      return sanitized;
    }

    return data;
  }

  public static log(level: LogLevel, message: string, context?: LogContext): void {
    const isProduction = process.env.NODE_ENV === 'production';
    const timestamp = new Date().toISOString();
    const sanitizedContext = context ? (this.sanitize(context) as LogContext) : {};

    const payload = {
      timestamp,
      level: level.toUpperCase(),
      service: 'salmo-api',
      message,
      ...sanitizedContext,
    };

    if (isProduction) {
      const line = JSON.stringify(payload);
      if (level === 'error') {
        console.error(line);
      } else if (level === 'warn') {
        console.warn(line);
      } else {
        console.log(line);
      }
    } else {
      const prefix = `[${timestamp}] [${level.toUpperCase()}]`;
      const meta = context && Object.keys(context).length > 0 ? ` ${JSON.stringify(sanitizedContext)}` : '';
      if (level === 'error') {
        console.error(`${prefix} ${message}${meta}`);
      } else if (level === 'warn') {
        console.warn(`${prefix} ${message}${meta}`);
      } else {
        console.log(`${prefix} ${message}${meta}`);
      }
    }
  }

  public static info(message: string, context?: LogContext): void {
    this.log('info', message, context);
  }

  public static warn(message: string, context?: LogContext): void {
    this.log('warn', message, context);
  }

  public static error(message: string, context?: LogContext): void {
    this.log('error', message, context);
  }

  public static debug(message: string, context?: LogContext): void {
    if (process.env.NODE_ENV !== 'production' || process.env.LOG_LEVEL === 'debug') {
      this.log('debug', message, context);
    }
  }
}

