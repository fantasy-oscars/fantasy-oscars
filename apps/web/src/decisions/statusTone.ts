export type StatusTone = "drafting" | "complete" | "live" | "neutral";
export type StatusMark = "dot" | "pause" | "check" | null;

/**
 * Tone and mark for a season status label. Keyed on `SeasonStatusLabel`, the one
 * vocabulary every season surface uses; matching ignores case. "live" is reserved
 * for ceremony night ("In progress"); an unknown label reads as neutral.
 */
export function statusTone(label: string): { tone: StatusTone; mark: StatusMark } {
  switch (label.trim().toLowerCase()) {
    case "drafting":
      return { tone: "drafting", mark: "dot" };
    case "paused":
      return { tone: "drafting", mark: "pause" };
    case "complete":
      return { tone: "complete", mark: "check" };
    case "in progress":
      return { tone: "live", mark: "dot" };
    default:
      // Pre-draft, Closed
      return { tone: "neutral", mark: null };
  }
}
