import { DocumentPanel } from "@/components/knowledge/DocumentPanel";
import { ChatAssistant } from "@/components/knowledge/ChatAssistant";
import { EhssPageHeader } from "@/components/knowledge/EhssPageHeader";
import { getActiveRole } from "@/lib/session";

export default async function EhssKnowledgePage() {
  // Peran aktif dibaca dari sesi Supabase (metadata pengguna).
  const role = await getActiveRole();

  return (
    <div className="flex h-[calc(100vh-3rem)] flex-col gap-6">
      {/* Judul halaman */}
      <EhssPageHeader />

      {/*
        Layout tetap 3 kolom untuk semua peran: panel dokumen di kiri
        (upload khusus Admin, daftar dokumen terlihat oleh semua), chat di kanan.
      */}
      <div className="grid min-h-0 flex-1 grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="lg:col-span-1 min-h-0">
          <DocumentPanel role={role} />
        </div>

        <div className="lg:col-span-2 min-h-0">
          <ChatAssistant />
        </div>
      </div>
    </div>
  );
}
