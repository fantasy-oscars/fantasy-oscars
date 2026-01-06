import { githubRestJson } from "./rest.mjs";
import { inferRepoFullName, splitRepoFullName } from "./github.mjs";

async function getIssueIdByNumber(token, repoFullName, issueNumber) {
  const { owner, name } = splitRepoFullName(repoFullName);
  const issue = await githubRestJson(token, {
    method: "GET",
    path: `/repos/${owner}/${name}/issues/${issueNumber}`
  });
  if (!issue?.id) throw new Error(`Could not resolve issue id for #${issueNumber}`);
  return issue.id;
}

export async function addBlockedBy(token, opts) {
  const repoFullName = inferRepoFullName(opts.repo);
  const blockedIssueNumber = opts.issue;
  const blockingIssueNumber = opts.blockedBy;

  const { owner, name } = splitRepoFullName(repoFullName);
  const issueId = await getIssueIdByNumber(token, repoFullName, blockingIssueNumber);

  await githubRestJson(token, {
    method: "POST",
    path: `/repos/${owner}/${name}/issues/${blockedIssueNumber}/dependencies/blocked_by`,
    body: { issue_id: issueId }
  });
}

export async function listBlockedBy(token, opts) {
  const repoFullName = inferRepoFullName(opts.repo);
  const { owner, name } = splitRepoFullName(repoFullName);

  const data = await githubRestJson(token, {
    method: "GET",
    path: `/repos/${owner}/${name}/issues/${opts.issue}/dependencies/blocked_by`
  });
  const issues = Array.isArray(data) ? data : data?.issues;
  return (issues ?? []).map((i) => i.number).filter(Boolean);
}

export async function listBlocking(token, opts) {
  const repoFullName = inferRepoFullName(opts.repo);
  const { owner, name } = splitRepoFullName(repoFullName);

  const data = await githubRestJson(token, {
    method: "GET",
    path: `/repos/${owner}/${name}/issues/${opts.issue}/dependencies/blocking`
  });
  const issues = Array.isArray(data) ? data : data?.issues;
  return (issues ?? []).map((i) => i.number).filter(Boolean);
}

