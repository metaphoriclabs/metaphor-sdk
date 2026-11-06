// Writes openapi.yaml from the routes. CI fails if the committed file is out of date.
import { writeFileSync } from "node:fs";
import { stringify } from "yaml";
import { openApiDocument } from "../src/index.ts";

writeFileSync(new URL("../openapi.yaml", import.meta.url), stringify(openApiDocument()));
