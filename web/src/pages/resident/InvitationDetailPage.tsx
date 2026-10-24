import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useAsync, PageHeader, LoadingRow, ErrorView, Card, Badge, useToast, Empty } from "../../components/ui";
import { get, post, ApiError } from "../../lib/api";
import { fmtDate, statusColor } from "../../lib/format";
import type { InvitationRow } from "./InvitationsPage";

interface Detail extends InvitationRow {
  qrPayload: string;
  residentName: string;
  blockName: string;
  buildingName: string;
  expectedExitAt: string;
  expiresAt: string;
  durationMinutes: number;
  usedCount: number;
  maxUses: number;
  decidedAt?: string | null;
  rejectReason?: string | null;
  lastEntry?: { enteredAt: string; gate?: { name: string } | null; guard?: { name: string } | null } | null;
  lastExit?: { exitedAt: string; gate?: { name: string } | null } | null;
  createdAt: string;
}

interface History extends Detail {
  entries: Array<{ id: string; enteredAt: string; gate?: { name: string } | null; guard?: { name: string } | null }>;
  exits: Array<{ id: string; exitedAt: string; gate?: { name: string } | null }>;
}

export default function InvitationDetailPage() {
  const { id = "" } = useParams();
  const toast = useToast();
  
  const [busy, setBusy] = useState(false);

  const { data, error, loading, reload } = useAsync<History>(() => get(`/api/visitors/${id}`), [id]);
  const qrData = useAsync<{ code: string; qrPayload: string; qrDataUrl: string }>(
    () => get(`/api/visitors/invitations/${id}/qr`),
    [id],
  );

  if (loading) return <LoadingRow />;
  if (error) return <ErrorView error={error} onRetry={reload} />;
  if (!data) return null;

  const showQr = data.status === "ACTIVE" && !["EXITED", "DENIED", "BLOCKED"].includes(data.visitStatus);
  const active = data.status === "ACTIVE" && ["EXPECTED", "AWAITING_APPROVAL", "APPROVED"].includes(data.visitStatus);

  const cancel = async () => {
    setBusy(true);
    try {
      await post(`/api/visitors/invitations/${id}/cancel`, {});
      toast.push("Invitation cancelled", "success");
      reload();
    } catch (e) {
      toast.push(e instanceof ApiError ? e.message : "Failed to cancel", "error");
    } finally {
      setBusy(false);
    }
  };

  const extend = async () => {
    setBusy(true);
    try {
      await post(`/api/visitors/invitations/${id}/extend`, { minutes: 60 });
      toast.push("Validity extended by 60 minutes", "success");
      reload();
    } catch (e) {
      toast.push(e instanceof ApiError ? e.message : "Failed to extend", "error");
    } finally {
      setBusy(false);
    }
  };

  const share = async () => {
    const link = `${window.location.origin}/invite/${data.code}`;
    await navigator.clipboard?.writeText(link);
    toast.push("Public link copied", "success");
  };

  return (
    <>
      <PageHeader
        title={data.visitorName}
        subtitle={`${data.code} · created ${fmtDate(data.createdAt)}`}
        actions={
          <>
            <Link className="btn" to="/resident/invitations">
              ← Back
            </Link>
            {active && (
              <>
                <button className="btn" disabled={busy} onClick={() => void extend()}>
                  +60 min
                </button>
                <button className="btn danger" disabled={busy} onClick={() => void cancel()}>
                  Cancel
                </button>
              </>
            )}
          </>
        }
      />

      <div className="grid cols-2">
        <Card title="Pass">
          {showQr ? (
            <>
              <div className="qr-box" style={{ width: 230, height: 230 }}>
                <img src={qrData.data?.qrDataUrl} alt="QR" width={200} height={200} />
              </div>
              <div className="code-plate mt">{data.code}</div>
              <div className="row gap-sm mt" style={{ justifyContent: "center" }}>
                <button className="btn sm" onClick={() => void share()}>
                  Copy link
                </button>
                <button className="btn sm" onClick={() => qrData.reload()}>
                  Regenerate QR
                </button>
                <Link className="btn sm" to={`/invite/${data.code}`} target="_blank">
                  Preview pass
                </Link>
              </div>
            </>
          ) : (
            <Empty title="Pass is no longer active" hint={`Status: ${data.visitStatus}`} />
          )}
        </Card>

        <Card title="Details">
          <div className="col" style={{ gap: 7 }}>
            <DetailRow label="Status">
              <Badge tone={statusColor(data.visitStatus)}>{data.visitStatus}</Badge>
            </DetailRow>
            <DetailRow label="Approval policy">
              <Badge tone="blue">{data.approvalPolicy}</Badge>
            </DetailRow>
            <DetailRow label="Approvals">
              <span className="row gap-sm wrap">
                {data.approvals.length === 0 && <span className="dim">none required</span>}
                {data.approvals.map((a) => (
                  <Badge key={a.type} tone={a.status === "APPROVED" ? "green" : a.status === "REJECTED" ? "red" : "amber"}>
                    {a.type}: {a.status}
                  </Badge>
                ))}
              </span>
            </DetailRow>
            <DetailRow label="Host">{data.residentName}</DetailRow>
            <DetailRow label="Apartment">
              Flat {data.flatNumber} · {data.blockName} · {data.buildingName}
            </DetailRow>
            {data.purpose && <DetailRow label="Purpose">{data.purpose}</DetailRow>}
            {data.vehicleNumber && <DetailRow label="Vehicle"><span className="mono">{data.vehicleNumber}</span></DetailRow>}
            <DetailRow label="Arrival window">
              {fmtDate(data.arriveFrom)} → {fmtDate(data.arriveUntil)}
            </DetailRow>
            <DetailRow label="Expected exit">{fmtDate(data.expectedExitAt)}</DetailRow>
            <DetailRow label="Expires">{fmtDate(data.expiresAt)}</DetailRow>
            <DetailRow label="Uses">
              {data.usedCount} / {data.maxUses}
            </DetailRow>
            {data.rejectReason && (
              <DetailRow label="Rejection reason">
                <span style={{ color: "#fca5a5" }}>{data.rejectReason}</span>
              </DetailRow>
            )}
          </div>
        </Card>
      </div>

      <div className="grid cols-2 mt">
        <Card title={`Entries (${data.entries.length})`}>
          {data.entries.length === 0 ? (
            <Empty title="No entries yet" />
          ) : (
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th>Entered</th>
                    <th>Gate</th>
                    <th>Guard</th>
                  </tr>
                </thead>
                <tbody>
                  {data.entries.map((e) => (
                    <tr key={e.id}>
                      <td>{fmtDate(e.enteredAt)}</td>
                      <td>{e.gate?.name ?? "—"}</td>
                      <td>{e.guard?.name ?? "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
        <Card title={`Exits (${data.exits.length})`}>
          {data.exits.length === 0 ? (
            <Empty title="No exits recorded" />
          ) : (
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th>Exited</th>
                    <th>Gate</th>
                  </tr>
                </thead>
                <tbody>
                  {data.exits.map((e) => (
                    <tr key={e.id}>
                      <td>{fmtDate(e.exitedAt)}</td>
                      <td>{e.gate?.name ?? "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      </div>

    </>
  );
}

function DetailRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="row between" style={{ alignItems: "flex-start" }}>
      <span className="muted small" style={{ minWidth: 130 }}>
        {label}
      </span>
      <span style={{ textAlign: "right" }}>{children}</span>
    </div>
  );
}
