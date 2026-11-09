import { useCallback, useEffect, useRef, useState } from "react";
import { Html5Qrcode } from "html5-qrcode";
import { useAuth } from "../../lib/auth";
import { useWs } from "../../lib/ws";
import { useToast, Badge, LoadingRow, useAsync } from "../../components/ui";
import { get, post, ApiError } from "../../lib/api";
import { fmtTime, statusColor } from "../../lib/format";

interface VerifyOk {
  verified: true;
  banner: string;
  invitation: {
    id: string;
    code: string;
    visitorName: string;
    visitorPhone?: string | null;
    purpose?: string | null;
    vehicleNumber?: string | null;
    flatNumber: string;
    blockName: string;
    residentName: string;
    visitStatus: string;
    approvalPolicy: string;
    expectedExitAt: string;
    approvals: Array<{ type: string; status: string }>;
  };
  policy: string;
  requiredApprovals: string[];
  pendingApprovals: string[];
  entryAllowed: boolean;
  watchlisted: boolean;
}

interface VerifyFail {
  verified: false;
  banner: string;
  reason: string;
  message: string;
  alertId?: string;
}

type VerifyResult = VerifyOk | VerifyFail;

interface Gate {
  id: string;
  code: string;
  name: string;
}

let scannerChain: Promise<unknown> = Promise.resolve();

function enqueueScanner(task: () => Promise<void>): void {
  scannerChain = scannerChain.then(task, task).catch(() => undefined);
}

function describeCameraError(err: unknown): string {
  const name =
    typeof err === "object" && err !== null && "name" in err
      ? String((err as { name?: unknown }).name ?? "")
      : "";
  const message = err instanceof Error ? err.message : typeof err === "string" ? err : "";
  switch (name) {
    case "NotAllowedError":
    case "SecurityError":
    case "PermissionDeniedError":
      return "Camera permission was blocked. Allow camera access in the browser, or scan a saved QR image.";
    case "NotFoundError":
    case "DevicesNotFoundError":
    case "OverconstrainedError":
      return "No usable camera was found. Scan a saved QR image, or type the code.";
    case "NotReadableError":
    case "TrackStartError":
      return "The camera is busy in another app. Close it and retry, or scan a saved QR image.";
    default:
      return message
        ? `Camera unavailable: ${message}. Scan a saved QR image, or type the code.`
        : "Camera unavailable. Scan a saved QR image, or type the code.";
  }
}

function ScannerModal({
  open,
  onClose,
  onScan,
}: {
  open: boolean;
  onClose: () => void;
  onScan: (text: string) => void;
}) {
  const scannerRef = useRef<Html5Qrcode | null>(null);
  const readerId = useRef(`qr-reader-${Math.random().toString(36).slice(2)}`);
  const firedRef = useRef(false);
  const onScanRef = useRef(onScan);
  const [error, setError] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);
  const [statusText, setStatusText] = useState("Starting camera…");
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    onScanRef.current = onScan;
  }, [onScan]);

  useEffect(() => {
    if (!open) return;
    let disposed = false;
    const scannerId = readerId.current;
    setStarting(true);
    setStatusText("Starting camera…");
    setError(null);
    firedRef.current = false;
    const mount = document.getElementById(scannerId);
    if (mount) mount.innerHTML = "";

    let instance: Html5Qrcode | null = null;

    enqueueScanner(async () => {
      if (disposed) return;
      if (!window.isSecureContext) {
        setStarting(false);
        setError("Camera access needs HTTPS or localhost. Scan a saved QR image, or type the code.");
        return;
      }
      instance = new Html5Qrcode(scannerId, { verbose: false });
      scannerRef.current = instance;
      try {
        // Prefer the rear/environment camera, but fall back to whatever camera exists
        // (many laptops and desktops only expose a front-facing webcam).
        let camera: string | MediaTrackConstraints = { facingMode: "environment" };
        try {
          const cameras = await Html5Qrcode.getCameras();
          const rear = cameras.find((c) => /back|rear|environment/i.test(c.label));
          if (rear) camera = rear.id;
          else if (cameras.length > 0) camera = cameras[0].id;
        } catch {
          // Keep the facingMode fallback; start() surfaces the real error below.
        }
        await instance.start(
          camera,
          { fps: 10, qrbox: { width: 220, height: 220 }, aspectRatio: 1 },
          (text) => {
            if (disposed || firedRef.current) return;
            firedRef.current = true;
            onScanRef.current(text);
          },
          () => {
            // per-frame decode misses are expected
          },
        );
        if (disposed) {
          await instance.stop().catch(() => undefined);
          try { instance.clear(); } catch { /* ignore */ }
          instance = null;
          scannerRef.current = null;
        } else {
          setStarting(false);
        }
      } catch (err) {
        if (!disposed) {
          setStarting(false);
          setError(describeCameraError(err));
        }
        try { instance?.clear(); } catch { /* ignore */ }
        scannerRef.current = null;
      }
    });

    return () => {
      disposed = true;
      const inst = instance ?? scannerRef.current;
      scannerRef.current = null;
      if (inst) {
        enqueueScanner(async () => {
          await inst.stop().catch(() => undefined);
          try { inst.clear(); } catch { /* ignore */ }
        });
      }
    };
  }, [open, attempt]);

  const scanImageFile = async (file: File) => {
    if (!file.type.startsWith("image/")) {
      setError("Choose an image file (PNG, JPG or WebP) that contains the QR code.");
      return;
    }
    setError(null);
    setStarting(true);
    setStatusText("Reading QR image…");
    const holder = document.createElement("div");
    holder.id = `qr-file-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    holder.style.position = "fixed";
    holder.style.left = "-10000px";
    holder.style.top = "0";
    document.body.appendChild(holder);
    try {
      const tmp = new Html5Qrcode(holder.id, { verbose: false });
      try {
        const text = await tmp.scanFile(file, false);
        if (!text) throw new Error("No QR code was found in that image.");
        if (firedRef.current) return;
        firedRef.current = true;
        onScanRef.current(text);
      } finally {
        try { tmp.clear(); } catch { /* ignore */ }
      }
    } catch (err) {
      setError(
        err instanceof Error && err.message
          ? err.message
          : "Could not read a QR code from that image.",
      );
    } finally {
      holder.remove();
      setStarting(false);
    }
  };

  if (!open) return null;
  return (
    <div className="modal-overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal" style={{ maxWidth: 440 }}>
        <div className="card-title">
          <h2 style={{ margin: 0 }}>Scan visitor QR</h2>
          <button className="btn ghost sm" onClick={onClose}>
            ✕
          </button>
        </div>
        <div id={readerId.current} className="qr-reader" style={{ width: "100%", borderRadius: 10, overflow: "hidden" }} />
        {starting && (
          <div className="loading-row">
            <div className="spinner" />
            {statusText}
          </div>
        )}
        {error && <div className="error-text mt">{error}</div>}
        {error && (
          <button className="btn ghost sm mt" disabled={starting} onClick={() => setAttempt((n) => n + 1)}>
            Retry camera
          </button>
        )}
        <div className="hint mt">Point the camera at the visitor's QR pass. The code is read automatically.</div>
        <label className="label mt" htmlFor={`${readerId.current}-file`}>
          No camera? Scan a saved QR image
        </label>
        <input
          id={`${readerId.current}-file`}
          type="file"
          accept="image/*"
          className="input"
          style={{ padding: 10 }}
          onChange={(e) => {
            const file = e.target.files?.[0];
            e.target.value = "";
            if (file) void scanImageFile(file);
          }}
        />
      </div>
    </div>
  );
}

export default function VerifyPage() {
  const { user } = useAuth();
  const toast = useToast();
  const { subscribe, connected } = useWs();

  const [code, setCode] = useState("");
  const [gateId, setGateId] = useState("");
  const [result, setResult] = useState<VerifyResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [lastSource, setLastSource] = useState<"QR" | "CODE">("CODE");
  const [history, setHistory] = useState<Array<{ at: string; code: string; ok: boolean; label: string }>>([]);
  const inputRef = useRef<HTMLInputElement>(null);
  const resultRef = useRef<HTMLDivElement>(null);

  // The result card sits below the form; on short/mobile viewports the actions
  // ("Record entry" / "Verify next") are off-screen, so bring the card and its
  // action row into view. Use instant scrolling so it also works when the
  // browser has smooth scrolling disabled.
  useEffect(() => {
    if (!result) return;
    const card = resultRef.current;
    card?.scrollIntoView({ behavior: "auto", block: "start" });
    card?.querySelector<HTMLElement>("[data-verify-actions]")?.scrollIntoView({
      behavior: "auto",
      block: "nearest",
    });
  }, [result]);

  const gates = useAsync<{ items: Gate[] }>(() => get("/api/gates"), []);

  useEffect(() => {
    if (!gateId && gates.data?.items?.length) {
      const preferred = user?.guard?.gate?.id;
      const match = gates.data.items.find((g) => g.id === preferred) ?? gates.data.items[0];
      setGateId(match.id);
    }
  }, [gates.data, gateId, user?.guard?.gate?.id]);

  useEffect(() => {
    return subscribe((msg) => {
      if (msg.type === "approval-pending" && result?.verified) {
        // refresh pending state live while the visitor waits
        void verify(result.invitation.code, { silent: true });
      }
      if (msg.type === "lockdown") {
        toast.push(msg.data?.active ? "LOCKDOWN activated — entry suspended" : "Lockdown released", msg.data?.active ? "error" : "success");
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [subscribe, result]);

  const verify = useCallback(
    async (rawCode: string, opts?: { silent?: boolean; source?: "QR" | "CODE" }) => {
      const silent = opts?.silent ?? false;
      const source = opts?.source ?? "CODE";
      const cleaned = rawCode.trim();
      if (!cleaned) return;
      setBusy(true);
      try {
        const endpoint = source === "QR" ? "/api/visitors/verify-qr" : "/api/visitors/verify-code";
        const res = await post<VerifyResult>(endpoint, {
          code: cleaned,
          ...(gateId ? { gateId } : {}),
        });
        setResult(res);
        setLastSource(source);
        setCode("");
        setHistory((h) =>
          [
            {
              at: new Date().toISOString(),
              code: cleaned.replace(/^SVC:/i, ""),
              ok: res.verified,
              label: res.verified
                ? res.invitation.visitorName
                : res.reason,
            },
            ...h,
          ].slice(0, 12),
        );
        if (!silent) {
          if (res.verified) toast.push(`Verified: ${res.invitation.visitorName}`, "success");
          else toast.push(`${res.reason} — ${res.message}`, res.reason === "ALREADY_INSIDE" ? "warn" : "error");
        }
      } catch (err) {
        toast.push(err instanceof ApiError ? err.message : "Verification failed", "error");
      } finally {
        setBusy(false);
      }
    },
    [gateId, toast],
  );

  const onScan = useCallback(
    (text: string) => {
      setScanning(false);
      void verify(text, { source: "QR" });
    },
    [verify],
  );

  const recordEntry = async () => {
    if (!result?.verified) return;
    setBusy(true);
    try {
      await post(`/api/visitors/${result.invitation.id}/entry`, { gateId, source: lastSource });
      toast.push(`Entry recorded — ${result.invitation.visitorName} is inside`, "success");
      setResult({ ...result, invitation: { ...result.invitation, visitStatus: "INSIDE" }, entryAllowed: false });
    } catch (err) {
      toast.push(err instanceof ApiError ? err.message : "Entry failed", "error");
    } finally {
      setBusy(false);
    }
  };

  if (!gates.data) return <LoadingRow label="Loading gates…" />;

  return (
    <>
      <div className="row between wrap mb">
        <div>
          <h1>Gate verification</h1>
          <div className="muted">
            Fail secure — without valid authorization <strong>no entry</strong>.
            {connected ? " · live" : " · reconnecting…"}
          </div>
        </div>
        <div className="row gap-sm">
          <select className="select" style={{ width: "auto" }} value={gateId} onChange={(e) => setGateId(e.target.value)}>
            {gates.data.items.map((g) => (
              <option key={g.id} value={g.id}>
                {g.name} ({g.code})
              </option>
            ))}
          </select>
          <button className="btn" onClick={() => setScanning(true)}>
            📷 Scan QR
          </button>
        </div>
      </div>

      <div className="grid cols-2">
        <div className="col">
          <div className="card">
            <form
              onSubmit={(e) => {
                e.preventDefault();
                void verify(code);
              }}
            >
              <label className="label">Visitor code or QR payload</label>
              <div className="row gap-sm" style={{ marginTop: 6 }}>
                <input
                  ref={inputRef}
                  className="input mono"
                  style={{ fontSize: 20, letterSpacing: 2, padding: "14px 16px" }}
                  placeholder="VIS-2026-XXXXXX"
                  value={code}
                  onChange={(e) => setCode(e.target.value.toUpperCase())}
                  autoFocus
                  spellCheck={false}
                />
                <button className="btn primary lg" disabled={busy || !code.trim()} style={{ minWidth: 120 }}>
                  {busy ? "…" : "Verify"}
                </button>
              </div>
            </form>
            <div className="hint mt">
              Typing a full <span className="kbd">SVC:</span> prefix is fine — it is stripped automatically. Press{" "}
              <span className="kbd">Enter</span> to verify.
            </div>
          </div>

          {result && (
            <div ref={resultRef} style={{ scrollMarginTop: 90 }}>
              <VerifyResultCard result={result} busy={busy} onEntry={() => void recordEntry()} onReset={() => setResult(null)} />
            </div>
          )}
        </div>

        <div className="col">
          <div className="card">
            <div className="card-title">
              <h2 style={{ margin: 0 }}>This shift</h2>
              <span className="small dim">{history.length} checks</span>
            </div>
            {history.length === 0 ? (
              <div className="empty">No verification attempts yet</div>
            ) : (
              <div className="table-wrap">
                <table className="table">
                  <thead>
                    <tr>
                      <th>Time</th>
                      <th>Code</th>
                      <th>Outcome</th>
                    </tr>
                  </thead>
                  <tbody>
                    {history.map((h, i) => (
                      <tr key={`${h.at}-${i}`}>
                        <td>{fmtTime(h.at)}</td>
                        <td className="mono small">{h.code}</td>
                        <td>
                          <Badge tone={h.ok ? "green" : "red"}>{h.ok ? "VERIFIED" : h.label}</Badge>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
          <div className="card small muted">
            <strong>Reminder:</strong> never enter a code on a visitor’s behalf without seeing their ID. Watchlist matches
            automatically raise an alert and require security approval.
          </div>
        </div>
      </div>

      <ScannerModal open={scanning} onClose={() => setScanning(false)} onScan={onScan} />
    </>
  );
}

function VerifyResultCard({
  result,
  busy,
  onEntry,
  onReset,
}: {
  result: VerifyResult;
  busy: boolean;
  onEntry: () => void;
  onReset: () => void;
}) {
  if (!result.verified) {
    const tone = result.reason === "LOCKDOWN_ACTIVE" || result.reason === "ALREADY_INSIDE" ? "warn" : "fail";
    return (
      <div className={`verify-result ${tone}`}>
        <div style={{ fontSize: 30 }}>⛔</div>
        <div className="big">UNAUTHORIZED / UNVERIFIED</div>
        <div className="reason">{result.message}</div>
        <div className="small" style={{ opacity: 0.85, marginTop: 6 }}>
          Reason code: <span className="mono">{result.reason}</span>
          {result.alertId ? " · security alert raised" : ""}
        </div>
        <div className="row" data-verify-actions style={{ justifyContent: "center", marginTop: 14 }}>
          <button className="btn lg" onClick={onReset}>
            Verify next visitor
          </button>
        </div>
      </div>
    );
  }

  const inv = result.invitation;
  const inside = inv.visitStatus === "INSIDE";
  return (
    <div className={`verify-result ${result.entryAllowed ? "ok" : "warn"}`}>
      <div style={{ fontSize: 30 }}>{result.entryAllowed ? "✅" : "⏳"}</div>
      <div className="big">{result.entryAllowed ? "VISITOR VERIFIED" : "VERIFIED — APPROVAL REQUIRED"}</div>
      <div className="reason">{result.entryAllowed ? "Entry permitted through this gate" : "Entry blocked until approvals complete"}</div>

      <div className="card mt" style={{ textAlign: "left", background: "rgba(0,0,0,.25)" }}>
        <div className="col" style={{ gap: 6 }}>
          <div className="row between">
            <span className="muted small">Visitor</span>
            <strong>{inv.visitorName}</strong>
          </div>
          <div className="row between">
            <span className="muted small">Host</span>
            <span>
              {inv.residentName} · Flat {inv.flatNumber}, {inv.blockName}
            </span>
          </div>
          {inv.purpose && (
            <div className="row between">
              <span className="muted small">Purpose</span>
              <span>{inv.purpose}</span>
            </div>
          )}
          {inv.vehicleNumber && (
            <div className="row between">
              <span className="muted small">Vehicle</span>
              <span className="mono">{inv.vehicleNumber}</span>
            </div>
          )}
          <div className="row between">
            <span className="muted small">Code</span>
            <span className="mono">{inv.code}</span>
          </div>
          <div className="row between">
            <span className="muted small">Status</span>
            <Badge tone={statusColor(inv.visitStatus)}>{inv.visitStatus}</Badge>
          </div>
          <div className="row between">
            <span className="muted small">Approvals</span>
            <span className="row gap-sm wrap" style={{ justifyContent: "flex-end" }}>
              {result.requiredApprovals.length === 0 && <Badge tone="green">NOT REQUIRED</Badge>}
              {result.requiredApprovals.map((t) => {
                const row = inv.approvals.find((a) => a.type === t);
                const ok = row?.status === "APPROVED";
                return (
                  <Badge key={t} tone={ok ? "green" : row?.status === "REJECTED" ? "red" : "amber"}>
                    {t}: {row?.status ?? "PENDING"}
                  </Badge>
                );
              })}
            </span>
          </div>
          {result.watchlisted && (
            <div className="banner" style={{ background: "rgba(245,158,11,.15)", borderColor: "rgba(245,158,11,.6)", color: "#fde68a" }}>
              👁 Watchlist match — security approval required. Alert raised.
            </div>
          )}
        </div>
      </div>

      <div className="row" data-verify-actions style={{ justifyContent: "center", gap: 10, marginTop: 14 }}>
        {result.entryAllowed && !inside && (
          <button className="btn primary lg" disabled={busy} onClick={onEntry}>
            ⭘ Record entry
          </button>
        )}
        {inside && <span className="badge green" style={{ fontSize: 14 }}>ALREADY INSIDE</span>}
        <button className="btn lg" onClick={onReset}>
          Verify next
        </button>
      </div>
    </div>
  );
}
