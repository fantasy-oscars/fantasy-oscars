/** Text for the draft room's polite live region (screen readers only). */
export function buildDraftAnnouncement(args: {
  status: string | null;
  latestPick: { pickNumber: number; seatLabel: string; nomineeLabel: string } | null;
  activeSeatLabel: string | null;
  isMyTurn: boolean;
}): string {
  const { status, latestPick, activeSeatLabel, isMyTurn } = args;
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
  }
  return parts.join(" ");
}
