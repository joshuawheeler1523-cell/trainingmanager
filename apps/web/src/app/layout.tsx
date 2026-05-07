import type { Metadata } from "next";
import { Toaster } from "sonner";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "Arbor", template: "%s — Arbor" },
  description: "Training operations and capacity intelligence for hospitals.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="h-full">
      <body className="bg-background text-foreground flex min-h-full flex-col antialiased">
        {children}
        <Toaster richColors closeButton position="top-right" />
      </body>
    </html>
  );
}
