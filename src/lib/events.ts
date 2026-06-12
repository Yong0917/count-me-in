import type { SupabaseClient } from "@supabase/supabase-js";
import type { AttendanceStatus, Event } from "@/lib/supabase/types";

// 일정 조회/생성/수정/삭제 (PRD F3). 비정기(adhoc) + materialize 된 정기(recurring) 실제 행.
// 정기 규칙→가상 occurrence 계산은 lib/occurrences.ts, 규칙 CRUD 는 lib/recurringSchedules.ts.
// RLS 는 x-share-token 헤더로 그룹을 스코프한다 (0005_share_token_rls.sql).

// 일정에 딸린 참석 행(요약/패널 집계용 경량 형태).
export interface AttendanceLite {
  member_id: string;
  status: AttendanceStatus;
}

// 일정에 딸린 메모(작성자 이름은 멤버 목록으로 클라이언트에서 해석).
export interface CommentLite {
  id: string;
  member_id: string;
  body: string;
  created_at: string;
}

// events + 중첩 attendances/comments 를 한 쿼리로(PostgREST 임베딩).
export interface EventWithDetails extends Event {
  attendances: AttendanceLite[];
  comments: CommentLite[];
}

export interface AdhocEventInput {
  title: string | null;
  eventDate: string; // YYYY-MM-DD (필수)
  startTime: string | null; // HH:MM
  endTime: string | null; // HH:MM
  location: string | null;
}

// 그룹의 모든 일정 + 참석/메모. 5명 소모임 저용량 전제로 한 번에 로드.
export async function listEventsWithDetails(
  client: SupabaseClient,
  groupId: string,
): Promise<EventWithDetails[]> {
  const { data, error } = await client
    .from("events")
    .select(
      "*, attendances(member_id, status), comments(id, member_id, body, created_at)",
    )
    .eq("group_id", groupId)
    .order("event_date", { ascending: true })
    .order("start_time", { ascending: true, nullsFirst: false });
  if (error) throw error;
  return (data ?? []) as EventWithDetails[];
}

function toRow(groupId: string, input: AdhocEventInput) {
  return {
    group_id: groupId,
    title: input.title?.trim() || null,
    event_date: input.eventDate,
    start_time: input.startTime || null,
    end_time: input.endTime || null,
    location: input.location?.trim() || null,
    source: "adhoc" as const,
  };
}

export async function createAdhocEvent(
  client: SupabaseClient,
  groupId: string,
  input: AdhocEventInput,
): Promise<Event> {
  const { data, error } = await client
    .from("events")
    .insert(toRow(groupId, input))
    .select()
    .single();
  if (error) throw error;
  return data as Event;
}

export async function updateEvent(
  client: SupabaseClient,
  eventId: string,
  groupId: string,
  input: AdhocEventInput,
): Promise<Event> {
  const { data, error } = await client
    .from("events")
    .update(toRow(groupId, input))
    .eq("id", eventId)
    .select()
    .single();
  if (error) throw error;
  return data as Event;
}

export async function deleteEvent(
  client: SupabaseClient,
  eventId: string,
): Promise<void> {
  const { error } = await client.from("events").delete().eq("id", eventId);
  if (error) throw error;
}

// 정기 가상 occurrence → 실제 events 행 생성/조회 (Lazy materialize, 멱등).
// 첫 참석/메모 시점에만 호출. materialize_recurring_event RPC(0003_recurring.sql).
export async function materializeRecurringEvent(
  client: SupabaseClient,
  scheduleId: string,
  eventDate: string,
): Promise<Event> {
  const { data, error } = await client.rpc("materialize_recurring_event", {
    p_schedule_id: scheduleId,
    p_event_date: eventDate,
  });
  if (error) throw error;
  return data as Event;
}
