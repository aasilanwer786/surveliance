import { spawn } from "node:child_process";
import net from "node:net";

export interface CameraStreamDescriptor {
  cameraId: string;
  protocol: string;
  endpoint: string;
  username?: string | null;
  password?: string | null;
  snapshotUrl?: string | null;
}

export interface ProbeResult {
  reachable: boolean;
  message?: string;
}

export interface SnapshotResult {
  ok: boolean;
  buffer?: Buffer;
  contentType?: string;
  message?: string;
}

export interface CctvAdapter {
  name: string;
  probe(camera: CameraStreamDescriptor): Promise<ProbeResult>;
  snapshot(camera: CameraStreamDescriptor): Promise<SnapshotResult>;
}

const MAX_SNAPSHOT_BYTES = 8 * 1024 * 1024;
const HTTP_TIMEOUT_MS = 6000;
const RTSP_TIMEOUT_MS = 10000;

const adapters = new Map<string, CctvAdapter>();

export function registerCctvAdapter(adapter: CctvAdapter): void {
  adapters.set(adapter.name.toUpperCase(), adapter);
}

export function getCctvAdapter(name: string): CctvAdapter | null {
  return adapters.get(name.toUpperCase()) ?? null;
}

/** Pick an adapter by protocol (falling back to integration type, then GENERIC). */
export function resolveCctvAdapter(...names: (string | null | undefined)[]): CctvAdapter {
  for (const name of names) {
    if (!name) continue;
    const adapter = adapters.get(name.toUpperCase());
    if (adapter) return adapter;
  }
  return adapters.get("GENERIC")!;
}

function errMessage(err: unknown): string {
  if (err instanceof Error) {
    if (err.name === "AbortError") return "Camera request timed out";
    return err.message;
  }
  return "Camera request failed";
}

function basicAuth(username: string, password?: string | null): string {
  return `Basic ${Buffer.from(`${username}:${password ?? ""}`).toString("base64")}`;
}

async function httpFetch(url: string, camera: CameraStreamDescriptor, method: "GET" | "HEAD"): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), HTTP_TIMEOUT_MS);
  try {
    const headers: Record<string, string> = {};
    if (camera.username) headers.Authorization = basicAuth(camera.username, camera.password);
    return await fetch(url, { method, headers, signal: controller.signal, redirect: "follow" });
  } finally {
    clearTimeout(timer);
  }
}

const httpAdapter: CctvAdapter = {
  name: "HTTP",
  async probe(camera) {
    try {
      const res = await httpFetch(camera.snapshotUrl ?? camera.endpoint, camera, "HEAD");
      return { reachable: res.status < 500, message: `HTTP ${res.status}` };
    } catch (err) {
      return { reachable: false, message: errMessage(err) };
    }
  },
  async snapshot(camera) {
    try {
      const res = await httpFetch(camera.snapshotUrl ?? camera.endpoint, camera, "GET");
      if (!res.ok) return { ok: false, message: `Camera responded HTTP ${res.status}` };
      const contentType = res.headers.get("content-type") ?? "image/jpeg";
      const buffer = Buffer.from(await res.arrayBuffer());
      if (buffer.length === 0) return { ok: false, message: "Camera returned an empty response" };
      if (buffer.length > MAX_SNAPSHOT_BYTES) return { ok: false, message: "Snapshot exceeds the size limit" };
      if (!contentType.startsWith("image/")) return { ok: false, message: `Unexpected content type: ${contentType}` };
      return { ok: true, buffer, contentType };
    } catch (err) {
      return { ok: false, message: errMessage(err) };
    }
  },
};

function rtspUrlWithCredentials(camera: CameraStreamDescriptor): string {
  const raw = camera.snapshotUrl ?? camera.endpoint;
  if (!camera.username) return raw;
  try {
    const url = new URL(raw);
    url.username = encodeURIComponent(camera.username);
    url.password = encodeURIComponent(camera.password ?? "");
    return url.toString();
  } catch {
    return raw;
  }
}

function tcpProbe(rawUrl: string, timeoutMs: number): Promise<boolean> {
  return new Promise((resolve) => {
    let host: string;
    let port: number;
    try {
      const url = new URL(rawUrl);
      host = url.hostname;
      port = Number(url.port || 554);
    } catch {
      resolve(false);
      return;
    }
    const socket = net.connect({ host, port });
    const done = (ok: boolean) => {
      socket.destroy();
      resolve(ok);
    };
    socket.setTimeout(timeoutMs, () => done(false));
    socket.once("connect", () => done(true));
    socket.once("error", () => done(false));
  });
}

function ffmpegSnapshot(url: string, timeoutMs: number): Promise<{ buffer: Buffer | null; message?: string }> {
  return new Promise((resolve) => {
    const chunks: Buffer[] = [];
    let settled = false;
    let timer: NodeJS.Timeout | undefined;
    let spawnError: NodeJS.ErrnoException | null = null;

    let child;
    try {
      child = spawn("ffmpeg", [
        "-hide_banner",
        "-loglevel",
        "error",
        "-rtsp_transport",
        "tcp",
        "-i",
        url,
        "-frames:v",
        "1",
        "-f",
        "image2pipe",
        "-vcodec",
        "mjpeg",
        "pipe:1",
      ]);
    } catch (err) {
      resolve({ buffer: null, message: errMessage(err) });
      return;
    }

    const finish = (buffer: Buffer | null, message?: string) => {
      if (settled) return;
      settled = true;
      if (timer) clearTimeout(timer);
      try {
        child.kill("SIGKILL");
      } catch {
        /* already exited */
      }
      resolve({ buffer, message });
    };

    timer = setTimeout(() => finish(null, "RTSP snapshot timed out"), timeoutMs);
    child.on("error", (err) => {
      spawnError = err as NodeJS.ErrnoException;
      finish(null);
    });
    child.stdout?.on("data", (chunk: Buffer) => chunks.push(chunk));
    child.stderr?.on("data", () => {
      /* drain */
    });
    child.on("close", (code) => {
      if (spawnError?.code === "ENOENT") {
        finish(null, "ffmpeg is not installed on the server; RTSP snapshots are unavailable");
        return;
      }
      if (code === 0 && chunks.length > 0) {
        finish(Buffer.concat(chunks));
      } else {
        finish(null, "Could not capture an RTSP frame");
      }
    });
  });
}

const rtspAdapter: CctvAdapter = {
  name: "RTSP",
  async probe(camera) {
    const reachable = await tcpProbe(camera.snapshotUrl ?? camera.endpoint, 2000);
    return { reachable, message: reachable ? "Stream port reachable" : "Stream port unreachable" };
  },
  async snapshot(camera) {
    const { buffer, message } = await ffmpegSnapshot(rtspUrlWithCredentials(camera), RTSP_TIMEOUT_MS);
    if (!buffer) return { ok: false, message: message ?? "RTSP snapshot failed" };
    if (buffer.length > MAX_SNAPSHOT_BYTES) return { ok: false, message: "Snapshot exceeds the size limit" };
    return { ok: true, buffer, contentType: "image/jpeg" };
  },
};

const genericAdapter: CctvAdapter = {
  name: "GENERIC",
  async probe() {
    return { reachable: false, message: "Generic adapter does not probe streams; register a vendor adapter." };
  },
  async snapshot() {
    return { ok: false, message: "No snapshot adapter configured for this camera protocol." };
  },
};

for (const name of ["HTTP", "ONVIF", "VENDOR_API", "MJPEG"]) {
  registerCctvAdapter({ ...httpAdapter, name });
}
registerCctvAdapter(rtspAdapter);
registerCctvAdapter(genericAdapter);
