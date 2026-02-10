import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "ColorGrader Pro",
  description: "Professional color grading tool for video production",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
