import { Poppins } from "next/font/google";
import PwaProvider from "./components/PwaProvider";
import "./globals.css";

const poppins = Poppins({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-poppins",
  display: "swap",
});

export const metadata = {
  applicationName: "kuantoconta",
  title: "kuantoconta | Seu futuro financeiro",
  description: "Tenha clareza de quanto ganha, gasta e pode acumular até o fim do ano.",
  robots: { index: false, follow: false },
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "kuantoconta",
  },
  formatDetection: {
    telephone: false,
  },
  icons: {
    icon: [
      { url: "/icons/icon.svg", type: "image/svg+xml" },
      { url: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: [
      { url: "/icons/apple-touch-icon.png", sizes: "180x180", type: "image/png" },
    ],
  },
};

export const viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#f2f3fb",
};

export default function Layout({ children }) {
  return (
    <html lang="pt-BR" className={poppins.variable}>
      <head>
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <script
          dangerouslySetInnerHTML={{
            __html:
              "window.__kcDeferredInstallPrompt=null;window.addEventListener('beforeinstallprompt',function(e){e.preventDefault();window.__kcDeferredInstallPrompt=e;window.dispatchEvent(new Event('kc-install-ready'));});",
          }}
        />
      </head>
      <body>
        <PwaProvider>{children}</PwaProvider>
      </body>
    </html>
  );
}
