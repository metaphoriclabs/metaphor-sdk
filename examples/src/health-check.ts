// Checks the API is reachable. Run with: METAPHOR_API_KEY=... node src/health-check.ts
import { createClient } from "@metaphoriclabs/sdk";

const client = createClient({
  baseUrl: process.env.METAPHOR_BASE_URL ?? "http://localhost:8787",
  apiKey: process.env.METAPHOR_API_KEY ?? "",
});

console.log(await client.health());
