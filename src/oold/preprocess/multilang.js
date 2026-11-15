import { isObject, isArray, isSet } from '../../helpers/utils.js'
import { MULTILANG_MAP } from '../constants.js'

/**
 * Resolves x-oold-multilang-<x> language maps against the interface language and
 * writes the result onto the keyword it qualifies. The language map is removed.
 *
 * Falls back along the BCP-47 tag ("de-CH" to "de"), then to the configured
 * fallback language, then to the unqualified keyword the schema already carries.
 */
export function resolveMultilang (schema, language = 'en', fallbackLanguage = 'en') {
  return walk(schema, language, fallbackLanguage)
}

function walk (node, language, fallbackLanguage) {
  if (isArray(node)) {
    return node.map((entry) => walk(entry, language, fallbackLanguage))
  }

  if (!isObject(node)) {
    return node
  }

  const result = {}

  for (const [key, value] of Object.entries(node)) {
    if (key in MULTILANG_MAP) {
      continue
    }
    result[key] = walk(value, language, fallbackLanguage)
  }

  for (const [key, target] of Object.entries(MULTILANG_MAP)) {
    if (!isObject(node[key])) {
      continue
    }
    const picked = pick(node[key], language, fallbackLanguage)
    if (isSet(picked)) {
      result[target] = picked
    }
  }

  return result
}

function pick (map, language, fallbackLanguage) {
  for (const tag of candidates(language, fallbackLanguage)) {
    if (isSet(map[tag])) {
      return map[tag]
    }
  }
  return undefined
}

function candidates (language, fallbackLanguage) {
  const tags = []

  for (const tag of [language, fallbackLanguage]) {
    if (typeof tag !== 'string' || tag === '') {
      continue
    }
    const parts = tag.split('-')
    while (parts.length) {
      const candidate = parts.join('-')
      if (!tags.includes(candidate)) {
        tags.push(candidate)
      }
      parts.pop()
    }
  }

  return tags
}
