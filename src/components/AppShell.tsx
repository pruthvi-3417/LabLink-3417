import React, { useEffect, useMemo, useState } from 'react';
import { Link, NavLink, useLocation, useNavigate } from 'react-router-dom';
import {
  Activity,
  Bell,
  Building2,
  Calendar,
  CalendarCheck,
  ChevronLeft,
  ChevronRight,
  Compass,
  Cpu,
  FolderKanban,
  LayoutDashboard,
  LogOut,
  Menu,
  RefreshCw,
  Search,
  Settings,
  Shield,
  Sliders,
  Sparkles,
  User,
  Users,
  Wrench,
  X,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useData } from '../context/DataContext';
import { getDepartmentTheme } from '../config/departmentThemes';
import type { ImageSlotKey } from '../config/imageManifest';
import { SceneBackdrop, type BackdropTier } from './layout/SceneBackdrop';
import { ErrorState, Modal, ToastContainer } from './ui/Primitives';

interface NavItem {
  to: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  badge?: number;
}

export const AppShell: React.FC<{
  title: string;
  subtitle?: string;
  actions?: React.ReactNode;
  children: React.ReactNode;
  tier?: BackdropTier;
  backdropImageSlot?: ImageSlotKey;
  departmentId?: string;
}> = ({
  title,
  subtitle,
  actions,
  children,
  tier = 'C',
  backdropImageSlot = 'campus/dusk-wide',
  departmentId,
}) => {
  const { user, logout } = useAuth();
  const {
    data,
    error,
    refresh,
    mode,
    setMode,
    firebaseStatus,
    geminiStatus,
    resetDemoData,
    toasts,
    dismissToast,
  } = useData();
  const navigate = useNavigate();
  const location = useLocation();
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [cmdOpen, setCmdOpen] = useState(false);
  const [cmdQuery, setCmdQuery] = useState('');
  const [notifOpen, setNotifOpen] = useState(false);

  const unreadNotifications = useMemo(
    () => (user ? data.notifications.filter((n) => n.userId === user.uid && !n.read) : []),
    [data.notifications, user]
  );
  const unreadCount = unreadNotifications.length;

  const pendingReqCount = useMemo(
    () =>
      data.bookingRequests.filter((r) =>
        ['submitted', 'pending_approval', 'ai_recommended'].includes(r.status)
      ).length,
    [data.bookingRequests]
  );

  // Global Ctrl/Cmd+K shortcut
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setCmdOpen((v) => !v);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  const navItems: NavItem[] = useMemo(() => {
    if (!user) return [];
    if (user.role === 'student') {
      return [
        { to: '/student/dashboard', label: 'Dashboard', icon: LayoutDashboard },
        { to: '/student/campus', label: '3D Campus', icon: Compass },
        { to: '/student/equipment', label: 'Catalog', icon: Cpu },
        { to: '/student/command-center', label: 'AI Command', icon: Sparkles },
        { to: '/student/projects', label: 'My Projects', icon: FolderKanban },
        { to: '/student/bookings', label: 'My Bookings', icon: CalendarCheck },
        { to: '/student/notifications', label: 'Notifications', icon: Bell, badge: unreadCount },
        { to: '/student/profile', label: 'Profile', icon: User },
      ];
    }
    if (user.role === 'faculty') {
      return [
        { to: '/faculty/dashboard', label: 'Dashboard', icon: LayoutDashboard },
        { to: '/faculty/campus', label: '3D Campus', icon: Compass },
        { to: '/faculty/allocation', label: 'Conflict Studio', icon: Sliders, badge: pendingReqCount },
        { to: '/faculty/requests', label: 'Requests Queue', icon: CalendarCheck, badge: pendingReqCount },
        { to: '/faculty/calendar', label: 'Lab Calendar', icon: Calendar },
        { to: '/faculty/equipment', label: 'My Equipment', icon: Cpu },
        { to: '/faculty/analytics', label: 'Analytics', icon: Activity },
      ];
    }
    return [
      { to: '/admin/dashboard', label: 'Observatory', icon: LayoutDashboard },
      { to: '/admin/campus', label: '3D Campus', icon: Compass },
      { to: '/admin/equipment', label: 'Equipment', icon: Cpu },
      { to: '/admin/labs', label: 'Laboratories', icon: Building2 },
      { to: '/admin/departments', label: 'Departments', icon: Shield },
      { to: '/admin/bookings', label: 'Bookings & QR', icon: CalendarCheck },
      { to: '/admin/maintenance', label: 'Maintenance', icon: Wrench },
      { to: '/admin/users', label: 'Users & Roles', icon: Users },
      { to: '/admin/analytics', label: 'Analytics', icon: Activity },
      { to: '/admin/settings', label: 'Settings', icon: Settings },
    ];
  }, [user, unreadCount, pendingReqCount]);

  const userDept = data.departments.find((d) => d.id === user?.departmentId);
  const effectiveDeptId = departmentId ?? user?.departmentId;
  const userDeptTheme = getDepartmentTheme(user?.departmentId);

  const breadcrumbs = useMemo(() => {
    const parts = location.pathname.split('/').filter(Boolean);
    return parts.slice(0, 3).map((p) =>
      p
        .replace(/-/g, ' ')
        .replace(/\b\w/g, (c) => c.toUpperCase())
    );
  }, [location.pathname]);

  const cmdResults = useMemo(() => {
    const q = cmdQuery.trim().toLowerCase();
    const eqMatches = data.equipment
      .filter(
        (e) =>
          !q ||
          e.name.toLowerCase().includes(q) ||
          e.equipmentId.toLowerCase().includes(q) ||
          e.category.toLowerCase().includes(q)
      )
      .slice(0, 6);
    const deptMatches = data.departments.filter(
      (d) => !q || d.name.toLowerCase().includes(q) || d.code.toLowerCase().includes(q)
    );
    return { eqMatches, deptMatches };
  }, [cmdQuery, data.equipment, data.departments]);

  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };

  const rolePrefix = user?.role === 'faculty' ? '/faculty' : user?.role === 'admin' ? '/admin' : '/student';

  const sidebarContent = (
    <div className="flex h-full flex-col justify-between bg-[#0B1220]/90 backdrop-blur-md border-r border-white/[0.08]">
      <div>
        <div className="flex h-16 items-center justify-between px-4 border-b border-white/[0.08]">
          <Link to="/" className="flex items-center gap-2.5 min-w-0">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-[#3B82F6] to-[#22D3EE] text-[#070B14] font-bold text-sm">
              L
            </div>
            {!collapsed && (
              <div className="min-w-0">
                <span className="block font-display text-sm font-semibold tracking-tight text-[#F8FAFC]">
                  LabLink Nexus
                </span>
                <span className="block text-[10px] text-[#94A3B8] truncate">Campus Resource OS</span>
              </div>
            )}
          </Link>
          <button
            type="button"
            onClick={() => setCollapsed((c) => !c)}
            aria-label="Toggle sidebar"
            className="hidden lg:inline-flex rounded-md p-1 text-[#94A3B8] hover:bg-white/10 hover:text-[#F8FAFC] cursor-pointer"
          >
            {collapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
          </button>
          <button
            type="button"
            onClick={() => setMobileOpen(false)}
            aria-label="Close navigation"
            className="lg:hidden rounded-md p-1 text-[#94A3B8] hover:bg-white/10"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <nav className="space-y-1 p-3" aria-label="Workspace Navigation">
          {navItems.map((item) => {
            const Icon = item.icon;
            return (
              <NavLink
                key={item.to}
                to={item.to}
                onClick={() => setMobileOpen(false)}
                className={({ isActive }) =>
                  `flex items-center justify-between gap-2.5 rounded-lg px-3 py-2 text-xs font-medium whitespace-nowrap transition-colors ${
                    isActive
                      ? 'bg-[#17243A] text-[#F8FAFC] border border-[#3B82F6]/35'
                      : 'text-[#94A3B8] hover:bg-white/[0.04] hover:text-[#F8FAFC] border border-transparent'
                  }`
                }
              >
                <span className="flex items-center gap-2.5 min-w-0">
                  <Icon className="h-4 w-4 shrink-0 text-[#22D3EE]" />
                  {!collapsed && <span className="truncate">{item.label}</span>}
                </span>
                {!collapsed && typeof item.badge === 'number' && item.badge > 0 && (
                  <span className="rounded bg-[#3B82F6]/20 px-1.5 py-0.5 text-[10px] font-semibold tabular-nums text-[#93C5FD]">
                    {item.badge}
                  </span>
                )}
              </NavLink>
            );
          })}
        </nav>
      </div>

      <div className="border-t border-white/[0.08] p-3 space-y-2">
        {!collapsed && user && (
          <div className="rounded-lg bg-[#111B2E] p-2.5 border border-white/[0.08]">
            <p className="truncate text-xs font-semibold text-[#F8FAFC]">{user.displayName}</p>
            <p className="truncate text-[11px] text-[#94A3B8]">
              {user.role.toUpperCase()} ·{' '}
              <span style={{ color: userDeptTheme.accent2 }}>{userDept?.code ?? 'CAMPUS'}</span>
            </p>
          </div>
        )}
        <button
          type="button"
          onClick={handleLogout}
          className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-xs font-medium text-[#94A3B8] hover:bg-[#EF4444]/10 hover:text-[#FCA5A5] whitespace-nowrap transition-colors cursor-pointer"
        >
          <LogOut className="h-4 w-4 shrink-0" />
          {!collapsed && <span>Sign Out</span>}
        </button>
      </div>
    </div>
  );

  return (
    <SceneBackdrop tier={tier} imageSlot={backdropImageSlot} departmentId={effectiveDeptId}>
      <div className="min-h-screen flex">
        {/* Desktop Glass Sidebar (264px / 76px) */}
        <aside
          className={`hidden lg:block shrink-0 transition-all duration-200 ${
            collapsed ? 'w-[76px]' : 'w-[264px]'
          }`}
        >
          <div className="sticky top-0 h-screen">{sidebarContent}</div>
        </aside>

        {/* Mobile Drawer */}
        {mobileOpen && (
          <div className="fixed inset-0 z-50 flex lg:hidden">
            <div className="w-[264px]">{sidebarContent}</div>
            <div className="flex-1 bg-black/60 backdrop-blur-sm" onClick={() => setMobileOpen(false)} />
          </div>
        )}

        {/* Main Content Column */}
        <div className="flex min-w-0 flex-1 flex-col">
          {mode === 'local-demo' && (
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#F59E0B]/25 bg-[#F59E0B]/[0.08] px-4 py-1.5 text-xs text-[#FDE68A]">
              <span className="truncate">
                <strong>Demo Mode</strong>
                <span className="hidden sm:inline"> — Local evaluation persistence active.</span>
              </span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={resetDemoData}
                  className="inline-flex items-center gap-1 rounded-md border border-[#F59E0B]/40 bg-[#070B14]/70 px-2 py-0.5 text-[11px] font-medium hover:bg-[#070B14] cursor-pointer whitespace-nowrap"
                >
                  <RefreshCw className="h-3 w-3" /> Reset Demo
                </button>
                {firebaseStatus === 'connected' && (
                  <button
                    type="button"
                    onClick={() => setMode('firestore')}
                    className="rounded-md border border-white/20 bg-[#070B14]/70 px-2 py-0.5 text-[11px] hover:bg-[#070B14] cursor-pointer whitespace-nowrap"
                  >
                    Use Firestore
                  </button>
                )}
              </div>
            </div>
          )}

          {/* Glass 64px Top Bar */}
          <header className="sticky top-0 z-30 flex h-16 items-center justify-between gap-3 border-b border-white/[0.08] bg-[#0B1220]/82 px-4 backdrop-blur-md lg:px-6">
            <div className="flex items-center gap-3 min-w-0">
              <button
                type="button"
                onClick={() => setMobileOpen(true)}
                aria-label="Open navigation"
                className="lg:hidden rounded-lg border border-white/10 p-1.5 text-[#94A3B8] hover:text-[#F8FAFC] cursor-pointer"
              >
                <Menu className="h-4 w-4" />
              </button>

              {/* Breadcrumbs */}
              <nav aria-label="Breadcrumb" className="hidden xl:flex items-center gap-1.5 text-xs text-[#94A3B8]">
                {breadcrumbs.map((crumb, idx) => (
                  <React.Fragment key={crumb + idx}>
                    {idx > 0 && <span className="text-[#475569]">/</span>}
                    <span className={idx === breadcrumbs.length - 1 ? 'text-[#F8FAFC] font-medium' : ''}>
                      {crumb}
                    </span>
                  </React.Fragment>
                ))}
              </nav>

              {/* Ctrl/Cmd+K Search Trigger */}
              <button
                type="button"
                onClick={() => setCmdOpen(true)}
                className="flex items-center justify-between gap-4 rounded-lg border border-white/10 bg-[#070B14]/80 px-3 py-1.5 text-xs text-[#94A3B8] transition-colors hover:border-white/20 hover:text-[#F8FAFC] w-44 sm:w-64 cursor-pointer"
              >
                <span className="flex items-center gap-2 truncate">
                  <Search className="h-3.5 w-3.5 shrink-0 text-[#64748B]" />
                  <span className="truncate">Search equipment, labs...</span>
                </span>
                <kbd className="hidden sm:inline rounded border border-white/15 bg-[#111B2E] px-1.5 py-0.5 font-mono text-[10px] text-[#94A3B8]">
                  ⌘K
                </kbd>
              </button>
            </div>

            <div className="flex items-center gap-2 sm:gap-2.5">
              {/* Department Pill */}
              {userDept && (
                <Link
                  to={`${rolePrefix}/campus/${userDept.id}`}
                  className="hidden md:inline-flex items-center gap-1.5 rounded-lg border border-white/10 bg-[#111B2E]/90 px-2.5 py-1 text-[11px] font-medium text-[#CBD5E1] hover:border-white/20 whitespace-nowrap"
                >
                  <span
                    className="h-2 w-2 rounded-full"
                    style={{ backgroundColor: userDeptTheme.accent2 }}
                  />
                  <span>{userDept.code}</span>
                </Link>
              )}

              {/* Connection status chip */}
              <div
                className="hidden lg:flex items-center gap-1.5 rounded-lg border border-white/10 bg-[#111B2E]/90 px-2.5 py-1 text-[11px] text-[#94A3B8] whitespace-nowrap"
                title={`Storage: ${mode === 'firestore' ? `Firestore (${firebaseStatus})` : 'Local Demo'} · Gemini: ${geminiStatus}`}
              >
                <span className="h-1.5 w-1.5 rounded-full bg-[#22D3EE]" aria-hidden="true" />
                <span>{mode === 'firestore' ? `Firestore` : 'Local'}</span>
                <span className="text-white/20">·</span>
                <span>AI: {geminiStatus === 'configured' ? 'Gemini' : 'Rules'}</span>
              </div>

              {/* Notifications Popover */}
              {user?.role === 'student' && (
                <div className="relative">
                  <button
                    type="button"
                    onClick={() => setNotifOpen((o) => !o)}
                    aria-label="Notifications"
                    className="relative rounded-lg border border-white/10 bg-[#111B2E]/90 p-2 text-[#94A3B8] transition-colors hover:border-white/20 hover:text-[#F8FAFC] cursor-pointer"
                  >
                    <Bell className="h-4 w-4" />
                    {unreadCount > 0 && (
                      <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-[#3B82F6] px-1 text-[10px] font-bold tabular-nums text-white">
                        {unreadCount}
                      </span>
                    )}
                  </button>
                  {notifOpen && (
                    <div className="glass-panel absolute right-0 mt-2 w-80 rounded-xl p-3 z-50 space-y-2">
                      <div className="flex items-center justify-between border-b border-white/[0.08] pb-2">
                        <span className="text-xs font-semibold text-[#F8FAFC]">
                          Notifications ({unreadCount} unread)
                        </span>
                        <Link
                          to="/student/notifications"
                          onClick={() => setNotifOpen(false)}
                          className="text-[11px] text-[#22D3EE] hover:underline"
                        >
                          View all
                        </Link>
                      </div>
                      {unreadNotifications.length === 0 ? (
                        <p className="py-3 text-center text-xs text-[#94A3B8]">All caught up.</p>
                      ) : (
                        <div className="space-y-1.5 max-h-60 overflow-y-auto">
                          {unreadNotifications.slice(0, 4).map((n) => (
                            <Link
                              key={n.id}
                              to="/student/notifications"
                              onClick={() => setNotifOpen(false)}
                              className="block rounded-lg border border-white/[0.06] bg-[#0B1220] p-2 hover:border-[#3B82F6]/40"
                            >
                              <p className="text-xs font-medium text-[#F8FAFC] truncate">{n.title}</p>
                              <p className="mt-0.5 text-[11px] text-[#94A3B8] line-clamp-2">{n.message}</p>
                            </Link>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}

              {/* Profile link */}
              <Link
                to={
                  user?.role === 'student'
                    ? '/student/profile'
                    : user?.role === 'faculty'
                      ? '/faculty/profile'
                      : '/admin/dashboard'
                }
                className="flex items-center gap-2 rounded-lg border border-white/10 bg-[#111B2E]/90 px-2.5 py-1.5 text-xs transition-colors hover:border-white/20 whitespace-nowrap"
              >
                <span className="flex h-5 w-5 items-center justify-center rounded bg-[#3B82F6]/20 text-[11px] font-bold text-[#93C5FD]">
                  {user?.displayName?.[0]?.toUpperCase() ?? 'U'}
                </span>
                <span className="hidden sm:inline font-medium text-[#F8FAFC]">{user?.displayName}</span>
              </Link>
            </div>
          </header>

          {/* Page Header + Body */}
          <main
            className={`mx-auto w-full max-w-[1440px] flex-1 p-4 lg:p-6 space-y-6 ${
              user?.role === 'student' ? 'pb-20 lg:pb-6' : ''
            }`}
          >
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0">
                <h1 className="font-display text-2xl sm:text-[1.75rem] font-semibold tracking-tight text-[#F8FAFC]">
                  {title}
                </h1>
                {subtitle && <p className="mt-1 text-sm text-[#94A3B8]">{subtitle}</p>}
              </div>
              {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
            </div>

            {error && (
              <ErrorState
                title="Data synchronization warning"
                message={error}
                onRetry={() => {
                  refresh();
                }}
              />
            )}

            {children}
          </main>
        </div>

        {/* Mobile Bottom Tab Bar for Student Portal */}
        {user?.role === 'student' && (
          <nav
            aria-label="Student Quick Navigation"
            className="fixed inset-x-0 bottom-0 z-30 flex h-14 items-center justify-around border-t border-white/[0.1] bg-[#0B1220]/95 px-2 backdrop-blur-md lg:hidden"
          >
            {[
              { to: '/student/dashboard', label: 'Home', icon: LayoutDashboard },
              { to: '/student/campus', label: 'Campus', icon: Compass },
              { to: '/student/equipment', label: 'Catalog', icon: Cpu },
              { to: '/student/command-center', label: 'AI', icon: Sparkles },
              { to: '/student/bookings', label: 'Bookings', icon: CalendarCheck },
            ].map((tab) => {
              const Icon = tab.icon;
              return (
                <NavLink
                  key={tab.to}
                  to={tab.to}
                  className={({ isActive }) =>
                    `flex flex-col items-center justify-center gap-0.5 rounded-lg px-2 py-1 text-[10px] font-medium ${
                      isActive ? 'text-[#22D3EE]' : 'text-[#94A3B8]'
                    }`
                  }
                >
                  <Icon className="h-4 w-4" />
                  <span>{tab.label}</span>
                </NavLink>
              );
            })}
          </nav>
        )}

        {/* Global Ctrl/Cmd+K Command Search Modal */}
        <Modal
          open={cmdOpen}
          onClose={() => setCmdOpen(false)}
          title="Quick Campus Search"
          subtitle="Jump to hardware, departments, or campus wings (Ctrl/Cmd + K)"
          maxWidth="md"
        >
          <div className="space-y-4">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-[#64748B]" />
              <input
                type="text"
                autoFocus
                value={cmdQuery}
                onChange={(e) => setCmdQuery(e.target.value)}
                placeholder="Type RTX, UR5e, oscilloscope, robotics..."
                className="w-full rounded-lg border border-white/15 bg-[#070B14] py-2 pl-9 pr-3 text-sm text-[#F8FAFC] placeholder:text-[#64748B] focus:border-[#22D3EE] focus:outline-none"
              />
            </div>

            <div className="space-y-3">
              <div>
                <p className="mb-1.5 text-[11px] font-medium uppercase tracking-wider text-[#64748B]">
                  Departments & Buildings
                </p>
                <div className="grid grid-cols-2 gap-1.5">
                  {cmdResults.deptMatches.map((d) => (
                    <button
                      key={d.id}
                      type="button"
                      onClick={() => {
                        setCmdOpen(false);
                        navigate(`${rolePrefix}/campus/${d.id}`);
                      }}
                      className="flex items-center justify-between rounded-lg border border-white/[0.08] bg-[#0B1220] px-3 py-2 text-left text-xs hover:border-[#22D3EE]/45 cursor-pointer"
                    >
                      <span className="truncate font-medium text-[#F8FAFC]">{d.name}</span>
                      <span className="font-mono text-[10px] text-[#22D3EE]">{d.code}</span>
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <p className="mb-1.5 text-[11px] font-medium uppercase tracking-wider text-[#64748B]">
                  Equipment Records ({cmdResults.eqMatches.length})
                </p>
                <div className="space-y-1.5 max-h-56 overflow-y-auto">
                  {cmdResults.eqMatches.map((eq) => (
                    <button
                      key={eq.id}
                      type="button"
                      onClick={() => {
                        setCmdOpen(false);
                        if (user?.role === 'student') navigate(`/student/equipment/${eq.id}`);
                        else if (user?.role === 'admin') navigate(`/admin/equipment/${eq.id}/edit`);
                        else navigate(`/faculty/campus?equipment=${eq.id}`);
                      }}
                      className="flex w-full items-center justify-between gap-2 rounded-lg border border-white/[0.08] bg-[#0B1220] px-3 py-2 text-left text-xs hover:border-[#3B82F6]/45 cursor-pointer"
                    >
                      <span className="truncate font-medium text-[#F8FAFC]">{eq.name}</span>
                      <span className="shrink-0 font-mono text-[10px] text-[#94A3B8]">
                        {eq.equipmentId}
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </Modal>

        <ToastContainer toasts={toasts} onDismiss={dismissToast} />
      </div>
    </SceneBackdrop>
  );
};
