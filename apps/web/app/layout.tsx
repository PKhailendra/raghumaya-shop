import type React from "react";
import type { Metadata } from "next";
import { AuthProvider } from "@/lib/auth";
import { AppQueryProvider } from "@/lib/query";
import "./globals.css";

export const metadata: Metadata = {
  title: "RaghuMayaShop",
  description: "Shop management platform — inventory, billing, finance and more.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <AppQueryProvider>
          <AuthProvider>{children}</AuthProvider>
        </AppQueryProvider>
      </body>
    </html>
  );
}
