import { afterEach, describe, expect, it, vi } from "vitest";
import { BRAND_IDS, ENABLED_BRAND_IDS } from "@fantasy-oscars/shared/brands";
import { createColorSchemeManager } from "@/orchestration/brand/colorSchemeManager";

afterEach(() => {
  window.localStorage.clear();
  document.documentElement.removeAttribute("data-mantine-color-scheme");
  document.documentElement.removeAttribute("data-brand");
});

function storageEvent(key: string, newValue: string) {
  return new StorageEvent("storage", {
    key,
    newValue,
    storageArea: window.localStorage
  });
}

describe("colour scheme manager", () => {
  const manager = (testOverride: boolean, enabled = BRAND_IDS) =>
    createColorSchemeManager({ testOverride, enabled });

  it("reads the attribute the pre-paint script set, else the default", () => {
    const m = manager(false);
    expect(m.get("dark")).toBe("dark");
    document.documentElement.setAttribute("data-mantine-color-scheme", "light");
    expect(m.get("dark")).toBe("light");
    document.documentElement.setAttribute("data-mantine-color-scheme", "auto");
    expect(m.get("dark")).toBe("dark");
  });

  it("persists nothing", () => {
    const m = manager(false);
    m.set("light");
    m.clear();
    expect(window.localStorage.length).toBe(0);
    expect(window.localStorage.getItem("mantine-color-scheme-value")).toBeNull();
  });

  it("does not listen to storage in production", () => {
    const m = manager(false);
    const onUpdate = vi.fn();
    m.subscribe(onUpdate);
    window.dispatchEvent(
      storageEvent("fo:test-appearance", '{"brand":"noir","mode":"dark"}')
    );
    expect(onUpdate).not.toHaveBeenCalled();
    expect(document.documentElement.dataset.brand).toBeUndefined();
    m.unsubscribe();
  });

  it("repaints in place from fo:test-appearance in a test build", () => {
    const m = manager(true);
    const onUpdate = vi.fn();
    m.subscribe(onUpdate);
    window.dispatchEvent(
      storageEvent("fo:test-appearance", '{"brand":"noir","mode":"light"}')
    );
    expect(onUpdate).toHaveBeenCalledWith("light");
    expect(document.documentElement.dataset.brand).toBe("noir");
    window.dispatchEvent(storageEvent("other", '{"brand":"ballot","mode":"dark"}'));
    window.dispatchEvent(storageEvent("fo:test-appearance", "nope"));
    expect(onUpdate).toHaveBeenCalledTimes(1);
    m.unsubscribe();
    window.dispatchEvent(
      storageEvent("fo:test-appearance", '{"brand":"noir","mode":"dark"}')
    );
    expect(onUpdate).toHaveBeenCalledTimes(1);
  });

  it("ignores an override naming an unreleased theme", () => {
    const m = manager(true, ENABLED_BRAND_IDS);
    const onUpdate = vi.fn();
    m.subscribe(onUpdate);
    window.dispatchEvent(
      storageEvent("fo:test-appearance", '{"brand":"noir","mode":"dark"}')
    );
    expect(onUpdate).not.toHaveBeenCalled();
    m.unsubscribe();
  });
});
