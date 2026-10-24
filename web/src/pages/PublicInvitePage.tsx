import { useParams } from "react-router-dom";
import { useAsync, Badge, LoadingRow, ErrorView, Card } from "../components/ui";
import { get } from "../lib/api";
import { fmtDate, statusColor } from "../lib/format";

interface PublicInvite {
  visitorName: string;
  hostFirstName: string;
  flatNumber: string;
  block: string;
  building: string;
  purpose?: string | null;
  vehicleNumber?: string | null;
  expectedAt: string;
  arriveFrom: string;
  arriveUntil: string;
  durationMinutes: number;
  status: string;
  visitStatus: string;
  approvalPolicy: string;
  approvals: Array<{ type: string; status: string }>;
  lockdownActive: boolean;
  qrDataUrl: string;
  showQr: boolean;
}

export default function PublicInvitePage() {
  const { code = "" } = useParams();
  const { data, error, loading, reload } = useAsync<PublicInvite>(
    () => get(`/api/public/invitations/${encodeURIComponent(code)}`),
    [code],
  );

  if (loading) {
    return (
      <div className="public-page">
        <LoadingRow label="Loading invitation…" />
      </div>
    );
  }
  if (error) {
    return (
      <div className="public-page">
        <ErrorView error={error} onRetry={reload} />
        <div className="center small dim mt">
          Ask your host to check the invitation code, or show the code at the gate desk.
        </div>
      </div>
    );
  }
  if (!data) return null;

  const insideWindow = new Date() >= new Date(data.arriveFrom) && new Date() <= new Date(data.arriveUntil);
  const approved = data.approvals.filter((a) => a.status === "APPROVED").map((a) => a.type);

  return (
    <div className="public-page">
      <div className="row between mb">
        <div className="row" style={{ gap: 10 }}>
          <div className="brand-mark">SR</div>
          <div>
            <strong>Gate pass</strong>
            <div className="small dim">SecureResident visitor invitation</div>
          </div>
        </div>
        <Badge tone={statusColor(data.visitStatus)}>{data.visitStatus}</Badge>
      </div>

      <Card title={data.visitorName}>
        <div className="col" style={{ gap: 8 }}>
          <div className="row between">
            <span className="muted">Host</span>
            <strong>
              {data.hostFirstName} · Flat {data.flatNumber}, {data.block}
            </strong>
          </div>
          <div className="row between">
            <span className="muted">Purpose</span>
            <span>{data.purpose || "Visit"}</span>
          </div>
          {data.vehicleNumber && (
            <div className="row between">
              <span className="muted">Vehicle</span>
              <span className="mono">{data.vehicleNumber}</span>
            </div>
          )}
          <div className="row between">
            <span className="muted">Arrival window</span>
            <span className="right">
              {fmtDate(data.arriveFrom)}
              <br />
              <span className="dim small">until {fmtDate(data.arriveUntil)}</span>
            </span>
          </div>
          <div className="row between">
            <span className="muted">Approval policy</span>
            <span className="row gap-sm">
              <Badge tone="blue">{data.approvalPolicy}</Badge>
              {approved.map((t) => (
                <Badge key={t} tone="green">
                  {t} ✓
                </Badge>
              ))}
            </span>
          </div>
        </div>

        <div className="divider" />

        {data.lockdownActive && (
          <div className="banner lockdown mb">🚨 Lockdown active — entry is suspended.</div>
        )}

        {data.showQr ? (
          <>
            <div className="qr-box" style={{ width: 230, height: 230 }}>
              <img src={data.qrDataUrl} alt="Visitor QR code" width={200} height={200} />
            </div>
            <div className="center mt">
              <div className="muted small">Show this code at the gate, or read the code aloud:</div>
              <div className="code-plate" style={{ marginTop: 6 }}>
                {code.toUpperCase()}
              </div>
              <div className={`small mt ${insideWindow ? "" : "dim"}`} style={{ color: insideWindow ? "var(--green)" : undefined }}>
                {insideWindow ? "● Inside arrival window — you can present this pass now" : "Outside the arrival window right now"}
              </div>
            </div>
          </>
        ) : (
          <div className="empty">
            This pass is no longer valid for entry
            <div className="small dim mt">Status: {data.visitStatus}</div>
          </div>
        )}

        <div className="hint mt center">
          Never share this code after your visit ends. Codes expire automatically.
        </div>
      </Card>
    </div>
  );
}
