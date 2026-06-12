-- count-me-in 멤버 비활성화(보존) 컬럼 (PRD 13장 멤버 삭제 정책)
-- 멤버를 완전 삭제하지 않고 active=false 로 표시해 명단/달력에서만 숨긴다.
-- 기존 attendances/comments 행은 FK 그대로 보존.

alter table members add column if not exists active boolean not null default true;
