import type { SupabaseClient } from "@supabase/supabase-js";
import type { Member } from "@/lib/supabase/types";
import { pickColor } from "@/lib/colors";

// 멤버 목록/추가/관리 (PRD F2 이름 선택 게이트, 그룹 설정 화면).
// RLS 는 x-share-token 헤더로 그룹을 스코프한다 (0005_share_token_rls.sql).

// 그룹의 활성 멤버 명단(가입 순). 이름 선택 게이트/설정 화면에 표시.
export async function listMembers(
  client: SupabaseClient,
  groupId: string,
): Promise<Member[]> {
  const { data, error } = await client
    .from("members")
    .select("*")
    .eq("group_id", groupId)
    .eq("active", true)
    .order("created_at", { ascending: true });
  if (error) throw error;
  return data ?? [];
}

// 명단에 없을 때 신규 멤버 생성 후 반환.
export async function addMember(
  client: SupabaseClient,
  groupId: string,
  name: string,
): Promise<Member> {
  const { data, error } = await client
    .from("members")
    .insert({ group_id: groupId, name: name.trim(), color: pickColor() })
    .select()
    .single();
  if (error) throw error;
  return data as Member;
}

// 멤버 이름 수정 (그룹 설정 화면).
export async function updateMemberName(
  client: SupabaseClient,
  memberId: string,
  name: string,
): Promise<void> {
  const { error } = await client
    .from("members")
    .update({ name: name.trim() })
    .eq("id", memberId);
  if (error) throw error;
}

// 멤버 비활성화(보존) — 완전 삭제 대신 active=false 로 명단/달력에서만 숨긴다.
// 기존 attendances/comments 행은 FK 그대로 보존된다.
export async function deactivateMember(
  client: SupabaseClient,
  memberId: string,
): Promise<void> {
  const { error } = await client
    .from("members")
    .update({ active: false })
    .eq("id", memberId);
  if (error) throw error;
}
