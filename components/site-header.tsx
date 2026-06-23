import Link from "next/link";
import { Gift } from "lucide-react";

import { createClient } from "@/lib/supabase/server";
import { hasEnvVars } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { LogoutButton } from "@/components/logout-button";
import { EnvVarWarning } from "@/components/env-var-warning";
import { ThemeSwitcher } from "@/components/theme-switcher";

/**
 * Shared top navigation. Server Component — reads the verified JWT once to
 * decide which links to show (My gifts when signed in, Admin when the JWT
 * carries `app_metadata.role === 'admin'`).
 */
export async function SiteHeader() {
  let email: string | null = null;
  let isAdmin = false;

  if (hasEnvVars) {
    const supabase = await createClient();
    const { data } = await supabase.auth.getClaims();
    const claims = data?.claims;
    email = (claims?.email as string | undefined) ?? null;
    isAdmin =
      (claims?.app_metadata as { role?: string } | undefined)?.role === "admin";
  }

  return (
    <nav className="sticky top-0 z-40 w-full border-b border-border/60 bg-background/80 backdrop-blur">
      <div className="mx-auto flex h-16 w-full max-w-6xl items-center justify-between gap-4 px-5">
        <div className="flex items-center gap-6">
          <Link href="/" className="flex items-center gap-2 font-semibold">
            <span className="grid size-8 place-items-center rounded-lg bg-primary text-primary-foreground">
              <Gift className="size-4" />
            </span>
            <span>GiftTariffs</span>
          </Link>
          <div className="hidden items-center gap-1 text-sm text-muted-foreground sm:flex">
            <Link
              href="/"
              className="rounded-md px-3 py-1.5 transition-colors hover:bg-accent hover:text-foreground"
            >
              Tariffs
            </Link>
            {email && (
              <Link
                href="/protected"
                className="rounded-md px-3 py-1.5 transition-colors hover:bg-accent hover:text-foreground"
              >
                My gifts
              </Link>
            )}
            {isAdmin && (
              <Link
                href="/admin"
                className="rounded-md px-3 py-1.5 transition-colors hover:bg-accent hover:text-foreground"
              >
                Admin
              </Link>
            )}
          </div>
        </div>

        <div className="flex items-center gap-3">
          <ThemeSwitcher />
          {!hasEnvVars ? (
            <EnvVarWarning />
          ) : email ? (
            <div className="flex items-center gap-3">
              <span className="hidden text-sm text-muted-foreground md:inline">
                {email}
              </span>
              <LogoutButton />
            </div>
          ) : (
            <div className="flex gap-2">
              <Button asChild size="sm" variant="outline">
                <Link href="/auth/login">Sign in</Link>
              </Button>
              <Button asChild size="sm">
                <Link href="/auth/sign-up">Sign up</Link>
              </Button>
            </div>
          )}
        </div>
      </div>
    </nav>
  );
}
