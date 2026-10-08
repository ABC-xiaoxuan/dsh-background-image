// Image and preferences live in one record, committed in one transaction.
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
    read: () => transaction('readonly', (store) => store.get('current')),
    write: (record) => transaction('readwrite', (store) => store.put(record, 'current')),
    clear: () => transaction('readwrite', (store) => store.delete('current')),
    async close() {
      if (connection) (await connection.catch(() => null))?.close();
      connection = undefined;
    },
  };
}
