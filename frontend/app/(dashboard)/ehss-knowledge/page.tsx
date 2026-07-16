import { BookOpen } from "lucide-react";
import { DocumentPanel } from "@/components/knowledge/DocumentPanel";
import { ChatAssistant } from "@/components/knowledge/ChatAssistant";
import { getActiveRole } from "@/lib/session";

export default async function EhssKnowledgePage() {
  // Peran aktif dibaca dari sesi Supabase (metadata pengguna).
  const role = await getActiveRole();

  return (
    <div className="flex h-full flex-col gap-6">
      {/* Judul halaman */}
      <div className="flex items-center gap-3">
        <span className="flex size-11 items-center justify-center rounded-xl bg-brand/10 text-brand">
          <BookOpen className="size-6" strokeWidth={1.75} />
        </span>
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">
            EHSS Knowledge
          </h1>
          <p className="text-sm text-muted">
            Search safety documentation and ask the AI assistant
          </p>
        </div>
      </div>

      {/*
        Layout tetap 3 kolom untuk semua peran: panel dokumen di kiri
        (upload khusus Admin, daftar dokumen terlihat oleh semua), chat di kanan.
      */}
      <div className="grid min-h-0 flex-1 grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="lg:col-span-1">
          <DocumentPanel role={role} />
        </div>

        <div className="lg:col-span-2">
          <ChatAssistant />
        </div>
      </div>
    </div>
  );
}
