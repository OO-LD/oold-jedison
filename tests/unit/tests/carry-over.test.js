/* global describe it expect */
const Jedison = require('../../../dist/cjs/jedison.cjs')
const { Create, carryOver, admits } = Jedison

describe('admits', () => {
  it('accepts a value of the stated type', () => {
    expect(admits('a', { type: 'string' })).toBe(true)
    expect(admits(1, { type: 'number' })).toBe(true)
    expect(admits(true, { type: 'boolean' })).toBe(true)
    expect(admits(null, { type: 'null' })).toBe(true)
  })

  it('rejects a value of the wrong type', () => {
    expect(admits('a', { type: 'number' })).toBe(false)
    expect(admits(1.5, { type: 'integer' })).toBe(false)
  })

  it('accepts any listed type', () => {
    expect(admits('a', { type: ['string', 'number'] })).toBe(true)
    expect(admits(true, { type: ['string', 'number'] })).toBe(false)
  })

  it('requires an enum member to still be allowed', () => {
    expect(admits('a', { enum: ['a', 'b'] })).toBe(true)
    expect(admits('z', { enum: ['a', 'b'] })).toBe(false)
  })

  it('requires a const to match', () => {
    expect(admits('a', { const: 'a' })).toBe(true)
    expect(admits('b', { const: 'a' })).toBe(false)
  })

  it('accepts when any oneOf branch accepts', () => {
    const schema = { oneOf: [{ type: 'string' }, { type: 'number' }] }
    expect(admits(1, schema)).toBe(true)
    expect(admits(true, schema)).toBe(false)
  })

  it('requires every allOf branch to accept', () => {
    expect(admits('a', { allOf: [{ type: 'string' }, { enum: ['a'] }] })).toBe(true)
    expect(admits('b', { allOf: [{ type: 'string' }, { enum: ['a'] }] })).toBe(false)
  })

  it('is permissive about keywords it does not model', () => {
    expect(admits('anything', { format: 'exotic', 'x-custom': true })).toBe(true)
  })

  it('rejects everything for a false schema', () => {
    expect(admits('a', false)).toBe(false)
  })
})

describe('carryOver', () => {
  it('keeps a property the new schema still defines', () => {
    const { value, dropped } = carryOver({ a: 'x' }, { type: 'object', properties: { a: { type: 'string' } } })

    expect(value).toEqual({ a: 'x' })
    expect(dropped).toEqual([])
  })

  it('drops a property the new schema does not define, and reports it', () => {
    const { value, dropped } = carryOver(
      { a: 'x', gone: 'y' },
      { type: 'object', properties: { a: { type: 'string' } }, additionalProperties: false }
    )

    expect(value).toEqual({ a: 'x' })
    expect(dropped).toEqual(['#/gone'])
  })

  it('drops a property whose type no longer admits the value', () => {
    const { value, dropped } = carryOver(
      { a: 'text' },
      { type: 'object', properties: { a: { type: 'number' } } }
    )

    expect(value).toEqual({})
    expect(dropped).toEqual(['#/a'])
  })

  it('drops an enum value the new enumeration no longer contains', () => {
    const { value, dropped } = carryOver(
      { role: 'pi' },
      { type: 'object', properties: { role: { type: 'string', enum: ['postdoc', 'phd'] } } }
    )

    expect(value).toEqual({})
    expect(dropped).toEqual(['#/role'])
  })

  it('keeps an enum value that is still a member', () => {
    const { value } = carryOver(
      { role: 'phd' },
      { type: 'object', properties: { role: { type: 'string', enum: ['postdoc', 'phd'] } } }
    )

    expect(value).toEqual({ role: 'phd' })
  })

  it('recurses into nested objects', () => {
    const { value, dropped } = carryOver(
      { address: { street: 'Main', gone: 1 } },
      {
        type: 'object',
        properties: {
          address: { type: 'object', properties: { street: { type: 'string' } }, additionalProperties: false }
        }
      }
    )

    expect(value).toEqual({ address: { street: 'Main' } })
    expect(dropped).toEqual(['#/address/gone'])
  })

  it('keeps array entries whose item type still matches', () => {
    const { value } = carryOver(
      { tags: ['a', 'b'] },
      { type: 'object', properties: { tags: { type: 'array', items: { type: 'string' } } } }
    )

    expect(value).toEqual({ tags: ['a', 'b'] })
  })

  it('drops array entries the new item type rejects', () => {
    const { value, dropped } = carryOver(
      { tags: ['a', 2] },
      { type: 'object', properties: { tags: { type: 'array', items: { type: 'string' } } } }
    )

    expect(value).toEqual({ tags: ['a'] })
    expect(dropped).toEqual(['#/tags/1'])
  })

  it('keeps a property contributed through allOf', () => {
    const { value, dropped } = carryOver(
      { inherited: 'x' },
      { type: 'object', allOf: [{ properties: { inherited: { type: 'string' } } }], additionalProperties: false }
    )

    expect(value).toEqual({ inherited: 'x' })
    expect(dropped).toEqual([])
  })

  it('keeps a member matched by patternProperties', () => {
    const { value } = carryOver(
      { x_one: 'a' },
      { type: 'object', patternProperties: { '^x_': { type: 'string' } }, additionalProperties: false }
    )

    expect(value).toEqual({ x_one: 'a' })
  })

  it('keeps everything when the new schema states nothing', () => {
    const { value, dropped } = carryOver({ a: 1, b: 'two' }, {})

    expect(value).toEqual({ a: 1, b: 'two' })
    expect(dropped).toEqual([])
  })
})

describe('setSchema', () => {
  const personSchema = {
    type: 'object',
    properties: {
      name: { type: 'string' },
      age: { type: 'number' }
    }
  }

  const researcherSchema = {
    type: 'object',
    properties: {
      name: { type: 'string' },
      orcid: { type: 'string' }
    },
    additionalProperties: false
  }

  it('keeps the values the new schema still defines', () => {
    const jedison = new Create({ schema: personSchema, data: { name: 'Ada', age: 36 } })

    jedison.setSchema(researcherSchema)

    expect(jedison.getValue().name).toBe('Ada')
    jedison.destroy()
  })

  it('reports what it could not keep', () => {
    const jedison = new Create({ schema: personSchema, data: { name: 'Ada', age: 36 } })

    const { dropped } = jedison.setSchema(researcherSchema)

    expect(dropped).toEqual(['#/age'])
    jedison.destroy()
  })

  it('drops the property the new schema does not have', () => {
    const jedison = new Create({ schema: personSchema, data: { name: 'Ada', age: 36 } })

    jedison.setSchema(researcherSchema)

    expect('age' in jedison.getValue()).toBe(false)
    jedison.destroy()
  })

  // The contract that matters: switching to a schema leaves the same state as
  // constructing with that schema and the carried value. A property absent
  // from the value is deactivated either way, so the two must agree.
  it('leaves the same value as constructing with the carried data', () => {
    const switched = new Create({ schema: personSchema, data: { name: 'Ada', age: 36 } })
    switched.setSchema(researcherSchema)

    const constructed = new Create({ schema: researcherSchema, data: { name: 'Ada' } })

    expect(switched.getValue()).toEqual(constructed.getValue())

    switched.destroy()
    constructed.destroy()
  })

  it('agrees with construction under keepMissingSchemaFields too', () => {
    const options = { keepMissingSchemaFields: true }

    const switched = new Create({ ...options, schema: personSchema, data: { name: 'Ada', age: 36 } })
    switched.setSchema(researcherSchema)

    const constructed = new Create({ ...options, schema: researcherSchema, data: { name: 'Ada' } })

    expect(switched.getValue()).toEqual(constructed.getValue())

    switched.destroy()
    constructed.destroy()
  })

  it('discards the value when asked not to keep it', () => {
    const jedison = new Create({ schema: personSchema, data: { name: 'Ada', age: 36 } })

    jedison.setSchema(researcherSchema, { keepValues: false })

    expect(jedison.getValue().name).toBe('')
    jedison.destroy()
  })

  it('takes an explicit value over the current one', () => {
    const jedison = new Create({ schema: personSchema, data: { name: 'Ada' } })

    jedison.setSchema(researcherSchema, { data: { name: 'Grace', orcid: '0000' } })

    expect(jedison.getValue()).toEqual({ name: 'Grace', orcid: '0000' })
    jedison.destroy()
  })

  it('emits schema-change with what was dropped', () => {
    const jedison = new Create({ schema: personSchema, data: { name: 'Ada', age: 36 } })
    let seen = null

    jedison.on('schema-change', (payload) => { seen = payload })
    jedison.setSchema(researcherSchema)

    expect(seen.dropped).toEqual(['#/age'])
    jedison.destroy()
  })

  it('keeps listeners registered across the change', () => {
    const jedison = new Create({ schema: personSchema, data: { name: 'Ada' } })
    let changes = 0

    jedison.on('change', () => { changes++ })
    jedison.setSchema(researcherSchema)
    jedison.setValue({ name: 'Grace', orcid: '1' })

    expect(changes).toBeGreaterThan(0)
    jedison.destroy()
  })

  it('validates against the new schema afterwards', () => {
    const jedison = new Create({
      schema: { type: 'object', properties: { a: { type: 'string' } } },
      data: { a: 'x' }
    })

    jedison.setSchema({ type: 'object', properties: { a: { type: 'string', minLength: 10 } }, required: ['a'] })
    jedison.setValue({ a: 'short' })

    expect(jedison.getErrors().length).toBeGreaterThan(0)
    jedison.destroy()
  })

  it('can be called repeatedly', () => {
    const jedison = new Create({ schema: personSchema, data: { name: 'Ada' } })

    jedison.setSchema(researcherSchema)
    jedison.setSchema(personSchema)
    jedison.setSchema(researcherSchema)

    expect(jedison.getValue().name).toBe('Ada')
    jedison.destroy()
  })
})
