import fs from 'fs';
import path from 'path';
import { createClient } from '@supabase/supabase-js';
import { SettlementEngine } from './settlementEngine';
import {
  PerformanceMetricsEngine,
  LedgerPositionSnapshot,
  isQualifiedPublicPickCohort,
} from '../performance/performanceMetrics';
import { getLeagueByNameOrSlug } from '../../config/multiLeagueRegistry';
import { Logger } from '../../lib/logger';

import { HandicapLabAdapterFactory } from '../../contracts/handicapLabAdapter';

interface ApiFootballFixtureItem {
  fixture: {
    id: number;
    date: string;
    status: {
      short: string;
      long: string;
    };
  };
  league: {
    id: number;
    season: number;
    round: string;
  };
  teams: {
    home: { id: number; name: string };
    away: { id: number; name: string };
  };
  goals: {
    home: number | null;
    away: number | null;
  };
}

export interface SettlementRunnerOptions {
  dryRun?: boolean;
  fromDate?: string;
  toDate?: string;
}

export async function runProductionSettlement(options: SettlementRunnerOptions = {}) {
  const dryRun = options.dryRun ?? false;
  const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;

  Logger.info('[SettlementRunner] Starting production settlement cycle...', {
    dryRun,
    timestamp: new Date().toISOString(),
  });

  const sb = supabaseUrl && supabaseKey ? createClient(supabaseUrl, supabaseKey) : null;

  // 1. Read local live_prediction_ledger.jsonl
  const ledgerPath = path.resolve(process.cwd(), 'data', 'verification', 'live_prediction_ledger.jsonl');
  let rawLines: string[] = [];
  if (fs.existsSync(ledgerPath)) {
    rawLines = fs.readFileSync(ledgerPath, 'utf8').trim().split('\n').filter(Boolean);
  }

  // 2a. Level (a) Score Resolution: Query existing Supabase public.matches first (0 external API calls)
  const dbScoreMap = new Map<string, { homeGoals: number; awayGoals: number; homeTeam: string; awayTeam: string }>();
  if (sb) {
    try {
      const { data: dbMatches, error: dbMatchErr } = await sb
        .from('matches')
        .select('id, home_team, away_team, status, home_goals, away_goals')
        .eq('status', 'finished');
      if (!dbMatchErr && dbMatches) {
        for (const m of dbMatches) {
          if (m.home_goals !== null && m.away_goals !== null) {
            dbScoreMap.set(m.id, {
              homeGoals: Number(m.home_goals),
              awayGoals: Number(m.away_goals),
              homeTeam: m.home_team,
              awayTeam: m.away_team,
            });
          }
        }
        Logger.info(`[SettlementRunner] Level (a) resolved ${dbScoreMap.size} finished matches from public.matches.`);
      }
    } catch (dbErr) {
      Logger.warn('[SettlementRunner] Could not query public.matches:', { error: String(dbErr) });
    }
  }

  // 2b. Level (b) HandicapLab Verified Results Resolution (Decoupled: zero direct API-Football calls from SALMO)
  const contractScoreMap = new Map<string, { homeGoals: number; awayGoals: number; homeTeam: string; awayTeam: string }>();
  if (!dryRun) {
    try {
      const adapter = HandicapLabAdapterFactory.getAdapter();
      const syncRes = await adapter.getSalmoSync({ view: 'results' });
      if (syncRes && syncRes.verifiedResults && syncRes.verifiedResults.length > 0) {
        for (const vr of syncRes.verifiedResults) {
          if (typeof vr.homeGoals === 'number' && typeof vr.awayGoals === 'number') {
            const entry = {
              homeGoals: vr.homeGoals,
              awayGoals: vr.awayGoals,
              homeTeam: vr.homeTeam,
              awayTeam: vr.awayTeam,
            };
            if (vr.canonicalFixtureId) contractScoreMap.set(vr.canonicalFixtureId, entry);
            if (vr.providerMatchId) contractScoreMap.set(vr.providerMatchId, entry);
          }
        }
        Logger.info(`[SettlementRunner] Level (b) resolved ${contractScoreMap.size} verified matches from HandicapLab contract.`);
      }
    } catch (contractErr) {
      Logger.warn('[SettlementRunner] Could not query HandicapLab contract verified results:', { error: String(contractErr) });
    }
  }

  let settledCount = 0;
  let pendingCount = 0;
  const updatedLines: string[] = [];
  const settledSnapshots: LedgerPositionSnapshot[] = [];

  for (const line of rawLines) {
    const row = JSON.parse(line);
    const apiId = row.providerProvenance?.apiFootballFixtureId;
    const matchId = row.matchId || row.fixtureId;

    // Resolve score from Level (a) public.matches first, then Level (b) HandicapLab contract
    const dbMatch = matchId ? dbScoreMap.get(String(matchId)) : undefined;
    const contractMatch =
      (row.canonicalMatchId && contractScoreMap.get(row.canonicalMatchId)) ||
      (matchId && contractScoreMap.get(String(matchId))) ||
      (apiId && contractScoreMap.get(String(apiId)));

    const hGoals = dbMatch ? dbMatch.homeGoals : (contractMatch ? contractMatch.homeGoals : null);
    const aGoals = dbMatch ? dbMatch.awayGoals : (contractMatch ? contractMatch.awayGoals : null);
    const homeTeam = dbMatch?.homeTeam || contractMatch?.homeTeam || row.homeTeam;
    const awayTeam = dbMatch?.awayTeam || contractMatch?.awayTeam || row.awayTeam;

    if (hGoals !== null && aGoals !== null) {
      const mType = (row.market || row.marketType)?.toUpperCase();

      const settlement = SettlementEngine.settlePosition({
        ledgerPositionId: row.predictionId || row.ledgerPositionId,
        marketType: mType,
        selection: row.selection,
        line: Number(row.line ?? 0),
        oddsTaken: Number(row.oddsAtPrediction || row.marketOdds || 1.95),
        homeGoals: hGoals,
        awayGoals: aGoals,
        matchStatus: 'FINISHED',
        homeTeam,
        awayTeam,
      });

      const updatedRow = {
        ...row,
        homeGoals: hGoals,
        awayGoals: aGoals,
        matchScore: `${hGoals}-${aGoals}`,
        matchStatus: 'FINISHED',
        result: settlement.result,
        settlement: settlement.settlementStatus,
        settlementStatus: settlement.settlementStatus,
        profitLoss: settlement.profitUnits,
        profitUnits: settlement.profitUnits,
        stakeUnits: settlement.stakeUnits,
        settledAt: settlement.settledAt || new Date().toISOString(),
      };

      updatedLines.push(JSON.stringify(updatedRow));
      settledCount++;

      if (mType === 'AH' || mType === 'OU') {
        settledSnapshots.push({
          ledgerPositionId: updatedRow.predictionId,
          fixtureId: String(updatedRow.fixtureId || apiId),
          marketType: mType as 'AH' | 'OU',
          selection: updatedRow.selection,
          line: Number(updatedRow.line ?? 0),
          stakeUnits: 1.0,
          marketOdds: Number(updatedRow.oddsAtPrediction || updatedRow.marketOdds),
          fairOdds: Number(updatedRow.fairOdds || updatedRow.oddsAtPrediction),
          pWin: updatedRow.modelProbability ? updatedRow.modelProbability / 100 : 0.5,
          pPush: 0,
          pLoss: 0.5,
          confidence: Number(updatedRow.confidence || 0),
          edge: Number(updatedRow.edge || 0),
          expectedValuePct: Number(updatedRow.EV || 0),
          greenCohort: isQualifiedPublicPickCohort({
            is_pick: updatedRow.is_pick,
            isPick: updatedRow.isPick,
            isDailyPick: updatedRow.isDailyPick,
            verdict: updatedRow.verdict ?? null,
          }),
          is_pick: Boolean(updatedRow.is_pick || updatedRow.isPick || updatedRow.isDailyPick),
          verdict: updatedRow.verdict || 'LEWATI',
          settlementStatus: settlement.settlementStatus,
          result: settlement.result,
          profitUnits: settlement.profitUnits,
          clvPct: null,
          settledAt: settlement.settledAt,
          createdAt: updatedRow.predictionTimestamp,
        });
      }
    } else {
      // Match not finished: strictly remain PENDING
      updatedLines.push(line);
      pendingCount++;
    }
  }

  if (!dryRun && rawLines.length > 0) {
    fs.writeFileSync(ledgerPath, updatedLines.join('\n') + '\n', 'utf8');
  }

  Logger.info(`[SettlementRunner] Ledger Updated. Settled: ${settledCount}, Pending: ${pendingCount}`);

  // 3. Database Reconciliation (idempotent update on Supabase daily_picks AND prediction_ledger)
  if (sb && settledCount > 0 && !dryRun) {
    Logger.info(`[SettlementRunner] Updating Supabase daily_picks and prediction_ledger for ${settledSnapshots.length} positions...`);
    for (const snap of settledSnapshots) {
      const dailyPickStatus =
        snap.result === 'WIN' || snap.result === 'HALF_WIN' ? 'WON' :
        snap.result === 'LOSS' || snap.result === 'HALF_LOSS' ? 'LOST' :
        'PUSH';

      try {
        const { error: updateError } = await sb
          .from('daily_picks')
          .update({
            status: dailyPickStatus,
            profit_loss: snap.profitUnits,
            settled_at: snap.settledAt,
          })
          .eq('prediction_id', snap.ledgerPositionId);

        if (updateError) {
          Logger.warn('[SettlementRunner] Supabase daily_picks update error:', {
            predictionId: snap.ledgerPositionId,
            error: updateError.message,
          });
        }

        const { error: ledgerError } = await sb
          .from('prediction_ledger')
          .update({
            result_status: snap.result,
            roi: snap.profitUnits,
            settled_at: snap.settledAt,
          })
          .eq('match_id', snap.fixtureId)
          .eq('market', snap.marketType);

        if (ledgerError) {
          Logger.warn('[SettlementRunner] Supabase prediction_ledger update error:', {
            fixtureId: snap.fixtureId,
            marketType: snap.marketType,
            error: ledgerError.message,
          });
        }

        // Also persist to canonical settlement_results table idempotently
        const srMarketType = snap.marketType === 'AH' ? 'asian_handicap' : 'over_under';
        const { data: existingSr } = await sb
          .from('settlement_results')
          .select('id')
          .eq('fixture_id', snap.fixtureId)
          .eq('market_type', srMarketType)
          .limit(1);

        if (!existingSr || existingSr.length === 0) {
          const matchedMatch = dbScoreMap.get(snap.fixtureId);
          const rawSel = String(snap.selection || '').toLowerCase();
          const awayFirstWord = String(matchedMatch?.awayTeam || '').toLowerCase().split(' ')[0];
          const normSel =
            snap.marketType === 'OU'
              ? rawSel.includes('under')
                ? 'under'
                : 'over'
              : awayFirstWord && rawSel.includes(awayFirstWord)
              ? 'away'
              : 'home';

          await sb.from('settlement_results').insert({
            fixture_id: snap.fixtureId,
            market_type: srMarketType,
            selection: normSel,
            line: snap.line,
            odds: snap.marketOdds,
            outcome: snap.result || 'VOID',
            profit_units: snap.profitUnits,
            home_goals: matchedMatch?.homeGoals ?? 0,
            away_goals: matchedMatch?.awayGoals ?? 0,
            voided: snap.result === 'VOID',
            settled_at: snap.settledAt || new Date().toISOString(),
          });
        }
      } catch (err) {
        Logger.warn('[SettlementRunner] Error updating Supabase:', { error: String(err) });
      }
    }
  }

  // 4. Compute performance report
  const report = PerformanceMetricsEngine.generateReport(settledSnapshots);
  Logger.info('[SettlementRunner] Settlement report summary:', {
    settled: report.controlFullCohort.settled,
    sampleStatus: report.controlFullCohort.sampleStatus,
    displayStatus: report.controlFullCohort.displayStatus,
  });

  return {
    success: true,
    settledCount,
    pendingCount,
    finishedFixturesCount: contractScoreMap.size + dbScoreMap.size,
    report,
    timestampUtc: new Date().toISOString(),
  };
}
