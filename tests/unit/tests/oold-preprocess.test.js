/* global describe it expect */
const Jedison = require('../../../dist/cjs/jedison.cjs')
const {
  preprocess,
  mergeAllOf,
  mergeTwo,
  resolveMultilang,
  mapUiKeywords,
  normaliseRange,
  stripSemantics
} = Jedison.oold

describe('allOf merge', () => {
  it('lets the most derived schema win', () => {
    const merged = mergeAllOf({
      allOf: [{ title: 'Base', properties: { a: { title: 'Base a' } } }],
      title: 'Derived',
      properties: { a: { title: 'Derived a' } }
    })

    expect(merged.title).toBe('Derived')
    expect(merged.properties.a.title).toBe('Derived a')
  })

  it('keeps base properties the derived schema does not redefine', () => {
    const merged = mergeAllOf({
      allOf: [{ properties: { a: { type: 'string' }, b: { type: 'number' } } }],
      properties: { a: { title: 'A' } }
    })

    expect(Object.keys(merged.properties).sort()).toEqual(['a', 'b'])
    expect(merged.properties.a).toEqual({ type: 'string', title: 'A' })
  })

  it('orders allOf base first, so a later branch overrides an earlier one', () => {
    const merged = mergeAllOf({
      allOf: [{ title: 'First' }, { title: 'Second' }]
    })

    expect(merged.title).toBe('Second')
  })

  it('flattens a nested allOf chain', () => {
    const merged = mergeAllOf({
      allOf: [{ allOf: [{ type: 'object', title: 'Root' }], title: 'Middle' }],
      title: 'Leaf'
    })

    expect(merged.type).toBe('object')
    expect(merged.title).toBe('Leaf')
  })

  it('unions required rather than replacing it', () => {
    const merged = mergeAllOf({
      allOf: [{ required: ['a', 'b'] }],
      required: ['b', 'c']
    })

    expect(merged.required).toEqual(['a', 'b', 'c'])
  })

  it('removes a key the derived schema sets to null', () => {
    const merged = mergeAllOf({
      allOf: [{ properties: { a: { type: 'string' } }, title: 'Base' }],
      title: null
    })

    expect('title' in merged).toBe(false)
    expect(merged.properties.a.type).toBe('string')
  })

  it('narrows rather than relaxes a maximum', () => {
    expect(mergeTwo({ maximum: 10 }, { maximum: 5 }).maximum).toBe(5)
    expect(mergeTwo({ maximum: 10 }, { maximum: 50 }).maximum).toBe(10)
  })

  it('narrows rather than relaxes a minimum', () => {
    expect(mergeTwo({ minimum: 10 }, { minimum: 50 }).minimum).toBe(50)
    expect(mergeTwo({ minimum: 10 }, { minimum: 5 }).minimum).toBe(10)
  })

  it('narrows an enum to members the base allowed', () => {
    expect(mergeTwo({ enum: ['a', 'b', 'c'] }, { enum: ['b', 'z'] }).enum).toEqual(['b'])
  })

  it('leaves a schema without allOf alone', () => {
    const schema = { type: 'object', properties: { a: { type: 'string' } } }
    expect(mergeAllOf(schema)).toEqual(schema)
  })
})

describe('multilang resolution', () => {
  const schema = {
    title: 'Person',
    'x-oold-multilang-title': { en: 'Person', de: 'Person (de)' },
    properties: {
      name: {
        'x-oold-ui-hint': 'Full name',
        'x-oold-multilang-ui-hint': { en: 'Full name', de: 'Vollständiger Name' }
      }
    }
  }

  it('picks the requested language', () => {
    const result = resolveMultilang(schema, 'de')
    expect(result.title).toBe('Person (de)')
    expect(result.properties.name['x-oold-ui-hint']).toBe('Vollständiger Name')
  })

  it('removes the language map once resolved', () => {
    const result = resolveMultilang(schema, 'en')
    expect('x-oold-multilang-title' in result).toBe(false)
  })

  it('falls back from a regional tag to its base language', () => {
    expect(resolveMultilang(schema, 'de-CH').title).toBe('Person (de)')
  })

  it('keeps the unqualified keyword when the language is absent', () => {
    expect(resolveMultilang(schema, 'fr', 'fr').title).toBe('Person')
  })
})

describe('ui keyword mapping', () => {
  it('maps property-order to x-propertyOrder, not x-categoryOrder', () => {
    const result = mapUiKeywords({ 'x-oold-ui-property-order': 3 })
    expect(result['x-propertyOrder']).toBe(3)
    expect('x-categoryOrder' in result).toBe(false)
  })

  it('maps property-group to both grouping keywords', () => {
    const result = mapUiKeywords({ 'x-oold-ui-property-group': 'General' })
    expect(result['x-category']).toBe('General')
    expect(result['x-propGroup']).toBe('General')
  })

  it('maps the remaining ui keywords', () => {
    const result = mapUiKeywords({
      'x-oold-ui-widget': 'markdown',
      'x-oold-ui-form-hidden': true,
      'x-oold-ui-enum-titles': ['A', 'B'],
      'x-oold-ui-hint': 'help',
      'x-oold-ui-default-property': true
    })

    expect(result['x-format']).toBe('markdown')
    expect(result['x-hidden']).toBe(true)
    expect(result['x-enumTitles']).toEqual(['A', 'B'])
    expect(result['x-info']).toBe('help')
    expect(result['x-defaultProperty']).toBe(true)
  })

  it('does not overwrite a jedison keyword the schema already states', () => {
    const result = mapUiKeywords({ 'x-oold-ui-widget': 'markdown', 'x-format': 'textarea' })
    expect(result['x-format']).toBe('textarea')
  })

  it('removes the oold spelling once mapped', () => {
    const result = mapUiKeywords({ 'x-oold-ui-widget': 'markdown' })
    expect('x-oold-ui-widget' in result).toBe(false)
  })

  it('passes x-jedison-* through untouched', () => {
    const result = mapUiKeywords({ 'x-jedison-custom': 1 })
    expect(result['x-jedison-custom']).toBe(1)
  })
})

describe('x-oold-range normalisation', () => {
  it('reads the string form as a single class', () => {
    expect(normaliseRange('Organization.schema.json')).toEqual({
      classes: ['Organization.schema.json'],
      union: false,
      subschema: undefined
    })
  })

  it('reads the array form as a union', () => {
    const result = normaliseRange(['Organization.schema.json', 'Person.schema.json'])
    expect(result.classes).toEqual(['Organization.schema.json', 'Person.schema.json'])
    expect(result.union).toBe(true)
  })

  it('does not call a single-entry array a union', () => {
    expect(normaliseRange(['Organization.schema.json']).union).toBe(false)
  })

  it('collects x-oold-ref targets from the subschema form', () => {
    const result = normaliseRange({
      allOf: [
        { 'x-oold-ref': 'Organization.schema.json' },
        { properties: { address: { properties: { country: { const: 'DE' } } } } }
      ]
    })

    expect(result.classes).toEqual(['Organization.schema.json'])
    expect(result.union).toBe(false)
    expect(result.subschema).toBeDefined()
  })

  it('treats oneOf in the subschema form as a union', () => {
    const result = normaliseRange({
      oneOf: [
        { 'x-oold-ref': 'Organization.schema.json' },
        { 'x-oold-ref': 'Person.schema.json' }
      ]
    })

    expect(result.classes).toEqual(['Organization.schema.json', 'Person.schema.json'])
    expect(result.union).toBe(true)
  })

  it('ignores $ref inside a range, which the spec forbids there', () => {
    expect(normaliseRange({ allOf: [{ $ref: 'Organization.schema.json' }] }).classes).toEqual([])
  })
})

describe('semantic stripping', () => {
  const schema = {
    $id: 'Person.schema.json',
    '@context': ['Thing.schema.json', { schema: 'http://schema.org/' }],
    'x-oold-uuid': 'b5203131-7321-46bb-8a11-acb3d1015840',
    'x-oold-version': '1.0.0',
    'x-oold-instance-rdf-type': ['schema:Person'],
    'x-oold-sssom': { 'schema:Person': { predicate_id: 'skos:exactMatch' } },
    'x-oold-reverse-default-properties': ['employees'],
    'x-oold-reverse-defaultProperties': ['employees'],
    title: 'Person',
    properties: { works_for: { type: 'string' } }
  }

  it('removes @context and the version relation keywords', () => {
    const { schema: result } = stripSemantics(schema)
    expect('@context' in result).toBe(false)
    expect('x-oold-sssom' in result).toBe(false)
    expect('x-oold-version' in result).toBe(false)
  })

  it('removes both dead spellings of reverse default properties', () => {
    const { schema: result } = stripSemantics(schema)
    expect('x-oold-reverse-default-properties' in result).toBe(false)
    expect('x-oold-reverse-defaultProperties' in result).toBe(false)
  })

  it('keeps what the form renders', () => {
    const { schema: result } = stripSemantics(schema)
    expect(result.title).toBe('Person')
    expect(result.properties.works_for.type).toBe('string')
    expect(result.$id).toBe('Person.schema.json')
  })

  it('returns the uuids and the instance rdf types', () => {
    const { collected } = stripSemantics(schema)
    expect(collected.uuids).toEqual(['b5203131-7321-46bb-8a11-acb3d1015840'])
    expect(collected.instanceRdfTypes).toEqual(['schema:Person'])
  })

  it('records the paths hidden from the read view', () => {
    const { collected } = stripSemantics({
      properties: { secret: { 'x-oold-ui-render-hidden': true } }
    })
    expect(collected.renderHidden).toEqual(['#/properties/secret'])
  })
})

describe('preprocess pipeline', () => {
  it('runs multilang before the ui mapping, so a hint reaches x-info', () => {
    const { schema } = preprocess({
      properties: {
        name: { 'x-oold-multilang-ui-hint': { en: 'Full name', de: 'Vollständiger Name' } }
      }
    }, { language: 'de' })

    expect(schema.properties.name['x-info']).toBe('Vollständiger Name')
  })

  it('merges inherited properties before mapping their keywords', () => {
    const { schema } = preprocess({
      allOf: [{ properties: { a: { 'x-oold-ui-property-order': 1 } } }],
      properties: { b: { 'x-oold-ui-property-order': 2 } }
    })

    expect(schema.properties.a['x-propertyOrder']).toBe(1)
    expect(schema.properties.b['x-propertyOrder']).toBe(2)
  })

  it('leaves a schema with no oold keyword unchanged', () => {
    const plain = {
      type: 'object',
      title: 'Plain',
      properties: { a: { type: 'string', 'x-format': 'textarea' } },
      required: ['a']
    }

    expect(preprocess(plain).schema).toEqual(plain)
  })

  it('does not modify its input', () => {
    const input = { 'x-oold-uuid': 'u', title: 'T' }
    preprocess(input)
    expect(input['x-oold-uuid']).toBe('u')
  })
})
