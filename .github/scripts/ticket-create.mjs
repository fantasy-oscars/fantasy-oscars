#!/usr/bin/env node
/**
 * Create a GitHub issue and add it to the project with fields set.
 *
 * Usage:
 *   npm run ticket:create -- \
 *     --title "Title" \
 *     --body-file path/to/body.md \
 *     --status Todo \
 *     --workstream "Domain & Rules" \
 *     --scope Must \
 *     --blocking Yes \
 *     --risk High \
 *     --iteration "Foundations & Guardrails" \
 *     --depends 9,10
 *
 * Notes:
 * - GITHUB_TOKEN required with repo + project access.
 * - Repo inferred from GITHUB_REPOSITORY unless --repo provided.
 * - `--depends` (comma-separated issue numbers) appends a Depends On section to the body.
 */

import { readFile } from "node:fs/promises";

const PROJECT_ID = "PVT_kwHOAcmJV84BLqvu";
const FIELD_IDS = {
  status: "PVTSSF_lAHOAcmJV84BLqvuzg7LEWY",
  workstream: "PVTSSF_lAHOAcmJV84BLqvuzg7Mc0U",
  scope: "PVTSSF_lAHOAcmJV84BLqvuzg7MdFU",
  blocking: "PVTSSF_lAHOAcmJV84BLqvuzg7MdeA",
  risk: "PVTSSF_lAHOAcmJV84BLqvuzg7MeF4",
  iteration: "PVTIF_lAHOAcmJV84BLqvuzg7LEpQ"
};

const OPTION_IDS = {
  status: {
    todo: "f75ad846",
    doing: "47fc9ee4",
    review: "b69ad58b",
    done: "98236657"
  },
  workstream: {
    "domain & rules": "f14cb4b7",
    "backend/api": "ee2917d7",
    "realtime draft": "5922a484",
    "frontend/ux": "e6db3ebc",
    "testing infra": "fbff7a0d",
    "deployment & ops": "4fec9014",
    "design system/density": "5bb881b1"
  },
  scope: {
    must: "e825cbf9",
    should: "40bef6ae",
    could: "1b16ca3e"
  },
  blocking: {
    yes: "89db3f51",
    no: "58bd7d36"
  },
  risk: {
    high: "152552c4",
    medium: "0feacb7d",
    low: "dda5f7ac"
  },
  iteration: {
    "foundations & guardrails": "9b6c28a4",
    "playable draft mvp": "70340978",
    "live draft reliability": "fde789eb",
    "ship readiness & lockdown": "9f212340"
  }
};

function parseArgs(argv) {
  const args = {
    title: undefined,
    body: undefined,
    bodyFile: undefined,
    repo: undefined,
    status: "todo",
    workstream: undefined,
    scope: undefined,
    blocking: undefined,
    risk: undefined,
    iteration: undefined,
    depends: []
  };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--title") args.title = argv[++i];
    else if (arg === "--body") args.body = argv[++i];
    else if (arg === "--body-file") args.bodyFile = argv[++i];
    else if (arg === "--repo") args.repo = argv[++i];
    else if (arg === "--status") args.status = argv[++i].toLowerCase();
    else if (arg === "--workstream") args.workstream = argv[++i].toLowerCase();
    else if (arg === "--scope") args.scope = argv[++i].toLowerCase();
    else if (arg === "--blocking") args.blocking = argv[++i].toLowerCase();
    else if (arg === "--risk") args.risk = argv[++i].toLowerCase();
    else if (arg === "--iteration") args.iteration = argv[++i].toLowerCase();
    else if (arg === "--depends") args.depends = argv[++i].split(",").filter(Boolean).map((n) => n.trim());
  }
  return args;
}

function requireToken() {
  const token = process.env.GITHUB_TOKEN;
  if (!token) throw new Error("GITHUB_TOKEN is required");
  return token;
}

function inferRepo(repoArg) {
  if (repoArg) return repoArg;
  if (process.env.GITHUB_REPOSITORY) return process.env.GITHUB_REPOSITORY;
  throw new Error("Provide --repo owner/name or set GITHUB_REPOSITORY");
}

async function getBody(body, bodyFile, depends) {
  if (bodyFile) {
    body = await readFile(bodyFile, "utf8");
  }
  if (!body) throw new Error("Ticket body is required (--body or --body-file)");
  const dependsLines = depends.length ? `\n## Depends On\n${depends.map((d) => `- #${d}`).join("\n")}\n` : "";
  if (dependsLines && !body.includes("## Depends On")) {
    body += `\n${dependsLines}`;
  }
  return body;
}

async function createIssue(token, repoFullName, title, body) {
  const url = `https://api.github.com/repos/${repoFullName}/issues`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Accept": "application/vnd.github+json"
    },
    body: JSON.stringify({ title, body })
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Issue creation failed (${res.status}): ${text}`);
  }
  return await res.json();
}

async function graphql(token, query, variables) {
  const res = await fetch("https://api.github.com/graphql", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ query, variables })
  });
  const data = await res.json();
  if (!res.ok || data.errors) {
    const message = data.errors?.map((e) => e.message).join("; ") ?? res.statusText;
    throw new Error(`GraphQL error: ${message}`);
  }
  return data.data;
}

async function addToProject(token, contentId) {
  const query = `
    mutation($projectId:ID!, $contentId:ID!) {
      addProjectV2ItemById(input:{projectId:$projectId, contentId:$contentId}) {
        item { id }
      }
    }
  `;
  const data = await graphql(token, query, { projectId: PROJECT_ID, contentId });
  return data.addProjectV2ItemById.item.id;
}

function getOptionId(map, key, label) {
  const value = map[key];
  if (!value) {
    throw new Error(`Unknown ${label} option: ${key}`);
  }
  return value;
}

async function setProjectFields(token, itemId, selections) {
  const query = `
    mutation($projectId:ID!, $itemId:ID!, $statusField:ID!, $statusOpt:String!, $workstreamField:ID!, $workstreamOpt:String!, $scopeField:ID!, $scopeOpt:String!, $blockField:ID!, $blockOpt:String!, $riskField:ID!, $riskOpt:String!, $iterField:ID!, $iterOpt:String!) {
      status: updateProjectV2ItemFieldValue(input:{projectId:$projectId, itemId:$itemId, fieldId:$statusField, value:{singleSelectOptionId:$statusOpt}}){ clientMutationId }
      workstream: updateProjectV2ItemFieldValue(input:{projectId:$projectId, itemId:$itemId, fieldId:$workstreamField, value:{singleSelectOptionId:$workstreamOpt}}){ clientMutationId }
      scope: updateProjectV2ItemFieldValue(input:{projectId:$projectId, itemId:$itemId, fieldId:$scopeField, value:{singleSelectOptionId:$scopeOpt}}){ clientMutationId }
      blocking: updateProjectV2ItemFieldValue(input:{projectId:$projectId, itemId:$itemId, fieldId:$blockField, value:{singleSelectOptionId:$blockOpt}}){ clientMutationId }
      risk: updateProjectV2ItemFieldValue(input:{projectId:$projectId, itemId:$itemId, fieldId:$riskField, value:{singleSelectOptionId:$riskOpt}}){ clientMutationId }
      iter: updateProjectV2ItemFieldValue(input:{projectId:$projectId, itemId:$itemId, fieldId:$iterField, value:{iterationId:$iterOpt}}){ clientMutationId }
    }
  `;

  await graphql(token, query, {
    projectId: PROJECT_ID,
    itemId,
    statusField: FIELD_IDS.status,
    statusOpt: selections.status,
    workstreamField: FIELD_IDS.workstream,
    workstreamOpt: selections.workstream,
    scopeField: FIELD_IDS.scope,
    scopeOpt: selections.scope,
    blockField: FIELD_IDS.blocking,
    blockOpt: selections.blocking,
    riskField: FIELD_IDS.risk,
    riskOpt: selections.risk,
    iterField: FIELD_IDS.iteration,
    iterOpt: selections.iteration
  });
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!args.title) throw new Error("Title is required (--title)");

  const token = requireToken();
  const repo = inferRepo(args.repo);
  const body = await getBody(args.body, args.bodyFile, args.depends);

  const issue = await createIssue(token, repo, args.title, body);

  const itemId = await addToProject(token, issue.node_id);

  const selections = {
    status: getOptionId(OPTION_IDS.status, args.status, "status"),
    workstream: getOptionId(OPTION_IDS.workstream, args.workstream ?? "domain & rules", "workstream"),
    scope: getOptionId(OPTION_IDS.scope, args.scope ?? "must", "scope"),
    blocking: getOptionId(OPTION_IDS.blocking, args.blocking ?? "yes", "blocking"),
    risk: getOptionId(OPTION_IDS.risk, args.risk ?? "high", "risk"),
    iteration: getOptionId(
      OPTION_IDS.iteration,
      args.iteration ?? "foundations & guardrails",
      "iteration"
    )
  };

  await setProjectFields(token, itemId, selections);

  console.log(
    JSON.stringify(
      {
        number: issue.number,
        url: issue.html_url,
        projectItemId: itemId
      },
      null,
      2
    )
  );
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
