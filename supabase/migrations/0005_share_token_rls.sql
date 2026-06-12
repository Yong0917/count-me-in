-- count-me-in share_token 기반 RLS 전면 교체 (PRD 9·10장, Phase 4 보안 마감)
--
-- 0002_rls_and_rpc.sql 의 dev_* 정책(anon 전체 접근)을 제거하고,
-- 요청 헤더의 x-share-token 으로 그룹을 스코프하는 정책으로 교체한다.
-- 클라이언트는 lib/supabase/client.ts 의 createScopedClient(shareToken) 으로
-- "x-share-token" 헤더를 보낸다.

-- private 스키마: Data API 에 노출되지 않음(내부 헬퍼 전용)
create schema if not exists private;

-- 요청 헤더의 x-share-token → groups.id (없거나 불일치 시 null)
-- security definer: groups 조회 시 자기 자신의 RLS(아래 share_token_scoped)에
-- 걸리지 않도록 우회(무한 재귀 방지).
create or replace function private.current_group_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select id from groups
  where share_token = current_setting('request.headers', true)::json->>'x-share-token'
$$;

-- 기존 dev_* 정책 제거
drop policy if exists dev_all_groups on groups;
drop policy if exists dev_all_members on members;
drop policy if exists dev_all_recurring_schedules on recurring_schedules;
drop policy if exists dev_all_events on events;
drop policy if exists dev_all_attendances on attendances;
drop policy if exists dev_all_comments on comments;

-- 0002 의 과도한 grant 회수 (테이블별로 다시 부여)
revoke all on all tables in schema public from anon, authenticated;

-- groups: 조회 + name 만 수정 가능 (join_code/share_token 불변)
grant select, update (name) on groups to anon;
create policy share_token_scoped on groups for all to anon
  using (share_token = current_setting('request.headers', true)::json->>'x-share-token')
  with check (share_token = current_setting('request.headers', true)::json->>'x-share-token');

-- members: 조회/추가 + 이름·active 수정(비활성화)만 가능
grant select, insert, update (name, active) on members to anon;
create policy share_token_scoped on members for all to anon
  using (group_id = (select private.current_group_id()))
  with check (group_id = (select private.current_group_id()));

-- recurring_schedules / events: 기존과 동일한 CRUD, group_id 스코프 강화
grant select, insert, update, delete on recurring_schedules to anon;
grant select, insert, update, delete on events to anon;

create policy share_token_scoped on recurring_schedules for all to anon
  using (group_id = (select private.current_group_id()))
  with check (group_id = (select private.current_group_id()));

create policy share_token_scoped on events for all to anon
  using (group_id = (select private.current_group_id()))
  with check (group_id = (select private.current_group_id()));

-- attendances / comments: events 의 RLS 를 통해 간접 스코프
-- (서브쿼리 select id from events 는 이미 위 events 정책으로 현재 그룹 행만 반환)
grant select, insert, update on attendances to anon;
grant select, insert on comments to anon;

create policy share_token_scoped on attendances for all to anon
  using (event_id in (select id from events))
  with check (event_id in (select id from events));

create policy share_token_scoped on comments for all to anon
  using (event_id in (select id from events))
  with check (event_id in (select id from events));

-- materialize_recurring_event: share_token 검증 추가 (defense-in-depth).
-- RLS 가 events insert 시 group_id 를 스코프하지만, 호출자가 임의의
-- schedule_id 를 넘겨 다른 그룹의 일정을 materialize 하지 못하도록 추가 확인.
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
  v_token    text := current_setting('request.headers', true)::json->>'x-share-token';
begin
  select * into v_schedule
  from recurring_schedules
  where id = p_schedule_id;

  if not found then
    raise exception 'recurring schedule % not found', p_schedule_id;
  end if;

  if not exists (
    select 1 from groups
    where id = v_schedule.group_id and share_token = v_token
  ) then
    raise exception 'share_token mismatch';
  end if;

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
