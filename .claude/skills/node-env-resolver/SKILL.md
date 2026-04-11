---
name: node-env-resolver
description: 'Use when setting up application configuration with node-env-resolver, managing secrets securely, resolving env vars, or wiring config into the composition root.'
---

## Overview

`node-env-resolver` validates and types all config at startup. Fail fast, never scatter `process.env` reads through business logic.

## Import Map

Every subpath is a separate entry point. Import from the correct path.

| Import path                    | Exports                                                                                                                                                                                                                                                       |
| ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `node-env-resolver`            | `resolve`, `resolveAsync`, `safeResolve`, `safeResolveAsync`, `getAuditLog`, `clearAuditLog`, `createDebugView`, `createSecuritySnapshot`, `createRedactedObject`                                                                                             |
| `node-env-resolver/resolvers`  | `processEnv`, `dotenv`, `packageJson`, `json`, `yaml`, `toml`, `http`, `secrets`                                                                                                                                                                              |
| `node-env-resolver/validators` | `string`, `number`, `boolean`, `url`, `email`, `port`, `postgres`, `mysql`, `mongodb`, `redis`, `http`, `https`, `secret`, `duration`, `file`, `json`, `date`, `timestamp`, `oneOf`, `enumOf`, `optional`, `custom`, `stringArray`, `numberArray`, `urlArray` |
| `node-env-resolver/builder`    | `env`, `envSync`, `EnvBuilder`, `EnvBuilderSync`                                                                                                                                                                                                              |
| `node-env-resolver/zod`        | `resolveZod`, `safeResolveZod`, `resolveSyncZod`, `safeResolveSyncZod`                                                                                                                                                                                        |
| `node-env-resolver/valibot`    | Valibot integration (same pattern as zod)                                                                                                                                                                                                                     |
| `node-env-resolver/cli`        | `cliArgs`                                                                                                                                                                                                                                                     |
| `node-env-resolver/runtime`    | `protect`, `patchGlobalConsole`, `createConsoleRedactor`, `createResponseMiddleware`, `wrapFetchResponse`, `scanBodyForSecrets`, `createRedactor`, `extractSensitiveValues`                                                                                   |
| `node-env-resolver/audit`      | `getAuditLog`, `clearAuditLog`                                                                                                                                                                                                                                |
| `node-env-resolver/web`        | Browser-aware client/server split                                                                                                                                                                                                                             |

## Schema Shorthand

Schema values are NOT validator calls for primitives. Literal values define type + default:

```typescript
const schema = {
  PORT: 3000, // number, default 3000
  DEBUG: false, // boolean, default false
  HOST: 'localhost', // string, default 'localhost'
  NODE_ENV: ['development', 'production'] as const, // enum (required, no default)
  DATABASE_URL: postgres(), // required postgres URL (validator)
  REDIS_URL: redis({ optional: true }), // optional redis URL
  API_KEY: string(), // required string (no default)
  TIMEOUT: string({ optional: true, default: '30s' }), // optional with default
};
```

**Rule:** Bare literals (`3000`, `false`, `'localhost'`) = type inferred from value + used as default. Validator calls (`postgres()`, `string()`) = validation + required by default.

## Core API

### Sync resolve (simple config from process.env)

```typescript
import { resolve } from 'node-env-resolver';
import { postgres, string } from 'node-env-resolver/validators';

const config = resolve({
  PORT: 3000,
  NODE_ENV: ['development', 'production', 'test'] as const,
  DATABASE_URL: postgres(),
  API_KEY: string(),
});
```

`resolve()` reads from `process.env` by default. Throws on missing/invalid vars.

### Async resolve with multiple sources

```typescript
import { resolveAsync } from 'node-env-resolver';
import { processEnv, dotenv } from 'node-env-resolver/resolvers';
import { postgres, string } from 'node-env-resolver/validators';

const config = await resolveAsync({
  resolvers: [
    [processEnv(), { PORT: 3000, NODE_ENV: ['development', 'production'] as const }],
    [dotenv(), { HOST: 'localhost' }],
  ],
  options: { priority: 'last' }, // later resolvers override earlier
});
```

**Resolver tuple pattern:** `[resolver, schema]` — each resolver is paired with the schema it provides. Schemas merge (last wins for conflicts).

### Safe resolve (no throw)

```typescript
import { safeResolve } from 'node-env-resolver';

const result = safeResolve({ PORT: 3000, API_KEY: string() });

if (result.success) {
  console.log(result.data.PORT);
} else {
  console.error(result.error);
  process.exit(1);
}
```

All four variants: `resolve`, `resolveAsync`, `safeResolve`, `safeResolveAsync`.

### Builder / Fluent API

```typescript
import { env } from 'node-env-resolver/builder';
import { string } from 'node-env-resolver/validators';
import { awsSecrets } from 'node-env-resolver-aws';

const config = env({ PORT: 3000, DEBUG: false })
  .from(awsSecrets({ secretId: 'prod/secrets' }), {
    API_KEY: string(),
    DB_PASSWORD: string(),
  })
  .resolve(); // sync
```

Builder auto-includes `dotenv()` in non-production and `processEnv()` always. Use `envSync()` for explicit sync-only builder.

## Resolvers

| Resolver           | Source         | Sync | Notes                                                                 |
| ------------------ | -------------- | ---- | --------------------------------------------------------------------- |
| `processEnv()`     | `process.env`  | yes  | Always available, default for `resolve()`                             |
| `dotenv(options?)` | `.env` files   | yes  | `expand: true` loads `.env.defaults`, `.env.local`, `.env.{NODE_ENV}` |
| `packageJson()`    | `package.json` | yes  | Reads `name`, `version`, `config`                                     |
| `json(path?)`      | JSON file      | yes  | Flattens to uppercase keys                                            |
| `yaml(options?)`   | YAML file      | yes  | Requires peer `js-yaml`                                               |
| `toml(options?)`   | TOML file      | yes  | Requires peer `smol-toml`                                             |
| `http(url, opts?)` | HTTP endpoint  | no   | Fetches JSON                                                          |
| `secrets(path?)`   | Mounted files  | yes  | Docker/K8s `/run/secrets`                                             |
| `cliArgs(opts?)`   | CLI flags      | yes  | `--kebab-case` to `SCREAMING_SNAKE_CASE`                              |

Import resolvers from `node-env-resolver/resolvers` (except `cliArgs` from `node-env-resolver/cli`).

## Validators

Import individually from `node-env-resolver/validators` — NOT as a namespace:

```typescript
// CORRECT
import { postgres, string, url, port } from 'node-env-resolver/validators';

// WRONG - there is no namespace export
import { validators } from 'node-env-resolver'; // does not exist
```

All validators accept `{ optional?: boolean, default?: T }`. Key validators:

`string`, `number`, `boolean`, `url`, `email`, `port`, `postgres`, `mysql`, `mongodb`, `redis`, `http`, `https`, `secret`, `duration`, `file`, `json`, `date`, `timestamp`, `oneOf`, `enumOf`, `stringArray`, `numberArray`, `urlArray`, `custom`

### Custom validators

A custom validator is a function `(value: string) => T`. Use the `custom()` wrapper:

```typescript
import { custom } from 'node-env-resolver/validators';

const positiveInt = custom((value: string) => {
  const n = parseInt(value, 10);
  if (isNaN(n) || n <= 0) throw new Error('Must be a positive integer');
  return n;
});

const config = resolve({ MAX_RETRIES: positiveInt });
```

## Reference Handlers (URI-based secret resolution)

Values matching a URI scheme (e.g. `aws-sm://secret-id`) are automatically resolved by registered handlers:

```typescript
import { resolveAsync } from 'node-env-resolver';
import { processEnv } from 'node-env-resolver/resolvers';
import { createAwsSecretHandler, createAwsSsmHandler } from 'node-env-resolver-aws/handlers';

const config = await resolveAsync({
  resolvers: [[processEnv(), { API_KEY: string(), DB_PASS: string() }]],
  references: {
    handlers: {
      'aws-sm': createAwsSecretHandler({ region: 'us-east-1' }),
      'aws-ssm': createAwsSsmHandler({ region: 'us-east-1' }),
    },
  },
});
// If process.env.API_KEY = 'aws-sm://prod/api-key', it gets resolved to the actual secret value
```

## Zod Integration

```typescript
import { resolveZod, safeResolveZod } from 'node-env-resolver/zod';
import { z } from 'zod';

const schema = z.object({
  PORT: z.coerce.number().default(3000),
  DATABASE_URL: z.string().url(),
});

// Async (throws)
const config = await resolveZod(schema);

// Async safe
const result = await safeResolveZod(schema);

// Sync variants: resolveSyncZod, safeResolveSyncZod
```

**Note:** Use `z.coerce.number()` not `z.number()` — env vars are always strings initially.

## Runtime Protection

```typescript
import { protect } from 'node-env-resolver/runtime';

const unprotect = protect(config);
// console.log now redacts any secret values found in config
// Call unprotect() to restore original console
```

Fine-grained:

```typescript
import { patchGlobalConsole, createResponseMiddleware } from 'node-env-resolver/runtime';

const unpatch = patchGlobalConsole(config, { methods: ['error', 'warn'] });
app.use(createResponseMiddleware(config)); // Express/Hono middleware
```

## Debug and Audit

```typescript
import { createDebugView, createSecuritySnapshot, getAuditLog } from 'node-env-resolver';

// Debug view - shows provenance without exposing values
const debug = createDebugView(config, rawEnv, provenance);

// Security snapshot - for incident response
const snapshot = createSecuritySnapshot(config, rawEnv, provenance);

// Audit log (auto-enabled in production)
const events = getAuditLog(config);
```

## CLI Binary

```bash
# Scan for hardcoded secrets in source files
npx node-env-resolver scan [paths...]
npx node-env-resolver scan --staged  # pre-commit hook

# Run command with resolved .env (supports reference URIs)
npx node-env-resolver run --env .env -- node server.js
```

Alias: `ner scan`, `ner run`.

## Policies

```typescript
resolve(schema, {
  policies: {
    allowDotenvInProduction: false, // default: blocked
    preventProcessEnvWrite: true, // secrets never touch process.env
    enforceAllowedSources: {
      API_KEY: ['aws-secrets'], // lock secrets to specific resolvers
    },
  },
});
```

## Rules

- Validate all config at startup; fail fast with exit code 1 on invalid values.
- Business functions receive typed config via deps — never read `process.env` directly.
- Set `preventProcessEnvWrite: true` in production (`process.env` leaks to child processes, `/proc/self/environ`, logs).
- Use `enforceAllowedSources` to lock secrets to their intended resolver.
- dotenv is blocked in production by default — only `process.env` and cloud resolvers are allowed.
- Pass resolvers as parameters for testability (no `vi.mock()` needed).

## Common Agent Mistakes

| Mistake                                               | Correct                                                                                                                           |
| ----------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| `import { validators } from 'node-env-resolver'`      | `import { string, url } from 'node-env-resolver/validators'`                                                                      |
| `import { resolveEnv } from 'node-env-resolver'`      | `import { resolve } from 'node-env-resolver'`                                                                                     |
| `import { withZod } from 'node-env-resolver/zod'`     | `import { resolveZod } from 'node-env-resolver/zod'`                                                                              |
| `import { createValidator } from 'node-env-resolver'` | `import { custom } from 'node-env-resolver/validators'`                                                                           |
| `validators.postgres()`                               | `postgres()` (individual named export)                                                                                            |
| `number({ default: 3000 })` for simple default        | `PORT: 3000` (literal = type + default)                                                                                           |
| `debug.audit()`                                       | `createDebugView()`, `getAuditLog()`                                                                                              |
| `dotenv()` as default for `resolve()`                 | `resolve()` only uses `processEnv()` by default; add `dotenv()` explicitly via resolvers                                          |
| `options: { audit: true }`                            | `options: { enableAudit: true }` (the option is `enableAudit`)                                                                    |
| Zod schema inside resolver tuple                      | Zod schemas ONLY work with `resolveZod`/`safeResolveZod`. Use native validators (`string()`, `postgres()`) inside resolver tuples |
