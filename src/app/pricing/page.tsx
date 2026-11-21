'use client';

import React, { useState } from 'react';
import { TerminalLayout } from '@/components/terminal/TerminalLayout';
import { useI18n } from '@/i18n/context';
import { useEntitlements } from '@/hooks/useEntitlements';
import { PRICING_PLANS, MONETIZATION_ENABLED } from '@/config/entitlements';
import { PricingPlan, PricingPlanId, PaymentRail, CryptoNetwork, CryptoCurrency } from '@/lib/billing/types';
import { createPaymentIntent, SUPPORTED_NETWORKS, CRYPTO_DEPOSIT_WALLETS } from '@/lib/billing/paymentRails';
import {
  Check,
  ShieldCheck,
  Zap,
  CreditCard,
  Coins,
  QrCode,
  Copy,
  ExternalLink,
  Sparkles,
  AlertCircle,
  X
} from 'lucide-react';

export default function PricingPage() {
  const { t } = useI18n();
  const { isPro, isWeekendPassActive, creditsBalance, addCredits, activateWeekendPass, upgradeToPro } = useEntitlements();

  const [selectedPlan, setSelectedPlan] = useState<PricingPlan | null>(null);
  const [paymentRail, setPaymentRail] = useState<PaymentRail>('stablecoin');
  const [selectedNetwork, setSelectedNetwork] = useState<CryptoNetwork>('base');
  const [selectedCurrency, setSelectedCurrency] = useState<CryptoCurrency>('USDC');
  const [paymentModalOpen, setPaymentModalOpen] = useState(false);
  const [copiedAddress, setCopiedAddress] = useState(false);
  const [simulationSuccess, setSimulationSuccess] = useState(false);

  const handleOpenPayment = (plan: PricingPlan) => {
    if (plan.id === 'free') return;
    setSelectedPlan(plan);
    setPaymentModalOpen(true);
    setSimulationSuccess(false);
  };

  const handleSimulatePayment = () => {
    if (!selectedPlan) return;
    if (selectedPlan.id === 'weekend_pass') {
      activateWeekendPass(48);
    } else if (selectedPlan.creditsCount) {
      addCredits(selectedPlan.creditsCount);
    } else if (selectedPlan.type === 'subscription') {
      upgradeToPro();
    }
    setSimulationSuccess(true);
  };

  const depositAddress = CRYPTO_DEPOSIT_WALLETS[selectedNetwork];

  const handleCopy = (text: string) => {
    navigator.clipboard?.writeText(text);
    setCopiedAddress(true);
    setTimeout(() => setCopiedAddress(false), 2000);
  };

  return (
    <TerminalLayout showFilters={false}>
      <div className="space-y-6 max-w-6xl mx-auto">
        {/* Early Access Banner when MONETIZATION_ENABLED = false */}
        {!MONETIZATION_ENABLED && (
          <div className="rounded-xl border border-terminal-accentEmerald/30 bg-terminal-accentEmerald/10 p-4 text-xs">
            <div className="flex items-start gap-3">
              <Sparkles className="h-5 w-5 text-terminal-accentEmerald shrink-0 mt-0.5" />
              <div>
                <h3 className="font-bold text-terminal-accentEmerald text-sm">
                  {t.pricing.earlyAccessBanner || 'Early Access Mode Active'}
                </h3>
                <p className="mt-0.5 text-terminal-textSecondary leading-relaxed">
                  {t.pricing.earlyAccessCta || 'SALMO is currently in open research & live validation mode. All pre-match Asian Handicap, Over/Under, and Moneyline terminal features are completely unrestricted for community research.'}
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Pricing Header */}
        <div className="text-center max-w-2xl mx-auto border-b border-terminal-border pb-6">
          <div className="inline-flex items-center gap-1.5 rounded-full border border-terminal-accentEmerald/30 bg-terminal-accentEmerald/10 px-3 py-1 text-[11px] font-mono font-semibold text-terminal-accentEmerald">
            <Zap className="h-3.5 w-3.5" />
            <span>AFFORDABLE BETTOR ACCESS • FIAT & STABLECOINS</span>
          </div>
          <h1 className="mt-3 text-2xl sm:text-3xl font-extrabold tracking-tight text-terminal-textPrimary">
            Worldwide Low-Friction Pricing
          </h1>
          <p className="mt-2 text-xs sm:text-sm text-terminal-textSecondary leading-relaxed">
            Non-expiring credit packs, 48-hour weekend passes, and institutional monthly passes. Pay with Card, PayPal, or Stablecoins (USDC / USDT) with zero banking friction.
          </p>
        </div>

        {/* Pricing Matrix Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
          {/* FREE PLAN */}
          <div className="rounded-xl border border-terminal-border bg-terminal-card p-5 flex flex-col justify-between">
            <div>
              <div className="text-[10px] font-mono font-bold uppercase tracking-wider text-terminal-textMuted">
                COMMUNITY
              </div>
              <h3 className="mt-1 text-xl font-bold text-terminal-textPrimary">Free Scout</h3>
              <div className="mt-3 font-mono text-3xl font-extrabold text-terminal-textPrimary font-tabular">
                $0
                <span className="text-xs font-normal text-terminal-textMuted ml-1">/ forever</span>
              </div>
              <p className="mt-2 text-xs text-terminal-textSecondary">
                Essential pre-match surveillance for casual weekend punters.
              </p>

              <ul className="mt-5 space-y-2 text-xs text-terminal-textSecondary">
                <li className="flex items-center gap-2">
                  <Check className="h-3.5 w-3.5 text-terminal-accentEmerald shrink-0" />
                  <span>3 full fixture deep-dives per calendar day</span>
                </li>
                <li className="flex items-center gap-2">
                  <Check className="h-3.5 w-3.5 text-terminal-accentEmerald shrink-0" />
                  <span>Benchmark Asian Handicap & O/U odds</span>
                </li>
                <li className="flex items-center gap-2">
                  <Check className="h-3.5 w-3.5 text-terminal-accentEmerald shrink-0" />
                  <span>Devigged Fair Odds comparison</span>
                </li>
                <li className="flex items-center gap-2">
                  <Check className="h-3.5 w-3.5 text-terminal-accentEmerald shrink-0" />
                  <span>Full OddsJam-style terminal interface</span>
                </li>
              </ul>
            </div>

            <div className="mt-6 pt-4 border-t border-terminal-border">
              <button
                disabled
                className="w-full rounded-md border border-terminal-border bg-terminal-panel py-2 text-xs font-semibold text-terminal-textMuted cursor-default"
              >
                {!isPro && !isWeekendPassActive ? 'Current Active Tier' : 'Included'}
              </button>
            </div>
          </div>

          {/* WEEKEND PASS & CREDIT PACKS (NON-SUBSCRIPTION) */}
          <div className="rounded-xl border border-terminal-accentEmerald/50 bg-terminal-panel p-5 flex flex-col justify-between relative shadow-lg">
            <div className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-terminal-accentEmerald px-3 py-0.5 text-[9px] font-mono font-extrabold uppercase tracking-wider text-black">
              MOST POPULAR FOR BETTORS
            </div>

            <div>
              <div className="text-[10px] font-mono font-bold uppercase tracking-wider text-terminal-accentEmerald">
                NON-SUBSCRIPTION FLEX
              </div>
              <h3 className="mt-1 text-xl font-bold text-terminal-textPrimary">
                Passes & Credit Packs
              </h3>
              <div className="mt-3 font-mono text-3xl font-extrabold text-terminal-accentEmerald font-tabular">
                $1.99 <span className="text-xs font-normal text-terminal-textMuted">to $9.99</span>
              </div>
              <p className="mt-2 text-xs text-terminal-textSecondary">
                Zero recurring charges. Credits never expire; passes run 48 hours.
              </p>

              <div className="mt-4 space-y-2.5">
                {/* Option A: Weekend Pass */}
                <div
                  onClick={() => handleOpenPayment(PRICING_PLANS[1])}
                  className="rounded-lg border border-terminal-border bg-terminal-card p-2.5 hover:border-terminal-accentEmerald/50 transition-colors cursor-pointer"
                >
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-bold text-terminal-textPrimary">Weekend Pass (48h)</span>
                    <span className="font-mono font-bold text-terminal-accentEmerald">$1.99</span>
                  </div>
                  <p className="text-[11px] text-terminal-textMuted mt-0.5">
                    All matches unlocked for Saturday + Sunday action.
                  </p>
                </div>

                {/* Option B: Starter 40 */}
                <div
                  onClick={() => handleOpenPayment(PRICING_PLANS[2])}
                  className="rounded-lg border border-terminal-border bg-terminal-card p-2.5 hover:border-terminal-accentEmerald/50 transition-colors cursor-pointer"
                >
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-bold text-terminal-textPrimary">Starter 40 Pack</span>
                    <span className="font-mono font-bold text-terminal-accentEmerald">$4.99</span>
                  </div>
                  <p className="text-[11px] text-terminal-textMuted mt-0.5">
                    40 match unlocks ($0.12/match). Never expires.
                  </p>
                </div>

                {/* Option C: Grinder 100 */}
                <div
                  onClick={() => handleOpenPayment(PRICING_PLANS[3])}
                  className="rounded-lg border border-terminal-accentEmerald/40 bg-terminal-card p-2.5 hover:border-terminal-accentEmerald transition-colors cursor-pointer"
                >
                  <div className="flex items-center justify-between text-xs">
                    <div className="flex items-center gap-1.5">
                      <span className="font-bold text-terminal-textPrimary">Grinder 100 Pack</span>
                      <span className="rounded bg-terminal-accentEmerald/20 text-terminal-accentEmerald text-[9px] px-1 font-mono font-bold">
                        VALUE
                      </span>
                    </div>
                    <span className="font-mono font-bold text-terminal-accentEmerald">$9.99</span>
                  </div>
                  <p className="text-[11px] text-terminal-textMuted mt-0.5">
                    100 match unlocks ($0.09/match). Never expires.
                  </p>
                </div>
              </div>
            </div>

            <div className="mt-6 pt-4 border-t border-terminal-border">
              <button
                onClick={() => handleOpenPayment(PRICING_PLANS[3])}
                className="w-full rounded-md bg-terminal-accentEmerald py-2 text-xs font-bold text-black hover:bg-terminal-accentEmerald/90 transition-colors shadow-sm"
              >
                Choose Pass or Pack
              </button>
            </div>
          </div>

          {/* PRO SUBSCRIPTION */}
          <div className="rounded-xl border border-terminal-border bg-terminal-card p-5 flex flex-col justify-between">
            <div>
              <div className="text-[10px] font-mono font-bold uppercase tracking-wider text-terminal-cyan">
                QUANT PRO
              </div>
              <h3 className="mt-1 text-xl font-bold text-terminal-textPrimary">Pro Pass</h3>
              <div className="mt-3 font-mono text-3xl font-extrabold text-terminal-textPrimary font-tabular">
                $7.99
                <span className="text-xs font-normal text-terminal-textMuted ml-1">/ month</span>
              </div>
              <p className="mt-2 text-xs text-terminal-textSecondary">
                Or $59/year ($4.91/mo, saves 38%). Full unlimited access.
              </p>

              <ul className="mt-5 space-y-2 text-xs text-terminal-textSecondary">
                <li className="flex items-center gap-2">
                  <Check className="h-3.5 w-3.5 text-terminal-accentEmerald shrink-0" />
                  <span>Unlimited match unlocks across all 5 leagues</span>
                </li>
                <li className="flex items-center gap-2">
                  <Check className="h-3.5 w-3.5 text-terminal-accentEmerald shrink-0" />
                  <span>Full quarter lines (-1.50 to +1.50)</span>
                </li>
                <li className="flex items-center gap-2">
                  <Check className="h-3.5 w-3.5 text-terminal-accentEmerald shrink-0" />
                  <span>+EV Value Scanner real-time alerts</span>
                </li>
                <li className="flex items-center gap-2">
                  <Check className="h-3.5 w-3.5 text-terminal-accentEmerald shrink-0" />
                  <span>Full transparent public ledger & CSV export</span>
                </li>
                <li className="flex items-center gap-2">
                  <Check className="h-3.5 w-3.5 text-terminal-accentEmerald shrink-0" />
                  <span>Cancel anytime with 1-click</span>
                </li>
              </ul>
            </div>

            <div className="mt-6 pt-4 border-t border-terminal-border space-y-2">
              <button
                onClick={() => handleOpenPayment(PRICING_PLANS[4])}
                className="w-full rounded-md border border-terminal-border bg-terminal-elevated hover:bg-terminal-panel py-2 text-xs font-semibold text-terminal-textPrimary transition-colors"
              >
                Get Pro Monthly ($7.99)
              </button>
              <button
                onClick={() => handleOpenPayment(PRICING_PLANS[5])}
                className="w-full rounded-md border border-terminal-accentEmerald/30 bg-terminal-accentEmerald/10 hover:bg-terminal-accentEmerald/20 py-1.5 text-xs font-semibold text-terminal-accentEmerald transition-colors"
              >
                Annual Pass ($59/yr — Save 38%)
              </button>
            </div>
          </div>
        </div>

        {/* Payment Rails Selector & Modal */}
        {paymentModalOpen && selectedPlan && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <div
              className="fixed inset-0 bg-black/75 backdrop-blur-xs"
              onClick={() => setPaymentModalOpen(false)}
            />

            <div className="relative w-full max-w-lg rounded-xl border border-terminal-border bg-terminal-card p-6 shadow-2xl z-10 space-y-4 text-terminal-textPrimary">
              <div className="flex items-center justify-between border-b border-terminal-border pb-3">
                <div className="flex items-center gap-2">
                  <div className="h-7 w-7 rounded bg-terminal-accentEmerald/20 flex items-center justify-center text-terminal-accentEmerald">
                    <CreditCard className="h-4 w-4" />
                  </div>
                  <div>
                    <h3 className="font-bold text-sm text-terminal-textPrimary">
                      Checkout: {selectedPlan.name}
                    </h3>
                    <div className="text-xs font-mono text-terminal-accentEmerald">
                      ${selectedPlan.priceUsd.toFixed(2)} USD
                    </div>
                  </div>
                </div>

                <button
                  onClick={() => setPaymentModalOpen(false)}
                  className="p-1 rounded text-terminal-textMuted hover:text-terminal-textPrimary"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              {simulationSuccess ? (
                <div className="py-6 text-center space-y-3">
                  <div className="h-12 w-12 rounded-full bg-terminal-accentEmerald/20 text-terminal-accentEmerald flex items-center justify-center mx-auto">
                    <Check className="h-6 w-6" />
                  </div>
                  <h4 className="font-bold text-base text-terminal-textPrimary">
                    Entitlement Activated!
                  </h4>
                  <p className="text-xs text-terminal-textSecondary max-w-sm mx-auto">
                    Your {selectedPlan.name} is now active in this terminal session. All corresponding matches and quarter lines are unlocked.
                  </p>
                  <button
                    onClick={() => setPaymentModalOpen(false)}
                    className="mt-2 rounded bg-terminal-accentEmerald px-4 py-2 text-xs font-bold text-black"
                  >
                    Return to Terminal
                  </button>
                </div>
              ) : (
                <>
                  {/* Payment Rail Toggle */}
                  <div className="grid grid-cols-2 gap-2 p-1 rounded-lg border border-terminal-border bg-terminal-panel">
                    <button
                      onClick={() => setPaymentRail('stablecoin')}
                      className={`py-2 text-xs font-semibold rounded transition-colors flex items-center justify-center gap-1.5 ${
                        paymentRail === 'stablecoin'
                          ? 'bg-terminal-card text-terminal-accentEmerald font-bold shadow-xs'
                          : 'text-terminal-textMuted hover:text-terminal-textPrimary'
                      }`}
                    >
                      <Coins className="h-3.5 w-3.5" />
                      <span>Stablecoins (USDC/USDT)</span>
                    </button>
                    <button
                      onClick={() => setPaymentRail('fiat')}
                      className={`py-2 text-xs font-semibold rounded transition-colors flex items-center justify-center gap-1.5 ${
                        paymentRail === 'fiat'
                          ? 'bg-terminal-card text-terminal-accentEmerald font-bold shadow-xs'
                          : 'text-terminal-textMuted hover:text-terminal-textPrimary'
                      }`}
                    >
                      <CreditCard className="h-3.5 w-3.5" />
                      <span>Card / PayPal</span>
                    </button>
                  </div>

                  {/* STABLECOIN RAIL */}
                  {paymentRail === 'stablecoin' ? (
                    <div className="space-y-3 pt-1">
                      {/* Network & Currency Switcher */}
                      <div className="grid grid-cols-2 gap-2 text-xs">
                        <div>
                          <label className="text-[10px] uppercase font-mono text-terminal-textMuted block mb-1">
                            Network:
                          </label>
                          <select
                            value={selectedNetwork}
                            onChange={(e) => setSelectedNetwork(e.target.value as CryptoNetwork)}
                            className="w-full rounded border border-terminal-border bg-terminal-panel px-2.5 py-1.5 text-xs text-terminal-textPrimary font-mono focus:outline-none"
                          >
                            {SUPPORTED_NETWORKS.map((n) => (
                              <option key={n.id} value={n.id}>
                                {n.name} ({n.fee})
                              </option>
                            ))}
                          </select>
                        </div>

                        <div>
                          <label className="text-[10px] uppercase font-mono text-terminal-textMuted block mb-1">
                            Token:
                          </label>
                          <div className="grid grid-cols-2 gap-1">
                            {(['USDC', 'USDT'] as const).map((curr) => (
                              <button
                                key={curr}
                                onClick={() => setSelectedCurrency(curr)}
                                className={`py-1.5 rounded text-xs font-mono font-bold transition-colors ${
                                  selectedCurrency === curr
                                    ? 'bg-terminal-accentEmerald text-black'
                                    : 'bg-terminal-panel text-terminal-textMuted border border-terminal-border'
                                }`}
                              >
                                {curr}
                              </button>
                            ))}
                          </div>
                        </div>
                      </div>

                      {/* Deposit Address & QR Area */}
                      <div className="rounded-lg border border-terminal-border bg-terminal-panel p-3 space-y-2">
                        <div className="flex items-center justify-between text-[11px] text-terminal-textMuted font-mono">
                          <span>Deposit Address ({selectedNetwork.toUpperCase()}):</span>
                          <button
                            onClick={() => handleCopy(depositAddress)}
                            className="flex items-center gap-1 text-terminal-accentEmerald hover:underline"
                          >
                            <Copy className="h-3 w-3" />
                            <span>{copiedAddress ? 'Copied!' : 'Copy'}</span>
                          </button>
                        </div>
                        <div className="rounded border border-terminal-border bg-terminal-card p-2 text-xs font-mono break-all text-terminal-textPrimary">
                          {depositAddress}
                        </div>
                        <div className="text-[10px] text-terminal-textMuted">
                          Send exactly <strong className="text-terminal-accentEmerald font-mono">${selectedPlan.priceUsd.toFixed(2)} {selectedCurrency}</strong> to the address above. Auto-activates on 1 confirmation.
                        </div>
                      </div>

                      {/* Client-Side Activation Simulation Button */}
                      <button
                        onClick={handleSimulatePayment}
                        className="w-full rounded-md bg-terminal-accentEmerald py-2.5 text-xs font-bold text-black hover:bg-terminal-accentEmerald/90 transition-colors shadow-sm"
                      >
                        Verify & Activate Access (Instant)
                      </button>
                    </div>
                  ) : (
                    /* FIAT RAIL */
                    <div className="space-y-3 pt-1">
                      <div className="rounded-lg border border-terminal-border bg-terminal-panel p-4 text-xs space-y-2">
                        <div className="font-semibold text-terminal-textPrimary">
                          Secure Card & PayPal Processing
                        </div>
                        <p className="text-terminal-textSecondary text-[11px] leading-relaxed">
                          Worldwide debit/credit cards accepted (Visa, Mastercard, Amex) with bank-grade 256-bit SSL encryption.
                        </p>
                      </div>

                      <button
                        onClick={handleSimulatePayment}
                        className="w-full rounded-md bg-terminal-accentEmerald py-2.5 text-xs font-bold text-black hover:bg-terminal-accentEmerald/90 transition-colors shadow-sm flex items-center justify-center gap-1.5"
                      >
                        <CreditCard className="h-4 w-4" />
                        <span>Pay ${selectedPlan.priceUsd.toFixed(2)} with Card / PayPal</span>
                      </button>
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        )}

        {/* 18+ Responsible Betting & Non-Gambling Disclaimer */}
        <div className="rounded-lg border border-terminal-border bg-terminal-card p-4 text-xs text-terminal-textMuted space-y-2">
          <div className="flex items-center gap-2 text-terminal-accentAmber font-bold">
            <AlertCircle className="h-4 w-4 shrink-0" />
            <span>18+ Responsible Wagering & Platform Terms:</span>
          </div>
          <p className="leading-relaxed text-[11px]">
            SALMO is a sports analytics and data visualization terminal for informational, research, and entertainment purposes only. SALMO is NOT a bookmaker, does not accept or place bets, and does not handle wagering funds or gambling deposits. Past mathematical backtests do not guarantee future betting results. Please bet responsibly within your means.
          </p>
        </div>
      </div>
    </TerminalLayout>
  );
}
