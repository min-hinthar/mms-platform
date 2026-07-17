# OG image fonts

`Fraunces-600.woff` / `Fraunces-900.woff` are **latin-subset static instances** of Fraunces
(SemiBold / Black), used only by `../opengraph-image.tsx` to render the social share card via
`next/og` (Satori). They're **bundled** (not fetched at request time) so OG generation has no
network dependency and the image prerenders at build.

Fraunces is licensed under the **SIL Open Font License 1.1** (OFL) — redistribution, including
bundling a subset, is permitted. Source: Google Fonts / fontsource.

The app's on-page Fraunces loads separately via `next/font/google` (`app/layout.tsx`); these subset
copies exist solely for Satori, which needs raw font data and can't read `next/font`'s output.
