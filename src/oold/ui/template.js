import { isObject, isArray, isString } from '../../helpers/utils.js'

/**
 * Reads a dotted path, with numeric segments indexing arrays.
 */
export function readPath (value, path) {
  if (!isString(path) || path === '') {
    return value
  }

  let current = value

  for (const segment of path.split('.')) {
    if (segment === '') {
      continue
    }

    if (!isObject(current) && !isArray(current)) {
      return undefined
    }

    current = current[segment]
  }

  return current
}

const ENTITIES = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;'
}

export function escapeHtml (value) {
  return String(value ?? '').replace(/[&<>"']/g, (character) => ENTITIES[character])
}

/**
 * Fills {{path}} from a record.
 *
 * Deliberately small. jedison ships no runtime dependencies and a template
 * engine is not worth acquiring one for; a caller needing more passes a
 * function instead of a string.
 *
 * Values are HTML-escaped unless the triple-brace form is used, so a label
 * arriving from a backend cannot inject markup by default.
 */
export function render (template, data, options = {}) {
  if (typeof template === 'function') {
    return template(data)
  }

  if (!isString(template)) {
    return ''
  }

  const escape = options.escape !== false

  return template
    .replace(/\{\{\{\s*([\w.[\]]+)\s*\}\}\}/g, (match, path) => {
      const value = readPath(data, path)
      return value === undefined || value === null ? '' : String(value)
    })
    .replace(/\{\{\s*([\w.[\]]+)\s*\}\}/g, (match, path) => {
      const value = readPath(data, path)

      if (value === undefined || value === null) {
        return ''
      }

      return escape ? escapeHtml(value) : String(value)
    })
}

/**
 * Picks the value a selection writes into the form.
 *
 * Without a store template the identifier is stored, which is the common case:
 * what is displayed and what is stored differ, and the stored side is the
 * identifier the backend knows.
 */
export function storeValue (record, template) {
  if (!template) {
    return record?.id
  }

  const value = render(template, record, { escape: false })

  return value === '' ? record?.id : value
}

/**
 * Picks the text shown in the collapsed control.
 */
export function labelValue (record, template) {
  if (!template) {
    return record?.label ?? record?.id
  }

  const value = render(template, record, { escape: false })

  return value === '' ? (record?.label ?? record?.id) : value
}
