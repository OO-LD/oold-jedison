import { RequestCache, Batcher } from './cache.js'

/**
 * Marks a base implementation as a stand-in rather than behaviour.
 *
 * Capabilities are read off these marks, so an adapter declares what it can do
 * by implementing a method and nothing else. A hand-written capability list
 * drifts from the code; a derived one cannot.
 *
 * The marks sit on the prototype, so a subclass method simply overrides them.
 */
function markNotSupported (target, names) {
  for (const name of names) {
    target.prototype[name].notSupported = true
  }
}

export function supports (store, method) {
  return Boolean(store) && typeof store[method] === 'function' && store[method].notSupported !== true
}

/**
 * Supplies schema documents.
 *
 * `resolve` is deliberately fetch-shaped. The default is the global fetch, so a
 * deployment serving schemas as static files writes no code at all, and one
 * storing them elsewhere supplies a function of the same shape.
 */
export class SchemaStore {
  constructor (options = {}) {
    this.cache = new RequestCache(options)
    this.fetch = options.fetch ?? (typeof fetch === 'function' ? fetch.bind(globalThis) : undefined)
    this.fetchOptions = options.fetchOptions ?? {}
  }

  async resolve (uri) {
    if (!this.fetch) {
      return { ok: false, status: 0, json: async () => null }
    }

    return this.cache.run(`schema:${uri}`, () => this.fetch(uri, this.fetchOptions))
  }

  /**
   * Returns the classes a module contains, as absolute schema URIs.
   * Needed to build a class tree, since OO-LD has no children index.
   */
  async listClasses () {
    return []
  }

  /**
   * Hands jedison's RefParser a fetch bound to this store.
   */
  toFetch () {
    return (uri, options) => this.resolve(uri, options)
  }
}

markNotSupported(SchemaStore, ['listClasses'])

/**
 * Loads, searches and stores instances.
 */
export class InstanceStore {
  constructor (options = {}) {
    this.cache = new RequestCache(options)
    this.language = options.language ?? 'en'
    this.labelBatcher = new Batcher((ids) => this.getLabels(ids, this.language), options)
  }

  /**
   * Returns [{id, label, description, image, type, raw}].
   *
   * `spec` is the resolved range plus whatever source configuration the schema
   * carried, `formValue` is the current document so a query can filter on a
   * sibling field.
   */
  async search () {
    return []
  }

  /**
   * Maps identifiers to display labels.
   *
   * Must accept whatever the store template produced, which is not necessarily
   * an identifier the backend uses natively.
   */
  async getLabels () {
    return {}
  }

  async load () {
    return null
  }

  async save () {
    return null
  }

  async remove () {
    return false
  }

  async getReverse () {
    return []
  }

  /**
   * Single-identifier label lookup that joins the batch.
   */
  async getLabel (id, language) {
    if (!supports(this, 'getLabels')) {
      return undefined
    }

    if (language) {
      this.language = language
    }

    return this.labelBatcher.lookup(id)
  }
}

markNotSupported(InstanceStore, ['search', 'getLabels', 'load', 'save', 'remove', 'getReverse'])

/**
 * Navigates the class hierarchy.
 *
 * Separate from the schema store because a deployment may serve schemas without
 * being able to answer "what extends this", and the tree widgets are the only
 * thing that needs the answer.
 */
export class ClassIndex {
  constructor (options = {}) {
    this.cache = new RequestCache(options)
  }

  async getSubclasses () {
    return []
  }

  async getSuperclasses () {
    return []
  }

  async getMetaclasses () {
    return []
  }
}

markNotSupported(ClassIndex, ['getSubclasses', 'getSuperclasses', 'getMetaclasses'])
