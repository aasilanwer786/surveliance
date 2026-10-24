import { useState } from "react";
import { useAsync, PageHeader, Card, Stat, LoadingRow, ErrorView, Empty, useToast } from "../../components/ui";
import { get, ApiError } from "../../lib/api";
import { fmtDate } from "../../lib/format";

interface ReportRes {
  report: string;
  generatedAt: string;
  total: number;
  items: Array<Record<string, unknown>>;
}

const SNAPSHOT_REPORTS = ["currently-inside", "missing-exits"];

const PREVIEW_LIMIT = 100;

function label(name: string): string {
  const s = name.replace(/-/g, " ");
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function cell(value: unknown): string {
  if (value === null || value === undefined || value === "") return "—";
  if (typeof value === "string") {
    if (/^\d{4}-\d{2}-\d{2}T/.test(value)) {
      const t = Date.parse(value);
      if (!Number.isNaN(t)) return fmtDate(value);
    }
    return value;
  }
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

function dayString(offsetDays: number): string {
  return new Date(Date.now() + offsetDays * 86400000).toISOString().slice(0, 10);
}

export default function ReportsPage() {
  const toast = useToast();

  const [report, setReport] = useState("daily-visitors");
  const [from, setFrom] = useState(() => dayString(-7));
  const [to, setTo] = useState(() => dayString(0));
  const [result, setResult] = useState<ReportRes | null>(null);
  const [running, setRunning] = useState(false);
  const [runError, setRunError] = useState<unknown>(null);
  const [exporting, setExporting] = useState(false);

  const available = useAsync<{ items: string[] }>(() => get("/api/reports"), []);

  const rangeless = SNAPSHOT_REPORTS.includes(report);

  const buildQuery = (format: "json" | "csv"): string => {
    const qs = new URLSearchParams({ format });
    if (!rangeless) {
      if (from) qs.set("from", `${from}T00:00:00`);
      if (to) qs.set("to", `${to}T23:59:59`);
    }
    return qs.toString();
  };

  const run = async () => {
    setRunning(true);
    setRunError(null);
    try {
      const res = await get<ReportRes>(`/api/reports/${report}?${buildQuery("json")}`);
      setResult(res);
    } catch (e) {
      setRunError(e);
      setResult(null);
    } finally {
      setRunning(false);
    }
  };

  const exportCsv = async () => {
    setExporting(true);
    try {
      const csv = await get<string>(`/api/reports/${report}?${buildQuery("csv")}`);
      const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `${report}-${to || "export"}.csv`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
      toast.push(`${label(report)} exported as CSV`, "success");
    } catch (e) {
      toast.push(e instanceof ApiError ? e.message : "CSV export failed", "error");
    } finally {
      setExporting(false);
    }
  };

  const columns = result && result.items.length > 0 ? Object.keys(result.items[0]) : [];
  const preview = result ? result.items.slice(0, PREVIEW_LIMIT) : [];

  return (
    <>
      <PageHeader
        title="Reports"
        subtitle="Visitor, alert and incident reports for the selected period"
      />

      <div className="mb">
        <Card title="Parameters">
        <div className="row gap-sm wrap" style={{ alignItems: "flex-end" }}>
          <div className="field" style={{ marginBottom: 0, minWidth: 220 }}>
            <label className="label">Report</label>
            <select className="select" value={report} onChange={(e) => { setReport(e.target.value); setResult(null); }}>
              {available.loading && <option value={report}>{label(report)}</option>}
              {(available.data?.items ?? []).map((r) => (
                <option key={r} value={r}>
                  {label(r)}
                </option>
              ))}
            </select>
          </div>
          <div className="field" style={{ marginBottom: 0 }}>
            <label className="label">From</label>
            <input
              className="input"
              type="date"
              value={from}
              disabled={rangeless}
              onChange={(e) => setFrom(e.target.value)}
            />
          </div>
          <div className="field" style={{ marginBottom: 0 }}>
            <label className="label">To</label>
            <input className="input" type="date" value={to} disabled={rangeless} onChange={(e) => setTo(e.target.value)} />
          </div>
          <button className="btn primary" disabled={running} onClick={() => void run()}>
            {running ? "Running…" : "Run report"}
          </button>
          <button className="btn" disabled={exporting || running} onClick={() => void exportCsv()}>
            {exporting ? "Preparing…" : "Export CSV"}
          </button>
        </div>
        <div className="hint mt">
          {rangeless
            ? "This report is a point-in-time snapshot, so the date range does not apply."
            : `Date range is applied to the report query (${from || "start"} → ${to || "now"}).`}
        </div>
        </Card>
      </div>

      {available.error && <ErrorView error={available.error} onRetry={available.reload} />}

      {running ? (
        <LoadingRow label="Generating report…" />
      ) : runError ? (
        <ErrorView error={runError} onRetry={() => void run()} />
      ) : !result ? (
        <Empty title="No report yet" hint="Choose a report type and date range, then press Run report." />
      ) : result.items.length === 0 ? (
        <>
          <div className="grid cols-3 mb">
            <Stat label="Rows" value={result.total} hint="records matched" />
            <Stat label="Report" value={label(result.report)} hint={`${from} → ${to}`} />
            <Stat label="Generated" value={fmtDate(result.generatedAt)} hint="server time" />
          </div>
          <Empty title="No rows in this period" hint="Widen the date range or pick a different report." />
        </>
      ) : (
        <>
          <div className="grid cols-4 mb">
            <Stat label="Rows" value={result.total} hint="records matched" />
            <Stat label="Columns" value={columns.length} hint="fields returned" />
            <Stat label="Report" value={label(result.report)} hint={rangeless ? "snapshot" : `${from} → ${to}`} />
            <Stat label="Generated" value={fmtDate(result.generatedAt)} hint="server time" />
          </div>

          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  {columns.map((c) => (
                    <th key={c}>{c.replace(/([A-Z])/g, " $1").replace(/_/g, " ")}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {preview.map((row, i) => (
                  <tr key={i}>
                    {columns.map((c) => (
<td key={c} className="small">
                      {cell(row[c])}
                    </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {result.items.length > PREVIEW_LIMIT && (
            <div className="hint mt">
              Showing the first {PREVIEW_LIMIT} of {result.total} rows. Use Export CSV for the complete report.
            </div>
          )}
        </>
      )}
    </>
  );
}
