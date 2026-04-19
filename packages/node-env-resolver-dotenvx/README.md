# node-env-resolver-dotenvx

Dotenvx and OS Keychain integration for node-env-resolver. Load encrypted `.env` files and resolve secrets from OS credential stores.

[![npm version](https://img.shields.io/npm/v/node-env-resolver-dotenvx)](https://www.npmjs.com/package/node-env-resolver-dotenvx)

## Install

```bash
npm install node-env-resolver-dotenvx
```

`@dotenvx/dotenvx` is included as a package dependency.

## Why

Local `.env` files are plaintext — any malicious dependency, editor extension, or AI tool that can read your workspace gets your secrets. This package helps by:

- Encrypting secrets at rest (dotenvx-encrypted `.env` files)
- Supporting decryption keys from code/env/`.env.keys` for dotenvx files
- Resolving `keychain://` references from macOS Keychain, Linux secret-tool, or Windows Credential Manager

This follows the pattern from the [dotenvx keychain blog post](https://dotenvx.com/blog/2026/04/02/dotenvx-keychain.html).

## Quick start

### One-line convenience functions

```ts
import { resolveDotenvx } from 'node-env-resolver-dotenvx';

const config = await resolveDotenvx(
  { path: '.env.local.secrets' },
  { DATABASE_URL: postgres(), API_KEY: string() },
);
```

### With resolveAsync() (combining sources)

```ts
import { resolveAsync } from 'node-env-resolver';
import { processEnv } from 'node-env-resolver/resolvers';
import { dotenvx } from 'node-env-resolver-dotenvx';

const config = await resolveAsync({
  resolvers: [
    [processEnv(), { PORT: 3000 }],
    [dotenvx('.env.local.secrets'), { DATABASE_URL: postgres() }],
  ],
});
```

### The keychain pattern (plain config + encrypted secrets)

```ts
import { resolveAsync } from 'node-env-resolver';
import { processEnv } from 'node-env-resolver/resolvers';
import { dotenvxKeychain } from 'node-env-resolver-dotenvx';
import { createKeychainHandler } from 'node-env-resolver-dotenvx/handlers';

const config = await resolveAsync({
  resolvers: [
    [processEnv(), { PORT: 3000 }],
    [dotenvxKeychain(), { DATABASE_URL: postgres() }],
  ],
  references: {
    handlers: { keychain: createKeychainHandler() },
  },
});
```

This loads:
1. `.env.local` (plain config, feature flags, non-secrets)
2. `.env.local.secrets` (encrypted, decrypted via dotenvx with key from `privateKey`, env, or `.env.keys`)

Any schema value set to `keychain://<name>` resolves from your OS credential store.

Note: `createKeychainHandler()` resolves `keychain://` references in config values. It does not automatically fetch and inject the dotenvx decryption key for `dotenvx()`/`dotenvxKeychain()`.

## Features

- Load encrypted `.env` files via `@dotenvx/dotenvx`
- `dotenvxKeychain()` resolver for the plain + encrypted pattern
- `keychain://` reference handler (macOS Keychain, Linux secret-tool, Windows Credential Manager)
- One-line convenience functions (`resolveDotenvx`, `safeResolveDotenvx`)
- Full TypeScript support
- Sync and async loading

## Resolvers

### `dotenvx(options?)`

Load an encrypted `.env` file and decrypt it.

```ts
import { dotenvx } from 'node-env-resolver-dotenvx';

// Default path
const resolver = dotenvx();

// Custom path
const resolver = dotenvx('.env.local.secrets');

// With options
const resolver = dotenvx({
  path: '.env.local.secrets',
  overload: true,            // Override existing env vars (default: false)
  privateKey: 'abc123...',   // Decryption key (or set DOTENV_PRIVATE_KEY env var)
  envKeysFile: '../../.env.keys', // Custom keys file path
});
```

The decryption key can come from:
1. `privateKey` option
2. `DOTENV_PRIVATE_KEY` (or `DOTENV_PRIVATE_KEY_*`) environment variable
3. `.env.keys` file (default or custom path via `envKeysFile`)

### `dotenvxKeychain(options?)`

Load plain `.env.local` then encrypted `.env.local.secrets`. Secrets override plain values by default.

```ts
import { dotenvxKeychain } from 'node-env-resolver-dotenvx';

// Default: .env.local + .env.local.secrets
const resolver = dotenvxKeychain();

// Custom paths
const resolver = dotenvxKeychain({
  plainPath: '.env',
  secretsPath: '.env.encrypted',
  overload: true,
  privateKey: 'abc123...',
});
```

## Keychain Reference Handler

Use `keychain://<name>` in your `.env` files to resolve values from OS credential stores:

```dotenv
# .env
DATABASE_URL=keychain://prod/database-url
API_KEY=keychain://prod/api-key
```

```ts
import { resolveAsync } from 'node-env-resolver';
import { processEnv } from 'node-env-resolver/resolvers';
import { createKeychainHandler } from 'node-env-resolver-dotenvx/handlers';

const config = await resolveAsync({
  resolvers: [[processEnv(), schema]],
  references: {
    handlers: { keychain: createKeychainHandler() },
  },
});
```

### Platform support

| Platform | Tool | Command |
|----------|------|---------|
| macOS | Keychain Access | `security find-generic-password` |
| Linux | libsecret | `secret-tool lookup` |
| Windows | Credential Manager | `Get-StoredCredential` (PowerShell) |

### Storing secrets

**macOS:**

```bash
security add-generic-password -a "prod/database-url" -s "node-env-resolver" -w
```

**Linux:**

```bash
secret-tool store --label="node-env-resolver" service "node-env-resolver" account "prod/database-url"
```

**Windows (PowerShell):**

```powershell
cmdkey /generic:"node-env-resolver\prod\database-url" /user:"prod/database-url" /pass
```

### Handler options

```ts
const handler = createKeychainHandler({
  servicePrefix: 'myapp',          // Keychain service name (default: 'node-env-resolver')
  platform: 'macos',               // Force platform: 'macos' | 'linux' | 'windows' | 'auto'
});
```

### Pre-configured handler

```ts
import { keychainHandler } from 'node-env-resolver-dotenvx/handlers';

// Auto-detects platform
const config = await resolveAsync({
  resolvers: [[processEnv(), schema]],
  references: {
    handlers: { keychain: keychainHandler },
  },
});
```

## Convenience functions

### `resolveDotenvx(dotenvxOptions, schema, resolveOptions?)`

```ts
import { resolveDotenvx } from 'node-env-resolver-dotenvx';

const config = await resolveDotenvx(
  { path: '.env.local.secrets' },
  { DATABASE_URL: postgres(), API_KEY: string() },
);
```

### `safeResolveDotenvx(dotenvxOptions, schema, resolveOptions?)`

Non-throwing version:

```ts
import { safeResolveDotenvx } from 'node-env-resolver-dotenvx';

const result = await safeResolveDotenvx(
  { path: '.env.local.secrets' },
  { DATABASE_URL: string() },
);

if (result.success) {
  console.log(result.data.DATABASE_URL);
} else {
  console.error(result.error);
}
```

## Encryption workflow

```bash
# 1. Create your secrets file
cat > .env.local.secrets <<EOF
DATABASE_URL=postgres://localhost:5432/mydb
API_KEY=secret-key-123
EOF

# 2. Encrypt it with dotenvx
npx dotenvx encrypt -f .env.local.secrets

# 3. Store the decryption key in your OS keychain (macOS)
# The key is in .env.keys after encryption
security add-generic-password -a "LOCAL_SECRETS_DOTENVX_KEY" -s "node-env-resolver" -w

# 4. Delete the plaintext key file (keep a backup!)
rm .env.keys

# 5. Add to .gitignore
echo ".env.local\n.env.local.secrets\n.env.keys" >> .gitignore
```

Then at app startup (manual key lookup + dotenvx):

```ts
import { resolveDotenvx } from 'node-env-resolver-dotenvx';
import { createKeychainHandler } from 'node-env-resolver-dotenvx/handlers';
import { postgres } from 'node-env-resolver/validators';

const keychain = createKeychainHandler();
const keyRef = keychain.resolveSync('keychain://LOCAL_SECRETS_DOTENVX_KEY');

const config = await resolveDotenvx(
  { path: '.env.local.secrets', privateKey: keyRef.value },
  { DATABASE_URL: postgres() },
);
```

## Configuration

### dotenvx options

```ts
interface DotenvxOptions {
  path?: string;        // Path to encrypted .env file (default: '.env')
  overload?: boolean;   // Override existing env vars (default: false)
  privateKey?: string;  // Decryption key (or set DOTENV_PRIVATE_KEY env var)
  envKeysFile?: string; // Custom path to .env.keys file
}
```

### dotenvxKeychain options

```ts
interface DotenvxKeychainOptions {
  plainPath?: string;    // Path to plain env file (default: '.env.local')
  secretsPath?: string;  // Path to encrypted secrets (default: '.env.local.secrets')
  overload?: boolean;    // Secrets override plain values (default: true)
  privateKey?: string;  // Decryption key
  envKeysFile?: string;  // Custom path to .env.keys file
}
```

### KeychainHandler options

```ts
interface KeychainHandlerOptions {
  servicePrefix?: string;  // Keychain service name (default: 'node-env-resolver')
  platform?: 'macos' | 'linux' | 'windows' | 'auto'; // Platform (default: 'auto')
}
```

## Troubleshooting

**`dotenvx: failed to load`**

- Ensure `.env.keys` is present or `DOTENV_PRIVATE_KEY` env var is set
- Check the file path is correct

**`Failed to read from macOS Keychain`**

- Run: `security add-generic-password -a "<account>" -s "node-env-resolver" -w`
- Verify: `security find-generic-password -a "<account>" -s "node-env-resolver" -w`

**`Failed to read from Linux keyring`**

- Install libsecret: `sudo apt install libsecret-1-0`
- Install secret-tool: `sudo apt install libsecret-tools`
- Store: `secret-tool store --label="node-env-resolver" service "node-env-resolver" account "<key-name>"`

**`Invalid keychain reference`**

- Format must be `keychain://<key-name>` (e.g., `keychain://prod/database-url`)

## License

MIT
