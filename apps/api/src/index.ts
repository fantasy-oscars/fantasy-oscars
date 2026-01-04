import { createServer } from "./server.js";
import { loadConfig } from "./config/env.js";

const config = loadConfig();
const app = createServer();

app.listen(config.port, () => {
  // eslint-disable-next-line no-console
  console.log(`API listening on http://localhost:${config.port}`);
});
