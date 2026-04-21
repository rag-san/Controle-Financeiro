import test from "node:test";
import assert from "node:assert/strict";
import { NextRequest } from "next/server";
import { GET } from "@/app/api/metrics/official/route";

test("official metrics route requires authentication", async () => {
  const request = new NextRequest("http://localhost:3000/api/metrics/official?view=dashboard");
  const response = await GET(request);

  assert.equal(response.status, 401);
  const payload = await response.json();
  assert.match(String(payload?.error ?? ""), /não autenticado/i);
});
