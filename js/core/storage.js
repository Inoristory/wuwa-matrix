(() => {
  function read(key) {
    try { return localStorage.getItem(key); }
    catch (error) { console.warn('[wuwa] storage read', error); return null; }
  }

  function write(key, value) {
    try { localStorage.setItem(key, value); return true; }
    catch (error) { console.warn('[wuwa] storage write', error); return false; }
  }

  self.WUWA_STORAGE = { read, write };
})();
