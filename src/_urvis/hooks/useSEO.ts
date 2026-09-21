import { useEffect } from 'react';

interface SEOProps {
  title: string;
  description: string;
  ogTitle?: string;
  ogDescription?: string;
  ogImage?: string;
  canonical?: string;
  schema?: object;
}

function setMeta(nameOrProp: string, content: string, isProperty = false) {
  const attr = isProperty ? 'property' : 'name';
  let el = document.querySelector(`meta[${attr}="${nameOrProp}"]`) as HTMLMetaElement | null;
  if (!el) {
    el = document.createElement('meta');
    el.setAttribute(attr, nameOrProp);
    document.head.appendChild(el);
  }
  el.content = content;
}

function setLink(rel: string, href: string) {
  let el = document.querySelector(`link[rel="${rel}"]`) as HTMLLinkElement | null;
  if (!el) {
    el = document.createElement('link');
    el.rel = rel;
    document.head.appendChild(el);
  }
  (el as HTMLLinkElement).href = href;
}

export function useSEO({ title, description, ogTitle, ogDescription, ogImage, canonical, schema }: SEOProps) {
  useEffect(() => {
    document.title = title;
    setMeta('description', description);
    setMeta('og:title', ogTitle || title, true);
    setMeta('og:description', ogDescription || description, true);
    setMeta('og:type', 'website', true);
    setMeta('og:locale', document.documentElement.lang || 'sl_SI', true);
    if (ogImage) setMeta('og:image', ogImage, true);
    if (canonical) setLink('canonical', canonical);

    if (schema) {
      const old = document.querySelector('script#schema-jsonld');
      if (old) old.remove();
      const s = document.createElement('script');
      s.id = 'schema-jsonld';
      s.type = 'application/ld+json';
      s.textContent = JSON.stringify(schema);
      document.head.appendChild(s);
      return () => { document.querySelector('script#schema-jsonld')?.remove(); };
    }
    return undefined;
  }, [title, description, ogTitle, ogDescription, ogImage, canonical]);
}
