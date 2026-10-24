import { useEffect, useRef, useState } from "react";
import {
  useAsync,
  PageHeader,
  Stat,
  Badge,
  LoadingRow,
  ErrorView,
  Empty,
  Pagination,
  useToast,
} from "../../components/ui";
import { get, post, ApiError, type Page } from "../../lib/api";
import { useAuth } from "../../lib/auth";
import { useWs } from "../../lib/ws";
import { fmtDate, purposeTone } from "../../lib/format";

interface Gate {
  id: string;
  name: string;
  code: string;
}

interface InsideRow {
  id: string;
  code: string;
  visitorName: string;
  purpose: string | null;
  vehicleNumber: string | null;
  residentName: string;
  flatNumber: string;
  blockName: string;
  expectedExitAt: string | null;
  overstayGraceMinutes?: number | null;
  lastEntry: {
    id: string;
    enteredAt: string;
    gate: Gate | null;
  } | null;
}

const LIMIT = 20;

function fmtElapsed(ms: number): string {
  const mins = Math.max(0, Math.floor(ms / 60000));
  if (mins < 60) return `${mins}m`;
  return `${Math.floor(mins / 60)}h ${mins % 60}m`;
}

export default function InsidePage() {
  const { user, has: can } = useAuth();
  const toast = useToast();
  const { subscribe, connected } = useWs();

  const [page, setPage] = useState(1);
  const [gateId, setGateId] = useState("");
  const [now, setNow] = useState(() => Date.now());
  const [busyId, setBusyId] = useState<string | null>(null);

  const list = useAsync<Page<InsideRow>>(
    () => get(`/api/visitors/currently-inside?page=${page}&limit=${LIMIT}`),
    [page],
  );
  const gates = useAsync<{ items: Gate[] }>(() => get("/api/gates"), []);

  const reloadRef = useRef(list.reload);
  useEffect(() => {
    reloadRef.current = list.reload;
  }, [list.reload]);

  useEffect(() => {
    const timer = setInterval(() => {
      setNow(Date.now());
      reloadRef.current();
    }, 30000);
    return () => clearInterval(timer);
  }, []);

  useEffect(
    () =>
      subscribe((msg) => {
        if (msg.type === "visitor-entry" || msg.type === "visitor-exit" || msg.type === "approval-decided") {
          setNow(Date.now());
          reloadRef.current();
        }
      }),
    [subscribe],
  );

  useEffect(() => {
    if (gateId || !gates.data) return;
    const preferred = user?.guard?.gate?.id;
    const match = gates.data.items.find((g) => g.id === preferred) ?? gates.data.items[0];
    if (match) setGateId(match.id);
  }, [gates.data, gateId, user?.guard?.gate?.id]);

  const canExit = can("visitors:exit");

  const expectedMs = (row: InsideRow): number | null =>
    row.expectedExitAt ? new Date(row.expectedExitAt).getTime() : null;

  const isOverstay = (row: InsideRow): boolean => {
    const expected = expectedMs(row);
    if (expected === null) return false;
    return now > expected + (row.overstayGraceMinutes ?? 0) * 60000;
  };

  const recordExit = async (row: InsideRow) => {
    if (!gateId) {
      toast.push("Select an exit gate first", "warn");
      return;
    }
    setBusyId(row.id);
    try {
      await post(`/api/visitors/${row.id}/exit`, { gateId });
      toast.push(`Exit recorded — ${row.visitorName} has left the premises`, "success");
      setNow(Date.now());
      reloadRef.current();
    } catch (err) {
      if (err instanceof ApiError && err.code === "NOT_INSIDE") {
        toast.push(`${row.visitorName} is no longer inside — list refreshed`, "warn");
        reloadRef.current();
      } else {
        toast.push(err instanceof Error ? err.message : "Exit failed", "error");
      }
    } finally {
      setBusyId(null);
    }
  };

  const rows = list.data?.items ?? [];
  const overstayCount = rows.filter(isOverstay).length;
  const gateName = gates.data?.items.find((g) => g.id === gateId)?.name ?? "";

  return (
    <>
      <PageHeader
        title="Visitors currently inside"
        subtitle={`Live occupancy · ${connected ? "live" : "reconnecting…"} · refreshes every 30s`}
        actions={
          <>
            <select
              className="select"
              style={{ width: "auto" }}
              value={gateId}
              onChange={(e) => setGateId(e.target.value)}
              aria-label="Exit gate"
            >
              {(gates.data?.items ?? []).map((g) => (
                <option key={g.id} value={g.id}>
                  {g.name} ({g.code})
                </option>
              ))}
            </select>
            <button
              className="btn sm"
              onClick={() => {
                setNow(Date.now());
                list.reload();
              }}
            >
              Refresh
            </button>
          </>
        }
      />

      {list.loading && !list.data ? (
        <LoadingRow label="Loading visitors inside…" />
      ) : list.error && !list.data ? (
        <ErrorView error={list.error} onRetry={list.reload} />
      ) : (
        <>
          <div className="grid cols-2 mb">
            <Stat
              label="Inside now"
              value={list.data?.total ?? 0}
              hint="Visitors currently on the premises"
              tone={overstayCount > 0 ? "warn" : "good"}
            />
            <Stat
              label="Overstay"
              value={overstayCount}
              hint="Past expected exit on this page"
              tone={overstayCount > 0 ? "danger" : undefined}
            />
          </div>

          {rows.length === 0 ? (
            <Empty title="No visitors inside" hint="Everyone on the list has exited the premises." />
          ) : (
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th>Visitor</th>
                    <th>Host / flat</th>
                    <th>Purpose</th>
                    <th>Vehicle</th>
                    <th>Entry gate</th>
                    <th>Entered</th>
                    <th>Expected exit</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => {
                    const expected = expectedMs(row);
                    const over = isOverstay(row);
                    const enteredAt = row.lastEntry?.enteredAt;
                    const busy = busyId === row.id;
                    return (
                      <tr key={row.id} style={over ? { background: "rgba(239,68,68,0.08)" } : undefined}>
                        <td>
                          <strong>{row.visitorName}</strong>
                          <div className="small dim mono">{row.code}</div>
                        </td>
                        <td>
                          {row.residentName}
                          <div className="small dim">
                            Flat {row.flatNumber} · {row.blockName}
                          </div>
                        </td>
                        <td>
                          <Badge tone={purposeTone(row.purpose)}>{row.purpose || "Visit"}</Badge>
                        </td>
                        <td className="mono small">{row.vehicleNumber || "—"}</td>
                        <td>{row.lastEntry?.gate?.name ?? "—"}</td>
                        <td>
                          {fmtDate(enteredAt)}
                          {enteredAt && (
                            <div className="small dim">{fmtElapsed(now - Date.parse(enteredAt))} inside</div>
                          )}
                        </td>
                        <td>
                          {fmtDate(row.expectedExitAt)}
                          {over ? (
                            <div className="error-text">
                              overdue by {expected !== null ? fmtElapsed(now - expected) : "—"}
                            </div>
                          ) : expected !== null ? (
                            <div className="small dim">left {fmtElapsed(expected - now)}</div>
                          ) : (
                            <div className="small dim">no limit set</div>
                          )}
                        </td>
                        <td>
                          <button
                            className={`btn sm ${over ? "danger" : ""}`}
                            disabled={busy || !canExit || !gateId}
                            title={
                              !canExit
                                ? "Missing visitors:exit permission"
                                : !gateId
                                  ? "Select an exit gate first"
                                  : undefined
                            }
                            onClick={() => void recordExit(row)}
                          >
                            {busy ? "…" : `Exit${gateName ? ` via ${gateName}` : ""}`}
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          {list.data && <Pagination page={list.data.page} total={list.data.total} limit={LIMIT} onChange={setPage} />}
        </>
      )}
    </>
  );
}
