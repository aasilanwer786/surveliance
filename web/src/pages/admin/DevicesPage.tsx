import { useState, type FormEvent } from "react";
import {
  Badge,
  Empty,
  ErrorView,
  Field,
  LoadingRow,
  Modal,
  PageHeader,
  useAsync,
  useToast,
} from "../../components/ui";
import { del, get, post, put, type Page } from "../../lib/api";
import { useAuth } from "../../lib/auth";
import { relative, statusColor } from "../../lib/format";
import { CameraSnapshotModal, type CameraRef } from "../../components/CameraSnapshot";

interface GateRow {
  id: string;
  name: string;
  code: string;
  type: string;
  location?: string | null;
  buildingId?: string | null;
  status: string;
  _count?: { entries: number; cameras: number };
}

interface CameraRow {
  id: string;
  name: string;
  location?: string | null;
  protocol: string;
  endpoint: string;
  username?: string | null;
  status: string;
  area?: string | null;
  gateId?: string | null;
  integrationType: string;
  lastHeartbeatAt?: string | null;
  gate?: { id: string; name: string } | null;
  credentialsConfigured?: boolean;
}

interface BuildingOption {
  id: string;
  name: string;
}

interface GateDraft {
  id?: string;
  name: string;
  code: string;
  type: string;
  location: string;
  buildingId: string;
  status: string;
}

interface CameraDraft {
  id?: string;
  name: string;
  location: string;
  protocol: string;
  endpoint: string;
  username: string;
  password: string;
  gateId: string;
  area: string;
  integrationType: string;
  status: string;
}

interface ConfirmDraft {
  kind: "gate" | "camera";
  id: string;
  label: string;
}

const GATE_TYPES = ["MAIN", "SECONDARY", "SERVICE", "PARKING", "PEDESTRIAN"];
const PROTOCOLS = ["RTSP", "ONVIF", "HTTP", "VENDOR_API"];
const CAMERA_STATUSES = ["ONLINE", "OFFLINE", "ERROR", "UNKNOWN"];

function errText(err: unknown): string {
  return err instanceof Error ? err.message : "Request failed";
}

function cameraTone(status: string): string {
  switch (status) {
    case "ONLINE":
      return "green";
    case "ERROR":
      return "red";
    case "OFFLINE":
      return "gray";
    default:
      return "blue";
  }
}

const emptyGate: GateDraft = { name: "", code: "", type: "MAIN", location: "", buildingId: "", status: "ACTIVE" };
const emptyCamera: CameraDraft = {
  name: "",
  location: "",
  protocol: "RTSP",
  endpoint: "",
  username: "",
  password: "",
  gateId: "",
  area: "",
  integrationType: "GENERIC",
  status: "UNKNOWN",
};

export default function DevicesPage() {
  const { has } = useAuth();
  const toast = useToast();
  const canWriteGates = has("gates:write");
  const canWriteCameras = has("cameras:write");

  const [tab, setTab] = useState<"gates" | "cameras">("gates");

  const {
    data: gatesData,
    error: gatesError,
    loading: gatesLoading,
    reload: reloadGates,
  } = useAsync<{ items: GateRow[]; total: number }>(() => get("/api/gates"), []);

  const {
    data: camerasData,
    error: camerasError,
    loading: camerasLoading,
    reload: reloadCameras,
  } = useAsync<Page<CameraRow>>(() => get("/api/cameras?page=1&limit=50"), [tab]);

  const { data: buildingsData } = useAsync<Page<BuildingOption>>(
    () => get("/api/buildings?page=1&limit=200"),
    [],
  );

  const gates = gatesData?.items ?? [];
  const cameras = camerasData?.items ?? [];
  const buildings = buildingsData?.items ?? [];

  const [gateDraft, setGateDraft] = useState<GateDraft | null>(null);
  const [cameraDraft, setCameraDraft] = useState<CameraDraft | null>(null);
  const [confirmDraft, setConfirmDraft] = useState<ConfirmDraft | null>(null);
  const [snapCamera, setSnapCamera] = useState<CameraRef | null>(null);
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const saveGate = async (e: FormEvent) => {
    e.preventDefault();
    if (!gateDraft) return;
    setFormError(null);
    if (gateDraft.name.trim().length < 2) {
      setFormError("Name must be at least 2 characters");
      return;
    }
    setBusy(true);
    try {
      const body = {
        name: gateDraft.name.trim(),
        code: gateDraft.code.trim(),
        type: gateDraft.type,
        location: gateDraft.location.trim(),
        status: gateDraft.status,
        ...(gateDraft.buildingId ? { buildingId: gateDraft.buildingId } : {}),
      };
      if (gateDraft.id) {
        await put(`/api/gates/${gateDraft.id}`, body);
        toast.push("Gate updated", "success");
      } else {
        await post("/api/gates", body);
        toast.push("Gate created", "success");
      }
      setGateDraft(null);
      reloadGates();
    } catch (err) {
      setFormError(errText(err));
      toast.push(errText(err), "error");
    } finally {
      setBusy(false);
    }
  };

  const saveCamera = async (e: FormEvent) => {
    e.preventDefault();
    if (!cameraDraft) return;
    setFormError(null);
    if (cameraDraft.endpoint.trim().length < 4) {
      setFormError("Stream endpoint must be at least 4 characters");
      return;
    }
    setBusy(true);
    try {
      const body: Record<string, unknown> = {
        name: cameraDraft.name.trim(),
        location: cameraDraft.location.trim(),
        protocol: cameraDraft.protocol,
        endpoint: cameraDraft.endpoint.trim(),
        username: cameraDraft.username.trim(),
        area: cameraDraft.area.trim(),
        integrationType: cameraDraft.integrationType.trim() || "GENERIC",
        status: cameraDraft.status,
        ...(cameraDraft.gateId ? { gateId: cameraDraft.gateId } : {}),
        ...(cameraDraft.password ? { password: cameraDraft.password } : {}),
      };
      if (cameraDraft.id) {
        await put(`/api/cameras/${cameraDraft.id}`, body);
        toast.push("Camera updated", "success");
      } else {
        await post("/api/cameras", body);
        toast.push("Camera registered", "success");
      }
      setCameraDraft(null);
      reloadCameras();
    } catch (err) {
      setFormError(errText(err));
      toast.push(errText(err), "error");
    } finally {
      setBusy(false);
    }
  };

  const runDelete = async () => {
    if (!confirmDraft) return;
    setBusy(true);
    try {
      if (confirmDraft.kind === "gate") {
        await del(`/api/gates/${confirmDraft.id}`);
        reloadGates();
      } else {
        await del(`/api/cameras/${confirmDraft.id}`);
        reloadCameras();
      }
      toast.push(`${confirmDraft.label} removed`, "success");
      setConfirmDraft(null);
    } catch (err) {
      toast.push(errText(err), "error");
      setConfirmDraft(null);
    } finally {
      setBusy(false);
    }
  };

  const checkCamera = async (cam: CameraRow) => {
    try {
      const res = await get<{ id: string; status: string; lastHeartbeatAt: string | null; stale: boolean }>(
        `/api/cameras/${cam.id}/status`,
      );
      const staleNote = res.stale ? " · heartbeat stale" : "";
      const tone = res.status === "ONLINE" && !res.stale ? "success" : "warn";
      toast.push(`${cam.name}: ${res.status}${staleNote}`, tone);
      reloadCameras();
    } catch (err) {
      toast.push(errText(err), "error");
    }
  };

  const buildingName = (id?: string | null): string =>
    (id && buildings.find((b) => b.id === id)?.name) || "";

  return (
    <>
      <PageHeader
        title="Devices"
        subtitle="Gates, cameras and their health across the property"
        actions={
          tab === "gates" && canWriteGates ? (
            <button
              className="btn primary"
              onClick={() => {
                setGateDraft({ ...emptyGate });
                setFormError(null);
              }}
            >
              ＋ Add gate
            </button>
          ) : tab === "cameras" && canWriteCameras ? (
            <button
              className="btn primary"
              onClick={() => {
                setCameraDraft({ ...emptyCamera });
                setFormError(null);
              }}
            >
              ＋ Add camera
            </button>
          ) : undefined
        }
      />

      <div className="pill-tabs">
        <button className={`pill-tab ${tab === "gates" ? "active" : ""}`} onClick={() => setTab("gates")}>
          Gates {gatesData ? `(${gatesData.total})` : ""}
        </button>
        <button className={`pill-tab ${tab === "cameras" ? "active" : ""}`} onClick={() => setTab("cameras")}>
          Cameras {camerasData ? `(${camerasData.total})` : ""}
        </button>
      </div>

      {tab === "gates" ? (
        gatesLoading ? (
          <LoadingRow label="Loading gates…" />
        ) : gatesError ? (
          <ErrorView error={gatesError} onRetry={reloadGates} />
        ) : gates.length === 0 ? (
          <Empty title="No gates registered" hint="Add the first entrance gate to start tracking traffic." />
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Gate</th>
                  <th>Type</th>
                  <th>Location</th>
                  <th>Building</th>
                  <th>Traffic</th>
                  <th>Status</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {gates.map((g) => (
                  <tr key={g.id}>
                    <td>
                      <strong>{g.name}</strong>
                      <div className="small dim mono">{g.code}</div>
                    </td>
                    <td>
                      <Badge tone="blue">{g.type}</Badge>
                    </td>
                    <td>{g.location || <span className="dim">—</span>}</td>
                    <td>{buildingName(g.buildingId) || <span className="dim">—</span>}</td>
                    <td className="small">
                      {g._count?.entries ?? 0} entries
                      <div className="dim">{g._count?.cameras ?? 0} cameras</div>
                    </td>
                    <td>
                      <Badge tone={statusColor(g.status)}>{g.status}</Badge>
                    </td>
                    <td>
                      <div className="row gap-sm" style={{ justifyContent: "flex-end" }}>
                        {canWriteGates && (
                          <button
                            className="btn sm"
                            onClick={() => {
                              setGateDraft({
                                id: g.id,
                                name: g.name,
                                code: g.code,
                                type: g.type,
                                location: g.location ?? "",
                                buildingId: g.buildingId ?? "",
                                status: g.status,
                              });
                              setFormError(null);
                            }}
                          >
                            Edit
                          </button>
                        )}
                        {canWriteGates && (
                          <button
                            className="btn sm danger"
                            onClick={() => setConfirmDraft({ kind: "gate", id: g.id, label: `gate ${g.name}` })}
                          >
                            Delete
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )
      ) : camerasLoading ? (
        <LoadingRow label="Loading cameras…" />
      ) : camerasError ? (
        <ErrorView error={camerasError} onRetry={reloadCameras} />
      ) : cameras.length === 0 ? (
        <Empty title="No cameras registered" hint="Register a camera with its stream endpoint to monitor entrances." />
      ) : (
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Camera</th>
                <th>Stream</th>
                <th>Gate</th>
                <th>Status</th>
                <th>Heartbeat</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {cameras.map((c) => (
                <tr key={c.id}>
                  <td>
                    <strong>{c.name}</strong>
                    <div className="small dim">
                      {c.area || c.location || c.protocol}
                      {c.credentialsConfigured ? " · credentials set" : ""}
                    </div>
                  </td>
                  <td>
                    <div
                      className="small mono"
                      style={{ maxWidth: 240, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}
                      title={c.endpoint}
                    >
                      {c.endpoint}
                    </div>
                    <div className="small dim">
                      {c.protocol} · {c.integrationType}
                    </div>
                  </td>
                  <td>{c.gate?.name || <span className="dim">—</span>}</td>
                  <td>
                    <Badge tone={cameraTone(c.status)}>{c.status}</Badge>
                  </td>
                  <td className="small dim">{c.lastHeartbeatAt ? relative(c.lastHeartbeatAt) : "never"}</td>
                  <td>
                    <div className="row gap-sm" style={{ justifyContent: "flex-end" }}>
                      <button
                        className="btn sm"
                        title="Capture a still frame"
                        onClick={() =>
                          setSnapCamera({
                            id: c.id,
                            name: c.name,
                            area: c.area,
                            location: c.location,
                            endpoint: c.endpoint,
                            protocol: c.protocol,
                          })
                        }
                      >
                        View
                      </button>
                      <button className="btn sm" onClick={() => void checkCamera(c)}>
                        Check
                      </button>
                      {canWriteCameras && (
                        <button
                          className="btn sm"
                          onClick={() => {
                            setCameraDraft({
                              id: c.id,
                              name: c.name,
                              location: c.location ?? "",
                              protocol: c.protocol,
                              endpoint: c.endpoint,
                              username: c.username ?? "",
                              password: "",
                              gateId: c.gateId ?? "",
                              area: c.area ?? "",
                              integrationType: c.integrationType,
                              status: c.status,
                            });
                            setFormError(null);
                          }}
                        >
                          Edit
                        </button>
                      )}
                      {canWriteCameras && (
                        <button
                          className="btn sm danger"
                          onClick={() => setConfirmDraft({ kind: "camera", id: c.id, label: `camera ${c.name}` })}
                        >
                          Delete
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Modal
        open={gateDraft !== null}
        title={gateDraft?.id ? "Edit gate" : "New gate"}
        onClose={() => setGateDraft(null)}
        footer={
          <>
            <button className="btn ghost" onClick={() => setGateDraft(null)} disabled={busy}>
              Cancel
            </button>
            <button className="btn primary" form="gate-form" type="submit" disabled={busy}>
              {busy ? "Saving…" : gateDraft?.id ? "Save changes" : "Create gate"}
            </button>
          </>
        }
      >
        <form id="gate-form" onSubmit={saveGate}>
          <div className="grid cols-2">
            <Field label="Name *">
              <input
                className="input"
                value={gateDraft?.name ?? ""}
                onChange={(e) => setGateDraft((d) => (d ? { ...d, name: e.target.value } : d))}
                required
                minLength={2}
                maxLength={80}
              />
            </Field>
            <Field label="Code *" hint="Unique, stored uppercase.">
              <input
                className="input mono"
                value={gateDraft?.code ?? ""}
                onChange={(e) => setGateDraft((d) => (d ? { ...d, code: e.target.value } : d))}
                required
                maxLength={40}
              />
            </Field>
            <Field label="Type">
              <select
                className="select"
                value={gateDraft?.type ?? "MAIN"}
                onChange={(e) => setGateDraft((d) => (d ? { ...d, type: e.target.value } : d))}
              >
                {GATE_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Status">
              <select
                className="select"
                value={gateDraft?.status ?? "ACTIVE"}
                onChange={(e) => setGateDraft((d) => (d ? { ...d, status: e.target.value } : d))}
              >
                <option value="ACTIVE">ACTIVE</option>
                <option value="INACTIVE">INACTIVE</option>
              </select>
            </Field>
            <Field label="Building">
              <select
                className="select"
                value={gateDraft?.buildingId ?? ""}
                onChange={(e) => setGateDraft((d) => (d ? { ...d, buildingId: e.target.value } : d))}
              >
                <option value="">Not linked</option>
                {buildings.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Location">
              <input
                className="input"
                value={gateDraft?.location ?? ""}
                onChange={(e) => setGateDraft((d) => (d ? { ...d, location: e.target.value } : d))}
                placeholder="North entrance"
                maxLength={200}
              />
            </Field>
          </div>
          {formError && <div className="error-text mb">{formError}</div>}
        </form>
      </Modal>

      <Modal
        open={cameraDraft !== null}
        title={cameraDraft?.id ? "Edit camera" : "New camera"}
        onClose={() => setCameraDraft(null)}
        footer={
          <>
            <button className="btn ghost" onClick={() => setCameraDraft(null)} disabled={busy}>
              Cancel
            </button>
            <button className="btn primary" form="camera-form" type="submit" disabled={busy}>
              {busy ? "Saving…" : cameraDraft?.id ? "Save changes" : "Register camera"}
            </button>
          </>
        }
      >
        <form id="camera-form" onSubmit={saveCamera}>
          <div className="grid cols-2">
            <Field label="Name *">
              <input
                className="input"
                value={cameraDraft?.name ?? ""}
                onChange={(e) => setCameraDraft((d) => (d ? { ...d, name: e.target.value } : d))}
                required
                minLength={2}
                maxLength={120}
              />
            </Field>
            <Field label="Protocol">
              <select
                className="select"
                value={cameraDraft?.protocol ?? "RTSP"}
                onChange={(e) => setCameraDraft((d) => (d ? { ...d, protocol: e.target.value } : d))}
              >
                {PROTOCOLS.map((p) => (
                  <option key={p} value={p}>
                    {p}
                  </option>
                ))}
              </select>
            </Field>
          </div>
          <Field label="Stream endpoint *" hint="RTSP/HTTP URL or vendor API path.">
            <input
              className="input mono"
              value={cameraDraft?.endpoint ?? ""}
              onChange={(e) => setCameraDraft((d) => (d ? { ...d, endpoint: e.target.value } : d))}
              required
              minLength={4}
              maxLength={300}
              placeholder="rtsp://192.168.10.21:554/stream1"
            />
          </Field>
          <div className="grid cols-2">
            <Field label="Area">
              <input
                className="input"
                value={cameraDraft?.area ?? ""}
                onChange={(e) => setCameraDraft((d) => (d ? { ...d, area: e.target.value } : d))}
                placeholder="Main Gate"
                maxLength={120}
              />
            </Field>
            <Field label="Location detail">
              <input
                className="input"
                value={cameraDraft?.location ?? ""}
                onChange={(e) => setCameraDraft((d) => (d ? { ...d, location: e.target.value } : d))}
                placeholder="Above barrier"
                maxLength={200}
              />
            </Field>
            <Field label="Linked gate">
              <select
                className="select"
                value={cameraDraft?.gateId ?? ""}
                onChange={(e) => setCameraDraft((d) => (d ? { ...d, gateId: e.target.value } : d))}
              >
                <option value="">Not linked</option>
                {gates.map((g) => (
                  <option key={g.id} value={g.id}>
                    {g.name}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Status">
              <select
                className="select"
                value={cameraDraft?.status ?? "UNKNOWN"}
                onChange={(e) => setCameraDraft((d) => (d ? { ...d, status: e.target.value } : d))}
              >
                {CAMERA_STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Username">
              <input
                className="input"
                value={cameraDraft?.username ?? ""}
                onChange={(e) => setCameraDraft((d) => (d ? { ...d, username: e.target.value } : d))}
                maxLength={80}
                autoComplete="off"
              />
            </Field>
            <Field
              label={cameraDraft?.id ? "Password (blank keeps current)" : "Password"}
              hint="Encrypted at rest; never returned by the API."
            >
              <input
                className="input"
                type="password"
                value={cameraDraft?.password ?? ""}
                onChange={(e) => setCameraDraft((d) => (d ? { ...d, password: e.target.value } : d))}
                maxLength={200}
                autoComplete="new-password"
              />
            </Field>
            <Field label="Integration type">
              <input
                className="input mono"
                value={cameraDraft?.integrationType ?? ""}
                onChange={(e) => setCameraDraft((d) => (d ? { ...d, integrationType: e.target.value } : d))}
                placeholder="GENERIC"
                maxLength={40}
              />
            </Field>
          </div>
          {formError && <div className="error-text mb">{formError}</div>}
        </form>
      </Modal>

      <Modal
        open={confirmDraft !== null}
        title="Confirm removal"
        onClose={() => setConfirmDraft(null)}
        footer={
          <>
            <button className="btn ghost" onClick={() => setConfirmDraft(null)} disabled={busy}>
              Cancel
            </button>
            <button className="btn danger" onClick={() => void runDelete()} disabled={busy}>
              {busy ? "Removing…" : "Delete"}
            </button>
          </>
        }
      >
        <p className="muted">
          Remove <strong>{confirmDraft?.label}</strong>? It will no longer be listed or monitored.
        </p>
      </Modal>

      <CameraSnapshotModal camera={snapCamera} onClose={() => setSnapCamera(null)} />
    </>
  );
}
