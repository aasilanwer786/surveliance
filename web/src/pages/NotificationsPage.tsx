import { useState } from "react";
import { Link } from "react-router-dom";
import { useAsync, PageHeader, LoadingRow, ErrorView, Empty, Badge, Pagination, useToast, Card } from "../components/ui";
import { get, post, type Page } from "../lib/api";
import { fmtDate, priorityColor } from "../lib/format";
import { useWs } from "../lib/ws";
import { useEffect } from "react";

interface Notif {
  id: string;
  title: string;
  body?: string | null;
  type: string;
  priority: string;
  readAt?: string | null;
  createdAt: string;
}

export default function NotificationsPage() {
  const toast = useToast();
  const { subscribe } = useWs();
  const [unreadOnly, setUnreadOnly] = useState(false);
  const [page, setPage] = useState(1);
  const limit = 20;

  const { data, error, loading, reload } = useAsync<Page<Notif> & { unread?: number }>(
    () => get(`/api/notifications?page=${page}&limit=${limit}${unreadOnly ? "&unreadOnly=true" : ""}`),
    [page, unreadOnly],
  );

  useEffect(
    () =>
      subscribe((msg) => {
        if (msg.type === "notification") reload();
      }),
    [subscribe, reload],
  );

  const markRead = async (id: string) => {
    try {
      await post(`/api/notifications/${id}/read`, {});
      reload();
    } catch (e) {
      toast.push(e instanceof Error ? e.message : "Failed", "error");
    }
  };

  const markAll = async () => {
    try {
      await post("/api/notifications/read-all", {});
      toast.push("All notifications marked as read", "success");
      reload();
    } catch (e) {
      toast.push(e instanceof Error ? e.message : "Failed", "error");
    }
  };

  return (
    <>
      <PageHeader
        title="Notifications"
        subtitle="Alerts, approvals and visitor events for you"
        actions={
          <>
            <button className={`btn ${unreadOnly ? "primary" : ""}`} onClick={() => { setUnreadOnly(!unreadOnly); setPage(1); }}>
              {unreadOnly ? "Showing: unread" : "Unread only"}
            </button>
            <button className="btn" onClick={() => void markAll()}>
              Mark all read
            </button>
          </>
        }
      />

      {loading ? (
        <LoadingRow />
      ) : error ? (
        <ErrorView error={error} onRetry={reload} />
      ) : !data || data.items.length === 0 ? (
        <Empty title={unreadOnly ? "No unread notifications" : "No notifications yet"} hint="Visitor activity and approvals will appear here." />
      ) : (
        <>
          <div className="col gap-sm">
            {data.items.map((n) => (
              <Card key={n.id} style={n.readAt ? { opacity: 0.72 } : undefined}>
                <div className="row between wrap gap-sm">
                  <div className="row gap-sm" style={{ alignItems: "flex-start" }}>
                    <span style={{ fontSize: 18, lineHeight: 1.4 }}>{n.readAt ? "🔔" : "📣"}</span>
                    <div>
                      <strong>{n.title}</strong>
                      {n.body && <div className="small muted">{n.body}</div>}
                      <div className="small dim">{fmtDate(n.createdAt)}</div>
                    </div>
                  </div>
                  <div className="row gap-sm">
                    <Badge tone={priorityColor(n.priority)}>{n.priority}</Badge>
                    <Badge tone="blue">{n.type}</Badge>
                    {!n.readAt && (
                      <button className="btn sm" onClick={() => void markRead(n.id)}>
                        Mark read
                      </button>
                    )}
                    {n.type === "APPROVAL_REQUEST" && (
                      <Link className="btn sm" to="/resident/approvals">
                        Review
                      </Link>
                    )}
                  </div>
                </div>
              </Card>
            ))}
          </div>
          <Pagination page={data.page} total={data.total} limit={limit} onChange={setPage} />
        </>
      )}
    </>
  );
}
