import { redirect } from "next/navigation";

/**
 * Root: arahkan ke area aplikasi. Proxy (`proxy.ts`) yang memutuskan akhir —
 * bila belum ada sesi, /dashboard akan dialihkan ke /login.
 */
export default function Home() {
  redirect("/dashboard");
}
