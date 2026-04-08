import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Hank — Voice AI Home Maintenance Tutor",
  description:
    "Talk to Hank, a retired contractor who walks you through home repairs step by step.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="min-h-dvh h-full flex flex-col">{children}</body>
    </html>
  );
}
