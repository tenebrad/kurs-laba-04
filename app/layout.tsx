import type { Metadata } from "next";
import { Pixelify_Sans } from "next/font/google";
import ThemeScript from "./components/ThemeScript";
import "./globals.css";

// Pikselowy krój do tytułów i plakietek (styl Windows 98).
// Treść czatu jest w Tahoma / Verdana — to fonty systemowe, nic się nie pobiera.
const pixel = Pixelify_Sans({
  variable: "--font-pixel",
  subsets: ["latin", "latin-ext"],
});

export const metadata: Metadata = {
  title: "Mój chatbot AI",
  description: "Projekt z kursu Agenci AI",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="pl" className={pixel.variable} suppressHydrationWarning>
      <body>
        {/* Zapisany tryb (jasny/ciemny) ustawiamy przed narysowaniem strony — bez mignięcia. */}
        <ThemeScript />
        {children}
      </body>
    </html>
  );
}
