// 달력 날짜 유틸 (PRD F4). 타임존은 Asia/Seoul 고정(PRD 13장 가정).
// 그리드 셀은 시간대 함정을 피하려고 로컬 Date 게터로만 ymd 를 만든다.
// "오늘"만 Asia/Seoul 기준으로 계산해 셀 ymd 문자열과 비교한다.

export const WEEKDAY_LABELS = ["일", "월", "화", "수", "목", "금", "토"];

export interface DayCell {
  ymd: string; // YYYY-MM-DD
  day: number; // 1~31
  inCurrentMonth: boolean; // 표시 중인 달에 속하는지(앞/뒤 달 채움 셀 구분)
}

// Asia/Seoul 기준 오늘 (YYYY-MM-DD). en-CA 로케일이 ISO 형식을 준다.
export function todayYmd(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
  }).format(new Date());
}

function localYmd(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

// year/month(0-indexed) 의 월간 그리드. 일요일 시작, 6주(42칸) 고정.
export function buildMonthGrid(year: number, month: number): DayCell[][] {
  const firstWeekday = new Date(year, month, 1).getDay(); // 0=일
  const cursor = new Date(year, month, 1 - firstWeekday);
  const weeks: DayCell[][] = [];
  for (let w = 0; w < 6; w++) {
    const week: DayCell[] = [];
    for (let d = 0; d < 7; d++) {
      week.push({
        ymd: localYmd(cursor),
        day: cursor.getDate(),
        inCurrentMonth: cursor.getMonth() === month,
      });
      cursor.setDate(cursor.getDate() + 1);
    }
    weeks.push(week);
  }
  return weeks;
}

// "2026년 6월" 형태 라벨.
export function monthLabel(year: number, month: number): string {
  return `${year}년 ${month + 1}월`;
}

// "6월 11일 (목)" 형태 — 선택 날짜 표시용.
export function formatSelectedDate(ymd: string): string {
  const [y, m, d] = ymd.split("-").map(Number);
  const weekday = WEEKDAY_LABELS[new Date(y, m - 1, d).getDay()];
  return `${m}월 ${d}일 (${weekday})`;
}
