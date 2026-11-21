'use client';

import React, { createContext, useContext, useState, useEffect } from 'react';

export type OddsFormat = 'decimal' | 'american' | 'hongKong' | 'malay';

export interface OddsFormatContextType {
  oddsFormat: OddsFormat;
  setOddsFormat: (fmt: OddsFormat) => void;
  formatOddsValue: (decimalOdds: number | null | undefined) => string;
}

/**
 * Mathematical odds format converters
 */
export function convertDecimalToFormat(decimalOdds: number | null | undefined, fmt: OddsFormat): string {
  if (decimalOdds === null || decimalOdds === undefined || !Number.isFinite(decimalOdds) || decimalOdds <= 1.0) {
    return '—';
  }

  switch (fmt) {
    case 'decimal':
      return decimalOdds.toFixed(2);

    case 'american': {
      if (decimalOdds >= 2.0) {
        const am = Math.round((decimalOdds - 1.0) * 100);
        return `+${am}`;
      } else {
        const am = Math.round(-100.0 / (decimalOdds - 1.0));
        return `${am}`;
      }
    }

    case 'hongKong': {
      const hk = decimalOdds - 1.0;
      return hk.toFixed(2);
    }

    case 'malay': {
      const net = decimalOdds - 1.0;
      if (decimalOdds <= 2.0) {
        // Positive Malay odds: net profit per 1 unit stake
        return net.toFixed(2);
      } else {
        // Negative Malay odds: stake required to win 1 unit profit
        const my = -1.0 / net;
        return my.toFixed(2);
      }
    }

    default:
      return decimalOdds.toFixed(2);
  }
}

/**
 * Exact Expected Value formula with 50/50 quarter line split guarantee
 * EV = P_win_eff * (Odds - 1) - P_lose_eff * 1.0
 */
export function computeExactEV(
  odds: number,
  pWinEff: number,
  pLoseEff: number
): number {
  if (!Number.isFinite(odds) || odds <= 1.0) return 0.0;
  return (pWinEff * (odds - 1.0)) - (pLoseEff * 1.0);
}

/**
 * BettingStats color classification badge logic
 */
export type SignalTier = 'EMERALD' | 'AMBER' | 'SLATE';

export function classifySignal(evPct: number | null, hitRatePct: number | null): SignalTier {
  const ev = evPct ?? 0;
  const hr = hitRatePct ?? 0;

  if (ev >= 3.0 || hr >= 65.0) {
    return 'EMERALD';
  }
  if (ev >= 1.0 || (hr >= 45.0 && hr < 65.0)) {
    return 'AMBER';
  }
  return 'SLATE';
}

const OddsFormatContext = createContext<OddsFormatContextType | null>(null);

export const OddsFormatProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [oddsFormat, setOddsFormatState] = useState<OddsFormat>('decimal');

  useEffect(() => {
    try {
      const saved = localStorage.getItem('salmo_odds_format') as OddsFormat;
      if (saved && ['decimal', 'american', 'hongKong', 'malay'].includes(saved)) {
        setOddsFormatState(saved);
      }
    } catch {
      // Ignore
    }
  }, []);

  const setOddsFormat = (fmt: OddsFormat) => {
    setOddsFormatState(fmt);
    try {
      localStorage.setItem('salmo_odds_format', fmt);
    } catch {
      // Ignore
    }
  };

  const formatOddsValue = (decimalOdds: number | null | undefined): string => {
    return convertDecimalToFormat(decimalOdds, oddsFormat);
  };

  return (
    <OddsFormatContext.Provider value={{ oddsFormat, setOddsFormat, formatOddsValue }}>
      {children}
    </OddsFormatContext.Provider>
  );
};

export const useOddsFormat = () => {
  const context = useContext(OddsFormatContext);
  if (!context) {
    throw new Error('useOddsFormat must be used within an OddsFormatProvider');
  }
  return context;
};
