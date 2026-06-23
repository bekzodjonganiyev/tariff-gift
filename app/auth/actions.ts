"use server";

import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";

/**
 * Server Action: start the Google OAuth flow.
 *
 * Runs the PKCE flow server-side — `signInWithOAuth` returns the Google
 * consent-screen URL in `data.url`, and we `redirect()` the browser to it.
 * Google then sends the user back to `/auth/callback`, which exchanges the
 * code for a session (see app/auth/callback/route.ts).
 */
export async function signInWithGoogle(formData?: FormData) {
  const next = (formData?.get("next") as string | null) ?? "/protected";

  const supabase = await createClient();
  const origin = process.env.NEXT_PUBLIC_APP_URL!;

  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: {
      redirectTo: `${origin}/auth/callback?next=${encodeURIComponent(next)}`,
      // Ask Google for a refresh token so the session can be renewed offline.
      queryParams: {
        access_type: "offline",
        prompt: "consent",
      }
    },
  });

  if (error) {
    redirect(`/auth/error?error=${encodeURIComponent(error.message)}`);
  }

  // `redirect()` throws to interrupt execution, so this is the happy path.
  if (data.url) {
    redirect(data.url);
  }
}
