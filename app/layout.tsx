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

const SPLASH_SIZES = [
  [1206, 2622],
  [1320, 2868],
  [1179, 2556],
  [1290, 2796],
  [1170, 2532],
] as const;

const startupImage = (["light", "dark"] as const).flatMap((look) =>
  SPLASH_SIZES.map(([w, h]) => ({
    url: `/splash/${look}-${w}x${h}.png`,
    media: `(device-width: ${w / 3}px) and (device-height: ${h / 3}px) and (-webkit-device-pixel-ratio: 3) and (prefers-color-scheme: ${look})`,
  })),
);

export const metadata: Metadata = {
  title: { default: "Basket", template: "%s · Basket" },
  description: "Family meal planning and grocery ordering.",
  icons: { apple: "/icons/apple-touch-icon.png" },
  appleWebApp: { capable: true, title: "Basket", statusBarStyle: "default", startupImage },
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
