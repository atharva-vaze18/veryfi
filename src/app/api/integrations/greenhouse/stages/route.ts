import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { fetchGreenhouseStages } from "@/lib/integrations/greenhouse";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const session = getSession();
  if (!session) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });

  const body = await req.json().catch(() => ({})) as { harvestApiKey?: string };
  if (!body.harvestApiKey) return NextResponse.json({ error: "harvestApiKey required" }, { status: 400 });

  try {
    const stages = await fetchGreenhouseStages(body.harvestApiKey);
    return NextResponse.json({ stages });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
  }
}
