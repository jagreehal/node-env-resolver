import type {
  Provenance,
  ReferenceContext,
  ReferenceOptions,
  ReferenceResolution,
} from './types.js';

const REFERENCE_PATTERN = /^([a-z][a-z0-9+.-]*):\/\/(.+)$/i;

type ParsedReference = {
  reference: string;
  scheme: string;
};

type NormalizeReferenceResult = {
  value: string;
  resolvedVia: string;
  metadata?: Record<string, unknown>;
};

function parseReference(value: string): ParsedReference | null {
  const match = REFERENCE_PATTERN.exec(value);

  if (!match) {
    return null;
  }

  return {
    reference: value,
    scheme: match[1]!.toLowerCase(),
  };
}

function normalizeResolution(
  result: string | ReferenceResolution,
  fallbackName: string,
): NormalizeReferenceResult {
  if (typeof result === 'string') {
    return {
      value: result,
      resolvedVia: fallbackName,
    };
  }

  return {
    value: result.value,
    resolvedVia: result.resolvedVia ?? fallbackName,
    metadata: result.metadata,
  };
}

function buildContext(
  key: string,
  provenance: Provenance | undefined,
  reference: string,
): ReferenceContext {
  return {
    key,
    source: provenance?.source ?? null,
    reference,
  };
}

function shouldIgnoreUnresolved(
  options: ReferenceOptions | undefined,
): boolean {
  return options?.onUnresolved === 'ignore';
}

function buildInvalidResolutionMessage(
  key: string,
  reference: string,
  handlerName: string,
): string {
  return `${key} reference ${reference} resolved by ${handlerName} did not return a string value`;
}

function updateProvenance(
  provenance: Record<string, Provenance>,
  key: string,
  reference: string,
  resolvedVia: string,
  metadata?: Record<string, unknown>,
): void {
  const existing = provenance[key];

  if (!existing) {
    return;
  }

  provenance[key] = {
    ...existing,
    reference,
    resolvedVia,
    ...(metadata ? { metadata: { ...existing.metadata, ...metadata } } : {}),
  };
}

export function resolveReferencesSync(
  values: Record<string, string>,
  provenance: Record<string, Provenance>,
  options: ReferenceOptions | undefined,
): void {
  if (!options) {
    return;
  }

  const handlers = options.handlers;

  for (const [key, value] of Object.entries(values)) {
    const parsed = parseReference(value);

    if (!parsed) {
      continue;
    }

    const handler = handlers[parsed.scheme];

    if (!handler) {
      continue;
    }

    if (!handler.resolveSync) {
      throw new Error(
        `Reference handler '${parsed.scheme}' does not support synchronous resolution. Use resolveAsync() or provide resolveSync().`,
      );
    }

    const handlerName = handler.name ?? parsed.scheme;
    let normalized: NormalizeReferenceResult;

    try {
      const result = handler.resolveSync(
        parsed.reference,
        buildContext(key, provenance[key], parsed.reference),
      );
      normalized = normalizeResolution(result, handlerName);
    } catch (error) {
      if (shouldIgnoreUnresolved(options)) {
        continue;
      }

      throw error;
    }

    if (typeof normalized.value !== 'string') {
      if (shouldIgnoreUnresolved(options)) {
        continue;
      }

      throw new Error(
        buildInvalidResolutionMessage(key, parsed.reference, handlerName),
      );
    }

    values[key] = normalized.value;
    updateProvenance(
      provenance,
      key,
      parsed.reference,
      normalized.resolvedVia,
      normalized.metadata,
    );
  }
}

export async function resolveReferences(
  values: Record<string, string>,
  provenance: Record<string, Provenance>,
  options: ReferenceOptions | undefined,
): Promise<void> {
  if (!options) {
    return;
  }

  const handlers = options.handlers;

  for (const [key, value] of Object.entries(values)) {
    const parsed = parseReference(value);

    if (!parsed) {
      continue;
    }

    const handler = handlers[parsed.scheme];

    if (!handler) {
      continue;
    }

    const handlerName = handler.name ?? parsed.scheme;
    let normalized: NormalizeReferenceResult;

    try {
      const result = await handler.resolve(
        parsed.reference,
        buildContext(key, provenance[key], parsed.reference),
      );
      normalized = normalizeResolution(result, handlerName);
    } catch (error) {
      if (shouldIgnoreUnresolved(options)) {
        continue;
      }

      throw error;
    }

    if (typeof normalized.value !== 'string') {
      if (shouldIgnoreUnresolved(options)) {
        continue;
      }

      throw new Error(
        buildInvalidResolutionMessage(key, parsed.reference, handlerName),
      );
    }

    values[key] = normalized.value;
    updateProvenance(
      provenance,
      key,
      parsed.reference,
      normalized.resolvedVia,
      normalized.metadata,
    );
  }
}
