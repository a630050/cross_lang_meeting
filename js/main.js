/**
 * 跨語言即時對講字幕機 - 主控制邏輯
 */
document.addEventListener('DOMContentLoaded', () => {
  // DOM 元素引用
  const nicknameInput      = document.getElementById('nickname-input');
  const roomIdInput        = document.getElementById('room-id-input');
  const roomPwdInput       = document.getElementById('room-pwd-input');
  const joinRoomBtn        = document.getElementById('join-room-btn');
  const roomSetupBar       = document.getElementById('room-setup-bar');
  const roomJoinedBar      = document.getElementById('room-joined-bar');
  const joinedRoomDisplay  = document.getElementById('joined-room-display');
  const joinedLockIcon     = document.getElementById('joined-lock-icon');
  const leaveRoomBtn       = document.getElementById('leave-room-btn');
  const mySpokenLangSelect = document.getElementById('my-spoken-lang');
  const myTargetLangSelect = document.getElementById('my-target-lang');

  const statusDot  = document.querySelector('.status-dot');
  const statusText = document.getElementById('status-text');

  const subtitleContainer = document.getElementById('subtitle-container');
  const subtitlesList     = document.getElementById('subtitles-list');
  const welcomeCard       = document.getElementById('welcome-card');

  const interimCard = document.getElementById('interim-card');
  const interimText = document.getElementById('interim-text');

  const micToggleBtn      = document.getElementById('mic-toggle-btn');
  const fontDecBtn        = document.getElementById('font-dec-btn');
  const fontIncBtn        = document.getElementById('font-inc-btn');
  const clearSubtitlesBtn = document.getElementById('clear-subtitles-btn');
  const scrollBottomBtn   = document.getElementById('scroll-bottom-btn');

  const themeToggleBtn      = document.getElementById('theme-toggle-btn');
  const shareRoomBtn        = document.getElementById('share-room-btn');
  const shareModal          = document.getElementById('share-modal');
  const closeShareModalBtn  = document.getElementById('close-share-modal-btn');
  const modalRoomIdDisplay  = document.getElementById('modal-room-id-display');
  const qrcodeContainer     = document.getElementById('qrcode-container');
  const shareUrlInput       = document.getElementById('share-url-input');
  const copyUrlBtn          = document.getElementById('copy-url-btn');

  // 狀態變數
  let currentRoomId    = '';
  let shouldAutoScroll = true;
  let isProgrammaticScroll = false;
  let subtitleCount    = 0;
  let currentFontSize  = 28; // 預設 28px

  // --- 1. 啟動初始化 ---
  initFromUrlParams();
  setupSpeechEngineCallbacks();
  setupEventListeners();

  /**
   * 從 URL 參數中解析房間號 (例: index.html?room=8888)
   */
  function initFromUrlParams() {
    const params    = new URLSearchParams(window.location.search);
    const roomParam = params.get('room');
    if (roomParam) {
      roomIdInput.value = roomParam;
      joinRoom(roomParam);
    }
  }

  /**
   * 取得目前顯示用的暱稱，未設定時回傳預設值「我」
   */
  function getMyName() {
    return (nicknameInput.value || '').trim() || '我';
  }

  /**
   * 加入房間後切換 UI：隱藏輸入列，顯示已加入狀態列
   * @param {string}  roomCode - 房間碼
   * @param {boolean} hasPwd   - 是否設有密碼
   */
  function switchToJoinedUI(roomCode, hasPwd) {
    roomSetupBar.style.display    = 'none';
    roomJoinedBar.style.display   = 'flex';
    joinedRoomDisplay.textContent = roomCode.toUpperCase();
    // 有密碼時顯示🔒図示
    joinedLockIcon.style.display  = hasPwd ? 'inline' : 'none';
  }

  /**
   * 離開房間後恢復 UI：顯示輸入列，隱藏已加入狀態列
   */
  function switchToSetupUI() {
    roomSetupBar.style.display  = '';
    roomJoinedBar.style.display = 'none';
    joinedRoomDisplay.textContent = '';
  }

  /**
   * 加入／創建房間
   */
  function joinRoom(roomCode) {
    if (!roomCode || !roomCode.trim()) {
      alert('請輸入房間碼！');
      return;
    }

    currentRoomId     = roomCode.trim().toLowerCase();
    roomIdInput.value = currentRoomId;
    const password    = (roomPwdInput.value || '').trim();

    // 啟用收音按鈕
    micToggleBtn.disabled = false;
    micToggleBtn.classList.remove('disabled');

    // 切換至已加入狀態 UI
    switchToJoinedUI(currentRoomId, !!password);

    // 初始化 P2P 連線，密碼一併傳入
    P2PManager.joinRoom(currentRoomId, password, handleP2PStatus, handleP2PData);
  }

  /**
   * 離開房間：切斷 P2P、停止收音、重置所有狀態
   */
  function leaveRoom() {
    // 停止收音
    if (SpeechEngine.isListening()) {
      SpeechEngine.stop();
      micToggleBtn.classList.remove('active');
      micToggleBtn.querySelector('.mic-text').textContent = '開啟收音';
    }

    // 斷開 P2P
    P2PManager.leaveRoom();

    // 重置狀態
    currentRoomId         = '';
    micToggleBtn.disabled = true;
    micToggleBtn.classList.add('disabled');

    // 恢復 UI
    switchToSetupUI();
  }

  function handleP2PStatus(status, message) {
    statusText.textContent  = message;
    statusDot.className     = `status-dot ${status}`;
  }

  /**
   * 收到來自對方發來的 P2P 字幕資料
   * NOTE: data.sender 存放的是對方自己的暱稱，直接顯示即可
   */
  async function handleP2PData(data) {
    if (!data || !data.text) return;

    if (welcomeCard) welcomeCard.style.display = 'none';

    const cardId   = `peer-sub-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;
    const bubbleEl = createSubtitleCard({
      id:             cardId,
      isSelf:         false,
      sender:         data.sender || '對方',
      originalText:   data.text,
      translatedText: '翻譯中...'
    });
    subtitlesList.appendChild(bubbleEl);
    checkAndAutoScroll();

    // 將對方傳來的文字翻譯成「我設定的目標語言」
    const myTargetLang  = myTargetLangSelect.value;
    const translatedText = await Translator.translate(data.text, myTargetLang, data.spokenLang || 'auto');

    const card         = bubbleEl.querySelector('.subtitle-card');
    const translatedEl = card ? card.querySelector('.translated-text') : null;
    if (translatedEl) {
      translatedEl.textContent = translatedText || data.text;
    }
    checkAndAutoScroll();
  }

  /**
   * 設置 Web Speech API 本地聽打回調
   */
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

        const myName     = getMyName();
        const spokenLang = mySpokenLangSelect.value;
        const targetLang = myTargetLangSelect.value;

        const cardId   = `self-sub-${Date.now()}`;
        const bubbleEl = createSubtitleCard({
          id:             cardId,
          isSelf:         true,
          sender:         myName,
          spokenLang,     // NOTE: 保存語言資訊以便使用者編輯後重新翻譯
          targetLang,
          originalText:   finalText,
          translatedText: '翻譯中...'
        });
        subtitlesList.appendChild(bubbleEl);
        checkAndAutoScroll();

        // 本地非同步呼叫免費 Google 翻譯
        const translatedText = await Translator.translate(finalText, targetLang, spokenLang);
        const card           = bubbleEl.querySelector('.subtitle-card');
        const translatedEl   = card ? card.querySelector('.translated-text') : null;
        if (translatedEl) {
          translatedEl.textContent = translatedText || finalText;
        }
        checkAndAutoScroll();

        // 廣播給房間內的對方，sender 帶上自己的暱稱讓對方顯示
        P2PManager.broadcast({
          text:      finalText,
          spokenLang: spokenLang,
          sender:    myName,       // NOTE: 對方收到後會顯示此名稱在頭像下方
          timestamp: Date.now()
        });
      },
      onError: (err) => {
        console.warn('[Speech] 聽打錯誤:', err);
      }
    });
  }

  /**
   * 創建氣泡 DOM 元素（橫向排列：頭像列 + 內容列）
   * @param {object}  opts
   * @param {boolean} opts.isSelf     - 是否為自己的內容
   * @param {string}  opts.sender     - 發言者暱稱（顯示於頭像下方）
   * @param {string}  opts.spokenLang - 自己說的語言（用於重譯）
   * @param {string}  opts.targetLang - 目標翻譯語言
   */
  function createSubtitleCard({ id, isSelf, sender, spokenLang, targetLang, originalText, translatedText }) {
    subtitleCount++;
    const timeStr = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });

    // --- 氣泡行外層：橫向 flex，self 用 row-reverse ---
    const bubbleRow = document.createElement('div');
    bubbleRow.className = `bubble-row ${isSelf ? 'self-row' : 'peer-row'}`;
    bubbleRow.id = id;

    // --- 頭像列：圓形 + 名稱標籤 ---
    const avatarCol = document.createElement('div');
    avatarCol.className = 'bubble-avatar';

    const avatarCircle = document.createElement('div');
    avatarCircle.className = 'avatar-circle';
    // NOTE: 取發言者名稱第一個字作為頭像文字
    avatarCircle.textContent = sender ? sender.charAt(0) : (isSelf ? '我' : '?');

    const avatarLabel = document.createElement('span');
    avatarLabel.className   = 'avatar-label';
    avatarLabel.textContent = sender || (isSelf ? '我' : '對方');

    avatarCol.appendChild(avatarCircle);
    avatarCol.appendChild(avatarLabel);

    // --- 內容列：時間 meta + 氣泡卡片 ---
    const contentCol  = document.createElement('div');
    contentCol.className = 'bubble-content';

    // 時間 meta
    const metaEl  = document.createElement('div');
    metaEl.className = 'card-meta';
    const timeSpan = document.createElement('span');
    timeSpan.className   = 'card-time';
    timeSpan.textContent = timeStr;
    metaEl.appendChild(timeSpan);

    // 自己的氣泡：顯示「點擊可修改」提示徽章
    if (isSelf) {
      const editBadge = document.createElement('span');
      editBadge.className   = 'edit-hint-badge';
      editBadge.textContent = '✒ 點擊可修改';
      metaEl.appendChild(editBadge);
    }

    // 氣泡主體卡片
    const card = document.createElement('div');
    card.className = `subtitle-card ${isSelf ? 'self-card' : 'peer-card'}`;

    const originalEl  = document.createElement('div');
    originalEl.className   = 'original-text';
    originalEl.textContent = originalText;

    const translatedEl  = document.createElement('div');
    translatedEl.className   = 'translated-text';
    translatedEl.textContent = translatedText;

    card.appendChild(originalEl);
    card.appendChild(translatedEl);
    contentCol.appendChild(metaEl);
    contentCol.appendChild(card);

    // 組裝：頭像 + 內容（CSS row-reverse 讓 self 頭像在右邊）
    bubbleRow.appendChild(avatarCol);
    bubbleRow.appendChild(contentCol);

    // NOTE: 只有自己的氣泡才支援點擊編輯
    if (isSelf) {
      setupBubbleEdit(originalEl, translatedEl, { spokenLang, targetLang });
    }

    return bubbleRow;
  }

  /**
   * 為氣泡的「原始辨識文字」區域綁定可編輯 + 失焦自動重譯邏輯
   * @param {HTMLElement} originalEl   - .original-text 元素
   * @param {HTMLElement} translatedEl - .translated-text 元素
   * @param {object}      langCtx      - { spokenLang, targetLang }
   */
  function setupBubbleEdit(originalEl, translatedEl, { spokenLang, targetLang }) {
    // 點擊進入編輯模式
    originalEl.addEventListener('click', () => {
      if (originalEl.contentEditable === 'true') return;
      originalEl.contentEditable = 'true';
      originalEl.focus();
      // 游標移到尾部
      const range = document.createRange();
      const sel   = window.getSelection();
      range.selectNodeContents(originalEl);
      range.collapse(false);
      sel.removeAllRanges();
      sel.addRange(range);
    });

    // FIXME: 失焦後串行執行關閉編輯 + 重新翻譯
    originalEl.addEventListener('blur', async () => {
      originalEl.contentEditable = 'false';
      const newText = originalEl.textContent.trim();
      if (!newText) return;

      // 重譯動畫 + 占位文字
      translatedEl.classList.add('retranslating');
      translatedEl.textContent = '重新翻譯中...';

      const newTranslation = await Translator.translate(
        newText,
        targetLang || myTargetLangSelect.value,
        spokenLang || mySpokenLangSelect.value
      );

      translatedEl.classList.remove('retranslating');
      translatedEl.textContent = newTranslation || newText;
      checkAndAutoScroll();
    });

    // Enter 鍵確認完成編輯（不插入換行）
    originalEl.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        originalEl.blur();
      }
    });
  }

  // --- 2. 磁吸置底與滾動控制 ---
  function isScrolledToBottom() {
    // 磁吸閾值：容忍 180px 變動，兼顧手機大字型與打字換行
    const threshold = Math.max(160, subtitleContainer.clientHeight * 0.20);
    return subtitleContainer.scrollHeight - subtitleContainer.scrollTop - subtitleContainer.clientHeight <= threshold;
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

  // --- 3. UI 事件監聽綁定 ---
  function setupEventListeners() {
    // 進入／創建房間
    joinRoomBtn.addEventListener('click', () => {
      joinRoom(roomIdInput.value);
    });
    roomIdInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') joinRoom(roomIdInput.value);
    });

    // 離開房間
    leaveRoomBtn.addEventListener('click', () => {
      if (confirm('確定要離開目前房間嗎？')) {
        leaveRoom();
      }
    });

    // 開／關麥克風
    micToggleBtn.addEventListener('click', async () => {
      if (!currentRoomId) {
        alert('請先輸入房間碼進入房間！');
        return;
      }
      if (SpeechEngine.isListening()) {
        SpeechEngine.stop();
        micToggleBtn.classList.remove('active');
        micToggleBtn.querySelector('.mic-text').textContent = '開啟收音';
      } else {
        const spokenLang = mySpokenLangSelect.value;
        // NOTE: start() 為 async，需 await 確保麥克風優化約束申請完成
        const success = await SpeechEngine.start(spokenLang);
        if (success) {
          micToggleBtn.classList.add('active');
          micToggleBtn.querySelector('.mic-text').textContent = '正在收音中…（點擊停止）';
        } else {
          alert('無法啟動麥克風，請檢查瀏覽器麥克風權限！');
        }
      }
    });


    // 語言切換時同步更新收音語言
    mySpokenLangSelect.addEventListener('change', () => {
      if (SpeechEngine.isListening()) {
        SpeechEngine.setLanguage(mySpokenLangSelect.value);
      }
    });

    // 清空字幕
    clearSubtitlesBtn.addEventListener('click', () => {
      if (confirm('確定要清空目前所有字幕紀錄嗎？')) {
        subtitlesList.innerHTML = '';
        if (welcomeCard) welcomeCard.style.display = 'block';
      }
    });

    // 調整字號
    fontIncBtn.addEventListener('click', () => {
      currentFontSize = Math.min(48, currentFontSize + 2);
      document.documentElement.style.setProperty('--subtitle-font-size', `${currentFontSize}px`);
      document.documentElement.style.setProperty('--subtitle-translated-size', `${Math.max(16, currentFontSize - 4)}px`);
    });
    fontDecBtn.addEventListener('click', () => {
      currentFontSize = Math.max(18, currentFontSize - 2);
      document.documentElement.style.setProperty('--subtitle-font-size', `${currentFontSize}px`);
      document.documentElement.style.setProperty('--subtitle-translated-size', `${Math.max(16, currentFontSize - 4)}px`);
    });

    // 切換暗黑／白天模式
    themeToggleBtn.addEventListener('click', () => {
      document.body.classList.toggle('light-theme');
      themeToggleBtn.textContent = document.body.classList.contains('light-theme') ? '☀️' : '🌙';
    });

    // 分享房間 Modal
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
      alert('請先加入房間再進行分享！');
      return;
    }
    modalRoomIdDisplay.textContent = currentRoomId;
    const shareUrl = `${window.location.origin}${window.location.pathname}?room=${currentRoomId}`;
    shareUrlInput.value = shareUrl;

    // 生成 QRCode
    qrcodeContainer.innerHTML = '';
    new QRCode(qrcodeContainer, {
      text:   shareUrl,
      width:  160,
      height: 160
    });

    shareModal.style.display = 'flex';
  }

  function escapeHtml(text) {
    if (!text) return '';
    return text.replace(/[&<>"']/g, (m) => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;'
    })[m]);
  }
});
