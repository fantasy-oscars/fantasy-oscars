import { renderHook } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Snapshot } from "@/lib/types";
import { useDraftSocket } from "@/orchestration/draft/useDraftSocket";

type Handler = (...args: unknown[]) => void;

function createFakeSocket() {
  const handlers = new Map<string, Handler[]>();
  const managerHandlers = new Map<string, Handler[]>();
  const add = (map: Map<string, Handler[]>, name: string, fn: Handler) =>
    map.set(name, [...(map.get(name) ?? []), fn]);
  const remove = (map: Map<string, Handler[]>, name: string, fn?: Handler) =>
    map.set(name, fn ? (map.get(name) ?? []).filter((h) => h !== fn) : []);
  return {
    on: vi.fn((name: string, fn: Handler) => add(handlers, name, fn)),
    off: vi.fn((name: string, fn?: Handler) => remove(handlers, name, fn)),
    connect: vi.fn(),
    disconnect: vi.fn(),
    io: {
      on: vi.fn((name: string, fn: Handler) => add(managerHandlers, name, fn)),
      off: vi.fn((name: string, fn?: Handler) => remove(managerHandlers, name, fn))
    },
    emitLocal(name: string, ...args: unknown[]) {
      for (const h of handlers.get(name) ?? []) h(...args);
    },
    emitManager(name: string, ...args: unknown[]) {
      for (const h of managerHandlers.get(name) ?? []) h(...args);
    }
  };
}

let fakeSocket = createFakeSocket();
vi.mock("socket.io-client", () => ({ io: vi.fn(() => fakeSocket) }));

const snapshot = {
  draft: { id: 4, status: "IN_PROGRESS", current_pick_number: 1 },
  seats: [],
  picks: [],
  version: 3
} as unknown as Snapshot;

function setup() {
  const loadSnapshot = vi.fn().mockResolvedValue(true);
  const onConnectionEvent = vi.fn();
  const recordServerTime = vi.fn();
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={new QueryClient()}>{children}</QueryClientProvider>
  );
  renderHook(
    () =>
      useDraftSocket({
        snapshot,
        socketRef: { current: null },
        snapshotRef: { current: snapshot },
        lastVersionRef: { current: 3 },
        loadSnapshot,
        setSnapshot: vi.fn(),
        setError: vi.fn(),
        onConnectionEvent,
        recordServerTime
      }),
    { wrapper }
  );
  return { loadSnapshot, onConnectionEvent, recordServerTime };
}

describe("useDraftSocket connection handling", () => {
  beforeEach(() => {
    fakeSocket = createFakeSocket();
  });

  it("reports connecting, then connected, and resyncs the snapshot on connect", () => {
    const { loadSnapshot, onConnectionEvent } = setup();
    expect(onConnectionEvent).toHaveBeenCalledWith("start");
    expect(fakeSocket.connect).toHaveBeenCalled();

    fakeSocket.emitLocal("connect");
    expect(onConnectionEvent).toHaveBeenLastCalledWith("connect");
    expect(loadSnapshot).toHaveBeenCalledTimes(1);
    expect(loadSnapshot).toHaveBeenCalledWith({ preserveSnapshot: true });
  });

  it("flags a dropped transport as transient and reloads the snapshot when it returns", () => {
    const { loadSnapshot, onConnectionEvent } = setup();
    fakeSocket.emitLocal("connect");
    loadSnapshot.mockClear();

    fakeSocket.emitLocal("disconnect", "transport close");
    expect(onConnectionEvent).toHaveBeenLastCalledWith("disconnect_transient");

    fakeSocket.emitManager("reconnect_attempt", 1);
    expect(onConnectionEvent).toHaveBeenLastCalledWith("reconnect_attempt");
    expect(loadSnapshot).not.toHaveBeenCalled();

    fakeSocket.emitLocal("connect");
    expect(onConnectionEvent).toHaveBeenLastCalledWith("connect");
    expect(loadSnapshot).toHaveBeenCalledWith({ preserveSnapshot: true });
  });

  it("flags a server-initiated close as final", () => {
    const { onConnectionEvent } = setup();
    fakeSocket.emitLocal("connect");
    fakeSocket.emitLocal("disconnect", "io server disconnect");
    expect(onConnectionEvent).toHaveBeenLastCalledWith("disconnect_final");
  });

  it("records the server time carried by draft events", () => {
    const { recordServerTime } = setup();
    fakeSocket.emitLocal("draft:event", {
      draft_id: 4,
      version: 4,
      event_type: "draft.pick.submitted",
      server_time: "2026-03-01T20:00:00.000Z",
      created_at: "2026-03-01T20:00:00.000Z"
    });
    expect(recordServerTime).toHaveBeenCalledWith({
      serverTime: "2026-03-01T20:00:00.000Z"
    });
  });
});
