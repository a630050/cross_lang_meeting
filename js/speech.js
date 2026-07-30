/**
 * 瀏覽器原生 Web Speech API 語音轉寫模組
 * NOTE: 透過 getUserMedia 預先申請麥克風並套用系統層級音訊優化約束，
 *       讓 Web Speech API 在相同裝置上能繼承較優質的音訊設定。
 */
const SpeechEngine = (function() {
  let recognition       = null;
  let isListening       = false;
  let shouldKeepListening = false;
  let currentLang       = 'zh-TW';

  // NOTE: 保存預先取得的麥克風串流，讓瀏覽器重用同一條 audio track
  let micStream         = null;

  let onInterimCallback = null;
  let onFinalCallback   = null;
  let onErrorCallback   = null;

  function isSupported() {
    return 'webkitSpeechRecognition' in window || 'SpeechRecognition' in window;
  }

  /**
   * 兩段式約束策略：
   *   第 1 段 → exact（強制要求 AGC/EC/NS，手機必須啟用否則報錯）
   *   第 2 段 → ideal（失敗時降級，瀏覽器「盡量做」但不強迫）
   *   都失敗 → 放棄，Web Speech API 用自己的預設值
   * @returns {Promise<boolean>} 是否成功取得麥克風
   */
  async function primeAudioContext() {
    if (micStream) return true;

    const baseConstraints = {
      sampleRate:   { ideal: 48000 },
      sampleSize:   { ideal: 16 },
      channelCount: { ideal: 1 },
      latency:      { ideal: 0.01 }
    };

    const exactAudio = {
      ...baseConstraints,
      echoCancellation: { exact: true },
      noiseSuppression: { exact: true },
      autoGainControl:  { exact: true }
    };

    const idealAudio = {
      ...baseConstraints,
      echoCancellation: { ideal: true },
      noiseSuppression: { ideal: true },
      autoGainControl:  { ideal: true }
    };

    for (const [label, constraints] of [
      ['[SpeechEngine] exact 約束', exactAudio],
      ['[SpeechEngine] ideal 約束', idealAudio]
    ]) {
      try {
        micStream = await navigator.mediaDevices.getUserMedia({ audio: constraints });
        console.log(label, '→ 麥克風取得成功');
        return true;
      } catch (err) {
        console.warn(label, '→ 失敗:', err.name);
      }
    }

    console.warn('[SpeechEngine] 所有約束皆失敗，繼續不帶優化');
    return false;
  }

  /**
   * 釋放預先申請的麥克風串流
   * NOTE: 停止收音後釋放，避免持續佔用麥克風（瀏覽器會顯示錄音指示燈）
   */
  function releaseMicStream() {
    if (micStream) {
      micStream.getTracks().forEach(track => track.stop());
      micStream = null;
    }
  }

  function init(lang = 'zh-TW') {
    if (!isSupported()) {
      console.error('[SpeechEngine] 瀏覽器不支援 Web Speech API');
      return false;
    }

    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    recognition = new SpeechRecognition();
    recognition.continuous     = true;  // 持續收音
    recognition.interimResults = true;  // 回傳即時中間結果
    recognition.lang           = lang;
    currentLang                = lang;

    // NOTE: maxAlternatives 設為 1 以降低處理開銷，提升辨識速度
    recognition.maxAlternatives = 1;

    recognition.onstart = function() {
      isListening = true;
      console.log('[SpeechEngine] 開始收音，語言:', currentLang);
    };

    recognition.onresult = function(event) {
      let interimTranscript = '';
      let finalTranscript   = '';

      for (let i = event.resultIndex; i < event.results.length; ++i) {
        const result = event.results[i];
        const text   = result[0].transcript;
        if (result.isFinal) {
          finalTranscript += text;
        } else {
          interimTranscript += text;
        }
      }

      if (interimTranscript && onInterimCallback) {
        onInterimCallback(interimTranscript);
      }
      if (finalTranscript && finalTranscript.trim() && onFinalCallback) {
        onFinalCallback(finalTranscript.trim());
      }
    };

    recognition.onerror = function(event) {
      console.warn('[SpeechEngine] 辨識錯誤:', event.error);
      if (onErrorCallback) onErrorCallback(event.error);
    };

    recognition.onend = function() {
      isListening = false;
      console.log('[SpeechEngine] 收音結束');
      // 持續收音模式：自動重新啟動
      if (shouldKeepListening) {
        try {
          recognition.start();
        } catch (e) {
          console.warn('[SpeechEngine] 重新啟動失敗:', e);
        }
      }
    };

    return true;
  }

  /**
   * 啟動收音
   * NOTE: 先以優化約束預申請麥克風，再啟動 Web Speech API，
   *       讓瀏覽器有機會重用同一條已優化的 audio track。
   * @param {string} lang - 語言代碼
   * @returns {boolean}
   */
  async function start(lang) {
    if (lang) currentLang = lang;
    shouldKeepListening = true;

    // 先預申請麥克風（套用音訊優化約束）
    await primeAudioContext();

    if (!recognition) {
      if (!init(currentLang)) return false;
    } else {
      recognition.lang = currentLang;
    }

    try {
      recognition.start();
      return true;
    } catch (e) {
      console.warn('[SpeechEngine] start() 例外（可能已在執行中）:', e);
      return true;
    }
  }

  function stop() {
    shouldKeepListening = false;
    isListening         = false;
    if (recognition) {
      try { recognition.stop(); } catch (e) {}
    }
    // NOTE: 釋放麥克風串流，讓錄音指示燈熄滅
    releaseMicStream();
  }

  function setLanguage(lang) {
    currentLang = lang;
    if (recognition) {
      recognition.lang = lang;
      if (isListening) {
        stop();
        setTimeout(() => start(lang), 200);
      }
    }
  }

  function setCallbacks({ onInterim, onFinal, onError }) {
    onInterimCallback = onInterim;
    onFinalCallback   = onFinal;
    onErrorCallback   = onError;
  }

  return {
    isSupported,
    start,
    stop,
    setLanguage,
    setCallbacks,
    isListening: () => isListening
  };
})();
