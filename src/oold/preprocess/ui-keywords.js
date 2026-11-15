import { isObject, isArray, isSet } from '../../helpers/utils.js'
import { UI_KEYWORD_MAP } from '../constants.js'

/**
 * Rewrites x-oold-ui-* onto the jedison keyword that implements it.
 *
 * A keyword the schema already states in jedison spelling wins, so an author can
 * override the mapping for one field without abandoning the OO-LD vocabulary.
 * x-jedison-* and x-* pass through untouched.
 */
export function mapUiKeywords (schema) {
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
    if (key in UI_KEYWORD_MAP) {
      continue
    }
    result[key] = walk(value)
  }

  for (const [source, targets] of Object.entries(UI_KEYWORD_MAP)) {
    if (!isSet(node[source])) {
      continue
    }
    for (const target of targets) {
      if (!isSet(result[target])) {
        result[target] = node[source]
      }
    }
  }

  return result
}
