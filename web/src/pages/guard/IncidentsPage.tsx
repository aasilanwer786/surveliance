import { Fragment, useEffect, useRef, useState } from "react";
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
import { get, post, put, ApiError, type Page } from "../../lib/api";
import { useAuth } from "../../lib/auth";
import { useWs } from "../../lib/ws";
import { fmtDate, relative, statusColor, priorityColor } from "../../lib/format";
import { CameraSnapshotModal, type CameraRef } from "../../components/CameraSnapshot";

interface IncidentRow {
  id: string;
  code: string;
  type: string;
  priority: string;
  status: string;
  title: string;
  description: string;
  location: string | null;
  subjectName: string | null;
  actionsTaken: string | null;
  resolution: string | null;
  createdAt: string;
  updatedAt: string;
  closedAt: string | null;
  gate: { id: string; name: string } | null;
  reportedBy: { id: string; name: string } | null;
  closedBy: { id: string; name: string } | null;
  alerts: Array<{
    id: string;
    code: string;
    status: string;
    priority: string;
    detectorEvent: { camera: { id: string; name: string; area: string | null } | null } | null;
  }>;
}

const STATUS_FILTERS = [
  { key: "", label: "All" },
  { key: "NEW", label: "New" },
  { key: "ACKNOWLEDGED", label: "Acknowledged" },
  { key: "INVESTIGATING", label: "Investigating" },
  { key: "RESOLVED", label: "Resolved" },
  { key: "CLOSED", label: "Closed" },
];

const STATUSES = ["NEW", "ACKNOWLEDGED", "INVESTIGATING", "RESOLVED", "CLOSED"];
const PRIORITIES = ["LOW", "MEDIUM", "HIGH", "CRITICAL", "EMERGENCY"];
const INCIDENT_TYPES = [
  "SUSPICIOUS_ACTIVITY",
  "SUSPICIOUS_PERSON",
  "THEFT",
  "VANDALISM",
  "DISTURBANCE",
  "UNKNOWN_PERSON",
  "OVERSTAY",
  "MEDICAL",
  "FIRE",
  "ACCIDENT",
  "OTHER",
];

const LIMIT = 15;

function IncidentDetail({
  inc,
  canWrite,
  canClose,
  canViewCameras,
  alertsPath,
  onSaved,
  onViewCamera,
}: {
  inc: IncidentRow;
  canWrite: boolean;
  canClose: boolean;
  canViewCameras: boolean;
  alertsPath: string;
  onSaved: () => void;
  onViewCamera: (cam: CameraRef) => void;
}) {
  const toast = useToast();
  const [status, setStatus] = useState(inc.status);
  const [actionsTaken, setActionsTaken] = useState(inc.actionsTaken ?? "");
  const [resolution, setResolution] = useState(inc.resolution ?? "");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const detectedCameras = inc.alerts
    .flatMap((a) => (a.detectorEvent?.camera ? [a.detectorEvent.camera] : []))
    .filter((cam, idx, arr) => arr.findIndex((c) => c.id === cam.id) === idx);

  const statusOptions = STATUSES.filter((s) => s !== "CLOSED" || canClose);
  const dirty =
    status !== inc.status ||
    actionsTaken !== (inc.actionsTaken ?? "") ||
    resolution !== (inc.resolution ?? "");

  const save = async () => {
    if (status !== inc.status && status === "RESOLVED" && resolution.trim().length < 3) {
      setErr("A resolution note of at least 3 characters is required to resolve an incident.");
      return;
    }
    const body: { status?: string; actionsTaken?: string; resolution?: string } = {};
    if (status !== inc.status) body.status = status;
    if (actionsTaken !== (inc.actionsTaken ?? "")) body.actionsTaken = actionsTaken;
    if (resolution !== (inc.resolution ?? "")) body.resolution = resolution;
    setErr(null);
    setBusy(true);
    try {
      await put(`/api/security/incidents/${inc.id}`, body);
      toast.push(`Incident ${inc.code} updated`, "success");
      onSaved();
    } catch (e) {
      const message = e instanceof ApiError ? e.message : "Update failed";
      setErr(message);
      toast.push(message, "error");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="grid cols-2">
      <div className="col">
        <div>
          <div className="label">Description</div>
          <div className="small" style={{ marginTop: 4 }}>
            {inc.description}
          </div>
        </div>
        <div className="row gap-sm wrap small">
          <span className="dim">Location:</span>
          <span>{inc.location ?? inc.gate?.name ?? "—"}</span>
        </div>
        <div className="row gap-sm wrap small">
          <span className="dim">Reported by:</span>
          <span>{inc.reportedBy?.name ?? "—"}</span>
          <span className="dim">· {fmtDate(inc.createdAt)}</span>
        </div>
        <div className="row gap-sm wrap small">
          <span className="dim">Updated:</span>
          <span>{fmtDate(inc.updatedAt)}</span>
          {inc.closedAt && (
            <>
              <span className="dim">· closed by {inc.closedBy?.name ?? "—"}</span>
              <span className="dim">{fmtDate(inc.closedAt)}</span>
            </>
          )}
        </div>
        {inc.alerts.length > 0 && (
          <div className="row gap-sm wrap">
            <span className="label">Linked alerts</span>
            {inc.alerts.map((a) => (
              <Link key={a.id} className="mono small" to={alertsPath}>
                {a.code} <Badge tone={priorityColor(a.priority)}>{a.status}</Badge>
              </Link>
            ))}
          </div>
        )}
        {detectedCameras.length > 0 && (
          <div className="row gap-sm wrap" style={{ alignItems: "center" }}>
            <span className="label">Detecting cameras</span>
            {detectedCameras.map((cam) =>
              canViewCameras ? (
                <button
                  key={cam.id}
                  className="btn sm"
                  onClick={() => onViewCamera({ id: cam.id, name: cam.name, area: cam.area })}
                >
                  {cam.name}
                </button>
              ) : (
                <span key={cam.id} className="small dim">
                  {cam.name}
                </span>
              ),
            )}
          </div>
        )}
      </div>

      <div className="col">
        {canWrite ? (
          <>
            <Field label="Status">
              <select className="select" value={status} onChange={(e) => setStatus(e.target.value)}>
                {statusOptions.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Actions taken">
              <textarea
                className="textarea"
                rows={3}
                value={actionsTaken}
                onChange={(e) => setActionsTaken(e.target.value)}
                placeholder="What has been done so far?"
              />
            </Field>
            <Field label="Resolution" hint="Required when moving the incident to RESOLVED.">
              <textarea
                className="textarea"
                rows={3}
                value={resolution}
                onChange={(e) => setResolution(e.target.value)}
                placeholder="How was the incident resolved?"
              />
            </Field>
            {err && <div className="error-text">{err}</div>}
            <div className="row gap-sm">
              <button className="btn primary sm" disabled={!dirty || busy} onClick={() => void save()}>
                {busy ? "Saving…" : "Save changes"}
              </button>
              {status !== inc.status && <span className="small dim">status: {inc.status} → {status}</span>}
            </div>
          </>
        ) : (
          <div className="col">
            <div>
              <div className="label">Actions taken</div>
              <div className="small" style={{ marginTop: 4 }}>
                {inc.actionsTaken || "—"}
              </div>
            </div>
            <div>
              <div className="label">Resolution</div>
              <div className="small" style={{ marginTop: 4 }}>
                {inc.resolution || "—"}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default function IncidentsPage() {
  const { user, has: can } = useAuth();
  const toast = useToast();
  const { subscribe } = useWs();

  const [status, setStatus] = useState("");
  const [page, setPage] = useState(1);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [snapCamera, setSnapCamera] = useState<CameraRef | null>(null);
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});
  const [form, setForm] = useState({
    type: "",
    priority: "HIGH",
    title: "",
    location: "",
    description: "",
  });

  const list = useAsync<Page<IncidentRow>>(
    () => get(`/api/security/incidents?page=${page}&limit=${LIMIT}${status ? `&status=${status}` : ""}`),
    [page, status],
  );

  const reloadRef = useRef(list.reload);
  useEffect(() => {
    reloadRef.current = list.reload;
  }, [list.reload]);

  useEffect(
    () =>
      subscribe((msg) => {
        if (msg.type === "incident") reloadRef.current();
      }),
    [subscribe],
  );

  const canWrite = can(["incidents:write", "incidents:close"]);
  const canClose = can("incidents:close");
  const canViewCameras = can("cameras:read");
  const alertsPath = user?.role === "SECURITY" ? "/security/alerts" : "/guard/alerts";

  const resetForm = () => {
    setForm({ type: "", priority: "HIGH", title: "", location: "", description: "" });
    setFormErrors({});
  };

  const validate = () => {
    const errs: Record<string, string> = {};
    if (form.type.trim().length < 2) errs.type = "Select an incident type";
    if (!PRIORITIES.includes(form.priority)) errs.priority = "Select a severity";
    if (form.title.trim().length < 3) errs.title = "Title must be at least 3 characters";
    if (form.description.trim().length < 3) errs.description = "Description must be at least 3 characters";
    return errs;
  };

  const create = async () => {
    const errs = validate();
    setFormErrors(errs);
    if (Object.keys(errs).length > 0) return;
    setCreating(true);
    try {
      const created = await post<{ code?: string }>("/api/security/incidents", {
        type: form.type.trim(),
        priority: form.priority,
        title: form.title.trim(),
        description: form.description.trim(),
        ...(form.location.trim() ? { location: form.location.trim() } : {}),
      });
      toast.push(`Incident ${created.code ?? ""} reported`, "success");
      setCreateOpen(false);
      resetForm();
      reloadRef.current();
    } catch (err) {
      toast.push(err instanceof ApiError ? err.message : "Failed to create incident", "error");
    } finally {
      setCreating(false);
    }
  };

  const rows = list.data?.items ?? [];

  return (
    <>
      <PageHeader
        title="Security incidents"
        subtitle="Reported incidents, investigations and resolutions"
        actions={
          <button
            className="btn primary"
            disabled={!canWrite}
            title={canWrite ? undefined : "Missing incidents:write permission"}
            onClick={() => {
              resetForm();
              setCreateOpen(true);
            }}
          >
            ＋ Report incident
          </button>
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
        <LoadingRow label="Loading incidents…" />
      ) : list.error && !list.data ? (
        <ErrorView error={list.error} onRetry={list.reload} />
      ) : rows.length === 0 ? (
        <Empty title="No incidents found" hint="Nothing matches the current filters." />
      ) : (
        <>
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Incident</th>
                  <th>Detail</th>
                  <th>Severity</th>
                  <th>Status</th>
                  <th>Reporter</th>
                  <th>Created</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {rows.map((inc) => (
                  <Fragment key={inc.id}>
                    <tr>
                      <td>
                        <span className="mono small">{inc.code}</span>
                        <div className="small dim">{inc.type}</div>
                      </td>
                      <td style={{ maxWidth: 320 }}>
                        <strong>{inc.title}</strong>
                        <div
                          className="small dim"
                          title={inc.description}
                          style={{
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                            whiteSpace: "nowrap",
                          }}
                        >
                          {inc.location ?? inc.description}
                        </div>
                      </td>
                      <td>
                        <Badge tone={priorityColor(inc.priority)}>{inc.priority}</Badge>
                      </td>
                      <td>
                        <Badge tone={statusColor(inc.status)}>{inc.status}</Badge>
                      </td>
                      <td className="small">{inc.reportedBy?.name ?? "—"}</td>
                      <td title={fmtDate(inc.createdAt)}>
                        <div>{relative(inc.createdAt)}</div>
                        <div className="small dim">{inc.alerts.length} linked alerts</div>
                      </td>
                      <td>
                        <div className="row gap-sm" style={{ justifyContent: "flex-end" }}>
                          <button
                            className="btn sm ghost"
                            onClick={() => setExpandedId((id) => (id === inc.id ? null : inc.id))}
                          >
                            {expandedId === inc.id ? "Hide" : "Details"}
                          </button>
                        </div>
                      </td>
                    </tr>
                    {expandedId === inc.id && (
                      <tr key={`${inc.id}-detail`}>
                        <td colSpan={7} style={{ background: "rgba(0,0,0,.22)" }}>
                          <IncidentDetail
                            inc={inc}
                            canWrite={canWrite}
                            canClose={canClose}
                            canViewCameras={canViewCameras}
                            alertsPath={alertsPath}
                            onSaved={reloadRef.current}
                            onViewCamera={setSnapCamera}
                          />
                        </td>
                      </tr>
                    )}
                  </Fragment>
                ))}
              </tbody>
            </table>
          </div>
          {list.data && <Pagination page={list.data.page} total={list.data.total} limit={LIMIT} onChange={setPage} />}
        </>
      )}

      <Modal
        open={createOpen}
        title="Report incident"
        onClose={() => {
          if (!creating) {
            setCreateOpen(false);
            resetForm();
          }
        }}
        footer={
          <>
            <button className="btn" disabled={creating} onClick={() => setCreateOpen(false)}>
              Cancel
            </button>
            <button className="btn primary" disabled={creating} onClick={() => void create()}>
              {creating ? "Submitting…" : "Create incident"}
            </button>
          </>
        }
      >
        <Field label="Type">
          <>
            <select
              className="select"
              value={form.type}
              onChange={(e) => setForm((f) => ({ ...f, type: e.target.value }))}
            >
              <option value="">Select type…</option>
              {INCIDENT_TYPES.map((t) => (
                <option key={t} value={t}>
                  {t.replace(/_/g, " ")}
                </option>
              ))}
            </select>
            {formErrors.type && <div className="error-text">{formErrors.type}</div>}
          </>
        </Field>
        <Field label="Severity">
          <>
            <select
              className="select"
              value={form.priority}
              onChange={(e) => setForm((f) => ({ ...f, priority: e.target.value }))}
            >
              {PRIORITIES.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>
            {formErrors.priority && <div className="error-text">{formErrors.priority}</div>}
          </>
        </Field>
        <Field label="Title">
          <>
            <input
              className="input"
              value={form.title}
              maxLength={160}
              onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
              placeholder="Short summary of the incident"
            />
            {formErrors.title && <div className="error-text">{formErrors.title}</div>}
          </>
        </Field>
        <Field label="Location" hint="Optional — gate, flat or area.">
          <input
            className="input"
            value={form.location}
            maxLength={200}
            onChange={(e) => setForm((f) => ({ ...f, location: e.target.value }))}
            placeholder="e.g. Main Gate, Block B lobby"
          />
        </Field>
        <Field label="Description">
          <>
            <textarea
              className="textarea"
              rows={4}
              value={form.description}
              maxLength={2000}
              onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
              placeholder="What happened? Include people, vehicles and times."
            />
            {formErrors.description && <div className="error-text">{formErrors.description}</div>}
          </>
        </Field>
      </Modal>

      <CameraSnapshotModal camera={snapCamera} onClose={() => setSnapCamera(null)} />
    </>
  );
}
