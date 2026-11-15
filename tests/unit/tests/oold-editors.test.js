/* global describe it expect */
const Jedison = require('../../../dist/cjs/jedison.cjs')

const {
  SuggestController,
  TreeController,
  template,
  backend: backendApi,
  OOLD_EDITORS,
  EditorOoldRange,
  EditorOoldAutocomplete,
  EditorOoldTreeSelect,
  EditorOoldTreeSelectWunderbaum
} = Jedison.oold

const { createStaticBackend } = backendApi

const ORGANIZATION = 'https://example.org/Organization.schema.json'
const PERSON = 'https://example.org/Person.schema.json'
const THING = 'https://example.org/Thing.schema.json'

const schemas = {
  [THING]: { $id: THING, type: 'object' },
  [PERSON]: { $id: PERSON, type: 'object', allOf: [{ $ref: THING }] },
  [ORGANIZATION]: { $id: ORGANIZATION, type: 'object', allOf: [{ $ref: THING }] }
}

const records = () => [
  { id: 'urn:org-1', label: 'Institute of Materials', description: 'Materials research', image: 'https://x/i.png', type: ORGANIZATION },
  { id: 'urn:org-2', label: 'Other Institute', type: ORGANIZATION }
]

const makeBackend = (overrides = {}) => createStaticBackend({
  baseUri: 'https://example.org/',
  schemas,
  instances: records(),
  ...overrides
})

const controller = (options = {}) => new SuggestController({
  backend: makeBackend(),
  spec: { classes: [ORGANIZATION] },
  debounce: 0,
  ...options
})

describe('template rendering', () => {
  it('fills a path from the record', () => {
    expect(template.render('{{label}}', { label: 'A' })).toBe('A')
  })

  it('reads a nested path', () => {
    expect(template.render('{{a.b}}', { a: { b: 'c' } })).toBe('c')
  })

  it('escapes html by default, so a backend cannot inject markup', () => {
    expect(template.render('{{label}}', { label: '<img onerror=x>' }))
      .toBe('&lt;img onerror=x&gt;')
  })

  it('leaves the triple brace form unescaped', () => {
    expect(template.render('{{{label}}}', { label: '<b>A</b>' })).toBe('<b>A</b>')
  })

  it('empties a path that does not resolve', () => {
    expect(template.render('[{{nope}}]', {})).toBe('[]')
  })

  it('accepts a function instead of a string', () => {
    expect(template.render((record) => record.id.toUpperCase(), { id: 'a' })).toBe('A')
  })

  it('stores the identifier when no store template is given', () => {
    expect(template.storeValue({ id: 'urn:1', label: 'A' })).toBe('urn:1')
  })

  it('stores what the store template produces', () => {
    expect(template.storeValue({ id: 'urn:1', raw: { uri: 'http://x/1' } }, '{{raw.uri}}'))
      .toBe('http://x/1')
  })

  it('falls back to the identifier when the store template produces nothing', () => {
    expect(template.storeValue({ id: 'urn:1' }, '{{raw.missing}}')).toBe('urn:1')
  })

  it('labels with the label template when given', () => {
    expect(template.labelValue({ id: 'urn:1', label: 'A', description: 'B' }, '{{label}} ({{description}})'))
      .toBe('A (B)')
  })
})

describe('suggest controller', () => {
  it('holds no value until a suggestion is chosen', async () => {
    const suggest = controller()

    suggest.input('materi')
    await suggest.search('materi')

    expect(suggest.value).toBeUndefined()
    expect(suggest.unhandledInput).toBe(true)
  })

  it('clears on commit when the input was never resolved', () => {
    const suggest = controller()
    suggest.input('half typed')

    expect(suggest.commit()).toBeUndefined()
    expect(suggest.value).toBeUndefined()
  })

  it('takes a value from a selection', () => {
    const suggest = controller()
    const value = suggest.select({ id: 'urn:org-1', label: 'Institute of Materials' })

    expect(value).toBe('urn:org-1')
    expect(suggest.label).toBe('Institute of Materials')
    expect(suggest.unhandledInput).toBe(false)
  })

  it('keeps the value on commit once a selection was made', () => {
    const suggest = controller()
    suggest.select({ id: 'urn:org-1', label: 'Institute of Materials' })

    expect(suggest.commit()).toBe('urn:org-1')
  })

  it('separates what is stored from what is shown', () => {
    const suggest = controller({
      templates: { store: '{{raw.uri}}', label: '{{label}}' }
    })

    suggest.select({ id: 'urn:org-1', label: 'Institute of Materials', raw: { uri: 'http://x/org-1' } })

    expect(suggest.value).toBe('http://x/org-1')
    expect(suggest.label).toBe('Institute of Materials')
  })

  it('searches the backend and reports results', async () => {
    const suggest = controller()
    const results = await suggest.search('materi')

    expect(results.map((entry) => entry.id)).toEqual(['urn:org-1'])
  })

  it('ignores a slower earlier search', async () => {
    const suggest = controller()
    const slow = suggest.search('materi')
    const fast = suggest.search('other')

    await Promise.all([slow, fast])

    expect(suggest.results.map((entry) => entry.id)).toEqual(['urn:org-2'])
  })

  it('reports an error without throwing', async () => {
    const broken = makeBackend()
    broken.instances.search = async () => { throw new Error('nope') }

    const suggest = controller({ backend: broken })
    let seen = null
    suggest.on('error', (error) => { seen = error })

    expect(await suggest.search('x')).toEqual([])
    expect(seen).toBeInstanceOf(Error)
  })

  it('resolves the label of a value loaded from storage', async () => {
    const suggest = controller()
    await suggest.adopt('urn:org-1')

    expect(suggest.label).toBe('Institute of Materials')
    expect(suggest.value).toBe('urn:org-1')
  })

  it('keeps an unresolvable value and shows it as its own label', async () => {
    const suggest = controller()
    await suggest.adopt('urn:missing')

    expect(suggest.value).toBe('urn:missing')
    expect(suggest.label).toBe('urn:missing')
  })

  it('empties the label when adopting nothing', async () => {
    const suggest = controller()
    await suggest.adopt('')

    expect(suggest.label).toBe('')
  })

  it('clears both value and label', () => {
    const suggest = controller()
    suggest.select({ id: 'urn:org-1', label: 'A' })
    suggest.clear()

    expect(suggest.value).toBeUndefined()
    expect(suggest.label).toBe('')
  })

  it('reports create only when the backend can save', () => {
    expect(controller().canCreate).toBe(true)

    const readOnly = makeBackend({ capabilities: { canCreate: false } })
    expect(controller({ backend: readOnly }).canCreate).toBe(false)
  })

  it('renders a suggestion through the render template', () => {
    const suggest = controller({ templates: { render: '<b>{{label}}</b>' } })
    expect(suggest.renderSuggestion({ label: 'A' })).toBe('<b>A</b>')
  })

  it('renders nothing without a template, leaving the default to the editor', () => {
    expect(controller().renderSuggestion({ label: 'A' })).toBeUndefined()
  })
})

describe('tree controller', () => {
  const tree = (options = {}) => new TreeController({
    backend: makeBackend(),
    rootClasses: [THING],
    includeInstances: false,
    ...options
  })

  it('starts at the range class', async () => {
    const controllerUnderTest = tree({ showAncestors: false })
    expect(await controllerUnderTest.init()).toEqual([THING])
  })

  it('prepends ancestors and makes them roots', async () => {
    const controllerUnderTest = tree({ rootClasses: [PERSON] })
    const roots = await controllerUnderTest.init()

    expect(roots).toContain(THING)
    expect(controllerUnderTest.rootClasses).toContain(THING)
  })

  it('hides ancestors when asked, which is what inline create does', async () => {
    const controllerUnderTest = tree({ rootClasses: [PERSON], showAncestors: false })
    expect(await controllerUnderTest.init()).toEqual([PERSON])
  })

  it('fetches children only on expansion', async () => {
    const back = makeBackend()
    let calls = 0
    const original = back.classes.getSubclasses.bind(back.classes)
    back.classes.getSubclasses = async (...args) => { calls++; return original(...args) }

    const controllerUnderTest = tree({ backend: back, showAncestors: false })
    await controllerUnderTest.init()
    expect(calls).toBe(0)

    await controllerUnderTest.expand(THING)
    expect(calls).toBe(1)
  })

  it('expands to the direct children', async () => {
    const controllerUnderTest = tree({ showAncestors: false })
    await controllerUnderTest.init()

    expect((await controllerUnderTest.expand(THING)).sort()).toEqual([ORGANIZATION, PERSON].sort())
  })

  it('does not refetch a branch already expanded', async () => {
    const back = makeBackend()
    let calls = 0
    const original = back.classes.getSubclasses.bind(back.classes)
    back.classes.getSubclasses = async (...args) => { calls++; return original(...args) }

    const controllerUnderTest = tree({ backend: back, showAncestors: false })
    await controllerUnderTest.expand(THING)
    controllerUnderTest.collapse(THING)
    await controllerUnderTest.expand(THING)

    expect(calls).toBe(1)
  })

  it('selects one entry when single', async () => {
    const controllerUnderTest = tree({ showAncestors: false })
    controllerUnderTest.select(PERSON)
    controllerUnderTest.select(ORGANIZATION)

    expect(controllerUnderTest.value).toBe(ORGANIZATION)
  })

  it('accumulates and toggles when multiple', async () => {
    const controllerUnderTest = tree({ multiple: true, showAncestors: false })
    controllerUnderTest.select(PERSON)
    controllerUnderTest.select(ORGANIZATION)

    expect(controllerUnderTest.value.sort()).toEqual([ORGANIZATION, PERSON].sort())

    controllerUnderTest.select(PERSON)
    expect(controllerUnderTest.value).toEqual([ORGANIZATION])
  })

  it('lists instances under a class when asked', async () => {
    const controllerUnderTest = tree({ includeInstances: true, showAncestors: false })
    const children = await controllerUnderTest.expand(ORGANIZATION)

    expect(children).toContain('urn:org-1')
    expect(controllerUnderTest.node('urn:org-1').kind).toBe('instance')
  })

  it('degrades to no children without a hierarchy', async () => {
    const flat = makeBackend({ capabilities: { hasHierarchy: false } })
    const controllerUnderTest = tree({ backend: flat, showAncestors: false })

    expect(await controllerUnderTest.expand(THING)).toEqual([])
  })
})

describe('editor registration', () => {
  it('exports the editors, tree variants before the rest', () => {
    expect(OOLD_EDITORS.length).toBeGreaterThanOrEqual(4)
  })

  it('keeps the wunderbaum tree inert until the page loads the library', () => {
    const schema = { type: 'string', 'x-format': 'oold-tree-select' }

    // No window.mar10 in this environment, so the themed fallback resolves.
    expect(EditorOoldTreeSelectWunderbaum.available()).toBe(false)
    expect(EditorOoldTreeSelectWunderbaum.resolves(schema)).toBe(false)
    expect(EditorOoldTreeSelect.resolves(schema)).toBe(true)
  })

  it('ranks the wunderbaum tree above the themed fallback', () => {
    expect(EditorOoldTreeSelectWunderbaum.priority())
      .toBeGreaterThan(EditorOoldTreeSelect.priority())
  })

  it('resolves a range property to the reference editor', () => {
    expect(EditorOoldRange.resolves({ type: 'string', 'x-oold-range': 'X.schema.json' })).toBe(true)
  })

  it('leaves a plain string to the built-in editors', () => {
    expect(EditorOoldRange.resolves({ type: 'string' })).toBe(false)
  })

  it('accepts the normalised range form', () => {
    const resolved = { classes: ['X.schema.json'], union: false }
    expect(EditorOoldRange.resolves({ type: 'string', 'x-oold-range-resolved': resolved })).toBe(true)
  })

  it('resolves autocomplete by x-format', () => {
    expect(EditorOoldAutocomplete.resolves({ type: 'string', 'x-format': 'oold-autocomplete' })).toBe(true)
    expect(EditorOoldAutocomplete.resolves({ type: 'string' })).toBe(false)
  })

  it('resolves tree select for a string and for an array', () => {
    expect(EditorOoldTreeSelect.resolves({ type: 'string', 'x-format': 'oold-tree-select' })).toBe(true)
    expect(EditorOoldTreeSelect.resolves({ type: 'array', 'x-format': 'oold-tree-select' })).toBe(true)
    expect(EditorOoldTreeSelect.resolves({ type: 'number', 'x-format': 'oold-tree-select' })).toBe(false)
  })

  it('orders tree select above autocomplete above range', () => {
    expect(EditorOoldTreeSelect.priority()).toBeGreaterThan(EditorOoldAutocomplete.priority())
    expect(EditorOoldAutocomplete.priority()).toBeGreaterThan(EditorOoldRange.priority())
  })
})
