import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/api-auth";
import { withRouteProfiling } from "@/lib/profiling";

export async function POST(request: NextRequest): Promise<NextResponse> {
  return withRouteProfiling(request, "/api/import.POST", async () => {
    const auth = await requireUser(request);
    if (auth instanceof NextResponse) return auth;

    return NextResponse.json(
      {
        error: "Rota de importacao legada desativada.",
        code: "legacy_import_route_disabled",
        officialFlow: {
          parse: "/api/imports/parse",
          commit: "/api/imports/commit"
        }
      },
      { status: 410 }
    );
  });
}
