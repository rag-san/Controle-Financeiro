import assert from "node:assert/strict";
import test from "node:test";
import { NextRequest } from "next/server";
import { middleware } from "@/middleware";

test("middleware redirects unauthenticated protected access to login with callbackUrl", async () => {
  const request = new NextRequest("http://localhost:3000/reports?preset=3M");
  const response = await middleware(request);

  assert.equal(response.status, 307);
  assert.equal(
    response.headers.get("location"),
    "http://localhost:3000/login?callbackUrl=%2Freports%3Fpreset%3D3M"
  );
});

test("middleware allows login route to render so stale sessions can recover", async () => {
  const request = new NextRequest("http://localhost:3000/login?callbackUrl=%2Freports", {
  });

  const response = await middleware(request);

  assert.equal(response.status, 200);
  assert.equal(response.headers.get("location"), null);
});
