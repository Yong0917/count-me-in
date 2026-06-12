"use client";

import { useState } from "react";
import type { Event } from "@/lib/supabase/types";
import type { AdhocEventInput } from "@/lib/events";

// 비정기 일정 생성/수정 폼 (PRD F3). 날짜만 필수, 제목·시간·장소는 선택.
// 모달(바텀시트 형태)로 띄운다. editing 이 있으면 수정 모드.
interface EventFormModalProps {
  defaultDate: string; // 신규 생성 시 기본 날짜(선택 날짜)
  editing: Event | null;
  saving: boolean;
  onSubmit: (input: AdhocEventInput) => void;
  onClose: () => void;
}

export default function EventFormModal({
  defaultDate,
  editing,
  saving,
  onSubmit,
  onClose,
}: EventFormModalProps) {
  const [title, setTitle] = useState(editing?.title ?? "");
  const [date, setDate] = useState(editing?.event_date ?? defaultDate);
  const [startTime, setStartTime] = useState(editing?.start_time?.slice(0, 5) ?? "");
  const [endTime, setEndTime] = useState(editing?.end_time?.slice(0, 5) ?? "");
  const [location, setLocation] = useState(editing?.location ?? "");

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!date) return;
    onSubmit({
      title: title.trim() || null,
      eventDate: date,
      startTime: startTime || null,
      endTime: endTime || null,
      location: location.trim() || null,
    });
  }

  return (
    <div
      className="anim-fade fixed inset-0 z-50 flex items-end justify-center bg-overlay/40 backdrop-blur-sm sm:items-center"
      onClick={onClose}
    >
      <div
        className="anim-sheet w-full max-w-md rounded-t-3xl border border-line bg-surface p-6 shadow-xl sm:rounded-3xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="font-display text-xl font-semibold text-ink">
          {editing ? "일정 수정" : "일정 추가"}
        </h2>

        <form onSubmit={handleSubmit} className="mt-4 flex flex-col gap-4">
          <Field label="제목">
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="예: 번개 연습"
              maxLength={40}
              className="h-12 w-full rounded-xl border border-line bg-paper px-4 text-base text-ink transition placeholder:text-faint focus:border-accent focus:bg-surface focus:outline-none"
            />
          </Field>

          <Field label="날짜">
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              required
              className="h-12 w-full rounded-xl border border-line bg-paper px-4 text-base text-ink transition placeholder:text-faint focus:border-accent focus:bg-surface focus:outline-none"
            />
          </Field>

          <div className="flex gap-3">
            <Field label="시작">
              <input
                type="time"
                value={startTime}
                onChange={(e) => setStartTime(e.target.value)}
                className="h-12 w-full rounded-xl border border-line bg-paper px-3 text-base text-ink transition focus:border-accent focus:bg-surface focus:outline-none"
              />
            </Field>
            <Field label="종료">
              <input
                type="time"
                value={endTime}
                onChange={(e) => setEndTime(e.target.value)}
                className="h-12 w-full rounded-xl border border-line bg-paper px-3 text-base text-ink transition focus:border-accent focus:bg-surface focus:outline-none"
              />
            </Field>
          </div>

          <Field label="장소">
            <input
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              placeholder="예: 시민공원 코트"
              maxLength={60}
              className="h-12 w-full rounded-xl border border-line bg-paper px-4 text-base text-ink transition placeholder:text-faint focus:border-accent focus:bg-surface focus:outline-none"
            />
          </Field>

          <div className="mt-2 flex gap-2">
            <button
              type="button"
              onClick={onClose}
              className="h-12 flex-1 rounded-xl border border-line-strong text-base font-semibold text-ink-soft transition hover:border-accent hover:text-ink"
            >
              취소
            </button>
            <button
              type="submit"
              disabled={!date || saving}
              className="h-12 flex-1 rounded-xl bg-accent text-base font-semibold text-surface shadow-sm transition hover:bg-accent/90 disabled:opacity-30"
            >
              {saving ? "저장 중…" : "저장"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="flex flex-1 flex-col gap-1.5">
      <span className="font-mono text-[11px] uppercase tracking-[0.15em] text-ink-soft">
        {label}
      </span>
      {children}
    </label>
  );
}
