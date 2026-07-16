import type { Config } from "tailwindcss";

/**
 * Konfigurasi Tailwind untuk EHSS SafetyHazard.
 *
 * Catatan: proyek ini memakai Tailwind CSS v4 (CSS-first). Sebagian besar token
 * tema didefinisikan lewat `@theme` di `app/globals.css`. File ini di-load ulang
 * via directive `@config` untuk mengaktifkan dark mode berbasis class (next-themes)
 * dan mendaftarkan warna aksen korporat agar utility seperti `bg-brand` tersedia.
 */
const config: Config = {
  darkMode: "class",
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
    "./hooks/**/*.{ts,tsx}",
    "./lib/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        // Merah Korporat SafetyHazard
        brand: {
          DEFAULT: "#C8102E",
          50: "#FDF2F4",
          100: "#FBE3E7",
          200: "#F5BFC8",
          300: "#EE97A6",
          400: "#E15A72",
          500: "#C8102E",
          600: "#B10E29",
          700: "#920B21",
          800: "#74091A",
          900: "#560713",
        },
      },
    },
  },
};

export default config;
