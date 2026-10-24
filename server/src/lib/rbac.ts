export const ROLES = {
  SUPER_ADMIN: "SUPER_ADMIN",
  ADMIN: "ADMIN",
  SECURITY: "SECURITY",
  RESIDENT: "RESIDENT",
  GUARD: "GUARD",
} as const;

export type Role = (typeof ROLES)[keyof typeof ROLES];

export const ALL_PERMISSIONS = [
  "dashboard:read",
  "dashboard:security",
  "buildings:read",
  "buildings:write",
  "residents:read",
  "residents:write",
  "residents:contact",
  "guards:read",
  "guards:write",
  "users:read",
  "users:write",
  "gates:read",
  "gates:write",
  "invitations:read",
  "invitations:read-own",
  "invitations:create",
  "invitations:cancel",
  "visitors:verify",
  "visitors:entry",
  "visitors:exit",
  "visitors:view-all",
  "approvals:resident",
  "approvals:security",
  "approvals:view",
  "alerts:read",
  "alerts:acknowledge",
  "alerts:resolve",
  "incidents:read",
  "incidents:write",
  "incidents:close",
  "settings:read",
  "settings:write",
  "voice:read",
  "voice:write",
  "audit:read",
  "reports:read",
  "cameras:read",
  "cameras:write",
  "devices:read",
  "devices:write",
  "lockdown:manage",
  "watchlist:read",
  "watchlist:manage",
  "notifications:read",
  "detector:ingest",
] as const;

export type Permission = (typeof ALL_PERMISSIONS)[number];

const ADMIN_PERMS: Permission[] = [...ALL_PERMISSIONS];

const SECURITY_PERMS: Permission[] = [
  "dashboard:read",
  "dashboard:security",
  "buildings:read",
  "residents:read",
  "residents:contact",
  "guards:read",
  "gates:read",
  "invitations:read",
  "visitors:verify",
  "visitors:entry",
  "visitors:exit",
  "visitors:view-all",
  "approvals:security",
  "approvals:view",
  "alerts:read",
  "alerts:acknowledge",
  "alerts:resolve",
  "incidents:read",
  "incidents:write",
  "incidents:close",
  "settings:read",
  "voice:read",
  "reports:read",
  "cameras:read",
  "devices:read",
  "watchlist:read",
  "notifications:read",
];

const GUARD_PERMS: Permission[] = [
  "dashboard:security",
  "gates:read",
  "residents:contact",
  "invitations:read",
  "visitors:verify",
  "visitors:entry",
  "visitors:exit",
  "visitors:view-all",
  "approvals:view",
  "alerts:read",
  "alerts:acknowledge",
  "incidents:read",
  "incidents:write",
  "notifications:read",
];

const RESIDENT_PERMS: Permission[] = [
  "dashboard:read",
  "buildings:read",
  "invitations:read-own",
  "invitations:create",
  "invitations:cancel",
  "approvals:resident",
  "approvals:view",
  "notifications:read",
  "gates:read",
];

export const ROLE_PERMISSIONS: Record<Role, Permission[]> = {
  SUPER_ADMIN: ADMIN_PERMS,
  ADMIN: ADMIN_PERMS,
  SECURITY: SECURITY_PERMS,
  GUARD: GUARD_PERMS,
  RESIDENT: RESIDENT_PERMS,
};

export function permissionsForRole(role: string): Permission[] {
  return ROLE_PERMISSIONS[role as Role] ?? [];
}

export function hasPermission(perms: Permission[], required: Permission | Permission[]): boolean {
  const list = Array.isArray(required) ? required : [required];
  return list.every((p) => perms.includes(p));
}

export const STAFF_ROLES: Role[] = [ROLES.SUPER_ADMIN, ROLES.ADMIN, ROLES.SECURITY, ROLES.GUARD];
export const APPROVER_ROLES: Role[] = [ROLES.SUPER_ADMIN, ROLES.ADMIN, ROLES.SECURITY];
