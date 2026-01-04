import { createServer } from "http";
import type { AddressInfo } from "net";
import { Server } from "socket.io";
import { io as createClient, type Socket } from "socket.io-client";

export class ListenPermissionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ListenPermissionError";
  }
}

export type SocketTestServer = {
  io: Server;
  url: string;
  close: () => Promise<void>;
};

export type TestClient = {
  socket: Socket;
  events: Array<{ event: string; args: unknown[] }>;
};

async function closeServer(io: Server, httpServer: ReturnType<typeof createServer>) {
  await new Promise<void>((resolve) => io.close(() => resolve()));
  await new Promise<void>((resolve) => httpServer.close(() => resolve()));
}

export async function startSocketTestServer(
  configure?: (io: Server) => void
): Promise<SocketTestServer> {
  const httpServer = createServer();
  const io = new Server(httpServer, { serveClient: false });
  configure?.(io);

  return await new Promise<SocketTestServer>((resolve, reject) => {
    httpServer
      .listen(0, "127.0.0.1", () => {
        const { port } = httpServer.address() as AddressInfo;
        resolve({
          io,
          url: `http://127.0.0.1:${port}`,
          close: async () => {
            await closeServer(io, httpServer);
          }
        });
      })
      .on("error", (err: NodeJS.ErrnoException) => {
        if (err.code === "EPERM") {
          reject(new ListenPermissionError("Cannot bind test socket server (permission denied)"));
        } else {
          reject(err);
        }
      });
  });
}

function waitForConnect(socket: Socket, timeoutMs = 2000) {
  return new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("connect timeout")), timeoutMs);
    const onConnect = () => {
      clearTimeout(timer);
      socket.off("connect_error", onError);
      resolve();
    };
    const onError = (err: Error) => {
      clearTimeout(timer);
      socket.off("connect", onConnect);
      reject(err);
    };
    socket.once("connect", onConnect);
    socket.once("connect_error", onError);
  });
}

export async function createTestClient(server: SocketTestServer): Promise<TestClient> {
  const events: Array<{ event: string; args: unknown[] }> = [];
  const socket = createClient(server.url, {
    transports: ["websocket"],
    autoConnect: true,
    forceNew: true
  });

  socket.onAny((event, ...args) => {
    events.push({ event, args });
  });

  await waitForConnect(socket);
  return { socket, events };
}

export async function waitForEvent(
  client: TestClient,
  eventName: string,
  timeoutMs = 2000
): Promise<unknown[]> {
  const existing = client.events.find((entry) => entry.event === eventName);
  if (existing) return existing.args;

  return await new Promise<unknown[]>((resolve, reject) => {
    const timer = setTimeout(() => {
      client.socket.off(eventName, onEvent);
      reject(new Error(`Timed out waiting for event "${eventName}"`));
    }, timeoutMs);

    const onEvent = (...args: unknown[]) => {
      clearTimeout(timer);
      client.events.push({ event: eventName, args });
      resolve(args);
    };

    client.socket.once(eventName, onEvent);
  });
}

export async function disconnectClient(client: TestClient) {
  if (client.socket.connected) {
    client.socket.disconnect();
  }
}
