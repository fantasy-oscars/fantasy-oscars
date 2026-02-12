import { useLayoutEffect } from "react";
import type { RefObject } from "react";

export type CssVarValue = string | number | null | undefined;

// Central helper to avoid `style={{ ... }}` usage for dynamic CSS variables.
// This keeps feature components declarative while still supporting state-driven
// layout (e.g. draft room rails).
export function useCssVars<T extends HTMLElement>(
  ref: RefObject<T | null>,
  vars: Record<string, CssVarValue>
) {
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;

    const applied: string[] = [];
    for (const [name, value] of Object.entries(vars)) {
      if (value === null || value === undefined) continue;
      applied.push(name);
      el.style.setProperty(name, String(value));
    }

    return () => {
      for (const name of applied) {
        el.style.removeProperty(name);
      }
    };
  }, [ref, vars]);
}

