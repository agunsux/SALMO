/**
 * SALMO Entitlements & Feature Flags
 *
 * Client-safe feature flag for monetization.
 * Default is disabled unless explicitly set to true.
 */
export const MONETIZATION_ENABLED = process.env.NEXT_PUBLIC_MONETIZATION_ENABLED === 'true';
