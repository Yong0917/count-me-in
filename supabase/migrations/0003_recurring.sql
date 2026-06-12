-- count-me-in 정기 일정 Lazy materialize (PRD F3 · M3)
--
-- 정기 규칙(recurring_schedules)은 요일당 1행만 저장하고, 달력/현황은 가상 occurrence 를
-- 클라이언트에서 계산해 표시한다. 실제 events 행은 "첫 참석/메모" 시점에만 이 RPC 로 생성한다.
-- 동시 참석으로 인한 중복은 (group_id, schedule_id, event_date) 부분 고유 인덱스
-- (0001_init.sql: events_recurring_unique_idx) + ON CONFLICT 로 멱등 처리한다.

create or replace function materialize_recurring_event(
  p_schedule_id uuid,
  p_event_date  date
)
returns events
language plpgsql
security definer
set search_path = public
as $$
declare
  v_schedule recurring_schedules;
  v_event    events;
begin
  select * into v_schedule
  from recurring_schedules
  where id = p_schedule_id;

  if not found then
    raise exception 'recurring schedule % not found', p_schedule_id;
  end if;

  -- 규칙 스냅샷으로 실제 행 생성. 이미 있으면(동시/재호출) 기존 행을 그대로 반환.
  insert into events (
    group_id, title, event_date, start_time, end_time, location, source, schedule_id
  ) values (
    v_schedule.group_id, v_schedule.title, p_event_date,
    v_schedule.start_time, v_schedule.end_time, v_schedule.location,
    'recurring', p_schedule_id
  )
  on conflict (group_id, schedule_id, event_date) where source = 'recurring'
  do update set schedule_id = events.schedule_id  -- no-op: 충돌 시에도 기존 행을 RETURNING
  returning * into v_event;

  return v_event;
end;
$$;

grant execute on function materialize_recurring_event(uuid, date) to anon, authenticated;
