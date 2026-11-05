export type StatusTone = "drafting" | "complete" | "live" | "neutral";
export type StatusMark = "dot" | "pause" | "check" | null;

/**
 * Tone and mark for a season status label. Keyed on the label unions the season,
 * league, seasons-index and landing decisions return; matching ignores case so the
 * landing labels ("Draft Live", "Draft live") share one entry. "live" is reserved
 * for ceremony night ("In progress"); an unknown label reads as neutral.
 */
export function statusTone(label: string): { tone: StatusTone; mark: StatusMark } {
  switch (label.trim().toLowerCase()) {
    case "drafting":
    case "draft live":
      return { tone: "drafting", mark: "dot" };
    case "paused":
    case "draft paused":
      return { tone: "drafting", mark: "pause" };
    case "draft complete":
    case "complete":
      return { tone: "complete", mark: "check" };
    case "in progress":
      return { tone: "live", mark: "dot" };
    default:
      // Pre-draft, Open, Closed, Draft not started
      return { tone: "neutral", mark: null };
  }
}
