import React, { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { Bell, CheckCheck } from 'lucide-react';
import { AppShell } from '../../components/AppShell';
import { Button, Card, EmptyState } from '../../components/ui/Primitives';
import { useAuth } from '../../context/AuthContext';
import { useData } from '../../context/DataContext';
import { repo } from '../../data/repo';

export const NotificationsPage: React.FC = () => {
  const { user } = useAuth();
  const { data } = useData();

  const items = useMemo(
    () =>
      user
        ? data.notifications
            .filter((n) => n.userId === user.uid)
            .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
        : [],
    [data.notifications, user]
  );

  const unreadCount = items.filter((n) => !n.read).length;

  return (
    <AppShell
      title="Notifications"
      subtitle="Booking approvals, alternative suggestions, maintenance alerts, and waitlist releases."
      actions={
        unreadCount > 0 && user ? (
          <Button variant="secondary" size="sm" onClick={() => repo.markAllNotificationsRead(user.uid)}>
            <CheckCheck className="h-3.5 w-3.5" />
            Mark All Read ({unreadCount})
          </Button>
        ) : undefined
      }
    >
      {items.length === 0 ? (
        <EmptyState
          icon={<Bell className="h-5 w-5" />}
          title="No notifications yet"
          description="You will be alerted when faculty review your requests or when waitlisted slots open."
        />
      ) : (
        <div className="space-y-2.5">
          {items.map((n) => (
            <Card
              key={n.id}
              padding="sm"
              className={`flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between ${
                !n.read ? 'border-[#3B82F6]/40 bg-[#17243A]/60' : ''
              }`}
            >
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  {!n.read && <span className="h-2 w-2 rounded-full bg-[#22D3EE]" />}
                  <span className="text-sm font-semibold text-[#F8FAFC]">{n.title}</span>
                  <span className="font-mono text-[11px] text-[#64748B] tabular-nums">
                    {n.createdAt.slice(0, 16).replace('T', ' ')}
                  </span>
                </div>
                <p className="text-xs text-[#94A3B8]">{n.message}</p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                {n.link && (
                  <Link to={n.link}>
                    <Button size="sm" variant="secondary">
                      Open
                    </Button>
                  </Link>
                )}
                {!n.read && (
                  <Button size="sm" variant="ghost" onClick={() => repo.markNotificationRead(n.id)}>
                    Mark read
                  </Button>
                )}
              </div>
            </Card>
          ))}
        </div>
      )}
    </AppShell>
  );
};
