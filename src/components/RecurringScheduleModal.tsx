"use client";

import { useState } from "react";
import type { RecurringSchedule } from "@/lib/supabase/types";
import {
  type ScheduleInput,
  createSchedule,
  deleteSchedule,
  updateSchedule,
} from "@/lib/recurringSchedules";
import { useGroupSession } from "@/lib/groupSession";
import { WEEKDAY_LABELS } from "@/lib/date";

// 정기 일정 규칙 관리 (PRD F3 정기). 등록/수정/삭제. 규칙만 저장(실제 행 없음).
interface RecurringScheduleModalProps {
  groupId: string;
  schedules: RecurringSchedule[];
  onClose: () => void;
  onChanged: () => void; // 변경 후 상위 재조회
}

type Mode = { type: "list" } | { type: "form"; editing: RecurringSchedule | null };

function describe(s: RecurringSchedule): string {
  const time = s.start_time
    ? s.end_time
      ? `${s.start_time.slice(0, 5)}–${s.end_time.slice(0, 5)}`
      : s.start_time.slice(0, 5)
    : "시간 미정";
  return [`매주 ${WEEKDAY_LABELS[s.weekday]}`, time, s.location]
    .filter(Boolean)
    .join(" · ");
}

export default function RecurringScheduleModal({
  groupId,
  schedules,
  onClose,
  onChanged,
}: RecurringScheduleModalProps) {
  const { client } = useGroupSession();
  const [mode, setMode] = useState<Mode>({ type: "list" });

  async function handleDelete(s: RecurringSchedule) {
    if (!window.confirm(`“${describe(s)}” 규칙을 삭제할까요?`)) return;
    await deleteSchedule(client, s.id);
    onChanged();
  }

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
          <h2 className="font-display text-xl font-semibold text-ink">정기 일정</h2>
          <button
            type="button"
            onClick={onClose}
            className="flex size-9 items-center justify-center rounded-lg text-faint transition hover:bg-paper hover:text-ink"
            aria-label="닫기"
          >
            ✕
          </button>
        </div>

        {mode.type === "list" ? (
          <div className="mt-5 flex flex-col gap-2 overflow-y-auto">
            {schedules.length === 0 ? (
              <p className="py-8 text-center text-sm text-faint">
                등록된 정기 일정이 없어요.
              </p>
            ) : (
              schedules.map((s) => (
                <div
                  key={s.id}
                  className="flex items-center justify-between rounded-xl border border-line bg-paper px-4 py-3"
                >
                  <div>
                    <p className="text-sm font-medium text-ink">
                      {s.title || "정기 일정"}
                    </p>
                    <p className="mt-0.5 font-mono text-xs text-ink-soft">
                      {describe(s)}
                    </p>
                  </div>
                  <div className="flex shrink-0 gap-1">
                    <button
                      type="button"
                      onClick={() => setMode({ type: "form", editing: s })}
                      className="h-9 rounded-lg px-2 text-sm text-ink-soft transition hover:bg-surface hover:text-ink"
                    >
                      수정
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDelete(s)}
                      className="h-9 rounded-lg px-2 text-sm text-skip transition hover:bg-skip-soft"
                    >
                      삭제
                    </button>
                  </div>
                </div>
              ))
            )}
            <button
              type="button"
              onClick={() => setMode({ type: "form", editing: null })}
              className="mt-2 h-12 rounded-xl bg-accent text-base font-semibold text-surface shadow-sm transition hover:bg-accent/90"
            >
              + 정기 일정 추가
            </button>
          </div>
        ) : (
          <ScheduleForm
            groupId={groupId}
            editing={mode.editing}
            onDone={() => {
              setMode({ type: "list" });
              onChanged();
            }}
            onCancel={() => setMode({ type: "list" })}
          />
        )}
      </div>
    </div>
  );
}

function ScheduleForm({
  groupId,
  editing,
  onDone,
  onCancel,
}: {
  groupId: string;
  editing: RecurringSchedule | null;
  onDone: () => void;
  onCancel: () => void;
}) {
  const { client } = useGroupSession();
  const [title, setTitle] = useState(editing?.title ?? "");
  const [selectedWeekdays, setSelectedWeekdays] = useState<number[]>(
    editing ? [editing.weekday] : [new Date().getDay()],
  );
  const [startTime, setStartTime] = useState(
    editing?.start_time?.slice(0, 5) ?? "",
  );
  const [endTime, setEndTime] = useState(editing?.end_time?.slice(0, 5) ?? "");
  const [location, setLocation] = useState(editing?.location ?? "");
  const [saving, setSaving] = useState(false);

  function toggleWeekday(i: number) {
    // 수정 모드는 한 행 = 한 요일 규칙이므로 단일 선택 유지
    if (editing) {
      setSelectedWeekdays([i]);
      return;
    }
    setSelectedWeekdays((prev) =>
      prev.includes(i)
        ? prev.filter((d) => d !== i)
        : [...prev, i].sort((a, b) => a - b),
    );
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (selectedWeekdays.length === 0) return;
    const base = {
      title: title.trim() || null,
      startTime: startTime || null,
      endTime: endTime || null,
      location: location.trim() || null,
    };
    setSaving(true);
    try {
      if (editing) {
        const input: ScheduleInput = { ...base, weekday: selectedWeekdays[0] };
        await updateSchedule(client, editing.id, groupId, input);
      } else {
        for (const weekday of selectedWeekdays) {
          const input: ScheduleInput = { ...base, weekday };
          await createSchedule(client, groupId, input);
        }
      }
      onDone();
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="mt-4 flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <span className="font-mono text-[11px] uppercase tracking-[0.15em] text-ink-soft">
          요일
        </span>
        <div className="grid grid-cols-7 gap-1">
          {WEEKDAY_LABELS.map((label, i) => (
            <button
              key={label}
              type="button"
              onClick={() => toggleWeekday(i)}
              aria-pressed={selectedWeekdays.includes(i)}
              className={[
                "h-11 rounded-lg text-sm font-medium transition",
                selectedWeekdays.includes(i)
                  ? "bg-accent text-surface shadow-sm"
                  : "border border-line bg-paper text-ink-soft hover:border-line-strong hover:text-ink",
              ].join(" ")}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      <label className="flex flex-col gap-1.5">
        <span className="font-mono text-[11px] uppercase tracking-[0.15em] text-ink-soft">
          제목
        </span>
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="예: 정기 연습"
          maxLength={40}
          className="h-12 rounded-xl border border-line bg-paper px-4 text-base text-ink transition placeholder:text-faint focus:border-accent focus:bg-surface focus:outline-none"
        />
      </label>

      <div className="flex gap-3">
        <label className="flex flex-1 flex-col gap-1.5">
          <span className="font-mono text-[11px] uppercase tracking-[0.15em] text-ink-soft">
            시작
          </span>
          <input
            type="time"
            value={startTime}
            onChange={(e) => setStartTime(e.target.value)}
            className="h-12 rounded-xl border border-line bg-paper px-3 text-base text-ink transition focus:border-accent focus:bg-surface focus:outline-none"
          />
        </label>
        <label className="flex flex-1 flex-col gap-1.5">
          <span className="font-mono text-[11px] uppercase tracking-[0.15em] text-ink-soft">
            종료
          </span>
          <input
            type="time"
            value={endTime}
            onChange={(e) => setEndTime(e.target.value)}
            className="h-12 rounded-xl border border-line bg-paper px-3 text-base text-ink transition focus:border-accent focus:bg-surface focus:outline-none"
          />
        </label>
      </div>

      <label className="flex flex-col gap-1.5">
        <span className="font-mono text-[11px] uppercase tracking-[0.15em] text-ink-soft">
          장소
        </span>
        <input
          value={location}
          onChange={(e) => setLocation(e.target.value)}
          placeholder="예: 시민공원 코트"
          maxLength={60}
          className="h-12 rounded-xl border border-line bg-paper px-4 text-base text-ink transition placeholder:text-faint focus:border-accent focus:bg-surface focus:outline-none"
        />
      </label>

      <div className="mt-2 flex gap-2">
        <button
          type="button"
          onClick={onCancel}
          className="h-12 flex-1 rounded-xl border border-line-strong text-base font-semibold text-ink-soft transition hover:border-accent hover:text-ink"
        >
          취소
        </button>
        <button
          type="submit"
          disabled={saving || selectedWeekdays.length === 0}
          className="h-12 flex-1 rounded-xl bg-accent text-base font-semibold text-surface shadow-sm transition hover:bg-accent/90 disabled:opacity-30"
        >
          {saving ? "저장 중…" : "저장"}
        </button>
      </div>
    </form>
  );
}
