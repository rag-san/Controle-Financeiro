import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/api-auth";
import { getCache, setCache } from "@/lib/cache";
import { privateCacheHeaders } from "@/lib/http";
import { importsRepo } from "@/lib/server/imports.repo";

export async function GET(request: NextRequest): Promise<NextResponse> {
  const auth = await requireUser(request);
  if (auth instanceof NextResponse) return auth;

  const cacheKey = `imports:${auth.userId}:recent`;
  const cached = getCache(cacheKey);
  if (cached) {
    return NextResponse.json(cached, { headers: privateCacheHeaders });
  }

  const batches = importsRepo.listRecentByUser(auth.userId, 30);

  setCache(cacheKey, batches, 20_000);

  return NextResponse.json(batches, { headers: privateCacheHeaders });
}


