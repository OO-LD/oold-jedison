/* global describe it expect */
const fs = require('fs')
const path = require('path')
const Jedison = require('../../../dist/cjs/jedison.cjs')
const { RefParser } = Jedison
const { preprocess, rebase, OoldRefResolver } = Jedison.oold

const FIXTURES = path.join(__dirname, '..', 'fixtures', 'oold')
const BASE = 'https://oo-ld.org/latest/schemas/'

const load = (name) => JSON.parse(fs.readFileSync(path.join(FIXTURES, `${name}.schema.json`), 'utf8'))

// Stands in for a SchemaStore: resolves an absolute schema URL back to a fixture.
const fixtureFetch = async (uri) => {
  const name = uri.split('/').pop()
  const file = path.join(FIXTURES, name)

  if (!fs.existsSync(file)) {
    return { ok: false, status: 404, json: async () => null }
  }

  return { ok: true, status: 200, json: async () => JSON.parse(fs.readFileSync(file, 'utf8')) }
}

describe('rebase', () => {
  it('makes a relative $id absolute against the retrieval base', () => {
    expect(rebase(load('Person'), BASE).$id).toBe(`${BASE}Person.schema.json`)
  })

  it('leaves an already absolute $id alone', () => {
    const schema = { $id: 'https://example.org/a/Thing.schema.json' }
    expect(rebase(schema, BASE).$id).toBe('https://example.org/a/Thing.schema.json')
  })

  it('returns the schema untouched without a base', () => {
    const schema = load('Person')
    expect(rebase(schema, '')).toEqual(schema)
  })
})

describe('upstream RefParser against OO-LD documents', () => {
  it('resolves a relative $ref once $id is absolute', async () => {
    const schema = rebase(load('Person'), BASE)
    const refParser = new RefParser({ fetch: fixtureFetch })

    await refParser.dereference(schema)
    const expanded = refParser.expand(schema.allOf[0])

    // Thing supplies these, Person does not.
    expect(expanded.properties).toBeDefined()
    expect(Object.keys(expanded.properties).length).toBeGreaterThan(0)
  })

  it('throws on a relative $ref while $id is relative, which is why rebase exists', async () => {
    const schema = load('Person')
    const refParser = new RefParser({ fetch: fixtureFetch })

    await refParser.dereference(schema)

    // dereference only warns ("Missing refs"), expand is where it fails.
    expect(() => refParser.expand(schema.allOf[0])).toThrow(TypeError)
  })

  it('feeds a resolved document through preprocess into one merged schema', async () => {
    const schema = rebase(load('Person'), BASE)
    const refParser = new RefParser({ fetch: fixtureFetch })

    await refParser.dereference(schema)

    const resolved = { ...schema, allOf: [refParser.expand(schema.allOf[0])] }
    const { schema: form, collected } = preprocess(resolved)

    // works_for is Person's own, the rest are inherited from Thing.
    expect(form.properties.works_for).toBeDefined()
    expect(Object.keys(form.properties).length).toBeGreaterThan(1)
    expect(form['@context']).toBeUndefined()
    expect(collected.instanceRdfTypes).toEqual(['schema:Person'])
  })
})

describe('OoldRefResolver', () => {
  const loader = async (ref) => {
    const file = path.join(FIXTURES, ref)
    return fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : null
  }

  it('expands an x-oold-ref that a $ref resolver would ignore', async () => {
    const resolver = new OoldRefResolver(loader)
    const result = await resolver.expand({
      allOf: [{ 'x-oold-ref': 'Organization.schema.json' }]
    })

    expect(result.allOf[0].title ?? result.allOf[0].properties).toBeDefined()
    expect(result.allOf[0]['x-oold-ref-unresolved']).toBeUndefined()
  })

  it('lets local keywords win over the referenced target', async () => {
    const resolver = new OoldRefResolver(loader)
    const result = await resolver.expand({
      'x-oold-ref': 'Organization.schema.json',
      title: 'Local'
    })

    expect(result.title).toBe('Local')
  })

  it('marks a reference it cannot load rather than throwing', async () => {
    const resolver = new OoldRefResolver(loader)
    const result = await resolver.expand({ 'x-oold-ref': 'Missing.schema.json' })

    expect(result['x-oold-ref-unresolved']).toBe(true)
  })

  it('terminates on a cycle instead of recursing', async () => {
    const cyclic = async () => ({ 'x-oold-ref': 'self', title: 'Cyclic' })
    const resolver = new OoldRefResolver(cyclic)
    const result = await resolver.expand({ 'x-oold-ref': 'self' })

    expect(result).toBeDefined()
    expect(JSON.stringify(result)).toContain('x-oold-ref-cut')
  })

  it('loads a repeated target once', async () => {
    let calls = 0
    const counting = async (ref) => {
      calls++
      return { title: ref }
    }
    const resolver = new OoldRefResolver(counting)

    await resolver.expand({
      allOf: [{ 'x-oold-ref': 'Same.schema.json' }, { 'x-oold-ref': 'Same.schema.json' }]
    })

    expect(calls).toBe(1)
  })
})
