import { NextResponse } from "next/server";

import { createClient } from "@/lib/supabase/server";

/**
 * OAuth (and magic-link) callback. Google redirects here with a `code` after
 * the user consents. We exchange that code for a session — which sets the auth
 * cookies via the server client — then send the user on to `next`.
 */
export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const next = searchParams.get("next") ?? "/protected";

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);

    if (!error) {
      const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? origin;
      return NextResponse.redirect(`${appUrl}${next}`);
    }

    return NextResponse.redirect(
      `${origin}/auth/error?error=${encodeURIComponent(error.message)}`,
    );
  }

  return NextResponse.redirect(
    `${origin}/auth/error?error=${encodeURIComponent(
      "No authentication code was provided in the callback.",
    )}`,
  );
}
