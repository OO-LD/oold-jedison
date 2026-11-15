import { isArray, isSet } from '../../helpers/utils.js'
import { getSchemaType, getSchemaXOption } from '../../helpers/schema.js'
import EditorOoldRange from './range.js'

const FORMAT = 'oold-autocomplete'

/**
 * Autocomplete for a property that is not a typed reference.
 *
 * Shares the reference control's machinery, since the hard part is the same:
 * what the dropdown shows and what the form stores are different values. The
 * difference is that there is no range, so no class to create, and the source
 * may be a static list rather than a backend.
 */
class EditorOoldAutocomplete extends EditorOoldRange {
  static resolves (schema) {
    return getSchemaType(schema) === 'string' && getSchemaXOption(schema, 'format') === FORMAT
  }

  static priority () {
    return 105
  }

  build () {
    const schema = this.instance.schema
    const source = schema['x-oold-jedison-source']

    // A static list is served from memory rather than from the backend, so a
    // schema can offer suggestions with no infrastructure behind it.
    this.staticItems = isArray(source?.items) ? source.items : undefined

    super.build()

    if (this.staticItems) {
      this.controller.backend = this.staticBackend()
    }
  }

  /**
   * Wraps the static list in the small part of the backend surface the
   * controller actually uses.
   */
  staticBackend () {
    const items = this.staticItems.map((item) => (
      typeof item === 'string' ? { id: item, label: item } : item
    ))

    return {
      can: (capability) => capability === 'canSearch' || capability === 'canLabel',
      instances: {
        search: async (spec, userInput) => {
          const needle = String(userInput ?? '').toLowerCase()

          return items.filter((item) => {
            if (!needle) {
              return true
            }

            return `${item.label ?? ''} ${item.description ?? ''}`.toLowerCase().includes(needle)
          })
        },
        getLabels: async (ids) => {
          const map = {}

          for (const item of items) {
            if (ids.includes(item.id)) {
              map[item.id] = item.label
            }
          }

          return map
        },
        getLabel: async (id) => items.find((item) => item.id === id)?.label
      }
    }
  }

  /**
   * No range, so nothing to create. The buttons the parent builds stay hidden.
   */
  refreshActions () {
    const empty = this.controller.isEmpty

    this.buttons.clear.style.display = empty ? 'none' : ''

    for (const name of ['create', 'edit', 'clone']) {
      this.buttons[name].style.display = 'none'
    }

    this.actionsGroup.style.display = empty ? 'none' : 'inline-flex'
  }
}

export { FORMAT }
export default EditorOoldAutocomplete

/**
 * Both editors read the same source configuration, so a schema can move
 * between them without rewriting its keywords.
 */
export function getSourceConfig (schema) {
  const source = schema['x-oold-jedison-source']

  return isSet(source) ? source : undefined
}
