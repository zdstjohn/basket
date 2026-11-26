import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Basket",
    short_name: "Basket",
    description: "Family meal planning and grocery ordering.",
    display: "standalone",
    start_url: "/week",
    scope: "/",
    theme_color: "#F7F8F5",
    background_color: "#F7F8F5",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
