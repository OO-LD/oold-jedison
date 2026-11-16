import { isArray, isObject, isSet } from '../../helpers/utils.js'
import { getSchemaXOption } from '../../helpers/schema.js'
import EditorOoldTreeSelect from './tree-select.js'

/**
 * The hierarchy rendered by Wunderbaum, when the host page has loaded it.
 *
 * Follows the same contract as every other third-party editor in the library:
 * nothing is bundled, `resolves` probes the global, and the themed rows stay
 * as the fallback when the global is absent.
 *
 * Wunderbaum covers what a class browser needs without being assembled from
 * parts: lazy loading, multi-select, treegrid columns for metadata, and a
 * filter. It has no dependencies of its own and ships a UMD build.
 *
 *   <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/wunderbaum/dist/wunderbaum.css">
 *   <script src="https://cdn.jsdelivr.net/npm/wunderbaum/dist/wunderbaum.umd.min.js"></script>
 */
class EditorOoldTreeSelectWunderbaum extends EditorOoldTreeSelect {
  static resolves (schema) {
    // A schema may ask for the plain rows even where the library is loaded,
    // which is the only lever available: resolves sees the schema and nothing
    // else, so this cannot be a global option.
    if (getSchemaXOption(schema, 'oold-tree-widget') === 'basic') {
      return false
    }

    return EditorOoldTreeSelect.resolves(schema) && EditorOoldTreeSelectWunderbaum.available()
  }

  static available () {
    return Boolean(typeof window !== 'undefined' && window.mar10 && window.mar10.Wunderbaum)
  }

  static priority () {
    return 120
  }

  /**
   * Label plus the metadata columns. `*` is Wunderbaum's node-title column.
   */
  static defaultColumns () {
    // Widths must be px or a plain number; anything else throws during the
    // first viewport update and the tree renders empty.
    return [
      { id: '*', title: 'Entry', width: '280px' },
      { id: 'kind', title: 'Kind', width: '90px' },
      { id: 'id', title: 'Identifier', width: '*' }
    ]
  }

  mountTree (host) {
    this.treeContainer = host

    this.tree = document.createElement('div')
    this.tree.classList.add('jedi-oold-tree', 'jedi-oold-tree-wb')
    this.tree.setAttribute('id', `${this.getIdFromPath(this.instance.path)}-wb`)
    this.tree.style.height = '24rem'

    this.buildSearch(host)
    host.appendChild(this.tree)

    this.buildWunderbaum()
  }

  /**
   * Wunderbaum owns its search behaviour, so the base class box is rewired to
   * its filter rather than to the themed row rendering.
   */
  applyFilter (text) {
    if (!this.wunderbaum) {
      return
    }

    if (!text) {
      this.wunderbaum.clearFilter()
      return
    }

    this.wunderbaum.filterNodes(String(text), { mode: 'hide', fuzzy: false })
  }

  buildWunderbaum () {
    const columns = getSchemaXOption(this.instance.schema, 'oold-tree-columns') ??
      EditorOoldTreeSelectWunderbaum.defaultColumns()

    const options = {
      element: this.tree,
      id: `${this.getIdFromPath(this.instance.path)}-wbtree`,
      selectMode: this.multiple ? 'multi' : 'single',
      checkbox: this.multiple,
      filter: { mode: 'hide', autoApply: true },
      // source takes data, not a callback. A function here silently renders an
      // empty tree, so the roots are loaded and handed over explicitly below.
      source: [],
      lazyLoad: (event) => this.loadChildren(event),
      ...(getSchemaXOption(this.instance.schema, 'oold-wunderbaum') ?? {})
    }

    if (isArray(columns) && columns.length > 1) {
      options.columns = columns
    }

    if (isArray(options.columns)) {
      // Extra columns stay empty unless they are written on render; the node
      // data is not mapped onto them automatically.
      options.render = (event) => this.renderColumns(event)
    }

    if (this.multiple) {
      options.select = () => this.syncFromTree()
    } else {
      options.activate = () => this.syncFromTree()
    }

    this.wunderbaum = new window.mar10.Wunderbaum(options)

    this.controller.init()
      .then((ids) => this.wunderbaum.load(this.nodesFor(ids)))
      .then(() => this.restoreSelection())
      .catch((error) => console.error('oold: wunderbaum load failed', error))
  }

  /**
   * Fills the metadata columns from the node data.
   */
  renderColumns (event) {
    const columns = event.allColInfosById

    if (!columns || !event.node) {
      return
    }

    const data = event.node.data ?? {}

    for (const [id, info] of Object.entries(columns)) {
      if (id === '*' || !info || !info.elem) {
        continue
      }

      const value = data[id] ?? event.node[id]
      info.elem.textContent = value === undefined || value === null ? '' : String(value)
    }
  }

  /**
   * Wunderbaum node shape. `lazy` is what makes it ask for children later,
   * so an instance, which has none, is not given an expander.
   */
  toNode (entry) {
    return {
      key: entry.id,
      title: entry.label ?? entry.id,
      lazy: entry.kind === 'class',
      type: entry.kind,
      kind: entry.kind === 'class' ? 'class' : 'instance',
      id: entry.id
    }
  }

  nodesFor (ids) {
    const snapshot = this.controller.snapshot()
    const byId = new Map(snapshot.nodes.map((entry) => [entry.id, entry]))

    return (isArray(ids) ? ids : []).map((id) => this.toNode(byId.get(id) ?? { id, label: id, kind: 'class' }))
  }

  async loadChildren (event) {
    const key = event && event.node ? event.node.key : undefined

    if (!isSet(key)) {
      return []
    }

    return this.nodesFor(await this.controller.expand(key))
  }

  /**
   * Reads the selection out of the widget rather than tracking it separately,
   * so the widget stays the source of truth for what the user clicked.
   */
  syncFromTree () {
    if (!this.wunderbaum) {
      return
    }

    if (this.multiple) {
      const keys = this.wunderbaum.getSelectedNodes().map((node) => node.key)

      this.controller.setValue(keys)
      this.instance.setValue(keys, true, 'user')
      this.renderPills()
      return
    }

    const active = this.wunderbaum.getActiveNode()
    const key = active ? active.key : ''

    this.controller.setValue(key)
    this.instance.setValue(key, true, 'user')
    this.renderPills()
  }

  restoreSelection () {
    if (!this.wunderbaum) {
      return
    }

    for (const id of this.selectedIds()) {
      const node = this.wunderbaum.findKey(id)

      if (!node) {
        continue
      }

      if (this.multiple) {
        node.setSelected(true)
      } else {
        node.setActive(true)
      }
    }
  }

  /**
   * The base class re-renders the themed rows on every controller change.
   * Wunderbaum owns its own DOM, so that is suppressed here.
   */
  renderTree () {}

  unmountTree () {
    if (this.wunderbaum && typeof this.wunderbaum.destroy === 'function') {
      this.wunderbaum.destroy()
    }

    this.wunderbaum = null
    super.unmountTree()
  }

  refreshUI () {
    this.refreshDisabledState()
    this.controller.setValue(this.instance.getValue())
    this.renderPills()
    this.restoreSelection()
  }
}

export default EditorOoldTreeSelectWunderbaum

/**
 * Where to load Wunderbaum from, for a host page that wants the richer widget.
 */
export const WUNDERBAUM_CDN = {
  js: 'https://cdn.jsdelivr.net/npm/wunderbaum@0.15.0/dist/wunderbaum.umd.min.js',
  css: 'https://cdn.jsdelivr.net/npm/wunderbaum@0.15.0/dist/wunderbaum.css'
}

export function isWunderbaumNode (value) {
  return isObject(value) && isSet(value.key) && isSet(value.title)
}
