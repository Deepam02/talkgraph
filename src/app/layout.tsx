import type { Metadata, Viewport } from "next";
import { Bricolage_Grotesque, Geist, Geist_Mono } from "next/font/google";
import { PRODUCT } from "@/config/product";
import "./globals.css";

const sans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const mono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });
const display = Bricolage_Grotesque({ variable: "--font-display", subsets: ["latin"], axes: ["opsz"] });

export const metadata: Metadata = {
  metadataBase: new URL(PRODUCT.url),
  title: { default: `${PRODUCT.name}: ${PRODUCT.tagline}`, template: `%s · ${PRODUCT.name}` },
  description: PRODUCT.description,
  openGraph: { title: PRODUCT.name, description: PRODUCT.description, siteName: PRODUCT.name, type: "website" },
  twitter: { card: "summary_large_image", title: PRODUCT.name, description: PRODUCT.description },
};

export const viewport: Viewport = { themeColor: "#E9EDFF" };

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${sans.variable} ${mono.variable} ${display.variable} h-full antialiased`}>
      <body className="min-h-full">{children}</body>
    </html>
  );
}
