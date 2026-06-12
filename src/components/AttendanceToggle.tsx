"use client";

import type { AttendanceStatus } from "@/lib/supabase/types";
import { ATTENDANCE_META, ATTENDANCE_ORDER } from "@/lib/attendanceMeta";

// 참석/미정/불참 3상태 토글 (PRD F5). 본인 행에서 탭 한 번으로 전환, 즉시 저장.
// 라벨+아이콘 병행으로 색만으로 구분하지 않음(접근성, PRD 6장).
interface AttendanceToggleProps {
  value: AttendanceStatus;
  onChange: (status: AttendanceStatus) => void;
  disabled?: boolean;
}

export default function AttendanceToggle({
  value,
  onChange,
  disabled,
}: AttendanceToggleProps) {
  return (
    <div className="grid grid-cols-3 gap-2">
      {ATTENDANCE_ORDER.map((status) => {
        const meta = ATTENDANCE_META[status];
        const active = value === status;
        return (
          <button
            key={status}
            type="button"
            disabled={disabled}
            onClick={() => onChange(status)}
            aria-pressed={active}
            className={[
              "flex h-12 items-center justify-center gap-1.5 rounded-xl border text-sm font-semibold transition disabled:opacity-50",
              active
                ? `${meta.activeBg} ${meta.activeText} border-transparent shadow-sm`
                : "border-line bg-surface text-ink-soft hover:border-line-strong hover:text-ink",
            ].join(" ")}
          >
            <span aria-hidden>{meta.icon}</span>
            {meta.label}
          </button>
        );
      })}
    </div>
  );
}
