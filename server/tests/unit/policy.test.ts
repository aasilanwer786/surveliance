import { describe, expect, it } from "vitest";
import { computeApprovalState, requiredApprovalTypes } from "../../src/services/verification.service.js";
import type { InvitationWithRelations } from "../../src/services/visitor.service.js";

const inv = (approvals: Array<{ type: string; status: string }>) =>
  ({ approvals }) as unknown as InvitationWithRelations;

describe("requiredApprovalTypes", () => {
  it("maps every approval policy", () => {
    expect(requiredApprovalTypes("AUTO")).toEqual([]);
    expect(requiredApprovalTypes("RESIDENT")).toEqual(["RESIDENT"]);
    expect(requiredApprovalTypes("SECURITY")).toEqual(["SECURITY"]);
    expect(requiredApprovalTypes("BOTH")).toEqual(["RESIDENT", "SECURITY"]);
    expect(requiredApprovalTypes("garbage")).toEqual(["RESIDENT"]);
  });
});

describe("computeApprovalState", () => {
  it("AUTO is immediately complete", () => {
    const state = computeApprovalState(inv([]), "AUTO");
    expect(state.required).toEqual([]);
    expect(state.pending).toEqual([]);
    expect(state.complete).toBe(true);
    expect(state.rejected).toBe(false);
  });

  it("RESIDENT policy waits for the host approval", () => {
    const state = computeApprovalState(inv([]), "RESIDENT");
    expect(state.pending).toEqual(["RESIDENT"]);
    expect(state.complete).toBe(false);
  });

  it("completes once the required approval is granted", () => {
    const state = computeApprovalState(
      inv([{ type: "RESIDENT", status: "APPROVED" }]),
      "RESIDENT",
    );
    expect(state.pending).toEqual([]);
    expect(state.complete).toBe(true);
  });

  it("BOTH requires resident and security approvals", () => {
    const partial = computeApprovalState(
      inv([{ type: "RESIDENT", status: "APPROVED" }]),
      "BOTH",
    );
    expect(partial.pending).toEqual(["SECURITY"]);
    expect(partial.complete).toBe(false);

    const full = computeApprovalState(
      inv([
        { type: "RESIDENT", status: "APPROVED" },
        { type: "SECURITY", status: "APPROVED" },
      ]),
      "BOTH",
    );
    expect(full.pending).toEqual([]);
    expect(full.complete).toBe(true);
  });

  it("a rejection blocks completion regardless of approvals", () => {
    const state = computeApprovalState(
      inv([
        { type: "RESIDENT", status: "APPROVED" },
        { type: "SECURITY", status: "REJECTED" },
      ]),
      "BOTH",
    );
    expect(state.rejected).toBe(true);
    expect(state.complete).toBe(false);
  });

  it("pending approval rows do not complete the policy", () => {
    const state = computeApprovalState(
      inv([{ type: "RESIDENT", status: "PENDING" }]),
      "RESIDENT",
    );
    expect(state.pending).toEqual(["RESIDENT"]);
    expect(state.complete).toBe(false);
  });
});
