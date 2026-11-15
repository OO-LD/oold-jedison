import { isObject, isArray, isString } from '../../helpers/utils.js'
import { SchemaStore, InstanceStore, ClassIndex } from './interfaces.js'
import { Backend } from './backend.js'

function absolute (uri, base) {
  try {
    return new URL(uri, base || undefined).href
  } catch (error) {
    return uri
  }
}

function normaliseText (value) {
  return isString(value) ? value.toLowerCase() : ''
}

/**
 * Serves a fixed set of schema documents.
 *
 * Documents may be handed in directly, or named by a module manifest and
 * fetched on first use. The manifest shape is the one oold-reference-schemas
 * publishes: an object with a `schemas` array of file names relative to it.
 */
export class StaticSchemaStore extends SchemaStore {
  constructor (options = {}) {
    super(options)
    this.baseUri = options.baseUri ?? ''
    this.documents = new Map()

    for (const [uri, schema] of Object.entries(options.schemas ?? {})) {
      this.documents.set(absolute(uri, this.baseUri), schema)
    }
  }

  async resolve (uri) {
    const key = absolute(uri, this.baseUri)

    if (this.documents.has(key)) {
      const schema = this.documents.get(key)
      return { ok: true, status: 200, json: async () => schema }
    }

    // Not held locally, fall back to the configured fetch so a manifest can
    // name documents that are served rather than bundled.
    return super.resolve(key)
  }

  async listClasses () {
    return [...this.documents.keys()]
  }

  /**
   * Loads every schema a module manifest names, so the class index has the
   * edges it needs. OO-LD has no children index, which is why this is a scan.
   */
  async loadModule (manifestUri) {
    const uri = absolute(manifestUri, this.baseUri)
    const response = await super.resolve(uri)

    if (!response || !response.ok) {
      return []
    }

    const manifest = await response.json()
    const names = isArray(manifest?.schemas) ? manifest.schemas : []
    const loaded = []

    for (const name of names) {
      const schemaUri = absolute(name, uri)
      const schemaResponse = await super.resolve(schemaUri)

      if (!schemaResponse || !schemaResponse.ok) {
        continue
      }

      const schema = await schemaResponse.json()

      if (isObject(schema)) {
        this.documents.set(schemaUri, schema)
        loaded.push(schemaUri)
      }
    }

    return loaded
  }

  get (uri) {
    return this.documents.get(absolute(uri, this.baseUri))
  }

  set (uri, schema) {
    this.documents.set(absolute(uri, this.baseUri), schema)
  }
}

/**
 * Derives the class hierarchy by inverting allOf edges.
 *
 * Following the convention the reference schemas already use, the first $ref of
 * an allOf owns the tree position. The remaining refs are mixins and do not
 * place the class.
 */
export class StaticClassIndex extends ClassIndex {
  constructor (options = {}) {
    super(options)
    this.store = options.store
    this.allRefs = options.allRefs === true
  }

  parentsOf (uri) {
    const schema = this.store.get(uri)

    if (!isObject(schema) || !isArray(schema.allOf)) {
      return []
    }

    const refs = schema.allOf
      .filter((branch) => isObject(branch) && isString(branch.$ref))
      .map((branch) => absolute(branch.$ref, uri))

    return this.allRefs ? refs : refs.slice(0, 1)
  }

  async getSuperclasses (classRef) {
    const seen = new Set()
    const chain = []
    let current = [classRef]

    while (current.length) {
      const next = []

      for (const uri of current) {
        for (const parent of this.parentsOf(uri)) {
          if (seen.has(parent)) {
            continue
          }
          seen.add(parent)
          chain.push(parent)
          next.push(parent)
        }
      }

      current = next
    }

    return chain
  }

  async getSubclasses (classRef, options = {}) {
    const depth = options.depth ?? 1
    const uris = await this.store.listClasses()
    const direct = uris.filter((uri) => this.parentsOf(uri).includes(classRef))

    if (depth <= 1) {
      return direct
    }

    const result = [...direct]

    for (const child of direct) {
      const deeper = await this.getSubclasses(child, { depth: depth - 1 })
      for (const uri of deeper) {
        if (!result.includes(uri)) {
          result.push(uri)
        }
      }
    }

    return result
  }

  /**
   * A metaclass is what a class is an instance of, which OO-LD expresses as the
   * class's own instance rdf type rather than as a composition edge.
   */
  async getMetaclasses (classRef) {
    const schema = this.store.get(classRef)
    const types = schema?.['x-oold-instance-rdf-type']
    return isArray(types) ? types : []
  }
}

/**
 * Holds instances in memory.
 *
 * Search is a case-insensitive substring match over label and description,
 * filtered by the range's target classes when it states any.
 */
export class StaticInstanceStore extends InstanceStore {
  constructor (options = {}) {
    super(options)
    this.records = new Map()
    this.nextId = 1
    this.idPrefix = options.idPrefix ?? 'urn:oold:'

    for (const record of options.instances ?? []) {
      if (isObject(record) && isString(record.id)) {
        this.records.set(record.id, { ...record })
      }
    }
  }

  matchesRange (record, spec) {
    const classes = spec?.classes

    if (!isArray(classes) || !classes.length) {
      return true
    }

    const types = isArray(record.type) ? record.type : [record.type].filter(Boolean)

    return types.some((type) => classes.includes(type))
  }

  async search (spec, userInput = '', formValue = undefined, language = undefined) {
    const needle = normaliseText(userInput)
    const limit = spec?.limit ?? 25
    const results = []

    for (const record of this.records.values()) {
      if (!this.matchesRange(record, spec)) {
        continue
      }

      const haystack = `${normaliseText(record.label)} ${normaliseText(record.description)}`

      if (needle && !haystack.includes(needle)) {
        continue
      }

      results.push({
        id: record.id,
        label: record.label,
        description: record.description,
        image: record.image,
        type: record.type,
        raw: record
      })
    }

    // Prefer the shorter label, so an exact-ish match outranks a long one that
    // merely contains the input.
    results.sort((a, b) => normaliseText(a.label).length - normaliseText(b.label).length)

    return results.slice(0, limit)
  }

  async getLabels (ids) {
    const map = {}

    for (const id of isArray(ids) ? ids : []) {
      const record = this.records.get(id)
      if (record) {
        map[id] = record.label
      }
    }

    return map
  }

  async load (id) {
    const record = this.records.get(id)
    return record ? { ...record } : null
  }

  async save (entity) {
    const id = isString(entity?.id) && entity.id !== ''
      ? entity.id
      : `${this.idPrefix}${this.nextId++}`

    this.records.set(id, { ...entity, id })

    return { id }
  }

  async remove (id) {
    return this.records.delete(id)
  }

  async getReverse (property, subjectId) {
    const found = []

    for (const record of this.records.values()) {
      const value = record[property]
      const values = isArray(value) ? value : [value]

      if (values.includes(subjectId)) {
        found.push(record.id)
      }
    }

    return found
  }
}

/**
 * Assembles the three static stores. This is the backend the playground runs on
 * and the oracle the contract suite checks the others against.
 */
export function createStaticBackend (options = {}) {
  const schemas = new StaticSchemaStore(options)
  const classes = new StaticClassIndex({ ...options, store: schemas })
  const instances = new StaticInstanceStore(options)

  return new Backend({ ...options, name: options.name ?? 'static', schemas, classes, instances })
}
