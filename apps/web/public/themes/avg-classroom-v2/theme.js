// AVG Classroom v2 — Arinova Office SDK v2 Theme
// Anime-style classroom with 6 agent desks, blackboard, and status animations

var SEAT_POSITIONS = [
  // Row 1 (front) — 3 desks
  { x: 0.20, y: 0.58 },
  { x: 0.50, y: 0.58 },
  { x: 0.80, y: 0.58 },
  // Row 2 (back) — 3 desks
  { x: 0.20, y: 0.82 },
  { x: 0.50, y: 0.82 },
  { x: 0.80, y: 0.82 },
];

var STATUS_COLORS = {
  working: "#4ade80",
  idle: "#94a3b8",
  blocked: "#f87171",
  collaborating: "#60a5fa",
};

var STATUS_BG = {
  working: "rgba(74,222,128,0.12)",
  idle: "rgba(148,163,184,0.08)",
  blocked: "rgba(248,113,113,0.12)",
  collaborating: "rgba(96,165,250,0.12)",
};

export default {
  async init(sdk, container) {
    // Inject styles
    var style = document.createElement("style");
    style.textContent = getStyles();
    container.appendChild(style);

    // Build DOM
    container.innerHTML += '\
      <div class="classroom">\
        <div class="blackboard">\
          <div class="blackboard-inner">\
            <div class="chalk-title">Agent Office</div>\
            <div class="chalk-stats" id="stats">Loading...</div>\
          </div>\
        </div>\
        <div class="floor">\
          <div class="desks" id="desks"></div>\
        </div>\
      </div>';

    var desksEl = container.querySelector("#desks");
    var statsEl = container.querySelector("#stats");

    function render(agents) {
      // Update blackboard
      var working = 0, idle = 0, blocked = 0, collab = 0;
      agents.forEach(function(a) {
        if (a.status === "working") working++;
        else if (a.status === "idle") idle++;
        else if (a.status === "blocked") blocked++;
        else if (a.status === "collaborating") collab++;
      });
      statsEl.innerHTML = '\
        <span class="stat working">' + working + ' Working</span>\
        <span class="stat idle">' + idle + ' Idle</span>\
        <span class="stat blocked">' + blocked + ' Blocked</span>\
        <span class="stat collab">' + collab + ' Collab</span>';

      // Update desks
      desksEl.innerHTML = "";
      for (var i = 0; i < 6; i++) {
        var pos = SEAT_POSITIONS[i];
        var agent = agents[i];
        var desk = document.createElement("div");
        desk.className = "desk" + (agent ? " desk--occupied" : " desk--empty");
        desk.style.left = (pos.x * 100) + "%";
        desk.style.top = (pos.y * 100) + "%";

        if (agent) {
          var statusColor = STATUS_COLORS[agent.status] || "#94a3b8";
          var statusBg = STATUS_BG[agent.status] || "transparent";
          desk.innerHTML = '\
            <div class="desk-surface">\
              <div class="agent-avatar" style="border-color:' + statusColor + ';background:' + statusBg + '">\
                <span class="agent-emoji">' + agent.emoji + '</span>\
                <div class="status-dot" style="background:' + statusColor + '"></div>\
              </div>\
              <div class="agent-info">\
                <div class="agent-name" style="color:' + statusColor + '">' + agent.name + '</div>\
                <div class="agent-role">' + agent.role + '</div>\
                ' + (agent.currentTask
                  ? '<div class="agent-task">' + agent.currentTask.title + '</div>'
                  : '<div class="agent-status-text">' + agent.status + '</div>') + '\
              </div>\
              ' + (agent.status === "working"
                ? '<div class="work-indicator"><span></span><span></span><span></span></div>'
                : '') + '\
              ' + (agent.status === "blocked"
                ? '<div class="blocked-indicator">!</div>'
                : '') + '\
            </div>';
          desk.dataset.id = agent.id;
          desk.addEventListener("click", (function(id) {
            return function() { sdk.selectAgent(id); };
          })(agent.id));
        } else {
          desk.innerHTML = '<div class="desk-surface desk-surface--empty"><div class="empty-seat">Empty</div></div>';
        }

        desksEl.appendChild(desk);
      }
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
    .classroom { width: 100%; height: 100%; display: flex; flex-direction: column; background: #1a1a2e; overflow: hidden; font-family: system-ui, -apple-system, sans-serif; }\
    \
    .blackboard { flex: 0 0 auto; padding: 16px 24px 12px; display: flex; justify-content: center; }\
    .blackboard-inner { background: #2d4a3e; border: 4px solid #5c3d2e; border-radius: 8px; padding: 16px 32px; min-width: 50%; text-align: center; box-shadow: inset 0 2px 8px rgba(0,0,0,0.3); }\
    .chalk-title { font-size: 22px; font-weight: 700; color: #e8e8d0; letter-spacing: 2px; text-shadow: 0 0 4px rgba(255,255,255,0.15); margin-bottom: 8px; }\
    .chalk-stats { display: flex; gap: 16px; justify-content: center; flex-wrap: wrap; }\
    .stat { font-size: 13px; font-weight: 600; padding: 2px 10px; border-radius: 10px; }\
    .stat.working { color: #4ade80; background: rgba(74,222,128,0.15); }\
    .stat.idle { color: #94a3b8; background: rgba(148,163,184,0.1); }\
    .stat.blocked { color: #f87171; background: rgba(248,113,113,0.15); }\
    .stat.collab { color: #60a5fa; background: rgba(96,165,250,0.15); }\
    \
    .floor { flex: 1; position: relative; background: linear-gradient(180deg, #1a1a2e 0%, #16213e 50%, #1a1a2e 100%); overflow: hidden; }\
    .floor::before { content: ""; position: absolute; inset: 0; background: repeating-linear-gradient(90deg, transparent, transparent 19.8%, rgba(255,255,255,0.02) 19.8%, rgba(255,255,255,0.02) 20%); pointer-events: none; }\
    \
    .desks { position: absolute; inset: 0; }\
    \
    .desk { position: absolute; transform: translate(-50%, -50%); transition: transform 0.3s ease; cursor: pointer; }\
    .desk:hover { transform: translate(-50%, -50%) scale(1.06); z-index: 10; }\
    .desk--empty { cursor: default; opacity: 0.4; }\
    .desk--empty:hover { transform: translate(-50%, -50%); }\
    \
    .desk-surface { background: rgba(30,41,59,0.85); border: 1px solid rgba(100,116,139,0.25); border-radius: 14px; padding: 14px; min-width: 130px; backdrop-filter: blur(4px); position: relative; overflow: hidden; transition: border-color 0.3s, box-shadow 0.3s; }\
    .desk:hover .desk-surface { border-color: rgba(148,163,184,0.4); box-shadow: 0 4px 20px rgba(0,0,0,0.3); }\
    .desk-surface--empty { min-height: 80px; display: flex; align-items: center; justify-content: center; }\
    .empty-seat { color: #475569; font-size: 12px; }\
    \
    .agent-avatar { width: 52px; height: 52px; border-radius: 50%; border: 2.5px solid; display: flex; align-items: center; justify-content: center; margin: 0 auto 8px; position: relative; transition: border-color 0.3s, background 0.3s; }\
    .agent-emoji { font-size: 24px; }\
    .status-dot { position: absolute; bottom: 0; right: 0; width: 12px; height: 12px; border-radius: 50%; border: 2px solid #1e293b; }\
    \
    .agent-info { text-align: center; }\
    .agent-name { font-size: 13px; font-weight: 600; transition: color 0.3s; }\
    .agent-role { font-size: 11px; color: #64748b; margin-top: 1px; }\
    .agent-task { font-size: 11px; color: #4ade80; margin-top: 4px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 120px; }\
    .agent-status-text { font-size: 11px; color: #64748b; margin-top: 4px; text-transform: capitalize; }\
    \
    .work-indicator { display: flex; gap: 3px; justify-content: center; margin-top: 6px; }\
    .work-indicator span { width: 4px; height: 4px; background: #4ade80; border-radius: 50%; animation: bounce 1.2s infinite; }\
    .work-indicator span:nth-child(2) { animation-delay: 0.2s; }\
    .work-indicator span:nth-child(3) { animation-delay: 0.4s; }\
    @keyframes bounce { 0%,80%,100% { transform: translateY(0); } 40% { transform: translateY(-6px); } }\
    \
    .blocked-indicator { position: absolute; top: 6px; right: 8px; width: 18px; height: 18px; background: #f87171; color: #fff; font-size: 12px; font-weight: 700; border-radius: 50%; display: flex; align-items: center; justify-content: center; animation: pulse 2s infinite; }\
    @keyframes pulse { 0%,100% { opacity: 1; } 50% { opacity: 0.5; } }\
    \
    @media (max-width: 600px) {\
      .desk-surface { min-width: 100px; padding: 10px; }\
      .agent-avatar { width: 40px; height: 40px; }\
      .agent-emoji { font-size: 18px; }\
      .chalk-title { font-size: 16px; }\
      .blackboard-inner { padding: 10px 16px; }\
    }\
  ';
}
