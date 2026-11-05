/** Text for the draft room's polite live region (screen readers only). */
export function buildDraftAnnouncement(args: {
  status: string | null;
  latestPick: { pickNumber: number; seatLabel: string; nomineeLabel: string } | null;
  activeSeatLabel: string | null;
  isMyTurn: boolean;
  /** True while the drafter on the clock is inside the final-seconds window. */
  countdownActive?: boolean;
}): string {
  const { status, latestPick, activeSeatLabel, isMyTurn, countdownActive } = args;
  const parts: string[] = [];
  if (latestPick) {
    parts.push(
      `Pick ${latestPick.pickNumber}: ${latestPick.seatLabel} drafted ${latestPick.nomineeLabel}.`
    );
  }
  if (status === "PAUSED") parts.push("Draft paused.");
  else if (status === "COMPLETED") parts.push("Draft complete.");
  else if (status === "IN_PROGRESS" && activeSeatLabel) {
    parts.push(isMyTurn ? "It is your turn to pick." : `${activeSeatLabel} is picking.`);
    if (isMyTurn && countdownActive) parts.push("5 seconds left to pick.");
  }
  return parts.join(" ");
}
