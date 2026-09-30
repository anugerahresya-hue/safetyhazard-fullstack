"use client";

import { Globe } from "lucide-react";
import { useLang } from "@/contexts/LanguageContext";
import { cn } from "@/lib/utils";

export function DashboardHeader() {
  const { lang, toggleLang } = useLang();

  return (
    <div className="mb-6 flex items-center justify-end">
      <div className="relative flex items-center gap-1 rounded-full border border-gray-200 bg-white p-1 dark:border-slate-700 dark:bg-slate-800">
        {/* Sliding background indicator */}
        <div
          className={cn(
            "absolute h-[calc(100%-8px)] w-[calc(50%-4px)] rounded-full bg-red-600 transition-all duration-300 ease-in-out dark:bg-red-500",
            lang === "en" ? "left-1" : "left-[calc(50%+2px)]"
          )}
        />
        
        <button
          onClick={toggleLang}
          className={cn(
            "relative z-10 flex items-center gap-1 rounded-full px-3 py-1 text-xs font-semibold transition-colors duration-300",
            lang === "en" ? "text-white" : "text-gray-600 dark:text-gray-400"
          )}
        >
          <Globe size={13} />
          EN
        </button>
        
        <button
          onClick={toggleLang}
          className={cn(
            "relative z-10 flex items-center gap-1 rounded-full px-3 py-1 text-xs font-semibold transition-colors duration-300",
            lang === "id" ? "text-white" : "text-gray-600 dark:text-gray-400"
          )}
        >
          <Globe size={13} />
          ID
        </button>
      </div>
    </div>
  );
}
