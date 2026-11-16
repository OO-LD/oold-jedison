/* global Feature Scenario Before BeforeSuite */
const theme = process.env.THEME || 'barebones'

Feature('oold')

// The first navigation of a run is cold: the bundle is large and the page has
// to boot before anything is interactive. Paying that once here keeps it out of
// whichever scenario happens to run first.
BeforeSuite(({ I }) => {
  I.amOnPage(`playground.html?theme=${theme}`)
  I.waitForElement('#examples', 60)
  I.waitForElement('.jedi-ready', 60)
})

Before(({ I }) => {
  I.amOnPage(`playground.html?theme=${theme}`)
  I.waitForElement('#examples', 30)
})

Scenario('@feature @oold renders a range property as a reference control', ({ I }) => {
  I._selectExample('oold/inline-create', 25)
  I.waitForElement('[data-path="#/works_for"] .jedi-oold-input-group', 10)
  I.seeElement('[data-path="#/works_for"] .jedi-oold-actions')
})

Scenario('@feature @oold suggests instances from the backend', ({ I }) => {
  I._selectExample('oold/inline-create', 25)
  I.waitForElement('[data-path="#/works_for"] input', 10)
  I.fillField('[data-path="#/works_for"] input', 'materi')
  I.waitForElement('[data-path="#/works_for"] .jedi-oold-suggestion', 10)
  I.see('Institute of Materials', '[data-path="#/works_for"] .jedi-oold-suggestions')
})

Scenario('@feature @oold stores the identifier and shows the label', ({ I }) => {
  I._selectExample('oold/inline-create', 25)
  I.waitForElement('[data-path="#/works_for"] input', 10)
  I.fillField('[data-path="#/works_for"] input', 'materi')
  I.waitForElement('[data-path="#/works_for"] .jedi-oold-suggestion', 10)
  I.click('[data-path="#/works_for"] .jedi-oold-suggestion')
  I.waitForValue('[data-path="#/works_for"] input', 'Institute of Materials', 10)
  I.seeInField('#editor-value', 'urn:demo:org-materials')
})

Scenario('@feature @oold clears a half-typed value, a free string is not a reference', ({ I }) => {
  I._selectExample('oold/inline-create', 25)
  I.waitForElement('[data-path="#/works_for"] input', 10)
  I.fillField('[data-path="#/works_for"] input', 'not a real entity')
  I.click('[data-path="#/label"] input')
  I.waitForValue('[data-path="#/works_for"] input', '', 10)
})

Scenario('@feature @oold offers a class choice when the range is a union', ({ I }) => {
  I._selectExample('oold/union-range', 25)
  I.waitForElement('[data-path="#/affiliated_with"] .jedi-oold-create', 10)
  I.click('[data-path="#/affiliated_with"] .jedi-oold-create')
  I.waitForElement('.jedi-oold-class-menu', 10)
  I.seeElement('.jedi-oold-class-option')
})

Scenario('@feature @oold shows the selection as pills, not a permanent tree', ({ I }) => {
  I._selectExample('oold/tree-select', 25)
  I.waitForElement('[data-path="#/primary_class"] .jedi-oold-pills', 10)
  I.dontSeeElement('[data-path="#/primary_class"] .jedi-oold-tree')
  I.see('Click to browse', '[data-path="#/primary_class"] .jedi-oold-pills')
})

Scenario('@feature @oold opens the tree when the field is clicked', ({ I }) => {
  I._selectExample('oold/tree-select', 25)
  I.waitForElement('[data-path="#/primary_class"] .jedi-oold-pills', 10)
  I.click('[data-path="#/primary_class"] .jedi-oold-pills')
  I.waitForElement('dialog.jedi-oold-tree-dialog[open]', 10)
  I.waitForElement('dialog .jedi-oold-tree', 10)
})

Scenario('@feature @oold closes the tree again on done', ({ I }) => {
  I._selectExample('oold/tree-select', 25)
  I.click('[data-path="#/primary_class"] .jedi-oold-pills')
  I.waitForElement('dialog.jedi-oold-tree-dialog[open]', 10)
  I.click('dialog .jedi-oold-tree-done')
  I.waitForInvisible('dialog.jedi-oold-tree-dialog', 10)
})

Scenario('@feature @oold loads children lazily on expand', ({ I }) => {
  I._selectExample('oold/tree-select', 25)
  I.click('[data-path="#/primary_class"] .jedi-oold-pills')
  I.waitForElement('dialog .wb-row .wb-title', 15)
  I.dontSee('Organization', 'dialog .wb-node-list')
  I.click('dialog .wb-row .wb-expander')
  I.waitForText('Organization', 15, 'dialog .wb-node-list')
})

Scenario('@feature @oold writes the selected class into the value', ({ I }) => {
  I._selectExample('oold/tree-select', 25)
  I.click('[data-path="#/primary_class"] .jedi-oold-pills')
  I.waitForElement('dialog .wb-row .wb-title', 15)
  I.click('dialog .wb-row .wb-title')
  I.click('dialog .jedi-oold-tree-done')
  I.waitForInvisible('dialog.jedi-oold-tree-dialog', 10)
  I.waitForElement('[data-path="#/primary_class"] .jedi-oold-pill', 10)
  I.seeInField('#editor-value', 'Thing.schema.json')
})

Scenario('@feature @oold removes a selection from its pill', ({ I }) => {
  I._selectExample('oold/tree-select', 25)
  I.click('[data-path="#/primary_class"] .jedi-oold-pills')
  I.waitForElement('dialog .wb-row .wb-title', 15)
  I.click('dialog .wb-row .wb-title')
  I.click('dialog .jedi-oold-tree-done')
  I.waitForElement('[data-path="#/primary_class"] .jedi-oold-pill-remove', 10)
  I.click('[data-path="#/primary_class"] .jedi-oold-pill-remove')
  I.waitForText('Click to browse', 10, '[data-path="#/primary_class"] .jedi-oold-pills')
})

Scenario('@feature @oold selects several entries for an array property', ({ I }) => {
  I._selectExample('oold/tree-select', 25)
  I.click('[data-path="#/applies_to"] .jedi-oold-pills')
  I.waitForElement('dialog .wb-node-list .wb-row .wb-checkbox', 15)
  I.click('dialog .wb-node-list .wb-row .wb-expander')
  I.waitForText('Organization', 15, 'dialog .wb-node-list')
  I.click('dialog .wb-node-list .wb-row:nth-child(2) .wb-checkbox')
  I.click('dialog .wb-node-list .wb-row:nth-child(3) .wb-checkbox')
  I.click('dialog .jedi-oold-tree-done')
  I.waitForElement('[data-path="#/applies_to"] .jedi-oold-pill', 10)
  I.seeNumberOfVisibleElements('[data-path="#/applies_to"] .jedi-oold-pill', 2)
})

Scenario('@feature @oold shows metadata columns beside the title', ({ I }) => {
  I._selectExample('oold/tree-select', 25)
  I.click('[data-path="#/primary_class"] .jedi-oold-pills')
  I.waitForElement('dialog .wb-row .wb-title', 15)
  I.seeElement('dialog .wb-col-title')
  I.see('class', 'dialog .wb-row')
})

Scenario('@feature @oold filters the tree down to a match', ({ I }) => {
  I._selectExample('oold/tree-select', 25)
  I.click('[data-path="#/primary_class"] .jedi-oold-pills')
  I.waitForElement('dialog .wb-row .wb-title', 15)
  I.fillField('dialog .jedi-oold-tree-search', 'zzzz-no-match')
  // A filter that matches nothing leaves a status row rather than hiding the list.
  I.waitForElement('dialog .wb-row.wb-status-noData', 10)
  I.dontSee('Thing', 'dialog .wb-node-list')
})

Scenario('@feature @oold falls back to themed rows without wunderbaum', ({ I }) => {
  I._selectExample('oold/tree-select', 25)
  I.uncheckOption('#oold-wunderbaum')
  I.click('[data-path="#/primary_class"] .jedi-oold-pills')
  I.waitForElement('dialog .jedi-oold-tree.list-group', 10)
  I.waitForElement('dialog .jedi-oold-tree-row.list-group-item', 10)
})

Scenario('@feature @oold expands and selects in the fallback tree', ({ I }) => {
  I._selectExample('oold/tree-select', 25)
  I.uncheckOption('#oold-wunderbaum')
  I.click('[data-path="#/primary_class"] .jedi-oold-pills')
  I.waitForElement('dialog .jedi-oold-tree-row', 10)
  I.click('dialog .jedi-oold-tree-toggle')
  I.waitForElement('dialog [data-oold-node*="Organization"]', 10)
  I.click('dialog [data-oold-node*="Organization"] .jedi-oold-tree-select')
  I.click('dialog .jedi-oold-tree-done')
  I.waitForElement('[data-path="#/primary_class"] .jedi-oold-pill', 10)
})

Scenario('@feature @oold switches the schema and keeps the entered values', ({ I }) => {
  I._selectExample('oold/type-switch', 25)
  I.waitForElement('[data-path="#/label"] input', 10)
  I.fillField('[data-path="#/label"] input', 'Ada Lovelace')
  I.click('[data-path="#/description"] input')
  I.seeInField('#editor-value', 'Ada Lovelace')
  I.selectOption('#oold-class', 'https://demo.oo-ld.org/schemas/Researcher.schema.json')
  I.waitForElement('[data-path="#/orcid"]', 10)
  I.waitForValue('[data-path="#/label"] input', 'Ada Lovelace', 10)
})

Scenario('@feature @oold reports what a switch dropped', ({ I }) => {
  I._selectExample('oold/type-switch', 25)
  I.waitForElement('[data-path="#/email"] input', 10)
  I.fillField('[data-path="#/email"] input', 'ada@example.org')
  I.click('[data-path="#/label"] input')
  I.selectOption('#oold-class', 'https://demo.oo-ld.org/schemas/Organization.schema.json')
  I.waitForElement('#oold-dropped', 10)
  I.see('#/email', '#oold-dropped')
})

Scenario('@feature @oold puts the label beside the input at dense', async ({ I }) => {
  I._selectExample('oold/density', 25)
  I.waitForElement('[data-path="#/label"] input', 10)
  I.selectOption('#oold-density', 'dense')
  I.waitForElement('#jedison-container[data-jedi-density="dense"]', 10)

  const box = await I.executeScript(() => {
    const c = document.querySelector('[data-path="#/label"]')
    const l = c.querySelector('label').getBoundingClientRect()
    const i = c.querySelector('input').getBoundingClientRect()
    return { leftOf: Math.round(l.right) <= Math.round(i.left) + 2,
             centred: Math.abs((l.top + l.height / 2) - (i.top + i.height / 2)) <= 4 }
  })

  I.assertEqual(box.leftOf, true)
  I.assertEqual(box.centred, true)
})

Scenario('@feature @oold keeps a reference row the same height as a plain row', async ({ I }) => {
  I._selectExample('oold/inline-create', 25)
  I.waitForElement('[data-path="#/works_for"] input', 10)
  I.selectOption('#oold-density', 'dense')
  I.waitForElement('#jedison-container[data-jedi-density="dense"]', 10)

  const diff = await I.executeScript(() => {
    const h = (s) => document.querySelector(s).getBoundingClientRect().height
    return Math.abs(h('[data-path="#/label"]') - h('[data-path="#/works_for"]'))
  })

  // The action buttons must not make a reference field taller than a text one.
  I.assertTrue(diff <= 6)
})

Scenario('@feature @oold leaves the grid off until it is asked for', ({ I }) => {
  I._selectExample('oold/density', 25)
  I.waitForElement('[data-path="#/label"]', 10)
  I.dontSeeElement('[data-path="#"] .jedi-row')
  I.checkOption('#oold-auto-grid')
  I.waitForElement('[data-path="#"] .jedi-row .jedi-col', 10)
  I.seeElement('[data-path="#"] .col-md-6')
})

Scenario('@feature @oold opens a nested editor for inline create', ({ I }) => {
  I._selectExample('oold/inline-create', 25)
  I.waitForElement('[data-path="#/works_for"] .jedi-oold-create', 10)
  I.click('[data-path="#/works_for"] .jedi-oold-create')
  I.waitForElement('dialog.jedi-oold-dialog[open]', 10)
  I.seeElement('dialog.jedi-oold-dialog [data-path="#/label"] input')
})

Scenario('@feature @oold saves an inline created entity into the field', ({ I }) => {
  I._selectExample('oold/inline-create', 25)
  I.waitForElement('[data-path="#/works_for"] .jedi-oold-create', 10)
  I.click('[data-path="#/works_for"] .jedi-oold-create')
  I.waitForElement('dialog.jedi-oold-dialog[open]', 10)
  I.fillField('dialog.jedi-oold-dialog [data-path="#/label"] input', 'New Institute')
  I.click('dialog.jedi-oold-dialog .jedi-oold-save')
  I.waitForInvisible('dialog.jedi-oold-dialog', 10)
  I.waitForValue('[data-path="#/works_for"] input', 'New Institute', 10)
})

Scenario('@feature @oold cancels an inline create without storing anything', ({ I }) => {
  I._selectExample('oold/inline-create', 25)
  I.waitForElement('[data-path="#/works_for"] .jedi-oold-create', 10)
  I.click('[data-path="#/works_for"] .jedi-oold-create')
  I.waitForElement('dialog.jedi-oold-dialog[open]', 10)
  I.click('dialog.jedi-oold-dialog .jedi-oold-cancel')
  I.waitForInvisible('dialog.jedi-oold-dialog', 10)
  I.waitForValue('[data-path="#/works_for"] input', '', 10)
})

Scenario('@feature @oold edits the referenced entity in place', ({ I }) => {
  I._selectExample('oold/inline-create', 25)
  I.waitForElement('[data-path="#/works_for"] input', 10)
  I.fillField('[data-path="#/works_for"] input', 'materi')
  I.waitForElement('[data-path="#/works_for"] .jedi-oold-suggestion', 10)
  I.click('[data-path="#/works_for"] .jedi-oold-suggestion')
  I.waitForElement('[data-path="#/works_for"] .jedi-oold-edit', 10)
  I.click('[data-path="#/works_for"] .jedi-oold-edit')
  I.waitForElement('dialog.jedi-oold-dialog[open]', 10)
  I.seeInField('dialog.jedi-oold-dialog [data-path="#/label"] input', 'Institute of Materials')
})

Scenario('@feature @oold restores a value when the class comes back', ({ I }) => {
  I._selectExample('oold/type-switch', 25)
  I.waitForElement('[data-path="#/email"] input', 10)
  I.fillField('[data-path="#/email"] input', 'ada@example.org')
  I.click('[data-path="#/label"] input')
  I.selectOption('#oold-class', 'https://demo.oo-ld.org/schemas/Organization.schema.json')
  I.waitForElement('#oold-dropped', 10)
  I.selectOption('#oold-class', 'https://demo.oo-ld.org/schemas/Person.schema.json')
  I.waitForElement('#oold-restored', 10)
  I.waitForValue('[data-path="#/email"] input', 'ada@example.org', 10)
})

Scenario('@feature @oold applies density to control size, not just layout', ({ I }) => {
  I._selectExample('oold/density', 25)
  I.waitForElement('#jedison-container.jedi-density', 10)
  I.seeAttributesOnElements('#jedison-container', { 'data-jedi-density': 'comfortable' })
  I.selectOption('#oold-density', 'dense')
  I.waitForElement('#jedison-container[data-jedi-density="dense"]', 10)
})
