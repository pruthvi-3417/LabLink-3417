import React, { useMemo } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, Calendar, Cpu, Users } from 'lucide-react';
import { AppShell } from '../../components/AppShell';
import { Button, Card, EmptyState, StatusBadge } from '../../components/ui/Primitives';
import { useData } from '../../context/DataContext';

export const ProjectDetailPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const { data } = useData();

  const project = data.projects.find((p) => p.id === id);
  const dept = project ? data.departments.find((d) => d.id === project.departmentId) : undefined;

  const linkedRequests = useMemo(
    () => (project ? data.bookingRequests.filter((r) => r.projectId === project.id) : []),
    [data.bookingRequests, project]
  );

  const eqById = useMemo(() => new Map(data.equipment.map((e) => [e.id, e])), [data.equipment]);

  if (!project) {
    return (
      <AppShell title="Project Not Found">
        <EmptyState
          title="Project does not exist"
          description="Return to your projects directory or register a new academic project."
          action={
            <Link to="/student/projects">
              <Button>Back to Projects</Button>
            </Link>
          }
        />
      </AppShell>
    );
  }

  return (
    <AppShell
      title={project.title}
      subtitle={`${dept?.name ?? project.departmentId} · ${project.category}`}
      actions={
        <>
          <Link to="/student/projects">
            <Button variant="secondary" size="sm">
              <ArrowLeft className="h-3.5 w-3.5" />
              All Projects
            </Button>
          </Link>
          <Link to="/student/equipment">
            <Button variant="primary" size="sm">
              <Cpu className="h-3.5 w-3.5" />
              Request Equipment
            </Button>
          </Link>
        </>
      }
    >
      <div className="grid gap-6 lg:grid-cols-12">
        <Card className="lg:col-span-5 space-y-4">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-[#94A3B8]">Project Overview</span>
            <StatusBadge status={project.status} />
          </div>
          <p className="text-sm leading-relaxed text-[#CBD5E1]">{project.description}</p>
          <div className="space-y-2 border-t border-white/[0.06] pt-3 text-xs">
            <div className="flex items-center justify-between">
              <span className="text-[#94A3B8]">Start Date</span>
              <span className="font-mono text-[#F8FAFC] tabular-nums">{project.startDate.slice(0, 10)}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-[#94A3B8]">Hard Deadline</span>
              <span className="font-mono font-semibold text-[#22D3EE] tabular-nums">
                {project.deadline.slice(0, 16).replace('T', ' ')}
              </span>
            </div>
            {project.estimatedHours && (
              <div className="flex items-center justify-between">
                <span className="text-[#94A3B8]">Estimated Compute/Lab Hours</span>
                <span className="font-mono text-[#F8FAFC] tabular-nums">{project.estimatedHours}h</span>
              </div>
            )}
            {project.equipmentRequirements && (
              <div className="pt-2">
                <span className="block text-[#94A3B8]">Hardware Requirements</span>
                <p className="mt-1 rounded bg-[#0D1424] p-2 font-mono text-[11px] text-[#CBD5E1]">
                  {project.equipmentRequirements}
                </p>
              </div>
            )}
            {project.priorityJustification && (
              <div className="pt-1">
                <span className="block text-[#94A3B8]">Urgency Justification</span>
                <p className="mt-1 text-[#CBD5E1]">{project.priorityJustification}</p>
              </div>
            )}
            {project.teamMembers && project.teamMembers.length > 0 && (
              <div className="pt-1">
                <span className="flex items-center gap-1.5 text-[#94A3B8]">
                  <Users className="h-3.5 w-3.5" /> Team Members
                </span>
                <p className="mt-1 text-[#F8FAFC]">{project.teamMembers.join(', ')}</p>
              </div>
            )}
          </div>
        </Card>

        <div className="lg:col-span-7 space-y-4">
          <h2 className="font-display text-lg font-semibold">Linked Booking Requests</h2>
          {linkedRequests.length === 0 ? (
            <EmptyState
              icon={<Calendar className="h-5 w-5" />}
              title="No hardware requested for this project"
              description="Explore campus inventory and submit a slot request tied to this project deadline."
              action={
                <Link to="/student/equipment">
                  <Button size="sm">Explore Equipment</Button>
                </Link>
              }
            />
          ) : (
            <div className="space-y-3">
              {linkedRequests.map((req) => {
                const eq = eqById.get(req.equipmentId);
                return (
                  <Card key={req.id} padding="sm" className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <p className="text-sm font-semibold text-[#F8FAFC]">
                        {eq?.name ?? req.equipmentId}{' '}
                        <span className="font-mono text-xs text-[#22D3EE]">({eq?.equipmentId ?? req.equipmentId})</span>
                      </p>
                      <p className="mt-0.5 font-mono text-xs text-[#94A3B8] tabular-nums">
                        {req.requestedStart.slice(0, 16).replace('T', ' ')} – {req.requestedEnd.slice(11, 16)} ·{' '}
                        {req.units} unit(s)
                      </p>
                    </div>
                    <StatusBadge status={req.status} />
                  </Card>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </AppShell>
  );
};
