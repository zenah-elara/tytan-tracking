import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Tytan Teams Tracking Tool",
  description: "Internal workforce tracking foundation for Tytan Teams.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="min-h-full">{children}</body>
    </html>
  );
}
