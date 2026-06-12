import type { Metadata } from "next";
import { Hahmlet, IBM_Plex_Sans_KR, IBM_Plex_Mono } from "next/font/google";
import "./globals.css";

// 타이포 시스템 (알마낙 컨셉):
// - Hahmlet: 한글 세리프 디스플레이 — 워드마크·헤드라인·날짜.
// - IBM Plex Sans KR: 본문/UI.
// - IBM Plex Mono: 참가 코드·달력 숫자·시간(레저 느낌의 정렬).
const display = Hahmlet({
  variable: "--font-display",
  subsets: ["latin"],
  weight: ["500", "600", "700"],
  display: "swap",
});

const sans = IBM_Plex_Sans_KR({
  variable: "--font-sans",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  display: "swap",
});

const mono = IBM_Plex_Mono({
  variable: "--font-mono",
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "count me in — 참석 공유",
  description:
    "참가 코드 하나로 모여, 달력에서 오늘 누가 오는지 확인하는 소모임 참석 공유 앱.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="ko"
      className={`${display.variable} ${sans.variable} ${mono.variable} h-full antialiased`}
    >
      <body className="flex min-h-full flex-col">{children}</body>
    </html>
  );
}
