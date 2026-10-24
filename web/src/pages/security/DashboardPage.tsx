import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useAsync, PageHeader, Card, Stat, Badge, LoadingRow, ErrorView, Empty, Modal, Field, useToast } from "../../components/ui";
import { get, post, ApiError, type Page } from "../../lib/api";
import { useAuth } from "../../lib/auth";
import { useWs } from "../../lib/ws";
import { fmtDate, relative, priorityColor, statusColor } from "../../lib/format";

interface Metrics {
  totalResidents: number;
  totalApartments: number;
  totalGuards: number;
  activeGates: number;
  visitorsToday: number;
  visitorsInside: number;
  pendingApprovals: number;
  approvedToday: number;
  exitedToday: number;
  activeAlerts: number;
  criticalAlerts: number;
  activeIncidents: number;
  unauthorizedAttempts: number;
}

interface DashAlert {
  id: string;
  code: string;
  type: string;
  priority: string;
  status: string;
  title: string;
  description?: string | null;
  subjectName?: string | null;
  gateName?: string | null;
  createdAt: string;
}

interface AlertRow extends DashAlert {
  location?: string | null;
  gate?: { id: string; name: string } | null;
}

interface InsideRow {
  id: string;
  code: string;
  visitorName: string;
  flatNumber: string;
  blockName: string;
  residentName: string;
  purpose?: string | null;
  vehicleNumber?: string | null;
  enteredAt?: string | null;
  gateName?: string | null;
  guardName?: string | null;
  expectedExitAt: string;
}

interface PendingRow {
  id: string;
  code: string;
  visitorName: string;
  flatNumber: string;
  blockName: string;
  residentName?: string | null;
  purpose?: string | null;
  vehicleNumber?: string | null;
  visitStatus: string;
  expectedAt: string;
}

interface ActivityRow {
  id: string;
  visitorName: string;
  code: string;
  gateName: string;
  guardName: string;
  enteredAt: string;
}

interface SecurityDash {
  securityStatus: string;
  lockdownActive: boolean;
  metrics: Metrics;
  insideVisitors: InsideRow[];
  recentAlerts: DashAlert[];
  pendingApprovals: PendingRow[];
  recentActivity: ActivityRow[];
}

interface StatusRes {
  lockdownActive: boolean;
  activeAlerts: number;
}

const LIVE_EVENTS = [
  "security-alert",
  "security-alert-count",
  "alert-updated",
  "lockdown",
  "visitor-entry",
  "visitor-exit",
  "approval-decided",
  "incident",
  "voice-alert",
];

function AlertItem({ alert }: { alert: AlertRow }) {
  return (
    <div className="row between gap-sm" style={{ alignItems: "flex-start", padding: "10px 12px", background: "var(--panel-2)", borderRadius: 10 }}>
      <div className="grow" style={{ minWidth: 0 }}>
        <div className="row gap-sm wrap">
          <Badge tone={priorityColor(alert.priority)}>{alert.priority}</Badge>
          <Badge tone={statusColor(alert.status)}>{alert.status}</Badge>
          <span className="small dim mono">{alert.code}</span>
        </div>
        <div style={{ marginTop: 4, fontWeight: 650 }}>{alert.title}</div>
        <div className="small dim">
          {alert.type}
          {alert.gate?.name ? ` · ${alert.gate.name}` : ""}
          {alert.subjectName ? ` · ${alert.subjectName}` : ""} · {relative(alert.createdAt)}
        </div>
      </div>
      <div className="small dim" style={{ whiteSpace: "nowrap" }}>
        {fmtDate(alert.createdAt)}
      </div>
    </div>
  );
}

export default function SecurityDashboardPage() {
  const { subscribe, connected } = useWs();
  const { has } = useAuth();
  const toast = useToast();
  const dash = useAsync<SecurityDash>(() => get("/api/dashboard/security"), []);
  const status = useAsync<StatusRes>(() => get("/api/security/status"), []);
  const alerts = useAsync<Page<AlertRow>>(() => get("/api/security/alerts?limit=5"), []);

  const canManageLockdown = has("lockdown:manage");
  const [lockOpen, setLockOpen] = useState(false);
  const [releaseOpen, setReleaseOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);

  const activateLockdown = async () => {
    if (reason.trim().length < 3) return;
    setBusy(true);
    try {
      await post("/api/security/lockdown", { reason: reason.trim() });
      toast.push("LOCKDOWN activated — all entry is suspended", "error");
      setLockOpen(false);
      setReason("");
      status.reload();
      dash.reload();
    } catch (e) {
      toast.push(e instanceof ApiError ? e.message : "Failed to activate lockdown", "error");
    } finally {
      setBusy(false);
    }
  };

  const releaseLockdown = async () => {
    setBusy(true);
    try {
      await post("/api/security/lockdown/release", { notes: notes.trim() || undefined });
      toast.push("Lockdown released — normal entry resumed", "success");
      setReleaseOpen(false);
      setNotes("");
      status.reload();
      dash.reload();
    } catch (e) {
      toast.push(e instanceof ApiError ? e.message : "Failed to release lockdown", "error");
    } finally {
      setBusy(false);
    }
  };

  useEffect(
    () =>
      subscribe((msg) => {
        if (!LIVE_EVENTS.includes(msg.type)) return;
        dash.reload();
        status.reload();
        alerts.reload();
      }),
    [subscribe],
  );

  if (dash.loading) return <LoadingRow label="Loading security dashboard…" />;
  if (dash.error) return <ErrorView error={dash.error} onRetry={dash.reload} />;
  if (!dash.data) return null;

  const m = dash.data.metrics;
  const lockdown = status.data?.lockdownActive ?? dash.data.lockdownActive;
  const posture = dash.data.securityStatus;
  const activeAlerts = status.data?.activeAlerts ?? m.activeAlerts;
  const inside = dash.data.insideVisitors;
  const pending = dash.data.pendingApprovals;

  return (
    <>
      <PageHeader
        title="Security command center"
        subtitle="Live posture, alerts and everybody on the premises"
        actions={
          <div className="row gap-sm">
            {canManageLockdown &&
              (lockdown ? (
                <button className="btn" onClick={() => setReleaseOpen(true)}>
                  Release lockdown
                </button>
              ) : (
                <button className="btn danger" onClick={() => setLockOpen(true)}>
                  ⛔ Activate lockdown
                </button>
              ))}
            <Badge tone={connected ? "green" : "gray"}>{connected ? "LIVE" : "OFFLINE"}</Badge>
          </div>
        }
      />

      {lockdown ? (
        <div className="banner lockdown mb">
          <span>EMERGENCY LOCKDOWN ACTIVE</span>
          <span className="small" style={{ fontWeight: 500 }}>
            Visitor approvals and entries are suspended until it is released.
          </span>
        </div>
      ) : (
        <div
          className="banner mb"
          style={{
            background: posture === "NORMAL" ? "rgba(34,197,94,.12)" : "rgba(245,158,11,.14)",
            borderColor: posture === "NORMAL" ? "rgba(34,197,94,.45)" : "rgba(245,158,11,.5)",
            color: posture === "NORMAL" ? "#bbf7d0" : "#fde68a",
          }}
        >
          <span>Posture: {posture}</span>
          <span className="small" style={{ fontWeight: 500 }}>
            {activeAlerts} active alerts · {m.activeGates} gates online · {m.totalGuards} officers on roll
          </span>
        </div>
      )}

      <div className="grid cols-3 mb">
        <Stat
          label="Visitors inside"
          value={m.visitorsInside}
          tone={m.visitorsInside > 0 ? "warn" : undefined}
          hint="on the premises right now"
        />
        <Stat label="Active alerts" value={m.activeAlerts} tone={m.activeAlerts > 0 ? "danger" : "good"} hint={`${m.criticalAlerts} critical`} />
        <Stat
          label="Unauthorized attempts"
          value={m.unauthorizedAttempts}
          tone={m.unauthorizedAttempts > 0 ? "danger" : "good"}
          hint="flagged today"
        />
        <Stat label="Pending approvals" value={m.pendingApprovals} tone={m.pendingApprovals > 0 ? "warn" : undefined} hint="waiting for a decision" />
        <Stat label="Open incidents" value={m.activeIncidents} tone={m.activeIncidents > 0 ? "warn" : undefined} hint="under investigation" />
        <Stat label="Visitors today" value={m.visitorsToday} hint={`${m.approvedToday} approved · ${m.exitedToday} exited`} />
        <Stat label="Residents" value={m.totalResidents} hint="active accounts" />
        <Stat label="Flats" value={m.totalApartments} hint="active apartments" />
        <Stat label="Officers / gates" value={`${m.totalGuards} / ${m.activeGates}`} hint="security staff and open gates" />
      </div>

      <div className="grid cols-2">
        <Card
          title="Live alerts feed"
          actions={
            <Link className="btn sm" to="/security/alerts">
              All alerts
            </Link>
          }
        >
          {alerts.loading ? (
            <LoadingRow />
          ) : alerts.error ? (
            <ErrorView error={alerts.error} onRetry={alerts.reload} />
          ) : !alerts.data || alerts.data.items.length === 0 ? (
            <Empty title="No alerts" hint="New security alerts appear here the moment they are raised." />
          ) : (
            <div className="col" style={{ gap: 8 }}>
              {alerts.data.items.map((a) => (
                <AlertItem key={a.id} alert={a} />
              ))}
            </div>
          )}
        </Card>

        <Card
          title={`Currently inside · ${m.visitorsInside}`}
          actions={
            <Link className="btn sm" to="/security/visitors?tab=inside">
              Directory
            </Link>
          }
        >
          {inside.length === 0 ? (
            <Empty title="Nobody inside" hint="Visitors show up here as soon as a guard records their entry." />
          ) : (
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th>Visitor</th>
                    <th>Flat</th>
                    <th>Entered</th>
                    <th>Expected exit</th>
                  </tr>
                </thead>
                <tbody>
                  {inside.slice(0, 6).map((v) => (
                    <tr key={v.id}>
                      <td>
                        <strong>{v.visitorName}</strong>
                        <div className="small dim">
                          {v.purpose || "Visit"}
                          {v.gateName ? ` · ${v.gateName}` : ""}
                        </div>
                      </td>
                      <td>
                        {v.flatNumber}
                        <div className="small dim">{v.blockName}</div>
                      </td>
                      <td>{fmtDate(v.enteredAt)}</td>
                      <td>{fmtDate(v.expectedExitAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>

        <Card
          title={`Pending approvals · ${m.pendingApprovals}`}
          actions={
            <Link className="btn primary sm" to="/security/visitors?tab=pending">
              Review
            </Link>
          }
        >
          {pending.length === 0 ? (
            <Empty title="Nothing awaiting approval" hint="Entry requests that need a security decision appear here." />
          ) : (
            <div className="col" style={{ gap: 8 }}>
              {pending.slice(0, 5).map((p) => (
                <div key={p.id} className="row between gap-sm" style={{ padding: "10px 12px", background: "var(--panel-2)", borderRadius: 10 }}>
                  <div style={{ minWidth: 0 }}>
                    <strong>{p.visitorName}</strong>
                    <div className="small dim">
                      {p.code} · Flat {p.flatNumber} {p.blockName}
                      {p.residentName ? ` · host ${p.residentName}` : ""}
                    </div>
                    <div className="small dim">expected {fmtDate(p.expectedAt)}</div>
                  </div>
                  <Badge tone={statusColor(p.visitStatus)}>{p.visitStatus}</Badge>
                </div>
              ))}
              {pending.length > 5 && <div className="small dim">+{pending.length - 5} more waiting</div>}
            </div>
          )}
        </Card>

        <Card title="Recent gate activity">
          {dash.data.recentActivity.length === 0 ? (
            <Empty title="No entries yet today" hint="The first recorded entry of the day shows up here." />
          ) : (
            <div className="col" style={{ gap: 8 }}>
              {dash.data.recentActivity.slice(0, 6).map((a) => (
                <div key={a.id} className="row between gap-sm">
                  <div style={{ minWidth: 0 }}>
                    <strong>{a.visitorName}</strong>
                    <div className="small dim">
                      {a.gateName} · guard {a.guardName} · <span className="mono">{a.code}</span>
                    </div>
                  </div>
                  <span className="small dim">{relative(a.enteredAt)}</span>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>

      <Modal
        open={lockOpen}
        title="Activate emergency lockdown"
        onClose={() => setLockOpen(false)}
        footer={
          <>
            <button className="btn ghost" onClick={() => setLockOpen(false)}>
              Cancel
            </button>
            <button className="btn danger" disabled={busy || reason.trim().length < 3} onClick={() => void activateLockdown()}>
              Activate lockdown
            </button>
          </>
        }
      >
        <div className="banner lockdown mb">
          Lockdown suspends ALL visitor verification and entry until it is released. Guards are notified immediately.
        </div>
        <Field label="Reason *" hint="At least 3 characters. Recorded in the audit log.">
          <textarea className="textarea" value={reason} onChange={(e) => setReason(e.target.value)} maxLength={300} />
        </Field>
      </Modal>

      <Modal
        open={releaseOpen}
        title="Release lockdown"
        onClose={() => setReleaseOpen(false)}
        footer={
          <>
            <button className="btn ghost" onClick={() => setReleaseOpen(false)}>
              Cancel
            </button>
            <button className="btn primary" disabled={busy} onClick={() => void releaseLockdown()}>
              Release lockdown
            </button>
          </>
        }
      >
        <p className="muted">Normal verification and entry resume immediately. Add a resolution note for the log.</p>
        <Field label="Resolution notes">
          <textarea className="textarea" value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={300} />
        </Field>
      </Modal>
    </>
  );
}
