import { Poppins } from "next/font/google";
import "./globals.css";

const poppins = Poppins({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-poppins",
  display: "swap",
});

export const metadata = {
  title: "kuantoconta | Seu futuro financeiro",
  description: "Tenha clareza de quanto ganha, gasta e pode acumular até o fim do ano.",
  robots: { index: false, follow: false },
};

export const viewport = { width: "device-width", initialScale: 1 };

export default function Layout({ children }) {
  return (
    <html lang="pt-BR" className={poppins.variable}>
      <body>{children}</body>
    </html>
  );
}
