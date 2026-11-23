import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { AppShell } from '../../components/AppShell';
import { Button, Card, Input, Select, Textarea } from '../../components/ui/Primitives';
import { useAuth } from '../../context/AuthContext';
import { useData } from '../../context/DataContext';
import { repo } from '../../data/repo';
import { projectSchema } from '../../schemas/validation';

export const ProjectFormPage: React.FC = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { data, pushToast } = useData();

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState('Capstone');
  const [departmentId, setDepartmentId] = useState(user?.departmentId ?? 'dept-cse');
  const [teamMembersInput, setTeamMembersInput] = useState('');
  const [equipmentRequirements, setEquipmentRequirements] = useState('');
  const [startDate, setStartDate] = useState('2026-03-02');
  const [deadline, setDeadline] = useState('2026-03-10');
  const [estimatedHours, setEstimatedHours] = useState('12');
  const [priorityJustification, setPriorityJustification] = useState('');
  const [attachmentName, setAttachmentName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    setError(null);

    const teamMembers = teamMembersInput
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);

    const parsed = projectSchema.safeParse({
      title,
      description,
      category,
      departmentId,
      teamMembers,
      equipmentRequirements: equipmentRequirements || undefined,
      startDate,
      deadline: `${deadline}T18:00:00`,
      deadlineType: 'end_of_day',
      estimatedHours: estimatedHours ? Number(estimatedHours) : undefined,
      priorityJustification: priorityJustification || undefined,
      attachmentName: attachmentName || undefined,
    });

    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message || 'Check project fields.');
      return;
    }

    setSubmitting(true);
    try {
      const created = await repo.createProject({
        ownerId: user.uid,
        isDemo: user.isDemo,
        ...parsed.data,
      });
      pushToast({ title: 'Project Registered', message: created.title, tone: 'success' });
      navigate(`/student/projects/${created.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to save project.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <AppShell
      title="Register Academic Project"
      subtitle="Project deadlines power LabLink's transparent urgency scoring."
      actions={
        <Link to="/student/projects">
          <Button variant="secondary" size="sm">
            <ArrowLeft className="h-3.5 w-3.5" />
            Back to Projects
          </Button>
        </Link>
      }
    >
      <Card className="mx-auto max-w-2xl" padding="lg">
        <form onSubmit={handleSubmit} className="space-y-4">
          {error && <p className="rounded-lg border border-[#EF4444]/40 bg-[#EF4444]/10 p-3 text-xs text-[#FCA5A5]">{error}</p>}

          <Input
            label="Project Title"
            placeholder="e.g., Real-Time Autonomous Warehouse Vision"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            required
          />

          <Textarea
            label="Technical Scope & Objectives"
            rows={3}
            placeholder="Describe what you are building and why lab hardware is required..."
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            required
          />

          <div className="grid gap-4 sm:grid-cols-2">
            <Select label="Project Category" value={category} onChange={(e) => setCategory(e.target.value)}>
              <option value="Capstone">Senior Capstone</option>
              <option value="Thesis">Graduate / Honors Thesis</option>
              <option value="Lab Coursework">Coursework Evaluation</option>
              <option value="Funded Research">Department Research</option>
              <option value="Competition">Robotics / Hackathon Team</option>
            </Select>

            <Select label="Department" value={departmentId} onChange={(e) => setDepartmentId(e.target.value)}>
              {data.departments.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.code} — {d.name}
                </option>
              ))}
            </Select>
          </div>

          <div className="grid gap-4 sm:grid-cols-3">
            <Input label="Start Date" type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} required />
            <Input label="Hard Deadline" type="date" value={deadline} onChange={(e) => setDeadline(e.target.value)} required />
            <Input
              label="Estimated Hours"
              type="number"
              min={1}
              max={500}
              value={estimatedHours}
              onChange={(e) => setEstimatedHours(e.target.value)}
            />
          </div>

          <Input
            label="Hardware Requirements Summary"
            placeholder="e.g., CUDA GPU >= 24GB VRAM, 6-axis cobot"
            value={equipmentRequirements}
            onChange={(e) => setEquipmentRequirements(e.target.value)}
          />

          <Input
            label="Team Members (comma-separated)"
            placeholder="e.g., Aarav Sharma, Diya Kulkarni"
            value={teamMembersInput}
            onChange={(e) => setTeamMembersInput(e.target.value)}
          />

          <Textarea
            label="Deadline Justification (for faculty reviewers)"
            rows={2}
            placeholder="e.g., Final jury evaluation scheduled on deadline date..."
            value={priorityJustification}
            onChange={(e) => setPriorityJustification(e.target.value)}
          />

          <Input
            label="Syllabus / Proposal Reference Filename (optional)"
            placeholder="e.g., capstone_proposal_v2.pdf"
            value={attachmentName}
            onChange={(e) => setAttachmentName(e.target.value)}
          />

          <div className="flex justify-end gap-2 pt-2">
            <Link to="/student/projects">
              <Button variant="ghost">Cancel</Button>
            </Link>
            <Button type="submit" loading={submitting}>
              Register Project
            </Button>
          </div>
        </form>
      </Card>
    </AppShell>
  );
};
