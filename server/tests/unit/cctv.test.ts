import { afterAll, beforeAll, describe, expect, it } from "vitest";
import http from "node:http";
import { getCctvAdapter, resolveCctvAdapter } from "../../src/integrations/cctv.js";

const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0xff, 0xd9]);

let server: http.Server;
let base = "";

beforeAll(async () => {
  server = http.createServer((req, res) => {
    if (req.url === "/photo") {
      res.writeHead(200, { "content-type": "image/jpeg" });
      if (req.method === "HEAD") return res.end();
      return res.end(JPEG);
    }
    if (req.url === "/not-image") {
      res.writeHead(200, { "content-type": "text/html" });
      return res.end("<html>nope</html>");
    }
    if (req.url === "/empty") {
      res.writeHead(200, { "content-type": "image/jpeg" });
      return res.end();
    }
    res.writeHead(404).end();
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const addr = server.address();
  const port = typeof addr === "object" && addr ? addr.port : 0;
  base = `http://127.0.0.1:${port}`;
});

afterAll(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

describe("cctv adapter registry", () => {
  it("resolves adapters by protocol with a GENERIC fallback", () => {
    expect(resolveCctvAdapter("HTTP").name).toBe("HTTP");
    expect(resolveCctvAdapter("ONVIF").name).toBe("ONVIF");
    expect(resolveCctvAdapter("RTSP").name).toBe("RTSP");
    expect(resolveCctvAdapter(undefined, "VENDOR_API").name).toBe("VENDOR_API");
    expect(resolveCctvAdapter("SOMETHING_ELSE").name).toBe("GENERIC");
  });

  it("captures a JPEG snapshot from an HTTP camera", async () => {
    const adapter = resolveCctvAdapter("HTTP");
    const result = await adapter.snapshot({
      cameraId: "cam1",
      protocol: "HTTP",
      endpoint: `${base}/photo`,
    });
    expect(result.ok).toBe(true);
    expect(result.contentType).toBe("image/jpeg");
    expect(result.buffer && result.buffer.length).toBe(JPEG.length);
  });

  it("rejects non-image responses", async () => {
    const adapter = resolveCctvAdapter("HTTP");
    const result = await adapter.snapshot({ cameraId: "cam1", protocol: "HTTP", endpoint: `${base}/not-image` });
    expect(result.ok).toBe(false);
    expect(result.message).toMatch(/content type/i);
  });

  it("reports unreachable/unusable cameras without throwing", async () => {
    const http404 = await resolveCctvAdapter("HTTP").snapshot({
      cameraId: "cam1",
      protocol: "HTTP",
      endpoint: `${base}/missing`,
    });
    expect(http404.ok).toBe(false);

    const generic = await resolveCctvAdapter("GENERIC").snapshot({
      cameraId: "cam1",
      protocol: "GENERIC",
      endpoint: "rtsp://example.invalid/stream",
    });
    expect(generic.ok).toBe(false);
  });

  it("registers each protocol under its own name", () => {
    for (const name of ["HTTP", "ONVIF", "VENDOR_API", "MJPEG", "RTSP", "GENERIC"]) {
      expect(getCctvAdapter(name)?.name).toBe(name);
    }
    expect(getCctvAdapter("NOPE")).toBeNull();
  });
});
