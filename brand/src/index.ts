// Design tokens: color, type and radius. Shared by the console, docs and marketing site.
// Every value is a neutral placeholder until the brand is designed. Spacing is Tailwind's
// default scale, so it has no tokens here.
// theme.css is written from these values: edit them here, then run `pnpm generate`.

export const colors = {
  accent: "oklch(20.5% 0 0)",
  neutral: {
    50: "oklch(98.5% 0 0)",
    100: "oklch(97% 0 0)",
    200: "oklch(92.2% 0 0)",
    300: "oklch(87% 0 0)",
    400: "oklch(70.8% 0 0)",
    500: "oklch(55.6% 0 0)",
    600: "oklch(43.9% 0 0)",
    700: "oklch(37.1% 0 0)",
    800: "oklch(26.9% 0 0)",
    900: "oklch(20.5% 0 0)",
    950: "oklch(14.5% 0 0)",
  },
  success: "oklch(62.7% 0.194 149.214)",
  warning: "oklch(66.6% 0.179 58.318)",
  error: "oklch(57.7% 0.245 27.325)",
} as const;

// System fonts until the brand picks its own. The package is Apache-2.0, so any font it ships
// must be under the Open Font License.
export const fonts = {
  sans: 'ui-sans-serif, system-ui, sans-serif, "Apple Color Emoji", "Segoe UI Emoji", "Segoe UI Symbol", "Noto Color Emoji"',
  mono: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace',
} as const;

// The one corner radius. Tailwind's bare `rounded` utility uses it.
export const radius = "0.25rem";
