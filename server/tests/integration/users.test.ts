import { beforeAll, describe, expect, it } from "vitest";
import { EMAILS, login, req } from "../helpers.js";

let adminToken = "";
let apartmentId = "";
let residentId = "";
const email = `deactivated.resident.${Date.now()}@secureresident.local`;

beforeAll(async () => {
  adminToken = (await login(EMAILS.admin)).accessToken;
  const apartments = await req("GET", "/api/apartments?limit=1", { token: adminToken });
  apartmentId = apartments.body.items[0].id;

  const created = await req("POST", "/api/users", {
    token: adminToken,
    payload: {
      name: "Deactivated Test Resident",
      email,
      role: "RESIDENT",
      password: "Secure@Demo123!",
      apartmentId,
    },
  });
  expect(created.status).toBe(201);
  residentId = created.body.id;
});

describe("resident deactivation keeps the account in a deactivated list", () => {
  it("hides the resident from the active directory after deactivation", async () => {
    const deactivated = await req("DELETE", `/api/users/${residentId}`, { token: adminToken });
    expect(deactivated.status).toBe(200);

    const active = await req("GET", `/api/users?q=${encodeURIComponent(email)}`, { token: adminToken });
    expect(active.status).toBe(200);
    expect(active.body.items).toHaveLength(0);
  });

  it("lists the deactivated resident with its status and deactivation timestamp", async () => {
    const archived = await req(
      "GET",
      `/api/users?deleted=only&q=${encodeURIComponent(email)}`,
      { token: adminToken },
    );
    expect(archived.status).toBe(200);
    expect(archived.body.items).toHaveLength(1);
    expect(archived.body.items[0].id).toBe(residentId);
    expect(archived.body.items[0].status).toBe("DISABLED");
    expect(archived.body.items[0].deletedAt).toBeTruthy();
    expect(archived.body.items[0].apartments).toHaveLength(1);
  });

  it("restores the resident to the active directory", async () => {
    const restored = await req("POST", `/api/users/${residentId}/reactivate`, { token: adminToken });
    expect(restored.status).toBe(200);
    expect(restored.body.status).toBe("ACTIVE");
    expect(restored.body.deletedAt).toBeNull();

    const active = await req("GET", `/api/users?q=${encodeURIComponent(email)}`, { token: adminToken });
    expect(active.status).toBe(200);
    expect(active.body.items).toHaveLength(1);
    expect(active.body.items[0].deletedAt).toBeNull();

    const archived = await req(
      "GET",
      `/api/users?deleted=only&q=${encodeURIComponent(email)}`,
      { token: adminToken },
    );
    expect(archived.body.items).toHaveLength(0);
  });
});
