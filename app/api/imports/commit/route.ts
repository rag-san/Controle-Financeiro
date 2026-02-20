import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/api-auth";
import { invalidateFinanceCaches } from "@/lib/cache-keys";
import { withRouteProfiling } from "@/lib/profiling";
import { commitImportForUser, importCommitPayloadSchema } from "@/lib/server/imports-commit.service";

export async function POST(request: NextRequest): Promise<NextResponse> {
  return withRouteProfiling(request, "/api/imports/commit.POST", async () => {
    try {
      const auth = await requireUser(request);
      if (auth instanceof NextResponse) return auth;

      let payload: unknown;
      try {
        payload = await request.json();
      } catch {
        return NextResponse.json({ error: "Payload JSON invalido" }, { status: 400 });
      }

      const parsed = importCommitPayloadSchema.safeParse(payload);

      if (!parsed.success) {
        return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
      }

      const result = await commitImportForUser(auth.userId, parsed.data);

      invalidateFinanceCaches(auth.userId);

      return NextResponse.json(result, { status: 201 });
    } catch (error) {
      return NextResponse.json(
        {
          error: error instanceof Error ? error.message : "Falha ao concluir importacao"
        },
        { status: 500 }
      );
    }
  });
}


