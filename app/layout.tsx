import type { Metadata, Viewport } from "next";
import { Figtree, Gloock } from "next/font/google";
import { ClientBoot } from "@/components/ClientBoot";
import { LOOK_BOOT_SCRIPT, THEME_COLOR } from "@/lib/look";
import "./globals.css";

const display = Gloock({
  weight: "400",
  subsets: ["latin"],
  variable: "--font-gloock",
  display: "swap",
});

const sans = Figtree({
  weight: ["400", "600", "700"],
  subsets: ["latin"],
  variable: "--font-figtree",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Basket",
  description: "Family meal planning and grocery ordering.",
  icons: { apple: "/icons/apple-touch-icon.png" },
  appleWebApp: { capable: true, title: "Basket", statusBarStyle: "default" },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: THEME_COLOR.light },
    { media: "(prefers-color-scheme: dark)", color: THEME_COLOR.dark },
  ],
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${display.variable} ${sans.variable}`} data-look="auto" suppressHydrationWarning>
      <head>
        <script data-look-boot dangerouslySetInnerHTML={{ __html: LOOK_BOOT_SCRIPT }} />
      </head>
      <body className="min-h-dvh flex flex-col">
        <ClientBoot />
        {children}
      </body>
    </html>
  );
}
