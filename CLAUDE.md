# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

@AGENTS.md

> ⚠️ Next.js 16 / React 19 / Tailwind v4 — APIs와 컨벤션이 학습 데이터와 다를 수 있다. 코드를 쓰기 전에 `node_modules/next/dist/docs/` 의 해당 가이드를 먼저 읽는다 (AGENTS.md 규칙).

## 프로젝트

소모임용 참석 공유 웹앱. 회원가입 없이 참가 코드(또는 링크) → 이름 선택만으로 사용하며, 월간 달력에서 날짜별 참석/불참/미정을 탭으로 표시한다. 타깃은 5명 내외 소모임. 한국어 UI, 타임존 Asia/Seoul 고정.

- `docs/PRD.md` — 제품 요구사항(기능 F1~F7, 데이터 모델, 보류 질문)
- `docs/ROADMAP.md` — Phase 0~4 태스크. **현재 Phase 1~3(그룹/입장/달력·참석·정기일정·메모) 완료, Phase 4(보안 마감·QA·배포)만 잔존.** 기능 작업 전 해당 Phase 태스크를 기준으로 삼는다.

## 명령어

```bash
npm run dev     # 개발 서버 (localhost:3000)
npm run build   # 프로덕션 빌드
npm run lint    # ESLint (eslint-config-next, core-web-vitals + typescript)
```

테스트 러너는 아직 없다.

## 아키텍처

**인증 없는 share_token 기반 접근 통제** — 이 앱의 핵심 설계.

- 정식 로그인이 없다. 브라우저는 **anon 키**로 Supabase에 직접 접근한다 (`src/lib/supabase/client.ts`, `persistSession: false`).
- 그룹 격리는 두 토큰으로 한다 (`groups` 테이블):
  - `join_code` — 사람이 입력하는 6자리 별칭(혼동 문자 0/O/1/I 제외). 입력 편의용일 뿐 권한이 아니다.
  - `share_token` — 추측 불가한 긴 랜덤. **실제 접근 통제 단위.**
- 입장 흐름: 사용자가 `join_code` 입력 → `resolve_group()` RPC가 `share_token` 반환 → 이후 데이터 접근은 `share_token` 스코프로 제한.
- 멤버 식별은 `member_id`를 **localStorage**에 저장해 재진입 시 자동 통과(로그인 대체).

**RPC 경유 쓰기 (SECURITY DEFINER)**

- `create_group(p_name)` — 그룹 생성 + `join_code`/`share_token` 발급. join_code 충돌 시 루프 재시도.
- `resolve_group(p_join_code)` — join_code → share_token 매핑.
- `materialize_recurring_event(p_schedule_id, p_event_date)` — 정기 가상 occurrence → 실제 `events` 행 생성(Lazy materialize). 부분 고유 인덱스 + `ON CONFLICT` 로 멱등. 정의: `0003_recurring.sql`.
- 정의: `supabase/migrations/0002_rls_and_rpc.sql`. RLS를 우회해야 하는 작업은 anon이 직접 INSERT하지 말고 RPC로 추가한다.

**⚠️ RLS는 아직 개발용 임시 상태** — `0002_rls_and_rpc.sql`의 `dev_*` 정책은 anon에게 전체 테이블 접근을 허용한다. Phase 4에서 `share_token` 스코프 정책으로 교체하고 `resolve_group`에 rate limit을 적용해야 한다(brute-force 대응). 이 전에는 그룹 간 데이터가 격리되지 않음을 전제로 작업한다.

**데이터 모델** (`supabase/migrations/0001_init.sql`, 타입: `src/lib/supabase/types.ts`)

- `groups` → `members` / `recurring_schedules` / `events` (모두 group_id FK, ON DELETE CASCADE)
- `recurring_schedules` — 정기 일정 "규칙". 요일 1개당 1행. 실제 `events` 행은 만들지 않는다.
- `events` — 실제 일정 인스턴스. `source`가 `adhoc`(단발) 또는 `recurring`. 정기 일정은 **Lazy materialize**: 가상 occurrence로 달력에 표시하다가, 첫 참석/메모 시점에만 `events` 행을 생성한다(`source='recurring'`, `schedule_id` 연결). 동시 생성 중복은 `(group_id, schedule_id, event_date)` 고유 인덱스 + upsert로 멱등 처리.
- `attendances` — 멤버×일정당 1행, `UNIQUE(event_id, member_id)`. 상태는 `going`/`not_going`/`maybe`(기본 maybe). 상태 변경은 upsert.
- `comments` — 일정별 한줄 메모. `lib/comments.ts` + `EventCard` 메모 섹션으로 구현 완료.

## 컨벤션

- 데이터 접근은 `src/lib/<도메인>.ts`(events/attendances/occurrences/members/comments/recurringSchedules 등)에 도메인별로 모은다. 모두 anon 클라이언트로 `group_id` 스코프 조회(Phase 4에서 share_token 격리로 교체 예정). 정기/비정기 통합 뷰모델은 `lib/occurrences.ts`의 `CardOccurrence`.
- import 경로 alias: `@/*` → `src/*` (tsconfig).
- 마이그레이션은 `supabase/migrations/NNNN_*.sql` 순번으로 추가한다. Supabase MCP 도구(`apply_migration`, `execute_sql` 등) 또는 CLI로 적용.
- DB 스키마를 바꾸면 `src/lib/supabase/types.ts`도 갱신한다(현재 수기 작성, 추후 `supabase gen types`로 자동화 가능).
- 환경변수: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` (`.env.local`, 미설정 시 client.ts가 throw).
- 코드 주석/문구/커밋 메시지는 한국어. PRD 장 번호를 근거로 인용하는 패턴을 따른다(예: "PRD 7장 데이터 모델").
