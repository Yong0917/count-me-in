// count-me-in 데이터 모델 타입 (PRD 7장 기준).
// 추후 Supabase CLI/MCP 로 `supabase gen types` 자동 생성으로 대체 가능.

export type AttendanceStatus = "going" | "not_going" | "maybe";
export type EventSource = "recurring" | "adhoc";

export interface Group {
  id: string;
  name: string;
  join_code: string; // 사람이 입력 가능한 6자리 별칭 (예: ABC123)
  share_token: string; // 추측 불가 긴 랜덤 — 실제 접근 통제용
  created_at: string;
}

export interface Member {
  id: string;
  group_id: string;
  name: string;
  color: string | null; // 달력/명단 식별용 색상
  active: boolean; // false 면 비활성화(보존) — 명단/달력에서 숨김
  created_at: string;
}

export interface RecurringSchedule {
  id: string;
  group_id: string;
  title: string | null;
  weekday: number; // 0~6, 요일 1개당 1행
  start_time: string | null;
  end_time: string | null;
  location: string | null;
  active: boolean;
}

export interface Event {
  id: string;
  group_id: string;
  title: string | null;
  event_date: string; // YYYY-MM-DD
  start_time: string | null;
  end_time: string | null;
  location: string | null;
  source: EventSource;
  schedule_id: string | null;
  created_at: string;
}

export interface Attendance {
  id: string;
  event_id: string;
  member_id: string;
  status: AttendanceStatus;
  updated_at: string;
}

export interface Comment {
  id: string;
  event_id: string;
  member_id: string;
  body: string;
  created_at: string;
}
