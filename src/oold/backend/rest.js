import { isObject, isArray, isString } from '../../helpers/utils.js'
import { SchemaStore, InstanceStore, ClassIndex } from './interfaces.js'
import { Backend } from './backend.js'

/**
 * Expands {placeholders} in a URL template, percent-encoding each value.
 */
export function expandTemplate (template, values) {
  if (!isString(template)) {
    return ''
  }

  return template.replace(/\{([^}]+)\}/g, (match, key) => {
    const value = values[key]
    return value === undefined || value === null ? '' : encodeURIComponent(String(value))
  })
}

/**
 * Reads a dotted path out of a value, with [] meaning "every element".
 *
 * A deliberately small subset of JSONPath. A response shape that needs more
 * than this is better served by a `map` function than by a longer expression
 * language nobody can debug.
 */
export function readPath (value, path) {
  if (!isString(path) || path === '') {
    return value
  }

  let current = [value]

  for (const segment of path.replace(/^\$\.?/, '').split('.')) {
    if (segment === '') {
      continue
    }

    const next = []
    const isEach = segment.endsWith('[]')
    const key = isEach ? segment.slice(0, -2) : segment

    for (const entry of current) {
      const picked = key === '' ? entry : (isObject(entry) || isArray(entry) ? entry[key] : undefined)

      if (isEach && isArray(picked)) {
        next.push(...picked)
      } else if (picked !== undefined) {
        next.push(picked)
      }
    }

    current = next
  }

  return current.length <= 1 ? current[0] : current
}

const DEFAULT_MAPPING = {
  id: 'id',
  label: 'label',
  description: 'description',
  image: 'image',
  type: 'type'
}

function mapRecord (raw, mapping) {
  const result = { raw }

  for (const [field, path] of Object.entries({ ...DEFAULT_MAPPING, ...mapping })) {
    result[field] = readPath(raw, path)
  }

  return result
}

export class RestSchemaStore extends SchemaStore {
  constructor (options = {}) {
    super(options)
    this.schemaTemplate = options.schemaTemplate
    this.classListUrl = options.classListUrl
    this.classListPath = options.classListPath ?? 'schemas[]'
  }

  async resolve (uri) {
    const target = this.schemaTemplate
      ? expandTemplate(this.schemaTemplate, { uri, id: uri })
      : uri

    return super.resolve(target)
  }

  async listClasses () {
    if (!this.classListUrl) {
      return []
    }

    const response = await super.resolve(this.classListUrl)

    if (!response || !response.ok) {
      return []
    }

    const body = await response.json()
    const listed = readPath(body, this.classListPath)

    return isArray(listed) ? listed : [listed].filter(Boolean)
  }
}

export class RestInstanceStore extends InstanceStore {
  constructor (options = {}) {
    super(options)
    this.fetch = options.fetch ?? (typeof fetch === 'function' ? fetch.bind(globalThis) : undefined)
    this.fetchOptions = options.fetchOptions ?? {}
    this.searchTemplate = options.searchTemplate
    this.labelsTemplate = options.labelsTemplate
    this.loadTemplate = options.loadTemplate
    this.saveUrl = options.saveUrl
    this.reverseTemplate = options.reverseTemplate
    this.resultsPath = options.resultsPath ?? ''
    this.mapping = options.mapping ?? {}
  }

  async request (url, init) {
    if (!this.fetch || !url) {
      return null
    }

    const response = await this.fetch(url, { ...this.fetchOptions, ...init })

    return response && response.ok ? response.json() : null
  }

  async search (spec, userInput = '', formValue = undefined, language = undefined) {
    const url = expandTemplate(this.searchTemplate, {
      input: userInput,
      lang: language ?? this.language,
      limit: spec?.limit ?? 25,
      class: isArray(spec?.classes) ? spec.classes[0] : '',
      classes: isArray(spec?.classes) ? spec.classes.join(',') : ''
    })

    const body = await this.request(url)

    if (body === null) {
      return []
    }

    const rows = readPath(body, this.resultsPath)

    return (isArray(rows) ? rows : [rows].filter(Boolean)).map((row) => mapRecord(row, this.mapping))
  }

  async getLabels (ids, language) {
    const wanted = isArray(ids) ? ids : []

    if (!wanted.length) {
      return {}
    }

    const url = expandTemplate(this.labelsTemplate, {
      ids: wanted.join(','),
      lang: language ?? this.language
    })

    const body = await this.request(url)

    if (body === null) {
      return {}
    }

    const rows = readPath(body, this.resultsPath)
    const map = {}

    for (const row of isArray(rows) ? rows : [rows].filter(Boolean)) {
      const record = mapRecord(row, this.mapping)
      if (isString(record.id)) {
        map[record.id] = record.label
      }
    }

    return map
  }

  async load (id) {
    return this.request(expandTemplate(this.loadTemplate, { id }))
  }

  async save (entity) {
    if (!this.saveUrl) {
      return null
    }

    const saved = await this.request(this.saveUrl, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...(this.fetchOptions.headers ?? {}) },
      body: JSON.stringify(entity)
    })

    return saved ?? null
  }

  async getReverse (property, subjectId) {
    const body = await this.request(expandTemplate(this.reverseTemplate, { property, id: subjectId }))

    if (body === null) {
      return []
    }

    const rows = readPath(body, this.resultsPath)

    return (isArray(rows) ? rows : [rows].filter(Boolean))
      .map((row) => mapRecord(row, this.mapping).id)
      .filter(isString)
  }
}

export class RestClassIndex extends ClassIndex {
  constructor (options = {}) {
    super(options)
    this.fetch = options.fetch ?? (typeof fetch === 'function' ? fetch.bind(globalThis) : undefined)
    this.fetchOptions = options.fetchOptions ?? {}
    this.subclassTemplate = options.subclassTemplate
    this.superclassTemplate = options.superclassTemplate
    this.resultsPath = options.resultsPath ?? ''
    this.mapping = options.mapping ?? {}
  }

  async list (template, values) {
    const url = expandTemplate(template, values)

    if (!this.fetch || !url) {
      return []
    }

    const response = await this.fetch(url, this.fetchOptions)

    if (!response || !response.ok) {
      return []
    }

    const rows = readPath(await response.json(), this.resultsPath)

    return (isArray(rows) ? rows : [rows].filter(Boolean))
      .map((row) => mapRecord(row, this.mapping).id)
      .filter(isString)
  }

  async getSubclasses (classRef, options = {}) {
    return this.list(this.subclassTemplate, { class: classRef, depth: options.depth ?? 1 })
  }

  async getSuperclasses (classRef) {
    return this.list(this.superclassTemplate, { class: classRef })
  }
}

/**
 * A backend over an arbitrary HTTP JSON API, configured by URL templates and a
 * field mapping rather than by code.
 *
 * Only the templates that are supplied become capabilities, so a read-only API
 * is configured by leaving `saveUrl` unset rather than by stubbing a method.
 */
export function createRestBackend (options = {}) {
  const schemas = new RestSchemaStore(options)
  const instances = new RestInstanceStore(options)
  const classes = new RestClassIndex(options)

  const capabilities = {
    canSearch: Boolean(options.searchTemplate),
    canLabel: Boolean(options.labelsTemplate),
    canLoad: Boolean(options.loadTemplate),
    canCreate: Boolean(options.saveUrl),
    canEdit: Boolean(options.saveUrl && options.loadTemplate),
    canReverse: Boolean(options.reverseTemplate),
    hasHierarchy: Boolean(options.subclassTemplate),
    hasAncestors: Boolean(options.superclassTemplate),
    canListClasses: Boolean(options.classListUrl),
    ...(options.capabilities ?? {})
  }

  return new Backend({ ...options, name: options.name ?? 'rest', schemas, instances, classes, capabilities })
}
