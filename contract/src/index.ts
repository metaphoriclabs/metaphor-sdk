import { createRoute, OpenAPIHono, z } from "@hono/zod-openapi";

export const Health = z.object({ status: z.literal("ok") }).openapi("Health");
export type Health = z.infer<typeof Health>;

export const healthRoute = createRoute({
  method: "get",
  path: "/health",
  summary: "Check the API is up",
  responses: {
    200: {
      description: "The API is up.",
      content: { "application/json": { schema: Health } },
    },
  },
});

/** Every code an answer that is not a success can carry. */
const ERROR_CODES = [
  "invalid-request",
  "unauthenticated",
  "forbidden",
  "not-found",
  "key-limit",
  "conflict",
  "too-large",
  "unsupported-media-type",
  "rate-limited",
  "internal",
  "unavailable",
] as const;

/**
 * The HTTP status each code always comes with: one entry for every code in `ERROR_CODES`, and
 * no other. A code is never renamed or given another status: a client may branch on it. New
 * codes may be added, so a client treats one it does not know by its status alone.
 */
export const ERROR_STATUS = {
  "invalid-request": 400,
  unauthenticated: 401,
  forbidden: 403,
  "not-found": 404,
  "key-limit": 409,
  conflict: 409,
  "too-large": 413,
  "unsupported-media-type": 415,
  "rate-limited": 429,
  internal: 500,
  unavailable: 503,
} as const satisfies Record<(typeof ERROR_CODES)[number], number>;

/** What went wrong, as a fixed code. The status that comes with each is in `ERROR_STATUS`. */
export const ErrorCode = z.enum(ERROR_CODES).openapi("ErrorCode", {
  description: [
    "What went wrong. Each code always comes with the one HTTP status:",
    "",
    "- `invalid-request` (400): the request is not valid. `message` names the fields that are wrong.",
    "- `unauthenticated` (401): no valid API key was sent.",
    "- `forbidden` (403): the API key does not allow this.",
    "- `not-found` (404): no such route, or no such thing at it.",
    "- `key-limit` (409): the tenant or the user holds as many working keys as it may.",
    "- `conflict` (409): the request disagrees with what is kept, such as a source ID already used.",
    "- `too-large` (413): the request body is too large.",
    "- `unsupported-media-type` (415): the body was not sent as `application/json`.",
    "- `rate-limited` (429): too many requests. Wait the seconds `Retry-After` gives.",
    "- `internal` (500): something went wrong. Try again.",
    "- `unavailable` (503): the request could not be checked. Try again.",
    "",
    "New codes may be added. Treat one you do not know by its status.",
  ].join("\n"),
});
export type ErrorCode = z.infer<typeof ErrorCode>;

/**
 * The body of every answer that is not a success. `code` is fixed and `message` is for people.
 * `code` is a string, not the enum, so a client made today still reads a code added later.
 */
export const ApiError = z
  .object({
    error: z.object({
      code: z.string().openapi({
        description:
          "One of `ErrorCode`, or a code added since. Treat a code you do not know by its status.",
      }),
      message: z.string(),
    }),
  })
  .openapi("Error");
export type ApiError = z.infer<typeof ApiError>;

const refused = (description: string) => ({
  description,
  content: { "application/json": { schema: ApiError } },
});

/** The answers any route that needs an API key can give. */
const keyed = {
  401: refused("No valid API key was sent."),
  403: refused("The API key does not allow this."),
  429: refused(
    "The API key sent more than 600 requests in a minute, the user's keys together more than 2000, or the tenant's keys together more than 6000. Wait the seconds `Retry-After` gives.",
  ),
  500: refused("Something went wrong. Try again."),
  503: refused("The request could not be checked. Try again."),
};

/** Every route but `/health` needs an API key, sent as `Authorization: Bearer <key>`. */
const security = [{ apiKey: [] }];

/** What an API key may do. There is no scope that stands for all of them. */
export const Scope = z
  .enum(["memories:read", "memories:write", "memories:forget", "keys:manage"])
  .openapi("Scope");
export type Scope = z.infer<typeof Scope>;

/** A time in UTC, as RFC 3339 writes it: `2027-01-31T09:30:00Z`. */
const Time = z.iso.datetime().openapi({ example: "2027-01-31T09:30:00Z" });

const KeyId = z
  .string()
  .regex(/^[0-9a-f]{16}$/)
  .openapi({ example: "9f2c4e6a8b0d1f35" });

/** An API key, without the key itself. Only a hash of the key is kept. */
export const ApiKey = z
  .object({
    id: KeyId,
    name: z.string(),
    scopes: z.array(Scope),
    user_id: z.string().nullable().openapi({
      description: "The one user the key may act for. Null for a key of the tenant's own server.",
    }),
    created_at: Time,
    expires_at: Time.nullable().openapi({ description: "Null for a key that never expires." }),
    revoked_at: Time.nullable().openapi({ description: "Null for a key that is not revoked." }),
    last_used_at: Time.nullable().openapi({
      description:
        "When the key last passed its check, to within an hour, even if the route's scopes then refused the request. Null for a key never used.",
    }),
    made_by: KeyId.nullable().openapi({
      description:
        "The ID of the key that made this one. Null for a key Metaphor made for the tenant. Revoking a key does not revoke the keys it made.",
    }),
  })
  .openapi("ApiKey");
export type ApiKey = z.infer<typeof ApiKey>;

/** A key that was just made. `key` is shown this once and cannot be read again. */
export const NewApiKey = ApiKey.extend({
  key: z.string().openapi({ description: "The key itself. It is shown once." }),
}).openapi("NewApiKey");
export type NewApiKey = z.infer<typeof NewApiKey>;

/** A field that is not one of these is refused, so a misspelt `expires_at` makes no key. */
export const CreateApiKey = z
  .strictObject({
    name: z.string().min(1).max(64).openapi({
      description: "Your label for the key: 1 to 64 visible characters, single spaces between.",
    }),
    scopes: z.array(Scope).min(1).max(Scope.options.length),
    user_id: z
      .string()
      .min(1)
      .max(256)
      .regex(
        /^(?!metaphor:)[!#-[\]-~]+$/,
        "A key's user is visible ASCII but \" and \\, and never a member's metaphor: ID.",
      )
      .nullable()
      .default(null)
      .openapi({
        description:
          'The one end user the key may act for: your own ID, 1 to 256 visible ASCII characters but `"` and `\\`, not starting with `metaphor:`. Null for a key of your own server.',
      }),
    expires_at: Time.nullable().default(null),
  })
  .openapi("CreateApiKey");
export type CreateApiKey = z.input<typeof CreateApiKey>;

export const ApiKeyList = z.object({ data: z.array(ApiKey) }).openapi("ApiKeyList");
export type ApiKeyList = z.infer<typeof ApiKeyList>;

export const createApiKeyRoute = createRoute({
  method: "post",
  path: "/v1/keys",
  summary: "Make an API key",
  description:
    "Needs `keys:manage`. The new key does no more than the key that asks: no scope that key lacks, no other user, and no later expiry. A tenant holds a limited number of working keys, and fewer for any one user.",
  security,
  request: {
    body: { required: true, content: { "application/json": { schema: CreateApiKey } } },
  },
  responses: {
    201: {
      description: "The key was made.",
      content: { "application/json": { schema: NewApiKey } },
    },
    400: refused("The request is not valid."),
    ...keyed,
    409: refused("The tenant or the user holds as many working keys as it may. Revoke one first."),
    413: refused("The request body is too large."),
    415: refused("The body was not sent as `application/json`."),
    429: refused(
      "The API key sent more than 600 requests in a minute, the user's keys together more than 2000, the tenant's keys together more than 6000, or the tenant's keys made as many keys as they may in 24 hours. Wait the seconds `Retry-After` gives.",
    ),
  },
});

export const listApiKeysRoute = createRoute({
  method: "get",
  path: "/v1/keys",
  summary: "List API keys",
  description:
    "Needs `keys:manage`. A key held to one user lists that user's keys. Revoked and expired keys are listed until their records are dropped.",
  security,
  responses: {
    200: {
      description: "The keys, oldest first.",
      content: { "application/json": { schema: ApiKeyList } },
    },
    ...keyed,
  },
});

export const revokeApiKeyRoute = createRoute({
  method: "delete",
  path: "/v1/keys/{key_id}",
  summary: "Revoke an API key",
  description:
    "Needs `keys:manage`. A revoked key is refused from then on and is never made good again. Revoking a revoked key changes nothing.",
  security,
  request: { params: z.object({ key_id: KeyId }) },
  responses: {
    204: { description: "The key is revoked." },
    ...keyed,
    404: refused("No such key."),
  },
});

// Contract v0: spaces, memories, recall, forget, groups and the erasure of a user.
//
// These routes are the shape the API grows into (stage-3-alpha D5 to D10). None is served
// yet, so none is in `routes` or in openapi.yaml. Each moves into `routes` in the pull
// request that serves it, which is when the API's tests start holding it to the router.
//
// Requests are strict: an unknown field or value is refused. Answers are open: a value a
// client does not know yet, such as a new status, is a plain string, so a client generated
// today keeps working when one is added.

/**
 * What a key of contract v0 may do: today's scopes and four more. A route that needs one of
 * the four is not served yet; each joins `Scope` when the first route that needs it is.
 *
 * A key held to a user can never have `spaces:manage`, `groups:manage` or
 * `memories:forget-others`, and with `users:erase` it can erase only its own user.
 */
export const ScopeV0 = z
  .enum([
    ...Scope.options,
    "spaces:manage",
    "groups:manage",
    "memories:forget-others",
    "users:erase",
  ])
  .openapi("ScopeV0");
export type ScopeV0 = z.infer<typeof ScopeV0>;

/** The most bytes each v0 request body may take. The API refuses a longer one with a 413. */
export const BODY_LIMITS = {
  putSpace: 64 * 1024,
  writeMemory: 512 * 1024,
  recall: 64 * 1024,
  forget: 16 * 1024,
  putGroup: 6 * 1024 * 1024,
  eraseUser: 1024,
} as const;

/** Every answer of v0 carries this header, so no copy of a memory is kept on the way. */
export const NO_STORE = "no-store";

/**
 * The start of every user ID Metaphor issues to a member (a person who signs in). An ID you
 * give for your own end user may not start with it, so the two kinds never meet.
 */
export const MEMBER_ID_PREFIX = "metaphor:";

/** Visible ASCII but `"` and `\`, so an ID travels in a header as sent and needs no escape. */
const PLAIN = /^[!#-[\]-~]+$/;

/**
 * A user: a member's ID that Metaphor issued, which starts with `metaphor:`, or your own ID
 * for an end user, which may not. An end user's ID is kept only on a key held to that user.
 */
export const UserId = z
  .string()
  .min(1)
  .max(256)
  .regex(PLAIN)
  .refine((value) => value !== MEMBER_ID_PREFIX, "`metaphor:` alone is not an ID.")
  .openapi("UserId", {
    description:
      "A member's ID, which Metaphor issued and which starts with `metaphor:`, or your own ID for an end user: 1 to 256 visible ASCII characters but `\"` and `\\`, not starting with `metaphor:`. Metaphor keeps an end user's ID as you send it only on a key held to that user. A service user's ID is issued by Metaphor, so it starts with `metaphor:` too.",
    example: "customer-4821",
  });
export type UserId = z.infer<typeof UserId>;

/** The header that names the user a request acts for. It is never written to a log. */
export const ACTING_USER_HEADER = "metaphor-user";

/**
 * Every space route acts for one user. A key held to a user acts for that user, and may send
 * the header only with the same ID. A key of your own server must send it. A request that
 * names no user is refused: it never means every user.
 */
const actingUser = z.object({
  [ACTING_USER_HEADER]: UserId.optional().openapi({
    param: {
      description:
        "The user this request acts for. Required for a key of your own server; a key held to a user may leave it out, or send that user's ID. A server key acts for a member only where the owner turned that on for the project, and each such request is recorded.",
    },
  }),
});

const NAME = /^[a-z0-9][a-z0-9-]{0,62}$/;

/**
 * A space: `personal` for the acting user's own space, or the ID of a shared space. A
 * personal space always answers, empty until its user's first write, and is never named by
 * another user.
 */
export const SpaceId = z.string().regex(NAME).openapi("SpaceId", {
  description:
    "`personal` for the acting user's own space, or a shared space's ID: 1 to 63 lowercase letters, digits and hyphens, starting with a letter or digit. `personal` always answers: before the user's first write it holds nothing.",
  example: "personal",
});
export type SpaceId = z.infer<typeof SpaceId>;

/** A group of users in the key's project, as a request names it. */
export const GroupId = z
  .string()
  .regex(/^(api|console|slack|google|github):[A-Za-z0-9._-]{1,128}$/)
  .openapi("GroupId", {
    description:
      "Where the group's members come from, a colon, and its name: `api:` for a group your server keeps, `console:` for a team made in the console, `slack:`, `google:` or `github:` for one mirrored from that source. Answers may hold sources not listed here.",
    example: "api:finance",
  });
export type GroupId = z.infer<typeof GroupId>;

/** One entry of an audience: a user, a group, or every member of the key's project. */
export const Principal = z
  .string()
  .regex(
    /^(?:project|user:(?!metaphor:$)[!#-[\]-~]{1,256}|group:(?:api|console|slack|google|github):[A-Za-z0-9._-]{1,128})$/,
    "Not `project`, `user:<user ID>` or `group:<group ID>`.",
  )
  .openapi("Principal", {
    description:
      "`user:<user ID>`, `group:<group ID>`, or `project` for every member of the key's project. End users, guests and service users are never in `project`. There is no entry for everyone, and none that denies.",
    example: "group:api:finance",
  });
export type Principal = z.infer<typeof Principal>;

/** Who may see a memory: a viewer who matches any one entry. */
export const Audience = z
  .array(Principal)
  .min(1)
  .max(100)
  .refine((list) => new Set(list).size === list.length, "An entry is listed twice.")
  .openapi("Audience", {
    uniqueItems: true,
    description:
      "Who may see a memory: 1 to 100 entries, and a viewer who matches any one of them may. A longer list belongs in a group.",
    example: ["user:customer-4821"],
  });
export type Audience = z.infer<typeof Audience>;

const next = z.string().nullable().openapi({
  description:
    "Send as `after` for the next page. Null on the last page. A page holds `limit` items unless it is the last.",
});

const page = z.strictObject({
  after: z.string().max(512).optional(),
  limit: z
    .string()
    .regex(/^[1-9][0-9]?$|^100$/)
    .default("50")
    .openapi({ description: "1 to 100, written in plain digits. 50 when left out." }),
});

/** A memory space and the audience a write in it gets when it names none. */
export const Space = z
  .object({
    id: z.string(),
    kind: z.string().openapi({ description: "`personal` or `shared` today." }),
    default_audience: z.array(z.string()).nullable().openapi({
      description:
        "Null when a write that names no audience is seen by its writer alone. An entry naming an end user other than the acting user is left out: Metaphor keeps no other end user's ID as you send it, so it has none to show.",
    }),
    default_audience_omitted: z.int().openapi({
      description: "How many entries were left out of `default_audience`.",
    }),
    created_at: Time.nullable().openapi({
      description: "Null for a personal space before its first write.",
    }),
  })
  .openapi("Space");
export type Space = z.infer<typeof Space>;

export const SpaceList = z.object({ data: z.array(Space), next }).openapi("SpaceList");
export type SpaceList = z.infer<typeof SpaceList>;

/** A shared space's settings. They are fixed when the space is made. */
export const PutSpace = z
  .strictObject({
    default_audience: Audience.nullable().default(null).openapi({
      description:
        "The audience of a write that names none. Null, the default, means its writer alone.",
    }),
  })
  .openapi("PutSpace");
export type PutSpace = z.input<typeof PutSpace>;

/** Where a memory came from: the source, and the item's ID and link there. */
export const Source = z
  .strictObject({
    name: z
      .string()
      .regex(/^[a-z0-9][a-z0-9-]{0,31}$/)
      .openapi({
        description: "The source: `api`, `slack`, `gmail`, `claude-code` or another name of yours.",
        example: "api",
      }),
    id: z.string().min(1).max(256).regex(PLAIN).openapi({
      description:
        "The item's ID at the source. Writing the same source ID again with the same content changes nothing. Content is compared as it is kept, with credentials such as API keys hidden, so text that differs only in one counts as the same. With other content, it is refused with `conflict` until replacing an item is served. Once its memory is forgotten, the same content sent again changes nothing while the forget can be undone, and is then refused with `conflict`. Each author's source IDs are their own. The ID is kept after its memory is forgotten, so it must not hold content: use the source's own ID, not a title or a sentence.",
      example: "ticket-1042",
    }),
    url: z
      .url({ protocol: /^https?$/ })
      .max(2048)
      .nullable()
      .default(null)
      .openapi({
        description:
          "A link to the item at the source: `http` or `https` only. Not kept yet: a value other than null is refused.",
      }),
  })
  .openapi("Source");
export type Source = z.input<typeof Source>;

const MemoryId = z
  .string()
  .regex(/^[0-9a-f]{32}$/)
  .openapi({
    description:
      "A memory's ID, made from its source. The same source gives the same ID in every space, so an ID names a memory only within its space.",
    example: "4f1c9a7e2b8d06c3a5e9f17b20d4c8e6",
  });

/** A memory to keep, with where it came from and who may see it. */
export const WriteMemory = z
  .strictObject({
    content: z.string().min(1).max(32_000).regex(/\S/).openapi({
      description:
        "What to remember: up to 32,000 characters, not all of them white space. It is never written to a log.",
    }),
    source: Source,
    occurred_at: Time.nullable().default(null).openapi({
      description:
        "When it happened, which may be long before it is sent. Null means now. Not kept yet: a value other than null is refused.",
    }),
    audience: Audience.nullable().default(null).openapi({
      description:
        "Who may see it. Null takes the space's default: in a personal space, its user alone. A user may name themselves, groups they are in, and `project` when they are a member.",
    }),
    agent: z.string().regex(NAME).nullable().default(null).openapi({
      description:
        "The agent writing it for the acting user, if one is, such as `claude-code`. Not kept yet: a value other than null is refused.",
      example: "claude-code",
    }),
  })
  .openapi("WriteMemory");
export type WriteMemory = z.input<typeof WriteMemory>;

/** The answer to a write. It is the same whether the memory is new, replaced or unchanged. */
export const WrittenMemory = z
  .object({
    id: MemoryId,
    status: z.string().openapi({ description: "`accepted` today." }),
  })
  .openapi("WrittenMemory");
export type WrittenMemory = z.infer<typeof WrittenMemory>;

/**
 * A memory as the acting user may see it. A user can always read, list and forget what they
 * wrote themselves, whatever its audience, until they are removed from the project; recall
 * returns it only to its audience.
 */
export const Memory = z
  .object({
    id: MemoryId,
    content: z.string(),
    source: z.object({ name: z.string(), id: z.string(), url: z.string().nullable() }),
    author: z.object({
      user_id: z.string().nullable().openapi({
        description:
          "Null when the author is an end user other than the acting user: Metaphor keeps no other end user's ID as you send it, so it has none to show.",
      }),
      agent: z.string().nullable().openapi({ description: "The agent that wrote it, if any." }),
    }),
    audience: z.array(z.string()).openapi({
      description:
        "Who may see it. An entry naming an end user other than the acting user is left out, for the same reason.",
    }),
    audience_omitted: z.int().openapi({
      description: "How many entries were left out of `audience`.",
    }),
    occurred_at: Time,
    received_at: Time,
    status: z.string().openapi({
      description:
        "`pending`: kept, and still being read for recall. `stored`: ready for recall. `held`: kept, and seen by nobody but its author until it can be read, for example when its source's sharing could not be read.",
    }),
  })
  .openapi("Memory");
export type Memory = z.infer<typeof Memory>;

export const MemoryList = z.object({ data: z.array(Memory), next }).openapi("MemoryList");
export type MemoryList = z.infer<typeof MemoryList>;

/** A question for recall, and how much it may return. */
export const RecallRequest = z
  .strictObject({
    question: z.string().min(1).max(4000).openapi({
      description: "The question, in the user's words. It is never written to a log.",
    }),
    budget: z.int().min(100).max(10_000).default(2000).openapi({
      description: "The most tokens the answer's lines may take together.",
    }),
  })
  .openapi("RecallRequest");
export type RecallRequest = z.input<typeof RecallRequest>;

/** One line of context for the question, and the memories it was made from. */
export const RecallItem = z
  .object({
    text: z.string(),
    heading: z.string().nullable(),
    occurred_at: Time.nullable().openapi({ description: "When it happened, if known." }),
    memory_ids: z.array(MemoryId).max(20).openapi({
      description:
        "Up to 20 of the memories this line was made from, each one a memory the user can see. The newest come first, by the minute each was written. Memories written in the same minute come in order of ID, not the order they were written.",
    }),
  })
  .openapi("RecallItem");
export type RecallItem = z.infer<typeof RecallItem>;

export const Recall = z.object({ items: z.array(RecallItem) }).openapi("Recall");
export type Recall = z.infer<typeof Recall>;

/** What to forget. */
export const ForgetRequest = z
  .union([
    z.strictObject({
      what: z.string().min(1).max(1000).openapi({
        description: "In the user's own words, such as `my phone number`.",
      }),
    }),
    z.strictObject({ memory_ids: z.array(MemoryId).min(1).max(100) }),
    z.strictObject({
      source: Source.pick({ name: true, id: true }),
      author: UserId.optional(),
    }),
    z.strictObject({ author: UserId }),
  ])
  .openapi("ForgetRequest", {
    description:
      "One of: `what`, in the user's words; `memory_ids`; `source`, every version of one item, with `author` when another user wrote it; or `author`, everything one user wrote in the space.",
  });
export type ForgetRequest = z.infer<typeof ForgetRequest>;

const ForgetId = z
  .string()
  .regex(/^[0-9a-f]{32}$/)
  .openapi({ example: "b7e04c2a9d3f18e6c5a0f29d4b81e7c3" });

/**
 * Where a forget stands. It reads the same whether or not the forget found anything, so it
 * never tells a user what they could not see.
 */
export const Forget = z
  .object({
    id: ForgetId,
    state: z.string().openapi({
      description:
        "`open`: gone from recall, and can be undone until `undo_until`. `undone`: brought back. `closed`: the undo window has closed and nothing of it can be read. `erased`: every key that could open a copy of it is destroyed too.",
    }),
    undo_until: Time.nullable(),
    erased_at: Time.nullable().openapi({
      description: "When every key that could open a copy is, or will be, destroyed.",
    }),
  })
  .openapi("Forget");
export type Forget = z.infer<typeof Forget>;

/** The answer to an erasure, which cannot be undone. */
export const Erasure = z
  .object({
    erased_at: Time.openapi({
      description:
        "From the answer, nothing of it can be read. By this time every key that could open a copy of it is destroyed too.",
    }),
  })
  .openapi("Erasure");
export type Erasure = z.infer<typeof Erasure>;

/** A group your server keeps: its whole member list, under a version. */
export const PutGroup = z
  .strictObject({
    members: z.array(UserId).max(10_000).openapi({
      description: "Every member, up to 10,000. It replaces the list the group had.",
    }),
    version: z.int().min(1).openapi({
      description:
        "Higher than the last version sent to replace the list, or equal with the same members to say it has not changed. A lower version changes nothing, so a late list never undoes a newer one.",
    }),
  })
  .openapi("PutGroup");
export type PutGroup = z.infer<typeof PutGroup>;

export const Group = z
  .object({
    id: z.string(),
    member_count: z.int().openapi({
      description:
        "How many members it has. The members are not listed: Metaphor keeps no end user's ID in a group as you send it.",
    }),
    version: z.int(),
    synced_at: Time.nullable().openapi({
      description:
        "When its members were last sent or read. A group that is not a `console:` team and has not synced for 24 hours gives nobody access until it does. Null for a `console:` team.",
    }),
  })
  .openapi("Group");
export type Group = z.infer<typeof Group>;

export const GroupList = z.object({ data: z.array(Group), next }).openapi("GroupList");
export type GroupList = z.infer<typeof GroupList>;

/** An end user to erase. A member is removed in the console instead (stage-3-alpha D7). */
export const EraseUser = z
  .strictObject({
    user_id: z
      .string()
      .min(1)
      .max(256)
      .regex(/^(?!metaphor:)[!#-[\]-~]+$/, "A member is removed in the console, not erased here.")
      .openapi({
        description: "An end user's ID. A member's, which starts with `metaphor:`, is refused.",
      }),
  })
  .openapi("EraseUser");
export type EraseUser = z.infer<typeof EraseUser>;

const spaceParams = z.object({ space_id: SpaceId });
const sharedSpaceParams = z.object({
  space_id: z
    .string()
    .regex(/^(?!personal$)[a-z0-9][a-z0-9-]{0,62}$/)
    .openapi({ description: "A shared space's name. `personal` is not one.", example: "support" }),
});

/** The answers every space route can give, beyond those of any keyed route. */
const acting = {
  ...keyed,
  400: refused("The request is not valid, or names no user to act for."),
  403: refused("The API key does not allow this, or not for this user."),
  404: refused("No such shared space."),
};

const tooLarge = (bytes: number) =>
  refused(`The request body is longer than ${bytes.toLocaleString("en")} bytes.`);

const json = refused("The body was not sent as `application/json`.");

export const listSpacesRoute = createRoute({
  method: "get",
  path: "/v1/spaces",
  summary: "List spaces",
  description:
    "Needs `memories:read`. The spaces in the key's project the acting user can open, `personal` first. A member sees every shared space; an end user or a guest sees only the shared spaces whose default audience names them or a group they are in. Every space route answers a shared space the acting user may not open as if it did not exist.",
  security,
  request: { headers: actingUser, query: page },
  responses: {
    200: {
      description: "A page of spaces.",
      content: { "application/json": { schema: SpaceList } },
    },
    ...acting,
  },
});

export const putSpaceRoute = createRoute({
  method: "put",
  path: "/v1/spaces/{space_id}",
  summary: "Make a shared space",
  description: `Needs \`spaces:manage\`. Makes the shared space if it does not exist; sent again with the same settings, it changes nothing. A space's settings never change, and an erased space's ID is never used again. \`personal\` cannot be made. The body may be up to ${BODY_LIMITS.putSpace.toLocaleString("en")} bytes.`,
  security,
  request: {
    headers: actingUser,
    params: sharedSpaceParams,
    body: { required: true, content: { "application/json": { schema: PutSpace } } },
  },
  responses: {
    200: {
      description: "The space existed with these settings.",
      content: { "application/json": { schema: Space } },
    },
    201: { description: "The space was made.", content: { "application/json": { schema: Space } } },
    ...acting,
    409: refused("The space exists with other settings, or was erased."),
    413: tooLarge(BODY_LIMITS.putSpace),
    415: json,
  },
});

export const deleteSpaceRoute = createRoute({
  method: "delete",
  path: "/v1/spaces/{space_id}",
  summary: "Erase a shared space",
  description:
    "Needs `spaces:manage`. Erases the shared space and everything in it. It cannot be undone; sent again, it answers the same. A personal space is erased with its user.",
  security,
  request: { headers: actingUser, params: sharedSpaceParams },
  responses: {
    202: {
      description: "Nothing of the space can be read.",
      content: { "application/json": { schema: Erasure } },
    },
    ...acting,
  },
});

export const writeMemoryRoute = createRoute({
  method: "post",
  path: "/v1/spaces/{space_id}/memories",
  summary: "Write a memory",
  description: `Needs \`memories:write\`. Answers once the memory is kept, before it is ready for recall. The acting user is its author. An audience naming a group that does not exist and one naming a group the user is not in are refused the same. The body may be up to ${BODY_LIMITS.writeMemory.toLocaleString("en")} bytes.`,
  security,
  request: {
    headers: actingUser,
    params: spaceParams,
    body: { required: true, content: { "application/json": { schema: WriteMemory } } },
  },
  responses: {
    202: {
      description:
        "The memory is kept. The same source and content sent again changes nothing, and a memory forgotten since stays forgotten.",
      content: { "application/json": { schema: WrittenMemory } },
    },
    ...acting,
    409: refused(
      "The source ID is already used, by other content or by a memory forgotten past undoing. Replacing an item is not served yet.",
    ),
    413: tooLarge(BODY_LIMITS.writeMemory),
    415: json,
    503: refused(
      "The request could not be checked, or the tenant is not set up to take memories yet. Try again later.",
    ),
  },
});

export const listMemoriesRoute = createRoute({
  method: "get",
  path: "/v1/spaces/{space_id}/memories",
  summary: "List memories",
  description:
    "Needs `memories:read`. The memories in the space the acting user can see or wrote, newest first, optionally only one agent's.",
  security,
  request: {
    headers: actingUser,
    params: spaceParams,
    query: page.extend({ agent: z.string().regex(NAME).optional() }),
  },
  responses: {
    200: {
      description: "A page of memories.",
      content: { "application/json": { schema: MemoryList } },
    },
    ...acting,
  },
});

export const getMemoryRoute = createRoute({
  method: "get",
  path: "/v1/spaces/{space_id}/memories/{memory_id}",
  summary: "Read a memory",
  description:
    "Needs `memories:read`. A memory the acting user can neither see nor wrote answers as if it did not exist.",
  security,
  request: { headers: actingUser, params: spaceParams.extend({ memory_id: MemoryId }) },
  responses: {
    200: { description: "The memory.", content: { "application/json": { schema: Memory } } },
    ...acting,
    404: refused("No such memory, or no such shared space."),
  },
});

export const recallRoute = createRoute({
  method: "post",
  path: "/v1/spaces/{space_id}/recall",
  summary: "Recall",
  description: `Needs \`memories:read\`. The context for a question from one space. Recall never returns a memory the user cannot see, or anything made from one. The body may be up to ${BODY_LIMITS.recall.toLocaleString("en")} bytes.`,
  security,
  request: {
    headers: actingUser,
    params: spaceParams,
    body: { required: true, content: { "application/json": { schema: RecallRequest } } },
  },
  responses: {
    200: {
      description:
        "The lines, in the order they are best read. None when nothing in the space answers the question.",
      content: { "application/json": { schema: Recall } },
    },
    ...acting,
    413: tooLarge(BODY_LIMITS.recall),
    415: json,
    503: refused(
      "The request could not be checked, or the tenant is not set up to recall yet. Try again later.",
    ),
  },
});

export const forgetRoute = createRoute({
  method: "post",
  path: "/v1/spaces/{space_id}/forget",
  summary: "Forget",
  description: `Needs \`memories:forget\`, which reaches only what the acting user wrote. \`memories:forget-others\` reaches what others wrote too, by \`memory_ids\`, \`source\` or \`author\`, whether or not the acting user can see it; each such forget is recorded and shown to the author. \`what\` always reaches only the acting user's own writing. What a forget reaches leaves recall at once, with every memory made from it, and can be brought back until the undo window closes. It answers the same whether or not anything matched. The body may be up to ${BODY_LIMITS.forget.toLocaleString("en")} bytes.`,
  security,
  request: {
    headers: actingUser,
    params: spaceParams,
    body: { required: true, content: { "application/json": { schema: ForgetRequest } } },
  },
  responses: {
    202: {
      description: "The forget is under way.",
      content: { "application/json": { schema: Forget } },
    },
    ...acting,
    413: tooLarge(BODY_LIMITS.forget),
    415: json,
  },
});

const forgetParams = spaceParams.extend({ forget_id: ForgetId });

export const getForgetRoute = createRoute({
  method: "get",
  path: "/v1/spaces/{space_id}/forgets/{forget_id}",
  summary: "Read a forget",
  description: "Needs `memories:forget`. Only the user who asked for a forget can read it.",
  security,
  request: { headers: actingUser, params: forgetParams },
  responses: {
    200: {
      description: "Where the forget stands.",
      content: { "application/json": { schema: Forget } },
    },
    ...acting,
    404: refused("No such forget, or no such shared space."),
  },
});

export const undoForgetRoute = createRoute({
  method: "post",
  path: "/v1/spaces/{space_id}/forgets/{forget_id}/undo",
  summary: "Undo a forget",
  description:
    "Needs the scope the forget needed. Only the user who asked for a forget can undo it. Brings back what the forget took while its undo window is open. After that it changes nothing and answers where the forget stands.",
  security,
  request: { headers: actingUser, params: forgetParams },
  responses: {
    200: {
      description: "Where the forget stands now.",
      content: { "application/json": { schema: Forget } },
    },
    ...acting,
    404: refused("No such forget, or no such shared space."),
  },
});

const groupParams = z.object({
  group_id: z
    .string()
    .regex(/^api:[A-Za-z0-9._-]{1,128}$/)
    .openapi({ description: "An `api:` group's ID.", example: "api:finance" }),
});

/** The answers every group route can give. A key held to a user cannot manage groups. */
const managing = {
  ...keyed,
  403: refused("The API key does not allow this, or is held to a user."),
};

export const putGroupRoute = createRoute({
  method: "put",
  path: "/v1/groups/{group_id}",
  summary: "Set a group's members",
  description: `Needs \`groups:manage\`. Makes the group, or replaces its whole member list. Only an \`api:\` group can be set here: the others follow their source. A deleted group's ID is never used again. The body may be up to ${BODY_LIMITS.putGroup.toLocaleString("en")} bytes.`,
  security,
  request: {
    params: groupParams,
    body: { required: true, content: { "application/json": { schema: PutGroup } } },
  },
  responses: {
    200: {
      description: "The group as it now stands.",
      content: { "application/json": { schema: Group } },
    },
    ...managing,
    400: refused("The request is not valid."),
    409: refused("The version is the last one with other members, or the group was deleted."),
    413: tooLarge(BODY_LIMITS.putGroup),
    415: json,
  },
});

export const listGroupsRoute = createRoute({
  method: "get",
  path: "/v1/groups",
  summary: "List groups",
  description: "Needs `groups:manage`. The groups in the key's project.",
  security,
  request: { query: page },
  responses: {
    200: {
      description: "A page of groups.",
      content: { "application/json": { schema: GroupList } },
    },
    ...managing,
  },
});

export const deleteGroupRoute = createRoute({
  method: "delete",
  path: "/v1/groups/{group_id}",
  summary: "Delete a group",
  description:
    "Needs `groups:manage`. Only an `api:` group. From then it gives nobody access, through every audience that names it. Sent again, or for a group that never was, it answers the same, and the ID is never used again.",
  security,
  request: { params: groupParams },
  responses: {
    204: { description: "No such group gives access." },
    ...managing,
  },
});

export const eraseUserRoute = createRoute({
  method: "post",
  path: "/v1/users/erase",
  summary: "Erase an end user",
  description: `Needs \`users:erase\`; a key held to a user may erase only that user. Only an end user: a member is removed in the console, where their private memories are hidden at once and erased 30 days later. Erases the user's personal space and everything they wrote in the key's project, takes them out of every group, revokes every key held to them and removes their ID from those keys' records. It cannot be undone, and it answers the same whether or not the user had anything. The ID is sent in the body so it never appears in a URL. The body may be up to ${BODY_LIMITS.eraseUser.toLocaleString("en")} bytes.`,
  security,
  request: {
    body: { required: true, content: { "application/json": { schema: EraseUser } } },
  },
  responses: {
    202: {
      description: "Nothing of the user can be read.",
      content: { "application/json": { schema: Erasure } },
    },
    ...keyed,
    400: refused("The request is not valid."),
    403: refused("The API key does not allow this, or not for this user."),
    413: tooLarge(BODY_LIMITS.eraseUser),
    415: json,
  },
});

/** Every public route. The API implements each one and openapi.yaml documents them. */
export const routes = [
  healthRoute,
  createApiKeyRoute,
  listApiKeysRoute,
  revokeApiKeyRoute,
  writeMemoryRoute,
  recallRoute,
];

/**
 * The routes of contract v0 that the API does not serve yet. A key works in one project, so
 * no route names one: a key made before projects works in its business's default project.
 */
export const draftRoutes = [
  listSpacesRoute,
  putSpaceRoute,
  deleteSpaceRoute,
  listMemoriesRoute,
  getMemoryRoute,
  forgetRoute,
  getForgetRoute,
  undoForgetRoute,
  listGroupsRoute,
  putGroupRoute,
  deleteGroupRoute,
  eraseUserRoute,
];

/**
 * Builds the OpenAPI document from the routes, without running the API. openapi.yaml is
 * made from the served routes alone; the drafts are passed only to check they build.
 */
export function openApiDocument(
  list: readonly ReturnType<typeof createRoute>[] = routes,
): ReturnType<OpenAPIHono["getOpenAPI31Document"]> {
  const app = new OpenAPIHono();
  app.openAPIRegistry.registerComponent("securitySchemes", "apiKey", {
    type: "http",
    scheme: "bearer",
    description: "An API key, sent as `Authorization: Bearer <key>`.",
  });
  // ErrorCode is listed though no field refers to it: Error's `code` is an open string.
  app.openAPIRegistry.register("ErrorCode", ErrorCode);
  for (const route of list) app.openAPIRegistry.registerPath(route);
  return app.getOpenAPI31Document({
    openapi: "3.1.0",
    info: { title: "Metaphor API", version: "1" },
    servers: [{ url: "https://api.metaphoric.io" }],
  });
}
