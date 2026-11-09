import type { Metadata } from "next";
import type { ReactNode } from "react";
import { Nav } from "@/components/nav";
import "./globals.css";

export const metadata: Metadata = {
  title: "VoiceDesk",
  description: "Your AI receptionist's calls, bookings and settings",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>
        <div className="mx-auto flex min-h-screen max-w-6xl flex-col md:flex-row">
          <aside className="border-b border-slate-200 p-4 md:w-56 md:shrink-0 md:border-r md:border-b-0 md:p-6">
            <div className="mb-6 flex items-center gap-2">
              <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-600 text-sm font-bold text-white">V</span>
              <span className="text-lg font-semibold">VoiceDesk</span>
            </div>
            <Nav />
          </aside>
          <main className="flex-1 p-4 md:p-8">{children}</main>
        </div>
      </body>
    </html>
  );
}
