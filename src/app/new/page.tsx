"use client";

import Link from "next/link";
import { useState } from "react";
import { createGroup } from "@/lib/groups";
import type { Group } from "@/lib/supabase/types";
import CopyButton from "@/components/CopyButton";

// 그룹 생성 화면 (PRD F1). 그룹명 → create_group → 코드/공유링크 발급.
export default function NewGroupPage() {
  const [name, setName] = useState("");
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [group, setGroup] = useState<Group | null>(null);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    setCreating(true);
    setError(null);
    try {
      setGroup(await createGroup(name));
    } catch {
      setError("그룹 생성에 실패했어요. 잠시 후 다시 시도해주세요.");
      setCreating(false);
    }
  }

  // 생성 완료: 코드/링크 공유 화면.
  if (group) {
    const shareUrl =
      typeof window !== "undefined"
        ? `${window.location.origin}/${group.join_code}`
        : `/${group.join_code}`;
    return (
      <main className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center gap-10 px-6 py-16">
        <header className="anim-rise text-center">
          <p className="font-mono text-[11px] uppercase tracking-[0.3em] text-going">
            그룹 생성 완료
          </p>
          <h1 className="mt-3 font-display text-3xl font-semibold leading-tight text-ink">
            “{group.name}”
          </h1>
          <p className="mt-3 text-sm leading-relaxed text-ink-soft">
            아래 코드나 링크를 멤버에게 공유하세요.
          </p>
        </header>

        <div className="flex flex-col gap-3">
          <div className="rounded-2xl border border-line bg-surface p-5 shadow-sm">
            <p className="font-mono text-[11px] uppercase tracking-[0.2em] text-faint">
              참가 코드
            </p>
            <div className="mt-2 flex items-center justify-between gap-3">
              <span className="font-mono text-3xl font-semibold tracking-[0.2em] text-ink">
                {group.join_code}
              </span>
              <CopyButton value={group.join_code} label="코드 복사" />
            </div>
          </div>

          <div className="rounded-2xl border border-line bg-surface p-5 shadow-sm">
            <p className="font-mono text-[11px] uppercase tracking-[0.2em] text-faint">
              공유 링크
            </p>
            <div className="mt-2 flex items-center justify-between gap-3">
              <span className="truncate text-sm text-ink-soft">{shareUrl}</span>
              <CopyButton value={shareUrl} label="링크 복사" />
            </div>
          </div>
        </div>

        <Link
          href={`/${group.join_code}`}
          className="flex h-14 items-center justify-center rounded-xl bg-accent text-base font-semibold text-surface shadow-sm transition hover:bg-accent/90 active:scale-[0.99]"
        >
          입장하기
        </Link>
      </main>
    );
  }

  // 그룹명 입력 화면.
  return (
    <main className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center gap-12 px-6 py-16">
      <header className="anim-rise text-center">
        <p className="font-mono text-[11px] uppercase tracking-[0.35em] text-faint">
          새 모임
        </p>
        <h1 className="mt-4 font-display text-4xl font-semibold leading-tight text-ink">
          새 그룹 만들기
        </h1>
        <p className="mt-4 text-sm leading-relaxed text-ink-soft">
          모임 이름을 정해주세요.
        </p>
      </header>

      <form onSubmit={handleCreate} className="flex flex-col gap-3">
        <label
          htmlFor="group-name"
          className="font-mono text-[11px] uppercase tracking-[0.2em] text-ink-soft"
        >
          그룹명
        </label>
        <input
          id="group-name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="예: 목요일 테니스 모임"
          maxLength={40}
          autoComplete="off"
          className="h-14 rounded-xl border border-line bg-surface px-4 text-base text-ink shadow-sm transition placeholder:text-faint focus:border-accent focus:outline-none focus:ring-4 focus:ring-accent/25"
        />
        {error && <p className="text-sm text-skip">{error}</p>}
        <button
          type="submit"
          disabled={!name.trim() || creating}
          className="h-14 rounded-xl bg-accent text-base font-semibold text-surface shadow-sm transition hover:bg-accent/90 active:scale-[0.99] disabled:opacity-30"
        >
          {creating ? "생성 중…" : "그룹 만들기"}
        </button>
      </form>

      <div className="flex items-center justify-center gap-3 text-sm text-ink-soft">
        <span className="h-px w-8 bg-line-strong" />
        <Link
          href="/"
          className="font-semibold text-ink underline decoration-line-strong decoration-2 underline-offset-4 transition hover:decoration-accent"
        >
          코드로 입장하기
        </Link>
      </div>
    </main>
  );
}
