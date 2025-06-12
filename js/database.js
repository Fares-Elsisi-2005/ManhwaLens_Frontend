 let db;

async function initIndexedDB() {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open('ManhwaDB', 1);
        request.onupgradeneeded = (event) => {
            db = event.target.result;
            db.createObjectStore('translations', { keyPath: 'word' });
            db.createObjectStore('pages', { keyPath: 'pageNum' });
        };
        request.onsuccess = () => { db = request.result; resolve(); };
        request.onerror = () => reject('Failed to initialize IndexedDB');
    });
}

async function clearIndexedDB() {
    return new Promise((resolve, reject) => {
        const request = indexedDB.deleteDatabase('ManhwaDB');
        request.onsuccess = () => {
            console.log('IndexedDB cleared');
            resolve();
        };
        request.onerror = () => reject('Failed to clear IndexedDB');
    });
}

async function cacheTranslation(word, translation) {
    return new Promise((resolve) => {
        const transaction = db.transaction(['translations'], 'readwrite');
        const store = transaction.objectStore('translations');
        store.put({ word, translation });
        transaction.oncomplete = () => resolve();
    });
}

async function getCachedTranslation(word) {
    return new Promise((resolve) => {
        const transaction = db.transaction(['translations'], 'readonly');
        const store = transaction.objectStore('translations');
        const request = store.get(word);
        request.onsuccess = () => resolve(request.result?.translation);
    });
}

async function cachePageData(pageData) {
    return new Promise((resolve) => {
        const transaction = db.transaction(['pages'], 'readwrite');
        const store = transaction.objectStore('pages');
        store.put(pageData);
        transaction.oncomplete = () => resolve();
    });
}

async function getCachedPage(pageNum) {
    return new Promise((resolve) => {
        const transaction = db.transaction(['pages'], 'readonly');
        const store = transaction.objectStore('pages');
        const request = store.get(pageNum);
        request.onsuccess = () => resolve(request.result);
    });
}