import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { ClerkProvider } from '@clerk/nextjs'

import ConvexClientProvider from "@/components/ConvexClientProvider";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "User Dashboard",
  description: "User dashboard for Z-AI Chatbot",
};

import Sidebar from "@/components/Sidebar";

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <ClerkProvider>
      <html lang="en">
        <body className={inter.className + " bg-gray-50 text-gray-900"}>
          <ConvexClientProvider>
            <div className="flex h-screen overflow-hidden">
              <Sidebar />
              <main className="flex-1 ml-64 p-8 overflow-y-auto">
                {children}
              </main>
            </div>
          </ConvexClientProvider>
        </body>
      </html>
    </ClerkProvider>
  );
}
