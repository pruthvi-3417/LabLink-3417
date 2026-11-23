import React, { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, Calendar, FolderKanban, Plus } from 'lucide-react';
import { AppShell } from '../../components/AppShell';
import { Button, Card, EmptyState, StatusBadge } from '../../components/ui/Primitives';
import { useAuth } from '../../context/AuthContext';
import { useData } from '../../context/DataContext';

export const ProjectsPage: React.FC = () => {
  const { user } = useAuth();
  const { data } = useData();

  const myProjects = useMemo(
    () => (user ? data.projects.filter((p) => p.ownerId === user.uid) : []),
    [data.projects, user]
  );

  const deptById = useMemo(() => new Map(data.departments.map((d) => [d.id, d])), [data.departments]);

  return (
    <AppShell
      title="My Academic Projects"
      subtitle="Every equipment request links to a project deadline used for fair priority scoring."
      actions={
        <Link to="/student/projects/new">
          <Button variant="primary">
            <Plus className="h-4 w-4" />
            New Project
          </Button>
        </Link>
      }
    >
      {myProjects.length === 0 ? (
        <EmptyState
          icon={<FolderKanban className="h-6 w-6" />}
          title="No projects registered"
          description="Create your capstone, coursework, or research project with its target deadline to unlock hardware booking."
          action={
            <Link to="/student/projects/new">
              <Button>Create First Project</Button>
            </Link>
          }
        />
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {myProjects.map((proj) => {
            const reqCount = data.bookingRequests.filter((r) => r.projectId === proj.id).length;
            const dept = deptById.get(proj.departmentId);
            return (
              <Card key={proj.id} interactive className="flex flex-col justify-between space-y-4">
                <div>
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-medium text-[#22D3EE]">
                      {dept?.code ?? 'CAMPUS'} · {proj.category}
                    </span>
                    <StatusBadge status={proj.status} />
                  </div>
                  <h2 className="mt-2 text-base font-semibold text-[#F8FAFC]">{proj.title}</h2>
                  <p className="mt-1 line-clamp-2 text-xs text-[#94A3B8]">{proj.description}</p>
                </div>

                <div className="space-y-3 border-t border-white/[0.06] pt-3">
                  <div className="flex items-center justify-between text-xs text-[#94A3B8]">
                    <span className="inline-flex items-center gap-1.5 font-mono tabular-nums">
                      <Calendar className="h-3.5 w-3.5 text-[#64748B]" />
                      Due {proj.deadline.slice(0, 10)}
                    </span>
                    <span className="tabular-nums">{reqCount} request(s)</span>
                  </div>
                  <Link
                    to={`/student/projects/${proj.id}`}
                    className="inline-flex w-full items-center justify-between rounded-lg border border-white/10 bg-[#17243A] px-3 py-2 text-xs font-medium text-[#F8FAFC] hover:border-[#3B82F6]/40"
                  >
                    <span>Open Project Workspace</span>
                    <ArrowRight className="h-3.5 w-3.5 text-[#22D3EE]" />
                  </Link>
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </AppShell>
  );
};
