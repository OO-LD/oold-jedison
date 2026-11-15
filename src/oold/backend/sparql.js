import { isArray, isString } from '../../helpers/utils.js'
import { SchemaStore, InstanceStore, ClassIndex } from './interfaces.js'
import { Backend } from './backend.js'

const RESULTS_ACCEPT = 'application/sparql-results+json'

/**
 * Escapes a string for a SPARQL literal.
 *
 * User input reaches these queries, so it is escaped rather than concatenated.
 */
export function escapeLiteral (value) {
  return String(value ?? '')
    .replace(/\\/g, '\\\\')
    .replace(/"/g, '\\"')
    .replace(/\n/g, '\\n')
    .replace(/\r/g, '\\r')
    .replace(/\t/g, '\\t')
}

/**
 * Escapes an IRI for angle-bracket form, rejecting the characters that would
 * close the bracket early.
 */
export function escapeIri (value) {
  return String(value ?? '').replace(/[<>"{}|^`\\\s]/g, '')
}

export function fillQuery (template, values) {
  if (!isString(template)) {
    return ''
  }

  return template.replace(/\{\{(\w+)\}\}/g, (match, key) => {
    if (key.endsWith('Iri')) {
      return escapeIri(values[key.slice(0, -3)] ?? values[key])
    }
    return escapeLiteral(values[key])
  })
}

/**
 * Turns SPARQL JSON results into the agreed record shape.
 *
 * Variable names are the mapping: ?id, ?label, ?description, ?image, ?type.
 */
export function bindingsToRecords (body, mapping = {}) {
  const names = {
    id: 'id',
    label: 'label',
    description: 'description',
    image: 'image',
    type: 'type',
    ...mapping
  }

  const bindings = body?.results?.bindings

  if (!isArray(bindings)) {
    return []
  }

  return bindings.map((binding) => {
    const record = { raw: binding }

    for (const [field, variable] of Object.entries(names)) {
      record[field] = binding[variable]?.value
    }

    return record
  })
}

const DEFAULT_QUERIES = {
  search: `SELECT ?id ?label ?description WHERE {
  ?id rdfs:label ?label .
  OPTIONAL { ?id rdfs:comment ?description }
  FILTER(CONTAINS(LCASE(STR(?label)), LCASE("{{input}}")))
} LIMIT {{limit}}`,
  labels: `SELECT ?id ?label WHERE {
  VALUES ?id { {{idList}} }
  ?id rdfs:label ?label .
}`,
  subclasses: `SELECT ?id ?label WHERE {
  ?id rdfs:subClassOf <{{classIri}}> .
  OPTIONAL { ?id rdfs:label ?label }
}`,
  superclasses: `SELECT ?id ?label WHERE {
  <{{classIri}}> rdfs:subClassOf+ ?id .
  OPTIONAL { ?id rdfs:label ?label }
}`
}

/**
 * Wikidata names its own predicates, so it needs its own queries.
 * Verified against https://query.wikidata.org/sparql, which allows CORS.
 */
export const WIKIDATA_QUERIES = {
  search: `SELECT ?id ?label ?description WHERE {
  ?id rdfs:label ?label .
  FILTER(LANG(?label) = "{{lang}}")
  FILTER(CONTAINS(LCASE(?label), LCASE("{{input}}")))
  OPTIONAL { ?id schema:description ?description FILTER(LANG(?description) = "{{lang}}") }
  ?id wdt:P31 <{{classIri}}> .
} LIMIT {{limit}}`,
  labels: `SELECT ?id ?label WHERE {
  VALUES ?id { {{idList}} }
  ?id rdfs:label ?label .
  FILTER(LANG(?label) = "{{lang}}")
}`,
  subclasses: `SELECT ?id ?label WHERE {
  ?id wdt:P279 <{{classIri}}> .
  OPTIONAL { ?id rdfs:label ?label FILTER(LANG(?label) = "{{lang}}") }
} LIMIT {{limit}}`,
  superclasses: `SELECT ?id ?label WHERE {
  <{{classIri}}> wdt:P279+ ?id .
  OPTIONAL { ?id rdfs:label ?label FILTER(LANG(?label) = "{{lang}}") }
} LIMIT {{limit}}`
}

class SparqlClient {
  constructor (options = {}) {
    this.endpoint = options.endpoint
    this.fetch = options.fetch ?? (typeof fetch === 'function' ? fetch.bind(globalThis) : undefined)
    this.fetchOptions = options.fetchOptions ?? {}
    this.queries = { ...DEFAULT_QUERIES, ...(options.queries ?? {}) }
    this.mapping = options.mapping ?? {}
    this.language = options.language ?? 'en'
    this.limit = options.limit ?? 25
  }

  async select (name, values) {
    const query = fillQuery(this.queries[name], {
      lang: this.language,
      limit: this.limit,
      ...values
    })

    if (!this.fetch || !this.endpoint || query === '') {
      return []
    }

    const url = `${this.endpoint}?query=${encodeURIComponent(query)}`
    const response = await this.fetch(url, {
      ...this.fetchOptions,
      headers: { accept: RESULTS_ACCEPT, ...(this.fetchOptions.headers ?? {}) }
    })

    if (!response || !response.ok) {
      return []
    }

    return bindingsToRecords(await response.json(), this.mapping)
  }
}

export class SparqlInstanceStore extends InstanceStore {
  constructor (options = {}) {
    super(options)
    this.client = new SparqlClient(options)
  }

  async search (spec, userInput = '', formValue = undefined, language = undefined) {
    return this.client.select('search', {
      input: userInput,
      class: isArray(spec?.classes) ? spec.classes[0] : '',
      lang: language ?? this.language,
      limit: spec?.limit ?? this.client.limit
    })
  }

  async getLabels (ids, language) {
    const wanted = (isArray(ids) ? ids : []).filter(isString)

    if (!wanted.length) {
      return {}
    }

    const idList = wanted.map((id) => `<${escapeIri(id)}>`).join(' ')
    const records = await this.client.select('labels', { idList, lang: language ?? this.language })
    const map = {}

    for (const record of records) {
      if (isString(record.id)) {
        map[record.id] = record.label
      }
    }

    return map
  }
}

export class SparqlClassIndex extends ClassIndex {
  constructor (options = {}) {
    super(options)
    this.client = new SparqlClient(options)
  }

  async getSubclasses (classRef) {
    const records = await this.client.select('subclasses', { class: classRef })
    return records.map((record) => record.id).filter(isString)
  }

  async getSuperclasses (classRef) {
    const records = await this.client.select('superclasses', { class: classRef })
    return records.map((record) => record.id).filter(isString)
  }
}

/**
 * A read-only backend over a SPARQL endpoint.
 *
 * There is no save, which is the point of the three-interface split: nothing
 * here stubs out a write it cannot perform, and the capability record says so.
 */
export function createSparqlBackend (options = {}) {
  const schemas = new SchemaStore(options)
  const instances = new SparqlInstanceStore(options)
  const classes = new SparqlClassIndex(options)

  return new Backend({ ...options, name: options.name ?? 'sparql', schemas, instances, classes })
}
