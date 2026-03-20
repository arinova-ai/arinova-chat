// Arinova Default — Cozy Studio with 3 scenes
// Working (typing + thought bubble) / Idle (sunset + music notes) / Sleeping (ZZZ)

var W = 1376;
var H = 768;

// Mascot clickable regions per scene (from demo HTMLs)
// Typing: mascot at desk right side — bubble at (1030,195), screen at (970,440)
var REGIONS = {
  working:  { x: 920, y: 260, w: 300, h: 350 },
  // Sunset: mascot by window — notes at (835,155)
  idle:     { x: 720, y: 200, w: 300, h: 380 },
  // Sleeping: mascot in bed center — zzz at (490,195)
  sleeping: { x: 350, y: 160, w: 480, h: 380 },
};

function pickScene(agents) {
  if (!agents || agents.length === 0) return "sleeping";
  for (var i = 0; i < agents.length; i++) {
    var a = agents[i];
    if (a.online && (a.status === "working" || a.status === "collaborating" || a.currentTask)) {
      return "working";
    }
  }
  for (var j = 0; j < agents.length; j++) {
    if (agents[j].online) return "idle";
  }
  return "sleeping";
}

export default {
  init(sdk, container) {
    var self = this;
    this._destroyed = false;

    // --- Canvas setup ---
    var canvas = document.createElement("canvas");
    var ctx = canvas.getContext("2d");
    canvas.width = sdk.width || window.innerWidth;
    canvas.height = sdk.height || window.innerHeight;
    canvas.style.cssText = "width:100%;height:100%;display:block;cursor:pointer;";
    container.appendChild(canvas);
    this._canvas = canvas;
    this._ctx = ctx;

    // --- Overlay for CSS effects ---
    var overlay = document.createElement("div");
    overlay.style.cssText = "position:absolute;top:0;left:0;width:100%;height:100%;pointer-events:none;overflow:hidden;";
    container.style.position = "relative";
    container.appendChild(overlay);
    this._overlay = overlay;

    // --- Preload images ---
    var imgs = {};
    var loaded = {};
    ["working", "idle", "sleeping"].forEach(function (name) {
      var img = new Image();
      loaded[name] = false;
      img.onload = function () { loaded[name] = true; };
      img.src = sdk.assetUrl("scene-" + name + ".png");
      imgs[name] = img;
    });

    // --- Scene state ---
    var current = pickScene(sdk.agents);
    var target = current;
    var fade = 0; // 0 = fully current, 1 = fully target
    var fading = false;
    var FADE_SPEED = 1 / 18; // ~300ms at 60fps

    function startTransition(next) {
      if (next === current && !fading) return;
      if (fading && next === target) return;
      target = next;
      fade = 0;
      fading = true;
    }

    // --- Agent change listener ---
    sdk.onAgentsChange(function (agents) {
      startTransition(pickScene(agents));
    });

    // --- Build overlay effects ---
    function buildOverlay(scene) {
      overlay.innerHTML = "";
      var html = "";
      if (scene === "working") {
        // Thought bubble with bouncing dots — positioned at (1030,195) from demo
        html +=
          '<style>' +
          '.tb{position:absolute;top:25.4%;left:74.9%;background:rgba(255,255,255,.92);border-radius:18px;padding:10px 16px;display:flex;gap:6px;align-items:center;box-shadow:0 2px 12px rgba(0,0,0,.15);animation:tbF 3s ease-in-out infinite}' +
          '.tb::before,.tb::after{content:"";position:absolute;background:rgba(255,255,255,.92);border-radius:50%;box-shadow:0 1px 4px rgba(0,0,0,.1)}' +
          '.tb::before{width:14px;height:14px;bottom:-12px;left:8px}' +
          '.tb::after{width:8px;height:8px;bottom:-22px;left:2px}' +
          '.td{width:10px;height:10px;border-radius:50%;background:#555;animation:tdB 1.2s ease-in-out infinite}' +
          '.td:nth-child(2){animation-delay:.2s}.td:nth-child(3){animation-delay:.4s}' +
          '@keyframes tdB{0%,60%,100%{transform:translateY(0);opacity:.3}30%{transform:translateY(-8px);opacity:1}}' +
          '@keyframes tbF{0%,100%{transform:translateY(0)}50%{transform:translateY(-4px)}}' +
          '</style>' +
          '<div class="tb"><div class="td"></div><div class="td"></div><div class="td"></div></div>';
      } else if (scene === "sleeping") {
        // Floating ZZZ — positioned at (490,195) from demo
        html +=
          '<style>' +
          '.zz{position:absolute;font-family:"Comic Sans MS",cursive;font-weight:bold;color:rgba(255,255,255,.85);text-shadow:0 1px 4px rgba(0,0,0,.3);opacity:0;animation:zzF 3s ease-in-out infinite}' +
          '@keyframes zzF{0%{opacity:0;transform:translateY(0) scale(.6)}15%{opacity:1;transform:translateY(-5px) scale(1)}70%{opacity:.8;transform:translateY(-20px) scale(1.05)}100%{opacity:0;transform:translateY(-35px) scale(.8)}}' +
          '</style>' +
          '<div style="position:absolute;top:35%;left:35.6%;pointer-events:none">' +
          '<span class="zz" style="font-size:18px;left:0;top:0;animation-delay:0s">Z</span>' +
          '<span class="zz" style="font-size:24px;left:18px;top:-20px;animation-delay:.8s">Z</span>' +
          '<span class="zz" style="font-size:32px;left:40px;top:-48px;animation-delay:1.6s">Z</span>' +
          '</div>';
      } else {
        // Idle/sunset — music notes at (835,155) + sun rays from demo
        html +=
          '<style>' +
          '.mn{position:absolute;color:rgba(255,220,150,.9);text-shadow:0 1px 6px rgba(255,160,50,.4);opacity:0;animation:mnF 4s ease-in-out infinite}' +
          '@keyframes mnF{0%{opacity:0;transform:translateY(0) translateX(0) scale(.5)}10%{opacity:1;transform:translateY(-5px) translateX(3px) scale(1)}50%{opacity:.8;transform:translateY(-30px) translateX(15px) scale(1.1)}80%{opacity:.3;transform:translateY(-50px) translateX(25px) scale(.9)}100%{opacity:0;transform:translateY(-65px) translateX(30px) scale(.6)}}' +
          '@keyframes ryS{0%,100%{opacity:.6}33%{opacity:1}66%{opacity:.7}}' +
          '</style>' +
          '<div style="position:absolute;top:13%;left:61.8%;width:21.8%;height:52%;background:linear-gradient(160deg,rgba(255,180,80,.08) 0%,rgba(255,150,50,.04) 40%,transparent 70%);animation:ryS 6s ease-in-out infinite"></div>' +
          '<div style="position:absolute;top:32%;left:58%;pointer-events:none">' +
          '<span class="mn" style="font-size:18px;left:0;top:0;animation-delay:0s">&#9834;</span>' +
          '<span class="mn" style="font-size:24px;left:20px;top:-15px;animation-delay:1s">&#9835;</span>' +
          '<span class="mn" style="font-size:16px;left:-10px;top:-8px;animation-delay:2s">&#9833;</span>' +
          '<span class="mn" style="font-size:22px;left:30px;top:-25px;animation-delay:3s">&#9834;</span>' +
          '</div>';
      }
      overlay.innerHTML = html;
    }
    buildOverlay(current);

    // --- Click handler ---
    canvas.addEventListener("click", function (e) {
      if (self._destroyed) return;
      var rect = canvas.getBoundingClientRect();
      var px = (e.clientX - rect.left) * (canvas.width / rect.width);
      var py = (e.clientY - rect.top) * (canvas.height / rect.height);
      var sx = canvas.width / W, sy = canvas.height / H;
      var scale = Math.min(sx, sy);
      var ox = (canvas.width - W * scale) / 2;
      var oy = (canvas.height - H * scale) / 2;
      var cx = (px - ox) / scale;
      var cy = (py - oy) / scale;

      var r = REGIONS[current];
      if (cx >= r.x && cx <= r.x + r.w && cy >= r.y && cy <= r.y + r.h) {
        var agents = sdk.agents;
        if (agents && agents.length > 0) {
          sdk.selectAgent(agents[0].id);
        }
      }
    });

    // --- Draw loop ---
    var BG = { working: "#1a1a2e", idle: "#1a1510", sleeping: "#0a0a1e" };

    function draw() {
      if (self._destroyed) return;
      var sx = canvas.width / W, sy = canvas.height / H;
      var scale = Math.min(sx, sy);
      var ox = (canvas.width - W * scale) / 2;
      var oy = (canvas.height - H * scale) / 2;

      ctx.clearRect(0, 0, canvas.width, canvas.height);

      if (fading) {
        // Draw current fading out
        ctx.fillStyle = BG[current] || "#111";
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        if (loaded[current]) {
          ctx.save();
          ctx.globalAlpha = 1 - fade;
          ctx.translate(ox, oy);
          ctx.scale(scale, scale);
          ctx.drawImage(imgs[current], 0, 0, W, H);
          ctx.restore();
        }
        // Draw target fading in
        if (loaded[target]) {
          ctx.save();
          ctx.globalAlpha = fade;
          ctx.translate(ox, oy);
          ctx.scale(scale, scale);
          ctx.drawImage(imgs[target], 0, 0, W, H);
          ctx.restore();
        }
        fade += FADE_SPEED;
        if (fade >= 1) {
          fade = 0;
          current = target;
          fading = false;
          buildOverlay(current);
        }
      } else {
        ctx.fillStyle = BG[current] || "#111";
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        if (loaded[current]) {
          ctx.save();
          ctx.translate(ox, oy);
          ctx.scale(scale, scale);
          ctx.drawImage(imgs[current], 0, 0, W, H);
          ctx.restore();
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
    if (this._canvas && this._canvas.parentNode) this._canvas.parentNode.removeChild(this._canvas);
    if (this._overlay && this._overlay.parentNode) this._overlay.parentNode.removeChild(this._overlay);
    this._canvas = null;
    this._ctx = null;
    this._overlay = null;
  },
};
