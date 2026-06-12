"use client";

import { useState } from "react";
import Link from "next/link";
import type { Member } from "@/lib/supabase/types";
import { updateGroupName } from "@/lib/groups";
import {
  updateMemberName,
  deactivateMember,
  setMemberPin,
  DUPLICATE_NAME_ERROR,
} from "@/lib/members";
import { useGroupSession } from "@/lib/groupSession";
import CopyButton from "@/components/CopyButton";

// 그룹 설정 화면 (Phase 4). 그룹명 수정, 멤버 관리(이름 수정/비활성화), 코드·링크 공유.
interface SettingsModalProps {
  groupId: string;
  groupName: string;
  members: Member[];
  onClose: () => void;
  onGroupRenamed: (name: string) => void;
  onMembersChanged: () => void;
}

export default function SettingsModal({
  groupId,
  groupName,
  members,
  onClose,
  onGroupRenamed,
  onMembersChanged,
}: SettingsModalProps) {
  const { joinCode } = useGroupSession();
  const shareUrl =
    typeof window !== "undefined"
      ? `${window.location.origin}/${joinCode}`
      : `/${joinCode}`;

  return (
    <div
      className="anim-fade fixed inset-0 z-50 flex items-end justify-center bg-overlay/40 backdrop-blur-sm sm:items-center"
      onClick={onClose}
    >
      <div
        className="anim-sheet flex max-h-[90vh] w-full max-w-md flex-col rounded-t-3xl border border-line bg-surface p-6 shadow-xl sm:rounded-3xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <h2 className="font-display text-xl font-semibold text-ink">
            그룹 설정
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="flex size-9 items-center justify-center rounded-lg text-faint transition hover:bg-paper hover:text-ink"
            aria-label="닫기"
          >
            ✕
          </button>
        </div>

        <div className="mt-5 flex flex-col gap-6 overflow-y-auto">
          <section>
            <p className="font-mono text-[11px] uppercase tracking-[0.2em] text-faint">
              그룹명
            </p>
            <GroupNameField
              groupId={groupId}
              groupName={groupName}
              onRenamed={onGroupRenamed}
            />
          </section>

          <section className="border-t border-line pt-5">
            <p className="font-mono text-[11px] uppercase tracking-[0.2em] text-faint">
              멤버 관리
            </p>
            <ul className="mt-3 flex flex-col gap-2">
              {members.map((m) => (
                <MemberRow key={m.id} member={m} onChanged={onMembersChanged} />
              ))}
            </ul>
          </section>

          <section className="border-t border-line pt-5">
            <p className="font-mono text-[11px] uppercase tracking-[0.2em] text-faint">
              참가 코드
            </p>
            <div className="mt-2 flex items-center justify-between gap-3">
              <span className="font-mono text-2xl font-semibold tracking-[0.2em] text-ink">
                {joinCode}
              </span>
              <CopyButton value={joinCode} label="코드 복사" />
            </div>

            <p className="mt-4 font-mono text-[11px] uppercase tracking-[0.2em] text-faint">
              공유 링크
            </p>
            <div className="mt-2 flex items-center justify-between gap-3">
              <span className="truncate text-sm text-ink-soft">{shareUrl}</span>
              <CopyButton value={shareUrl} label="링크 복사" />
            </div>
          </section>

          <section className="border-t border-line pt-5">
            <Link
              href="/"
              className="flex h-12 w-full items-center justify-center rounded-xl border border-line-strong text-sm font-semibold text-ink-soft transition hover:border-accent hover:text-ink"
            >
              처음으로 (다른 모임 입장)
            </Link>
          </section>
        </div>
      </div>
    </div>
  );
}

// 그룹명 인라인 수정.
function GroupNameField({
  groupId,
  groupName,
  onRenamed,
}: {
  groupId: string;
  groupName: string;
  onRenamed: (name: string) => void;
}) {
  const { client } = useGroupSession();
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(groupName);
  const [saving, setSaving] = useState(false);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed || trimmed === groupName) {
      setEditing(false);
      setName(groupName);
      return;
    }
    setSaving(true);
    try {
      await updateGroupName(client, groupId, trimmed);
      onRenamed(trimmed);
      setEditing(false);
    } finally {
      setSaving(false);
    }
  }

  if (!editing) {
    return (
      <div className="mt-2 flex items-center justify-between gap-3">
        <span className="truncate text-lg font-semibold text-ink">
          {groupName}
        </span>
        <button
          type="button"
          onClick={() => {
            setName(groupName);
            setEditing(true);
          }}
          className="h-9 shrink-0 rounded-lg border border-line-strong px-3 text-sm text-ink-soft transition hover:border-accent hover:text-ink"
        >
          수정
        </button>
      </div>
    );
  }

  return (
    <form onSubmit={handleSave} className="mt-2 flex items-center gap-2">
      <input
        value={name}
        onChange={(e) => setName(e.target.value)}
        maxLength={40}
        autoFocus
        className="h-11 min-w-0 flex-1 rounded-xl border border-line bg-paper px-3 text-base text-ink transition focus:border-accent focus:bg-surface focus:outline-none"
      />
      <button
        type="button"
        onClick={() => {
          setEditing(false);
          setName(groupName);
        }}
        className="h-11 shrink-0 rounded-lg border border-line-strong px-3 text-sm text-ink-soft transition hover:border-accent hover:text-ink"
      >
        취소
      </button>
      <button
        type="submit"
        disabled={!name.trim() || saving}
        className="h-11 shrink-0 rounded-lg bg-accent px-4 text-sm font-semibold text-surface shadow-sm transition hover:bg-accent/90 disabled:opacity-30"
      >
        저장
      </button>
    </form>
  );
}

// 멤버 1명 행: 이름 수정 / PIN 관리 / 비활성화.
function MemberRow({
  member,
  onChanged,
}: {
  member: Member;
  onChanged: () => void;
}) {
  const { client } = useGroupSession();
  const [mode, setMode] = useState<"view" | "name" | "pin">("view");
  const [name, setName] = useState(member.name);
  const [nameError, setNameError] = useState<string | null>(null);
  const [pin, setPin] = useState("");
  const [pinError, setPinError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  function resetToView() {
    setMode("view");
    setName(member.name);
    setNameError(null);
    setPin("");
    setPinError(null);
  }

  async function handleSaveName(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed || trimmed === member.name) {
      resetToView();
      return;
    }
    setBusy(true);
    setNameError(null);
    try {
      await updateMemberName(client, member.id, trimmed);
      setMode("view");
      onChanged();
    } catch (e) {
      setNameError(
        e instanceof Error && e.message === DUPLICATE_NAME_ERROR
          ? "이미 사용 중인 이름이에요."
          : "수정에 실패했어요.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function handleSavePin(e: React.FormEvent) {
    e.preventDefault();
    if (pin.length !== 4) return;
    setBusy(true);
    setPinError(null);
    try {
      await setMemberPin(client, member.id, pin);
      setMode("view");
      setPin("");
      onChanged();
    } catch {
      setPinError("저장에 실패했어요. 다시 시도해주세요.");
    } finally {
      setBusy(false);
    }
  }

  async function handleRemovePin() {
    if (
      !window.confirm(
        "PIN을 제거할까요? 이후 명단에서 선택 시 PIN 확인 없이 선택할 수 있어요.",
      )
    )
      return;
    setBusy(true);
    setPinError(null);
    try {
      await setMemberPin(client, member.id, null);
      setMode("view");
      onChanged();
    } catch {
      setPinError("제거에 실패했어요. 다시 시도해주세요.");
    } finally {
      setBusy(false);
    }
  }

  async function handleDeactivate() {
    if (!window.confirm(`"${member.name}" 님을 명단에서 비활성화할까요?`))
      return;
    setBusy(true);
    try {
      await deactivateMember(client, member.id);
      onChanged();
    } finally {
      setBusy(false);
    }
  }

  if (mode === "name") {
    return (
      <li>
        <form onSubmit={handleSaveName} className="flex items-center gap-2">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={20}
            autoFocus
            className="h-11 min-w-0 flex-1 rounded-xl border border-line bg-paper px-3 text-base text-ink transition focus:border-accent focus:bg-surface focus:outline-none"
          />
          <button
            type="button"
            onClick={resetToView}
            className="h-11 shrink-0 rounded-lg border border-line-strong px-3 text-sm text-ink-soft transition hover:border-accent hover:text-ink"
          >
            취소
          </button>
          <button
            type="submit"
            disabled={!name.trim() || busy}
            className="h-11 shrink-0 rounded-lg bg-accent px-4 text-sm font-semibold text-surface shadow-sm transition hover:bg-accent/90 disabled:opacity-30"
          >
            저장
          </button>
        </form>
        {nameError && <p className="mt-1 text-sm text-skip">{nameError}</p>}
      </li>
    );
  }

  if (mode === "pin") {
    return (
      <li>
        <form onSubmit={handleSavePin} className="flex flex-col gap-2">
          <div className="flex items-center gap-2">
            <span className="shrink-0 text-sm text-ink-soft">PIN</span>
            <input
              value={pin}
              onChange={(e) => setPin(e.target.value.replace(/\D/g, "").slice(0, 4))}
              placeholder="4자리"
              inputMode="numeric"
              maxLength={4}
              autoFocus
              className="h-11 min-w-0 flex-1 rounded-xl border border-line bg-paper px-3 text-base tracking-[0.3em] text-ink transition focus:border-accent focus:bg-surface focus:outline-none"
            />
          </div>
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={resetToView}
              className="h-11 shrink-0 rounded-lg border border-line-strong px-3 text-sm text-ink-soft transition hover:border-accent hover:text-ink"
            >
              취소
            </button>
            {member.has_pin && (
              <button
                type="button"
                onClick={handleRemovePin}
                disabled={busy}
                className="h-11 shrink-0 rounded-lg px-2 text-sm text-skip transition hover:bg-skip-soft"
              >
                PIN 제거
              </button>
            )}
            <button
              type="submit"
              disabled={pin.length !== 4 || busy}
              className="h-11 shrink-0 rounded-lg bg-accent px-4 text-sm font-semibold text-surface shadow-sm transition hover:bg-accent/90 disabled:opacity-30"
            >
              저장
            </button>
          </div>
        </form>
        {pinError && <p className="mt-1 text-sm text-skip">{pinError}</p>}
      </li>
    );
  }

  return (
    <li className="flex items-center justify-between gap-2 rounded-xl border border-line bg-paper px-4 py-2.5">
      <div className="flex flex-col gap-0.5 truncate">
        <span className="truncate text-sm font-medium text-ink">
          {member.name}
        </span>
        <span className="font-mono text-[10px] uppercase tracking-[0.15em] text-faint">
          {member.has_pin ? "PIN 설정됨" : "PIN 없음"}
        </span>
      </div>
      <div className="flex shrink-0 gap-1">
        <button
          type="button"
          onClick={() => setMode("name")}
          disabled={busy}
          className="h-9 rounded-lg px-2 text-sm text-ink-soft transition hover:bg-surface hover:text-ink"
        >
          수정
        </button>
        <button
          type="button"
          onClick={() => setMode("pin")}
          disabled={busy}
          className="h-9 rounded-lg px-2 text-sm text-ink-soft transition hover:bg-surface hover:text-ink"
        >
          PIN
        </button>
        <button
          type="button"
          onClick={handleDeactivate}
          disabled={busy}
          className="h-9 rounded-lg px-2 text-sm text-skip transition hover:bg-skip-soft"
        >
          비활성화
        </button>
      </div>
    </li>
  );
}
