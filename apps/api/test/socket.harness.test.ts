import { afterAll, describe, expect, it } from "vitest";
import {
  ListenPermissionError,
  createTestClient,
  disconnectClient,
  startSocketTestServer,
  waitForEvent,
  type SocketTestServer,
  type TestClient
} from "./support/socket.js";

let server: SocketTestServer | undefined;
const clients: TestClient[] = [];

describe("Socket.IO test harness", () => {
  afterAll(async () => {
    await Promise.all(clients.map(disconnectClient));
    if (server) {
      await server.close();
    }
  });

  it("connects multiple clients, joins/leaves rooms, captures events, and handles reconnect", async () => {
    try {
      server = await startSocketTestServer((io) => {
        io.on("connection", (socket) => {
          socket.on("join-room", (room: string) => {
            socket.join(room);
            socket.emit("joined", room);
          });

          socket.on("leave-room", (room: string) => {
            socket.leave(room);
            socket.emit("left", room);
          });

          socket.on("ping-room", ({ room, message }: { room: string; message: string }) => {
            socket.to(room).emit("pinged", message);
          });
        });
      });
    } catch (err) {
      if (err instanceof ListenPermissionError) return;
      throw err;
    }

    const clientA = await createTestClient(server);
    const clientB = await createTestClient(server);
    clients.push(clientA, clientB);

    clientA.socket.emit("join-room", "room1");
    clientB.socket.emit("join-room", "room1");
    expect(await waitForEvent(clientA, "joined")).toEqual(["room1"]);
    expect(await waitForEvent(clientB, "joined")).toEqual(["room1"]);

    clientA.socket.emit("ping-room", { room: "room1", message: "hello" });
    expect(await waitForEvent(clientB, "pinged")).toEqual(["hello"]);

    clientB.socket.emit("leave-room", "room1");
    expect(await waitForEvent(clientB, "left")).toEqual(["room1"]);

    const disconnectPromise = waitForEvent(clientA, "disconnect");
    clientA.socket.disconnect();
    await disconnectPromise;

    const reconnectPromise = waitForEvent(clientA, "connect");
    clientA.socket.connect();
    await reconnectPromise;
  });
});
