import { isArray, isObject } from '../../helpers/utils.js'
import { carryOver } from '../../helpers/carry-over.js'
import { TreeController } from './tree-controller.js'

/**
 * Merges the edited value over what was remembered.
 *
 * Objects merge by key so a field the current schema does not define survives
 * underneath; anything else replaces, because a half-edited array merged
 * element-wise produces a value the user never typed.
 */
function mergeOver (base, overlay) {
  if (!isObject(base)) {
    return overlay
  }

  if (!isObject(overlay)) {
    return overlay === undefined ? base : overlay
  }

  const result = { ...base }

  for (const [key, value] of Object.entries(overlay)) {
    result[key] = isObject(value) && isObject(result[key]) ? mergeOver(result[key], value) : value
  }

  return result
}

/**
 * Keys present after a restore that the editor did not hold before it.
 */
function restoredPaths (before, after, path = '#') {
  const paths = []

  if (!isObject(after)) {
    return paths
  }

  for (const [key, value] of Object.entries(after)) {
    const here = `${path}/${key}`
    const had = isObject(before) ? before[key] : undefined

    if (had === undefined && value !== undefined && value !== '') {
      paths.push(here)
      continue
    }

    if (isObject(value)) {
      paths.push(...restoredPaths(had, value, here))
    }
  }

  return paths
}

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

    // Everything ever entered, across every class visited. A value dropped
    // by one switch is still here when a class that defines it comes back.
    this.memory = options.memory ?? {}

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
      return { dropped: [], restored: [], switched: false }
    }

    const response = await this.backend.schemas.resolve(classRef)

    if (!response || !response.ok) {
      this.emit('error', new Error(`Schema not available: ${classRef}`))
      return { dropped: [], restored: [], switched: false }
    }

    const target = await response.json()
    const prepared = this.prepare
      ? await this.prepare(target, { baseUri: classRef })
      : { schema: target }

    // What is on screen wins over what was remembered, so an edit is never
    // overwritten by an older value. Everything else is kept, which is what
    // makes switching back to a class restore what was entered under it.
    const current = this.jedison.getValue()
    this.memory = mergeOver(this.memory, current)

    const { dropped } = this.jedison.setSchema(prepared.schema, { data: this.memory })
    const restored = restoredPaths(current, this.jedison.getValue())

    this.currentClass = classRef
    this.tree.rootClasses = [classRef]

    const result = { dropped, restored, switched: true, classRef }

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

    const merged = mergeOver(this.memory, this.jedison.getValue())
    const { dropped } = carryOver(merged, prepared.schema)

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
