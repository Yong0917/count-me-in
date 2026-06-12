import type { AttendanceStatus } from "@/lib/supabase/types";

// 참석 상태별 표기 (PRD F5/F6). 색만으로 구분하지 않도록 라벨·아이콘 병행(접근성).
export const ATTENDANCE_META: Record<
  AttendanceStatus,
  { label: string; icon: string; dot: string; activeBg: string; activeText: string }
> = {
  going: {
    label: "참석",
    icon: "✓",
    dot: "bg-going",
    activeBg: "bg-going",
    activeText: "text-surface",
  },
  maybe: {
    label: "미정",
    icon: "?",
    dot: "bg-faint",
    activeBg: "bg-maybe",
    activeText: "text-surface",
  },
  not_going: {
    label: "불참",
    icon: "✕",
    dot: "bg-skip",
    activeBg: "bg-skip",
    activeText: "text-surface",
  },
};

// 토글/명단 노출 순서: 참석 → 미정 → 불참.
export const ATTENDANCE_ORDER: AttendanceStatus[] = [
  "going",
  "maybe",
  "not_going",
];
