import type { ReactNode } from "react";
import { APP_NAME } from "@ds/shared";
import "./globals.css";

export const metadata = {
  title: "DS Product Discovery",
  description: "Fast product search and discovery.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  // Falls back to the shared constant if the env var is absent.
  const name = process.env.NEXT_PUBLIC_APP_NAME ?? APP_NAME;

  return (
    <html lang="en">
      <body className="min-h-screen bg-background text-foreground antialiased">
        {/* Minimal shell: a single centered wordmark. No sidebar, no topbar. */}
        <header className="border-b border-border" aria-label={name}>
          <div className="flex items-center justify-center h-16">
            <span className="text-lg font-semibold tracking-tight text-mono">
              {name}
            </span>
          </div>
        </header>
        {children}
      </body>
    </html>
  );
}
