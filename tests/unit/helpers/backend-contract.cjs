/* global describe it expect */

/**
 * One contract suite, run against every adapter.
 *
 * Each block is gated on the capability it exercises, so a read-only adapter
 * passes without stubbing anything. An adapter is complete when it passes the
 * subset its capabilities claim.
 *
 * The fixture a caller supplies must describe the same world for every adapter:
 * the classes, the instances and the one instance whose label is searchable.
 */
function runBackendContract (name, setup) {
  describe(`backend contract: ${name}`, () => {
    describe('capabilities', () => {
      it('reports a complete capability record', async () => {
        const { backend } = await setup()
        const expected = [
          'canSearch', 'canLabel', 'canLoad', 'canCreate', 'canEdit', 'canDelete',
          'canReverse', 'hasHierarchy', 'hasAncestors', 'hasMetaclasses', 'canListClasses'
        ]

        for (const key of expected) {
          expect(typeof backend.capabilities[key]).toBe('boolean')
        }
      })

      it('never claims editing without loading', async () => {
        const { backend } = await setup()
        if (backend.can('canEdit')) {
          expect(backend.can('canLoad')).toBe(true)
        }
      })

      it('answers can() consistently with the record', async () => {
        const { backend } = await setup()
        for (const [key, value] of Object.entries(backend.capabilities)) {
          expect(backend.can(key)).toBe(value)
        }
      })

      // Without this the suite could pass by supporting nothing, since every
      // block below is gated on the capability it exercises.
      it('supports what the fixture says it supports', async () => {
        const { backend, fixture } = await setup()

        for (const [key, value] of Object.entries(fixture.expectedCapabilities ?? {})) {
          expect([key, backend.can(key)]).toEqual([key, value])
        }
      })
    })

    describe('schemas', () => {
      it('resolves a known schema to a fetch-shaped response', async () => {
        const { backend, fixture } = await setup()
        const response = await backend.schemas.resolve(fixture.knownSchemaUri)

        expect(response).toBeDefined()
        expect(response.ok).toBe(true)
        expect(typeof response.json).toBe('function')
        expect(await response.json()).toBeDefined()
      })

      it('reports a missing schema without throwing', async () => {
        const { backend, fixture } = await setup()
        const response = await backend.schemas.resolve(fixture.missingSchemaUri)

        expect(response).toBeDefined()
        expect(response.ok).toBe(false)
      })

      it('exposes a fetch jedison can consume', async () => {
        const { backend, fixture } = await setup()
        const asFetch = backend.toFetch()
        const response = await asFetch(fixture.knownSchemaUri)

        expect(response.ok).toBe(true)
      })

      it('lists classes when it says it can', async () => {
        const { backend } = await setup()
        if (!backend.can('canListClasses')) {
          return
        }

        const classes = await backend.schemas.listClasses()
        expect(Array.isArray(classes)).toBe(true)
        expect(classes.length).toBeGreaterThan(0)
      })
    })

    describe('search', () => {
      it('returns records of the agreed shape', async () => {
        const { backend, fixture } = await setup()
        if (!backend.can('canSearch')) {
          return
        }

        const results = await backend.instances.search(fixture.searchSpec, fixture.searchInput)

        expect(Array.isArray(results)).toBe(true)
        expect(results.length).toBeGreaterThan(0)

        for (const record of results) {
          expect(typeof record.id).toBe('string')
          expect('label' in record).toBe(true)
          expect('raw' in record).toBe(true)
        }
      })

      it('finds the expected instance', async () => {
        const { backend, fixture } = await setup()
        if (!backend.can('canSearch')) {
          return
        }

        const results = await backend.instances.search(fixture.searchSpec, fixture.searchInput)
        expect(results.map((entry) => entry.id)).toContain(fixture.expectedId)
      })

      it('returns an empty list rather than throwing on no match', async () => {
        const { backend, fixture } = await setup()
        if (!backend.can('canSearch')) {
          return
        }

        const results = await backend.instances.search(fixture.searchSpec, 'zzz-no-such-thing-zzz')
        expect(Array.isArray(results)).toBe(true)
      })

      it('respects the range when one is stated', async () => {
        const { backend, fixture } = await setup()
        if (!backend.can('canSearch') || !fixture.foreignRangeSpec) {
          return
        }

        const results = await backend.instances.search(fixture.foreignRangeSpec, fixture.searchInput)
        expect(results.map((entry) => entry.id)).not.toContain(fixture.expectedId)
      })
    })

    describe('labels', () => {
      it('maps known identifiers to labels', async () => {
        const { backend, fixture } = await setup()
        if (!backend.can('canLabel')) {
          return
        }

        const labels = await backend.instances.getLabels([fixture.expectedId])
        expect(typeof labels).toBe('object')
        expect(labels[fixture.expectedId]).toBeDefined()
      })

      it('omits an unknown identifier rather than failing', async () => {
        const { backend } = await setup()
        if (!backend.can('canLabel')) {
          return
        }

        const labels = await backend.instances.getLabels(['urn:oold:definitely-missing'])
        expect(labels['urn:oold:definitely-missing']).toBeUndefined()
      })

      it('serves a single lookup through the batch', async () => {
        const { backend, fixture } = await setup()
        if (!backend.can('canLabel')) {
          return
        }

        const label = await backend.instances.getLabel(fixture.expectedId)
        expect(label).toBeDefined()
      })

      it('answers concurrent lookups in one call', async () => {
        const { backend, fixture } = await setup()
        if (!backend.can('canLabel')) {
          return
        }

        let calls = 0
        const original = backend.instances.getLabels.bind(backend.instances)
        backend.instances.getLabels = async (...args) => {
          calls++
          return original(...args)
        }

        const [a, b] = await Promise.all([
          backend.instances.getLabel(fixture.expectedId),
          backend.instances.getLabel(fixture.expectedId)
        ])

        expect(a).toBeDefined()
        expect(b).toBeDefined()
        expect(calls).toBe(1)
      })
    })

    describe('load, save and remove', () => {
      it('loads a known instance', async () => {
        const { backend, fixture } = await setup()
        if (!backend.can('canLoad')) {
          return
        }

        expect(await backend.instances.load(fixture.expectedId)).toBeTruthy()
      })

      it('returns null for an unknown instance', async () => {
        const { backend } = await setup()
        if (!backend.can('canLoad')) {
          return
        }

        expect(await backend.instances.load('urn:oold:definitely-missing')).toBeNull()
      })

      it('assigns an identifier when saving without one', async () => {
        const { backend, fixture } = await setup()
        if (!backend.can('canCreate')) {
          return
        }

        const saved = await backend.instances.save({ ...fixture.newInstance })
        expect(typeof saved.id).toBe('string')
        expect(saved.id.length).toBeGreaterThan(0)
      })

      it('makes a saved instance loadable', async () => {
        const { backend, fixture } = await setup()
        if (!backend.can('canCreate') || !backend.can('canLoad')) {
          return
        }

        const saved = await backend.instances.save({ ...fixture.newInstance })
        expect(await backend.instances.load(saved.id)).toBeTruthy()
      })

      it('removes what it saved', async () => {
        const { backend, fixture } = await setup()
        if (!backend.can('canCreate') || !backend.can('canDelete')) {
          return
        }

        const saved = await backend.instances.save({ ...fixture.newInstance })
        expect(await backend.instances.remove(saved.id)).toBe(true)
        expect(await backend.instances.load(saved.id)).toBeNull()
      })
    })

    describe('hierarchy', () => {
      it('reports the direct subclasses of a class', async () => {
        const { backend, fixture } = await setup()
        if (!backend.can('hasHierarchy') || !fixture.parentClass) {
          return
        }

        const children = await backend.classes.getSubclasses(fixture.parentClass)
        expect(children).toContain(fixture.childClass)
      })

      it('returns an empty list for a leaf rather than throwing', async () => {
        const { backend, fixture } = await setup()
        if (!backend.can('hasHierarchy') || !fixture.leafClass) {
          return
        }

        expect(await backend.classes.getSubclasses(fixture.leafClass)).toEqual([])
      })

      it('walks ancestors transitively', async () => {
        const { backend, fixture } = await setup()
        if (!backend.can('hasAncestors') || !fixture.childClass) {
          return
        }

        const ancestors = await backend.classes.getSuperclasses(fixture.childClass)
        expect(ancestors).toContain(fixture.parentClass)
      })

      it('reports no ancestors for a root', async () => {
        const { backend, fixture } = await setup()
        if (!backend.can('hasAncestors') || !fixture.rootClass) {
          return
        }

        expect(await backend.classes.getSuperclasses(fixture.rootClass)).toEqual([])
      })
    })

    describe('degradation', () => {
      it('returns an empty result from every unsupported method', async () => {
        const { backend } = await setup()

        const checks = [
          ['canSearch', () => backend.instances.search({}, '')],
          ['canLabel', () => backend.instances.getLabels([])],
          ['canLoad', () => backend.instances.load('x')],
          ['canDelete', () => backend.instances.remove('x')],
          ['canReverse', () => backend.instances.getReverse('p', 'x')],
          ['hasHierarchy', () => backend.classes.getSubclasses('x')],
          ['hasAncestors', () => backend.classes.getSuperclasses('x')],
          ['canListClasses', () => backend.schemas.listClasses()]
        ]

        for (const [capability, call] of checks) {
          if (backend.can(capability)) {
            continue
          }

          // Unsupported must be quiet, not loud. The caller checks capabilities.
          await expect(call()).resolves.toBeDefined()
        }
      })
    })
  })
}

module.exports = { runBackendContract }
