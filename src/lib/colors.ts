// 멤버 식별용 색상 (PRD F6 보조). 명단·달력에서 사람을 빠르게 구분하는 용도.
// 신규 멤버는 pickColor 로 저장하고, 색이 없는 레거시 멤버는 id 기반 결정적 색으로 폴백.

// 알마낙 톤에 맞춘 차분한 흙빛 팔레트 — 채도를 낮춰 시맨틱 색(참석/불참)과
// 충돌하지 않으면서도 멤버를 구분할 수 있게 한다.
const PALETTE = [
  "#a64f38", // clay
  "#bf7d3f", // amber
  "#9a8b3a", // ochre
  "#5e7b4b", // olive
  "#3f807a", // teal
  "#3e6e9e", // slate blue
  "#6e5fa3", // muted violet
  "#a85786", // mauve
];

export function pickColor(): string {
  return PALETTE[Math.floor(Math.random() * PALETTE.length)];
}

export function memberColor(member: { id: string; color: string | null }): string {
  if (member.color) return member.color;
  let hash = 0;
  for (const ch of member.id) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0;
  return PALETTE[hash % PALETTE.length];
}
