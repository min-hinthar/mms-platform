// Stable per-seat avatar color + initial (v7.2 PCOL palette). Isomorphic, shared by the guest list
// (presence) and the split section so the same diner reads as the same color/initial everywhere.
// Exported for the contrast audit (avatars.test.ts asserts every hue clears AA behind the white initial).
export const PCOL = ["#A65F10", "#1F6E63", "#A44B34", "#6E4070", "#3F7A52"];

export function seatColor(seat: string): string {
  let h = 0;
  for (let i = 0; i < seat.length; i++) h = (h * 31 + seat.charCodeAt(i)) >>> 0;
  return PCOL[h % PCOL.length] ?? PCOL[0]!;
}

export const seatInitial = (name: string): string => (name.trim()[0] ?? "G").toUpperCase();
