// Cozy Studio v2 — Arinova Office SDK v2 Theme
// Warm studio room with a single agent workspace, CSS-only rendering

var STATUS_COLORS = {
  working: "#4ade80",
  idle: "#f59e0b",
  sleeping: "#818cf8",
  blocked: "#f87171",
  collaborating: "#60a5fa",
};

export default {
  async init(sdk, container) {
    var style = document.createElement("style");
    style.textContent = getStyles();
    container.appendChild(style);

    container.innerHTML += '\
      <div class="room">\
        <div class="window">\
          <div class="window-frame">\
            <div class="sky"></div>\
            <div class="curtain curtain--left"></div>\
            <div class="curtain curtain--right"></div>\
          </div>\
        </div>\
        <div class="shelf">\
          <div class="book book--1"></div>\
          <div class="book book--2"></div>\
          <div class="book book--3"></div>\
          <div class="plant">\
            <div class="plant-pot"></div>\
            <div class="plant-leaf plant-leaf--1"></div>\
            <div class="plant-leaf plant-leaf--2"></div>\
            <div class="plant-leaf plant-leaf--3"></div>\
          </div>\
        </div>\
        <div class="desk">\
          <div class="desk-top">\
            <div class="monitor">\
              <div class="screen" id="screen"></div>\
              <div class="monitor-stand"></div>\
            </div>\
            <div class="mug">\
              <div class="mug-body"></div>\
              <div class="mug-handle"></div>\
              <div class="steam">\
                <div class="steam-line steam-line--1"></div>\
                <div class="steam-line steam-line--2"></div>\
                <div class="steam-line steam-line--3"></div>\
              </div>\
            </div>\
          </div>\
          <div class="desk-front"></div>\
        </div>\
        <div class="chair">\
          <div class="chair-back"></div>\
          <div class="chair-seat"></div>\
        </div>\
        <div class="agent-area" id="agent-area"></div>\
        <div class="rug"></div>\
        <div class="lamp">\
          <div class="lamp-shade"></div>\
          <div class="lamp-pole"></div>\
          <div class="lamp-glow"></div>\
        </div>\
      </div>';

    var agentArea = container.querySelector("#agent-area");
    var screenEl = container.querySelector("#screen");

    function render(agents) {
      var agent = agents[0];
      agentArea.innerHTML = "";
      screenEl.innerHTML = "";

      if (!agent) {
        agentArea.innerHTML = '<div class="empty-seat">No agent assigned</div>';
        screenEl.className = "screen";
        return;
      }

      var status = agent.status || "idle";
      var color = STATUS_COLORS[status] || STATUS_COLORS.idle;

      // Screen content based on status
      if (status === "working") {
        screenEl.className = "screen screen--working";
        screenEl.innerHTML = '\
          <div class="screen-code">\
            <div class="code-line code-line--1"></div>\
            <div class="code-line code-line--2"></div>\
            <div class="code-line code-line--3"></div>\
            <div class="code-line code-line--4"></div>\
            <div class="cursor-blink"></div>\
          </div>';
      } else if (status === "sleeping") {
        screenEl.className = "screen screen--sleeping";
        screenEl.innerHTML = '<div class="screen-off"></div>';
      } else {
        screenEl.className = "screen screen--idle";
        screenEl.innerHTML = '<div class="screen-idle">~</div>';
      }

      // Agent character
      var agentEl = document.createElement("div");
      agentEl.className = "agent agent--" + status;
      agentEl.innerHTML = '\
        <div class="agent-body">\
          <div class="agent-avatar" style="border-color:' + color + '">\
            <span class="agent-emoji">' + agent.emoji + '</span>\
          </div>\
          <div class="agent-info">\
            <div class="agent-name">' + agent.name + '</div>\
            <div class="agent-role">' + agent.role + '</div>\
            <div class="agent-status" style="color:' + color + '">\
              <span class="status-dot" style="background:' + color + '"></span>\
              ' + status + '\
            </div>\
          </div>\
        </div>\
        ' + (status === "working" ? '<div class="typing-indicator"><span></span><span></span><span></span></div>' : '') + '\
        ' + (status === "sleeping" ? '<div class="zzz"><span>z</span><span>z</span><span>z</span></div>' : '') + '\
        ' + (status === "idle" ? '<div class="idle-sparkle"></div>' : '');

      agentEl.addEventListener("click", function() {
        sdk.selectAgent(agent.id);
      });

      agentArea.appendChild(agentEl);
    }

    render(sdk.agents);
    sdk.onAgentsChange(render);
  },

  resize(w, h) {
    // CSS handles responsiveness
  },

  destroy() {
    // Nothing to clean up
  },
};

function getStyles() {
  return '\
    * { box-sizing: border-box; margin: 0; padding: 0; }\
    \
    .room { width: 100%; height: 100%; position: relative; overflow: hidden; font-family: "Nunito", system-ui, -apple-system, sans-serif;\
      background: linear-gradient(180deg, #2a1f3d 0%, #1f1a2e 40%, #1a1625 100%); }\
    \
    /* === Window === */\
    .window { position: absolute; top: 6%; left: 50%; transform: translateX(-50%); width: 30%; height: 28%; }\
    .window-frame { width: 100%; height: 100%; border: 4px solid #5c4a3a; border-radius: 12px; overflow: hidden; position: relative; background: #3a2a4a; }\
    .sky { width: 100%; height: 100%; background: linear-gradient(180deg, #1a1040 0%, #2d1b69 40%, #e8946b 80%, #f4c28f 100%); }\
    .sky::before { content: ""; position: absolute; top: 12%; left: 20%; width: 8px; height: 8px; background: #fff; border-radius: 50%; box-shadow: 40px 5px 0 1px #fff, 80px -8px 0 0px #fff, 25px 20px 0 0px rgba(255,255,255,0.5), 65px 15px 0 1px rgba(255,255,255,0.4); }\
    .curtain--left, .curtain--right { position: absolute; top: 0; width: 18%; height: 100%; background: #8b5e3c; opacity: 0.4; }\
    .curtain--left { left: 0; border-radius: 0 0 8px 0; }\
    .curtain--right { right: 0; border-radius: 0 0 0 8px; }\
    \
    /* === Shelf === */\
    .shelf { position: absolute; top: 8%; right: 10%; width: 16%; height: 4px; background: #5c4a3a; border-radius: 2px; box-shadow: 0 2px 4px rgba(0,0,0,0.3); }\
    .book { position: absolute; bottom: 0; border-radius: 2px 2px 0 0; }\
    .book--1 { left: 10%; width: 12px; height: 22px; background: #e07a5f; }\
    .book--2 { left: 30%; width: 10px; height: 18px; background: #81b29a; }\
    .book--3 { left: 48%; width: 14px; height: 24px; background: #f2cc8f; }\
    .plant { position: absolute; right: 8%; bottom: 0; }\
    .plant-pot { width: 16px; height: 14px; background: #c17050; border-radius: 2px 2px 4px 4px; }\
    .plant-leaf { position: absolute; width: 8px; height: 14px; background: #6bba7a; border-radius: 50% 50% 0 50%; }\
    .plant-leaf--1 { bottom: 10px; left: 4px; transform: rotate(-15deg); }\
    .plant-leaf--2 { bottom: 14px; left: -2px; transform: rotate(-40deg); }\
    .plant-leaf--3 { bottom: 14px; left: 10px; transform: rotate(20deg); }\
    \
    /* === Desk === */\
    .desk { position: absolute; bottom: 22%; left: 50%; transform: translateX(-50%); width: 56%; }\
    .desk-top { height: 10px; background: linear-gradient(180deg, #8b6f4e, #7a5f3e); border-radius: 6px 6px 0 0; position: relative; box-shadow: 0 -2px 8px rgba(0,0,0,0.2); display: flex; align-items: flex-end; justify-content: center; padding: 0 12%; }\
    .desk-front { height: 60px; background: linear-gradient(180deg, #6b5338, #5a4530); border-radius: 0 0 4px 4px; border-top: 2px solid #7a5f3e; }\
    \
    /* === Monitor === */\
    .monitor { position: absolute; bottom: 100%; left: 50%; transform: translateX(-50%); width: 48%; }\
    .screen { width: 100%; height: 70px; background: #1a1a2e; border: 3px solid #3a3a4a; border-radius: 6px 6px 2px 2px; overflow: hidden; position: relative; }\
    .screen--working { box-shadow: 0 0 20px rgba(74,222,128,0.15); }\
    .screen--sleeping { }\
    .screen--idle { box-shadow: 0 0 12px rgba(245,158,11,0.1); }\
    .monitor-stand { width: 20%; height: 12px; background: #3a3a4a; margin: 0 auto; border-radius: 0 0 4px 4px; }\
    \
    .screen-code { padding: 8px; }\
    .code-line { height: 3px; border-radius: 2px; margin-bottom: 5px; animation: code-appear 2s infinite; }\
    .code-line--1 { width: 60%; background: #818cf8; animation-delay: 0s; }\
    .code-line--2 { width: 80%; background: #4ade80; animation-delay: 0.3s; }\
    .code-line--3 { width: 45%; background: #f59e0b; animation-delay: 0.6s; }\
    .code-line--4 { width: 70%; background: #818cf8; animation-delay: 0.9s; }\
    @keyframes code-appear { 0%,100% { opacity: 0.3; } 50% { opacity: 1; } }\
    .cursor-blink { position: absolute; bottom: 10px; left: 55%; width: 2px; height: 10px; background: #4ade80; animation: blink 1s step-end infinite; }\
    @keyframes blink { 0%,100% { opacity: 1; } 50% { opacity: 0; } }\
    \
    .screen-off { width: 100%; height: 100%; background: #111; }\
    .screen-idle { width: 100%; height: 100%; display: flex; align-items: center; justify-content: center; color: #f59e0b; font-size: 20px; opacity: 0.4; }\
    \
    /* === Mug === */\
    .mug { position: absolute; bottom: 100%; right: 12%; }\
    .mug-body { width: 16px; height: 18px; background: #e8d5c0; border-radius: 0 0 4px 4px; position: relative; }\
    .mug-handle { position: absolute; top: 3px; right: -6px; width: 8px; height: 10px; border: 2px solid #e8d5c0; border-left: none; border-radius: 0 4px 4px 0; }\
    .steam { position: absolute; bottom: 100%; left: 50%; transform: translateX(-50%); }\
    .steam-line { width: 2px; height: 10px; background: rgba(255,255,255,0.15); border-radius: 2px; position: absolute; bottom: 0; animation: steam-rise 2s infinite ease-out; }\
    .steam-line--1 { left: -4px; animation-delay: 0s; }\
    .steam-line--2 { left: 0px; animation-delay: 0.5s; }\
    .steam-line--3 { left: 4px; animation-delay: 1s; }\
    @keyframes steam-rise { 0% { transform: translateY(0) scaleY(1); opacity: 0.4; } 100% { transform: translateY(-14px) scaleY(1.5); opacity: 0; } }\
    \
    /* === Chair === */\
    .chair { position: absolute; bottom: 10%; left: 50%; transform: translateX(-50%); width: 22%; }\
    .chair-back { width: 80%; height: 40px; margin: 0 auto; background: linear-gradient(180deg, #6b4c3b, #5a3d2e); border-radius: 10px 10px 0 0; }\
    .chair-seat { width: 100%; height: 12px; background: #5a3d2e; border-radius: 4px; }\
    \
    /* === Agent area === */\
    .agent-area { position: absolute; bottom: 32%; left: 50%; transform: translateX(-50%); z-index: 10; text-align: center; }\
    .empty-seat { color: #64748b; font-size: 12px; padding: 16px; }\
    \
    .agent { cursor: pointer; transition: transform 0.3s ease; }\
    .agent:hover { transform: scale(1.08); }\
    \
    .agent-body { display: flex; flex-direction: column; align-items: center; gap: 6px; }\
    .agent-avatar { width: 56px; height: 56px; border-radius: 50%; border: 3px solid; display: flex; align-items: center; justify-content: center;\
      background: rgba(30,25,45,0.8); backdrop-filter: blur(4px); box-shadow: 0 4px 12px rgba(0,0,0,0.3); transition: border-color 0.3s; }\
    .agent-emoji { font-size: 26px; }\
    \
    .agent-info { background: rgba(30,25,45,0.75); backdrop-filter: blur(8px); border-radius: 10px; padding: 6px 14px; border: 1px solid rgba(100,100,140,0.2); }\
    .agent-name { font-size: 13px; font-weight: 700; color: #e8e0f0; letter-spacing: 0.3px; }\
    .agent-role { font-size: 10px; color: #8b80a0; margin-top: 1px; }\
    .agent-status { font-size: 10px; margin-top: 3px; display: flex; align-items: center; gap: 4px; justify-content: center; text-transform: capitalize; }\
    .status-dot { width: 6px; height: 6px; border-radius: 50%; display: inline-block; }\
    \
    /* === Breathing animation for idle === */\
    .agent--idle .agent-avatar { animation: breathe 3s ease-in-out infinite; }\
    @keyframes breathe { 0%,100% { transform: scale(1); } 50% { transform: scale(1.06); } }\
    \
    /* === Typing indicator for working === */\
    .typing-indicator { display: flex; gap: 4px; justify-content: center; margin-top: 6px; }\
    .typing-indicator span { width: 5px; height: 5px; background: #4ade80; border-radius: 50%; animation: typing-bounce 1.2s infinite; }\
    .typing-indicator span:nth-child(2) { animation-delay: 0.2s; }\
    .typing-indicator span:nth-child(3) { animation-delay: 0.4s; }\
    @keyframes typing-bounce { 0%,80%,100% { transform: translateY(0); opacity: 0.4; } 40% { transform: translateY(-8px); opacity: 1; } }\
    \
    /* === Zzz animation for sleeping === */\
    .zzz { position: absolute; top: -10px; right: -20px; }\
    .zzz span { position: absolute; color: #818cf8; font-weight: 700; font-style: italic; opacity: 0; animation: zzz-float 3s infinite; }\
    .zzz span:nth-child(1) { font-size: 10px; animation-delay: 0s; }\
    .zzz span:nth-child(2) { font-size: 14px; animation-delay: 0.8s; }\
    .zzz span:nth-child(3) { font-size: 18px; animation-delay: 1.6s; }\
    @keyframes zzz-float { 0% { opacity: 0; transform: translate(0,0) rotate(0deg); } 20% { opacity: 1; } 100% { opacity: 0; transform: translate(16px,-30px) rotate(-15deg); } }\
    \
    /* === Idle sparkle === */\
    .idle-sparkle { position: absolute; top: -5px; left: -15px; width: 8px; height: 8px; }\
    .idle-sparkle::before, .idle-sparkle::after { content: "✦"; position: absolute; color: #f59e0b; font-size: 10px; animation: sparkle 2.5s infinite; }\
    .idle-sparkle::after { left: 60px; top: 5px; animation-delay: 1.2s; font-size: 8px; }\
    @keyframes sparkle { 0%,100% { opacity: 0; transform: scale(0.5); } 50% { opacity: 0.8; transform: scale(1.2); } }\
    \
    /* === Rug === */\
    .rug { position: absolute; bottom: 3%; left: 50%; transform: translateX(-50%); width: 65%; height: 12%; background: radial-gradient(ellipse, rgba(139,94,60,0.25) 0%, rgba(139,94,60,0.08) 60%, transparent 100%); border-radius: 50%; }\
    \
    /* === Lamp === */\
    .lamp { position: absolute; bottom: 20%; right: 12%; }\
    .lamp-shade { width: 30px; height: 20px; background: linear-gradient(180deg, #f4c28f, #e0a870); border-radius: 50% 50% 0 0; position: relative; }\
    .lamp-pole { width: 4px; height: 50px; background: #8b7355; margin: 0 auto; }\
    .lamp-glow { position: absolute; top: 20px; left: 50%; transform: translateX(-50%); width: 60px; height: 80px;\
      background: radial-gradient(ellipse, rgba(244,194,143,0.15) 0%, transparent 70%); pointer-events: none; }\
    \
    /* === Responsive === */\
    @media (max-width: 500px) {\
      .monitor .screen { height: 50px; }\
      .agent-avatar { width: 44px; height: 44px; }\
      .agent-emoji { font-size: 20px; }\
      .shelf { display: none; }\
      .lamp { display: none; }\
      .window { width: 40%; }\
    }\
  ';
}
