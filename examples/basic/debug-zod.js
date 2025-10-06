console.log('Starting debug');

try {
  console.log('About to import...');
  const { resolveEnvWithZod } = await import('node-env-resolver/zod');
  console.log('Import successful');
  
  const { z } = await import('zod');
  console.log('Zod import successful');

  const schema = z.object({
    NODE_ENV: z.string().default('development'),
  });
  
  console.log('About to resolve env...');
  const env = await resolveEnvWithZod(schema);
  console.log('✅ Success:', env);
} catch (error) {
  console.error('❌ Error caught:', error);
}

console.log('Script finished');