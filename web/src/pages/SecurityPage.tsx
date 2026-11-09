import { useState, type FormEvent } from "react";
import { useAuth } from "../lib/auth";
import { ApiError, get, post } from "../lib/api";
import { Badge, Card, ErrorView, Field, LoadingRow, PageHeader, useAsync, useToast } from "../components/ui";

interface MfaStatus {
  enabled: boolean;
  pendingSetup: boolean;
  recoveryCodesRemaining: number;
}

interface SetupData {
  secret: string;
  otpauthUrl: string;
  qrDataUrl: string;
}

function errText(err: unknown): string {
  return err instanceof ApiError ? err.message : "Something went wrong. Please try again.";
}

export default function SecurityPage() {
  const { user, refreshUser } = useAuth();
  const toast = useToast();
  const { data, error, loading, reload } = useAsync<MfaStatus>(() => get("/api/auth/mfa/status"), []);

  const [setup, setSetup] = useState<SetupData | null>(null);
  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");
  const [recoveryCodes, setRecoveryCodes] = useState<string[] | null>(null);
  const [disabling, setDisabling] = useState(false);
  const [regenerating, setRegenerating] = useState(false);
  const [regenCode, setRegenCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const enabled = data?.enabled ?? !!user?.mfaEnabled;

  const startSetup = async () => {
    setBusy(true);
    setFormError(null);
    setRecoveryCodes(null);
    try {
      const res = await post<SetupData>("/api/auth/mfa/setup");
      setSetup(res);
      setCode("");
      reload();
    } catch (err) {
      setFormError(errText(err));
    } finally {
      setBusy(false);
    }
  };

  const enable = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setFormError(null);
    try {
      const res = await post<{ recoveryCodes: string[] }>("/api/auth/mfa/enable", { code: code.trim() });
      setRecoveryCodes(res.recoveryCodes);
      setSetup(null);
      setCode("");
      await refreshUser();
      reload();
      toast.push("Two-factor authentication enabled", "success");
    } catch (err) {
      setFormError(errText(err));
    } finally {
      setBusy(false);
    }
  };

  const disable = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setFormError(null);
    try {
      await post("/api/auth/mfa/disable", { password, code: code.trim() });
      setPassword("");
      setCode("");
      setDisabling(false);
      setRecoveryCodes(null);
      await refreshUser();
      reload();
      toast.push("Two-factor authentication disabled", "success");
    } catch (err) {
      setFormError(errText(err));
    } finally {
      setBusy(false);
    }
  };

  const regenerate = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setFormError(null);
    try {
      const res = await post<{ recoveryCodes: string[] }>("/api/auth/mfa/recovery-codes", {
        code: regenCode.trim(),
      });
      setRecoveryCodes(res.recoveryCodes);
      setRegenerating(false);
      setRegenCode("");
      reload();
      toast.push("New recovery codes generated — save them now", "success");
    } catch (err) {
      setFormError(errText(err));
    } finally {
      setBusy(false);
    }
  };

  const copy = async (value: string, label: string) => {
    try {
      await navigator.clipboard.writeText(value);
      toast.push(`${label} copied`, "success");
    } catch {
      toast.push("Copy failed — select and copy manually", "warn");
    }
  };

  return (
    <>
      <PageHeader
        title="Security"
        subtitle={`Two-factor authentication for ${user?.email ?? "your account"}`}
      />

      {loading && !data && <LoadingRow label="Loading security settings…" />}
      {error && !data && <ErrorView error={error} onRetry={reload} />}

      {data && (
        <div className="grid cols-2">
          <Card
            title="Two-factor authentication"
            actions={<Badge tone={enabled ? "green" : "gray"}>{enabled ? "Enabled" : "Disabled"}</Badge>}
          >
            <p className="muted" style={{ marginTop: 0 }}>
              Protect your account with a time-based one-time code from an authenticator app such as
              Google Authenticator, Microsoft Authenticator, 1Password or Authy.
            </p>

            {recoveryCodes && (
              <div className="mb">
                <div className="banner lockdown mb" style={{ animation: "none" }}>
                  ⚠ Save these recovery codes now — each one can be used once if you lose your phone.
                </div>
                <div className="grid cols-2 mono small" style={{ marginBottom: 12 }}>
                  {recoveryCodes.map((c) => (
                    <div key={c} className="card" style={{ padding: "8px 10px", textAlign: "center" }}>
                      {c}
                    </div>
                  ))}
                </div>
                <div className="row gap-sm">
                  <button className="btn" onClick={() => void copy(recoveryCodes.join("\n"), "Recovery codes")}>
                    Copy codes
                  </button>
                  <button className="btn primary" onClick={() => setRecoveryCodes(null)}>
                    I have saved them
                  </button>
                </div>
              </div>
            )}

            {!enabled && !setup && !recoveryCodes && (
              <>
                <p className="small dim">
                  Two-factor authentication is currently off. Enrol your authenticator app to require a
                  code at every sign-in.
                </p>
                {formError && <div className="error-text mb">{formError}</div>}
                <button className="btn primary" disabled={busy} onClick={() => void startSetup()}>
                  {busy ? "Preparing…" : "Set up two-factor authentication"}
                </button>
              </>
            )}

            {!enabled && setup && (
              <form onSubmit={enable}>
                <ol className="small muted" style={{ margin: "0 0 12px 18px", padding: 0 }}>
                  <li>Scan this QR code with your authenticator app.</li>
                  <li>Enter the 6-digit code shown by the app.</li>
                </ol>
                <div className="row" style={{ justifyContent: "center", marginBottom: 12 }}>
                  <img
                    src={setup.qrDataUrl}
                    alt="Two-factor authentication QR code"
                    width={220}
                    height={220}
                    style={{ borderRadius: 10, background: "#fff", padding: 6 }}
                  />
                </div>
                <Field label="Can't scan? Enter this key manually">
                  <div className="row gap-sm">
                    <input className="input mono" readOnly value={setup.secret} onFocus={(e) => e.currentTarget.select()} />
                    <button type="button" className="btn" onClick={() => void copy(setup.secret, "Setup key")}>
                      Copy
                    </button>
                  </div>
                </Field>
                <Field label="Verification code" hint="6 digits, refreshed every 30 seconds">
                  <input
                    className="input mono"
                    value={code}
                    onChange={(e) => setCode(e.target.value)}
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    maxLength={6}
                    placeholder="123456"
                    autoFocus
                    required
                  />
                </Field>
                {formError && <div className="error-text mb">{formError}</div>}
                <div className="row gap-sm">
                  <button className="btn primary" disabled={busy || code.trim().length !== 6}>
                    {busy ? "Verifying…" : "Enable two-factor authentication"}
                  </button>
                  <button
                    type="button"
                    className="btn ghost"
                    disabled={busy}
                    onClick={() => {
                      setSetup(null);
                      setCode("");
                      setFormError(null);
                    }}
                  >
                    Cancel
                  </button>
                </div>
              </form>
            )}

            {enabled && !recoveryCodes && !disabling && !regenerating && (
              <>
                <p className="small dim">
                  {data.recoveryCodesRemaining} recovery code{data.recoveryCodesRemaining === 1 ? "" : "s"} remaining.
                </p>
                <div className="row gap-sm wrap">
                  <button
                    className="btn"
                    onClick={() => {
                      setRegenerating(true);
                      setFormError(null);
                      setRegenCode("");
                    }}
                  >
                    Regenerate recovery codes
                  </button>
                  <button className="btn danger" onClick={() => { setDisabling(true); setFormError(null); setCode(""); }}>
                    Disable two-factor authentication
                  </button>
                </div>
                <p className="hint mt">
                  Lost your recovery codes? Regenerate a fresh set with a current authenticator code. The
                  old codes stop working immediately.
                </p>
              </>
            )}

            {enabled && regenerating && (
              <form onSubmit={regenerate}>
                <p className="small dim">
                  Enter a current 6-digit code from your authenticator app. Your previous recovery codes
                  will be invalidated.
                </p>
                <Field label="Authenticator code">
                  <input
                    className="input mono"
                    value={regenCode}
                    onChange={(e) => setRegenCode(e.target.value)}
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    maxLength={6}
                    placeholder="123456"
                    autoFocus
                    required
                  />
                </Field>
                {formError && <div className="error-text mb">{formError}</div>}
                <div className="row gap-sm">
                  <button className="btn primary" disabled={busy || regenCode.trim().length !== 6}>
                    {busy ? "Generating…" : "Generate new recovery codes"}
                  </button>
                  <button
                    type="button"
                    className="btn ghost"
                    disabled={busy}
                    onClick={() => {
                      setRegenerating(false);
                      setRegenCode("");
                      setFormError(null);
                    }}
                  >
                    Cancel
                  </button>
                </div>
              </form>
            )}

            {enabled && disabling && (
              <form onSubmit={disable}>
                <p className="small dim">
                  Confirm your password and a current authenticator or recovery code to turn MFA off.
                </p>
                <Field label="Password">
                  <input
                    className="input"
                    type="password"
                    autoComplete="current-password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                  />
                </Field>
                <Field label="Authenticator or recovery code">
                  <input
                    className="input mono"
                    value={code}
                    onChange={(e) => setCode(e.target.value)}
                    maxLength={24}
                    placeholder="123456"
                    required
                  />
                </Field>
                {formError && <div className="error-text mb">{formError}</div>}
                <div className="row gap-sm">
                  <button className="btn danger" disabled={busy}>
                    {busy ? "Disabling…" : "Disable MFA"}
                  </button>
                  <button
                    type="button"
                    className="btn ghost"
                    onClick={() => {
                      setDisabling(false);
                      setPassword("");
                      setCode("");
                      setFormError(null);
                    }}
                  >
                    Cancel
                  </button>
                </div>
              </form>
            )}
          </Card>

          <Card title="Account">
            <Field label="Email">
              <input className="input" value={user?.email ?? ""} readOnly />
            </Field>
            <Field label="Role">
              <input className="input" value={user?.role ?? ""} readOnly />
            </Field>
            <p className="small dim">
              Need to change your password? Use the key button in the top bar or open{" "}
              <a href="/account/password">Change password</a>.
            </p>
          </Card>
        </div>
      )}
    </>
  );
}
