/* Intercepts the PWA share-target POST before Workbox can answer it. */
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  if (event.request.method !== 'POST' || url.pathname !== '/share-target') {
    return;
  }
  event.stopImmediatePropagation();
  event.respondWith(storeShare(event.request, url.origin));
});

async function storeShare(request, origin) {
  try {
    const form = await request.formData();
    const files = [];
    for (const entry of form.getAll('media')) {
      if (typeof entry === 'string' || !entry || entry.size === 0) continue;
      files.push({
        name: entry.name || 'shared',
        type: entry.type || 'application/octet-stream',
        blob: entry,
      });
    }
    await writeShare({
      id: crypto.randomUUID(),
      title: textField(form, 'title'),
      text: textField(form, 'text'),
      url: textField(form, 'url'),
      files,
    });
  } catch (error) {
    // The page explains an empty store. A failed POST should still leave the share flow.
  }
  return Response.redirect(new URL('/share-target', origin), 303);
}

function textField(form, name) {
  const value = form.get(name);
  return typeof value === 'string' ? value : '';
}

function writeShare(record) {
  return new Promise((resolve, reject) => {
    const open = indexedDB.open('unmute-share', 1);
    open.onupgradeneeded = () => {
      if (!open.result.objectStoreNames.contains('payload')) {
        open.result.createObjectStore('payload');
      }
    };
    open.onerror = () => reject(open.error);
    open.onsuccess = () => {
      const tx = open.result.transaction('payload', 'readwrite');
      tx.objectStore('payload').put(record, 'latest');
      tx.oncomplete = () => {
        open.result.close();
        resolve();
      };
      tx.onerror = () => reject(tx.error);
    };
  });
}
