'use client';

import dynamic from 'next/dynamic';

/**
 * wouter (this app's own router) and a couple of its libs (i18next
 * language detection) reach for browser-only globals at module load, which
 * doesn't exist during Next's SSR pass. Rather than SSR-proofing an app that
 * was never meant to run on a server, this whole tree is loaded client-only.
 */
const UrvisApp = dynamic(() => import('@urvis/UrvisApp'), { ssr: false });

export default function UrvisClientEntry() {
  return <UrvisApp />;
}
