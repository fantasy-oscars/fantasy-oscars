import { createRef, useRef, useState, type RefObject } from "react";

type PillRef = RefObject<HTMLButtonElement | null>;

// Glue for keyboard drafting on the phone board: which category is "entered" and a
// stable first-pill ref per category, mirroring the desktop board's wiring.
export function useCategoryKeyboardFocus(categoryIds: string[]) {
  const [keyboardCategoryId, setKeyboardCategoryId] = useState<string | null>(null);
  const refs = useRef<Record<string, PillRef | undefined>>({});
  for (const id of categoryIds) {
    if (!refs.current[id]) refs.current[id] = createRef<HTMLButtonElement>();
  }
  return {
    keyboardCategoryId,
    setKeyboardCategoryId,
    firstPillRefByCategoryId: refs.current
  };
}
