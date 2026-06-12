# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

@AGENTS.md

> ⚠️ Next.js 16 / React 19 / Tailwind v4 — APIs와 컨벤션이 학습 데이터와 다를 수 있다. 코드를 쓰기 전에 `node_modules/next/dist/docs/` 의 해당 가이드를 먼저 읽는다 (AGENTS.md 규칙).

## 프로젝트

소모임용 참석 공유 웹앱. 회원가입 없이 참가 코드(또는 링크) → 이름 선택만으로 사용하며, 월간 달력에서 날짜별 참석/불참/미정을 탭으로 표시한다. 타깃은 5명 내외 소모임. 한국어 UI, 타임존 Asia/Seoul 고정.

## 명령어

```bash
npm run dev     # 개발 서버 (localhost:3000)
npm run build   # 프로덕션 빌드
npm run lint    # ESLint (eslint-config-next, core-web-vitals + typescript)
```

테스트 러너는 아직 없다.

## 아키텍처

**인증 없는 share_token 기반 접근 통제** — 이 앱의 핵심 설계.

- 정식 로그인이 없다. 브라우저는 **anon 키**로 Supabase에 접근한다 (`src/lib/supabase/client.ts`, `persistSession: false`).
- 그룹 격리는 두 토큰으로 한다 (`groups` 테이블):
  - `join_code` — 사람이 입력하는 6자리 별칭(혼동 문자 0/O/1/I 제외). 입력 편의용일 뿐 권한이 아니다.
  - `share_token` — 추측 불가한 긴 랜덤. **실제 접근 통제 단위.**
- 입장 흐름: `join_code` 입력 → `resolve_group()` RPC가 `share_token` 반환 → `createScopedClient(shareToken)`(`src/lib/supabase/client.ts`)이 모든 요청에 `x-share-token` 헤더를 붙인 클라이언트를 생성 → `GroupSessionProvider`/`useGroupSession()`(`src/lib/groupSession.tsx`)으로 하위 컴포넌트에 전달. RLS는 이 헤더로 그룹을 스코프한다(`0005_share_token_rls.sql`).
- 멤버 식별은 `member_id`를 **localStorage**에 저장해 재진입 시 자동 통과(로그인 대체).

**RPC 경유 쓰기 (SECURITY DEFINER)** — 정의: `0002_rls_and_rpc.sql`. RLS를 우회해야 하는 작업은 anon이 직접 INSERT하지 말고 RPC로 추가한다.

- `create_group(p_name)` — 그룹 생성 + `join_code`/`share_token` 발급. join_code 충돌 시 루프 재시도.
- `resolve_group(p_join_code)` — join_code → share_token 매핑. IP당 10분 20회 rate limit(`0006_resolve_group_rate_limit.sql`의 `check_request` pre-request 훅, brute-force 대응).
- `materialize_recurring_event(p_schedule_id, p_event_date)` — 정기 가상 occurrence → 실제 `events` 행 생성(Lazy materialize). 부분 고유 인덱스 + `ON CONFLICT`로 멱등. 정의: `0003_recurring.sql`, `0005_share_token_rls.sql`에서 share_token 검증 추가(요청 헤더와 schedule의 group_id 불일치 시 거부).
- `add_member(p_group_id, p_name, p_color, p_pin)` — 신규 멤버 추가(PIN 4자리 숫자 필수). 이름 중복 시 `members_group_name_active_unique_idx` 위반(`23505`)이 그대로 전달된다. 정의: `0007_member_pin.sql`.
- `verify_member_pin(p_member_id, p_pin)` — 명단에서 본인 선택 시 PIN 검증(`pin_hash`가 없으면 항상 true). `check_request`(0006)의 IP당 10분 20회 rate limit 대상에 포함(PIN 전수조사 방어). 정의: `0007_member_pin.sql`.
- `set_member_pin(p_member_id, p_pin)` — 설정 화면에서 PIN 등록/변경/제거(`p_pin = null`이면 제거). 정의: `0007_member_pin.sql`.

**RLS — share_token 스코프 적용 완료** (`0005_share_token_rls.sql`)

- `0002_rls_and_rpc.sql`의 `dev_*`(anon 전체 접근) 정책은 제거됨. 현재는 `x-share-token` 헤더 → `private.current_group_id()`(SECURITY DEFINER, `private` 스키마는 Data API에 미노출)로 그룹을 식별해 모든 테이블을 스코프한다. `attendances`/`comments`는 `events` RLS를 통해 간접 스코프.
- ⚠️ `check_request`(0006)의 EXECUTE 권한은 anon/authenticated에 유지해야 한다 — PostgREST가 db_pre_request 훅을 요청 역할로 호출하므로 회수 시 모든 요청이 42501로 실패한다(advisor의 SECURITY DEFINER WARN은 의도된 동작).

**데이터 모델** (`supabase/migrations/0001_init.sql`, `0004_members_active.sql`, `0007_member_pin.sql`, 타입: `src/lib/supabase/types.ts`)

- `groups` → `members` / `recurring_schedules` / `events` (모두 group_id FK, ON DELETE CASCADE)
- `members.active` — 멤버 비활성화(보존) 플래그, 기본 true. 삭제 대신 `active=false`로 명단/달력에서만 숨기고 기존 attendances/comments는 FK 그대로 보존(`deactivateMember`).
- `members.pin_hash`/`has_pin` — 멤버별 PIN(이름 사칭 방지). `pin_hash`는 `crypt()`로 해시 저장되며 anon에 노출되지 않는다(컬럼 권한 제한). `has_pin`은 `pin_hash is not null`의 generated column으로 명단 응답에 포함되어 클라이언트가 "PIN 필요" 여부를 판단한다. 멤버 추가는 `add_member` RPC 경유만 가능(anon의 직접 insert 권한 회수).
- `members(group_id, name) where active = true` unique index — 그룹 내 활성 멤버 닉네임 중복(trim 후 정확히 일치) 방지. 비활성화(`active=false`)된 멤버의 이름은 재사용 가능.
- `recurring_schedules` — 정기 일정 "규칙". 요일 1개당 1행. 실제 `events` 행은 만들지 않는다.
- `events` — 실제 일정 인스턴스. `source`가 `adhoc`(단발) 또는 `recurring`. 정기 일정은 **Lazy materialize**: 가상 occurrence로 달력에 표시하다가, 첫 참석/메모 시점에만 `events` 행을 생성한다(`source='recurring'`, `schedule_id` 연결). 동시 생성 중복은 `(group_id, schedule_id, event_date)` 고유 인덱스 + upsert로 멱등 처리.
- `attendances` — 멤버×일정당 1행, `UNIQUE(event_id, member_id)`. 상태는 `going`/`not_going`/`maybe`(기본 maybe). 상태 변경은 upsert.
- `comments` — 일정별 한줄 메모. `lib/comments.ts` + `EventCard` 메모 섹션으로 구현 완료.

## 컨벤션

- 데이터 접근은 `src/lib/<도메인>.ts`(events/attendances/occurrences/members/comments/recurringSchedules 등)에 도메인별로 모은다. 함수는 `client: SupabaseClient`(`useGroupSession().client` — share_token 스코프 클라이언트)를 첫 인자로 받고, `group_id` 필터도 함께 건다(RLS와 별개의 defense-in-depth). 정기/비정기 통합 뷰모델은 `lib/occurrences.ts`의 `CardOccurrence`.
- import 경로 alias: `@/*` → `src/*` (tsconfig).
- 마이그레이션은 `supabase/migrations/NNNN_*.sql` 순번으로 추가한다. Supabase MCP 도구(`apply_migration`, `execute_sql` 등) 또는 CLI로 적용.
- DB 스키마를 바꾸면 `src/lib/supabase/types.ts`도 갱신한다(현재 수기 작성, 추후 `supabase gen types`로 자동화 가능).
- 환경변수: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` (`.env.local`, 미설정 시 client.ts가 throw).
- 코드 주석/문구/커밋 메시지는 한국어. PRD 장 번호를 근거로 인용하는 패턴을 따른다(예: "PRD 7장 데이터 모델").
