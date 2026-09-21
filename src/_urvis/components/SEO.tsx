import { Helmet } from 'react-helmet-async';

const SITE_NAME = 'URVIS Razlakiranje Kovin';
const BASE_URL = 'https://urvis.si';
const DEFAULT_OG_IMAGE = `${BASE_URL}/og-image.jpg`;

interface SEOProps {
  title: string;
  description: string;
  path: string;
  ogImage?: string;
  children?: React.ReactNode;
}

export function SEO({ title, description, path, ogImage = DEFAULT_OG_IMAGE, children }: SEOProps) {
  const fullTitle = `${title} | ${SITE_NAME}`;
  const canonicalUrl = `${BASE_URL}${path}`;

  return (
    <Helmet>
      <html lang="sl" />
      <title>{fullTitle}</title>
      <meta name="description" content={description} />
      <link rel="canonical" href={canonicalUrl} />

      {/* Open Graph */}
      <meta property="og:title" content={fullTitle} />
      <meta property="og:description" content={description} />
      <meta property="og:url" content={canonicalUrl} />
      <meta property="og:type" content="website" />
      <meta property="og:image" content={ogImage} />
      <meta property="og:image:width" content="1200" />
      <meta property="og:image:height" content="630" />
      <meta property="og:site_name" content={SITE_NAME} />
      <meta property="og:locale" content="sl_SI" />

      {/* Twitter / X */}
      <meta name="twitter:card" content="summary_large_image" />
      <meta name="twitter:title" content={fullTitle} />
      <meta name="twitter:description" content={description} />
      <meta name="twitter:image" content={ogImage} />

      {children}
    </Helmet>
  );
}
