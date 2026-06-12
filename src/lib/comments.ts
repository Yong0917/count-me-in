import type { SupabaseClient } from "@supabase/supabase-js";

// 일정별 한줄 메모 (PRD F7). 작성만 — 표시는 events 임베딩(CommentLite)으로.
// 정기 가상 occurrence 에 메모를 달려면 먼저 materialize 해 실제 event_id 를 얻어야 한다.
export async function addComment(
  client: SupabaseClient,
  eventId: string,
  memberId: string,
  body: string,
): Promise<void> {
  const { error } = await client
    .from("comments")
    .insert({ event_id: eventId, member_id: memberId, body: body.trim() });
  if (error) throw error;
}
