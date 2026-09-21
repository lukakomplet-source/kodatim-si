import { motion } from "framer-motion";
import { Link } from "wouter";
import { ArrowRight, Calendar, Tag } from "lucide-react";
import { useSEO } from "@urvis/hooks/useSEO";
import { BLOG_POSTS } from "@urvis/data/blog";

export default function BlogIndex() {
  useSEO({
    title: "Blog | URVIS Razlakiranje Kovin — Strokovni članki",
    description: "Strokovni članki o razlakiranju kovin, piroliznem razlakiranju, čiščenju obešal in ekološki obdelavi kovin. Nasveti in vodniki za industrijo.",
    canonical: `${(typeof window !== 'undefined' ? window.location.origin : 'https://kodatim.si/urvis')}/blog`,
    ogTitle: "URVIS Blog — Razlakiranje kovin: strokovni članki",
    ogDescription: "Odkrijte strokovne članke o razlakiranju kovin, pirolizi, čiščenju obešal in ekološki industrijski obdelavi kovin.",
  });

  const featured = BLOG_POSTS[0];
  const rest = BLOG_POSTS.slice(1);

  return (
    <div className="flex flex-col min-h-screen bg-background">

      {/* HERO */}
      <section className="relative min-h-[38vh] flex items-center justify-center pt-28 pb-12 bg-secondary text-white text-center w-full">
        <div className="container mx-auto px-6">
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6 }}>
            <div className="flex items-center justify-center gap-2 mb-4">
              <span className="w-8 h-[2px] bg-primary"></span>
              <span className="text-primary text-sm font-bold uppercase tracking-widest">Strokovni Prispevki</span>
              <span className="w-8 h-[2px] bg-primary"></span>
            </div>
            <h1 className="text-4xl sm:text-5xl md:text-7xl mb-6">BLOG</h1>
            <p className="text-white/70 text-lg md:text-xl font-medium max-w-2xl mx-auto">
              Strokovna znanja o razlakiranju kovin, industrijskih postopkih in ekološki obdelavi kovin.
            </p>
          </motion.div>
        </div>
      </section>

      <section className="py-14 md:py-24">
        <div className="container mx-auto px-6 md:px-12">

          {/* Featured Post */}
          <motion.div
            initial={{ opacity: 0, y: 24 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.7 }}
            className="mb-12 md:mb-20"
          >
            <p className="text-sm font-bold text-primary uppercase tracking-widest mb-6 flex items-center gap-3">
              <span className="w-8 h-[2px] bg-primary"></span>
              Izpostavljeno
            </p>
            <Link href={`/blog/${featured.slug}`}>
              <div className="group grid lg:grid-cols-2 gap-0 border hover:border-primary/50 transition-colors overflow-hidden">
                <div className="overflow-hidden">
                  <img
                    src={featured.image}
                    alt={featured.imageAlt}
                    className="w-full h-full min-h-[300px] object-cover group-hover:scale-105 transition-transform duration-700"
                  />
                </div>
                <div className="bg-card p-6 sm:p-10 md:p-14 flex flex-col justify-center">
                  <div className="flex items-center gap-3 mb-4">
                    <span className="inline-flex items-center gap-1.5 text-xs font-bold uppercase tracking-widest text-primary">
                      <Tag className="w-3 h-3" /> {featured.category}
                    </span>
                    <span className="text-muted-foreground/50">·</span>
                    <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
                      <Calendar className="w-3 h-3" />
                      {new Date(featured.date).toLocaleDateString("sl-SI", { year: "numeric", month: "long", day: "numeric" })}
                    </span>
                  </div>
                  <h2 className="text-3xl md:text-4xl font-display text-foreground group-hover:text-primary transition-colors mb-4 leading-tight">
                    {featured.title}
                  </h2>
                  <p className="text-muted-foreground mb-8 leading-relaxed">{featured.description}</p>
                  <div className="inline-flex items-center text-sm font-bold uppercase tracking-widest text-foreground group-hover:text-primary transition-colors">
                    Preberi več <ArrowRight className="w-4 h-4 ml-2 group-hover:translate-x-1 transition-transform" />
                  </div>
                </div>
              </div>
            </Link>
          </motion.div>

          {/* Grid of remaining posts */}
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8">
            {rest.map((post, i) => (
              <motion.div
                key={post.slug}
                initial={{ opacity: 0, y: 24 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: "-50px" }}
                transition={{ delay: i * 0.05, duration: 0.6 }}
              >
                <Link href={`/blog/${post.slug}`}>
                  <article className="group border hover:border-primary/50 transition-colors overflow-hidden h-full flex flex-col">
                    <div className="overflow-hidden aspect-[16/9]">
                      <img
                        src={post.image}
                        alt={post.imageAlt}
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-700"
                      />
                    </div>
                    <div className="p-6 flex flex-col flex-grow bg-card">
                      <div className="flex items-center gap-3 mb-3">
                        <span className="inline-flex items-center gap-1.5 text-xs font-bold uppercase tracking-widest text-primary">
                          <Tag className="w-3 h-3" /> {post.category}
                        </span>
                        <span className="text-muted-foreground/50">·</span>
                        <span className="text-xs text-muted-foreground">
                          {new Date(post.date).toLocaleDateString("sl-SI", { day: "numeric", month: "short", year: "numeric" })}
                        </span>
                      </div>
                      <h2 className="text-xl font-display text-foreground group-hover:text-primary transition-colors mb-3 leading-snug flex-grow">
                        {post.title}
                      </h2>
                      <p className="text-muted-foreground text-sm mb-6 line-clamp-2">{post.description}</p>
                      <div className="inline-flex items-center text-sm font-bold uppercase tracking-widest text-foreground group-hover:text-primary transition-colors mt-auto">
                        Preberi več <ArrowRight className="w-4 h-4 ml-2 group-hover:translate-x-1 transition-transform" />
                      </div>
                    </div>
                  </article>
                </Link>
              </motion.div>
            ))}
          </div>

        </div>
      </section>

    </div>
  );
}
