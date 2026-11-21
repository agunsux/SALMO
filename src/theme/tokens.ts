/**
 * SALMO Design Tokens — Quant Terminal System
 *
 * OddsJam-inspired trading density with BettingStats color classification.
 * Optimized for high-frequency pre-match odds surveillance across Asian Handicap,
 * Over/Under, and Moneyline.
 */

export const TERMINAL_COLORS = {
  dark: {
    canvas: '#070B14',      // Deepest background / canvas
    card: '#0F1624',        // Sidebar, match cards, primary panels
    panel: '#121A2A',       // Nested tables, filter pills, secondary panels
    elevated: '#161F30',    // Hover states, active tabs, modals, drawers
    border: '#1E293B',      // Crisp 1px hairlines / grid borders
    borderSubtle: '#141D2C',// Muted separators
    textPrimary: '#F8FAFC', // Crisp white headers & critical values
    textSecondary: '#94A3B8', // Labels, subtitle text, table headers
    textMuted: '#64748B',   // Inactive states, metadata timestamps
    accentEmerald: '#10B981', // Positive edge (+EV), high cover rate
    accentEmeraldGlow: '#059669',
    accentAmber: '#F59E0B',   // Moderate lean (1.0% - 2.9% EV)
    accentRed: '#EF4444',     // Low signal / negative EV / pass
    accentCyan: '#06B6D4',    // Sharp closing line benchmark / liquidity
  },
  light: {
    canvas: '#F8FAFC',      // Crisp off-white canvas
    card: '#FFFFFF',        // Sidebar, match cards, white cards
    panel: '#F1F5F9',       // Nested panels, table stripes
    elevated: '#E2E8F0',    // Hover states, active tab backgrounds
    border: '#CBD5E1',      // High-contrast clean hairlines
    borderSubtle: '#E2E8F0',// Subtle separators
    textPrimary: '#0F172A', // Deep ink headers & bold metrics
    textSecondary: '#475569', // Secondary labels, descriptions
    textMuted: '#94A3B8',   // Inactive states, timestamps
    accentEmerald: '#059669', // Accessible Emerald-600 (WCAG AA >= 4.5:1)
    accentEmeraldGlow: '#10B981',
    accentAmber: '#D97706',   // High-contrast amber for light mode
    accentRed: '#DC2626',     // High-contrast red for light mode
    accentCyan: '#0891B2',    // Accessible cyan
  }
} as const;

export type ThemeMode = 'dark' | 'light';
