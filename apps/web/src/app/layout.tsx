import type { Metadata } from "next";
import type { CSSProperties, ReactNode } from "react";
import { DM_Sans, Syne } from "next/font/google";
import { SiteFooter, SiteHeader } from "../components/site-chrome";
import "./globals.css";

const display = Syne({
  subsets: ["latin"],
  variable: "--font-display-loaded",
  weight: ["600", "700", "800"],
});

const body = DM_Sans({
  subsets: ["latin"],
  variable: "--font-body-loaded",
  weight: ["400", "500", "600", "700"],
});

export const metadata: Metadata = {
  title: {
    default: "DentalCare AI",
    template: "%s · DentalCare AI",
  },
  description:
    "DentalCare AI — organization-scoped patient, appointment, and practitioner workspace.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={`${display.variable} ${body.variable}`}>
      <body
        style={
          {
            "--font-display": "var(--font-display-loaded), Syne, sans-serif",
            "--font-body": "var(--font-body-loaded), 'DM Sans', sans-serif",
          } as CSSProperties
        }
      >
        <div className="site-shell">
          <SiteHeader />
          <div className="site-main">{children}</div>
          <SiteFooter />
        </div>
      </body>
    </html>
  );
}
