import type { ReactNode } from "react";

export const metadata = {
  title: "DS Product Discovery",
  description: "Foundation skeleton (Spec 001).",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
