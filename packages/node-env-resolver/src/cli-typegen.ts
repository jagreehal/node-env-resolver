import ansis from 'ansis';
import { loadEnvConfig } from './cli-config-loader';
import { writeTypes } from './typegen';

export interface CliTypegenParsedArgs {
  configPath?: string;
  outputPath: string;
}

function parseTypegenArgs(argv: string[]): CliTypegenParsedArgs {
  let configPath: string | undefined;
  let outputPath = 'env.d.ts';

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]!;
    if ((arg === '--config' || arg === '-c') && argv[i + 1]) {
      configPath = argv[i + 1]!;
      i++;
    } else if ((arg === '--output' || arg === '-o') && argv[i + 1]) {
      outputPath = argv[i + 1]!;
      i++;
    } else if (arg.startsWith('--output=')) {
      outputPath = arg.split('=', 2)[1]!;
    }
  }

  return { configPath, outputPath };
}

export async function runTypegenCommand(argv: string[]): Promise<number> {
  const args = parseTypegenArgs(argv);
  const envConfig = await loadEnvConfig({ configPath: args.configPath });

  writeTypes(envConfig.schema, args.outputPath);

  // eslint-disable-next-line no-console
  console.log(
    ansis.green(
      `Type definitions written to ${args.outputPath} based on EnvConfig schema.`,
    ),
  );

  return 0;
}

