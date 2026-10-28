import "./globals.css";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Evergreen – comfort, planned around taste",
  description: "A Qloo-powered agent that plans meals, music, screen time and outings around what older adults actually love.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
