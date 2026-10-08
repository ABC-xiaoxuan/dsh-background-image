// Image and metadata use separate records, read and written atomically.
// No base64 in the profile, no uploads, and no localStorage quota limit.
export function createStorage(indexedDB) {
  let connection;
  function open() {
    if (!indexedDB) return Promise.reject(new Error('当前环境不支持本地图片存储。'));
    if (!connection) connection = new Promise((resolve, reject) => {
      const request = indexedDB.open('dsh-background-image', 1);
      request.onupgradeneeded = () => request.result.createObjectStore('settings');
      request.onerror = () => { connection = undefined; reject(request.error); };
      request.onblocked = () => { connection = undefined; reject(new Error('图片存储被其他窗口占用，请关闭旧窗口后重试。')); };
      request.onsuccess = () => {
        const db = request.result;
        db.onversionchange = () => { db.close(); connection = undefined; };
        resolve(db);
      };
    });
    return connection;
  }
  async function transaction(mode, operation) {
    const db = await open();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('settings', mode);
      const request = operation(tx.objectStore('settings'));
      tx.oncomplete = () => resolve(request.result);
      tx.onabort = () => reject(tx.error || request.error || new Error('保存图片失败。'));
      tx.onerror = () => {}; // onabort is the authoritative failure.
    });
  }
  return {
    async read() {
      const db = await open();
      return new Promise((resolve, reject) => {
        const tx = db.transaction('settings', 'readonly');
        const store = tx.objectStore('settings');
        const legacy = store.get('current'), metadata = store.get('metadata'), image = store.get('image');
        tx.oncomplete = () => resolve(metadata.result ? { ...metadata.result, image: image.result || null } : legacy.result);
        tx.onabort = () => reject(tx.error || new Error('读取背景失败。'));
        tx.onerror = () => {};
      });
    },
    write: (record, imageChanged = true) => transaction('readwrite', store => {
      // Split records, migrate legacy atomically on first save.
      if (imageChanged) { store.put(record.image, 'image'); store.delete('current'); }
      return store.put({ preferences: record.preferences, name: record.name }, 'metadata');
    }),
    clear: () => transaction('readwrite', store => store.clear()),
    async close() {
      if (connection) (await connection.catch(() => null))?.close();
      connection = undefined;
    },
  };
}
