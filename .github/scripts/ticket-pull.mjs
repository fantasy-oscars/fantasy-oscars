#!/usr/bin/env node
/**
 * Fetch ticket metadata from GitHub (issue + project fields) for reuse.
 *
 * Usage:
 *   node .github/scripts/ticket-pull.mjs --issue 6 --repo owner/name
 * Notes:
 *   - Requires GITHUB_TOKEN with repo access.
 *   - Defaults repo from GITHUB_REPOSITORY if not provided.
 *   - Prints a concise JSON summary (title, state, project status/iteration/workstream).
 */

function parseArgs(argv) {
  const args = { issue: undefined, repo: undefined };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--issue") args.issue = Number(argv[++i]);
    else if (arg === "--repo") args.repo = argv[++i];
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
    throw new Error(`GitHub GraphQL error: ${message}`);
  }
  return data.data;
}

async function pullIssue(token, repoFullName, issueNumber) {
  const [owner, name] = repoFullName.split("/");
  const query = `
    query($owner: String!, $name: String!, $number: Int!) {
      repository(owner: $owner, name: $name) {
        issue(number: $number) {
          number
          title
          state
          url
          body
          projectItems(first: 5) {
            nodes {
              project { title number }
              fieldValues(first: 20) {
                nodes {
                  __typename
                  ... on ProjectV2ItemFieldSingleSelectValue { name field { ... on ProjectV2FieldCommon { name } } }
                  ... on ProjectV2ItemFieldIterationValue { title field { ... on ProjectV2FieldCommon { name } } }
                }
              }
            }
          }
        }
      }
    }
  `;

  const data = await graphql(token, query, { owner, name, number: issueNumber });
  const issue = data.repository?.issue;
  if (!issue) throw new Error(`Issue #${issueNumber} not found`);

  const fields = {};
  const project = issue.projectItems?.nodes?.[0];
  if (project) {
    for (const fv of project.fieldValues?.nodes ?? []) {
      if (fv.__typename === "ProjectV2ItemFieldSingleSelectValue" && fv.field?.name) {
        fields[fv.field.name] = fv.name;
      }
      if (fv.__typename === "ProjectV2ItemFieldIterationValue" && fv.field?.name) {
        fields[fv.field.name] = fv.title;
      }
    }
  }

  return {
    number: issue.number,
    title: issue.title,
    state: issue.state,
    url: issue.url,
    body: issue.body,
    project: project?.project?.title,
    fields
  };
}

async function main() {
  const { issue, repo } = parseArgs(process.argv.slice(2));
  if (!issue || Number.isNaN(issue)) throw new Error("Issue number required (--issue)");
  const token = requireToken();
  const repoFullName = inferRepo(repo);
  const summary = await pullIssue(token, repoFullName, issue);
  console.log(JSON.stringify(summary, null, 2));
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
