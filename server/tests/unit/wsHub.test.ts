import { afterEach, describe, expect, it } from "vitest";
import { hub } from "../../src/lib/wsHub.js";

interface FakeSocket {
  readyState: number;
  sent: string[];
  send: (data: string) => void;
}

function fakeSocket(): FakeSocket {
  const sock: FakeSocket = {
    readyState: 1,
    sent: [],
    send(data: string) {
      sock.sent.push(data);
    },
  };
  return sock;
}

const sockets: FakeSocket[] = [];

function add(userId: string, role: string) {
  const sock = fakeSocket();
  sockets.push(sock);
  hub.add(sock as unknown as Parameters<typeof hub.add>[0], userId, role);
  return sock;
}

afterEach(() => {
  for (const s of sockets) hub.remove(s as unknown as Parameters<typeof hub.remove>[0]);
  sockets.length = 0;
});

describe("ws hub fan-out", () => {
  it("delivers a voice alert once per staff client even when role+staff topics overlap", () => {
    const guard = add("g1", "GUARD");
    const security = add("s1", "SECURITY");
    const admin = add("a1", "ADMIN");

    hub.publishMany(["role:GUARD", "role:ADMIN", "role:SECURITY", "staff"], {
      type: "voice-alert",
      data: { event: "VERIFY_FAILED" },
    });

    expect(guard.sent).toHaveLength(1);
    expect(security.sent).toHaveLength(1);
    expect(admin.sent).toHaveLength(1);
  });

  it("does not leak voice alerts to residents", () => {
    const resident = add("r1", "RESIDENT");
    hub.publishMany(["role:GUARD", "staff"], { type: "voice-alert", data: { event: "VERIFY_FAILED" } });
    expect(resident.sent).toHaveLength(0);
  });

  it("still fans out independent messages to distinct topics", () => {
    const guard = add("g2", "GUARD");
    hub.publish("role:GUARD", { type: "security-alert" });
    expect(guard.sent).toHaveLength(1);
    expect(JSON.parse(guard.sent[0]).type).toBe("security-alert");
  });
});
