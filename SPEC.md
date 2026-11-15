# oold-jedison specification

This document is the contract the implementation is measured against. It is unversioned and
evolves with the code. Where it disagrees with the code, the code is wrong.

## 1. Scope

OO-LD schemas describe structure and meaning in a single document. A property carrying
`x-oold-range` is a typed reference to another entity rather than a free string, class hierarchies
are expressed through `allOf` composition, and resolving a reference to something a user can
recognise requires a lookup against a data store. A form generator that treats such a schema as
plain JSON Schema renders a text field where a picker belongs, and offers no way to create the
referenced entity without leaving the form.

An editor covering these cases exists in the MediaWiki extension `MwJson`, and it has been in
production use for several years. Its reference resolution, autocomplete, class traversal and
persistence are, however, expressed directly in the Semantic MediaWiki query language and API.
The behaviour is therefore not available to any deployment that does not run Semantic MediaWiki,
and the editor it builds on is no longer maintained.

This project reimplements that behaviour on `jedison`, with every backend-specific decision moved
behind an interface. The following are in scope.

1. Preprocessing of OO-LD schemas into a form the editor consumes.
2. Typed reference properties with inline creation of the referenced entity.
3. Schema substitution while the editor is open, preserving entered values.
4. Class and instance selection through a lazily loaded hierarchy view.
5. Autocomplete over static or remote data, where what is displayed and what is stored differ.
6. Layout density, so that a form uses the width of the screen it is given.

Out of scope: a schema authoring tool, a triple store, and any form of server component. The
library is a browser library and stays one.

## 2. Relationship to jedison

`oold-jedison` is a layered fork of [`jedison`](https://github.com/germanbisurgi/jedison), tracked
against upstream rather than diverged from it. Three rules follow from that.

Additions live under `src/oold/` and are wired in through the documented extension points,
`options.customEditors`, `options.refParser`, `options.constraints` and a theme subclass. Upstream
files are modified only where no extension point exists, each such change is a separate commit, and
each is written so that it can be offered upstream unchanged.

Generic improvements are contributed back. A capability that is useful to any `jedison` user and
carries nothing OO-LD specific belongs upstream, not here.

Upstream behaviour is not silently altered. A schema without any `x-oold-*` keyword renders exactly
as it does in `jedison`, and the upstream test suites pass unmodified.

## 3. Schema input

### 3.1 Resolution

`$ref` resolution is performed by the upstream `RefParser`, which resolves against the nearest
`$id` including relative base URIs. This matches the OO-LD idiom in which a schema at
`https://example.org/1.0.0/Person.schema.json` refers to its parent as `Thing.schema.json`.

Retrieval is delegated to the active backend by passing a backend-supplied function as
`options.fetch`. A deployment serving schemas as static files therefore needs no code at all,
while a deployment storing them in a wiki slot or a database supplies a function that maps a class
identifier to its storage location.

A document is rebased onto its retrieval URI before resolution begins. Specification examples
carry a relative `$id` such as `Person.schema.json` and name their parent as `Thing.schema.json`,
and a relative reference resolved against a relative base yields no absolute URI. The reference is
then never retrieved, because retrieval is attempted only for references that resolve to an HTTP
URI. Resolution does not fail at that point but reports the reference as missing, and the error
surfaces later when the reference is expanded. Since the backend knows where it fetched a document
from even when the document does not say, the retrieval URI is supplied as the base.

`x-oold-ref`, which appears inside `x-oold-range` and is deliberately invisible to generic `$ref`
resolvers, is resolved by this library. Resolution is lazy and terminates on cycles.

### 3.2 Composition

Inheritance is expressed as `allOf` with a reference to the parent schema. The editor flattens
such a chain into one effective schema before rendering, using the merge semantics the OO-LD
specification defines, in which the most derived schema wins and assertion keywords may only
narrow.

This is deliberately not the flattening used for code generation, which resolves a conflict in
favour of the base schema. For a form the derived schema must win, otherwise a subclass cannot
restrict an inherited property.

### 3.3 Transformation

The following are removed before rendering, after any information they carry has been extracted:
`@context`, `x-oold-context`, `x-oold-sssom`, `x-oold-uuid`, `x-oold-version` and the version
relation keywords. Schema uuids and `x-oold-instance-rdf-type` are retained internally, the latter
to seed the `type` member of a new instance.

User interface keywords are mapped onto their documented `jedison` counterparts.

| OO-LD | jedison |
|---|---|
| `x-oold-ui-widget` | `x-format` |
| `x-oold-ui-property-order` | `x-propertyOrder` |
| `x-oold-ui-property-group` | `x-category`, `x-propGroup` |
| `x-oold-ui-form-hidden` | `x-hidden` |
| `x-oold-ui-enum-titles` | `x-enumTitles` |
| `x-oold-ui-hint` | `x-info` |
| `x-oold-ui-default-property` | `x-defaultProperty` |

Keywords in the `x-jedison-*` namespace are passed through unchanged. Multilingual keywords are
resolved against the configured interface language, falling back to the unqualified keyword.

The mapping of `x-oold-ui-property-order` deviates from the counterpart named in the OO-LD
meta-schema, which gives `x-categoryOrder`. That target takes an array of category names and sits
on the enclosing object, whereas `x-oold-ui-property-order` is an integer on the property itself.
The matching target is therefore `x-propertyOrder`, and a correction against the specification is
pending.

## 4. Backends

A backend supplies schemas, instances and class relations. These are three separate interfaces
rather than one, so that a deployment implements only what it has. A read-only SPARQL endpoint is
a legitimate backend and is not required to stub out a save method.

```
SchemaStore
  resolve(uri, baseUri)            fetch-shaped, wired into RefParser as options.fetch
  listClasses(moduleRef?)

InstanceStore
  search(spec, userInput, formValue, lang)
  getLabels(ids, lang)
  load(id)
  save(entity, options)
  remove(id)
  getReverse(property, subjectId)

ClassIndex
  getSubclasses(classRef, options)
  getSuperclasses(classRef)
  getMetaclasses(classRef)
```

A `Backend` composes the three and publishes a capability record. The user interface reads that
record and omits controls it cannot support, rather than offering a control that fails when
clicked. Whether a given user may create an entity is a question for the backend, and it is
therefore answered at runtime by the backend rather than written into the schema.

A partial implementation is a supported configuration. Without a `ClassIndex` the hierarchy views
are unavailable and reference properties fall back to flat autocomplete. Without `save` inline
creation is unavailable. Neither condition is an error.

`search` returns records of the shape `{id, label, description, image, type, raw}`. `getLabels`
accepts whatever identifier the store template produced, which is not necessarily an identifier
the backend uses natively, and resolving it back to a label is part of the backend's contract.

Batching, request coalescing and caching are provided by the base class. An adapter implements
retrieval only.

### 4.1 Conformance

One contract test suite is run against every adapter, subset by the capabilities the adapter
declares. The static adapter serves as the reference oracle. An adapter is complete when it passes
the subset it claims.

## 5. Reference properties

A property is identified as a reference property when it carries `x-oold-range`. The property value
is thereby represented by a string identifier, whereby the range constrains the class of the
referenced entity. In the specification, three forms are permitted for this purpose: a single
identifier, an array of identifiers, and a subschema combining them with `anyOf`, `oneOf` or
`allOf`.

### 5.1 Selection

A reference property renders as an autocomplete control backed by `InstanceStore.search`. What the
dropdown displays and what the form stores are independent. The display is composed from label,
description and image, while the stored value is typically an identifier the user never sees.
Typing without selecting a suggestion leaves the property empty, since a free string is not a
reference.

Values loaded from storage arrive as bare identifiers. Their labels are resolved in one batch
after the form is populated, rather than per field.

### 5.2 Inline creation

Where the backend reports that creation is possible, the control offers creating the referenced
entity without leaving the form. The new entity is edited in a nested editor in a dialog, built
from the schema of the target class. On completion it is persisted through `InstanceStore.save`
and its identifier is written into the property.

Dialogs nest, so a reference encountered while creating an entity inline is itself subject to this
rule.

Where the range admits more than one class, the target class is selected before the editor opens,
through an inline dropdown on the create control.

Two distinct questions are kept distinct. The range states which class to instantiate. A separate
subclass range states, for a property whose value is itself a class, the point in the hierarchy
below which the new class is to be placed. Both may appear on the same property.

### 5.3 Editing and cloning

A filled reference property additionally offers editing the referenced entity in place, and
cloning it as the starting point for a new one. Both open the same nested editor as inline
creation.

## 6. Schema substitution

The schema in use may be replaced while the editor is open. This is how the type of the entity
being edited is changed.

The control is a hierarchy view showing the current class, its ancestors and its dynamically
fetched subclasses. Selecting an entry reloads the form against the selected class. Ancestors are
hidden when the control is shown inside inline creation, where only specialisation is meaningful.

Entered values are preserved. A value is carried over when the new schema defines a property at
the same path whose type admits it, which includes an enumerated value remaining a member of the
new enumeration and the item type of an array still matching. Values that cannot be carried over
are reported to the user before they are discarded, since silently dropping entered data is not
acceptable.

## 7. Hierarchy selection

Independently of reference properties, a property may be edited through the hierarchy view. The
view shows the range class with its ancestors, fetches children on expansion rather than up front,
and lists instances per class where an instance rather than a class is requested. Scalar
properties select one entry, array properties select several.

## 8. Autocomplete

Autocomplete is available to any property, not only to reference properties, and over static data
as well as a remote endpoint. Three templates are configured independently: what the dropdown row
renders, what the collapsed control displays, and what the form stores.

A selection may additionally populate sibling properties, which is how a reference to a quantity
can fill in its unit and symbol.

## 9. Density

The default rendering places one field per row inside a card per object. For an OO-LD schema with
three levels of inheritance this produces three nested frames before the first input, and on a wide
screen most of the width is unused.

A density setting is therefore provided, with the values `comfortable`, `compact` and `dense`. It
is a preset over existing layout options rather than a separate rendering path, and it is set
globally with per-schema override, following the convention already used for every other option.
`comfortable` is the upstream default and is unchanged.

Beyond the preset, the number of columns an object occupies is derived during preprocessing from
the number of its properties and their types. Short values are packed several to a row, while long
text and nested objects take a full row. A schema that states its own grid is left alone.

Controls on reference properties are placed inside the input group rather than in a column beside
it, since a form with several reference properties otherwise spends a large fraction of its width
on buttons.

Density is validated by measuring the number of fields visible without scrolling, at a stated
viewport size, against a schema taken from production rather than a constructed example.

## 10. Keywords

Configuration that OO-LD does not yet define is carried in the `x-oold-jedison-*` namespace.

| Keyword | Purpose |
|---|---|
| `x-oold-jedison-source` | backend selection and query configuration |
| `x-oold-jedison-render-template` | dropdown row rendering |
| `x-oold-jedison-label-template` | collapsed display value |
| `x-oold-jedison-store-template` | value written into the instance |
| `x-oold-jedison-field-maps` | sibling properties populated from a selection |
| `x-oold-jedison-create-inline` | disables inline creation for a property |
| `x-oold-jedison-subclassof-range` | class-valued range |

This namespace is a staging area and not a parallel vocabulary. Keywords that belong in OO-LD are
proposed to the specification, and the official spelling is adopted once accepted, with the staged
spelling retained as an alias. Two such proposals are open, autocomplete source configuration and
the subclass range.

Schema-level vocabulary is owned by `oold-schema`. This library consumes OO-LD keywords and does
not define them.

## 11. Verification

The upstream unit and end-to-end suites pass unmodified. They are what demonstrates that the
layering held.

In addition, preprocessing is tested against the specification examples and the reference schemas,
value carry-over is tested across schema pairs with overlapping, disjoint and incompatible
properties, every backend adapter is run against the contract suite, each feature in sections 5 to
9 has an end-to-end test, and keyword coverage is checked against the production schema corpus so
that support is driven by what is actually used rather than by what is theoretically possible.
