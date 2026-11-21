-- ==============================================================================
-- HANDICAPLAB / SALMO — MULTI-RAIL MONETIZATION & ENTITLEMENTS SCHEMA
-- Migration: 20261121_handicaplab_monetization.sql
-- Invariant: Strictly Additive (CREATE TABLE IF NOT EXISTS, RLS Protected)
-- ==============================================================================

-- 1. USER ENTITLEMENTS TABLE
CREATE TABLE IF NOT EXISTS user_entitlements (
    user_id TEXT PRIMARY KEY,
    plan TEXT NOT NULL DEFAULT 'FREE' CHECK (plan IN ('FREE', 'PRO_MONTHLY', 'PRO_ANNUAL', 'WEEKEND_PASS', 'COMPETITION_PASS')),
    credits_balance INTEGER NOT NULL DEFAULT 0 CHECK (credits_balance >= 0),
    weekend_pass_expires_at TIMESTAMPTZ,
    competition_pass_league TEXT,
    competition_pass_expires_at TIMESTAMPTZ,
    subscription_status TEXT NOT NULL DEFAULT 'INACTIVE' CHECK (subscription_status IN ('ACTIVE', 'INACTIVE', 'CANCELLED', 'PAST_DUE')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Index on user_id and subscription_status
CREATE INDEX IF NOT EXISTS idx_user_entitlements_status ON user_entitlements(user_id, subscription_status);

-- 2. UNLOCKED MATCHES (PERMANENT MATCH CREDIT UNLOCKS)
CREATE TABLE IF NOT EXISTS unlocked_matches (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id TEXT NOT NULL,
    match_id TEXT NOT NULL,
    source TEXT NOT NULL DEFAULT 'CREDIT' CHECK (source IN ('CREDIT', 'DAILY_FREE', 'WEEKEND_PASS', 'COMPETITION_PASS', 'PRO_UNLIMITED')),
    unlocked_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_user_match_unlock UNIQUE (user_id, match_id)
);

CREATE INDEX IF NOT EXISTS idx_unlocked_matches_user ON unlocked_matches(user_id);
CREATE INDEX IF NOT EXISTS idx_unlocked_matches_match ON unlocked_matches(match_id);

-- 3. PAYMENT TRANSACTIONS (MULTI-RAIL: STABLECOIN, FIAT, SEA E-WALLETS)
CREATE TABLE IF NOT EXISTS payment_transactions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id TEXT NOT NULL,
    rail TEXT NOT NULL CHECK (rail IN ('STABLECOIN', 'FIAT', 'E_WALLET')),
    provider TEXT NOT NULL,
    amount_usd NUMERIC(10, 2) NOT NULL CHECK (amount_usd > 0),
    currency TEXT NOT NULL DEFAULT 'USD',
    item_type TEXT NOT NULL CHECK (item_type IN ('PRO_MONTHLY', 'PRO_ANNUAL', 'WEEKEND_PASS', 'STARTER_CREDITS', 'GRINDER_CREDITS', 'COMPETITION_PASS')),
    status TEXT NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'COMPLETED', 'FAILED', 'EXPIRED')),
    payment_reference TEXT,
    tx_hash TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    settled_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_payment_transactions_user ON payment_transactions(user_id, status);
CREATE INDEX IF NOT EXISTS idx_payment_transactions_ref ON payment_transactions(payment_reference);

-- 4. VIRTUAL TIPPING ENTRIES (PHASE-2 READY: NON-MONETARY DIAMOND LEADERBOARD)
CREATE TABLE IF NOT EXISTS virtual_tipping_entries (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id TEXT NOT NULL,
    match_id TEXT NOT NULL,
    selection_market TEXT NOT NULL CHECK (selection_market IN ('AH', 'OU', '1X2')),
    selection_detail TEXT NOT NULL,
    diamonds_staked INTEGER NOT NULL DEFAULT 10 CHECK (diamonds_staked > 0),
    result TEXT NOT NULL DEFAULT 'PENDING' CHECK (result IN ('PENDING', 'WIN', 'HALF_WIN', 'PUSH', 'HALF_LOSS', 'LOSS')),
    diamonds_returned INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_virtual_tipping_user ON virtual_tipping_entries(user_id, created_at DESC);

-- ==============================================================================
-- ROW-LEVEL SECURITY (RLS) POLICIES
-- ==============================================================================
ALTER TABLE user_entitlements ENABLE ROW LEVEL SECURITY;
ALTER TABLE unlocked_matches ENABLE ROW LEVEL SECURITY;
ALTER TABLE payment_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE virtual_tipping_entries ENABLE ROW LEVEL SECURITY;

-- 1. user_entitlements policies
CREATE POLICY "Users can read own entitlements"
    ON user_entitlements FOR SELECT
    USING (auth.uid()::text = user_id OR user_id = 'anonymous_session');

CREATE POLICY "Service role manages entitlements"
    ON user_entitlements FOR ALL
    USING (auth.jwt() ->> 'role' = 'service_role');

-- 2. unlocked_matches policies
CREATE POLICY "Users can read own unlocked matches"
    ON unlocked_matches FOR SELECT
    USING (auth.uid()::text = user_id OR user_id = 'anonymous_session');

CREATE POLICY "Service role manages unlocked matches"
    ON unlocked_matches FOR ALL
    USING (auth.jwt() ->> 'role' = 'service_role');

-- 3. payment_transactions policies
CREATE POLICY "Users can read own transactions"
    ON payment_transactions FOR SELECT
    USING (auth.uid()::text = user_id);

CREATE POLICY "Service role manages payment transactions"
    ON payment_transactions FOR ALL
    USING (auth.jwt() ->> 'role' = 'service_role');

-- 4. virtual_tipping_entries policies
CREATE POLICY "Users can read all tipping leaderboards"
    ON virtual_tipping_entries FOR SELECT
    USING (true);

CREATE POLICY "Users can insert own tips"
    ON virtual_tipping_entries FOR INSERT
    WITH CHECK (auth.uid()::text = user_id);

CREATE POLICY "Service role settles tipping entries"
    ON virtual_tipping_entries FOR ALL
    USING (auth.jwt() ->> 'role' = 'service_role');
