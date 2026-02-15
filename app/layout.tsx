import type { Metadata } from "next";
import { GideonProvider } from "@/components/providers/GideonProvider";
import "./globals.css";

export const metadata: Metadata = {
  title: "ReSight — Voice Browser",
  description: "ReSight: The Ultimate Voice Browser for the Visually Impaired",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
      </head>
      <body>
        <GideonProvider>{children}</GideonProvider>
      </body>
    </html>
  );
}
