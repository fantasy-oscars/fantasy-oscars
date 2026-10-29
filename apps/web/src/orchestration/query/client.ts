import { QueryClient } from "@tanstack/react-query";
import { ApiQueryError } from "./errors";

/** Retry transient failures once; never retry a 4xx (the answer will not change). */
export function shouldRetryQuery(failureCount: number, error: unknown): boolean {
  if (error instanceof ApiQueryError && error.status && error.status < 500) {
    return false;
  }
  return failureCount < 1;
}

export function createQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 30_000,
        refetchOnWindowFocus: true,
        retry: shouldRetryQuery
      },
      mutations: { retry: 0 }
    }
  });
}
