"use client";

import { motion } from "framer-motion";
import Link from "next/link";
import Image from "next/image";
import { ArrowRight, ArrowUpRight, Check } from "lucide-react";
import Reveal, { RevealGroup, RevealItem } from "./Reveal";
import { PROJECTS } from "@/lib/projects";

export default function References({
  limit,
  viewAllHref,
}: {
  limit?: number;
  viewAllHref?: string;
}) {
  const projects = limit ? PROJECTS.slice(0, limit) : PROJECTS;

  return (
    <section id="reference" className="scroll-mt-24 border-t border-zinc-200/70 py-28 sm:py-36">
      <div className="mx-auto max-w-3xl px-6 text-center lg:px-8">
        <Reveal>
          <p className="text-sm font-medium text-accent">Reference</p>
          <h2 className="mt-3 text-3xl font-semibold tracking-tight text-zinc-900 sm:text-5xl">
            Izbrani projekti
          </h2>
          <p className="mt-5 text-lg leading-relaxed text-zinc-500">
            Portfelj se polni. Tole je pogled na projekte, ki jih gradimo in
            razvijamo.
          </p>
        </Reveal>
      </div>

      <RevealGroup className="mx-auto mt-16 grid max-w-6xl grid-cols-1 gap-7 px-6 sm:grid-cols-2 lg:px-8">
        {projects.map((project) => {
          const isLive = project.status === "live";
          const secondImage = project.features?.find(
            (f) => f.screenshot && f.screenshot.src !== project.cover
          )?.screenshot;
          const impact = project.results?.[0];

          const card = (
            <motion.div
              whileHover={{ y: -6 }}
              transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
              className="group h-full overflow-hidden rounded-3xl border border-zinc-200 bg-white shadow-sm transition-colors hover:border-zinc-300"
            >
              <div className="relative h-56 overflow-hidden bg-zinc-100 sm:h-64">
                {project.cover && (
                  <Image
                    src={project.cover}
                    alt={project.title}
                    fill
                    className={`object-cover object-top transition-opacity duration-500 ${
                      secondImage ? "group-hover:opacity-0" : ""
                    }`}
                  />
                )}
                {secondImage && (
                  <Image
                    src={secondImage.src}
                    alt={secondImage.alt}
                    fill
                    className="scale-105 object-cover object-top opacity-0 transition-opacity duration-500 group-hover:opacity-100"
                  />
                )}
                <div className="absolute inset-0 bg-gradient-to-t from-black/50 via-black/0 to-black/0" />
                <span className="absolute right-4 top-4 rounded-full border border-white/20 bg-black/40 px-3 py-1 text-[11px] font-medium text-white backdrop-blur">
                  {isLive ? "Case study" : "V razvoju"}
                </span>
                <span className="absolute bottom-4 left-4 rounded-full bg-white/90 px-3 py-1 text-[11px] font-medium text-zinc-700 backdrop-blur">
                  {project.tag}
                </span>
              </div>

              <div className="p-7">
                <h3 className="flex items-center gap-1.5 text-lg font-semibold text-zinc-900">
                  {project.title}
                  {isLive && (
                    <ArrowUpRight className="h-4 w-4 text-zinc-400 transition-transform duration-300 group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
                  )}
                </h3>
                <p className="mt-2.5 text-sm leading-relaxed text-zinc-500">
                  {project.summary}
                </p>

                {project.challenge && (
                  <div className="mt-4">
                    <p className="text-[11px] font-semibold uppercase tracking-wide text-zinc-400">
                      Problem stranke
                    </p>
                    <p className="mt-1.5 line-clamp-3 text-xs leading-relaxed text-zinc-600">
                      {project.challenge}
                    </p>
                  </div>
                )}

                {impact && (
                  <div className="mt-4 rounded-xl bg-zinc-50 px-3.5 py-3">
                    <p className="text-[11px] font-semibold uppercase tracking-wide text-accent">
                      Rezultat
                    </p>
                    <p className="mt-1.5 flex items-start gap-2 text-xs leading-relaxed text-zinc-600">
                      <Check className="mt-0.5 h-3.5 w-3.5 flex-shrink-0 text-accent" />
                      {impact}
                    </p>
                  </div>
                )}

                <div className="mt-5 flex items-center gap-2">
                  {isLive ? (
                    <span className="inline-flex items-center gap-1.5 rounded-full bg-zinc-900 px-4 py-2 text-xs font-semibold text-white transition group-hover:bg-zinc-700">
                      Odpri projekt
                      <ArrowUpRight className="h-3.5 w-3.5" />
                    </span>
                  ) : (
                    <span className="text-sm font-medium text-zinc-400">
                      Kmalu na voljo
                    </span>
                  )}
                </div>
              </div>
            </motion.div>
          );

          return (
            <RevealItem key={project.slug}>
              {isLive ? (
                <Link href={`/reference/${project.slug}`} className="block h-full">
                  {card}
                </Link>
              ) : (
                card
              )}
            </RevealItem>
          );
        })}
      </RevealGroup>

      {viewAllHref && (
        <Reveal delay={0.1} className="mt-14 text-center">
          <Link
            href={viewAllHref}
            className="inline-flex items-center gap-2 rounded-full border border-zinc-300 px-6 py-3 text-sm font-semibold text-zinc-900 transition hover:bg-zinc-50"
          >
            Poglej vse reference
            <ArrowRight className="h-4 w-4" />
          </Link>
        </Reveal>
      )}
    </section>
  );
}
