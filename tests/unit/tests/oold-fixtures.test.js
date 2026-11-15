/* global describe it expect */
const fs = require('fs')
const path = require('path')
const Jedison = require('../../../dist/cjs/jedison.cjs')
const { preprocess, normaliseRange } = Jedison.oold

const FIXTURES = path.join(__dirname, '..', 'fixtures', 'oold')

const load = (name) => JSON.parse(fs.readFileSync(path.join(FIXTURES, `${name}.schema.json`), 'utf8'))

const names = fs
  .readdirSync(FIXTURES)
  .filter((file) => file.endsWith('.schema.json'))
  .map((file) => file.replace('.schema.json', ''))

describe('specification examples', () => {
  it('found the fixtures', () => {
    expect(names.length).toBeGreaterThan(0)
  })

  it.each(names)('preprocesses %s without leaving semantic keywords behind', (name) => {
    const { schema } = preprocess(load(name))
    const remaining = []

    JSON.stringify(schema, (key, value) => {
      if (key === '@context' || key === 'x-oold-sssom' || key.startsWith('x-oold-multilang-')) {
        remaining.push(key)
      }
      return value
    })

    expect(remaining).toEqual([])
  })

  it.each(names)('leaves %s renderable, with a type or a composition keyword', (name) => {
    const { schema } = preprocess(load(name))
    const renderable = ['type', 'properties', 'oneOf', 'anyOf', 'enum', '$ref'].some((key) => key in schema)
    expect(renderable).toBe(true)
  })
})

describe('Person', () => {
  it('resolves the title through the language map', () => {
    expect(preprocess(load('Person'), { language: 'de' }).schema.title).toBe('Person')
  })

  it('reports the schema uuid and the instance rdf type', () => {
    const { collected } = preprocess(load('Person'))
    expect(collected.uuids).toContain('b5203131-7321-46bb-8a11-acb3d1015840')
    expect(collected.instanceRdfTypes).toEqual(['schema:Person'])
  })

  it('normalises works_for into a single target class', () => {
    const { schema } = preprocess(load('Person'))
    const resolved = schema.properties.works_for['x-oold-range-resolved']
    expect(resolved.classes).toEqual(['Organization.schema.json'])
    expect(resolved.union).toBe(false)
  })

  it('keeps x-oold-range alongside the normalised form', () => {
    const { schema } = preprocess(load('Person'))
    expect(schema.properties.works_for['x-oold-range']).toBe('Organization.schema.json')
  })
})

describe('Researcher', () => {
  it('collects the x-oold-ref target out of the subschema range form', () => {
    const source = load('Researcher')
    const property = Object.values(source.properties).find((entry) => entry['x-oold-range'])
    const resolved = normaliseRange(property['x-oold-range'])

    expect(resolved.classes.length).toBeGreaterThan(0)
    expect(resolved.subschema).toBeDefined()
  })
})

describe('UiAnnotations', () => {
  const { schema } = preprocess(load('UiAnnotations'), { language: 'de' })

  it('maps the widget hint to x-format', () => {
    expect(schema.properties.notes['x-format']).toBe('markdown')
  })

  it('maps the property order to x-propertyOrder', () => {
    expect(schema.properties.name['x-propertyOrder']).toBe(1)
    expect(schema.properties.role['x-propertyOrder']).toBe(2)
  })

  it('maps the property group to both grouping keywords', () => {
    expect(schema.properties.name['x-category']).toBe('General')
    expect(schema.properties.name['x-propGroup']).toBe('General')
  })

  it('maps the hidden flag to x-hidden', () => {
    expect(schema.properties.internal_id['x-hidden']).toBe(true)
  })

  it('resolves the German hint and enum titles', () => {
    expect(schema.properties.name['x-info']).toBe('Vollständiger Name')
    expect(schema.properties.role['x-enumTitles']).toEqual(['Projektleitung', 'Postdoc', 'Doktorand'])
  })

  it('keeps x-enum-varnames, which is not part of the ui dialect', () => {
    expect(schema.properties.role['x-enum-varnames']).toEqual([
      'PrincipalInvestigator',
      'PostDoc',
      'PhDStudent'
    ])
  })

  it('strips the sssom mapping, which describes the schema not the form', () => {
    expect('x-oold-sssom' in schema).toBe(false)
  })
})
