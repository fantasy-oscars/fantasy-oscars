// @vitest-environment node
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const webRoot = resolve(__dirname, "../../..");

describe("favicon", () => {
  const html = readFileSync(resolve(webRoot, "index.html"), "utf8");

  it("is declared in the document head as an svg icon", () => {
    expect(html).toMatch(
      /<link\s+rel="icon"\s+type="image\/svg\+xml"\s+href="\/favicon\.svg"\s*\/>/
    );
  });

  it("points at a file shipped from public/", () => {
    expect(existsSync(resolve(webRoot, "public/favicon.svg"))).toBe(true);
  });

  it("is a standalone svg that needs no fonts", () => {
    const svg = readFileSync(resolve(webRoot, "public/favicon.svg"), "utf8");
    expect(svg).toContain('xmlns="http://www.w3.org/2000/svg"');
    expect(svg).toContain("viewBox");
    expect(svg).not.toContain("<text");
  });
});
