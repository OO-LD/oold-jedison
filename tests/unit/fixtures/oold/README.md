# OO-LD example fixtures

Copied verbatim from [`OO-LD/oold-schema`](https://github.com/OO-LD/oold-schema) `examples/`,
which is CC0 1.0 Universal.

They are vendored rather than read from a sibling checkout so the suite runs on a bare clone.
Refresh them when the specification examples change, and treat a resulting test failure as a
question about the preprocessor rather than as a fixture to patch.

`Researcher.schema.json` carries the subschema form of `x-oold-range` with `x-oold-ref`, and
`UiAnnotations.schema.json` carries the full `x-oold-ui-*` set. Those two are the ones worth
keeping if this set is ever trimmed.
