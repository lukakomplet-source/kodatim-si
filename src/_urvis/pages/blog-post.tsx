import { useEffect } from "react";
import { motion } from "framer-motion";
import { Link, useParams } from "wouter";
import { ArrowLeft, Calendar, Tag, ChevronRight, ArrowRight } from "lucide-react";
import { Button } from "@urvis/components/ui/button";
import { useSEO } from "@urvis/hooks/useSEO";
import { BLOG_POSTS, getBlogPost, getRecentPosts } from "@urvis/data/blog";
import NotFound from "@urvis/pages/not-found";

export default function BlogPost() {
  const params = useParams<{ slug: string }>();
  const post = getBlogPost(params.slug);

  useEffect(() => {
    window.scrollTo(0, 0);
  }, [params.slug]);

  if (!post) return <NotFound />;

  const related = getRecentPosts(3, post.slug);

  return (
    <BlogPostView post={post} related={related} />
  );
}

function BlogPostView({ post, related }: { post: NonNullable<ReturnType<typeof getBlogPost>>; related: ReturnType<typeof getRecentPosts> }) {
  useSEO({
    title: `${post.title} | URVIS Blog`,
    description: post.description,
    ogTitle: post.title,
    ogDescription: post.description,
    ogImage: post.image,
    canonical: `${(typeof window !== 'undefined' ? window.location.origin : 'https://kodatim.si/urvis')}/blog/${post.slug}`,
    schema: {
      "@context": "https://schema.org",
      "@type": "Article",
      headline: post.title,
      description: post.description,
      image: post.image,
      datePublished: post.date,
      dateModified: post.date,
      author: {
        "@type": "Organization",
        name: "URVIS Razlakiranje Kovin D.O.O.",
        url: (typeof window !== 'undefined' ? window.location.origin : 'https://kodatim.si/urvis'),
      },
      publisher: {
        "@type": "Organization",
        name: "URVIS Razlakiranje Kovin D.O.O.",
        logo: {
          "@type": "ImageObject",
          url: `${(typeof window !== 'undefined' ? window.location.origin : 'https://kodatim.si/urvis')}/og.jpg`,
        },
      },
      keywords: post.keywords.join(", "),
      mainEntityOfPage: {
        "@type": "WebPage",
        "@id": `${(typeof window !== 'undefined' ? window.location.origin : 'https://kodatim.si/urvis')}/blog/${post.slug}`,
      },
    },
  });

  return (
    <div className="flex flex-col min-h-screen bg-background">

      {/* HERO */}
      <section className="relative min-h-[45vh] flex items-end pt-28 pb-12 overflow-hidden">
        <div className="absolute inset-0 z-0">
          <img src={post.image} alt={post.imageAlt} className="w-full h-full object-cover" />
          <div className="absolute inset-0 bg-gradient-to-t from-[#12151D] via-[#12151D]/70 to-[#12151D]/30" />
        </div>
        <div className="container relative z-10 mx-auto px-6 md:px-12 max-w-4xl">
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6 }}>
            <Link href="/blog" className="inline-flex items-center gap-2 text-white/60 hover:text-white transition-colors text-sm font-semibold uppercase tracking-widest mb-6">
              <ArrowLeft className="w-4 h-4" /> Blog
            </Link>
            <div className="flex flex-wrap items-center gap-3 mb-4">
              <span className="inline-flex items-center gap-1.5 bg-primary/90 text-white text-xs font-bold uppercase tracking-widest px-3 py-1.5">
                <Tag className="w-3 h-3" /> {post.category}
              </span>
              <span className="inline-flex items-center gap-1.5 text-white/60 text-sm">
                <Calendar className="w-3.5 h-3.5" />
                {new Date(post.date).toLocaleDateString("sl-SI", { year: "numeric", month: "long", day: "numeric" })}
              </span>
            </div>
            <h1 className="text-4xl md:text-5xl lg:text-6xl text-white leading-tight">{post.title}</h1>
          </motion.div>
        </div>
      </section>

      {/* ARTICLE BODY */}
      <section className="py-16">
        <div className="container mx-auto px-6 md:px-12">
          <div className="grid lg:grid-cols-[1fr_320px] gap-8 md:gap-16">

            {/* Main content */}
            <div>
              <motion.div
                initial={{ opacity: 0, y: 24 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.7, delay: 0.1 }}
                className="article-content"
                dangerouslySetInnerHTML={{ __html: post.content }}
              />

              {/* FAQ Section */}
              {post.faq.length > 0 && (
                <motion.div
                  initial={{ opacity: 0, y: 24 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ duration: 0.6 }}
                  className="mt-16"
                >
                  <h2 className="text-3xl font-display mb-8 flex items-center gap-4">
                    <span className="w-10 h-[2px] bg-primary"></span>
                    Pogosta vprašanja
                  </h2>
                  <div className="space-y-4">
                    {post.faq.map((item, i) => (
                      <details key={i} className="group border border-border bg-card">
                        <summary className="flex items-start justify-between p-5 md:p-6 cursor-pointer list-none gap-4">
                          <span className="font-bold text-foreground text-base md:text-lg leading-snug">{item.q}</span>
                          <ChevronRight className="w-5 h-5 shrink-0 text-primary mt-0.5 transition-transform group-open:rotate-90" />
                        </summary>
                        <div className="px-6 pb-6 text-muted-foreground leading-relaxed border-t border-border pt-4">
                          {item.a}
                        </div>
                      </details>
                    ))}
                  </div>
                </motion.div>
              )}

              {/* CTA */}
              <motion.div
                initial={{ opacity: 0, y: 24 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.6 }}
                className="mt-16 bg-secondary text-white p-6 sm:p-10 md:p-14"
              >
                <h3 className="text-2xl md:text-3xl font-display mb-4">Potrebujete razlakiranje kovin?</h3>
                <p className="text-white/70 mb-8 max-w-xl">
                  URVIS Razlakiranje Kovin D.O.O. je vaš zanesljiv partner za industrijsko razlakiranje in stabilizacijo odpadne praškaste barve v Slovenji.
                </p>
                <div className="flex flex-wrap gap-4">
                  <Link href="/kontakt">
                    <Button className="bg-primary hover:bg-primary/90 text-white rounded-none h-14 px-8 text-sm uppercase tracking-widest transition-transform hover:scale-[1.02]">
                      Pošljite povpraševanje
                    </Button>
                  </Link>
                  <Link href="/tehnologije">
                    <Button variant="outline" className="border-white/30 text-white hover:bg-white/10 rounded-none h-14 px-8 text-sm uppercase tracking-widest bg-transparent">
                      Naše tehnologije
                    </Button>
                  </Link>
                </div>
              </motion.div>
            </div>

            {/* Sidebar */}
            <aside>
              <div className="sticky top-28 space-y-8">
                {/* Keywords */}
                <div className="bg-card border p-6">
                  <h4 className="text-sm font-bold uppercase tracking-widest mb-4 text-foreground">Ključne besede</h4>
                  <div className="flex flex-wrap gap-2">
                    {post.keywords.map(kw => (
                      <span key={kw} className="text-xs bg-muted px-3 py-1.5 text-muted-foreground border border-border">
                        {kw}
                      </span>
                    ))}
                  </div>
                </div>

                {/* Quick links */}
                <div className="bg-card border p-6">
                  <h4 className="text-sm font-bold uppercase tracking-widest mb-4 text-foreground">Naše storitve</h4>
                  <ul className="space-y-3">
                    {[
                      { href: "/razlakiranje", label: "Razlakiranje kovin" },
                      { href: "/tehnologije", label: "Naprava Dinamec & TD" },
                      { href: "/stabilizacija", label: "Stabilizacija odpadkov" },
                      { href: "/kontakt", label: "Pošljite povpraševanje" },
                    ].map(link => (
                      <li key={link.href}>
                        <Link href={link.href} className="flex items-center gap-2 text-sm text-muted-foreground hover:text-primary transition-colors group">
                          <ChevronRight className="w-3.5 h-3.5 text-primary group-hover:translate-x-0.5 transition-transform" />
                          {link.label}
                        </Link>
                      </li>
                    ))}
                  </ul>
                </div>

                {/* Recent posts */}
                <div>
                  <h4 className="text-sm font-bold uppercase tracking-widest mb-4 text-foreground flex items-center gap-3">
                    <span className="w-6 h-[2px] bg-primary"></span>
                    Drugi članki
                  </h4>
                  <div className="space-y-4">
                    {related.map(rp => (
                      <Link key={rp.slug} href={`/blog/${rp.slug}`}>
                        <div className="group flex gap-3 items-start py-3 border-b border-border hover:border-primary/50 transition-colors last:border-0">
                          <img src={rp.image} alt={rp.imageAlt} className="w-16 h-16 object-cover shrink-0" />
                          <div>
                            <p className="text-xs text-primary font-bold uppercase tracking-widest mb-1">{rp.category}</p>
                            <p className="text-sm font-semibold text-foreground group-hover:text-primary transition-colors leading-snug line-clamp-2">{rp.title}</p>
                          </div>
                        </div>
                      </Link>
                    ))}
                    <Link href="/blog" className="inline-flex items-center gap-2 text-sm font-bold uppercase tracking-widest text-foreground hover:text-primary transition-colors mt-2">
                      Vsi članki <ArrowRight className="w-4 h-4" />
                    </Link>
                  </div>
                </div>
              </div>
            </aside>

          </div>
        </div>
      </section>

    </div>
  );
}
