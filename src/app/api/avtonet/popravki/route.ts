import { NextResponse } from "next/server";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { preberiDostop } from "@/lib/avtonet/dostop";
import { createAvtonetClient } from "@/lib/avtonet/db";
import { DOSEG, DOSEG_PREDPONE } from "@/lib/avtonet/aiScope";

/**
 * The history of changes to SBN Auto, as it actually happened.
 *
 * Read from git rather than from a table we maintain: the repository is the only
 * record that cannot drift from the code. A table would say a fix exists while
 * the file says otherwise — and this page exists precisely so that "what
 * changed, and can we go back" has a truthful answer.
 *
 * Scoped to the same paths the AI editor may touch, so the tree is about SBN
 * Auto and not about every commit in the monorepo.
 */

export const dynamic = "force-dynamic";

const izvedi = promisify(execFile);

export type Popravek = {
  sha: string;
  kratki: string;
  ob: string;
  avtor: string;
  naslov: string;
  /** First line of the body — why, when the author wrote one. */
  opis: string;
  datotek: number;
  /** Set when this commit reverts another; the tree draws it as a return. */
  povrnitevOd: string | null;
  /** Suggestions this commit closed, matched through avtonet_predlogi.commit_sha. */
  predlogi: { id: string; besedilo: string }[];
};

async function git(args: string[]): Promise<string> {
  const { stdout } = await izvedi("git", args, {
    cwd: process.cwd(),
    maxBuffer: 8 * 1024 * 1024,
    windowsHide: true,
  });
  return stdout;
}

export async function GET() {
  const dostop = await preberiDostop();
  if (!dostop.jeUporabnik) {
    return NextResponse.json({ error: "Niste prijavljeni." }, { status: 401 });
  }

  // Separator characters that cannot appear in a commit subject.
  const LOC = "\u0001";
  const VRSTICA = "\u0002";

  let vrstice: string[] = [];
  try {
    const out = await git([
      "log",
      "-n",
      "60",
      `--pretty=format:%H${LOC}%h${LOC}%cI${LOC}%an${LOC}%s${LOC}%b${VRSTICA}`,
      "--name-only",
      "--",
      ...DOSEG,
      ...DOSEG_PREDPONE.map((p) => `${p}*`),
    ]);
    vrstice = out.split(VRSTICA).filter((v) => v.trim().length > 0);
  } catch (err) {
    // No git, no checkout, or a bare deployment: the tree is simply unavailable,
    // which is not an error the page should die on.
    return NextResponse.json({
      popravki: [],
      opomba: `Zgodovine ni bilo mogoče prebrati (${err instanceof Error ? err.message : "?"}).`,
    });
  }

  const db = createAvtonetClient();
  const { data: predlogiRaw } = await db
    .from("avtonet_predlogi")
    .select("id, besedilo, commit_sha")
    .not("commit_sha", "is", null)
    .limit(200);
  const poShi = new Map<string, { id: string; besedilo: string }[]>();
  for (const p of (predlogiRaw ?? []) as { id: string; besedilo: string; commit_sha: string }[]) {
    const k = p.commit_sha.trim().slice(0, 40);
    poShi.set(k, [...(poShi.get(k) ?? []), { id: p.id, besedilo: p.besedilo }]);
  }

  const popravki: Popravek[] = [];
  for (const blok of vrstice) {
    const [glava, ...ostalo] = blok.split("\n");
    const [sha, kratki, ob, avtor, naslov, telo] = glava.split(LOC);
    if (!sha) continue;
    const datoteke = ostalo.map((v) => v.trim()).filter(Boolean);
    // "Revert "…"" is git's own wording; the reverted sha is named in the body.
    const povrnitev = /^Revert /.test(naslov ?? "")
      ? (telo ?? "").match(/commit ([0-9a-f]{7,40})/i)?.[1] ?? null
      : null;

    popravki.push({
      sha,
      kratki,
      ob,
      avtor,
      naslov: naslov ?? "",
      opis: (telo ?? "").split("\n").find((v) => v.trim().length > 0)?.trim() ?? "",
      datotek: datoteke.length,
      povrnitevOd: povrnitev,
      predlogi: poShi.get(sha) ?? poShi.get(sha.slice(0, 7)) ?? [],
    });
  }

  const { data: povrnitve } = await db
    .from("avtonet_povrnitve")
    .select("id, ob, commit_sha, naslov, razlog, stanje, opomba")
    .order("ob", { ascending: false })
    .limit(30);

  return NextResponse.json({
    popravki,
    povrnitve: povrnitve ?? [],
    jeAdmin: dostop.jeAdmin,
  });
}
