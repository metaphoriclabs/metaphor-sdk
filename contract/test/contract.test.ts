import type { RouteConfig } from "@hono/zod-openapi";
import { describe, expect, it } from "vitest";
import {
  ACTING_USER_HEADER,
  Audience,
  BODY_LIMITS,
  CreateApiKey,
  deleteSpaceRoute,
  draftRoutes,
  EraseUser,
  ForgetRequest,
  listMemoriesRoute,
  openApiDocument,
  Principal,
  PutGroup,
  PutSpace,
  putGroupRoute,
  putSpaceRoute,
  RecallRequest,
  routes,
  Source,
  Space,
  UserId,
  WriteMemory,
} from "../src/index.ts";

const draft = openApiDocument([...routes, ...draftRoutes]);
/** Every route, served or not: a rule for routes holds for both. */
const everyRoute: readonly RouteConfig[] = [...routes, ...draftRoutes];
/** The draft routes and the space routes served from them. The key routes came before. */
const drafts: ReadonlySet<RouteConfig> = new Set(draftRoutes);
const v0Routes = everyRoute.filter(
  (route) => drafts.has(route) || route.path.startsWith("/v1/spaces"),
);
const draftPaths = draft.paths ?? {};
const operation = (route: RouteConfig) => draftPaths[route.path]?.[route.method as "get"];

describe("contract v0 drafts", () => {
  it("builds one document with the served routes", () => {
    const operations = Object.values(draftPaths).flatMap((item) => Object.keys(item ?? {}));
    expect(operations).toHaveLength(routes.length + draftRoutes.length);
  });

  it("keeps every draft out of openapi.yaml until it is served", () => {
    const served = new Set(routes.map((route) => `${route.method} ${route.path}`));
    for (const route of draftRoutes) expect(served).not.toContain(`${route.method} ${route.path}`);
    expect(Object.keys(openApiDocument().paths ?? {})).not.toContain("/v1/spaces");
  });

  it("asks every space route who it acts for, and no other route", () => {
    for (const route of everyRoute) {
      const names = (operation(route)?.parameters ?? []).map((p) =>
        "name" in p ? p.name : undefined,
      );
      const acts = route.path.startsWith("/v1/spaces");
      expect(names.includes(ACTING_USER_HEADER), `${route.method} ${route.path}`).toBe(acts);
    }
  });

  it("takes no query parameter but paging and the agent filter", () => {
    for (const route of everyRoute) {
      const names = (operation(route)?.parameters ?? [])
        .filter((p) => "in" in p && p.in === "query")
        .map((p) => ("name" in p ? p.name : ""));
      for (const name of names) expect(["after", "limit", "agent"], route.path).toContain(name);
    }
  });

  it("puts no user ID in a path or a query", () => {
    for (const route of everyRoute) {
      expect(route.path).not.toMatch(/{user/);
      const outside = (operation(route)?.parameters ?? []).filter(
        (p) => "in" in p && (p.in === "path" || p.in === "query"),
      );
      for (const p of outside) expect("name" in p && p.name, route.path).not.toMatch(/user|author/);
    }
  });

  it("states the body limit of every route that takes a body", () => {
    for (const route of v0Routes.filter((r) => r.request && "body" in r.request)) {
      expect(route.description, route.path).toMatch(/The body may be up to [\d,]+ bytes\./);
      expect(Object.keys(route.responses), route.path).toContain("413");
    }
  });

  it("answers with no closed list a later value would break", () => {
    // Answers name their schemas by $ref, so follow every reference to the schema itself.
    const schemas = (draft.components?.schemas ?? {}) as Record<string, unknown>;
    const seen = new Set<string>();
    const follow = (value: unknown): void => {
      const text = JSON.stringify(value);
      expect(text).not.toContain('"enum"');
      for (const [, name] of text.matchAll(/"#\/components\/schemas\/([^"]+)"/g)) {
        if (name && !seen.has(name)) {
          seen.add(name);
          follow(schemas[name]);
        }
      }
    };
    for (const route of v0Routes) follow(operation(route)?.responses ?? {});
    expect(seen).toContain("Memory");
  });

  it("describes a user ID as an ID, not as the header that carries one", () => {
    const userId = draft.components?.schemas?.UserId as { description?: string } | undefined;
    expect(userId?.description).toMatch(/^A member's ID/);
  });

  it("publishes nothing about how memories are found", () => {
    // roadmap D3: how memories are retrieved, extracted, searched and indexed stays private.
    const text = JSON.stringify(draft).toLowerCase();
    const words = ["embed", "vector", "rank", "index", "bm25", "extract", "deriv", "chunk"];
    words.push("semantic", "similar", "score", "graph", "model", "search", "retriev");
    for (const word of words) expect(text, word).not.toContain(word);
  });
});

describe("UserId", () => {
  it.each(["customer-4821", "metaphor:u1", "a.b@c"])("takes %s", (value) =>
    expect(UserId.safeParse(value).success).toBe(true),
  );

  it.each(["", "metaphor:", 'a"b', "a\\b", "a b", "é", "x".repeat(257)])("refuses %j", (value) =>
    expect(UserId.safeParse(value).success).toBe(false),
  );
});

describe("Principal", () => {
  it.each(["project", "user:customer-4821", "user:metaphor:u1", "group:api:finance"])(
    "takes %s",
    (value) => expect(Principal.safeParse(value).success).toBe(true),
  );

  it.each([
    "everyone",
    "public",
    "user:",
    "user:metaphor:",
    "group:finance",
    "group:other:x",
    "user:a b",
    "deny:x",
  ])("refuses %s", (value) => expect(Principal.safeParse(value).success).toBe(false));
});

describe("Audience", () => {
  it("holds 1 to 100 entries, each once", () => {
    const many = Array.from({ length: 101 }, (_, i) => `user:u${i}`);
    expect(Audience.safeParse([]).success).toBe(false);
    expect(Audience.safeParse(many.slice(0, 100)).success).toBe(true);
    expect(Audience.safeParse(many).success).toBe(false);
    expect(Audience.safeParse(["project", "project"]).success).toBe(false);
  });
});

describe("PutSpace", () => {
  it("defaults a shared space to the writer alone", () => {
    expect(PutSpace.parse({})).toEqual({ default_audience: null });
  });
});

describe("WriteMemory", () => {
  const write = { content: "Prefers email.", source: { name: "api", id: "ticket-1042" } };

  it("defaults to the space's audience, now and no agent", () => {
    expect(WriteMemory.parse(write)).toEqual({
      ...write,
      source: { ...write.source, url: null },
      occurred_at: null,
      audience: null,
      agent: null,
    });
  });

  it("refuses a field it does not know, such as another tenant or project", () => {
    expect(WriteMemory.safeParse({ ...write, tenant_id: "t2" }).success).toBe(false);
    expect(WriteMemory.safeParse({ ...write, project_id: "p2" }).success).toBe(false);
    expect(WriteMemory.safeParse({ ...write, author: "metaphor:ceo" }).success).toBe(false);
  });

  it("counts content in characters, as the space does: 32,000 emoji and no more", () => {
    // Each is two UTF-16 units: a count of units would refuse what the space keeps.
    const takes = (content: string) => WriteMemory.safeParse({ ...write, content }).success;
    expect(takes("🚲".repeat(32_000))).toBe(true);
    expect(takes("🚲".repeat(32_001))).toBe(false);
  });

  it.each(["", " ", "   ", "\n\t", "\u00a0\u2028\ufeff"])(
    "refuses content of white space alone: %j",
    (content) => expect(WriteMemory.safeParse({ ...write, content }).success).toBe(false),
  );
});

describe("ForgetRequest", () => {
  it.each([
    { what: "my phone number" },
    { memory_ids: ["4f1c9a7e2b8d06c3a5e9f17b20d4c8e6"] },
    { source: { name: "slack", id: "C1/1700000000.1" } },
    { source: { name: "slack", id: "C1/1700000000.1" }, author: "metaphor:u1" },
    { author: "customer-4821" },
  ])("takes %j", (value) => expect(ForgetRequest.safeParse(value).success).toBe(true));

  it.each([
    {},
    { what: "my phone number", author: "customer-4821" },
    { memory_ids: [], author: "customer-4821" },
    { what: "x", memory_ids: ["4f1c9a7e2b8d06c3a5e9f17b20d4c8e6"] },
  ])("refuses %j", (value) => expect(ForgetRequest.safeParse(value).success).toBe(false));
});

describe("EraseUser", () => {
  it("takes an end user and refuses a member", () => {
    expect(EraseUser.safeParse({ user_id: "customer-4821" }).success).toBe(true);
    expect(EraseUser.safeParse({ user_id: "metaphor:u1" }).success).toBe(false);
  });
});

describe("CreateApiKey", () => {
  const key = (user_id: unknown) =>
    CreateApiKey.safeParse({ name: "n", scopes: ["memories:read"], user_id }).success;

  it("holds a key to an end user or to no one user", () => {
    expect(key("customer-4821")).toBe(true);
    expect(key(null)).toBe(true);
  });

  it("refuses a member's ID, and what the header cannot carry as sent", () => {
    for (const id of ["metaphor:", "metaphor:u1", 'a"b', "a\\b", "a b", "é", ""]) {
      expect(key(id)).toBe(false);
    }
  });
});

describe("request limits", () => {
  // The most bytes a client could send for a body the schema accepts: some encoders write every
  // character past ASCII as \uXXXX (Python, PHP) and "/" as "\/" (PHP).
  const escaped = (value: unknown) =>
    JSON.stringify(value)
      .replace(/\//g, "\\/")
      .replace(/[\u0080-\uffff]/g, (c) => `\\u${c.charCodeAt(0).toString(16).padStart(4, "0")}`)
      .length;
  const longestId = "/".repeat(256);
  const longestAudience = Array.from({ length: 100 }, (_, i) => `user:${i}${"/".repeat(250)}`);
  const emoji = (n: number) => "\u{1F600}".repeat(n);

  it.each([
    ["putSpace", PutSpace, { default_audience: longestAudience }],
    [
      "writeMemory",
      WriteMemory,
      {
        content: emoji(32_000),
        source: {
          name: "a".repeat(32),
          id: longestId,
          url: `https://a.example/${"/".repeat(2000)}`,
        },
        occurred_at: "2027-01-31T09:30:00.000Z",
        audience: longestAudience,
        agent: "a".repeat(63),
      },
    ],
    ["recall", RecallRequest, { question: emoji(4000), budget: 10_000 }],
    [
      "forget",
      ForgetRequest,
      { source: { name: "a".repeat(32), id: longestId }, author: longestId },
    ],
    ["forget", ForgetRequest, { what: emoji(1000) }],
    ["forget", ForgetRequest, { memory_ids: Array.from({ length: 100 }, () => "a".repeat(32)) }],
    [
      "putGroup",
      PutGroup,
      { members: Array.from({ length: 10_000 }, () => longestId), version: 2 ** 53 - 1 },
    ],
    ["eraseUser", EraseUser, { user_id: longestId }],
  ] as const)("lets through the largest %s body the schema accepts", (name, schema, body) => {
    expect(schema.safeParse(body).success).toBe(true);
    expect(escaped(body)).toBeLessThanOrEqual(BODY_LIMITS[name]);
  });
});

describe("Source", () => {
  it.each(["javascript:alert(1)", "file:///etc/passwd", "data:text/html,x", "ftp://a.example/x"])(
    "refuses the link %s",
    (url) => expect(Source.safeParse({ name: "api", id: "a", url }).success).toBe(false),
  );

  it("takes an http or https link", () => {
    expect(Source.safeParse({ name: "api", id: "a", url: "https://a.example/x" }).success).toBe(
      true,
    );
    expect(Source.safeParse({ name: "api", id: "a", url: "http://a.example/x" }).success).toBe(
      true,
    );
  });
});

describe("queries", () => {
  const query = listMemoriesRoute.request.query;

  it("refuses a name it does not know", () => {
    expect(query.safeParse({ agnet: "claude-code" }).success).toBe(false);
  });

  it.each(["0x10", "1e1", " 5 ", "5.0", "+7", "0", "101"])("refuses the limit %j", (limit) =>
    expect(query.safeParse({ limit }).success).toBe(false),
  );

  it.each(["1", "50", "99", "100"])("takes the limit %s", (limit) =>
    expect(query.safeParse({ limit }).success).toBe(true),
  );
});

describe("group routes", () => {
  it.each(["console:finance", "slack:C1", "google:eng"])(
    "refuse %s, which follows its source",
    (id) => expect(putGroupRoute.request.params.safeParse({ group_id: id }).success).toBe(false),
  );
});

describe("the published document", () => {
  // A generated client checks requests against the document, so it must refuse what the API refuses.
  const schemas = (draft.components?.schemas ?? {}) as Record<string, { pattern?: string }>;
  const pattern = (name: string) => new RegExp(schemas[name]?.pattern ?? "");

  it.each(["everyone", "deny:user:x", "user:metaphor:", "group:finance", "user:a b"])(
    "carries the rule that refuses the entry %s",
    (value) => expect(pattern("Principal").test(value)).toBe(false),
  );

  it("refuses an entry listed twice", () => {
    const put = JSON.stringify(schemas.PutSpace);
    expect(put).toContain('"uniqueItems":true');
  });

  it("refuses a member's ID on erase", () => {
    const erase = JSON.stringify(schemas.EraseUser);
    const source = /"pattern":"((?:[^"\\]|\\.)*)"/.exec(erase)?.[1] ?? "";
    const rule = new RegExp(JSON.parse(`"${source}"`));
    expect(rule.test("metaphor:u1")).toBe(false);
    expect(rule.test("customer-4821")).toBe(true);
  });

  it("refuses a member's ID on a key", () => {
    // Served now, so the rule must be in the document generated from served routes.
    const create = JSON.stringify(openApiDocument(routes).components?.schemas?.CreateApiKey);
    const source = /"pattern":"((?:[^"\\]|\\.)*)"/.exec(create)?.[1] ?? "";
    const rule = new RegExp(JSON.parse(`"${source}"`));
    expect(rule.test("metaphor:u1")).toBe(false);
    expect(rule.test('a"b')).toBe(false);
    expect(rule.test("customer-4821")).toBe(true);
  });
});

describe("answers about others", () => {
  it("leave other end users out of a space's default audience, and count them", () => {
    expect(Object.keys(Space.shape)).toContain("default_audience_omitted");
  });

  it("let only the user who asked undo a forget", () => {
    const undo = everyRoute.find((route) => route.path.endsWith("/undo"));
    expect(undo?.description).toMatch(/Only the user who asked for a forget can undo it\./);
  });
});

describe("space routes", () => {
  it.each([
    ["PUT", putSpaceRoute],
    ["DELETE", deleteSpaceRoute],
  ] as const)("%s refuses `personal`", (_, route) => {
    const params = route.request.params;
    expect(params.safeParse({ space_id: "personal" }).success).toBe(false);
    expect(params.safeParse({ space_id: "support" }).success).toBe(true);
  });
});
