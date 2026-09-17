import React, { useState, useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import {
  User,
  Lock,
  ArrowRight,
  Eye,
  EyeOff,
  Sun,
  Moon,
  Mail,
  BadgeCheck,
  KeyRound,
  CheckCircle2,
} from 'lucide-react';
import { useToast } from '../context/ToastContext';
import { useTheme } from '../context/ThemeContext';
import api from '../api/client';
import TaggifyLogo from '../components/common/TaggifyLogo';
import Tooltip from '../components/common/Tooltip';

const LoginPage = () => {
  const [authMode, setAuthMode] = useState('login'); // 'login' | 'verify'

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const [verifyEmailInput, setVerifyEmailInput] = useState('');
  const [verifyTokenInput, setVerifyTokenInput] = useState('');
  const [demoVerificationInfo, setDemoVerificationInfo] = useState(null);

  const { isDark, toggleTheme } = useTheme();
  const toast = useToast();
  const location = useLocation();

  // A verification link lands here as /login?token=...&email=...
  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const tokenParam = params.get('token');
    const emailParam = params.get('email');
    if (tokenParam || emailParam) {
      setAuthMode('verify');
      if (tokenParam) setVerifyTokenInput(tokenParam);
      if (emailParam) setVerifyEmailInput(emailParam);
    }
  }, [location.search]);

  const handleLoginSubmit = async (e) => {
    if (e) e.preventDefault();

    if (!email || !password) {
      toast.error('Please enter both email and password');
      return;
    }

    setIsSubmitting(true);
    try {
      const res = await api.post('/auth/login', { email, password });
      setIsSubmitting(false);

      if (res.data.success) {
        localStorage.setItem('dayflow_token', res.data.token);
        localStorage.setItem('dayflow_user', JSON.stringify(res.data.user));
        toast.success(`Welcome to Taggify, ${res.data.user.name}!`);

        const targetRoute =
          location.state?.from?.pathname ||
          (res.data.user.role === 'admin' || res.data.user.role === 'super_admin' ? '/admin' : '/employee');

        window.location.href = targetRoute;
      }
    } catch (err) {
      setIsSubmitting(false);
      const data = err.response?.data;
      if (data?.unverified) {
        toast.error('Email not verified. Redirecting to verification...');
        setAuthMode('verify');
        setVerifyEmailInput(data.email || email);
        if (data.verificationToken) {
          setVerifyTokenInput(data.verificationToken);
        }
        if (data.demoVerification) {
          setDemoVerificationInfo(data.demoVerification);
        }
      } else if (!err.response) {
        // No response at all: the API is unreachable. Telling someone to check
        // their password here sends them chasing the wrong problem.
        toast.error(
          'Cannot reach the server. Please check your connection or contact IT — this is not a password problem.'
        );
      } else if (err.response.status >= 500) {
        toast.error('The server hit an error while signing you in. Please try again shortly.');
      } else {
        toast.error(data?.message || 'Login failed. Please check your credentials.');
      }
    }
  };

  const handleVerifySubmit = async (e) => {
    if (e) e.preventDefault();
    if (!verifyTokenInput && !verifyEmailInput) {
      toast.error('Please enter the verification token or email');
      return;
    }

    setIsSubmitting(true);
    try {
      const res = await api.post('/auth/verify-email', {
        token: verifyTokenInput,
        email: verifyEmailInput,
      });
      setIsSubmitting(false);

      if (res.data.success) {
        toast.success('Account verified. You can now sign in.');
        setEmail(verifyEmailInput);
        setAuthMode('login');
        setDemoVerificationInfo(null);
      }
    } catch (err) {
      setIsSubmitting(false);
      toast.error(err.response?.data?.message || 'Verification failed. Invalid or expired token.');
    }
  };

  const spinner = (
    <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
  );

  return (
    <div className="min-h-screen flex flex-col bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100">
      {/* Header */}
      <header className="h-16 px-4 sm:px-6 flex items-center border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900">
        <div className="w-full max-w-5xl mx-auto flex items-center justify-between">
          <TaggifyLogo iconSize={32} />

          <Tooltip label={isDark ? 'Switch to light mode' : 'Switch to dark mode'} side="left">
            <button
              onClick={toggleTheme}
              className="btn-icon"
              aria-label={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
            >
              {isDark ? <Sun className="w-4 h-4 text-amber-500" /> : <Moon className="w-4 h-4" />}
            </button>
          </Tooltip>
        </div>
      </header>

      {/* Card */}
      <main className="flex-1 flex items-center justify-center px-4 py-12">
        <div className="w-full max-w-sm">
          {authMode === 'login' && (
            <div className="theme-card p-6 sm:p-8">
              <h2 className="font-display text-2xl font-extrabold text-slate-900 dark:text-white">
                Sign in
              </h2>
              <p className="mt-1 mb-6 text-sm theme-muted">Use your Taggify work account.</p>

              <form onSubmit={handleLoginSubmit} className="space-y-4">
                <div>
                  <label htmlFor="login-email" className="theme-label">
                    Work email
                  </label>
                  <div className="relative">
                    <User className="w-4 h-4 absolute left-3 inset-y-0 my-auto text-slate-400 pointer-events-none" />
                    <input
                      id="login-email"
                      type="email"
                      required
                      autoComplete="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="you@taggify.in"
                      className="theme-input w-full pl-9"
                    />
                  </div>
                </div>

                <div>
                  <label htmlFor="login-password" className="theme-label">
                    Password
                  </label>
                  <div className="relative">
                    <Lock className="w-4 h-4 absolute left-3 inset-y-0 my-auto text-slate-400 pointer-events-none" />
                    <input
                      id="login-password"
                      type={showPassword ? 'text' : 'password'}
                      required
                      autoComplete="current-password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="Enter your password"
                      className="theme-input w-full pl-9 pr-10"
                    />
                    <Tooltip label={showPassword ? 'Hide password' : 'Show password'} side="left">
                      <button
                        type="button"
                        onClick={() => setShowPassword(!showPassword)}
                        aria-label={showPassword ? 'Hide password' : 'Show password'}
                        className="absolute right-2 inset-y-0 my-auto flex items-center justify-center w-7 h-7 rounded-md text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 transition-colors"
                      >
                        {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </Tooltip>
                  </div>
                </div>

                <button type="submit" disabled={isSubmitting} className="btn-primary w-full group">
                  {isSubmitting ? (
                    <>
                      {spinner}
                      <span>Signing in...</span>
                    </>
                  ) : (
                    <>
                      <span>Sign in</span>
                      <ArrowRight className="w-4 h-4 transition-transform group-hover:translate-x-0.5" />
                    </>
                  )}
                </button>
              </form>
            </div>
          )}

          {authMode === 'verify' && (
            <div className="theme-card p-6 sm:p-8">
              <h2 className="font-display text-2xl font-extrabold text-slate-900 dark:text-white">
                Verify your email
              </h2>
              <p className="mt-1 mb-6 text-sm theme-muted">
                Confirm your address to activate your Taggify account.
              </p>

              {demoVerificationInfo && (
                <div className="mb-4 flex items-start gap-2 rounded-lg border border-emerald-300 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-950/40 p-3 text-xs">
                  <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
                  <span className="text-emerald-800 dark:text-emerald-200">
                    Verification token filled in below — just press verify.
                  </span>
                </div>
              )}

              <form onSubmit={handleVerifySubmit} className="space-y-4">
                <div>
                  <label htmlFor="verify-email" className="theme-label">
                    Account email
                  </label>
                  <div className="relative">
                    <Mail className="w-4 h-4 absolute left-3 inset-y-0 my-auto text-slate-400 pointer-events-none" />
                    <input
                      id="verify-email"
                      type="email"
                      required
                      value={verifyEmailInput}
                      onChange={(e) => setVerifyEmailInput(e.target.value)}
                      placeholder="you@taggify.in"
                      className="theme-input w-full pl-9"
                    />
                  </div>
                </div>

                <div>
                  <label htmlFor="verify-token" className="theme-label">
                    Verification token
                  </label>
                  <div className="relative">
                    <KeyRound className="w-4 h-4 absolute left-3 inset-y-0 my-auto text-slate-400 pointer-events-none" />
                    <input
                      id="verify-token"
                      type="text"
                      required
                      value={verifyTokenInput}
                      onChange={(e) => setVerifyTokenInput(e.target.value)}
                      placeholder="Paste the token from your email"
                      className="theme-input w-full pl-9 font-mono"
                    />
                  </div>
                </div>

                <button type="submit" disabled={isSubmitting} className="btn-primary w-full">
                  {isSubmitting ? (
                    <>
                      {spinner}
                      <span>Verifying...</span>
                    </>
                  ) : (
                    <>
                      <BadgeCheck className="w-4 h-4" />
                      <span>Verify and activate</span>
                    </>
                  )}
                </button>

                <button type="button" onClick={() => setAuthMode('login')} className="btn-ghost w-full">
                  Back to sign in
                </button>
              </form>
            </div>
          )}
        </div>
      </main>

      <footer className="px-6 py-4 text-center text-xs theme-muted border-t border-slate-200 dark:border-slate-800">
        Taggify HRMS
      </footer>
    </div>
  );
};

export default LoginPage;
