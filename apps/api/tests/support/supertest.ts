import type { Express } from "express";
import request from "supertest";

export type ApiAgent = ReturnType<typeof request.agent>;

export function createApiAgent(app: Express): ApiAgent {
  return request.agent(app);
}
