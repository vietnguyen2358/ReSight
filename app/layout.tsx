import type { Metadata } from "next";
import { GideonProvider } from "@/components/providers/GideonProvider";
import "./globals.css";

export const metadata: Metadata = {
  title: "Gideon — Voice Browser",
  description: "The Ultimate Voice Browser for the Visually Impaired",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <GideonProvider>{children}</GideonProvider>
      </body>
    </html>
  );
}
