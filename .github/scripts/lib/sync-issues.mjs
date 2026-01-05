import { githubGraphql, splitRepoFullName } from "./github.mjs";
import { extractDependsOn } from "./dependencies.mjs";
import { extractProjectFields } from "./project-fields.mjs";

function coerceStateFilter(state) {
  const normalized = (state ?? "all").toLowerCase();
  if (normalized === "all") return ["OPEN", "CLOSED"];
  if (normalized === "open") return ["OPEN"];
  if (normalized === "closed") return ["CLOSED"];
  throw new Error(`Invalid --state ${state} (use open|closed|all)`);
}

function normalizeIsoDate(value, label) {
  if (!value) return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) throw new Error(`Invalid ${label}: ${value}`);
  return d.toISOString();
}

function mapIssueNode(node, { includeBody, includeProjects }) {
  const body = node.body ?? "";
  return {
    number: node.number,
    title: node.title,
    state: node.state,
    url: node.url,
    body: includeBody ? body : undefined,
    dependsOn: includeBody ? extractDependsOn(body) : undefined,
    author: node.author?.login ?? null,
    createdAt: node.createdAt,
    updatedAt: node.updatedAt,
    closedAt: node.closedAt ?? null,
    labels: (node.labels?.nodes ?? []).map((l) => l.name).filter(Boolean),
    assignees: (node.assignees?.nodes ?? []).map((a) => a.login).filter(Boolean),
    milestone: node.milestone
      ? {
          title: node.milestone.title ?? null,
          number: node.milestone.number ?? null,
          dueOn: node.milestone.dueOn ?? null,
          state: node.milestone.state ?? null
        }
      : null,
    comments: { totalCount: node.comments?.totalCount ?? 0 },
    projects: includeProjects ? extractProjectFields(node.projectItems?.nodes) : undefined
  };
}

export async function fetchIssue({
  token,
  repoFullName,
  number,
  includeBody = true,
  includeProjects = true
}) {
  const { owner, name } = splitRepoFullName(repoFullName);
  const query = `
    query($owner: String!, $name: String!, $number: Int!) {
      repository(owner: $owner, name: $name) {
        issue(number: $number) {
          number
          title
          state
          url
          body
          createdAt
          updatedAt
          closedAt
          author { login }
          labels(first: 50) { nodes { name } }
          assignees(first: 20) { nodes { login } }
          milestone { title number dueOn state }
          comments { totalCount }
          projectItems(first: 20) {
            nodes {
              project { title number }
              fieldValues(first: 50) {
                nodes {
                  __typename
                  ... on ProjectV2ItemFieldSingleSelectValue { name field { ... on ProjectV2FieldCommon { name } } }
                  ... on ProjectV2ItemFieldIterationValue { title field { ... on ProjectV2FieldCommon { name } } }
                  ... on ProjectV2ItemFieldTextValue { text field { ... on ProjectV2FieldCommon { name } } }
                  ... on ProjectV2ItemFieldNumberValue { number field { ... on ProjectV2FieldCommon { name } } }
                  ... on ProjectV2ItemFieldDateValue { date field { ... on ProjectV2FieldCommon { name } } }
                }
              }
            }
          }
        }
      }
    }
  `;

  const data = await githubGraphql(token, query, { owner, name, number });
  const issue = data.repository?.issue;
  if (!issue) throw new Error(`Issue #${number} not found`);
  return mapIssueNode(issue, { includeBody, includeProjects });
}

export async function fetchIssuesSnapshot({
  token,
  repoFullName,
  state = "all",
  max = Infinity,
  updatedSince,
  includeBody = true,
  includeProjects = true
}) {
  const { owner, name } = splitRepoFullName(repoFullName);
  const states = coerceStateFilter(state);
  const updatedSinceIso = normalizeIsoDate(updatedSince, "--updated-since");

  const query = `
    query($owner: String!, $name: String!, $states: [IssueState!], $after: String) {
      repository(owner: $owner, name: $name) {
        issues(first: 50, after: $after, orderBy: { field: UPDATED_AT, direction: DESC }, states: $states) {
          pageInfo { hasNextPage endCursor }
          nodes {
            number
            title
            state
            url
            body
            createdAt
            updatedAt
            closedAt
            author { login }
            labels(first: 50) { nodes { name } }
            assignees(first: 20) { nodes { login } }
            milestone { title number dueOn state }
            comments { totalCount }
            projectItems(first: 20) {
              nodes {
                project { title number }
                fieldValues(first: 50) {
                  nodes {
                    __typename
                    ... on ProjectV2ItemFieldSingleSelectValue { name field { ... on ProjectV2FieldCommon { name } } }
                    ... on ProjectV2ItemFieldIterationValue { title field { ... on ProjectV2FieldCommon { name } } }
                    ... on ProjectV2ItemFieldTextValue { text field { ... on ProjectV2FieldCommon { name } } }
                    ... on ProjectV2ItemFieldNumberValue { number field { ... on ProjectV2FieldCommon { name } } }
                    ... on ProjectV2ItemFieldDateValue { date field { ... on ProjectV2FieldCommon { name } } }
                  }
                }
              }
            }
          }
        }
      }
    }
  `;

  const issues = [];
  let after = null;
  while (issues.length < max) {
    const data = await githubGraphql(token, query, { owner, name, states, after });
    const conn = data.repository?.issues;
    if (!conn) break;

    for (const node of conn.nodes ?? []) {
      if (!node) continue;
      if (updatedSinceIso && node.updatedAt < updatedSinceIso) continue;
      issues.push(mapIssueNode(node, { includeBody, includeProjects }));
      if (issues.length >= max) break;
    }

    if (!conn.pageInfo?.hasNextPage) break;
    after = conn.pageInfo.endCursor;
  }

  return {
    version: 1,
    repo: repoFullName,
    fetchedAt: new Date().toISOString(),
    issues
  };
}
