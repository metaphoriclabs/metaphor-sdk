# @metaphoriclabs/brand

Metaphor's design tokens: colour, type and corner radius, as TypeScript values and a Tailwind 4 theme. The values are neutral placeholders until the brand is designed.

## Usage

In a Tailwind 4 stylesheet, import the theme after Tailwind:

```css
@import "tailwindcss";
@import "@metaphoriclabs/brand/theme.css";
```

That gives you `bg-accent`, `text-error`, `font-mono`, the `neutral` scale and a single `rounded` radius. Spacing is Tailwind's default scale.

In TypeScript:

```ts
import { colors, fonts, radius } from "@metaphoriclabs/brand";
```

## Changing a token

Edit `src/index.ts`, then run `pnpm generate` to rewrite `theme.css`. The tests fail if `theme.css` is out of date.

Fonts must be under the Open Font License, because this package is Apache-2.0.
