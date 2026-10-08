'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth/AuthContext';
import { Eye, EyeOff, ArrowRight, ShieldCheck, AlertCircle, CheckCircle2 } from 'lucide-react';

export default function SignupPage() {
  const router = useRouter();
  const { user, loading: authLoading, signUp } = useAuth();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [agreeTerms, setAgreeTerms] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // If already authenticated, redirect to dashboard
  useEffect(() => {
    if (!authLoading && user) {
      router.replace('/dashboard');
    }
  }, [user, authLoading, router]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setSuccessMsg(null);

    // 1. Validation
    if (!email.trim() || !email.includes('@')) {
      setErrorMsg('Please enter a valid email address.');
      return;
    }

    if (!password || password.length < 8) {
      setErrorMsg('Password must be at least 8 characters in length.');
      return;
    }

    if (password !== confirmPassword) {
      setErrorMsg('Passwords do not match. Please verify.');
      return;
    }

    if (!agreeTerms) {
      setErrorMsg('Please acknowledge the informational use and 18+ requirement to proceed.');
      return;
    }

    setLoading(true);
    const { error, session } = await signUp(email, password);
    setLoading(false);

    if (error) {
      const msg = error.message.toLowerCase();
      if (msg.includes('already registered') || msg.includes('user already exists')) {
        setErrorMsg('An account with this email address already exists. Please log in.');
      } else {
        setErrorMsg(error.message || 'Registration failed. Please try again.');
      }
    } else {
      if (session) {
        // Immediate session granted
        router.push('/dashboard');
      } else {
        // Supabase requires email verification
        setSuccessMsg('Account created successfully. Please check your email to confirm your account.');
      }
    }
  };

  return (
    <div className="min-h-screen flex flex-col justify-between bg-[#F6F3EE] text-[#14110F] px-4 py-8 sm:px-6">
      {/* Brand Header */}
      <div className="w-full max-w-5xl mx-auto flex items-center justify-between">
        <Link href="/" className="inline-flex items-center gap-1.5 group">
          <span className="font-serif text-2xl font-bold tracking-tight text-[#14110F] group-hover:text-[#3B1515] transition-colors">
            SALMO
          </span>
          <span className="h-1.5 w-1.5 rounded-full bg-[#E8664A] -mb-2"></span>
        </Link>
        <Link
          href="/"
          className="text-xs font-mono text-[#6B645C] hover:text-[#14110F] transition-colors"
        >
          ← Return to overview
        </Link>
      </div>

      {/* Main Registration Card */}
      <main className="w-full max-w-md mx-auto my-auto">
        <div className="rounded-lg border border-[#E4DED4] bg-white p-6 sm:p-8 shadow-sm">
          {/* Header */}
          <div className="mb-6">
            <span className="text-[10px] font-mono uppercase tracking-widest text-[#6B645C]">
              01 / Registration
            </span>
            <h1 className="mt-1 font-serif text-2xl sm:text-3xl font-bold tracking-tight text-[#14110F]">
              Create free account
            </h1>
            <p className="mt-1 text-xs text-[#6B645C]">
              Institutional prematch football market analysis and mathematical research.
            </p>
          </div>

          {/* Error Message */}
          {errorMsg && (
            <div className="mb-5 flex items-start gap-2.5 rounded-md border border-[#FAD2CF] bg-[#FCE8E6] p-3 text-xs text-[#C5221F]">
              <AlertCircle className="h-4 w-4 shrink-0 mt-0.5 text-[#D93025]" />
              <div className="flex-1 font-sans">{errorMsg}</div>
            </div>
          )}

          {/* Success Message */}
          {successMsg ? (
            <div className="space-y-4">
              <div className="flex items-start gap-2.5 rounded-md border border-[#BFE7CA] bg-[#EAF7EE] p-4 text-xs text-[#137333]">
                <CheckCircle2 className="h-5 w-5 shrink-0 mt-0.5 text-[#1E8E3E]" />
                <div className="flex-1 font-sans space-y-1">
                  <div className="font-semibold text-sm">Verification Email Sent</div>
                  <div>{successMsg}</div>
                </div>
              </div>
              <div className="text-center pt-2">
                <Link
                  href="/login"
                  className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#3B1515] hover:underline"
                >
                  <span>Proceed to Log in</span>
                  <ArrowRight className="h-3.5 w-3.5" />
                </Link>
              </div>
            </div>
          ) : (
            /* Registration Form */
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label
                  htmlFor="signup-email"
                  className="block text-xs font-medium text-[#14110F] mb-1.5 font-sans"
                >
                  Email address
                </label>
                <input
                  id="signup-email"
                  type="email"
                  autoComplete="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="analyst@domain.com"
                  className="w-full rounded-md border border-[#E4DED4] bg-white px-3 py-2 text-xs text-[#14110F] placeholder-[#9E968D] font-mono focus:border-[#3B1515] focus:outline-none focus:ring-1 focus:ring-[#3B1515]"
                />
              </div>

              <div>
                <label
                  htmlFor="signup-password"
                  className="block text-xs font-medium text-[#14110F] mb-1.5 font-sans"
                >
                  Password (minimum 8 characters)
                </label>
                <div className="relative">
                  <input
                    id="signup-password"
                    type={showPassword ? 'text' : 'password'}
                    autoComplete="new-password"
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••••••"
                    className="w-full rounded-md border border-[#E4DED4] bg-white px-3 py-2 pr-9 text-xs text-[#14110F] placeholder-[#9E968D] font-mono focus:border-[#3B1515] focus:outline-none focus:ring-1 focus:ring-[#3B1515]"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    aria-label={showPassword ? 'Hide password' : 'Show password'}
                    className="absolute right-2.5 top-2.5 text-[#9E968D] hover:text-[#14110F] transition-colors"
                  >
                    {showPassword ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                  </button>
                </div>
              </div>

              <div>
                <label
                  htmlFor="signup-confirm-password"
                  className="block text-xs font-medium text-[#14110F] mb-1.5 font-sans"
                >
                  Confirm password
                </label>
                <input
                  id="signup-confirm-password"
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="new-password"
                  required
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="••••••••••••"
                  className="w-full rounded-md border border-[#E4DED4] bg-white px-3 py-2 text-xs text-[#14110F] placeholder-[#9E968D] font-mono focus:border-[#3B1515] focus:outline-none focus:ring-1 focus:ring-[#3B1515]"
                />
              </div>

              {/* Terms acknowledgement */}
              <div className="pt-1">
                <label className="flex items-start gap-2.5 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={agreeTerms}
                    onChange={(e) => setAgreeTerms(e.target.checked)}
                    className="h-4 w-4 rounded border-[#E4DED4] text-[#3B1515] focus:ring-[#3B1515] mt-0.5"
                  />
                  <span className="text-[11px] text-[#6B645C] leading-normal font-sans">
                    I acknowledge that SALMO provides statistical market analytics for informational purposes only. Past performance does not guarantee future results. (18+)
                  </span>
                </label>
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full mt-2 inline-flex items-center justify-center gap-2 rounded-md bg-[#3B1515] px-4 py-2.5 text-xs font-semibold text-white hover:bg-[#2A0E0E] disabled:opacity-60 transition-colors focus:outline-none focus:ring-2 focus:ring-[#3B1515] focus:ring-offset-2"
              >
                {loading ? (
                  <>
                    <span className="h-3.5 w-3.5 rounded-full border-2 border-white/40 border-t-white animate-spin"></span>
                    <span>Creating account...</span>
                  </>
                ) : (
                  <>
                    <span>Create free account</span>
                    <ArrowRight className="h-3.5 w-3.5" />
                  </>
                )}
              </button>
            </form>
          )}

          {/* Footer inside card */}
          <div className="mt-6 border-t border-[#EDE8E0] pt-4 text-center text-xs text-[#6B645C]">
            <span>Already have an account? </span>
            <Link
              href="/login"
              className="font-semibold text-[#3B1515] hover:underline"
            >
              Sign in here
            </Link>
          </div>
        </div>

        {/* Quiet footer badge */}
        <div className="mt-4 flex items-center justify-center gap-1.5 text-[11px] text-[#6B645C]">
          <ShieldCheck className="h-3.5 w-3.5 text-[#1E8E3E]" />
          <span>Transparent · Independent · Pre-match intelligence only</span>
        </div>
      </main>

      {/* Simple Footer */}
      <footer className="w-full max-w-5xl mx-auto text-center text-[11px] text-[#9E968D]">
        SALMO is free while we build a verifiable track record. MONETIZATION_ENABLED=false.
      </footer>
    </div>
  );
}
