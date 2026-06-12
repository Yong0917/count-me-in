// 최근 입장한 모임 기록 (localStorage). 랜딩 화면(/)에서 코드 재입력 없이
// 빠르게 재입장하는 데 사용한다. 최신 항목이 앞에 오도록 유지하며 최대 개수를 둔다.
// useRecentGroups 는 useSyncExternalStore 로 localStorage 변경을 컴포넌트에 반영한다.

import { useSyncExternalStore } from "react";

const STORAGE_KEY = "cmi:recent-groups";
const MAX_ITEMS = 5;

export interface RecentGroup {
  groupId: string;
  groupName: string;
  joinCode: string;
}

const emptySnapshot: RecentGroup[] = [];
let cachedSnapshot: RecentGroup[] | null = null;
const listeners = new Set<() => void>();

function readSnapshot(): RecentGroup[] {
  if (cachedSnapshot) return cachedSnapshot;
  if (typeof window === "undefined") return emptySnapshot;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    cachedSnapshot = raw ? (JSON.parse(raw) as RecentGroup[]) : [];
  } catch {
    cachedSnapshot = [];
  }
  return cachedSnapshot;
}

function write(groups: RecentGroup[]): void {
  cachedSnapshot = groups;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(groups));
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getRecentGroups(): RecentGroup[] {
  return readSnapshot();
}

export function addRecentGroup(group: RecentGroup): void {
  const rest = readSnapshot().filter((g) => g.groupId !== group.groupId);
  write([group, ...rest].slice(0, MAX_ITEMS));
}

export function removeRecentGroup(groupId: string): void {
  write(readSnapshot().filter((g) => g.groupId !== groupId));
}

export function updateRecentGroupName(groupId: string, groupName: string): void {
  write(
    readSnapshot().map((g) =>
      g.groupId === groupId ? { ...g, groupName } : g,
    ),
  );
}

// 최근 모임 목록을 구독한다. SSR 시점에는 빈 배열을 반환해 hydration mismatch 를 피한다.
export function useRecentGroups(): RecentGroup[] {
  return useSyncExternalStore(subscribe, readSnapshot, () => emptySnapshot);
}
