import type { Metadata } from "next";
import { Geist, JetBrains_Mono, Source_Serif_4 } from "next/font/google";
import { Toaster } from "sonner";
import CookieBanner from "@/components/legal/cookie-banner";
import "./globals.css";

// Editorial display face: H1/H2/H3/H4, card titles, stat numbers.
const sourceSerif = Source_Serif_4({
  subsets: ["latin"],
  variable: "--font-display",
  weight: ["400", "500", "600"],
  style: ["normal", "italic"],
  display: "swap",
});

// UI face: body, buttons, form fields, navigation.
const geist = Geist({
  subsets: ["latin"],
  variable: "--font-ui",
  weight: ["400", "500", "600"],
  display: "swap",
});

// Mono face: eyebrows, kicker labels, status pills, metadata.
const jetbrains = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-mono",
  weight: ["400", "500"],
  display: "swap",
});

export const metadata: Metadata = {
  title: { default: "Arbor", template: "%s — Arbor" },
  description: "Training operations and capacity intelligence for hospitals.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="en"
      className={`${sourceSerif.variable} ${geist.variable} ${jetbrains.variable} h-full`}
    >
      <head>
        {/* Set the theme before first paint from the arbor_theme cookie so
            there's no flash of the default palette. Tiny + synchronous; the
            default (editorial) needs no attribute. */}
        <script
          dangerouslySetInnerHTML={{
            __html:
              "(function(){try{var m=document.cookie.match(/(?:^|; )arbor_theme=([^;]+)/);var t=m?decodeURIComponent(m[1]):'editorial';if(t&&t!=='editorial'){document.documentElement.setAttribute('data-theme',t);}}catch(e){}})();",
          }}
        />
      </head>
      <body className="bg-background text-foreground flex min-h-full flex-col antialiased">
        {children}
        <Toaster richColors closeButton position="top-right" />
        <CookieBanner />
      </body>
    </html>
  );
}
