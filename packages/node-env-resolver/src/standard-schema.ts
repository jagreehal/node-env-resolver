/**
 * Standard Schema integration for node-env-resolver
 * 
 * Implements the Standard Schema specification to enable interoperability
 * with other TypeScript validation libraries like Zod, Valibot, and ArkType.
 * 
 * Reference: https://github.com/standard-schema/standard-schema
 */

import type { StandardSchemaV1 } from '@standard-schema/spec';
import type { EnvDefinition, EnvSchema } from './types';import {
  validatePostgres, validateMysql, validateMongodb, validateRedis,
  validateHttp, validateHttps, validateUrl, validateEmail,
  validatePort, validateNumber, validateBoolean, validateJson,
  validateDate, validateTimestamp
} from './validators';
// Enhanced EnvDefinition with Standard Schema support
export interface StandardSchemaEnvDefinition extends EnvDefinition, StandardSchemaV1 {
  // Inherits both node-env-resolver and Standard Schema interfaces
}

export interface StandardSchemaEnvSchema {
  [key: string]: StandardSchemaEnvDefinition;
}

/**
 * Convert a node-env-resolver EnvDefinition to a Standard Schema compliant definition
 */
export function toStandardSchema(
  key: string,
  definition: EnvDefinition
): StandardSchemaEnvDefinition {
  const type = definition.type || 'string';
  
  // Create the Standard Schema validation function
  const validate = (value: unknown): StandardSchemaV1.Result<unknown> => {
    try {
      // Handle missing values
      if (value === undefined || value === '') {
        if (definition.default !== undefined) {
          // For types that need parsing, process the default value through the same logic
          if (type === 'json' || type === 'email' || type === 'url' || type === 'number' || type === 'port' || type === 'boolean') {
            value = definition.default;
            // Continue to processing below
          } else {
            // For string and other types, use default directly
            return { value: definition.default };
          }
        } else if (definition.optional) {
          return { value: undefined };
        } else {
          return {
            issues: [{
              message: `Missing required environment variable: ${key}`,
              path: [key]
            }]
          };
        }
      }

      const stringValue = String(value);

      // Handle enum validation
      if (definition.enum) {
        if (!definition.enum.includes(stringValue)) {
          return {
            issues: [{
              message: `${key} must be one of: ${definition.enum.join(', ')}`,
              path: [key]
            }]
          };
        }
        return { value: stringValue };
      }

      // Handle pattern validation
      if (definition.pattern) {
        const regex = new RegExp(definition.pattern);
        if (!regex.test(stringValue)) {
          return {
            issues: [{
              message: `${key} does not match required pattern: ${definition.pattern}`,
              path: [key]
            }]
          };
        }
      }

      // Type-specific validation and conversion
      switch (type) {
        case 'string':
          if (definition.min !== undefined && stringValue.length < definition.min) {
            return {
              issues: [{
                message: `${key} must be at least ${definition.min} characters`,
                path: [key]
              }]
            };
          }
          if (definition.max !== undefined && stringValue.length > definition.max) {
            return {
              issues: [{
                message: `${key} must be at most ${definition.max} characters`,
                path: [key]
              }]
            };
          }
          return { value: stringValue };

        case 'number': {
          const result = validateNumber(stringValue);
          if (!result.valid) {
            return {
              issues: [{
                message: `${key}: ${result.error}`,
                path: [key]
              }]
            };
          }
          const num = Number(stringValue);
          if (definition.min !== undefined && num < definition.min) {
            return {
              issues: [{
                message: `${key} must be at least ${definition.min}`,
                path: [key]
              }]
            };
          }
          if (definition.max !== undefined && num > definition.max) {
            return {
              issues: [{
                message: `${key} must be at most ${definition.max}`,
                path: [key]
              }]
            };
          }
          return { value: num };
        }

        case 'boolean': {
          const result = validateBoolean(stringValue);
          if (!result.valid) {
            return {
              issues: [{
                message: `${key}: ${result.error}`,
                path: [key]
              }]
            };
          }
          const lowerValue = stringValue.toLowerCase();
          if (['true', '1', 'yes', 'on'].includes(lowerValue)) {
            return { value: true };
          }
          return { value: false };
        }

        case 'postgres':
        case 'postgresql': {
          const result = validatePostgres(stringValue);
          if (!result.valid) {
            return {
              issues: [{
                message: `${key}: ${result.error}`,
                path: [key]
              }]
            };
          }
          return { value: stringValue };
        }

        case 'mysql': {
          const result = validateMysql(stringValue);
          if (!result.valid) {
            return {
              issues: [{
                message: `${key}: ${result.error}`,
                path: [key]
              }]
            };
          }
          return { value: stringValue };
        }

        case 'mongodb': {
          const result = validateMongodb(stringValue);
          if (!result.valid) {
            return {
              issues: [{
                message: `${key}: ${result.error}`,
                path: [key]
              }]
            };
          }
          return { value: stringValue };
        }

        case 'redis': {
          const result = validateRedis(stringValue);
          if (!result.valid) {
            return {
              issues: [{
                message: `${key}: ${result.error}`,
                path: [key]
              }]
            };
          }
          return { value: stringValue };
        }

        case 'http': {
          const result = validateHttp(stringValue);
          if (!result.valid) {
            return {
              issues: [{
                message: `${key}: ${result.error}`,
                path: [key]
              }]
            };
          }
          return { value: stringValue };
        }

        case 'https': {
          const result = validateHttps(stringValue);
          if (!result.valid) {
            return {
              issues: [{
                message: `${key}: ${result.error}`,
                path: [key]
              }]
            };
          }
          return { value: stringValue };
        }

        case 'url': {
          const result = validateUrl(stringValue);
          if (!result.valid) {
            return {
              issues: [{
                message: `${key}: ${result.error}`,
                path: [key]
              }]
            };
          }
          return { value: stringValue };
        }

        case 'email': {
          const result = validateEmail(stringValue);
          if (!result.valid) {
            return {
              issues: [{
                message: `${key}: ${result.error}`,
                path: [key]
              }]
            };
          }
          return { value: stringValue };
        }

        case 'port': {
          const result = validatePort(stringValue);
          if (!result.valid) {
            return {
              issues: [{
                message: `${key}: ${result.error}`,
                path: [key]
              }]
            };
          }
          return { value: Number(stringValue) };
        }

        case 'json': {
          const result = validateJson(stringValue);
          if (!result.valid) {
            return {
              issues: [{
                message: `${key}: ${result.error}`,
                path: [key]
              }]
            };
          }
          return { value: JSON.parse(stringValue) };
        }

        case 'date': {
          const result = validateDate(stringValue);
          if (!result.valid) {
            return {
              issues: [{
                message: `${key}: ${result.error}`,
                path: [key]
              }]
            };
          }
          return { value: stringValue };
        }

        case 'timestamp': {
          const result = validateTimestamp(stringValue);
          if (!result.valid) {
            return {
              issues: [{
                message: `${key}: ${result.error}`,
                path: [key]
              }]
            };
          }
          return { value: Number(stringValue) };
        }

        case 'custom': {
          if (!definition.validator) {
            return {
              issues: [{
                message: `Custom validator function is required for type 'custom'`,
                path: [key]
              }]
            };
          }
          try {
            const result = definition.validator(stringValue);
            return { value: result };
          } catch (error) {
            return {
              issues: [{
                message: error instanceof Error ? error.message : `Custom validation failed for ${key}`,
                path: [key]
              }]
            };
          }
        }

        default:
          return {
            issues: [{
              message: `Unknown type: ${type}`,
              path: [key]
            }]
          };
      }
    } catch (error) {
      return {
        issues: [{
          message: `Validation error for ${key}: ${error instanceof Error ? error.message : String(error)}`,
          path: [key]
        }]
      };
    }
  };

  // Determine output type based on definition
  let outputType: unknown;
  switch (type) {
    case 'number':
    case 'port':
    case 'timestamp':
      outputType = Number;
      break;
    case 'boolean':
      outputType = Boolean;
      break;
    case 'url':
    case 'date':
      outputType = String; // URL and date types return validated strings
      break;
    case 'json':
      outputType = Object;
      break;
    case 'custom':
      outputType = Object; // Custom validators can return any type
      break;
    default:
      outputType = String;
  }

  return {
    ...definition,
    '~standard': {
      version: 1,
      vendor: 'node-env-resolver',
      validate,
      types: {
        input: {} as unknown,
        output: outputType
      }
    }
  };
}

/**
 * Convert an entire EnvSchema to Standard Schema compliant format
 */
export function schemaToStandardSchema(schema: EnvSchema): StandardSchemaEnvSchema {
  const result: StandardSchemaEnvSchema = {};
  
  for (const [key, definition] of Object.entries(schema)) {
    result[key] = toStandardSchema(key, definition);
  }
  
  return result;
}

/**
 * Validate a value using Standard Schema compliant validation
 */
export async function validateWithStandardSchema(
  schema: StandardSchemaEnvDefinition,
  value: unknown
): Promise<StandardSchemaV1.Result<unknown>> {
  const result = schema['~standard'].validate(value);
  return result instanceof Promise ? await result : result;
}

/**
 * Type-safe helper to validate multiple environment variables
 */
export async function validateEnvWithStandardSchema(
  schema: StandardSchemaEnvSchema,
  env: Record<string, string>
): Promise<Record<string, unknown>> {
  const result: Record<string, unknown> = {};
  const errors: string[] = [];

  for (const [key, definition] of Object.entries(schema)) {
    const value = env[key];
    const validationResult = await validateWithStandardSchema(definition, value);
    
    if (validationResult.issues) {
      errors.push(...validationResult.issues.map((issue) => issue.message));
    } else {
      result[key] = validationResult.value;
    }
  }

  if (errors.length > 0) {
    throw new Error(`Environment validation failed:\n${errors.map(e => `  - ${e}`).join('\n')}`);
  }

  return result;
}