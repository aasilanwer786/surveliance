import { useState } from "react";
import { Link } from "react-router-dom";
import { useAsync, PageHeader, LoadingRow, ErrorView, Empty, Badge, Pagination, useToast } from "../../components/ui";
import { get, post, type Page } from "../../lib/api";
import { fmtDate, statusColor } from "../../lib/format";

export interface InvitationRow {
  id: string;
  code: string;
  visitorName: string;
  purpose?: string | null;
  vehicleNumber?: string | null;
  flatNumber: string;
  expectedAt: string;
  arriveFrom: string;
  arriveUntil: string;
  visitStatus: string;
  status: string;
  approvalPolicy: string;
  approvals: Array<{ type: string; status: string }>;
}

const FILTERS = [
  { key: "", label: "All" },
  { key: "EXPECTED", label: "Expected" },
  { key: "AWAITING_APPROVAL", label: "Awaiting" },
  { key: "APPROVED", label: "Approved" },
  { key: "INSIDE", label: "Inside" },
  { key: "EXITED", label: "Exited" },
  { key: "DENIED", label: "Denied" },
  { key: "CANCELLED", label: "Cancelled" },
];

export default function ResidentInvitationsPage() {
  const toast = useToast();
  const [filter, setFilter] = useState("");
  const [page, setPage] = useState(1);
  const limit = 12;

  const { data, error, loading, reload } = useAsync<Page<InvitationRow>>(
    () => get(`/api/visitors/invitations?page=${page}&limit=${limit}${filter ? `&visitStatus=${filter}` : ""}`),
    [page, filter],
  );

  const cancel = async (id: string) => {
    try {
      await post(`/api/visitors/invitations/${id}/cancel`, {});
      toast.push("Invitation cancelled", "success");
      reload();
    } catch (e) {
      toast.push(e instanceof Error ? e.message : "Cancel failed", "error");
    }
  };

  return (
    <>
      <PageHeader
        title="My invitations"
        subtitle="Every visitor pass you have created"
        actions={
          <Link className="btn primary" to="/resident/new">
            ＋ New invitation
          </Link>
        }
      />

      <div className="pill-tabs">
        {FILTERS.map((f) => (
          <button
            key={f.key}
            className={`pill-tab ${filter === f.key ? "active" : ""}`}
            onClick={() => {
              setFilter(f.key);
              setPage(1);
            }}
          >
            {f.label}
          </button>
        ))}
      </div>

      {loading ? (
        <LoadingRow />
      ) : error ? (
        <ErrorView error={error} onRetry={reload} />
      ) : !data || data.items.length === 0 ? (
        <Empty title="No invitations found" hint="Create your first visitor invitation to get started." />
      ) : (
        <>
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Visitor</th>
                  <th>Code</th>
                  <th>Arrival window</th>
                  <th>Approvals</th>
                  <th>Status</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {data.items.map((inv) => {
                  const canCancel = ["EXPECTED", "AWAITING_APPROVAL", "APPROVED"].includes(inv.visitStatus) && inv.status === "ACTIVE";
                  return (
                    <tr key={inv.id}>
                      <td>
                        <strong>{inv.visitorName}</strong>
                        <div className="small dim">
                          {inv.purpose || "Visit"} · Flat {inv.flatNumber}
                          {inv.vehicleNumber ? ` · ${inv.vehicleNumber}` : ""}
                        </div>
                      </td>
                      <td className="mono">{inv.code}</td>
                      <td>
                        {fmtDate(inv.arriveFrom)}
                        <div className="small dim">until {fmtDate(inv.arriveUntil)}</div>
                      </td>
                      <td>
                        <div className="row gap-sm wrap">
                          <Badge tone="blue">{inv.approvalPolicy}</Badge>
                          {inv.approvals.map((a) => (
                            <Badge key={a.type} tone={a.status === "APPROVED" ? "green" : a.status === "REJECTED" ? "red" : "amber"}>
                              {a.type} {a.status === "APPROVED" ? "✓" : a.status === "REJECTED" ? "✕" : "…"}
                            </Badge>
                          ))}
                        </div>
                      </td>
                      <td>
                        <Badge tone={statusColor(inv.visitStatus)}>{inv.visitStatus}</Badge>
                      </td>
                      <td>
                        <div className="row gap-sm" style={{ justifyContent: "flex-end" }}>
                          <Link className="btn sm" to={`/resident/invitations/${inv.id}`}>
                            Open
                          </Link>
                          {canCancel && (
                            <button className="btn sm danger" onClick={() => void cancel(inv.id)}>
                              Cancel
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
          <Pagination page={data.page} total={data.total} limit={limit} onChange={setPage} />
        </>
      )}
    </>
  );
}
