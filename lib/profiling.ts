import { AsyncLocalStorage } from "node:async_hooks";
import { randomUUID } from "node:crypto";
import { performance } from "node:perf_hooks";
import { NextRequest, NextResponse } from "next/server";

type ProfiledQuery = {
  durationMs: number;
  target?: string;
  sql: string;
};

type RequestProfileState = {
  requestId: string;
  route: string;
  method: string;
  startedAtMs: number;
  queryCount: number;
  queryDurationMs: number;
  slowQueries: ProfiledQuery[];
};

const globalForProfiling = globalThis as typeof globalThis & {
  __finance_request_profiler__?: AsyncLocalStorage<RequestProfileState>;
};

const requestProfiler =
  globalForProfiling.__finance_request_profiler__ ?? new AsyncLocalStorage<RequestProfileState>();

if (!globalForProfiling.__finance_request_profiler__) {
  globalForProfiling.__finance_request_profiler__ = requestProfiler;
}

function parseBooleanFlag(value: string | undefined): boolean {
  if (!value) return false;
  return value === "1" || value.toLowerCase() === "true";
}

function round(value: number): number {
  return Number(value.toFixed(2));
}

export function isApiProfilingEnabled(): boolean {
  return parseBooleanFlag(process.env.API_PROFILING);
}

export async function withRouteProfiling(
  request: NextRequest,
  route: string,
  run: () => Promise<NextResponse>
): Promise<NextResponse> {
  if (!isApiProfilingEnabled()) {
    return run();
  }

  const state: RequestProfileState = {
    requestId: randomUUID(),
    route,
    method: request.method,
    startedAtMs: performance.now(),
    queryCount: 0,
    queryDurationMs: 0,
    slowQueries: []
  };

  return requestProfiler.run(state, async () => {
    let response: NextResponse | null = null;
    let status = 500;
    let errorName: string | null = null;

    try {
      response = await run();
      status = response.status;
      return response;
    } catch (error) {
      errorName = error instanceof Error ? error.name : "unknown_error";
      throw error;
    } finally {
      const totalMs = performance.now() - state.startedAtMs;
      const nonDbMs = Math.max(0, totalMs - state.queryDurationMs);

      if (response) {
        response.headers.set("x-profile-id", state.requestId);
        response.headers.set(
          "server-timing",
          `total;dur=${round(totalMs)}, db;dur=${round(state.queryDurationMs)}, app;dur=${round(nonDbMs)}`
        );
      }

      console.info(
        `[API-PROFILE] ${JSON.stringify({
          requestId: state.requestId,
          route: state.route,
          method: state.method,
          status,
          totalMs: round(totalMs),
          dbMs: round(state.queryDurationMs),
          appMs: round(nonDbMs),
          queryCount: state.queryCount,
          slowQueries: state.slowQueries.slice(0, 5),
          error: errorName
        })}`
      );
    }
  });
}
