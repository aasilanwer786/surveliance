import type { WebSocket } from "ws";

export interface WsMessage {
  type: string;
  data?: unknown;
  at?: string;
}

interface ClientEntry {
  socket: WebSocket;
  userId: string;
  role: string;
  topics: Set<string>;
}

export function topicsForUser(userId: string, role: string): string[] {
  const topics = ["broadcast", `user:${userId}`, `role:${role}`];
  if (["SUPER_ADMIN", "ADMIN", "SECURITY", "GUARD"].includes(role)) topics.push("staff");
  if (["SUPER_ADMIN", "ADMIN", "SECURITY"].includes(role)) topics.push("security");
  if (role === "GUARD") topics.push("guards");
  if (["SUPER_ADMIN", "ADMIN"].includes(role)) topics.push("admins");
  if (role === "RESIDENT") topics.push("residents");
  return topics;
}

class WsHub {
  private clients = new Map<WebSocket, ClientEntry>();

  add(socket: WebSocket, userId: string, role: string): void {
    this.clients.set(socket, {
      socket,
      userId,
      role,
      topics: new Set(topicsForUser(userId, role)),
    });
  }

  remove(socket: WebSocket): void {
    this.clients.delete(socket);
  }

  publish(topic: string, message: WsMessage): void {
    const payload = JSON.stringify({ ...message, at: message.at ?? new Date().toISOString() });
    for (const client of this.clients.values()) {
      if (client.topics.has(topic)) {
        try {
          if (client.socket.readyState === 1) client.socket.send(payload);
        } catch {
          this.clients.delete(client.socket);
        }
      }
    }
  }

  publishMany(topics: string[], message: WsMessage): void {
    const payload = JSON.stringify({ ...message, at: message.at ?? new Date().toISOString() });
    const topicSet = new Set(topics);
    const sent = new Set<WebSocket>();
    for (const client of this.clients.values()) {
      if (sent.has(client.socket)) continue;
      let matches = false;
      for (const t of topicSet) {
        if (client.topics.has(t)) {
          matches = true;
          break;
        }
      }
      if (!matches) continue;
      sent.add(client.socket);
      try {
        if (client.socket.readyState === 1) client.socket.send(payload);
      } catch {
        this.clients.delete(client.socket);
      }
    }
  }

  toUser(userId: string, message: WsMessage): void {
    this.publish(`user:${userId}`, message);
  }

  toRoles(roles: string[], message: WsMessage): void {
    for (const role of roles) this.publish(`role:${role}`, message);
  }

  broadcast(message: WsMessage): void {
    this.publish("broadcast", message);
  }

  get size(): number {
    return this.clients.size;
  }
}

export const hub = new WsHub();
