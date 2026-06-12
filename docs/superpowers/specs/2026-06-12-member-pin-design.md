# 설계: 멤버별 PIN(이름 사칭 방지) + 닉네임 중복 방지

> 작성일: 2026-06-12

## 배경

PRD 10장 "보안/프라이버시 고려"와 11장 "범위 밖"에서 "로그인 부재로 인한 이름 사칭"을
낮은 리스크로 수용하되, 필요 시 후속으로 멤버별 4자리 PIN을 추가하기로 했다. 이번 작업은
그 후속 조치로, (1) 멤버별 PIN을 도입해 명단에서 본인 선택 시 본인 확인을 강화하고,
(2) 그룹 내 닉네임 중복을 막아 식별 혼동을 줄인다. 로그인 없는 구조(`share_token` +
localStorage `member_id`)는 그대로 유지한다.

## 범위 / 정책

- **PIN 필수**: 새 멤버 추가 시 4자리 숫자 PIN 입력이 필수다.
- **기존 멤버 / 분실 대응**: 이 기능 적용 전에 등록된 멤버는 PIN이 없는 상태로 남는다.
  그룹 설정 화면에서 PIN을 새로 등록/변경/제거할 수 있다. 같은 모임의 다른 멤버가
  PIN을 제거(초기화)해줄 수 있다 — 기존 "누구나 다른 멤버 이름 수정/비활성화 가능"한
  신뢰 모델과 동일선상.
- **닉네임 중복**: 그룹 내 **활성 멤버** 기준, trim 후 **정확히 일치(대소문자 구분)**하는
  이름은 1개만 허용. 비활성화(`active=false`)된 멤버의 이름은 새 멤버가 재사용할 수 있다.
- PIN은 명단에서 "본인 선택" 시에만 검증한다. localStorage에 `member_id`가 저장된
  재진입(자동 통과)에는 영향 없음 — PIN은 "다른 사람이 내 이름을 고르는 것"을 막는다.

## A. 데이터 모델 + 서버 로직 (`supabase/migrations/0007_member_pin.sql`)

### 스키마

```sql
alter table members add column if not exists pin_hash text;
alter table members add column if not exists has_pin boolean
  generated always as (pin_hash is not null) stored;

create unique index if not exists members_group_name_active_unique_idx
  on members(group_id, name) where active = true;
```

- `pin_hash`: `crypt(pin, gen_salt('bf'))`로 저장(pgcrypto, 0001에서 이미 활성화).
  클라이언트에 절대 노출하지 않는다.
- `has_pin`: `pin_hash is not null`을 노출하는 generated column. 명단 응답에 포함해
  클라이언트가 "이 멤버는 PIN 필요"를 판단.
- 닉네임 unique index는 `active = true`인 행에만 적용 — 비활성 멤버 이름 재사용 허용.

### 권한(grant) 변경

```sql
revoke select, insert on members from anon;
grant select (id, group_id, name, color, active, created_at, has_pin) on members to anon;
```

- 기존 `grant select, insert, update (name, active) on members to anon`은 `select`/`insert`가
  컬럼 제한 없이 전체 컬럼에 적용되어 있었다. `pin_hash` 컬럼 추가 후 그대로 두면
  anon이 해시를 직접 읽거나, INSERT 시 임의의 `pin_hash`를 써넣을 수 있어 위험하다.
- `update (name, active)`는 그대로 유지(이름 수정/비활성화는 기존처럼 직접 UPDATE).
- 멤버 추가는 이제 RPC(`add_member`)로만 — anon에게 `insert` 권한 자체가 필요 없다.

### RPC: `add_member`

```sql
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
```

- 이름 중복 시 `members_group_name_active_unique_idx` 위반으로 `23505`가 그대로
  PostgREST 응답에 전달된다 — 클라이언트에서 `error.code === '23505'`로 판별.
- 반환 컬럼에 `pin_hash`를 포함하지 않음(SECURITY DEFINER 함수의 리턴값은 호출자의
  컬럼 권한과 무관하게 그대로 직렬화되므로, `returning *` 대신 명시적 컬럼 목록 사용).

### RPC: `verify_member_pin`

```sql
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
```

### RPC: `set_member_pin` (설정 화면 — 등록/변경/제거)

```sql
create or replace function set_member_pin(
  p_member_id uuid,
  p_pin       text  -- null 이면 PIN 제거
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
```

### `check_request` 확장 (PIN brute-force 대응)

0006의 IP당 10분 20회 제한을 `verify_member_pin`에도 적용(4자리 PIN 전수조사 방어).
함수 본문의 경로 체크만 수정(`create or replace`):

```sql
if req_path is distinct from 'rpc/resolve_group'
   and req_path is distinct from 'rpc/verify_member_pin' then
  return;
end if;
```

나머지 로직(rate_limits 테이블, 카운트, 429 응답)은 0006과 동일하게 재사용.

## B. 클라이언트 lib + 타입 (`src/lib/supabase/types.ts`, `src/lib/members.ts`)

- `Member`에 `has_pin: boolean` 추가. `pin_hash`는 타입에 두지 않음(서버 전용).
- `listMembers`: `select("*")` → `select("id, group_id, name, color, active, created_at, has_pin")`
  (anon이 `pin_hash` 컬럼 권한이 없어 `*`는 실패).
- `addMember(client, groupId, name, pin)`: 직접 INSERT 대신
  `client.rpc("add_member", { p_group_id, p_name, p_color: pickColor(), p_pin: pin }).single()`.
- 신규 `verifyMemberPin(client, memberId, pin): Promise<boolean>` —
  `client.rpc("verify_member_pin", { p_member_id, p_pin })`.
- 신규 `setMemberPin(client, memberId, pin: string | null): Promise<void>` —
  `client.rpc("set_member_pin", { p_member_id, p_pin: pin })`.
- `export const DUPLICATE_NAME_ERROR = "DUPLICATE_NAME";`
  - `addMember`, `updateMemberName`에서 `error.code === "23505"`이면
    `throw new Error(DUPLICATE_NAME_ERROR)`, 그 외에는 원래 에러를 그대로 던짐.

## C. NameGate (이름 게이트) UI

**"이름 추가" 폼**

- 이름 입력 옆/아래에 PIN 입력 추가: 4자리 숫자, 필수,
  `inputMode="numeric"`, `maxLength={4}`, `type="text"`(설정 중에는 그대로 보여줌 —
  별도 확인 입력란 없음, 분실 시 설정 화면에서 다른 멤버가 초기화 가능).
- "추가" 버튼 활성 조건에 `pin.length === 4` 추가.
- 제출 전, 이미 받아온 `members` 목록과 trim 후 정확히 일치하는 이름이 있으면
  RPC 호출 없이 즉시 "이미 사용 중인 이름이에요" 표시. DB unique index는
  동시 등록 race의 최종 방어선.
- `addMember` 에러 처리:
  - `e.message === DUPLICATE_NAME_ERROR` → "이미 사용 중인 이름이에요. 다른 이름을 입력해주세요."
  - 그 외 → 기존 문구("이름 추가에 실패했어요. 다시 시도해주세요.") 유지.

**명단에서 본인 선택**

- `member.has_pin === false`: 클릭 시 바로 `onSelected(member)` (기존 동작 유지).
- `member.has_pin === true`: 클릭한 항목이 PIN 입력 폼으로 인라인 확장(새 모달/컴포넌트
  없이 NameGate 내부 state로 처리: `pinTarget`, `pinValue`, `pinError`, `verifying`).
  - `type="password"`, 4자리 숫자 입력 + "확인"/"취소" 버튼.
  - "확인" → `verifyMemberPin(client, member.id, pin)`:
    - `true` → `onSelected(member)`
    - `false` → "PIN이 일치하지 않아요" 인라인 에러, 재입력 허용
      (시도 횟수 제한은 서버 rate limit에 위임)
  - "취소" 또는 다른 멤버 클릭 → 확장 폼 닫힘/대상 전환

## D. SettingsModal — 멤버 PIN 관리

**`MemberRow` 변경**

- 기존 `editing: boolean`을 `mode: "view" | "name" | "pin"`으로 일반화(상호 배타적
  인라인 편집).
- 행에 PIN 상태 텍스트 표시: "PIN 설정됨" / "PIN 없음".
- 버튼: `[수정]`(이름) `[PIN]` `[비활성화]`.
- `[PIN]` 클릭 → 인라인 PIN 폼:
  - `PIN [____4자리, type="text", inputMode="numeric"____] [취소] [저장]`
  - `has_pin === true`면 "PIN 제거" 버튼도 표시.
  - 저장 → `setMemberPin(client, member.id, pin)`, 성공 시 `onChanged()`로 목록 재조회
    (`has_pin` 갱신).
  - PIN 제거 → `window.confirm("PIN을 제거할까요? 이후 명단에서 선택 시 PIN 확인 없이 선택할 수 있어요.")`
    → `setMemberPin(client, member.id, null)`.

**이름 수정 에러 처리 추가**

- 현재 `handleSave`(이름 수정)는 에러를 전혀 처리하지 않음. unique index 추가 후
  중복 이름으로 저장 시 `23505`가 발생할 수 있다.
- `try/catch` + 인라인 에러 상태 추가:
  - `e.message === DUPLICATE_NAME_ERROR` → "이미 사용 중인 이름이에요."
  - 그 외 → "수정에 실패했어요."

## 기타 변경

- `CLAUDE.md`의 "RPC 경유 쓰기" 목록과 "데이터 모델" 절에 `add_member` /
  `verify_member_pin` / `set_member_pin`, `members.pin_hash`/`has_pin`,
  닉네임 unique index를 반영한다.

## 검증 (수동, 테스트 러너 없음)

1. "이름 추가" — PIN 미입력 시 "추가" 버튼 비활성화.
2. 이름 + 4자리 PIN 입력 → 멤버 생성, 설정 화면에 "PIN 설정됨" 표시.
3. 같은 이름으로 추가 시도 → 즉시(클라이언트 측) "이미 사용 중인 이름이에요" 에러.
4. 시크릿 창에서 명단의 PIN 설정된 멤버 선택:
   - 틀린 PIN → "PIN이 일치하지 않아요", 재시도 가능.
   - 올바른 PIN → 홈 진입 + localStorage에 `member_id` 저장.
5. PIN 없는 기존 멤버 선택 → 즉시 진입(변화 없음).
6. 설정 화면에서 PIN 없는 멤버에 "PIN 설정" → 4자리 입력/저장 → "PIN 설정됨"으로 표시 변경.
7. 설정 화면에서 "PIN 변경" → 새 PIN으로 명단에서 검증 성공.
8. 설정 화면에서 "PIN 제거" → "PIN 없음"으로 변경 → 명단에서 해당 멤버 선택 시 PIN 묻지 않음.
9. 설정 화면에서 멤버 이름을 다른 활성 멤버와 동일하게 수정 시도 → "이미 사용 중인 이름이에요" 에러.
10. 비활성화된 멤버 이름과 동일한 이름으로 새 멤버 추가 → 성공(재사용 허용).
