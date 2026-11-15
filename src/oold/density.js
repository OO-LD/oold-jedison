import { isObject, isArray, isString, isSet } from '../helpers/utils.js'

/**
 * Layout density.
 *
 * The default rendering puts one field per row inside a card per object. With
 * three levels of inheritance that is three nested frames before the first
 * input, and on a wide screen most of the width goes unused.
 *
 * A density is a preset over options jedison already has, not a separate
 * rendering path, so nothing here changes how anything is drawn. `comfortable`
 * is the upstream default and sets nothing at all.
 */
export const DENSITIES = ['comfortable', 'compact', 'dense']

export const DENSITY_OPTIONS = {
  comfortable: {},
  compact: {
    card: false,
    autoFlat: true,
    enableCollapseToggle: true
  },
  dense: {
    card: false,
    autoFlat: true,
    enableCollapseToggle: true,
    btnContents: false
  }
}

export function densityOptions (density) {
  return DENSITY_OPTIONS[density] ?? DENSITY_OPTIONS.comfortable
}

/**
 * How many of the twelve grid columns a property should take.
 *
 * Short values pack several to a row, long text and nested structures take a
 * full one. Deriving this from the schema is what keeps a form from being a
 * single column of half-empty inputs on a wide screen.
 */
export function columnsFor (schema, density = 'compact') {
  if (!isObject(schema)) {
    return 12
  }

  const type = isArray(schema.type) ? schema.type[0] : schema.type
  const format = schema['x-format'] ?? schema.format

  const wideFormats = ['textarea', 'markdown', 'ace', 'quill', 'jodit', 'milkdown', 'simplemde', 'bpmn', 'json']

  if (isString(format) && wideFormats.includes(format)) {
    return 12
  }

  if (type === 'object' || type === 'array') {
    return 12
  }

  if (type === 'boolean') {
    return density === 'dense' ? 3 : 4
  }

  if (isArray(schema.enum)) {
    return density === 'dense' ? 3 : 4
  }

  if (type === 'number' || type === 'integer') {
    return density === 'dense' ? 3 : 4
  }

  if (type === 'string') {
    const long = isSet(schema.maxLength) && schema.maxLength > 120

    if (long) {
      return 12
    }

    return density === 'dense' ? 4 : 6
  }

  return 12
}

/**
 * Assigns a grid to each object, leaving alone any schema that states its own.
 *
 * An object with a single property gains nothing from a grid, and one whose
 * properties all want the full width would only be given twelve columns each,
 * so neither is touched.
 */
export function assignGrid (schema, options = {}) {
  const density = options.density ?? 'compact'

  if (density === 'comfortable') {
    return schema
  }

  return walk(schema, density)
}

function walk (node, density) {
  if (isArray(node)) {
    return node.map((entry) => walk(entry, density))
  }

  if (!isObject(node)) {
    return node
  }

  const result = {}

  for (const [key, value] of Object.entries(node)) {
    result[key] = walk(value, density)
  }

  if (!isObject(result.properties)) {
    return result
  }

  // The grid layout is selected by x-format on the object. A schema that
  // already states a layout keeps it, since categories, nav and accordion are
  // deliberate choices rather than defaults to improve on.
  const statedFormat = result['x-format'] ?? result['x-options']?.format

  if (isSet(statedFormat)) {
    return result
  }

  const names = Object.keys(result.properties)

  if (names.length < 2) {
    return result
  }

  const columns = {}
  let anyNarrow = false

  for (const name of names) {
    const width = columnsFor(result.properties[name], density)
    columns[name] = width

    if (width < 12) {
      anyNarrow = true
    }
  }

  if (!anyNarrow) {
    return result
  }

  result['x-format'] = 'grid'

  for (const name of names) {
    const property = result.properties[name]

    if (!isObject(property)) {
      continue
    }

    if (isSet(property['x-grid']) || isSet(property['x-gridColumns'])) {
      continue
    }

    // Full width on a narrow viewport, packed from medium up. A flat
    // x-gridColumns would apply to every breakpoint and squeeze a phone.
    result.properties[name] = {
      ...property,
      'x-grid': { columnsXs: 12, columnsMd: columns[name], columnsLg: columns[name] }
    }
  }

  return result
}
