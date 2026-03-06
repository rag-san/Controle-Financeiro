import test from "node:test";
import assert from "node:assert/strict";
import { NextRequest } from "next/server";
import { GET } from "@/app/api/dashboard/summary/route";

test("dashboard summary route requires authentication", async () => {
  const request = new NextRequest("http://localhost:3000/api/dashboard/summary?from=2026-02-01&to=2026-02-28");
  const response = await GET(request);

  assert.equal(response.status, 401);
  const payload = await response.json();
  assert.match(String(payload?.error ?? ""), /não autenticado/i);
});
