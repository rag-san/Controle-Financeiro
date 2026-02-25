import { getToken } from "next-auth/jwt";
import { NextRequest, NextResponse } from "next/server";
import { AUTH_SECRET } from "@/lib/auth";
import { getRequiredUserId } from "@/lib/auth";
import { getCache, setCache } from "@/lib/cache";
import { usersRepo } from "@/lib/server/users.repo";

const AUTH_USER_EXISTS_TTL_MS = 30_000;

async function ensureUserExists(userId: string): Promise<boolean> {
  const cacheKey = `auth:user-exists:${userId}`;
  const cached = getCache<boolean>(cacheKey);
  if (cached) {
    return true;
  }

  const user = await usersRepo.findById(userId);

  if (!user) {
    return false;
  }

  setCache(cacheKey, true, AUTH_USER_EXISTS_TTL_MS);
  return true;
}

export async function requireUser(request?: NextRequest): Promise<{ userId: string } | NextResponse> {
  if (request) {
    const token = await getToken({
      req: request,
      secret: AUTH_SECRET
    });

    if (token?.sub) {
      if (!(await ensureUserExists(token.sub))) {
        return NextResponse.json({ error: "Sessao invalida. Faca login novamente." }, { status: 401 });
      }
      return { userId: token.sub };
    }

    return NextResponse.json({ error: "Nao autenticado" }, { status: 401 });
  }

  const userId = await getRequiredUserId();
  if (!userId) {
    return NextResponse.json({ error: "Nao autenticado" }, { status: 401 });
  }

  if (!(await ensureUserExists(userId))) {
    return NextResponse.json({ error: "Sessao invalida. Faca login novamente." }, { status: 401 });
  }

  return { userId };
}

