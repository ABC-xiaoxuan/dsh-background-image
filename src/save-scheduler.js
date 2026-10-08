// Coalesce slider events; flush on unmount so closing Settings keeps the last value.
export function createPreferenceScheduler(save, delay = 180) {
  let pending = {}, timer;
  function flush() {
    clearTimeout(timer); timer = undefined;
    const patch = pending; pending = {};
    if (Object.keys(patch).length) return save(patch);
    return Promise.resolve();
  }
  return {
    schedule(key, value) { pending[key] = value; clearTimeout(timer); timer = setTimeout(flush, delay); },
    flush,
    cancel() { clearTimeout(timer); pending = {}; },
  };
}
