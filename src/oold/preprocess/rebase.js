import { isObject, isArray, isString } from '../../helpers/utils.js'

/**
 * Makes the document's $id absolute against a base URI.
 *
 * Required before RefParser sees an OO-LD document. Specification examples carry
 * a relative $id such as "Person.schema.json" and refer to their parent as
 * "Thing.schema.json". RefParser rewrites a relative $ref against the nearest
 * $id, but only fetches a ref once it starts with "http", and resolving
 * "Thing.schema.json" against a relative base yields no absolute URL. The
 * reference would then stay relative and never be loaded.
 *
 * The base is where the document was retrieved from, so the backend knows it
 * even when the document does not.
 */
export function rebase (schema, baseUri) {
  if (!isObject(schema) || !isString(baseUri) || baseUri === '') {
    return schema
  }

  return walk(schema, baseUri)
}

function walk (node, baseUri) {
  if (isArray(node)) {
    return node.map((entry) => walk(entry, baseUri))
  }

  if (!isObject(node)) {
    return node
  }

  const result = {}
  const base = isString(node.$id) ? absolute(node.$id, baseUri) : baseUri

  for (const [key, value] of Object.entries(node)) {
    result[key] = key === '$id' ? base : walk(value, base)
  }

  return result
}

function absolute (uri, baseUri) {
  try {
    return new URL(uri, baseUri).href
  } catch (error) {
    return uri
  }
}
