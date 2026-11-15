import Editor from '../../editors/editor.js'
import EditorString from '../../editors/string.js'
import { isArray, isSet } from '../../helpers/utils.js'
import { getSchemaType, getSchemaXOption } from '../../helpers/schema.js'
import { TreeController } from '../ui/tree-controller.js'
import { getRangeSpec, getOoldOptions } from './range.js'

const FORMAT = 'oold-tree-select'

/**
 * Selects a class or an instance through the hierarchy.
 *
 * Scalar properties select one entry, array properties select several. The
 * control is opt-in through x-format, since a reference property is better
 * served by autocomplete until the user actually wants to browse.
 */
class EditorOoldTreeSelect extends EditorString {
  static resolves (schema) {
    if (getSchemaXOption(schema, 'format') !== FORMAT) {
      return false
    }

    const type = getSchemaType(schema)

    return type === 'string' || type === 'array'
  }

  static priority () {
    return 110
  }

  get multiple () {
    return getSchemaType(this.instance.schema) === 'array'
  }

  build () {
    const schema = this.instance.schema
    const oold = getOoldOptions(this.instance)
    const itemSchema = this.multiple && isSet(schema.items) ? schema.items : schema
    const spec = getRangeSpec(itemSchema) ?? { classes: [] }

    this.backend = oold.backend

    this.control = this.theme.getObjectControl
      ? this.theme.getInputControl({
        title: this.getTitle(),
        description: this.getDescription(),
        type: 'hidden',
        id: this.getIdFromPath(this.instance.path),
        titleHidden: getSchemaXOption(schema, 'titleHidden'),
        info: this.getInfo()
      })
      : this.theme.getInputControl({ title: this.getTitle(), type: 'hidden', id: this.getIdFromPath(this.instance.path) })

    this.controller = new TreeController({
      backend: this.backend,
      rootClasses: spec.classes,
      multiple: this.multiple,
      includeInstances: getSchemaXOption(schema, 'oold-instances') !== false,
      showAncestors: oold.hideAncestors !== true,
      language: oold.language
    })

    this.tree = document.createElement('ul')
    this.tree.classList.add('jedi-oold-tree')
    this.tree.setAttribute('role', 'tree')
    this.tree.style.listStyle = 'none'
    this.tree.style.margin = '0'
    this.tree.style.paddingLeft = '0'

    this.control.container.insertBefore(this.tree, this.control.description)

    this.controller.on('change', (snapshot) => this.renderTree(snapshot))
    this.controller.init()
  }

  renderTree (snapshot) {
    const byId = new Map(snapshot.nodes.map((node) => [node.id, node]))
    const expanded = new Set(snapshot.expanded)
    const selected = new Set(snapshot.selected)
    const roots = this.controller.rootClasses

    this.tree.textContent = ''

    const seen = new Set()

    const renderNode = (id, depth) => {
      if (seen.has(id)) {
        return
      }

      seen.add(id)

      const node = byId.get(id)

      if (!node) {
        return
      }

      const item = document.createElement('li')
      item.setAttribute('role', 'treeitem')
      item.setAttribute('data-oold-node', id)
      item.style.paddingLeft = `${depth * 1}rem`
      item.style.display = 'flex'
      item.style.alignItems = 'center'
      item.style.gap = '.25rem'

      if (node.kind === 'class') {
        const toggle = document.createElement('button')
        toggle.setAttribute('type', 'button')
        toggle.classList.add('jedi-oold-tree-toggle')
        toggle.textContent = node.loading ? '...' : (expanded.has(id) ? '-' : '+')
        toggle.addEventListener('click', () => this.controller.toggle(id))
        item.appendChild(toggle)
      }

      const picker = document.createElement(this.multiple ? 'input' : 'button')

      if (this.multiple) {
        picker.setAttribute('type', 'checkbox')
        picker.checked = selected.has(id)
        picker.addEventListener('change', () => this.pick(id))
      } else {
        picker.setAttribute('type', 'button')
        picker.classList.add('jedi-oold-tree-select')
        picker.textContent = node.label ?? id
        picker.style.fontWeight = selected.has(id) ? '700' : '400'
        picker.addEventListener('click', () => this.pick(id))
      }

      item.appendChild(picker)

      if (this.multiple) {
        const label = document.createElement('label')
        label.textContent = node.label ?? id
        item.appendChild(label)
      }

      this.tree.appendChild(item)

      if (expanded.has(id) && isArray(node.children)) {
        for (const child of node.children) {
          renderNode(child, depth + 1)
        }
      }
    }

    for (const root of roots) {
      renderNode(root, 0)
    }
  }

  pick (id) {
    const value = this.controller.select(id)
    this.instance.setValue(this.multiple ? (value ?? []) : (value ?? ''), true, 'user')
  }

  addEventListeners () {}

  sanitize (value) {
    return this.multiple ? value : String(value)
  }

  refreshUI () {
    Editor.prototype.refreshUI.call(this)
    this.controller.setValue(this.instance.getValue())
  }

  destroy () {
    this.controller.destroy()
    super.destroy()
  }
}

export default EditorOoldTreeSelect
