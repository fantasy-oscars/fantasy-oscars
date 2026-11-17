import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AppError } from "../../../src/errors.js";
import { searchTmdbMovies, TMDB_TIMEOUT_MS } from "../../../src/lib/tmdb.js";

const UPSTREAM_TEXT = "secret upstream diagnostic";

async function failureOf(promise: Promise<unknown>): Promise<AppError> {
  const err = await promise.then(
    () => null,
    (e: unknown) => e
  );
  expect(err).toBeInstanceOf(AppError);
  return err as AppError;
}

describe("TMDB client", () => {
  const fetchMock = vi.fn<typeof fetch>();

  beforeEach(() => {
    vi.stubEnv("TMDB_READ_ACCESS_TOKEN", "token");
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    fetchMock.mockReset();
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it("sends a timeout signal and include_adult=false", async () => {
    fetchMock.mockResolvedValue(Response.json({ results: [{ id: 1, title: "A" }] }));
    expect(await searchTmdbMovies("alien")).toEqual([{ id: 1, title: "A" }]);
    const [url, init] = fetchMock.mock.calls[0] ?? [];
    expect(String(url)).toContain("include_adult=false");
    expect(init?.signal).toBeInstanceOf(AbortSignal);
  });

  it("maps a call that outlives the timeout to 503", async () => {
    const realTimeout = AbortSignal.timeout.bind(AbortSignal);
    const timeoutSpy = vi
      .spyOn(AbortSignal, "timeout")
      .mockImplementation(() => realTimeout(5));
    fetchMock.mockImplementation(
      (_url, init) =>
        new Promise((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () => reject(init.signal?.reason));
        })
    );
    const err = await failureOf(searchTmdbMovies("alien"));
    expect(timeoutSpy).toHaveBeenCalledWith(TMDB_TIMEOUT_MS);
    expect(TMDB_TIMEOUT_MS).toBe(5000);
    expect([err.status, err.code]).toEqual([503, "TMDB_UNAVAILABLE"]);
  });

  it("maps network failures to 503", async () => {
    fetchMock.mockRejectedValue(new TypeError(`fetch failed: ${UPSTREAM_TEXT}`));
    const err = await failureOf(searchTmdbMovies("alien"));
    expect([err.status, err.code]).toEqual([503, "TMDB_UNAVAILABLE"]);
    expect(err.message).not.toContain(UPSTREAM_TEXT);
  });

  it("maps upstream errors to 502 without their text", async () => {
    fetchMock.mockResolvedValue(new Response(UPSTREAM_TEXT, { status: 500 }));
    const err = await failureOf(searchTmdbMovies("alien"));
    expect([err.status, err.code]).toEqual([502, "TMDB_UPSTREAM_ERROR"]);
    expect(err.message).not.toContain(UPSTREAM_TEXT);
  });

  it("maps upstream throttling and unavailability to 503", async () => {
    for (const status of [429, 503]) {
      fetchMock.mockResolvedValueOnce(new Response(UPSTREAM_TEXT, { status }));
      const err = await failureOf(searchTmdbMovies("alien"));
      expect(err.status).toBe(503);
    }
  });

  it("maps a malformed body to 502 and an unknown id to 404", async () => {
    fetchMock.mockResolvedValueOnce(new Response("not json", { status: 200 }));
    expect((await failureOf(searchTmdbMovies("alien"))).status).toBe(502);
    fetchMock.mockResolvedValueOnce(new Response(UPSTREAM_TEXT, { status: 404 }));
    const err = await failureOf(searchTmdbMovies("alien"));
    expect([err.status, err.code]).toEqual([404, "TMDB_NOT_FOUND"]);
  });

  it("reports a missing token as unavailable without calling TMDB", async () => {
    vi.stubEnv("TMDB_READ_ACCESS_TOKEN", "");
    vi.stubEnv("TMDB_API_TOKEN", "");
    const err = await failureOf(searchTmdbMovies("alien"));
    expect(err.status).toBe(503);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
