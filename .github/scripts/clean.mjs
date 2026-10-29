import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

function remove(target) {
  fs.rmSync(target, { recursive: true, force: true });
  console.log(`removed ${path.relative(root, target)}`);
}

for (const group of ["apps", "packages"]) {
  const groupDir = path.join(root, group);
  if (!fs.existsSync(groupDir)) continue;
  for (const entry of fs.readdirSync(groupDir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const dist = path.join(groupDir, entry.name, "dist");
    if (fs.existsSync(dist)) remove(dist);
  }
}

// Only look inside workspace packages (and root-level files) so the walk never
// reaches unrelated directories such as local tooling or other worktrees.
function walk(dir, recurse) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === "node_modules") continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (recurse) walk(full, true);
    } else if (entry.name.endsWith(".tsbuildinfo")) {
      remove(full);
    }
  }
}
walk(root, false);
for (const group of ["apps", "packages"]) {
  const groupDir = path.join(root, group);
  if (fs.existsSync(groupDir)) walk(groupDir, true);
}
