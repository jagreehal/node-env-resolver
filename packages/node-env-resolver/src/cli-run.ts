import { spawn } from 'child_process';
import ansis from 'ansis';
import { loadEnvConfig } from './cli-config-loader';
import { createRedactor, getSensitiveKeys } from './redaction';
import { resolveAsync } from './index';

export interface CliRunParsedArgs {
  configPath?: string;
  noRedact: boolean;
  command: string;
}

function parseRunArgs(argv: string[]): CliRunParsedArgs {
  let configPath: string | undefined;
  let noRedact = false;

  const sepIndex = argv.indexOf('--');
  if (sepIndex === -1 || sepIndex === argv.length - 1) {
    throw new Error(
      'Missing child command. Usage: node-env-resolver run [--config path] [--no-redact] -- <command>',
    );
  }

  const flags = argv.slice(0, sepIndex);
  const commandParts = argv.slice(sepIndex + 1);

  for (let i = 0; i < flags.length; i++) {
    const arg = flags[i]!;
    if ((arg === '--config' || arg === '-c') && flags[i + 1]) {
      configPath = flags[i + 1]!;
      i++;
    } else if (arg === '--no-redact') {
      noRedact = true;
    }
  }

  const command = commandParts.join(' ').trim();
  if (!command) {
    throw new Error(
      'Missing child command after "--". Example: node-env-resolver run -- npm run migrate',
    );
  }

  return { configPath, noRedact, command };
}

export async function runRunCommand(argv: string[]): Promise<number> {
  const args = parseRunArgs(argv);
  const envConfig = await loadEnvConfig({ configPath: args.configPath });
  const resolved = (await resolveAsync(envConfig as never)) as Record<
    string,
    unknown
  >;

  const childEnv: NodeJS.ProcessEnv = {
    ...process.env,
    ...Object.fromEntries(
      Object.entries(resolved).map(([key, value]) => [key, String(value ?? '')]),
    ),
  };

  const hasSensitive = getSensitiveKeys(resolved).size > 0;
  const shouldRedactStreams = hasSensitive && !args.noRedact;

  const redactor = shouldRedactStreams ? createRedactor(resolved) : null;

  const child = spawn(args.command, {
    shell: true,
    env: childEnv,
    stdio: shouldRedactStreams ? ['inherit', 'pipe', 'pipe'] : 'inherit',
  });

  const forwardSignal = (signal: NodeJS.Signals) => {
    if (!child.killed) {
      child.kill(signal);
    }
  };

  process.on('SIGINT', forwardSignal);
  process.on('SIGTERM', forwardSignal);

  if (shouldRedactStreams && child.stdout && child.stderr) {
    child.stdout.on('data', (chunk: Buffer) => {
      const text = chunk.toString();
      const out = redactor ? (redactor(text) as unknown as string) : text;
      process.stdout.write(out);
    });
    child.stderr.on('data', (chunk: Buffer) => {
      const text = chunk.toString();
      const out = redactor ? (redactor(text) as unknown as string) : text;
      process.stderr.write(out);
    });
  }

  return await new Promise<number>((resolve) => {
    child.on('exit', (code, signal) => {
      process.removeListener('SIGINT', forwardSignal);
      process.removeListener('SIGTERM', forwardSignal);

      if (signal) {
        // eslint-disable-next-line no-console
        console.error(ansis.red(`Child process terminated with signal ${signal}`));
      }
      resolve(code ?? 0);
    });
  });
}

