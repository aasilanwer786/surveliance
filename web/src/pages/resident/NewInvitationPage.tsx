import { useMemo, useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../../lib/auth";
import { ApiError, post } from "../../lib/api";
import { useToast, Card, Field, PageHeader, Badge } from "../../components/ui";

interface Created {
  invitation: { id: string; code: string; visitStatus: string; approvalPolicy: string };
  qrDataUrl: string;
}

function toLocalInput(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export default function NewInvitationPage() {
  const { user } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();

  const defaultTime = useMemo(() => toLocalInput(new Date(Date.now() + 60 * 60_000)), []);
  const apartments = user?.apartments ?? [];

  const [visitorName, setVisitorName] = useState("");
  const [visitorPhone, setVisitorPhone] = useState("");
  const [purpose, setPurpose] = useState("");
  const [vehicleNumber, setVehicleNumber] = useState("");
  const [notes, setNotes] = useState("");
  const [expectedAt, setExpectedAt] = useState(defaultTime);
  const [durationMinutes, setDuration] = useState(120);
  const [approvalPolicy, setPolicy] = useState("RESIDENT");
  const [apartmentId, setApartmentId] = useState(apartments[0]?.apartmentId ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [created, setCreated] = useState<Created | null>(null);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await post<Created>("/api/visitors/invitations", {
        visitorName: visitorName.trim(),
        visitorPhone: visitorPhone.trim() || undefined,
        purpose: purpose.trim() || undefined,
        vehicleNumber: vehicleNumber.trim().toUpperCase() || undefined,
        notes: notes.trim() || undefined,
        expectedAt: new Date(expectedAt).toISOString(),
        durationMinutes,
        approvalPolicy,
        apartmentId: apartmentId || undefined,
      });
      setCreated(res);
      toast.push("Invitation created — share the QR or code with your visitor", "success");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to create invitation");
    } finally {
      setBusy(false);
    }
  };

  if (created) {
    const link = `${window.location.origin}/invite/${created.invitation.code}`;
    return (
      <>
        <PageHeader title="Invitation ready" subtitle="Share this pass with your visitor" />
        <div className="grid cols-2">
          <Card title="Visitor pass">
            <div className="qr-box" style={{ width: 240, height: 240 }}>
              <img src={created.qrDataUrl} alt="QR code" width={210} height={210} />
            </div>
            <div className="code-plate mt">{created.invitation.code}</div>
            <div className="center small dim mt">
              Visitor shows this at the gate — or reads the code aloud to the guard.
            </div>
          </Card>
          <Card title="Share">
            <Field label="Public link">
              <div className="row gap-sm">
                <input className="input mono" readOnly value={link} onFocus={(e) => e.currentTarget.select()} />
                <button
                  className="btn"
                  onClick={() => {
                    void navigator.clipboard?.writeText(link);
                    toast.push("Link copied", "success");
                  }}
                >
                  Copy
                </button>
              </div>
            </Field>
            <div className="col gap-sm">
              <div className="row between">
                <span className="muted">Status</span>
                <Badge tone="amber">{created.invitation.visitStatus}</Badge>
              </div>
              <div className="row between">
                <span className="muted">Approval policy</span>
                <Badge tone="blue">{created.invitation.approvalPolicy}</Badge>
              </div>
            </div>
            <div className="divider" />
            <div className="row gap-sm wrap">
              <button className="btn primary" onClick={() => navigate("/resident/invitations")}>
                View my invitations
              </button>
              <Link className="btn" to={`/invite/${created.invitation.code}`} target="_blank">
                Open public pass
              </Link>
              <button
                className="btn ghost"
                onClick={() => {
                  setCreated(null);
                  setVisitorName("");
                  setVehicleNumber("");
                  setNotes("");
                }}
              >
                Create another
              </button>
            </div>
          </Card>
        </div>
      </>
    );
  }

  return (
    <>
      <PageHeader title="New visitor invitation" subtitle="Generate a secure code and QR pass for your guest" />
      <form onSubmit={submit} style={{ maxWidth: 720 }}>
        <Card>
          <div className="grid cols-2">
            <Field label="Visitor name *">
              <input className="input" value={visitorName} onChange={(e) => setVisitorName(e.target.value)} placeholder="e.g. Ahmed Hassan" required minLength={2} />
            </Field>
            <Field label="Visitor phone">
              <input className="input" value={visitorPhone} onChange={(e) => setVisitorPhone(e.target.value)} placeholder="+92 300 0000000" />
            </Field>
            <Field label="Purpose of visit">
              <input className="input" value={purpose} onChange={(e) => setPurpose(e.target.value)} placeholder="Family visit, delivery, maintenance…" />
            </Field>
            <Field label="Vehicle number">
              <input className="input mono" value={vehicleNumber} onChange={(e) => setVehicleNumber(e.target.value.toUpperCase())} placeholder="ABC-123" />
            </Field>
            <Field label="Expected arrival *" hint="The guard can admit the visitor inside this window.">
              <input className="input" type="datetime-local" value={expectedAt} onChange={(e) => setExpectedAt(e.target.value)} required />
            </Field>
            <Field label="Visit duration (minutes)">
              <input
                className="input"
                type="number"
                min={5}
                max={1440}
                value={durationMinutes}
                onChange={(e) => setDuration(Number(e.target.value))}
              />
            </Field>
            <Field label="Approval policy" hint="Watchlist matches automatically escalate this.">
              <select className="select" value={approvalPolicy} onChange={(e) => setPolicy(e.target.value)}>
                <option value="AUTO">AUTO — no approval needed</option>
                <option value="RESIDENT">RESIDENT — you approve</option>
                <option value="SECURITY">SECURITY — guard desk approves</option>
                <option value="BOTH">BOTH — you and security approve</option>
              </select>
            </Field>
            {apartments.length > 1 && (
              <Field label="Apartment">
                <select className="select" value={apartmentId} onChange={(e) => setApartmentId(e.target.value)}>
                  {apartments.map((a) => (
                    <option key={a.apartmentId} value={a.apartmentId}>
                      Flat {a.flatNumber} · {a.block} · {a.building}
                    </option>
                  ))}
                </select>
              </Field>
            )}
          </div>
          <Field label="Notes for security (optional)">
            <textarea className="textarea" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Anything the guard should know…" maxLength={500} />
          </Field>
          {error && <div className="error-text mb">{error}</div>}
          <div className="row gap-sm">
            <button className="btn primary lg" disabled={busy}>
              {busy ? "Creating…" : "Create invitation"}
            </button>
            <button type="button" className="btn ghost lg" onClick={() => navigate(-1)}>
              Cancel
            </button>
          </div>
        </Card>
      </form>
    </>
  );
}
