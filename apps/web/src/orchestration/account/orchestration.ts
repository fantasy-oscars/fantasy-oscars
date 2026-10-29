import { useCallback } from "react";
import { useMutation } from "@tanstack/react-query";
import { fetchJson } from "../../lib/api";
import { errorMessage, unwrap } from "../query/errors";

/** Account writes. The account itself is read from the auth session query. */
export function useAccountOrchestration() {
  const deleteMutation = useMutation({
    mutationFn: async () =>
      unwrap(
        await fetchJson("/auth/me", { method: "DELETE" }),
        "Unable to delete account"
      )
  });
  const { mutateAsync } = deleteMutation;

  const deleteAccount = useCallback(async () => {
    try {
      await mutateAsync();
      return { ok: true as const };
    } catch (err) {
      return {
        ok: false as const,
        error: errorMessage(err, "Unable to delete account")
      };
    }
  }, [mutateAsync]);

  return { deleteAccount, deleting: deleteMutation.isPending };
}
