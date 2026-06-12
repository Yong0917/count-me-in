// 멤버 신원 식별 (PRD F2): 로그인 대체로 member_id 를 localStorage 에 그룹별로 저장.
// 재진입 시 자동 통과하고, "나 아니에요" 로 초기화해 재선택한다.

const storageKey = (groupId: string) => `cmi:member:${groupId}`;

export function getStoredMemberId(groupId: string): string | null {
  if (typeof window === "undefined") return null;
  return window.localStorage.getItem(storageKey(groupId));
}

export function storeMemberId(groupId: string, memberId: string): void {
  window.localStorage.setItem(storageKey(groupId), memberId);
}

export function clearMemberId(groupId: string): void {
  window.localStorage.removeItem(storageKey(groupId));
}
