import React from 'react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { AuthProvider, getHomeRouteForRole, useAuth } from './context/AuthContext';
import { DataProvider } from './context/DataContext';
import { Button, Card } from './components/ui/Primitives';
import type { UserRole } from './types/models';

// Public
import { LandingPage } from './pages/public/LandingPage';
import { LoginPage } from './pages/public/LoginPage';
import { RegisterPage } from './pages/public/RegisterPage';
import { ForgotPasswordPage } from './pages/public/ForgotPasswordPage';

// Student & Campus Explorer
import { StudentDashboard } from './pages/student/StudentDashboard';
import { CampusExplorerPage } from './pages/student/CampusExplorerPage';
import { DepartmentPage } from './pages/student/DepartmentPage';
import { EquipmentExplorePage } from './pages/student/EquipmentExplorePage';
import { EquipmentDetailPage } from './pages/student/EquipmentDetailPage';
import { ProjectsPage } from './pages/student/ProjectsPage';
import { ProjectFormPage } from './pages/student/ProjectFormPage';
import { ProjectDetailPage } from './pages/student/ProjectDetailPage';
import { StudentBookingsPage } from './pages/student/StudentBookingsPage';
import { AiRecommendationsPage } from './pages/student/AiRecommendationsPage';
import { NotificationsPage } from './pages/student/NotificationsPage';
import { ProfilePage } from './pages/student/ProfilePage';

// Faculty
import { FacultyDashboard } from './pages/faculty/FacultyDashboard';
import { FacultyRequestsPage } from './pages/faculty/FacultyRequestsPage';
import { FacultyRequestDetailPage } from './pages/faculty/FacultyRequestDetailPage';
import { ConflictResolutionStudioPage } from './pages/faculty/ConflictResolutionStudioPage';
import { FacultyCalendarPage } from './pages/faculty/FacultyCalendarPage';
import { FacultyEquipmentPage } from './pages/faculty/FacultyEquipmentPage';

// Admin & Shared
import { AdminDashboard } from './pages/admin/AdminDashboard';
import { AdminEquipmentPage } from './pages/admin/AdminEquipmentPage';
import { AdminEquipmentFormPage } from './pages/admin/AdminEquipmentFormPage';
import { AdminLabsPage } from './pages/admin/AdminLabsPage';
import { AdminDepartmentsPage } from './pages/admin/AdminDepartmentsPage';
import { AdminBookingsPage } from './pages/admin/AdminBookingsPage';
import { AdminMaintenancePage } from './pages/admin/AdminMaintenancePage';
import { AdminUsersPage } from './pages/admin/AdminUsersPage';
import { AdminSettingsPage } from './pages/admin/AdminSettingsPage';
import { AnalyticsPage } from './pages/shared/AnalyticsPage';

class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { error: Error | null }
> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  render() {
    if (this.state.error) {
      return (
        <div className="flex min-h-screen items-center justify-center bg-[#070B14] p-6 text-[#F8FAFC]">
          <Card className="max-w-md space-y-4">
            <h1 className="font-display text-xl font-bold text-[#FCA5A5]">Application Error</h1>
            <p className="text-xs text-[#94A3B8]">{this.state.error.message}</p>
            <Button onClick={() => window.location.reload()}>Reload Application</Button>
          </Card>
        </div>
      );
    }
    return this.props.children;
  }
}

const ProtectedRoute: React.FC<{
  allowedRoles: UserRole[];
  children: React.ReactNode;
}> = ({ allowedRoles, children }) => {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#070B14] text-sm text-[#94A3B8]">
        Verifying session...
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  if (!allowedRoles.includes(user.role)) {
    return <Navigate to={getHomeRouteForRole(user.role)} replace />;
  }

  return <>{children}</>;
};

export default function App() {
  return (
    <ErrorBoundary>
      <BrowserRouter>
        <AuthProvider>
          <DataProvider>
            <Routes>
              {/* Public */}
              <Route path="/" element={<LandingPage />} />
              <Route path="/login" element={<LoginPage />} />
              <Route path="/register" element={<RegisterPage />} />
              <Route path="/forgot-password" element={<ForgotPasswordPage />} />

              {/* Student Portal */}
              <Route
                path="/student/dashboard"
                element={
                  <ProtectedRoute allowedRoles={['student']}>
                    <StudentDashboard />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/student/campus"
                element={
                  <ProtectedRoute allowedRoles={['student', 'faculty', 'admin']}>
                    <CampusExplorerPage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/student/campus/:departmentId"
                element={
                  <ProtectedRoute allowedRoles={['student', 'faculty', 'admin']}>
                    <DepartmentPage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/student/equipment"
                element={
                  <ProtectedRoute allowedRoles={['student']}>
                    <EquipmentExplorePage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/student/equipment/:id"
                element={
                  <ProtectedRoute allowedRoles={['student']}>
                    <EquipmentDetailPage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/student/projects"
                element={
                  <ProtectedRoute allowedRoles={['student']}>
                    <ProjectsPage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/student/projects/new"
                element={
                  <ProtectedRoute allowedRoles={['student']}>
                    <ProjectFormPage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/student/projects/:id"
                element={
                  <ProtectedRoute allowedRoles={['student']}>
                    <ProjectDetailPage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/student/bookings"
                element={
                  <ProtectedRoute allowedRoles={['student']}>
                    <StudentBookingsPage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/student/command-center"
                element={
                  <ProtectedRoute allowedRoles={['student']}>
                    <AiRecommendationsPage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/student/ai-recommendations"
                element={
                  <ProtectedRoute allowedRoles={['student']}>
                    <AiRecommendationsPage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/student/notifications"
                element={
                  <ProtectedRoute allowedRoles={['student']}>
                    <NotificationsPage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/student/profile"
                element={
                  <ProtectedRoute allowedRoles={['student']}>
                    <ProfilePage />
                  </ProtectedRoute>
                }
              />

              {/* Faculty Portal */}
              <Route
                path="/faculty/dashboard"
                element={
                  <ProtectedRoute allowedRoles={['faculty', 'admin']}>
                    <FacultyDashboard />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/faculty/campus"
                element={
                  <ProtectedRoute allowedRoles={['faculty', 'admin']}>
                    <CampusExplorerPage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/faculty/campus/:departmentId"
                element={
                  <ProtectedRoute allowedRoles={['faculty', 'admin']}>
                    <DepartmentPage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/faculty/requests"
                element={
                  <ProtectedRoute allowedRoles={['faculty', 'admin']}>
                    <FacultyRequestsPage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/faculty/requests/:id"
                element={
                  <ProtectedRoute allowedRoles={['faculty', 'admin']}>
                    <FacultyRequestDetailPage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/faculty/allocation"
                element={
                  <ProtectedRoute allowedRoles={['faculty', 'admin']}>
                    <ConflictResolutionStudioPage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/faculty/calendar"
                element={
                  <ProtectedRoute allowedRoles={['faculty', 'admin']}>
                    <FacultyCalendarPage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/faculty/equipment"
                element={
                  <ProtectedRoute allowedRoles={['faculty', 'admin']}>
                    <FacultyEquipmentPage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/faculty/analytics"
                element={
                  <ProtectedRoute allowedRoles={['faculty', 'admin']}>
                    <AnalyticsPage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/faculty/profile"
                element={
                  <ProtectedRoute allowedRoles={['faculty', 'admin']}>
                    <ProfilePage />
                  </ProtectedRoute>
                }
              />

              {/* Admin Portal */}
              <Route
                path="/admin/dashboard"
                element={
                  <ProtectedRoute allowedRoles={['admin']}>
                    <AdminDashboard />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/admin/campus"
                element={
                  <ProtectedRoute allowedRoles={['admin']}>
                    <CampusExplorerPage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/admin/campus/:departmentId"
                element={
                  <ProtectedRoute allowedRoles={['admin']}>
                    <DepartmentPage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/admin/equipment"
                element={
                  <ProtectedRoute allowedRoles={['admin']}>
                    <AdminEquipmentPage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/admin/equipment/new"
                element={
                  <ProtectedRoute allowedRoles={['admin']}>
                    <AdminEquipmentFormPage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/admin/equipment/:id/edit"
                element={
                  <ProtectedRoute allowedRoles={['admin']}>
                    <AdminEquipmentFormPage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/admin/labs"
                element={
                  <ProtectedRoute allowedRoles={['admin']}>
                    <AdminLabsPage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/admin/laboratories"
                element={
                  <ProtectedRoute allowedRoles={['admin']}>
                    <AdminLabsPage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/admin/departments"
                element={
                  <ProtectedRoute allowedRoles={['admin']}>
                    <AdminDepartmentsPage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/admin/bookings"
                element={
                  <ProtectedRoute allowedRoles={['admin']}>
                    <AdminBookingsPage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/admin/maintenance"
                element={
                  <ProtectedRoute allowedRoles={['admin']}>
                    <AdminMaintenancePage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/admin/users"
                element={
                  <ProtectedRoute allowedRoles={['admin']}>
                    <AdminUsersPage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/admin/analytics"
                element={
                  <ProtectedRoute allowedRoles={['admin']}>
                    <AnalyticsPage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/admin/settings"
                element={
                  <ProtectedRoute allowedRoles={['admin']}>
                    <AdminSettingsPage />
                  </ProtectedRoute>
                }
              />

              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </DataProvider>
        </AuthProvider>
      </BrowserRouter>
    </ErrorBoundary>
  );
}
