import type { PolicyOptions, ResolveOptions } from './types.js';

export interface StrictReferencePoliciesOptions {
  /**
   * Variables that must come from secret managers (not dotenv/process.env fallbacks).
   * Example: ['STRIPE_KEY', 'DATABASE_URL']
   */
  sensitiveKeys: readonly string[];
  /**
   * Allowed resolver source(s) for sensitive keys.
   * Matching accepts:
   * - exact resolver/source name
   * - source prefix before `(` (e.g. `aws-secrets(prod/app)` -> `aws-secrets`)
   * - reference handler `resolvedVia` value
   * Default: ['aws-secrets']
   */
  secretSources?: readonly string[] | string;
  /**
   * Keep secure default in production: false blocks dotenv values.
   * You can pass a whitelist array to allow specific non-secret vars from dotenv.
   * Default: false
   */
  allowDotenvInProduction?: PolicyOptions['allowDotenvInProduction'];
  /**
   * Optional base policy object to merge into.
   */
  basePolicies?: PolicyOptions;
}

/**
 * Build a strict production policy preset for reference-first deployments:
 * - Blocks dotenv in production by default
 * - Forces sensitive keys to come from reference-backed resolvers (e.g. aws-secrets)
 */
export function strictReferencePolicies(
  options: StrictReferencePoliciesOptions,
): PolicyOptions {
  const {
    sensitiveKeys,
    secretSources = ['aws-secrets'],
    allowDotenvInProduction = false,
    basePolicies = {},
  } = options;

  const allowedSources = Array.isArray(secretSources)
    ? [...secretSources]
    : [secretSources];

  const enforceAllowedSources: Record<string, string[]> = {
    ...(basePolicies.enforceAllowedSources ?? {}),
  };

  for (const key of sensitiveKeys) {
    enforceAllowedSources[key] = allowedSources;
  }

  return {
    ...basePolicies,
    allowDotenvInProduction,
    enforceAllowedSources,
  };
}

export interface StrictReferenceResolveOptions
  extends Omit<StrictReferencePoliciesOptions, 'basePolicies'> {
  /**
   * Optional extra resolve options to merge with this preset.
   */
  baseOptions?: Partial<ResolveOptions>;
  /**
   * Audit should be enabled for incident response reconstruction.
   * Default: true
   */
  enableAudit?: boolean;
}

/**
 * Resolve options preset for strict reference-first hardening.
 */
export function strictReferenceResolveOptions(
  options: StrictReferenceResolveOptions,
): Partial<ResolveOptions> {
  const {
    baseOptions = {},
    sensitiveKeys,
    secretSources,
    allowDotenvInProduction,
    enableAudit = true,
  } = options;

  const basePolicies = baseOptions.policies ?? {};

  return {
    ...baseOptions,
    enableAudit,
    policies: strictReferencePolicies({
      sensitiveKeys,
      secretSources,
      allowDotenvInProduction,
      basePolicies,
    }),
  };
}
