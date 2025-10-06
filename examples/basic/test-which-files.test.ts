/**
 * Test which files are available in the module
 */
import { describe, it, expect } from 'vitest';

describe('Module Import Test', () => {
  it('should import node-env-resolver module successfully', async () => {
    const mod = await import('node-env-resolver');
    
    expect(mod).toBeDefined();
    expect(typeof mod).toBe('object');
  });

  it('should have expected module keys', async () => {
    const mod = await import('node-env-resolver');
    const keys = Object.keys(mod);
    
    expect(keys).toContain('resolve');
    expect(keys).toContain('resolveSync');
    expect(keys).toContain('dotenv');
    expect(keys).toContain('processEnv');
  });

  it('should have resolve function', async () => {
    const mod = await import('node-env-resolver');
    
    expect(typeof mod.resolve).toBe('function');
  });

  it('should have resolveSync function', async () => {
    const mod = await import('node-env-resolver');
    
    expect(typeof mod.resolveSync).toBe('function');
  });

  it('should have dotenv function', async () => {
    const mod = await import('node-env-resolver');
    
    expect(typeof mod.dotenv).toBe('function');
  });

  it('should have processEnv function', async () => {
    const mod = await import('node-env-resolver');
    
    expect(typeof mod.processEnv).toBe('function');
  });
});