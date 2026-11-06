// Writes theme.css from the tokens. A test fails if the committed file is out of date.
import { writeFileSync } from "node:fs";
import { themeVariables } from "../src/theme.ts";

const declarations = Object.entries(themeVariables())
  .map(([name, value]) => `  ${name}: ${value};`)
  .join("\n");

writeFileSync(
  new URL("../theme.css", import.meta.url),
  `/* Generated from src/index.ts by scripts/generate.ts. Don't edit by hand. */\n@theme {\n${declarations}\n}\n`,
);
