import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/api-auth";
import { getCache, setCache } from "@/lib/cache";
import { invalidateFinanceCaches } from "@/lib/cache-keys";
import { privateCacheHeaders } from "@/lib/http";
import { withRouteProfiling } from "@/lib/profiling";
import { categoriesRepo } from "@/lib/server/categories.repo";
import { categoryRulesRepo } from "@/lib/server/category-rules.repo";
import { accountsRepo } from "@/lib/server/accounts.repo";
import { restoreDefaultCategoriesForUser } from "@/lib/server/default-categories.service";

export async function GET(request: NextRequest): Promise<NextResponse> {
  return withRouteProfiling(request, "/api/categories/bootstrap.GET", async () => {
    const auth = await requireUser(request);
    if (auth instanceof NextResponse) return auth;

    const cacheKey = `bootstrap:${auth.userId}:categories`;
    const cached = getCache(cacheKey);
    if (cached) {
      return NextResponse.json(cached, { headers: privateCacheHeaders });
    }

    let [categories, rules, accounts] = await Promise.all([
      categoriesRepo.listByUser(auth.userId, true),
      categoryRulesRepo.listByUser(auth.userId, true),
      accountsRepo.listByUser(auth.userId)
    ]);

    // Self-healing: garante categorias/regras padrão quando o usuário ficou zerado.
    if (categories.length === 0) {
      await restoreDefaultCategoriesForUser(auth.userId);
      invalidateFinanceCaches(auth.userId);

      [categories, rules, accounts] = await Promise.all([
        categoriesRepo.listByUser(auth.userId, true),
        categoryRulesRepo.listByUser(auth.userId, true),
        accountsRepo.listByUser(auth.userId)
      ]);
    }

    const payload = {
      categories,
      rules,
      accounts
    };

    setCache(cacheKey, payload, 20_000);

    return NextResponse.json(payload, { headers: privateCacheHeaders });
  });
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  return withRouteProfiling(request, "/api/categories/bootstrap.POST", async () => {
    const auth = await requireUser(request);
    if (auth instanceof NextResponse) return auth;

    const result = await restoreDefaultCategoriesForUser(auth.userId);
    invalidateFinanceCaches(auth.userId);

    return NextResponse.json(result, { status: 200 });
  });
}

