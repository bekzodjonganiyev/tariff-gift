import { SiteHeader } from "@/components/site-header";

export default function ProtectedLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <main className="flex min-h-screen flex-col">
      <SiteHeader />
      <div className="mx-auto w-full max-w-5xl flex-1 px-5 py-10">
        {children}
      </div>
    </main>
  );
}
