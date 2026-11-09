import { useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth, roleName } from "../lib/auth";
import { ApiError } from "../lib/api";
import { useToast, Card, Field, PageHeader } from "../components/ui";

const RULES = [
  "At least 10 characters",
  "One uppercase and one lowercase letter",
  "One digit and one symbol",
  "Not a commonly used password",
];

export default function ChangePasswordPage() {
  const { user, changePassword } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();

  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const mustChange = !!user?.mustChangePassword;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    if (next !== confirm) {
      setError("New password and confirmation do not match.");
      return;
    }
    if (next === current) {
      setError("The new password must be different from the current one.");
      return;
    }
    setBusy(true);
    try {
      await changePassword(current, next);
      toast.push("Password updated — please sign in again", "success");
      navigate("/login", { replace: true });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not change the password");
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <PageHeader
        title="Change password"
        subtitle={
          mustChange
            ? "Your administrator requires a password change before you can continue."
            : `Signed in as ${user?.email} (${roleName(user?.role)})`
        }
      />
      <form onSubmit={submit} style={{ maxWidth: 520 }}>
        <Card>
          {mustChange && (
            <div className="banner lockdown mb">
              ⚠ Temporary password in use — set a new password to access the application.
            </div>
          )}
          <Field label="Current password *">
            <input
              className="input"
              type="password"
              autoComplete="current-password"
              value={current}
              onChange={(e) => setCurrent(e.target.value)}
              required
            />
          </Field>
          <div className="grid cols-2">
            <Field label="New password *">
              <input
                className="input"
                type="password"
                autoComplete="new-password"
                value={next}
                onChange={(e) => setNext(e.target.value)}
                required
                minLength={10}
              />
            </Field>
            <Field label="Confirm new password *">
              <input
                className="input"
                type="password"
                autoComplete="new-password"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                required
              />
            </Field>
          </div>
          <ul className="small muted" style={{ margin: "0 0 14px 18px", padding: 0 }}>
            {RULES.map((r) => (
              <li key={r}>{r}</li>
            ))}
          </ul>
          {error && <div className="error-text mb">{error}</div>}
          <div className="row gap-sm">
            <button className="btn primary lg" disabled={busy}>
              {busy ? "Updating…" : "Update password"}
            </button>
            {!mustChange && (
              <button type="button" className="btn ghost lg" onClick={() => navigate(-1)}>
                Cancel
              </button>
            )}
          </div>
        </Card>
      </form>
    </>
  );
}
