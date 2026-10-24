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

export default function LoginPage() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState("guard1@secureresident.local");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const user = await login(email.trim(), password);
      const home =
        user.role === "RESIDENT" ? "/resident" : user.role === "GUARD" ? "/guard/verify" : "/security";
      navigate(home, { replace: true });
    } catch (err) {
      if (err instanceof ApiError) {
        setError(
          err.code === "ACCOUNT_LOCKED"
            ? err.message
            : err.code === "ACCOUNT_DISABLED"
              ? "This account has been disabled. Contact the administrator."
              : err.message,
        );
      } else {
        setError("Unable to reach the server");
      }
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
      </div>
    </div>
  );
}
