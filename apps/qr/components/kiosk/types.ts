import type { ModGroup } from "@/lib/menu/modifiers";

/** The kiosk's catalog row — the staff-browser shape plus `tags` (the upsell engine reads them). */
export type KioskItem = {
  id: string;
  nameEn: string;
  nameMy: string | null;
  priceCents: number;
  imageUrl: string | null;
  soldOut: boolean;
  category: string;
  tags: string[];
  groups: ModGroup[];
};
