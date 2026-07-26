import { notFound } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Check } from "lucide-react";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import CTASection from "@/components/CTASection";
import Reveal from "@/components/Reveal";
import { BLOG_POSTS, getAllPostSlugs, getPostBySlug } from "@/lib/blog";

export function generateStaticParams() {
  return getAllPostSlugs().map((slug) => ({ slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const post = getPostBySlug(slug);
  if (!post) return { title: "Blog — KodaTim.si" };
  return {
    title: `${post.title} — KodaTim.si`,
    description: post.description,
    keywords: post.keywords,
  };
}

function formatDate(dateStr: string) {
  return new Date(dateStr).toLocaleDateString("sl-SI", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

export default async function BlogPostPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const post = getPostBySlug(slug);

  if (!post) {
    notFound();
  }

  const otherPosts = BLOG_POSTS.filter((p) => p.slug !== post.slug).slice(0, 3);

  return (
    <>
      <Navbar />
      <main className="flex-1">
        <article className="py-28 sm:py-32">
          <div className="mx-auto max-w-3xl px-6 lg:px-8">
            <Reveal>
              <Link
                href="/blog"
                className="inline-flex items-center gap-1.5 text-sm font-medium text-zinc-500 transition hover:text-zinc-900"
              >
                <ArrowLeft className="h-4 w-4" />
                Nazaj na blog
              </Link>
              <p className="mt-6 text-sm font-medium text-accent">
                {post.category}
              </p>
              <h1 className="mt-3 text-3xl font-semibold tracking-tight text-zinc-900 sm:text-4xl">
                {post.title}
              </h1>
              <p className="mt-4 text-xs text-zinc-400">
                {formatDate(post.publishedAt)} · {post.readTime}
              </p>
              <p className="mt-6 text-lg leading-relaxed text-zinc-600">
                {post.intro}
              </p>
            </Reveal>

            <div className="mt-14 space-y-14">
              {post.sections.map((section, index) => (
                <Reveal key={section.heading} delay={index * 0.05}>
                  <h2 className="text-xl font-semibold text-zinc-900 sm:text-2xl">
                    {section.heading}
                  </h2>
                  <div className="mt-4 space-y-4">
                    {section.paragraphs.map((paragraph) => (
                      <p
                        key={paragraph}
                        className="text-base leading-relaxed text-zinc-600"
                      >
                        {paragraph}
                      </p>
                    ))}
                  </div>
                  {section.list && (
                    <ul className="mt-4 space-y-2.5">
                      {section.list.map((item) => (
                        <li
                          key={item}
                          className="flex items-start gap-2.5 text-base text-zinc-600"
                        >
                          <Check className="mt-1 h-4 w-4 flex-shrink-0 text-accent" />
                          {item}
                        </li>
                      ))}
                    </ul>
                  )}
                </Reveal>
              ))}
            </div>

            <Reveal
              delay={0.1}
              className="mt-14 rounded-3xl border border-zinc-200 bg-zinc-50/60 p-7"
            >
              <p className="text-base leading-relaxed text-zinc-700">
                {post.conclusion}
              </p>
            </Reveal>
          </div>
        </article>

        {otherPosts.length > 0 && (
          <section className="border-t border-zinc-200 py-20">
            <div className="mx-auto max-w-5xl px-6 lg:px-8">
              <Reveal className="text-center">
                <h2 className="text-2xl font-semibold text-zinc-900 sm:text-3xl">
                  Več z bloga
                </h2>
              </Reveal>
              <div className="mt-10 grid grid-cols-1 gap-6 sm:grid-cols-3">
                {otherPosts.map((p) => (
                  <Reveal key={p.slug}>
                    <Link
                      href={`/blog/${p.slug}`}
                      className="block h-full rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm transition hover:border-accent/40 hover:shadow-md"
                    >
                      <p className="text-xs font-medium uppercase tracking-wide text-accent">
                        {p.category}
                      </p>
                      <h3 className="mt-2 text-sm font-semibold text-zinc-900">
                        {p.title}
                      </h3>
                    </Link>
                  </Reveal>
                ))}
              </div>
            </div>
          </section>
        )}

        <CTASection
          eyebrow="Imate projekt?"
          heading="Opišite svojo idejo in dobite konkreten predlog rešitve."
          subtext="V 24 urah dobite oceno obsega in cene, brez obveznosti."
          buttonLabel="Opišite svoj projekt"
          href="/#projekt"
        />
      </main>
      <Footer />
    </>
  );
}
