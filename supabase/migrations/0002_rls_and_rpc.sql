-- count-me-in RLS 골격 + share_token 매핑 RPC (PRD 9·10장)
--
-- ⚠️ TODO(Phase 4 보안 마감):
--   아래 dev_* 정책은 anon 에게 전체 접근을 허용하는 "개발용 임시 정책"이다.
--   Phase 4 에서 share_token 기반으로 그룹별 행만 노출하도록 교체하고,
--   resolve_group 에는 입력 시도 rate limit 을 적용한다. (brute-force 대응)

-- ─────────────────────────────────────────────────────────────
-- join_code 생성기: 혼동되는 문자(0/O/1/I) 제외한 6자리
-- ─────────────────────────────────────────────────────────────
create or replace function gen_join_code()
returns text
language plpgsql
set search_path = ''
as $$
declare
  alphabet constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  code text := '';
  i int;
begin
  for i in 1..6 loop
    code := code || substr(alphabet, 1 + floor(random() * length(alphabet))::int, 1);
  end loop;
  return code;
end;
$$;

-- ─────────────────────────────────────────────────────────────
-- create_group: 그룹 생성 + join_code/share_token 발급 (F1)
-- SECURITY DEFINER 로 RLS 우회하여 삽입, join_code 충돌 시 재시도.
-- ─────────────────────────────────────────────────────────────
create or replace function create_group(p_name text)
returns groups
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_group groups;
begin
  if p_name is null or length(trim(p_name)) = 0 then
    raise exception 'group name is required';
  end if;

  loop
    begin
      insert into groups (name, join_code, share_token)
      values (trim(p_name), gen_join_code(), encode(gen_random_bytes(24), 'hex'))
      returning * into v_group;
      return v_group;
    exception when unique_violation then
      -- join_code 충돌 → 재시도
    end;
  end loop;
end;
$$;

-- ─────────────────────────────────────────────────────────────
-- resolve_group: join_code → 그룹 매핑 (F2 코드/링크 입장)
-- 유효한 코드 보유자에게 share_token 을 반환(코드=접근 권한, PRD 10장).
-- TODO(Phase 4): rate limit.
-- ─────────────────────────────────────────────────────────────
create or replace function resolve_group(p_join_code text)
returns table (id uuid, name text, share_token text)
language sql
security definer
set search_path = public
as $$
  select g.id, g.name, g.share_token
  from groups g
  where g.join_code = upper(trim(p_join_code));
$$;

-- ─────────────────────────────────────────────────────────────
-- RLS 활성화
-- ─────────────────────────────────────────────────────────────
alter table groups               enable row level security;
alter table members              enable row level security;
alter table recurring_schedules  enable row level security;
alter table events               enable row level security;
alter table attendances          enable row level security;
alter table comments             enable row level security;

-- 권한 (RLS 가 행 단위 게이트, grant 는 테이블 단위 권한)
grant usage on schema public to anon, authenticated;
grant select, insert, update, delete on all tables in schema public to anon, authenticated;
grant execute on function create_group(text)   to anon, authenticated;
grant execute on function resolve_group(text)  to anon, authenticated;

-- 개발용 임시 정책 (TODO Phase 4: share_token 스코프로 교체)
create policy dev_all_groups              on groups              for all to anon using (true) with check (true);
create policy dev_all_members             on members             for all to anon using (true) with check (true);
create policy dev_all_recurring_schedules on recurring_schedules for all to anon using (true) with check (true);
create policy dev_all_events              on events              for all to anon using (true) with check (true);
create policy dev_all_attendances         on attendances         for all to anon using (true) with check (true);
create policy dev_all_comments            on comments            for all to anon using (true) with check (true);
