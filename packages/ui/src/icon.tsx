import type { CSSProperties, SVGProps } from "react";
import {
  AlertTriangle,
  Armchair,
  Banknote,
  Candy,
  Check,
  Cherry,
  CookingPot,
  Fish,
  HeartPulse,
  House,
  Leaf,
  Package,
  ChevronDown,
  ChevronUp,
  CreditCard,
  CupSoda,
  Croissant,
  Flame,
  LayoutGrid,
  Printer,
  Tv,
  Gift,
  Heart,
  Info,
  Lock,
  MapPin,
  ReceiptText,
  RotateCcw,
  Salad,
  Search,
  ShoppingBag,
  ShoppingBasket,
  ShoppingCart,
  Soup,
  Star,
  Trash2,
  Undo2,
  Users,
  Utensils,
  UtensilsCrossed,
  Volume2,
  WifiOff,
  X,
  type LucideIcon,
} from "lucide-react";

/**
 * The brand icon set (W2b) — retires functional emoji-as-chrome (🔍🗑🧾🪑♥💳🔥🥡🎁🛒📍…) with a
 * curated, bounded lucide-react set at ONE stroke weight. lucide is the delivery app's set too (family
 * consistency, M5 "learn from delivery"); Next auto-optimizes its imports, so only the glyphs used ship
 * (~0.3–0.8 KB each). The `✦` wordmark mark stays a text glyph (it's the brand, not an icon); emoji stay
 * for CONTENT only (a dish's own glyph, a celebratory flourish), never chrome.
 *
 * One name→glyph map keeps apps importing only `Icon` from `@mms/ui` — no direct lucide dependency in
 * app code, and the ~20-glyph ceiling is enforced by the union type. `cat-*` names are the food-category
 * glyphs the missing-photo placeholder draws (kept here so there's a single icon source).
 */
const ICONS = {
  // chrome
  search: Search,
  trash: Trash2,
  receipt: ReceiptText,
  table: Armchair,
  favorite: Heart,
  card: CreditCard,
  cash: Banknote,
  flame: Flame,
  // P7 — the staff doors' Screens chip and the TV-board tile.
  grid: LayoutGrid,
  print: Printer,
  tv: Tv,
  bag: ShoppingBag,
  cart: ShoppingCart,
  gift: Gift,
  close: X,
  pin: MapPin,
  alert: AlertTriangle,
  info: Info,
  lock: Lock,
  people: Users,
  refresh: RotateCcw,
  star: Star,
  check: Check,
  // W10a — connection truth (the ONLY offline glyph; outage states use the 🫖 medallion, not an icon)
  offline: WifiOff,
  // staff ops chrome (W2b staff tail)
  volume: Volume2,
  undo: Undo2,
  "chevron-up": ChevronUp,
  "chevron-down": ChevronDown,
  // food-category glyphs (placeholder)
  "cat-noodles": Soup,
  "cat-curry": UtensilsCrossed,
  "cat-salad": Salad,
  "cat-drink": CupSoda,
  "cat-breakfast": Croissant,
  "cat-grocery": ShoppingBasket,
  "cat-dish": Utensils,
  // grocery aisle glyphs (W4b browse grid — apps/qr/lib/grocery-aisles.ts is the sole consumer map)
  "cat-fish": Fish,
  "cat-leaf": Leaf,
  "cat-candy": Candy,
  "cat-fruit": Cherry,
  "cat-jar": Package,
  "cat-pot": CookingPot,
  "cat-health": HeartPulse,
  "cat-home": House,
} satisfies Record<string, LucideIcon>;

export type IconName = keyof typeof ICONS;

/**
 * Map a free-text menu category NAME (e.g. "Rice, Noodles & Soups", "Seafood Curries") to a placeholder
 * glyph via substring match — resilient to name↔slug and punctuation drift (the value is the display
 * name today, `menu_categories.name`). Falls back to a generic dish glyph, never nothing.
 */
export function categoryIconName(category: string): IconName {
  const c = category.toLowerCase();
  if (/grocer|market|pantry/.test(c)) return "cat-grocery";
  if (/noodle|soup|rice/.test(c)) return "cat-noodles";
  if (/curr|seafood|beef|chicken|pork|fish|stew/.test(c)) return "cat-curry";
  if (/salad|veg|appetiz|starter/.test(c)) return "cat-salad";
  if (/drink|beverage|tea|coffee|juice/.test(c)) return "cat-drink";
  if (/breakfast|morning|egg/.test(c)) return "cat-breakfast";
  // W17d-2 added a Desserts category whose three dishes all await photography — without this line
  // every tile in it wore the generic dish glyph, reading as "unsorted" rather than "sweet".
  if (/dessert|sweet|cake/.test(c)) return "cat-candy";
  return "cat-dish";
}

/**
 * Brand icon. Decorative by default (`aria-hidden`) — beside a text label the control already has its
 * accessible name. Pass `label` ONLY when the icon is the sole carrier of meaning (a standalone icon
 * button); then it renders `role="img"` + `aria-label`. `strokeWidth` defaults to the brand weight;
 * any SVG prop (e.g. `fill="currentColor"` for a filled favorite) passes through and wins.
 */
export function Icon({
  name,
  size = 20,
  label,
  strokeWidth = 1.75,
  className,
  style,
  ...rest
}: {
  name: IconName;
  size?: number;
  label?: string;
  strokeWidth?: number;
  className?: string;
  style?: CSSProperties;
} & Omit<SVGProps<SVGSVGElement>, "ref" | "width" | "height">) {
  const Glyph = ICONS[name];
  const a11y = label
    ? { role: "img" as const, "aria-label": label }
    : { "aria-hidden": true, focusable: false as const };
  return (
    <Glyph
      width={size}
      height={size}
      strokeWidth={strokeWidth}
      className={className}
      style={{ flex: "none", ...style }}
      {...a11y}
      {...rest}
    />
  );
}
