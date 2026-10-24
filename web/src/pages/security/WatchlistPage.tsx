import { useState } from "react";
import { useAsync, PageHeader, Card, Stat, Badge, LoadingRow, ErrorView, Empty, Modal, Field, Pagination, useToast } from "../../components/ui";
import { get, post, del, ApiError, type Page } from "../../lib/api";
import { useAuth } from "../../lib/auth";
import { fmtDate, statusColor } from "../../lib/format";

interface WatchRow {
  id: string;
  name?: string | null;
  phone?: string | null;
  vehicle?: string | null;
  reason: string;
  level: string;
  status: string;
  createdById: string;
  createdAt: string;
  createdBy?: { id: string; name: string } | null;
}

interface LevelCounts {
  blocked: number;
  watchlist: number;
  restricted: number;
}

const LEVELS = ["BLOCKED", "WATCHLIST", "RESTRICTED"] as const;
type Level = (typeof LEVELS)[number];

const LEVEL_TONE: Record<string, string> = {
  BLOCKED: "red",
  WATCHLIST: "amber",
  RESTRICTED: "blue",
};

const LIMIT = 15;

const LEVEL_COPY: Record<Level, string> = {
  BLOCKED: "Verification fails immediately — entry is refused at the gate, no override.",
  WATCHLIST: "Escalates the approval policy for the visitor and raises a security alert at the gate.",
  RESTRICTED: "Flags the visitor for officer review; entry still needs a security decision.",
};

function levelTone(level: string): string {
  return LEVEL_TONE[level] ?? "gray";
}

export default function WatchlistPage() {
  const toast = useToast();
  const { has } = useAuth();
  const canManage = has("watchlist:manage");

  const [page, setPage] = useState(1);
  const [level, setLevel] = useState("");
  const [search, setSearch] = useState("");
  const [appliedSearch, setAppliedSearch] = useState("");

  const [createOpen, setCreateOpen] = useState(false);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [vehicle, setVehicle] = useState("");
  const [reason, setReason] = useState("");
  const [entryLevel, setEntryLevel] = useState<Level>("WATCHLIST");
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [removing, setRemoving] = useState<WatchRow | null>(null);

  const list = useAsync<Page<WatchRow>>(() => {
    const qs = new URLSearchParams({ page: String(page), limit: String(LIMIT) });
    if (level) qs.set("level", level);
    if (appliedSearch) qs.set("q", appliedSearch);
    return get(`/api/security/watchlist?${qs.toString()}`);
  }, [page, level, appliedSearch]);

  const counts = useAsync<LevelCounts>(async () => {
    const [b, w, r] = await Promise.all([
      get<Page<unknown>>("/api/security/watchlist?level=BLOCKED&limit=1"),
      get<Page<unknown>>("/api/security/watchlist?level=WATCHLIST&limit=1"),
      get<Page<unknown>>("/api/security/watchlist?level=RESTRICTED&limit=1"),
    ]);
    return { blocked: b.total, watchlist: w.total, restricted: r.total };
  }, []);

  const resetForm = () => {
    setName("");
    setPhone("");
    setVehicle("");
    setReason("");
    setEntryLevel("WATCHLIST");
    setFormError(null);
  };

  const create = async () => {
    if (!name.trim() && !phone.trim() && !vehicle.trim()) {
      setFormError("Provide at least a name, phone or vehicle so the visitor can be matched.");
      return;
    }
    if (reason.trim().length < 3) {
      setFormError("A reason of at least 3 characters is required.");
      return;
    }
    setBusy(true);
    setFormError(null);
    try {
      await post("/api/security/watchlist", {
        ...(name.trim() ? { name: name.trim() } : {}),
        ...(phone.trim() ? { phone: phone.trim() } : {}),
        ...(vehicle.trim() ? { vehicle: vehicle.trim().toUpperCase() } : {}),
        reason: reason.trim(),
        level: entryLevel,
      });
      toast.push("Added to watchlist", "success");
      setCreateOpen(false);
      resetForm();
      list.reload();
      counts.reload();
    } catch (e) {
      setFormError(e instanceof ApiError ? e.message : "Could not add the entry");
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    if (!removing) return;
    setBusy(true);
    try {
      await del(`/api/security/watchlist/${removing.id}`);
      toast.push(`${removing.name ?? removing.vehicle ?? removing.phone ?? "Entry"} removed from the watchlist`, "success");
      setRemoving(null);
      list.reload();
      counts.reload();
    } catch (e) {
      toast.push(e instanceof ApiError ? e.message : "Could not remove the entry", "error");
    } finally {
      setBusy(false);
    }
  };

  const rows = list.data?.items ?? [];

  return (
    <>
      <PageHeader
        title="Security watchlist"
        subtitle="People and vehicles that need extra attention at the gate"
        actions={
          canManage ? (
            <button
              className="btn primary"
              onClick={() => {
                resetForm();
                setCreateOpen(true);
              }}
            >
              ＋ Add entry
            </button>
          ) : (
            <Badge tone="gray">VIEW ONLY</Badge>
          )
        }
      />

      <div className="grid cols-3 mb">
        <Stat label="Blocked" value={counts.data?.blocked ?? "—"} tone={(counts.data?.blocked ?? 0) > 0 ? "danger" : undefined} hint="refused at verification" />
        <Stat label="Watchlist" value={counts.data?.watchlist ?? "—"} tone={(counts.data?.watchlist ?? 0) > 0 ? "warn" : undefined} hint="escalated approval policy" />
        <Stat label="Restricted" value={counts.data?.restricted ?? "—"} hint="officer review required" />
      </div>

      <div className="mb">
        <Card title="How the levels work">
          <div className="col" style={{ gap: 6 }}>
            {LEVELS.map((l) => (
              <div key={l} className="row gap-sm wrap">
                <Badge tone={levelTone(l)}>{l}</Badge>
                <span className="small muted">{LEVEL_COPY[l]}</span>
              </div>
            ))}
          </div>
        </Card>
      </div>

      <div className="pill-tabs">
        <button className={`pill-tab ${level === "" ? "active" : ""}`} onClick={() => { setLevel(""); setPage(1); }}>
          All levels
        </button>
        {LEVELS.map((l) => (
          <button key={l} className={`pill-tab ${level === l ? "active" : ""}`} onClick={() => { setLevel(l); setPage(1); }}>
            {l}
          </button>
        ))}
      </div>

      <div className="row gap-sm wrap mb">
        <input
          className="input"
          style={{ maxWidth: 300 }}
          placeholder="Search name, phone or vehicle…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              setPage(1);
              setAppliedSearch(search.trim());
            }
          }}
        />
        <button
          className="btn"
          onClick={() => {
            setPage(1);
            setAppliedSearch(search.trim());
          }}
        >
          Search
        </button>
        {appliedSearch && (
          <button
            className="btn ghost"
            onClick={() => {
              setSearch("");
              setAppliedSearch("");
              setPage(1);
            }}
          >
            Clear
          </button>
        )}
      </div>

      {list.loading ? (
        <LoadingRow />
      ) : list.error ? (
        <ErrorView error={list.error} onRetry={list.reload} />
      ) : rows.length === 0 ? (
        <Empty title="No watchlist entries" hint="Add a name, phone number or vehicle that gate staff should watch for." />
      ) : (
        <>
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Subject</th>
                  <th>Level</th>
                  <th>Reason</th>
                  <th>Status</th>
                  <th>Added by</th>
                  <th>Added</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => {
                  const subject = [r.name, r.phone, r.vehicle].filter(Boolean).join(" · ");
                  return (
                    <tr key={r.id}>
                      <td>
                        {r.name && <div><strong>{r.name}</strong></div>}
                        {r.phone && <div className="small">{r.phone}</div>}
                        {r.vehicle && <div className="small mono">{r.vehicle}</div>}
                        {!subject && <span className="dim">Unnamed entry</span>}
                      </td>
                      <td>
                        <Badge tone={levelTone(r.level)}>{r.level}</Badge>
                      </td>
                      <td style={{ minWidth: 220 }}>{r.reason}</td>
                      <td>
                        <Badge tone={statusColor(r.status)}>{r.status}</Badge>
                      </td>
                      <td>{r.createdBy?.name ?? "—"}</td>
                      <td className="small">{fmtDate(r.createdAt)}</td>
                      <td>
                        <div className="row gap-sm" style={{ justifyContent: "flex-end" }}>
                          {canManage && (
                            <button className="btn sm danger" onClick={() => setRemoving(r)}>
                              Remove
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
          <Pagination page={list.data?.page ?? page} total={list.data?.total ?? 0} limit={LIMIT} onChange={setPage} />
        </>
      )}

      <Modal
        open={createOpen}
        title="Add to watchlist"
        onClose={() => setCreateOpen(false)}
        footer={
          <>
            <button className="btn ghost" onClick={() => setCreateOpen(false)}>
              Cancel
            </button>
            <button className="btn primary" disabled={busy} onClick={() => void create()}>
              Add entry
            </button>
          </>
        }
      >
        <p className="muted">Provide at least one identifier so the gate scan can match this entry.</p>
        <Field label="Name">
          <input className="input" value={name} onChange={(e) => setName(e.target.value)} maxLength={120} />
        </Field>
        <Field label="Phone">
          <input className="input" value={phone} onChange={(e) => setPhone(e.target.value)} maxLength={30} />
        </Field>
        <Field label="Vehicle">
          <input className="input" value={vehicle} onChange={(e) => setVehicle(e.target.value)} maxLength={20} placeholder="ABC-1234" />
        </Field>
        <Field label="Reason *">
          <textarea className="textarea" value={reason} onChange={(e) => setReason(e.target.value)} maxLength={300} />
        </Field>
        <Field label="Level *" hint={LEVEL_COPY[entryLevel]}>
          <select className="select" value={entryLevel} onChange={(e) => setEntryLevel(e.target.value as Level)}>
            {LEVELS.map((l) => (
              <option key={l} value={l}>
                {l}
              </option>
            ))}
          </select>
        </Field>
        {formError && <div className="error-text">{formError}</div>}
      </Modal>

      <Modal
        open={!!removing}
        title="Remove watchlist entry"
        onClose={() => setRemoving(null)}
        footer={
          <>
            <button className="btn ghost" onClick={() => setRemoving(null)}>
              Keep
            </button>
            <button className="btn danger" disabled={busy} onClick={() => void remove()}>
              Remove entry
            </button>
          </>
        }
      >
        <p className="muted">
          {removing ? [removing.name, removing.phone, removing.vehicle].filter(Boolean).join(" · ") : ""} will no longer
          be flagged at the gate.
        </p>
        <p className="small dim">Reason: {removing?.reason}</p>
      </Modal>
    </>
  );
}
