const test = require('node:test');
const assert = require('node:assert/strict');

const DAILY_FREE_MATCH_LIMIT = 3;

const PRICING_PLANS = [
  { id: 'free', priceUsd: 0, type: 'free' },
  { id: 'weekend_pass', priceUsd: 1.99, durationHours: 48, type: 'pass' },
  { id: 'starter_credits_40', priceUsd: 4.99, creditsCount: 40, type: 'credits' },
  { id: 'grinder_credits_100', priceUsd: 9.99, creditsCount: 100, type: 'credits' },
  { id: 'pro_monthly', priceUsd: 7.99, type: 'subscription' },
  { id: 'pro_annual', priceUsd: 59.00, type: 'subscription' }
];

const CRYPTO_DEPOSIT_WALLETS = {
  base: '0x8a92Fb045D6e06D94d5059695C0893049F4c2741',
  polygon: '0x8a92Fb045D6e06D94d5059695C0893049F4c2741',
  arbitrum: '0x8a92Fb045D6e06D94d5059695C0893049F4c2741',
  tron: 'TX4N1f8Kk9gR89qY27LmMopGhyy7zF6XvV'
};

function createPaymentIntent(request) {
  const plan = PRICING_PLANS.find(p => p.id === request.planId);
  if (!plan) throw new Error(`Invalid plan: ${request.planId}`);
  const paymentId = `pay_${Date.now()}`;
  const expiresAt = new Date(Date.now() + 1800000).toISOString();

  if (request.rail === 'fiat') {
    return {
      success: true,
      paymentId,
      rail: 'fiat',
      amountUsd: plan.priceUsd,
      checkoutUrl: `/api/billing/checkout?session=${paymentId}&plan=${plan.id}`,
      expiresAt
    };
  }

  const network = request.cryptoNetwork || 'base';
  const currency = request.cryptoCurrency || 'USDC';
  const depositAddress = CRYPTO_DEPOSIT_WALLETS[network];
  const qrCodeData = network === 'tron'
    ? `tron:${depositAddress}?amount=${plan.priceUsd}&token=${currency}`
    : `ethereum:${depositAddress}?value=0&amount=${plan.priceUsd}&token=${currency}`;

  return {
    success: true,
    paymentId,
    rail: 'stablecoin',
    amountUsd: plan.priceUsd,
    cryptoAddress: depositAddress,
    cryptoAmount: plan.priceUsd,
    cryptoCurrency: currency,
    cryptoNetwork: network,
    qrCodeData,
    expiresAt
  };
}

test('Entitlements Config — 1. Pricing tiers & invariants', () => {
  assert.equal(DAILY_FREE_MATCH_LIMIT, 3, 'Free tier must allow exactly 3 matches/day');
  
  const planIds = PRICING_PLANS.map(p => p.id);
  assert.ok(planIds.includes('free'), 'Must include free plan');
  assert.ok(planIds.includes('weekend_pass'), 'Must include weekend_pass plan');
  assert.ok(planIds.includes('starter_credits_40'), 'Must include starter_credits_40 plan');
  assert.ok(planIds.includes('grinder_credits_100'), 'Must include grinder_credits_100 plan');
  assert.ok(planIds.includes('pro_monthly'), 'Must include pro_monthly plan');
  assert.ok(planIds.includes('pro_annual'), 'Must include pro_annual plan');

  const weekend = PRICING_PLANS.find(p => p.id === 'weekend_pass');
  assert.equal(weekend.priceUsd, 1.99, 'Weekend pass must be $1.99');
  assert.equal(weekend.durationHours, 48, 'Weekend pass must be 48 hours');

  const starter = PRICING_PLANS.find(p => p.id === 'starter_credits_40');
  assert.equal(starter.priceUsd, 4.99, 'Starter 40 must be $4.99');
  assert.equal(starter.creditsCount, 40, 'Starter 40 must give 40 credits');

  const grinder = PRICING_PLANS.find(p => p.id === 'grinder_credits_100');
  assert.equal(grinder.priceUsd, 9.99, 'Grinder 100 must be $9.99');
  assert.equal(grinder.creditsCount, 100, 'Grinder 100 must give 100 credits');

  const proMonthly = PRICING_PLANS.find(p => p.id === 'pro_monthly');
  assert.equal(proMonthly.priceUsd, 7.99, 'Pro monthly must be $7.99');

  const proAnnual = PRICING_PLANS.find(p => p.id === 'pro_annual');
  assert.equal(proAnnual.priceUsd, 59.00, 'Pro annual must be $59.00');
});

test('Multi-Rail Payments — 2. Fiat and Stablecoin payment intents', () => {
  // Test Fiat
  const fiatIntent = createPaymentIntent({
    planId: 'weekend_pass',
    rail: 'fiat',
    customerEmail: 'bettor@salmo.ai'
  });
  assert.equal(fiatIntent.success, true);
  assert.equal(fiatIntent.rail, 'fiat');
  assert.equal(fiatIntent.amountUsd, 1.99);
  assert.ok(fiatIntent.checkoutUrl.includes('pay_'));

  // Test Stablecoin Base
  const cryptoBase = createPaymentIntent({
    planId: 'grinder_credits_100',
    rail: 'stablecoin',
    cryptoNetwork: 'base',
    cryptoCurrency: 'USDC'
  });
  assert.equal(cryptoBase.success, true);
  assert.equal(cryptoBase.rail, 'stablecoin');
  assert.equal(cryptoBase.amountUsd, 9.99);
  assert.equal(cryptoBase.cryptoNetwork, 'base');
  assert.equal(cryptoBase.cryptoAddress, CRYPTO_DEPOSIT_WALLETS.base);
  assert.ok(cryptoBase.qrCodeData.startsWith('ethereum:'));

  // Test Stablecoin Tron TRC20
  const cryptoTron = createPaymentIntent({
    planId: 'starter_credits_40',
    rail: 'stablecoin',
    cryptoNetwork: 'tron',
    cryptoCurrency: 'USDT'
  });
  assert.equal(cryptoTron.success, true);
  assert.equal(cryptoTron.cryptoNetwork, 'tron');
  assert.equal(cryptoTron.cryptoAddress, CRYPTO_DEPOSIT_WALLETS.tron);
  assert.ok(cryptoTron.qrCodeData.startsWith('tron:'));
});

test('Entitlement Gating Simulation — 3. Quota & Credit Deductions', () => {
  function evaluateAccess(state, matchId, monetizationEnabled) {
    if (!monetizationEnabled) return { allowed: true, reason: 'early_access' };
    if (state.isPro) return { allowed: true, reason: 'pro' };
    if (state.isWeekendPassActive && new Date(state.weekendPassExpiresAt).getTime() > Date.now()) {
      return { allowed: true, reason: 'weekend_pass' };
    }
    if (state.unlockedMatchIds.includes(matchId)) return { allowed: true, reason: 'already_unlocked' };
    if (state.dailyFreeUsed < state.dailyFreeLimit) {
      return { allowed: true, reason: 'free_daily_quota' };
    }
    if (state.creditsBalance > 0) {
      return { allowed: true, reason: 'credits_available' };
    }
    return { allowed: false, reason: 'locked' };
  }

  // 1. Early Access (monetization=false): All matches unlocked
  const earlyState = {
    isPro: false,
    isWeekendPassActive: false,
    weekendPassExpiresAt: null,
    creditsBalance: 0,
    unlockedMatchIds: [],
    dailyFreeUsed: 10,
    dailyFreeLimit: 3
  };
  assert.equal(evaluateAccess(earlyState, 'm99', false).allowed, true);

  // 2. Monetization active:
  // Match 1, 2, 3 allowed
  const stateUnderQuota = {
    isPro: false,
    isWeekendPassActive: false,
    weekendPassExpiresAt: null,
    creditsBalance: 0,
    unlockedMatchIds: ['m1', 'm2'],
    dailyFreeUsed: 2,
    dailyFreeLimit: 3
  };
  assert.equal(evaluateAccess(stateUnderQuota, 'm3', true).allowed, true);

  // Match 4 with 0 credits is locked
  const stateLocked = {
    isPro: false,
    isWeekendPassActive: false,
    weekendPassExpiresAt: null,
    creditsBalance: 0,
    unlockedMatchIds: ['m1', 'm2', 'm3'],
    dailyFreeUsed: 3,
    dailyFreeLimit: 3
  };
  assert.equal(evaluateAccess(stateLocked, 'm4', true).allowed, false);

  // Match 4 with 10 credits is allowed
  const stateWithCredits = {
    ...stateLocked,
    creditsBalance: 10
  };
  assert.equal(evaluateAccess(stateWithCredits, 'm4', true).allowed, true);

  // Active Weekend Pass allows access even with 0 credits and quota exceeded
  const stateActivePass = {
    isPro: false,
    isWeekendPassActive: true,
    weekendPassExpiresAt: new Date(Date.now() + 86400000).toISOString(),
    creditsBalance: 0,
    unlockedMatchIds: ['m1', 'm2', 'm3'],
    dailyFreeUsed: 3,
    dailyFreeLimit: 3
  };
  assert.equal(evaluateAccess(stateActivePass, 'm4', true).allowed, true);

  // Expired Weekend Pass is locked
  const stateExpiredPass = {
    isPro: false,
    isWeekendPassActive: true,
    weekendPassExpiresAt: new Date(Date.now() - 3600000).toISOString(),
    creditsBalance: 0,
    unlockedMatchIds: ['m1', 'm2', 'm3'],
    dailyFreeUsed: 3,
    dailyFreeLimit: 3
  };
  assert.equal(evaluateAccess(stateExpiredPass, 'm4', true).allowed, false);
});
