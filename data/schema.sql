-- SALMO.DEV — Minimum Production Database Schema (PostgreSQL)
-- Defines canonical data model for persistent match intelligence, decisions, and provenance.
-- Compatible with Supabase and vanilla PostgreSQL 15+.

-- 1. EXTENSIONS
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 2. USERS TABLE
CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    email VARCHAR(255) UNIQUE NOT NULL,
    role VARCHAR(50) NOT NULL DEFAULT 'user',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 3. MATCHES TABLE
CREATE TABLE IF NOT EXISTS matches (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    canonical_match_id VARCHAR(255) UNIQUE NOT NULL,
    league VARCHAR(100) NOT NULL DEFAULT 'Premier League',
    season VARCHAR(20) NOT NULL,
    kickoff_time TIMESTAMPTZ NOT NULL,
    home_team VARCHAR(100) NOT NULL,
    away_team VARCHAR(100) NOT NULL,
    venue VARCHAR(150),
    status VARCHAR(30) NOT NULL DEFAULT 'SCHEDULED', -- SCHEDULED, LIVE, FINISHED, POSTPONED
    home_goals INT,
    away_goals INT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_matches_kickoff ON matches(kickoff_time);
CREATE INDEX IF NOT EXISTS idx_matches_teams ON matches(home_team, away_team);
CREATE INDEX IF NOT EXISTS idx_matches_canonical ON matches(canonical_match_id);

-- 4. MARKET SNAPSHOTS TABLE
CREATE TABLE IF NOT EXISTS market_snapshots (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    match_id UUID NOT NULL REFERENCES matches(id) ON DELETE CASCADE,
    market_type VARCHAR(50) NOT NULL, -- ASIAN_HANDICAP, OVER_UNDER, BTTS
    line_label VARCHAR(50) NOT NULL,
    numeric_line NUMERIC(5, 2),
    bookmaker VARCHAR(100) NOT NULL,
    home_odds NUMERIC(6, 3),
    away_odds NUMERIC(6, 3),
    overround NUMERIC(6, 4),
    source_provider VARCHAR(50) NOT NULL, -- PINNACLE, BET365, ODDSPAPI
    captured_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_snapshots_match ON market_snapshots(match_id);
CREATE INDEX IF NOT EXISTS idx_snapshots_captured ON market_snapshots(captured_at);

-- 5. DECISIONS TABLE
CREATE TABLE IF NOT EXISTS decisions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    match_id UUID NOT NULL REFERENCES matches(id) ON DELETE CASCADE,
    market_type VARCHAR(50) NOT NULL,
    line_label VARCHAR(50) NOT NULL,
    badge VARCHAR(20) NOT NULL, -- GREEN, YELLOW, RED, GREY
    status VARCHAR(50) NOT NULL, -- VALUE, MARGINAL, NO_VALUE, INSUFFICIENT_DATA, ODDS_UNAVAILABLE
    status_label VARCHAR(100) NOT NULL,
    confidence VARCHAR(20) NOT NULL, -- HIGH, MEDIUM, LOW, NONE
    model_prob_pct NUMERIC(5, 2),
    implied_prob_pct NUMERIC(5, 2),
    edge_pp NUMERIC(5, 2),
    ev_pct NUMERIC(5, 2),
    sample_size INT NOT NULL,
    data_quality VARCHAR(20) NOT NULL DEFAULT 'PASS',
    validation_stage VARCHAR(50) NOT NULL DEFAULT 'UNVERIFIED',
    reason TEXT NOT NULL,
    generated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_decisions_match ON decisions(match_id);
CREATE INDEX IF NOT EXISTS idx_decisions_badge ON decisions(badge);

-- 6. EVIDENCE TABLE
CREATE TABLE IF NOT EXISTS evidence (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    decision_id UUID NOT NULL REFERENCES decisions(id) ON DELETE CASCADE,
    sample_size INT NOT NULL,
    win_pct NUMERIC(5, 2),
    half_win_pct NUMERIC(5, 2),
    push_pct NUMERIC(5, 2),
    half_loss_pct NUMERIC(5, 2),
    loss_pct NUMERIC(5, 2),
    date_range_start DATE,
    date_range_end DATE,
    checksum VARCHAR(100) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_evidence_decision ON evidence(decision_id);

-- 7. DATA PROVENANCE TABLE
CREATE TABLE IF NOT EXISTS data_provenance (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    decision_id UUID NOT NULL REFERENCES decisions(id) ON DELETE CASCADE,
    source VARCHAR(255) NOT NULL,
    source_version VARCHAR(50) NOT NULL,
    dataset_version VARCHAR(50) NOT NULL,
    canonical_match_id VARCHAR(255) NOT NULL,
    calculation_version VARCHAR(50) NOT NULL,
    settlement_methodology VARCHAR(100) NOT NULL,
    validation_stage VARCHAR(50) NOT NULL,
    checksum VARCHAR(100) NOT NULL,
    recorded_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_provenance_decision ON data_provenance(decision_id);

-- 8. ENTITLEMENTS TABLE (MINIMUM SCHEMA; NO PAYMENT IMPLEMENTATION YET)
CREATE TABLE IF NOT EXISTS entitlements (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    tier VARCHAR(50) NOT NULL DEFAULT 'free', -- free, pro, syndicate
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    starts_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    expires_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_entitlements_user ON entitlements(user_id);

-- 9. DAILY PICKS TABLE (CANONICAL PRODUCTION PICKS)
CREATE TABLE IF NOT EXISTS daily_picks (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    fixture_id VARCHAR(100) NOT NULL,
    league VARCHAR(100) NOT NULL DEFAULT 'Premier League',
    home_team VARCHAR(100) NOT NULL,
    away_team VARCHAR(100) NOT NULL,
    kickoff_utc TIMESTAMPTZ NOT NULL,
    market_type VARCHAR(50) NOT NULL, -- ASIAN_HANDICAP, OVER_UNDER, BTTS
    prediction VARCHAR(100) NOT NULL,
    line NUMERIC(5, 2),
    model_probability NUMERIC(6, 4),
    fair_odds NUMERIC(6, 3),
    market_odds NUMERIC(6, 3),
    market_bookmaker VARCHAR(50) NOT NULL DEFAULT 'Pinnacle',
    edge_pct NUMERIC(6, 2),
    expected_value NUMERIC(6, 4),
    confidence INT NOT NULL DEFAULT 0,
    verdict VARCHAR(20) NOT NULL DEFAULT 'LEWATI', -- LAYAK, PANTAU, LEWATI
    model_version VARCHAR(50) NOT NULL DEFAULT 'dixon-coles-v1.0',
    reasoning TEXT,
    rejection_reason TEXT,
    status VARCHAR(30) NOT NULL DEFAULT 'ACTIVE', -- ACTIVE, SETTLED, VOID, PENDING
    source VARCHAR(50) NOT NULL DEFAULT 'live',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_daily_picks_fixture_market_source UNIQUE(fixture_id, market_type, source)
);

CREATE INDEX IF NOT EXISTS idx_daily_picks_kickoff ON daily_picks(kickoff_utc);
CREATE INDEX IF NOT EXISTS idx_daily_picks_verdict ON daily_picks(verdict);
CREATE INDEX IF NOT EXISTS idx_daily_picks_market ON daily_picks(market_type);

-- 10. PREDICTIONS TABLE (FULL POINT-IN-TIME SNAPSHOTS)
CREATE TABLE IF NOT EXISTS predictions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    match_id VARCHAR(100) NOT NULL,
    canonical_match_id VARCHAR(255),
    market_type VARCHAR(50) NOT NULL, -- AH, OU, BTTS
    home_team VARCHAR(100) NOT NULL,
    away_team VARCHAR(100) NOT NULL,
    selection VARCHAR(100) NOT NULL,
    line NUMERIC(5, 2),
    model_probability NUMERIC(6, 4),
    fair_odds NUMERIC(6, 3),
    market_odds NUMERIC(6, 3),
    edge_pct NUMERIC(6, 2),
    expected_value NUMERIC(6, 4),
    confidence NUMERIC(5, 2),
    model_version VARCHAR(50) NOT NULL DEFAULT 'dixon-coles-v1.0',
    feature_version VARCHAR(50) NOT NULL DEFAULT 'dynamic-ratings-v1.0',
    prediction_timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    source_type VARCHAR(50) NOT NULL DEFAULT 'live',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_predictions_match_market UNIQUE(match_id, market_type)
);

CREATE INDEX IF NOT EXISTS idx_predictions_match ON predictions(match_id);

-- 11. PREDICTION LEDGER TABLE (IMMUTABLE HASH-CHAINED AUDIT LEDGER)
CREATE TABLE IF NOT EXISTS prediction_ledger (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    prediction_id VARCHAR(255) NOT NULL,
    canonical_match_id VARCHAR(255) NOT NULL,
    fixture_id VARCHAR(100) NOT NULL,
    market VARCHAR(50) NOT NULL,
    selection VARCHAR(100) NOT NULL,
    line NUMERIC(5, 2),
    model_probability NUMERIC(6, 4),
    fair_odds NUMERIC(6, 3),
    market_odds NUMERIC(6, 3),
    edge NUMERIC(6, 4),
    ev NUMERIC(6, 4),
    model_version VARCHAR(50) NOT NULL,
    feature_version VARCHAR(50) NOT NULL,
    prediction_timestamp TIMESTAMPTZ NOT NULL,
    odds_timestamp TIMESTAMPTZ NOT NULL,
    status VARCHAR(30) NOT NULL DEFAULT 'PENDING',
    settlement VARCHAR(30) DEFAULT 'PENDING',
    profit_loss NUMERIC(8, 4),
    provenance_hash VARCHAR(64) NOT NULL,
    prior_hash VARCHAR(64),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_ledger_prediction_id UNIQUE(prediction_id)
);

CREATE INDEX IF NOT EXISTS idx_ledger_fixture ON prediction_ledger(fixture_id);
CREATE INDEX IF NOT EXISTS idx_ledger_timestamp ON prediction_ledger(prediction_timestamp);


-- 12. LEDGER SETTLEMENTS TABLE (APPEND-ONLY SEPARATED SETTLEMENT LIFECYCLE)
CREATE TABLE IF NOT EXISTS ledger_settlements (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    ledger_position_id VARCHAR(255) NOT NULL,
    settlement_status VARCHAR(30) NOT NULL DEFAULT 'PENDING', -- PENDING, SETTLED, VOID
    result VARCHAR(30), -- WIN, HALF_WIN, PUSH, HALF_LOSS, LOSS, VOID
    profit_units NUMERIC(8, 4) NOT NULL DEFAULT 0.0,
    stake_units NUMERIC(4, 2) NOT NULL DEFAULT 1.0,
    settled_at TIMESTAMPTZ,
    closing_odds NUMERIC(6, 3),
    closing_line NUMERIC(5, 2),
    clv_pct NUMERIC(6, 2),
    closing_snapshot_ts TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_settlement_position UNIQUE(ledger_position_id)
);

CREATE INDEX IF NOT EXISTS idx_settlements_pos ON ledger_settlements(ledger_position_id);
CREATE INDEX IF NOT EXISTS idx_settlements_status ON ledger_settlements(settlement_status);
