import { useEffect, useMemo, useState, type ReactNode } from "react";
import { NavLink, useLocation } from "react-router-dom";
import { useAuth, roleName } from "../lib/auth";
import { useWs } from "../lib/ws";
import { get } from "../lib/api";
import { initials } from "../lib/format";
import { isVoiceEnabled, muteVoice, setVoiceEnabled } from "../lib/voice";

interface NavItem {
  to: string;
  label: string;
  icon: string;
  end?: boolean;
}

interface NavGroup {
  section: string;
  items: NavItem[];
}

function navForRole(role: string, has: (p: string | string[]) => boolean): NavGroup[] {
  if (role === "RESIDENT") {
    return [
      {
        section: "Home",
        items: [
          { to: "/resident", label: "Dashboard", icon: "⌂", end: true },
          { to: "/resident/new", label: "New invitation", icon: "＋" },
          { to: "/resident/invitations", label: "My invitations", icon: "🎫" },
        ],
      },
      {
        section: "Approvals",
        items: [
          { to: "/resident/approvals", label: "Pending approvals", icon: "✓" },
          { to: "/notifications", label: "Notifications", icon: "🔔" },
        ],
      },
    ];
  }

  if (role === "GUARD") {
    return [
      {
        section: "Gate",
        items: [
          { to: "/guard/verify", label: "Verify visitor", icon: "⛨", end: true },
          { to: "/guard/inside", label: "Currently inside", icon: "👥" },
        ],
      },
      {
        section: "Security",
        items: [
          { to: "/guard/alerts", label: "Alerts", icon: "⚠" },
          { to: "/guard/incidents", label: "Incidents", icon: "📋" },
          { to: "/notifications", label: "Notifications", icon: "🔔" },
        ],
      },
    ];
  }

  const groups: NavGroup[] = [
    {
      section: "Overview",
      items: [
        { to: "/security", label: "Security dashboard", icon: "▣", end: true },
        { to: "/security/visitors", label: "Visitors", icon: "🎫" },
        { to: "/guard/verify", label: "Verify at gate", icon: "⛨" },
      ],
    },
    {
      section: "Incidents",
      items: [
        { to: "/security/alerts", label: "Alerts", icon: "⚠" },
        { to: "/security/incidents", label: "Incidents", icon: "📋" },
        { to: "/security/watchlist", label: "Watchlist", icon: "👁" },
      ],
    },
    {
      section: "Insights",
      items: [
        { to: "/security/reports", label: "Reports", icon: "📊" },
        ...(has("audit:read") ? [{ to: "/security/audit", label: "Audit log", icon: "🧾" }] : []),
        { to: "/notifications", label: "Notifications", icon: "🔔" },
      ],
    },
  ];

  const adminItems = [
    ...(has("users:read") ? [{ to: "/admin/users", label: "Users & roles", icon: "👤" }] : []),
    ...(has("buildings:write") ? [{ to: "/admin/buildings", label: "Buildings & gates", icon: "🏢" }] : []),
    ...(has("devices:read") ? [{ to: "/admin/devices", label: "Cameras & devices", icon: "🎥" }] : []),
    ...(has("settings:write") ? [{ to: "/admin/settings", label: "Settings", icon: "⚙" }] : []),
  ];
  if (adminItems.length > 0) {
    groups.push({ section: "Administration", items: adminItems });
  }
  return groups;
}

function LockdownBanner({ onClear }: { onClear: () => void }) {
  return (
    <div className="banner lockdown" style={{ margin: "10px 22px 0" }}>
      <span style={{ fontSize: 16 }}>🚨</span>
      <span className="grow">
        EMERGENCY LOCKDOWN ACTIVE — visitor approvals and entries are suspended.
      </span>
      <button className="btn ghost sm" onClick={onClear}>
        dismiss
      </button>
    </div>
  );
}

export function Shell({ children }: { children: ReactNode }) {
  const { user, logout, has } = useAuth();
  const { connected, subscribe } = useWs();
  const location = useLocation();
  const [lockdown, setLockdown] = useState(false);
  const [lockdownDismissed, setLockdownDismissed] = useState(false);
  const [unread, setUnread] = useState(0);
  const [voiceOn, setVoiceOn] = useState(isVoiceEnabled());
  const [navOpen, setNavOpen] = useState(false);

  const groups = useMemo(() => navForRole(user?.role ?? "", has), [user?.role, has]);

  useEffect(() => {
    setNavOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    if (!user || !has("alerts:read")) return;
    get<{ lockdownActive: boolean }>("/api/security/status")
      .then((s) => setLockdown(s.lockdownActive))
      .catch(() => undefined);
  }, [user, has, location.pathname]);

  useEffect(() => {
    if (!user) return;
    const check = () =>
      get<{ unread: number }>("/api/notifications?limit=1")
        .then((r) => setUnread(r.unread ?? 0))
        .catch(() => undefined);
    check();
    const id = setInterval(check, 45000);
    return () => clearInterval(id);
  }, [user]);

  useEffect(() => {
    return subscribe((msg) => {
      if (msg.type === "lockdown") {
        setLockdown(!!msg.data?.active);
        setLockdownDismissed(false);
      }
      if (msg.type === "notification") {
        setUnread((u) => u + 1);
      }
      if (msg.type === "approval-pending" || msg.type === "approval-request") {
        // triggers refetches in page-level subscribers
      }
    });
  }, [subscribe]);

  if (!user) return <>{children}</>;

  const showLockdown = lockdown && !lockdownDismissed;

  return (
    <div className="app-shell">
      <aside className={`sidebar ${navOpen ? "open" : ""}`}>
        <div className="brand">
          <div className="brand-mark">SR</div>
          <div>
            SecureResident
            <div className="small dim" style={{ fontWeight: 500 }}>
              {roleName(user.role)}
            </div>
          </div>
        </div>
        {groups.map((g) => (
          <div key={g.section}>
            <div className="nav-section">{g.section}</div>
            {g.items.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.end}
                className={({ isActive }) => `nav-link ${isActive ? "active" : ""}`}
              >
                <span className="icon">{item.icon}</span>
                {item.label}
              </NavLink>
            ))}
          </div>
        ))}
        <div style={{ marginTop: "auto" }} className="small dim">
          <div className="row gap-sm" style={{ padding: "10px" }}>
            <span
              style={{
                width: 8,
                height: 8,
                borderRadius: 8,
                background: connected ? "var(--green)" : "var(--red)",
                display: "inline-block",
              }}
            />
            {connected ? "live" : "offline"}
          </div>
        </div>
      </aside>

      {navOpen && <div className="sidebar-overlay" onClick={() => setNavOpen(false)} />}

      <div className="main-col">
        <header className="topbar">
          <div className="row gap-sm">
            <button
              className="btn ghost sm nav-toggle"
              aria-label="Toggle navigation"
              onClick={() => setNavOpen((o) => !o)}
            >
              ☰
            </button>
            <strong>{groups[0]?.items[0]?.label ?? "SecureResident"}</strong>
            <span className="small dim">{new Date().toLocaleDateString(undefined, { weekday: "long", day: "2-digit", month: "short" })}</span>
          </div>
          <div className="row gap-sm">
            <button
              className={`btn ghost sm ${voiceOn ? "" : ""}`}
              title={voiceOn ? "Voice alerts on (click to mute 10 min)" : "Voice alerts muted"}
              onClick={() => {
                if (voiceOn) {
                  muteVoice(10 * 60_000);
                  setVoiceOn(false);
                } else {
                  setVoiceEnabled(true);
                  setVoiceOn(true);
                }
              }}
            >
              {voiceOn ? "🔊 voice" : "🔇 muted"}
            </button>
            <NavLink to="/account/security" className="btn ghost sm" title="Two-factor authentication (MFA)">
              🛡
            </NavLink>
            <NavLink to="/account/password" className="btn ghost sm" title="Change password">
              🔑
            </NavLink>
            <NavLink to="/notifications" className="btn ghost sm" style={{ position: "relative" }} title="Notifications">
              🔔
              {unread > 0 && <span className="notif-dot">{unread > 99 ? "99+" : unread}</span>}
            </NavLink>
            <div className="row gap-sm" style={{ paddingLeft: 6 }}>
              <div className="avatar">{initials(user.name)}</div>
              <div className="small">
                <div style={{ fontWeight: 650 }}>{user.name}</div>
                <div className="dim">{user.guard?.gate?.name ?? roleName(user.role)}</div>
              </div>
            </div>
            <button className="btn sm" onClick={() => void logout()}>
              Sign out
            </button>
          </div>
        </header>

        {showLockdown && <LockdownBanner onClear={() => setLockdownDismissed(true)} />}

        <main className="content">{children}</main>
      </div>
    </div>
  );
}
