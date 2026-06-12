"use client";

import { useState } from "react";
import type { AttendanceStatus, Member } from "@/lib/supabase/types";
import type { CardOccurrence } from "@/lib/occurrences";
import { ATTENDANCE_META, ATTENDANCE_ORDER } from "@/lib/attendanceMeta";
import { memberColor } from "@/lib/colors";
import AttendanceToggle from "@/components/AttendanceToggle";

// 일정 카드 = 현황 패널 단위 (PRD F6/F7). 정기/비정기 통합 occurrence 를 받는다.
// 정기 인스턴스는 규칙으로 관리하므로 카드에서 수정/삭제하지 않고 "정기" 배지만 표시.
interface EventCardProps {
  occurrence: CardOccurrence;
  members: Member[];
  currentMemberId: string;
  onSetAttendance: (
    occ: CardOccurrence,
    memberId: string,
    status: AttendanceStatus,
  ) => void;
  onAddComment: (occ: CardOccurrence, body: string) => void;
  onEdit: (occ: CardOccurrence) => void;
  onDelete: (occ: CardOccurrence) => void;
}

function formatTimeRange(
  start: string | null,
  end: string | null,
): string | null {
  if (!start) return null;
  const s = start.slice(0, 5);
  return end ? `${s}–${end.slice(0, 5)}` : s;
}

function formatCommentTime(iso: string): string {
  const d = new Date(iso);
  const mm = String(d.getMonth() + 1);
  const dd = String(d.getDate());
  const hh = String(d.getHours()).padStart(2, "0");
  const mi = String(d.getMinutes()).padStart(2, "0");
  return `${mm}/${dd} ${hh}:${mi}`;
}

export default function EventCard({
  occurrence,
  members,
  currentMemberId,
  onSetAttendance,
  onAddComment,
  onEdit,
  onDelete,
}: EventCardProps) {
  const [comment, setComment] = useState("");

  const memberById = new Map(members.map((m) => [m.id, m]));

  // member_id → status (레코드 없으면 미정).
  const statusByMember = new Map<string, AttendanceStatus>();
  for (const a of occurrence.attendances) {
    statusByMember.set(a.member_id, a.status);
  }

  const grouped: Record<AttendanceStatus, Member[]> = {
    going: [],
    maybe: [],
    not_going: [],
  };
  for (const m of members) {
    grouped[statusByMember.get(m.id) ?? "maybe"].push(m);
  }

  const myStatus = statusByMember.get(currentMemberId) ?? "maybe";
  const timeRange = formatTimeRange(
    occurrence.start_time,
    occurrence.end_time,
  );
  const isRecurring = occurrence.source === "recurring";

  function handleSubmitComment(e: React.FormEvent) {
    e.preventDefault();
    const body = comment.trim();
    if (!body) return;
    onAddComment(occurrence, body);
    setComment("");
  }

  const sortedComments = [...occurrence.comments].sort((a, b) =>
    a.created_at.localeCompare(b.created_at),
  );

  return (
    <section className="anim-rise rounded-2xl border border-line bg-surface p-5 shadow-sm">
      {/* 헤더: 제목/시간/장소 + (비정기) 수정·삭제 / (정기) 배지 */}
      <div className="flex items-start justify-between gap-2">
        <div>
          <div className="flex items-center gap-2">
            <h3 className="font-display text-lg font-semibold text-ink">
              {occurrence.title || (isRecurring ? "정기 일정" : "일정")}
            </h3>
            {isRecurring && (
              <span className="rounded-full border border-going/30 bg-going-soft px-2 py-0.5 font-mono text-[10px] font-medium uppercase tracking-wider text-going">
                정기
              </span>
            )}
          </div>
          <p className="mt-1 font-mono text-xs text-ink-soft">
            {[timeRange, occurrence.location].filter(Boolean).join("  ·  ") ||
              "시간 미정"}
          </p>
        </div>
        {occurrence.source === "adhoc" && (
          <div className="flex shrink-0 gap-1">
            <button
              type="button"
              onClick={() => onEdit(occurrence)}
              className="h-9 rounded-lg px-2 text-sm text-ink-soft transition hover:bg-paper hover:text-ink"
            >
              수정
            </button>
            <button
              type="button"
              onClick={() => onDelete(occurrence)}
              className="h-9 rounded-lg px-2 text-sm text-skip transition hover:bg-skip-soft"
            >
              삭제
            </button>
          </div>
        )}
      </div>

      {/* 인원 요약 */}
      <div className="mt-4 flex items-center gap-4 rounded-xl bg-paper px-4 py-2.5">
        {ATTENDANCE_ORDER.map((s) => {
          const meta = ATTENDANCE_META[s];
          return (
            <div key={s} className="flex items-center gap-1.5">
              <span aria-hidden className={`size-2 rounded-full ${meta.dot}`} />
              <span className="text-xs text-ink-soft">{meta.label}</span>
              <span className="font-mono text-sm font-semibold text-ink">
                {grouped[s].length}
              </span>
            </div>
          );
        })}
      </div>

      {/* 본인 토글 */}
      <div className="mt-4">
        <p className="mb-2 font-mono text-[10px] uppercase tracking-[0.2em] text-faint">
          내 참석
        </p>
        <AttendanceToggle
          value={myStatus}
          onChange={(status) =>
            onSetAttendance(occurrence, currentMemberId, status)
          }
        />
      </div>

      {/* 상태별 명단 */}
      <div className="mt-5 flex flex-col gap-3">
        {ATTENDANCE_ORDER.map((status) => {
          const list = grouped[status];
          if (list.length === 0) return null;
          const meta = ATTENDANCE_META[status];
          return (
            <div key={status}>
              <p className="flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-wider text-faint">
                <span aria-hidden className={`size-2 rounded-full ${meta.dot}`} />
                {meta.label} {list.length}
              </p>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {list.map((m) => (
                  <span
                    key={m.id}
                    className="flex items-center gap-1.5 rounded-full border border-line bg-paper py-1 pl-2 pr-2.5 text-sm text-ink"
                  >
                    <span
                      aria-hidden
                      className="size-2 rounded-full"
                      style={{ backgroundColor: memberColor(m) }}
                    />
                    {m.name}
                    {m.id === currentMemberId && (
                      <span className="text-xs text-faint">(나)</span>
                    )}
                  </span>
                ))}
              </div>
            </div>
          );
        })}
      </div>

      {/* 한줄 메모 (PRD F7) */}
      <div className="mt-5 border-t border-line pt-4">
        {sortedComments.length > 0 && (
          <ul className="mb-3 flex flex-col gap-2.5">
            {sortedComments.map((c) => (
              <li key={c.id} className="text-sm">
                <span className="font-medium text-ink">
                  {memberById.get(c.member_id)?.name ?? "알 수 없음"}
                </span>
                <span className="ml-1.5 font-mono text-[11px] text-faint">
                  {formatCommentTime(c.created_at)}
                </span>
                <p className="mt-0.5 text-ink-soft">{c.body}</p>
              </li>
            ))}
          </ul>
        )}
        <form onSubmit={handleSubmitComment} className="flex gap-2">
          <input
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            placeholder="한줄 메모 (예: 30분 늦어요)"
            maxLength={100}
            className="h-11 flex-1 rounded-xl border border-line bg-paper px-3 text-sm text-ink transition placeholder:text-faint focus:border-accent focus:bg-surface focus:outline-none"
          />
          <button
            type="submit"
            disabled={!comment.trim()}
            className="h-11 shrink-0 rounded-xl border border-line-strong px-4 text-sm font-medium text-ink transition hover:border-accent disabled:opacity-30"
          >
            등록
          </button>
        </form>
      </div>
    </section>
  );
}
