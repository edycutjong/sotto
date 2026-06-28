import type { Metadata } from "next";
import { Outfit, JetBrains_Mono, Inter } from "next/font/google";
import "./globals.css";

const outfit = Outfit({
  variable: "--font-display",
  subsets: ["latin"],
  weight: ["400", "700", "800"],
});

const jetbrainsMono = JetBrains_Mono({
  variable: "--font-mono",
  subsets: ["latin"],
  weight: ["400", "700"],
});

const inter = Inter({
  variable: "--font-sans",
  subsets: ["latin"],
  weight: ["400", "600", "700"],
});

export const metadata: Metadata = {
  title: "Sotto — Sealed-Bid Procurement Auction Engine",
  description:
    "Sealed-bid procurement auctions settled natively with ZK winner proofs on Stellar.",
  icons: {
    icon: "/icon.svg",
    apple: "/apple-touch-icon.png",
  },
  openGraph: {
    title: "Sotto — Sealed-Bid Procurement Auction Engine",
    description:
      "Sealed-bid procurement auctions settled natively with ZK winner proofs on Stellar.",
    url: "https://sotto.edycu.dev",
    siteName: "Sotto",
    images: [
      {
        url: "/og-image.png",
        width: 1200,
        height: 630,
        alt: "Sotto — Sealed-Bid Procurement Auction Engine",
      },
    ],
    locale: "en_US",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Sotto — Sealed-Bid Procurement Auction Engine",
    description:
      "Sealed-bid procurement auctions settled natively with ZK winner proofs on Stellar.",
    images: ["/og-image.png"],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${outfit.variable} ${jetbrainsMono.variable} ${inter.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
