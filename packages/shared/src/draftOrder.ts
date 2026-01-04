export type DraftOrderType = "SNAKE" | "LINEAR";

export function getSnakeSeatForPick(seatCount: number, pickNumber: number): number {
  if (!Number.isInteger(seatCount) || seatCount <= 0) {
    throw new Error("seatCount must be a positive integer");
  }
  if (!Number.isInteger(pickNumber) || pickNumber <= 0) {
    throw new Error("pickNumber must be a positive integer");
  }

  const roundIndex = Math.floor((pickNumber - 1) / seatCount); // 0-based round
  const indexInRound = (pickNumber - 1) % seatCount; // 0-based position within round

  const forward = roundIndex % 2 === 0;
  if (forward) {
    return indexInRound + 1; // seats are 1-based
  }
  return seatCount - indexInRound;
}
