import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/api-auth";
import { getCache, setCache } from "@/lib/cache";
import { invalidateFinanceCaches } from "@/lib/cache-keys";
import { privateCacheHeaders } from "@/lib/http";
import { parseStrictMoneyInput } from "@/lib/money";
import { isValidFlexibleDate, parseFlexibleDate } from "@/lib/normalize";
import { withRouteProfiling } from "@/lib/profiling";
import { netWorthRepo } from "@/lib/server/net-worth.repo";

const moneyInputSchema = z
  .union([z.number(), z.string()])
  .transform((value) => parseStrictMoneyInput(value))
  .refine((value): value is number => value !== null, {
    message: "Valor invalido"
  });

const createEntrySchema = z.object({
  type: z.enum(["asset", "debt"]),
  name: z.string().min(2).max(100),
  value: moneyInputSchema,
  date: z
    .string()
    .min(8)
    .refine((value) => isValidFlexibleDate(value), {
      message: "Data invalida"
    }),
  group: z.string().max(80).optional().nullable()
});

export async function GET(request: NextRequest): Promise<NextResponse> {
  return withRouteProfiling(request, "/api/net-worth.GET", async () => {
  const auth = await requireUser(request);
  if (auth instanceof NextResponse) return auth;

  const cacheKey = `net-worth:${auth.userId}:list`;
  const cached = getCache(cacheKey);
  if (cached) {
    return NextResponse.json(cached, { headers: privateCacheHeaders });
  }

  const payload = await netWorthRepo.listByUser(auth.userId);

  setCache(cacheKey, payload, 20_000);

  return NextResponse.json(payload, { headers: privateCacheHeaders });
  });
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  return withRouteProfiling(request, "/api/net-worth.POST", async () => {
  const auth = await requireUser(request);
  if (auth instanceof NextResponse) return auth;

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ error: "Payload JSON inválido" }, { status: 400 });
  }
  const parsed = createEntrySchema.safeParse(payload);

  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const entry = await netWorthRepo.create({
    userId: auth.userId,
    type: parsed.data.type,
    name: parsed.data.name,
    value: parsed.data.value,
    date: parseFlexibleDate(parsed.data.date),
    group: parsed.data.group
  });

  if (!entry) {
    return NextResponse.json({ error: "Falha ao criar patrimonio" }, { status: 500 });
  }

  invalidateFinanceCaches(auth.userId);

  return NextResponse.json(entry, { status: 201 });
  });
}



