'use client';

import { useState, useEffect, useCallback } from 'react';
import { UserEntitlements } from '@/lib/billing/types';
import { MONETIZATION_ENABLED, DAILY_FREE_MATCH_LIMIT } from '@/config/entitlements';

const STORAGE_KEY = 'salmo_user_entitlements';

const DEFAULT_ENTITLEMENTS: UserEntitlements = {
  isPro: false,
  isWeekendPassActive: false,
  weekendPassExpiresAt: null,
  creditsBalance: 0,
  unlockedMatchIds: [],
  dailyFreeUsed: 0,
  dailyFreeLimit: DAILY_FREE_MATCH_LIMIT
};

export function useEntitlements() {
  const [entitlements, setEntitlements] = useState<UserEntitlements>(DEFAULT_ENTITLEMENTS);
  const [loaded, setLoaded] = useState(false);

  // Load from localStorage on mount
  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        const parsed: UserEntitlements = JSON.parse(stored);
        
        // Check if weekend pass expired
        if (parsed.weekendPassExpiresAt && new Date(parsed.weekendPassExpiresAt).getTime() < Date.now()) {
          parsed.isWeekendPassActive = false;
          parsed.weekendPassExpiresAt = null;
        }

        // Daily reset check (stored by date string YYYY-MM-DD)
        const lastAccessDate = localStorage.getItem('salmo_last_access_date');
        const todayDate = new Date().toISOString().split('T')[0];
        if (lastAccessDate !== todayDate) {
          parsed.dailyFreeUsed = 0;
          parsed.unlockedMatchIds = [];
          localStorage.setItem('salmo_last_access_date', todayDate);
        }

        setEntitlements(parsed);
      } else {
        const todayDate = new Date().toISOString().split('T')[0];
        localStorage.setItem('salmo_last_access_date', todayDate);
      }
    } catch {
      // Safe fallback if local storage inaccessible
    }
    setLoaded(true);
  }, []);

  const save = useCallback((updated: UserEntitlements) => {
    setEntitlements(updated);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
    } catch {
      // Ignore
    }
  }, []);

  const isWeekendPassValid = useCallback(() => {
    if (!entitlements.isWeekendPassActive || !entitlements.weekendPassExpiresAt) {
      return false;
    }
    return new Date(entitlements.weekendPassExpiresAt).getTime() > Date.now();
  }, [entitlements.isWeekendPassActive, entitlements.weekendPassExpiresAt]);

  const canViewMatch = useCallback((matchId: string): boolean => {
    // If monetization is disabled (Early Access Mode), all matches are open
    if (!MONETIZATION_ENABLED) {
      return true;
    }

    // Pro subscribers have unlimited access
    if (entitlements.isPro) {
      return true;
    }

    // Active weekend pass holders have unlimited access
    if (isWeekendPassValid()) {
      return true;
    }

    // Match already unlocked today
    if (entitlements.unlockedMatchIds.includes(matchId)) {
      return true;
    }

    // Within daily free quota
    if (entitlements.dailyFreeUsed < entitlements.dailyFreeLimit) {
      return true;
    }

    // Has credits available to unlock
    if (entitlements.creditsBalance > 0) {
      return true;
    }

    return false;
  }, [entitlements, isWeekendPassValid]);

  const unlockMatch = useCallback((matchId: string): { success: boolean; reason: string } => {
    if (!MONETIZATION_ENABLED) {
      return { success: true, reason: 'early_access_free' };
    }

    if (entitlements.isPro) {
      return { success: true, reason: 'pro_access' };
    }

    if (isWeekendPassValid()) {
      return { success: true, reason: 'weekend_pass' };
    }

    if (entitlements.unlockedMatchIds.includes(matchId)) {
      return { success: true, reason: 'already_unlocked' };
    }

    if (entitlements.dailyFreeUsed < entitlements.dailyFreeLimit) {
      const updated: UserEntitlements = {
        ...entitlements,
        dailyFreeUsed: entitlements.dailyFreeUsed + 1,
        unlockedMatchIds: [...entitlements.unlockedMatchIds, matchId]
      };
      save(updated);
      return { success: true, reason: 'daily_free_quota' };
    }

    if (entitlements.creditsBalance > 0) {
      const updated: UserEntitlements = {
        ...entitlements,
        creditsBalance: entitlements.creditsBalance - 1,
        unlockedMatchIds: [...entitlements.unlockedMatchIds, matchId]
      };
      save(updated);
      return { success: true, reason: 'credit_spent' };
    }

    return { success: false, reason: 'quota_exceeded' };
  }, [entitlements, isWeekendPassValid, save]);

  const addCredits = useCallback((amount: number) => {
    const updated: UserEntitlements = {
      ...entitlements,
      creditsBalance: entitlements.creditsBalance + amount
    };
    save(updated);
  }, [entitlements, save]);

  const activateWeekendPass = useCallback((hours: number = 48) => {
    const expiresAt = new Date(Date.now() + hours * 3600 * 1000).toISOString();
    const updated: UserEntitlements = {
      ...entitlements,
      isWeekendPassActive: true,
      weekendPassExpiresAt: expiresAt
    };
    save(updated);
  }, [entitlements, save]);

  const upgradeToPro = useCallback(() => {
    const updated: UserEntitlements = {
      ...entitlements,
      isPro: true
    };
    save(updated);
  }, [entitlements, save]);

  const remainingFreeToday = Math.max(0, entitlements.dailyFreeLimit - entitlements.dailyFreeUsed);

  return {
    loaded,
    entitlements,
    isMonetizationActive: MONETIZATION_ENABLED,
    isPro: entitlements.isPro,
    isWeekendPassActive: isWeekendPassValid(),
    creditsBalance: entitlements.creditsBalance,
    remainingFreeToday,
    canViewMatch,
    unlockMatch,
    addCredits,
    activateWeekendPass,
    upgradeToPro
  };
}
