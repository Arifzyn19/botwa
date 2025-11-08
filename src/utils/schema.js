/**
 * Get default value berdasarkan tipe data
 * @param {*} value - Sample value untuk detect tipe
 * @returns {*} - Default value sesuai tipe
 */
function getDefaultValue(value) {
  const type = typeof value;

  switch (type) {
    case "string":
      return value;
    case "number":
      return value;
    case "boolean":
      return value;
    case "object":
      if (value === null) return null;
      if (Array.isArray(value)) return [...value];
      return { ...value };
    default:
      return value;
  }
}

/**
 * Detect tipe data dari value
 * @param {*} value - Value yang mau di-detect
 * @returns {string} - Nama tipe data
 */
function detectType(value) {
  if (value === null) return "null";
  if (Array.isArray(value)) return "array";
  return typeof value;
}

/**
 * Deep clone object untuk schema
 * @param {*} obj - Object yang mau di-clone
 * @returns {*} - Cloned object
 */
function deepClone(obj) {
  if (obj === null || typeof obj !== "object") return obj;
  if (Array.isArray(obj)) return obj.map(item => deepClone(item));
  
  const cloned = {};
  for (const key in obj) {
    if (obj.hasOwnProperty(key)) {
      cloned[key] = deepClone(obj[key]);
    }
  }
  return cloned;
}

/**
 * Merge data dengan schema, validasi tipe data
 * @param {object} schema - Default schema
 * @param {object} data - Data dari user
 * @param {boolean} strict - Strict mode (reject unknown fields)
 * @returns {object} - Merged data
 */
function mergeWithSchema(schema, data = {}, strict = false) {
  const result = deepClone(schema);

  for (const key in data) {
    if (!data.hasOwnProperty(key)) continue;

    // Strict mode: reject unknown fields
    if (strict && !schema.hasOwnProperty(key)) {
      console.warn(`Warning: Unknown field "${key}" ignored (strict mode)`);
      continue;
    }

    const schemaValue = schema[key];
    const dataValue = data[key];
    const schemaType = detectType(schemaValue);
    const dataType = detectType(dataValue);

    // Type validation
    if (schemaType !== dataType && schemaValue !== null) {
      console.warn(
        `Warning: Type mismatch for "${key}". Expected ${schemaType}, got ${dataType}. Using default value.`
      );
      continue;
    }

    // Nested object handling
    if (schemaType === "object" && dataType === "object") {
      result[key] = mergeWithSchema(schemaValue, dataValue, strict);
    } else {
      result[key] = dataValue;
    }
  }

  return result;
}

/**
 * Validate data terhadap schema
 * @param {object} schema - Schema definition
 * @param {object} data - Data yang mau divalidate
 * @returns {object} - { valid: boolean, errors: string[] }
 */
function validateSchema(schema, data) {
  const errors = [];

  for (const key in schema) {
    if (!schema.hasOwnProperty(key)) continue;

    const schemaValue = schema[key];
    const dataValue = data[key];
    const schemaType = detectType(schemaValue);
    const dataType = detectType(dataValue);

    if (dataValue === undefined) {
      errors.push(`Missing required field: ${key}`);
      continue;
    }

    if (schemaType !== dataType && schemaValue !== null) {
      errors.push(
        `Type mismatch for "${key}". Expected ${schemaType}, got ${dataType}`
      );
    }

    // Validate nested objects
    if (schemaType === "object" && dataType === "object" && !Array.isArray(schemaValue)) {
      const nestedValidation = validateSchema(schemaValue, dataValue);
      if (!nestedValidation.valid) {
        errors.push(`Nested validation failed for "${key}":`, ...nestedValidation.errors);
      }
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Schema Builder Class
 */
class SchemaBuilder {
  constructor(definition) {
    this.definition = definition;
  }

  /**
   * Get default values dari schema
   * @returns {object}
   */
  getDefaults() {
    return deepClone(this.definition);
  }

  /**
   * Merge data dengan schema
   * @param {object} data - User data
   * @param {boolean} strict - Strict mode
   * @returns {object}
   */
  merge(data, strict = false) {
    return mergeWithSchema(this.definition, data, strict);
  }

  /**
   * Validate data
   * @param {object} data - Data yang mau divalidate
   * @returns {object} - Validation result
   */
  validate(data) {
    return validateSchema(this.definition, data);
  }

  /**
   * Create instance dari schema dengan data
   * @param {object} data - User data
   * @returns {object}
   */
  create(data = {}) {
    return this.merge(data);
  }

  /**
   * Get info tentang schema
   * @returns {object}
   */
  info() {
    const info = {};
    for (const key in this.definition) {
      if (this.definition.hasOwnProperty(key)) {
        info[key] = {
          type: detectType(this.definition[key]),
          default: this.definition[key],
        };
      }
    }
    return info;
  }
}

/**
 * Create schema dari definition object
 * @param {object} definition - Schema definition
 * @returns {SchemaBuilder}
 */
export function createSchema(definition) {
  return new SchemaBuilder(definition);
}

/**
 * Helper untuk create schema dengan timestamps
 * @param {object} definition - Schema definition
 * @returns {SchemaBuilder}
 */
export function createSchemaWithTimestamps(definition) {
  return new SchemaBuilder({
    ...definition,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  });
}

export { SchemaBuilder, mergeWithSchema, validateSchema, detectType, deepClone };