import { isArray } from '../../helpers/utils.js'
import { render, storeValue, labelValue } from './template.js'

/**
 * The selection state of a reference control, without any DOM.
 *
 * Holds the distinction the whole feature rests on: what is displayed and what
 * is stored are different values. `value` is what the form keeps, `label` is
 * what the user sees, and typing changes only the second until a suggestion is
 * actually chosen.
 */
export class SuggestController {
  constructor (options = {}) {
    this.backend = options.backend
    this.spec = options.spec ?? {}
    this.templates = options.templates ?? {}
    this.language = options.language ?? 'en'
    this.debounce = options.debounce ?? 200
    this.minLength = options.minLength ?? 0

    this.value = undefined
    this.label = undefined
    this.results = []
    this.pending = false

    // True from the first keystroke until a suggestion is chosen. A control
    // left in this state holds no value, because a free string is not a
    // reference to anything.
    this.unhandledInput = false

    this.listeners = {}
    this.timer = null
    this.requestId = 0
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

  get canSearch () {
    return Boolean(this.backend) && this.backend.can('canSearch')
  }

  get canCreate () {
    return Boolean(this.backend) && this.backend.can('canCreate')
  }

  get canEdit () {
    return Boolean(this.backend) && this.backend.can('canEdit')
  }

  get isEmpty () {
    return this.value === undefined || this.value === null || this.value === ''
  }

  /**
   * Called on every keystroke. Marks the input unhandled and schedules a search.
   */
  input (text) {
    this.unhandledInput = true
    this.label = text
    this.emit('input', text)

    if (this.timer !== null) {
      clearTimeout(this.timer)
    }

    if (!this.canSearch || String(text).length < this.minLength) {
      this.results = []
      this.emit('results', this.results)
      return
    }

    this.timer = setTimeout(() => this.search(text), this.debounce)
  }

  async search (text, formValue) {
    const id = ++this.requestId
    this.pending = true
    this.emit('pending', true)

    let records = []

    try {
      records = await this.backend.instances.search(this.spec, text, formValue, this.language)
    } catch (error) {
      records = []
      this.emit('error', error)
    }

    // A slower earlier request must not overwrite a newer one.
    if (id !== this.requestId) {
      return this.results
    }

    this.pending = false
    this.emit('pending', false)

    this.results = isArray(records) ? records : []
    this.emit('results', this.results)

    return this.results
  }

  /**
   * Accepts a suggestion. This is the only path that produces a value.
   */
  select (record) {
    this.unhandledInput = false
    this.value = storeValue(record, this.templates.store)
    this.label = labelValue(record, this.templates.label)
    this.results = []

    this.emit('change', { value: this.value, label: this.label, record })

    return this.value
  }

  clear () {
    this.unhandledInput = false
    this.value = undefined
    this.label = ''
    this.results = []

    this.emit('change', { value: undefined, label: '', record: undefined })
  }

  /**
   * Resolves what the form currently holds. Partial input yields nothing, which
   * is what stops a half-typed name being stored as if it were a reference.
   */
  commit () {
    if (this.unhandledInput) {
      this.clear()
      return undefined
    }

    return this.value
  }

  /**
   * Adopts a value loaded from storage. The label is unknown at this point and
   * is filled in by the batch that runs once the form is populated.
   */
  async adopt (value) {
    this.unhandledInput = false
    this.value = value

    if (this.isEmpty) {
      this.label = ''
      this.emit('label', this.label)
      return this.label
    }

    this.label = value

    if (this.backend && this.backend.can('canLabel')) {
      const resolved = await this.backend.instances.getLabel(value, this.language)

      // A value set again while the lookup was in flight wins.
      if (resolved && this.value === value) {
        this.label = resolved
      }
    }

    this.emit('label', this.label)

    return this.label
  }

  renderSuggestion (record) {
    if (!this.templates.render) {
      return undefined
    }

    return render(this.templates.render, record)
  }

  destroy () {
    if (this.timer !== null) {
      clearTimeout(this.timer)
      this.timer = null
    }

    this.listeners = {}
  }
}
