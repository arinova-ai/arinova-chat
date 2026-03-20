// Arinova Default — Cozy Studio with 3 scenes (working, idle, sleeping)
// Scene selection based on agent activity status from SDK.

var CANVAS_W = 1376;
var CANVAS_H = 768;

// Mascot clickable regions per scene (relative to 1376x768 canvas)
var CLICK_REGIONS = {
  working:  { x: 900, y: 280, w: 320, h: 340 },  // mascot at desk
  idle:     { x: 700, y: 230, w: 320, h: 340 },  // mascot by window
  sleeping: { x: 380, y: 180, w: 440, h: 340 },  // mascot in bed
};

export default {
  init(sdk, container) {
    var self = this;
    this._destroyed = false;
    this._currentScene = "idle";
    this._targetScene = "idle";
    this._fadeAlpha = 1; // 1 = fully showing current
    this._fading = false;

    // Create canvas
    var canvas = document.createElement("canvas");
    var ctx = canvas.getContext("2d");
    canvas.width = sdk.width || window.innerWidth;
    canvas.height = sdk.height || window.innerHeight;
    canvas.style.width = "100%";
    canvas.style.height = "100%";
    canvas.style.display = "block";
    canvas.style.cursor = "pointer";
    container.appendChild(canvas);
    this._canvas = canvas;
    this._ctx = ctx;

    // Preload all 3 backgrounds
    var scenes = {};
    var scenesLoaded = {};
    ["working", "idle", "sleeping"].forEach(function (name) {
      var img = new Image();
      scenesLoaded[name] = false;
      img.onload = function () { scenesLoaded[name] = true; };
      img.onerror = function () { console.warn("[theme] Failed to load scene-" + name + ".png"); };
      img.src = sdk.assetUrl("scene-" + name + ".png");
      scenes[name] = img;
    });
    this._scenes = scenes;
    this._scenesLoaded = scenesLoaded;

    // CSS overlay effects container
    var overlay = document.createElement("div");
    overlay.style.cssText = "position:absolute;top:0;left:0;width:100%;height:100%;pointer-events:none;overflow:hidden;";
    container.style.position = "relative";
    container.appendChild(overlay);
    this._overlay = overlay;

    // Helper: compute scale and offset for canvas coords
    function getTransform() {
      var sx = canvas.width / CANVAS_W;
      var sy = canvas.height / CANVAS_H;
      var scale = Math.min(sx, sy);
      var ox = (canvas.width - CANVAS_W * scale) / 2;
      var oy = (canvas.height - CANVAS_H * scale) / 2;
      return { scale: scale, ox: ox, oy: oy };
    }
    this._getTransform = getTransform;

    // Determine scene from agents
    function pickScene(agents) {
      if (!agents || agents.length === 0) return "sleeping";
      var hasWorking = false;
      var hasOnline = false;
      for (var i = 0; i < agents.length; i++) {
        var a = agents[i];
        if (!a.online) continue;
        hasOnline = true;
        if (a.status === "working" || a.status === "collaborating" || a.currentTask) {
          hasWorking = true;
        }
      }
      if (hasWorking) return "working";
      if (hasOnline) return "idle";
      return "sleeping";
    }

    // Scene transition
    function transitionTo(scene) {
      if (scene === self._currentScene || self._fading) return;
      self._targetScene = scene;
      self._fading = true;
      self._fadeAlpha = 1;
    }

    // Listen for agent updates
    sdk.onAgentsChange(function (agents) {
      var next = pickScene(agents);
      transitionTo(next);
    });
    // Initial scene
    var initialScene = pickScene(sdk.agents);
    this._currentScene = initialScene;
    this._targetScene = initialScene;

    // Build overlay effects
    function buildOverlay(scene) {
      overlay.innerHTML = "";
      if (scene === "working") {
        // Thought bubble with dots
        overlay.innerHTML =
          '<div style="position:absolute;top:25.4%;left:74.9%;background:rgba(255,255,255,0.92);border-radius:18px;padding:10px 16px;display:flex;gap:6px;align-items:center;box-shadow:0 2px 12px rgba(0,0,0,0.15);animation:tbFloat 3s ease-in-out infinite;">' +
          '<div class="tb-dot"></div><div class="tb-dot"></div><div class="tb-dot"></div></div>' +
          '<div style="position:absolute;left:71.8%;top:33.7%;width:24px;height:24px;border-radius:50%;background:radial-gradient(circle,#4eff4e,#00cc00);animation:ledPulse 2s ease-in-out infinite;box-shadow:0 0 8px #4eff4e,0 0 16px rgba(78,255,78,0.4);"></div>' +
          '<style>' +
          '.tb-dot{width:10px;height:10px;border-radius:50%;background:#555;animation:dotBounce 1.2s ease-in-out infinite}' +
          '.tb-dot:nth-child(2){animation-delay:.2s}.tb-dot:nth-child(3){animation-delay:.4s}' +
          '@keyframes dotBounce{0%,60%,100%{transform:translateY(0);opacity:.3}30%{transform:translateY(-8px);opacity:1}}' +
          '@keyframes tbFloat{0%,100%{transform:translateY(0)}50%{transform:translateY(-4px)}}' +
          '@keyframes ledPulse{0%,100%{opacity:1}50%{opacity:.6}}' +
          '</style>';
      } else if (scene === "sleeping") {
        // ZZZ floating
        overlay.innerHTML =
          '<div style="position:absolute;top:25.4%;left:35.6%;pointer-events:none;">' +
          '<span class="zzz" style="position:absolute;font-size:18px;left:0;top:0;animation-delay:0s">Z</span>' +
          '<span class="zzz" style="position:absolute;font-size:24px;left:18px;top:-20px;animation-delay:.8s">Z</span>' +
          '<span class="zzz" style="position:absolute;font-size:32px;left:40px;top:-48px;animation-delay:1.6s">Z</span>' +
          '</div>' +
          '<div style="position:absolute;left:32.7%;top:28.6%;width:18px;height:18px;border-radius:50%;background:radial-gradient(circle,#ff4e4e,#cc0000);animation:ledSleep 3s ease-in-out infinite;box-shadow:0 0 6px #ff4e4e,0 0 12px rgba(255,78,78,0.3);"></div>' +
          '<style>' +
          '.zzz{font-family:"Comic Sans MS",cursive;font-weight:bold;color:rgba(255,255,255,.85);text-shadow:0 1px 4px rgba(0,0,0,.3);opacity:0;animation:zzzFloat 3s ease-in-out infinite}' +
          '@keyframes zzzFloat{0%{opacity:0;transform:translateY(0) scale(.6)}15%{opacity:1;transform:translateY(-5px) scale(1)}70%{opacity:.8;transform:translateY(-20px) scale(1.05)}100%{opacity:0;transform:translateY(-35px) scale(.8)}}' +
          '@keyframes ledSleep{0%,100%{opacity:.8}50%{opacity:.3}}' +
          '</style>';
      } else {
        // Idle/sunset — music notes + sun rays
        overlay.innerHTML =
          '<div style="position:absolute;top:100px;left:850px;width:300px;height:400px;background:linear-gradient(160deg,rgba(255,180,80,.08) 0%,rgba(255,150,50,.04) 40%,transparent 70%);animation:rayShimmer 6s ease-in-out infinite;"></div>' +
          '<div style="position:absolute;top:20.2%;left:60.7%;pointer-events:none;">' +
          '<span class="mnote" style="font-size:18px;left:0;top:0;animation-delay:0s">&#9834;</span>' +
          '<span class="mnote" style="font-size:24px;left:20px;top:-15px;animation-delay:1s">&#9835;</span>' +
          '<span class="mnote" style="font-size:16px;left:-10px;top:-8px;animation-delay:2s">&#9833;</span>' +
          '<span class="mnote" style="font-size:22px;left:30px;top:-25px;animation-delay:3s">&#9834;</span>' +
          '</div>' +
          '<div style="position:absolute;left:59.2%;top:24.1%;width:16px;height:16px;border-radius:50%;background:radial-gradient(circle,#ff6e4e,#cc2200);animation:ledIdle 4s ease-in-out infinite;box-shadow:0 0 6px #ff6e4e,0 0 14px rgba(255,110,78,0.3);"></div>' +
          '<style>' +
          '.mnote{position:absolute;color:rgba(255,220,150,.9);text-shadow:0 1px 6px rgba(255,160,50,.4);opacity:0;animation:noteFloat 4s ease-in-out infinite}' +
          '@keyframes noteFloat{0%{opacity:0;transform:translateY(0) translateX(0) scale(.5)}10%{opacity:1;transform:translateY(-5px) translateX(3px) scale(1)}50%{opacity:.8;transform:translateY(-30px) translateX(15px) scale(1.1)}80%{opacity:.3;transform:translateY(-50px) translateX(25px) scale(.9)}100%{opacity:0;transform:translateY(-65px) translateX(30px) scale(.6)}}' +
          '@keyframes rayShimmer{0%,100%{opacity:.6}33%{opacity:1}66%{opacity:.7}}' +
          '@keyframes ledIdle{0%,100%{opacity:.9}50%{opacity:.4}}' +
          '</style>';
      }
    }
    buildOverlay(this._currentScene);
    this._buildOverlay = buildOverlay;

    // Click handler — detect mascot region click
    canvas.addEventListener("click", function (e) {
      if (self._destroyed) return;
      var rect = canvas.getBoundingClientRect();
      var clickX = (e.clientX - rect.left) * (canvas.width / rect.width);
      var clickY = (e.clientY - rect.top) * (canvas.height / rect.height);

      var t = getTransform();
      // Convert to canvas coords (1376x768 space)
      var cx = (clickX - t.ox) / t.scale;
      var cy = (clickY - t.oy) / t.scale;

      var region = CLICK_REGIONS[self._currentScene];
      if (cx >= region.x && cx <= region.x + region.w && cy >= region.y && cy <= region.y + region.h) {
        // Click on mascot — open first agent's chat
        var agents = sdk.agents;
        if (agents && agents.length > 0) {
          sdk.openChat(agents[0].id);
        } else {
          sdk.selectAgent(null);
        }
      }
    });

    // Draw loop
    function draw() {
      if (self._destroyed) return;
      var t = getTransform();

      ctx.clearRect(0, 0, canvas.width, canvas.height);
      // Background fill
      var bgColors = { working: "#1a1a2e", idle: "#1a1510", sleeping: "#0a0a1e" };
      ctx.fillStyle = bgColors[self._currentScene] || "#1a1a2e";
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      // Draw current scene
      if (scenesLoaded[self._currentScene]) {
        ctx.save();
        ctx.globalAlpha = self._fading ? self._fadeAlpha : 1;
        ctx.translate(t.ox, t.oy);
        ctx.scale(t.scale, t.scale);
        ctx.drawImage(scenes[self._currentScene], 0, 0, CANVAS_W, CANVAS_H);
        ctx.restore();
      }

      // Draw target scene fading in
      if (self._fading && scenesLoaded[self._targetScene]) {
        ctx.save();
        ctx.globalAlpha = 1 - self._fadeAlpha;
        ctx.translate(t.ox, t.oy);
        ctx.scale(t.scale, t.scale);
        ctx.drawImage(scenes[self._targetScene], 0, 0, CANVAS_W, CANVAS_H);
        ctx.restore();

        // Advance fade
        self._fadeAlpha -= 0.02; // ~50 frames = ~0.8s
        if (self._fadeAlpha <= 0) {
          self._fadeAlpha = 1;
          self._currentScene = self._targetScene;
          self._fading = false;
          ctx.fillStyle = bgColors[self._currentScene] || "#1a1a2e";
          buildOverlay(self._currentScene);
        }
      }

      self._raf = requestAnimationFrame(draw);
    }

    this._raf = requestAnimationFrame(draw);
  },

  resize(width, height) {
    if (!this._canvas) return;
    this._canvas.width = width;
    this._canvas.height = height;
  },

  destroy() {
    this._destroyed = true;
    if (this._raf) cancelAnimationFrame(this._raf);
    if (this._canvas && this._canvas.parentNode) {
      this._canvas.parentNode.removeChild(this._canvas);
    }
    if (this._overlay && this._overlay.parentNode) {
      this._overlay.parentNode.removeChild(this._overlay);
    }
    this._canvas = null;
    this._ctx = null;
    this._overlay = null;
  },
};
