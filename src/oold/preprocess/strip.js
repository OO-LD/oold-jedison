import { isObject, isArray, isSet } from '../../helpers/utils.js'
import { STRIPPED_KEYWORDS, COLLECTED_KEYWORDS, UI_RENDER_HIDDEN } from '../constants.js'

/**
 * Removes the semantic keywords from the rendered schema and returns what was
 * read out of them.
 *
 * Nothing here is presentational, so the form does not need it, but the caller
 * does: the uuids identify which classes composed the schema, and the rdf types
 * seed the `type` member of a new instance.
 */
export function stripSemantics (schema) {
  const collected = {
    uuids: [],
    instanceRdfTypes: undefined,
    renderHidden: []
  }

  const stripped = walk(schema, collected, '#')

  return { schema: stripped, collected }
}

function walk (node, collected, path) {
  if (isArray(node)) {
    return node.map((entry, index) => walk(entry, collected, `${path}/${index}`))
  }

  if (!isObject(node)) {
    return node
  }

  collect(node, collected, path)

  const result = {}

  for (const [key, value] of Object.entries(node)) {
    if (STRIPPED_KEYWORDS.includes(key)) {
      continue
    }
    result[key] = walk(value, collected, `${path}/${key}`)
  }

  return result
}

function collect (node, collected, path) {
  if (isSet(node['x-oold-uuid']) && !collected.uuids.includes(node['x-oold-uuid'])) {
    collected.uuids.push(node['x-oold-uuid'])
  }

  // Most-derived-wins, and the root is walked before its children.
  if (path === '#' && isSet(node['x-oold-instance-rdf-type'])) {
    collected.instanceRdfTypes = node['x-oold-instance-rdf-type']
  }

  if (node[UI_RENDER_HIDDEN] === true) {
    collected.renderHidden.push(path)
  }
}

export { COLLECTED_KEYWORDS }
