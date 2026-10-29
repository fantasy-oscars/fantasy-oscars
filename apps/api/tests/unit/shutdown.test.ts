import { createServer } from "http";
import type { AddressInfo } from "net";
import { describe, expect, it, vi } from "vitest";
import { createShutdown, parseShutdownTimeoutMs } from "../../src/shutdown.js";

const quiet = () => {};

describe("createShutdown", () => {
  it("closes server, sweeper, io and pool in order and lets in-flight requests finish", async () => {
    const order: string[] = [];
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    const httpServer = createServer((_req, res) => {
      void gate.then(() => res.end("done"));
    });
    await new Promise<void>((r) => httpServer.listen(0, "127.0.0.1", r));
    const port = (httpServer.address() as AddressInfo).port;

    const origClose = httpServer.close.bind(httpServer);
    httpServer.close = ((cb?: (err?: Error) => void) => {
      order.push("http");
      return origClose(cb);
    }) as typeof httpServer.close;

    const inFlight = fetch(`http://127.0.0.1:${port}/`, {
      headers: { connection: "close" }
    }).then((r) => r.text());
    await new Promise((r) => setTimeout(r, 50));

    const shutdown = createShutdown({
      httpServer,
      io: {
        close: (cb) => {
          order.push("io");
          cb?.();
        }
      },
      sweeper: { stop: () => void order.push("sweeper") },
      pool: {
        end: async () => {
          order.push("pool");
        }
      },
      timeoutMs: 2000,
      log: quiet
    });

    const done = shutdown("SIGTERM");
    setTimeout(release, 100);
    await done;

    expect(await inFlight).toBe("done");
    expect(order).toEqual(["http", "sweeper", "io", "pool"]);
    expect(httpServer.listening).toBe(false);
  });

  it("force-closes connections after the timeout and still ends the pool", async () => {
    const httpServer = createServer(() => {
      // never responds
    });
    await new Promise<void>((r) => httpServer.listen(0, "127.0.0.1", r));
    const port = (httpServer.address() as AddressInfo).port;
    const pending = fetch(`http://127.0.0.1:${port}/`).catch(() => "aborted");
    await new Promise((r) => setTimeout(r, 50));

    const end = vi.fn(async () => {});
    const started = Date.now();
    await createShutdown({
      httpServer,
      sweeper: { stop: () => {} },
      pool: { end },
      timeoutMs: 200,
      log: quiet
    })("SIGTERM");

    expect(Date.now() - started).toBeLessThan(2000);
    expect(end).toHaveBeenCalledTimes(1);
    expect(await pending).toBe("aborted");
  });

  it("is idempotent", async () => {
    const httpServer = createServer();
    await new Promise<void>((r) => httpServer.listen(0, "127.0.0.1", r));
    const end = vi.fn(async () => {});
    const shutdown = createShutdown({
      httpServer,
      sweeper: { stop: () => {} },
      pool: { end },
      timeoutMs: 500,
      log: quiet
    });
    await Promise.all([shutdown("SIGTERM"), shutdown("SIGINT")]);
    expect(end).toHaveBeenCalledTimes(1);
  });
});

describe("parseShutdownTimeoutMs", () => {
  it("defaults to 10000 and accepts positive integers", () => {
    expect(parseShutdownTimeoutMs(undefined)).toBe(10_000);
    expect(parseShutdownTimeoutMs("abc")).toBe(10_000);
    expect(parseShutdownTimeoutMs("-5")).toBe(10_000);
    expect(parseShutdownTimeoutMs("2500")).toBe(2500);
  });
});
