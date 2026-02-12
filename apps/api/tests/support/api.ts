import { AddressInfo } from "net";
import { expect } from "vitest";
import { createServer } from "../../src/server.js";

export type ApiTestServer = {
  baseUrl: string;
  close: () => Promise<void>;
};

type RequestOptions = RequestInit & { authToken?: string };

export async function startApiServer(): Promise<ApiTestServer> {
  process.env.PORT = process.env.PORT ?? "3101";
  process.env.AUTH_SECRET = process.env.AUTH_SECRET ?? "test-secret";
  const app = createServer();
  return await new Promise<ApiTestServer>((resolve, reject) => {
    const server = app.listen(0, "127.0.0.1");

    const teardown = () => {
      server.off("error", onError);
      server.off("listening", onListening);
    };

    const onError = (err: Error) => {
      teardown();
      reject(err);
    };

    const onListening = () => {
      teardown();
      const address = server.address();
      if (!address || typeof address === "string") {
        reject(new Error("SERVER_ADDRESS_UNAVAILABLE"));
        return;
      }
      const { port } = address as AddressInfo;
      resolve({
        baseUrl: `http://127.0.0.1:${port}`,
        close: async () =>
          await new Promise<void>((resolveClose) => {
            server.close(() => resolveClose());
          })
      });
    };

    server.once("error", onError);
    server.once("listening", onListening);
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
