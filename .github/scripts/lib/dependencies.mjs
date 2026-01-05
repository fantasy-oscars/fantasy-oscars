function extractIssueNumbersFromText(text) {
  const out = new Set();
  if (!text) return out;

  const pattern = /(?:^|[\s(])#(\d+)\b/g;
  for (const match of text.matchAll(pattern)) {
    out.add(Number(match[1]));
  }
  return out;
}

function findMarkdownSection(body, heading) {
  if (!body) return null;

  const lines = body.split(/\r?\n/);
  const target = heading.toLowerCase();
  let start = -1;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    const m = line.match(/^#{2,6}\s+(.*)$/);
    if (!m) continue;
    const title = m[1].trim().toLowerCase();
    if (title === target) {
      start = i + 1;
      break;
    }
  }

  if (start === -1) return null;

  const out = [];
  for (let i = start; i < lines.length; i++) {
    const line = lines[i];
    if (line.trim().match(/^#{2,6}\s+/)) break;
    out.push(line);
  }

  return out.join("\n").trim();
}

export function extractDependsOn(body) {
  const section = findMarkdownSection(body, "depends on");
  if (!section) return [];
  return [...extractIssueNumbersFromText(section)].sort((a, b) => a - b);
}

