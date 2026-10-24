import { useEffect, useState } from "react";
import { useAsync, PageHeader, Badge, LoadingRow, ErrorView, Empty, Modal, Pagination } from "../../components/ui";
import { get, type Page } from "../../lib/api";
import { fmtDate, statusColor } from "../../lib/format";
import { useAuth } from "../../lib/auth";

interface AuditRow {
  id: string;
  userId?: string | null;
  userRole?: string | null;
  action: string;
  entity?: string | null;
  entityId?: string | null;
  result: string;
  ip?: string | null;
  device?: string | null;
  metadata?: string | null;
  createdAt: string;
  user?: { id: string; name: string; email: string } | null;
}

const LIMIT = 20;

function prettyDetails(raw: string | null | undefined): string {
  if (!raw) return "No details recorded for this event.";
  try {
    return JSON.stringify(JSON.parse(raw), null, 2);
  } catch {
    return raw;
  }
}

function buildQuery(page: number, q: string, action: string, entity: string, result: string): string {
  const qs = new URLSearchParams({ page: String(page), limit: String(LIMIT) });
  if (q) qs.set("q", q);
  if (action) qs.set("action", action);
  if (entity) qs.set("entity", entity);
  if (result) qs.set("result", result);
  return qs.toString();
}

export default function AuditPage() {
  const { has } = useAuth();
  const allowed = has("audit:read");

  const [page, setPage] = useState(1);
  const [q, setQ] = useState("");
  const [appliedQ, setAppliedQ] = useState("");
  const [action, setAction] = useState("");
  const [entity, setEntity] = useState("");
  const [result, setResult] = useState("");
  const [selected, setSelected] = useState<AuditRow | null>(null);

  const list = useAsync<Page<AuditRow>>(
    () =>
      allowed ? get(`/api/audit?${buildQuery(page, appliedQ, action, entity, result)}`) : Promise.resolve({ items: [], total: 0, page: 1, limit: LIMIT }),
    [page, appliedQ, action, entity, result, allowed],
  );

  const availableActions = useAsync<{ items: string[] }>(
    () => (allowed ? get("/api/audit/actions") : Promise.resolve({ items: [] })),
    [allowed],
  );

  useEffect(
    () => setPage(1),
    [appliedQ, action, entity, result],
  );

  if (!allowed) {
    return (
      <>
        <PageHeader title="Audit log" subtitle="Complete record of actions taken across the estate" />
        <Empty
          title="Audit log is restricted"
          hint="Your role does not include the audit:read permission. Sign in as an administrator or super admin to view the audit trail."
        />
      </>
    );
  }

  const rows = list.data?.items ?? [];

  return (
    <>
      <PageHeader title="Audit log" subtitle="Complete record of actions taken across the estate" />

      <div className="row gap-sm wrap mb">
        <input
          className="input"
          style={{ maxWidth: 260 }}
          placeholder="Search action, entity or actor…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") setAppliedQ(q.trim());
          }}
        />
        <button className="btn" onClick={() => setAppliedQ(q.trim())}>
          Search
        </button>
        <select className="select" style={{ maxWidth: 230 }} value={action} onChange={(e) => setAction(e.target.value)}>
          <option value="">Any action</option>
          {(availableActions.data?.items ?? []).map((a) => (
            <option key={a} value={a}>
              {a}
            </option>
          ))}
        </select>
        <input
          className="input"
          style={{ maxWidth: 180 }}
          placeholder="Entity (e.g. VisitorInvitation)"
          value={entity}
          onChange={(e) => setEntity(e.target.value)}
        />
        <select className="select" style={{ maxWidth: 150 }} value={result} onChange={(e) => setResult(e.target.value)}>
          <option value="">Any result</option>
          <option value="SUCCESS">SUCCESS</option>
          <option value="FAILURE">FAILURE</option>
        </select>
        {(appliedQ || action || entity || result) && (
          <button
            className="btn ghost"
            onClick={() => {
              setQ("");
              setAppliedQ("");
              setAction("");
              setEntity("");
              setResult("");
            }}
          >
            Clear filters
          </button>
        )}
      </div>

      {list.loading ? (
        <LoadingRow />
      ) : list.error ? (
        <ErrorView error={list.error} onRetry={list.reload} />
      ) : rows.length === 0 ? (
        <Empty title="No audit events" hint="Adjust the filters, or wait until staff members take actions." />
      ) : (
        <>
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Time</th>
                  <th>Actor</th>
                  <th>Action</th>
                  <th>Entity</th>
                  <th>Result</th>
                  <th>IP</th>
                  <th>Device</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id}>
                    <td className="small" style={{ whiteSpace: "nowrap" }}>{fmtDate(r.createdAt)}</td>
                    <td>
                      <strong>{r.user?.name ?? "System"}</strong>
                      <div className="small dim">
                        {r.user?.email ?? r.userRole ?? "—"}
                        {r.userId ? "" : " (anonymous)"}
                      </div>
                    </td>
                    <td className="mono">{r.action}</td>
                    <td>
                      {r.entity ?? "—"}
                      {r.entityId && <div className="small dim mono">{r.entityId}</div>}
                    </td>
                    <td>
                      <Badge tone={statusColor(r.result)}>{r.result}</Badge>
                    </td>
                    <td className="mono small">{r.ip ?? "—"}</td>
                    <td className="small dim" style={{ maxWidth: 180, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {r.device ?? "—"}
                    </td>
                    <td>
                      <button className="btn sm" onClick={() => setSelected(r)}>
                        Details
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Pagination page={list.data?.page ?? page} total={list.data?.total ?? 0} limit={LIMIT} onChange={setPage} />
        </>
      )}

      <Modal
        open={!!selected}
        title={selected ? `${selected.action} · ${selected.user?.name ?? "System"}` : "Audit details"}
        onClose={() => setSelected(null)}
        footer={
          <button className="btn" onClick={() => setSelected(null)}>
            Close
          </button>
        }
      >
        {selected && (
          <>
            <div className="col" style={{ gap: 6 }}>
              <div className="row between">
                <span className="muted small">Time</span>
                <span className="small">{fmtDate(selected.createdAt)}</span>
              </div>
              <div className="row between">
                <span className="muted small">Actor</span>
                <span className="small">
                  {selected.user?.name ?? "—"} {selected.user?.email ? `(${selected.user.email})` : ""}{" "}
                  {selected.userRole ?? "—"}
                </span>
              </div>
              <div className="row between">
                <span className="muted small">Action</span>
                <span className="mono">{selected.action}</span>
              </div>
              <div className="row between">
                <span className="muted small">Entity</span>
                <span className="small">
                  {selected.entity ?? "—"} {selected.entityId ? ` · ${selected.entityId}` : ""}
                </span>
              </div>
              <div className="row between">
                <span className="muted small">Result</span>
                <Badge tone={statusColor(selected.result)}>{selected.result}</Badge>
              </div>
              <div className="row between">
                <span className="muted small">IP</span>
                <span className="mono small">{selected.ip ?? "—"}</span>
              </div>
            </div>
            <div className="divider" />
            <h3>Details</h3>
            <pre
              className="mono small"
              style={{
                whiteSpace: "pre-wrap",
                wordBreak: "break-word",
                background: "#0c1526",
                border: "1px solid var(--border)",
                borderRadius: 8,
                padding: 12,
                margin: 0,
              }}
            >
              {prettyDetails(selected.metadata)}
            </pre>
          </>
        )}
      </Modal>
    </>
  );
}