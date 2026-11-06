# Metaphor SDK

Open-source clients, tools and the API contract for Metaphor, a long-term memory engine for agents.

This repository is a read-only copy of the `open/` directory in Metaphor's main repository, synced on every change. Open issues here; pull requests are ported by hand.

## Packages

| Path                   | Package                      | What it is                                                          |
| ---------------------- | ---------------------------- | ------------------------------------------------------------------- |
| `contract/`            | `@metaphoriclabs/contract`   | Zod schemas and the OpenAPI document for the public API             |
| `sdk-ts/`              | `@metaphoriclabs/sdk`        | TypeScript client                                                   |
| `sdk-py/`              | `metaphor-sdk` on PyPI       | Python client                                                       |
| `mcp/`                 | `@metaphoriclabs/mcp`        | MCP tool definitions and a local stdio server                       |
| `ai-sdk/`              | `@metaphoriclabs/ai-sdk`     | Vercel AI SDK middleware                                            |
| `connectors/`          | `@metaphoriclabs/connectors` | Slack, GitHub, Gmail, Google Calendar, Docs and Directory, meetings |
| `brand/`               | `@metaphoriclabs/brand`      | Design tokens                                                       |
| `bench/`               | `@metaphoriclabs/bench`      | The published benchmark and its runner                              |
| `plugins/claude-code/` |                              | Claude Code plugin                                                  |
| `examples/`            |                              | Runnable examples                                                   |

## Development

You need Node.js 26.13 or later with Corepack. The Python SDK also needs [uv](https://docs.astral.sh/uv/).

```sh
corepack enable
pnpm install
pnpm build
```

`pnpm typecheck` and `pnpm test` run the checks. `pnpm-workspace.yaml` and `pnpm-lock.yaml` are generated from the main repository, so dependency versions match what it tests.

## Releases

Versions are set in the main repository. When a sync brings a version that isn't on its registry yet, `.github/workflows/publish.yml` publishes it: npm packages with provenance, and the Python SDK to PyPI. Both use trusted publishing, so no tokens are stored.

## License

Apache-2.0. See `LICENSE`.
