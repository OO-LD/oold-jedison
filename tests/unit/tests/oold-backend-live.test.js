/* global describe it expect */
const Jedison = require('../../../dist/cjs/jedison.cjs')

const { createSparqlBackend, createOswBackend, WIKIDATA_QUERIES } = Jedison.oold.backend

/**
 * Hits the public endpoints the specification names.
 *
 * Opt-in, because a suite that fails when a third-party service is slow stops
 * being evidence about this code. Run with OOLD_LIVE=1.
 *
 * The value is that a mocked adapter only proves it matches the fixture the
 * same author wrote. These assert the fixtures were not wishful.
 */
const live = process.env.OOLD_LIVE === '1' ? describe : describe.skip
const TIMEOUT = 45000

const USER_AGENT = 'oold-jedison/1.0 (https://github.com/OO-LD/oold-jedison)'

live('wikidata sparql', () => {
  const backend = () => createSparqlBackend({
    endpoint: 'https://query.wikidata.org/sparql',
    queries: WIKIDATA_QUERIES,
    fetchOptions: { headers: { 'user-agent': USER_AGENT, 'api-user-agent': USER_AGENT } },
    limit: 5
  })

  it('reports itself read-only', () => {
    const capabilities = backend().capabilities

    expect(capabilities.canSearch).toBe(true)
    expect(capabilities.hasHierarchy).toBe(true)
    expect(capabilities.canCreate).toBe(false)
  })

  it('walks subclasses of chemical element through wdt:P279', async () => {
    // Q11344 is "chemical element".
    const children = await backend().classes.getSubclasses('http://www.wikidata.org/entity/Q11344')

    expect(Array.isArray(children)).toBe(true)
    expect(children.length).toBeGreaterThan(0)
    expect(children.every((id) => id.startsWith('http://www.wikidata.org/entity/'))).toBe(true)
  }, TIMEOUT)

  it('resolves a label for a known entity', async () => {
    // Q670 is silicon. Not every entity carries an English rdfs:label in the
    // query service graph, so the fixture is one that demonstrably does.
    const labels = await backend().instances.getLabels(['http://www.wikidata.org/entity/Q670'])

    expect(labels['http://www.wikidata.org/entity/Q670']).toBe('silicon')
  }, TIMEOUT)

  it('returns nothing for an entity that does not exist, without throwing', async () => {
    const labels = await backend().instances.getLabels(['http://www.wikidata.org/entity/Q00000000'])

    expect(labels['http://www.wikidata.org/entity/Q00000000']).toBeUndefined()
  }, TIMEOUT)
})

live('open semantic lab demo', () => {
  const backend = () => createOswBackend({
    apiUrl: 'https://demo.open-semantic-lab.org/w/api.php',
    wikiUrl: 'https://demo.open-semantic-lab.org/w',
    limit: 5
  })

  it('searches instances through action=ask', async () => {
    const results = await backend().instances.search({ classes: ['Category:Entity'] }, '')

    expect(Array.isArray(results)).toBe(true)
    expect(results.length).toBeGreaterThan(0)

    for (const record of results) {
      expect(typeof record.id).toBe('string')
      expect('label' in record).toBe(true)
    }
  }, TIMEOUT)

  it('returns an empty result for a term that matches nothing', async () => {
    const results = await backend().instances.search({ classes: ['Category:Entity'] }, 'zzqqxx-no-such-label')

    expect(results).toEqual([])
  }, TIMEOUT)

  it('retrieves a class schema from the jsonschema slot', async () => {
    const response = await backend().schemas.resolve('Category:Entity')

    expect(response.ok).toBe(true)

    const schema = await response.json()
    expect(schema).toBeDefined()
    expect(typeof schema).toBe('object')
  }, TIMEOUT)
})
