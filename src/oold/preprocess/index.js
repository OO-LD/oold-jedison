import { clone } from '../../helpers/utils.js'
import { mergeAllOf } from './merge-all-of.js'
import { resolveMultilang } from './multilang.js'
import { mapUiKeywords } from './ui-keywords.js'
import { normaliseRanges } from './range.js'
import { stripSemantics } from './strip.js'

/**
 * Turns an OO-LD document into a schema jedison renders.
 *
 * Expects $ref to be resolved already: that is RefParser's job, and since 1.29.0
 * it resolves against the nearest $id, which is the OO-LD idiom.
 *
 * Returns the schema plus what was read out of the stripped keywords, because
 * the caller needs the uuids and the rdf types that the form itself does not.
 */
export function preprocess (schema, options = {}) {
  const language = options.language ?? 'en'
  const fallbackLanguage = options.fallbackLanguage ?? 'en'

  let result = clone(schema)

  // Order matters. Merging first means a derived schema's annotations win before
  // anything reads them. Multilang runs before the UI mapping because it writes
  // x-oold-ui-hint, which the UI mapping then rewrites to x-info.
  result = mergeAllOf(result)
  result = resolveMultilang(result, language, fallbackLanguage)
  result = mapUiKeywords(result)
  result = normaliseRanges(result)

  const { schema: stripped, collected } = stripSemantics(result)

  return { schema: stripped, collected }
}
