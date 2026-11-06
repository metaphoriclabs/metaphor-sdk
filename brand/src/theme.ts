import { colors, fonts, radius } from "./index.ts";

// The tokens as Tailwind theme variables. scripts/generate.ts writes theme.css from these.
export function themeVariables(): Record<string, string> {
  const variables: Record<string, string> = { "--color-accent": colors.accent };
  for (const [step, value] of Object.entries(colors.neutral)) {
    variables[`--color-neutral-${step}`] = value;
  }
  return {
    ...variables,
    "--color-success": colors.success,
    "--color-warning": colors.warning,
    "--color-error": colors.error,
    "--font-sans": fonts.sans,
    "--font-mono": fonts.mono,
    "--radius": radius,
  };
}
