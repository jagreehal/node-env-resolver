import configResolver from '.';

describe('configResolver', () => {
  const originalEnv = process.env;
  beforeAll(() => {
    process.env = { ...originalEnv };
  });
  afterAll(() => {
    process.env = originalEnv;
  });

  it('should return a resolved Promise with the process environment as its value', async () => {
    process.env = { FOO: 'bar' };
    const envValues = await configResolver();
    expect(envValues).toEqual(process.env);
  });
});
