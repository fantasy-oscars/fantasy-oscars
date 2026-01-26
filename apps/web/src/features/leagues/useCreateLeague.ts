import { useCallback, useState } from "react";
import { fetchJson } from "../../lib/api";
import type { LeagueSummary } from "../../lib/types";

export function useCreateLeague() {
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const create = useCallback(async (input: { name: string }) => {
    setError(null);
    setCreating(true);
    const res = await fetchJson<{ league: LeagueSummary }>("/leagues", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input)
    });
    setCreating(false);
    if (!res.ok) {
      setError(res.error ?? "Could not create league");
      return { ok: false as const, error: res.error ?? "Could not create league" };
    }
    return { ok: true as const, league: res.data?.league };
  }, []);

  return { creating, error, create };
}
