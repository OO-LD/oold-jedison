import { isArray } from '../../helpers/utils.js'

/**
 * A lazily loaded hierarchy, without any DOM.
 *
 * Children are fetched on expansion rather than up front, because OO-LD has no
 * children index and discovering them means a query per class. Ancestors are
 * fetched once, since the chain above a class is short and fixed.
 */
export class TreeController {
  constructor (options = {}) {
    this.backend = options.backend
    this.rootClasses = isArray(options.rootClasses) ? options.rootClasses : []
    this.multiple = options.multiple === true
    this.includeInstances = options.includeInstances === true
    this.showAncestors = options.showAncestors !== false
    this.language = options.language ?? 'en'

    this.nodes = new Map()
    this.expanded = new Set()
    this.selected = new Set()
    this.listeners = {}
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

  get canExpand () {
    return Boolean(this.backend) && this.backend.can('hasHierarchy')
  }

  node (id) {
    if (!this.nodes.has(id)) {
      this.nodes.set(id, { id, label: id, children: undefined, loading: false, kind: 'class' })
    }

    return this.nodes.get(id)
  }

  /**
   * Builds the starting set: the range classes, preceded by their ancestors
   * where those are shown. Inline creation hides them, since only
   * specialisation is meaningful when creating a target.
   */
  async init () {
    const roots = [...this.rootClasses]

    if (this.showAncestors && this.backend && this.backend.can('hasAncestors')) {
      for (const classRef of this.rootClasses) {
        const ancestors = await this.backend.classes.getSuperclasses(classRef)

        for (const ancestor of isArray(ancestors) ? ancestors : []) {
          if (!roots.includes(ancestor)) {
            roots.unshift(ancestor)
          }
        }
      }
    }

    for (const id of roots) {
      this.node(id)
    }

    // Ancestors become roots of the rendered tree, otherwise they are loaded
    // and then never shown.
    this.rootClasses = roots

    await this.labelAll(roots)
    this.emit('change', this.snapshot())

    return roots
  }

  async expand (id) {
    const node = this.node(id)

    this.expanded.add(id)

    if (node.children !== undefined || !this.canExpand) {
      this.emit('change', this.snapshot())
      return node.children ?? []
    }

    node.loading = true
    this.emit('change', this.snapshot())

    let children = []

    try {
      children = await this.backend.classes.getSubclasses(id, { depth: 1 })
    } catch (error) {
      children = []
      this.emit('error', error)
    }

    const ids = isArray(children) ? children : []

    for (const child of ids) {
      this.node(child)
    }

    if (this.includeInstances && this.backend.can('canSearch')) {
      const instances = await this.backend.instances.search({ classes: [id] }, '', undefined, this.language)

      for (const record of isArray(instances) ? instances : []) {
        const instanceNode = this.node(record.id)
        instanceNode.kind = 'instance'
        instanceNode.label = record.label ?? record.id
        instanceNode.record = record
        ids.push(record.id)
      }
    }

    node.children = ids
    node.loading = false

    await this.labelAll(ids)
    this.emit('change', this.snapshot())

    return ids
  }

  collapse (id) {
    this.expanded.delete(id)
    this.emit('change', this.snapshot())
  }

  toggle (id) {
    return this.expanded.has(id) ? this.collapse(id) : this.expand(id)
  }

  async labelAll (ids) {
    const classes = ids.filter((id) => this.node(id).kind === 'class')

    if (!classes.length || !this.backend || !this.backend.can('canLabel')) {
      return
    }

    const labels = await this.backend.instances.getLabels(classes, this.language)

    for (const [id, label] of Object.entries(labels ?? {})) {
      if (label) {
        this.node(id).label = label
      }
    }
  }

  select (id) {
    if (this.multiple) {
      if (this.selected.has(id)) {
        this.selected.delete(id)
      } else {
        this.selected.add(id)
      }
    } else {
      this.selected = new Set([id])
    }

    this.emit('select', this.value)
    this.emit('change', this.snapshot())

    return this.value
  }

  setValue (value) {
    const values = isArray(value) ? value : [value].filter((entry) => entry !== undefined && entry !== '')
    this.selected = new Set(values)
    this.emit('change', this.snapshot())
  }

  get value () {
    const values = [...this.selected]
    return this.multiple ? values : values[0]
  }

  snapshot () {
    return {
      nodes: [...this.nodes.values()].map((node) => ({ ...node })),
      expanded: [...this.expanded],
      selected: [...this.selected]
    }
  }

  destroy () {
    this.listeners = {}
    this.nodes.clear()
  }
}
