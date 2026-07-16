import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

/**
 * Menggabungkan class Tailwind dengan aman (dedup + resolusi konflik).
 * Dipakai di seluruh komponen UI SafetyHazard.
 */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
