import type { SupabaseClient } from "@supabase/supabase-js";
import type { AttendanceStatus } from "@/lib/supabase/types";

// 참석 상태 저장 (PRD F5). 멤버×일정당 1행 고유 제약을 활용한 upsert.
// 상태 변경 즉시 호출되며, updated_at 은 트리거가 없으므로 명시적으로 갱신.
export async function setAttendance(
  client: SupabaseClient,
  eventId: string,
  memberId: string,
  status: AttendanceStatus,
): Promise<void> {
  const { error } = await client.from("attendances").upsert(
    {
      event_id: eventId,
      member_id: memberId,
      status,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "event_id,member_id" },
  );
  if (error) throw error;
}
