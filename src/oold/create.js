import Create from '../jedison.js'
import RefParser from '../ref-parser/ref-parser.js'
import { clone } from '../helpers/utils.js'
import { preprocess } from './preprocess/index.js'
import { rebase } from './preprocess/rebase.js'
import EditorOoldRange from './editors/range.js'
import EditorOoldAutocomplete from './editors/autocomplete.js'
import EditorOoldTreeSelect from './editors/tree-select.js'
import EditorOoldTreeSelectWunderbaum from './editors/tree-select-wunderbaum.js'
import { InlineCreateHost } from './ui/inline-create.js'
import { assignGrid, densityOptions, applyDensity } from './density.js'

// Wunderbaum first: it resolves only when the host page has loaded it, and
// falls through to the themed rows when it has not.
export const OOLD_EDITORS = [
  EditorOoldTreeSelectWunderbaum,
  EditorOoldTreeSelect,
  EditorOoldRange,
  EditorOoldAutocomplete
]

/**
 * Resolves an OO-LD document and turns it into a schema jedison renders.
 *
 * Rebasing comes first: a document with a relative $id cannot resolve its
 * relative references, and the failure surfaces later as a type error rather
 * than at resolution.
 */
export async function prepareSchema (schema, options = {}) {
  // rebase returns a copy; without a base one is made here, because
  // expandRecursive inlines in place and must not touch the caller's schema.
  const based = options.baseUri ? rebase(schema, options.baseUri) : clone(schema)
  const refParser = options.refParser ?? new RefParser({
    fetch: options.backend ? options.backend.toFetch() : options.fetch
  })

  await refParser.dereference(based)

  // dereference only builds the reference map; expand is what inlines. The
  // allOf merge has to see the parent's properties, so expansion is eager here
  // rather than per node as jedison does it while rendering.
  refParser.expandRecursive(based)

  const { schema: form, collected } = preprocess(based, options)
  // Grid is a schema decision and stays opt-in, independent of the skin.
  const laidOut = assignGrid(form, {
    enabled: options.autoGrid === true,
    tight: options.density === 'dense'
  })

  return { schema: laidOut, collected, refParser }
}

/**
 * Builds a jedison editor wired for OO-LD.
 *
 * Everything is added through the documented extension points: the editors
 * through customEditors, the backend through the ref parser's fetch, and the
 * OO-LD configuration through an option the editors read back. No upstream
 * file is involved.
 */
export async function createOoldEditor (options = {}) {
  const { schema, collected, refParser } = await prepareSchema(options.schema ?? {}, options)

  const oold = {
    backend: options.backend,
    language: options.language ?? 'en',
    hideAncestors: options.hideAncestors === true,
    density: options.density ?? 'comfortable',
    collected
  }

  const density = options.density ?? 'comfortable'

  const jedison = new Create({
    // The density preset is applied first, so an explicit option still wins.
    ...densityOptions(density),
    // Keeps the fields of a newly chosen class visible after a type switch,
    // rather than only those the carried value happened to fill.
    keepMissingSchemaFields: true,
    ...options.jedison,
    container: options.container,
    schema,
    data: options.data,
    refParser,
    language: oold.language,
    customEditors: [...OOLD_EDITORS, ...(options.customEditors ?? [])],
    oold
  })

  // The host needs the editor it lives in, so it is attached after construction
  // and reaches the editors through the same option object.
  if (options.backend) {
    oold.host = options.host ?? new InlineCreateHost({
      jedison,
      backend: options.backend,
      language: oold.language,
      createEditor: async ({ container, classRef, value }) => {
        const response = await options.backend.schemas.resolve(classRef)
        const target = response && response.ok ? await response.json() : {}

        return createOoldEditor({
          ...options,
          container,
          schema: target,
          data: value,
          baseUri: options.baseUri ?? classRef
        })
      }
    })
  }

  applyDensity(options.container, density)

  jedison.oold = oold

  return jedison
}
