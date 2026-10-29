import { describe, expect, it } from "vitest";
import {
  includeCancelledQuerySchema,
  leagueCreateBodySchema,
  loginBodySchema,
  registerBodySchema,
  seasonCreateBodySchema,
  seasonScoringBodySchema,
  seasonTimerBodySchema
} from "../../src/schemas/index.js";
import { validateRegisterInput } from "../../src/index.js";

describe("auth schemas", () => {
  it("login accepts the handle alias and keeps the raw values", () => {
    expect(loginBodySchema.parse({ handle: " Al ", password: "password1" })).toEqual({
      username: " Al ",
      password: "password1"
    });
  });

  it("login distinguishes missing from wrongly typed", () => {
    const missing = loginBodySchema.safeParse({ username: "alice" });
    expect(missing.error?.issues[0]?.message).toBe("Missing required fields");
    const typed = loginBodySchema.safeParse({ username: 5, password: "x" });
    expect(typed.error?.issues[0]?.message).toBe("Invalid field types");
  });

  it("login applies the shared username rules but lets blank names through", () => {
    expect(
      loginBodySchema.safeParse({ username: "a", password: "password1" }).success
    ).toBe(false);
    expect(
      loginBodySchema.safeParse({ username: "a b", password: "password1" }).success
    ).toBe(false);
    expect(
      loginBodySchema.safeParse({ username: "   ", password: "password1" }).success
    ).toBe(true);
  });

  it("register reports the same fields as validateRegisterInput", () => {
    const input = { username: "a", email: "nope", password: "short" };
    const expected = Array.from(
      new Set(validateRegisterInput(input).map((i) => i.field))
    );
    const res = registerBodySchema.safeParse(input);
    const issue = res.error?.issues[0];
    expect(issue?.code === "custom" ? issue.params?.fields : null).toEqual(expected);
  });

  it("register trims and normalises", () => {
    expect(
      registerBodySchema.parse({
        username: "  Alice ",
        email: " A@B.CO ",
        password: "longenough"
      })
    ).toEqual({ username: "Alice", email: "a@b.co", password: "longenough" });
  });
});

describe("league and season schemas", () => {
  it("league name: falsy is missing, blank is invalid, other values are stringified", () => {
    const msg = (body: unknown) =>
      leagueCreateBodySchema.safeParse(body).error?.issues[0]?.message;
    expect(msg({})).toBe("Missing required fields");
    expect(msg({ name: "" })).toBe("Missing required fields");
    expect(msg({ name: "  " })).toBe("Invalid name");
    expect(leagueCreateBodySchema.parse({ name: " Oscars " }).name).toBe("Oscars");
  });

  it("season create applies defaults and rejects bad enums", () => {
    expect(seasonCreateBodySchema.parse({ scoring_strategy_name: null })).toEqual({
      ceremony_id: null,
      scoring_strategy_name: "fixed",
      remainder_strategy: "UNDRAFTED",
      pick_timer_seconds: null
    });
    expect(
      seasonCreateBodySchema.safeParse({ remainder_strategy: "x" }).error?.issues[0]
        ?.message
    ).toBe("Invalid remainder_strategy");
    expect(seasonCreateBodySchema.safeParse({ pick_timer_seconds: -1 }).success).toBe(
      false
    );
    expect(seasonCreateBodySchema.parse({ ceremony_id: "abc" }).ceremony_id).toBeNull();
  });

  it("timer accepts numeric strings", () => {
    expect(seasonTimerBodySchema.parse({ pick_timer_seconds: "30" })).toEqual({
      pick_timer_seconds: 30
    });
  });

  it("category weights are validated and normalised", () => {
    const ok = seasonScoringBodySchema.parse({
      scoring_strategy_name: "category_weighted",
      category_weights: { "1": "3", "2": -5 }
    });
    expect(ok.category_weights).toEqual({ "1": 3, "2": -5 });
    for (const category_weights of [{ "0": 1 }, { "1": 100 }, { "1": 1.5 }, null]) {
      expect(
        seasonScoringBodySchema.safeParse({
          scoring_strategy_name: "fixed",
          category_weights
        }).success
      ).toBe(false);
    }
  });

  it("include_cancelled is true only for the string 'true'", () => {
    expect(includeCancelledQuerySchema.parse({ include_cancelled: "true" })).toEqual({
      include_cancelled: true
    });
    expect(includeCancelledQuerySchema.parse({ include_cancelled: ["true"] })).toEqual({
      include_cancelled: false
    });
  });
});
