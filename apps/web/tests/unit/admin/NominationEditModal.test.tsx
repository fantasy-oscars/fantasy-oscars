import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, waitFor } from "@testing-library/react";
import { screen } from "@testing-library/dom";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { MantineProvider } from "@ui";
import { NominationEditModal } from "@/features/admin/screens/ceremonies/nominees/NominationEditModal";

afterEach(cleanup);

const nominations = [
  { id: 1, display_film_id: 10, film_title: "Film X", contributors: [] },
  { id: 2, display_film_id: 20, film_title: "Film Y", contributors: [] }
];

// Mirrors the screen wiring: the trigger sets the nomination id and the open flag in the
// same update, and the modal has not been opened before the first click.
function Harness(props: { getFilmCredits?: (filmId: number) => Promise<unknown> }) {
  const [editingId, setEditingId] = useState<number | null>(null);
  const [open, setOpen] = useState(false);
  const getFilmCredits = props.getFilmCredits ?? vi.fn();
  return (
    <MantineProvider>
      {nominations.map((n) => (
        <button
          key={n.id}
          type="button"
          onClick={() => {
            setEditingId(n.id);
            setOpen(true);
          }}
        >
          Edit {n.id}
        </button>
      ))}
      <NominationEditModal
        opened={open}
        nomination={nominations.find((n) => n.id === editingId) ?? null}
        films={[
          { id: 10, title: "Film X", tmdb_id: 100 },
          { id: 20, title: "Film Y", tmdb_id: 200 }
        ]}
        setPeopleQuery={() => {}}
        people={[]}
        peopleLoading={false}
        onClose={() => setOpen(false)}
        onLinkFilm={vi.fn()}
        onLinkPerson={vi.fn()}
        onAddContributor={vi.fn()}
        onRemoveContributor={vi.fn()}
        onUpdateContributorDisplay={vi.fn()}
        getFilmCredits={getFilmCredits}
      />
    </MantineProvider>
  );
}

describe("<NominationEditModal />", () => {
  it("returns focus to the trigger when Escape closes it on the first open", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    const trigger = screen.getByRole("button", { name: "Edit 1" });
    await user.click(trigger);
    await screen.findByRole("dialog");
    await user.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    await waitFor(() => expect(trigger).toHaveFocus());
  });

  it("does not offer the previous film's credits after switching nominations", async () => {
    const user = userEvent.setup();
    const seen: Array<unknown> = [];
    const getFilmCredits = vi.fn((filmId: number) => {
      if (filmId === 10) {
        return Promise.resolve({
          cast: [{ tmdb_id: 1, name: "Cast From X" }],
          crew: []
        });
      }
      // Film Y never resolves, so any X credit still shown would be stale.
      return new Promise<unknown>((resolve) => seen.push(resolve));
    });
    render(<Harness getFilmCredits={getFilmCredits} />);

    await user.click(screen.getByRole("button", { name: "Edit 1" }));
    await screen.findByRole("dialog");
    await waitFor(() => expect(getFilmCredits).toHaveBeenCalledWith(10));
    await user.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());

    await user.click(screen.getByRole("button", { name: "Edit 2" }));
    await screen.findByRole("dialog");
    await waitFor(() => expect(getFilmCredits).toHaveBeenCalledWith(20));
    expect(screen.queryByText("Cast From X")).toBeNull();
  });
});
