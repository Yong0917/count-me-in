-- count-me-in 초기 스키마 (PRD 7장 데이터 모델)
-- 적용: Supabase 대시보드 SQL Editor 또는 Supabase MCP/CLI

create extension if not exists pgcrypto; -- gen_random_uuid(), gen_random_bytes()

-- ─────────────────────────────────────────────────────────────
-- groups
-- ─────────────────────────────────────────────────────────────
create table if not exists groups (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  join_code   text not null unique,   -- 사람이 입력 가능한 6자리 별칭 (예: ABC123)
  share_token text not null unique,   -- 추측 불가 긴 랜덤 — 실제 접근 통제용
  created_at  timestamptz not null default now()
);

-- ─────────────────────────────────────────────────────────────
-- members
-- 보류(PRD 13장): 멤버 삭제 시 기존 참석/댓글 기록 처리(보존/익명화/삭제).
-- 잠정 기본값(MVP 단순화): ON DELETE CASCADE — 멤버 삭제 시 관련 기록도 삭제.
-- ─────────────────────────────────────────────────────────────
create table if not exists members (
  id         uuid primary key default gen_random_uuid(),
  group_id   uuid not null references groups(id) on delete cascade,
  name       text not null,
  color      text,                    -- 달력/명단 식별용 색상
  created_at timestamptz not null default now()
);
create index if not exists members_group_id_idx on members(group_id);

-- ─────────────────────────────────────────────────────────────
-- recurring_schedules : 정기 일정 "규칙" (요일 1개당 1행)
-- ─────────────────────────────────────────────────────────────
create table if not exists recurring_schedules (
  id         uuid primary key default gen_random_uuid(),
  group_id   uuid not null references groups(id) on delete cascade,
  title      text,
  weekday    int  not null check (weekday between 0 and 6), -- 0=일 ~ 6=토
  start_time time,
  end_time   time,
  location   text,
  active     boolean not null default true
);
create index if not exists recurring_schedules_group_id_idx on recurring_schedules(group_id);

-- ─────────────────────────────────────────────────────────────
-- events : 실제 일정 인스턴스 (정기 규칙은 Lazy materialize 로 필요 시 생성)
-- ─────────────────────────────────────────────────────────────
create table if not exists events (
  id          uuid primary key default gen_random_uuid(),
  group_id    uuid not null references groups(id) on delete cascade,
  title       text,
  event_date  date not null,
  start_time  time,
  end_time    time,
  location    text,
  source      text not null default 'adhoc' check (source in ('recurring', 'adhoc')),
  schedule_id uuid references recurring_schedules(id) on delete set null,
  created_at  timestamptz not null default now()
);
create index if not exists events_group_date_idx on events(group_id, event_date);

-- Lazy materialize 멱등성: 같은 규칙의 같은 날짜 인스턴스가 중복 생성되지 않도록.
-- (동시 참석 표시 시 events 행 중복 방지 — ROADMAP 리스크 항목)
create unique index if not exists events_recurring_unique_idx
  on events(group_id, schedule_id, event_date)
  where source = 'recurring';

-- ─────────────────────────────────────────────────────────────
-- attendances : 멤버-일정당 상태 1개 (고유 제약)
-- ─────────────────────────────────────────────────────────────
create table if not exists attendances (
  id         uuid primary key default gen_random_uuid(),
  event_id   uuid not null references events(id) on delete cascade,
  member_id  uuid not null references members(id) on delete cascade,
  status     text not null default 'maybe' check (status in ('going', 'not_going', 'maybe')),
  updated_at timestamptz not null default now(),
  unique (event_id, member_id)
);
create index if not exists attendances_event_id_idx on attendances(event_id);

-- ─────────────────────────────────────────────────────────────
-- comments : 일정별 한줄 메모 (P1)
-- ─────────────────────────────────────────────────────────────
create table if not exists comments (
  id         uuid primary key default gen_random_uuid(),
  event_id   uuid not null references events(id) on delete cascade,
  member_id  uuid not null references members(id) on delete cascade,
  body       text not null,
  created_at timestamptz not null default now()
);
create index if not exists comments_event_id_idx on comments(event_id);
