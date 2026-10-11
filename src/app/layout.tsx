import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Sharad Utsav 2026 – Book your tickets",
  description: "Book family tickets for Sharad Utsav 2026 at Radha Krishna Temple, Allen, Texas (10–14 Nov 2026).",
};
export const viewport: Viewport = { width: "device-width", initialScale: 1, themeColor: "#2C2C2C" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
