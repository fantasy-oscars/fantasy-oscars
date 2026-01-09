import { afterEach, describe, expect, it } from "vitest";
import { io as createClient, type Socket } from "socket.io-client";
import {
  DRAFT_NAMESPACE,
  emitToDraft,
  registerDraftNamespace
} from "../../src/realtime/draftNamespace.js";
import {
  ListenPermissionError,
  createTestClient,
  disconnectClient,
  startSocketTestServer,
  waitForEvent,
  type SocketTestServer,
  type TestClient
} from "../support/socket.js";

let server: SocketTestServer | undefined;
let clients: TestClient[] = [];

async function waitForConnectFailure(socket: Socket, timeoutMs = 2000): Promise<Error> {
  return await new Promise<Error>((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error("Expected connection failure")),
      timeoutMs
    );
    const onError = (err: Error) => {
      clearTimeout(timer);
      socket.off("connect", onConnect);
      resolve(err);
    };
    const onConnect = () => {
      clearTimeout(timer);
      socket.off("connect_error", onError);
      reject(new Error("Expected connection failure"));
    };

    socket.once("connect_error", onError);
    socket.once("connect", onConnect);
    socket.connect();
  });
}

describe("draft namespace routing", () => {
  afterEach(async () => {
    await Promise.all(clients.map(disconnectClient));
    clients = [];
    if (server) {
      await server.close();
      server = undefined;
    }
  });

  it("joins draft room on connect and isolates events per draft", async () => {
    try {
      server = await startSocketTestServer((io) => {
        const nsp = registerDraftNamespace(io);
        nsp.on("connection", (socket) => {
          socket.on("ping-draft", (message: string) => {
            emitToDraft(nsp, (socket.data as { draftId: number }).draftId, "draft-ping", {
              message
            });
          });
        });
      });
    } catch (err) {
      if (err instanceof ListenPermissionError) return;
      throw err;
    }

    const draft1ClientA = await createTestClient(server, {
      namespace: DRAFT_NAMESPACE,
      socketOptions: { query: { draftId: 1 } }
    });
    const draft1ClientB = await createTestClient(server, {
      namespace: DRAFT_NAMESPACE,
      socketOptions: { query: { draftId: 1 } }
    });
    const draft2Client = await createTestClient(server, {
      namespace: DRAFT_NAMESPACE,
      socketOptions: { query: { draftId: 2 } }
    });
    clients = [draft1ClientA, draft1ClientB, draft2Client];

    expect(await waitForEvent(draft1ClientA, "joined")).toEqual([{ draftId: 1 }]);
    expect(await waitForEvent(draft1ClientB, "joined")).toEqual([{ draftId: 1 }]);
    expect(await waitForEvent(draft2Client, "joined")).toEqual([{ draftId: 2 }]);

    draft1ClientA.socket.emit("ping-draft", "hello draft 1");
    expect(await waitForEvent(draft1ClientB, "draft-ping")).toEqual([
      { message: "hello draft 1" }
    ]);

    await expect(waitForEvent(draft2Client, "draft-ping", 200)).rejects.toThrow(
      /Timed out waiting for event/
    );
  });

  it("rejects connections without a draft id", async () => {
    try {
      server = await startSocketTestServer((io) => {
        registerDraftNamespace(io);
      });
    } catch (err) {
      if (err instanceof ListenPermissionError) return;
      throw err;
    }

    const socket = createClient(`${server.url}${DRAFT_NAMESPACE}`, {
      transports: ["websocket"],
      forceNew: true,
      autoConnect: false
    });

    const error = await waitForConnectFailure(socket);
    expect(error.message).toContain("INVALID_DRAFT_ID");
    socket.disconnect();
  });
});
