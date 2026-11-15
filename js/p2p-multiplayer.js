/**
 * Fireboy & Watergirl: The Forest Temple (Kuil Hutan)
 * Direct P2P Game Engine Synchronization (Native Canvas, No Video Streaming)
 *
 * Features:
 * - PeerJS WebRTC DataChannel (Direct P2P, No Streaming)
 * - Both Host and Guest run native Phaser Canvas locally at full 60 FPS
 * - Real-time input synchronization (Host controls Fireboy, Guest controls Watergirl)
 * - Level navigation & temple map synchronization
 * - Authoritative anti-desync position & velocity correction
 * - Full mouse click support on all menu & level buttons
 * - Mobile Touch D-Pad support
 * - In-game Quick Chat / Emotes & Ping monitor
 */

(function (window) {
  'use strict';

  const PEER_PREFIX = 'fw-forest-';
  const ICE_SERVERS = [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    { urls: 'stun:stun2.l.google.com:19302' },
    { urls: 'stun:stun3.l.google.com:19302' },
    { urls: 'stun:stun4.l.google.com:19302' },
    { urls: 'stun:global.stun.twilio.com:3478' },
    {
      urls: 'turn:openrelay.metered.ca:80',
      username: 'openrelayproject',
      credential: 'openrelayproject'
    },
    {
      urls: 'turn:openrelay.metered.ca:443',
      username: 'openrelayproject',
      credential: 'openrelayproject'
    },
    {
      urls: 'turn:openrelay.metered.ca:443?transport=tcp',
      username: 'openrelayproject',
      credential: 'openrelayproject'
    }
  ];

  class FireboyWatergirlP2P {
    constructor() {
      this.peer = null;
      this.conn = null;
      this.isHost = false;
      this.isConnected = false;
      this.hostRole = 'fb'; // 'fb' = Fireboy, 'wg' = Watergirl
      this.guestRole = 'wg';
      this.myRole = 'fb';
      this.roomCode = '';
      this.pingInterval = null;
      this.syncInterval = null;
      this.currentPing = 0;
      this.remoteKeysState = {};
      this.publicTunnelUrl = null;

      this.initUIElements();
      this.bindEvents();
      this.hookPhaserEngine();
      this.checkUrlParams();
      this.checkPublicTunnel();
    }

    initUIElements() {
      this.ui = {
        lobbyOverlay: document.getElementById('lobby-overlay'),
        btnModeLocal: document.getElementById('btn-mode-local'),
        btnModeHost: document.getElementById('btn-mode-host'),
        btnModeJoin: document.getElementById('btn-mode-join'),
        hostSection: document.getElementById('host-section'),
        joinSection: document.getElementById('join-section'),
        localSection: document.getElementById('local-section'),

        // Host UI
        hostRoomCode: document.getElementById('host-room-code'),
        btnCopyLink: document.getElementById('btn-copy-link'),
        btnShowQr: document.getElementById('btn-show-qr'),
        hostRoleSelect: document.getElementById('host-role-select'),
        hostStatusText: document.getElementById('host-status-text'),
        hostOnlineBanner: document.getElementById('host-online-banner'),
        hostOnlineUrl: document.getElementById('host-online-url'),
        hostOfflineTip: document.getElementById('host-offline-tip'),

        // Join UI
        joinRoomInput: document.getElementById('join-room-input'),
        btnConnectJoin: document.getElementById('btn-connect-join'),
        joinStatusText: document.getElementById('join-status-text'),

        // HUD & In-game Bar
        gameWrapper: document.getElementById('game-wrapper'),
        root: document.getElementById('root'),
        container: document.getElementById('container'),
        hammer: document.getElementById('hammer'),
        remoteVideo: document.getElementById('remote-video'),
        hudOverlay: document.getElementById('hud-overlay'),
        statusBadge: document.getElementById('hud-status-badge'),
        pingBadge: document.getElementById('hud-ping-badge'),
        roleBadge: document.getElementById('hud-role-badge'),
        btnLobbyReturn: document.getElementById('btn-hud-lobby'),
        btnFullscreen: document.getElementById('btn-hud-fullscreen'),
        btnMute: document.getElementById('btn-hud-mute'),

        // Chat & Emotes
        chatToggleBtn: document.getElementById('btn-hud-chat'),
        chatDrawer: document.getElementById('chat-drawer'),
        chatLog: document.getElementById('chat-log'),
        chatInput: document.getElementById('chat-input'),
        btnSendChat: document.getElementById('btn-send-chat'),
        quickEmoteBtns: document.querySelectorAll('.quick-emote-btn'),
        chatFloatingArea: document.getElementById('chat-floating-area'),

        // QR Modal
        qrModal: document.getElementById('qr-modal'),
        qrContainer: document.getElementById('qr-code-canvas'),
        btnCloseQr: document.getElementById('btn-close-qr'),

        // Touch Controls
        touchControls: document.getElementById('touch-controls'),
        btnTouchLeft: document.getElementById('touch-left'),
        btnTouchRight: document.getElementById('touch-right'),
        btnTouchJump: document.getElementById('touch-jump')
      };

      // Hide video element since we use native local canvas sync
      if (this.ui.remoteVideo) {
        this.ui.remoteVideo.style.display = 'none';
      }
    }

    bindEvents() {
      if (this.ui.btnModeHost) {
        this.ui.btnModeHost.addEventListener('click', () => this.showHostSection());
      }
      if (this.ui.btnModeJoin) {
        this.ui.btnModeJoin.addEventListener('click', () => this.showJoinSection());
      }
      if (this.ui.btnModeLocal) {
        this.ui.btnModeLocal.addEventListener('click', () => this.showLocalSection());
      }

      if (this.ui.btnCopyLink) {
        this.ui.btnCopyLink.addEventListener('click', () => this.copyInviteLink());
      }
      if (this.ui.btnShowQr) {
        this.ui.btnShowQr.addEventListener('click', () => this.showQrModal());
      }
      if (this.ui.btnCloseQr) {
        this.ui.btnCloseQr.addEventListener('click', () => this.hideQrModal());
      }

      if (this.ui.hostRoleSelect) {
        this.ui.hostRoleSelect.addEventListener('change', (e) => {
          this.hostRole = e.target.value;
          this.guestRole = this.hostRole === 'fb' ? 'wg' : 'fb';
          this.myRole = this.hostRole;
          this.updateRoleBadge();
          if (this.conn && this.conn.open) {
            this.conn.send({ type: 'role-update', hostRole: this.hostRole, guestRole: this.guestRole });
          }
        });
      }

      if (this.ui.btnConnectJoin) {
        this.ui.btnConnectJoin.addEventListener('click', () => {
          const code = this.ui.joinRoomInput.value.trim().toUpperCase();
          if (code) this.joinRoom(code);
        });
      }

      if (this.ui.btnLobbyReturn) {
        this.ui.btnLobbyReturn.addEventListener('click', () => {
          if (confirm('Kembali ke menu lobi? Koneksi P2P akan terputus.')) {
            window.location.href = window.location.pathname;
          }
        });
      }

      if (this.ui.btnFullscreen) {
        this.ui.btnFullscreen.addEventListener('click', () => this.toggleFullscreen());
      }

      if (this.ui.btnMute) {
        this.ui.btnMute.addEventListener('click', () => this.toggleMute());
      }

      if (this.ui.chatToggleBtn) {
        this.ui.chatToggleBtn.addEventListener('click', () => {
          this.ui.chatDrawer.classList.toggle('open');
          if (this.ui.chatDrawer.classList.contains('open')) {
            if (this.ui.chatInput) this.ui.chatInput.focus();
            this.releaseAllGameKeys();
          }
        });
      }
      if (this.ui.btnSendChat) {
        this.ui.btnSendChat.addEventListener('click', () => this.sendCustomChat());
      }
      if (this.ui.chatInput) {
        this.ui.chatInput.addEventListener('keydown', (e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            this.sendCustomChat();
          } else if (e.key === 'Escape') {
            this.ui.chatDrawer.classList.remove('open');
            this.ui.chatInput.blur();
          }
        });
      }

      // Stop keyboard event bubbling on all text input elements
      const isolateInput = (inputEl) => {
        if (!inputEl) return;
        ['keydown', 'keyup', 'keypress'].forEach((evtType) => {
          inputEl.addEventListener(evtType, (e) => {
            e.stopPropagation();
          });
        });
        inputEl.addEventListener('focus', () => {
          this.releaseAllGameKeys();
        });
      };

      isolateInput(this.ui.chatInput);
      isolateInput(this.ui.joinRoomInput);

      document.addEventListener('focusin', () => {
        if (this.isTypingInInput()) {
          this.releaseAllGameKeys();
        }
      });
      if (this.ui.quickEmoteBtns) {
        this.ui.quickEmoteBtns.forEach((btn) => {
          btn.addEventListener('click', () => {
            const text = btn.getAttribute('data-msg') || btn.innerText;
            this.sendChatMessage(text);
          });
        });
      }

      // Keyboard Listeners for Input Sync
      window.addEventListener('keydown', (e) => this.handleKeyDown(e));
      window.addEventListener('keyup', (e) => this.handleKeyUp(e));

      // Virtual Touch Listeners for Mobile
      this.bindTouchControls();
    }

    hookPhaserEngine() {
      const checkGame = () => {
        const game = window.gameInstance;
        if (!game || !game.state) {
          setTimeout(checkGame, 200);
          return;
        }

        console.log('[P2P] Hooking into Phaser game engine...');

        // Ensure hammer allows clicks to reach buttons
        const hammer = document.getElementById('hammer');
        if (hammer) {
          hammer.style.pointerEvents = 'auto';
        }

        // Intercept Phaser keyboard engine to prevent character movements when typing in inputs
        if (game.input && game.input.keyboard) {
          const origProcessKeyDown = game.input.keyboard.processKeyDown.bind(game.input.keyboard);
          const origProcessKeyUp = game.input.keyboard.processKeyUp.bind(game.input.keyboard);

          game.input.keyboard.processKeyDown = (event) => {
            if (this.isTypingInInput()) {
              return;
            }
            return origProcessKeyDown(event);
          };

          game.input.keyboard.processKeyUp = (event) => {
            if (this.isTypingInInput()) {
              return;
            }
            return origProcessKeyUp(event);
          };

          if (game.input.keyboard.processKeyPress) {
            const origProcessKeyPress = game.input.keyboard.processKeyPress.bind(game.input.keyboard);
            game.input.keyboard.processKeyPress = (event) => {
              if (this.isTypingInInput()) {
                return;
              }
              return origProcessKeyPress(event);
            };
          }
        }

        // Clicking on game canvas immediately unfocuses any input box
        const root = document.getElementById('root');
        if (root) {
          root.addEventListener('mousedown', () => {
            if (this.isTypingInInput()) {
              if (document.activeElement && typeof document.activeElement.blur === 'function') {
                document.activeElement.blur();
              }
            }
          });
        }

        // Register state classes as early as possible
        this.ensureStateRegistered('levelMenu');
        this.ensureStateRegistered('level');

        // Listen for Phaser state changes to safely execute queued transitions
        if (game.state.onStateChange) {
          game.state.onStateChange.add((newState, oldState) => {
            console.log(`[P2P] State change: ${oldState} -> ${newState}`);

            // When guest leaves 'load' and enters 'menu' or 'levelMenu'
            if (!this.isHost && (newState === 'menu' || newState === 'levelMenu')) {
              if (this.ui.statusBadge && this.isConnected) {
                this.ui.statusBadge.innerText = '🟢 P2P Terhubung (Tamu)';
                this.ui.statusBadge.className = 'badge guest';
              }

              if (this.pendingStateSync) {
                const pending = this.pendingStateSync;
                this.pendingStateSync = null;
                console.log('[P2P] Preloader complete! Applying pending state sync:', pending);
                setTimeout(() => {
                  this.syncStateFromHost(pending);
                }, 300);
              }
            }

            // Always ensure no stuck fade overlays remain after state change
            setTimeout(() => {
              this.cleanupStuckOverlay();
            }, 1000);
          });
        }

        // Poller failsafe for pendingStateSync in case onStateChange was already dispatched
        setInterval(() => {
          if (this.pendingStateSync && game.state.current !== 'boot' && game.state.current !== 'load') {
            const pending = this.pendingStateSync;
            this.pendingStateSync = null;
            console.log('[P2P] Poller detected load complete, applying pending sync:', pending);
            this.syncStateFromHost(pending);
          }
        }, 500);

        // Intercept state changes (state.fade) to sync between Host and Guest
        const origFade = game.state.fade.bind(game.state);
        game.state.fade = (stateName, clearWorld, clearCache, parameter) => {
          console.log(`[P2P] Game state transition: -> ${stateName}`);

          // Ensure target state exists in game.state.states to prevent Phaser TypeError
          this.ensureStateRegistered(stateName);

          // Ensure currentTemple is set to avoid TypeError in Level.baseLoadComplete
          if (!game.currentTemple) {
            const temples = (game.progress && game.progress.get) ? game.progress.get('temples') : null;
            game.currentTemple = (temples && temples[0]) || { type: 'temple', id: 'forest' };
          }

          // Watchdog timer: kill stuck black overlay if fade does not finish within 2.5s
          clearTimeout(this._fadeWatchdog);
          this._fadeWatchdog = setTimeout(() => {
            this.cleanupStuckOverlay();
          }, 2500);

          // If Host, serialize clean parameters and broadcast to Guest
          if (this.isHost && this.conn && this.conn.open) {
            let cleanParam = null;
            if (stateName === 'levelMenu') {
              cleanParam = { type: 'temple', id: 'forest' };
            } else if (stateName === 'level' && parameter) {
              cleanParam = {
                type: 'level',
                id: parameter.id || parameter._id || 1,
                filename: parameter.filename || 'tutorials/levels/forest_01.json'
              };
              this.lastLevelData = cleanParam;
            }

            try {
              this.conn.send({
                type: 'state_fade',
                stateName,
                param: cleanParam
              });
            } catch (e) {
              console.warn('[P2P] Gagal mengirim state_fade:', e);
            }
          }

          return origFade(stateName, clearWorld, clearCache, parameter);
        };
      };

      setTimeout(checkGame, 300);
    }

    checkUrlParams() {
      const params = new URLSearchParams(window.location.search);
      const room = params.get('room');
      const autoJoin = params.get('join');

      if (room) {
        this.showJoinSection();
        if (this.ui.joinRoomInput) {
          this.ui.joinRoomInput.value = room.toUpperCase();
        }
        if (autoJoin === '1' || autoJoin === 'true') {
          setTimeout(() => this.joinRoom(room.toUpperCase()), 600);
        }
      }
    }

    updateActiveTab(activeBtn) {
      [this.ui.btnModeLocal, this.ui.btnModeHost, this.ui.btnModeJoin].forEach((btn) => {
        if (btn) btn.classList.remove('active');
      });
      if (activeBtn) activeBtn.classList.add('active');
    }

    showLocalSection() {
      this.ui.hostSection.style.display = 'none';
      this.ui.joinSection.style.display = 'none';
      this.ui.localSection.style.display = 'flex';
      this.updateActiveTab(this.ui.btnModeLocal);
    }

    showHostSection() {
      this.ui.hostSection.style.display = 'flex';
      this.ui.joinSection.style.display = 'none';
      this.ui.localSection.style.display = 'none';
      this.updateActiveTab(this.ui.btnModeHost);
      if (!this.peer || !this.isHost) {
        this.createHostRoom();
      }
    }

    showJoinSection() {
      this.ui.hostSection.style.display = 'none';
      this.ui.joinSection.style.display = 'flex';
      this.ui.localSection.style.display = 'none';
      this.updateActiveTab(this.ui.btnModeJoin);
    }

    startLocalMode() {
      this.isHost = true;
      this.myRole = 'both';
      this.ui.lobbyOverlay.style.display = 'none';
      this.ui.hudOverlay.style.display = 'flex';
      this.ui.statusBadge.innerText = 'Mode: 2-Pemain Lokal (1 Komputer)';
      this.ui.statusBadge.className = 'badge local';
      this.ui.roleBadge.innerText = '🔥 Fireboy (Panah) + 💧 Watergirl (WASD)';
      this.ui.pingBadge.style.display = 'none';
    }

    generateRoomCode() {
      const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
      let code = '';
      for (let i = 0; i < 4; i++) {
        code += chars.charAt(Math.floor(Math.random() * chars.length));
      }
      return code;
    }

    createHostRoom() {
      this.isHost = true;
      this.roomCode = this.generateRoomCode();
      const peerId = PEER_PREFIX + this.roomCode.toLowerCase();

      if (this.ui.hostRoomCode) {
        this.ui.hostRoomCode.innerText = this.roomCode;
      }
      if (this.ui.hostStatusText) {
        this.ui.hostStatusText.innerHTML = '<span class="spinner"></span> Membuat room P2P...';
      }

      this.peer = new Peer(peerId, {
        debug: 1,
        config: { iceServers: ICE_SERVERS }
      });

      this.peer.on('open', (id) => {
        console.log('[P2P] Host Peer siap:', id);
        if (this.ui.hostStatusText) {
          this.ui.hostStatusText.innerHTML = '✅ Room siap! Menunggu rekan bergabung...';
        }
      });

      this.peer.on('connection', (conn) => {
        this.conn = conn;
        this.setupDataConnection();
      });

      this.peer.on('error', (err) => {
        console.error('[P2P] Host peer error:', err);
        if (err.type === 'unavailable-id') {
          this.createHostRoom();
        } else if (this.ui.hostStatusText) {
          this.ui.hostStatusText.innerText = '❌ Gagal membuat room: ' + err.message;
        }
      });
    }

    joinRoom(roomCode) {
      this.isHost = false;
      this.roomCode = roomCode.toUpperCase();
      const hostPeerId = PEER_PREFIX + this.roomCode.toLowerCase();
      const myPeerId = PEER_PREFIX + 'guest-' + Math.random().toString(36).substring(2, 7);

      if (this.ui.joinStatusText) {
        this.ui.joinStatusText.innerHTML = `<span class="spinner"></span> Menghubungkan ke [${this.roomCode}]...`;
      }

      this.peer = new Peer(myPeerId, {
        debug: 1,
        config: { iceServers: ICE_SERVERS }
      });

      this.peer.on('open', () => {
        console.log('[P2P] Guest Peer siap, menghubungkan ke Host:', hostPeerId);
        this.conn = this.peer.connect(hostPeerId, { reliable: true });
        this.setupDataConnection();
      });

      this.peer.on('error', (err) => {
        console.error('[P2P] Guest peer error:', err);
        if (this.ui.joinStatusText) {
          this.ui.joinStatusText.innerText = '❌ Room tidak ditemukan atau Host offline.';
        }
      });
    }

    setupDataConnection() {
      this.conn.on('open', () => {
        console.log('[P2P] WebRTC DataChannel Terhubung (Mode Native Game Sync)!');
        this.isConnected = true;

        if (this.isHost) {
          this.myRole = this.hostRole;
          this.guestRole = this.hostRole === 'fb' ? 'wg' : 'fb';

          // Send handshake with current game state
          const game = window.gameInstance;
          const curState = game && game.state ? game.state.current : 'menu';
          const cur = game && game.state ? game.state.getCurrentState() : null;

          let curLevelData = null;
          if (cur && cur.levelData) {
            curLevelData = {
              type: 'level',
              id: cur.levelData.id || cur.levelData._id || 1,
              filename: cur.levelData.filename || 'tutorials/levels/forest_01.json'
            };
          } else if (game && game.level && game.level.levelData) {
            curLevelData = {
              type: 'level',
              id: game.level.levelData.id || game.level.levelData._id || 1,
              filename: game.level.levelData.filename || 'tutorials/levels/forest_01.json'
            };
          } else if (this.lastLevelData) {
            curLevelData = this.lastLevelData;
          } else if (curState === 'level') {
            curLevelData = { type: 'level', id: 1, filename: 'tutorials/levels/forest_01.json' };
          }

          const handshakePacket = {
            type: 'handshake',
            hostRole: this.hostRole,
            guestRole: this.guestRole,
            roomCode: this.roomCode,
            currentState: curState,
            currentTemple: { type: 'temple', id: 'forest' },
            levelData: curLevelData
          };

          console.log('[P2P] Host sending handshake to guest:', handshakePacket);
          try {
            this.conn.send(handshakePacket);
          } catch (e) {
            console.error('[P2P] Failed to send handshake:', e);
          }

          this.ui.lobbyOverlay.style.display = 'none';
          this.ui.hudOverlay.style.display = 'flex';
          this.ui.statusBadge.innerText = '🟢 P2P Terhubung (Host)';
          this.ui.statusBadge.className = 'badge host';
          this.updateRoleBadge();
          this.showToast('Teman Anda telah bergabung! Selamat bermain.');

          // Start physics sync loop
          this.startPhysicsSyncLoop();
        } else {
          this.ui.lobbyOverlay.style.display = 'none';
          this.ui.hudOverlay.style.display = 'flex';
          this.ui.statusBadge.innerText = '🟢 P2P Terhubung (Tamu)';
          this.ui.statusBadge.className = 'badge guest';
          this.showToast('Berhasil terhubung ke Host!');
        }

        this.startPingLoop();
      });

      this.conn.on('data', (data) => {
        this.handleNetworkData(data);
      });

      this.conn.on('close', () => {
        this.onPeerDisconnected();
      });

      this.conn.on('error', (err) => {
        console.error('[P2P] DataChannel error:', err);
      });
    }

    handleNetworkData(data) {
      if (!data || !data.type) return;
      if (data.type !== 'physics_sync' && data.type !== 'ping' && data.type !== 'pong') {
        console.log('[P2P] Network data received:', data.type, data);
      }

      switch (data.type) {
        case 'handshake':
          this.myRole = data.guestRole;
          this.guestRole = data.guestRole;
          this.hostRole = data.hostRole;
          this.updateRoleBadge();
          this.showToast(`Peran Anda: ${this.getRoleName(this.myRole)}`);

          // Sync game state from host if host is already in level
          if (data.currentState && data.currentState !== 'menu') {
            this.syncStateFromHost(data);
          }
          break;

        case 'role-update':
          this.myRole = data.guestRole;
          this.updateRoleBadge();
          break;

        case 'request_action':
          if (this.isHost) {
            const game = window.gameInstance;
            if (data.action === 'retry' && game && game.level) {
              game.level.retry();
            } else if (data.action === 'menu' && game) {
              game.state.fade('levelMenu', true, false, game.currentTemple);
            }
          }
          break;

        case 'state_fade':
          // Host changed state (e.g. entered temple, started level) -> Guest follows!
          const hostGameState = window.gameInstance;
          const hostCurState = hostGameState && hostGameState.state ? hostGameState.state.current : null;
          if (!hostCurState || hostCurState === 'boot' || hostCurState === 'load') {
            console.log(`[P2P] Game is in '${hostCurState}' state. Queuing state_fade...`);
            this.pendingStateSync = {
              currentState: data.stateName,
              levelData: data.param,
              stateName: data.stateName,
              param: data.param
            };
            if (this.ui.statusBadge && !this.isHost) {
              this.ui.statusBadge.innerText = '⏳ Mengunduh Aset...';
            }
            this.showToast('Menghubungkan... Mengunduh aset permainan...', 3500);
          } else {
            this.executeStateFade(data.stateName, data.param);
          }
          break;

        case 'input':
          // Receive remote keypress and inject into local Phaser engine
          this.injectRemoteInput(data);
          break;

        case 'physics_sync':
          // Guest receives position sync from authoritative Host
          if (!this.isHost) {
            this.applyPhysicsSync(data);
          }
          break;

        case 'ping':
          this.conn.send({ type: 'pong', t: data.t });
          break;

        case 'pong':
          const rtt = Math.round(performance.now() - data.t);
          this.currentPing = rtt;
          this.updatePingBadge(rtt);
          break;

        case 'chat':
          this.receiveChatMessage(data);
          break;
      }
    }

    ensureStateRegistered(name) {
      const game = window.gameInstance;
      if (!game || !game.state) return;
      if (game.state.states && game.state.states[name]) return;

      if (window.require) {
        try {
          if (name === 'levelMenu') {
            let cls = null;
            try { cls = window.require('States/LevelMenu/LevelMenu'); } catch (e) {}
            if (cls) {
              game.state.add('levelMenu', cls);
              console.log('[P2P] Registered state: levelMenu');
            } else {
              window.require(['States/LevelMenu/LevelMenu'], (loadedCls) => {
                if (loadedCls && !game.state.states.levelMenu) {
                  game.state.add('levelMenu', loadedCls);
                  console.log('[P2P] Async registered state: levelMenu');
                }
              });
            }
          } else if (name === 'level') {
            let cls = null;
            try { cls = window.require('States/Level/Level'); } catch (e) {}
            if (cls) {
              game.state.add('level', cls);
              console.log('[P2P] Registered state: level');
            } else {
              window.require(['States/Level/Level'], (loadedCls) => {
                if (loadedCls && !game.state.states.level) {
                  game.state.add('level', loadedCls);
                  console.log('[P2P] Async registered state: level');
                }
              });
            }
          }
        } catch (e) {
          console.warn(`[P2P] Error ensuring state registered (${name}):`, e);
        }
      }
    }

    cleanupStuckOverlay() {
      const game = window.gameInstance;
      if (!game || !game.state) return;

      if (game.state.fading || game.state.overlay) {
        console.warn('[P2P] Cleaning up stuck fade overlay...');
        if (game.state.overlay) {
          try {
            if (typeof game.state.overlay.kill === 'function') {
              game.state.overlay.kill();
            }
            if (game.state.overlay.parent) {
              game.state.overlay.parent.removeChild(game.state.overlay);
            }
          } catch (e) {
            console.warn('[P2P] Error killing overlay:', e);
          }
          game.state.overlay = null;
        }
        game.state.fading = false;
      }
    }

    syncStateFromHost(data) {
      const game = window.gameInstance;
      if (!game || !game.state) {
        this.pendingStateSync = data;
        return;
      }

      const current = game.state.current;
      if (!current || current === 'boot' || current === 'load') {
        console.log(`[P2P] Game is in '${current}' state. Queuing state sync from Host...`);
        this.pendingStateSync = data;
        if (this.ui.statusBadge && !this.isHost) {
          this.ui.statusBadge.innerText = '⏳ Mengunduh Aset...';
          this.ui.statusBadge.className = 'badge guest';
        }
        this.showToast('Menghubungkan... Mengunduh aset permainan...', 3500);
        return;
      }

      if (data.currentTemple) {
        game.currentTemple = data.currentTemple;
      }

      if (data.currentState === 'level') {
        const lvl = data.levelData || this.lastLevelData || { type: 'level', id: 1, filename: 'tutorials/levels/forest_01.json' };
        this.executeStateFade('level', lvl);
      } else if (data.currentState === 'levelMenu') {
        this.executeStateFade('levelMenu', data.currentTemple || { type: 'temple', id: 'forest' });
      } else if (data.stateName) {
        this.executeStateFade(data.stateName, data.param);
      }
    }

    executeStateFade(stateName, param) {
      const game = window.gameInstance;
      if (!game || !game.state) return;

      const current = game.state.current;
      if (!current || current === 'boot' || current === 'load') {
        console.log(`[P2P] executeStateFade called while in '${current}'. Queuing...`);
        this.pendingStateSync = {
          currentState: stateName,
          levelData: param,
          stateName,
          param
        };
        return;
      }

      console.log(`[P2P] Guest navigating to state: ${stateName} (current: ${current})`, param);

      // Pre-register state classes so game.state.states[stateName] is never undefined
      this.ensureStateRegistered('levelMenu');
      this.ensureStateRegistered('level');

      // Schedule watchdog timer to kill overlay if fade gets stuck
      clearTimeout(this._fadeWatchdog);
      this._fadeWatchdog = setTimeout(() => {
        this.cleanupStuckOverlay();
      }, 2500);

      // Ensure currentTemple is set
      const getTemple = () => {
        if (game.currentTemple) return game.currentTemple;
        if (game.progress && game.progress.get) {
          const temples = game.progress.get('temples');
          if (temples && temples[0]) {
            game.currentTemple = temples[0];
            return temples[0];
          }
        }
        return { type: 'temple', id: 'forest' };
      };

      const temple = getTemple();
      const cur = game.state.getCurrentState();

      if (stateName === 'levelMenu') {
        if (cur && typeof cur.startTemple === 'function') {
          // In Menu state
          cur.startTemple(temple);
        } else if (cur && cur.templeHall && cur.templeHall.onStart) {
          cur.templeHall.onStart.dispatch(temple);
        } else if (cur && typeof cur.gotoMenu === 'function') {
          // In Level state
          cur.gotoMenu();
        } else {
          game.state.fade('levelMenu', true, false, temple);
        }
      } else if (stateName === 'level' && param) {
        let levelData = param;
        if (temple && temple.levels) {
          const found = temple.levels.find(l => l.id === param.id || l.filename === param.filename);
          if (found) levelData = found;
        }

        // If guest is ALREADY in the exact same level:
        if (current === 'level' && game.level) {
          console.log('[P2P] Guest is already in level. Restarting/retrying level...');
          if (typeof game.level.retry === 'function') {
            game.level.retry();
          } else {
            game.state.fade('level', true, false, levelData);
          }
          return;
        }

        // If guest is currently in 'menu' state:
        if (cur && typeof cur.skipToLevel === 'function') {
          console.log('[P2P] Transitioning from Menu to Level via skipToLevel');
          cur.skipToLevel(levelData);
        }
        // If guest is currently in 'levelMenu' state:
        else if (cur && typeof cur.startLevel === 'function') {
          console.log('[P2P] Transitioning from LevelMenu to Level via startLevel');
          cur.startLevel({ data: levelData });
        }
        else if (cur && cur.buttons && cur.buttons.onClick) {
          cur.buttons.onClick.dispatch({ data: levelData });
        }
        else {
          console.log('[P2P] Transitioning to Level via state.fade');
          game.state.fade('level', true, false, levelData);
        }
      } else if (stateName === 'menu') {
        if (cur && typeof cur.goBack === 'function') {
          cur.goBack();
        } else {
          game.state.fade('menu', true, false);
        }
      }
    }

    startPhysicsSyncLoop() {
      if (this.syncInterval) clearInterval(this.syncInterval);

      // Broadcast authoritative positions 10 times a second
      this.syncInterval = setInterval(() => {
        if (!this.isHost || !this.conn || !this.conn.open) return;

        const game = window.gameInstance;
        if (!game || !game.level || game.state.current !== 'level') return;

        const level = game.level;
        const pers1 = level.pers1;
        const pers2 = level.pers2;

        if (!pers1 || !pers2 || !pers1.body || !pers2.body) return;

        try {
          const boxes = (level.objects || [])
            .filter(o => o.options && (o.options.type === 'box' || o.options.type === 'boxheavy' || o.options.type === 'ball') && o.body)
            .map((b, idx) => ({
              idx,
              x: Math.round(b.sprite.x * 10) / 10,
              y: Math.round(b.sprite.y * 10) / 10,
              vx: Math.round(b.body.data.GetLinearVelocity().x * 100) / 100,
              vy: Math.round(b.body.data.GetLinearVelocity().y * 100) / 100
            }));

          const syncPacket = {
            type: 'physics_sync',
            fb: {
              x: Math.round(pers1.sprite.x * 10) / 10,
              y: Math.round(pers1.sprite.y * 10) / 10,
              vx: Math.round(pers1.body.data.GetLinearVelocity().x * 100) / 100,
              vy: Math.round(pers1.body.data.GetLinearVelocity().y * 100) / 100
            },
            wg: {
              x: Math.round(pers2.sprite.x * 10) / 10,
              y: Math.round(pers2.sprite.y * 10) / 10,
              vx: Math.round(pers2.body.data.GetLinearVelocity().x * 100) / 100,
              vy: Math.round(pers2.body.data.GetLinearVelocity().y * 100) / 100
            },
            boxes
          };
          this.conn.send(syncPacket);
        } catch (e) {
          // ignore serialization errors
        }
      }, 100);
    }

    applyPhysicsSync(data) {
      const game = window.gameInstance;
      if (!game || !game.level || game.state.current !== 'level') return;

      // Watchdog: If physics packets are arriving, the level is definitely running!
      // Any lingering black overlay must be cleaned up immediately.
      if (game.state.fading || game.state.overlay) {
        this.cleanupStuckOverlay();
      }

      const level = game.level;
      const pers1 = level.pers1; // Fireboy
      const pers2 = level.pers2; // Watergirl

      const snapChar = (pers, target, isRemote) => {
        if (!pers || !pers.body || !pers.body.data || !target) return;
        const dx = Math.abs(pers.sprite.x - target.x);
        const dy = Math.abs(pers.sprite.y - target.y);

        // Remote character: smoothly correct if drift > 4px; snap exact if standing still
        const threshold = isRemote ? 4 : 8;
        if (dx > threshold || dy > threshold) {
          pers.body.x = target.x;
          pers.body.y = target.y;
          if (pers.body.data.SetLinearVelocity) {
            pers.body.data.SetLinearVelocity(new box2d.b2Vec2(target.vx, target.vy));
          }
        } else if (target.vx === 0 && target.vy === 0 && (dx > 1 || dy > 1)) {
          pers.body.x = target.x;
          pers.body.y = target.y;
        }
      };

      // Correct both characters
      if (this.myRole === 'wg') {
        snapChar(pers1, data.fb, true);  // Fireboy is remote for Watergirl player
        snapChar(pers2, data.wg, false); // Watergirl is local (drift protection)
      } else {
        snapChar(pers2, data.wg, true);  // Watergirl is remote for Fireboy player
        snapChar(pers1, data.fb, false); // Fireboy is local (drift protection)
      }

      // Synchronize pushable boxes
      if (data.boxes && level.objects) {
        const boxes = level.objects.filter(o => o.options && (o.options.type === 'box' || o.options.type === 'boxheavy' || o.options.type === 'ball') && o.body);
        data.boxes.forEach((bData) => {
          const box = boxes[bData.idx];
          if (box && box.body && box.body.data) {
            const bdx = Math.abs(box.sprite.x - bData.x);
            const bdy = Math.abs(box.sprite.y - bData.y);
            if (bdx > 6 || bdy > 6) {
              box.body.x = bData.x;
              box.body.y = bData.y;
              box.body.data.SetLinearVelocity(new box2d.b2Vec2(bData.vx, bData.vy));
            }
          }
        });
      }
    }

    isTypingInInput() {
      const active = document.activeElement;
      if (!active) return false;
      const tag = (active.tagName || '').toUpperCase();
      return tag === 'INPUT' || tag === 'TEXTAREA' || active.isContentEditable;
    }

    releaseAllGameKeys() {
      const game = window.gameInstance;
      if (game && game.input && game.input.keyboard) {
        try {
          game.input.keyboard.reset(true);
        } catch (e) {}
      }

      if (game && game.level) {
        ['pers1', 'pers2'].forEach((pName) => {
          const pers = game.level[pName];
          if (pers && pers.cursors) {
            if (pers.cursors.left) pers.cursors.left.isDown = false;
            if (pers.cursors.right) pers.cursors.right.isDown = false;
            if (pers.cursors.up) pers.cursors.up.isDown = false;
          }
        });
      }

      this.localKeysDown = {};

      if (this.conn && this.conn.open) {
        ['left', 'right', 'up'].forEach((dir) => {
          try {
            this.conn.send({
              type: 'input',
              action: 'up',
              role: this.myRole,
              dir: dir
            });
          } catch (e) {}
        });
      }
    }

    handleKeyDown(e) {
      if (this.isTypingInInput()) return;

      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', ' ', 'w', 'a', 's', 'd', 'W', 'A', 'S', 'D'].includes(e.key)) {
        e.preventDefault();
      }

      // In Local mode: native keyboard controls both
      if (!this.isConnected) return;

      const dir = this.getDirectionFromKey(e);
      if (!dir) return;

      if (!this.localKeysDown) this.localKeysDown = {};
      if (this.localKeysDown[dir]) return; // prevent repeat flood
      this.localKeysDown[dir] = true;

      // Apply locally to my assigned character
      this.setCharCursor(this.myRole, dir, true);

      // Send to peer
      if (this.conn && this.conn.open) {
        this.conn.send({
          type: 'input',
          action: 'down',
          role: this.myRole,
          dir: dir
        });
      }
    }

    handleKeyUp(e) {
      if (this.isTypingInInput()) return;
      if (!this.isConnected) return;

      const dir = this.getDirectionFromKey(e);
      if (!dir) return;

      if (!this.localKeysDown) this.localKeysDown = {};
      this.localKeysDown[dir] = false;

      // Apply locally to my assigned character
      this.setCharCursor(this.myRole, dir, false);

      // Send to peer
      if (this.conn && this.conn.open) {
        this.conn.send({
          type: 'input',
          action: 'up',
          role: this.myRole,
          dir: dir
        });
      }
    }

    getDirectionFromKey(e) {
      const code = e.code || '';
      const key = e.key || '';

      if (['ArrowLeft', 'KeyA'].includes(code) || key === 'ArrowLeft' || key === 'a' || key === 'A') {
        return 'left';
      }
      if (['ArrowRight', 'KeyD'].includes(code) || key === 'ArrowRight' || key === 'd' || key === 'D') {
        return 'right';
      }
      if (['ArrowUp', 'KeyW', 'Space'].includes(code) || key === 'ArrowUp' || key === 'w' || key === 'W' || key === ' ') {
        return 'up';
      }
      return null;
    }

    setCharCursor(role, dir, isDown) {
      const game = window.gameInstance;
      if (!game || !game.level || game.state.current !== 'level') return;

      const char = role === 'fb' ? game.level.pers1 : game.level.pers2;
      if (char && char.cursors && char.cursors[dir]) {
        char.cursors[dir].isDown = isDown;
      }
    }

    injectRemoteInput(data) {
      const isDown = data.action === 'down';
      const role = data.role;
      const dir = data.dir || this.getDirectionFromKey(data);

      if (dir) {
        this.setCharCursor(role, dir, isDown);
      }
    }

    bindTouchControls() {
      const sendTouchAction = (dir, isDown) => {
        // Apply locally to my character
        this.setCharCursor(this.myRole, dir, isDown);

        // Send to peer
        if (this.conn && this.conn.open) {
          this.conn.send({
            type: 'input',
            action: isDown ? 'down' : 'up',
            role: this.myRole,
            dir: dir
          });
        }
      };

      const setupTouchBtn = (btn, dir) => {
        if (!btn) return;
        const start = (e) => { e.preventDefault(); sendTouchAction(dir, true); };
        const end = (e) => { e.preventDefault(); sendTouchAction(dir, false); };

        btn.addEventListener('touchstart', start, { passive: false });
        btn.addEventListener('touchend', end, { passive: false });
        btn.addEventListener('mousedown', start);
        btn.addEventListener('mouseup', end);
        btn.addEventListener('mouseleave', end);
      };

      setupTouchBtn(this.ui.btnTouchLeft, 'left');
      setupTouchBtn(this.ui.btnTouchRight, 'right');
      setupTouchBtn(this.ui.btnTouchJump, 'up');
    }

    startPingLoop() {
      if (this.pingInterval) clearInterval(this.pingInterval);
      this.pingInterval = setInterval(() => {
        if (this.conn && this.conn.open) {
          this.conn.send({ type: 'ping', t: performance.now() });
        }
      }, 1500);
    }

    updatePingBadge(ms) {
      if (!this.ui.pingBadge) return;
      this.ui.pingBadge.style.display = 'inline-block';
      let colorClass = 'ping-good';
      if (ms > 140) colorClass = 'ping-bad';
      else if (ms > 70) colorClass = 'ping-medium';

      this.ui.pingBadge.className = `badge ${colorClass}`;
      this.ui.pingBadge.innerText = `📶 ${ms} ms`;
    }

    updateRoleBadge() {
      if (!this.ui.roleBadge) return;
      const roleText = this.myRole === 'fb' ? '🔥 Anda: Fireboy' : '💧 Anda: Watergirl';
      this.ui.roleBadge.innerText = roleText;
    }

    getRoleName(role) {
      return role === 'fb' ? '🔥 Fireboy' : '💧 Watergirl';
    }

    sendCustomChat() {
      if (!this.ui.chatInput) return;
      const msg = this.ui.chatInput.value.trim();
      if (!msg) return;
      this.sendChatMessage(msg);
      this.ui.chatInput.value = '';
    }

    sendChatMessage(text) {
      const sender = this.getRoleName(this.myRole);
      const time = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      const payload = { type: 'chat', sender, text, time };

      this.displayChatMessage(payload, true);

      if (this.conn && this.conn.open) {
        this.conn.send(payload);
      }
    }

    receiveChatMessage(data) {
      this.displayChatMessage(data, false);
      this.showFloatingEmote(data.sender, data.text);
    }

    displayChatMessage(data, isMe) {
      if (!this.ui.chatLog) return;
      const msgElem = document.createElement('div');
      msgElem.className = `chat-bubble ${isMe ? 'chat-me' : 'chat-other'}`;
      msgElem.innerHTML = `
        <div class="chat-meta"><strong>${data.sender}</strong> <small>${data.time}</small></div>
        <div class="chat-text">${this.escapeHtml(data.text)}</div>
      `;
      this.ui.chatLog.appendChild(msgElem);
      this.ui.chatLog.scrollTop = this.ui.chatLog.scrollHeight;

      if (!isMe && this.ui.chatDrawer && !this.ui.chatDrawer.classList.contains('open')) {
        this.showFloatingEmote(data.sender, data.text);
      }
    }

    showFloatingEmote(sender, text) {
      if (!this.ui.chatFloatingArea) return;
      const toast = document.createElement('div');
      toast.className = 'floating-chat-bubble';
      toast.innerHTML = `<strong>${sender}:</strong> ${this.escapeHtml(text)}`;
      this.ui.chatFloatingArea.appendChild(toast);

      setTimeout(() => {
        toast.style.opacity = '0';
        toast.style.transform = 'translateY(-20px)';
        setTimeout(() => toast.remove(), 400);
      }, 3500);
    }

    checkPublicTunnel() {
      // Check if already on a remote domain/tunnel
      const isLocalHost = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
      if (!isLocalHost) {
        if (this.ui.hostOfflineTip) this.ui.hostOfflineTip.style.display = 'none';
        if (this.ui.hostOnlineBanner) {
          this.ui.hostOnlineBanner.style.display = 'block';
          this.ui.hostOnlineUrl.innerText = window.location.origin;
        }
        return;
      }

      // Check if tunnel.js created a public tunnel URL
      fetch('/api/public-url')
        .then((res) => res.json())
        .then((data) => {
          if (data && data.url) {
            this.publicTunnelUrl = data.url;
            if (this.ui.hostOnlineBanner) {
              this.ui.hostOnlineBanner.style.display = 'block';
              this.ui.hostOnlineUrl.innerText = data.url;
            }
            if (this.ui.hostOfflineTip) {
              this.ui.hostOfflineTip.style.display = 'none';
            }
          }
        })
        .catch(() => {});
    }

    getInviteUrl() {
      const isLocalHost = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
      let baseUrl = `${window.location.origin}${window.location.pathname}`;

      if (this.publicTunnelUrl && isLocalHost) {
        baseUrl = this.publicTunnelUrl.replace(/\/$/, '') + '/';
      }

      return `${baseUrl}?room=${this.roomCode}&join=1`;
    }

    copyInviteLink() {
      const url = this.getInviteUrl();
      navigator.clipboard.writeText(url).then(() => {
        this.showToast('Link undangan berhasil disalin! Kirimkan ke rekan Anda.');
      }).catch(() => {
        prompt('Salin link berikut dan kirimkan ke rekan Anda:', url);
      });
    }

    showQrModal() {
      if (!this.ui.qrModal) return;
      const url = this.getInviteUrl();
      if (this.ui.qrContainer) {
        this.ui.qrContainer.innerHTML = '';
        if (window.QRCode) {
          new window.QRCode(this.ui.qrContainer, {
            text: url,
            width: 220,
            height: 220,
            colorDark: '#000000',
            colorLight: '#ffffff',
            correctLevel: QRCode.CorrectLevel.M
          });
        }
      }
      this.ui.qrModal.style.display = 'flex';
    }

    hideQrModal() {
      if (this.ui.qrModal) this.ui.qrModal.style.display = 'none';
    }

    toggleFullscreen() {
      if (!document.fullscreenElement) {
        document.documentElement.requestFullscreen().catch((e) => console.log(e));
      } else {
        if (document.exitFullscreen) {
          document.exitFullscreen();
        }
      }
    }

    toggleMute() {
      const game = window.gameInstance;
      if (game && game.sound) {
        game.sound.mute = !game.sound.mute;
        if (this.ui.btnMute) {
          this.ui.btnMute.innerText = game.sound.mute ? '🔇 Suara Mati' : '🔊 Suara Nyala';
        }
      }
    }

    onPeerDisconnected() {
      this.isConnected = false;
      if (this.pingInterval) clearInterval(this.pingInterval);
      if (this.syncInterval) clearInterval(this.syncInterval);
      if (this.ui.statusBadge) {
        this.ui.statusBadge.innerText = '🔴 Rekan Terputus';
        this.ui.statusBadge.className = 'badge error';
      }
      this.showToast('Koneksi terputus: Teman Anda telah meninggalkan permainan.');
    }

    showToast(message) {
      let toast = document.getElementById('p2p-toast');
      if (!toast) {
        toast = document.createElement('div');
        toast.id = 'p2p-toast';
        document.body.appendChild(toast);
      }
      toast.innerText = message;
      toast.className = 'show';
      clearTimeout(this._toastTimer);
      this._toastTimer = setTimeout(() => {
        toast.className = '';
      }, 3500);
    }

    escapeHtml(str) {
      return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
    }
  }

  // Export
  window.FireboyWatergirlP2P = FireboyWatergirlP2P;

  function initP2P() {
    if (!window.p2pGame) {
      window.p2pGame = new FireboyWatergirlP2P();
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initP2P);
  } else {
    initP2P();
  }
})(window);
