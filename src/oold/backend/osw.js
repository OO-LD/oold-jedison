import { isObject, isArray, isString } from '../../helpers/utils.js'
import { SchemaStore, InstanceStore, ClassIndex } from './interfaces.js'
import { Backend } from './backend.js'

/**
 * Semantic MediaWiki adapter.
 *
 * Everything SMW-specific that MwJson_editor.js spreads through the editor is
 * confined here: the ask syntax, the property vocabulary, the subclass property
 * chain and the identifier conventions.
 */

export const DEFAULT_PROPERTIES = {
  label: 'HasLabel',
  image: 'HasImage',
  description: 'HasDescription',
  type: 'HasType.Display_title_of',
  uuid: 'HasUuid',
  subclassOf: 'SubClassOf',
  displayTitle: 'Display_title_of',
  normalizedLabel: 'HasNormalizedLabel'
}

/**
 * SMW has no transitive query, so a subclass lookup is an explicit chain of
 * fixed depth. MwJson unrolls five levels; the depth is configurable here
 * because it is a cost, not a constant.
 */
export function subclassChainQuery (classRef, property, depth, includeSelf) {
  const parts = includeSelf ? [`[[:${classRef}]]`] : []

  for (let level = 1; level <= depth; level++) {
    const chain = Array(level).fill(property).join('.')
    parts.push(`[[${chain}::${classRef}]]`)
  }

  return parts.join('OR')
}

/**
 * Escapes the characters that would otherwise terminate an ask condition.
 */
export function escapeAsk (value) {
  return String(value ?? '').replace(/[[\]|{}]/g, ' ').trim()
}

class AskClient {
  constructor (options = {}) {
    this.apiUrl = options.apiUrl
    this.fetch = options.fetch ?? (typeof fetch === 'function' ? fetch.bind(globalThis) : undefined)
    this.fetchOptions = options.fetchOptions ?? {}
    this.properties = { ...DEFAULT_PROPERTIES, ...(options.properties ?? {}) }
    this.limit = options.limit ?? 25
    this.language = options.language ?? 'en'

    // MediaWiki's `origin` parameter makes the API emit its own CORS header.
    // Where the site already sends one, the response carries two values and
    // every browser rejects it, so this is opt-in rather than always on.
    this.originParam = options.originParam ?? null
  }

  withOrigin (url) {
    return this.originParam ? `${url}&origin=${encodeURIComponent(this.originParam)}` : url
  }

  printouts () {
    const { label, image, description, type } = this.properties
    return `|?${label}=label|?${image}=image|?${description}=description|?${type}=type`
  }

  async ask (query) {
    if (!this.fetch || !this.apiUrl || !query) {
      return {}
    }

    const url = this.withOrigin(`${this.apiUrl}?action=ask&format=json&query=${encodeURIComponent(query)}`)
    const response = await this.fetch(url, this.fetchOptions)

    if (!response || !response.ok) {
      return {}
    }

    const body = await response.json()

    return body?.query?.results ?? {}
  }

  toRecords (results) {
    return Object.entries(results).map(([title, row]) => {
      const printouts = row?.printouts ?? {}

      return {
        id: title,
        label: first(printouts.label) ?? row?.displaytitle ?? row?.fulltext ?? title,
        description: first(printouts.description),
        image: first(printouts.image),
        type: first(printouts.type),
        raw: row
      }
    })
  }
}

function first (value) {
  if (!isArray(value) || !value.length) {
    return undefined
  }

  const entry = value[0]

  // SMW returns a page reference as an object and a literal as a scalar.
  return isObject(entry) ? (entry.fulltext ?? entry.displaytitle) : entry
}

export class OswSchemaStore extends SchemaStore {
  constructor (options = {}) {
    super(options)
    this.wikiUrl = options.wikiUrl
    this.slot = options.slot ?? 'jsonschema'
  }

  /**
   * A class is a Category page and its schema lives in a page slot, so a class
   * identifier has to be rewritten into a raw-slot URL before retrieval.
   */
  toSlotUrl (uri) {
    if (!this.wikiUrl || /^https?:/.test(uri)) {
      return uri
    }

    return `${this.wikiUrl}/index.php?title=${encodeURIComponent(uri)}&action=raw&slot=${this.slot}`
  }

  async resolve (uri) {
    return super.resolve(this.toSlotUrl(uri))
  }
}

export class OswInstanceStore extends InstanceStore {
  constructor (options = {}) {
    super(options)
    this.client = new AskClient(options)
  }

  buildQuery (spec, userInput) {
    const { normalizedLabel } = this.client.properties
    const conditions = []
    const classes = isArray(spec?.classes) ? spec.classes : []

    if (classes.length) {
      conditions.push(classes.map((entry) => `[[${escapeAsk(entry)}]]`).join('OR'))
    }

    if (userInput) {
      conditions.push(`[[${normalizedLabel}::like:*${escapeAsk(userInput)}*]]`)
    }

    if (!conditions.length) {
      conditions.push('[[:+]]')
    }

    const limit = spec?.limit ?? this.client.limit

    return `${conditions.join('')}${this.client.printouts()}|limit=${limit}`
  }

  async search (spec, userInput = '') {
    const results = await this.client.ask(this.buildQuery(spec, userInput))
    return this.client.toRecords(results)
  }

  /**
   * Accepts both a page title and an IRI, because a store template commonly
   * writes an IRI while the wiki is keyed by title.
   */
  async getLabels (ids) {
    const wanted = (isArray(ids) ? ids : []).filter(isString)

    if (!wanted.length) {
      return {}
    }

    const { label, uuid } = this.client.properties
    const conditions = wanted
      .map((id) => (/^https?:/.test(id) ? `[[${uuid}::${escapeAsk(id)}]]` : `[[:${escapeAsk(id)}]]`))
      .join('OR')

    const results = await this.client.ask(`${conditions}|?${label}=label|?${uuid}=uuid|limit=${wanted.length}`)
    const map = {}

    for (const [title, row] of Object.entries(results)) {
      const resolved = first(row?.printouts?.label) ?? row?.displaytitle ?? title
      map[title] = resolved

      const id = first(row?.printouts?.uuid)
      if (isString(id) && wanted.includes(id)) {
        map[id] = resolved
      }
    }

    return map
  }

  async load (id) {
    if (!this.client.fetch || !this.client.apiUrl) {
      return null
    }

    const url = this.client.withOrigin(`${this.client.apiUrl}?action=query&format=json&prop=revisions&rvprop=content&rvslots=main&titles=${encodeURIComponent(id)}`)
    const response = await this.client.fetch(url, this.client.fetchOptions)

    if (!response || !response.ok) {
      return null
    }

    const pages = (await response.json())?.query?.pages ?? {}
    const page = Object.values(pages)[0]

    if (!page || page.missing !== undefined) {
      return null
    }

    const content = page?.revisions?.[0]?.slots?.main?.['*']

    try {
      return isString(content) ? JSON.parse(content) : null
    } catch (error) {
      return null
    }
  }
}

export class OswClassIndex extends ClassIndex {
  constructor (options = {}) {
    super(options)
    this.client = new AskClient(options)
    this.depth = options.subclassDepth ?? 5
  }

  async getSubclasses (classRef, options = {}) {
    const { subclassOf, label } = this.client.properties
    const depth = options.depth ?? 1
    const query = subclassChainQuery(escapeAsk(classRef), subclassOf, depth, false)
    const results = await this.client.ask(`${query}|?${label}=label|limit=${this.client.limit}`)

    return Object.keys(results)
  }

  async getSuperclasses (classRef) {
    const { subclassOf } = this.client.properties
    const chain = []
    const seen = new Set([classRef])
    let current = classRef

    // Walk up one level at a time. SMW can answer "what is X a subclass of"
    // directly, so no chain query is needed in this direction.
    while (current) {
      const results = await this.client.ask(`[[:${escapeAsk(current)}]]|?${subclassOf}=parent|limit=1`)
      const row = Object.values(results)[0]
      const parent = first(row?.printouts?.parent)

      if (!isString(parent) || seen.has(parent)) {
        break
      }

      seen.add(parent)
      chain.push(parent)
      current = parent
    }

    return chain
  }
}

export function createOswBackend (options = {}) {
  const schemas = new OswSchemaStore(options)
  const instances = new OswInstanceStore(options)
  const classes = new OswClassIndex(options)

  return new Backend({ ...options, name: options.name ?? 'osw', schemas, instances, classes })
}
