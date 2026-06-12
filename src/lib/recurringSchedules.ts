import type { SupabaseClient } from "@supabase/supabase-js";
import type { RecurringSchedule } from "@/lib/supabase/types";

// 정기 일정 "규칙" CRUD (PRD F3 정기). 요일 1개당 1행. 실제 events 행은 만들지 않는다.
// RLS 는 x-share-token 헤더로 그룹을 스코프한다 (0005_share_token_rls.sql).

export interface ScheduleInput {
  title: string | null;
  weekday: number; // 0=일 ~ 6=토
  startTime: string | null; // HH:MM
  endTime: string | null; // HH:MM
  location: string | null;
}

export async function listSchedules(
  client: SupabaseClient,
  groupId: string,
): Promise<RecurringSchedule[]> {
  const { data, error } = await client
    .from("recurring_schedules")
    .select("*")
    .eq("group_id", groupId)
    .order("weekday", { ascending: true })
    .order("start_time", { ascending: true, nullsFirst: false });
  if (error) throw error;
  return (data ?? []) as RecurringSchedule[];
}

function toRow(groupId: string, input: ScheduleInput) {
  return {
    group_id: groupId,
    title: input.title?.trim() || null,
    weekday: input.weekday,
    start_time: input.startTime || null,
    end_time: input.endTime || null,
    location: input.location?.trim() || null,
    active: true,
  };
}

export async function createSchedule(
  client: SupabaseClient,
  groupId: string,
  input: ScheduleInput,
): Promise<RecurringSchedule> {
  const { data, error } = await client
    .from("recurring_schedules")
    .insert(toRow(groupId, input))
    .select()
    .single();
  if (error) throw error;
  return data as RecurringSchedule;
}

export async function updateSchedule(
  client: SupabaseClient,
  scheduleId: string,
  groupId: string,
  input: ScheduleInput,
): Promise<RecurringSchedule> {
  const { data, error } = await client
    .from("recurring_schedules")
    .update(toRow(groupId, input))
    .eq("id", scheduleId)
    .select()
    .single();
  if (error) throw error;
  return data as RecurringSchedule;
}

export async function deleteSchedule(
  client: SupabaseClient,
  scheduleId: string,
): Promise<void> {
  const { error } = await client
    .from("recurring_schedules")
    .delete()
    .eq("id", scheduleId);
  if (error) throw error;
}
