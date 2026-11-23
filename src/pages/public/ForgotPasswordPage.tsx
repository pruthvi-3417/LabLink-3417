import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, CheckCircle2 } from 'lucide-react';
import { SceneBackdrop } from '../../components/layout/SceneBackdrop';
import { Button, GlassPanel, Input } from '../../components/ui/Primitives';
import { useAuth } from '../../context/AuthContext';
import { useData } from '../../context/DataContext';

export const ForgotPasswordPage: React.FC = () => {
  const { sendResetEmail } = useAuth();
  const { mode } = useData();
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await sendResetEmail(email);
      setSent(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to send reset email.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <SceneBackdrop tier="B" imageSlot="auth/lab-interior">
      <div className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-4 py-12">
        <div className="mb-6">
          <Link
            to="/login"
            className="inline-flex items-center gap-2 text-xs text-[#CBD5E1] hover:text-[#F8FAFC]"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            Back to Sign In
          </Link>
        </div>

        <GlassPanel padding="lg" className="space-y-4">
          <div className="flex items-start gap-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-[#3B82F6] to-[#22D3EE] text-[#070B14] font-bold text-sm">
              L
            </div>
            <div>
              <h1 className="font-display text-2xl font-semibold text-[#F8FAFC]">Reset Password</h1>
              <p className="mt-1 text-sm text-[#94A3B8]">
                Enter your campus email address to receive a password reset link.
              </p>
            </div>
          </div>

          {sent ? (
            <div className="rounded-lg border border-[#10B981]/35 bg-[#10B981]/10 p-4 text-xs text-[#6EE7B7] space-y-2">
              <div className="flex items-center gap-2 font-semibold">
                <CheckCircle2 className="h-4 w-4" />
                Reset instructions processed
              </div>
              <p>
                {mode === 'local-demo'
                  ? 'Local Demo Mode does not require passwords—return to Sign In and choose any account or switch to Firebase Auth.'
                  : `If an account exists for ${email}, a reset link has been dispatched by Firebase Authentication.`}
              </p>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              {error && <p className="text-xs text-[#FCA5A5]">{error}</p>}
              <Input
                label="Campus Email"
                type="email"
                placeholder="name@university.edu"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
              <Button type="submit" className="w-full" loading={submitting}>
                Send Reset Link
              </Button>
            </form>
          )}
        </GlassPanel>
      </div>
    </SceneBackdrop>
  );
};
