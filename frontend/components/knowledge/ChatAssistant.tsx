"use client";

import { useEffect, useRef, useState } from "react";
import {
  Send,
  Bot,
  User,
  Sparkles,
  HardHat,
  Siren,
  FlaskConical,
  Settings2,
  Zap,
  Flame,
  ArrowDownToLine,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { api } from "@/lib/api";
import { ChipButton } from "./ChipButton";
import { useLang } from "@/contexts/LanguageContext";

interface ChatOption {
  label: string;
  value: string;
  type: "CATEGORY" | "QUESTION" | "NAVIGATION";
  icon?: React.ReactNode;
}

interface ChatSource {
  section: string;
  category: string;
  excerpt: string;
}

type ChatMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  options?: ChatOption[];
  sources?: ChatSource[];
};

interface ChatResponse {
  answer: string;
  sources?: ChatSource[];
}

// Category definitions with icons (internal keys only - labels come from translations)
const CATEGORY_KEYS = [
  "PPE",
  "Housekeeping",
  "Emergency",
  "Chemical Safety",
  "Machine Safety",
  "Electrical Safety",
  "Fire Safety",
  "Fall Protection",
] as const;

const CATEGORY_ICONS: Record<string, React.ReactNode> = {
  PPE: <HardHat className="size-3.5" />,
  Housekeeping: <Sparkles className="size-3.5" />,
  Emergency: <Siren className="size-3.5" />,
  "Chemical Safety": <FlaskConical className="size-3.5" />,
  "Machine Safety": <Settings2 className="size-3.5" />,
  "Electrical Safety": <Zap className="size-3.5" />,
  "Fire Safety": <Flame className="size-3.5" />,
  "Fall Protection": <ArrowDownToLine className="size-3.5" />,
};

export function ChatAssistant() {
  const { lang, t } = useLang();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [typing, setTyping] = useState(false);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Generate welcome message based on current language
  const getWelcomeMessage = (): ChatMessage => ({
    id: "welcome",
    role: "assistant",
    content: t.ehss.welcome_message,
    options: CATEGORY_KEYS.map((key) => ({
      label: t.ehss.categories[key],
      value: key,
      type: "CATEGORY" as const,
      icon: CATEGORY_ICONS[key],
    })),
  });

  // Initialize with welcome message
  useEffect(() => {
    setMessages([getWelcomeMessage()]);
  }, [lang]);

  // Auto-scroll ke pesan terbaru
  useEffect(() => {
    scrollRef.current?.scrollTo({
      top: scrollRef.current.scrollHeight,
      behavior: "smooth",
    });
  }, [messages, typing]);

  // Handle chip button clicks
  const handleOptionClick = (option: ChatOption) => {
    if (option.type === "CATEGORY") {
      // Show submenu with suggested questions
      const categoryKey = option.value;
      const translatedQuestions = t.ehss.questions[categoryKey as keyof typeof t.ehss.questions];
      
      if (!translatedQuestions) return;

      const userMsg: ChatMessage = {
        id: `u-${Date.now()}`,
        role: "user",
        content: option.label, // Display the translated category label
      };

      const submenuOptions: ChatOption[] = [
        ...translatedQuestions.map((q) => ({
          label: q,
          value: q,
          type: "QUESTION" as const,
        })),
        {
          label: t.ehss.back_to_menu,
          value: "MAIN_MENU",
          type: "NAVIGATION" as const,
        },
      ];

      const assistantMsg: ChatMessage = {
        id: `a-${Date.now()}`,
        role: "assistant",
        content: `${t.ehss.submenu_intro} ${option.label}:`,
        options: submenuOptions,
      };

      setMessages((prev) => [...prev, userMsg, assistantMsg]);
    } else if (option.type === "QUESTION") {
      // Send question to RAG API (in the user's selected language)
      sendToRAG(option.label);
    } else if (option.type === "NAVIGATION") {
      if (option.value === "MAIN_MENU") {
        // Reset to welcome state
        setMessages([getWelcomeMessage()]);
      } else if (option.value === "SEARCH") {
        // Focus the input field
        inputRef.current?.focus();
      }
    }
  };

  // Send question to RAG API
  const sendToRAG = async (question: string) => {
    const userMsg: ChatMessage = {
      id: `u-${Date.now()}`,
      role: "user",
      content: question,
    };
    setMessages((prev) => [...prev, userMsg]);
    setInput("");
    setTyping(true);

    // Tanya ke RAG lewat proxy backend (/knowledge/chat).
    const { data, ok } = await api.post<ChatResponse>("/knowledge/chat", {
      question,
    });

    const answer =
      ok && data?.answer
        ? data.answer
        : "Sorry, I couldn't reach the knowledge base right now. Please try again in a moment.";

    // Post-answer navigation options (translated)
    const postAnswerOptions: ChatOption[] = [
      {
        label: t.ehss.search_other,
        value: "SEARCH",
        type: "NAVIGATION",
      },
      {
        label: t.ehss.back_to_menu,
        value: "MAIN_MENU",
        type: "NAVIGATION",
      },
    ];

    const assistantMsg: ChatMessage = {
      id: `a-${Date.now()}`,
      role: "assistant",
      content: answer,
      sources: data?.sources,
      options: postAnswerOptions,
    };

    setMessages((prev) => [...prev, assistantMsg]);
    setTyping(false);
  };

  // Handle text input submission
  const send = async () => {
    const text = input.trim();
    if (!text || typing) return;
    sendToRAG(text);
  };

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
            {t.ehss.chatbot_title}
          </h2>
          <p className="flex items-center gap-1.5 text-xs text-muted">
            <span className="size-1.5 rounded-full bg-emerald-500" />
            {t.ehss.chatbot_subtitle}
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
            <div key={msg.id} className="space-y-3">
              <div
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

              {/* Options (chips) below assistant messages */}
              {!isUser && msg.options && msg.options.length > 0 && (
                <div className="ml-11 flex flex-wrap gap-2">
                  {msg.options.map((option, idx) => (
                    <ChipButton
                      key={`${msg.id}-opt-${idx}`}
                      label={option.label}
                      icon={option.icon}
                      onClick={() => handleOptionClick(option)}
                      variant={
                        option.type === "NAVIGATION" ? "navigation" : "default"
                      }
                    />
                  ))}
                </div>
              )}

              {/* Sources below options */}
              {!isUser && msg.sources && msg.sources.length > 0 && (
                <div className="ml-11 text-xs text-muted">
                  <details className="cursor-pointer">
                    <summary className="font-medium">
                      {t.ehss.sources_title} ({msg.sources.length})
                    </summary>
                    <ul className="mt-2 space-y-1 pl-4">
                      {msg.sources.map((source, idx) => (
                        <li key={idx}>
                          {source.section}
                          {source.category && ` (${source.category})`}
                        </li>
                      ))}
                    </ul>
                  </details>
                </div>
              )}
            </div>
          );
        })}

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
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            rows={1}
            placeholder={t.ehss.input_placeholder}
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
