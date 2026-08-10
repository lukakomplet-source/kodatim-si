import { NextResponse } from "next/server";
import { preberiDostop } from "@/lib/avtonet/dostop";

/**
 * Who the visitor is, for the navigation.
 *
 * A tiny endpoint so the layout never has to read cookies — that would make
 * every SBN Auto page dynamic, including the public analysis pages that are
 * perfectly cacheable. Always 200: "not signed in" is an answer, not an error,
 * and a 403 in the console of a page shown to clients looks like a fault.
 */

export const dynamic = "force-dynamic";

export async function GET() {
  const d = await preberiDostop();
  return NextResponse.json({ jeUporabnik: d.jeUporabnik, jeAdmin: d.jeAdmin, email: d.email });
}
