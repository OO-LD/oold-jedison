import { SchemaStore, InstanceStore, ClassIndex, supports } from './interfaces.js'

/**
 * Composes the three stores and reports what the combination can do.
 *
 * The user interface reads `capabilities` and omits controls it cannot support,
 * rather than offering a control that fails when clicked. Whether a given user
 * may create an entity is a question for the backend, so it is answered here at
 * runtime rather than written into the schema.
 */
export class Backend {
  constructor (options = {}) {
    this.name = options.name ?? 'backend'
    this.schemas = options.schemas ?? new SchemaStore(options)
    this.instances = options.instances ?? new InstanceStore(options)
    this.classes = options.classes ?? new ClassIndex(options)
    this.overrides = options.capabilities ?? {}
  }

  get capabilities () {
    const derived = {
      canSearch: supports(this.instances, 'search'),
      canLabel: supports(this.instances, 'getLabels'),
      canLoad: supports(this.instances, 'load'),
      canCreate: supports(this.instances, 'save'),
      canEdit: supports(this.instances, 'save') && supports(this.instances, 'load'),
      canDelete: supports(this.instances, 'remove'),
      canReverse: supports(this.instances, 'getReverse'),
      hasHierarchy: supports(this.classes, 'getSubclasses'),
      hasAncestors: supports(this.classes, 'getSuperclasses'),
      hasMetaclasses: supports(this.classes, 'getMetaclasses'),
      canListClasses: supports(this.schemas, 'listClasses')
    }

    // An override only ever removes a capability. Claiming one the adapter does
    // not implement would move the failure to the click rather than prevent it.
    const result = {}

    for (const [key, value] of Object.entries(derived)) {
      result[key] = key in this.overrides ? Boolean(this.overrides[key]) && value : value
    }

    return result
  }

  can (capability) {
    return this.capabilities[capability] === true
  }

  /**
   * The fetch to hand to jedison as options.fetch, so $ref resolution goes
   * through this backend.
   */
  toFetch () {
    return this.schemas.toFetch()
  }

  clearCaches () {
    for (const store of [this.schemas, this.instances, this.classes]) {
      if (store && store.cache && typeof store.cache.clear === 'function') {
        store.cache.clear()
      }
    }
  }
}
