"use client";

import { useState } from "react";
import { addMember, verifyMemberPin, DUPLICATE_NAME_ERROR } from "@/lib/members";
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
  const [newPin, setNewPin] = useState("");
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [pinTarget, setPinTarget] = useState<string | null>(null);
  const [pinValue, setPinValue] = useState("");
  const [pinError, setPinError] = useState<string | null>(null);
  const [verifying, setVerifying] = useState(false);

  function handleMemberClick(member: Member) {
    if (!member.has_pin) {
      onSelected(member);
      return;
    }
    setPinTarget(member.id);
    setPinValue("");
    setPinError(null);
  }

  function closePinForm() {
    setPinTarget(null);
    setPinValue("");
    setPinError(null);
  }

  async function handleVerifyPin(member: Member) {
    if (pinValue.length !== 4) return;
    setVerifying(true);
    setPinError(null);
    try {
      const ok = await verifyMemberPin(client, member.id, pinValue);
      if (ok) {
        onSelected(member);
      } else {
        setPinError("PIN이 일치하지 않아요");
        setPinValue("");
      }
    } catch {
      setPinError("확인에 실패했어요. 다시 시도해주세요.");
    } finally {
      setVerifying(false);
    }
  }

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    const name = newName.trim();
    if (!name || newPin.length !== 4) return;
    if (members.some((m) => m.name === name)) {
      setError("이미 사용 중인 이름이에요");
      return;
    }
    setAdding(true);
    setError(null);
    try {
      onSelected(await addMember(client, groupId, name, newPin));
    } catch (e) {
      setError(
        e instanceof Error && e.message === DUPLICATE_NAME_ERROR
          ? "이미 사용 중인 이름이에요. 다른 이름을 입력해주세요."
          : "이름 추가에 실패했어요. 다시 시도해주세요.",
      );
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
              {pinTarget === member.id ? (
                <div className="flex flex-col gap-2 rounded-xl border border-accent bg-surface px-5 py-4 shadow-sm">
                  <p className="text-sm font-medium text-ink">
                    {member.name} 님의 PIN을 입력하세요
                  </p>
                  <div className="flex gap-2">
                    <input
                      type="password"
                      inputMode="numeric"
                      maxLength={4}
                      autoFocus
                      value={pinValue}
                      onChange={(e) =>
                        setPinValue(e.target.value.replace(/\D/g, "").slice(0, 4))
                      }
                      className="h-11 flex-1 rounded-lg border border-line bg-paper px-3 text-base tracking-[0.3em] text-ink focus:border-accent focus:outline-none"
                    />
                    <button
                      type="button"
                      onClick={closePinForm}
                      className="h-11 shrink-0 rounded-lg border border-line-strong px-3 text-sm text-ink-soft transition hover:border-accent hover:text-ink"
                    >
                      취소
                    </button>
                    <button
                      type="button"
                      onClick={() => handleVerifyPin(member)}
                      disabled={pinValue.length !== 4 || verifying}
                      className="h-11 shrink-0 rounded-lg bg-accent px-4 text-sm font-semibold text-surface shadow-sm transition hover:bg-accent/90 disabled:opacity-30"
                    >
                      확인
                    </button>
                  </div>
                  {pinError && <p className="text-sm text-skip">{pinError}</p>}
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => handleMemberClick(member)}
                  className="group flex h-14 w-full items-center justify-between rounded-xl border border-line bg-surface px-5 text-base font-medium text-ink shadow-sm transition hover:border-accent hover:shadow-md active:scale-[0.99]"
                >
                  <span>{member.name}</span>
                  <span className="font-mono text-ink-soft opacity-0 transition group-hover:opacity-100">
                    →
                  </span>
                </button>
              )}
            </li>
          ))}
        </ul>
      )}

      <form onSubmit={handleAdd} className="flex flex-col gap-2">
        <label
          htmlFor="new-name"
          className="font-mono text-[11px] uppercase tracking-[0.2em] text-ink-soft"
        >
          명단에 없나요? 이름 추가
        </label>
        <input
          id="new-name"
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          placeholder="이름 입력"
          maxLength={20}
          autoComplete="off"
          className="h-14 w-full rounded-xl border border-line bg-surface px-4 text-base text-ink shadow-sm transition placeholder:text-faint focus:border-accent focus:outline-none focus:ring-4 focus:ring-accent/25"
        />
        <div className="flex gap-2">
          <input
            id="new-pin"
            value={newPin}
            onChange={(e) =>
              setNewPin(e.target.value.replace(/\D/g, "").slice(0, 4))
            }
            placeholder="PIN 4자리"
            inputMode="numeric"
            maxLength={4}
            autoComplete="off"
            className="h-14 flex-1 rounded-xl border border-line bg-surface px-4 text-base tracking-[0.3em] text-ink shadow-sm transition placeholder:text-faint focus:border-accent focus:outline-none focus:ring-4 focus:ring-accent/25"
          />
          <button
            type="submit"
            disabled={!newName.trim() || newPin.length !== 4 || adding}
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
