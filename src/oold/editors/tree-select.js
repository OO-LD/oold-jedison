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
 * The field itself shows the selection as pills, the way a tag input does, and
 * the tree opens in a dialog when the field is clicked. A tree held open
 * permanently costs more vertical space than the rest of the form together,
 * and most of the time the selection is already made.
 *
 * `x-oold-tree-mode: "inline"` keeps it open for the cases where browsing is
 * the point of the form rather than an occasional detour.
 *
 * The rows are built from the theme's own primitives rather than a tree
 * widget, because jedison carries no runtime dependencies. Where the host page
 * has loaded Wunderbaum, the subclass takes over and renders that instead.
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

  get inline () {
    return getSchemaXOption(this.instance.schema, 'oold-tree-mode') === 'inline'
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

    this.controller.on('change', (snapshot) => {
      this.renderPills()

      if (this.treeContainer) {
        this.renderTree(snapshot)
      }
    })

    this.buildField()

    if (this.inline) {
      this.openInline()
    }
  }

  /**
   * The closed state: pills for what is selected, and a hint when nothing is.
   */
  buildField () {
    const field = document.createElement('div')
    field.classList.add('jedi-oold-pills', 'form-control', 'd-flex', 'flex-wrap', 'align-items-center', 'gap-1')
    field.setAttribute('role', 'button')
    field.setAttribute('tabindex', '0')
    field.style.cursor = 'pointer'
    field.style.minHeight = 'calc(1.5em + .75rem + 2px)'

    field.addEventListener('click', () => this.openPicker())
    field.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault()
        this.openPicker()
      }
    })

    this.field = field
    this.control.container.insertBefore(field, this.control.description)

    this.renderPills()
  }

  selectedIds () {
    const value = this.instance.getValue()
    return (isArray(value) ? value : [value]).filter((entry) => isSet(entry) && entry !== '')
  }

  renderPills () {
    if (!this.field) {
      return
    }

    const ids = this.selectedIds()

    this.field.textContent = ''

    if (!ids.length) {
      const placeholder = document.createElement('span')
      placeholder.classList.add('jedi-oold-pills-empty', 'text-muted')
      placeholder.textContent = this.translate('oold.treeEmpty', 'Click to browse')
      this.field.appendChild(placeholder)
      return
    }

    for (const id of ids) {
      this.field.appendChild(this.renderPill(id))
    }
  }

  renderPill (id) {
    const node = this.controller.nodes.get(id)
    const pill = document.createElement('span')

    pill.classList.add('jedi-oold-pill', 'badge', 'bg-secondary', 'd-inline-flex', 'align-items-center', 'gap-1')
    pill.setAttribute('data-oold-pill', id)

    const label = document.createElement('span')
    label.textContent = node ? (node.label ?? id) : id
    pill.appendChild(label)

    const remove = document.createElement('button')
    remove.setAttribute('type', 'button')
    remove.classList.add('jedi-oold-pill-remove', 'btn-close', 'btn-close-white')
    remove.setAttribute('aria-label', this.translate('oold.remove', 'Remove'))
    remove.style.fontSize = '.5rem'
    remove.addEventListener('click', (event) => {
      // The pill container opens the picker, so removal must not bubble.
      event.stopPropagation()
      this.deselect(id)
    })

    pill.appendChild(remove)

    return pill
  }

  translate (key, fallback) {
    return this.instance.jedison.translator.translate(key) ?? fallback
  }

  deselect (id) {
    const remaining = this.selectedIds().filter((entry) => entry !== id)

    this.controller.setValue(this.multiple ? remaining : (remaining[0] ?? ''))
    this.instance.setValue(this.multiple ? remaining : (remaining[0] ?? ''), true, 'user')
  }

  /**
   * Inline mode renders the tree straight into the control, with no dialog.
   */
  openInline () {
    const host = document.createElement('div')
    host.classList.add('jedi-oold-tree-host')
    this.control.container.insertBefore(host, this.control.description)
    this.mountTree(host)
  }

  openPicker () {
    if (this.dialog) {
      return
    }

    const dialog = this.theme.getDialog()
    dialog.classList.add('jedi-oold-tree-dialog')
    dialog.style.minWidth = 'min(40rem, 92vw)'

    const header = document.createElement('div')
    header.classList.add('jedi-modal-title')
    header.textContent = this.getTitle() ?? ''

    const host = document.createElement('div')
    host.classList.add('jedi-oold-tree-host')

    const done = this.theme.getButton({ content: this.translate('oold.done', 'Done'), icon: 'save' })
    done.classList.add('jedi-oold-tree-done')
    done.setAttribute('always-enabled', '')
    done.addEventListener('click', () => this.closePicker())

    const actions = document.createElement('div')
    actions.classList.add('jedi-oold-dialog-actions')
    actions.style.display = 'flex'
    actions.style.justifyContent = 'flex-end'
    actions.style.marginTop = '.75rem'
    actions.appendChild(done)

    dialog.appendChild(header)
    dialog.appendChild(host)
    dialog.appendChild(actions)

    dialog.addEventListener('cancel', (event) => {
      event.preventDefault()
      this.closePicker()
    })

    document.body.appendChild(dialog)
    this.dialog = dialog
    dialog.showModal()

    this.mountTree(host)
  }

  closePicker () {
    if (!this.dialog) {
      return
    }

    this.unmountTree()

    if (this.dialog.open) {
      this.dialog.close()
    }

    if (this.dialog.parentNode) {
      this.dialog.parentNode.removeChild(this.dialog)
    }

    this.dialog = null
    this.renderPills()
  }

  /**
   * Subclass hook. The themed implementation builds a search box and a list
   * group; Wunderbaum replaces both with its own widget.
   */
  mountTree (host) {
    this.buildSearch(host)

    this.tree = document.createElement('div')
    this.tree.classList.add('jedi-oold-tree', 'list-group')
    this.tree.setAttribute('role', 'tree')
    this.tree.style.maxHeight = '24rem'
    this.tree.style.overflowY = 'auto'

    host.appendChild(this.tree)
    this.treeContainer = host

    this.controller.init().then(() => this.renderTree(this.controller.snapshot()))
  }

  unmountTree () {
    this.tree = null
    this.treeContainer = null
    this.search = null
  }

  buildSearch (host) {
    if (getSchemaXOption(this.instance.schema, 'oold-tree-search') === false) {
      return
    }

    const search = document.createElement('input')
    search.setAttribute('type', 'search')
    search.classList.add('form-control', 'jedi-oold-tree-search', 'mb-2')
    search.setAttribute('placeholder', this.translate('oold.filter', 'Filter'))

    search.addEventListener('input', () => this.applyFilter(search.value))

    host.appendChild(search)
    this.search = search
  }

  /**
   * Hides rows that do not match, keeping ancestors of matches visible so a
   * match deep in the tree is still reachable.
   */
  applyFilter (text) {
    this.filter = String(text ?? '').toLowerCase()
    this.renderTree(this.controller.snapshot())
  }

  matches (node) {
    if (!this.filter) {
      return true
    }

    return String(node.label ?? node.id).toLowerCase().includes(this.filter)
  }

  renderTree (snapshot) {
    if (!this.tree) {
      return
    }

    const byId = new Map(snapshot.nodes.map((node) => [node.id, node]))
    const expanded = new Set(snapshot.expanded)
    const selected = new Set(snapshot.selected)

    this.tree.textContent = ''

    // Children are appended straight to the list, so a parent filtered out
    // would orphan them. Render depth-first and keep the order.
    const append = (id, depth) => {
      const node = byId.get(id)

      if (!node) {
        return false
      }

      const kids = expanded.has(id) && isArray(node.children) ? node.children : []
      const rendered = []
      let anyChild = false

      for (const child of kids) {
        const childRows = append(child, depth + 1)

        if (childRows) {
          anyChild = true
          rendered.push(...childRows)
        }
      }

      if (!this.matches(node) && !anyChild) {
        return false
      }

      return [this.renderRow(node, depth, expanded, selected), ...rendered]
    }

    for (const root of this.controller.rootClasses) {
      const rows = append(root, 0)

      if (rows) {
        for (const row of rows) {
          this.tree.appendChild(row)
        }
      }
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
    row.appendChild(this.renderMeta(node))

    return row
  }

  renderToggle (node, expanded) {
    if (node.kind !== 'class') {
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
      picker.classList.add('jedi-oold-tree-select', 'btn', 'btn-link', 'p-0', 'text-decoration-none', 'flex-grow-1', 'text-start')
      picker.setAttribute('always-enabled', '')
      picker.textContent = label
      picker.addEventListener('click', () => this.pick(node.id))

      return picker
    }

    const wrapper = document.createElement('div')
    wrapper.classList.add('form-check', 'm-0', 'flex-grow-1')

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

  /**
   * The metadata column. A tree of identifiers alone does not say which entry
   * is a class and which an instance.
   */
  renderMeta (node) {
    const meta = document.createElement('small')
    meta.classList.add('jedi-oold-tree-meta', 'text-muted', 'ms-auto')
    meta.textContent = node.kind === 'instance' ? 'instance' : 'class'
    return meta
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
    this.renderPills()
  }

  destroy () {
    this.closePicker()
    this.controller.destroy()
    super.destroy()
  }
}

export default EditorOoldTreeSelect
