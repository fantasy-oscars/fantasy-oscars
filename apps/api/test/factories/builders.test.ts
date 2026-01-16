import { beforeEach, describe, expect, it } from "vitest";
import {
  buildCategoryEdition,
  buildCategoryFamily,
  buildCeremony,
  buildDraft,
  buildDraftPick,
  buildDraftSeat,
  buildFilm,
  buildIcon,
  buildLeague,
  buildLeagueMember,
  buildNomination,
  buildPerformance,
  buildPerson,
  buildSong,
  buildUser,
  resetFactorySequence
} from "./builders.js";

describe("builders (pure, deterministic)", () => {
  beforeEach(() => {
    resetFactorySequence();
  });

  it("builds core catalog entities deterministically", () => {
    const icon = buildIcon();
    const ceremony = buildCeremony();
    const fam = buildCategoryFamily({ icon_id: icon.id });
    const edition = buildCategoryEdition({
      ceremony_id: ceremony.id,
      family_id: fam.id
    });
    const film = buildFilm();
    const person = buildPerson();
    const song = buildSong({ film_id: film.id });
    const perf = buildPerformance({ film_id: film.id, person_id: person.id });
    const nomination = buildNomination({
      category_edition_id: edition.id,
      film_id: film.id,
      performance_id: null,
      song_id: null
    });

    expect(icon.code).toBe("icon-1");
    expect(ceremony.code).toBe("cer-2");
    expect(fam.code).toBe("catfam-3");
    expect(edition.ceremony_id).toBe(ceremony.id);
    expect(song.film_id).toBe(film.id);
    expect(perf.person_id).toBe(person.id);
    expect(nomination.category_edition_id).toBe(edition.id);
  });

  it("builds fantasy domain entities with overrides", () => {
    const user = buildUser({ handle: "alice" });
    const league = buildLeague({ created_by_user_id: user.id, ceremony_id: 99 });
    const member = buildLeagueMember({
      league_id: league.id,
      user_id: user.id,
      role: "OWNER"
    });
    const draft = buildDraft({ league_id: league.id, status: "IN_PROGRESS" });
    const seat = buildDraftSeat({
      draft_id: draft.id,
      league_member_id: member.id,
      seat_number: 2
    });
    const nomination = buildNomination({ category_edition_id: 77, film_id: 55 });
    const pick = buildDraftPick({
      draft_id: draft.id,
      league_member_id: member.id,
      nomination_id: nomination.id,
      pick_number: 10,
      round_number: 2,
      seat_number: seat.seat_number
    });

    expect(user.handle).toBe("alice");
    expect(league.created_by_user_id).toBe(user.id);
    expect(member.role).toBe("OWNER");
    expect(draft.status).toBe("IN_PROGRESS");
    expect(seat.seat_number).toBe(2);
    expect(pick.pick_number).toBe(10);
    expect(pick.nomination_id).toBe(nomination.id);
  });
});
