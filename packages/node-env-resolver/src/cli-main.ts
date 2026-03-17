#!/usr/bin/env node

import ansis from 'ansis';
import { readFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { runLoadCommand } from './cli-load';
import { runRunCommand } from './cli-run';
import { runTypegenCommand } from './cli-typegen';

function getVersion(): string {
  try {
    const __filename = fileURLToPath(import.meta.url);
    const pkgPath = join(dirname(__filename), '../package.json');
    const pkg = JSON.parse(readFileSync(pkgPath, 'utf8')) as {
      version?: string;
    };
    return pkg.version ?? 'unknown';
  } catch {
    return 'unknown';
  }
}

function printHelp(): void {
  console.log(
    [
      ansis.bold('node-env-resolver CLI'),
      '',
      'Usage:',
      '  node-env-resolver <command> [options]',
      '',
      'Commands:',
      '  load      Resolve config and print it (pretty | json | env)',
      '  run       Resolve config and run a child command with injected env',
      '  typegen   Generate TypeScript definitions from EnvConfig schema',
      '',
      'Global options:',
      '  -h, --help       Show this help message',
      '  -v, --version    Show CLI version',
      '',
      'Examples:',
      '  node-env-resolver load',
      '  node-env-resolver load --format=json',
      '  node-env-resolver run -- npm run migrate',
      '  node-env-resolver typegen --output env.d.ts',
    ].join('\n'),
  );
}

async function main(): Promise<number> {
  const [, , ...argv] = process.argv;

  if (argv.includes('--help') || argv.includes('-h')) {
    printHelp();
    return 0;
  }

  if (argv.includes('--version') || argv.includes('-v')) {
    console.log(getVersion());
    return 0;
  }

  const [command, ...rest] = argv;

  if (!command) {
    printHelp();
    return 1;
  }

  try {
    switch (command) {
      case 'load':
        return await runLoadCommand(rest);
      case 'run':
        return await runRunCommand(rest);
      case 'typegen':
        return await runTypegenCommand(rest);
      default:
        console.error(ansis.red(`Unknown command: ${command}`));
        printHelp();
        return 1;
    }
  } catch (error) {
    const message =
      error instanceof Error ? error.message : String(error);
    console.error(ansis.red(message));
    return 1;
  }
}

void main().then((code) => {
  // eslint-disable-next-line no-process-exit
  process.exit(code);
});

