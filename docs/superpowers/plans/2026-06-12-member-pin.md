# 멤버별 PIN + 닉네임 중복 방지 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 멤버별 4자리 PIN(이름 사칭 방지)과 그룹 내 활성 멤버 닉네임 중복 방지를 추가한다.

**Architecture:** `supabase/migrations/0007_member_pin.sql`에서 `members.pin_hash`/`has_pin` 컬럼, 닉네임 unique index, `add_member`/`verify_member_pin`/`set_member_pin` RPC를 추가하고 anon의 `members` select/insert 권한을 컬럼 제한 + RPC 경유로 좁힌다. 클라이언트는 `src/lib/members.ts`에 새 RPC 호출 + `DUPLICATE_NAME_ERROR` 에러 매핑을 추가하고, `NameGate`(이름 게이트)와 `SettingsModal`(설정 화면)에 PIN 입력/검증/관리 UI를 추가한다.

**Tech Stack:** Next.js 16 / React 19 / Supabase (Postgres + PostgREST + pgcrypto) / TypeScript.

**참고:** 전체 설계 근거는 `docs/superpowers/specs/2026-06-12-member-pin-design.md` 참조. 이 프로젝트는 테스트 러너가 없으므로(CLAUDE.md), 검증은 (a) DB 레이어는 Supabase MCP `execute_sql`로 RPC를 직접 호출하는 수동 통합 테스트, (b) 클라이언트 레이어는 `npx tsc --noEmit` + `npm run lint`, (c) UI는 `npm run dev` 후 수동 시나리오 체크리스트로 대체한다.

---

### Task 1: DB 마이그레이션 — `0007_member_pin.sql`

**Files:**
- Create: `supabase/migrations/0007_member_pin.sql`

> ⚠️ 이 태스크는 **운영 중인 Supabase 프로젝트(실 데이터 7개 그룹/8명 멤버 존재)**에 `apply_migration`으로 직접 적용한다. 적용 직전 사용자에게 한 번 더 확인한다 — 권한(grant) 회수와 unique index 추가가 포함되어 되돌리려면 별도 마이그레이션이 필요하다.

- [ ] **Step 1: 마이그레이션 파일 작성**

```sql
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
    where id = p_group_id and share_token = v_token
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
  select group_id into v_group from members where id = p_member_id;

  if v_group is null then
    raise exception 'member % not found', p_member_id;
  end if;

  if not exists (
    select 1 from groups where id = v_group and share_token = v_token
  ) then
    raise exception 'share_token mismatch';
  end if;

  if p_pin is not null and p_pin !~ '^[0-9]{4}$' then
    raise exception 'pin must be 4 digits';
  end if;

  update members
  set pin_hash = case when p_pin is null then null else crypt(p_pin, gen_salt('bf')) end
  where id = p_member_id;

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
```

- [ ] **Step 2: 사용자에게 적용 확인 후, Supabase MCP로 마이그레이션 적용**

사용자 확인 후 `mcp__supabase__apply_migration`을 `name: "0007_member_pin"`, `query`: 위 SQL 전체로 호출한다.

- [ ] **Step 3: 검증용 임시 그룹 생성**

`mcp__supabase__execute_sql`로 실행:

```sql
select * from create_group('PIN기능 테스트');
```

결과의 `id`(이하 `<GID>`)와 `share_token`(이하 `<TOKEN>`)을 다음 단계에서 사용한다.

- [ ] **Step 4: add_member 정상 동작 확인 (PIN 필수, has_pin=true)**

```sql
select set_config('request.headers', json_build_object('x-share-token', '<TOKEN>')::text, true);
select * from add_member('<GID>'::uuid, '철수', '#a64f38', '1234');
```

기대: 1행 반환, `name = '철수'`, `has_pin = true`. 반환된 `id`를 `<CHULSOO_ID>`로 기록.

- [ ] **Step 5: 잘못된 PIN 형식 거부 확인**

```sql
select set_config('request.headers', json_build_object('x-share-token', '<TOKEN>')::text, true);
select * from add_member('<GID>'::uuid, '영희', '#bf7d3f', '12');
```

기대: 에러 `pin must be 4 digits`.

- [ ] **Step 6: 닉네임 중복(23505) 확인**

```sql
select set_config('request.headers', json_build_object('x-share-token', '<TOKEN>')::text, true);
select * from add_member('<GID>'::uuid, '철수', '#9a8b3a', '5678');
```

기대: 에러 코드 `23505`(unique_violation, `members_group_name_active_unique_idx`).

- [ ] **Step 7: PIN 없는 기존 멤버(레거시) 시뮬레이션 — 직접 INSERT**

```sql
insert into members (group_id, name, color) values ('<GID>'::uuid, '민수', '#5e7b4b')
returning id, name, has_pin;
```

기대: `has_pin = false`. 반환된 `id`를 `<MINSOO_ID>`로 기록.

- [ ] **Step 8: verify_member_pin 확인**

```sql
select set_config('request.headers', json_build_object('x-share-token', '<TOKEN>')::text, true);
select verify_member_pin('<CHULSOO_ID>'::uuid, '1234') as correct_pin,
       verify_member_pin('<CHULSOO_ID>'::uuid, '0000') as wrong_pin,
       verify_member_pin('<MINSOO_ID>'::uuid, '0000') as no_pin_member;
```

기대: `correct_pin = true`, `wrong_pin = false`, `no_pin_member = true`.

- [ ] **Step 9: set_member_pin (등록/변경/제거) 확인**

```sql
select set_config('request.headers', json_build_object('x-share-token', '<TOKEN>')::text, true);
select has_pin from set_member_pin('<MINSOO_ID>'::uuid, '4321');           -- expect true
select verify_member_pin('<MINSOO_ID>'::uuid, '4321');                      -- expect true
select has_pin from set_member_pin('<MINSOO_ID>'::uuid, null);             -- expect false
select verify_member_pin('<MINSOO_ID>'::uuid, '0000');                      -- expect true (PIN 없음)
```

- [ ] **Step 10: 이름 수정 시 중복 거부(23505) 확인 — UPDATE 경로**

```sql
update members set name = '철수' where id = '<MINSOO_ID>'::uuid;
```

기대: 에러 코드 `23505`.

- [ ] **Step 11: 비활성 멤버 이름 재사용 허용 확인**

```sql
update members set active = false where id = '<CHULSOO_ID>'::uuid;

select set_config('request.headers', json_build_object('x-share-token', '<TOKEN>')::text, true);
select * from add_member('<GID>'::uuid, '철수', '#3f807a', '9999');
```

기대: 성공(새 행, `active = true`, 새 `id`).

- [ ] **Step 12: anon 컬럼/테이블 권한 확인**

```sql
select privilege_type, column_name
from information_schema.column_privileges
where table_name = 'members' and grantee = 'anon'
order by privilege_type, column_name;

select privilege_type
from information_schema.table_privileges
where table_name = 'members' and grantee = 'anon';
```

기대: select 컬럼에 `pin_hash` 없음(id/group_id/name/color/active/created_at/has_pin만), update 컬럼은 `name`/`active`만, 테이블 권한에 `INSERT` 없음(`SELECT`/`UPDATE`만).

- [ ] **Step 13: 임시 그룹 정리**

```sql
delete from groups where id = '<GID>'::uuid;
```

`members`는 `group_id` FK `ON DELETE CASCADE`로 함께 삭제됨.

- [ ] **Step 14: Commit**

```bash
git add supabase/migrations/0007_member_pin.sql
git commit -m "feat: 멤버별 PIN 및 닉네임 중복 방지 DB 스키마/RPC 추가"
```

---

### Task 2: 타입 + `src/lib/members.ts`

**Files:**
- Modify: `src/lib/supabase/types.ts:15-22` (`Member` interface)
- Modify: `src/lib/members.ts` (전체)

- [ ] **Step 1: `Member` 타입에 `has_pin` 추가**

`src/lib/supabase/types.ts`의 `Member` interface를 다음과 같이 수정:

```ts
export interface Member {
  id: string;
  group_id: string;
  name: string;
  color: string | null; // 달력/명단 식별용 색상
  active: boolean; // false 면 비활성화(보존) — 명단/달력에서만 숨김
  created_at: string;
  has_pin: boolean; // PIN 설정 여부 — true 면 명단에서 본인 선택 시 PIN 확인
}
```

(`pin_hash`는 서버 전용이라 타입에 두지 않음.)

- [ ] **Step 2: `src/lib/members.ts` 전체 교체**

```ts
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Member } from "@/lib/supabase/types";
import { pickColor } from "@/lib/colors";

// 멤버 목록/추가/관리 (PRD F2 이름 선택 게이트, 그룹 설정 화면).
// RLS 는 x-share-token 헤더로 그룹을 스코프한다 (0005_share_token_rls.sql).

export const DUPLICATE_NAME_ERROR = "DUPLICATE_NAME";

const MEMBER_COLUMNS = "id, group_id, name, color, active, created_at, has_pin";

// 그룹의 활성 멤버 명단(가입 순). 이름 선택 게이트/설정 화면에 표시.
export async function listMembers(
  client: SupabaseClient,
  groupId: string,
): Promise<Member[]> {
  const { data, error } = await client
    .from("members")
    .select(MEMBER_COLUMNS)
    .eq("group_id", groupId)
    .eq("active", true)
    .order("created_at", { ascending: true });
  if (error) throw error;
  return data ?? [];
}

// 명단에 없을 때 신규 멤버 생성 후 반환. PIN(4자리 숫자) 필수.
export async function addMember(
  client: SupabaseClient,
  groupId: string,
  name: string,
  pin: string,
): Promise<Member> {
  const { data, error } = await client
    .rpc("add_member", {
      p_group_id: groupId,
      p_name: name.trim(),
      p_color: pickColor(),
      p_pin: pin,
    })
    .single();
  if (error) {
    if (error.code === "23505") throw new Error(DUPLICATE_NAME_ERROR);
    throw error;
  }
  return data as Member;
}

// 명단에서 본인 선택 시 PIN 검증. pin_hash 가 없는 멤버는 항상 true.
export async function verifyMemberPin(
  client: SupabaseClient,
  memberId: string,
  pin: string,
): Promise<boolean> {
  const { data, error } = await client.rpc("verify_member_pin", {
    p_member_id: memberId,
    p_pin: pin,
  });
  if (error) throw error;
  return data as boolean;
}

// 그룹 설정 화면 — PIN 등록/변경(pin) / 제거(null).
export async function setMemberPin(
  client: SupabaseClient,
  memberId: string,
  pin: string | null,
): Promise<void> {
  const { error } = await client.rpc("set_member_pin", {
    p_member_id: memberId,
    p_pin: pin,
  });
  if (error) throw error;
}

// 멤버 이름 수정 (그룹 설정 화면).
export async function updateMemberName(
  client: SupabaseClient,
  memberId: string,
  name: string,
): Promise<void> {
  const { error } = await client
    .from("members")
    .update({ name: name.trim() })
    .eq("id", memberId);
  if (error) {
    if (error.code === "23505") throw new Error(DUPLICATE_NAME_ERROR);
    throw error;
  }
}

// 멤버 비활성화(보존) — 완전 삭제 대신 active=false 로 명단/달력에서만 숨긴다.
// 기존 attendances/comments 행은 FK 그대로 보존된다.
export async function deactivateMember(
  client: SupabaseClient,
  memberId: string,
): Promise<void> {
  const { error } = await client
    .from("members")
    .update({ active: false })
    .eq("id", memberId);
  if (error) throw error;
}
```

- [ ] **Step 3: 타입체크**

Run: `npx tsc --noEmit`
Expected: 에러 없음. (이 단계에서 `NameGate`/`SettingsModal`의 `addMember(client, groupId, name)` 2-arg 호출이 타입 에러로 나오는 것은 정상 — Task 3/4에서 수정.)

- [ ] **Step 4: Commit**

```bash
git add src/lib/supabase/types.ts src/lib/members.ts
git commit -m "feat: members has_pin 타입 추가 및 PIN RPC 클라이언트 함수 추가"
```

---

### Task 3: `NameGate` — PIN 입력/검증 UI

**Files:**
- Modify: `src/components/NameGate.tsx` (전체)

- [ ] **Step 1: `NameGate.tsx` 전체 교체**

```tsx
"use client";

import { useState } from "react";
import { addMember, verifyMemberPin, DUPLICATE_NAME_ERROR } from "@/lib/members";
import { useGroupSession } from "@/lib/groupSession";
import type { Member } from "@/lib/supabase/types";

// 이름 선택 게이트 (PRD F2). 명단에서 본인 선택, 없으면 이름 추가.
// 선택/추가된 멤버는 onSelected 로 상위에 전달(localStorage 저장은 상위 책임).
interface NameGateProps {
  groupId: string;
  groupName: string;
  members: Member[];
  onSelected: (member: Member) => void;
}

export default function NameGate({
  groupId,
  groupName,
  members,
  onSelected,
}: NameGateProps) {
  const { client } = useGroupSession();
  const [newName, setNewName] = useState("");
  const [newPin, setNewPin] = useState("");
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [pinTarget, setPinTarget] = useState<string | null>(null);
  const [pinValue, setPinValue] = useState("");
  const [pinError, setPinError] = useState<string | null>(null);
  const [verifying, setVerifying] = useState(false);

  function handleMemberClick(member: Member) {
    if (!member.has_pin) {
      onSelected(member);
      return;
    }
    setPinTarget(member.id);
    setPinValue("");
    setPinError(null);
  }

  function closePinForm() {
    setPinTarget(null);
    setPinValue("");
    setPinError(null);
  }

  async function handleVerifyPin(member: Member) {
    if (pinValue.length !== 4) return;
    setVerifying(true);
    setPinError(null);
    try {
      const ok = await verifyMemberPin(client, member.id, pinValue);
      if (ok) {
        onSelected(member);
      } else {
        setPinError("PIN이 일치하지 않아요");
        setPinValue("");
      }
    } catch {
      setPinError("확인에 실패했어요. 다시 시도해주세요.");
    } finally {
      setVerifying(false);
    }
  }

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    const name = newName.trim();
    if (!name || newPin.length !== 4) return;
    if (members.some((m) => m.name === name)) {
      setError("이미 사용 중인 이름이에요");
      return;
    }
    setAdding(true);
    setError(null);
    try {
      onSelected(await addMember(client, groupId, name, newPin));
    } catch (e) {
      setError(
        e instanceof Error && e.message === DUPLICATE_NAME_ERROR
          ? "이미 사용 중인 이름이에요. 다른 이름을 입력해주세요."
          : "이름 추가에 실패했어요. 다시 시도해주세요.",
      );
      setAdding(false);
    }
  }

  return (
    <main className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center gap-10 px-6 py-16">
      <header className="anim-rise text-center">
        <p className="font-mono text-[11px] uppercase tracking-[0.3em] text-faint">
          {groupName}
        </p>
        <h1 className="mt-4 font-display text-3xl font-semibold leading-tight text-ink">
          본인 이름을
          <br />
          선택하세요
        </h1>
      </header>

      {members.length > 0 && (
        <ul className="flex flex-col gap-2">
          {members.map((member) => (
            <li key={member.id}>
              {pinTarget === member.id ? (
                <div className="flex flex-col gap-2 rounded-xl border border-accent bg-surface px-5 py-4 shadow-sm">
                  <p className="text-sm font-medium text-ink">
                    {member.name} 님의 PIN을 입력하세요
                  </p>
                  <div className="flex gap-2">
                    <input
                      type="password"
                      inputMode="numeric"
                      maxLength={4}
                      autoFocus
                      value={pinValue}
                      onChange={(e) =>
                        setPinValue(e.target.value.replace(/\D/g, "").slice(0, 4))
                      }
                      className="h-11 flex-1 rounded-lg border border-line bg-paper px-3 text-base tracking-[0.3em] text-ink focus:border-accent focus:outline-none"
                    />
                    <button
                      type="button"
                      onClick={closePinForm}
                      className="h-11 shrink-0 rounded-lg border border-line-strong px-3 text-sm text-ink-soft transition hover:border-accent hover:text-ink"
                    >
                      취소
                    </button>
                    <button
                      type="button"
                      onClick={() => handleVerifyPin(member)}
                      disabled={pinValue.length !== 4 || verifying}
                      className="h-11 shrink-0 rounded-lg bg-accent px-4 text-sm font-semibold text-surface shadow-sm transition hover:bg-accent/90 disabled:opacity-30"
                    >
                      확인
                    </button>
                  </div>
                  {pinError && <p className="text-sm text-skip">{pinError}</p>}
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => handleMemberClick(member)}
                  className="group flex h-14 w-full items-center justify-between rounded-xl border border-line bg-surface px-5 text-base font-medium text-ink shadow-sm transition hover:border-accent hover:shadow-md active:scale-[0.99]"
                >
                  <span>{member.name}</span>
                  <span className="font-mono text-ink-soft opacity-0 transition group-hover:opacity-100">
                    →
                  </span>
                </button>
              )}
            </li>
          ))}
        </ul>
      )}

      <form onSubmit={handleAdd} className="flex flex-col gap-2">
        <label
          htmlFor="new-name"
          className="font-mono text-[11px] uppercase tracking-[0.2em] text-ink-soft"
        >
          명단에 없나요? 이름 추가
        </label>
        <input
          id="new-name"
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          placeholder="이름 입력"
          maxLength={20}
          autoComplete="off"
          className="h-14 w-full rounded-xl border border-line bg-surface px-4 text-base text-ink shadow-sm transition placeholder:text-faint focus:border-accent focus:outline-none focus:ring-4 focus:ring-accent/25"
        />
        <div className="flex gap-2">
          <input
            id="new-pin"
            value={newPin}
            onChange={(e) =>
              setNewPin(e.target.value.replace(/\D/g, "").slice(0, 4))
            }
            placeholder="PIN 4자리"
            inputMode="numeric"
            maxLength={4}
            autoComplete="off"
            className="h-14 flex-1 rounded-xl border border-line bg-surface px-4 text-base tracking-[0.3em] text-ink shadow-sm transition placeholder:text-faint focus:border-accent focus:outline-none focus:ring-4 focus:ring-accent/25"
          />
          <button
            type="submit"
            disabled={!newName.trim() || newPin.length !== 4 || adding}
            className="h-14 shrink-0 rounded-xl bg-accent px-6 text-base font-semibold text-surface shadow-sm transition hover:bg-accent/90 active:scale-[0.99] disabled:opacity-30"
          >
            추가
          </button>
        </div>
        {error && <p className="text-sm text-skip">{error}</p>}
      </form>
    </main>
  );
}
```

- [ ] **Step 2: 타입체크 + 린트**

Run: `npx tsc --noEmit && npm run lint`
Expected: 에러 없음.

- [ ] **Step 3: Commit**

```bash
git add src/components/NameGate.tsx
git commit -m "feat: 이름 게이트에 PIN 입력/검증 UI 추가"
```

---

### Task 4: `SettingsModal` — 멤버 PIN 관리 + 이름 중복 에러

**Files:**
- Modify: `src/components/SettingsModal.tsx:1-9` (imports)
- Modify: `src/components/SettingsModal.tsx:198-299` (`MemberRow` 함수 전체 교체)

- [ ] **Step 1: import 추가**

`src/components/SettingsModal.tsx` 상단의 import를 수정:

```tsx
import { updateMemberName, deactivateMember, setMemberPin, DUPLICATE_NAME_ERROR } from "@/lib/members";
```

(기존 `import { updateMemberName, deactivateMember } from "@/lib/members";` 한 줄을 교체)

- [ ] **Step 2: `MemberRow` 함수 전체 교체**

`src/components/SettingsModal.tsx:198-299`의 `MemberRow` 함수 전체를 다음으로 교체:

```tsx
// 멤버 1명 행: 이름 수정 / PIN 관리 / 비활성화.
function MemberRow({
  member,
  onChanged,
}: {
  member: Member;
  onChanged: () => void;
}) {
  const { client } = useGroupSession();
  const [mode, setMode] = useState<"view" | "name" | "pin">("view");
  const [name, setName] = useState(member.name);
  const [nameError, setNameError] = useState<string | null>(null);
  const [pin, setPin] = useState("");
  const [pinError, setPinError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  function resetToView() {
    setMode("view");
    setName(member.name);
    setNameError(null);
    setPin("");
    setPinError(null);
  }

  async function handleSaveName(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed || trimmed === member.name) {
      resetToView();
      return;
    }
    setBusy(true);
    setNameError(null);
    try {
      await updateMemberName(client, member.id, trimmed);
      setMode("view");
      onChanged();
    } catch (e) {
      setNameError(
        e instanceof Error && e.message === DUPLICATE_NAME_ERROR
          ? "이미 사용 중인 이름이에요."
          : "수정에 실패했어요.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function handleSavePin(e: React.FormEvent) {
    e.preventDefault();
    if (pin.length !== 4) return;
    setBusy(true);
    setPinError(null);
    try {
      await setMemberPin(client, member.id, pin);
      setMode("view");
      setPin("");
      onChanged();
    } catch {
      setPinError("저장에 실패했어요. 다시 시도해주세요.");
    } finally {
      setBusy(false);
    }
  }

  async function handleRemovePin() {
    if (
      !window.confirm(
        "PIN을 제거할까요? 이후 명단에서 선택 시 PIN 확인 없이 선택할 수 있어요.",
      )
    )
      return;
    setBusy(true);
    setPinError(null);
    try {
      await setMemberPin(client, member.id, null);
      setMode("view");
      onChanged();
    } catch {
      setPinError("제거에 실패했어요. 다시 시도해주세요.");
    } finally {
      setBusy(false);
    }
  }

  async function handleDeactivate() {
    if (!window.confirm(`"${member.name}" 님을 명단에서 비활성화할까요?`))
      return;
    setBusy(true);
    try {
      await deactivateMember(client, member.id);
      onChanged();
    } finally {
      setBusy(false);
    }
  }

  if (mode === "name") {
    return (
      <li>
        <form onSubmit={handleSaveName} className="flex items-center gap-2">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={20}
            autoFocus
            className="h-11 flex-1 rounded-xl border border-line bg-paper px-3 text-base text-ink transition focus:border-accent focus:bg-surface focus:outline-none"
          />
          <button
            type="button"
            onClick={resetToView}
            className="h-11 shrink-0 rounded-lg border border-line-strong px-3 text-sm text-ink-soft transition hover:border-accent hover:text-ink"
          >
            취소
          </button>
          <button
            type="submit"
            disabled={!name.trim() || busy}
            className="h-11 shrink-0 rounded-lg bg-accent px-4 text-sm font-semibold text-surface shadow-sm transition hover:bg-accent/90 disabled:opacity-30"
          >
            저장
          </button>
        </form>
        {nameError && <p className="mt-1 text-sm text-skip">{nameError}</p>}
      </li>
    );
  }

  if (mode === "pin") {
    return (
      <li>
        <form onSubmit={handleSavePin} className="flex items-center gap-2">
          <span className="shrink-0 text-sm text-ink-soft">PIN</span>
          <input
            value={pin}
            onChange={(e) => setPin(e.target.value.replace(/\D/g, "").slice(0, 4))}
            placeholder="4자리"
            inputMode="numeric"
            maxLength={4}
            autoFocus
            className="h-11 flex-1 rounded-xl border border-line bg-paper px-3 text-base tracking-[0.3em] text-ink transition focus:border-accent focus:bg-surface focus:outline-none"
          />
          <button
            type="button"
            onClick={resetToView}
            className="h-11 shrink-0 rounded-lg border border-line-strong px-3 text-sm text-ink-soft transition hover:border-accent hover:text-ink"
          >
            취소
          </button>
          {member.has_pin && (
            <button
              type="button"
              onClick={handleRemovePin}
              disabled={busy}
              className="h-11 shrink-0 rounded-lg px-2 text-sm text-skip transition hover:bg-skip-soft"
            >
              PIN 제거
            </button>
          )}
          <button
            type="submit"
            disabled={pin.length !== 4 || busy}
            className="h-11 shrink-0 rounded-lg bg-accent px-4 text-sm font-semibold text-surface shadow-sm transition hover:bg-accent/90 disabled:opacity-30"
          >
            저장
          </button>
        </form>
        {pinError && <p className="mt-1 text-sm text-skip">{pinError}</p>}
      </li>
    );
  }

  return (
    <li className="flex items-center justify-between gap-2 rounded-xl border border-line bg-paper px-4 py-2.5">
      <div className="flex flex-col gap-0.5 truncate">
        <span className="truncate text-sm font-medium text-ink">
          {member.name}
        </span>
        <span className="font-mono text-[10px] uppercase tracking-[0.15em] text-faint">
          {member.has_pin ? "PIN 설정됨" : "PIN 없음"}
        </span>
      </div>
      <div className="flex shrink-0 gap-1">
        <button
          type="button"
          onClick={() => setMode("name")}
          disabled={busy}
          className="h-9 rounded-lg px-2 text-sm text-ink-soft transition hover:bg-surface hover:text-ink"
        >
          수정
        </button>
        <button
          type="button"
          onClick={() => setMode("pin")}
          disabled={busy}
          className="h-9 rounded-lg px-2 text-sm text-ink-soft transition hover:bg-surface hover:text-ink"
        >
          PIN
        </button>
        <button
          type="button"
          onClick={handleDeactivate}
          disabled={busy}
          className="h-9 rounded-lg px-2 text-sm text-skip transition hover:bg-skip-soft"
        >
          비활성화
        </button>
      </div>
    </li>
  );
}
```

- [ ] **Step 3: 타입체크 + 린트**

Run: `npx tsc --noEmit && npm run lint`
Expected: 에러 없음.

- [ ] **Step 4: Commit**

```bash
git add src/components/SettingsModal.tsx
git commit -m "feat: 설정 화면에 멤버 PIN 관리 및 이름 중복 에러 처리 추가"
```

---

### Task 5: `CLAUDE.md` 갱신

**Files:**
- Modify: `CLAUDE.md` ("RPC 경유 쓰기" 절, "데이터 모델" 절)

- [ ] **Step 1: "RPC 경유 쓰기" 절에 새 RPC 3개 추가**

`materialize_recurring_event` 설명 불릿 뒤에 아래 3개 불릿을 추가:

```markdown
- `add_member(p_group_id, p_name, p_color, p_pin)` — 신규 멤버 추가(PIN 4자리 숫자 필수). 이름 중복 시 `members_group_name_active_unique_idx` 위반(`23505`)이 그대로 전달된다. 정의: `0007_member_pin.sql`.
- `verify_member_pin(p_member_id, p_pin)` — 명단에서 본인 선택 시 PIN 검증(`pin_hash`가 없으면 항상 true). `check_request`(0006)의 IP당 10분 20회 rate limit 대상에 포함(PIN 전수조사 방어). 정의: `0007_member_pin.sql`.
- `set_member_pin(p_member_id, p_pin)` — 설정 화면에서 PIN 등록/변경/제거(`p_pin = null`이면 제거). 정의: `0007_member_pin.sql`.
```

- [ ] **Step 2: "데이터 모델" 절에 PIN/닉네임 unique index 설명 추가**

헤더 줄을 교체:

```diff
-**데이터 모델** (`supabase/migrations/0001_init.sql`, `0004_members_active.sql`, 타입: `src/lib/supabase/types.ts`)
+**데이터 모델** (`supabase/migrations/0001_init.sql`, `0004_members_active.sql`, `0007_member_pin.sql`, 타입: `src/lib/supabase/types.ts`)
```

그리고 `members.active` 설명 불릿(`- \`members.active\` — 멤버 비활성화(보존) 플래그, ... (\`deactivateMember\`).`) 바로 뒤에 아래 불릿을 추가:

```markdown
- `members.pin_hash`/`has_pin` — 멤버별 PIN(이름 사칭 방지). `pin_hash`는 `crypt()`로 해시 저장되며 anon에 노출되지 않는다(컬럼 권한 제한). `has_pin`은 `pin_hash is not null`의 generated column으로 명단 응답에 포함되어 클라이언트가 "PIN 필요" 여부를 판단한다. 멤버 추가는 `add_member` RPC 경유만 가능(anon의 직접 insert 권한 회수).
- `members(group_id, name) where active = true` unique index — 그룹 내 활성 멤버 닉네임 중복(trim 후 정확히 일치) 방지. 비활성화(`active=false`)된 멤버의 이름은 재사용 가능.
```

- [ ] **Step 3: Commit**

```bash
git add CLAUDE.md
git commit -m "docs: PIN/닉네임 중복 방지 RPC 및 데이터 모델 변경사항 반영"
```

---

### Task 6: 수동 통합 검증

**Files:** 없음 (UI 동작 검증)

- [ ] **Step 1: 개발 서버 실행**

Run: `npm run dev` (백그라운드)

- [ ] **Step 2: 시나리오 체크리스트 실행**

브라우저에서 그룹 페이지(`/{joinCode}`)에 접속해 다음을 확인한다 (`docs/superpowers/specs/2026-06-12-member-pin-design.md` 검증 절 1-10번과 동일):

1. "이름 추가" — 이름 또는 PIN(4자리) 중 하나라도 비어 있으면 "추가" 버튼 비활성화.
2. 이름 + 4자리 PIN 입력 → 멤버 생성 → 설정 화면에 "PIN 설정됨" 표시.
3. 같은 이름으로 추가 시도 → 즉시(클라이언트 측) "이미 사용 중인 이름이에요" 에러.
4. 시크릿 창에서 명단의 PIN 설정된 멤버 선택:
   - 틀린 PIN → "PIN이 일치하지 않아요", 재시도 가능.
   - 올바른 PIN → 홈 진입 + localStorage에 `member_id` 저장.
5. PIN 없는 기존 멤버(Task 1에서 만든 `민수`류) 선택 → 즉시 진입(변화 없음).
6. 설정 화면에서 PIN 없는 멤버에 "PIN" 클릭 → 4자리 입력/저장 → "PIN 설정됨"으로 표시 변경.
7. 설정 화면에서 "PIN" 클릭 → 새 PIN으로 저장 → 명단에서 새 PIN으로 검증 성공.
8. 설정 화면에서 "PIN 제거" → "PIN 없음"으로 변경 → 명단에서 해당 멤버 선택 시 PIN 묻지 않음.
9. 설정 화면에서 멤버 이름을 다른 활성 멤버와 동일하게 수정 시도 → "이미 사용 중인 이름이에요." 에러.
10. 비활성화된 멤버 이름과 동일한 이름으로 새 멤버 추가 → 성공(재사용 허용).

- [ ] **Step 3: 개발 서버 종료**

검증 완료 후 백그라운드 dev 서버 프로세스를 종료한다.
