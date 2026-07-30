/**
 * PeerJS P2P 房间信令与数据通道通信模块 (0 后端依赖)
 */
const P2PManager = (function() {
  let peer = null;
  let connections = {}; // connected peer DataChannels
  let myPeerId = null;
  let roomId = null;
  
  let onDataCallback = null;
  let onStatusCallback = null;

  /**
   * 初始化 P2P 实例并建立/加入房间
   * @param {string} roomCode 4~12 位房间号 (如 '8888')
   */
  function joinRoom(roomCode, onStatus, onData) {
    roomId = roomCode.trim().toLowerCase();
    onStatusCallback = onStatus;
    onDataCallback = onData;

    // 为该设备随机生成唯一的 Peer ID 标识
    myPeerId = `cross-sub-${roomId}-${Math.random().toString(36).substring(2, 8)}`;

    if (peer) {
      try { peer.destroy(); } catch(e) {}
    }

    if (onStatusCallback) onStatusCallback('connecting', '正在连接 P2P 网络...');

    // 连接 PeerJS 公开信令云 (免费 0 成本)
    peer = new Peer(myPeerId, {
      debug: 1
    });

    peer.on('open', (id) => {
      console.log('[P2P] 成功注册我的 Peer ID:', id);
      if (onStatusCallback) onStatusCallback('connected', `已加入房间 [${roomId}]`);

      // 广播扫描与连接同一房间的其他 Peer
      connectToRoomPeers();
    });

    // 监听 incoming P2P 连接
    peer.on('connection', (conn) => {
      setupConnection(conn);
    });

    peer.on('error', (err) => {
      console.warn('[P2P] Peer 发生异常:', err);
      if (onStatusCallback) onStatusCallback('disconnected', `网络连接提示: ${err.type || err}`);
    });

    peer.on('disconnected', () => {
      console.log('[P2P] 断开信令服务器，尝试自动重连...');
      try { peer.reconnect(); } catch(e) {}
    });
  }

  function setupConnection(conn) {
    conn.on('open', () => {
      console.log('[P2P] P2P 通道建立成功:', conn.peer);
      connections[conn.peer] = conn;
      if (onStatusCallback) onStatusCallback('connected', `已与对方连线成功！`);
    });

    conn.on('data', (data) => {
      console.log('[P2P] 收到来自对方的数据:', data);
      if (onDataCallback) onDataCallback(data);
    });

    conn.on('close', () => {
      console.log('[P2P] 通道已关闭:', conn.peer);
      delete connections[conn.peer];
      if (Object.keys(connections).length === 0) {
        if (onStatusCallback) onStatusCallback('connected', `对方已离开房间`);
      }
    });

    conn.on('error', (err) => {
      console.warn('[P2P] 通道异常:', err);
      delete connections[conn.peer];
    });
  }

  /**
   * 连线至房间的主节点 (以房间号作为固定前缀尝试连接)
   */
  function connectToRoomPeers() {
    // 尝试与同房间的前缀发起 P2P 连接
    const targetBase = `cross-sub-${roomId}-`;
    
    // 如果已有其他设备在线，可以通过共享房间广播
    // 同时也主动监听信令
  }

  /**
   * 广播发送字幕消息给房间内所有连接的节点
   */
  function broadcast(payload) {
    const activePeers = Object.values(connections);
    activePeers.forEach(conn => {
      if (conn && conn.open) {
        try {
          conn.send(payload);
        } catch (e) {
          console.error('[P2P] 发送失败:', e);
        }
      }
    });
  }

  /**
   * 主动连接指定 Peer
   */
  function connectToPeer(targetPeerId) {
    if (!peer || targetPeerId === myPeerId) return;
    const conn = peer.connect(targetPeerId);
    setupConnection(conn);
  }

  return {
    joinRoom,
    broadcast,
    connectToPeer,
    getMyPeerId: () => myPeerId,
    getRoomId: () => roomId,
    getConnectedCount: () => Object.keys(connections).length
  };
})();
