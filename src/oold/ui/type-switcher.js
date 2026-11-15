import { isArray } from '../../helpers/utils.js'
import { carryOver } from '../../helpers/carry-over.js'
import { TreeController } from './tree-controller.js'

/**
 * Changes the schema of an open editor.
 *
 * The control is the same hierarchy view used for selection, so browsing for a
 * class and switching to it are the same gesture. What is specific here is what
 * happens on selection: the target schema is fetched, preprocessed and handed
 * to setSchema, which carries the entered values across and reports whatever it
 * could not keep.
 */
export class TypeSwitcher {
  constructor (options = {}) {
    this.jedison = options.jedison
    this.backend = options.backend
    this.prepare = options.prepare
    this.language = options.language ?? 'en'
    this.currentClass = options.currentClass
    this.onSwitch = options.onSwitch
    this.listeners = {}

    this.tree = new TreeController({
      backend: this.backend,
      rootClasses: this.currentClass ? [this.currentClass] : [],
      multiple: false,
      includeInstances: false,
      // Inline creation shows only specialisation, since moving an entity up
      // the hierarchy while creating it is not a meaningful gesture.
      showAncestors: options.showAncestors !== false,
      language: this.language
    })
  }

  on (name, callback) {
    this.listeners[name] = this.listeners[name] ?? []
    this.listeners[name].push(callback)
    return this
  }

  emit (name, payload) {
    for (const callback of this.listeners[name] ?? []) {
      callback(payload)
    }
  }

  async init () {
    return this.tree.init()
  }

  async expand (classRef) {
    return this.tree.expand(classRef)
  }

  /**
   * Switches the open editor to another class.
   *
   * Returns the dropped paths so the caller can tell the user what was lost,
   * which is the whole reason setSchema reports them.
   */
  async switchTo (classRef) {
    if (!classRef || classRef === this.currentClass) {
      return { dropped: [], switched: false }
    }

    const response = await this.backend.schemas.resolve(classRef)

    if (!response || !response.ok) {
      this.emit('error', new Error(`Schema not available: ${classRef}`))
      return { dropped: [], switched: false }
    }

    const target = await response.json()
    const prepared = this.prepare
      ? await this.prepare(target, { baseUri: classRef })
      : { schema: target }

    const { dropped } = this.jedison.setSchema(prepared.schema)

    this.currentClass = classRef
    this.tree.rootClasses = [classRef]

    const result = { dropped, switched: true, classRef }

    this.emit('switch', result)

    if (typeof this.onSwitch === 'function') {
      this.onSwitch(result)
    }

    return result
  }

  /**
   * Describes what a switch would cost, without performing it.
   *
   * Lets a caller warn before the change rather than report after it.
   */
  async preview (classRef) {
    const response = await this.backend.schemas.resolve(classRef)

    if (!response || !response.ok) {
      return { dropped: [], available: false }
    }

    const target = await response.json()
    const prepared = this.prepare
      ? await this.prepare(target, { baseUri: classRef })
      : { schema: target }

    const { dropped } = carryOver(this.jedison.getValue(), prepared.schema)

    return { dropped, available: true, schema: prepared.schema }
  }

  snapshot () {
    return this.tree.snapshot()
  }

  get classes () {
    return isArray(this.tree.rootClasses) ? this.tree.rootClasses : []
  }

  destroy () {
    this.tree.destroy()
    this.listeners = {}
  }
}
