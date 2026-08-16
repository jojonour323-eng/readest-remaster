import type { Metadata } from "next";
import "./globals.css";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as SonnerToaster } from "@/components/ui/sonner";
import { ReaderThemeProvider } from "@/components/providers/reader-theme-provider";

export const metadata: Metadata = {
  title: "Readest Web — Modern eBook Reader",
  description:
    "A distraction-free, browser-based ebook reader. Read EPUB, MOBI, AZW3, FB2, CBZ, TXT. With bookmarks, highlights, notes, library search, OPDS, translation, themes, full keyboard + screen-reader support, and an AI-powered Simplify feature.",
  keywords: ["ebook reader", "epub", "readest", "web reader", "highlights", "simplify"],
  authors: [{ name: "Readest Web" }],
  icons: {
    icon: "/logo.svg",
  },
  openGraph: {
    title: "Readest Web",
    description: "A browser-based ebook reader inspired by Readest.",
    type: "website",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className="antialiased" suppressHydrationWarning>
        <ReaderThemeProvider>
          {children}
        </ReaderThemeProvider>
        <Toaster />
        <SonnerToaster />
      </body>
    </html>
  );
}
