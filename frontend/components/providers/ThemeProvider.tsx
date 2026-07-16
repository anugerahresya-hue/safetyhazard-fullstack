"use client";

import { ThemeProvider as NextThemesProvider } from "next-themes";
import type { ComponentProps } from "react";

/**
 * Provider tema (Light/Dark) berbasis class untuk seluruh aplikasi.
 * Dibungkus di root layout. `attribute="class"` menaruh `.dark` di <html>.
 */
export function ThemeProvider({
  children,
  ...props
}: ComponentProps<typeof NextThemesProvider>) {
  return (
    <NextThemesProvider
      attribute="class"
      defaultTheme="light"
      enableSystem={false}
      disableTransitionOnChange
      {...props}
    >
      {children}
    </NextThemesProvider>
  );
}
