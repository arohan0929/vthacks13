import type { Metadata } from "next";
import "./globals.css";
import AuthInitializer from "@/components/AuthInitializer/AuthInitializer";
import { Toaster } from "@/components/ui/sonner";

export const metadata: Metadata = {
  title: "Complai",
  description: "Enterprise-grade compliance management platform for Fortune 500 companies",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark">
      <body
        className="font-sans antialiased"
      >
        <AuthInitializer />
        {children}
        <Toaster />
      </body>
    </html>
  );
}
