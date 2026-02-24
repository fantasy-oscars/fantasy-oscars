export type FilmCredits = {
  cast?: Array<{
    tmdb_id: number;
    name: string;
    character?: string | null;
    order?: number | null;
    credit_id?: string | null;
    profile_path?: string | null;
  }>;
  crew?: Array<{
    tmdb_id: number;
    name: string;
    department?: string | null;
    job?: string | null;
    credit_id?: string | null;
    profile_path?: string | null;
  }>;
};

export type CreditOption = {
  tmdb_id: number;
  name: string;
  jobs: string[];
  label: string;
  search: string;
};

type CreditPersonInfo = {
  name: string;
  crewJobs: string[];
  crewJobsSet: Set<string>;
  characters: string[];
  characterSet: Set<string>;
  isCast: boolean;
};

export function buildCreditByPersonId(credits: FilmCredits | null) {
  const map = new Map<number, CreditPersonInfo>();
  if (!credits) return map;

  for (const c of credits.crew ?? []) {
    if (!c?.tmdb_id || !c?.name) continue;
    const job =
      typeof c.job === "string" && c.job.trim()
        ? c.job.trim()
        : typeof c.department === "string" && c.department.trim()
          ? c.department.trim()
          : "";
    if (!job) continue;
    const existing = map.get(c.tmdb_id) ?? {
      name: c.name,
      crewJobs: [],
      crewJobsSet: new Set<string>(),
      characters: [],
      characterSet: new Set<string>(),
      isCast: false
    };
    if (!existing.crewJobsSet.has(job)) {
      existing.crewJobsSet.add(job);
      existing.crewJobs.push(job);
    }
    map.set(c.tmdb_id, existing);
  }

  for (const c of credits.cast ?? []) {
    if (!c?.tmdb_id || !c?.name) continue;
    const character =
      typeof c.character === "string" && c.character.trim() ? c.character.trim() : "";
    const existing = map.get(c.tmdb_id) ?? {
      name: c.name,
      crewJobs: [],
      crewJobsSet: new Set<string>(),
      characters: [],
      characterSet: new Set<string>(),
      isCast: false
    };
    existing.isCast = true;
    if (character && !existing.characterSet.has(character)) {
      existing.characterSet.add(character);
      existing.characters.push(character);
    }
    map.set(c.tmdb_id, existing);
  }

  return map;
}

export function buildCreditOptions(creditByPersonId: Map<number, CreditPersonInfo>) {
  const opts: CreditOption[] = [];
  for (const [tmdbId, info] of creditByPersonId.entries()) {
    const jobs: string[] = [];
    for (const j of info.crewJobs) jobs.push(j);
    if (info.isCast) {
      const role = info.characters.length ? ` (as ${info.characters.join(" / ")})` : "";
      jobs.push(`Cast${role}`);
    }
    const label = `${info.name} -- ${jobs.join(", ")}`;
    opts.push({
      tmdb_id: tmdbId,
      name: info.name,
      jobs,
      label,
      search: `${info.name} ${jobs.join(" ")}`.toLowerCase()
    });
  }
  return opts.sort((a, b) => a.name.localeCompare(b.name));
}

export function buildCreditOptionById(creditOptions: CreditOption[]) {
  const map: Record<number, CreditOption> = {};
  for (const o of creditOptions) map[o.tmdb_id] = o;
  return map;
}

export function filterCreditOptions(creditOptions: CreditOption[], query: string) {
  const q = query.trim().toLowerCase();
  if (!q) return creditOptions;
  return creditOptions.filter((o) => o.search.includes(q));
}
