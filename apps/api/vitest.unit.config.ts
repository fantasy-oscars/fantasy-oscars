import { mergeConfig } from "vitest/config";
import baseConfig from "./vitest.config";

export default mergeConfig(baseConfig, {
  test: {
    exclude: [
      "test/**/*.integration.test.ts",
      "test/db.integration.test.ts",
      "test/factories/db.test.ts",
      "test/routes/**/*.integration.test.ts",
      "test/scripts/load-nominees.test.ts",
      "test/data/repositories.test.ts",
      "test/migrations.test.ts"
    ]
  }
});
