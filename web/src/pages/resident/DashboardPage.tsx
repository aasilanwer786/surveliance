import { Link } from "react-router-dom";
import { useAsync, Card, Stat, Badge, LoadingRow, ErrorView, Empty, PageHeader } from "../../components/ui";
import { get } from "../../lib/api";
import { fmtDate } from "../../lib/format";
import { useAuth } from "../../lib/auth";

interface Dash {
  metrics: {
    totalInvitations: number;
    upcoming: number;
    insideNow: number;
    todayEntries: number;
    unreadNotifications: number;
    pendingApprovals: number;
  };
  apartments: Array<{ id: string; flatNumber: string; blockName: string; buildingName: string; floor: number }>;
  insideVisitors: Array<{
    id: string;
    code: string;
    visitorName: string;
    purpose?: string | null;
    expectedExitAt: string;
    lastEntry?: { enteredAt: string; gate?: { name: string } } | null;
  }>;
}

export default function ResidentDashboardPage() {
  const { user } = useAuth();
  const { data, error, loading, reload } = useAsync<Dash>(() => get("/api/dashboard/resident"), []);

  if (loading) return <LoadingRow />;
  if (error) return <ErrorView error={error} onRetry={reload} />;
  if (!data) return null;

  const { metrics, apartments, insideVisitors } = data;

  return (
    <>
      <PageHeader
        title={`Welcome, ${user?.name?.split(" ")[0] ?? "there"}`}
        subtitle="Track your visitors, approvals and gate activity"
        actions={
          <Link className="btn primary" to="/resident/new">
            ＋ New invitation
          </Link>
        }
      />

      <div className="grid cols-4 mb">
        <Stat label="Upcoming visits" value={metrics.upcoming} hint="within the arrival window" />
        <Stat label="Inside now" value={metrics.insideNow} tone={metrics.insideNow > 0 ? "warn" : undefined} hint="visitors on premises" />
        <Stat label="Pending approvals" value={metrics.pendingApprovals} tone={metrics.pendingApprovals > 0 ? "danger" : "good"} hint="waiting for you" />
        <Stat label="Entries today" value={metrics.todayEntries} hint={`${metrics.totalInvitations} invitations total`} />
      </div>

      <div className="grid cols-2">
        <Card
          title="Visitors inside now"
          actions={
            <Link className="btn sm" to="/resident/invitations">
              All invitations
            </Link>
          }
        >
          {insideVisitors.length === 0 ? (
            <Empty title="No visitors inside" hint="You will see anyone on the premises here in real time." />
          ) : (
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th>Visitor</th>
                    <th>Entered</th>
                    <th>Expected exit</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {insideVisitors.map((v) => (
                    <tr key={v.id}>
                      <td>
                        <strong>{v.visitorName}</strong>
                        <div className="small dim">{v.purpose || "Visit"} · {v.lastEntry?.gate?.name ?? "gate"}</div>
                      </td>
                      <td>{fmtDate(v.lastEntry?.enteredAt)}</td>
                      <td>{fmtDate(v.expectedExitAt)}</td>
                      <td>
                        <Badge tone="green">INSIDE</Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>

        <Card title="Your apartments">
          {apartments.length === 0 ? (
            <Empty title="No apartment linked" hint="Contact the administration to link your flat." />
          ) : (
            <div className="col">
              {apartments.map((a) => (
                <div key={a.id} className="row between" style={{ padding: "10px 12px", background: "var(--panel-2)", borderRadius: 10 }}>
                  <div>
                    <strong>Flat {a.flatNumber}</strong>
                    <div className="small dim">
                      {a.blockName} · {a.buildingName} · Floor {a.floor}
                    </div>
                  </div>
                  <Badge tone="blue">ACTIVE</Badge>
                </div>
              ))}
              <div className="divider" />
              <div className="row wrap gap-sm">
                <Link className="btn sm" to="/resident/approvals">
                  Approvals ({metrics.pendingApprovals})
                </Link>
                <Link className="btn sm" to="/notifications">
                  Notifications ({metrics.unreadNotifications} unread)
                </Link>
                <Link className="btn sm" to="/resident/invitations">
                  History
                </Link>
              </div>
            </div>
          )}
        </Card>
      </div>
    </>
  );
}
