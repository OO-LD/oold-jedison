import Jedison from '../../src/index.js'
import classes from '../json/oold/classes.json'
import instances from '../json/oold/instances.json'

const { createStaticBackend } = Jedison.oold.backend

export const BASE = 'https://demo.oo-ld.org/schemas/'

/**
 * The demo backend the OO-LD examples run against.
 *
 * Static on purpose: every feature has to be exercisable with no server, and
 * the static adapter is the oracle the other three are tested against, so
 * what the playground shows is what a real backend has to reproduce.
 */
export function createDemoBackend () {
  const schemas = {}

  for (const schema of Object.values(classes)) {
    schemas[schema.$id] = schema
  }

  return createStaticBackend({
    baseUri: BASE,
    schemas,
    instances: instances.map((record) => ({ ...record })),
    idPrefix: 'urn:demo:new-'
  })
}

/**
 * The classes offered by the type switcher, in hierarchy order.
 */
export function demoClasses () {
  return Object.values(classes).map((schema) => ({
    id: schema.$id,
    title: schema.title
  }))
}

export function classSchema (id) {
  return Object.values(classes).find((schema) => schema.$id === id)
}

export const OOLD_EXAMPLES = [
  'oold/inline-create',
  'oold/union-range',
  'oold/type-switch',
  'oold/tree-select',
  'oold/autocomplete',
  'oold/density'
]

export function isOoldExample (name) {
  return typeof name === 'string' && name.startsWith('oold/')
}
