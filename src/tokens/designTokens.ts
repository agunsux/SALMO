// SALMO.DEV — Institutional Design Tokens
// Visual System: Institutional Calm (Reckoner) + Editorial Structure (Gertix)
// Positioning: Bloomberg-grade Decision Intelligence for Football Markets

export const designTokens = {
  colors: {
    // Primary palette
    bg: '#F6F3EE',          // Warm off-white background
    surface: '#FFFFFF',     // Clean white cards/panels
    surfaceElevated: '#EFEAE1', // Subtle warm elevated surface
    surfaceMuted: '#F0ECE4',// Secondary background
    ink: '#14110F',         // High-contrast near-black typography
    inkMuted: '#6B645C',    // Subdued secondary text
    inkSubtle: '#9E968D',   // Tertiary metadata text
    border: '#E4DED4',      // 1px hairline border
    borderSubtle: '#EDE8E0',// Lighter divider border

    // Brand Accents
    oxblood: '#3B1515',      // Deep institutional oxblood (buttons, headlines, footer)
    oxbloodHover: '#2A0E0E', // Darker oxblood on hover
    oxbloodMuted: '#582424', // Lighter oxblood for borders/subtle accents
    salmon: '#E8664A',       // Quiet salmon accent (sparingly: 1 per section max)
    salmonLight: '#FBECE8',  // Soft salmon background tint

    // Confidence Tiers (Traffic-Light Only — Strictly Non-Decorative)
    confidence: {
      high: {
        bg: '#EAF7EE',
        border: '#BFE7CA',
        text: '#137333',
        label: 'HIGH CONFIDENCE',
        dot: '#1E8E3E',
      },
      medium: {
        bg: '#FEF7E0',
        border: '#FEE5A5',
        text: '#B06000',
        label: 'MEDIUM CONFIDENCE',
        dot: '#F9AB00',
      },
      low: {
        bg: '#FCE8E6',
        border: '#FAD2CF',
        text: '#C5221F',
        label: 'LOW CONFIDENCE',
        dot: '#D93025',
      },
      researchOnly: {
        bg: '#F3E8FD',
        border: '#E1C7FC',
        text: '#681DA8',
        label: 'RESEARCH ONLY',
        dot: '#9334E6',
      },
    },

    // Market status badges
    status: {
      qualified: {
        bg: '#EAF7EE',
        border: '#BFE7CA',
        text: '#137333',
        label: 'QUALIFIED PICK',
      },
      monitoring: {
        bg: '#FEF7E0',
        border: '#FEE5A5',
        text: '#B06000',
        label: 'MONITORING',
      },
      passed: {
        bg: '#F1EFEA',
        border: '#E4DED4',
        text: '#6B645C',
        label: 'UNQUALIFIED',
      },
      backtest: {
        bg: '#EEF2F6',
        border: '#D0DBE5',
        text: '#2D5B88',
        label: 'BACKTEST',
      },
    },
  },

  typography: {
    fontSerif: 'Georgia, "Instrument Serif", "Fraunces", serif',
    fontSans: 'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
    fontMono: '"JetBrains Mono", "SF Mono", Monaco, Consolas, monospace',
  },

  radii: {
    sm: '4px',
    md: '6px',
    lg: '8px', // Maximum radius per constitutional rules
  },

  borders: {
    hairline: '1px solid #E4DED4',
    hairlineSubtle: '1px solid #EDE8E0',
    hairlineOxblood: '1px solid #3B1515',
  },
} as const;

export type DesignTokens = typeof designTokens;
