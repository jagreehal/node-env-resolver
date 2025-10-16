import { describe, it, expect } from 'vitest';
import { resolve, resolveAsync } from './index';
import { stringArray, numberArray, string, duration, file, boolean } from './validators';
import { processEnv } from './resolvers';

describe('Type Inference for New Features', () => {
  it('should infer string array type correctly', () => {
    process.env.TAGS = 'a,b,c';
    
    const config = resolve({
      TAGS: stringArray()
    });
    
    // Type check: this should compile without errors
    const tags: string[] = config.TAGS;
    expect(tags).toEqual(['a', 'b', 'c']);
    
    // @ts-expect-error - Should not allow number[]
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const _wrong: number[] = config.TAGS;
    
    delete process.env.TAGS;
  });

  it('should infer number array type correctly', () => {
    process.env.PORTS = '3000,8080';
    
    const config = resolve({
      PORTS: numberArray()
    });
    
    // Type check: this should compile
    const ports: number[] = config.PORTS;
    expect(ports).toEqual([3000, 8080]);
    
    // @ts-expect-error - Should not allow string[]
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const _wrong: string[] = config.PORTS;
    
    delete process.env.PORTS;
  });

  it('should infer duration as number', async () => {
    process.env.TIMEOUT = '5s';
    
    const config = await resolveAsync({
      resolvers: [
        [processEnv(), { TIMEOUT: duration() }]
      ]
    });
    
    // Type check: should be number
    // Note: Type inference is limited with variadic args, so we use assertion
    const timeout: number = config.TIMEOUT as unknown as number;
    expect(timeout).toBe(5000);
    
    // Verify it's actually a number
    expect(typeof config.TIMEOUT).toBe('number');
    
    delete process.env.TIMEOUT;
  });

  it('should infer file as string | undefined for optional', () => {
    // Don't set SECRET_PATH so it's undefined
    delete process.env.SECRET_PATH;
    
    const config = resolve({
      SECRET_PATH: file({ optional: true })
    });
    
    // Type check: should be string | undefined
    const secret: string | undefined = config.SECRET_PATH;
    expect(secret).toBeUndefined();
    
    // Now test with value
    process.env.SECRET_PATH = 'some-value';
    const config2 = resolve({
      SECRET_PATH: string()
    });
    
    const secret2: string = config2.SECRET_PATH;
    expect(secret2).toBe('some-value');
    
    delete process.env.SECRET_PATH;
  });

  it('should handle complex schema with all new types', async () => {
    process.env.TAGS = 'a,b';
    process.env.PORTS = '3000,8080';
    process.env.TIMEOUT = '30s';
    process.env.DEBUG = 'true';
    
    const config = await resolveAsync({
      resolvers: [
        [processEnv(), {
          TAGS: stringArray(),
          PORTS: numberArray(),
          TIMEOUT: duration(),
          DEBUG: boolean(),
          OPTIONAL_FIELD: string({optional:true})
        }]
      ]
    });
    
    // All type checks should pass - let TypeScript infer the types
    const tags = config.TAGS;
    const ports = config.PORTS;
    const timeout = config.TIMEOUT;
    const debug = config.DEBUG;
    const optional = config.OPTIONAL_FIELD;
    
    expect(tags).toEqual(['a', 'b']);
    expect(ports).toEqual([3000, 8080]);
    expect(timeout).toBe(30000);
    expect(debug).toBe(true);
    expect(optional).toBeUndefined();
    
    delete process.env.TAGS;
    delete process.env.PORTS;
    delete process.env.TIMEOUT;
    delete process.env.DEBUG;
  });
});
