import { describe, expect, it } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { useFilmCredits } from "@/features/admin/screens/ceremonies/nominees/useFilmCredits";

describe("useFilmCredits", () => {
  it("drops the previous film's credits as soon as the film changes", async () => {
    const getFilmCredits = (filmId: number) =>
      filmId === 10
        ? Promise.resolve({ cast: [{ name: "Cast From X" }] })
        : new Promise<unknown>(() => {});
    const { result, rerender } = renderHook(
      (p: { filmId: number }) =>
        useFilmCredits({ filmId: p.filmId, filmLinked: true, getFilmCredits }),
      { initialProps: { filmId: 10 } }
    );
    await waitFor(() => expect(result.current.filmCredits?.cast).toHaveLength(1));

    rerender({ filmId: 20 });
    expect(result.current.filmCredits).toBeNull();
  });
});
