import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import {
  useAsync,
  PageHeader,
  Badge,
  LoadingRow,
  ErrorView,
  Empty,
  Modal,
  Field,
  Pagination,
  useToast,
} from "../../components/ui";
import { get, post, ApiError } from "../../lib/api";
import { fmtDate, relative, statusColor, purposeTone } from "../../lib/format";
import { useAuth } from "../../lib/auth";
import { useWs } from "../../lib/ws";

interface ApprovalRow {
  id: string;
  type: string;
  status: string;
  requestedAt: string;
  decidedAt?: string | null;
  decidedByName?: string | null;
  reason?: string | null;
}

interface EntryRow {
  id: string;
  enteredAt: string;
  source?: string | null;
  vehicleNumber?: string | null;
  gate?: { id?: string; name: string } | null;
  guard?: { name: string } | null;
}

interface ExitRow {
  id: string;
  exitedAt: string;
  durationMinutes?: number | null;
  gate?: { id?: string; name: string } | null;
  guard?: { name: string } | null;
}

interface VisitorRow {
  id: string;
  code: string;
  visitorName: string;
  visitorPhone?: string | null;
  purpose?: string | null;
  vehicleNumber?: string | null;
  notes?: string | null;
  residentName?: string | null;
  flatNumber: string;
  blockName: string;
  buildingName: string;
  expectedAt: string;
  arriveFrom: string;
  arriveUntil: string;
  expectedExitAt: string;
  durationMinutes: number;
  status: string;
  visitStatus: string;
  approvalPolicy?: string | null;
  rejectReason?: string | null;
  approvals: ApprovalRow[];
  lastEntry?: EntryRow | null;
  lastExit?: ExitRow | null;
  createdAt: string;
}

interface VisitorDetail extends VisitorRow {
  entries: EntryRow[];
  exits: ExitRow[];
}

interface ListData {
  items: VisitorRow[];
  total: number;
  page: number;
  limit: number;
}

interface PendingData {
  items: VisitorRow[];
  total: number;
}

interface StatsData {
  todayTotal: number;
  inside: number;
  pending: number;
  exited: number;
}

type Tab = "all" | "inside" | "pending";

const TABS: Array<{ key: Tab; label: string }> = [
  { key: "all", label: "All visitors" },
  { key: "inside", label: "Currently inside" },
  { key: "pending", label: "Pending approvals" },
];

const VISIT_STATUSES = ["EXPECTED", "AWAITING_APPROVAL", "APPROVED", "DENIED", "INSIDE", "EXITED", "BLOCKED"];

const RELOAD_EVENTS = [
  "approval-pending",
  "approval-request",
  "approval-decided",
  "visitor-entry",
  "visitor-exit",
  "invitation-created",
  "invitation-cancelled",
  "notification",
];

const LIMIT = 15;

export default function VisitorsPage() {
  const toast = useToast();
  const { has } = useAuth();
  const { subscribe } = useWs();
  const [params, setParams] = useSearchParams();

  const initialTab = params.get("tab");
  const [tab, setTab] = useState<Tab>(initialTab === "inside" || initialTab === "pending" ? initialTab : "all");
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [appliedSearch, setAppliedSearch] = useState("");
  const [visitStatus, setVisitStatus] = useState("");
  const [selected, setSelected] = useState<string | null>(null);
  const [rejecting, setRejecting] = useState<VisitorRow | null>(null);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);

  const canDecide = has("approvals:security");

  const stats = useAsync<StatsData>(() => get("/api/visitors/stats/summary"), []);

  const list = useAsync<ListData>(() => {
    if (tab === "pending") {
      return get<PendingData>("/api/visitors/pending-approvals").then((r) => ({
        items: r.items,
        total: r.total,
        page: 1,
        limit: Math.max(r.items.length, 1),
      }));
    }
    const qs = new URLSearchParams({ page: String(page), limit: String(LIMIT) });
    if (tab === "inside") return get<ListData>(`/api/visitors/currently-inside?${qs.toString()}`);
    if (appliedSearch) qs.set("q", appliedSearch);
    if (visitStatus) qs.set("visitStatus", visitStatus);
    return get<ListData>(`/api/visitors?${qs.toString()}`);
  }, [tab, page, appliedSearch, visitStatus]);

  const detail = useAsync<VisitorDetail | null>(
    () => (selected ? get<VisitorDetail>(`/api/visitors/${selected}`) : Promise.resolve(null)),
    [selected],
  );

  useEffect(
    () =>
      subscribe((msg) => {
        if (!RELOAD_EVENTS.includes(msg.type)) return;
        list.reload();
        stats.reload();
      }),
    [subscribe],
  );

  const switchTab = (next: Tab) => {
    setTab(next);
    setPage(1);
    setParams(next === "all" ? {} : { tab: next });
  };

  const submitSearch = () => {
    setPage(1);
    setAppliedSearch(search.trim());
  };

  const decide = async (inv: VisitorRow, decision: "APPROVED" | "REJECTED", why?: string) => {
    setBusy(true);
    try {
      await post(`/api/visitors/${inv.id}/${decision === "APPROVED" ? "approve" : "reject"}`, {
        type: "SECURITY",
        ...(why ? { reason: why } : {}),
      });
      toast.push(
        decision === "APPROVED" ? `${inv.visitorName} approved for entry` : `${inv.visitorName} rejected`,
        decision === "APPROVED" ? "success" : "warn",
      );
      setRejecting(null);
      setReason("");
      list.reload();
      stats.reload();
    } catch (e) {
      toast.push(e instanceof ApiError ? e.message : "Decision failed", "error");
    } finally {
      setBusy(false);
    }
  };

  const rows = list.data?.items ?? [];
  const d = detail.data;

  const timeline = d
    ? [
        ...d.entries.map((e) => ({
          key: `e-${e.id}`,
          kind: "ENTRY" as const,
          at: e.enteredAt,
          gate: e.gate?.name ?? "Gate",
          who: e.guard?.name ?? "—",
          note: e.source ?? "",
        })),
        ...d.exits.map((x) => ({
          key: `x-${x.id}`,
          kind: "EXIT" as const,
          at: x.exitedAt,
          gate: x.gate?.name ?? "Gate",
          who: x.guard?.name ?? "—",
          note: x.durationMinutes ? `${x.durationMinutes} min inside` : "",
        })),
      ].sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime())
    : [];

  return (
    <>
      <PageHeader
        title="Visitor directory"
        subtitle="Everyone on the premises, past and present"
        actions={
          <div className="row gap-sm wrap">
            <Badge tone="blue">Today {stats.data?.todayTotal ?? "—"}</Badge>
            <Badge tone="green">Inside {stats.data?.inside ?? "—"}</Badge>
            <Badge tone="amber">Pending {stats.data?.pending ?? "—"}</Badge>
            <Badge tone="gray">Exited {stats.data?.exited ?? "—"}</Badge>
          </div>
        }
      />

      <div className="pill-tabs">
        {TABS.map((t) => (
          <button
            key={t.key}
            className={`pill-tab ${tab === t.key ? "active" : ""}`}
            onClick={() => switchTab(t.key)}
          >
            {t.label}
            {t.key === "inside" && stats.data ? ` (${stats.data.inside})` : ""}
            {t.key === "pending" && stats.data ? ` (${stats.data.pending})` : ""}
          </button>
        ))}
      </div>

      <div className="row gap-sm wrap mb">
        {tab === "all" && (
          <>
            <input
              className="input"
              style={{ maxWidth: 280 }}
              placeholder="Search name, code, phone, flat or host…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && submitSearch()}
            />
            <button className="btn" onClick={submitSearch}>
              Search
            </button>
          </>
        )}
        {tab === "all" && (
          <select
            className="select"
            style={{ maxWidth: 210 }}
            value={visitStatus}
            onChange={(e) => {
              setVisitStatus(e.target.value);
              setPage(1);
            }}
          >
            <option value="">Any status</option>
            {VISIT_STATUSES.map((s) => (
              <option key={s} value={s}>
                {s.replace(/_/g, " ")}
              </option>
            ))}
          </select>
        )}
        {(appliedSearch || visitStatus) && tab === "all" && (
          <button
            className="btn ghost"
            onClick={() => {
              setSearch("");
              setAppliedSearch("");
              setVisitStatus("");
              setPage(1);
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
        <Empty
          title={tab === "pending" ? "No approvals waiting" : tab === "inside" ? "Nobody is inside" : "No visitors found"}
          hint={
            tab === "pending"
              ? "Entry requests that need a security decision appear here."
              : tab === "inside"
                ? "Visitors show up here the moment a guard records their entry."
                : "Adjust the filters or search for another visitor."
          }
        />
      ) : (
        <>
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Visitor</th>
                  <th>Code</th>
                  <th>Purpose</th>
                  <th>Flat / host</th>
                  <th>Expected window</th>
                  <th>Status</th>
                  <th>Last entry / exit</th>
                  {tab === "pending" && canDecide && <th></th>}
                </tr>
              </thead>
              <tbody>
                {rows.map((inv) => (
                  <tr key={inv.id} style={{ cursor: "pointer" }} onClick={() => setSelected(inv.id)}>
                    <td>
                      <strong>{inv.visitorName}</strong>
                      <div className="small dim">
                        {inv.vehicleNumber ? `${inv.vehicleNumber} · ` : ""}
                        {inv.visitorPhone ?? ""}
                      </div>
                    </td>
                    <td className="mono">{inv.code}</td>
                    <td>
                      {inv.purpose ? (
                        <Badge tone={purposeTone(inv.purpose)}>{inv.purpose}</Badge>
                      ) : (
                        <span className="dim">—</span>
                      )}
                    </td>
                    <td>
                      {inv.flatNumber}
                      <div className="small dim">
                        {inv.blockName} · {inv.residentName ?? "—"}
                      </div>
                    </td>
                    <td>
                      {fmtDate(inv.arriveFrom)}
                      <div className="small dim">until {fmtDate(inv.arriveUntil)}</div>
                    </td>
                    <td>
                      <Badge tone={statusColor(inv.visitStatus)}>{inv.visitStatus}</Badge>
                    </td>
                    <td>
                      {inv.lastEntry && (
                        <div className="small">
                          in {fmtDate(inv.lastEntry.enteredAt)}
                          <span className="dim"> · {inv.lastEntry.gate?.name ?? "gate"}</span>
                        </div>
                      )}
                      {inv.lastExit && (
                        <div className="small dim">out {fmtDate(inv.lastExit.exitedAt)}</div>
                      )}
                      {!inv.lastEntry && !inv.lastExit && <span className="dim">—</span>}
                    </td>
                    {tab === "pending" && canDecide && (
                      <td onClick={(e) => e.stopPropagation()}>
                        <div className="row gap-sm" style={{ justifyContent: "flex-end" }}>
                          <button
                            className="btn sm primary"
                            disabled={busy}
                            onClick={() => void decide(inv, "APPROVED")}
                          >
                            Approve
                          </button>
                          <button
                            className="btn sm danger"
                            disabled={busy}
                            onClick={() => {
                              setRejecting(inv);
                              setReason("");
                            }}
                          >
                            Reject
                          </button>
                        </div>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Pagination
            page={list.data?.page ?? page}
            total={list.data?.total ?? 0}
            limit={tab === "pending" ? list.data?.limit ?? LIMIT : LIMIT}
            onChange={setPage}
          />
        </>
      )}

      <Modal open={!!selected} title={d ? `${d.visitorName}` : "Visitor record"} onClose={() => setSelected(null)}>
        {detail.loading ? (
          <LoadingRow />
        ) : detail.error ? (
          <ErrorView error={detail.error} onRetry={detail.reload} />
        ) : d ? (
          <div className="col">
            <div className="row gap-sm wrap">
              <span className="mono">{d.code}</span>
              <Badge tone={statusColor(d.visitStatus)}>{d.visitStatus}</Badge>
              <Badge tone={statusColor(d.status)}>{d.status}</Badge>
              <Badge tone="blue">{d.approvalPolicy ?? "AUTO"}</Badge>
            </div>

            <div className="divider" />

            <div className="col" style={{ gap: 6 }}>
              <div className="row between">
                <span className="muted small">Phone</span>
                <span>{d.visitorPhone ?? "—"}</span>
              </div>
              <div className="row between">
                <span className="muted small">Vehicle</span>
                <span>{d.vehicleNumber ?? "—"}</span>
              </div>
              <div className="row between">
                <span className="muted small">Purpose</span>
                <span>{d.purpose ?? "—"}</span>
              </div>
              <div className="row between">
                <span className="muted small">Flat</span>
                <span>
                  {d.flatNumber} · {d.blockName} · {d.buildingName}
                </span>
              </div>
              <div className="row between">
                <span className="muted small">Host</span>
                <span>{d.residentName ?? "—"}</span>
              </div>
              <div className="row between">
                <span className="muted small">Window</span>
                <span className="small">
                  {fmtDate(d.arriveFrom)} → {fmtDate(d.arriveUntil)}
                </span>
              </div>
              <div className="row between">
                <span className="muted small">Expected exit</span>
                <span className="small">{fmtDate(d.expectedExitAt)}</span>
              </div>
              {d.notes && (
                <div className="row between">
                  <span className="muted small">Notes</span>
                  <span className="small">{d.notes}</span>
                </div>
              )}
              {d.rejectReason && (
                <div className="row between">
                  <span className="muted small">Rejection reason</span>
                  <span className="small error-text">{d.rejectReason}</span>
                </div>
              )}
            </div>

            <div className="divider" />

            <div>
              <h3>Approvals</h3>
              {d.approvals.length === 0 ? (
                <div className="small dim">No approval steps recorded for this visit.</div>
              ) : (
                <div className="col" style={{ gap: 6 }}>
                  {d.approvals.map((a) => (
                    <div key={a.id} className="row between gap-sm wrap">
                      <div className="row gap-sm">
                        <Badge tone="blue">{a.type}</Badge>
                        <Badge tone={statusColor(a.status)}>{a.status}</Badge>
                      </div>
                      <div className="small dim right">
                        {a.decidedByName ? `${a.decidedByName} · ` : ""}
                        {a.decidedAt ? fmtDate(a.decidedAt) : `requested ${relative(a.requestedAt)}`}
                        {a.reason ? ` · ${a.reason}` : ""}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="divider" />

            <div>
              <h3>Entry / exit timeline</h3>
              {timeline.length === 0 ? (
                <div className="small dim">No gate movements recorded yet.</div>
              ) : (
                <div className="col" style={{ gap: 6 }}>
                  {timeline.map((t) => (
                    <div key={t.key} className="row between gap-sm wrap">
                      <div className="row gap-sm">
                        <Badge tone={t.kind === "ENTRY" ? "green" : "gray"}>{t.kind}</Badge>
                        <span className="small">
                          {t.gate} · {t.who}
                          {t.note ? ` · ${t.note}` : ""}
                        </span>
                      </div>
                      <span className="small dim">{fmtDate(t.at)}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        ) : null}
      </Modal>

      <Modal
        open={!!rejecting}
        title={`Reject ${rejecting?.visitorName ?? ""}`}
        onClose={() => setRejecting(null)}
        footer={
          <>
            <button className="btn ghost" onClick={() => setRejecting(null)}>
              Cancel
            </button>
            <button
              className="btn danger"
              disabled={busy || reason.trim().length < 3}
              onClick={() => rejecting && void decide(rejecting, "REJECTED", reason.trim())}
            >
              Reject visitor
            </button>
          </>
        }
      >
        <p className="muted">
          The guard is told this visitor is not authorized and the hosting resident is notified. This is recorded as a
          security decision under your account.
        </p>
        <Field label="Reason *" hint="At least 3 characters. Required for the audit trail.">
          <textarea
            className="textarea"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            maxLength={300}
          />
        </Field>
        {reason.trim().length > 0 && reason.trim().length < 3 && (
          <div className="error-text">Reason must be at least 3 characters.</div>
        )}
      </Modal>
    </>
  );
}
