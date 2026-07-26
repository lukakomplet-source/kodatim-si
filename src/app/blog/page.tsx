import type { Metadata } from "next";
import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import Reveal, { RevealGroup, RevealItem } from "@/components/Reveal";
import { BLOG_POSTS } from "@/lib/blog";

export const metadata: Metadata = {
  title: "Blog — nasveti o spletnih straneh, SEO in AI | KodaTim.si",
  description:
    "Nasveti o izdelavi spletnih strani, SEO optimizaciji, AI chatbotih in spletnih trgovinah. Blog razvojne agencije KodaTim.si.",
};

function formatDate(dateStr: string) {
  return new Date(dateStr).toLocaleDateString("sl-SI", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

export default function BlogPage() {
  return (
    <>
      <Navbar />
      <main className="flex-1">
        <section className="py-28 sm:py-32">
          <div className="mx-auto max-w-3xl px-6 text-center lg:px-8">
            <Reveal>
              <p className="text-sm font-medium text-accent">Blog</p>
              <h1 className="mt-3 text-3xl font-semibold tracking-tight text-zinc-900 sm:text-4xl">
                Nasveti o spletnih straneh, SEO in AI
              </h1>
              <p className="mt-4 text-lg text-zinc-500">
                Pišemo o izdelavi spletnih strani, SEO optimizaciji, AI
                chatbotih in spletnih trgovinah — vse, kar potrebujete za
                rast vašega podjetja na spletu.
              </p>
            </Reveal>
          </div>
        </section>

        <section className="border-t border-zinc-200 py-20">
          <div className="mx-auto max-w-5xl px-6 lg:px-8">
            <RevealGroup className="grid grid-cols-1 gap-6 sm:grid-cols-2">
              {BLOG_POSTS.map((post) => (
                <RevealItem key={post.slug}>
                  <Link href={`/blog/${post.slug}`} className="group block h-full">
                    <div className="flex h-full flex-col rounded-3xl border border-zinc-200 bg-white p-7 shadow-sm transition hover:border-accent/40 hover:shadow-md">
                      <p className="text-xs font-medium uppercase tracking-wide text-accent">
                        {post.category}
                      </p>
                      <h2 className="mt-3 flex items-start gap-1.5 text-lg font-semibold text-zinc-900">
                        {post.title}
                        <ArrowUpRight className="mt-1 h-4 w-4 flex-shrink-0 text-zinc-400 transition group-hover:text-accent" />
                      </h2>
                      <p className="mt-3 flex-1 text-sm leading-relaxed text-zinc-500">
                        {post.description}
                      </p>
                      <p className="mt-5 text-xs text-zinc-400">
                        {formatDate(post.publishedAt)} · {post.readTime}
                      </p>
                    </div>
                  </Link>
                </RevealItem>
              ))}
            </RevealGroup>
          </div>
        </section>
      </main>
      <Footer />
    </>
  );
}
