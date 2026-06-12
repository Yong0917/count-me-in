-- count-me-in resolve_group rate limit (PRD 10장, Phase 4 보안 마감)
--
-- join_code 는 6자리라 brute-force 위험이 있으므로, resolve_group RPC 호출을
-- IP 당 10분에 20회로 제한한다. PostgREST pre-request 훅(check_request)에서
-- request.path 가 'rpc/resolve_group' 일 때만 검사한다.

-- private 스키마: Data API 에 노출되지 않음
create table private.rate_limits (
  ip         inet,
  request_at timestamptz not null default now()
);

create index rate_limits_ip_request_at_idx on private.rate_limits (ip, request_at desc);

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
  if req_path is distinct from 'rpc/resolve_group' then
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

alter role authenticator set pgrst.db_pre_request = 'public.check_request';
notify pgrst, 'reload config';

-- ⚠️ check_request 의 EXECUTE 권한은 anon/authenticated 에 유지해야 한다.
-- PostgREST 는 db_pre_request 훅을 요청 역할(anon 등)로 호출하므로,
-- EXECUTE 를 회수하면 모든 요청이 42501(permission denied)로 실패한다.
-- (advisor 의 check_request SECURITY DEFINER WARN 은 이 훅 패턴에서는 의도된 동작)
