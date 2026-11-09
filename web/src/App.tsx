import { Navigate, Route, Routes, useLocation } from "react-router-dom";
import { Component, type ReactNode } from "react";
import { useAuth } from "./lib/auth";
import { Shell } from "./components/layouts";
import { LoadingRow } from "./components/ui";

import LoginPage from "./pages/LoginPage";
import PublicInvitePage from "./pages/PublicInvitePage";
import NotificationsPage from "./pages/NotificationsPage";
import ChangePasswordPage from "./pages/ChangePasswordPage";
import SecurityPage from "./pages/SecurityPage";

import ResidentDashboardPage from "./pages/resident/DashboardPage";
import NewInvitationPage from "./pages/resident/NewInvitationPage";
import ResidentInvitationsPage from "./pages/resident/InvitationsPage";
import InvitationDetailPage from "./pages/resident/InvitationDetailPage";
import ApprovalsPage from "./pages/resident/ApprovalsPage";

import VerifyPage from "./pages/guard/VerifyPage";
import InsidePage from "./pages/guard/InsidePage";
import AlertsPage from "./pages/guard/AlertsPage";
import IncidentsPage from "./pages/guard/IncidentsPage";

import SecurityDashboardPage from "./pages/security/DashboardPage";
import VisitorsPage from "./pages/security/VisitorsPage";
import WatchlistPage from "./pages/security/WatchlistPage";
import ReportsPage from "./pages/security/ReportsPage";
import AuditPage from "./pages/security/AuditPage";

import UsersPage from "./pages/admin/UsersPage";
import BuildingsPage from "./pages/admin/BuildingsPage";
import DevicesPage from "./pages/admin/DevicesPage";
import SettingsPage from "./pages/admin/SettingsPage";

class ErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null };
  static getDerivedStateFromError(error: Error) {
    return { error };
  }
  componentDidCatch(error: Error) {
    console.error("[ui] render error:", error);
  }
  render() {
    if (this.state.error) {
      return (
        <div className="login-page">
          <div className="empty" style={{ maxWidth: 520 }}>
            <div style={{ fontWeight: 700, color: "#fca5a5" }}>Something went wrong</div>
            <div className="small dim mt">{this.state.error.message}</div>
            <button className="btn mt" onClick={() => this.setState({ error: null })}>
              Try again
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

function RequireAuth({ children, perm }: { children: ReactNode; perm?: string }) {  const { user, loading, has } = useAuth();
  const location = useLocation();
  if (loading) {
    return (
      <div className="login-page">
        <LoadingRow label="Checking session…" />
      </div>
    );
  }
  if (!user) return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  if (user.mustChangePassword && location.pathname !== "/account/password") {
    return <Navigate to="/account/password" replace />;
  }
  if (perm && !has(perm)) {
    return (
      <Shell>
        <div className="empty">
          <div style={{ fontWeight: 700, color: "#fca5a5" }}>Access denied</div>
          <div className="small dim mt">You do not have permission to view this page.</div>
        </div>
      </Shell>
    );
  }
  return <Shell>{children}</Shell>;
}

function roleHome(role?: string): string {
  switch (role) {
    case "RESIDENT":
      return "/resident";
    case "GUARD":
      return "/guard/verify";
    default:
      return "/security";
  }
}

export default function App() {
  const { user, loading } = useAuth();

  return (
    <ErrorBoundary>
      <Routes>
        <Route path="/login" element={user ? <Navigate to={roleHome(user.role)} replace /> : <LoginPage />} />
        <Route path="/invite/:code" element={<PublicInvitePage />} />

        <Route path="/" element={loading ? <div className="login-page"><LoadingRow /></div> : <Navigate to={roleHome(user?.role)} replace />} />

        <Route path="/notifications" element={<RequireAuth><NotificationsPage /></RequireAuth>} />
        <Route path="/account/password" element={<RequireAuth><ChangePasswordPage /></RequireAuth>} />
        <Route path="/account/security" element={<RequireAuth><SecurityPage /></RequireAuth>} />

        <Route path="/resident" element={<RequireAuth perm="invitations:create"><ResidentDashboardPage /></RequireAuth>} />
        <Route path="/resident/new" element={<RequireAuth perm="invitations:create"><NewInvitationPage /></RequireAuth>} />
        <Route path="/resident/invitations" element={<RequireAuth perm="invitations:read-own"><ResidentInvitationsPage /></RequireAuth>} />
        <Route path="/resident/invitations/:id" element={<RequireAuth perm="invitations:read-own"><InvitationDetailPage /></RequireAuth>} />
        <Route path="/resident/approvals" element={<RequireAuth perm="approvals:resident"><ApprovalsPage /></RequireAuth>} />

        <Route path="/guard/verify" element={<RequireAuth perm="visitors:verify"><VerifyPage /></RequireAuth>} />
        <Route path="/guard/inside" element={<RequireAuth perm="visitors:view-all"><InsidePage /></RequireAuth>} />
        <Route path="/guard/alerts" element={<RequireAuth perm="alerts:read"><AlertsPage /></RequireAuth>} />
        <Route path="/guard/incidents" element={<RequireAuth perm="incidents:read"><IncidentsPage /></RequireAuth>} />

        <Route path="/security" element={<RequireAuth perm="dashboard:security"><SecurityDashboardPage /></RequireAuth>} />
        <Route path="/security/visitors" element={<RequireAuth perm="visitors:view-all"><VisitorsPage /></RequireAuth>} />
        <Route path="/security/alerts" element={<RequireAuth perm="alerts:read"><AlertsPage /></RequireAuth>} />
        <Route path="/security/incidents" element={<RequireAuth perm="incidents:read"><IncidentsPage /></RequireAuth>} />
        <Route path="/security/watchlist" element={<RequireAuth perm="watchlist:read"><WatchlistPage /></RequireAuth>} />
        <Route path="/security/reports" element={<RequireAuth perm="reports:read"><ReportsPage /></RequireAuth>} />
        <Route path="/security/audit" element={<RequireAuth perm="audit:read"><AuditPage /></RequireAuth>} />

        <Route path="/admin/users" element={<RequireAuth perm="users:read"><UsersPage /></RequireAuth>} />
        <Route path="/admin/buildings" element={<RequireAuth perm="buildings:write"><BuildingsPage /></RequireAuth>} />
        <Route path="/admin/devices" element={<RequireAuth perm="devices:read"><DevicesPage /></RequireAuth>} />
        <Route path="/admin/settings" element={<RequireAuth perm="settings:write"><SettingsPage /></RequireAuth>} />

        <Route path="*" element={<div className="login-page"><div className="empty" style={{ maxWidth: 420 }}>Page not found</div></div>} />
      </Routes>
    </ErrorBoundary>
  );
}
