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

/** Every public route. The API implements each one and openapi.yaml documents them. */
export const routes = [healthRoute];

/** Builds the OpenAPI document from the routes, without running the API. */
export function openApiDocument(): ReturnType<OpenAPIHono["getOpenAPI31Document"]> {
  const app = new OpenAPIHono();
  for (const route of routes) app.openAPIRegistry.registerPath(route);
  return app.getOpenAPI31Document({
    openapi: "3.1.0",
    info: { title: "Metaphor API", version: "1" },
    servers: [{ url: "https://api.metaphoric.io" }],
  });
}
