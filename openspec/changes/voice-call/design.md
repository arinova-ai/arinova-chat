## Context

Arinova Chat 是 PWA，用戶透過瀏覽器與 AI agents 互動。部分 agent（如 OpenClaw）已具備語音能力：
- **TTS**: ElevenLabs、OpenAI TTS、Edge TTS — agent 可以「說」
- **STT**: Whisper 等 — agent 可以「聽」
- 有些 agent 甚至支持 speech-to-speech（如 OpenAI Realtime API）

現有基礎：
- WebSocket 即時通訊（user ↔ server ↔ agent）
- Agent A2A endpoint（HTTP-based）
- Agent health check（`/status` endpoint）

需要在這基礎上加入即時雙向音訊通道。

## Goals / Non-Goals

**Goals:**
- 用戶可以在 PWA 裡跟有語音能力的 agent 即時雙向通話
- 低延遲 — 接近自然對話的體驗（< 500ms round-trip）
- 自動偵測 agent 語音能力，有能力的顯示通話按鈕
- 沒有語音能力的 agent 提供降級方案（瀏覽器端 STT/TTS）
- 通話中可以靜音、掛斷、調整音量
- 通話內容可選擇性存為文字記錄

**Non-Goals:**
- 視訊通話（只做音訊）
- 多方通話 / 會議（Phase 1 只做 1 對 1 user ↔ agent）
- Playground 內的語音互動（Phase 2）
- SIP / PSTN 電話整合
- 自建 STT/TTS 服務（降級方案用瀏覽器內建 + Web Speech API）

## Decisions

### 1. 傳輸層：WebRTC

**Decision**: 使用 WebRTC 做用戶瀏覽器到 server 的音訊傳輸。Server 作為媒體中繼（SFU），將音訊轉發給 agent。

**Alternatives considered**:
- WebSocket binary frames：延遲較高（TCP vs UDP），但架構簡單
- 純 P2P WebRTC（瀏覽器直連 agent）：agent 端不一定有 WebRTC stack，NAT 問題

**Rationale**: WebRTC 使用 UDP，延遲最低，瀏覽器原生支持。Server 做中繼可以統一處理 agent 端的不同音訊格式和協議。

### 2. Server 端媒體處理：mediasoup SFU

**Decision**: 使用 `mediasoup` 作為 server 端的 SFU（Selective Forwarding Unit），處理 WebRTC 連線和音訊 relay。

**Alternatives considered**:
- LiveKit：功能強大但太重，引入整個平台
- Janus Gateway：C 語言，維護門檻高
- 純 Node.js WebRTC（wrtc package）：不夠穩定

**Rationale**: mediasoup 是 Node.js 生態中最成熟的 SFU，效能好，API 直覺，跟 Fastify server 共存。只轉發音訊，不需要混音。

### 3. Agent 端音訊介面：WebSocket audio stream

**Decision**: Server 跟 agent 之間透過 WebSocket 傳輸音訊（PCM/Opus chunks）。擴展現有的 `/ws/agent` 協議新增 voice 相關 events。

**Alternatives considered**:
- HTTP chunked transfer：延遲太高
- 讓 agent 也接 WebRTC：agent 端環境多樣，不一定支持
- gRPC streaming：額外依賴，agent 端需要 gRPC client

**Rationale**: Agent 端已經有 WebSocket 連線機制，擴展最自然。WebSocket binary frames 傳音訊延遲可接受（agent 端處理延遲通常遠大於傳輸延遲）。

### 4. Agent 語音能力偵測

**Decision**: 擴展 agent `/status` endpoint，回傳 `capabilities` 欄位包含 `voice: { tts: true/false, stt: true/false, realtimeVoice: true/false }`。Agent 建立時也可手動標記。

**Alternatives considered**:
- 只靠手動標記：不準確，agent 能力可能變動
- 開通話時才偵測：UX 差，用戶點了通話才發現不行

**Rationale**: 結合動態偵測（health check 時查能力）和靜態標記（agent profile），前端根據能力決定顯示通話按鈕與否。

### 5. 降級策略：瀏覽器端 STT + TTS

**Decision**: 當 agent 沒有語音能力時：
- 用戶語音 → 瀏覽器 Web Speech API (STT) → 文字 → 送給 agent
- Agent 文字回覆 → 瀏覽器 Web Speech API (TTS) → 播放給用戶

**Alternatives considered**:
- Server 端 STT/TTS（Whisper + ElevenLabs）：成本高、延遲增加
- 不提供降級，只限有語音能力的 agent：限制太多

**Rationale**: Web Speech API 免費、延遲低、不需要 server 資源。品質不如專業 TTS/STT，但作為降級方案足夠。用戶體驗上標注「降級模式」。

### 6. 通話紀錄：可選轉錄

**Decision**: 通話過程中，如果有 STT 文字（來自 agent 端或瀏覽器降級），自動存為訊息紀錄在對話中。用戶可在通話前選擇是否存紀錄。

**Rationale**: 文字紀錄讓通話內容可搜尋、可回顧。但有些用戶可能不想留紀錄，所以做成可選。

## Risks / Trade-offs

- **[TURN server 成本]** → Mitigation: 先用免費公共 TURN server（如 Google STUN），後期可自建或用 Twilio TURN。大部分場景 STUN 就夠了。
- **[mediasoup 部署複雜度]** → Mitigation: mediasoup worker 跟 Fastify server 同 process 部署。Docker image 預裝 mediasoup 依賴。
- **[Agent 端 WebSocket 音訊延遲]** → Mitigation: 使用 Opus codec 壓縮，chunk size 保持小（20ms frames）。可接受的 agent 端延遲 < 200ms。
- **[瀏覽器 Web Speech API 品質差異大]** → Mitigation: 降級模式明確標注，鼓勵用戶使用有語音能力的 agent。未來可選接第三方 STT/TTS。
- **[iOS PWA 麥克風權限]** → Mitigation: iOS Safari 支持 getUserMedia，但 PWA standalone 模式下可能有限制。需要測試並提供引導。
- **[同時通話數過多]** → Mitigation: 每個 mediasoup worker 有上限，可根據負載水平擴展 worker 數量。Phase 1 限制同時通話數。

## Open Questions

- 是否支持通話中切換 agent 控制模式（如 playground copilot）？
- 通話錄音是否需要雙方同意？法律合規考量？
- 是否需要通話品質指標監控（jitter、packet loss、latency）？
- Agent 端是否需要支持 speech-to-speech 直通模式（跳過 STT+LLM+TTS pipeline）？
