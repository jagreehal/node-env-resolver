import ansis from 'ansis';
import { loadEnvConfig } from './cli-config-loader';
import { createRedactor, getSensitiveKeys } from './redaction';
import { resolveAsync } from './index';
import { PROVENANCE_SYMBOL, type Provenance } from './types';

export interface CliLoadParsedArgs {
  format: 'pretty' | 'json' | 'env';
  reveal: boolean;
  configPath?: string;
}

function parseLoadArgs(argv: string[]): CliLoadParsedArgs {
  let format: 'pretty' | 'json' | 'env' = 'pretty';
  let reveal = false;
  let configPath: string | undefined;

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--format' && argv[i + 1]) {
      const value = argv[i + 1]!;
      if (value === 'pretty' || value === 'json' || value === 'env') {
        format = value;
      } else {
        throw new Error(
          `Invalid --format value "${value}". Expected one of: pretty, json, env.`,
        );
      }
      i++;
    } else if (arg.startsWith('--format=')) {
      const value = arg.split('=', 2)[1]!;
      if (value === 'pretty' || value === 'json' || value === 'env') {
        format = value;
      } else {
        throw new Error(
          `Invalid --format value "${value}". Expected one of: pretty, json, env.`,
        );
      }
    } else if (arg === '--reveal') {
      reveal = true;
    } else if ((arg === '--config' || arg === '-c') && argv[i + 1]) {
      configPath = argv[i + 1]!;
      i++;
    }
  }

  return { format, reveal, configPath };
}

function getProvenanceMap(
  config: Record<string, unknown>,
): Record<string, Provenance> | undefined {
  const prov = (config as Record<symbol, unknown>)[PROVENANCE_SYMBOL];
  if (prov && typeof prov === 'object') {
    return prov as Record<string, Provenance>;
  }
  return undefined;
}

function printPrettyTable(
  resolved: Record<string, unknown>,
  reveal: boolean,
): void {
  const keys = Object.keys(resolved).sort();
  const sensitiveKeys = getSensitiveKeys(resolved);
  const provenance = getProvenanceMap(resolved);
  const redactor = createRedactor(resolved);

  const rows: Array<[string, string, string, string]> = [];

  for (const key of keys) {
    const raw = resolved[key];
    const valueToShow = reveal ? raw : redactor(raw) as unknown;
    const type =
      raw === null
        ? 'null'
        : Array.isArray(raw)
          ? 'array'
          : typeof raw === 'object'
            ? 'object'
            : typeof raw;
    const source = provenance?.[key]?.source ?? 'unknown';
    const isSensitive = sensitiveKeys.has(key);
    const valueStr =
      typeof valueToShow === 'string'
        ? valueToShow
        : JSON.stringify(valueToShow);

    rows.push([
      key,
      type,
      source,
      isSensitive && !reveal ? `${valueStr}` : valueStr,
    ]);
  }

  const header = ['KEY', 'TYPE', 'SOURCE', 'VALUE'];
  const allRows = [header, ...rows];
  const widths = allRows[0]!.map((_, colIdx) =>
    Math.max(...allRows.map((row) => row[colIdx]!.length)),
  );

  const [hKey, hType, hSource, hValue] = header;
  // Header
  // eslint-disable-next-line no-console
  console.log(
    ansis.bold(
      `${hKey.padEnd(widths[0]!)}  ${hType.padEnd(widths[1]!)}  ${hSource.padEnd(widths[2]!)}  ${hValue}`,
    ),
  );

  for (const [key, type, source, value] of rows) {
    const keyOut = getSensitiveKeys(resolved).has(key)
      ? ansis.yellow(key)
      : key;
    // eslint-disable-next-line no-console
    console.log(
      `${keyOut.padEnd(widths[0]!)}  ${type.padEnd(widths[1]!)}  ${source.padEnd(widths[2]!)}  ${value}`,
    );
  }
}

export async function runLoadCommand(argv: string[]): Promise<number> {
  const args = parseLoadArgs(argv);
  const envConfig = await loadEnvConfig({ configPath: args.configPath });

  const resolved = (await resolveAsync(envConfig as never)) as Record<
    string,
    unknown
  >;

  if (args.format === 'pretty') {
    printPrettyTable(resolved, args.reveal);
    return 0;
  }

  if (args.format === 'json') {
    const redactor = createRedactor(resolved);
    const output = args.reveal ? resolved : (redactor(resolved) as unknown);
    // eslint-disable-next-line no-console
    console.log(JSON.stringify(output, null, 2));
    return 0;
  }

  // env format
  const redactor = createRedactor(resolved);
  const keys = Object.keys(resolved).sort();
  for (const key of keys) {
    const raw = resolved[key];
    const valueStr = String(raw ?? '');
    const safe = args.reveal
      ? valueStr
      : (redactor(valueStr) as unknown as string);
    // eslint-disable-next-line no-console
    console.log(`${key}=${safe}`);
  }

  return 0;
}

