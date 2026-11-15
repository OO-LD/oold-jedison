/* global describe it expect */
const Jedison = require('../../../dist/cjs/jedison.cjs')
const { density, TypeSwitcher, backend: backendApi, prepareSchema } = Jedison.oold
const { createStaticBackend } = backendApi
const { columnsFor, assignGrid, densityOptions, DENSITIES } = density

describe('density presets', () => {
  it('names three levels', () => {
    expect(DENSITIES).toEqual(['comfortable', 'compact', 'dense'])
  })

  it('changes nothing at comfortable, which is the upstream default', () => {
    expect(densityOptions('comfortable')).toEqual({})
  })

  it('drops the card and flattens at compact', () => {
    expect(densityOptions('compact').card).toBe(false)
    expect(densityOptions('compact').autoFlat).toBe(true)
  })

  it('also drops button text at dense', () => {
    expect(densityOptions('dense').btnContents).toBe(false)
  })

  it('falls back to comfortable for an unknown level', () => {
    expect(densityOptions('nonsense')).toEqual({})
  })
})

describe('column assignment', () => {
  it('gives a full row to an object and an array', () => {
    expect(columnsFor({ type: 'object' })).toBe(12)
    expect(columnsFor({ type: 'array' })).toBe(12)
  })

  it('gives a full row to a long-text widget', () => {
    expect(columnsFor({ type: 'string', 'x-format': 'markdown' })).toBe(12)
    expect(columnsFor({ type: 'string', 'x-format': 'textarea' })).toBe(12)
  })

  it('packs booleans, enums and numbers', () => {
    expect(columnsFor({ type: 'boolean' })).toBeLessThan(12)
    expect(columnsFor({ type: 'string', enum: ['a', 'b'] })).toBeLessThan(12)
    expect(columnsFor({ type: 'number' })).toBeLessThan(12)
  })

  it('gives a full row to a string declared long', () => {
    expect(columnsFor({ type: 'string', maxLength: 500 })).toBe(12)
  })

  it('packs tighter at dense than at compact', () => {
    expect(columnsFor({ type: 'string' }, 'dense'))
      .toBeLessThan(columnsFor({ type: 'string' }, 'compact'))
  })
})

describe('grid assignment', () => {
  const schema = () => ({
    type: 'object',
    properties: {
      first: { type: 'string' },
      last: { type: 'string' },
      active: { type: 'boolean' },
      notes: { type: 'string', 'x-format': 'markdown' }
    }
  })

  it('leaves everything alone at comfortable', () => {
    expect(assignGrid(schema(), { density: 'comfortable' })).toEqual(schema())
  })

  it('selects the grid layout through x-format', () => {
    expect(assignGrid(schema(), { density: 'compact' })['x-format']).toBe('grid')
  })

  it('assigns breakpoint columns per property', () => {
    const result = assignGrid(schema(), { density: 'compact' })

    expect(result.properties.first['x-grid'].columnsMd).toBe(6)
    expect(result.properties.active['x-grid'].columnsMd).toBe(4)
    expect(result.properties.notes['x-grid'].columnsMd).toBe(12)
  })

  it('keeps a full row on narrow viewports', () => {
    const result = assignGrid(schema(), { density: 'compact' })

    for (const name of Object.keys(result.properties)) {
      expect(result.properties[name]['x-grid'].columnsXs).toBe(12)
    }
  })

  it('does not override a layout the schema already states', () => {
    const tabbed = { ...schema(), 'x-format': 'categories' }
    expect(assignGrid(tabbed, { density: 'compact' })['x-format']).toBe('categories')
  })

  it('does not override a grid the schema already states', () => {
    const stated = schema()
    stated.properties.first['x-gridColumns'] = 2

    const result = assignGrid(stated, { density: 'compact' })

    expect(result.properties.first['x-gridColumns']).toBe(2)
    expect(result.properties.first['x-grid']).toBeUndefined()
  })

  it('leaves a single-property object alone, a grid buys nothing there', () => {
    const single = { type: 'object', properties: { only: { type: 'string' } } }
    expect(assignGrid(single, { density: 'compact' })['x-format']).toBeUndefined()
  })

  it('leaves an object alone when every property wants a full row', () => {
    const wide = {
      type: 'object',
      properties: { a: { type: 'object' }, b: { type: 'array' } }
    }

    expect(assignGrid(wide, { density: 'compact' })['x-format']).toBeUndefined()
  })

  it('descends into nested objects', () => {
    const nested = {
      type: 'object',
      properties: {
        outer: { type: 'string' },
        second: { type: 'string' },
        address: {
          type: 'object',
          properties: { city: { type: 'string' }, zip: { type: 'string' } }
        }
      }
    }

    expect(assignGrid(nested, { density: 'compact' }).properties.address['x-format']).toBe('grid')
  })
})

describe('type switcher', () => {
  const BASE = 'https://example.org/'
  const THING = `${BASE}Thing.schema.json`
  const PERSON = `${BASE}Person.schema.json`
  const RESEARCHER = `${BASE}Researcher.schema.json`

  // unevaluatedProperties: false is how OO-LD closes a composed object;
  // additionalProperties: false cannot, because it does not see the members
  // the allOf branches contribute. Without it nothing is ever dropped, since
  // an open schema admits every member.
  const schemas = {
    [THING]: {
      $id: THING,
      type: 'object',
      properties: { name: { type: 'string' } },
      unevaluatedProperties: false
    },
    [PERSON]: {
      $id: PERSON,
      type: 'object',
      allOf: [{ $ref: THING }],
      properties: { age: { type: 'number' } },
      unevaluatedProperties: false
    },
    [RESEARCHER]: {
      $id: RESEARCHER,
      type: 'object',
      allOf: [{ $ref: PERSON }],
      properties: { orcid: { type: 'string' } },
      unevaluatedProperties: false
    }
  }

  const makeBackend = () => createStaticBackend({ baseUri: BASE, schemas })

  const makeEditor = async (classRef, data) => {
    const backend = makeBackend()
    const { schema } = await prepareSchema(schemas[classRef], { baseUri: classRef, backend })

    return new Jedison.Create({ schema, data })
  }

  it('lists the ancestors of the current class', async () => {
    const backend = makeBackend()
    const jedison = await makeEditor(PERSON)

    const switcher = new TypeSwitcher({ jedison, backend, currentClass: PERSON })
    const roots = await switcher.init()

    expect(roots).toContain(THING)

    switcher.destroy()
    jedison.destroy()
  })

  it('hides ancestors when asked, as inline create does', async () => {
    const backend = makeBackend()
    const jedison = await makeEditor(PERSON)

    const switcher = new TypeSwitcher({ jedison, backend, currentClass: PERSON, showAncestors: false })

    expect(await switcher.init()).toEqual([PERSON])

    switcher.destroy()
    jedison.destroy()
  })

  it('finds the subclasses of the current class', async () => {
    const backend = makeBackend()
    const jedison = await makeEditor(PERSON)

    const switcher = new TypeSwitcher({ jedison, backend, currentClass: PERSON, showAncestors: false })
    await switcher.init()

    expect(await switcher.expand(PERSON)).toContain(RESEARCHER)

    switcher.destroy()
    jedison.destroy()
  })

  it('switches the open editor and keeps what the new class defines', async () => {
    const backend = makeBackend()
    const jedison = await makeEditor(PERSON, { name: 'Ada', age: 36 })

    const switcher = new TypeSwitcher({
      jedison,
      backend,
      currentClass: PERSON,
      prepare: (schema, options) => prepareSchema(schema, { ...options, backend })
    })

    const result = await switcher.switchTo(RESEARCHER)

    expect(result.switched).toBe(true)
    expect(jedison.getValue().name).toBe('Ada')
    expect(jedison.getValue().age).toBe(36)

    switcher.destroy()
    jedison.destroy()
  })

  it('reports what a switch dropped', async () => {
    const backend = makeBackend()
    const jedison = await makeEditor(RESEARCHER, { name: 'Ada', age: 36, orcid: '0000' })

    const switcher = new TypeSwitcher({
      jedison,
      backend,
      currentClass: RESEARCHER,
      prepare: (schema, options) => prepareSchema(schema, { ...options, backend })
    })

    const result = await switcher.switchTo(THING)

    expect(result.dropped).toContain('#/orcid')
    expect(jedison.getValue().name).toBe('Ada')

    switcher.destroy()
    jedison.destroy()
  })

  it('previews the cost of a switch without performing it', async () => {
    const backend = makeBackend()
    const jedison = await makeEditor(RESEARCHER, { name: 'Ada', orcid: '0000' })

    const switcher = new TypeSwitcher({
      jedison,
      backend,
      currentClass: RESEARCHER,
      prepare: (schema, options) => prepareSchema(schema, { ...options, backend })
    })

    const preview = await switcher.preview(THING)

    expect(preview.dropped).toContain('#/orcid')
    expect(jedison.getValue().orcid).toBe('0000')

    switcher.destroy()
    jedison.destroy()
  })

  it('does nothing when switching to the current class', async () => {
    const backend = makeBackend()
    const jedison = await makeEditor(PERSON, { name: 'Ada' })

    const switcher = new TypeSwitcher({ jedison, backend, currentClass: PERSON })
    const result = await switcher.switchTo(PERSON)

    expect(result.switched).toBe(false)

    switcher.destroy()
    jedison.destroy()
  })

  it('reports a class whose schema cannot be fetched', async () => {
    const backend = makeBackend()
    const jedison = await makeEditor(PERSON, { name: 'Ada' })

    const switcher = new TypeSwitcher({ jedison, backend, currentClass: PERSON })
    let seen = null
    switcher.on('error', (error) => { seen = error })

    const result = await switcher.switchTo(`${BASE}Missing.schema.json`)

    expect(result.switched).toBe(false)
    expect(seen).toBeInstanceOf(Error)
    expect(jedison.getValue().name).toBe('Ada')

    switcher.destroy()
    jedison.destroy()
  })
})
