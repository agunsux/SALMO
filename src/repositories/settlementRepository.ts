// src/repositories/settlementRepository.ts
// SALMO.DEV — Authoritative Settlement Repository
// Implements canonical settlement contract, quarter-line calculations, and atomic ledger reconciliation.

import { PoolClient } from 'pg';
import { executeQuery, executeTransaction } from './dbClient';
import { Logger } from '../lib/logger';

export type SettlementOutcome = 'WIN' | 'HALF_WIN' | 'PUSH' | 'HALF_LOSS' | 'LOSS' | 'VOID';

export interface PositionSettlementCalculation {
  outcome: SettlementOutcome;
  profitUnits: number;
  stakeUnits: number;
  explanation: string;
}

export class SettlementRepository {
  /**
   * Pure deterministic calculation for Asian Handicap quarter-lines.
   */
  public static calculateAhSettlement(
    side: 'home' | 'away',
    line: number,
    homeGoals: number,
    awayGoals: number,
    odds: number
  ): PositionSettlementCalculation {
    const diff = side === 'home'
      ? (homeGoals - awayGoals) + line
      : (awayGoals - homeGoals) + line;

    if (diff > 0.25) {
      return {
        outcome: 'WIN',
        profitUnits: Number((odds - 1.0).toFixed(4)),
        stakeUnits: 1.0,
        explanation: `Full Win: diff ${diff} > 0.25`,
      };
    } else if (diff === 0.25) {
      return {
        outcome: 'HALF_WIN',
        profitUnits: Number(((odds - 1.0) / 2.0).toFixed(4)),
        stakeUnits: 1.0,
        explanation: `Half Win: diff ${diff} === 0.25`,
      };
    } else if (diff === 0) {
      return {
        outcome: 'PUSH',
        profitUnits: 0.0,
        stakeUnits: 1.0,
        explanation: `Push: diff ${diff} === 0`,
      };
    } else if (diff === -0.25) {
      return {
        outcome: 'HALF_LOSS',
        profitUnits: -0.50,
        stakeUnits: 1.0,
        explanation: `Half Loss: diff ${diff} === -0.25`,
      };
    } else {
      return {
        outcome: 'LOSS',
        profitUnits: -1.0,
        stakeUnits: 1.0,
        explanation: `Full Loss: diff ${diff} < -0.25`,
      };
    }
  }

  /**
   * Pure deterministic calculation for Over/Under quarter-lines.
   */
  public static calculateOuSettlement(
    side: 'over' | 'under',
    line: number,
    homeGoals: number,
    awayGoals: number,
    odds: number
  ): PositionSettlementCalculation {
    const totalGoals = homeGoals + awayGoals;
    const diff = side === 'over'
      ? totalGoals - line
      : line - totalGoals;

    if (diff > 0.25) {
      return {
        outcome: 'WIN',
        profitUnits: Number((odds - 1.0).toFixed(4)),
        stakeUnits: 1.0,
        explanation: `Full Win: diff ${diff} > 0.25`,
      };
    } else if (diff === 0.25) {
      return {
        outcome: 'HALF_WIN',
        profitUnits: Number(((odds - 1.0) / 2.0).toFixed(4)),
        stakeUnits: 1.0,
        explanation: `Half Win: diff ${diff} === 0.25`,
      };
    } else if (diff === 0) {
      return {
        outcome: 'PUSH',
        profitUnits: 0.0,
        stakeUnits: 1.0,
        explanation: `Push: diff ${diff} === 0`,
      };
    } else if (diff === -0.25) {
      return {
        outcome: 'HALF_LOSS',
        profitUnits: -0.50,
        stakeUnits: 1.0,
        explanation: `Half Loss: diff ${diff} === -0.25`,
      };
    } else {
      return {
        outcome: 'LOSS',
        profitUnits: -1.0,
        stakeUnits: 1.0,
        explanation: `Full Loss: diff ${diff} < -0.25`,
      };
    }
  }

  /**
   * Settles a finished fixture atomically across matches, settlement_results,
   * prediction_ledger, and daily_picks in a single ACID transaction.
   */
  public static async settleFixture(
    params: {
      fixtureId: string;
      homeGoals: number;
      awayGoals: number;
      matchStatus?: 'finished' | 'postponed' | 'void';
      isVoided?: boolean;
    },
    existingClient?: PoolClient
  ): Promise<{
    settledCount: number;
    settlements: Array<{
      ledgerId: string;
      market: string;
      outcome: SettlementOutcome;
      profitUnits: number;
    }>;
  }> {
    const { fixtureId, homeGoals, awayGoals, matchStatus = 'finished', isVoided = false } = params;

    return executeTransaction(async (client: PoolClient) => {
      const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(fixtureId);

      // 1. Update fixture score in matches table
      if (isUuid) {
        await client.query(`
          UPDATE public.matches
          SET status = $2, home_goals = $3, away_goals = $4, updated_at = NOW()
          WHERE id = $1::uuid;
        `, [fixtureId, matchStatus, homeGoals, awayGoals]);
      } else {
        await client.query(`
          UPDATE public.matches
          SET status = $2, home_goals = $3, away_goals = $4, updated_at = NOW()
          WHERE canonical_match_id = $1;
        `, [fixtureId, matchStatus, homeGoals, awayGoals]);
      }

      // If postponed, positions remain PENDING
      if (matchStatus === 'postponed') {
        Logger.info(`[SettlementRepository] Fixture ${fixtureId} is postponed; positions remain PENDING.`);
        return { settledCount: 0, settlements: [] };
      }

      // 2. Fetch all unsettled ledger records for this fixture
      let ledgerRows: any[] = [];
      if (isUuid) {
        const res = await client.query(`
          SELECT id, doi_id, market, selection, line, odds_at_prediction, result_status
          FROM public.prediction_ledger
          WHERE (match_id = $1::uuid OR fixture_id = $1::text)
          FOR UPDATE;
        `, [fixtureId]);
        ledgerRows = res.rows;
      } else {
        const res = await client.query(`
          SELECT id, doi_id, market, selection, line, odds_at_prediction, result_status
          FROM public.prediction_ledger
          WHERE (canonical_match_id = $1 OR fixture_id = $1)
          FOR UPDATE;
        `, [fixtureId]);
        ledgerRows = res.rows;
      }

      const settlements: Array<{
        ledgerId: string;
        market: string;
        outcome: SettlementOutcome;
        profitUnits: number;
      }> = [];

      for (const row of ledgerRows) {
        let calc: PositionSettlementCalculation;

        if (isVoided || matchStatus === 'void') {
          calc = {
            outcome: 'VOID',
            profitUnits: 0.0,
            stakeUnits: 0.0,
            explanation: 'Match voided',
          };
        } else if (row.market === 'AH' || row.market === 'ASIAN_HANDICAP') {
          const side = String(row.selection).toLowerCase().includes('away') ? 'away' : 'home';
          calc = this.calculateAhSettlement(
            side,
            Number(row.line),
            homeGoals,
            awayGoals,
            Number(row.odds_at_prediction)
          );
        } else if (row.market === 'OU' || row.market === 'OVER_UNDER') {
          const side = String(row.selection).toLowerCase().includes('under') ? 'under' : 'over';
          calc = this.calculateOuSettlement(
            side,
            Number(row.line),
            homeGoals,
            awayGoals,
            Number(row.odds_at_prediction)
          );
        } else {
          continue; // BTTS or unhandled
        }

        // Insert into settlement_results
        await client.query(`
          INSERT INTO public.settlement_results (
            fixture_id, ledger_position_id, prediction_id, market_type, selection, line,
            odds, outcome, profit_units, stake_units, home_goals, away_goals, voided, settled_at
          ) VALUES (
            $1, $2, $3, $4, $5, $6,
            $7, $8, $9, $10, $11, $12, $13, NOW()
          )
          ON CONFLICT (ledger_position_id) DO UPDATE SET
            outcome = EXCLUDED.outcome,
            profit_units = EXCLUDED.profit_units,
            home_goals = EXCLUDED.home_goals,
            away_goals = EXCLUDED.away_goals,
            voided = EXCLUDED.voided,
            settled_at = NOW();
        `, [
          fixtureId,
          row.doi_id,
          row.doi_id,
          row.market,
          row.selection,
          row.line,
          row.odds_at_prediction,
          calc.outcome,
          calc.profitUnits,
          calc.stakeUnits,
          homeGoals,
          awayGoals,
          calc.outcome === 'VOID',
        ]);

        // Update prediction_ledger (allowed settlement columns only!)
        await client.query(`
          UPDATE public.prediction_ledger
          SET result_status = $2, roi = $3, profit_loss = $3, status = 'SETTLED', settlement = 'SETTLED', settled_at = NOW()
          WHERE id = $1::uuid;
        `, [row.id, calc.outcome, calc.profitUnits]);

        // Update daily_picks projection (strictly scoped to this specific prediction)
        const dailyPickStatus =
          calc.outcome === 'WIN' || calc.outcome === 'HALF_WIN' ? 'WON' :
          calc.outcome === 'LOSS' || calc.outcome === 'HALF_LOSS' ? 'LOST' :
          calc.outcome === 'PUSH' ? 'PUSH' : 'VOID';

        await client.query(`
          UPDATE public.daily_picks
          SET status = $2, profit_loss = $3, settled_at = NOW(), updated_at = NOW()
          WHERE prediction_id = $1;
        `, [row.doi_id, dailyPickStatus, calc.profitUnits]);

        settlements.push({
          ledgerId: row.id,
          market: row.market,
          outcome: calc.outcome,
          profitUnits: calc.profitUnits,
        });
      }

      return {
        settledCount: settlements.length,
        settlements,
      };
    }, existingClient);
  }
}
