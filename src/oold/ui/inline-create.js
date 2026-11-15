import { isArray } from '../../helpers/utils.js'

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
    this.open = []
  }

  get theme () {
    return this.jedison.theme
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

    return this.promptForClass(classes, anchor)
  }

  promptForClass (classes, anchor) {
    return new Promise((resolve) => {
      const menu = document.createElement('ul')
      menu.classList.add('jedi-oold-class-menu', 'dropdown-menu')
      menu.style.display = 'block'
      menu.style.position = 'absolute'
      menu.style.zIndex = '1080'
      menu.style.listStyle = 'none'
      menu.style.margin = '0'
      menu.style.padding = '.25rem'

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

      for (const classRef of classes) {
        const item = document.createElement('li')
        const button = document.createElement('button')
        button.setAttribute('type', 'button')
        button.classList.add('dropdown-item', 'jedi-oold-class-option')
        button.setAttribute('data-oold-class', classRef)
        button.textContent = classRef
        button.addEventListener('click', () => close(classRef))
        item.appendChild(button)
        menu.appendChild(item)
      }

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
      title: classRef
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

    const value = request.mode === 'copy' ? { ...loaded, id: undefined } : loaded
    const classRef = loaded.type ?? (isArray(request.classes) ? request.classes[0] : undefined)

    return this.openEditor({ classRef, value, title: request.id })
  }

  /**
   * Builds a dialog around a nested jedison instance and resolves with the
   * saved record, or undefined when the user cancels.
   */
  openEditor (request) {
    return new Promise((resolve) => {
      const dialog = this.theme.getDialog()
      const body = dialog.content ?? dialog.container ?? dialog
      const host = document.createElement('div')

      body.appendChild(host)
      document.body.appendChild(dialog.container ?? dialog)

      let nested

      const finish = (result) => {
        if (nested && typeof nested.destroy === 'function') {
          nested.destroy()
        }

        const root = dialog.container ?? dialog

        if (root.parentNode) {
          root.parentNode.removeChild(root)
        }

        this.open.pop()
        resolve(result)
      }

      const actions = document.createElement('div')
      actions.classList.add('jedi-oold-dialog-actions')

      const cancel = this.theme.getButton({ content: 'Cancel', icon: 'close' })
      cancel.classList.add('jedi-oold-cancel')
      cancel.addEventListener('click', () => finish(undefined))

      const save = this.theme.getButton({ content: 'Save', icon: 'save' })
      save.classList.add('jedi-oold-save')
      save.addEventListener('click', async () => {
        const entity = nested ? nested.getValue() : request.value
        const saved = await this.backend.instances.save(entity)

        if (!saved || !saved.id) {
          finish(undefined)
          return
        }

        const label = entity?.label ?? entity?.name ?? saved.id

        finish({ id: saved.id, label, raw: entity })
      })

      actions.appendChild(cancel)
      actions.appendChild(save)
      body.appendChild(actions)

      this.open.push(dialog)

      Promise.resolve(this.createEditor({ container: host, classRef: request.classRef, value: request.value }))
        .then((editor) => {
          nested = editor
        })
        .catch(() => finish(undefined))
    })
  }

  destroy () {
    for (const dialog of this.open) {
      const root = dialog.container ?? dialog

      if (root && root.parentNode) {
        root.parentNode.removeChild(root)
      }
    }

    this.open = []
  }
}
