import { existsSync, writeFileSync } from 'fs';
import { resolve as resolvePath, relative } from 'path';

export interface CliInitParsedArgs {
  configPath?: string;
}

function parseInitArgs(argv: string[]): CliInitParsedArgs {
  let configPath: string | undefined;

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]!;
    if ((arg === '--config' || arg === '-c') && argv[i + 1]) {
      configPath = argv[i + 1]!;
      i++;
    }
  }

  return { configPath };
}

function getDefaultConfigPath(): string {
  return resolvePath(process.cwd(), 'env.config.mjs');
}

function buildConfigTemplate(): string {
  return [
    "import { processEnv, dotenv } from 'node-env-resolver/resolvers';",
    "import { string, number, json } from 'node-env-resolver/validators';",
    '',
    "/**",
    " * Example EnvConfig used by the node-env-resolver CLI.",
    " *",
    " * - schema: describes your environment variables",
    " * - resolvers: where values are loaded from (process.env, .env, cloud, etc.)",
    " */",
    '/** @type {import("node-env-resolver").ResolveAsyncConfig<any>} */',
    'export const config = {',
    '  schema: {',
    "    NODE_ENV: [\"development\", \"production\", \"test\"],",
    '    PORT: number({ default: 3000 }),',
    '    API_KEY: string({ optional: true, sensitive: true }),',
    '    FEATURE_FLAGS: json(),',
    '  },',
    '  resolvers: [',
    '    [processEnv(), {}],',
    '    [dotenv(), {}],',
    '  ],',
    '};',
    '',
    'export default config;',
    '',
  ].join('\n');
}

export async function runInitCommand(argv: string[]): Promise<number> {
  // Lazy-load ansis so that local test environments without a properly
  // wired workspace dependency graph can still execute this command.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const ansis: any = await import('ansis').then(
    (mod) => mod.default ?? mod,
    () => ({
      green: (value: string) => value,
      red: (value: string) => value,
      bold: (value: string) => value,
    }),
  );
  const args = parseInitArgs(argv);
  const targetPath = resolvePath(
    process.cwd(),
    args.configPath ?? getDefaultConfigPath(),
  );

  if (existsSync(targetPath)) {
    const rel = relative(process.cwd(), targetPath);
    console.error(
      ansis.red(
        `Config file already exists at ${rel}. Pass a different --config path if you want to create another file.`,
      ),
    );
    return 1;
  }

  const contents = buildConfigTemplate();
  writeFileSync(targetPath, contents, 'utf8');

  const rel = relative(process.cwd(), targetPath) || './env.config.mjs';
  console.log(ansis.green(`Created ${rel}`));
  console.log(
    [
      '',
      'Next steps:',
      `  1. Review and edit ${rel} to match your app schema.`,
      '  2. Run:',
      '       node-env-resolver load',
      '     or:',
      '       node-env-resolver run -- npm run dev',
    ].join('\n'),
  );

  return 0;
}

