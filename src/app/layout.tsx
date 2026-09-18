import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import type { ReactNode } from "react";

import "./globals.css";

const nanumSquareRound = localFont({
  src: [
    { path: "../../public/font/NanumSquareRoundR.woff2", weight: "400", style: "normal" },
    { path: "../../public/font/NanumSquareRoundB.woff2", weight: "700", style: "normal" },
    { path: "../../public/font/NanumSquareRoundEB.woff2", weight: "800", style: "normal" },
  ],
  variable: "--font-nanum-square-round",
  display: "swap",
});

export const metadata: Metadata = {
  title: "홈투게더 정기 체크인",
  description: "홈투게더 입주자 정기 체크인",
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  colorScheme: "light",
};

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="ko" className={nanumSquareRound.variable}>
      <body className="font-sans">{children}</body>
    </html>
  );
}
