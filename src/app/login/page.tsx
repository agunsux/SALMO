'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth/AuthContext';
import { Eye, EyeOff, ArrowRight, ShieldCheck, AlertCircle, CheckCircle2 } from 'lucide-react';

export default function LoginPage() {
  const router = useRouter();
  const { user, loading: authLoading, signIn, resetPassword } = useAuth();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [resetSuccess, setResetSuccess] = useState<string | null>(null);
  const [isResetMode, setIsResetMode] = useState(false);

  // If already authenticated, redirect immediately to dashboard
  useEffect(() => {
    if (!authLoading && user) {
      router.replace('/dashboard');
    }
  }, [user, authLoading, router]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setResetSuccess(null);

    if (!email.trim() || !email.includes('@')) {
      setErrorMsg('Please enter a valid email address.');
      return;
    }

    if (isResetMode) {
      setLoading(true);
      const { error } = await resetPassword(email);
      setLoading(false);
      if (error) {
        setErrorMsg(error.message || 'Unable to send reset email. Please try again.');
      } else {
        setResetSuccess('Password reset link sent. Please check your inbox.');
      }
      return;
    }

    if (!password) {
      setErrorMsg('Please enter your password.');
      return;
    }

    setLoading(true);
    const { error } = await signIn(email, password);
    setLoading(false);

    if (error) {
      // Security conscious error reporting: avoid exposing specific backend details
      const msg = error.message.toLowerCase();
      if (msg.includes('invalid') || msg.includes('credential') || msg.includes('password')) {
        setErrorMsg('Invalid email or password. Please verify and try again.');
      } else {
        setErrorMsg(error.message || 'Authentication failed. Please try again.');
      }
    } else {
      router.push('/dashboard');
    }
  };

  return (
    <div className="min-h-screen flex flex-col justify-between bg-[#F6F3EE] text-[#14110F] px-4 py-8 sm:px-6">
      {/* Top Simple Brand Header */}
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

      {/* Main Authentication Card */}
      <main className="w-full max-w-md mx-auto my-auto">
        <div className="rounded-lg border border-[#E4DED4] bg-white p-6 sm:p-8 shadow-sm">
          {/* Header */}
          <div className="mb-6">
            <span className="text-[10px] font-mono uppercase tracking-widest text-[#6B645C]">
              01 / Access
            </span>
            <h1 className="mt-1 font-serif text-2xl sm:text-3xl font-bold tracking-tight text-[#14110F]">
              {isResetMode ? 'Reset password' : 'Sign in to your account'}
            </h1>
            <p className="mt-1 text-xs text-[#6B645C]">
              {isResetMode
                ? 'Enter your registered email to receive a secure recovery link.'
                : 'Access institutional football market decision intelligence.'}
            </p>
          </div>

          {/* Alert Message Box */}
          {errorMsg && (
            <div className="mb-5 flex items-start gap-2.5 rounded-md border border-[#FAD2CF] bg-[#FCE8E6] p-3 text-xs text-[#C5221F]">
              <AlertCircle className="h-4 w-4 shrink-0 mt-0.5 text-[#D93025]" />
              <div className="flex-1 font-sans">{errorMsg}</div>
            </div>
          )}

          {resetSuccess && (
            <div className="mb-5 flex items-start gap-2.5 rounded-md border border-[#BFE7CA] bg-[#EAF7EE] p-3 text-xs text-[#137333]">
              <CheckCircle2 className="h-4 w-4 shrink-0 mt-0.5 text-[#1E8E3E]" />
              <div className="flex-1 font-sans">{resetSuccess}</div>
            </div>
          )}

          {/* Form */}
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label
                htmlFor="login-email"
                className="block text-xs font-medium text-[#14110F] mb-1.5 font-sans"
              >
                Email address
              </label>
              <input
                id="login-email"
                type="email"
                autoComplete="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="analyst@domain.com"
                className="w-full rounded-md border border-[#E4DED4] bg-white px-3 py-2 text-xs text-[#14110F] placeholder-[#9E968D] font-mono focus:border-[#3B1515] focus:outline-none focus:ring-1 focus:ring-[#3B1515]"
              />
            </div>

            {!isResetMode && (
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label
                    htmlFor="login-password"
                    className="block text-xs font-medium text-[#14110F] font-sans"
                  >
                    Password
                  </label>
                  <button
                    type="button"
                    onClick={() => {
                      setIsResetMode(true);
                      setErrorMsg(null);
                      setResetSuccess(null);
                    }}
                    className="text-[11px] text-[#6B645C] hover:text-[#3B1515] font-sans transition-colors"
                  >
                    Forgot password?
                  </button>
                </div>
                <div className="relative">
                  <input
                    id="login-password"
                    type={showPassword ? 'text' : 'password'}
                    autoComplete="current-password"
                    required={!isResetMode}
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
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full mt-2 inline-flex items-center justify-center gap-2 rounded-md bg-[#3B1515] px-4 py-2.5 text-xs font-semibold text-white hover:bg-[#2A0E0E] disabled:opacity-60 transition-colors focus:outline-none focus:ring-2 focus:ring-[#3B1515] focus:ring-offset-2"
            >
              {loading ? (
                <>
                  <span className="h-3.5 w-3.5 rounded-full border-2 border-white/40 border-t-white animate-spin"></span>
                  <span>Authenticating...</span>
                </>
              ) : isResetMode ? (
                <span>Send recovery link</span>
              ) : (
                <>
                  <span>Log in</span>
                  <ArrowRight className="h-3.5 w-3.5" />
                </>
              )}
            </button>
          </form>

          {isResetMode && (
            <div className="mt-4 text-center">
              <button
                type="button"
                onClick={() => {
                  setIsResetMode(false);
                  setErrorMsg(null);
                  setResetSuccess(null);
                }}
                className="text-xs text-[#6B645C] hover:text-[#14110F] transition-colors"
              >
                ← Back to log in
              </button>
            </div>
          )}

          {/* Footer inside card */}
          <div className="mt-6 border-t border-[#EDE8E0] pt-4 text-center text-xs text-[#6B645C]">
            <span>Don't have an account? </span>
            <Link
              href="/signup"
              className="font-semibold text-[#3B1515] hover:underline"
            >
              Create free account
            </Link>
          </div>
        </div>

        {/* Security badge note */}
        <div className="mt-4 flex items-center justify-center gap-1.5 text-[11px] text-[#6B645C]">
          <ShieldCheck className="h-3.5 w-3.5 text-[#1E8E3E]" />
          <span>Encrypted authentication · Zero tracking · Pre-match intelligence</span>
        </div>
      </main>

      {/* Simple Footer */}
      <footer className="w-full max-w-5xl mx-auto text-center text-[11px] text-[#9E968D]">
        SALMO provides statistical analysis for informational purposes only. Past performance does not guarantee future results. 18+
      </footer>
    </div>
  );
}
