-- count-me-in 멤버별 PIN(이름 사칭 방지) + 닉네임 중복 방지 (PRD 10/11장 후속)
--
-- (1) members.pin_hash/has_pin 컬럼 + add_member/verify_member_pin/set_member_pin RPC.
-- (2) 그룹 내 활성 멤버 닉네임 unique index (active=true 한정, 비활성 멤버 이름 재사용 허용).
-- anon 의 members select/insert 권한을 컬럼 제한 + RPC 경유로 좁힌다.

alter table members add column if not exists pin_hash text;
alter table members add column if not exists has_pin boolean
  generated always as (pin_hash is not null) stored;

create unique index if not exists members_group_name_active_unique_idx
  on members(group_id, name) where active = true;

-- 0005 의 "select, insert, update (name, active) on members to anon" 중 select/insert 회수.
-- anon 은 더 이상 members 를 직접 insert 할 수 없고(add_member RPC 경유),
-- select 는 pin_hash 를 제외한 컬럼만 허용한다. update (name, active) 는 그대로 유지.
revoke select, insert on members from anon;
grant select (id, group_id, name, color, active, created_at, has_pin) on members to anon;

-- ─────────────────────────────────────────────────────────────
-- add_member: 신규 멤버 추가 (PIN 4자리 숫자 필수)
-- 이름 중복 시 members_group_name_active_unique_idx 위반(23505)이 그대로 전달된다.
-- ─────────────────────────────────────────────────────────────
create or replace function add_member(
  p_group_id uuid,
  p_name     text,
  p_color    text,
  p_pin      text
)
returns table (
  id uuid, group_id uuid, name text, color text,
  active boolean, created_at timestamptz, has_pin boolean
)
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_name  text := trim(p_name);
  v_token text := current_setting('request.headers', true)::json->>'x-share-token';
  v_id    uuid;
begin
  if v_name = '' then
    raise exception 'name is required';
  end if;

  if p_pin is null or p_pin !~ '^[0-9]{4}$' then
    raise exception 'pin must be 4 digits';
  end if;

  if not exists (
    select 1 from groups
    where groups.id = p_group_id and groups.share_token = v_token
  ) then
    raise exception 'share_token mismatch';
  end if;

  insert into members (group_id, name, color, pin_hash)
  values (p_group_id, v_name, p_color, crypt(p_pin, gen_salt('bf')))
  returning members.id into v_id;

  return query
    select m.id, m.group_id, m.name, m.color, m.active, m.created_at, m.has_pin
    from members m where m.id = v_id;
end;
$$;

grant execute on function add_member(uuid, text, text, text) to anon, authenticated;

-- ─────────────────────────────────────────────────────────────
-- verify_member_pin: 명단에서 본인 선택 시 PIN 검증.
-- pin_hash 가 없는 멤버(기존 멤버)는 항상 true.
-- ─────────────────────────────────────────────────────────────
create or replace function verify_member_pin(
  p_member_id uuid,
  p_pin       text
)
returns boolean
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_token  text := current_setting('request.headers', true)::json->>'x-share-token';
  v_member members;
begin
  select * into v_member from members where id = p_member_id;

  if not found then
    return false;
  end if;

  if not exists (
    select 1 from groups
    where id = v_member.group_id and share_token = v_token
  ) then
    raise exception 'share_token mismatch';
  end if;

  if v_member.pin_hash is null then
    return true;
  end if;

  return v_member.pin_hash = crypt(p_pin, v_member.pin_hash);
end;
$$;

grant execute on function verify_member_pin(uuid, text) to anon, authenticated;

-- ─────────────────────────────────────────────────────────────
-- set_member_pin: 설정 화면 — PIN 등록/변경/제거(p_pin = null 이면 제거)
-- ─────────────────────────────────────────────────────────────
create or replace function set_member_pin(
  p_member_id uuid,
  p_pin       text
)
returns table (
  id uuid, group_id uuid, name text, color text,
  active boolean, created_at timestamptz, has_pin boolean
)
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_token text := current_setting('request.headers', true)::json->>'x-share-token';
  v_group uuid;
begin
  select members.group_id into v_group from members where members.id = p_member_id;

  if v_group is null then
    raise exception 'member % not found', p_member_id;
  end if;

  if not exists (
    select 1 from groups where groups.id = v_group and groups.share_token = v_token
  ) then
    raise exception 'share_token mismatch';
  end if;

  if p_pin is not null and p_pin !~ '^[0-9]{4}$' then
    raise exception 'pin must be 4 digits';
  end if;

  update members
  set pin_hash = case when p_pin is null then null else crypt(p_pin, gen_salt('bf')) end
  where members.id = p_member_id;

  return query
    select m.id, m.group_id, m.name, m.color, m.active, m.created_at, m.has_pin
    from members m where m.id = p_member_id;
end;
$$;

grant execute on function set_member_pin(uuid, text) to anon, authenticated;

-- ─────────────────────────────────────────────────────────────
-- check_request(0006) 확장: verify_member_pin 도 rate limit 대상에 포함
-- (4자리 PIN 전수조사 방어). 경로 체크만 수정, 나머지 로직은 0006과 동일.
-- ─────────────────────────────────────────────────────────────
create or replace function public.check_request()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  req_path text := current_setting('request.path', true);
  req_ip   inet;
  count_in_window integer;
begin
  if req_path is distinct from 'rpc/resolve_group'
     and req_path is distinct from 'rpc/verify_member_pin' then
    return;
  end if;

  req_ip := split_part(
    current_setting('request.headers', true)::json->>'x-forwarded-for',
    ',', 1
  )::inet;

  select count(*) into count_in_window
  from private.rate_limits
  where ip = req_ip and request_at > now() - interval '10 minutes';

  if count_in_window >= 20 then
    raise sqlstate 'PGRST' using
      message = json_build_object(
        'message', '잠시 후 다시 시도해주세요.')::text,
      detail = json_build_object(
        'status', 429)::text;
  end if;

  insert into private.rate_limits (ip, request_at) values (req_ip, now());
end;
$$;
