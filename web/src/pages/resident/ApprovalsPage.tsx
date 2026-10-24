import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useAsync, PageHeader, LoadingRow, ErrorView, Empty, Badge, useToast, Card, Modal, Field } from "../../components/ui";
import { get, post, ApiError } from "../../lib/api";
import { fmtDate, statusColor } from "../../lib/format";
import { useWs } from "../../lib/ws";
import type { InvitationRow } from "./InvitationsPage";

export default function ApprovalsPage() {
  const toast = useToast();
  const { subscribe } = useWs();
  const [rejecting, setRejecting] = useState<InvitationRow | null>(null);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);

  const { data, error, loading, reload } = useAsync<{ items: InvitationRow[]; total: number }>(
    () => get("/api/visitors/pending-approvals?limit=50"),
    [],
  );

  useEffect(
    () =>
      subscribe((msg) => {
        if (msg.type === "approval-request" || msg.type === "notification") reload();
      }),
    [subscribe, reload],
  );

  const decide = async (inv: InvitationRow, decision: "APPROVED" | "REJECTED", why?: string) => {
    setBusy(true);
    try {
      await post(`/api/visitors/${inv.id}/${decision === "APPROVED" ? "approve" : "reject"}`, {
        type: "RESIDENT",
        ...(why ? { reason: why } : {}),
      });
      toast.push(
        decision === "APPROVED" ? `${inv.visitorName} approved for entry` : `${inv.visitorName} rejected`,
        decision === "APPROVED" ? "success" : "warn",
      );
      setRejecting(null);
      setReason("");
      reload();
    } catch (e) {
      toast.push(e instanceof ApiError ? e.message : "Decision failed", "error");
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <PageHeader title="Pending approvals" subtitle="Visitors waiting for your confirmation at the gate" />

      {loading ? (
        <LoadingRow />
      ) : error ? (
        <ErrorView error={error} onRetry={reload} />
      ) : !data || data.items.length === 0 ? (
        <Empty title="No approvals waiting" hint="When a visitor arrives and your approval is required, it appears here instantly." />
      ) : (
        <div className="grid cols-2">
          {data.items.map((inv) => (
            <Card key={inv.id}>
              <div className="row between mb">
                <div>
                  <h2 style={{ marginBottom: 2 }}>{inv.visitorName}</h2>
                  <div className="small dim">
                    Flat {inv.flatNumber} · {inv.purpose || "Visit"}
                    {inv.vehicleNumber ? ` · ${inv.vehicleNumber}` : ""}
                  </div>
                </div>
                <Badge tone={statusColor(inv.visitStatus)}>{inv.visitStatus}</Badge>
              </div>

              <div className="col" style={{ gap: 6 }}>
                <div className="row between">
                  <span className="muted small">Code</span>
                  <span className="mono">{inv.code}</span>
                </div>
                <div className="row between">
                  <span className="muted small">Expected</span>
                  <span>{fmtDate(inv.expectedAt)}</span>
                </div>
                <div className="row between">
                  <span className="muted small">Window</span>
                  <span className="small">{fmtDate(inv.arriveFrom)} → {fmtDate(inv.arriveUntil)}</span>
                </div>
                <div className="row between">
                  <span className="muted small">Policy</span>
                  <Badge tone="blue">{inv.approvalPolicy}</Badge>
                </div>
              </div>

              <div className="row gap-sm mt">
                <button className="btn primary grow" disabled={busy} onClick={() => void decide(inv, "APPROVED")}>
                  ✓ Approve entry
                </button>
                <button className="btn danger" disabled={busy} onClick={() => setRejecting(inv)}>
                  ✕ Reject
                </button>
                <Link className="btn ghost" to={`/resident/invitations/${inv.id}`}>
                  Details
                </Link>
              </div>
            </Card>
          ))}
        </div>
      )}

      <Modal
        open={!!rejecting}
        title={`Reject ${rejecting?.visitorName ?? ""}`}
        onClose={() => setRejecting(null)}
        footer={
          <>
            <button className="btn ghost" onClick={() => setRejecting(null)}>
              Cancel
            </button>
            <button className="btn danger" disabled={busy || reason.trim().length < 3} onClick={() => rejecting && void decide(rejecting, "REJECTED", reason.trim())}>
              Reject visitor
            </button>
          </>
        }
      >
        <p className="muted">The guard will be told the visitor is not authorized. This creates a security alert.</p>
        <Field label="Reason *" hint="At least 3 characters.">
          <textarea className="textarea" value={reason} onChange={(e) => setReason(e.target.value)} maxLength={300} />
        </Field>
      </Modal>
    </>
  );
}
