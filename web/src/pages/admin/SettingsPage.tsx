import { useEffect, useState, type FormEvent } from "react";
import { Card, ErrorView, Field, LoadingRow, PageHeader, useAsync, useToast } from "../../components/ui";
import { get, put } from "../../lib/api";
import { useAuth } from "../../lib/auth";

type SettingsMap = Record<string, string>;

const NUMBER_KEYS = [
  "overstayGraceMinutes",
  "visitorDataRetentionDays",
  "maxInvitationDaysAhead",
  "invitationDefaultDurationMinutes",
  "invitationArrivalWindowMinutes",
] as const;

const APPROVAL_POLICIES = ["AUTO", "RESIDENT", "SECURITY", "BOTH"];

function isNumberKey(key: string): boolean {
  return (NUMBER_KEYS as readonly string[]).includes(key);
}

function errText(err: unknown): string {
  return err instanceof Error ? err.message : "Request failed";
}

function ToggleRow({
  label,
  hint,
  checked,
  onChange,
  disabled,
}: {
  label: string;
  hint?: string;
  checked: boolean;
  onChange: (value: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <label
      className="row between wrap"
      style={{ padding: "6px 0", cursor: disabled ? "not-allowed" : "pointer", opacity: disabled ? 0.65 : 1 }}
    >
      <span>
        <span style={{ fontWeight: 600 }}>{label}</span>
        {hint && <div className="small dim">{hint}</div>}
      </span>
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
      />
    </label>
  );
}

export default function SettingsPage() {
  const { has, user } = useAuth();
  const toast = useToast();
  // The super admin always gets write access (the server enforces the same rule).
  const canWrite = user?.role === "SUPER_ADMIN" || has("settings:write");

  const { data, error, loading, reload } = useAsync<SettingsMap>(() => get("/api/settings"), []);
  const [draft, setDraft] = useState<SettingsMap | null>(null);
  const [showKey, setShowKey] = useState(false);
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  useEffect(() => {
    if (data) setDraft({ ...data });
  }, [data]);

  const setValue = (key: string, value: string) => {
    setDraft((d) => (d ? { ...d, [key]: value } : d));
    setFormError(null);
  };

  const changedKeys = draft && data ? Object.keys(draft).filter((k) => draft[k] !== data[k]) : [];

  const save = async (e: FormEvent) => {
    e.preventDefault();
    if (!draft || !data) return;
    setFormError(null);
    const payload: SettingsMap = {};
    for (const key of Object.keys(draft)) {
      if (draft[key] === data[key]) continue;
      if (isNumberKey(key)) {
        const n = Number(draft[key]);
        if (!Number.isFinite(n) || n < 0) {
          setFormError(`${key} must be a valid non-negative number`);
          return;
        }
      }
      payload[key] = draft[key];
    }
    if (Object.keys(payload).length === 0) {
      toast.push("No changes to save", "info");
      return;
    }
    setBusy(true);
    try {
      await put("/api/settings", payload);
      toast.push(`Saved ${Object.keys(payload).length} setting(s)`, "success");
      reload();
    } catch (err) {
      const message = errText(err);
      setFormError(message);
      toast.push(message, "error");
    } finally {
      setBusy(false);
    }
  };

  if (error && !draft) return <ErrorView error={error} onRetry={reload} />;
  if (!draft) {
    return (
      <>
        <PageHeader title="Settings" subtitle="System-wide configuration" />
        <LoadingRow label="Loading settings…" />
      </>
    );
  }

  const num = (key: string): string => draft[key] ?? "";

  return (
    <>
      <PageHeader
        title="Settings"
        subtitle="System-wide configuration stored as key/value pairs"
        actions={
          canWrite ? (
            <button className="btn primary" form="settings-form" type="submit" formNoValidate disabled={busy || changedKeys.length === 0}>
              {busy ? "Saving…" : changedKeys.length > 0 ? `Save ${changedKeys.length} change(s)` : "Save changes"}
            </button>
          ) : undefined
        }
      />

      {!canWrite && (
        <div className="banner" style={{ marginBottom: 14, borderColor: "var(--border-soft)", background: "var(--panel-2)", color: "var(--text-2)" }}>
          <span>🔒</span>
          <span className="grow">Read-only — your role can view system settings but not change them.</span>
        </div>
      )}

      <form id="settings-form" onSubmit={save}>
        <div className="grid cols-2">
          <Card title="General">
            <Field label="System name">
              <input
                className="input"
                value={draft.systemName ?? ""}
                onChange={(e) => setValue("systemName", e.target.value)}
                maxLength={80}
                disabled={!canWrite}
              />
            </Field>
            <Field label="Approval policy" hint="Who must approve a visitor invitation by default.">
              <select
                className="select"
                value={draft.approvalPolicy ?? "RESIDENT"}
                onChange={(e) => setValue("approvalPolicy", e.target.value)}
                disabled={!canWrite}
              >
                {APPROVAL_POLICIES.map((p) => (
                  <option key={p} value={p}>
                    {p}
                  </option>
                ))}
              </select>
            </Field>
          </Card>

          <Card title="Visitor invitations">
            <div className="grid cols-2">
              <Field label="Max days ahead">
                <input
                  className="input"
                  type="number"
                  min={0}
                  value={num("maxInvitationDaysAhead")}
                  onChange={(e) => setValue("maxInvitationDaysAhead", e.target.value)}
                  disabled={!canWrite}
                />
              </Field>
              <Field label="Default duration (min)">
                <input
                  className="input"
                  type="number"
                  min={0}
                  value={num("invitationDefaultDurationMinutes")}
                  onChange={(e) => setValue("invitationDefaultDurationMinutes", e.target.value)}
                  disabled={!canWrite}
                />
              </Field>
              <Field label="Arrival window (min)">
                <input
                  className="input"
                  type="number"
                  min={0}
                  value={num("invitationArrivalWindowMinutes")}
                  onChange={(e) => setValue("invitationArrivalWindowMinutes", e.target.value)}
                  disabled={!canWrite}
                />
              </Field>
            </div>
            <div className="divider" />
            <ToggleRow
              label="Allow invitation extension"
              hint="Residents and security can extend an expected arrival."
              checked={draft.allowInvitationExtension === "true"}
              onChange={(v) => setValue("allowInvitationExtension", String(v))}
              disabled={!canWrite}
            />
            <ToggleRow
              label="Require vehicle number"
              hint="Vehicle registration becomes mandatory when creating an invitation."
              checked={draft.requireVehicleNumber === "true"}
              onChange={(v) => setValue("requireVehicleNumber", String(v))}
              disabled={!canWrite}
            />
          </Card>

          <Card title="Overstay & data retention">
            <ToggleRow
              label="Overstay detection"
              hint="Raise an alert when a visitor stays past the expected window."
              checked={draft.overstayEnabled === "true"}
              onChange={(v) => setValue("overstayEnabled", String(v))}
              disabled={!canWrite}
            />
            <div className="grid cols-2">
              <Field label="Grace period (min)">
                <input
                  className="input"
                  type="number"
                  min={0}
                  value={num("overstayGraceMinutes")}
                  onChange={(e) => setValue("overstayGraceMinutes", e.target.value)}
                  disabled={!canWrite}
                />
              </Field>
              <Field label="Visitor data retention (days)">
                <input
                  className="input"
                  type="number"
                  min={0}
                  value={num("visitorDataRetentionDays")}
                  onChange={(e) => setValue("visitorDataRetentionDays", e.target.value)}
                  disabled={!canWrite}
                />
              </Field>
            </div>
            <ToggleRow
              label="Anonymize on retention expiry"
              hint="Old visitor records are anonymised instead of kept in full."
              checked={draft.retentionAnonymizationEnabled === "true"}
              onChange={(v) => setValue("retentionAnonymizationEnabled", String(v))}
              disabled={!canWrite}
            />
          </Card>

          <Card title="Alerts & notifications">
            <ToggleRow
              label="Voice alerts"
              hint="Play spoken warnings on staff devices for critical events."
              checked={draft.voiceAlertsEnabled === "true"}
              onChange={(v) => setValue("voiceAlertsEnabled", String(v))}
              disabled={!canWrite}
            />
            <Field label="Notification channels" hint="Comma-separated: IN_APP, PUSH, EMAIL, SMS, WHATSAPP">
              <input
                className="input mono"
                value={draft.notifyChannels ?? ""}
                onChange={(e) => setValue("notifyChannels", e.target.value)}
                disabled={!canWrite}
              />
            </Field>
            <Field label="Alert channels" hint="Comma-separated: IN_APP, PUSH, EMAIL, SMS, WHATSAPP">
              <input
                className="input mono"
                value={draft.alertChannels ?? ""}
                onChange={(e) => setValue("alertChannels", e.target.value)}
                disabled={!canWrite}
              />
            </Field>
          </Card>

          <Card title="Integrations" style={{ gridColumn: "span 2" }}>
            <Field
              label="Detector API key"
              hint="Sent as x-api-key by cameras and AI analytics to POST /api/integrations/detector-events."
            >
              <div className="row gap-sm">
                <input
                  className="input mono"
                  type={showKey ? "text" : "password"}
                  value={draft.integrationApiKey ?? ""}
                  onChange={(e) => setValue("integrationApiKey", e.target.value)}
                  disabled={!canWrite}
                  autoComplete="off"
                />
                <button
                  type="button"
                  className="btn sm"
                  onClick={() => setShowKey((s) => !s)}
                  aria-label={showKey ? "Hide key" : "Show key"}
                >
                  {showKey ? "Hide" : "Show"}
                </button>
              </div>
            </Field>
          </Card>
        </div>

        {formError && <div className="error-text mt">{formError}</div>}
        {loading && <div className="small dim mt">Reloading settings…</div>}
      </form>
    </>
  );
}
