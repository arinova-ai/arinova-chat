## Why

越來越多 AI agent（如 OpenClaw）具備語音能力（TTS + STT），可以「說話」和「聽話」。Arinova Chat 目前只支持文字互動，無法利用這些語音能力。用戶應該能在 PWA 裡直接跟有語音能力的 agent 通話，就像打電話一樣。這是從「聊天」升級到「對話」的關鍵功能。

## What Changes

- 基於 **WebRTC** 實作瀏覽器端到 server 的即時音訊傳輸。
- 在 server 端實作 **WebRTC signaling server** 和音訊 relay，將用戶音訊轉發給 agent，將 agent 音訊回傳給用戶。
- 擴展 **A2A protocol** 定義語音通話的 agent 端介面 — agent 接收音訊串流、回傳音訊串流（或接收文字、回傳音訊）。
- 新增 **agent 語音能力標記** — agent profile 新增 `voiceCapable` 欄位，平台可偵測 agent 是否支持語音。
- 實作 **降級策略** — agent 無語音能力時，用戶語音經 STT 轉文字送出，agent 文字回覆經瀏覽器內建 TTS 朗讀。
- 前端實作 **通話 UI** — 通話按鈕、通話中介面（靜音、掛斷、音量）、通話狀態指示。

## Capabilities

### New Capabilities

- `webrtc-signaling`: WebRTC signaling server — ICE candidate exchange、SDP offer/answer、TURN/STUN 設定。
- `voice-transport`: 音訊傳輸層 — 用戶瀏覽器音訊擷取、WebRTC audio track、server 端音訊 relay 到 agent。
- `agent-voice-protocol`: Agent 語音通話協議 — 擴展 A2A 定義音訊串流介面、語音能力偵測、雙向音訊格式。
- `voice-fallback`: 降級策略 — 瀏覽器端 STT（用戶語音→文字）、瀏覽器端 TTS（agent 文字→語音）。
- `voice-call-ui`: 通話 UI — 通話按鈕、通話中介面、靜音/掛斷控制、通話狀態。

### Modified Capabilities

_(none)_

## Impact

- **Backend**: WebRTC signaling endpoint、音訊 relay service、A2A voice extension routes
- **Frontend**: WebRTC client、getUserMedia 音訊擷取、通話 UI components、AudioContext playback
- **Shared types**: VoiceCall、VoiceCapability、SignalingMessage 等型別
- **Agent schema**: agents 表新增 `voiceCapable` 欄位
- **Infrastructure**: 可能需要 TURN server（NAT traversal）
- **Dependencies**: 無需額外大型依賴，WebRTC 是瀏覽器原生 API；server 端可能用 `mediasoup` 或 `pion` 做 SFU
