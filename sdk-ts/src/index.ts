import type { Health } from "@metaphoriclabs/contract";

const DEFAULT_BASE_URL = "https://api.metaphoric.io";

export interface ClientOptions {
  /** API origin. Defaults to https://api.metaphoric.io. */
  baseUrl?: string;
  apiKey: string;
}

export interface Client {
  health(): Promise<Health>;
}

/** TypeScript client for the Metaphor API, typed from @metaphoriclabs/contract. */
export function createClient({ baseUrl = DEFAULT_BASE_URL, apiKey }: ClientOptions): Client {
  async function get<T>(path: string): Promise<T> {
    const response = await fetch(new URL(path, baseUrl), {
      headers: { authorization: `Bearer ${apiKey}` },
    });
    if (!response.ok) throw new Error(`GET ${path} failed with status ${response.status}`);
    return (await response.json()) as T;
  }

  return {
    health: () => get<Health>("/health"),
  };
}
