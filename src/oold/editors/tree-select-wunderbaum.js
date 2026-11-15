import { isArray, isObject, isSet } from '../../helpers/utils.js'
import { getSchemaXOption } from '../../helpers/schema.js'
import EditorOoldTreeSelect from './tree-select.js'

/**
 * The hierarchy rendered by Wunderbaum, when the host page has loaded it.
 *
 * Follows the same contract as every other third-party editor in the library:
 * nothing is bundled, `resolves` probes the global, and the themed list-group
 * editor stays as the fallback when the global is absent.
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
    return [
      { id: '*', title: 'Class', width: '20rem' },
      { id: 'kind', title: 'Kind', width: '6rem' },
      { id: 'id', title: 'Identifier', width: '*' }
    ]
  }

  build () {
    super.build()

    // The themed rows are replaced, not layered over.
    this.tree.textContent = ''
    this.tree.classList.remove('list-group')
    this.tree.classList.add('wb-skeleton', 'jedi-oold-tree-wb')
    this.tree.style.minHeight = '12rem'

    this.buildSearch()
    this.buildWunderbaum()
  }

  buildSearch () {
    if (getSchemaXOption(this.instance.schema, 'oold-tree-search') === false) {
      return
    }

    const search = document.createElement('input')
    search.setAttribute('type', 'search')
    search.classList.add('form-control', 'jedi-oold-tree-search')
    search.setAttribute('placeholder', 'Filter')

    search.addEventListener('input', () => {
      if (!this.wunderbaum) {
        return
      }

      if (search.value === '') {
        this.wunderbaum.clearFilter()
        return
      }

      this.wunderbaum.filterNodes(search.value, { mode: 'dim', fuzzy: false })
    })

    this.control.container.insertBefore(search, this.tree)
    this.search = search
  }

  buildWunderbaum () {
    const columns = getSchemaXOption(this.instance.schema, 'oold-tree-columns') ??
      EditorOoldTreeSelectWunderbaum.defaultColumns()

    const options = {
      element: this.tree,
      id: `${this.getIdFromPath(this.instance.path)}-wb`,
      selectMode: this.multiple ? 'multi' : 'single',
      checkbox: this.multiple,
      filter: { mode: 'dim', autoApply: true },
      source: (event) => this.loadRoots(event),
      lazyLoad: (event) => this.loadChildren(event),
      ...(getSchemaXOption(this.instance.schema, 'oold-wunderbaum') ?? {})
    }

    // Columns turn the tree into a treegrid. Only worth it when there is more
    // than the title to show.
    if (isArray(columns) && columns.length > 1) {
      options.columns = columns
    }

    if (this.multiple) {
      options.select = () => this.syncFromTree()
    } else {
      options.activate = () => this.syncFromTree()
    }

    this.wunderbaum = new window.mar10.Wunderbaum(options)
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
      kind: entry.kind === 'class' ? 'Class' : 'Instance',
      id: entry.id
    }
  }

  nodesFor (ids) {
    const snapshot = this.controller.snapshot()
    const byId = new Map(snapshot.nodes.map((entry) => [entry.id, entry]))

    return (isArray(ids) ? ids : []).map((id) => this.toNode(byId.get(id) ?? { id, label: id, kind: 'class' }))
  }

  async loadRoots () {
    return this.nodesFor(await this.controller.init())
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
      return
    }

    const active = this.wunderbaum.getActiveNode()
    const key = active ? active.key : ''

    this.controller.setValue(key)
    this.instance.setValue(key, true, 'user')
  }

  /**
   * The base class re-renders the themed rows on every controller change.
   * Wunderbaum owns its own DOM, so that is suppressed here.
   */
  renderTree () {}

  refreshUI () {
    this.refreshDisabledState()

    if (!this.wunderbaum) {
      return
    }

    const value = this.instance.getValue()
    const wanted = (isArray(value) ? value : [value]).filter(Boolean)

    for (const key of wanted) {
      const node = this.wunderbaum.findKey(key)

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

  destroy () {
    if (this.wunderbaum && typeof this.wunderbaum.destroy === 'function') {
      this.wunderbaum.destroy()
    }

    this.wunderbaum = null
    super.destroy()
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
