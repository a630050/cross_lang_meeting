/**
 * 免费 Google 翻译 API 客户端 (0 服务端依赖)
 */
const Translator = (function() {
  /**
   * 翻译文本
   * @param {string} text 要翻译的文本
   * @param {string} targetLang 目标语言代码 (如 'ja', 'zh-TW', 'en', 'ko')
   * @param {string} sourceLang 源语言代码 (默认 'auto')
   * @returns {Promise<string>} 翻译后的文本
   */
  async function translate(text, targetLang, sourceLang = 'auto') {
    if (!text || !text.trim()) return '';
    
    // 清理语言代码格式 (如 'zh-TW' -> 'zh-TW', 'ja-JP' -> 'ja')
    const cleanTarget = normalizeLangCode(targetLang);
    const cleanSource = sourceLang === 'auto' ? 'auto' : normalizeLangCode(sourceLang);

    // 免费 Google 翻译公开 Endpoint
    const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=${encodeURIComponent(cleanSource)}&tl=${encodeURIComponent(cleanTarget)}&dt=t&q=${encodeURIComponent(text)}`;

    try {
      const response = await fetch(url);
      if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
      const data = await response.json();
      
      if (Array.isArray(data) && Array.isArray(data[0])) {
        // 拼接多句翻译片段
        return data[0].map(item => item[0]).filter(Boolean).join('');
      }
      return text;
    } catch (err) {
      console.warn('[Translator] Google 翻译失败，尝试备用 endpoint:', err);
      return await fallbackTranslate(text, cleanTarget, cleanSource);
    }
  }

  /**
   * 备用翻译方案
   */
  async function fallbackTranslate(text, targetLang, sourceLang) {
    try {
      const url = `https://clients5.google.com/translate_a/t?client=dict-chrome-ex&sl=${sourceLang}&tl=${targetLang}&q=${encodeURIComponent(text)}`;
      const res = await fetch(url);
      const data = await res.json();
      if (Array.isArray(data)) return data.join('');
      if (typeof data === 'string') return data;
      return text;
    } catch (e) {
      console.error('[Translator] 所有翻译尝试均失败:', e);
      return text;
    }
  }

  function normalizeLangCode(lang) {
    if (!lang) return 'auto';
    if (lang.startsWith('zh-TW') || lang.startsWith('zh-HK')) return 'zh-TW';
    if (lang.startsWith('zh')) return 'zh-CN';
    if (lang.startsWith('ja')) return 'ja';
    if (lang.startsWith('en')) return 'en';
    if (lang.startsWith('ko')) return 'ko';
    if (lang.startsWith('es')) return 'es';
    if (lang.startsWith('fr')) return 'fr';
    if (lang.startsWith('de')) return 'de';
    if (lang.startsWith('th')) return 'th';
    if (lang.startsWith('vi')) return 'vi';
    return lang.split('-')[0];
  }

  return { translate };
})();
