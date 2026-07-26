import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";

const PROTECTED_PREFIXES = ["/admin", "/partner"];

function isSupabaseConfigured() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  return !!url && (url.startsWith("http://") || url.startsWith("https://"));
}

function matchesProtectedPrefix(pathname: string, prefix: string) {
  return pathname === prefix || pathname.startsWith(`${prefix}/`);
}

function withReferralCookie(
  request: NextRequest,
  response: NextResponse
): NextResponse {
  const ref = request.nextUrl.searchParams.get("ref");
  if (ref) {
    response.cookies.set("kt_ref", ref, {
      maxAge: 60 * 60 * 24 * 90,
      path: "/",
      sameSite: "lax",
    });
  }
  return response;
}

export async function proxy(request: NextRequest) {
  const pathname = request.nextUrl.pathname;
  const isProtected = PROTECTED_PREFIXES.some((prefix) =>
    matchesProtectedPrefix(pathname, prefix)
  );

  if (!isSupabaseConfigured()) {
    // Supabase isn't set up yet — let the public site keep working, and
    // send protected routes to login instead of crashing the whole app.
    if (isProtected) {
      const url = request.nextUrl.clone();
      url.pathname = "/prijava";
      url.searchParams.set("redirect", pathname);
      return NextResponse.redirect(url);
    }
    return withReferralCookie(request, NextResponse.next({ request }));
  }

  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          );
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (isProtected && !user) {
    const url = request.nextUrl.clone();
    url.pathname = "/prijava";
    url.searchParams.set("redirect", pathname);
    return NextResponse.redirect(url);
  }

  return withReferralCookie(request, response);
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
