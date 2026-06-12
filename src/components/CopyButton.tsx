"use client";

import { useState } from "react";

// 코드/링크 복사 버튼 (PRD F1). 복사 후 잠시 "복사됨" 으로 피드백.
interface CopyButtonProps {
  value: string;
  label: string;
}

export default function CopyButton({ value, label }: CopyButtonProps) {
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // 클립보드 권한 없음 등 — 조용히 무시(사용자가 직접 복사 가능).
    }
  }

  return (
    <button
      type="button"
      onClick={handleCopy}
      className={[
        "h-10 shrink-0 rounded-lg border px-4 text-sm font-medium transition",
        copied
          ? "border-going bg-going-soft text-going"
          : "border-line-strong text-ink-soft hover:border-accent hover:text-ink",
      ].join(" ")}
    >
      {copied ? "복사됨 ✓" : label}
    </button>
  );
}
