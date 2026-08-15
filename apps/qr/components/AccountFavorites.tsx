import type { CSSProperties } from "react";
import { Card } from "@mms/ui";
import { TransitionLink as Link } from "./nav/TransitionNav"; // J1 journey grammar
import type { FavoriteDish } from "@/lib/favorites";
import { BlurUpImage } from "./menu/BlurUpImage";
import { PhotoPlaceholder } from "./menu/PhotoPlaceholder";

/**
 * W14 — the /account favorites strip (J-F recognition: "remembered, one tap to the usual").
 * The hearts lived only on the menu rail until now; the profile is where a regular expects to
 * find them. Renders NOTHING when no hearts exist — recognition, not a pitch (the WalletChip
 * rule). Selection (in-stock, hearts order, cap 8) is `pickFavoriteRail`, pinned in lib.
 *
 * One CTA, not eight identical links: each dish row is display, and the strip routes to the
 * PICKUP door — the always-safe food entry (the W14 reorder rule: never a phantom dine-in
 * table from a side-room link; a seated diner orders from the menu they're already on).
 */
export function AccountFavorites({ dishes }: { dishes: FavoriteDish[] }) {
  if (dishes.length === 0) return null;
  return (
    <Card as="section" style={card} aria-labelledby="acct-fav-h">
      <h2 id="acct-fav-h" style={cardH}>
        Your favorites
      </h2>
      <ul role="list" style={list} aria-label="Favorite dishes">
        {dishes.map((d) => (
          <li key={d.id} style={row}>
            {/* Decorative — the name beside it is the content (the W13 thumb idiom). */}
            <span className="history-thumb" aria-hidden="true">
              <BlurUpImage
                src={d.imageUrl}
                alt=""
                width={44}
                height={44}
                sizes="44px"
                fallback={<PhotoPlaceholder variant="thumb" icon="cat-dish" />}
              />
            </span>
            <span style={{ minWidth: 0 }}>
              <span style={dishName}>{d.name}</span>
              {d.nameMy && (
                <span lang="my" className="history-line-my">
                  {d.nameMy}
                </span>
              )}
            </span>
            <span aria-hidden style={heart}>
              ♥
            </span>
          </li>
        ))}
      </ul>
      <Link href="/menu?mode=pickup" className="nav-link">
        Order your favorites{" "}
        <span aria-hidden className="nav-arrow nav-arrow-fwd">
          →
        </span>
      </Link>
    </Card>
  );
}

// Surface (bg/border/radius/shadow) comes from `.card` via <Card>; this is layout only.
const card: CSSProperties = { padding: "var(--s5)", marginBottom: "var(--s4)" };
const cardH: CSSProperties = {
  margin: "0 0 8px",
  fontSize: "var(--fs-sm)",
  fontWeight: 800,
  letterSpacing: 0.3,
  textTransform: "uppercase",
  color: "var(--t2)",
};
const list: CSSProperties = {
  listStyle: "none",
  margin: "0 0 10px",
  padding: 0,
  display: "grid",
  gap: 8,
};
const row: CSSProperties = { display: "flex", alignItems: "center", gap: 12, minWidth: 0 };
const dishName: CSSProperties = {
  display: "block",
  fontSize: "var(--fs-sm)",
  fontWeight: 600,
  color: "var(--tx)",
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
};
const heart: CSSProperties = {
  marginLeft: "auto",
  color: "var(--ac)",
  fontSize: "var(--fs-xs)",
  flex: "none",
};
