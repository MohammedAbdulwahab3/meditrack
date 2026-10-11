import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import { Providers } from "@/components/providers";
import "./globals.css";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter", display: "swap" });

export const metadata: Metadata = {
  title: { default: "MediTrack — Know your medicine is real", template: "%s · MediTrack" },
  description:
    "MediTrack gives every medicine pack a unique code and tracks it from manufacturer to pharmacy, so anyone can check it's genuine in seconds.",
};

export const viewport: Viewport = { themeColor: "#0b7f75", width: "device-width", initialScale: 1 };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={inter.variable}>
      <body className="min-h-dvh font-sans">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
