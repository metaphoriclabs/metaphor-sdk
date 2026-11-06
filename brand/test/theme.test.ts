import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { themeVariables } from "../src/theme.ts";

describe("theme.css", () => {
  it("matches the tokens", () => {
    const css = readFileSync(new URL("../theme.css", import.meta.url), "utf8");
    // Biome wraps long values over several lines, so compare with whitespace collapsed.
    const declared = Object.fromEntries(
      [...css.matchAll(/(--[\w-]+):\s*([^;]+);/g)].map(([, name, value]) => [
        name,
        value?.replace(/\s+/g, " ").trim(),
      ]),
    );
    expect(declared).toEqual(themeVariables());
  });
});
