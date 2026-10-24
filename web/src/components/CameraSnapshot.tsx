import { useEffect, useState } from "react";
import { Badge, Modal } from "./ui";
import { ApiError, get, getBlob } from "../lib/api";
import { relative, statusColor } from "../lib/format";

export interface CameraRef {
  id: string;
  name?: string | null;
  area?: string | null;
  location?: string | null;
  endpoint?: string | null;
  protocol?: string | null;
}

interface CameraStatus {
  status: string;
  stale: boolean;
  lastHeartbeatAt: string | null;
}

export function CameraSnapshotModal({ camera, onClose }: { camera: CameraRef | null; onClose: () => void }) {
  const camId = camera?.id ?? null;
  const [url, setUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<CameraStatus | null>(null);
  const [nonce, setNonce] = useState(0);

  useEffect(() => {
    if (!camId) {
      setUrl(null);
      setError(null);
      setLoading(false);
      return;
    }
    let cancelled = false;
    let objectUrl: string | null = null;
    setLoading(true);
    setError(null);
    setUrl(null);
    (async () => {
      try {
        const blob = await getBlob(`/api/cameras/${camId}/snapshot`);
        if (cancelled) return;
        objectUrl = URL.createObjectURL(blob);
        setUrl(objectUrl);
      } catch (e) {
        if (!cancelled) setError(e instanceof ApiError ? e.message : "Could not load snapshot");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [camId, nonce]);

  useEffect(() => {
    if (!camId) {
      setStatus(null);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const s = await get<CameraStatus>(`/api/cameras/${camId}/status`);
        if (!cancelled) setStatus(s);
      } catch {
        /* status is best-effort */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [camId]);

  const meta = [camera?.area, camera?.location].filter(Boolean).join(" · ");

  return (
    <Modal
      open={camera !== null}
      title={camera ? `Camera · ${camera.name ?? camera.id}` : "Camera"}
      onClose={onClose}
      footer={
        <>
          <button className="btn ghost" onClick={onClose}>
            Close
          </button>
          <button className="btn" disabled={loading || !camId} onClick={() => setNonce((n) => n + 1)}>
            {loading ? "Loading…" : "Refresh"}
          </button>
        </>
      }
    >
      <div className="col" style={{ gap: 10 }}>
        <div className="row gap-sm wrap small" style={{ alignItems: "center" }}>
          {status && <Badge tone={statusColor(status.status)}>{status.status}</Badge>}
          {status && (
            <span className="dim">heartbeat {status.lastHeartbeatAt ? relative(status.lastHeartbeatAt) : "never"}</span>
          )}
          {camera?.protocol && <span className="dim">{camera.protocol}</span>}
          {meta && <span className="dim">{meta}</span>}
        </div>
        <div
          style={{
            position: "relative",
            minHeight: 240,
            borderRadius: 10,
            overflow: "hidden",
            background: "rgba(0,0,0,.35)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          {loading ? (
            <span className="dim small">Capturing frame…</span>
          ) : error ? (
            <div className="col" style={{ gap: 6, padding: 16, textAlign: "center" }}>
              <span style={{ color: "#fca5a5", fontWeight: 600 }}>Snapshot unavailable</span>
              <span className="small dim">{error}</span>
            </div>
          ) : url ? (
            <img
              src={url}
              alt={camera?.name ?? "camera snapshot"}
              style={{ maxWidth: "100%", maxHeight: "60vh", display: "block" }}
            />
          ) : (
            <span className="dim small">No frame</span>
          )}
        </div>
        {camera?.endpoint && (
          <div className="small dim mono" style={{ wordBreak: "break-all" }} title={camera.endpoint}>
            {camera.endpoint}
          </div>
        )}
      </div>
    </Modal>
  );
}
