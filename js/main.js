/**
 * 主控制邏輯
 * 設計說明：
 *   - 設定 Modal 首次開啟自動顯示
 *   - 輸入模式：文字輸入（textarea）或語音（麥克風 FAB）
 *   - 氣泡規則：自己=原文（可修改/刪除），對方=翻譯
 *   - 連線通知：新成員加入時顯示系統通知泡泡
 */
document.addEventListener('DOMContentLoaded', () => {

  // ── 語言旗標對照表 ────────────────────────────────────────
  const LANG_DISPLAY = {
    'zh-TW': { flag: '🇹🇼', code: 'ZHT' },
    'zh-CN': { flag: '🇨🇳', code: 'ZHS' },
    'ja-JP': { flag: '🇯🇵', code: 'JPN' },
    'en-US': { flag: '🇺🇸', code: 'ENG' },
    'ko-KR': { flag: '🇰🇷', code: 'KOR' },
    'es-ES': { flag: '🇪🇸', code: 'ESP' },
    'fr-FR': { flag: '🇫🇷', code: 'FRA' },
    'de-DE': { flag: '🇩🇪', code: 'DEU' },
    'th-TH': { flag: '🇹🇭', code: 'THA' },
    'vi-VN': { flag: '🇻🇳', code: 'VIE' },
  };

  /** 取得語言的旗標與縮寫；未定義的語言用🌐+前3碼 */
  function getLangInfo(langCode) {
    return LANG_DISPLAY[langCode] ||
      { flag: '🌐', code: (langCode || 'UNK').substring(0, 3).toUpperCase() };
  }

  // ── DOM 引用 ─────────────────────────────────────────────
  const nicknameInput          = document.getElementById('nickname-input');
  const roomIdInput            = document.getElementById('room-id-input');
  const roomPwdInput           = document.getElementById('room-pwd-input');
  const joinRoomBtn            = document.getElementById('join-room-btn');
  const settingsJoinSection    = document.getElementById('settings-join-section');
  const settingsJoinedSection  = document.getElementById('settings-joined-section');
  const joinedRoomDisplay      = document.getElementById('joined-room-display');
  const joinedLockIcon         = document.getElementById('joined-lock-icon');
  const leaveRoomBtn           = document.getElementById('leave-room-btn');
  const myLangSelect           = document.getElementById('my-spoken-lang');

  const settingsModal          = document.getElementById('settings-modal');
  const settingsBtn            = document.getElementById('settings-btn');
  const closeSettingsModalBtn  = document.getElementById('close-settings-modal-btn');
  const startUsingBtn          = document.getElementById('start-using-btn');

  const shareModal             = document.getElementById('share-modal');
  const shareRoomBtn           = document.getElementById('share-room-btn');
  const closeShareModalBtn     = document.getElementById('close-share-modal-btn');
  const modalRoomIdDisplay     = document.getElementById('modal-room-id-display');
  const qrcodeContainer        = document.getElementById('qrcode-container');
  const shareUrlInput          = document.getElementById('share-url-input');
  const copyUrlBtn             = document.getElementById('copy-url-btn');

  const statusDot              = document.querySelector('.status-dot');
  const statusText             = document.getElementById('status-text');
  const connectedCountEl       = document.getElementById('connected-count');
  const subtitleContainer      = document.getElementById('subtitle-container');
  const subtitlesList          = document.getElementById('subtitles-list');
  const welcomeCard            = document.getElementById('welcome-card');
  const interimCard            = document.getElementById('interim-card');
  const interimText            = document.getElementById('interim-text');

  const micFab                 = document.getElementById('mic-fab');
  const textInput              = document.getElementById('text-input');
  const sendTextBtn            = document.getElementById('send-text-btn');
  const fontDecBtn             = document.getElementById('font-dec-btn');
  const fontIncBtn             = document.getElementById('font-inc-btn');
  const clearSubtitlesBtn      = document.getElementById('clear-subtitles-btn');
  const scrollBottomBtn        = document.getElementById('scroll-bottom-btn');
  const themeToggleBtn         = document.getElementById('theme-toggle-btn');
  const deleteHintArea         = document.getElementById('delete-hint-area');

  // ── 狀態 ─────────────────────────────────────────────────
  let currentRoomId        = '';
  let shouldAutoScroll     = true;
  let isProgrammaticScroll = false;
  let currentFontSize      = 16;
  let connectedPeers       = 0;
  // NOTE: 追蹤目前已展開刪除按鈕的氣泡列，確保同時只有一個
  let activeRevealedRow    = null;

  // ── localStorage key ──────────────────────────────────────
  const LS_PREFIX = 'crosslang_';

  // ── 初始化 ───────────────────────────────────────────────
  loadSettings();
  settingsModal.style.display = 'flex';
  initFromUrlParams();
  setupSpeechEngineCallbacks();
  setupEventListeners();
  applyFontSize();

  function initFromUrlParams() {
    const params = new URLSearchParams(window.location.search);
    const room   = params.get('room');
    if (room) roomIdInput.value = room;
  }

  // ── 工具函式 ─────────────────────────────────────────────
  function getMyName() { return (nicknameInput.value || '').trim() || '我'; }
  function getMyLang() { return myLangSelect.value; }

  function loadSettings() {
    const saved = localStorage.getItem(LS_PREFIX + 'settings');
    if (!saved) return;
    try {
      const s = JSON.parse(saved);
      if (s.nickname) nicknameInput.value = s.nickname;
      if (s.lang)     myLangSelect.value   = s.lang;
      if (s.fontSize) currentFontSize      = s.fontSize;
      if (s.theme === 'light') {
        document.body.classList.add('light-theme');
        if (themeToggleBtn) themeToggleBtn.textContent = '☀️';
      }
    } catch (e) { /* ignore corrupt data */ }
  }

  function saveSettings() {
    try {
      localStorage.setItem(LS_PREFIX + 'settings', JSON.stringify({
        nickname: nicknameInput.value,
        lang:     myLangSelect.value,
        fontSize: currentFontSize,
        theme:    document.body.classList.contains('light-theme') ? 'light' : 'dark'
      }));
    } catch (e) { /* storage full or disabled */ }
  }

  function applyFontSize() {
    document.documentElement.style.setProperty('--subtitle-font-size', `${currentFontSize}px`);
  }

  // ── 設定 Modal ───────────────────────────────────────────
  function openSettingsModal()  { settingsModal.style.display = 'flex'; }
  function closeSettingsModal() {
    if (!currentRoomId) return; // 未加入房間不允許關閉
    settingsModal.style.display = 'none';
  }

  // ── 輸入控件啟用 / 停用 ──────────────────────────────────
  function enableInputs() {
    micFab.disabled      = false;  micFab.classList.remove('disabled');
    textInput.disabled   = false;
    sendTextBtn.disabled = false;
  }

  function disableInputs() {
    if (SpeechEngine.isListening()) {
      SpeechEngine.stop();
      micFab.classList.remove('active');
      micFab.textContent = '🎤';
    }
    micFab.disabled      = true;  micFab.classList.add('disabled');
    textInput.disabled   = true;  textInput.value = '';
    sendTextBtn.disabled = true;
  }

  // ── 房間管理 ─────────────────────────────────────────────
  function switchToJoinedUI(roomCode, hasPwd) {
    settingsJoinSection.style.display    = 'none';
    settingsJoinedSection.style.display  = 'block';
    joinedRoomDisplay.textContent        = roomCode.toUpperCase();
    joinedLockIcon.style.display         = hasPwd ? 'inline' : 'none';
    closeSettingsModalBtn.style.display  = 'inline-block';
    startUsingBtn.style.display          = 'block';
    shareRoomBtn.style.display           = 'inline-flex';
    if (deleteHintArea) deleteHintArea.style.display = 'block';
    saveSettings();
  }

  function switchToSetupUI() {
    settingsJoinSection.style.display    = '';
    settingsJoinedSection.style.display  = 'none';
    closeSettingsModalBtn.style.display  = 'none';
    startUsingBtn.style.display          = 'none';
    shareRoomBtn.style.display           = 'none';
  }

  function joinRoom(roomCode) {
    if (!roomCode || !roomCode.trim()) { alert('請輸入房間碼！'); return; }
    currentRoomId = roomCode.trim().toLowerCase();
    const password = (roomPwdInput.value || '').trim();
    enableInputs();
    switchToJoinedUI(currentRoomId, !!password);
    P2PManager.joinRoom(currentRoomId, password, handleP2PStatus, handleP2PData);
    P2PManager.setPeersChangeCallback(handlePeersChange);
  }

  function leaveRoom() {
    disableInputs();
    P2PManager.leaveRoom();
    currentRoomId = '';
    connectedPeers = 0;
    if (deleteHintArea) deleteHintArea.style.display = 'none';
    updateConnectedCount();
    switchToSetupUI();
    openSettingsModal();
  }

  // ── P2P 回呼 ─────────────────────────────────────────────
  /**
   * 連線狀態更新
   * NOTE: 成功連線時廣播 join 事件，讓對方知道新成員進入
   */
  function handleP2PStatus(status, message) {
    statusText.textContent = message;
    statusDot.className    = `status-dot ${status}`;

    if (status === 'connected' && message.includes('成功連線')) {
      showSystemNotice('✅ 已與對方建立連線！');
      setTimeout(() => {
        P2PManager.broadcast({ type: 'join', sender: getMyName(), timestamp: Date.now() });
      }, 300);
    }
    if (status === 'disconnected') {
      connectedPeers = 0;
      updateConnectedCount();
    }
  }


  /**
   * 收到對方資料
   * type === 'join'：系統通知（新成員加入）
   * 其他：翻譯後顯示為對方氣泡
   */
  async function handleP2PData(data) {
    if (!data) return;

    // 系統事件：對方加入房間
    if (data.type === 'join') {
      showSystemNotice(`👥 ${data.sender || '對方'} 進入了房間`);
      return;
    }

    if (!data.text) return;
    if (welcomeCard) welcomeCard.style.display = 'none';

    const cardId   = `peer-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`;
    const bubbleEl = createSubtitleCard({
      id:          cardId,
      isSelf:      false,
      sender:      data.sender || '對方',
      displayText: '翻譯中...',
      spokenLang:  data.spokenLang,
    });
    subtitlesList.appendChild(bubbleEl);
    checkAndAutoScroll();

    const translated = await Translator.translate(data.text, getMyLang(), data.spokenLang || 'auto');
    const textEl = bubbleEl.querySelector('.bubble-main-text');
    if (textEl) textEl.textContent = translated || data.text;
    checkAndAutoScroll();
  }

  /** P2P 連線人數變更回呼 */
  function handlePeersChange(count, event) {
    connectedPeers = count;
    updateConnectedCount();
    if (event === 'leave') {
      showSystemNotice('👋 一位成員離開了房間');
    }
  }

  function updateConnectedCount() {
    if (!connectedCountEl) return;
    if (connectedPeers === 0) {
      connectedCountEl.style.display = 'none';
    } else {
      connectedCountEl.style.display = 'inline';
      connectedCountEl.textContent = `${connectedPeers} 人已連線`;
    }
  }

  // ── Speech Engine 回呼 ───────────────────────────────────
  function setupSpeechEngineCallbacks() {
    SpeechEngine.setCallbacks({
      onInterim: (text) => {
        if (!text || !text.trim()) { interimCard.style.display = 'none'; return; }
        interimCard.style.display = 'flex';
        interimText.textContent   = text;
        checkAndAutoScroll();
      },
      onFinal: (finalText) => {
        interimCard.style.display = 'none';
        if (!finalText || !finalText.trim()) return;
        if (welcomeCard) welcomeCard.style.display = 'none';
        addSelfBubble(finalText, false); // 語音輸入
      },
      onError: (err) => console.warn('[Speech] 辨識錯誤:', err)
    });
  }

  /** 新增自己的氣泡（語音 or 文字輸入都走這裡，廣播給對方）*/
  function addSelfBubble(text, isTyped = false) {
    const myName = getMyName();
    const myLang = getMyLang();

    const bubbleEl = createSubtitleCard({
      id:          `self-${Date.now()}`,
      isSelf:      true,
      sender:      myName,
      displayText: text,
      spokenLang:  myLang,
      isTyped,
    });
    subtitlesList.appendChild(bubbleEl);
    checkAndAutoScroll();

    P2PManager.broadcast({ text, spokenLang: myLang, sender: myName, timestamp: Date.now() });
  }

  /** 顯示系統通知（連線/加入/離開等事件）*/
  function showSystemNotice(message) {
    if (welcomeCard) welcomeCard.style.display = 'none';
    const notice       = document.createElement('div');
    notice.className   = 'system-notice';
    notice.textContent = message;
    subtitlesList.appendChild(notice);
    checkAndAutoScroll();
  }

  // ── 建立氣泡 ─────────────────────────────────────────────
  /**
   * 建立字幕氣泡元素
   * @param {object} opts
   * @param {boolean} opts.isTyped - true=文字輸入，false=語音
   */
  function createSubtitleCard({ id, isSelf, sender, displayText, spokenLang, isTyped = false }) {
    const timeStr = new Date().toLocaleTimeString([], {
      hour: '2-digit', minute: '2-digit', second: '2-digit'
    });

    const bubbleRow = document.createElement('div');
    bubbleRow.className = `bubble-row ${isSelf ? 'self-row' : 'peer-row'}`;
    bubbleRow.id = id;

    // ── 頭像 ──
    const avatarCol    = document.createElement('div');
    avatarCol.className = 'bubble-avatar';
    const avatarCircle = document.createElement('div');
    avatarCircle.className   = 'avatar-circle';
    avatarCircle.textContent = sender ? sender.charAt(0) : (isSelf ? '我' : '?');
    const avatarLabel  = document.createElement('span');
    avatarLabel.className   = 'avatar-label';
    avatarLabel.textContent = sender || (isSelf ? '我' : '對方');
    avatarCol.appendChild(avatarCircle);
    avatarCol.appendChild(avatarLabel);

    // ── 內容 ──
    const contentCol = document.createElement('div');
    contentCol.className = 'bubble-content';

    // meta：時間 + 模式提示 + 語言旗標
    const metaEl   = document.createElement('div');
    metaEl.className = 'card-meta';

    const timeSpan = document.createElement('span');
    timeSpan.className   = 'card-time';
    timeSpan.textContent = timeStr;
    metaEl.appendChild(timeSpan);

    if (isSelf) {
      const hint       = document.createElement('span');
      hint.className   = 'edit-hint-badge';
      // 提示文字（點擊直觀刪除）
      hint.textContent = (isTyped ? '⌨️' : '🎤') + ' 🗑️ 刪除';
      hint.addEventListener('click', (e) => {
        e.stopPropagation();
        if (confirm('確定刪除此條字幕？')) {
          removeBubble(bubbleRow);
          if (activeRevealedRow === bubbleRow) activeRevealedRow = null;
        }
      });
      metaEl.appendChild(hint);
    }

    // 語言旗標：自己=原文語言，對方=「→ 目標語言」
    const langBadge = document.createElement('span');
    langBadge.className = 'lang-badge';
    if (isSelf && spokenLang) {
      const info = getLangInfo(spokenLang);
      langBadge.textContent = `${info.flag} ${info.code}`;
      langBadge.title       = `說話語言：${spokenLang}`;
    } else if (!isSelf) {
      const info = getLangInfo(getMyLang());
      langBadge.textContent = `→ ${info.flag} ${info.code}`;
      langBadge.title       = `已翻譯為：${getMyLang()}`;
      langBadge.classList.add('translated');
    }
    metaEl.appendChild(langBadge);

    // 氣泡主體
    const card     = document.createElement('div');
    card.className = `subtitle-card ${isSelf ? 'self-card' : 'peer-card'}`;

    const mainText = document.createElement('div');
    mainText.className   = 'bubble-main-text';
    mainText.textContent = displayText;
    card.appendChild(mainText);

    contentCol.appendChild(metaEl);

    if (isSelf) {
      // 自己的氣泡：包在左滑刪除 wrapper 裡
      const swipeWrapper  = document.createElement('div');
      swipeWrapper.className = 'card-swipe-wrapper';
      const deleteReveal  = document.createElement('div');
      deleteReveal.className = 'swipe-delete-reveal';
      deleteReveal.innerHTML = '<span class="del-icon">🗑️</span><span class="del-label">刪除</span>';
      swipeWrapper.appendChild(card);
      swipeWrapper.appendChild(deleteReveal);
      contentCol.appendChild(swipeWrapper);
      setupBubbleEdit(mainText, { spokenLang });
      setupSwipeDelete(swipeWrapper, card, bubbleRow);
    } else {
      contentCol.appendChild(card);
    }

    bubbleRow.appendChild(avatarCol);
    bubbleRow.appendChild(contentCol);
    return bubbleRow;
  }

  // ── 左滑 / 右鍵刪除 ─────────────────────────────────────

  /** 收合指定列的刪除紅框 */
  function collapseReveal(row) {
    const c = row && row.querySelector('.subtitle-card');
    if (c) { c.style.transition = 'transform 0.25s ease'; c.style.transform = 'translateX(0)'; }
    const w = row && row.querySelector('.card-swipe-wrapper');
    if (w) w.classList.remove('revealed');
    if (activeRevealedRow === row) activeRevealedRow = null;
  }

  /** 以動畫移除氣泡列（高度收縮 + 淡出）*/
  function removeBubble(row) {
    row.style.overflow     = 'hidden';
    row.style.maxHeight    = row.offsetHeight + 'px';
    row.style.transition   = 'opacity 0.2s ease, max-height 0.3s ease, margin-bottom 0.3s ease';
    requestAnimationFrame(() => {
      row.style.opacity      = '0';
      row.style.maxHeight    = '0';
      row.style.marginBottom = '0';
    });
    setTimeout(() => row.remove(), 340);
  }

  /**
   * 為自己的氣泡設置左滑刪除（觸控）+ 右鍵刪除（桌面）
   */
  function setupSwipeDelete(swipeWrapper, card, bubbleRow) {
    const REVEAL_W = 68, THRESHOLD = 52;
    let startX = 0, startY = 0, curDX = 0, moving = false, revealed = false;
    const deleteBtn = swipeWrapper.querySelector('.swipe-delete-reveal');

    const snapReveal = () => {
      card.style.transition = 'transform 0.25s ease';
      card.style.transform  = `translateX(-${REVEAL_W}px)`;
      revealed = true;
      swipeWrapper.classList.add('revealed');
      if (activeRevealedRow && activeRevealedRow !== bubbleRow) collapseReveal(activeRevealedRow);
      activeRevealedRow = bubbleRow;
    };
    const snapBack = () => {
      card.style.transition = 'transform 0.25s ease';
      card.style.transform  = 'translateX(0)';
      revealed = false;
      swipeWrapper.classList.remove('revealed');
      if (activeRevealedRow === bubbleRow) activeRevealedRow = null;
    };

    swipeWrapper.addEventListener('touchstart', (e) => {
      startX = e.touches[0].clientX; startY = e.touches[0].clientY;
      curDX = 0; moving = false;
      if (!revealed) card.style.transition = 'none';
      swipeWrapper.classList.add('swiping');
    }, { passive: true });

    swipeWrapper.addEventListener('touchmove', (e) => {
      const dx = e.touches[0].clientX - startX;
      const dy = e.touches[0].clientY - startY;
      if (!moving && Math.abs(dy) > Math.abs(dx) + 8) return;
      moving = true; curDX = dx;
      const base = revealed ? -REVEAL_W : 0;
      card.style.transform = `translateX(${Math.max(-REVEAL_W * 1.25, Math.min(0, base + dx))}px)`;
    }, { passive: true });

    swipeWrapper.addEventListener('touchend', () => {
      swipeWrapper.classList.remove('swiping');
      if (!moving) return;
      (revealed ? curDX - REVEAL_W : curDX) < -THRESHOLD ? snapReveal() : snapBack();
    });

    deleteBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      if (confirm('確定刪除此條字幕？')) { removeBubble(bubbleRow); activeRevealedRow = null; }
      else snapBack();
    });
    card.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      if (confirm('確定刪除此條字幕？')) removeBubble(bubbleRow);
    });
  }

  // 點擊氣泡外側自動收合刪除紅框
  document.addEventListener('touchstart', (e) => {
    if (activeRevealedRow && !activeRevealedRow.contains(e.target)) collapseReveal(activeRevealedRow);
  }, { passive: true });
  document.addEventListener('mousedown', (e) => {
    if (activeRevealedRow && !activeRevealedRow.contains(e.target)) collapseReveal(activeRevealedRow);
  });

  // ── 氣泡點擊編輯 ─────────────────────────────────────────
  function setupBubbleEdit(mainTextEl, { spokenLang }) {
    mainTextEl.addEventListener('click', () => {
      if (mainTextEl.contentEditable === 'true') return;
      mainTextEl.contentEditable = 'true';
      mainTextEl.focus();
      const range = document.createRange(), sel = window.getSelection();
      range.selectNodeContents(mainTextEl); range.collapse(false);
      sel.removeAllRanges(); sel.addRange(range);
      mainTextEl.classList.add('editing');
    });
    mainTextEl.addEventListener('blur', () => {
      mainTextEl.contentEditable = 'false';
      mainTextEl.classList.remove('editing');
      const corrected = mainTextEl.textContent.trim();
      if (corrected) P2PManager.broadcast({
        text: corrected, spokenLang: spokenLang || getMyLang(),
        sender: getMyName(), timestamp: Date.now()
      });
    });
    mainTextEl.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); mainTextEl.blur(); }
    });
  }

  // ── 滾動控制 ─────────────────────────────────────────────
  function isScrolledToBottom() {
    const t = Math.max(120, subtitleContainer.clientHeight * 0.15);
    return subtitleContainer.scrollHeight - subtitleContainer.scrollTop - subtitleContainer.clientHeight <= t;
  }
  function checkAndAutoScroll() { if (shouldAutoScroll) scrollToBottom(); }
  function scrollToBottom() {
    isProgrammaticScroll = true;
    subtitleContainer.scrollTop = subtitleContainer.scrollHeight;
    setTimeout(() => { isProgrammaticScroll = false; }, 50);
  }
  subtitleContainer.addEventListener('scroll', () => {
    if (isProgrammaticScroll) return;
    const atBottom = isScrolledToBottom();
    shouldAutoScroll = atBottom;
    scrollBottomBtn.style.display = atBottom ? 'none' : 'block';
  });
  scrollBottomBtn.addEventListener('click', () => {
    shouldAutoScroll = true; scrollToBottom();
    scrollBottomBtn.style.display = 'none';
  });

  // ── UI 事件綁定 ──────────────────────────────────────────
  function setupEventListeners() {
    // 設定 Modal
    settingsBtn.addEventListener('click', openSettingsModal);
    closeSettingsModalBtn.addEventListener('click', closeSettingsModal);
    startUsingBtn.addEventListener('click', closeSettingsModal);

    // 加入 / 離開房間
    joinRoomBtn.addEventListener('click', () => joinRoom(roomIdInput.value));
    roomIdInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') joinRoom(roomIdInput.value); });
    leaveRoomBtn.addEventListener('click', () => { if (confirm('確定離開目前房間？')) leaveRoom(); });
    nicknameInput.addEventListener('change', saveSettings);

    // 麥克風 FAB（點擊切換持續收音）
    micFab.addEventListener('click', async () => {
      if (!currentRoomId) { openSettingsModal(); return; }
      if (SpeechEngine.isListening()) {
        SpeechEngine.stop();
        micFab.classList.remove('active');
        micFab.textContent = '🎤';
      } else {
        const ok = await SpeechEngine.start(getMyLang());
        if (ok) {
          micFab.classList.add('active');
          micFab.textContent = '⏹️'; // 停止符號提示使用者再按可停止
        } else {
          alert('無法啟動麥克風，請確認瀏覽器權限！');
        }
      }
    });

    // 語言切換（可在對話中途更改）
    myLangSelect.addEventListener('change', () => {
      if (SpeechEngine.isListening()) SpeechEngine.setLanguage(getMyLang());
      saveSettings();
    });

    // 文字輸入 textarea：自動展高
    textInput.addEventListener('input', () => {
      textInput.style.height = 'auto';
      textInput.style.height = Math.min(textInput.scrollHeight, 110) + 'px';
    });
    // Enter 送出，Shift+Enter 換行
    textInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendText(); }
    });
    sendTextBtn.addEventListener('click', sendText);

    function sendText() {
      const text = textInput.value.trim();
      if (!text || !currentRoomId) return;
      if (welcomeCard) welcomeCard.style.display = 'none';
      addSelfBubble(text, true); // isTyped = true
      textInput.value = '';
      textInput.style.height = 'auto';
      textInput.focus();
    }

    // 字號調整
    fontIncBtn.addEventListener('click', () => {
      currentFontSize = Math.min(48, currentFontSize + 2);
      applyFontSize();
      saveSettings();
    });
    fontDecBtn.addEventListener('click', () => {
      currentFontSize = Math.max(14, currentFontSize - 2);
      applyFontSize();
      saveSettings();
    });

    // 清空字幕
    clearSubtitlesBtn.addEventListener('click', () => {
      if (confirm('確定清空所有字幕？')) {
        subtitlesList.innerHTML = '';
        if (welcomeCard) welcomeCard.style.display = 'block';
      }
    });

    // 主題切換
    themeToggleBtn.addEventListener('click', () => {
      document.body.classList.toggle('light-theme');
      themeToggleBtn.textContent = document.body.classList.contains('light-theme') ? '☀️' : '🌙';
      saveSettings();
    });

    // 分享 Modal
    shareRoomBtn.addEventListener('click', openShareModal);
    closeShareModalBtn.addEventListener('click', () => { shareModal.style.display = 'none'; });
    shareModal.addEventListener('click', (e) => { if (e.target === shareModal) shareModal.style.display = 'none'; });
    copyUrlBtn.addEventListener('click', () => {
      shareUrlInput.select(); document.execCommand('copy');
      copyUrlBtn.textContent = '✅ 已複製！';
      setTimeout(() => { copyUrlBtn.textContent = '複製連結'; }, 2000);
    });
  }

  function openShareModal() {
    if (!currentRoomId) { alert('請先加入房間！'); return; }
    modalRoomIdDisplay.textContent = currentRoomId;
    const url = `${window.location.origin}${window.location.pathname}?room=${currentRoomId}`;
    shareUrlInput.value = url;
    qrcodeContainer.innerHTML = '';
    new QRCode(qrcodeContainer, { text: url, width: 160, height: 160 });
    shareModal.style.display = 'flex';
  }
});
