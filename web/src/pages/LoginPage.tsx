import { useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../lib/auth";
import { ApiError } from "../lib/api";
import { Field } from "../components/ui";

const DEMO = [
  ["Super admin", "superadmin@secureresident.local"],
  ["Admin", "admin@secureresident.local"],
  ["Security", "security@secureresident.local"],
  ["Guard", "guard1@secureresident.local"],
  ["Resident", "ali@resident.local"],
];

function roleHome(role: string): string {
  return role === "RESIDENT" ? "/resident" : role === "GUARD" ? "/guard/verify" : "/security";
}

function errorText(err: unknown): string {
  if (!(err instanceof ApiError)) return "Unable to reach the server";
  switch (err.code) {
    case "ACCOUNT_LOCKED":
      return err.message;
    case "ACCOUNT_DISABLED":
      return "This account has been disabled. Contact the administrator.";
    case "INVALID_MFA_CODE":
      return "That verification code is not valid. Check your device clock and try again.";
    case "MFA_CHALLENGE_EXPIRED":
      return "Your verification window expired. Please sign in again.";
    case "MFA_CHALLENGE_INVALID":
      return "That verification session is invalid. Please sign in again.";
    default:
      return err.message;
  }
}

export default function LoginPage() {
  const { login, completeMfa } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState("guard1@secureresident.local");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [challenge, setChallenge] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [recovery, setRecovery] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      if (challenge) {
        const user = await completeMfa(challenge, code.trim());
        navigate(roleHome(user.role), { replace: true });
        return;
      }
      const res = await login(email.trim(), password);
      if (res.mfaRequired && res.challengeToken) {
        setChallenge(res.challengeToken);
        setCode("");
        setPassword("");
        return;
      }
      if (res.user) navigate(roleHome(res.user.role), { replace: true });
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="login-page">
      <div className="col" style={{ width: "min(420px, 100%)" }}>
        <div className="row" style={{ justifyContent: "center", gap: 12 }}>
          <div className="brand-mark" style={{ width: 42, height: 42, fontSize: 18 }}>
            SR
          </div>
          <div>
            <div style={{ fontSize: 22, fontWeight: 800 }}>SecureResident</div>
            <div className="small dim">Apartment security & visitor management</div>
          </div>
        </div>

        {challenge ? (
          <form className="card login-card" onSubmit={submit}>
            <h2 style={{ marginBottom: 8 }}>Two-factor verification</h2>
            <div className="small dim mb">
              Enter the {recovery ? "recovery code" : "6-digit code from your authenticator app"} for{" "}
              <strong>{email}</strong>.
            </div>
            <Field label={recovery ? "Recovery code" : "Authentication code"}>
              <input
                className="input mono"
                value={code}
                onChange={(e) => setCode(e.target.value)}
                inputMode={recovery ? "text" : "numeric"}
                autoComplete="one-time-code"
                autoFocus
                maxLength={recovery ? 24 : 6}
                placeholder={recovery ? "XXXX-XXXX" : "123456"}
                required
              />
            </Field>
            {error && <div className="error-text mb">{error}</div>}
            <button className="btn primary block lg" disabled={busy || code.trim().length === 0}>
              {busy ? "Verifying…" : "Verify and sign in"}
            </button>
            <div className="row between wrap mt">
              <button
                type="button"
                className="btn ghost sm"
                onClick={() => {
                  setChallenge(null);
                  setCode("");
                  setError(null);
                  setRecovery(false);
                }}
              >
                ← Back
              </button>
              <button
                type="button"
                className="btn ghost sm"
                onClick={() => {
                  setRecovery((r) => !r);
                  setCode("");
                  setError(null);
                }}
              >
                {recovery ? "Use authenticator code" : "Use a recovery code"}
              </button>
            </div>
          </form>
        ) : (
          <>
            <form className="card login-card" onSubmit={submit}>
              <h2 style={{ marginBottom: 14 }}>Sign in</h2>
              <Field label="Email">
                <input
                  className="input"
                  type="email"
                  autoComplete="username"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@residence.local"
                  required
                />
              </Field>
              <Field label="Password">
                <input
                  className="input"
                  type="password"
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••••••"
                  required
                />
              </Field>
              {error && <div className="error-text mb">{error}</div>}
              <button className="btn primary block lg" disabled={busy}>
                {busy ? "Signing in…" : "Sign in"}
              </button>
              <div className="hint mt center">
                Accounts lock for 15 minutes after 5 failed attempts.
              </div>
            </form>

            <div className="card login-card">
              <div className="small dim mb">Demo accounts — password: Secure@Demo123!</div>
              <div className="col gap-sm">
                {DEMO.map(([label, mail]) => (
                  <button
                    key={mail}
                    className="btn ghost sm"
                    style={{ justifyContent: "space-between" }}
                    onClick={() => {
                      setEmail(mail);
                      setPassword("Secure@Demo123!");
                    }}
                  >
                    <span>{label}</span>
                    <span className="mono dim">{mail}</span>
                  </button>
                ))}
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
