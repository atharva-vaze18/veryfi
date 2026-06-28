import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { fetchLeverStages } from "@/lib/integrations/lever";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Returns the configured Lever stages so the dashboard's "trigger stage"
// dropdown can render real values. The API key is sent in the request body
// because we may not have a saved integration yet (used while wiring up).
export async function POST(req: Request) {
  const session = getSession();
  if (!session) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });

  const body = await req.json().catch(() => ({})) as { apiKey?: string };
  if (!body.apiKey) return NextResponse.json({ error: "apiKey required" }, { status: 400 });

  try {
    const stages = await fetchLeverStages(body.apiKey);
    return NextResponse.json({ stages });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
  }
}
