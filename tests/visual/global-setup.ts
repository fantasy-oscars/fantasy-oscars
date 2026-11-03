import { startStack } from "../e2e/support/stack";
import { seedVisual } from "./support/seed";

export default async function globalSetup() {
  // A non-production build mode so every brand can be enabled (the flag is refused in
  // production). Only the brand gate differs from the e2e build.
  const stack = await startStack({ webMode: "visual", enableAllBrands: true });
  try {
    const seed = await seedVisual(stack.pool);
    // Workers inherit the environment of the process that ran global setup.
    process.env.VISUAL_SEED = JSON.stringify(seed);
  } catch (err) {
    await stack.stop();
    throw err;
  }
  return stack.stop;
}
