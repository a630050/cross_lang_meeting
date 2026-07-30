/**
 * 跨语言实时对讲字幕机 - 主控制逻辑
 */
document.addEventListener('DOMContentLoaded', () => {
  // DOM 元素引用
  const roomIdInput = document.getElementById('room-id-input');
  const joinRoomBtn = document.getElementById('join-room-btn');
  const mySpokenLangSelect = document.getElementById('my-spoken-lang');
  const myTargetLangSelect = document.getElementById('my-target-lang');
  
  const statusDot = document.querySelector('.status-dot');
  const statusText = document.getElementById('status-text');
  
  const subtitleContainer = document.getElementById('subtitle-container');
  const subtitlesList = document.getElementById('subtitles-list');
  const welcomeCard = document.getElementById('welcome-card');
  
  const interimCard = document.getElementById('interim-card');
  const interimText = document.getElementById('interim-text');
  
  const micToggleBtn = document.getElementById('mic-toggle-btn');
  const fontDecBtn = document.getElementById('font-dec-btn');
  const fontIncBtn = document.getElementById('font-inc-btn');
  const clearSubtitlesBtn = document.getElementById('clear-subtitles-btn');
  const scrollBottomBtn = document.getElementById('scroll-bottom-btn');
  
  const themeToggleBtn = document.getElementById('theme-toggle-btn');
  const shareRoomBtn = document.getElementById('share-room-btn');
  const shareModal = document.getElementById('share-modal');
  const closeShareModalBtn = document.getElementById('close-share-modal-btn');
  const modalRoomIdDisplay = document.getElementById('modal-room-id-display');
  const qrcodeContainer = document.getElementById('qrcode-container');
  const shareUrlInput = document.getElementById('share-url-input');
  const copyUrlBtn = document.getElementById('copy-url-btn');

  // 状态变量
  let currentRoomId = '';
  let shouldAutoScroll = true;
  let isProgrammaticScroll = false;
  let subtitleCount = 0;
  let currentFontSize = 28; // 默认 28px

  // --- 1. 启动初始化 ---
  initFromUrlParams();
  setupSpeechEngineCallbacks();
  setupEventListeners();

  /**
   * 从 URL 参数中解析房间号 (例: index.html?room=8888)
   */
  function initFromUrlParams() {
    const params = new URLSearchParams(window.location.search);
    const roomParam = params.get('room');
    if (roomParam) {
      roomIdInput.value = roomParam;
      joinRoom(roomParam);
    }
  }

  /**
   * 加入/创建房间
   */
  function joinRoom(roomCode) {
    if (!roomCode || !roomCode.trim()) {
      alert('请输入房间码！');
      return;
    }

    currentRoomId = roomCode.trim().toLowerCase();
    roomIdInput.value = currentRoomId;

    // 启用收音按钮
    micToggleBtn.disabled = false;
    micToggleBtn.classList.remove('disabled');

    // 初始化 P2P 连接
    P2PManager.joinRoom(currentRoomId, handleP2PStatus, handleP2PData);
  }

  function handleP2PStatus(status, message) {
    statusText.textContent = message;
    statusDot.className = `status-dot ${status}`;
  }

  /**
   * 收到来自对方发来的 P2P 字幕数据
   */
  async function handleP2PData(data) {
    if (!data || !data.text) return;

    if (welcomeCard) welcomeCard.style.display = 'none';

    const cardId = `peer-sub-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;
    // NOTE: peer-card 无需保存 spokenLang，翻译目标语言用我的设定
    const bubbleEl = createSubtitleCard({
      id: cardId,
      isSelf: false,
      sender: data.sender || '对方',
      originalText: data.text,
      translatedText: '正在翻译中...'
    });
    subtitlesList.appendChild(bubbleEl);
    checkAndAutoScroll();

    // 将对方发来的文本翻译成「我设定的目标语言」
    const myTargetLang = myTargetLangSelect.value;
    const translatedText = await Translator.translate(data.text, myTargetLang, data.spokenLang || 'auto');
    
    const card = bubbleEl.querySelector('.subtitle-card');
    const translatedEl = card ? card.querySelector('.translated-text') : null;
    if (translatedEl) {
      translatedEl.textContent = translatedText || data.text;
    }
    checkAndAutoScroll();
  }

  /**
   * 设置 Web Speech API 本地听打回调
   */
  function setupSpeechEngineCallbacks() {
    SpeechEngine.setCallbacks({
      onInterim: (text) => {
        if (!text || !text.trim()) {
          interimCard.style.display = 'none';
          return;
        }
        interimCard.style.display = 'flex';
        interimText.textContent = text;
        checkAndAutoScroll();
      },
      onFinal: async (finalText) => {
        interimCard.style.display = 'none';
        if (!finalText || !finalText.trim()) return;

        if (welcomeCard) welcomeCard.style.display = 'none';

        const spokenLang = mySpokenLangSelect.value;
        const targetLang = myTargetLangSelect.value;

        const cardId = `self-sub-${Date.now()}`;
        const bubbleEl = createSubtitleCard({
          id: cardId,
          isSelf: true,
          sender: '我',
          spokenLang,  // NOTE: 保存语言信息以便用户编辑后重新翻译
          targetLang,
          originalText: finalText,
          translatedText: '正在翻译中...'
        });
        subtitlesList.appendChild(bubbleEl);
        checkAndAutoScroll();

        // 本地异步调用免费 Google 翻译
        const translatedText = await Translator.translate(finalText, targetLang, spokenLang);
        const card = bubbleEl.querySelector('.subtitle-card');
        const translatedEl = card ? card.querySelector('.translated-text') : null;
        if (translatedEl) {
          translatedEl.textContent = translatedText || finalText;
        }
        checkAndAutoScroll();

        // 广播给房间内的对方
        P2PManager.broadcast({
          text: finalText,
          spokenLang: spokenLang,
          sender: '对方',
          timestamp: Date.now()
        });
      },
      onError: (err) => {
        console.warn('[Speech] 听打错误:', err);
      }
    });
  }

  /**
   * 创建气泡 DOM 元素（横向排列：头像列 + 内容列）
   * @param {object} opts
   * @param {boolean} opts.isSelf      - 是否为自己的内容
   * @param {string}  opts.sender      - 发言者名称（显示于头像下方）
   * @param {string}  opts.spokenLang  - 自己说的语言（用于重译）
   * @param {string}  opts.targetLang  - 目标翻译语言
   */
  function createSubtitleCard({ id, isSelf, sender, spokenLang, targetLang, originalText, translatedText }) {
    subtitleCount++;
    const timeStr = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });

    // --- 气泡行外层：横向 flex，self 用 row-reverse ---
    const bubbleRow = document.createElement('div');
    bubbleRow.className = `bubble-row ${isSelf ? 'self-row' : 'peer-row'}`;
    bubbleRow.id = id;

    // --- 头像列：圆形 + 名称标签 ---
    const avatarCol = document.createElement('div');
    avatarCol.className = 'bubble-avatar';

    const avatarCircle = document.createElement('div');
    avatarCircle.className = 'avatar-circle';
    // NOTE: 取发言者名称第一个字作为头像文字
    avatarCircle.textContent = sender ? sender.charAt(0) : (isSelf ? '我' : '?');

    const avatarLabel = document.createElement('span');
    avatarLabel.className = 'avatar-label';
    avatarLabel.textContent = sender || (isSelf ? '我' : '对方');

    avatarCol.appendChild(avatarCircle);
    avatarCol.appendChild(avatarLabel);

    // --- 内容列：时间 meta + 气泡卡片 ---
    const contentCol = document.createElement('div');
    contentCol.className = 'bubble-content';

    // 时间 meta（发言者名称已在头像下方，此处保留时间 + 编辑徽章）
    const metaEl = document.createElement('div');
    metaEl.className = 'card-meta';
    const timeSpan = document.createElement('span');
    timeSpan.className = 'card-time';
    timeSpan.textContent = timeStr;
    metaEl.appendChild(timeSpan);

    // 自己的气泡：显示「点击可修改」提示徽章
    if (isSelf) {
      const editBadge = document.createElement('span');
      editBadge.className = 'edit-hint-badge';
      editBadge.textContent = '✒ 点击可修改';
      metaEl.appendChild(editBadge);
    }

    // 气泡主体卡片
    const card = document.createElement('div');
    card.className = `subtitle-card ${isSelf ? 'self-card' : 'peer-card'}`;

    const originalEl = document.createElement('div');
    originalEl.className = 'original-text';
    originalEl.textContent = originalText;

    const translatedEl = document.createElement('div');
    translatedEl.className = 'translated-text';
    translatedEl.textContent = translatedText;

    card.appendChild(originalEl);
    card.appendChild(translatedEl);

    contentCol.appendChild(metaEl);
    contentCol.appendChild(card);

    // 组装：头像 + 内容（CSS row-reverse 会自动让 self 头像在右边）
    bubbleRow.appendChild(avatarCol);
    bubbleRow.appendChild(contentCol);

    // NOTE: 只有自己的气泡才支持点击编辑
    if (isSelf) {
      setupBubbleEdit(originalEl, translatedEl, { spokenLang, targetLang });
    }

    return bubbleRow;
  }

  /**
   * 为气泡的「原始辨识文字」区域绑定可编辑 + 失焦自动重译逻辑
   * @param {HTMLElement} originalEl   - .original-text 元素
   * @param {HTMLElement} translatedEl - .translated-text 元素
   * @param {object}      langCtx      - { spokenLang, targetLang }
   */
  function setupBubbleEdit(originalEl, translatedEl, { spokenLang, targetLang }) {
    // 点击进入编辑模式
    originalEl.addEventListener('click', () => {
      if (originalEl.contentEditable === 'true') return; // 已经在编辑中
      originalEl.contentEditable = 'true';
      originalEl.focus();
      // 光标移到尾部
      const range = document.createRange();
      const sel = window.getSelection();
      range.selectNodeContents(originalEl);
      range.collapse(false);
      sel.removeAllRanges();
      sel.addRange(range);
    });

    // FIXME: 如果同时关闭编辑模式和重译请求，必须串行执行
    originalEl.addEventListener('blur', async () => {
      originalEl.contentEditable = 'false';
      const newText = originalEl.textContent.trim();
      if (!newText) return;

      // 重译动画 + 占位文字
      translatedEl.classList.add('retranslating');
      translatedEl.textContent = '重新翻译中...';

      const newTranslation = await Translator.translate(
        newText,
        targetLang || myTargetLangSelect.value,
        spokenLang || mySpokenLangSelect.value
      );

      translatedEl.classList.remove('retranslating');
      translatedEl.textContent = newTranslation || newText;
      checkAndAutoScroll();
    });

    // Enter 键确认完成编辑（不插入换行）
    originalEl.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        originalEl.blur();
      }
    });
  }

  // --- 2. 磁吸置底与滚动控制 (甜蜜点 160px~180px) ---
  function isScrolledToBottom() {
    // 磁吸阈值：容忍 180px 变动，兼顾手机大字型与打字换行
    const threshold = Math.max(160, subtitleContainer.clientHeight * 0.20);
    return subtitleContainer.scrollHeight - subtitleContainer.scrollTop - subtitleContainer.clientHeight <= threshold;
  }

  function checkAndAutoScroll() {
    if (shouldAutoScroll) {
      scrollToBottom();
    }
  }

  function scrollToBottom() {
    isProgrammaticScroll = true;
    subtitleContainer.scrollTop = subtitleContainer.scrollHeight;
    setTimeout(() => { isProgrammaticScroll = false; }, 50);
  }

  subtitleContainer.addEventListener('scroll', () => {
    if (isProgrammaticScroll) return;
    const atBottom = isScrolledToBottom();
    shouldAutoScroll = atBottom;
    if (atBottom) {
      scrollBottomBtn.style.display = 'none';
    } else {
      scrollBottomBtn.style.display = 'block';
    }
  });

  scrollBottomBtn.addEventListener('click', () => {
    shouldAutoScroll = true;
    scrollToBottom();
    scrollBottomBtn.style.display = 'none';
  });

  // --- 3. UI 事件监听绑定 ---
  function setupEventListeners() {
    // 进入/创建房间
    joinRoomBtn.addEventListener('click', () => {
      joinRoom(roomIdInput.value);
    });

    roomIdInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') joinRoom(roomIdInput.value);
    });

    // 开/关麦克风
    micToggleBtn.addEventListener('click', () => {
      if (!currentRoomId) {
        alert('请先输入房间码进入房间！');
        return;
      }

      if (SpeechEngine.isListening()) {
        SpeechEngine.stop();
        micToggleBtn.classList.remove('active');
        micToggleBtn.querySelector('.mic-text').textContent = '开启收音';
      } else {
        const spokenLang = mySpokenLangSelect.value;
        const success = SpeechEngine.start(spokenLang);
        if (success) {
          micToggleBtn.classList.add('active');
          micToggleBtn.querySelector('.mic-text').textContent = '正在收音中... (点击停止)';
        } else {
          alert('无法启动麦克风，请检查浏览器麦克风权限！');
        }
      }
    });

    // 语言切换
    mySpokenLangSelect.addEventListener('change', () => {
      if (SpeechEngine.isListening()) {
        SpeechEngine.setLanguage(mySpokenLangSelect.value);
      }
    });

    // 清空字幕
    clearSubtitlesBtn.addEventListener('click', () => {
      if (confirm('确定要清空当前所有字幕记录吗？')) {
        subtitlesList.innerHTML = '';
        if (welcomeCard) welcomeCard.style.display = 'block';
      }
    });

    // 调整字号
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

    // 切换暗黑/白天模式
    themeToggleBtn.addEventListener('click', () => {
      document.body.classList.toggle('light-theme');
      themeToggleBtn.textContent = document.body.classList.contains('light-theme') ? '☀️' : '🌙';
    });

    // 分享房间 Modal
    shareRoomBtn.addEventListener('click', openShareModal);
    closeShareModalBtn.addEventListener('click', () => { shareModal.style.display = 'none'; });
    shareModal.addEventListener('click', (e) => {
      if (e.target === shareModal) shareModal.style.display = 'none';
    });

    copyUrlBtn.addEventListener('click', () => {
      shareUrlInput.select();
      document.execCommand('copy');
      alert('房间链接已复制到剪贴板！');
    });
  }

  function openShareModal() {
    if (!currentRoomId) {
      alert('请先加入房间再进行分享！');
      return;
    }
    modalRoomIdDisplay.textContent = currentRoomId;
    const shareUrl = `${window.location.origin}${window.location.pathname}?room=${currentRoomId}`;
    shareUrlInput.value = shareUrl;

    // 生成 QRCode
    qrcodeContainer.innerHTML = '';
    new QRCode(qrcodeContainer, {
      text: shareUrl,
      width: 160,
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
