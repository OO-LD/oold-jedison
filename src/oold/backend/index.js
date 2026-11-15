export { RequestCache, Batcher } from './cache.js'
export { SchemaStore, InstanceStore, ClassIndex, supports } from './interfaces.js'
export { Backend } from './backend.js'
export {
  StaticSchemaStore,
  StaticInstanceStore,
  StaticClassIndex,
  createStaticBackend
} from './static.js'
export {
  RestSchemaStore,
  RestInstanceStore,
  RestClassIndex,
  createRestBackend,
  expandTemplate,
  readPath
} from './rest.js'
export {
  SparqlInstanceStore,
  SparqlClassIndex,
  createSparqlBackend,
  escapeLiteral,
  escapeIri,
  fillQuery,
  bindingsToRecords,
  WIKIDATA_QUERIES
} from './sparql.js'
export {
  OswSchemaStore,
  OswInstanceStore,
  OswClassIndex,
  createOswBackend,
  subclassChainQuery,
  escapeAsk,
  DEFAULT_PROPERTIES
} from './osw.js'
