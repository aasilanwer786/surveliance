export function fmtDate(value?: string | Date | null): string {
  if (!value) return "—";
  const d = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString(undefined, {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function fmtTime(value?: string | Date | null): string {
  if (!value) return "—";
  const d = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
}

export function relative(value?: string | Date | null): string {
  if (!value) return "—";
  const d = typeof value === "string" ? new Date(value) : value;
  const diff = Date.now() - d.getTime();
  const abs = Math.abs(diff);
  const mins = Math.round(abs / 60000);
  const suffix = diff >= 0 ? "ago" : "from now";
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ${suffix}`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h ${suffix}`;
  const days = Math.round(hours / 24);
  return `${days}d ${suffix}`;
}

export function initials(name?: string | null): string {
  if (!name) return "?";
  return name
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? "")
    .join("");
}

export function statusColor(status?: string | null): string {
  switch ((status ?? "").toUpperCase()) {
    case "APPROVED":
    case "ACTIVE":
    case "INSIDE":
    case "RESOLVED":
    case "CLOSED":
    case "ACKNOWLEDGED":
    case "DELIVERED":
      return "green";
    case "AWAITING_APPROVAL":
    case "EXPECTED":
    case "PENDING":
    case "ACK":
    case "NEW":
      return "amber";
    case "REJECTED":
    case "DENIED":
    case "BLOCKED":
    case "CANCELLED":
    case "EXPIRED":
    case "DISABLED":
      return "red";
    case "EXITED":
    case "INACTIVE":
      return "gray";
    default:
      return "blue";
  }
}

export function priorityColor(priority?: string | null): string {
  switch ((priority ?? "").toUpperCase()) {
    case "EMERGENCY":
    case "CRITICAL":
      return "red";
    case "HIGH":
      return "amber";
    case "MEDIUM":
      return "blue";
    default:
      return "gray";
  }
}

export function purposeTone(purpose?: string | null): string {
  const p = (purpose ?? "").toLowerCase();
  if (p.includes("deliver") || p.includes("food") || p.includes("courier")) return "cyan";
  if (p.includes("family") || p.includes("guest") || p.includes("friend")) return "purple";
  return "blue";
}
