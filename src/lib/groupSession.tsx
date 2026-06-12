"use client";

import { createContext, useContext, useMemo } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createScopedClient } from "@/lib/supabase/client";
import type { ResolvedGroup } from "@/lib/groups";

// 입장한 그룹의 세션 컨텍스트. share_token 으로 스코프된 클라이언트와
// 그룹 식별 정보를 하위 컴포넌트에 제공한다 (0005_share_token_rls.sql).
interface GroupSession {
  client: SupabaseClient;
  groupId: string;
  shareToken: string;
  joinCode: string;
}

const GroupSessionContext = createContext<GroupSession | null>(null);

export function GroupSessionProvider({
  group,
  joinCode,
  children,
}: {
  group: ResolvedGroup;
  joinCode: string;
  children: React.ReactNode;
}) {
  const value = useMemo<GroupSession>(
    () => ({
      client: createScopedClient(group.share_token),
      groupId: group.id,
      shareToken: group.share_token,
      joinCode,
    }),
    [group.id, group.share_token, joinCode],
  );

  return (
    <GroupSessionContext.Provider value={value}>
      {children}
    </GroupSessionContext.Provider>
  );
}

export function useGroupSession(): GroupSession {
  const ctx = useContext(GroupSessionContext);
  if (!ctx) {
    throw new Error(
      "useGroupSession 은 GroupSessionProvider 내부에서만 사용할 수 있습니다.",
    );
  }
  return ctx;
}
