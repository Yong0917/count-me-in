# 오늘참석해? (count-me-in)

> 회원가입 없이 참가 코드 하나로 모여, 달력에서 오늘 누가 오는지 확인하고 탭 한 번으로 내 참석을 표시하는 소모임용 참석 공유 웹앱.

5명 내외 소모임(운동 모임 등)을 위한 MVP입니다. "이번엔 누가 와요?"를 단톡방에서 묻는 대신, 참가 코드(또는 링크)로 들어와 이름만 선택하면 월간 달력에서 일정과 참석 현황을 바로 확인하고 표시할 수 있습니다. 한국어 UI, 타임존은 Asia/Seoul로 고정되어 있습니다.

자세한 제품 요구사항은 [docs/PRD.md](docs/PRD.md), 개발 로드맵은 [docs/ROADMAP.md](docs/ROADMAP.md), 아키텍처/RPC/컨벤션 상세는 [CLAUDE.md](CLAUDE.md)를 참고하세요.

## 주요 기능

| 기능 | 설명 |
| --- | --- |
| 그룹 생성 & 참가 코드/링크 | 그룹명 입력 → 6자리 참가 코드(`join_code`)와 공유 링크(`/{join_code}`) 발급 |
| 코드 입장 & 이름 선택 | 코드 입력 또는 링크 접속 → 멤버 명단에서 본인 선택(또는 추가) → `member_id`를 localStorage에 저장해 재방문 시 자동 통과 |
| 월간 달력 | 경량 커스텀 달력. 오늘 강조, 좌우 월 이동, 날짜별 "참석 인원/전체" 마커 |
| 일정 관리 | 비정기(단발) 일정 + 정기(요일 반복) 일정. 정기 일정은 Lazy materialize로 첫 응답 시에만 실제 행 생성 |
| 참석 토글 | 참석 / 불참 / 미정 3상태를 탭으로 즉시 전환(기본값: 미정), 미정일 때 응답 유도 강조 |
| 오늘 현황 패널 | 선택 날짜(기본=오늘)의 참석/불참/미정 명단과 인원 요약 |
| 한줄 메모 | 일정별 한줄 코멘트 작성·표시(작성자·시간, Asia/Seoul 고정 표기) |
| 멤버 관리 | 멤버별 4자리 PIN으로 이름 사칭 방지(선택), 활성 멤버 닉네임 중복 방지, 멤버 비활성화(기록 보존) |
| 그룹 설정 | 그룹명 변경, 멤버 관리, 참가 코드/링크 재공유 |
| 최근 모임 | 최근 입장한 모임 목록으로 빠른 재입장 |
| PWA | 홈 화면 추가용 아이콘/매니페스트 제공 |

## 기술 스택

- **프론트엔드**: Next.js 16 (App Router) + React 19 + TypeScript
- **스타일**: Tailwind CSS v4
- **백엔드/DB**: Supabase (PostgreSQL) — 클라이언트에서 `@supabase/supabase-js`(anon key)로 직접 접근
- **인증**: 정식 로그인 없음 — `join_code`/`share_token` 기반 접근 통제 + localStorage `member_id`
- **타임존**: Asia/Seoul 고정

> ⚠️ Next.js 16 / React 19 / Tailwind v4 사용 중입니다. API와 컨벤션이 학습 데이터와 다를 수 있으니, 코드를 작성하기 전에 `node_modules/next/dist/docs/`의 해당 가이드를 먼저 확인하세요(AGENTS.md 규칙).

## 시작하기

### 요구사항

- Node.js, npm
- Supabase 프로젝트 (URL + anon key)

### 환경변수

`.env.local`에 다음 값을 설정합니다(미설정 시 `src/lib/supabase/client.ts`가 throw).

```
NEXT_PUBLIC_SUPABASE_URL=...
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
```

### 명령어

```bash
npm install
npm run dev     # 개발 서버 (http://localhost:3000)
npm run build   # 프로덕션 빌드
npm run start   # 프로덕션 서버
npm run lint    # ESLint (eslint-config-next, core-web-vitals + typescript)
```

테스트 러너는 아직 없습니다.

### 데이터베이스

`supabase/migrations/`의 마이그레이션을 순번대로 적용합니다(Supabase CLI 또는 MCP 도구인 `apply_migration` 등 사용).

## 아키텍처 개요

이 앱의 핵심 설계는 **인증 없는 `share_token` 기반 접근 통제**입니다.

- 브라우저는 세션을 유지하지 않는 anon 키로 Supabase에 접근합니다 (`src/lib/supabase/client.ts`, `persistSession: false`).
- `groups` 테이블의 두 토큰으로 그룹을 격리합니다.
  - `join_code` — 사람이 입력하는 6자리 별칭(혼동 문자 0/O/1/I 제외). 입력 편의용일 뿐 권한이 아닙니다.
  - `share_token` — 추측 불가능한 긴 랜덤 값. **실제 접근 통제 단위**입니다.
- 입장 흐름: `join_code` 입력 → `resolve_group()` RPC가 `share_token` 반환 → `createScopedClient(shareToken)`이 모든 요청에 `x-share-token` 헤더를 붙인 클라이언트를 생성 → `GroupSessionProvider`/`useGroupSession()`으로 하위 컴포넌트에 전달. RLS는 이 헤더로 그룹을 스코프합니다.
- 멤버 식별은 `member_id`를 localStorage에 저장해 재진입 시 자동 통과시킵니다.

RLS를 우회해야 하는 쓰기 작업은 anon이 직접 INSERT하지 않고 `SECURITY DEFINER` RPC를 통해 처리합니다 (`create_group`, `resolve_group`, `add_member`, `verify_member_pin`, `set_member_pin`, `materialize_recurring_event` 등). `resolve_group`/`verify_member_pin`은 IP당 10분 20회 rate limit이 적용됩니다. 자세한 내용은 [CLAUDE.md](CLAUDE.md)를 참고하세요.

## 데이터 모델

```
groups → members / recurring_schedules / events (모두 group_id FK, ON DELETE CASCADE)
events → attendances (UNIQUE(event_id, member_id))
events → comments
```

- `recurring_schedules` — 정기 일정 "규칙"(요일 1개당 1행). 실제 `events` 행은 만들지 않습니다.
- `events` — 실제 일정 인스턴스. `source`는 `adhoc`(단발) 또는 `recurring`. 정기 일정은 **Lazy materialize**: 가상 occurrence로 달력에 표시하다가 첫 참석/메모 시점에만 실제 행을 생성합니다(`(group_id, schedule_id, event_date)` 고유 인덱스 + upsert로 멱등).
- `attendances` — 멤버×일정당 1행. 상태는 `going`/`not_going`/`maybe`(기본 `maybe`).
- `comments` — 일정별 한줄 메모.
- `members.active` — 멤버 비활성화(보존) 플래그. 삭제 대신 명단/달력에서만 숨기고 기존 기록은 보존됩니다.
- `members.pin_hash`/`has_pin` — 멤버별 PIN(선택, 이름 사칭 방지). 그룹 내 활성 멤버 닉네임 중복은 방지됩니다.

자세한 스키마는 `supabase/migrations/`와 `src/lib/supabase/types.ts`를 참고하세요.

## 프로젝트 구조

```
src/
  app/
    page.tsx              # 랜딩(코드 입장 + 최근 모임)
    new/page.tsx          # 그룹 생성
    [joinCode]/page.tsx   # 입장 → 이름 게이트 → 달력 홈
  components/             # 달력, 일정 카드, 참석 토글, 각종 모달 등 UI 컴포넌트
  lib/                     # 도메인별 데이터 접근 (events, attendances, members,
                           # recurringSchedules, occurrences, comments, groups ...)
  lib/supabase/            # Supabase 클라이언트(scoped client) & DB 타입
supabase/
  migrations/              # DB 스키마, RLS, RPC 마이그레이션 (0001~0007)
docs/
  PRD.md                   # 제품 요구사항 문서
  ROADMAP.md               # 개발 로드맵 및 진행 상황
```

## 문서

- [PRD](docs/PRD.md) — 제품 요구사항 정의
- [ROADMAP](docs/ROADMAP.md) — 개발 단계 및 진행 상황
- [CLAUDE.md](CLAUDE.md) — 아키텍처, RPC, 데이터 모델, 컨벤션 상세
