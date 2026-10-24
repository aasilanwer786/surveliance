export interface OutboundMessage {
  title: string;
  body: string;
  to: { name: string; email?: string | null; phone?: string | null };
  priority: string;
}

export interface ChannelAdapter {
  name: string;
  send(msg: OutboundMessage): Promise<void>;
}

function consoleAdapter(name: string): ChannelAdapter {
  return {
    name,
    async send(msg) {
      if (process.env.NODE_ENV === "test") return;
      console.log(
        `[channel:${name}] priority=${msg.priority} to=${msg.to.name} | ${msg.title} — ${msg.body}`,
      );
    },
  };
}

const registry = new Map<string, ChannelAdapter>([
  ["PUSH", consoleAdapter("PUSH")],
  ["EMAIL", consoleAdapter("EMAIL")],
  ["SMS", consoleAdapter("SMS")],
  ["WHATSAPP", consoleAdapter("WHATSAPP")],
]);

export function registerChannel(name: string, adapter: ChannelAdapter): void {
  registry.set(name.toUpperCase(), adapter);
}

export async function dispatchChannel(channel: string, msg: OutboundMessage): Promise<void> {
  const adapter = registry.get(channel.toUpperCase());
  if (!adapter) throw new Error(`No adapter registered for channel ${channel}`);
  await adapter.send(msg);
}

export function availableChannels(): string[] {
  return [...registry.keys()];
}
