import { seedCeremony, seedDraftCircuit } from "./support/seed";
import { startStack } from "./support/stack";

export default async function globalSetup() {
  const stack = await startStack({ enableDraftSweeper: true });
  try {
    const { ceremonyId } = await seedCeremony(stack);
    process.env.E2E_CEREMONY_ID = String(ceremonyId);
    const draftCircuit = await seedDraftCircuit(stack, ceremonyId);
    process.env.E2E_DRAFT_CIRCUIT = JSON.stringify(draftCircuit);
    process.env.E2E_API_LOG = stack.apiLogPath;
  } catch (err) {
    await stack.stop();
    throw err;
  }
  return stack.stop;
}
