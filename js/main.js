/**
 * 跨語言即時對講字幕機 - 主控制邏輯
 * 氣泡顯示規則：
 *   - 自己的氣泡：只顯示原始辨識文字（可點擊修改）
 *   - 對方的氣泡：只顯示翻譯後文字（翻成我的語言）
 */
document.addEventListener('DOMContentLoaded', () => {

  // ── DOM 引用 ─────────────────────────────────────────────
  const nicknameInput     = document.getElementById('nickname-input');
  const roomIdInput       = document.getElementById('room-id-input');
  const roomPwdInput      = document.getElementById('room-pwd-input');
  const joinRoomBtn       = document.getElementById('join-room-btn');
  const roomSetupBar      = document.getElementById('room-setup-bar');
  const roomJoinedBar     = document.getElementById('room-joined-bar');
  const joinedRoomDisplay = document.getElementById('joined-room-display');
  const joinedLockIcon    = document.getElementById('joined-lock-icon');
  const leaveRoomBtn      = document.getElementById('leave-room-btn');

  // NOTE: 只需一個語言選單，既是 STT 語言，也是翻譯目標語言
  const myLangSelect      = document.getElementById('my-spoken-lang');

  const statusDot         = document.querySelector('.status-dot');
  const statusText        = document.getElementById('status-text');

  const subtitleContainer = document.getElementById('subtitle-container');
  const subtitlesList     = document.getElementById('subtitles-list');
  const welcomeCard       = document.getElementById('welcome-card');
  const interimCard       = document.getElementById('interim-card');
  const interimText       = document.getElementById('interim-text');

  const micToggleBtn      = document.getElementById('mic-toggle-btn');
  const fontDecBtn        = document.getElementById('font-dec-btn');
  const fontIncBtn        = document.getElementById('font-inc-btn');
  const clearSubtitlesBtn = document.getElementById('clear-subtitles-btn');
  const scrollBottomBtn   = document.getElementById('scroll-bottom-btn');
  const themeToggleBtn    = document.getElementById('theme-toggle-btn');
  const shareRoomBtn      = document.getElementById('share-room-btn');
  const shareModal        = document.getElementById('share-modal');
  const closeShareModalBtn= document.getElementById('close-share-modal-btn');
  const modalRoomIdDisplay= document.getElementById('modal-room-id-display');
  const qrcodeContainer   = document.getElementById('qrcode-container');
  const shareUrlInput     = document.getElementById('share-url-input');
  const copyUrlBtn        = document.getElementById('copy-url-btn');

  // ── 狀態變數 ─────────────────────────────────────────────
  let currentRoomId        = '';
  let shouldAutoScroll     = true;
  let isProgrammaticScroll = false;
  let currentFontSize      = 26;

  // ── 初始化 ───────────────────────────────────────────────
  initFromUrlParams();
  setupSpeechEngineCallbacks();
  setupEventListeners();

  function initFromUrlParams() {
    const params = new URLSearchParams(window.location.search);
    const room   = params.get('room');
    if (room) {
      roomIdInput.value = room;
      joinRoom(room);
    }
  }

  // ── 工具函式 ─────────────────────────────────────────────

  /** 取得顯示用暱稱 */
  function getMyName() {
    return (nicknameInput.value || '').trim() || '我';
  }

  /**
   * 取得 Google Translate 相容的語言碼
   * NOTE: STT 使用 BCP-47（如 ja-JP），Translate API 使用較短碼（如 ja）
   *       translate.js 的 normalizeLangCode 已處理，直接傳入即可
   */
  function getMyLang() {
    return myLangSelect.value; // e.g. 'zh-TW', 'ja-JP', 'en-US'
  }

  // ── 房間管理 ─────────────────────────────────────────────

  function switchToJoinedUI(roomCode, hasPwd) {
    roomSetupBar.style.display    = 'none';
    roomJoinedBar.style.display   = 'flex';
    joinedRoomDisplay.textContent = roomCode.toUpperCase();
    joinedLockIcon.style.display  = hasPwd ? 'inline' : 'none';
  }

  function switchToSetupUI() {
    roomSetupBar.style.display    = '';
    roomJoinedBar.style.display   = 'none';
    joinedRoomDisplay.textContent = '';
  }

  function joinRoom(roomCode) {
    if (!roomCode || !roomCode.trim()) {
      alert('請輸入房間碼！');
      return;
    }
    currentRoomId     = roomCode.trim().toLowerCase();
    roomIdInput.value = currentRoomId;
    const password    = (roomPwdInput ? roomPwdInput.value || '' : '').trim();

    micToggleBtn.disabled = false;
    micToggleBtn.classList.remove('disabled');

    switchToJoinedUI(currentRoomId, !!password);
    P2PManager.joinRoom(currentRoomId, password, handleP2PStatus, handleP2PData);
  }

  function leaveRoom() {
    if (SpeechEngine.isListening()) {
      SpeechEngine.stop();
      micToggleBtn.classList.remove('active');
      micToggleBtn.querySelector('.mic-text').textContent = '開啟收音';
    }
    P2PManager.leaveRoom();
    currentRoomId         = '';
    micToggleBtn.disabled = true;
    micToggleBtn.classList.add('disabled');
    switchToSetupUI();
  }

  // ── P2P 回呼 ─────────────────────────────────────────────

  function handleP2PStatus(status, message) {
    statusText.textContent = message;
    statusDot.className    = `status-dot ${status}`;
  }

  /**
   * 收到對方字幕資料
   * NOTE: 翻譯目標語言由「我的語言」決定，不依賴對方設定
   */
  async function handleP2PData(data) {
    if (!data || !data.text) return;
    if (welcomeCard) welcomeCard.style.display = 'none';

    const cardId   = `peer-${Date.now()}-${Math.random().toString(36).substring(2, 5)}`;
    const bubbleEl = createSubtitleCard({
      id:           cardId,
      isSelf:       false,
      sender:       data.sender || '對方',
      displayText:  '翻譯中...',
    });
    subtitlesList.appendChild(bubbleEl);
    checkAndAutoScroll();

    // 翻譯成「我的語言」
    const translated = await Translator.translate(
      data.text,
      getMyLang(),            // 目標語言 = 我的語言
      data.spokenLang || 'auto'
    );

    const textEl = bubbleEl.querySelector('.bubble-main-text');
    if (textEl) textEl.textContent = translated || data.text;
    checkAndAutoScroll();
  }

  // ── Speech Engine 回呼 ───────────────────────────────────

  function setupSpeechEngineCallbacks() {
    SpeechEngine.setCallbacks({
      onInterim: (text) => {
        if (!text || !text.trim()) {
          interimCard.style.display = 'none';
          return;
        }
        interimCard.style.display = 'flex';
        interimText.textContent   = text;
        checkAndAutoScroll();
      },
      onFinal: async (finalText) => {
        interimCard.style.display = 'none';
        if (!finalText || !finalText.trim()) return;
        if (welcomeCard) welcomeCard.style.display = 'none';

        const myName = getMyName();
        const myLang = getMyLang();
        const cardId = `self-${Date.now()}`;

        // 自己的氣泡：只顯示原始文字
        const bubbleEl = createSubtitleCard({
          id:          cardId,
          isSelf:      true,
          sender:      myName,
          displayText: finalText,
          spokenLang:  myLang,
        });
        subtitlesList.appendChild(bubbleEl);
        checkAndAutoScroll();

        // 廣播給對方（附上我說的語言，讓對方決定翻譯目標）
        P2PManager.broadcast({
          text:       finalText,
          spokenLang: myLang,
          sender:     myName,
          timestamp:  Date.now()
        });
      },
      onError: (err) => {
        console.warn('[Speech] 辨識錯誤:', err);
      }
    });
  }

  // ── 建立氣泡 DOM ─────────────────────────────────────────

  /**
   * 建立字幕氣泡元素
   * @param {object}  opts
   * @param {boolean} opts.isSelf      - 是否為自己發話
   * @param {string}  opts.sender      - 發話者暱稱
   * @param {string}  opts.displayText - 顯示的文字（自己=原文、對方=翻譯）
   * @param {string}  [opts.spokenLang]- 自己說話的語言（用於編輯後重新翻譯廣播）
   */
  function createSubtitleCard({ id, isSelf, sender, displayText, spokenLang }) {
    const timeStr = new Date().toLocaleTimeString([], {
      hour: '2-digit', minute: '2-digit', second: '2-digit'
    });

    // 氣泡行容器
    const bubbleRow = document.createElement('div');
    bubbleRow.className = `bubble-row ${isSelf ? 'self-row' : 'peer-row'}`;
    bubbleRow.id = id;

    // 頭像欄
    const avatarCol = document.createElement('div');
    avatarCol.className = 'bubble-avatar';
    const avatarCircle = document.createElement('div');
    avatarCircle.className   = 'avatar-circle';
    avatarCircle.textContent = sender ? sender.charAt(0) : (isSelf ? '我' : '?');
    const avatarLabel = document.createElement('span');
    avatarLabel.className   = 'avatar-label';
    avatarLabel.textContent = sender || (isSelf ? '我' : '對方');
    avatarCol.appendChild(avatarCircle);
    avatarCol.appendChild(avatarLabel);

    // 內容欄
    const contentCol = document.createElement('div');
    contentCol.className = 'bubble-content';

    // 時間戳
    const metaEl = document.createElement('div');
    metaEl.className = 'card-meta';
    const timeSpan = document.createElement('span');
    timeSpan.className   = 'card-time';
    timeSpan.textContent = timeStr;
    metaEl.appendChild(timeSpan);

    // 自己的氣泡加上「可編輯」提示
    if (isSelf) {
      const editBadge = document.createElement('span');
      editBadge.className   = 'edit-hint-badge';
      editBadge.textContent = '✒ 點擊可修改';
      metaEl.appendChild(editBadge);
    }

    // 氣泡主體
    const card = document.createElement('div');
    card.className = `subtitle-card ${isSelf ? 'self-card' : 'peer-card'}`;

    // 主要文字（自己=原文、對方=翻譯）
    const mainText = document.createElement('div');
    mainText.className   = 'bubble-main-text';
    mainText.textContent = displayText;
    card.appendChild(mainText);

    // 對方氣泡加上小標籤
    if (!isSelf) {
      const langLabel = document.createElement('div');
      langLabel.className   = 'translate-label';
      langLabel.textContent = '🈳 已翻譯';
      card.appendChild(langLabel);
    }

    contentCol.appendChild(metaEl);
    contentCol.appendChild(card);

    bubbleRow.appendChild(avatarCol);
    bubbleRow.appendChild(contentCol);

    // 只有自己的氣泡才可編輯
    if (isSelf) {
      setupBubbleEdit(mainText, { spokenLang });
    }

    return bubbleRow;
  }

  /**
   * 自己氣泡可編輯：點擊進入編輯，失焦後重新廣播修正後的文字
   */
  function setupBubbleEdit(mainTextEl, { spokenLang }) {
    mainTextEl.addEventListener('click', () => {
      if (mainTextEl.contentEditable === 'true') return;
      mainTextEl.contentEditable = 'true';
      mainTextEl.focus();
      const range = document.createRange();
      const sel   = window.getSelection();
      range.selectNodeContents(mainTextEl);
      range.collapse(false);
      sel.removeAllRanges();
      sel.addRange(range);
      mainTextEl.classList.add('editing');
    });

    mainTextEl.addEventListener('blur', () => {
      mainTextEl.contentEditable = 'false';
      mainTextEl.classList.remove('editing');
      const corrected = mainTextEl.textContent.trim();
      if (!corrected) return;

      // 重新廣播修正後的文字給對方
      P2PManager.broadcast({
        text:       corrected,
        spokenLang: spokenLang || getMyLang(),
        sender:     getMyName(),
        timestamp:  Date.now()
      });
    });

    mainTextEl.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        mainTextEl.blur();
      }
    });
  }

  // ── 滾動控制 ─────────────────────────────────────────────

  function isScrolledToBottom() {
    const threshold = Math.max(140, subtitleContainer.clientHeight * 0.18);
    return (
      subtitleContainer.scrollHeight
      - subtitleContainer.scrollTop
      - subtitleContainer.clientHeight
    ) <= threshold;
  }

  function checkAndAutoScroll() {
    if (shouldAutoScroll) scrollToBottom();
  }

  function scrollToBottom() {
    isProgrammaticScroll = true;
    subtitleContainer.scrollTop = subtitleContainer.scrollHeight;
    setTimeout(() => { isProgrammaticScroll = false; }, 50);
  }

  subtitleContainer.addEventListener('scroll', () => {
    if (isProgrammaticScroll) return;
    const atBottom   = isScrolledToBottom();
    shouldAutoScroll = atBottom;
    scrollBottomBtn.style.display = atBottom ? 'none' : 'block';
  });

  scrollBottomBtn.addEventListener('click', () => {
    shouldAutoScroll = true;
    scrollToBottom();
    scrollBottomBtn.style.display = 'none';
  });

  // ── UI 事件綁定 ──────────────────────────────────────────

  function setupEventListeners() {
    // 加入房間
    joinRoomBtn.addEventListener('click', () => joinRoom(roomIdInput.value));
    roomIdInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') joinRoom(roomIdInput.value);
    });

    // 離開房間
    leaveRoomBtn.addEventListener('click', () => {
      if (confirm('確定要離開目前房間嗎？')) leaveRoom();
    });

    // 開／關麥克風
    micToggleBtn.addEventListener('click', async () => {
      if (!currentRoomId) {
        alert('請先進入房間！');
        return;
      }
      if (SpeechEngine.isListening()) {
        SpeechEngine.stop();
        micToggleBtn.classList.remove('active');
        micToggleBtn.querySelector('.mic-text').textContent = '開啟收音';
      } else {
        const success = await SpeechEngine.start(getMyLang());
        if (success) {
          micToggleBtn.classList.add('active');
          micToggleBtn.querySelector('.mic-text').textContent = '收音中…（點擊停止）';
        } else {
          alert('無法啟動麥克風，請確認瀏覽器權限！');
        }
      }
    });

    // 語言切換
    myLangSelect.addEventListener('change', () => {
      if (SpeechEngine.isListening()) {
        SpeechEngine.setLanguage(getMyLang());
      }
    });

    // 清空字幕
    clearSubtitlesBtn.addEventListener('click', () => {
      if (confirm('確定清空所有字幕？')) {
        subtitlesList.innerHTML = '';
        if (welcomeCard) welcomeCard.style.display = 'block';
      }
    });

    // 字號調整
    fontIncBtn.addEventListener('click', () => {
      currentFontSize = Math.min(48, currentFontSize + 2);
      document.documentElement.style.setProperty('--subtitle-font-size', `${currentFontSize}px`);
      document.documentElement.style.setProperty('--subtitle-translated-size', `${Math.max(14, currentFontSize - 4)}px`);
    });
    fontDecBtn.addEventListener('click', () => {
      currentFontSize = Math.max(16, currentFontSize - 2);
      document.documentElement.style.setProperty('--subtitle-font-size', `${currentFontSize}px`);
      document.documentElement.style.setProperty('--subtitle-translated-size', `${Math.max(14, currentFontSize - 4)}px`);
    });

    // 主題切換
    themeToggleBtn.addEventListener('click', () => {
      document.body.classList.toggle('light-theme');
      themeToggleBtn.textContent = document.body.classList.contains('light-theme') ? '☀️' : '🌙';
    });

    // 分享 Modal
    shareRoomBtn.addEventListener('click', openShareModal);
    closeShareModalBtn.addEventListener('click', () => { shareModal.style.display = 'none'; });
    shareModal.addEventListener('click', (e) => {
      if (e.target === shareModal) shareModal.style.display = 'none';
    });
    copyUrlBtn.addEventListener('click', () => {
      shareUrlInput.select();
      document.execCommand('copy');
      copyUrlBtn.textContent = '✅ 已複製！';
      setTimeout(() => { copyUrlBtn.textContent = '複製連結'; }, 2000);
    });
  }

  function openShareModal() {
    if (!currentRoomId) {
      alert('請先加入房間再分享！');
      return;
    }
    modalRoomIdDisplay.textContent = currentRoomId;
    const shareUrl = `${window.location.origin}${window.location.pathname}?room=${currentRoomId}`;
    shareUrlInput.value = shareUrl;
    qrcodeContainer.innerHTML = '';
    new QRCode(qrcodeContainer, { text: shareUrl, width: 160, height: 160 });
    shareModal.style.display = 'flex';
  }
});
