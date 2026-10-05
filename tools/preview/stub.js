/* Stands in for the extension APIs so the pages can be opened as plain web
   pages for preview and screenshots. Never shipped — tools/ is not packaged. */
(function () {
  const params = new URLSearchParams(location.search);
  const overrides = {};
  for (const [k, v] of params) {
    overrides[k] = v === 'true' ? true : v === 'false' ? false : v;
  }
  const store = { ...overrides };
  const granted = params.get('topsites') === 'true';

  globalThis.chrome = {
    runtime: {
      getURL: (p) => p, // favicons will 404 here, exercising the letter fallback
      id: 'preview',
    },
    storage: {
      sync: {
        get: async (defaults) => ({ ...defaults, ...store }),
        set: async (patch) => Object.assign(store, patch),
        clear: async () => { for (const k of Object.keys(store)) delete store[k]; },
      },
      onChanged: { addListener() {} },
    },
    permissions: {
      contains: async () => granted,
      request: async () => granted,
      remove: async () => true,
      onAdded: { addListener() {} },
      onRemoved: { addListener() {} },
    },
    topSites: {
      get: async () => ([
        { title: 'Online Shopping', url: 'https://www.amazon.in' },
        { title: 'YouTube', url: 'https://www.youtube.com' },
        { title: 'Inbox', url: 'https://mail.google.com' },
        { title: 'Crunchyroll', url: 'https://www.crunchyroll.com' },
        { title: 'Gemini', url: 'https://gemini.google.com' },
        { title: 'JioHotstar', url: 'https://www.hotstar.com' },
      ]),
    },
    search: { query: () => {} },
    scripting: {
      getRegisteredContentScripts: async () => [],
      registerContentScripts: async () => {},
      unregisterContentScripts: async () => {},
    },
  };
})();
