"use client";

import { useState } from "react";
import { addMember } from "@/lib/members";
import { useGroupSession } from "@/lib/groupSession";
import type { Member } from "@/lib/supabase/types";

// 이름 선택 게이트 (PRD F2). 명단에서 본인 선택, 없으면 이름 추가.
// 선택/추가된 멤버는 onSelected 로 상위에 전달(localStorage 저장은 상위 책임).
interface NameGateProps {
  groupId: string;
  groupName: string;
  members: Member[];
  onSelected: (member: Member) => void;
}

export default function NameGate({
  groupId,
  groupName,
  members,
  onSelected,
}: NameGateProps) {
  const { client } = useGroupSession();
  const [newName, setNewName] = useState("");
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    const name = newName.trim();
    if (!name) return;
    setAdding(true);
    setError(null);
    try {
      onSelected(await addMember(client, groupId, name));
    } catch {
      setError("이름 추가에 실패했어요. 다시 시도해주세요.");
      setAdding(false);
    }
  }

  return (
    <main className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center gap-10 px-6 py-16">
      <header className="anim-rise text-center">
        <p className="font-mono text-[11px] uppercase tracking-[0.3em] text-faint">
          {groupName}
        </p>
        <h1 className="mt-4 font-display text-3xl font-semibold leading-tight text-ink">
          본인 이름을
          <br />
          선택하세요
        </h1>
      </header>

      {members.length > 0 && (
        <ul className="flex flex-col gap-2">
          {members.map((member) => (
            <li key={member.id}>
              <button
                type="button"
                onClick={() => onSelected(member)}
                className="group flex h-14 w-full items-center justify-between rounded-xl border border-line bg-surface px-5 text-base font-medium text-ink shadow-sm transition hover:border-accent hover:shadow-md active:scale-[0.99]"
              >
                <span>{member.name}</span>
                <span className="font-mono text-ink-soft opacity-0 transition group-hover:opacity-100">
                  →
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}

      <form onSubmit={handleAdd} className="flex flex-col gap-3">
        <label
          htmlFor="new-name"
          className="font-mono text-[11px] uppercase tracking-[0.2em] text-ink-soft"
        >
          명단에 없나요? 이름 추가
        </label>
        <div className="flex gap-2">
          <input
            id="new-name"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="이름 입력"
            maxLength={20}
            autoComplete="off"
            className="h-14 flex-1 rounded-xl border border-line bg-surface px-4 text-base text-ink shadow-sm transition placeholder:text-faint focus:border-accent focus:outline-none focus:ring-4 focus:ring-accent/25"
          />
          <button
            type="submit"
            disabled={!newName.trim() || adding}
            className="h-14 shrink-0 rounded-xl bg-accent px-6 text-base font-semibold text-surface shadow-sm transition hover:bg-accent/90 active:scale-[0.99] disabled:opacity-30"
          >
            추가
          </button>
        </div>
        {error && <p className="text-sm text-skip">{error}</p>}
      </form>
    </main>
  );
}
