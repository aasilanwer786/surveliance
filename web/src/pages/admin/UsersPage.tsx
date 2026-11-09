import { useState, type FormEvent } from "react";
import {
  Badge,
  Empty,
  ErrorView,
  Field,
  LoadingRow,
  Modal,
  PageHeader,
  Pagination,
  useAsync,
  useToast,
} from "../../components/ui";
import { ApiError, del, get, post, put, type Page } from "../../lib/api";
import { useAuth } from "../../lib/auth";
import { fmtDate, initials, relative, statusColor } from "../../lib/format";

interface UserRow {
  id: string;
  email: string;
  name: string;
  phone?: string | null;
  role: string;
  status: string;
  mustChangePassword?: boolean;
  lastLoginAt?: string | null;
  createdAt: string;
  deletedAt?: string | null;
  apartments: string[];
  guard?: { employeeCode?: string; gate?: { id: string; name: string } | null } | null;
}

interface ApartmentOption {
  id: string;
  flatNumber: string;
  block: { id: string; name: string; building: { id: string; name: string } };
}

interface GateOption {
  id: string;
  name: string;
}

const ROLE_OPTIONS = ["SUPER_ADMIN", "ADMIN", "SECURITY", "GUARD", "RESIDENT"];
const LIMIT = 12;

function roleTone(role: string): string {
  switch (role) {
    case "SUPER_ADMIN":
      return "purple";
    case "ADMIN":
      return "blue";
    case "SECURITY":
      return "cyan";
    case "GUARD":
      return "amber";
    default:
      return "gray";
  }
}

function passwordProblems(pw: string): string[] {
  const problems: string[] = [];
  if (pw.length < 10) problems.push("10+ characters");
  if (!/[A-Z]/.test(pw)) problems.push("an uppercase letter");
  if (!/[a-z]/.test(pw)) problems.push("a lowercase letter");
  if (!/[0-9]/.test(pw)) problems.push("a digit");
  if (!/[^A-Za-z0-9]/.test(pw)) problems.push("a symbol");
  return problems;
}

function errText(err: unknown): string {
  return err instanceof Error ? err.message : "Request failed";
}

export default function UsersPage() {
  const { user, has } = useAuth();
  const toast = useToast();
  const canWrite = has("users:write");

  const [page, setPage] = useState(1);
  const [role, setRole] = useState("");
  const [status, setStatus] = useState("");
  const [qInput, setQInput] = useState("");
  const [q, setQ] = useState("");

  const { data, error, loading, reload } = useAsync<Page<UserRow>>(
    () => {
      const params = new URLSearchParams({
        page: String(page),
        limit: String(LIMIT),
      });
      if (role) params.set("role", role);
      if (status === "DEACTIVATED") params.set("deleted", "only");
      else if (status) params.set("status", status);
      if (q) params.set("q", q);
      return get(`/api/users?${params.toString()}`);
    },
    [page, role, status, q],
  );

  const { data: apartmentOptions } = useAsync<Page<ApartmentOption>>(
    () => get("/api/apartments?limit=200"),
    [],
  );
  const { data: gateOptions } = useAsync<{ items: GateOption[] }>(() => get("/api/gates"), []);

  const [createOpen, setCreateOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [newRole, setNewRole] = useState("RESIDENT");
  const [apartmentId, setApartmentId] = useState("");
  const [employeeCode, setEmployeeCode] = useState("");
  const [gateId, setGateId] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPw, setConfirmPw] = useState("");
  const [showPassword, setShowPassword] = useState(false);

  const [editId, setEditId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editPhone, setEditPhone] = useState("");
  const [editRole, setEditRole] = useState("RESIDENT");
  const [editStatus, setEditStatus] = useState("ACTIVE");
  const [editPassword, setEditPassword] = useState("");
  const [showEditPassword, setShowEditPassword] = useState(false);

  const [deleteTarget, setDeleteTarget] = useState<UserRow | null>(null);
  const [confirmText, setConfirmText] = useState("");
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const [restoreTarget, setRestoreTarget] = useState<UserRow | null>(null);
  const [restoreError, setRestoreError] = useState<string | null>(null);

  const resetCreate = () => {
    setName("");
    setEmail("");
    setPhone("");
    setNewRole("RESIDENT");
    setApartmentId("");
    setEmployeeCode("");
    setGateId("");
    setPassword("");
    setConfirmPw("");
    setShowPassword(false);
    setFormError(null);
  };

  const openCreate = () => {
    resetCreate();
    setCreateOpen(true);
  };

  const openEdit = (u: UserRow) => {
    setEditId(u.id);
    setEditName(u.name);
    setEditPhone(u.phone ?? "");
    setEditRole(u.role);
    setEditStatus(u.status);
    setEditPassword("");
    setShowEditPassword(false);
    setFormError(null);
  };

  const submitCreate = async (e: FormEvent) => {
    e.preventDefault();
    setFormError(null);
    if (newRole === "RESIDENT" && !apartmentId) {
      setFormError("Select an apartment for resident accounts");
      return;
    }
    const problems = passwordProblems(password);
    if (problems.length) {
      setFormError(`Password needs ${problems.join(", ")}`);
      return;
    }
    if (password !== confirmPw) {
      setFormError("Passwords do not match");
      return;
    }
    setBusy(true);
    try {
      await post("/api/users", {
        name: name.trim(),
        email: email.trim().toLowerCase(),
        phone: phone.trim() || undefined,
        role: newRole,
        password,
        ...(newRole === "RESIDENT" ? { apartmentId } : {}),
        ...(newRole === "GUARD"
          ? { employeeCode: employeeCode.trim() || undefined, assignedGateId: gateId || undefined }
          : {}),
      });
      toast.push(`User ${email.trim()} created`, "success");
      setCreateOpen(false);
      resetCreate();
      reload();
    } catch (err) {
      setFormError(errText(err));
    } finally {
      setBusy(false);
    }
  };

  const submitEdit = async (e: FormEvent) => {
    e.preventDefault();
    setFormError(null);
    if (editPassword) {
      const problems = passwordProblems(editPassword);
      if (problems.length) {
        setFormError(`Password needs ${problems.join(", ")}`);
        return;
      }
    }
    setBusy(true);
    try {
      await put(`/api/users/${editId}`, {
        name: editName.trim(),
        phone: editPhone.trim(),
        role: editRole,
        status: editStatus,
        ...(editPassword ? { password: editPassword } : {}),
      });
      toast.push("User updated", "success");
      setEditId(null);
      reload();
    } catch (err) {
      setFormError(errText(err));
    } finally {
      setBusy(false);
    }
  };

  const submitDelete = async () => {
    if (!deleteTarget) return;
    setDeleteError(null);
    setBusy(true);
    try {
      await del(`/api/users/${deleteTarget.id}`);
      toast.push(`${deleteTarget.name} moved to the deactivated list`, "success");
      setDeleteTarget(null);
      setConfirmText("");
      reload();
    } catch (err) {
      const message = errText(err);
      if (err instanceof ApiError && (err.status === 409 || err.code.includes("FOREIGN"))) {
        const full = `Cannot deactivate — ${message}`;
        setDeleteError(full);
        toast.push(full, "warn");
      } else {
        setDeleteError(message);
        toast.push(message, "error");
      }
    } finally {
      setBusy(false);
    }
  };

  const submitRestore = async () => {
    if (!restoreTarget) return;
    setRestoreError(null);
    setBusy(true);
    try {
      await post(`/api/users/${restoreTarget.id}/reactivate`, {});
      toast.push(`${restoreTarget.name} restored`, "success");
      setRestoreTarget(null);
      reload();
    } catch (err) {
      setRestoreError(errText(err));
    } finally {
      setBusy(false);
    }
  };

  const applyFilters = (e: FormEvent) => {
    e.preventDefault();
    setPage(1);
    setQ(qInput.trim());
  };

  const clearFilters = () => {
    setQInput("");
    setQ("");
    setRole("");
    setStatus("");
    setPage(1);
  };

  return (
    <>
      <PageHeader
        title="Users & roles"
        subtitle="Directory of every account across the property"
        actions={
          canWrite ? (
            <button className="btn primary" onClick={openCreate}>
              ＋ Add user
            </button>
          ) : undefined
        }
      />

      <form className="row gap-sm wrap mb" onSubmit={applyFilters}>
        <input
          className="input"
          style={{ maxWidth: 260 }}
          value={qInput}
          onChange={(e) => setQInput(e.target.value)}
          placeholder="Search name, email or phone"
          aria-label="Search users"
        />
        <select
          className="select"
          style={{ maxWidth: 190 }}
          value={role}
          onChange={(e) => {
            setRole(e.target.value);
            setPage(1);
          }}
          aria-label="Filter by role"
        >
          <option value="">All roles</option>
          {ROLE_OPTIONS.map((r) => (
            <option key={r} value={r}>
              {r.replace("_", " ")}
            </option>
          ))}
        </select>
        <select
          className="select"
          style={{ maxWidth: 170 }}
          value={status}
          onChange={(e) => {
            setStatus(e.target.value);
            setPage(1);
          }}
          aria-label="Filter by status"
        >
          <option value="">All statuses</option>
          <option value="ACTIVE">Active</option>
          <option value="DISABLED">Disabled</option>
          <option value="DEACTIVATED">Deactivated</option>
        </select>
        <button className="btn" type="submit">
          Search
        </button>
        {(q || role || status) && (
          <button className="btn ghost" type="button" onClick={clearFilters}>
            Clear
          </button>
        )}
      </form>

      {status === "DEACTIVATED" && (
        <div className="small dim mb">
          Showing deactivated accounts. They are retained with their history and can be restored at any time.
        </div>
      )}

      {loading ? (
        <LoadingRow label="Loading users…" />
      ) : error ? (
        <ErrorView error={error} onRetry={reload} />
      ) : !data || data.items.length === 0 ? (
        <Empty title="No users found" hint="Adjust the filters or create the first account." />
      ) : (
        <>
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>User</th>
                  <th>Phone</th>
                  <th>Role</th>
                  <th>Linked flat</th>
                  <th>Status</th>
                  <th>Created</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {data.items.map((u) => {
                  const isSelf = u.id === user?.id;
                  const guardInfo = u.guard?.employeeCode
                    ? `${u.guard.employeeCode}${u.guard.gate ? ` · ${u.guard.gate.name}` : ""}`
                    : "";
                  return (
                    <tr key={u.id}>
                      <td>
                        <div className="row gap-sm">
                          <div className="avatar">{initials(u.name)}</div>
                          <div>
                            <strong>{u.name}</strong>
                            <div className="small dim mono">{u.email}</div>
                          </div>
                        </div>
                      </td>
                      <td>{u.phone || <span className="dim">—</span>}</td>
                      <td>
                        <Badge tone={roleTone(u.role)}>{u.role.replace("_", " ")}</Badge>
                      </td>
                      <td>
                        {u.apartments.length > 0 ? (
                          <span className="mono">{u.apartments.join(", ")}</span>
                        ) : guardInfo ? (
                          <span className="small">{guardInfo}</span>
                        ) : (
                          <span className="dim">—</span>
                        )}
                      </td>
                      <td>
                        {u.deletedAt ? (
                          <>
                            <Badge tone="red">DEACTIVATED</Badge>
                            <div className="small dim">moved {relative(u.deletedAt)}</div>
                          </>
                        ) : (
                          <>
                            <Badge tone={statusColor(u.status)}>{u.status}</Badge>
                            {u.mustChangePassword && (
                              <div className="small dim">password reset pending</div>
                            )}
                          </>
                        )}
                      </td>
                      <td>
                        {fmtDate(u.createdAt)}
                        <div className="small dim">
                          {u.lastLoginAt ? `last login ${relative(u.lastLoginAt)}` : "never signed in"}
                        </div>
                      </td>
                      <td>
                        <div className="row gap-sm" style={{ justifyContent: "flex-end" }}>
                          {canWrite && u.deletedAt && (
                            <button
                              className="btn sm primary"
                              onClick={() => {
                                setRestoreTarget(u);
                                setRestoreError(null);
                              }}
                            >
                              Restore
                            </button>
                          )}
                          {canWrite && !u.deletedAt && (
                            <>
                              <button
                                className="btn sm"
                                onClick={() => openEdit(u)}
                              >
                                Edit
                              </button>
                              <button
                                className="btn sm danger"
                                disabled={isSelf}
                                title={isSelf ? "You cannot deactivate your own account" : undefined}
                                onClick={() => {
                                  setDeleteTarget(u);
                                  setConfirmText("");
                                  setDeleteError(null);
                                }}
                              >
                                Deactivate
                              </button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <Pagination page={data.page} total={data.total} limit={data.limit || LIMIT} onChange={setPage} />
        </>
      )}

      <Modal
        open={createOpen}
        title="Add user"
        onClose={() => setCreateOpen(false)}
        footer={
          <>
            <button className="btn ghost" onClick={() => setCreateOpen(false)} disabled={busy}>
              Cancel
            </button>
            <button className="btn primary" form="create-user-form" type="submit" disabled={busy}>
              {busy ? "Creating…" : "Create user"}
            </button>
          </>
        }
      >
        <form id="create-user-form" onSubmit={submitCreate}>
          <div className="grid cols-2">
            <Field label="Full name *">
              <input
                className="input"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
                minLength={2}
                maxLength={120}
              />
            </Field>
            <Field label="Email *">
              <input
                className="input"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </Field>
            <Field label="Phone">
              <input className="input" value={phone} onChange={(e) => setPhone(e.target.value)} maxLength={30} />
            </Field>
            <Field label="Role *">
              <select className="select" value={newRole} onChange={(e) => setNewRole(e.target.value)}>
                {ROLE_OPTIONS.map((r) => (
                  <option key={r} value={r} disabled={r === "SUPER_ADMIN" && user?.role !== "SUPER_ADMIN"}>
                    {r.replace("_", " ")}
                    {r === "SUPER_ADMIN" && user?.role !== "SUPER_ADMIN" ? " — super admin only" : ""}
                  </option>
                ))}
              </select>
            </Field>
            {newRole === "RESIDENT" && (
              <Field label="Apartment *">
                <select
                  className="select"
                  value={apartmentId}
                  onChange={(e) => setApartmentId(e.target.value)}
                  required
                >
                  <option value="">Select flat…</option>
                  {(apartmentOptions?.items ?? []).map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.flatNumber} · {a.block.name} · {a.block.building.name}
                    </option>
                  ))}
                </select>
              </Field>
            )}
            {newRole === "GUARD" && (
              <>
                <Field label="Employee code">
                  <input
                    className="input mono"
                    value={employeeCode}
                    onChange={(e) => setEmployeeCode(e.target.value)}
                    placeholder="GRD-001"
                    maxLength={40}
                  />
                </Field>
                <Field label="Assigned gate">
                  <select className="select" value={gateId} onChange={(e) => setGateId(e.target.value)}>
                    <option value="">No gate yet</option>
                    {(gateOptions?.items ?? []).map((g) => (
                      <option key={g.id} value={g.id}>
                        {g.name}
                      </option>
                    ))}
                  </select>
                </Field>
              </>
            )}
          </div>
          <Field label="Password *" hint="Minimum 10 characters with upper, lower, digit and symbol.">
            <div className="row gap-sm">
              <input
                className="input"
                type={showPassword ? "text" : "password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={10}
              />
              <button
                type="button"
                className="btn sm"
                onClick={() => setShowPassword((s) => !s)}
                aria-label={showPassword ? "Hide password" : "Show password"}
              >
                {showPassword ? "Hide" : "Show"}
              </button>
            </div>
          </Field>
          <Field label="Confirm password *">
            <input
              className="input"
              type={showPassword ? "text" : "password"}
              value={confirmPw}
              onChange={(e) => setConfirmPw(e.target.value)}
              required
            />
          </Field>
          {formError && <div className="error-text mb">{formError}</div>}
        </form>
      </Modal>

      <Modal
        open={editId !== null}
        title="Edit user"
        onClose={() => setEditId(null)}
        footer={
          <>
            <button className="btn ghost" onClick={() => setEditId(null)} disabled={busy}>
              Cancel
            </button>
            <button className="btn primary" form="edit-user-form" type="submit" disabled={busy}>
              {busy ? "Saving…" : "Save changes"}
            </button>
          </>
        }
      >
        <form id="edit-user-form" onSubmit={submitEdit}>
          <div className="grid cols-2">
            <Field label="Full name *">
              <input
                className="input"
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                required
                minLength={2}
                maxLength={120}
              />
            </Field>
            <Field label="Phone">
              <input
                className="input"
                value={editPhone}
                onChange={(e) => setEditPhone(e.target.value)}
                maxLength={30}
              />
            </Field>
            <Field label="Role">
              <select className="select" value={editRole} onChange={(e) => setEditRole(e.target.value)}>
                {ROLE_OPTIONS.map((r) => (
                  <option key={r} value={r} disabled={r === "SUPER_ADMIN" && user?.role !== "SUPER_ADMIN"}>
                    {r.replace("_", " ")}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Account status">
              <select className="select" value={editStatus} onChange={(e) => setEditStatus(e.target.value)}>
                <option value="ACTIVE">Active</option>
                <option value="DISABLED">Disabled</option>
              </select>
            </Field>
          </div>
          <Field
            label="Set new password (optional)"
            hint="Leave empty to keep the current password. A reset forces a change at next sign-in."
          >
            <div className="row gap-sm">
              <input
                className="input"
                type={showEditPassword ? "text" : "password"}
                value={editPassword}
                onChange={(e) => setEditPassword(e.target.value)}
                minLength={editPassword ? 10 : undefined}
              />
              <button
                type="button"
                className="btn sm"
                onClick={() => setShowEditPassword((s) => !s)}
                aria-label={showEditPassword ? "Hide password" : "Show password"}
              >
                {showEditPassword ? "Hide" : "Show"}
              </button>
            </div>
          </Field>
          {formError && <div className="error-text mb">{formError}</div>}
        </form>
      </Modal>

      <Modal
        open={deleteTarget !== null}
        title="Deactivate user"
        onClose={() => {
          setDeleteTarget(null);
          setConfirmText("");
        }}
        footer={
          <>
            <button
              className="btn ghost"
              onClick={() => {
                setDeleteTarget(null);
                setConfirmText("");
              }}
              disabled={busy}
            >
              Cancel
            </button>
            <button
              className="btn danger"
              disabled={busy || confirmText !== (deleteTarget?.email ?? "")}
              onClick={() => void submitDelete()}
            >
              {busy ? "Deactivating…" : "Move to deactivated list"}
            </button>
          </>
        }
      >
        <p className="muted">
          This signs <strong>{deleteTarget?.name}</strong> out everywhere, disables the account and moves it to
          the <strong>Deactivated</strong> list. Nothing is permanently deleted — you can restore it later. Type
          the email below to confirm.
        </p>
        <Field label={`Type ${deleteTarget?.email ?? ""} to confirm`}>
          <input
            className="input mono"
            value={confirmText}
            onChange={(e) => setConfirmText(e.target.value)}
            placeholder={deleteTarget?.email ?? ""}
            autoFocus
          />
        </Field>
        {deleteError && <div className="error-text mb">{deleteError}</div>}
      </Modal>

      <Modal
        open={restoreTarget !== null}
        title="Restore user"
        onClose={() => setRestoreTarget(null)}
        footer={
          <>
            <button className="btn ghost" onClick={() => setRestoreTarget(null)} disabled={busy}>
              Cancel
            </button>
            <button className="btn primary" onClick={() => void submitRestore()} disabled={busy}>
              {busy ? "Restoring…" : "Restore account"}
            </button>
          </>
        }
      >
        <p className="muted">
          Restore <strong>{restoreTarget?.name}</strong> to the active directory? Their account, flat link
          and history are unchanged; they will be able to sign in again.
        </p>
        {restoreError && <div className="error-text mb">{restoreError}</div>}
      </Modal>
    </>
  );
}
