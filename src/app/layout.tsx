import type { Metadata } from "next";
import { Inter } from "next/font/google";
import Script from "next/script";
import "./globals.css";
import { getSiteName, getSiteUrl } from "@/lib/seo/site";
import { defaultOgImages } from "@/lib/seo/media";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

export const metadata: Metadata = {
  metadataBase: new URL(getSiteUrl()),
  title: getSiteName(),
  description:
    "Dog-first hiking trail directory with structured details on leash rules, shade, water access, and trail conditions.",
  openGraph: {
    type: "website",
    siteName: getSiteName(),
    url: "/",
    title: getSiteName(),
    description:
      "Dog-first hiking trail directory with structured details on leash rules, shade, water access, and trail conditions.",
    images: defaultOgImages(),
  },
  twitter: {
    card: "summary_large_image",
    title: getSiteName(),
    description:
      "Dog-first hiking trail directory with structured details on leash rules, shade, water access, and trail conditions.",
    images: defaultOgImages().map((img) => img.url),
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={inter.variable}>
        <Script
          async
          src="https://www.googletagmanager.com/gtag/js?id=G-YVDKZB41TW"
          strategy="afterInteractive"
        />
        <Script id="google-analytics" strategy="afterInteractive">
          {`
            window.dataLayer = window.dataLayer || [];
            function gtag(){dataLayer.push(arguments);}
            gtag('js', new Date());
            gtag('config', 'G-YVDKZB41TW');
          `}
        </Script>
        {children}
      </body>
    </html>
  );
}
