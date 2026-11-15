import { isArray, isString } from '../../helpers/utils.js'

/**
 * Opens a nested editor for a referenced entity.
 *
 * A dialog rather than an embedded sub-form, so a reference encountered while
 * creating an entity can open another one on top. The host owns nothing about
 * the schema: it asks the backend for the target class and persists through
 * the instance store.
 */
export class InlineCreateHost {
  constructor (options = {}) {
    this.jedison = options.jedison
    this.backend = options.backend
    this.createEditor = options.createEditor
    this.language = options.language ?? 'en'
    this.themeOverride = options.theme
    this.open = []
  }

  /**
   * The theme may be supplied directly so the host can exist before the editor
   * does. The editors ask whether a host is present while they build, so one
   * attached afterwards would leave their buttons hidden.
   */
  get theme () {
    return this.themeOverride ?? (this.jedison ? this.jedison.theme : undefined)
  }

  translate (key, fallback) {
    const translator = this.jedison ? this.jedison.translator : undefined
    return (translator ? translator.translate(key) : undefined) ?? fallback
  }

  /**
   * Reads the human title of a class, falling back to the last path segment.
   * A menu listing raw schema URLs is not usable.
   */
  async classTitle (classRef) {
    try {
      const response = await this.backend.schemas.resolve(classRef)

      if (response && response.ok) {
        const schema = await response.json()

        if (schema && isString(schema.title)) {
          return schema.title
        }
      }
    } catch (error) {
      // Falls through to the identifier.
    }

    return String(classRef).split('/').pop().replace('.schema.json', '')
  }

  /**
   * Picks the class to instantiate. With a single target there is nothing to
   * ask; with several the user chooses before the editor opens.
   */
  async chooseClass (classes, anchor) {
    if (!isArray(classes) || classes.length === 0) {
      return undefined
    }

    if (classes.length === 1) {
      return classes[0]
    }

    const titles = await Promise.all(classes.map((classRef) => this.classTitle(classRef)))

    return this.promptForClass(classes, titles, anchor)
  }

  promptForClass (classes, titles, anchor) {
    return new Promise((resolve) => {
      const menu = document.createElement('ul')
      menu.classList.add('jedi-oold-class-menu', 'dropdown-menu', 'show')
      menu.style.position = 'absolute'
      menu.style.zIndex = '1080'

      const close = (value) => {
        menu.remove()
        document.removeEventListener('mousedown', onOutside, true)
        resolve(value)
      }

      const onOutside = (event) => {
        if (!menu.contains(event.target)) {
          close(undefined)
        }
      }

      classes.forEach((classRef, index) => {
        const item = document.createElement('li')
        const button = document.createElement('button')
        button.setAttribute('type', 'button')
        button.classList.add('dropdown-item', 'jedi-oold-class-option')
        button.setAttribute('data-oold-class', classRef)
        button.textContent = titles[index] ?? classRef
        button.addEventListener('click', () => close(classRef))
        item.appendChild(button)
        menu.appendChild(item)
      })

      const parent = anchor && anchor.parentNode ? anchor.parentNode : document.body
      parent.appendChild(menu)

      document.addEventListener('mousedown', onOutside, true)
    })
  }

  async create (request = {}) {
    // The range says which class to instantiate. A subclass range says where to
    // hang the result in the hierarchy, which the nested editor applies as a
    // default rather than changing which schema is opened.
    const classRef = await this.chooseClass(request.classes, request.anchor)

    if (!classRef) {
      return undefined
    }

    return this.openEditor({
      classRef,
      value: request.value,
      subclassOfRange: request.subclassOfRange,
      title: await this.classTitle(classRef)
    })
  }

  async edit (request = {}) {
    if (!this.backend.can('canLoad')) {
      return undefined
    }

    const loaded = await this.backend.instances.load(request.id)

    if (!loaded) {
      return undefined
    }

    const copy = request.mode === 'copy'
    const value = copy ? { ...loaded, id: undefined } : { ...loaded }
    const classRef = loaded.type ?? (isArray(request.classes) ? request.classes[0] : undefined)

    if (!classRef) {
      return undefined
    }

    return this.openEditor({
      classRef,
      value,
      title: copy
        ? `${this.translate('oold.clone', 'Clone')}: ${loaded.label ?? request.id}`
        : `${this.translate('oold.edit', 'Edit')}: ${loaded.label ?? request.id}`
    })
  }

  /**
   * Builds a dialog around a nested jedison instance and resolves with the
   * saved record, or undefined when the user cancels.
   *
   * getDialog returns a bare <dialog>, which stays invisible until showModal
   * is called, so children go straight on it and it is opened explicitly.
   */
  openEditor (request) {
    return new Promise((resolve) => {
      const dialog = this.theme.getDialog()
      dialog.classList.add('jedi-oold-dialog')
      dialog.style.minWidth = 'min(44rem, 90vw)'

      const header = document.createElement('div')
      header.classList.add('jedi-modal-title', 'jedi-oold-dialog-title')
      header.textContent = request.title ?? ''

      const host = document.createElement('div')
      host.classList.add('jedi-oold-dialog-body')

      const actions = document.createElement('div')
      actions.classList.add('jedi-oold-dialog-actions')
      actions.style.display = 'flex'
      actions.style.gap = '.5rem'
      actions.style.justifyContent = 'flex-end'
      actions.style.marginTop = '.75rem'

      let nested
      let settled = false

      const finish = (result) => {
        if (settled) {
          return
        }

        settled = true

        if (nested && typeof nested.destroy === 'function') {
          nested.destroy()
        }

        if (dialog.open) {
          dialog.close()
        }

        if (dialog.parentNode) {
          dialog.parentNode.removeChild(dialog)
        }

        const index = this.open.indexOf(dialog)

        if (index !== -1) {
          this.open.splice(index, 1)
        }

        resolve(result)
      }

      const cancel = this.theme.getButton({
        content: this.translate('oold.cancel', 'Cancel'),
        icon: 'close'
      })
      cancel.classList.add('jedi-oold-cancel')
      cancel.setAttribute('always-enabled', '')
      cancel.addEventListener('click', () => finish(undefined))

      const save = this.theme.getButton({
        content: this.translate('oold.save', 'Save'),
        icon: 'save'
      })
      save.classList.add('jedi-oold-save')
      save.setAttribute('always-enabled', '')
      save.addEventListener('click', async () => {
        const entity = nested ? nested.getValue() : request.value
        const withType = { type: request.classRef, ...entity }

        if (request.subclassOfRange) {
          withType.subclass_of = request.subclassOfRange
        }

        const saved = await this.backend.instances.save(withType)

        if (!saved || !saved.id) {
          finish(undefined)
          return
        }

        const label = withType.label ?? withType.name ?? saved.id

        finish({ id: saved.id, label, raw: withType })
      })

      // Escape closes the dialog, and the browser fires cancel for that.
      dialog.addEventListener('cancel', (event) => {
        event.preventDefault()
        finish(undefined)
      })

      dialog.appendChild(header)
      dialog.appendChild(host)
      actions.appendChild(cancel)
      actions.appendChild(save)
      dialog.appendChild(actions)

      document.body.appendChild(dialog)
      this.open.push(dialog)
      dialog.showModal()

      Promise.resolve(this.createEditor({ container: host, classRef: request.classRef, value: request.value }))
        .then((editor) => {
          nested = editor
        })
        .catch((error) => {
          console.error('oold: nested editor failed', error)
          finish(undefined)
        })
    })
  }

  destroy () {
    for (const dialog of [...this.open]) {
      if (dialog.open) {
        dialog.close()
      }

      if (dialog.parentNode) {
        dialog.parentNode.removeChild(dialog)
      }
    }

    this.open = []
  }
}
