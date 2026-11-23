import React, { useMemo, useState } from 'react';
import { ShieldCheck } from 'lucide-react';
import { AppShell } from '../../components/AppShell';
import { Button, Card, Input, Select, StatusBadge, Textarea } from '../../components/ui/Primitives';
import { useAuth } from '../../context/AuthContext';
import { useData } from '../../context/DataContext';
import { repo } from '../../data/repo';
import { DEFAULT_FAIR_USE_LIMIT_HOURS, DEMO_NOW, formatLocalIso } from '../../engine/constants';
import { computeUsedHoursInWindow } from '../../engine/scoring';

export const ProfilePage: React.FC = () => {
  const { user, refreshProfile } = useAuth();
  const { data, pushToast } = useData();

  const [displayName, setDisplayName] = useState(user?.displayName ?? '');
  const [phone, setPhone] = useState(user?.phone ?? '');
  const [studentIdCode, setStudentIdCode] = useState(user?.studentIdCode ?? '');
  const [departmentId, setDepartmentId] = useState(user?.departmentId ?? 'dept-cse');
  const [saving, setSaving] = useState(false);

  const [reqRole, setReqRole] = useState<'faculty' | 'admin'>('faculty');
  const [justification, setJustification] = useState('');
  const [submittingRole, setSubmittingRole] = useState(false);

  const refNow = user?.isDemo ? DEMO_NOW : formatLocalIso(Date.now());
  const usedHours = useMemo(
    () => (user ? computeUsedHoursInWindow(user.uid, data.usageLogs, refNow, 30) : 0),
    [user, data.usageLogs, refNow]
  );
  const fairUseLimit =
    data.settings.find((s) => s.id === 'allocation')?.fairUseLimitHours ?? DEFAULT_FAIR_USE_LIMIT_HOURS;

  const existingRoleReqs = useMemo(
    () => (user ? data.roleRequests.filter((r) => r.userId === user.uid) : []),
    [data.roleRequests, user]
  );

  if (!user) return null;

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      await repo.updateUserProfile(user.uid, {
        displayName: displayName.trim(),
        phone: phone.trim() || undefined,
        studentIdCode: studentIdCode.trim() || undefined,
        departmentId,
      });
      await refreshProfile();
      pushToast({ title: 'Profile Updated', tone: 'success' });
    } catch (err) {
      pushToast({ title: 'Update Failed', message: err instanceof Error ? err.message : 'Error', tone: 'error' });
    } finally {
      setSaving(false);
    }
  };

  const handleRoleReq = async (e: React.FormEvent) => {
    e.preventDefault();
    if (justification.trim().length < 5) return;
    setSubmittingRole(true);
    try {
      await repo.createRoleRequest({
        userId: user.uid,
        email: user.email,
        displayName: user.displayName,
        requestedRole: reqRole,
        departmentId: user.departmentId,
        justification: justification.trim(),
        isDemo: user.isDemo,
      });
      setJustification('');
      pushToast({ title: 'Role Request Submitted', message: 'Sent to administrators for approval.', tone: 'success' });
    } catch (err) {
      pushToast({ title: 'Request Failed', message: err instanceof Error ? err.message : 'Error', tone: 'error' });
    } finally {
      setSubmittingRole(false);
    }
  };

  return (
    <AppShell title="Profile & Certifications" subtitle="Manage campus identity, department affiliation, and safety credentials.">
      <div className="grid gap-6 lg:grid-cols-12">
        <Card className="lg:col-span-7 space-y-4">
          <h2 className="font-display text-lg font-semibold">Account Details</h2>
          <form onSubmit={handleSave} className="space-y-4">
            <Input label="Full Name" value={displayName} onChange={(e) => setDisplayName(e.target.value)} required />
            <Input label="Email" value={user.email} disabled />
            <div className="grid gap-4 sm:grid-cols-2">
              <Select label="Department" value={departmentId} onChange={(e) => setDepartmentId(e.target.value)}>
                {data.departments.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.code} — {d.name}
                  </option>
                ))}
              </Select>
              <Input label="Student ID Code" value={studentIdCode} onChange={(e) => setStudentIdCode(e.target.value)} />
            </div>
            <Input label="Phone (optional)" value={phone} onChange={(e) => setPhone(e.target.value)} />
            <Button type="submit" loading={saving}>
              Save Profile
            </Button>
          </form>
        </Card>

        <div className="lg:col-span-5 space-y-6">
          <Card className="space-y-3">
            <h2 className="text-sm font-semibold text-[#F8FAFC]">Safety Certifications &amp; Fair Use</h2>
            <div className="rounded-lg border border-white/[0.06] bg-[#0D1424] p-3 text-xs">
              <div className="flex items-center justify-between">
                <span className="text-[#94A3B8]">30-Day Logged Hours</span>
                <span className="font-mono font-semibold text-[#22D3EE] tabular-nums">
                  {usedHours}h / {fairUseLimit}h
                </span>
              </div>
            </div>
            <div className="space-y-2">
              <p className="text-xs text-[#94A3B8]">Verified Safety Credentials</p>
              <div className="flex flex-wrap gap-2">
                {(user.certifications ?? ['lab_safety_l1']).map((cert) => (
                  <span
                    key={cert}
                    className="inline-flex items-center gap-1.5 rounded-md border border-[#10B981]/30 bg-[#10B981]/10 px-2.5 py-1 font-mono text-xs text-[#6EE7B7]"
                  >
                    <ShieldCheck className="h-3.5 w-3.5" />
                    {cert}
                  </span>
                ))}
              </div>
            </div>
          </Card>

          <Card className="space-y-3">
            <h2 className="text-sm font-semibold text-[#F8FAFC]">Request Elevated Role</h2>
            <p className="text-xs text-[#94A3B8]">
              Role promotions are verified and approved exclusively by campus administrators.
            </p>
            <form onSubmit={handleRoleReq} className="space-y-3">
              <Select label="Requested Role" value={reqRole} onChange={(e) => setReqRole(e.target.value as 'faculty' | 'admin')}>
                <option value="faculty">Faculty / Lab Supervisor</option>
                <option value="admin">Campus Administrator</option>
              </Select>
              <Textarea
                label="Justification"
                rows={2}
                placeholder="State lab assignment or supervisor authorization..."
                value={justification}
                onChange={(e) => setJustification(e.target.value)}
                required
              />
              <Button type="submit" variant="secondary" size="sm" loading={submittingRole}>
                Submit Role Request
              </Button>
            </form>

            {existingRoleReqs.length > 0 && (
              <div className="space-y-2 border-t border-white/[0.06] pt-3">
                {existingRoleReqs.map((rr) => (
                  <div key={rr.id} className="flex items-center justify-between text-xs">
                    <span className="text-[#CBD5E1]">Requested: {rr.requestedRole}</span>
                    <StatusBadge status={rr.status} />
                  </div>
                ))}
              </div>
            )}
          </Card>
        </div>
      </div>
    </AppShell>
  );
};
