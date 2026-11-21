'use client';

import React from 'react';
import { TerminalLayout } from '@/components/terminal/TerminalLayout';
import { Lock, ShieldCheck, EyeOff, Globe } from 'lucide-react';

export default function PrivacyPolicyPage() {
  return (
    <TerminalLayout showFilters={false}>
      <div className="space-y-6 max-w-4xl mx-auto text-terminal-textPrimary">
        {/* Header */}
        <div className="border-b border-terminal-border pb-4">
          <div className="flex items-center gap-2 text-[10px] font-mono uppercase tracking-wider text-terminal-accentCyan font-semibold">
            <Lock className="h-3.5 w-3.5" />
            <span>GLOBAL DATA PROTECTION SPECIFICATION</span>
          </div>
          <h1 className="mt-1 text-2xl sm:text-3xl font-extrabold tracking-tight text-terminal-textPrimary">
            Privacy Policy
          </h1>
          <p className="mt-1 text-xs sm:text-sm text-terminal-textSecondary leading-relaxed">
            Aligned with EU General Data Protection Regulation (GDPR) and ASEAN Data Privacy Standards (Indonesia UU PDP, Thailand PDPA, Vietnam PDPD).
          </p>
        </div>

        {/* Section 1: Data Collection & Zero Tracking */}
        <div className="rounded-xl border border-terminal-border bg-terminal-card p-5 space-y-3">
          <div className="flex items-center gap-2 text-terminal-accentEmerald font-bold text-sm">
            <EyeOff className="h-4 w-4" />
            <h2>1. Minimal Data Collection & Zero Invasive Tracking</h2>
          </div>
          <p className="text-xs text-terminal-textSecondary leading-relaxed">
            We adhere strictly to the principle of data minimization. We do not sell your personal data, browser fingerprint, or usage history to bookmakers, advertisers, or third-party marketing brokers.
          </p>
          <p className="text-xs text-terminal-textSecondary leading-relaxed">
            Data collected is strictly limited to:
          </p>
          <ul className="list-disc pl-5 text-xs text-terminal-textSecondary space-y-1">
            <li>Account identity (email address or Supabase auth ID).</li>
            <li>Billing records (transaction hashes, payment rail, item purchased).</li>
            <li>Terminal preferences (dark/bright theme, odds format, active language stored locally in your browser).</li>
          </ul>
        </div>

        {/* Section 2: GDPR & ASEAN Privacy Rights */}
        <div className="rounded-xl border border-terminal-border bg-terminal-card p-5 space-y-3">
          <div className="flex items-center gap-2 text-terminal-textPrimary font-bold text-sm">
            <Globe className="h-4 w-4 text-terminal-accentCyan" />
            <h2>2. User Rights under GDPR, UU PDP, & PDPA</h2>
          </div>
          <p className="text-xs text-terminal-textSecondary leading-relaxed">
            Users across all supported jurisdictions have the absolute right to:
          </p>
          <ul className="list-disc pl-5 text-xs text-terminal-textSecondary space-y-1">
            <li>Access a full export of personal account and transaction data.</li>
            <li>Request permanent deletion of account data (&ldquo;Right to be Forgotten&rdquo;).</li>
            <li>Revoke consent for analytics or functional cookies at any time.</li>
          </ul>
        </div>

        {/* Section 3: Security & Storage */}
        <div className="rounded-xl border border-terminal-border bg-terminal-card p-5 space-y-3">
          <div className="flex items-center gap-2 text-terminal-accentEmerald font-bold text-sm">
            <ShieldCheck className="h-4 w-4" />
            <h2>3. Cryptographic Security & Row-Level Security (RLS)</h2>
          </div>
          <p className="text-xs text-terminal-textSecondary leading-relaxed">
            All database storage is protected by strict PostgreSQL Row-Level Security (RLS). Payment transactions and entitlement states are cryptographically isolated so that no user can view or access another user&apos;s records.
          </p>
        </div>
      </div>
    </TerminalLayout>
  );
}
