import { afterAll, beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import { createServer } from "../../../src/server.js";
import { startTestDatabase } from "../../db.js";

let db: Awaited<ReturnType<typeof startTestDatabase>>;

type Node = { type: string; value?: string; children?: Node[]; position?: unknown };

function textOf(node: Node): string {
  return node.value ?? (node.children ?? []).map(textOf).join("");
}

describe("public dynamic content reads", () => {
  beforeAll(async () => {
    process.env.PORT = process.env.PORT ?? "3199";
    process.env.AUTH_SECRET = "test-secret";
    db = await startTestDatabase();
  }, 120_000);

  afterAll(async () => {
    await db?.stop();
  });

  it("returns the parsed tree for a published update that predates the tree", async () => {
    const app = createServer({ db: db.pool });
    const res = await request(app).get("/content/dynamic/home_main");
    expect(res.status).toBe(200);
    const { content } = res.body as {
      content: { body_markdown: string; body_tree: Node } | null;
    };
    expect(content).not.toBeNull();
    expect(content?.body_markdown.length).toBeGreaterThan(0);
    expect(content?.body_tree.type).toBe("root");
    expect(content?.body_tree.children?.length).toBeGreaterThan(0);
  });

  it("returns null content when nothing is published", async () => {
    const app = createServer({ db: db.pool });
    await db.pool.query(
      `UPDATE cms_dynamic_content SET status = 'DRAFT' WHERE key = $1`,
      ["home_main"]
    );
    const res = await request(app).get("/content/dynamic/home_main");
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ content: null });
  });

  it("parses banners with GFM and typography, and drops source positions", async () => {
    const app = createServer({ db: db.pool });
    await db.pool.query(
      `INSERT INTO cms_dynamic_content (key, title, body_markdown, status, published_at)
       VALUES ('banner', 'Picks', $1, 'PUBLISHED', now())`,
      ["Picks lock --- ~~8 pm~~ **9 pm**... [rules](/rules)"]
    );
    const res = await request(app).get("/content/banners");
    expect(res.status).toBe(200);
    const banners = res.body.banners as Array<{
      body_markdown: string;
      body_tree: Node;
    }>;
    expect(banners).toHaveLength(1);
    const paragraph = banners[0].body_tree.children?.[0];
    expect(paragraph?.type).toBe("paragraph");
    const types = (paragraph?.children ?? []).map((c) => c.type);
    expect(types).toEqual(["text", "delete", "text", "strong", "text", "link"]);
    expect(textOf(banners[0].body_tree)).toBe("Picks lock — 8 pm 9 pm… rules");
    expect(JSON.stringify(banners[0].body_tree)).not.toContain('"position"');
    expect(banners[0].body_markdown).toContain("---");
  });
});
