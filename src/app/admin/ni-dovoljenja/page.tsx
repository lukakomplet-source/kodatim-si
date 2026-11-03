import AccessDenied from "@/components/AccessDenied";

/** Where zahtevajStran() (src/lib/require-admin.ts) sends a user who lacks the page's permission. */

export const metadata = { title: "Nimate dovoljenja" };

export default function NiDovoljenjaPage() {
  return <AccessDenied />;
}
