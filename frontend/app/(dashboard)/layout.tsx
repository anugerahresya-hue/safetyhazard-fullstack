import { Sidebar } from "@/components/layout/Sidebar";
import { getActiveRole } from "@/lib/session";

/**
 * Layout aplikasi terproteksi: Sidebar permanen di kiri, konten di kanan.
 *
 * Peran aktif dibaca dari sesi Supabase (metadata pengguna).
 * `proxy.ts` sudah memastikan sesi valid sebelum layout ini dirender.
 */
export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const role = await getActiveRole();

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      <Sidebar role={role} />
      <main className="flex-1 overflow-y-auto">
        <div className="mx-auto max-w-7xl px-6 py-6">{children}</div>
      </main>
    </div>
  );
}
