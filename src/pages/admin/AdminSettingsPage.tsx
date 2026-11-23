import React, { useState } from 'react';
import { RefreshCw, Save, UploadCloud } from 'lucide-react';
import { AppShell } from '../../components/AppShell';
import { Button, Card, Input } from '../../components/ui/Primitives';
import { useAuth } from '../../context/AuthContext';
import { useData } from '../../context/DataContext';
import { repo } from '../../data/repo';
import { DEFAULT_FAIR_USE_LIMIT_HOURS, DEFAULT_WEIGHTS } from '../../engine/constants';
import { normalizeWeights } from '../../engine/scoring';
import type { AllocationWeights } from '../../types/models';

export const AdminSettingsPage: React.FC = () => {
  const { user } = useAuth();
  const { data, mode, resetDemoData, pushToast } = useData();

  const allocSet = data.settings.find((s) => s.id === 'allocation');
  const demoSet = data.settings.find((s) => s.id === 'demo');

  const [weights, setWeights] = useState<AllocationWeights>(allocSet?.weights ?? { ...DEFAULT_WEIGHTS });
  const [fairUseLimit, setFairUseLimit] = useState(String(allocSet?.fairUseLimitHours ?? DEFAULT_FAIR_USE_LIMIT_HOURS));
  const [enforceHard, setEnforceHard] = useState(Boolean(allocSet?.enforceFairUseHard));
  const [demoEnabled, setDemoEnabled] = useState(demoSet?.enabled ?? true);
  const [saving, setSaving] = useState(false);
  const [seeding, setSeeding] = useState(false);

  const normalized = normalizeWeights(weights);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    setSaving(true);
    try {
      await repo.saveAllocationSettings({
        weights: normalized,
        fairUseLimitHours: Math.max(1, Number(fairUseLimit) || DEFAULT_FAIR_USE_LIMIT_HOURS),
        enforceFairUseHard: enforceHard,
        demoEnabled,
        actorId: user.uid,
      });
      setWeights(normalized);
      pushToast({ title: 'Policy Settings Saved', message: 'Allocation weights & fair-use rules updated.', tone: 'success' });
    } catch (err) {
      pushToast({ title: 'Save Failed', message: err instanceof Error ? err.message : 'Error', tone: 'error' });
    } finally {
      setSaving(false);
    }
  };

  const handleSeedFirestore = async () => {
    if (!user) return;
    setSeeding(true);
    try {
      await repo.seedFirestoreDemo(user.uid);
      pushToast({
        title: mode === 'firestore' ? 'Demo Dataset Seeded into Firestore' : 'Local Demo Dataset Reset',
        tone: 'success',
      });
    } catch (err) {
      pushToast({ title: 'Seed Failed', message: err instanceof Error ? err.message : 'Error', tone: 'error' });
    } finally {
      setSeeding(false);
    }
  };

  return (
    <AppShell
      title="Allocation Policy & System Settings"
      subtitle="Configure deterministic scoring factor weights, fair-use quotas, and demo dataset controls."
    >
      <div className="grid gap-6 lg:grid-cols-12">
        <Card className="lg:col-span-7 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="font-display text-lg font-semibold">Priority Engine Weights</h2>
            <Button size="sm" variant="ghost" onClick={() => setWeights({ ...DEFAULT_WEIGHTS })}>
              Restore Defaults (35/25/20/15/5)
            </Button>
          </div>

          <form onSubmit={handleSave} className="space-y-4">
            {(
              [
                ['deadline', 'Deadline Urgency'],
                ['necessity', 'Equipment Necessity (Alternatives)'],
                ['fairness', '30-Day Fairness Usage'],
                ['feasibility', 'Slot Feasibility'],
                ['waiting', 'Submission Waiting Time'],
              ] as const
            ).map(([k, label]) => (
              <div key={k} className="space-y-1">
                <div className="flex justify-between text-xs">
                  <span className="text-[#CBD5E1]">{label}</span>
                  <span className="font-mono text-[#22D3EE] tabular-nums">
                    Normalized: {Math.round(normalized[k] * 100)}%
                  </span>
                </div>
                <input
                  type="range"
                  min={0}
                  max={100}
                  value={Math.round(weights[k] * 100)}
                  onChange={(e) => setWeights((prev) => ({ ...prev, [k]: Number(e.target.value) / 100 }))}
                  className="w-full accent-[#3B82F6]"
                />
              </div>
            ))}

            <div className="grid gap-4 sm:grid-cols-2 pt-2">
              <Input
                label="30-Day Fair-Use Threshold (hours)"
                type="number"
                min={1}
                max={200}
                value={fairUseLimit}
                onChange={(e) => setFairUseLimit(e.target.value)}
              />
              <div className="flex flex-col justify-end space-y-2 pb-1 text-xs text-[#CBD5E1]">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={enforceHard}
                    onChange={(e) => setEnforceHard(e.target.checked)}
                  />
                  Enforce fair-use limit as hard block (default: soft penalty + flag)
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={demoEnabled}
                    onChange={(e) => setDemoEnabled(e.target.checked)}
                  />
                  Enable @lablink.demo evaluation accounts
                </label>
              </div>
            </div>

            <Button type="submit" loading={saving}>
              <Save className="h-4 w-4" /> Save Policy Settings
            </Button>
          </form>
        </Card>

        <Card className="lg:col-span-5 space-y-4">
          <h2 className="font-display text-lg font-semibold">Demo Dataset Management</h2>
          <p className="text-xs leading-relaxed text-[#94A3B8]">
            Seed or reset the reproducible campus dataset (5 departments, 6 labs, 28 instruments, and the
            Section 10 3-student GPU contention scenario). Active mode: <strong>{mode}</strong>.
          </p>
          <div className="space-y-2.5">
            <Button variant="secondary" className="w-full" loading={seeding} onClick={handleSeedFirestore}>
              <UploadCloud className="h-4 w-4" />
              {mode === 'firestore' ? 'Seed / Reset Firestore Demo Data' : 'Reset Seeded Demo Dataset'}
            </Button>
            <Button variant="ghost" className="w-full" onClick={resetDemoData}>
              <RefreshCw className="h-4 w-4" />
              Reset Local Browser Demo Snapshot
            </Button>
          </div>
        </Card>
      </div>
    </AppShell>
  );
};
