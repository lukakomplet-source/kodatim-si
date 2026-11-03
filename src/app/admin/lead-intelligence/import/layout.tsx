import { zahtevajStran } from "@/lib/require-admin";

/**
 * page.tsx here is a Client Component and cannot check on the server, so the
 * permission check sits in this layout. It guards only the import page (no
 * sibling routes share it), so partial rendering cannot skip it.
 */
export default async function ImportLayout({ children }: { children: React.ReactNode }) {
  await zahtevajStran("lead_intelligence.create");
  return children;
}
