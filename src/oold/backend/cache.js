/**
 * Memoises an async call and shares a request already in flight.
 *
 * Both halves matter for a form. A class tree asks for the same schema from
 * several properties at once, and without coalescing each one issues its own
 * request before the first has returned.
 */
export class RequestCache {
  constructor (options = {}) {
    this.enabled = options.cache !== false
    this.entries = new Map()
  }

  async run (key, produce) {
    if (!this.enabled) {
      return produce()
    }

    if (this.entries.has(key)) {
      return this.entries.get(key)
    }

    const pending = Promise.resolve()
      .then(produce)
      .catch((error) => {
        // A failure is not cached, the next caller may well succeed.
        this.entries.delete(key)
        throw error
      })

    this.entries.set(key, pending)

    return pending
  }

  forget (key) {
    this.entries.delete(key)
  }

  clear () {
    this.entries.clear()
  }
}

/**
 * Collects individual lookups arriving within the same tick and issues one call.
 *
 * Labels are the case this exists for: a loaded form resolves every stored
 * identifier at once, and one request per field does not scale.
 */
export class Batcher {
  constructor (run, options = {}) {
    this.run = run
    this.wait = options.wait ?? 0
    this.maxBatch = options.maxBatch ?? 200
    this.queue = []
    this.timer = null
  }

  lookup (key) {
    return new Promise((resolve, reject) => {
      this.queue.push({ key, resolve, reject })

      if (this.queue.length >= this.maxBatch) {
        this.flush()
        return
      }

      if (this.timer === null) {
        this.timer = setTimeout(() => this.flush(), this.wait)
      }
    })
  }

  flush () {
    if (this.timer !== null) {
      clearTimeout(this.timer)
      this.timer = null
    }

    const batch = this.queue.splice(0, this.queue.length)

    if (!batch.length) {
      return
    }

    const keys = [...new Set(batch.map((entry) => entry.key))]

    Promise.resolve()
      .then(() => this.run(keys))
      .then((result) => {
        const map = result ?? {}
        for (const entry of batch) {
          entry.resolve(map[entry.key])
        }
      })
      .catch((error) => {
        for (const entry of batch) {
          entry.reject(error)
        }
      })
  }
}
