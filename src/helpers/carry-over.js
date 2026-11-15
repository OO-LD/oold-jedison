import { isObject, isArray, isString, isNumber, isInteger, isBoolean, isSet, clone } from './utils.js'

/**
 * Decides which parts of a value survive a change of schema.
 *
 * Replacing the schema while the form is open would otherwise either discard
 * everything the user typed, or keep members the new schema cannot represent.
 * Neither is acceptable, so a value is carried over exactly where the new
 * schema defines a place for it that its type admits.
 *
 * Whatever is dropped is reported rather than discarded silently, so the caller
 * can tell the user what was lost.
 */

function typesOf (schema) {
  if (!isObject(schema)) {
    return []
  }

  if (isArray(schema.type)) {
    return schema.type
  }

  return isString(schema.type) ? [schema.type] : []
}

export function matchesType (value, type) {
  switch (type) {
    case 'string':
      return isString(value)
    case 'number':
      return isNumber(value)
    case 'integer':
      return isInteger(value)
    case 'boolean':
      return isBoolean(value)
    case 'array':
      return isArray(value)
    case 'object':
      return isObject(value)
    case 'null':
      return value === null
    default:
      return true
  }
}

/**
 * True when the schema states nothing that rules the value out.
 *
 * Deliberately permissive about what it does not understand: a keyword this
 * does not model is not a reason to throw a user's input away.
 */
export function admits (value, schema) {
  if (schema === true || !isSet(schema)) {
    return true
  }

  if (schema === false) {
    return false
  }

  if (!isObject(schema)) {
    return true
  }

  const types = typesOf(schema)

  if (types.length && !types.some((type) => matchesType(value, type))) {
    return false
  }

  if (isArray(schema.enum) && !schema.enum.some((entry) => deepEquals(entry, value))) {
    return false
  }

  if (isSet(schema.const) && !deepEquals(schema.const, value)) {
    return false
  }

  if (isArray(schema.oneOf) || isArray(schema.anyOf)) {
    const branches = [...(schema.oneOf ?? []), ...(schema.anyOf ?? [])]

    if (branches.length && !branches.some((branch) => admits(value, branch))) {
      return false
    }
  }

  if (isArray(schema.allOf) && !schema.allOf.every((branch) => admits(value, branch))) {
    return false
  }

  return true
}

function deepEquals (a, b) {
  if (a === b) {
    return true
  }

  if (isArray(a) && isArray(b)) {
    return a.length === b.length && a.every((entry, index) => deepEquals(entry, b[index]))
  }

  if (isObject(a) && isObject(b)) {
    const keys = Object.keys(a)
    return keys.length === Object.keys(b).length && keys.every((key) => deepEquals(a[key], b[key]))
  }

  return false
}

/**
 * Finds the subschema that governs a member of an object.
 */
function propertySchema (schema, key) {
  if (isObject(schema.properties) && isSet(schema.properties[key])) {
    return schema.properties[key]
  }

  if (isObject(schema.patternProperties)) {
    for (const pattern of Object.keys(schema.patternProperties)) {
      try {
        if (new RegExp(pattern, 'u').test(key)) {
          return schema.patternProperties[pattern]
        }
      } catch (error) {
        // An unusable pattern is not a reason to drop the member.
      }
    }
  }

  // Composition is consulted before additionalProperties: a composed object is
  // closed with unevaluatedProperties, and additionalProperties: false on the
  // outer schema does not see the members the branches contribute.
  for (const branch of [...(schema.allOf ?? []), ...(schema.oneOf ?? []), ...(schema.anyOf ?? [])]) {
    if (isObject(branch)) {
      const found = propertySchema(branch, key)

      if (found !== undefined && found !== false) {
        return found
      }
    }
  }

  if (isSet(schema.additionalProperties)) {
    return schema.additionalProperties
  }

  if (schema.unevaluatedProperties === false) {
    return false
  }

  // Nothing is stated about this member, and an unstated member is allowed.
  return true
}

function itemSchema (schema, index) {
  if (isArray(schema.prefixItems) && index < schema.prefixItems.length) {
    return schema.prefixItems[index]
  }

  if (isSet(schema.items)) {
    return schema.items
  }

  return undefined
}

/**
 * Returns the part of `value` the new schema can hold, and the paths of what
 * it cannot.
 */
export function carryOver (value, schema, options = {}) {
  const dropped = []
  const kept = walk(value, schema, '#', dropped, options)

  return { value: kept, dropped }
}

function walk (value, schema, path, dropped, options) {
  if (!isSet(value)) {
    return undefined
  }

  if (schema === false) {
    dropped.push(path)
    return undefined
  }

  const effective = isObject(schema) ? schema : {}
  const types = typesOf(effective)

  if (isObject(value) && (types.includes('object') || !types.length)) {
    const result = {}

    for (const [key, member] of Object.entries(value)) {
      const sub = propertySchema(effective, key)

      if (sub === false) {
        dropped.push(`${path}/${key}`)
        continue
      }

      const carried = walk(member, sub, `${path}/${key}`, dropped, options)

      if (isSet(carried)) {
        result[key] = carried
      }
    }

    return result
  }

  if (isArray(value) && (types.includes('array') || !types.length)) {
    const result = []

    value.forEach((entry, index) => {
      const sub = itemSchema(effective, index)

      if (!isSet(sub)) {
        dropped.push(`${path}/${index}`)
        return
      }

      const carried = walk(entry, sub, `${path}/${index}`, dropped, options)

      if (isSet(carried)) {
        result.push(carried)
      }
    })

    return result
  }

  if (!admits(value, effective)) {
    dropped.push(path)
    return undefined
  }

  return clone(value)
}
