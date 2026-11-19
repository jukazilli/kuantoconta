export default function manifest() {
  return {
    id: "/",
    name: "kuantoconta — Seu futuro financeiro",
    short_name: "kuantoconta",
    description: "Tenha clareza de quanto ganha, gasta e pode acumular até o fim do ano.",
    lang: "pt-BR",
    dir: "ltr",
    start_url: "/dashboard?source=pwa",
    scope: "/",
    display: "standalone",
    display_override: ["standalone", "minimal-ui"],
    orientation: "any",
    background_color: "#f2f3fb",
    theme_color: "#f2f3fb",
    categories: ["finance", "productivity"],
    icons: [
      {
        src: "/icons/icon-192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icons/icon-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icons/icon-maskable-192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "maskable",
      },
      {
        src: "/icons/icon-maskable-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
