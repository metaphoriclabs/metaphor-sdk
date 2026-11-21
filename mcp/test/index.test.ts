// How each tool's answer reads to the model, and the rules its input is held to.

import { describe, expect, it } from "vitest";
import { z } from "zod";
import { resultOf, TOOLS } from "../src/index.ts";

const ID = "0123456789abcdef0123456789abcdef";
const input = (tool: keyof typeof TOOLS) => z.object(TOOLS[tool].inputSchema);

describe("resultOf", () => {
  it("reads a memory written", () => {
    expect(resultOf("remember", 201, { id: ID, extra: 1 })).toEqual({
      text: `Remembered, as ${ID}.`,
      isError: false,
    });
  });

  it("reads what was recalled, one line an item, with the memories it came from", () => {
    const body = {
      items: [
        { text: "Prefers small PRs", heading: "Code review", occurred_at: null, memory_ids: [ID] },
        { text: "Moved to Lisbon", heading: null, occurred_at: "2026-03-01", memory_ids: [] },
      ],
    };
    expect(resultOf("recall", 200, body)).toEqual({
      text: `- Code review: Prefers small PRs [from ${ID}]\n- Moved to Lisbon (2026-03-01)`,
      isError: false,
    });
    expect(resultOf("recall", 200, { items: [] })).toEqual({
      text: "Nothing remembered bears on that.",
      isError: false,
    });
  });

  it("reads a forget, and until when it can be undone", () => {
    expect(resultOf("forget", 202, { id: "fgt_1", undo_until: "2026-11-28T00:00:00Z" })).toEqual({
      text: "Forgotten, as fgt_1. It can be undone until 2026-11-28T00:00:00Z.",
      isError: false,
    });
    expect(resultOf("forget", 202, { id: "fgt_1", undo_until: null }).text).toBe(
      "Forgotten, as fgt_1.",
    );
  });

  it("reads the API's error as an error, with its message and code", () => {
    const body = { error: { code: "not-found", message: "No such memory" } };
    for (const tool of ["remember", "recall", "forget"] as const) {
      expect(resultOf(tool, 404, body)).toEqual({
        text: "No such memory (not-found).",
        isError: true,
      });
      // A body that is not the API's error says only that something went wrong.
      for (const odd of [undefined, null, "text", [], { error: "x" }, { error: { code: 1 } }]) {
        expect(resultOf(tool, 500, odd)).toEqual({
          text: "Something went wrong. Try again.",
          isError: true,
        });
      }
    }
  });

  it("never reads a body of the wrong shape as success", () => {
    const odd: unknown[] = [undefined, null, {}, [], "ok", { id: 1 }, { items: [{ text: 1 }] }];
    for (const tool of ["remember", "recall", "forget"] as const) {
      for (const body of odd) expect(resultOf(tool, 200, body).isError).toBe(true);
    }
  });
});

describe("TOOLS", () => {
  it("are remember, recall and forget, and only recall reads without changing anything", () => {
    expect(Object.keys(TOOLS)).toEqual(["remember", "recall", "forget"]);
    expect(TOOLS.recall.annotations.readOnlyHint).toBe(true);
    expect(TOOLS.remember.annotations.readOnlyHint).toBe(false);
    expect(TOOLS.forget.annotations.destructiveHint).toBe(true);
    for (const tool of Object.values(TOOLS)) expect(tool.annotations.openWorldHint).toBe(false);
  });

  it("hold input to the API's own rules", () => {
    expect(input("remember").safeParse({ content: "Prefers tea" }).success).toBe(true);
    for (const content of ["", "   ", "x".repeat(32_001)]) {
      expect(input("remember").safeParse({ content }).success).toBe(false);
    }
    expect(input("recall").parse({ question: "What tea?" }).budget).toBe(2000);
    for (const asked of [
      { question: "" },
      { question: "q", budget: 99 },
      { question: "q", budget: 1.5 },
    ]) {
      expect(input("recall").safeParse(asked).success).toBe(false);
    }
    expect(input("forget").safeParse({ memory_ids: [ID] }).success).toBe(true);
    for (const memory_ids of [[], ["not an id"], Array(101).fill(ID)]) {
      expect(input("forget").safeParse({ memory_ids }).success).toBe(false);
    }
  });
});
