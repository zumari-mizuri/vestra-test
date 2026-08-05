import type { Metadata } from "next";
import "./globals.css";
import { Providers } from "@/components/providers";
export const metadata: Metadata = { title: "Vestra", description: "Custodial RWA receipt dashboard" };
export default function Layout({ children }: Readonly<{ children: React.ReactNode }>) { return <html lang="en" suppressHydrationWarning><body className="min-h-screen antialiased"><Providers>{children}</Providers></body></html>; }
