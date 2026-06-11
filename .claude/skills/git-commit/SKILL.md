---
name: git-commit
description: Apply this skill when the user wants to commit changed files in a git repository. Trigger when the user says "커밋해줘", "변경사항 커밋", "commit 만들어줘", "git commit", or asks to group changes into meaningful commits. Use this whenever the user wants staged or unstaged changes turned into one or more well-organized commits, even if they don't specify how to split them.
---

# Git 커밋 생성

당신은 변경된 파일들을 분석하여 기능/목적별로 의미 있는 단위의 커밋으로 묶어주는 커밋 전문가입니다. 단순히 모든 변경을 한 번에 커밋하는 것이 아니라, 리뷰하기 쉽고 히스토리로서 가치 있는 커밋을 만드는 것이 목표입니다.

## 핵심 원칙

- **하나의 커밋 = 하나의 논리적 변경**: 서로 다른 목적의 변경은 별도 커밋으로 분리합니다.
- **메시지는 한국어로 작성**합니다.
- **`Co-Authored-By: Claude` 라인은 절대 넣지 않습니다.**

## 작업 절차

### 1단계: 현재 변경사항 파악

다음 명령으로 변경 상태를 확인합니다.

```bash
git status
git diff          # unstaged 변경
git diff --staged # staged 변경
```

- 변경된 파일이 없으면 그 사실을 사용자에게 알리고 중단합니다.
- 변경 내용을 실제로 읽어 각 파일이 "무엇을, 왜" 바꾸는지 파악합니다.

### 2단계: 기능/목적별 그룹화

변경된 파일들을 다음 기준으로 그룹화합니다.

- 같은 기능·버그 수정·리팩터링에 속하는 파일끼리 묶기
- 서로 독립적으로 리뷰·되돌리기 가능한 단위로 분리
- 무관한 변경(예: 기능 추가 + 오타 수정)은 별도 커밋으로 분리

그룹화 결과(어떤 파일을 어떤 커밋으로 묶을지)를 사용자에게 먼저 간단히 제시합니다.

### 3단계: 커밋 생성

그룹별로 해당 파일만 스테이징한 뒤 커밋합니다.

```bash
git add <그룹에 속한 파일들>
git commit -m "<커밋 메시지>"
```

- 한 번에 `git add .`로 모두 스테이징하지 말고, 그룹 단위로 선택적으로 스테이징합니다.
- 각 커밋 후 다음 그룹으로 진행합니다.

### 4단계: 결과 확인

```bash
git log --oneline -n <커밋 개수>
```

생성된 커밋 목록을 사용자에게 보여줍니다.

## 커밋 메시지 형식

- 첫 줄(제목): 50자 내외, 무엇을 했는지 명령형/요약형으로 한국어 작성
- 필요 시 본문에 "왜" 변경했는지 부연 설명
- 예시:
  - `로그인 폼 유효성 검사 추가`
  - `사용자 목록 페이지네이션 버그 수정`
  - `결제 모듈 중복 코드 리팩터링`

## 금지 사항

- `Co-Authored-By: Claude ...` 같은 공동 작성자 표기를 추가하지 않습니다.
- 사용자가 명시적으로 요청하지 않은 `git push`는 하지 않습니다.
