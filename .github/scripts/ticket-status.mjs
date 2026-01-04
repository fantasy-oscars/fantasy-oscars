#!/usr/bin/env node
/**
 * Promote a GitHub Project (user) ticket status for an issue.
 *
 * Usage:
 *   node .github/scripts/ticket-status.mjs --issue 4 --status doing
 *
 * Assumptions:
 * - Project: users/alexvornsand/projects/1
 * - Status field exists with options like Todo/Doing/Review (case-insensitive match).
 * - GITHUB_TOKEN has project/issue write scopes.
 */
const PROJECT_OWNER = "alexvornsand";
const PROJECT_NUMBER = 1;

function parseArgs(argv) {
  const args = { issue: undefined, status: undefined, repo: undefined };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--issue") args.issue = Number(argv[++i]);
    else if (arg === "--status") args.status = argv[++i];
    else if (arg === "--repo") args.repo = argv[++i];
  }
  return args;
}

function requireToken() {
  const token = process.env.GITHUB_TOKEN;
  if (!token) throw new Error("GITHUB_TOKEN is required");
  return token;
}

async function graphql(token, query, variables = {}) {
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

async function getRepoOwnerAndName(repoArg) {
  if (repoArg) {
    const [owner, name] = repoArg.split("/");
    return { owner, name };
  }
  if (process.env.GITHUB_REPOSITORY) {
    const [owner, name] = process.env.GITHUB_REPOSITORY.split("/");
    return { owner, name };
  }
  throw new Error("Provide --repo owner/name or set GITHUB_REPOSITORY");
}

async function getProjectInfo(token) {
  const query = `
    query($owner: String!, $number: Int!) {
      user(login: $owner) {
        projectV2(number: $number) {
          id
          fields(first: 50) {
            nodes {
              ... on ProjectV2SingleSelectField {
                id
                name
                options { id name }
              }
            }
          }
        }
      }
    }
  `;
  const data = await graphql(token, query, { owner: PROJECT_OWNER, number: PROJECT_NUMBER });
  const project = data.user?.projectV2;
  if (!project) throw new Error("Project not found");
  const statusField = project.fields.nodes.find(
    (f) => f?.name?.toLowerCase() === "status"
  );
  if (!statusField) throw new Error("Status field not found on project");
  return { projectId: project.id, statusField };
}

async function getIssueNodeId(token, owner, name, issueNumber) {
  const query = `
    query($owner: String!, $name: String!, $number: Int!) {
      repository(owner: $owner, name: $name) {
        issue(number: $number) { id }
      }
    }
  `;
  const data = await graphql(token, query, { owner, name, number: issueNumber });
  const id = data.repository?.issue?.id;
  if (!id) throw new Error(`Issue #${issueNumber} not found`);
  return id;
}

async function getOrCreateProjectItem(token, projectId, contentId) {
  const query = `
    query($id: ID!) {
      node(id: $id) {
        ... on Issue {
          projectItems(first: 20, includeArchived: true) {
            nodes { id project { id } }
          }
        }
      }
    }
  `;
  const data = await graphql(token, query, { id: contentId });
  const existing = data.node?.projectItems?.nodes?.find((n) => n.project?.id === projectId);
  if (existing) return existing.id;

  const mutation = `
    mutation($projectId: ID!, $contentId: ID!) {
      addProjectV2ItemById(input: { projectId: $projectId, contentId: $contentId }) {
        item { id }
      }
    }
  `;
  const addData = await graphql(token, mutation, { projectId, contentId });
  return addData.addProjectV2ItemById?.item?.id;
}

async function updateStatus(token, projectId, itemId, fieldId, optionId) {
  const mutation = `
    mutation($projectId: ID!, $itemId: ID!, $fieldId: ID!, $optionId: String!) {
      updateProjectV2ItemFieldValue(
        input: {
          projectId: $projectId
          itemId: $itemId
          fieldId: $fieldId
          value: { singleSelectOptionId: $optionId }
        }
      ) { clientMutationId }
    }
  `;
  await graphql(token, mutation, {
    projectId,
    itemId,
    fieldId,
    optionId
  });
}

async function main() {
  const { issue, status, repo } = parseArgs(process.argv.slice(2));
  if (!issue || Number.isNaN(issue)) throw new Error("Issue number required (--issue)");
  if (!status) throw new Error("Status required (--status todo|doing|review)");

  const token = requireToken();
  const desiredStatus = status.toLowerCase();

  const { projectId, statusField } = await getProjectInfo(token);
  const option = statusField.options.find((o) => o.name.toLowerCase() === desiredStatus);
  if (!option) {
    const available = statusField.options.map((o) => o.name).join(", ");
    throw new Error(`Status option "${status}" not found. Available: ${available}`);
  }

  const { owner, name } = await getRepoOwnerAndName(repo);
  const issueNodeId = await getIssueNodeId(token, owner, name, issue);
  const itemId = await getOrCreateProjectItem(token, projectId, issueNodeId);
  await updateStatus(token, projectId, itemId, statusField.id, option.id);

  console.log(`Issue #${issue} set to status "${option.name}"`);
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
