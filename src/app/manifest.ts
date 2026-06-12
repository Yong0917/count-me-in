import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "오늘참석해?",
    short_name: "오늘참석해",
    description:
      "참가 코드 하나로 모여, 달력에서 오늘 누가 오는지 확인하는 소모임 참석 공유 앱.",
    start_url: "/",
    display: "standalone",
    background_color: "#f3f5f8",
    theme_color: "#f3f5f8",
    lang: "ko",
    icons: [
      { src: "/icon-192", sizes: "192x192", type: "image/png" },
      { src: "/icon-512", sizes: "512x512", type: "image/png" },
      {
        src: "/icon-512",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
