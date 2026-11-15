import { preprocess } from './preprocess/index.js'
import { mergeAllOf, mergeTwo } from './preprocess/merge-all-of.js'
import { resolveMultilang } from './preprocess/multilang.js'
import { mapUiKeywords } from './preprocess/ui-keywords.js'
import { normaliseRange, normaliseRanges } from './preprocess/range.js'
import { stripSemantics } from './preprocess/strip.js'
import { rebase } from './preprocess/rebase.js'
import { OoldRefResolver } from './preprocess/oold-ref.js'
import * as constants from './constants.js'

export {
  preprocess,
  mergeAllOf,
  mergeTwo,
  resolveMultilang,
  mapUiKeywords,
  normaliseRange,
  normaliseRanges,
  stripSemantics,
  rebase,
  OoldRefResolver,
  constants
}
