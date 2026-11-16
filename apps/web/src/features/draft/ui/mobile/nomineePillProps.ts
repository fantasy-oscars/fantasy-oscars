import type { KeyboardEvent } from "react";

/**
 * Tooltips need hover, which touch lacks: on mobile a nominee pill is a button
 * that opens the nominee card instead.
 */
export function nomineePillProps(
  nominationId: number | null | undefined,
  onOpen: (nominationId: number) => void
) {
  if (typeof nominationId !== "number") return {};
  return {
    tabIndex: 0,
    role: "button",
    onClick: () => onOpen(nominationId),
    onKeyDown: (e: KeyboardEvent<HTMLElement>) => {
      if (e.key !== "Enter" && e.key !== " ") return;
      e.preventDefault();
      onOpen(nominationId);
    }
  };
}
