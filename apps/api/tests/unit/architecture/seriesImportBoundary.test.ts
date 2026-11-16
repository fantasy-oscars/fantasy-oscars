import path from "path";
import { fileURLToPath } from "url";
import { ESLint } from "eslint";
import { beforeAll, describe, expect, it } from "vitest";

// Lints snippets as if they lived at real module paths, so the boundary in
// eslint.config.mjs is checked against deliberate violations (ADR 0005, section 10).
const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../../../.."
);
const RULE = "no-restricted-imports";

let eslint: ESLint;

async function restrictedImports(filePath: string, code: string) {
  const [result] = await eslint.lintText(code, {
    filePath: path.join(repoRoot, filePath)
  });
  return (result?.messages ?? []).filter((m) => m.ruleId === RULE);
}

describe("Series import boundary", () => {
  beforeAll(() => {
    eslint = new ESLint({ cwd: repoRoot });
  });

  it.each([
    [
      "apps/api/src/services/series/seriesAdmin.ts",
      `import { getSeasonById } from "../../data/repositories/seasonRepository.js";`
    ],
    [
      "apps/api/src/routes/admin/seriesMappings.ts",
      `import { createDraft } from "../../services/drafting/createDraft.js";`
    ],
    ["apps/api/src/domain/series.ts", `import { scoreDraft } from "./scoring.js";`],
    [
      "apps/api/src/routes/series.ts",
      `import { emitDraftEvent } from "../realtime/draftEvents.js";`
    ]
  ])(
    "%s may not import a Season, draft, scoring or realtime module",
    async (file, code) => {
      const messages = await restrictedImports(file, code);
      expect(messages).toHaveLength(1);
    }
  );

  it.each([
    [
      "apps/api/src/data/repositories/seasonRepository.ts",
      `import { getSeriesById } from "./seriesRepository.js";`
    ],
    [
      "apps/api/src/routes/drafts/picksRoute.ts",
      `import { listScoringOccasions } from "../../domain/series.js";`
    ],
    [
      "apps/api/src/domain/scoring.ts",
      `import { SERIES_CATEGORIES } from "./series.js";`
    ],
    [
      "apps/api/src/realtime/draftNamespace.ts",
      `import { activate } from "../services/series/seriesAdmin.js";`
    ]
  ])("%s may not import a Series module", async (file, code) => {
    const messages = await restrictedImports(file, code);
    expect(messages).toHaveLength(1);
  });

  it("allows the pure draft functions the Series draft reuses, and shared reference data", async () => {
    const messages = await restrictedImports(
      "apps/api/src/services/series/seriesAdmin.ts",
      [
        `import { buildDraftOrder } from "../../domain/draftOrder.js";`,
        `import { isPickAllowed } from "../../domain/draftPickRules.js";`,
        `import { updateCeremonyDates } from "../../data/repositories/ceremonyRepository.js";`
      ].join("\n")
    );
    expect(messages).toEqual([]);
  });

  it("leaves unrelated modules alone", async () => {
    const messages = await restrictedImports(
      "apps/api/src/routes/admin/ceremoniesGet.ts",
      `import { listSeries } from "../../data/repositories/seriesRepository.js";`
    );
    expect(messages).toEqual([]);
  });
});
