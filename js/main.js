/**
 * 主控制邏輯
 * 設計說明：所有設定（暱稱/房間/密碼/語言）集中在 settings-modal，
 * 首次開啟自動顯示，加入房間後可關閉以最大化字幕顯示區域。
 */
document.addEventListener('DOMContentLoaded', () => {

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
  const subtitleContainer      = document.getElementById('subtitle-container');
  const subtitlesList          = document.getElementById('subtitles-list');
  const welcomeCard            = document.getElementById('welcome-card');
  const interimCard            = document.getElementById('interim-card');
  const interimText            = document.getElementById('interim-text');

  const micToggleBtn           = document.getElementById('mic-toggle-btn');
  const fontDecBtn             = document.getElementById('font-dec-btn');
  const fontIncBtn             = document.getElementById('font-inc-btn');
  const clearSubtitlesBtn      = document.getElementById('clear-subtitles-btn');
  const scrollBottomBtn        = document.getElementById('scroll-bottom-btn');
  const themeToggleBtn         = document.getElementById('theme-toggle-btn');

  // ── 狀態 ─────────────────────────────────────────────────
  let currentRoomId        = '';
  let shouldAutoScroll     = true;
  let isProgrammaticScroll = false;
  let currentFontSize      = 26;
  // NOTE: 追蹤目前已展開刪除按鈕的氣泡列，確保同時只有一個展開
  let activeRevealedRow    = null;

  // ── 初始化：自動彈出設定 Modal ───────────────────────────
  settingsModal.style.display = 'flex';
  initFromUrlParams();
  setupSpeechEngineCallbacks();
  setupEventListeners();

  function initFromUrlParams() {
    const params = new URLSearchParams(window.location.search);
    const room   = params.get('room');
    if (room) {
      roomIdInput.value = room;
    }
  }

  // ── 工具 ─────────────────────────────────────────────────
  function getMyName() {
    return (nicknameInput.value || '').trim() || '我';
  }
  function getMyLang() {
    return myLangSelect.value;
  }

  // ── 設定 Modal 開關 ───────────────────────────────────────
  function openSettingsModal() {
    settingsModal.style.display = 'flex';
  }

  function closeSettingsModal() {
    // 未加入房間時不允許關閉
    if (!currentRoomId) return;
    settingsModal.style.display = 'none';
  }

  // ── 房間管理 ─────────────────────────────────────────────
  function switchToJoinedUI(roomCode, hasPwd) {
    // 設定 Modal 內切換顯示
    settingsJoinSection.style.display    = 'none';
    settingsJoinedSection.style.display  = 'block';
    joinedRoomDisplay.textContent        = roomCode.toUpperCase();
    joinedLockIcon.style.display         = hasPwd ? 'inline' : 'none';

    // 允許關閉 Modal + 顯示「開始使用」按鈕
    closeSettingsModalBtn.style.display  = 'inline-block';
    startUsingBtn.style.display          = 'block';

    // Header 顯示分享按鈕
    shareRoomBtn.style.display           = 'inline-flex';
  }

  function switchToSetupUI() {
    settingsJoinSection.style.display    = '';
    settingsJoinedSection.style.display  = 'none';
    closeSettingsModalBtn.style.display  = 'none';
    startUsingBtn.style.display          = 'none';
    shareRoomBtn.style.display           = 'none';
  }

  function joinRoom(roomCode) {
    if (!roomCode || !roomCode.trim()) {
      alert('請輸入房間碼！');
      return;
    }
    currentRoomId = roomCode.trim().toLowerCase();
    const password = (roomPwdInput.value || '').trim();

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
    currentRoomId = '';
    micToggleBtn.disabled = true;
    micToggleBtn.classList.add('disabled');
    switchToSetupUI();
    openSettingsModal();
  }

  // ── P2P 回呼 ─────────────────────────────────────────────
  function handleP2PStatus(status, message) {
    statusText.textContent = message;
    statusDot.className    = `status-dot ${status}`;
  }

  async function handleP2PData(data) {
    if (!data || !data.text) return;
    if (welcomeCard) welcomeCard.style.display = 'none';

    const cardId   = `peer-${Date.now()}-${Math.random().toString(36).substring(2, 5)}`;
    const bubbleEl = createSubtitleCard({
      id:          cardId,
      isSelf:      false,
      sender:      data.sender || '對方',
      displayText: '翻譯中...',
    });
    subtitlesList.appendChild(bubbleEl);
    checkAndAutoScroll();

    // 翻譯成「我的語言」
    const translated = await Translator.translate(
      data.text,
      getMyLang(),
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

        const bubbleEl = createSubtitleCard({
          id:          `self-${Date.now()}`,
          isSelf:      true,
          sender:      myName,
          displayText: finalText,
          spokenLang:  myLang,
        });
        subtitlesList.appendChild(bubbleEl);
        checkAndAutoScroll();

        P2PManager.broadcast({
          text:       finalText,
          spokenLang: myLang,
          sender:     myName,
          timestamp:  Date.now()
        });
      },
      onError: (err) => { console.warn('[Speech] 辨識錯誤:', err); }
    });
  }

  // ── 建立氣泡 ─────────────────────────────────────────────
  /**
   * 建立字幕氣泡元素
   * 自己：只顯示原文（可點擊修改）
   * 對方：只顯示翻譯文字（不顯示「已翻譯」標籤節省空間）
   */
  function createSubtitleCard({ id, isSelf, sender, displayText, spokenLang }) {
    const timeStr = new Date().toLocaleTimeString([], {
      hour: '2-digit', minute: '2-digit', second: '2-digit'
    });

    const bubbleRow = document.createElement('div');
    bubbleRow.className = `bubble-row ${isSelf ? 'self-row' : 'peer-row'}`;
    bubbleRow.id = id;

    // 頭像
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

    // 內容
    const contentCol = document.createElement('div');
    contentCol.className = 'bubble-content';

    // 時間 + 可修改提示
    const metaEl   = document.createElement('div');
    metaEl.className = 'card-meta';
    const timeSpan = document.createElement('span');
    timeSpan.className   = 'card-time';
    timeSpan.textContent = timeStr;
    metaEl.appendChild(timeSpan);
    if (isSelf) {
      const editBadge = document.createElement('span');
      editBadge.className   = 'edit-hint-badge';
      editBadge.textContent = '✒ 可改 ← 左滑刪';
      metaEl.appendChild(editBadge);
    }

    // 氣泡主體
    const card = document.createElement('div');
    card.className = `subtitle-card ${isSelf ? 'self-card' : 'peer-card'}`;

    const mainText = document.createElement('div');
    mainText.className   = 'bubble-main-text';
    mainText.textContent = displayText;
    card.appendChild(mainText);

    // NOTE: 對方氣泡不顯示「已翻譯」標籤，節省空間

    contentCol.appendChild(metaEl);

    if (isSelf) {
      // 自己的氣泡：包在可左滑刪除的 wrapper 裡
      const swipeWrapper = document.createElement('div');
      swipeWrapper.className = 'card-swipe-wrapper';

      const deleteReveal = document.createElement('div');
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

  // ── 左滑 / 右鍵刪除 ──────────────────────────────────────

  /** 收合指定列的刪除按鈕 */
  function collapseReveal(row) {
    const c = row && row.querySelector('.subtitle-card');
    if (c) {
      c.style.transition = 'transform 0.25s ease';
      c.style.transform  = 'translateX(0)';
    }
    if (activeRevealedRow === row) activeRevealedRow = null;
  }

  /** 以動畫移除氣泡列 */
  function removeBubble(row) {
    const h = row.offsetHeight;
    row.style.overflow     = 'hidden';
    row.style.maxHeight    = h + 'px';
    row.style.transition   = 'opacity 0.2s ease, max-height 0.3s ease, margin-bottom 0.3s ease';
    requestAnimationFrame(() => {
      row.style.opacity      = '0';
      row.style.maxHeight    = '0';
      row.style.marginBottom = '0';
    });
    setTimeout(() => row.remove(), 340);
  }

  /**
   * 為自己的氣泡 wrapper 設置左滑刪除 + 右鍵刪除
   * @param {HTMLElement} swipeWrapper - .card-swipe-wrapper
   * @param {HTMLElement} card         - .subtitle-card.self-card
   * @param {HTMLElement} bubbleRow    - .bubble-row.self-row
   */
  function setupSwipeDelete(swipeWrapper, card, bubbleRow) {
    const REVEAL_W  = 68; // px - 刪除按鈕寬度
    const THRESHOLD = 52; // px - 觸發展開的滑動距離
    let startX   = 0;
    let startY   = 0;
    let curDX    = 0;
    let moving   = false;
    let revealed = false;

    const deleteBtn = swipeWrapper.querySelector('.swipe-delete-reveal');

    const snapReveal = () => {
      card.style.transition = 'transform 0.25s ease';
      card.style.transform  = `translateX(-${REVEAL_W}px)`;
      revealed = true;
      // 收合其他已展開的氣泡
      if (activeRevealedRow && activeRevealedRow !== bubbleRow) collapseReveal(activeRevealedRow);
      activeRevealedRow = bubbleRow;
    };

    const snapBack = () => {
      card.style.transition = 'transform 0.25s ease';
      card.style.transform  = 'translateX(0)';
      revealed = false;
      if (activeRevealedRow === bubbleRow) activeRevealedRow = null;
    };

    // ── 觸控滑動（行動裝置）──
    swipeWrapper.addEventListener('touchstart', (e) => {
      startX  = e.touches[0].clientX;
      startY  = e.touches[0].clientY;
      curDX   = 0;
      moving  = false;
      if (!revealed) card.style.transition = 'none';
    }, { passive: true });

    swipeWrapper.addEventListener('touchmove', (e) => {
      const dx = e.touches[0].clientX - startX;
      const dy = e.touches[0].clientY - startY;
      // 若主要方向是垂直，忽略（讓頁面正常捲動）
      if (!moving && Math.abs(dy) > Math.abs(dx) + 8) return;
      moving = true;
      curDX  = dx;
      const base    = revealed ? -REVEAL_W : 0;
      const clamped = Math.max(-REVEAL_W * 1.25, Math.min(0, base + dx));
      card.style.transform = `translateX(${clamped}px)`;
    }, { passive: true });

    swipeWrapper.addEventListener('touchend', () => {
      if (!moving) return;
      const base = revealed ? -REVEAL_W : 0;
      if (base + curDX < -THRESHOLD) snapReveal();
      else snapBack();
    });

    // ── 點擊刪除按鈕 ──
    deleteBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      if (confirm('確定刪除此條字幕？')) {
        removeBubble(bubbleRow);
        activeRevealedRow = null;
      } else {
        snapBack();
      }
    });

    // ── 右鍵點擊（桌面）──
    card.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      if (confirm('確定刪除此條字幕？')) removeBubble(bubbleRow);
    });
  }

  // 觸控 / 點擊氣泡外側 → 收合刪除按鈕
  document.addEventListener('touchstart', (e) => {
    if (activeRevealedRow && !activeRevealedRow.contains(e.target)) collapseReveal(activeRevealedRow);
  }, { passive: true });
  document.addEventListener('mousedown', (e) => {
    if (activeRevealedRow && !activeRevealedRow.contains(e.target)) collapseReveal(activeRevealedRow);
  });

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
      P2PManager.broadcast({
        text:       corrected,
        spokenLang: spokenLang || getMyLang(),
        sender:     getMyName(),
        timestamp:  Date.now()
      });
    });
    mainTextEl.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); mainTextEl.blur(); }
    });
  }

  // ── 滾動控制 ─────────────────────────────────────────────
  function isScrolledToBottom() {
    const threshold = Math.max(120, subtitleContainer.clientHeight * 0.15);
    return (subtitleContainer.scrollHeight - subtitleContainer.scrollTop - subtitleContainer.clientHeight) <= threshold;
  }
  function checkAndAutoScroll() { if (shouldAutoScroll) scrollToBottom(); }
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
    // 設定 Modal
    settingsBtn.addEventListener('click', openSettingsModal);
    closeSettingsModalBtn.addEventListener('click', closeSettingsModal);
    startUsingBtn.addEventListener('click', closeSettingsModal);

    // 加入 / 離開房間
    joinRoomBtn.addEventListener('click', () => joinRoom(roomIdInput.value));
    roomIdInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') joinRoom(roomIdInput.value); });
    leaveRoomBtn.addEventListener('click', () => { if (confirm('確定離開目前房間？')) leaveRoom(); });

    // 麥克風
    micToggleBtn.addEventListener('click', async () => {
      if (!currentRoomId) { openSettingsModal(); return; }
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
      if (SpeechEngine.isListening()) SpeechEngine.setLanguage(getMyLang());
    });

    // 字號調整
    fontIncBtn.addEventListener('click', () => {
      currentFontSize = Math.min(48, currentFontSize + 2);
      document.documentElement.style.setProperty('--subtitle-font-size', `${currentFontSize}px`);
    });
    fontDecBtn.addEventListener('click', () => {
      currentFontSize = Math.max(14, currentFontSize - 2);
      document.documentElement.style.setProperty('--subtitle-font-size', `${currentFontSize}px`);
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
    });

    // 分享 Modal
    shareRoomBtn.addEventListener('click', openShareModal);
    closeShareModalBtn.addEventListener('click', () => { shareModal.style.display = 'none'; });
    shareModal.addEventListener('click', (e) => { if (e.target === shareModal) shareModal.style.display = 'none'; });
    copyUrlBtn.addEventListener('click', () => {
      shareUrlInput.select();
      document.execCommand('copy');
      copyUrlBtn.textContent = '✅ 已複製！';
      setTimeout(() => { copyUrlBtn.textContent = '複製連結'; }, 2000);
    });
  }

  function openShareModal() {
    if (!currentRoomId) { alert('請先加入房間！'); return; }
    modalRoomIdDisplay.textContent = currentRoomId;
    const shareUrl = `${window.location.origin}${window.location.pathname}?room=${currentRoomId}`;
    shareUrlInput.value = shareUrl;
    qrcodeContainer.innerHTML = '';
    new QRCode(qrcodeContainer, { text: shareUrl, width: 160, height: 160 });
    shareModal.style.display = 'flex';
  }
});
