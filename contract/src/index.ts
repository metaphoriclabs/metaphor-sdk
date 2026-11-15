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

/** The body of every answer that is not a success. `code` is fixed and `message` is for people. */
export const ApiError = z
  .object({ error: z.object({ code: z.string(), message: z.string() }) })
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
    "The API key sent more than 600 requests in a minute. Wait the seconds `Retry-After` gives.",
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
    user_id: z.string().min(1).max(256).nullable().default(null),
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
      "The API key sent more than 600 requests in a minute, or the tenant's keys made as many keys as they may in 24 hours. Wait the seconds `Retry-After` gives.",
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

/** Every public route. The API implements each one and openapi.yaml documents them. */
export const routes = [healthRoute, createApiKeyRoute, listApiKeysRoute, revokeApiKeyRoute];

/** Builds the OpenAPI document from the routes, without running the API. */
export function openApiDocument(): ReturnType<OpenAPIHono["getOpenAPI31Document"]> {
  const app = new OpenAPIHono();
  app.openAPIRegistry.registerComponent("securitySchemes", "apiKey", {
    type: "http",
    scheme: "bearer",
    description: "An API key, sent as `Authorization: Bearer <key>`.",
  });
  for (const route of routes) app.openAPIRegistry.registerPath(route);
  return app.getOpenAPI31Document({
    openapi: "3.1.0",
    info: { title: "Metaphor API", version: "1" },
    servers: [{ url: "https://api.metaphoric.io" }],
  });
}
