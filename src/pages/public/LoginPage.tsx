import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  ChevronDown,
  ChevronUp,
  Eye,
  EyeOff,
  ShieldCheck,
} from 'lucide-react';
import { SceneBackdrop } from '../../components/layout/SceneBackdrop';
import { AppImage } from '../../components/ui/AppImage';
import { Button, GlassPanel, Input, StatusBadge } from '../../components/ui/Primitives';
import { getHomeRouteForRole, useAuth } from '../../context/AuthContext';
import { useData } from '../../context/DataContext';
import { loginSchema } from '../../schemas/validation';

const DEMO_ACCOUNTS = [
  { id: 'user-student-a', label: 'Student A (Aarav)', role: 'Urgent 24h Deadline · 6h used', badge: 'STUDENT' },
  { id: 'user-student-b', label: 'Student B (Maya)', role: '48h Deadline · 0h used', badge: 'STUDENT' },
  { id: 'user-student-c', label: 'Student C (Rohan)', role: '120h Deadline · 11h used (>limit)', badge: 'STUDENT' },
  { id: 'user-faculty-1', label: 'Prof. Arvind Menon', role: 'AI/ML Faculty & Conflict Studio', badge: 'FACULTY' },
  { id: 'user-admin-1', label: 'Dr. Kavita Rao', role: 'Campus Lab Administrator', badge: 'ADMIN' },
];

export const LoginPage: React.FC = () => {
  const navigate = useNavigate();
  const {
    loginWithEmail,
    loginWithGoogle,
    switchToLocalDemo,
    authError,
    firebaseAuthConfigHint,
    clearErrors,
  } = useAuth();
  const { mode, setMode, firebaseStatus, pushToast } = useData();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [demoOpen, setDemoOpen] = useState(true);
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    clearErrors();
    const parsed = loginSchema.safeParse({ email, password });
    if (!parsed.success) {
      setFormError(parsed.error.issues[0]?.message || 'Invalid credentials format.');
      return;
    }
    setSubmitting(true);
    try {
      const profile = await loginWithEmail(parsed.data.email, parsed.data.password);
      navigate(getHomeRouteForRole(profile.role));
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Sign-in failed.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleGoogle = async () => {
    setFormError(null);
    setSubmitting(true);
    try {
      const profile = await loginWithGoogle();
      navigate(getHomeRouteForRole(profile.role));
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Google sign-in failed.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDemoClick = async (demoId: string) => {
    setFormError(null);
    setSubmitting(true);
    try {
      const profile = await switchToLocalDemo(demoId);
      if (profile) {
        pushToast({
          title: `Demo Mode · ${profile.displayName}`,
          message: `Signed in as ${profile.role} (Local Demo storage).`,
          tone: 'info',
        });
        navigate(getHomeRouteForRole(profile.role));
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <SceneBackdrop tier="B" imageSlot="auth/lab-interior">
      <div className="mx-auto flex min-h-screen max-w-6xl flex-col justify-center px-4 py-8 sm:px-6">
        <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
          <Link
            to="/"
            className="inline-flex items-center gap-2 text-xs text-[#CBD5E1] transition-colors hover:text-[#F8FAFC]"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            Back to LabLink Nexus
          </Link>
          <div className="flex items-center gap-2">
            <StatusBadge
              status={mode === 'firestore' ? firebaseStatus : 'active'}
              label={mode === 'firestore' ? `Firestore: ${firebaseStatus}` : 'Local Demo Storage'}
            />
            <div className="flex items-center gap-1 rounded-lg border border-white/10 bg-[#0B1220]/90 p-1 text-xs">
              <button
                type="button"
                onClick={() => setMode('firestore')}
                className={`rounded-md px-2.5 py-1 transition-colors cursor-pointer ${
                  mode === 'firestore' ? 'bg-[#17243A] text-[#F8FAFC]' : 'text-[#94A3B8] hover:text-[#F8FAFC]'
                }`}
              >
                Firebase Auth
              </button>
              <button
                type="button"
                onClick={() => setMode('local-demo')}
                className={`rounded-md px-2.5 py-1 transition-colors cursor-pointer ${
                  mode === 'local-demo' ? 'bg-[#17243A] text-[#22D3EE]' : 'text-[#94A3B8] hover:text-[#F8FAFC]'
                }`}
              >
                Local Demo
              </button>
            </div>
          </div>
        </div>

        <GlassPanel className="overflow-hidden">
          <div className="grid lg:grid-cols-12 lg:items-stretch">
            {/* Left Split Atmospheric Campus Interior Panel */}
            <div className="relative hidden lg:flex lg:col-span-5 flex-col justify-between overflow-hidden border-r border-white/[0.08]">
              <AppImage slot="auth/lab-interior" scrim="heavy" className="absolute inset-0 h-full w-full" priority />
              <div className="relative z-10 flex h-full flex-col justify-between p-8">
                <div className="flex items-center gap-2.5">
                  <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-gradient-to-br from-[#3B82F6] to-[#22D3EE] text-[#070B14] font-bold text-sm">
                    L
                  </div>
                  <div>
                    <p className="font-display text-sm font-semibold text-[#F8FAFC]">LabLink Nexus</p>
                    <p className="text-[11px] text-[#94A3B8]">Campus Resource OS</p>
                  </div>
                </div>

                <div className="space-y-3">
                  <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[#22D3EE]">
                    One Campus. Every Lab.
                  </p>
                  <h2 className="font-display text-2xl font-semibold text-[#F8FAFC]">
                    Shared Instrumentation & Fair Priority Scheduling
                  </h2>
                  <p className="text-xs leading-relaxed text-[#CBD5E1]">
                    Reserve cross-department GPUs, robotics arenas, FPGAs, and scopes with atomic
                    conflict prevention and instant QR lab passes.
                  </p>
                </div>
              </div>
            </div>

            {/* Right Sign-In Form + Collapsible Demo Role Panel */}
            <div className="lg:col-span-7 p-6 sm:p-8 space-y-6">
              <div>
                <h1 className="font-display text-2xl font-semibold text-[#F8FAFC]">
                  Sign in to LabLink
                </h1>
                <p className="mt-1 text-sm text-[#94A3B8]">
                  Access your student research workspace, faculty Conflict Studio, or admin observatory.
                </p>
              </div>

              {(formError || authError) && (
                <div className="rounded-lg border border-[#EF4444]/40 bg-[#EF4444]/10 p-3 text-xs text-[#FCA5A5] space-y-2">
                  <div className="flex items-start gap-2">
                    <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                    <span>{formError || authError}</span>
                  </div>
                  {firebaseAuthConfigHint && (
                    <p className="text-[11px] text-[#FDE68A]">{firebaseAuthConfigHint}</p>
                  )}
                  {mode !== 'local-demo' && (
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() =>
                        switchToLocalDemo('user-student-a').then(
                          (u) => u && navigate(getHomeRouteForRole(u.role))
                        )
                      }
                    >
                      Switch to Local Demo Mode
                    </Button>
                  )}
                </div>
              )}

              <form onSubmit={handleSubmit} className="space-y-4">
                <Input
                  label="Campus Email"
                  type="email"
                  placeholder="name@university.edu"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                />

                <div className="relative">
                  <Input
                    label="Password"
                    type={showPassword ? 'text' : 'password'}
                    placeholder="Enter your password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="pr-10"
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((s) => !s)}
                    aria-label={showPassword ? 'Hide password' : 'Show password'}
                    className="absolute right-2.5 top-[30px] rounded p-1 text-[#94A3B8] hover:text-[#F8FAFC] cursor-pointer"
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>

                <div className="flex items-center justify-between text-xs">
                  <Link to="/forgot-password" className="text-[#22D3EE] hover:underline">
                    Forgot password?
                  </Link>
                  <Link to="/register" className="text-[#CBD5E1] hover:text-[#F8FAFC]">
                    Create new account
                  </Link>
                </div>

                <Button type="submit" size="lg" className="w-full" loading={submitting}>
                  Sign In
                  <ArrowRight className="h-4 w-4" />
                </Button>
              </form>

              <div className="relative py-1">
                <div className="absolute inset-0 flex items-center">
                  <div className="w-full border-t border-white/10" />
                </div>
                <div className="relative flex justify-center text-xs">
                  <span className="bg-[#111B2E] px-2 text-[#64748B]">or continue with</span>
                </div>
              </div>

              <Button
                variant="secondary"
                size="lg"
                className="w-full"
                onClick={handleGoogle}
                disabled={submitting}
              >
                Continue with Google Workspace / Campus ID
              </Button>

              {/* Collapsible DEMO ONLY Quick Switcher */}
              <div className="rounded-xl border border-[#22D3EE]/25 bg-[#0B1220]/85 p-3.5 space-y-3">
                <button
                  type="button"
                  onClick={() => setDemoOpen((o) => !o)}
                  aria-expanded={demoOpen}
                  className="flex w-full items-center justify-between gap-2 text-left text-xs font-semibold uppercase tracking-wider text-[#22D3EE] cursor-pointer"
                >
                  <span className="flex items-center gap-2">
                    <ShieldCheck className="h-4 w-4" />
                    DEMO ONLY · Instant Role Evaluation
                  </span>
                  {demoOpen ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                </button>

                {demoOpen && (
                  <div className="space-y-2 pt-1">
                    <p className="text-[11px] leading-relaxed text-[#94A3B8]">
                      Launch the seeded 3-student GPU contention scenario directly in Local Demo Mode.
                    </p>
                    <div className="grid gap-1.5 sm:grid-cols-2">
                      {DEMO_ACCOUNTS.map((acc) => (
                        <button
                          key={acc.id}
                          type="button"
                          disabled={submitting}
                          onClick={() => handleDemoClick(acc.id)}
                          className="flex items-center justify-between gap-2 rounded-lg border border-white/10 bg-[#111B2E] px-3 py-2 text-left hover:border-[#22D3EE]/50 hover:bg-[#17243A] transition-colors cursor-pointer"
                        >
                          <div className="min-w-0">
                            <p className="truncate text-xs font-semibold text-[#F8FAFC]">{acc.label}</p>
                            <p className="truncate text-[10px] text-[#94A3B8]">{acc.role}</p>
                          </div>
                          <span className="shrink-0 rounded border border-white/10 bg-[#070B14] px-1.5 py-0.5 font-mono text-[10px] font-semibold text-[#22D3EE]">
                            {acc.badge}
                          </span>
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </GlassPanel>
      </div>
    </SceneBackdrop>
  );
};
