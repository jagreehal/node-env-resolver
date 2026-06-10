/**
 * Toolkit for building remote-secret resolvers (Bitwarden, Infisical, Doppler,
 * 1Password, and any third-party vault).
 *
 * It centralises the cross-cutting concerns every vault provider shares so each
 * one is written — and audited — exactly once:
 *
 *  - **Bootstrap-credential resolution** that accepts a lazy provider instead of
 *    forcing a plaintext environment string. The function form keeps the secret
 *    out of `process.env`/dotfiles (read it from the OS keychain, an STS/OIDC
 *    exchange, `op read`, …) so an environment harvest finds nothing.
 *  - **HTTPS transport enforcement** so a bootstrap credential is never sent in
 *    cleartext to an overridable (self-hosted) endpoint.
 *  - **A fetch wrapper** with an abort-based timeout.
 */

/**
 * A bootstrap credential — a vault access token, client secret, service token, …
 *
 * Either a literal string, or a function that produces one on demand. Prefer the
 * function form in hardened setups: it lets the credential come from the OS
 * keychain, a short-lived token exchange, or workload identity rather than living
 * in an environment variable a supply-chain harvester can read.
 */
export type CredentialInput = string | (() => string | Promise<string>);

/**
 * Validate a *required* credential at construction time.
 *
 * A literal string is checked eagerly so the familiar synchronous
 * `"<label> is required"` error still fires the moment the resolver is built. A
 * function provider is accepted as-is and validated when it is later resolved
 * (its value isn't available yet).
 */
export function requireCredential(
  input: CredentialInput | undefined,
  label: string,
): CredentialInput {
  if (typeof input === 'function') return input;
  if (typeof input === 'string' && input.trim() !== '') return input;
  throw new Error(`${label} is required`);
}

/** Resolve a credential to its string value at use time, asserting it is non-empty. */
export async function resolveCredential(
  input: CredentialInput,
  label: string,
): Promise<string> {
  const value = typeof input === 'function' ? await input() : input;
  if (typeof value !== 'string' || value.trim() === '') {
    throw new Error(`${label} is required`);
  }
  return value;
}

/** Resolve an *optional* credential: `undefined` passes through, anything else is validated. */
export async function resolveOptionalCredential(
  input: CredentialInput | undefined,
  label: string,
): Promise<string | undefined> {
  return input === undefined ? undefined : resolveCredential(input, label);
}

/**
 * Reject a non-`https:` endpoint so a bootstrap credential is never transmitted
 * in cleartext.
 *
 * Loopback hosts (`localhost`, `127.0.0.1`, `::1`) are always allowed — they are
 * not exposed to network interception. Any other `http://` URL requires an
 * explicit `allowInsecureHttp` opt-in.
 */
export function assertSecureUrl(
  rawUrl: string,
  label: string,
  allowInsecureHttp = false,
): void {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    throw new Error(`${label} is not a valid URL: ${JSON.stringify(rawUrl)}`);
  }
  if (url.protocol === 'https:') return;
  const loopback =
    url.hostname === 'localhost' ||
    url.hostname === '127.0.0.1' ||
    url.hostname === '[::1]' ||
    url.hostname === '::1';
  if (url.protocol === 'http:' && (allowInsecureHttp || loopback)) return;
  throw new Error(
    `${label} must use https:// — got "${url.protocol}//". ` +
      `Credentials sent over http can be intercepted on the network. ` +
      `Set allowInsecureHttp: true to override for a trusted endpoint.`,
  );
}

/** `fetch()` with an abort-based timeout (default 30s), surfacing a clear timeout error. */
export async function fetchWithTimeout(
  url: string,
  init: RequestInit,
  service: string,
  timeoutMs = 30_000,
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      throw new Error(`Request to ${service} timed out after ${timeoutMs}ms`, {
        cause: error,
      });
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
}
