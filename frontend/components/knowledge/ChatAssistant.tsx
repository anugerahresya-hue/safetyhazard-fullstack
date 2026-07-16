"use client";

import { useEffect, useRef, useState } from "react";
import { Send, Bot, User, Sparkles, Lightbulb } from "lucide-react";
import { cn } from "@/lib/utils";
import { api } from "@/lib/api";

type ChatMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
};

interface ChatSource {
  section: string;
  category: string;
  excerpt: string;
}

interface ChatResponse {
  answer: string;
  sources?: ChatSource[];
}

// Riwayat percakapan contoh — mulai hanya dengan sapaan asisten
const INITIAL_MESSAGES: ChatMessage[] = [
  {
    id: "1",
    role: "assistant",
    content:
      "Hi! I'm the EHSS Safety Assistant. Ask me anything about workplace hazards, PPE requirements, or corrective actions based on our knowledge base.",
  },
];

// Pertanyaan yang disarankan (tampil saat pengguna belum bertanya)
const SUGGESTED_QUESTIONS = [
  "What PPE is required for welding?",
  "What are LOTO procedures?",
  "Chemical spill response steps?",
  "Hard hat requirements?",
];

export function ChatAssistant() {
  const [messages, setMessages] = useState<ChatMessage[]>(INITIAL_MESSAGES);
  const [input, setInput] = useState("");
  const [typing, setTyping] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Auto-scroll ke pesan terbaru
  useEffect(() => {
    scrollRef.current?.scrollTo({
      top: scrollRef.current.scrollHeight,
      behavior: "smooth",
    });
  }, [messages, typing]);

  const send = async (raw?: string) => {
    const text = (raw ?? input).trim();
    if (!text || typing) return;

    const userMsg: ChatMessage = {
      id: `u-${messages.length}-${text.length}`,
      role: "user",
      content: text,
    };
    setMessages((prev) => [...prev, userMsg]);
    setInput("");
    setTyping(true);

    // Tanya ke RAG lewat proxy backend (/knowledge/chat).
    const { data, ok } = await api.post<ChatResponse>("/knowledge/chat", {
      question: text,
    });

    const answer =
      ok && data?.answer
        ? data.answer
        : "Sorry, I couldn't reach the knowledge base right now. Please try again in a moment.";

    // Lampirkan sumber bila ada. RAG mengembalikan {section, category, excerpt};
    // tampilkan "section (category)" dan buang duplikat.
    const sources = Array.from(
      new Set(
        (data?.sources ?? [])
          .map((s) =>
            s.category ? `${s.section} (${s.category})` : s.section
          )
          .filter(Boolean)
      )
    );
    const content =
      sources.length > 0
        ? `${answer}\n\nSources: ${sources.join(", ")}`
        : answer;

    setMessages((prev) => [
      ...prev,
      { id: `a-${prev.length}`, role: "assistant", content },
    ]);
    setTyping(false);
  };

  // Klik kartu saran → langsung kirim seolah diketik pengguna.
  const askSuggestion = (question: string) => {
    setInput(question);
    send(question);
  };

  // Chat dianggap "kosong" bila pengguna belum bertanya (hanya sapaan asisten).
  const hasUserAsked = messages.some((m) => m.role === "user");

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  };

  return (
    <div className="flex h-full flex-col overflow-hidden rounded-xl border border-border bg-card">
      {/* Header */}
      <div className="flex items-center gap-3 border-b border-border px-5 py-4">
        <span className="flex size-10 items-center justify-center rounded-full bg-brand/10 text-brand">
          <Bot className="size-5" strokeWidth={1.75} />
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="text-base font-semibold text-foreground">
            EHSS AI Assistant
          </h2>
          <p className="flex items-center gap-1.5 text-xs text-muted">
            <span className="size-1.5 rounded-full bg-emerald-500" />
            Powered by your knowledge base
          </p>
        </div>
        <Sparkles className="size-5 text-brand" strokeWidth={1.75} />
      </div>

      {/* Riwayat pesan (scrollable) */}
      <div
        ref={scrollRef}
        className="min-h-0 flex-1 space-y-4 overflow-y-auto px-5 py-5"
      >
        {messages.map((msg) => {
          const isUser = msg.role === "user";
          return (
            <div
              key={msg.id}
              className={cn(
                "flex items-start gap-3",
                isUser && "flex-row-reverse"
              )}
            >
              <span
                className={cn(
                  "flex size-8 shrink-0 items-center justify-center rounded-full",
                  isUser
                    ? "bg-brand text-white"
                    : "bg-foreground/5 text-foreground"
                )}
              >
                {isUser ? (
                  <User className="size-4" strokeWidth={1.75} />
                ) : (
                  <Bot className="size-4" strokeWidth={1.75} />
                )}
              </span>
              <div
                className={cn(
                  "max-w-[78%] whitespace-pre-wrap rounded-2xl px-4 py-2.5 text-sm leading-relaxed",
                  isUser
                    ? "rounded-tr-sm bg-brand text-white"
                    : "rounded-tl-sm bg-foreground/5 text-foreground"
                )}
              >
                {msg.content}
              </div>
            </div>
          );
        })}

        {/* Empty state — pertanyaan yang disarankan */}
        {!hasUserAsked && !typing && (
          <div className="pt-2">
            <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold text-foreground">
              <Lightbulb className="size-4 text-brand" />
              Suggested Questions:
            </h3>
            <div className="grid grid-cols-2 gap-4">
              {SUGGESTED_QUESTIONS.map((q) => (
                <button
                  key={q}
                  type="button"
                  onClick={() => askSuggestion(q)}
                  className="rounded-xl border border-border bg-card px-4 py-4 text-center text-sm font-medium text-foreground transition-colors hover:border-brand hover:text-brand"
                >
                  {q}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Indikator mengetik */}
        {typing && (
          <div className="flex items-start gap-3">
            <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-foreground/5 text-foreground">
              <Bot className="size-4" strokeWidth={1.75} />
            </span>
            <div className="flex items-center gap-1 rounded-2xl rounded-tl-sm bg-foreground/5 px-4 py-3">
              <span className="size-2 animate-bounce rounded-full bg-muted [animation-delay:-0.3s]" />
              <span className="size-2 animate-bounce rounded-full bg-muted [animation-delay:-0.15s]" />
              <span className="size-2 animate-bounce rounded-full bg-muted" />
            </div>
          </div>
        )}
      </div>

      {/* Input menempel di bawah */}
      <div className="border-t border-border p-3">
        <div className="flex items-end gap-2 rounded-xl border border-border bg-background p-2 focus-within:border-brand">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            rows={1}
            placeholder="Ask about safety procedures, hazards, PPE..."
            className="max-h-32 min-h-[40px] flex-1 resize-none bg-transparent px-2 py-2 text-sm text-foreground outline-none placeholder:text-muted/60"
          />
          <button
            onClick={() => send()}
            disabled={!input.trim()}
            aria-label="Send message"
            className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-brand text-white transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
          >
            <Send className="size-4.5" strokeWidth={2} />
          </button>
        </div>
      </div>
    </div>
  );
}
