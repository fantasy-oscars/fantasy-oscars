import { startStack } from "../e2e/support/stack";
import { seedWorld } from "./support/world";

export default async function globalSetup() {
  // A test build honours the pinned theme; the sweeper runs out pick clocks.
  const stack = await startStack({
    webMode: "visual",
    enableAllBrands: true,
    enableDraftSweeper: true
  });
  try {
    process.env.TOUR_WORLD = JSON.stringify(await seedWorld(stack));
  } catch (err) {
    await stack.stop();
    throw err;
  }
  return stack.stop;
}
