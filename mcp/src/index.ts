// Metaphor's MCP tools: remember, recall and forget, each one action on the person's own
// memory. These are the definitions an MCP server registers (the hosted server in
// apps/mcp, and later a local stdio server), and how each tool's answer reads to the model.
//
// Each tool's input is held to the same rules as the Metaphor API's own field
// (@metaphoriclabs/contract), and each answer has the API's shape, so the text here reads
// the API's answers.

import {
  type Forget as ForgetAnswer,
  type Recall,
  RecallRequest,
  WriteMemory,
  type WrittenMemory as WrittenAnswer,
  WrittenMemory,
} from "@metaphoriclabs/contract";
import { z } from "zod";

/** What the server tells a client the tools may do (MCP's ToolAnnotations). */
export interface ToolAnnotations {
  readonly title: string;
  readonly readOnlyHint: boolean;
  readonly destructiveHint: boolean;
  readonly idempotentHint: boolean;
  readonly openWorldHint: boolean;
}

/** One tool, as a server registers it. */
export interface ToolDefinition<Shape extends z.ZodRawShape> {
  readonly title: string;
  readonly description: string;
  readonly inputSchema: Shape;
  readonly annotations: ToolAnnotations;
}

/**
 * A remember call's idempotency key: a UUID in lowercase, as most tools write one. It is the
 * memory's source ID, and the contract asks that a source ID carry no content, since the hash
 * of it stays in the space's log after the memory is erased. A UUID can't hold the person's
 * words where free text could. api holds a key to the same rule (apps/api, REMEMBER_KEY).
 */
export const REMEMBER_KEY = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

const remember = {
  title: "Remember",
  description:
    "Keep something to recall in later conversations: a fact about the person, a preference, a decision, or what was done and why. Write it in plain words that will still make sense out of this conversation, one thing per call. Answers with the memory's ID.",
  inputSchema: {
    content: WriteMemory.shape.content,
    idempotency_key: z
      .string()
      .regex(REMEMBER_KEY)
      .optional()
      .describe(
        "A new UUID for this memory, in lowercase. Send the same one only to retry this call, such as after a timeout: the retry then finds the memory the first call made instead of keeping it twice. Without one, every call keeps a new memory. The key comes back as the memory's source.id when the API lists or reads it.",
      ),
  },
  annotations: {
    title: "Remember",
    readOnlyHint: false,
    destructiveHint: false,
    idempotentHint: false,
    openWorldHint: false,
  },
} satisfies ToolDefinition<z.ZodRawShape>;

const recall = {
  title: "Recall",
  description:
    "Find what is remembered that bears on a question, asked in plain words, such as `what does the person prefer for code review?`. Answers with lines of context, each with the IDs of the memories it came from. Ask before relying on what you think you know about the person or their work.",
  inputSchema: {
    question: RecallRequest.shape.question,
    budget: RecallRequest.shape.budget,
  },
  annotations: {
    title: "Recall",
    readOnlyHint: true,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: false,
  },
} satisfies ToolDefinition<z.ZodRawShape>;

const forget = {
  title: "Forget",
  description:
    "Forget memories by their IDs, as remember and recall give them. They leave recall at once. The answer says until when the forget can be undone, from the Metaphor console; after that, nothing of them can be read again. Forget only what the person asked to forget, or what is wrong.",
  inputSchema: {
    memory_ids: z.array(WrittenMemory.shape.id).min(1).max(100),
  },
  annotations: {
    title: "Forget",
    readOnlyHint: false,
    destructiveHint: true,
    idempotentHint: true,
    openWorldHint: false,
  },
} satisfies ToolDefinition<z.ZodRawShape>;

/** Every tool, by the name a client calls it. */
export const TOOLS = { remember, recall, forget } as const;

export type ToolName = keyof typeof TOOLS;

/** A tool's answer as the model reads it, and the API's own answer beside it. */
export interface ToolResult {
  readonly text: string;
  readonly isError: boolean;
}

/** A JSON object's own field, or undefined when `value` is not an object or lacks it. */
function fieldOf(value: unknown, name: string): unknown {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return undefined;
  return Object.hasOwn(value, name) ? Reflect.get(value, name) : undefined;
}

/** The API's error body, `{ error: { code, message } }`, as one line. */
function errorText(body: unknown): string {
  const error = fieldOf(body, "error");
  const code = fieldOf(error, "code");
  const message = fieldOf(error, "message");
  if (typeof code === "string" && typeof message === "string") return `${message} (${code}).`;
  return "Something went wrong. Try again.";
}

const parsed = <T>(schema: z.ZodType<T>, body: unknown): T | undefined => {
  const read = schema.safeParse(body);
  return read.success ? read.data : undefined;
};

const WrittenBody: z.ZodType<Pick<WrittenAnswer, "id">> = z.object({ id: z.string() });
const RecallBody: z.ZodType<Pick<Recall, "items">> = z.object({
  items: z.array(
    z.object({
      text: z.string(),
      heading: z.string().nullable(),
      occurred_at: z.string().nullable(),
      memory_ids: z.array(z.string()),
    }),
  ),
});
const ForgetBody: z.ZodType<Pick<ForgetAnswer, "id" | "undo_until">> = z.object({
  id: z.string(),
  undo_until: z.string().nullable(),
});

/**
 * How `tool`'s answer reads to the model: the API's `status` and JSON `body` for that action.
 * A body that isn't the action's shape reads as a failure, never as success.
 */
export function resultOf(tool: ToolName, status: number, body: unknown): ToolResult {
  if (status >= 400) return { text: errorText(body), isError: true };
  const failed: ToolResult = { text: "Something went wrong. Try again.", isError: true };
  switch (tool) {
    case "remember": {
      const written = parsed(WrittenBody, body);
      return written === undefined
        ? failed
        : { text: `Remembered, as ${written.id}.`, isError: false };
    }
    case "recall": {
      const recalled = parsed(RecallBody, body);
      if (recalled === undefined) return failed;
      if (recalled.items.length === 0) {
        return { text: "Nothing remembered bears on that.", isError: false };
      }
      const lines = recalled.items.map((item) => {
        const when = item.occurred_at === null ? "" : ` (${item.occurred_at})`;
        const heading = item.heading === null ? "" : `${item.heading}: `;
        const from = item.memory_ids.length === 0 ? "" : ` [from ${item.memory_ids.join(", ")}]`;
        return `- ${heading}${item.text}${when}${from}`;
      });
      return { text: lines.join("\n"), isError: false };
    }
    case "forget": {
      const forgot = parsed(ForgetBody, body);
      if (forgot === undefined) return failed;
      const until =
        forgot.undo_until === null ? "" : ` It can be undone until ${forgot.undo_until}.`;
      return { text: `Forgotten, as ${forgot.id}.${until}`, isError: false };
    }
  }
}
