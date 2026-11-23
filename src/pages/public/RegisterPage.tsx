import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { AlertTriangle, ArrowLeft, ArrowRight, Eye, EyeOff } from 'lucide-react';
import { SceneBackdrop } from '../../components/layout/SceneBackdrop';
import { AppImage } from '../../components/ui/AppImage';
import { Button, GlassPanel, Input, Select, Textarea } from '../../components/ui/Primitives';
import { getHomeRouteForRole, useAuth } from '../../context/AuthContext';
import { useData } from '../../context/DataContext';
import { registerSchema } from '../../schemas/validation';

export const RegisterPage: React.FC = () => {
  const navigate = useNavigate();
  const { registerWithEmail, authError, firebaseAuthConfigHint, switchToLocalDemo } = useAuth();
  const { data, pushToast } = useData();

  const [displayName, setDisplayName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [departmentId, setDepartmentId] = useState(data.departments[0]?.id ?? 'dept-cse');
  const [studentIdCode, setStudentIdCode] = useState('');
  const [requestElevatedRole, setRequestElevatedRole] = useState(false);
  const [requestedRole, setRequestedRole] = useState<'faculty' | 'admin'>('faculty');
  const [justification, setJustification] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    const parsed = registerSchema.safeParse({
      displayName,
      email,
      password,
      departmentId,
      studentIdCode: studentIdCode || undefined,
      requestElevatedRole,
      requestedRole: requestElevatedRole ? requestedRole : undefined,
      justification: requestElevatedRole ? justification : undefined,
    });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message || 'Please check form fields.');
      return;
    }
    if (requestElevatedRole && justification.trim().length < 5) {
      setError('Please provide justification (at least 5 characters) for faculty/admin access.');
      return;
    }

    setSubmitting(true);
    try {
      const profile = await registerWithEmail(parsed.data);
      pushToast({
        title: 'Account created',
        message: requestElevatedRole
          ? 'Signed in as student while your faculty/admin role request awaits admin review.'
          : 'Welcome to LabLink.',
        tone: 'success',
      });
      navigate(getHomeRouteForRole(profile.role));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Registration failed.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <SceneBackdrop tier="B" imageSlot="auth/lab-interior">
      <div className="mx-auto flex min-h-screen max-w-5xl flex-col justify-center px-4 py-8 sm:px-6">
        <div className="mb-6">
          <Link
            to="/login"
            className="inline-flex items-center gap-2 text-xs text-[#CBD5E1] transition-colors hover:text-[#F8FAFC]"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            Back to Sign In
          </Link>
        </div>

        <GlassPanel className="overflow-hidden">
          <div className="grid lg:grid-cols-12 lg:items-stretch">
            <div className="relative hidden lg:flex lg:col-span-5 flex-col justify-between overflow-hidden border-r border-white/[0.08]">
              <AppImage slot="campus/dusk-wide" scrim="heavy" className="absolute inset-0 h-full w-full" priority />
              <div className="relative z-10 flex h-full flex-col justify-between p-8">
                <div className="flex items-center gap-2.5">
                  <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-gradient-to-br from-[#3B82F6] to-[#22D3EE] text-[#070B14] font-bold text-sm">
                    L
                  </div>
                  <span className="font-display text-sm font-semibold text-[#F8FAFC]">LabLink Nexus</span>
                </div>
                <div className="space-y-3">
                  <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[#22D3EE]">
                    Campus Onboarding
                  </p>
                  <h2 className="font-display text-2xl font-semibold text-[#F8FAFC]">
                    Join Your Department Laboratory Network
                  </h2>
                  <p className="text-xs leading-relaxed text-[#CBD5E1]">
                    New accounts begin with Student access. Faculty and Lab Administrators can attach
                    role verification requests for review.
                  </p>
                </div>
              </div>
            </div>

            <div className="lg:col-span-7 p-6 sm:p-8 space-y-5">
              <div>
                <h1 className="font-display text-2xl font-semibold text-[#F8FAFC]">
                  Create LabLink Account
                </h1>
                <p className="mt-1 text-sm text-[#94A3B8]">
                  Link your university department to reserve hardware and track project milestones.
                </p>
              </div>

              {(error || authError) && (
                <div className="rounded-lg border border-[#EF4444]/40 bg-[#EF4444]/10 p-3 text-xs text-[#FCA5A5] space-y-2">
                  <div className="flex items-start gap-2">
                    <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                    <span>{error || authError}</span>
                  </div>
                  {firebaseAuthConfigHint && (
                    <div className="space-y-2">
                      <p className="text-[11px] text-[#FDE68A]">{firebaseAuthConfigHint}</p>
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={async () => {
                          const demoUser = await switchToLocalDemo('user-student-a');
                          if (demoUser) {
                            navigate(getHomeRouteForRole(demoUser.role));
                          }
                        }}
                      >
                        Switch to Local Demo Mode
                      </Button>
                    </div>
                  )}
                </div>
              )}

              <form onSubmit={handleSubmit} className="space-y-4">
                <Input
                  label="Full Name"
                  placeholder="e.g., Priya Nair"
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  required
                />
                <Input
                  label="Campus Email"
                  type="email"
                  placeholder="priya@university.edu"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                />
                <div className="relative">
                  <Input
                    label="Password"
                    type={showPassword ? 'text' : 'password'}
                    placeholder="Minimum 6 characters"
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

                <div className="grid gap-4 sm:grid-cols-2">
                  <Select
                    label="Department"
                    value={departmentId}
                    onChange={(e) => setDepartmentId(e.target.value)}
                  >
                    {data.departments.map((d) => (
                      <option key={d.id} value={d.id}>
                        {d.code} — {d.name}
                      </option>
                    ))}
                  </Select>
                  <Input
                    label="Student / Roll ID (Optional)"
                    placeholder="e.g., CS23B012"
                    value={studentIdCode}
                    onChange={(e) => setStudentIdCode(e.target.value)}
                  />
                </div>

                <div className="rounded-xl border border-white/10 bg-[#0B1220]/90 p-3.5 space-y-3">
                  <label className="flex items-center gap-2 text-xs font-medium text-[#F8FAFC] cursor-pointer">
                    <input
                      type="checkbox"
                      checked={requestElevatedRole}
                      onChange={(e) => setRequestElevatedRole(e.target.checked)}
                      className="rounded border-white/20"
                    />
                    Request Faculty or Admin role approval
                  </label>

                  {requestElevatedRole && (
                    <div className="space-y-3 pt-1">
                      <Select
                        label="Requested Role"
                        value={requestedRole}
                        onChange={(e) => setRequestedRole(e.target.value as 'faculty' | 'admin')}
                      >
                        <option value="faculty">Faculty / Lab Supervisor</option>
                        <option value="admin">Campus Lab Administrator</option>
                      </Select>
                      <Textarea
                        label="Justification"
                        rows={2}
                        placeholder="Specify laboratory supervised or department appointment..."
                        value={justification}
                        onChange={(e) => setJustification(e.target.value)}
                      />
                    </div>
                  )}
                </div>

                <Button type="submit" size="lg" className="w-full" loading={submitting}>
                  Create Account
                  <ArrowRight className="h-4 w-4" />
                </Button>
              </form>
            </div>
          </div>
        </GlassPanel>
      </div>
    </SceneBackdrop>
  );
};
