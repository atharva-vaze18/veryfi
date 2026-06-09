import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const session = getSession();
  if (!session) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });

  const v = await prisma.verification.findUnique({
    where: { id: params.id },
    select: { id: true, orgId: true, frameStorageKeys: true },
  });
  if (!v || v.orgId !== session.orgId) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (!v.frameStorageKeys) return NextResponse.json({ urls: [] });

  const keys = (() => { try { return JSON.parse(v.frameStorageKeys) as string[]; } catch { return [] as string[]; } })();

  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !supabaseServiceKey) {
    return NextResponse.json({ urls: keys.map((k) => ({ key: k, url: null })) });
  }

  try {
    const { createClient } = await import("@supabase/supabase-js");
    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    const urls = await Promise.all(
      keys.map(async (key) => {
        const { data } = await supabase.storage.from("session-frames").createSignedUrl(key, 3600);
        return { key, url: data?.signedUrl ?? null };
      }),
    );
    return NextResponse.json({ urls });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
