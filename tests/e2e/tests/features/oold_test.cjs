/* global Feature Scenario Before */
const theme = process.env.THEME || 'barebones'

Feature('oold')

Before(({ I }) => {
  I.amOnPage(`playground.html?theme=${theme}`)
})

Scenario('@feature @oold renders a range property as a reference control', ({ I }) => {
  I._selectExample('oold/inline-create')
  I.waitForElement('[data-path="#/works_for"] .jedi-oold-input-group', 10)
  I.seeElement('[data-path="#/works_for"] .jedi-oold-actions')
})

Scenario('@feature @oold suggests instances from the backend', ({ I }) => {
  I._selectExample('oold/inline-create')
  I.waitForElement('[data-path="#/works_for"] input', 10)
  I.fillField('[data-path="#/works_for"] input', 'materi')
  I.waitForElement('[data-path="#/works_for"] .jedi-oold-suggestion', 10)
  I.see('Institute of Materials', '[data-path="#/works_for"] .jedi-oold-suggestions')
})

Scenario('@feature @oold stores the identifier and shows the label', ({ I }) => {
  I._selectExample('oold/inline-create')
  I.waitForElement('[data-path="#/works_for"] input', 10)
  I.fillField('[data-path="#/works_for"] input', 'materi')
  I.waitForElement('[data-path="#/works_for"] .jedi-oold-suggestion', 10)
  I.click('[data-path="#/works_for"] .jedi-oold-suggestion')
  I.waitForValue('[data-path="#/works_for"] input', 'Institute of Materials', 10)
  I.seeInField('#editor-value', 'urn:demo:org-materials')
})

Scenario('@feature @oold clears a half-typed value, a free string is not a reference', ({ I }) => {
  I._selectExample('oold/inline-create')
  I.waitForElement('[data-path="#/works_for"] input', 10)
  I.fillField('[data-path="#/works_for"] input', 'not a real entity')
  I.click('[data-path="#/label"] input')
  I.waitForValue('[data-path="#/works_for"] input', '', 10)
})

Scenario('@feature @oold offers a class choice when the range is a union', ({ I }) => {
  I._selectExample('oold/union-range')
  I.waitForElement('[data-path="#/affiliated_with"] .jedi-oold-create', 10)
  I.click('[data-path="#/affiliated_with"] .jedi-oold-create')
  I.waitForElement('.jedi-oold-class-menu', 10)
  I.seeElement('.jedi-oold-class-option')
})

Scenario('@feature @oold renders a lazily expanded class tree', ({ I }) => {
  I._selectExample('oold/tree-select')
  I.waitForElement('[data-path="#/primary_class"] .jedi-oold-tree', 10)
  I.click('[data-path="#/primary_class"] .jedi-oold-tree-toggle')
  I.waitForElement('[data-path="#/primary_class"] [data-oold-node*="Organization"]', 10)
})

Scenario('@feature @oold switches the schema and keeps the entered values', ({ I }) => {
  I._selectExample('oold/type-switch')
  I.waitForElement('[data-path="#/label"] input', 10)
  I.fillField('[data-path="#/label"] input', 'Ada Lovelace')
  I.click('[data-path="#/description"] input')
  I.seeInField('#editor-value', 'Ada Lovelace')
  I.selectOption('#oold-class', 'https://demo.oo-ld.org/schemas/Researcher.schema.json')
  I.waitForElement('[data-path="#/orcid"]', 10)
  I.waitForValue('[data-path="#/label"] input', 'Ada Lovelace', 10)
})

Scenario('@feature @oold reports what a switch dropped', ({ I }) => {
  I._selectExample('oold/type-switch')
  I.waitForElement('[data-path="#/email"] input', 10)
  I.fillField('[data-path="#/email"] input', 'ada@example.org')
  I.click('[data-path="#/label"] input')
  I.selectOption('#oold-class', 'https://demo.oo-ld.org/schemas/Organization.schema.json')
  I.waitForElement('#oold-dropped', 10)
  I.see('#/email', '#oold-dropped')
})

Scenario('@feature @oold packs fields into a grid at compact density', ({ I }) => {
  I._selectExample('oold/density')
  I.waitForElement('[data-path="#/label"]', 10)
  I.dontSeeElement('#jedison-container .jedi-oold-compact')
  I.selectOption('#oold-density', 'compact')
  I.waitForElement('.jedi-oold-compact', 10)
})
