import EditorString from '../../editors/string.js'
import { isSet, isString } from '../../helpers/utils.js'
import { getSchemaType, getSchemaXOption } from '../../helpers/schema.js'
import { OOLD_RANGE } from '../constants.js'
import { normaliseRange } from '../preprocess/range.js'
import { SuggestController } from '../ui/suggest-controller.js'

const RESOLVED = 'x-oold-range-resolved'

/**
 * Reads the OO-LD configuration jedison carries for us on its options.
 */
export function getOoldOptions (instance) {
  return instance.jedison.getOption('oold') ?? {}
}

/**
 * Picks the backend a property should talk to.
 *
 * A form is not limited to one source: a schema may name a backend per
 * property, which is how the same control reaches a local store for one field
 * and a public endpoint for the next.
 */
export function resolveBackend (oold, schema) {
  const named = schema?.['x-oold-jedison-source']?.backend

  if (named && oold.backends && oold.backends[named]) {
    return oold.backends[named]
  }

  return oold.backend
}

export function getRangeSpec (schema) {
  if (isSet(schema[RESOLVED])) {
    return schema[RESOLVED]
  }

  if (isSet(schema[OOLD_RANGE])) {
    return normaliseRange(schema[OOLD_RANGE])
  }

  return undefined
}

/**
 * A typed reference to another entity.
 *
 * The value is an identifier, the control shows a label, and the backend's
 * capabilities decide which of clear, create, edit and clone are offered. A
 * control that cannot create simply has no create button, rather than one that
 * fails when clicked.
 */
class EditorOoldRange extends EditorString {
  static resolves (schema) {
    return getSchemaType(schema) === 'string' && isSet(getRangeSpec(schema))
  }

  static priority () {
    return 100
  }

  build () {
    const schema = this.instance.schema
    const oold = getOoldOptions(this.instance)

    this.spec = getRangeSpec(schema) ?? { classes: [], union: false }
    this.backend = resolveBackend(oold, schema)
    this.host = oold.host

    this.control = this.theme.getInputControl({
      title: this.getTitle(),
      description: this.getDescription(),
      type: 'text',
      id: this.getIdFromPath(this.instance.path),
      titleIconClass: getSchemaXOption(schema, 'titleIconClass'),
      titleHidden: getSchemaXOption(schema, 'titleHidden'),
      info: this.getInfo()
    })

    this.controller = new SuggestController({
      backend: this.backend,
      spec: {
        ...this.spec,
        classes: this.sourceClasses(schema),
        limit: schema['x-oold-jedison-source']?.limit ?? getSchemaXOption(schema, 'oold-limit')
      },
      language: oold.language,
      templates: {
        render: schema['x-oold-jedison-render-template'],
        label: schema['x-oold-jedison-label-template'],
        store: schema['x-oold-jedison-store-template']
      }
    })

    this.buildSuggestionList()
    this.buildActions()
  }

  /**
   * A remote source may state the class to search directly, for endpoints
   * whose classes are not OO-LD schema URLs.
   */
  sourceClasses (schema) {
    const stated = schema['x-oold-jedison-source']?.class

    if (typeof stated === 'string' && stated !== '') {
      return [stated]
    }

    return this.spec.classes
  }

  buildSuggestionList () {
    const list = document.createElement('ul')
    list.classList.add('jedi-oold-suggestions')
    list.setAttribute('role', 'listbox')
    list.style.display = 'none'
    list.style.listStyle = 'none'
    list.style.margin = '0'
    list.style.padding = '0'
    list.style.position = 'absolute'
    list.style.zIndex = '1000'
    list.style.width = '100%'
    list.style.background = 'var(--jedi-oold-bg, #fff)'
    list.style.border = '1px solid rgba(0,0,0,.15)'
    list.style.maxHeight = '18rem'
    list.style.overflowY = 'auto'

    this.suggestionList = list

    const anchor = document.createElement('div')
    anchor.style.position = 'relative'
    anchor.appendChild(list)

    this.control.container.insertBefore(anchor, this.control.description)
  }

  /**
   * Action buttons sit inside the input group, not in a column beside it.
   * A form with several reference properties otherwise spends a large part of
   * its width on buttons.
   */
  buildActions () {
    const group = document.createElement('div')
    group.classList.add('jedi-oold-actions', 'input-group-text')
    group.style.display = 'inline-flex'
    group.style.gap = '.125rem'

    this.buttons = {}

    const wanted = [
      ['clear', 'close', 'oold.clear'],
      ['create', 'add', 'oold.create'],
      ['edit', 'edit', 'oold.edit'],
      ['clone', 'copy', 'oold.clone']
    ]

    for (const [name, icon, translationKey] of wanted) {
      const button = this.theme.getButton({
        content: this.translate(translationKey),
        icon,
        id: `${this.getIdFromPath(this.instance.path)}-${name}`
      })

      button.classList.add(`jedi-oold-${name}`)
      this.buttons[name] = button
      group.appendChild(button)
    }

    const wrapper = document.createElement('div')
    wrapper.classList.add('jedi-oold-input-group', 'input-group')
    wrapper.style.display = 'flex'
    wrapper.style.flexWrap = 'nowrap'

    this.control.input.parentNode.insertBefore(wrapper, this.control.input)
    wrapper.appendChild(this.control.input)
    wrapper.appendChild(group)

    this.actionsGroup = group
  }

  translate (key) {
    const fallback = {
      'oold.clear': 'Clear',
      'oold.create': 'Create',
      'oold.edit': 'Edit',
      'oold.clone': 'Clone'
    }

    // translate() returns undefined for a key it does not know.
    return this.instance.jedison.translator.translate(key) ?? fallback[key]
  }

  addEventListeners () {
    this.control.input.addEventListener('input', () => {
      this.controller.input(this.control.input.value)
    })

    this.control.input.addEventListener('blur', () => {
      // Leaving the field with text that was never chosen clears it, because a
      // free string is not a reference.
      window.setTimeout(() => {
        if (this.controller.unhandledInput) {
          this.controller.commit()
          this.instance.setValue('', true, 'user')
        }
        this.hideSuggestions()
      }, 150)
    })

    this.controller.on('results', (records) => this.renderSuggestions(records))

    this.controller.on('change', ({ value, label }) => {
      this.control.input.value = label ?? ''
      this.instance.setValue(value ?? '', true, 'user')
      this.refreshActions()
    })

    this.controller.on('label', (label) => {
      this.control.input.value = label ?? ''
      this.refreshActions()
    })

    this.buttons.clear.addEventListener('click', () => {
      this.controller.clear()
    })

    this.buttons.create.addEventListener('click', () => this.create())
    this.buttons.edit.addEventListener('click', () => this.edit())
    this.buttons.clone.addEventListener('click', () => this.edit({ mode: 'copy' }))
  }

  renderSuggestions (records) {
    const list = this.suggestionList
    list.textContent = ''

    if (!records.length) {
      this.hideSuggestions()
      return
    }

    for (const record of records) {
      const item = document.createElement('li')
      item.setAttribute('role', 'option')
      item.classList.add('jedi-oold-suggestion')
      item.style.cursor = 'pointer'
      item.style.padding = '.25rem .5rem'

      const markup = this.controller.renderSuggestion(record)

      if (isString(markup)) {
        item.innerHTML = this.purifyContent(markup)
      } else {
        item.appendChild(this.defaultSuggestion(record))
      }

      item.addEventListener('mousedown', (event) => {
        // mousedown rather than click: blur would otherwise clear the input
        // before the selection is registered.
        event.preventDefault()
        this.controller.select(record)
        this.hideSuggestions()
      })

      list.appendChild(item)
    }

    list.style.display = 'block'
  }

  defaultSuggestion (record) {
    const row = document.createElement('span')
    row.style.display = 'flex'
    row.style.alignItems = 'center'
    row.style.gap = '.5rem'

    if (isString(record.image)) {
      const image = document.createElement('img')
      image.setAttribute('src', record.image)
      image.setAttribute('alt', '')
      image.style.width = '1.5rem'
      image.style.height = '1.5rem'
      image.style.objectFit = 'cover'
      row.appendChild(image)
    }

    const text = document.createElement('span')
    const label = document.createElement('strong')
    label.textContent = record.label ?? record.id
    text.appendChild(label)

    if (isString(record.description) && record.description !== '') {
      const description = document.createElement('small')
      description.textContent = ` ${record.description}`
      description.style.opacity = '.75'
      text.appendChild(description)
    }

    row.appendChild(text)

    return row
  }

  hideSuggestions () {
    this.suggestionList.style.display = 'none'
  }

  /**
   * Opens a nested editor for a new target. Where the range admits more than
   * one class the target class is chosen first.
   */
  async create () {
    if (!this.host || !this.controller.canCreate) {
      return
    }

    const created = await this.host.create({
      classes: this.spec.classes,
      union: this.spec.union,
      subclassOfRange: this.instance.schema['x-oold-jedison-subclassof-range'],
      anchor: this.buttons.create
    })

    if (created && created.id) {
      this.controller.select(created)
    }
  }

  async edit (options = {}) {
    if (!this.host || !this.controller.canEdit || this.controller.isEmpty) {
      return
    }

    const edited = await this.host.edit({
      id: this.controller.value,
      mode: options.mode,
      classes: this.spec.classes,
      anchor: this.buttons.edit
    })

    if (edited && edited.id) {
      this.controller.select(edited)
    }
  }

  /**
   * Shows only what the backend can actually do, and only what makes sense for
   * the current state.
   */
  refreshActions () {
    const empty = this.controller.isEmpty
    const show = (button, visible) => {
      button.style.display = visible ? '' : 'none'
    }

    show(this.buttons.clear, !empty)
    show(this.buttons.create, empty && this.controller.canCreate && Boolean(this.host))
    show(this.buttons.edit, !empty && this.controller.canEdit && Boolean(this.host))
    show(this.buttons.clone, !empty && this.controller.canCreate && Boolean(this.host))

    this.actionsGroup.style.display = this.actionsGroup.querySelector('button:not([style*="none"])')
      ? 'inline-flex'
      : 'none'
  }

  adaptForHorizontal (labelCol, inputCol) {
    this.theme.adaptForHorizontalInputControl(this.control, labelCol, inputCol)
  }

  sanitize (value) {
    return String(value)
  }

  refreshUI () {
    super.refreshUI()

    const value = this.instance.getValue()

    if (value !== this.controller.value) {
      this.controller.adopt(value)
    }

    this.refreshActions()
  }

  destroy () {
    this.controller.destroy()
    super.destroy()
  }
}

export default EditorOoldRange
