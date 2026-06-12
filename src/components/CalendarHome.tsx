"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import MonthCalendar from "@/components/MonthCalendar";
import EventCard from "@/components/EventCard";
import EventFormModal from "@/components/EventFormModal";
import RecurringScheduleModal from "@/components/RecurringScheduleModal";
import SettingsModal from "@/components/SettingsModal";
import { buildMonthGrid, formatSelectedDate, todayYmd } from "@/lib/date";
import {
  type AdhocEventInput,
  type EventWithDetails,
  createAdhocEvent,
  deleteEvent,
  listEventsWithDetails,
  materializeRecurringEvent,
  updateEvent,
} from "@/lib/events";
import { setAttendance } from "@/lib/attendances";
import { addComment } from "@/lib/comments";
import { listMembers } from "@/lib/members";
import { listSchedules } from "@/lib/recurringSchedules";
import { updateRecentGroupName } from "@/lib/recentGroups";
import { useGroupSession } from "@/lib/groupSession";
import {
  type CardOccurrence,
  buildMarkers,
  occurrencesForDate,
} from "@/lib/occurrences";
import type {
  AttendanceStatus,
  Member,
  RecurringSchedule,
} from "@/lib/supabase/types";

// 달력 + 현황 홈 (PRD F3/F4/F5/F6/F7). 선택 날짜 디폴트 = 오늘.
// 비정기 일정·materialize 된 정기 일정은 실제 행으로, 아직 안 만든 정기는 가상 occurrence 로 표시.
interface CalendarHomeProps {
  groupId: string;
  groupName: string;
  member: Member;
  onChangeMember: () => void;
}

interface FormState {
  open: boolean;
  editing: EventWithDetails | null;
}

export default function CalendarHome({
  groupId,
  groupName: initialGroupName,
  member,
  onChangeMember,
}: CalendarHomeProps) {
  const { client } = useGroupSession();
  const initial = todayYmd();
  const [iy, im] = initial.split("-").map(Number);
  const [selected, setSelected] = useState(initial);
  const [view, setView] = useState({ year: iy, month: im - 1 });
  const [groupName, setGroupName] = useState(initialGroupName);
  const [members, setMembers] = useState<Member[]>([]);
  const [events, setEvents] = useState<EventWithDetails[]>([]);
  const [schedules, setSchedules] = useState<RecurringSchedule[]>([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState<FormState>({ open: false, editing: null });
  const [saving, setSaving] = useState(false);
  const [scheduleModalOpen, setScheduleModalOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);

  const refetchMembers = useCallback(async () => {
    setMembers(await listMembers(client, groupId));
  }, [client, groupId]);

  const refetchEvents = useCallback(async () => {
    setEvents(await listEventsWithDetails(client, groupId));
  }, [client, groupId]);

  const refetchSchedules = useCallback(async () => {
    setSchedules(await listSchedules(client, groupId));
  }, [client, groupId]);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const [m, e, s] = await Promise.all([
          listMembers(client, groupId),
          listEventsWithDetails(client, groupId),
          listSchedules(client, groupId),
        ]);
        if (!active) return;
        setMembers(m);
        setEvents(e);
        setSchedules(s);
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [client, groupId]);

  // 보이는 달의 그리드 날짜 전체(정기 마커 계산에 필요).
  const visibleDates = useMemo(
    () => buildMonthGrid(view.year, view.month).flat().map((c) => c.ymd),
    [view],
  );

  const markers = useMemo(
    () => buildMarkers(visibleDates, events, schedules, members),
    [visibleDates, events, schedules, members],
  );

  const selectedOccurrences = useMemo(
    () => occurrencesForDate(selected, events, schedules),
    [selected, events, schedules],
  );

  // 참석 토글: 실제 행은 낙관적 업데이트, 가상 occurrence 는 materialize 후 저장.
  const handleSetAttendance = useCallback(
    async (occ: CardOccurrence, memberId: string, status: AttendanceStatus) => {
      if (occ.eventId) {
        setEvents((prev) =>
          prev.map((ev) =>
            ev.id === occ.eventId
              ? {
                  ...ev,
                  attendances: [
                    ...ev.attendances.filter((a) => a.member_id !== memberId),
                    { member_id: memberId, status },
                  ],
                }
              : ev,
          ),
        );
        setAttendance(client, occ.eventId, memberId, status).catch(() => {
          refetchEvents();
        });
        return;
      }
      // 가상: 첫 참석 → Lazy materialize 후 저장. 실패 시 재조회로 상태 복구.
      try {
        const ev = await materializeRecurringEvent(
          client,
          occ.scheduleId!,
          occ.date,
        );
        await setAttendance(client, ev.id, memberId, status);
        await refetchEvents();
      } catch {
        await refetchEvents();
      }
    },
    [client, refetchEvents],
  );

  // 메모: 가상이면 먼저 materialize. 실패 시 재조회로 상태 복구.
  const handleAddComment = useCallback(
    async (occ: CardOccurrence, body: string) => {
      try {
        const eventId = occ.eventId
          ? occ.eventId
          : (await materializeRecurringEvent(client, occ.scheduleId!, occ.date))
              .id;
        await addComment(client, eventId, member.id, body);
        await refetchEvents();
      } catch {
        await refetchEvents();
      }
    },
    [client, member.id, refetchEvents],
  );

  async function handleSubmitForm(input: AdhocEventInput) {
    setSaving(true);
    try {
      if (form.editing)
        await updateEvent(client, form.editing.id, groupId, input);
      else await createAdhocEvent(client, groupId, input);
      setForm({ open: false, editing: null });
      await refetchEvents();
      // 저장한 날짜로 이동.
      const [sy, sm] = input.eventDate.split("-").map(Number);
      setSelected(input.eventDate);
      setView({ year: sy, month: sm - 1 });
    } finally {
      setSaving(false);
    }
  }

  function handleEdit(occ: CardOccurrence) {
    const ev = events.find((e) => e.id === occ.eventId);
    if (ev) setForm({ open: true, editing: ev });
  }

  async function handleDelete(occ: CardOccurrence) {
    if (!occ.eventId) return;
    if (!window.confirm(`“${occ.title || "일정"}” 을(를) 삭제할까요?`)) return;
    await deleteEvent(client, occ.eventId);
    await refetchEvents();
  }

  return (
    <div className="mx-auto flex w-full max-w-md flex-1 flex-col gap-6 px-4 py-7">
      <header className="anim-rise flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="truncate font-display text-2xl font-semibold leading-tight text-ink">
            {groupName}
          </h1>
          <p className="mt-0.5 text-sm text-ink-soft">
            <span className="font-medium text-ink">{member.name}</span>님으로
            보는 중
          </p>
        </div>
        <div className="flex shrink-0 gap-1.5">
          <button
            type="button"
            onClick={() => setSettingsOpen(true)}
            className="flex size-9 items-center justify-center rounded-lg border border-line-strong text-sm text-ink-soft transition hover:border-accent hover:text-ink"
            aria-label="그룹 설정"
          >
            ⚙️
          </button>
          <button
            type="button"
            onClick={() => setScheduleModalOpen(true)}
            className="h-9 rounded-lg border border-line-strong px-3 text-sm text-ink-soft transition hover:border-accent hover:text-ink"
          >
            정기 일정
          </button>
          <button
            type="button"
            onClick={onChangeMember}
            className="h-9 rounded-lg px-2.5 text-sm text-faint transition hover:text-ink-soft"
          >
            나 아니에요
          </button>
        </div>
      </header>

      <section
        className="anim-rise rounded-2xl border border-line bg-surface p-4 shadow-sm"
        style={{ animationDelay: "0.07s" }}
      >
        <MonthCalendar
          viewYear={view.year}
          viewMonth={view.month}
          onViewChange={(year, month) => setView({ year, month })}
          selectedYmd={selected}
          onSelect={setSelected}
          markers={markers}
        />
      </section>

      <div className="flex items-end justify-between">
        <div>
          <p className="font-mono text-[11px] uppercase tracking-[0.2em] text-faint">
            선택한 날
          </p>
          <h2 className="mt-1 font-display text-xl font-semibold text-ink">
            {formatSelectedDate(selected)}
          </h2>
        </div>
        <button
          type="button"
          onClick={() => setForm({ open: true, editing: null })}
          className="h-10 rounded-xl bg-accent px-4 text-sm font-semibold text-surface shadow-sm transition hover:bg-accent/90 active:scale-[0.99]"
        >
          + 일정 추가
        </button>
      </div>

      {loading ? (
        <p className="py-10 text-center font-mono text-sm text-faint">
          불러오는 중…
        </p>
      ) : selectedOccurrences.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-line-strong bg-surface/50 px-8 py-12 text-center">
          <p className="text-sm text-ink-soft">이 날은 아직 일정이 없어요.</p>
          <button
            type="button"
            onClick={() => setForm({ open: true, editing: null })}
            className="mt-4 h-11 rounded-xl border border-line-strong px-5 text-sm font-semibold text-ink transition hover:border-accent hover:shadow-sm"
          >
            일정 추가
          </button>
        </div>
      ) : (
        selectedOccurrences.map((occ) => (
          <EventCard
            key={occ.key}
            occurrence={occ}
            members={members}
            currentMemberId={member.id}
            onSetAttendance={handleSetAttendance}
            onAddComment={handleAddComment}
            onEdit={handleEdit}
            onDelete={handleDelete}
          />
        ))
      )}

      {form.open && (
        <EventFormModal
          defaultDate={selected}
          editing={form.editing}
          saving={saving}
          onSubmit={handleSubmitForm}
          onClose={() => setForm({ open: false, editing: null })}
        />
      )}

      {scheduleModalOpen && (
        <RecurringScheduleModal
          groupId={groupId}
          schedules={schedules}
          onClose={() => setScheduleModalOpen(false)}
          onChanged={refetchSchedules}
        />
      )}

      {settingsOpen && (
        <SettingsModal
          groupId={groupId}
          groupName={groupName}
          members={members}
          onClose={() => setSettingsOpen(false)}
          onGroupRenamed={(name) => {
            setGroupName(name);
            updateRecentGroupName(groupId, name);
          }}
          onMembersChanged={refetchMembers}
        />
      )}
    </div>
  );
}
