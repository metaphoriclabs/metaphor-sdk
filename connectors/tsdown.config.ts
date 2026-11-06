import { defineConfig } from "tsdown";

export default defineConfig({
  entry: {
    slack: "src/slack/index.ts",
    github: "src/github/index.ts",
    gmail: "src/gmail/index.ts",
    gcal: "src/gcal/index.ts",
    gdocs: "src/gdocs/index.ts",
    gdirectory: "src/gdirectory/index.ts",
    meetings: "src/meetings/index.ts",
  },
  dts: true,
});
