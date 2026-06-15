"use client";

import { useRouter } from "next/navigation";
import Link from "next/link";
import { useState } from "react";
import { removeRecentGroup, useRecentGroups } from "@/lib/recentGroups";

// 랜딩 = 코드 입장 화면 (PRD F2 진입 경로 ①). 코드 입력 → /{join_code} 로 이동.
export default function Home() {
  const router = useRouter();
  const [code, setCode] = useState("");
  const recents = useRecentGroups();

  function handleEnter(e: React.FormEvent) {
    e.preventDefault();
    const normalized = code.trim().toUpperCase();
    if (!normalized) return;
    router.push(`/${normalized}`);
  }

  return (
    <main className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center gap-12 px-6 py-16">
      <header className="anim-rise text-center">
        <p className="font-mono text-[11px] uppercase tracking-[0.35em] text-faint">
          모임 참석 공유
        </p>
        <h1 className="mt-4 font-display text-5xl font-semibold leading-none tracking-tight text-ink">
          오늘
          <br />
          <span className="text-accent">참석</span>해?
        </h1>
        <p className="mx-auto mt-5 max-w-[16rem] text-sm leading-relaxed text-ink-soft">
          참가 코드 하나로 모여, 달력에서 오늘 누가 오는지 확인하세요.
        </p>
      </header>

      <form
        onSubmit={handleEnter}
        className="anim-rise flex flex-col gap-3"
        style={{ animationDelay: "0.08s" }}
      >
        <label
          htmlFor="join-code"
          className="font-mono text-[11px] uppercase tracking-[0.2em] text-ink-soft"
        >
          참가 코드
        </label>
        <input
          id="join-code"
          value={code}
          onChange={(e) => setCode(e.target.value.toUpperCase())}
          placeholder="ABC234"
          autoCapitalize="characters"
          autoComplete="off"
          maxLength={6}
          className="h-14 rounded-xl border border-line bg-surface text-center font-mono text-2xl tracking-[0.3em] text-ink uppercase shadow-sm transition placeholder:tracking-[0.3em] placeholder:text-faint/60 focus:border-accent focus:outline-none focus:ring-4 focus:ring-accent/25"
        />
        <button
          type="submit"
          disabled={!code.trim()}
          className="h-14 rounded-xl bg-accent text-base font-semibold text-surface shadow-sm transition hover:bg-accent/90 active:scale-[0.99] disabled:opacity-30"
        >
          입장하기
        </button>
      </form>

      {recents.length > 0 && (
        <section
          className="anim-rise flex flex-col gap-3"
          style={{ animationDelay: "0.12s" }}
        >
          <p className="font-mono text-[11px] uppercase tracking-[0.2em] text-ink-soft">
            최근 모임
          </p>
          <ul className="flex flex-col gap-2">
            {recents.map((g) => (
              <li key={g.groupId} className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => router.push(`/${g.joinCode}`)}
                  className="group flex h-14 flex-1 items-center justify-between rounded-xl border border-line bg-surface px-5 text-base font-medium text-ink shadow-sm transition hover:border-accent hover:shadow-md active:scale-[0.99]"
                >
                  <span className="truncate">{g.groupName}</span>
                  <span className="font-mono text-ink-soft opacity-0 transition group-hover:opacity-100">
                    →
                  </span>
                </button>
                <button
                  type="button"
                  onClick={() => removeRecentGroup(g.groupId)}
                  aria-label="최근 모임에서 삭제"
                  className="flex size-10 shrink-0 items-center justify-center rounded-xl border border-line text-faint transition hover:border-skip hover:text-skip"
                >
                  ✕
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      <div
        className="anim-rise flex items-center justify-center gap-3 text-sm text-ink-soft"
        style={{ animationDelay: "0.16s" }}
      >
        <span>처음이신가요?</span>
        <Link
          href="/new"
          className="font-semibold text-ink underline decoration-line-strong decoration-2 underline-offset-4 transition hover:decoration-accent"
        >
          새 그룹 만들기
        </Link>
      </div>
    </main>
  );
}
