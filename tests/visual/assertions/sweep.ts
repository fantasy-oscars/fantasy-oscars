import {
  SCREENS,
  SPECIMEN_SCREEN,
  VIEWPORTS,
  type ScreenDef,
  type ViewportName
} from "../matrix";
import { stressScreens } from "./stressRuns";

/** A screen the sweep walks, and the label its pairs and failures carry. */
export type SweepScreen = { def: ScreenDef; label: string };

/**
 * One sweep test: a viewport over a slice of its screens. The sweep runs in the
 * probe-stress theme only, so the cell count depends on screens, never on themes.
 */
export type SweepCell = {
  viewport: ViewportName;
  part: number;
  parts: number;
  screens: SweepScreen[];
};

/** Slices per viewport, so each cell takes about a minute on a CI worker. */
const PARTS: Record<ViewportName, number> = { desktop: 3, mobile: 3 };

export function sweepCells(): SweepCell[] {
  return (Object.keys(VIEWPORTS) as ViewportName[]).flatMap((viewport) => {
    const screens: SweepScreen[] = [
      ...[...SCREENS, SPECIMEN_SCREEN]
        .filter((s) => !s.viewports || s.viewports.includes(viewport))
        .map((def) => ({ def, label: def.id })),
      ...stressScreens(viewport).map((def) => ({ def, label: `${def.id} (stress data)` }))
    ];
    const parts = PARTS[viewport];
    const size = Math.ceil(screens.length / parts);
    return Array.from({ length: parts }, (_, part) => ({
      viewport,
      part,
      parts,
      screens: screens.slice(part * size, (part + 1) * size)
    }));
  });
}
