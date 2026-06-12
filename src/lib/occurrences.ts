import type { EventSource } from "@/lib/supabase/types";
import type {
  AttendanceLite,
  CommentLite,
  EventWithDetails,
} from "@/lib/events";
import type { RecurringSchedule } from "@/lib/supabase/types";
import type { DayMarker } from "@/components/MonthCalendar";

// 정기/비정기를 한 화면에서 다루기 위한 통합 occurrence 뷰모델 (PRD F3·F6).
// - 실제 행(adhoc 또는 materialize 된 recurring): eventId 보유, 참석/메모 있음.
// - 가상 occurrence(아직 materialize 안 된 recurring 규칙): eventId 없음, scheduleId+date 로 식별.
export interface CardOccurrence {
  key: string;
  title: string | null;
  start_time: string | null;
  end_time: string | null;
  location: string | null;
  source: EventSource;
  isVirtual: boolean;
  eventId: string | null; // 실제 행이면 event id
  scheduleId: string | null; // 정기면 규칙 id (가상 materialize 에 사용)
  date: string;
  attendances: AttendanceLite[];
  comments: CommentLite[];
}

// 로컬 기준 요일 (0=일 ~ 6=토). ymd 는 시간대 무관 달력 날짜로 취급.
export function weekdayOfYmd(ymd: string): number {
  const [y, m, d] = ymd.split("-").map(Number);
  return new Date(y, m - 1, d).getDay();
}

function compareOccurrence(a: CardOccurrence, b: CardOccurrence): number {
  const t = (a.start_time ?? "99").localeCompare(b.start_time ?? "99");
  if (t !== 0) return t;
  return (a.title ?? "").localeCompare(b.title ?? "");
}

// 특정 날짜의 occurrence 목록 = 실제 행 + (아직 materialize 안 된) 정기 규칙.
export function occurrencesForDate(
  date: string,
  events: EventWithDetails[],
  schedules: RecurringSchedule[],
): CardOccurrence[] {
  const realOnDate = events.filter((e) => e.event_date === date);
  const materializedScheduleIds = new Set(
    realOnDate
      .filter((e) => e.source === "recurring" && e.schedule_id)
      .map((e) => e.schedule_id as string),
  );

  const real: CardOccurrence[] = realOnDate.map((e) => ({
    key: e.id,
    title: e.title,
    start_time: e.start_time,
    end_time: e.end_time,
    location: e.location,
    source: e.source,
    isVirtual: false,
    eventId: e.id,
    scheduleId: e.schedule_id,
    date,
    attendances: e.attendances,
    comments: e.comments,
  }));

  const weekday = weekdayOfYmd(date);
  const virtual: CardOccurrence[] = schedules
    .filter(
      (s) =>
        s.active &&
        s.weekday === weekday &&
        !materializedScheduleIds.has(s.id),
    )
    .map((s) => ({
      key: `virtual:${s.id}:${date}`,
      title: s.title,
      start_time: s.start_time,
      end_time: s.end_time,
      location: s.location,
      source: "recurring" as const,
      isVirtual: true,
      eventId: null,
      scheduleId: s.id,
      date,
      attendances: [],
      comments: [],
    }));

  return [...real, ...virtual].sort(compareOccurrence);
}

// 달력 마커: 보이는 날짜마다 일정 유무 + going 합집합 수/전체.
// 정기 규칙이 걸린 날도(참석 0이어도) 마커를 표시한다.
export function buildMarkers(
  dates: string[],
  events: EventWithDetails[],
  schedules: RecurringSchedule[],
  totalMembers: number,
): Map<string, DayMarker> {
  // 날짜별 going 멤버 합집합 (실제 행 기준).
  const goingByDate = new Map<string, Set<string>>();
  const datesWithReal = new Set<string>();
  for (const ev of events) {
    datesWithReal.add(ev.event_date);
    let set = goingByDate.get(ev.event_date);
    if (!set) {
      set = new Set();
      goingByDate.set(ev.event_date, set);
    }
    for (const a of ev.attendances) {
      if (a.status === "going") set.add(a.member_id);
    }
  }

  const activeWeekdays = new Set(
    schedules.filter((s) => s.active).map((s) => s.weekday),
  );

  const markers = new Map<string, DayMarker>();
  for (const date of dates) {
    const hasEvent =
      datesWithReal.has(date) || activeWeekdays.has(weekdayOfYmd(date));
    if (!hasEvent) continue;
    markers.set(date, {
      going: goingByDate.get(date)?.size ?? 0,
      total: totalMembers,
    });
  }
  return markers;
}
