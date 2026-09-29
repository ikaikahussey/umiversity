import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Umiversity",
    short_name: "Umiversity",
    description: "A social learning network for polymaths",
    start_url: "/",
    display: "standalone",
    background_color: "#fbfaf7",
    theme_color: "#0f6e63",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
