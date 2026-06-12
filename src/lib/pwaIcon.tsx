import type { ReactElement } from "react";

const ACCENT = "#3a82c9";
const PAPER = "#f3f5f8";

export function checkCardIcon(size: number): ReactElement {
  return (
    <div
      style={{
        width: size,
        height: size,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: ACCENT,
        borderRadius: size * 0.22,
      }}
    >
      <div
        style={{
          width: size * 0.62,
          height: size * 0.62,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: PAPER,
          borderRadius: size * 0.16,
        }}
      >
        <svg
          width={size * 0.38}
          height={size * 0.38}
          viewBox="0 0 24 24"
          fill="none"
          stroke={ACCENT}
          strokeWidth={3}
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M5 13l4 4L19 7" />
        </svg>
      </div>
    </div>
  );
}
