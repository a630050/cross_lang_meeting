/**
 * PeerJS P2P 房間信令與資料通道通信模組（零後端依賴）
 *
 * 對等發現策略：錨定節點（Anchor）模式
 * - 第一個加入者嘗試佔用固定錨定 ID（roomKey-0）
 * - 後續加入者連線至錨定節點，並監聽 incoming 連線
 * - 密碼雜湊後混入 effectiveKey，不同密碼完全隔離
 */
const P2PManager = (function () {
  let peer        = null;
  let connections = {};
  let myPeerId    = null;
  let roomId      = null;
  let effectiveKey = null;

  let onDataCallback      = null;
  let onStatusCallback    = null;
  let onPeersChangeCallback = null;

  // ── 工具函式 ──────────────────────────────────────────────

  /**
   * 簡易非密碼學雜湊（djb2 變形）
   * NOTE: 目的是隱藏密碼明文，非加密安全
   */
  function simpleHash(str) {
    let h = 5381;
    for (let i = 0; i < str.length; i++) {
      h = Math.imul(h, 33) ^ str.charCodeAt(i);
    }
    return (h >>> 0).toString(36).padStart(6, '0').slice(-6);
  }

  // ── 進入房間主流程 ────────────────────────────────────────

  /**
   * 初始化 P2P 實例並加入房間
   * @param {string} roomCode  4~12 位房間碼
   * @param {string} password  房間密碼（空字串表示無密碼）
   * @param {Function} onStatus
   * @param {Function} onData
   */
  function joinRoom(roomCode, password, onStatus, onData) {
    roomId           = roomCode.trim().toLowerCase();
    onStatusCallback = onStatus;
    onDataCallback   = onData;

    const pwdSuffix = password ? `-${simpleHash(password.trim())}` : '';
    effectiveKey    = `${roomId}${pwdSuffix}`;

    // 銷毀舊連線
    if (peer) {
      try { peer.destroy(); } catch (e) {}
      peer = null;
      connections = {};
    }

    if (onStatusCallback) onStatusCallback('connecting', '正在連線 P2P 網路...');
    tryAsAnchor();
  }

  /**
   * 嘗試成為錨定節點（房間內第一人）
   * 錨定 ID 格式：cross-sub-{effectiveKey}-0
   * NOTE: PeerJS 若回傳 unavailable-id 錯誤，表示錨定已被佔用，
   *       此時切換為客戶端模式主動連線至錨定節點
   */
  function tryAsAnchor() {
    const anchorId = `cross-sub-${effectiveKey}-0`;
    myPeerId = anchorId;

    peer = new Peer(anchorId, { debug: 0 });

    peer.on('open', (id) => {
      console.log('[P2P] 成為錨定節點:', id);
      if (onStatusCallback) onStatusCallback('connected', `已加入房間 [${roomId}]，等待對方連線...`);
    });

    peer.on('error', (err) => {
      if (err.type === 'unavailable-id') {
        // 錨定 ID 已被佔用 → 切換為客戶端模式
        console.log('[P2P] 錨定節點已存在，以客戶端身份加入');
        joinAsClient(anchorId);
      } else {
        console.warn('[P2P] 連線錯誤:', err.type, err);
        if (onStatusCallback) onStatusCallback('disconnected', `連線提示：${err.type}`);
      }
    });

    // 監聽對方主動連入
    peer.on('connection', (conn) => {
      setupConnection(conn);
    });

    peer.on('disconnected', () => {
      console.log('[P2P] 與信令伺服器斷線，嘗試重連...');
      try { peer.reconnect(); } catch (e) {}
    });
  }

  /**
   * 以隨機 ID 加入，並主動連線至錨定節點
   * @param {string} anchorId - 錨定節點的 Peer ID
   */
  function joinAsClient(anchorId) {
    if (peer) {
      try { peer.destroy(); } catch (e) {}
    }

    const clientId = `cross-sub-${effectiveKey}-${Math.random().toString(36).substring(2, 8)}`;
    myPeerId = clientId;

    peer = new Peer(clientId, { debug: 0 });

    peer.on('open', (id) => {
      console.log('[P2P] 以客戶端身份加入:', id);
      if (onStatusCallback) onStatusCallback('connecting', '正在與對方建立點對點連線...');

      // 主動連線至錨定節點
      const conn = peer.connect(anchorId, { reliable: true });
      setupConnection(conn);
    });

    // NOTE: 同一房間可能有多人，也監聽 incoming 連線
    peer.on('connection', (conn) => {
      setupConnection(conn);
    });

    peer.on('error', (err) => {
      console.warn('[P2P] 客戶端連線錯誤:', err.type);
      if (onStatusCallback) onStatusCallback('disconnected', `連線失敗：${err.type}`);
    });

    peer.on('disconnected', () => {
      try { peer.reconnect(); } catch (e) {}
    });
  }

  // ── 連線事件處理 ──────────────────────────────────────────

  function setupConnection(conn) {
    // NOTE: PeerJS 關鍵 bug 修正
    // 錨定節點收到 incoming connection 時，conn 可能已是 open 狀態，
    // 若在此後才 attach conn.on('open')，事件不會再觸發。
    // 解法：先檢查 conn.open，已開啟就直接處理，否則才等事件。
    const handleOpen = () => {
      console.log('[P2P] ✅ 資料通道建立成功:', conn.peer);
      connections[conn.peer] = conn;
      if (onStatusCallback) onStatusCallback('connected', '✅ 已與對方成功連線！');
      if (onPeersChangeCallback) onPeersChangeCallback(Object.keys(connections).length, 'join');
    };

    if (conn.open) {
      // Incoming connection 已在 open 狀態，立即處理
      handleOpen();
    } else {
      conn.on('open', handleOpen);
    }

    conn.on('data', (data) => {
      console.log('[P2P] 收到資料:', data);
      if (onDataCallback) onDataCallback(data);
    });

    conn.on('close', () => {
      console.log('[P2P] 通道關閉:', conn.peer);
      delete connections[conn.peer];
      if (onPeersChangeCallback) onPeersChangeCallback(Object.keys(connections).length, 'leave');
      if (Object.keys(connections).length === 0) {
        if (onStatusCallback) onStatusCallback('connected', `已加入房間 [${roomId}]，等待對方連線...`);
      }
    });

    conn.on('error', (err) => {
      console.warn('[P2P] 通道錯誤:', err);
      delete connections[conn.peer];
    });
  }

  // ── 對外 API ─────────────────────────────────────────────

  /**
   * 廣播訊息給房間內所有已連線節點
   */
  function broadcast(payload) {
    const peers = Object.values(connections);
    if (peers.length === 0) {
      console.warn('[P2P] 目前無已連線節點，廣播未送出');
    }
    peers.forEach(conn => {
      if (conn && conn.open) {
        try { conn.send(payload); } catch (e) {
          console.error('[P2P] 發送失敗:', e);
        }
      }
    });
  }

  /**
   * 主動連線至指定 Peer ID
   */
  function connectToPeer(targetPeerId) {
    if (!peer || targetPeerId === myPeerId) return;
    const conn = peer.connect(targetPeerId, { reliable: true });
    setupConnection(conn);
  }

  /**
   * 離開房間：關閉所有連線並銷毀 Peer 實例
   */
  function leaveRoom() {
    Object.values(connections).forEach(conn => {
      try { conn.close(); } catch (e) {}
    });
    connections = {};

    if (peer) {
      try { peer.destroy(); } catch (e) {}
      peer = null;
    }

    myPeerId     = null;
    roomId       = null;
    effectiveKey = null;

    if (onStatusCallback) onStatusCallback('disconnected', '未加入房間');
  }

  return {
    joinRoom,
    leaveRoom,
    broadcast,
    connectToPeer,
    setPeersChangeCallback: (cb) => { onPeersChangeCallback = cb; },
    getMyPeerId:       () => myPeerId,
    getRoomId:         () => roomId,
    getConnectedCount: () => Object.keys(connections).length
  };
})();
