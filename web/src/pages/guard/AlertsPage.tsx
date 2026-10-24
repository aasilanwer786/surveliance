import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import {
  useAsync,
  PageHeader,
  Badge,
  LoadingRow,
  ErrorView,
  Empty,
  Pagination,
  useToast,
  Modal,
  Field,
} from "../../components/ui";
import { get, post, ApiError, type Page } from "../../lib/api";
import { useAuth } from "../../lib/auth";
import { useWs } from "../../lib/ws";
import { fmtDate, relative, statusColor, priorityColor } from "../../lib/format";
import { CameraSnapshotModal, type CameraRef } from "../../components/CameraSnapshot";

interface AlertRow {
  id: string;
  code: string;
  type: string;
  priority: string;
  status: string;
  title: string;
  description: string;
  location: string | null;
  subjectName: string | null;
  invitationId: string | null;
  incidentId: string | null;
  acknowledgedAt: string | null;
  resolvedAt: string | null;
  resolution: string | null;
  createdAt: string;
  gate: { id: string; name: string } | null;
  incident: { id: string; code: string; status: string } | null;
  ackedBy: { id: string; name: string } | null;
  resolvedBy: { id: string; name: string } | null;
  detectorEvent: {
    id: string;
    type: string;
    source: string;
    area: string | null;
    confidence: number | null;
    camera: { id: string; name: string; area: string | null } | null;
  } | null;
}

const STATUS_FILTERS = [
  { key: "", label: "All" },
  { key: "NEW", label: "New" },
  { key: "ACKNOWLEDGED", label: "Acknowledged" },
  { key: "RESOLVED", label: "Resolved" },
  { key: "CLOSED", label: "Closed" },
];

const LIMIT = 15;

export default function AlertsPage() {
  const { user, has: can } = useAuth();
  const toast = useToast();
  const { subscribe } = useWs();

  const [status, setStatus] = useState("");
  const [priority, setPriority] = useState("");
  const [page, setPage] = useState(1);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [resolveTarget, setResolveTarget] = useState<AlertRow | null>(null);
  const [resolution, setResolution] = useState("");
  const [resolveBusy, setResolveBusy] = useState(false);
  const [snapCamera, setSnapCamera] = useState<CameraRef | null>(null);

  const list = useAsync<Page<AlertRow>>(
    () =>
      get(
        `/api/security/alerts?page=${page}&limit=${LIMIT}${status ? `&status=${status}` : ""}${
          priority ? `&priority=${priority}` : ""
        }`,
      ),
    [page, status, priority],
  );

  const reloadRef = useRef(list.reload);
  useEffect(() => {
    reloadRef.current = list.reload;
  }, [list.reload]);

  useEffect(
    () =>
      subscribe((msg) => {
        if (msg.type === "security-alert") {
          const data = msg.data as { title?: string; priority?: string } | undefined;
          const severe = data?.priority === "CRITICAL" || data?.priority === "EMERGENCY";
          toast.push(`New alert${data?.title ? `: ${data.title}` : ""}`, severe ? "error" : "warn");
          reloadRef.current();
        } else if (msg.type === "alert-updated") {
          reloadRef.current();
        }
      }),
    [subscribe, toast],
  );

  const canAck = can("alerts:acknowledge");
  const canResolve = can("alerts:resolve");
  const canViewCameras = can("cameras:read");
  const incidentsPath = user?.role === "SECURITY" ? "/security/incidents" : "/guard/incidents";

  const viewCamera = (a: AlertRow) => {
    const cam = a.detectorEvent?.camera;
    setSnapCamera({
      id: cam?.id ?? "",
      name: cam?.name ?? "Detecting camera",
      area: cam?.area ?? a.detectorEvent?.area ?? a.location,
    });
  };

  const acknowledge = async (id: string) => {
    setBusyId(id);
    try {
      await post(`/api/security/alerts/${id}/acknowledge`, {});
      toast.push("Alert acknowledged", "success");
      reloadRef.current();
    } catch (err) {
      toast.push(err instanceof ApiError ? err.message : "Acknowledge failed", "error");
    } finally {
      setBusyId(null);
    }
  };

  const resolveAlert = async () => {
    if (!resolveTarget) return;
    const note = resolution.trim();
    if (note.length < 3) return;
    setResolveBusy(true);
    try {
      await post(`/api/security/alerts/${resolveTarget.id}/resolve`, { resolution: note });
      toast.push(`Alert ${resolveTarget.code} resolved`, "success");
      setResolveTarget(null);
      setResolution("");
      reloadRef.current();
    } catch (err) {
      toast.push(err instanceof ApiError ? err.message : "Resolve failed", "error");
    } finally {
      setResolveBusy(false);
    }
  };

  const rows = list.data?.items ?? [];

  return (
    <>
      <PageHeader
        title="Security alerts"
        subtitle="Gate, detector and overstay alerts across the premises"
        actions={
          <select
            className="select"
            style={{ width: "auto" }}
            value={priority}
            onChange={(e) => {
              setPriority(e.target.value);
              setPage(1);
            }}
            aria-label="Filter by priority"
          >
            <option value="">All priorities</option>
            <option value="LOW">Low</option>
            <option value="MEDIUM">Medium</option>
            <option value="HIGH">High</option>
            <option value="CRITICAL">Critical</option>
            <option value="EMERGENCY">Emergency</option>
          </select>
        }
      />

      <div className="pill-tabs">
        {STATUS_FILTERS.map((f) => (
          <button
            key={f.key}
            className={`pill-tab ${status === f.key ? "active" : ""}`}
            onClick={() => {
              setStatus(f.key);
              setPage(1);
            }}
          >
            {f.label}
          </button>
        ))}
      </div>

      {list.loading && !list.data ? (
        <LoadingRow label="Loading alerts…" />
      ) : list.error && !list.data ? (
        <ErrorView error={list.error} onRetry={list.reload} />
      ) : rows.length === 0 ? (
        <Empty title="No alerts found" hint="Nothing matches the current filters." />
      ) : (
        <>
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Alert</th>
                  <th>Detail</th>
                  <th>Priority</th>
                  <th>Status</th>
                  <th>Links</th>
                  <th>Created</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {rows.map((a) => {
                  const busy = busyId === a.id;
                  const canBeAcked = a.status === "NEW";
                  const canBeResolved = a.status !== "RESOLVED" && a.status !== "CLOSED";
                  return (
                    <tr key={a.id}>
                      <td>
                        <span className="mono small">{a.code}</span>
                        <div className="small dim">{a.type}</div>
                        {a.detectorEvent?.camera && (
                          <div className="small dim" title="Detecting camera">
                            cam · {a.detectorEvent.camera.name}
                          </div>
                        )}
                      </td>
                      <td style={{ maxWidth: 340 }}>
                        <strong>{a.title}</strong>
                        <div
                          className="small dim"
                          title={a.description}
                          style={{
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                            whiteSpace: "nowrap",
                          }}
                        >
                          {a.description}
                        </div>
                      </td>
                      <td>
                        <Badge tone={priorityColor(a.priority)}>{a.priority}</Badge>
                      </td>
                      <td>
                        <Badge tone={statusColor(a.status)}>{a.status}</Badge>
                        {a.ackedBy && <div className="small dim">by {a.ackedBy.name}</div>}
                        {a.resolvedBy && <div className="small dim">resolved by {a.resolvedBy.name}</div>}
                      </td>
                      <td>
                        <div className="col" style={{ gap: 4 }}>
                          {a.incident && (
                            <Link className="mono small" to={incidentsPath}>
                              {a.incident.code}
                            </Link>
                          )}
                          {a.invitationId && (
                            <span className="mono small dim" title={a.invitationId}>
                              visitor · {a.invitationId.slice(-6)}
                            </span>
                          )}
                          {!a.incident && !a.invitationId && <span className="small dim">—</span>}
                        </div>
                      </td>
                      <td title={fmtDate(a.createdAt)}>
                        <div>{relative(a.createdAt)}</div>
                        <div className="small dim">{a.location ?? a.gate?.name ?? ""}</div>
                      </td>
                      <td>
                        <div className="row gap-sm" style={{ justifyContent: "flex-end" }}>
                          {canViewCameras && a.detectorEvent?.camera && (
                            <button
                              className="btn sm"
                              title={`View ${a.detectorEvent.camera.name}`}
                              onClick={() => viewCamera(a)}
                            >
                              View camera
                            </button>
                          )}
                          {canBeAcked && (
                            <button
                              className="btn sm"
                              disabled={busy || !canAck}
                              title={canAck ? undefined : "Missing alerts:acknowledge permission"}
                              onClick={() => void acknowledge(a.id)}
                            >
                              {busy ? "…" : "Acknowledge"}
                            </button>
                          )}
                          {canBeResolved && (
                            <button
                              className="btn sm primary"
                              disabled={!canResolve}
                              title={canResolve ? undefined : "Missing alerts:resolve permission"}
                              onClick={() => {
                                setResolveTarget(a);
                                setResolution("");
                              }}
                            >
                              Resolve
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {list.data && <Pagination page={list.data.page} total={list.data.total} limit={LIMIT} onChange={setPage} />}
        </>
      )}

      <Modal
        open={resolveTarget !== null}
        title={`Resolve ${resolveTarget?.code ?? "alert"}`}
        onClose={() => {
          if (!resolveBusy) {
            setResolveTarget(null);
            setResolution("");
          }
        }}
        footer={
          <>
            <button className="btn" disabled={resolveBusy} onClick={() => setResolveTarget(null)}>
              Cancel
            </button>
            <button
              className="btn primary"
              disabled={resolveBusy || resolution.trim().length < 3}
              onClick={() => void resolveAlert()}
            >
              {resolveBusy ? "Saving…" : "Resolve alert"}
            </button>
          </>
        }
      >
        {resolveTarget && (
          <>
            <div className="mb">
              <strong>{resolveTarget.title}</strong>
              <div className="small dim">{resolveTarget.description}</div>
            </div>
            <Field label="Resolution note" hint="Minimum 3 characters — stored on the alert.">
              <textarea
                className="textarea"
                rows={4}
                value={resolution}
                onChange={(e) => setResolution(e.target.value)}
                placeholder="What was done to resolve this alert?"
              />
            </Field>
          </>
        )}
      </Modal>

      <CameraSnapshotModal camera={snapCamera} onClose={() => setSnapCamera(null)} />
    </>
  );
}
