/**
 * 浏览器原生 Web Speech API 语音转写模块
 */
const SpeechEngine = (function() {
  let recognition = null;
  let isListening = false;
  let shouldKeepListening = false;
  let currentLang = 'zh-TW';

  let onInterimCallback = null;
  let onFinalCallback = null;
  let onErrorCallback = null;

  function isSupported() {
    return 'webkitSpeechRecognition' in window || 'SpeechRecognition' in window;
  }

  function init(lang = 'zh-TW') {
    if (!isSupported()) {
      console.error('[SpeechEngine] 浏览器不支持 Web Speech API');
      return false;
    }

    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    recognition = new SpeechRecognition();
    recognition.continuous = true; // 持续收音
    recognition.interimResults = true; // 返回临时中间结果
    recognition.lang = lang;
    currentLang = lang;

    recognition.onstart = function() {
      isListening = true;
      console.log('[SpeechEngine] 开始收音，语言:', currentLang);
    };

    recognition.onresult = function(event) {
      let interimTranscript = '';
      let finalTranscript = '';

      for (let i = event.resultIndex; i < event.results.length; ++i) {
        const result = event.results[i];
        const text = result[0].transcript;
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
      console.warn('[SpeechEngine] 识别错误:', event.error);
      if (onErrorCallback) onErrorCallback(event.error);
    };

    recognition.onend = function() {
      isListening = false;
      console.log('[SpeechEngine] 收音结束');
      // 如果用户设置了持续收音，自动重新挂起启动
      if (shouldKeepListening) {
        try {
          recognition.start();
        } catch (e) {
          console.warn('[SpeechEngine] 重新启动挂起:', e);
        }
      }
    };

    return true;
  }

  function start(lang) {
    if (lang) currentLang = lang;
    shouldKeepListening = true;

    if (!recognition) {
      if (!init(currentLang)) return false;
    } else {
      recognition.lang = currentLang;
    }

    try {
      recognition.start();
      return true;
    } catch (e) {
      console.warn('[SpeechEngine] start() 异常 (可能已在运行中):', e);
      return true;
    }
  }

  function stop() {
    shouldKeepListening = false;
    isListening = false;
    if (recognition) {
      try {
        recognition.stop();
      } catch (e) {}
    }
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
    onFinalCallback = onFinal;
    onErrorCallback = onError;
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
