/* global describe it expect */
const fs = require('fs')
const path = require('path')
const Jedison = require('../../../dist/cjs/jedison.cjs')
const { runBackendContract } = require('../helpers/backend-contract.cjs')

const { createStaticBackend, createRestBackend, Backend, readPath, expandTemplate } = Jedison.oold.backend

const FIXTURES = path.join(__dirname, '..', 'fixtures', 'oold')
const BASE = 'https://oo-ld.org/latest/schemas/'

const schemas = {}
for (const file of fs.readdirSync(FIXTURES).filter((name) => name.endsWith('.schema.json'))) {
  schemas[BASE + file] = JSON.parse(fs.readFileSync(path.join(FIXTURES, file), 'utf8'))
}

const ORGANIZATION = `${BASE}Organization.schema.json`
const PERSON = `${BASE}Person.schema.json`
const THING = `${BASE}Thing.schema.json`
const RESEARCHER = `${BASE}Researcher.schema.json`

const instances = () => [
  {
    id: 'urn:oold:org-1',
    label: 'Institute of Materials',
    description: 'Materials research institute',
    image: 'https://example.org/isc.png',
    type: ORGANIZATION
  },
  { id: 'urn:oold:org-2', label: 'A Much Longer Organization Name', type: ORGANIZATION },
  { id: 'urn:oold:person-1', label: 'Ada Lovelace', type: PERSON, works_for: 'urn:oold:org-1' }
]

const fixture = {
  knownSchemaUri: PERSON,
  missingSchemaUri: `${BASE}NoSuchThing.schema.json`,
  searchSpec: { classes: [ORGANIZATION] },
  foreignRangeSpec: { classes: [PERSON] },
  searchInput: 'materi',
  expectedId: 'urn:oold:org-1',
  newInstance: { label: 'New Organization', type: ORGANIZATION },
  rootClass: THING,
  parentClass: THING,
  childClass: PERSON,
  leafClass: RESEARCHER
}

runBackendContract('static', async () => ({
  backend: createStaticBackend({ baseUri: BASE, schemas, instances: instances() }),
  fixture: {
    ...fixture,
    expectedCapabilities: {
      canSearch: true,
      canLabel: true,
      canLoad: true,
      canCreate: true,
      canEdit: true,
      canDelete: true,
      canReverse: true,
      hasHierarchy: true,
      hasAncestors: true,
      hasMetaclasses: true,
      canListClasses: true
    }
  }
}))

// Mirrors the same world over HTTP, so the two adapters are held to one standard.
function restFetch (records) {
  return async (url) => {
    const parsed = new URL(url, 'https://api.example.org')
    const query = parsed.searchParams

    if (url.startsWith(BASE)) {
      const schema = schemas[url]
      return schema
        ? { ok: true, status: 200, json: async () => schema }
        : { ok: false, status: 404, json: async () => null }
    }

    if (parsed.pathname === '/search') {
      const needle = (query.get('q') ?? '').toLowerCase()
      const wanted = (query.get('class') ?? '')
      const rows = records.filter((record) => {
        const matchesClass = !wanted || record.type === wanted
        const matchesText = !needle || record.label.toLowerCase().includes(needle)
        return matchesClass && matchesText
      })
      return { ok: true, status: 200, json: async () => ({ results: rows }) }
    }

    if (parsed.pathname === '/labels') {
      const ids = (query.get('ids') ?? '').split(',').filter(Boolean)
      const rows = records.filter((record) => ids.includes(record.id))
      return { ok: true, status: 200, json: async () => ({ results: rows }) }
    }

    if (parsed.pathname.startsWith('/instance/')) {
      const id = decodeURIComponent(parsed.pathname.replace('/instance/', ''))
      const record = records.find((entry) => entry.id === id)
      return record
        ? { ok: true, status: 200, json: async () => record }
        : { ok: false, status: 404, json: async () => null }
    }

    if (parsed.pathname === '/subclasses') {
      const wanted = query.get('class')
      const rows = Object.entries(schemas)
        .filter(([, schema]) => (schema.allOf ?? []).some((branch) => branch.$ref && new URL(branch.$ref, BASE).href === wanted))
        .map(([uri]) => ({ id: uri }))
      return { ok: true, status: 200, json: async () => ({ results: rows }) }
    }

    return { ok: false, status: 404, json: async () => null }
  }
}

runBackendContract('rest', async () => {
  const records = instances()

  return {
    backend: createRestBackend({
      baseUri: BASE,
      fetch: restFetch(records),
      searchTemplate: 'https://api.example.org/search?q={input}&class={class}&limit={limit}',
      labelsTemplate: 'https://api.example.org/labels?ids={ids}&lang={lang}',
      loadTemplate: 'https://api.example.org/instance/{id}',
      subclassTemplate: 'https://api.example.org/subclasses?class={class}',
      resultsPath: 'results[]'
    }),
    fixture: {
      ...fixture,
      // No saveUrl and no superclassTemplate, so this adapter is deliberately
      // partial: it must pass the subset it claims and nothing more.
      expectedCapabilities: {
        canSearch: true,
        canLabel: true,
        canLoad: true,
        hasHierarchy: true,
        canCreate: false,
        canEdit: false,
        canDelete: false,
        hasAncestors: false,
        canListClasses: false
      }
    }
  }
})

describe('capability derivation', () => {
  it('reports nothing supported for a bare backend', () => {
    const bare = new Backend()
    const capabilities = bare.capabilities

    expect(capabilities.canSearch).toBe(false)
    expect(capabilities.canCreate).toBe(false)
    expect(capabilities.hasHierarchy).toBe(false)
  })

  it('does not let an override claim a capability the adapter lacks', () => {
    const bare = new Backend({ capabilities: { canCreate: true } })
    expect(bare.capabilities.canCreate).toBe(false)
  })

  it('lets an override withdraw a capability the adapter has', () => {
    const backend = createStaticBackend({ baseUri: BASE, schemas, instances: instances() })
    expect(backend.capabilities.canCreate).toBe(true)

    const readOnly = createStaticBackend({
      baseUri: BASE,
      schemas,
      instances: instances(),
      capabilities: { canCreate: false, canDelete: false }
    })

    expect(readOnly.capabilities.canCreate).toBe(false)
    expect(readOnly.capabilities.canDelete).toBe(false)
    expect(readOnly.capabilities.canSearch).toBe(true)
  })

  it('reports the rest adapter read-only when no save url is configured', () => {
    const backend = createRestBackend({
      fetch: restFetch(instances()),
      searchTemplate: 'https://api.example.org/search?q={input}'
    })

    expect(backend.capabilities.canSearch).toBe(true)
    expect(backend.capabilities.canCreate).toBe(false)
    expect(backend.capabilities.canEdit).toBe(false)
  })
})

describe('static hierarchy', () => {
  const backend = () => createStaticBackend({ baseUri: BASE, schemas, instances: instances() })

  it('finds every direct subclass of Thing', async () => {
    const children = await backend().classes.getSubclasses(THING)
    expect(children.sort()).toEqual([ORGANIZATION, PERSON].sort())
  })

  it('does not report a grandchild as a direct subclass', async () => {
    expect(await backend().classes.getSubclasses(THING)).not.toContain(RESEARCHER)
  })

  it('reaches a grandchild when asked for depth', async () => {
    const children = await backend().classes.getSubclasses(THING, { depth: 2 })
    expect(children).toContain(RESEARCHER)
  })

  it('walks the full ancestor chain', async () => {
    const ancestors = await backend().classes.getSuperclasses(RESEARCHER)
    expect(ancestors).toEqual([PERSON, THING])
  })

  it('reads the metaclass off the instance rdf type', async () => {
    expect(await backend().classes.getMetaclasses(PERSON)).toEqual(['schema:Person'])
  })
})

describe('static instances', () => {
  const backend = () => createStaticBackend({ baseUri: BASE, schemas, instances: instances() })

  it('ranks the shorter label first', async () => {
    const results = await backend().instances.search({ classes: [ORGANIZATION] }, '')
    expect(results[0].id).toBe('urn:oold:org-1')
  })

  it('carries description and image through search', async () => {
    const [first] = await backend().instances.search({ classes: [ORGANIZATION] }, 'materi')
    expect(first.description).toBe('Materials research institute')
    expect(first.image).toBe('https://example.org/isc.png')
  })

  it('searches every class when the range states none', async () => {
    const results = await backend().instances.search({}, 'ada')
    expect(results.map((entry) => entry.id)).toContain('urn:oold:person-1')
  })

  it('finds what refers to a subject', async () => {
    expect(await backend().instances.getReverse('works_for', 'urn:oold:org-1')).toEqual(['urn:oold:person-1'])
  })

  it('keeps an identifier the caller supplied', async () => {
    const store = backend().instances
    const saved = await store.save({ id: 'urn:oold:chosen', label: 'Chosen' })
    expect(saved.id).toBe('urn:oold:chosen')
  })
})

describe('rest helpers', () => {
  it('percent-encodes template values', () => {
    expect(expandTemplate('/s?q={input}', { input: 'a b&c' })).toBe('/s?q=a%20b%26c')
  })

  it('empties a placeholder with no value', () => {
    expect(expandTemplate('/s?q={input}', {})).toBe('/s?q=')
  })

  it('reads a dotted path', () => {
    expect(readPath({ a: { b: 'c' } }, 'a.b')).toBe('c')
  })

  it('reads every element of an array', () => {
    expect(readPath({ rows: [{ id: 1 }, { id: 2 }] }, 'rows[].id')).toEqual([1, 2])
  })

  it('tolerates a leading $', () => {
    expect(readPath({ a: 1 }, '$.a')).toBe(1)
  })

  it('returns the whole value for an empty path', () => {
    expect(readPath({ a: 1 }, '')).toEqual({ a: 1 })
  })

  it('returns undefined for a path that does not exist', () => {
    expect(readPath({ a: 1 }, 'b.c')).toBeUndefined()
  })
})
