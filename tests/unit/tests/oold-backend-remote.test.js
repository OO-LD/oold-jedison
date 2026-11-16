/* global describe it expect */
const Jedison = require('../../../dist/cjs/jedison.cjs')
const { runBackendContract } = require('../helpers/backend-contract.cjs')

const {
  createSparqlBackend,
  createOswBackend,
  escapeLiteral,
  escapeIri,
  fillQuery,
  bindingsToRecords,
  subclassChainQuery,
  escapeAsk,
  WIKIDATA_QUERIES
} = Jedison.oold.backend

const SCHEMA_URI = 'https://example.org/schemas/Organization.schema.json'
const MISSING_URI = 'https://example.org/schemas/NoSuchThing.schema.json'

describe('sparql helpers', () => {
  it('escapes a quote in a literal so the query cannot be broken out of', () => {
    expect(escapeLiteral('a"b')).toBe('a\\"b')
  })

  it('escapes a backslash before anything else', () => {
    expect(escapeLiteral('a\\b')).toBe('a\\\\b')
  })

  it('strips the characters that would close an IRI bracket', () => {
    expect(escapeIri('http://x/a>b c')).toBe('http://x/abc')
  })

  it('fills a literal placeholder with escaping', () => {
    expect(fillQuery('FILTER("{{input}}")', { input: 'a"b' })).toBe('FILTER("a\\"b")')
  })

  it('fills an Iri placeholder with iri escaping', () => {
    expect(fillQuery('<{{classIri}}>', { class: 'http://x/C>' })).toBe('<http://x/C>')
  })

  it('reads bindings into the agreed record shape', () => {
    const records = bindingsToRecords({
      results: {
        bindings: [{ id: { value: 'http://x/1' }, label: { value: 'One' } }]
      }
    })

    expect(records).toHaveLength(1)
    expect(records[0].id).toBe('http://x/1')
    expect(records[0].label).toBe('One')
    expect(records[0].raw).toBeDefined()
  })

  it('returns nothing for a malformed body rather than throwing', () => {
    expect(bindingsToRecords(null)).toEqual([])
    expect(bindingsToRecords({})).toEqual([])
  })

  it('ships wikidata queries using wdt:P279 for subclasses', () => {
    expect(WIKIDATA_QUERIES.subclasses).toContain('wdt:P279')
  })
})

// Shapes taken from a real https://query.wikidata.org/sparql response.
function sparqlFetch () {
  return async (url) => {
    const query = decodeURIComponent(String(url).split('query=')[1] ?? '')

    if (url.startsWith('https://example.org/schemas/')) {
      return url === SCHEMA_URI
        ? { ok: true, status: 200, json: async () => ({ $id: SCHEMA_URI, type: 'object' }) }
        : { ok: false, status: 404, json: async () => null }
    }

    const bindings = []

    if (query.includes('subClassOf+')) {
      // Ancestors: Person extends Thing.
      if (query.includes('http://x/Person')) {
        bindings.push({ id: { value: 'http://x/Thing' }, label: { value: 'Thing' } })
      }
    } else if (query.includes('subClassOf')) {
      // Descendants: Thing is extended by Person.
      if (query.includes('http://x/Thing')) {
        bindings.push({ id: { value: 'http://x/Person' }, label: { value: 'Person' } })
      }
    } else if (query.includes('VALUES')) {
      bindings.push({ id: { value: 'http://x/org-1' }, label: { value: 'Institute of Materials' } })
    } else if (query.includes('CONTAINS')) {
      if (query.toLowerCase().includes('materi')) {
        bindings.push({
          id: { value: 'http://x/org-1' },
          label: { value: 'Institute of Materials' },
          description: { value: 'Materials research institute' }
        })
      }
    }

    return { ok: true, status: 200, json: async () => ({ results: { bindings } }) }
  }
}

runBackendContract('sparql', async () => ({
  backend: createSparqlBackend({
    endpoint: 'https://sparql.example.org/sparql',
    fetch: sparqlFetch(),
    queries: {
      subclasses: 'SELECT ?id WHERE { ?id rdfs:subClassOf <{{classIri}}> }',
      superclasses: 'SELECT ?id WHERE { <{{classIri}}> rdfs:subClassOf+ ?id }'
    }
  }),
  fixture: {
    knownSchemaUri: SCHEMA_URI,
    missingSchemaUri: MISSING_URI,
    searchSpec: { classes: ['http://x/Organization'] },
    searchInput: 'materi',
    expectedId: 'http://x/org-1',
    parentClass: 'http://x/Thing',
    childClass: 'http://x/Person',
    // A SPARQL endpoint is read-only, which is the whole point of the split.
    expectedCapabilities: {
      canSearch: true,
      canLabel: true,
      hasHierarchy: true,
      hasAncestors: true,
      canCreate: false,
      canEdit: false,
      canDelete: false,
      canLoad: false,
      canListClasses: false
    }
  }
}))

describe('osw helpers', () => {
  it('unrolls the subclass chain to the requested depth', () => {
    const query = subclassChainQuery('Category:X', 'SubClassOf', 3, false)

    expect(query).toContain('[[SubClassOf::Category:X]]')
    expect(query).toContain('[[SubClassOf.SubClassOf::Category:X]]')
    expect(query).toContain('[[SubClassOf.SubClassOf.SubClassOf::Category:X]]')
    expect(query).not.toContain('SubClassOf.SubClassOf.SubClassOf.SubClassOf')
  })

  it('includes the class itself only when asked', () => {
    expect(subclassChainQuery('Category:X', 'SubClassOf', 1, true)).toContain('[[:Category:X]]')
    expect(subclassChainQuery('Category:X', 'SubClassOf', 1, false)).not.toContain('[[:Category:X]]')
  })

  it('strips the brackets that would terminate an ask condition', () => {
    expect(escapeAsk('a]]OR[[b')).toBe('a  OR  b')
  })

  it('rewrites a category title into a raw slot url', () => {
    const backend = createOswBackend({ wikiUrl: 'https://wiki.example.org/w', fetch: async () => null })
    const url = backend.schemas.toSlotUrl('Category:OSW123')

    expect(url).toContain('action=raw')
    expect(url).toContain('slot=jsonschema')
    expect(url).toContain('Category%3AOSW123')
  })

  it('omits the origin parameter by default', async () => {
    const seen = []
    const backend = createOswBackend({
      apiUrl: 'https://wiki.example.org/w/api.php',
      fetch: async (url) => { seen.push(url); return { ok: true, status: 200, json: async () => ({}) } }
    })

    await backend.instances.search({ classes: ['Category:Entity'] }, 'a')

    // A site that already sends an Access-Control-Allow-Origin header ends up
    // with two values when MediaWiki adds its own, and browsers reject that.
    expect(seen[0]).not.toContain('origin=')
  })

  it('sends the origin parameter when one is configured', async () => {
    const seen = []
    const backend = createOswBackend({
      apiUrl: 'https://wiki.example.org/w/api.php',
      originParam: '*',
      fetch: async (url) => { seen.push(url); return { ok: true, status: 200, json: async () => ({}) } }
    })

    await backend.instances.search({ classes: ['Category:Entity'] }, 'a')

    expect(seen[0]).toContain('origin=*')
  })

  it('leaves an absolute url alone', () => {
    const backend = createOswBackend({ wikiUrl: 'https://wiki.example.org/w', fetch: async () => null })
    expect(backend.schemas.toSlotUrl(SCHEMA_URI)).toBe(SCHEMA_URI)
  })
})

// Shapes taken from a real demo.open-semantic-lab.org action=ask response.
function oswFetch () {
  const row = (title, label, extra = {}) => [title, {
    printouts: { label: [label], description: [], image: [], type: [], ...extra },
    fulltext: title,
    displaytitle: label
  }]

  return async (url) => {
    if (String(url).startsWith('https://example.org/schemas/')) {
      return url === SCHEMA_URI
        ? { ok: true, status: 200, json: async () => ({ $id: SCHEMA_URI, type: 'object' }) }
        : { ok: false, status: 404, json: async () => null }
    }

    // load() goes through the page API, not through ask.
    if (String(url).includes('action=query')) {
      const known = String(url).includes(encodeURIComponent('Item:org-1'))
      const content = JSON.stringify({ id: 'Item:org-1', label: 'Institute of Materials' })

      return {
        ok: true,
        status: 200,
        json: async () => ({
          query: {
            pages: known
              ? { 1: { revisions: [{ slots: { main: { '*': content } } }] } }
              : { '-1': { missing: '' } }
          }
        })
      }
    }

    const query = decodeURIComponent(String(url).split('query=')[1] ?? '')
    const results = {}

    if (query.includes('SubClassOf::Category:Thing')) {
      Object.assign(results, Object.fromEntries([row('Category:Person', 'Person')]))
    } else if (query.includes('SubClassOf=parent')) {
      if (query.includes('Category:Person')) {
        Object.assign(results, Object.fromEntries([
          row('Category:Person', 'Person', { parent: [{ fulltext: 'Category:Thing' }] })
        ]))
      }
    } else if (query.includes('HasUuid=uuid') || query.includes('[[:Item:org-1]]')) {
      Object.assign(results, Object.fromEntries([row('Item:org-1', 'Institute of Materials')]))
    } else if (query.includes('like:*materi*')) {
      Object.assign(results, Object.fromEntries([
        row('Item:org-1', 'Institute of Materials', { description: ['Materials research institute'] })
      ]))
    }

    return { ok: true, status: 200, json: async () => ({ query: { results } }) }
  }
}

runBackendContract('osw', async () => ({
  backend: createOswBackend({
    apiUrl: 'https://wiki.example.org/w/api.php',
    wikiUrl: 'https://wiki.example.org/w',
    fetch: oswFetch()
  }),
  fixture: {
    knownSchemaUri: SCHEMA_URI,
    missingSchemaUri: MISSING_URI,
    searchSpec: { classes: ['Category:Organization'] },
    searchInput: 'materi',
    expectedId: 'Item:org-1',
    parentClass: 'Category:Thing',
    childClass: 'Category:Person',
    expectedCapabilities: {
      canSearch: true,
      canLabel: true,
      canLoad: true,
      hasHierarchy: true,
      hasAncestors: true,
      // Writing needs a login and an edit token, which this adapter does not
      // yet carry, so it declares itself read-only rather than failing on save.
      canCreate: false,
      canEdit: false,
      canDelete: false
    }
  }
}))
