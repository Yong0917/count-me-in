"use client";

import { use, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { resolveGroup, type ResolvedGroup } from "@/lib/groups";
import { listMembers } from "@/lib/members";
import { createScopedClient } from "@/lib/supabase/client";
import {
  clearMemberId,
  getStoredMemberId,
  storeMemberId,
} from "@/lib/identity";
import { addRecentGroup } from "@/lib/recentGroups";
import type { Member } from "@/lib/supabase/types";
import { GroupSessionProvider } from "@/lib/groupSession";
import NameGate from "@/components/NameGate";
import CalendarHome from "@/components/CalendarHome";

// 코드/링크 입장 → 이름 게이트 → 달력 홈 (PRD F2/F4).
// resolve_group 으로 코드 검증 후, localStorage 의 member_id 로 재진입 자동 통과.
type State =
  | { phase: "loading" }
  | { phase: "invalid" }
  | { phase: "error" }
  | { phase: "gate"; group: ResolvedGroup; members: Member[] }
  | { phase: "home"; group: ResolvedGroup; member: Member };

export default function GroupPage({
  params,
}: {
  params: Promise<{ joinCode: string }>;
}) {
  const { joinCode } = use(params);
  const [state, setState] = useState<State>({ phase: "loading" });

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const group = await resolveGroup(joinCode);
        if (!active) return;
        if (!group) {
          setState({ phase: "invalid" });
          return;
        }
        const client = createScopedClient(group.share_token);
        const members = await listMembers(client, group.id);
        if (!active) return;
        // 저장된 member_id 가 현재 명단에 있으면 게이트 건너뜀.
        const storedId = getStoredMemberId(group.id);
        const stored = storedId
          ? members.find((m) => m.id === storedId)
          : undefined;
        if (stored) {
          // 자동 재진입도 실제 입장이므로 최근 모임에 기록(이름 미선택 이탈은 제외).
          addRecentGroup({ groupId: group.id, groupName: group.name, joinCode });
          setState({ phase: "home", group, member: stored });
        } else {
          setState({ phase: "gate", group, members });
        }
      } catch {
        if (active) setState({ phase: "error" });
      }
    })();
    return () => {
      active = false;
    };
  }, [joinCode]);

  // 이름 선택/추가 → localStorage 저장 후 홈으로.
  const handleSelected = useCallback(
    (member: Member) => {
      setState((prev) => {
        if (prev.phase !== "gate") return prev;
        storeMemberId(prev.group.id, member.id);
        addRecentGroup({
          groupId: prev.group.id,
          groupName: prev.group.name,
          joinCode,
        });
        return { phase: "home", group: prev.group, member };
      });
    },
    [joinCode],
  );

  // "나 아니에요" → 저장 초기화 후 명단 다시 받아 게이트로.
  const handleChangeMember = useCallback(async () => {
    if (state.phase !== "home") return;
    const { group } = state;
    clearMemberId(group.id);
    setState({ phase: "loading" });
    try {
      const client = createScopedClient(group.share_token);
      const members = await listMembers(client, group.id);
      setState({ phase: "gate", group, members });
    } catch {
      setState({ phase: "error" });
    }
  }, [state]);

  if (state.phase === "loading") {
    return (
      <main className="flex flex-1 items-center justify-center px-6 py-12 font-mono text-sm text-faint">
        불러오는 중…
      </main>
    );
  }

  if (state.phase === "invalid") {
    return (
      <Notice
        title="존재하지 않는 코드예요"
        body={`“${joinCode}” 와 일치하는 그룹을 찾지 못했어요.`}
      />
    );
  }

  if (state.phase === "error") {
    return (
      <Notice
        title="불러오지 못했어요"
        body="네트워크 상태를 확인하고 다시 시도해주세요."
      />
    );
  }

  if (state.phase === "gate") {
    return (
      <GroupSessionProvider group={state.group} joinCode={joinCode}>
        <NameGate
          groupId={state.group.id}
          groupName={state.group.name}
          members={state.members}
          onSelected={handleSelected}
        />
      </GroupSessionProvider>
    );
  }

  return (
    <GroupSessionProvider group={state.group} joinCode={joinCode}>
      <CalendarHome
        groupId={state.group.id}
        groupName={state.group.name}
        member={state.member}
        onChangeMember={handleChangeMember}
      />
    </GroupSessionProvider>
  );
}

// 코드 오류/네트워크 오류 공통 안내.
function Notice({ title, body }: { title: string; body: string }) {
  return (
    <main className="mx-auto flex w-full max-w-sm flex-1 flex-col items-center justify-center gap-4 px-6 py-12 text-center">
      <h1 className="font-display text-2xl font-semibold text-ink">{title}</h1>
      <p className="text-sm leading-relaxed text-ink-soft">{body}</p>
      <Link
        href="/"
        className="mt-2 flex h-12 items-center justify-center rounded-xl bg-accent px-6 text-base font-semibold text-surface shadow-sm transition hover:bg-accent/90"
      >
        처음으로
      </Link>
    </main>
  );
}
