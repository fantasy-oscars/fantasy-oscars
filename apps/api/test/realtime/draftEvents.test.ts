import { afterEach, describe, expect, it } from "vitest";
import {
  DRAFT_NAMESPACE,
  registerDraftNamespace
} from "../../src/realtime/draftNamespace.js";
import {
  clearDraftEventEmitter,
  emitDraftEvent,
  registerDraftEventEmitter
} from "../../src/realtime/draftEvents.js";
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

async function waitForDraftEventCount(client: TestClient, count: number) {
  for (let i = 0; i < 50; i += 1) {
    const draftEvents = client.events.filter((entry) => entry.event === "draft:event");
    if (draftEvents.length >= count) return draftEvents;
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  throw new Error("Timed out waiting for draft events");
}

describe("draft event emission", () => {
  afterEach(async () => {
    await Promise.all(clients.map(disconnectClient));
    clients = [];
    if (server) {
      await server.close();
      server = undefined;
    }
    clearDraftEventEmitter();
  });

  it("emits draft events to the draft room in order", async () => {
    try {
      server = await startSocketTestServer((io) => {
        const nsp = registerDraftNamespace(io);
        registerDraftEventEmitter(nsp);
      });
    } catch (err) {
      if (err instanceof ListenPermissionError) return;
      throw err;
    }

    const client = await createTestClient(server, {
      namespace: DRAFT_NAMESPACE,
      socketOptions: { query: { draftId: 7 } }
    });
    clients = [client];

    expect(await waitForEvent(client, "joined")).toEqual([{ draftId: 7 }]);

    emitDraftEvent({
      id: 1,
      draft_id: 7,
      version: 1,
      event_type: "draft.started",
      payload: { ok: true },
      created_at: new Date()
    });
    emitDraftEvent({
      id: 2,
      draft_id: 7,
      version: 2,
      event_type: "draft.pick.submitted",
      payload: { ok: true },
      created_at: new Date()
    });

    const draftEvents = await waitForDraftEventCount(client, 2);
    const versions = draftEvents.map(
      (entry) => (entry.args[0] as { version: number }).version
    );
    expect(versions).toEqual([1, 2]);
  });
});
