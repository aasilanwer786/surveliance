import { describe, expect, it } from "vitest";
import {
  ALL_PERMISSIONS,
  ROLES,
  STAFF_ROLES,
  APPROVER_ROLES,
  hasPermission,
  permissionsForRole,
  type Permission,
} from "../../src/lib/rbac.js";

describe("roles", () => {
  it("defines the five expected roles", () => {
    expect(Object.values(ROLES).sort()).toEqual(
      ["ADMIN", "GUARD", "RESIDENT", "SECURITY", "SUPER_ADMIN"].sort(),
    );
  });

  it("classifies staff and approver roles", () => {
    expect(STAFF_ROLES).toContain(ROLES.GUARD);
    expect(STAFF_ROLES).not.toContain(ROLES.RESIDENT);
    expect(APPROVER_ROLES).toContain(ROLES.SECURITY);
    expect(APPROVER_ROLES).not.toContain(ROLES.GUARD);
  });
});

describe("permissionsForRole", () => {
  it("SUPER_ADMIN holds every permission", () => {
    const perms = permissionsForRole(ROLES.SUPER_ADMIN);
    for (const p of ALL_PERMISSIONS) expect(perms).toContain(p);
  });

  it("GUARD can operate the gate but not the system", () => {
    const perms = permissionsForRole(ROLES.GUARD);
    for (const p of ["visitors:verify", "visitors:entry", "visitors:exit", "visitors:view-all", "alerts:read", "dashboard:security"] as Permission[]) {
      expect(perms).toContain(p);
    }
    for (const p of ["settings:write", "lockdown:manage", "users:write", "invitations:create", "watchlist:manage"] as Permission[]) {
      expect(perms).not.toContain(p);
    }
  });

  it("RESIDENT manages own invitations only", () => {
    const perms = permissionsForRole(ROLES.RESIDENT);
    for (const p of ["invitations:create", "invitations:read-own", "invitations:cancel", "approvals:resident", "dashboard:read"] as Permission[]) {
      expect(perms).toContain(p);
    }
    for (const p of ["visitors:verify", "visitors:view-all", "approvals:security", "dashboard:security", "users:read"] as Permission[]) {
      expect(perms).not.toContain(p);
    }
  });

  it("SECURITY approves and monitors but cannot administer users", () => {
    const perms = permissionsForRole(ROLES.SECURITY);
    for (const p of ["approvals:security", "alerts:resolve", "watchlist:read", "dashboard:security", "visitors:view-all"] as Permission[]) {
      expect(perms).toContain(p);
    }
    for (const p of ["users:write", "settings:write", "lockdown:manage", "watchlist:manage"] as Permission[]) {
      expect(perms).not.toContain(p);
    }
  });

  it("unknown roles get no permissions", () => {
    expect(permissionsForRole("NOPE")).toEqual([]);
    expect(permissionsForRole("")).toEqual([]);
  });
});

describe("hasPermission", () => {
  const perms: Permission[] = ["visitors:verify", "visitors:entry"];

  it("requires all listed permissions", () => {
    expect(hasPermission(perms, "visitors:verify")).toBe(true);
    expect(hasPermission(perms, ["visitors:verify", "visitors:entry"])).toBe(true);
    expect(hasPermission(perms, ["visitors:verify", "settings:write"])).toBe(false);
    expect(hasPermission(perms, [])).toBe(true);
  });
});
