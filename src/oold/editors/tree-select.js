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
 * Built from the theme's own primitives rather than a tree widget, because
 * jedison carries no runtime dependencies and a bundled one would be the only
 * exception. The markup is a Bootstrap list group, so it inherits whatever the
 * active theme does to list groups and buttons.
 *
 * Scalar properties select one entry, array properties select several.
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

    this.control = this.theme.getInputControl({
      title: this.getTitle(),
      description: this.getDescription(),
      type: 'hidden',
      id: this.getIdFromPath(this.instance.path),
      titleHidden: getSchemaXOption(schema, 'titleHidden'),
      info: this.getInfo()
    })

    this.control.input.classList.add('jedi-hidden-input')

    this.controller = new TreeController({
      backend: this.backend,
      rootClasses: spec.classes,
      multiple: this.multiple,
      includeInstances: getSchemaXOption(schema, 'oold-instances') !== false,
      showAncestors: oold.hideAncestors !== true,
      language: oold.language
    })

    this.tree = document.createElement('div')
    this.tree.classList.add('jedi-oold-tree', 'list-group')
    this.tree.setAttribute('role', 'tree')

    this.control.container.insertBefore(this.tree, this.control.description)

    this.controller.on('change', (snapshot) => this.renderTree(snapshot))
    this.controller.init()
  }

  renderTree (snapshot) {
    const byId = new Map(snapshot.nodes.map((node) => [node.id, node]))
    const expanded = new Set(snapshot.expanded)
    const selected = new Set(snapshot.selected)
    const roots = this.controller.rootClasses
    const seen = new Set()

    this.tree.textContent = ''

    const renderNode = (id, depth) => {
      if (seen.has(id)) {
        return
      }

      seen.add(id)

      const node = byId.get(id)

      if (!node) {
        return
      }

      this.tree.appendChild(this.renderRow(node, depth, expanded, selected))

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

  renderRow (node, depth, expanded, selected) {
    const isSelected = selected.has(node.id)
    const row = document.createElement('div')

    row.classList.add('list-group-item', 'jedi-oold-tree-row', 'd-flex', 'align-items-center', 'gap-2')
    row.setAttribute('role', 'treeitem')
    row.setAttribute('data-oold-node', node.id)
    row.setAttribute('data-oold-kind', node.kind)
    row.setAttribute('aria-selected', String(isSelected))
    row.style.paddingLeft = `${0.75 + depth * 1.25}rem`

    if (isSelected) {
      row.classList.add('active')
    }

    row.appendChild(this.renderToggle(node, expanded))
    row.appendChild(this.renderPicker(node, isSelected))

    return row
  }

  renderToggle (node, expanded) {
    if (node.kind !== 'class') {
      // Keeps instances aligned with the classes above them.
      const spacer = document.createElement('span')
      spacer.classList.add('jedi-oold-tree-spacer')
      spacer.style.display = 'inline-block'
      spacer.style.width = '1.75rem'
      return spacer
    }

    const open = expanded.has(node.id)

    const toggle = this.theme.getButton({
      content: open ? 'Collapse' : 'Expand',
      icon: node.loading ? 'switcher' : (open ? 'collapse' : 'expand')
    })

    toggle.classList.add('jedi-oold-tree-toggle', 'btn-sm')
    toggle.setAttribute('always-enabled', '')
    toggle.setAttribute('aria-expanded', String(open))
    this.theme.visuallyHidden(toggle.querySelector('span'))

    if (node.loading) {
      toggle.setAttribute('disabled', 'disabled')
    }

    toggle.addEventListener('click', () => this.controller.toggle(node.id))

    return toggle
  }

  renderPicker (node, isSelected) {
    const label = node.label ?? node.id

    if (!this.multiple) {
      const picker = document.createElement('button')
      picker.setAttribute('type', 'button')
      picker.classList.add('jedi-oold-tree-select', 'btn', 'btn-link', 'p-0', 'text-decoration-none')
      picker.setAttribute('always-enabled', '')
      picker.textContent = label

      if (node.kind === 'instance') {
        picker.classList.add('fst-italic')
      }

      picker.addEventListener('click', () => this.pick(node.id))

      return picker
    }

    const wrapper = document.createElement('div')
    wrapper.classList.add('form-check', 'm-0')

    const input = document.createElement('input')
    input.setAttribute('type', 'checkbox')
    input.classList.add('form-check-input', 'jedi-oold-tree-check')
    input.setAttribute('id', `${this.getIdFromPath(this.instance.path)}-${encodeURIComponent(node.id)}`)
    input.checked = isSelected
    input.addEventListener('change', () => this.pick(node.id))

    const text = document.createElement('label')
    text.classList.add('form-check-label')
    text.setAttribute('for', input.getAttribute('id'))
    text.textContent = label

    wrapper.appendChild(input)
    wrapper.appendChild(text)

    return wrapper
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
