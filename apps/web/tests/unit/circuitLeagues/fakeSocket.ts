import { vi } from "vitest";

type Handler = (...args: unknown[]) => void;

/** A socket.io client double: records handlers and lets a test fire events. */
export function createFakeSocket() {
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

export type FakeSocket = ReturnType<typeof createFakeSocket>;

/** The socket the next `io()` call returns; tests replace it in beforeEach. */
export const sockets: { current: FakeSocket } = { current: createFakeSocket() };

/** Stand-in for the socket.io-client module. */
export const socketModule = {
  io: vi.fn<(url: string, options?: unknown) => FakeSocket>(() => sockets.current)
};
