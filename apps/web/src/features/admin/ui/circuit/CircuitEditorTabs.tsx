import { useRef, type KeyboardEvent } from "react";
import { Group, UnstyledButton } from "@ui";

export type CircuitEditorTab = "categories" | "ceremonies" | "schedule";

export const CIRCUIT_EDITOR_TABS: Array<{ value: CircuitEditorTab; label: string }> = [
  { value: "categories", label: "Categories" },
  { value: "ceremonies", label: "Ceremonies" },
  { value: "schedule", label: "Schedule" }
];

export function circuitTabId(tab: CircuitEditorTab) {
  return `circuit-tab-${tab}`;
}

export function circuitPanelId(tab: CircuitEditorTab) {
  return `circuit-panel-${tab}`;
}

/**
 * The Circuit editor's tabs, drawn as the admin's nav pills. Arrow keys,
 * Home and End move between tabs (WAI-ARIA tabs, automatic activation).
 */
export function CircuitEditorTabs(props: {
  value: CircuitEditorTab;
  onChange: (tab: CircuitEditorTab) => void;
}) {
  const refs = useRef<Array<HTMLButtonElement | null>>([]);

  function onKeyDown(e: KeyboardEvent, idx: number) {
    const last = CIRCUIT_EDITOR_TABS.length - 1;
    const next =
      e.key === "ArrowRight"
        ? idx === last
          ? 0
          : idx + 1
        : e.key === "ArrowLeft"
          ? idx === 0
            ? last
            : idx - 1
          : e.key === "Home"
            ? 0
            : e.key === "End"
              ? last
              : null;
    if (next === null) return;
    e.preventDefault();
    props.onChange(CIRCUIT_EDITOR_TABS[next]!.value);
    refs.current[next]?.focus();
  }

  return (
    <Group role="tablist" aria-label="Circuit editor" gap="xs" className="circuit-tabs">
      {CIRCUIT_EDITOR_TABS.map((tab, idx) => {
        const selected = tab.value === props.value;
        return (
          <UnstyledButton
            key={tab.value}
            ref={(node: HTMLButtonElement | null) => {
              refs.current[idx] = node;
            }}
            type="button"
            role="tab"
            id={circuitTabId(tab.value)}
            aria-selected={selected}
            aria-controls={circuitPanelId(tab.value)}
            tabIndex={selected ? 0 : -1}
            className={`nav-link${selected ? " active" : ""}`}
            onClick={() => props.onChange(tab.value)}
            onKeyDown={(e: KeyboardEvent) => onKeyDown(e, idx)}
          >
            {tab.label}
          </UnstyledButton>
        );
      })}
    </Group>
  );
}
