(() => {
  const fallback = self.WUWA_CHARACTER_DATA || {};
  const validElements = data => new Set(data.elementOrder || []);

  function validate(data) {
    if (!data || !Array.isArray(data.characters) || data.characters.length === 0) return false;
    const ids = new Set();
    const elements = validElements(data);
    for (const character of data.characters) {
      if (!character.id || !character.name || !character.element || ids.has(character.id)) return false;
      if (elements.size > 0 && !elements.has(character.element)) return false;
      ids.add(character.id);
    }
    return Array.isArray(data.groupOrder) && data.groupConfig?.limited;
  }

  async function load() {
    try {
      const response = await fetch('data/json/characters.json');
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data = await response.json();
      if (!validate(data)) throw new Error('invalid character data');
      return data;
    } catch (error) {
      console.warn('[wuwa] fetch data/json/characters.json failed, using built-in data', error);
      return fallback;
    }
  }

  self.WUWA_DATA_LOADER = { load, validate };
})();
