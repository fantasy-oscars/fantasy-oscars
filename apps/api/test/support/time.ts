import { vi } from "vitest";

export const TEST_BASE_TIME = new Date("2024-01-01T00:00:00.000Z");

export function addSeconds(date: Date, seconds: number): Date {
  return new Date(date.getTime() + seconds * 1000);
}

export function freezeTime(at: Date = TEST_BASE_TIME) {
  vi.useFakeTimers();
  vi.setSystemTime(at);
  return () => {
    vi.useRealTimers();
  };
}

export async function withFrozenTime<T>(at: Date, fn: () => Promise<T> | T) {
  const restore = freezeTime(at);
  try {
    return await fn();
  } finally {
    restore();
  }
}

export function advanceSeconds(seconds: number): Date {
  vi.advanceTimersByTime(seconds * 1000);
  return new Date();
}
