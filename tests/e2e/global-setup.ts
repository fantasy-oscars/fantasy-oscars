import { seedCeremony } from "./support/seed";
import { startStack } from "./support/stack";

export default async function globalSetup() {
  const stack = await startStack();
  try {
    const { ceremonyId } = await seedCeremony(stack);
    process.env.E2E_CEREMONY_ID = String(ceremonyId);
  } catch (err) {
    await stack.stop();
    throw err;
  }
  return stack.stop;
}
