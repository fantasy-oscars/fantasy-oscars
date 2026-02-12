#!/usr/bin/env node
/**
 * Import the roadmap JSON into GitHub Issues (labels + milestones + issues), without using Projects.
 *
 * Safety:
 * - Default is dry-run (writes rendered Markdown to disk, prints what it would do).
 * - Use --apply to actually create milestones/labels/issues via `gh api`.
 *
 * Usage:
 *   node .github/scripts/roadmap-import.mjs --roadmap .dev/github-issues/fantasy-oscars-mvp-mar1-2026.json
 *   node .github/scripts/roadmap-import.mjs --roadmap ... --repo owner/name --apply
 *
 * Requirements:
 * - Authenticate `gh` CLI (`gh auth login`).
 */

import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { requireGitHubToken, inferRepoFullName, splitRepoFullName } from "./lib/github.mjs";
import { githubRestJson } from "./lib/rest.mjs";

function parseArgs(argv) {
  const args = {
    roadmap: undefined,
    repo: undefined,
    apply: false,
    outDir: ".dev/github-issues/generated",
    include: [],
    max: Infinity,
    createMilestones: true,
    createLabels: true,
    createIssues: true
  };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--roadmap") args.roadmap = argv[++i];
    else if (arg === "--repo") args.repo = argv[++i];
    else if (arg === "--apply") args.apply = true;
    else if (arg === "--out-dir") args.outDir = argv[++i];
    else if (arg === "--include") {
      args.include = String(argv[++i])
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
    } else if (arg === "--max") {
      const n = Number(argv[++i]);
      if (!Number.isFinite(n) || n <= 0) throw new Error(`Invalid --max ${n}`);
      args.max = n;
    }
    else if (arg === "--no-milestones") args.createMilestones = false;
    else if (arg === "--no-labels") args.createLabels = false;
    else if (arg === "--no-issues") args.createIssues = false;
  }
  return args;
}

function must(value, message) {
  if (!value) throw new Error(message);
  return value;
}

function formatBool(value) {
  return value ? "Yes" : "No";
}

function normalizeWorkstream(workstream) {
  const ws = String(workstream || "").toLowerCase();
  if (ws.includes("backend")) return "ws:backend-api";
  if (ws.includes("frontend")) return "ws:frontend-web";
  if (ws.includes("realtime") || ws.includes("draft")) return "ws:realtime-drafts";
  if (ws.includes("admin") || ws.includes("content")) return "ws:admin-content";
  if (ws.includes("infra") || ws.includes("docs")) return "ws:infra-docs";
  return "ws:other";
}

function normalizeScope(scopeTier) {
  const s = String(scopeTier || "").toLowerCase();
  if (s === "must") return "scope:must";
  if (s === "should") return "scope:should";
  if (s === "could") return "scope:could";
  return "scope:other";
}

function normalizeRisk(risk) {
  const r = String(risk || "").toLowerCase();
  if (r === "high") return "risk:high";
  if (r === "medium") return "risk:medium";
  if (r === "low") return "risk:low";
  return "risk:other";
}

function issueTitle(ticket) {
  const indexId = ticket.indexId ?? "IDX-???";
  const id = ticket.id ?? "FO-???";
  const title = ticket.title ?? "Untitled";
  return `${indexId} ${id}: ${title}`;
}

function renderList(lines) {
  if (!Array.isArray(lines) || lines.length === 0) return "_None_";
  return lines.map((l) => `- [ ] ${l}`).join("\n");
}

function renderBulletList(lines) {
  if (!Array.isArray(lines) || lines.length === 0) return "_None_";
  return lines.map((l) => `- ${l}`).join("\n");
}

function renderDeps(dependsOn) {
  if (!Array.isArray(dependsOn) || dependsOn.length === 0) return "_None_";
  // Ticket IDs only (issue numbers are unknown until after import).
  return dependsOn.map((d) => `- ${d}`).join("\n");
}

function renderIssueBody({ ticket, milestone, prBatch }) {
  const summary = [
    `**Index:** ${ticket.indexId ?? "TBD"}`,
    `**Ticket ID:** ${ticket.id ?? "TBD"}`,
    `**Workstream:** ${ticket.workstream ?? "TBD"}`,
    `**Scope:** ${ticket.scopeTier ?? "TBD"}`,
    `**Risk:** ${ticket.risk ?? "TBD"}`,
    `**Blocking:** ${formatBool(Boolean(ticket.blocking))}`,
    `**Milestone:** ${milestone.title}`,
    `**PR Batch:** ${ticket.prBatchKey ?? "TBD"}${prBatch ? ` (branch: \`${prBatch.branch}\`, title: “${prBatch.prTitle ?? prBatch.title ?? prBatch.key}”)` : ""}`
  ].join("  \n");

  const contract = ticket.contract ? String(ticket.contract) : "_TBD_";

  const ac = renderList(ticket.acceptanceCriteria);
  const impl = renderBulletList(ticket.implementationNotes);
  const oos = renderBulletList(ticket.outOfScope);
  const deps = renderDeps(ticket.dependsOn);

  const branch = ticket.branch ? `\`${ticket.branch}\`` : "_TBD_";
  const commit = ticket.commitMessage ? `\`${ticket.commitMessage}\`` : "_TBD_";
  const pr = prBatch ? `Merge into \`${prBatch.branch}\` (PR title: “${prBatch.prTitle ?? prBatch.title ?? prBatch.key}”)` : "_TBD_";
  const next = ticket.nextIndexId ? `${ticket.nextIndexId}` : "DONE";

  const conclusion = Array.isArray(ticket.conclusionTemplate) ? renderBulletList(ticket.conclusionTemplate) : "_TBD_";

  return `## Summary
${summary}

## Contract
${contract}

## Acceptance Criteria
${ac}

## Implementation Notes
${impl}

## Out of Scope
${oos}

## Dependencies
${deps}

## Execution Plan
- **Branch:** ${branch}
- **Recommended commit (Conventional Commits):** ${commit}
- **Suggested PR:** ${pr}

## Conclusion (fill when done)
${conclusion}

## Next
${next}
`;
}

async function listAllPages(token, { method = "GET", path: apiPath, query = {} }) {
  const results = [];
  let page = 1;
  for (;;) {
    const url = new URL(`https://api.github.com/${apiPath.replace(/^\/+/, "")}`);
    for (const [k, v] of Object.entries(query)) url.searchParams.set(k, String(v));
    url.searchParams.set("per_page", "100");
    url.searchParams.set("page", String(page));
    const data = await githubRestJson(token, { method, path: url.toString().replace("https://api.github.com/", ""), body: null });
    if (!Array.isArray(data) || data.length === 0) break;
    results.push(...data);
    if (data.length < 100) break;
    page++;
  }
  return results;
}

async function ensureLabels(token, repoFullName, labelSpecs, { apply }) {
  const existing = await listAllPages(token, { path: `/repos/${repoFullName}/labels`, query: {} });
  const byName = new Set(existing.map((l) => l.name));
  const toCreate = labelSpecs.filter((l) => !byName.has(l.name));
  if (!apply) return { created: 0, skipped: labelSpecs.length };

  for (const label of toCreate) {
    await githubRestJson(token, {
      method: "POST",
      path: `/repos/${repoFullName}/labels`,
      body: label
    });
  }
  return { created: toCreate.length, skipped: labelSpecs.length - toCreate.length };
}

async function ensureMilestones(token, repoFullName, milestoneSpecs, { apply }) {
  const existing = await listAllPages(token, {
    path: `/repos/${repoFullName}/milestones`,
    query: { state: "all" }
  });
  const byTitle = new Map(existing.map((m) => [m.title, m]));
  const result = new Map();

  for (const spec of milestoneSpecs) {
    const found = byTitle.get(spec.title);
    if (found) {
      result.set(spec.title, found);
      continue;
    }
    if (!apply) continue;
    const created = await githubRestJson(token, {
      method: "POST",
      path: `/repos/${repoFullName}/milestones`,
      body: spec
    });
    result.set(spec.title, created);
  }

  // For dry-run, synthesize a placeholder with milestone number unknown.
  for (const spec of milestoneSpecs) {
    if (!result.has(spec.title)) {
      result.set(spec.title, { title: spec.title, number: null });
    }
  }

  return result;
}

function defaultMilestoneSpec(key) {
  if (key === "mar1-2026-mvp") {
    return {
      title: "Mar 1 2026 MVP",
      state: "open",
      due_on: "2026-03-01T00:00:00Z",
      description: "MVP rollout target for the 2026 ceremony."
    };
  }
  if (key === "post-mvp") {
    return {
      title: "Post-MVP",
      state: "open",
      description: "Nice-to-haves and off-season work after MVP ships."
    };
  }
  return { title: key, state: "open" };
}

function buildLabelSpecs(prBatchKeys) {
  const specs = [];
  const add = (name, color, description) => specs.push({ name, color, description });

  add("scope:must", "b60205", "Required for MVP.");
  add("scope:should", "d93f0b", "Strongly preferred; cuttable if needed.");
  add("scope:could", "0e8a16", "Optional; ship if time allows.");

  add("ws:backend-api", "1d76db", "Backend/API work.");
  add("ws:frontend-web", "1d76db", "Web frontend work.");
  add("ws:realtime-drafts", "1d76db", "Realtime/draft work.");
  add("ws:admin-content", "1d76db", "Admin/content work.");
  add("ws:infra-docs", "1d76db", "Infra/ops/docs work.");
  add("ws:other", "1d76db", "Other workstream.");

  add("risk:low", "c2e0c6", "Low risk/complexity.");
  add("risk:medium", "fef2c0", "Medium risk/complexity.");
  add("risk:high", "f9d0c4", "High risk/complexity.");
  add("risk:other", "fef2c0", "Unclassified risk.");

  add("blocking:true", "5319e7", "Blocks other work.");

  for (const key of prBatchKeys) {
    add(`batch:${key}`, "0052cc", "PR batch grouping from the roadmap.");
  }

  return specs;
}

function labelsForTicket(ticket) {
  const labels = [normalizeScope(ticket.scopeTier), normalizeWorkstream(ticket.workstream), normalizeRisk(ticket.risk)];
  if (ticket.blocking) labels.push("blocking:true");
  if (ticket.prBatchKey) labels.push(`batch:${ticket.prBatchKey}`);
  return labels;
}

async function createIssue(token, repoFullName, { title, body, labels, milestoneNumber }) {
  return githubRestJson(token, {
    method: "POST",
    path: `/repos/${repoFullName}/issues`,
    body: {
      title,
      body,
      labels,
      ...(milestoneNumber ? { milestone: milestoneNumber } : {})
    }
  });
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const roadmapPath = must(args.roadmap, "Missing --roadmap <path>");

  const repoFullName = inferRepoFullName(args.repo);
  const { owner, name } = splitRepoFullName(repoFullName);
  const token = args.apply ? requireGitHubToken() : null;

  const rawText = await readFile(path.resolve(roadmapPath), "utf8");
  const raw = JSON.parse(rawText);
  const milestones = Array.isArray(raw.milestones) ? raw.milestones : [];
  if (milestones.length === 0) throw new Error("Roadmap has no milestones");

  const prBatchKeys = new Set();
  for (const ms of milestones) {
    for (const batch of ms.prBatches ?? []) prBatchKeys.add(batch.key);
    for (const t of ms.tickets ?? []) if (t.prBatchKey) prBatchKeys.add(t.prBatchKey);
  }

  const labelSpecs = buildLabelSpecs([...prBatchKeys].sort());
  const milestoneSpecs = milestones.map((m) => defaultMilestoneSpec(m.key));

  const outRoot = path.join(args.outDir, `${owner}_${name}`);
  await mkdir(outRoot, { recursive: true });

  // Render markdown files for review (always).
  const rendered = [];
  const includeSet = new Set(args.include);
  let renderedTotal = 0;
  for (const ms of milestones) {
    const msSpec = defaultMilestoneSpec(ms.key);
    const prBatches = Array.isArray(ms.prBatches) ? ms.prBatches : [];
    const prBatchByKey = new Map(prBatches.map((b) => [b.key, b]));
    const msDir = path.join(outRoot, ms.key);
    await mkdir(msDir, { recursive: true });
    const sortedTickets = [...(ms.tickets ?? [])].sort((a, b) => (a.index ?? 0) - (b.index ?? 0));
    for (const t of sortedTickets) {
      if (renderedTotal >= args.max) break;
      if (includeSet.size > 0) {
        const match = includeSet.has(t.indexId) || includeSet.has(t.id);
        if (!match) continue;
      }
      const prBatch = t.prBatchKey ? prBatchByKey.get(t.prBatchKey) ?? null : null;
      const body = renderIssueBody({ ticket: t, milestone: msSpec, prBatch });
      const filenameSafe = `${(t.indexId ?? "IDX").replaceAll("/", "-")}-${(t.id ?? "FO").replaceAll("/", "-")}.md`;
      const filePath = path.join(msDir, filenameSafe);
      await writeFile(filePath, body, "utf8");
      rendered.push({ milestoneKey: ms.key, ticketId: t.id, indexId: t.indexId, filePath });
      renderedTotal++;
    }
    if (renderedTotal >= args.max) break;
  }

  console.log(
    JSON.stringify(
      {
        mode: args.apply ? "apply" : "dry-run",
        repo: repoFullName,
        renderedCount: rendered.length,
        renderedRoot: outRoot
      },
      null,
      2
    )
  );

  if (!args.apply) {
    console.log("\nDry-run complete. Review the rendered Markdown files, then re-run with --apply.\n");
    console.log(
      `Example:\n  node .github/scripts/roadmap-import.mjs --roadmap ${roadmapPath} --repo ${repoFullName} --apply\n`
    );
    return;
  }

  if (args.createLabels) {
    const labelResult = await ensureLabels(token, repoFullName, labelSpecs, { apply: true });
    console.log(JSON.stringify({ labels: labelResult }, null, 2));
  }

  const milestoneMap = args.createMilestones
    ? await ensureMilestones(token, repoFullName, milestoneSpecs, { apply: true })
    : new Map(milestoneSpecs.map((m) => [m.title, { title: m.title, number: null }]));

  if (args.createIssues) {
    for (const ms of milestones) {
      const msSpec = defaultMilestoneSpec(ms.key);
      const msApi = milestoneMap.get(msSpec.title);
      const msNumber = msApi?.number ?? null;

      const prBatches = Array.isArray(ms.prBatches) ? ms.prBatches : [];
      const prBatchByKey = new Map(prBatches.map((b) => [b.key, b]));

      const sortedTickets = [...(ms.tickets ?? [])].sort((a, b) => (a.index ?? 0) - (b.index ?? 0));
      for (const t of sortedTickets) {
        const prBatch = t.prBatchKey ? prBatchByKey.get(t.prBatchKey) ?? null : null;
        const body = renderIssueBody({ ticket: t, milestone: msSpec, prBatch });
        const issue = await createIssue(token, repoFullName, {
          title: issueTitle(t),
          body,
          labels: labelsForTicket(t),
          milestoneNumber: msNumber
        });
        console.log(JSON.stringify({ created: { number: issue.number, url: issue.html_url, id: t.id, indexId: t.indexId } }, null, 2));
      }
    }
  }
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
