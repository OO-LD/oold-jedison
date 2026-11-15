import { isObject, isArray, isString } from '../../helpers/utils.js'
import { OOLD_REF } from '../constants.js'

/**
 * Resolves x-oold-ref, which generic $ref resolvers deliberately ignore.
 *
 * Resolution is lazy: a reference is only followed when something asks for it,
 * and a cycle terminates rather than recursing (OOLD-EXT-6007, OOLD-EXT-9ee8).
 * Replacing x-oold-ref with $ref yields a plain resolvable JSON Schema, so the
 * loader is whatever already resolves $ref for the caller.
 */
export class OoldRefResolver {
  constructor (load, options = {}) {
    this.load = load
    this.maxDepth = options.maxDepth ?? 16
    this.cache = new Map()
  }

  /**
   * Returns the referenced schema, or null when the reference cannot be loaded.
   * Repeated requests for the same target are served from cache, and a request
   * already in flight is shared rather than issued twice.
   */
  async resolve (ref, baseUri) {
    const key = this.key(ref, baseUri)

    if (!this.cache.has(key)) {
      this.cache.set(key, Promise.resolve(this.load(ref, baseUri)).catch(() => null))
    }

    return this.cache.get(key)
  }

  /**
   * Expands every x-oold-ref reachable from the node, stopping at a cycle or at
   * maxDepth. Returns a copy, the input is not modified.
   */
  async expand (node, baseUri, seen = new Set(), depth = 0) {
    if (isArray(node)) {
      return Promise.all(node.map((entry) => this.expand(entry, baseUri, seen, depth)))
    }

    if (!isObject(node)) {
      return node
    }

    const result = {}

    for (const [key, value] of Object.entries(node)) {
      if (key === OOLD_REF) {
        continue
      }
      result[key] = await this.expand(value, baseUri, seen, depth)
    }

    const ref = node[OOLD_REF]

    if (!isString(ref)) {
      return result
    }

    const key = this.key(ref, baseUri)

    if (seen.has(key) || depth >= this.maxDepth) {
      // Keep the reference rather than inlining it, so the cut stays visible.
      result[OOLD_REF] = ref
      result['x-oold-ref-cut'] = true
      return result
    }

    const target = await this.resolve(ref, baseUri)

    if (!isObject(target)) {
      result[OOLD_REF] = ref
      result['x-oold-ref-unresolved'] = true
      return result
    }

    const expanded = await this.expand(target, baseUri, new Set([...seen, key]), depth + 1)

    // Local keywords are more derived than the target's, so they win.
    return { ...expanded, ...result }
  }

  key (ref, baseUri) {
    return baseUri ? `${baseUri}::${ref}` : ref
  }
}
