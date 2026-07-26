import { notFound } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Check } from "lucide-react";
import type { ComponentType } from "react";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import CTASection from "@/components/CTASection";
import Reveal from "@/components/Reveal";
import ProjectScreenshot from "@/components/ProjectScreenshot";
import { getProjectBySlug, PROJECTS, type ProjectFeature } from "@/lib/projects";
import OpsDashboardPreview from "@/components/mockups/OpsDashboardPreview";
import RouteCalculatorPreview from "@/components/mockups/RouteCalculatorPreview";
import ChatBotPreview from "@/components/mockups/ChatBotPreview";
import PhoneMockup from "@/components/mockups/PhoneMockup";

const VISUALS: Record<ProjectFeature["visual"], ComponentType> = {
  dashboard: OpsDashboardPreview,
  invoices: OpsDashboardPreview,
  "route-calculator": RouteCalculatorPreview,
  chatbot: ChatBotPreview,
  phone: PhoneMockup,
};

export function generateStaticParams() {
  return PROJECTS.filter((project) => project.status === "live").map(
    (project) => ({ slug: project.slug })
  );
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const project = getProjectBySlug(slug);
  return { title: project ? `${project.title} — KodaTim.si` : "Projekt" };
}

export default async function ProjectPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const project = getProjectBySlug(slug);

  if (!project || project.status !== "live") {
    notFound();
  }

  return (
    <>
      <Navbar />
      <main className="flex-1">
        <section className="py-28 sm:py-32">
          <div className="mx-auto max-w-3xl px-6 lg:px-8">
            <Reveal>
              <Link
                href="/#reference"
                className="inline-flex items-center gap-1.5 text-sm font-medium text-zinc-500 transition hover:text-zinc-900"
              >
                <ArrowLeft className="h-4 w-4" />
                Nazaj na reference
              </Link>
              <p className="mt-6 text-sm font-medium text-accent">
                {project.tag}
              </p>
              <h1 className="mt-3 text-3xl font-semibold tracking-tight text-zinc-900 sm:text-4xl">
                {project.title}
              </h1>
              {project.client && (
                <p className="mt-4 text-lg text-zinc-500">{project.client}</p>
              )}
            </Reveal>

            {project.challenge && (
              <Reveal
                delay={0.1}
                className="mt-10 rounded-3xl border border-zinc-200 bg-zinc-50/60 p-7"
              >
                <h2 className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
                  Izziv
                </h2>
                <p className="mt-2 text-base leading-relaxed text-zinc-700">
                  {project.challenge}
                </p>
              </Reveal>
            )}
          </div>
        </section>

        {project.features?.map((feature, index) => {
          const Visual = VISUALS[feature.visual];
          const textFirst = index % 2 === 0;

          return (
            <section
              key={feature.title}
              className={
                index % 2 === 0
                  ? "border-t border-zinc-200 bg-zinc-50/60 py-24"
                  : "border-t border-zinc-200 py-24"
              }
            >
              <div className="mx-auto max-w-7xl px-6 lg:px-8">
                <div className="grid items-center gap-12 lg:grid-cols-5 lg:gap-16">
                  <Reveal
                    className={
                      textFirst
                        ? "order-2 lg:order-1 lg:col-span-2"
                        : "order-2 lg:order-2 lg:col-span-2"
                    }
                  >
                    <h3 className="text-2xl font-semibold text-zinc-900 sm:text-3xl">
                      {feature.title}
                    </h3>
                    <p className="mt-4 text-base leading-relaxed text-zinc-600">
                      {feature.description}
                    </p>
                  </Reveal>
                  <Reveal
                    delay={0.1}
                    className={
                      textFirst
                        ? "order-1 lg:order-2 lg:col-span-3"
                        : "order-1 lg:order-1 lg:col-span-3"
                    }
                  >
                    {feature.screenshot ? (
                      <ProjectScreenshot
                        src={feature.screenshot.src}
                        alt={feature.screenshot.alt}
                        label={feature.title}
                        width={feature.screenshot.width}
                        height={feature.screenshot.height}
                      />
                    ) : (
                      <Visual />
                    )}
                  </Reveal>
                </div>
              </div>
            </section>
          );
        })}

        {project.results && project.results.length > 0 && (
          <section className="border-t border-zinc-200 py-24">
            <div className="mx-auto max-w-2xl px-6 lg:px-8">
              <Reveal className="text-center">
                <h2 className="text-2xl font-semibold text-zinc-900 sm:text-3xl">
                  Kaj se je spremenilo
                </h2>
              </Reveal>
              <ul className="mt-10 space-y-3">
                {project.results.map((result, index) => (
                  <Reveal key={result} delay={index * 0.05}>
                    <li className="flex items-start gap-3 rounded-xl border border-zinc-200 bg-white p-4 text-sm text-zinc-700 shadow-sm">
                      <Check className="mt-0.5 h-4 w-4 flex-shrink-0 text-accent" />
                      {result}
                    </li>
                  </Reveal>
                ))}
              </ul>
            </div>
          </section>
        )}

        <CTASection
          eyebrow="Podobna zgodba?"
          heading="Želite podobno rešitev za svoje podjetje?"
          subtext="Opišite svoj projekt in v 24 urah dobite konkreten predlog rešitve."
          buttonLabel="Opišite svoj projekt"
          href="/#projekt"
        />
      </main>
      <Footer />
    </>
  );
}
