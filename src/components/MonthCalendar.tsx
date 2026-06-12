"use client";

import {
  buildMonthGrid,
  monthLabel,
  todayYmd,
  WEEKDAY_LABELS,
} from "@/lib/date";

// 날짜별 참석 요약 마커 (PRD F4+F6): 일정이 있는 날에 "참석/전체" 표기.
export interface DayMarker {
  going: number; // 그날 참석(going) 멤버 수(합집합)
  total: number; // 전체 멤버 수
}

// 경량 커스텀 월간 그리드 (PRD F4). 오늘 강조 + 좌우 월 이동 + 날짜 선택 + 참석 마커.
// 표시 월(view)은 상위가 관리(controlled) — 정기 occurrence 마커 계산에 보이는 범위가 필요하기 때문.
interface MonthCalendarProps {
  viewYear: number;
  viewMonth: number; // 0-indexed
  onViewChange: (year: number, month: number) => void;
  selectedYmd: string;
  onSelect: (ymd: string) => void;
  markers?: Map<string, DayMarker>;
}

export default function MonthCalendar({
  viewYear,
  viewMonth,
  onViewChange,
  selectedYmd,
  onSelect,
  markers,
}: MonthCalendarProps) {
  const today = todayYmd();
  const weeks = buildMonthGrid(viewYear, viewMonth);

  function moveMonth(delta: number) {
    const next = new Date(viewYear, viewMonth + delta, 1);
    onViewChange(next.getFullYear(), next.getMonth());
  }

  return (
    <div className="w-full">
      {/* 월 이동 헤더 */}
      <div className="flex items-center justify-between">
        <button
          type="button"
          onClick={() => moveMonth(-1)}
          aria-label="이전 달"
          className="flex size-10 items-center justify-center rounded-full text-lg text-ink-soft transition hover:bg-paper hover:text-ink"
        >
          ‹
        </button>
        <span className="font-display text-lg font-semibold text-ink">
          {monthLabel(viewYear, viewMonth)}
        </span>
        <button
          type="button"
          onClick={() => moveMonth(1)}
          aria-label="다음 달"
          className="flex size-10 items-center justify-center rounded-full text-lg text-ink-soft transition hover:bg-paper hover:text-ink"
        >
          ›
        </button>
      </div>

      {/* 요일 헤더 — 일/토만 살짝 톤을 준다 */}
      <div className="mt-3 grid grid-cols-7 border-b border-line pb-2 text-center font-mono text-[10px] uppercase tracking-wider">
        {WEEKDAY_LABELS.map((label, i) => (
          <div
            key={label}
            className={
              i === 0 ? "text-skip/70" : i === 6 ? "text-[#3e6e9e]/70" : "text-faint"
            }
          >
            {label}
          </div>
        ))}
      </div>

      {/* 날짜 그리드 */}
      <div className="mt-1 grid grid-cols-7">
        {weeks.flat().map((cell) => {
          const isToday = cell.ymd === today;
          const isSelected = cell.ymd === selectedYmd;
          const marker = markers?.get(cell.ymd);
          return (
            <div key={cell.ymd} className="flex flex-col items-center pb-0.5">
              <button
                type="button"
                onClick={() => onSelect(cell.ymd)}
                aria-label={cell.ymd}
                aria-pressed={isSelected}
                className={[
                  "flex size-10 items-center justify-center rounded-full font-mono text-sm transition",
                  isSelected
                    ? "bg-accent font-semibold text-surface shadow-sm"
                    : isToday
                      ? "font-semibold text-ink ring-1 ring-line-strong"
                      : cell.inCurrentMonth
                        ? "text-ink hover:bg-paper"
                        : "text-faint/60 hover:bg-paper",
                ].join(" ")}
              >
                {cell.day}
              </button>
              {/* 참석 마커: 일정 있는 날만. 색만 의존 않도록 숫자 표기. */}
              <span className="mt-0.5 flex h-3 items-center font-mono text-[10px] leading-none">
                {marker ? (
                  <span
                    className={
                      marker.going > 0
                        ? "font-semibold text-going"
                        : "text-faint"
                    }
                  >
                    {marker.going}/{marker.total}
                  </span>
                ) : (
                  ""
                )}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
