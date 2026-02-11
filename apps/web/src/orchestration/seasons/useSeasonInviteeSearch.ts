import { useEffect } from "react";
import { fetchJson } from "../../lib/api";

export function useSeasonInviteeSearch(args: {
  canEdit: boolean;
  seasonId: number;
  query: string;
  setSearching: (v: boolean) => void;
  setMatches: (v: Array<{ id: number; username: string }>) => void;
}) {
  const { canEdit, seasonId, query, setSearching, setMatches } = args;

  // Search for invitees by username as the commissioner types.
  // Note: this is a convenience only; the create-invite endpoint remains authoritative.
  useEffect(() => {
    if (!canEdit) {
      setMatches([]);
      setSearching(false);
      return;
    }

    const q = query.trim();
    if (!q) {
      setMatches([]);
      setSearching(false);
      return;
    }

    let cancelled = false;
    const handle = window.setTimeout(() => {
      void (async () => {
        setSearching(true);
        const res = await fetchJson<{
          users: Array<{ id: number; username: string }>;
        }>(`/seasons/${seasonId}/invitees?q=${encodeURIComponent(q)}`, { method: "GET" });
        if (cancelled) return;
        setSearching(false);
        if (!res.ok) {
          // Treat failures as empty results; the create endpoint remains authoritative.
          setMatches([]);
          return;
        }
        setMatches(res.data?.users ?? []);
      })();
    }, 150);

    return () => {
      cancelled = true;
      window.clearTimeout(handle);
    };
  }, [canEdit, query, seasonId, setMatches, setSearching]);
}

