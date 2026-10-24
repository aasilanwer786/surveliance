export interface AccessCommandResult {
  ok: boolean;
  accessPointId: string;
  command: string;
  message: string;
  at: string;
}

export interface AccessControlAdapter {
  protocol: string;
  sendCommand(accessPointId: string, command: string, reason: string | null): Promise<AccessCommandResult>;
}

const adapters = new Map<string, AccessControlAdapter>();

export function registerAccessControlAdapter(adapter: AccessControlAdapter): void {
  adapters.set(adapter.protocol.toUpperCase(), adapter);
}

export function getAccessControlAdapter(protocol: string): AccessControlAdapter | null {
  return adapters.get(protocol.toUpperCase()) ?? null;
}

registerAccessControlAdapter({
  protocol: "HTTP",
  async sendCommand(accessPointId, command, reason) {
    console.log(`[access-control:http] ap=${accessPointId} cmd=${command} reason=${reason ?? "-"}`);
    return {
      ok: false,
      accessPointId,
      command,
      message: "No HTTP gate controller is configured. Gate remains closed (fail secure).",
      at: new Date().toISOString(),
    };
  },
});
