import { isObject, isArray } from '../../helpers/utils.js'
import { NARROW_MAX, NARROW_MIN, ADDITIVE_MAPS, ADDITIVE_ARRAYS } from '../constants.js'

/**
 * Collapses an allOf chain into one schema, per OO-LD 06-composition.md:
 * JSON Merge Patch semantics, most-derived-wins, null removes, assertion
 * keywords narrow-only.
 *
 * jedison's own mergeAllOf stays off. It combines rather than overrides, so a
 * subclass could not narrow an inherited property.
 */
export function mergeAllOf (schema) {
  if (!isObject(schema)) {
    return schema
  }

  const walked = walk(schema)
  return walked
}

function walk (node) {
  if (isArray(node)) {
    return node.map(walk)
  }

  if (!isObject(node)) {
    return node
  }

  const merged = isArray(node.allOf) ? flatten(node) : { ...node }

  for (const [key, value] of Object.entries(merged)) {
    if (key === 'allOf') {
      continue
    }
    merged[key] = walk(value)
  }

  return merged
}

/**
 * allOf is ordered base-first, so later entries are more derived and the node's
 * own keywords are the most derived of all.
 */
function flatten (node) {
  const { allOf, ...own } = node
  let result = {}

  for (const branch of allOf) {
    if (!isObject(branch)) {
      continue
    }
    result = mergeTwo(result, isArray(branch.allOf) ? flatten(branch) : branch)
  }

  return mergeTwo(result, own)
}

export function mergeTwo (base, derived) {
  const result = { ...base }

  for (const [key, value] of Object.entries(derived)) {
    if (value === null) {
      delete result[key]
      continue
    }

    if (!(key in result)) {
      result[key] = value
      continue
    }

    result[key] = mergeValue(key, result[key], value)
  }

  return result
}

function mergeValue (key, baseValue, derivedValue) {
  if (ADDITIVE_ARRAYS.includes(key)) {
    const union = isArray(baseValue) ? [...baseValue] : []
    for (const entry of isArray(derivedValue) ? derivedValue : []) {
      if (!union.includes(entry)) {
        union.push(entry)
      }
    }
    return union
  }

  if (ADDITIVE_MAPS.includes(key) && isObject(baseValue) && isObject(derivedValue)) {
    const map = { ...baseValue }
    for (const [name, sub] of Object.entries(derivedValue)) {
      if (sub === null) {
        delete map[name]
      } else if (isObject(map[name]) && isObject(sub)) {
        map[name] = mergeTwo(map[name], sub)
      } else {
        map[name] = sub
      }
    }
    return map
  }

  if (NARROW_MAX.includes(key)) {
    return narrow(baseValue, derivedValue, Math.min)
  }

  if (NARROW_MIN.includes(key)) {
    return narrow(baseValue, derivedValue, Math.max)
  }

  if (key === 'enum' && isArray(baseValue) && isArray(derivedValue)) {
    // Narrowing an enum means keeping only members the base already allowed.
    const kept = derivedValue.filter((entry) => baseValue.includes(entry))
    return kept.length ? kept : derivedValue
  }

  return derivedValue
}

function narrow (baseValue, derivedValue, pick) {
  if (typeof baseValue !== 'number' || typeof derivedValue !== 'number') {
    return derivedValue
  }
  return pick(baseValue, derivedValue)
}
