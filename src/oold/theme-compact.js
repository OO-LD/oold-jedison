import ThemeBootstrap5 from '../themes/bootstrap5.js'

/**
 * Bootstrap 5 with the vertical rhythm tightened.
 *
 * A subclass rather than an edit to the theme, which is the largest file
 * upstream and therefore the one a rebase is most likely to conflict in.
 *
 * What it changes: nested objects are indented by a left border instead of a
 * nested card, labels sit closer to their inputs, and controls use the small
 * Bootstrap variants. None of it alters structure, so every selector an
 * end-to-end test uses keeps working.
 */
class ThemeOoldCompact extends ThemeBootstrap5 {
  constructor (icons = null, options = {}) {
    super(icons)
    this.density = options.density ?? 'compact'
    this.styleInjected = false
  }

  get isDense () {
    return this.density === 'dense'
  }

  /**
   * Injected once rather than shipped as a stylesheet, so the theme stays a
   * drop-in with no build step for the consumer.
   */
  injectStyles (doc) {
    const target = doc ?? (typeof document !== 'undefined' ? document : undefined)

    if (!target || this.styleInjected || target.getElementById('jedi-oold-compact')) {
      this.styleInjected = true
      return
    }

    const style = target.createElement('style')
    style.setAttribute('id', 'jedi-oold-compact')
    style.textContent = `
.jedi-oold-compact .mb-3 { margin-bottom: .5rem !important; }
.jedi-oold-compact label { margin-bottom: .125rem; font-size: .875rem; }
.jedi-oold-compact .form-text { font-size: .75rem; margin-top: .125rem; }
.jedi-oold-compact fieldset > legend { font-size: .9375rem; margin-bottom: .25rem; }
.jedi-oold-compact fieldset:not(.card) {
  border-left: 2px solid rgba(0,0,0,.08);
  padding-left: .75rem;
  margin-bottom: .5rem;
}
.jedi-oold-compact .jedi-oold-actions { padding: 0 .25rem; }
.jedi-oold-compact .jedi-oold-actions .jedi-btn { padding: .125rem .375rem; }
.jedi-oold-dense .mb-3 { margin-bottom: .25rem !important; }
.jedi-oold-dense label { font-size: .8125rem; }
.jedi-oold-dense .form-control, .jedi-oold-dense .form-select {
  padding: .125rem .375rem;
  font-size: .8125rem;
}
`
    target.head.appendChild(style)
    this.styleInjected = true
  }

  getInputControl (config) {
    const control = super.getInputControl(config)
    this.applyDensity(control.input)
    return control
  }

  getSelectControl (config) {
    const control = super.getSelectControl(config)
    this.applyDensity(control.input)
    return control
  }

  getTextareaControl (config) {
    const control = super.getTextareaControl(config)
    this.applyDensity(control.input)
    return control
  }

  applyDensity (input) {
    if (!input || !this.isDense) {
      return
    }

    if (input.classList.contains('form-select')) {
      input.classList.add('form-select-sm')
    } else {
      input.classList.add('form-control-sm')
    }
  }

  getButton (config) {
    const button = super.getButton(config)

    if (this.isDense) {
      button.classList.add('btn-sm')
    }

    return button
  }
}

export default ThemeOoldCompact

/**
 * Marks the container so the injected rules apply, and injects them.
 */
export function applyDensityClass (container, density) {
  if (!container) {
    return
  }

  container.classList.remove('jedi-oold-compact', 'jedi-oold-dense')

  if (density === 'compact' || density === 'dense') {
    container.classList.add('jedi-oold-compact')
  }

  if (density === 'dense') {
    container.classList.add('jedi-oold-dense')
  }
}
