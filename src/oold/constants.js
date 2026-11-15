export const OOLD_RANGE = 'x-oold-range'
export const OOLD_REF = 'x-oold-ref'

// Removed from the rendered schema. Everything here is either semantic rather than
// presentational, or it is read once and kept outside the schema.
export const STRIPPED_KEYWORDS = [
  '@context',
  'x-oold-context',
  'x-oold-sssom',
  'x-oold-uuid',
  'x-oold-version',
  'x-oold-prior-version',
  'x-oold-backward-compatible-with',
  'x-oold-incompatible-with',
  // Withdrawn in 1.0.0-rc.4 with no replacement. Both spellings occur in the wild.
  'x-oold-reverse-default-properties',
  'x-oold-reverse-defaultProperties'
]

// Read before stripping, returned on the preprocessing result.
export const COLLECTED_KEYWORDS = [
  'x-oold-uuid',
  'x-oold-version',
  'x-oold-instance-rdf-type'
]

// x-oold-ui-* to the jedison keyword that implements it.
//
// property-order maps to x-propertyOrder, not to the x-categoryOrder named in the
// OO-LD meta-schema: x-categoryOrder takes an array of category names on the enclosing
// object, while x-oold-ui-property-order is an integer on the property itself.
// property-group gets both targets: x-category drives the tabbed "categories" object
// format, x-propGroup drives grouping in the default object editor. Which one is read
// depends on the layout in use, and setting both keeps the schema layout-agnostic.
export const UI_KEYWORD_MAP = {
  'x-oold-ui-widget': ['x-format'],
  'x-oold-ui-property-order': ['x-propertyOrder'],
  'x-oold-ui-property-group': ['x-category', 'x-propGroup'],
  'x-oold-ui-form-hidden': ['x-hidden'],
  'x-oold-ui-enum-titles': ['x-enumTitles'],
  'x-oold-ui-hint': ['x-info'],
  'x-oold-ui-default-property': ['x-defaultProperty']
}

// Carries no jedison counterpart: it describes the read view, not the form.
export const UI_RENDER_HIDDEN = 'x-oold-ui-render-hidden'

// x-oold-multilang-<x> supplies the language map for <target>.
export const MULTILANG_MAP = {
  'x-oold-multilang-title': 'title',
  'x-oold-multilang-description': 'description',
  'x-oold-multilang-ui-hint': 'x-oold-ui-hint',
  'x-oold-multilang-ui-enum-titles': 'x-oold-ui-enum-titles'
}

// Narrowing a lower bound means raising it, narrowing an upper bound means lowering it.
export const NARROW_MAX = [
  'maximum',
  'exclusiveMaximum',
  'maxLength',
  'maxItems',
  'maxProperties',
  'maxContains'
]

export const NARROW_MIN = [
  'minimum',
  'exclusiveMinimum',
  'minLength',
  'minItems',
  'minProperties',
  'minContains'
]

// Merged by key rather than replaced, so a derived schema adds to the base.
export const ADDITIVE_MAPS = [
  'properties',
  'patternProperties',
  'dependentSchemas',
  'dependentRequired',
  '$defs',
  'definitions'
]

// Unioned rather than replaced.
export const ADDITIVE_ARRAYS = ['required']
