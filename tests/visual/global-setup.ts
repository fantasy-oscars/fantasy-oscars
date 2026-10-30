import { startStack } from "../e2e/support/stack";
import { seedVisual } from "./support/seed";

export default async function globalSetup() {
  const stack = await startStack();
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
