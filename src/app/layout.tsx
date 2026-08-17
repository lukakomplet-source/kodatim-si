import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { KlepetSprememb } from "@/components/KlepetSprememb";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "KodaTim.si — Vaš projekt. Naša ekipa. Vaš dobiček.",
  description:
    "KodaTim.si je AI razvojna agencija, ki vaše ideje spremeni v delujoče digitalne rešitve. 2 meseca brezplačnega razvoja, plačilo šele ko deluje.",
};

const organizationJsonLd = {
  "@context": "https://schema.org",
  "@type": "Organization",
  name: "KodaTim.si",
  legalName: "Kompletko d.o.o.",
  url: "https://kodatim.si",
  email: "info@kodatim.si",
  telephone: "+38640199051",
  taxID: "SI97304999",
  address: {
    "@type": "PostalAddress",
    streetAddress: "Parmova ulica 4",
    postalCode: "3212",
    addressLocality: "Vojnik",
    addressCountry: "SI",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="sl"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col bg-[#fbfbfd] text-zinc-900">
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(organizationJsonLd) }}
        />
        {children}
        {/*
          The change chat, on every page. It asks once who is signed in and
          renders nothing for a visitor, so putting it here costs an anonymous
          reader one small request and nothing else — and a request to fix
          something is worth most on the page where it was noticed.
        */}
        <KlepetSprememb />
      </body>
    </html>
  );
}
