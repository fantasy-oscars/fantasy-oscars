import { AddressInfo } from "net";
import { expect } from "vitest";
import { createServer } from "../../src/server.js";

export type ApiTestServer = {
  baseUrl: string;
  close: () => Promise<void>;
};

type RequestOptions = RequestInit & { authToken?: string };

export async function startApiServer(): Promise<ApiTestServer> {
  const app = createServer();
  return await new Promise<ApiTestServer>((resolve, reject) => {
    const server = app
      .listen(0, "127.0.0.1", () => {
        const { port } = server.address() as AddressInfo;
        resolve({
          baseUrl: `http://127.0.0.1:${port}`,
          close: async () =>
            await new Promise<void>((resolveClose) => {
              server.close(() => resolveClose());
            })
        });
      })
      .on("error", reject);
  });
}

export async function apiRequest(
  server: ApiTestServer,
  path: string,
  options: RequestOptions = {}
): Promise<Response> {
  const headers = new Headers(options.headers);
  if (options.authToken) {
    headers.set("Authorization", `Bearer ${options.authToken}`);
  }

  return await fetch(`${server.baseUrl}${path}`, { ...options, headers });
}

export function expectStatus(res: Response, status: number) {
  expect(res.status).toBe(status);
}

export async function expectJson(res: Response, expected: unknown) {
  const body = await res.json();
  expect(body).toEqual(expected);
  return body;
}
