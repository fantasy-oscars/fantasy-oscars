import { execFileSync } from "node:child_process";

export async function githubRestJson(_token, { method, path, body }) {
  const cleanPath = path.replace(/^\/+/, "");
  const args = ["api", cleanPath, "-H", "Accept: application/vnd.github+json"];
  if (method && method.toUpperCase() !== "GET") {
    args.push("-X", method.toUpperCase());
  }
  let input;
  if (body) {
    args.push("-H", "Content-Type: application/json", "--input", "-");
    input = JSON.stringify(body);
  }
  const output = execFileSync("gh", args, { encoding: "utf8", input });
  if (!output) return null;
  return JSON.parse(output);
}
