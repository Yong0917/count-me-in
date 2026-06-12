import type { SupabaseClient } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase/client";
import type { Group } from "@/lib/supabase/types";

// 그룹 생성/조회/수정 (PRD F1·F2, 그룹 설정 화면).
// 생성/조회는 RLS 를 우회해야 하므로 anon 직접 INSERT 대신 SECURITY DEFINER RPC 경유.
// 정의: supabase/migrations/0002_rls_and_rpc.sql, 0005_share_token_rls.sql

// resolve_group RPC 가 반환하는 그룹 식별 정보(share_token 포함).
export interface ResolvedGroup {
  id: string;
  name: string;
  share_token: string; // 추측 불가 긴 랜덤 — 실제 접근 통제 단위
}

// 그룹 생성 + join_code/share_token 발급. (create_group RPC)
export async function createGroup(name: string): Promise<Group> {
  const { data, error } = await supabase.rpc("create_group", {
    p_name: name.trim(),
  });
  if (error) throw error;
  return data as Group;
}

// join_code → 그룹 매핑. 없으면 null. (resolve_group RPC)
export async function resolveGroup(
  joinCode: string,
): Promise<ResolvedGroup | null> {
  const { data, error } = await supabase.rpc("resolve_group", {
    p_join_code: joinCode.trim(),
  });
  if (error) throw error;
  const rows = (data ?? []) as ResolvedGroup[];
  return rows[0] ?? null;
}

// 그룹명 수정 (그룹 설정 화면). join_code/share_token 은 불변.
export async function updateGroupName(
  client: SupabaseClient,
  groupId: string,
  name: string,
): Promise<void> {
  const { error } = await client
    .from("groups")
    .update({ name: name.trim() })
    .eq("id", groupId);
  if (error) throw error;
}
