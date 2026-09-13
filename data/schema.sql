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

