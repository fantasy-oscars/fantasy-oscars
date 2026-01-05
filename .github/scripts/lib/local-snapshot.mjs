import { mkdir, rename, writeFile } from "node:fs/promises";
import path from "node:path";

export function defaultIssuesSnapshotPath(repoFullName) {
  const safe = repoFullName.replaceAll("/", "_");
  return path.join(".dev", "github-issues", `${safe}.json`);
}

export async function writeJsonAtomic(filePath, data) {
  const dir = path.dirname(filePath);
  await mkdir(dir, { recursive: true });

  const tmpPath = `${filePath}.tmp-${process.pid}-${Date.now()}`;
  await writeFile(tmpPath, `${JSON.stringify(data, null, 2)}\n`, "utf8");
  await rename(tmpPath, filePath);
}

