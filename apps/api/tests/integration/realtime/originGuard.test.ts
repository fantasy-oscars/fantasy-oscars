import { afterEach, describe, expect, it } from "vitest";
import { createServer } from "http";
import type { AddressInfo } from "net";
import { Server } from "socket.io";
import { io as createClient, type Socket } from "socket.io-client";
import { createAllowRequest } from "../../../src/realtime/originGuard.js";

const ALLOWED = "http://localhost:5173";
let cleanup: Array<() => Promise<void>> = [];

afterEach(async () => {
  await Promise.all(cleanup.map((fn) => fn()));
  cleanup = [];
});

async function startServer(): Promise<string> {
  const httpServer = createServer();
  const io = new Server(httpServer, {
    serveClient: false,
    allowRequest: createAllowRequest([ALLOWED])
  });
  await new Promise<void>((resolve) => httpServer.listen(0, "127.0.0.1", resolve));
  cleanup.push(async () => {
    await new Promise<void>((resolve) => io.close(() => resolve()));
  });
  return `http://127.0.0.1:${(httpServer.address() as AddressInfo).port}`;
}

function connect(url: string, origin?: string): Promise<"connected" | "refused"> {
  return new Promise((resolve) => {
    const socket: Socket = createClient(url, {
      transports: ["websocket"],
      forceNew: true,
      reconnection: false,
      extraHeaders: origin ? { Origin: origin } : undefined
    });
    cleanup.push(async () => {
      socket.close();
    });
    socket.once("connect", () => resolve("connected"));
    socket.once("connect_error", () => resolve("refused"));
  });
}

describe("websocket origin guard", () => {
  it("refuses a websocket-only handshake from a disallowed origin", async () => {
    const url = await startServer();
    expect(await connect(url, "https://evil.example")).toBe("refused");
    expect(await connect(url, `${ALLOWED}.evil.com`)).toBe("refused");
  });

  it("accepts an allowed origin and requests without an Origin header", async () => {
    const url = await startServer();
    expect(await connect(url, ALLOWED)).toBe("connected");
    expect(await connect(url)).toBe("connected");
  });
});
