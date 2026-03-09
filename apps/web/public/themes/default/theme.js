// Arinova Default — Built-in safe fallback theme (pure Canvas 2D, zero dependencies)
// No external imports. Works offline. Maximum stability.

var CANVAS_W = 1376;
var CANVAS_H = 768;
var FRAME_SIZE = 256;
var SPRITE_COLS = 4;
var SPRITE_ROWS = 4;
var TOTAL_FRAMES = SPRITE_COLS * SPRITE_ROWS;
var ANIM_INTERVAL = 250; // ~4 fps

export default {
  init(sdk, container) {
    var canvas = document.createElement("canvas");
    var ctx = canvas.getContext("2d");
    var w = sdk.width || window.innerWidth;
    var h = sdk.height || window.innerHeight;
    canvas.width = w;
    canvas.height = h;
    canvas.style.width = "100%";
    canvas.style.height = "100%";
    canvas.style.display = "block";
    container.appendChild(canvas);

    this._canvas = canvas;
    this._ctx = ctx;
    this._destroyed = false;

    // Assets
    var bgImg = new Image();
    var mascotImg = new Image();
    var bgLoaded = false;
    var mascotLoaded = false;
    var frameIdx = 0;
    var lastFrameTime = 0;

    // Agent state
    var currentAgent = null;

    // Layout: mascot centered in lower area
    var MASCOT_X = 0.42;
    var MASCOT_Y = 0.25;
    var MASCOT_W = 0.16;
    var MASCOT_H = 0.45;

    var self = this;

    function getScale() {
      var sx = canvas.width / CANVAS_W;
      var sy = canvas.height / CANVAS_H;
      return Math.min(sx, sy);
    }

    function draw(now) {
      if (self._destroyed) return;

      var scale = getScale();
      var ox = (canvas.width - CANVAS_W * scale) / 2;
      var oy = (canvas.height - CANVAS_H * scale) / 2;

      ctx.clearRect(0, 0, canvas.width, canvas.height);

      // Dark background
      ctx.fillStyle = "#1a1a2e";
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      ctx.save();
      ctx.translate(ox, oy);
      ctx.scale(scale, scale);

      // Scene background
      if (bgLoaded) {
        ctx.drawImage(bgImg, 0, 0, CANVAS_W, CANVAS_H);
      }

      // Mascot animation
      if (mascotLoaded && currentAgent) {
        if (now - lastFrameTime >= ANIM_INTERVAL) {
          lastFrameTime = now;
          frameIdx = (frameIdx + 1) % TOTAL_FRAMES;
        }
        var col = frameIdx % SPRITE_COLS;
        var row = Math.floor(frameIdx / SPRITE_COLS);
        var sx = col * FRAME_SIZE;
        var sy = row * FRAME_SIZE;
        var dx = MASCOT_X * CANVAS_W;
        var dy = MASCOT_Y * CANVAS_H;
        var dw = MASCOT_W * CANVAS_W;
        var dh = MASCOT_H * CANVAS_H;
        ctx.drawImage(mascotImg, sx, sy, FRAME_SIZE, FRAME_SIZE, dx, dy, dw, dh);

        // Name tag
        var name = currentAgent.name || "Agent";
        ctx.font = "20px system-ui, sans-serif";
        var tw = ctx.measureText(name).width;
        var tagW = tw + 24;
        var tagH = 28;
        var tagX = (MASCOT_X + MASCOT_W / 2) * CANVAS_W - tagW / 2;
        var tagY = MASCOT_Y * CANVAS_H - tagH - 8;
        ctx.fillStyle = "rgba(30, 64, 175, 0.6)";
        ctx.beginPath();
        ctx.roundRect(tagX, tagY, tagW, tagH, 8);
        ctx.fill();
        ctx.fillStyle = "#ffffff";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(name, tagX + tagW / 2, tagY + tagH / 2);
      }

      // Status text
      ctx.font = "22px system-ui, sans-serif";
      ctx.fillStyle = "rgba(232, 232, 208, 0.8)";
      ctx.textAlign = "left";
      ctx.textBaseline = "top";
      var statusStr = "Waiting for agent...";
      if (currentAgent) {
        var status = currentAgent.status || "idle";
        var task = currentAgent.currentTask ? (currentAgent.currentTask.title || currentAgent.currentTask) : "";
        statusStr = task ? status + " — " + task : status;
      }
      ctx.fillText(statusStr, 40, 30);

      ctx.restore();

      self._raf = requestAnimationFrame(draw);
    }

    // Load assets
    bgImg.onload = function () { bgLoaded = true; };
    bgImg.onerror = function () { /* scene fails gracefully */ };
    bgImg.src = sdk.assetUrl("scene-idle.png");

    mascotImg.onload = function () { mascotLoaded = true; };
    mascotImg.onerror = function () { /* mascot fails gracefully */ };
    mascotImg.src = sdk.assetUrl("mascot-sprite.png");

    // Agent updates
    function applyAgents(agents) {
      currentAgent = agents && agents.length > 0 ? agents[0] : null;
    }
    applyAgents(sdk.agents || []);
    sdk.onAgentsChange(function (agents) { applyAgents(agents); });

    // Click handler
    canvas.addEventListener("click", function (e) {
      if (!currentAgent) return;
      var rect = canvas.getBoundingClientRect();
      var scale = getScale();
      var ox = (canvas.width - CANVAS_W * scale) / 2;
      var oy = (canvas.height - CANVAS_H * scale) / 2;
      var cx = (e.clientX - rect.left) * (canvas.width / rect.width);
      var cy = (e.clientY - rect.top) * (canvas.height / rect.height);
      var mx = (cx - ox) / scale;
      var my = (cy - oy) / scale;
      var ax = MASCOT_X * CANVAS_W;
      var ay = MASCOT_Y * CANVAS_H;
      var aw = MASCOT_W * CANVAS_W;
      var ah = MASCOT_H * CANVAS_H;
      if (mx >= ax && mx <= ax + aw && my >= ay && my <= ay + ah) {
        sdk.selectAgent(currentAgent.id);
      }
    });

    // Start render loop
    this._raf = requestAnimationFrame(draw);
  },

  resize(width, height) {
    var canvas = this._canvas;
    if (!canvas) return;
    canvas.width = width;
    canvas.height = height;
  },

  destroy() {
    this._destroyed = true;
    if (this._raf) cancelAnimationFrame(this._raf);
    if (this._canvas && this._canvas.parentNode) {
      this._canvas.parentNode.removeChild(this._canvas);
    }
    this._canvas = null;
    this._ctx = null;
  },
};
