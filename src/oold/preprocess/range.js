import { isObject, isArray, isString } from '../../helpers/utils.js'
import { OOLD_RANGE, OOLD_REF } from '../constants.js'

/**
 * Normalises the three x-oold-range forms the specification admits
 * (09-extensions.md, OOLD-EXT-c77a) into one internal shape:
 *
 *   { classes: string[], union: boolean, subschema: object|undefined }
 *
 * `classes` are the target classes offered to the user. `union` records whether
 * the author wrote a choice, which is what decides between a plain create button
 * and one that picks a class first. `subschema` keeps any further constraints so
 * a later stage can apply them to the created entity.
 *
 * Form 1, a string, is shorthand for { allOf: [ { x-oold-ref: <string> } ] }.
 */
export function normaliseRange (range) {
  if (isString(range)) {
    return { classes: [range], union: false, subschema: undefined }
  }

  if (isArray(range)) {
    const classes = range.filter(isString)
    return { classes, union: classes.length > 1, subschema: undefined }
  }

  if (isObject(range)) {
    const union = isArray(range.oneOf) || isArray(range.anyOf)
    return { classes: collectRefs(range), union, subschema: range }
  }

  return { classes: [], union: false, subschema: undefined }
}

/**
 * Collects x-oold-ref targets. References inside x-oold-range use x-oold-ref and
 * never $ref, so a generic resolver leaves them alone.
 */
function collectRefs (node, seen = new Set()) {
  if (isArray(node)) {
    return node.flatMap((entry) => collectRefs(entry, seen))
  }

  if (!isObject(node)) {
    return []
  }

  const refs = []

  if (isString(node[OOLD_REF]) && !seen.has(node[OOLD_REF])) {
    seen.add(node[OOLD_REF])
    refs.push(node[OOLD_REF])
  }

  for (const key of ['allOf', 'anyOf', 'oneOf']) {
    if (isArray(node[key])) {
      refs.push(...collectRefs(node[key], seen))
    }
  }

  return refs
}

/**
 * Walks the schema and replaces every x-oold-range with its normalised form,
 * recorded under x-oold-range-resolved so the original stays readable.
 */
export function normaliseRanges (schema) {
  return walk(schema)
}

function walk (node) {
  if (isArray(node)) {
    return node.map(walk)
  }

  if (!isObject(node)) {
    return node
  }

  const result = {}

  for (const [key, value] of Object.entries(node)) {
    result[key] = key === OOLD_RANGE ? value : walk(value)
  }

  if (OOLD_RANGE in node) {
    result['x-oold-range-resolved'] = normaliseRange(node[OOLD_RANGE])
  }

  return result
}
