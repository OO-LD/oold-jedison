import { isObject, isArray, isString, isSet } from '../helpers/utils.js'

/**
 * Density is a skin, not a layout.
 *
 * Two separate concerns were previously one. How many columns an object
 * occupies and in what order its properties appear is a property of the
 * schema. How tall a control is, how large its type is and how much air sits
 * between rows is a property of the presentation, and has to work whatever
 * schema is loaded and whatever theme is in use.
 *
 * So density here is CSS custom properties on a container class, applied with
 * plain element selectors rather than Bootstrap ones, and the grid lives in
 * `assignGrid`, which is opt-in and independent.
 */
export const DENSITIES = ['comfortable', 'compact', 'dense']

/**
 * The skin. Every value is a CSS length or scale, nothing structural.
 */
export const DENSITY_TOKENS = {
  comfortable: {
    '--jedi-control-padding-y': '0.375rem',
    '--jedi-control-padding-x': '0.75rem',
    '--jedi-control-font-size': '1rem',
    '--jedi-control-line-height': '1.5',
    '--jedi-label-font-size': '1rem',
    '--jedi-label-margin': '0.5rem',
    '--jedi-field-gap': '1rem',
    '--jedi-legend-font-size': '1.25rem',
    '--jedi-help-font-size': '0.875rem',
    '--jedi-nest-indent': '1rem',
    '--jedi-row-padding-y': '0.5rem',
    '--jedi-label-width': 'auto'
  },
  compact: {
    '--jedi-control-padding-y': '0.1875rem',
    '--jedi-control-padding-x': '0.5rem',
    '--jedi-control-font-size': '0.875rem',
    '--jedi-control-line-height': '1.35',
    '--jedi-label-font-size': '0.8125rem',
    '--jedi-label-margin': '0.125rem',
    '--jedi-field-gap': '0.5rem',
    '--jedi-legend-font-size': '0.9375rem',
    '--jedi-help-font-size': '0.75rem',
    '--jedi-nest-indent': '0.75rem',
    '--jedi-row-padding-y': '0.25rem',
    '--jedi-label-width': 'auto'
  },
  dense: {
    '--jedi-control-padding-y': '0.0625rem',
    '--jedi-control-padding-x': '0.375rem',
    '--jedi-control-font-size': '0.8125rem',
    '--jedi-control-line-height': '1.2',
    '--jedi-label-font-size': '0.75rem',
    '--jedi-label-margin': '0',
    '--jedi-field-gap': '0.25rem',
    '--jedi-legend-font-size': '0.875rem',
    '--jedi-help-font-size': '0.6875rem',
    '--jedi-nest-indent': '0.5rem',
    '--jedi-row-padding-y': '0.125rem',
    '--jedi-label-width': '11rem'
  }
}

/**
 * Structural options the preset still sets. These are genuinely layout rather
 * than skin, and are kept because a tighter skin on top of a card per nested
 * object still wastes the space the cards take.
 */
export const DENSITY_OPTIONS = {
  comfortable: {},
  compact: { card: false, autoFlat: true },
  dense: { card: false, autoFlat: true, btnContents: false }
}

export function densityOptions (density) {
  return DENSITY_OPTIONS[density] ?? DENSITY_OPTIONS.comfortable
}

export function densityTokens (density) {
  return DENSITY_TOKENS[density] ?? DENSITY_TOKENS.comfortable
}

const STYLE_ID = 'jedi-density'

/**
 * Element selectors rather than theme classes, so the same rules hold for
 * barebones, the Bootstrap themes and Tailwind.
 */
const STYLE_TEXT = `
.jedi-density input:not([type="checkbox"]):not([type="radio"]):not([type="range"]),
.jedi-density select,
.jedi-density textarea {
  padding: var(--jedi-control-padding-y) var(--jedi-control-padding-x);
  font-size: var(--jedi-control-font-size);
  line-height: var(--jedi-control-line-height);
  min-height: 0;
}
.jedi-density label,
.jedi-density .form-check-label {
  font-size: var(--jedi-label-font-size);
  margin-bottom: var(--jedi-label-margin);
}
.jedi-density legend,
.jedi-density .jedi-legend {
  font-size: var(--jedi-legend-font-size);
  margin-bottom: var(--jedi-label-margin);
}
.jedi-density small,
.jedi-density .form-text,
.jedi-density .jedi-description {
  font-size: var(--jedi-help-font-size);
}
.jedi-density .mb-3 {
  margin-bottom: var(--jedi-field-gap) !important;
}
.jedi-density .jedi-editor-container > .jedi-editor-container {
  margin-bottom: var(--jedi-field-gap);
}
.jedi-density button {
  font-size: var(--jedi-control-font-size);
  padding: var(--jedi-control-padding-y) var(--jedi-control-padding-x);
}
.jedi-density .list-group-item {
  padding-top: var(--jedi-row-padding-y);
  padding-bottom: var(--jedi-row-padding-y);
  font-size: var(--jedi-control-font-size);
}
.jedi-density .jedi-oold-actions button {
  padding: var(--jedi-control-padding-y) calc(var(--jedi-control-padding-x) / 1.5);
}
.jedi-density fieldset:not(.card) {
  border-left: 2px solid rgba(127, 127, 127, 0.25);
  padding-left: var(--jedi-nest-indent);
  margin-bottom: var(--jedi-field-gap);
}
.jedi-density table td,
.jedi-density table th {
  padding: var(--jedi-row-padding-y) var(--jedi-control-padding-x);
  font-size: var(--jedi-control-font-size);
}

/* A control group with buttons beside the input must not be taller than a
   plain field. Bootstrap sizes .input-group children on its own, and those
   rules are more specific than the element selectors above. */
.jedi-density .input-group > .form-control,
.jedi-density .input-group > input,
.jedi-density .input-group > select,
.jedi-density .input-group-text,
.jedi-density .jedi-oold-actions,
.jedi-density .jedi-oold-actions > button {
  padding: var(--jedi-control-padding-y) var(--jedi-control-padding-x);
  font-size: var(--jedi-control-font-size);
  line-height: var(--jedi-control-line-height);
  min-height: 0;
}
.jedi-density .jedi-oold-actions {
  background: none;
  border: 0;
}

/* Dense puts the label beside the input rather than above it: at this size a
   stacked label costs as much vertical space as the field it names. */
[data-jedi-density="dense"] .mb-3 {
  display: grid;
  grid-template-columns: var(--jedi-label-width) minmax(0, 1fr);
  align-items: center;
  column-gap: 0.5rem;
}
[data-jedi-density="dense"] .mb-3 > label {
  grid-column: 1;
  margin-bottom: 0;
  text-align: right;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
[data-jedi-density="dense"] .mb-3 > *:not(label) {
  grid-column: 2;
}
/* An empty slot still occupies a grid row, which pushes the input onto the
   row below the label it belongs to. Those slots are only filled when there
   is something to show, so an empty one is taken out of the layout. */
[data-jedi-density="dense"] .mb-3 > .jedi-switcher-slot:empty,
[data-jedi-density="dense"] .mb-3 > .jedi-messages-slot:empty,
[data-jedi-density="dense"] .mb-3 > .jedi-actions-slot:empty,
[data-jedi-density="dense"] .mb-3 > .jedi-description:empty {
  display: none;
}
/* An object or array keeps the full width; only leaf controls pair up. */
[data-jedi-density="dense"] .mb-3:has(> fieldset),
[data-jedi-density="dense"] .mb-3:has(> .jedi-array-control) {
  display: block;
}
`

export function injectDensityStyles (doc) {
  const target = doc ?? (typeof document !== 'undefined' ? document : undefined)

  if (!target || target.getElementById(STYLE_ID)) {
    return
  }

  const style = target.createElement('style')
  style.setAttribute('id', STYLE_ID)
  style.textContent = STYLE_TEXT
  target.head.appendChild(style)
}

/**
 * Applies a density to a container: the marker class, the tokens as inline
 * custom properties, and the stylesheet that reads them.
 *
 * Works with any theme, because nothing here depends on one.
 */
export function applyDensity (container, level = 'comfortable') {
  if (!container) {
    return
  }

  injectDensityStyles(container.ownerDocument)

  container.classList.add('jedi-density')
  container.setAttribute('data-jedi-density', level)

  for (const [name, value] of Object.entries(densityTokens(level))) {
    container.style.setProperty(name, value)
  }
}

/**
 * How many of the twelve grid columns a property should take.
 *
 * Short values pack several to a row, long text and nested structures take a
 * full one. `tight` packs harder, and is independent of the skin.
 */
export function columnsFor (schema, tight = false) {
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

  if (type === 'boolean' || isArray(schema.enum) || type === 'number' || type === 'integer') {
    return tight ? 3 : 4
  }

  if (type === 'string') {
    if (isSet(schema.maxLength) && schema.maxLength > 120) {
      return 12
    }

    return tight ? 4 : 6
  }

  return 12
}

/**
 * Assigns a grid to each object, leaving alone any schema that states its own.
 *
 * Opt-in and independent of density: how many columns a form uses is a
 * decision about the schema, and a schema author who has made that decision
 * should not have it overwritten because the skin changed.
 */
export function assignGrid (schema, options = {}) {
  if (options.enabled !== true) {
    return schema
  }

  return walk(schema, options.tight === true)
}

function walk (node, tight) {
  if (isArray(node)) {
    return node.map((entry) => walk(entry, tight))
  }

  if (!isObject(node)) {
    return node
  }

  const result = {}

  for (const [key, value] of Object.entries(node)) {
    result[key] = walk(value, tight)
  }

  if (!isObject(result.properties)) {
    return result
  }

  // The grid layout is selected by x-format on the object. A schema that
  // already states a layout keeps it, since categories, nav and accordion are
  // deliberate choices rather than defaults to improve on.
  if (isSet(result['x-format']) || isSet(result['x-options']?.format)) {
    return result
  }

  const names = Object.keys(result.properties)

  if (names.length < 2) {
    return result
  }

  const columns = {}
  let anyNarrow = false

  for (const name of names) {
    const width = columnsFor(result.properties[name], tight)
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

    if (!isObject(property) || isSet(property['x-grid']) || isSet(property['x-gridColumns'])) {
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
