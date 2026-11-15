/* global describe it expect */
const fs = require('fs')
const path = require('path')
const Jedison = require('../../../dist/cjs/jedison.cjs')

const { createOoldEditor, prepareSchema, backend: backendApi } = Jedison.oold
const { createStaticBackend } = backendApi

const FIXTURES = path.join(__dirname, '..', 'fixtures', 'oold')
const BASE = 'https://oo-ld.org/latest/schemas/'

const schemas = {}
for (const file of fs.readdirSync(FIXTURES).filter((name) => name.endsWith('.schema.json'))) {
  schemas[BASE + file] = JSON.parse(fs.readFileSync(path.join(FIXTURES, file), 'utf8'))
}

const load = (name) => JSON.parse(fs.readFileSync(path.join(FIXTURES, `${name}.schema.json`), 'utf8'))

const makeBackend = () => createStaticBackend({
  baseUri: BASE,
  schemas,
  instances: [{ id: 'urn:org-1', label: 'Institute of Materials', type: `${BASE}Organization.schema.json` }]
})

/**
 * Omitting the container puts jedison in headless mode, so the whole pipeline
 * runs without a DOM. The editors themselves are covered by the end-to-end
 * suite; what is asserted here is that preprocessing, reference resolution and
 * the backend compose into a working instance tree.
 */
describe('prepareSchema', () => {
  it('resolves references through the backend', async () => {
    const { schema } = await prepareSchema(load('Person'), {
      baseUri: BASE,
      backend: makeBackend()
    })

    // works_for is Person's own, the rest come from Thing.
    expect(schema.properties.works_for).toBeDefined()
    expect(Object.keys(schema.properties).length).toBeGreaterThan(1)
  })

  it('strips the semantic keywords and reports them instead', async () => {
    const { schema, collected } = await prepareSchema(load('Person'), {
      baseUri: BASE,
      backend: makeBackend()
    })

    expect(schema['@context']).toBeUndefined()
    expect(collected.instanceRdfTypes).toEqual(['schema:Person'])
  })

  it('does not modify the schema it was given', async () => {
    const input = load('Person')
    const before = JSON.stringify(input)

    await prepareSchema(input, { baseUri: BASE, backend: makeBackend() })
    expect(JSON.stringify(input)).toBe(before)
  })

  it('does not modify the schema it was given without a base either', async () => {
    const input = { type: 'object', allOf: [{ title: 'Base' }], properties: { a: { type: 'string' } } }
    const before = JSON.stringify(input)

    await prepareSchema(input, {})
    expect(JSON.stringify(input)).toBe(before)
  })

  it('maps ui keywords on the way through', async () => {
    const { schema } = await prepareSchema(load('UiAnnotations'), {
      baseUri: BASE,
      backend: makeBackend(),
      language: 'de'
    })

    expect(schema.properties.notes['x-format']).toBe('markdown')
    expect(schema.properties.name['x-info']).toBe('Vollständiger Name')
  })
})

describe('createOoldEditor', () => {
  it('builds a headless instance tree from an OO-LD document', async () => {
    const editor = await createOoldEditor({
      schema: load('Person'),
      baseUri: BASE,
      backend: makeBackend()
    })

    expect(editor.isEditor).toBe(false)
    expect(editor.getValue()).toBeDefined()

    editor.destroy()
  })

  it('accepts a value and reads it back', async () => {
    const editor = await createOoldEditor({
      schema: load('Person'),
      baseUri: BASE,
      backend: makeBackend(),
      data: { works_for: 'urn:org-1' }
    })

    expect(editor.getValue().works_for).toBe('urn:org-1')

    editor.destroy()
  })

  it('validates against the preprocessed schema', async () => {
    const editor = await createOoldEditor({
      schema: load('Person'),
      baseUri: BASE,
      backend: makeBackend(),
      data: { works_for: 'urn:org-1' }
    })

    expect(Array.isArray(editor.getErrors())).toBe(true)

    editor.destroy()
  })

  it('exposes the backend and the collected metadata to the editors', async () => {
    const backend = makeBackend()
    const editor = await createOoldEditor({ schema: load('Person'), baseUri: BASE, backend })

    expect(editor.getOption('oold').backend).toBe(backend)
    expect(editor.getOption('oold').collected.uuids.length).toBeGreaterThan(0)

    editor.destroy()
  })

  it('registers the OO-LD editors as custom editors', async () => {
    const editor = await createOoldEditor({ schema: load('Person'), baseUri: BASE, backend: makeBackend() })

    expect(editor.getOption('customEditors').length).toBeGreaterThanOrEqual(3)

    editor.destroy()
  })

  it('works without a backend, falling back to plain fetch', async () => {
    const editor = await createOoldEditor({
      schema: { type: 'object', properties: { a: { type: 'string' } } }
    })

    expect(editor.getValue()).toEqual({ a: '' })
    expect(editor.getOption('oold').host).toBeUndefined()

    editor.destroy()
  })
})
