// Cozy Studio v2 — Arinova Mascot Theme (SDK v2 iframe)
// Scene backgrounds switch by agent status, mascot sprite animates.

var CANVAS_W = 1376;
var CANVAS_H = 768;

var SCENES = {
  working: "scene-working.png",
  idle: "scene-idle.png",
  sleeping: "scene-sleeping.png",
  blocked: "scene-idle.png",
  collaborating: "scene-working.png",
};

// Character hitbox per scene (fraction of canvas: x, y, w, h)
var HITBOXES = {
  working: { x: 0.65, y: 0.28, w: 0.18, h: 0.45 },
  idle: { x: 0.53, y: 0.22, w: 0.14, h: 0.40 },
  sleeping: { x: 0.27, y: 0.18, w: 0.15, h: 0.35 },
};

export default {
  async init(sdk, container) {
    var PIXI = await import("https://cdn.jsdelivr.net/npm/pixi.js@8/dist/pixi.min.mjs");

    var app = new PIXI.Application();
    var w = sdk.width || window.innerWidth;
    var h = sdk.height || window.innerHeight;

    await app.init({
      width: w, height: h,
      backgroundColor: 0x1a1a2e,
      antialias: false,
      resolution: sdk.pixelRatio || window.devicePixelRatio || 1,
      autoDensity: true,
      roundPixels: true,
    });
    container.appendChild(app.canvas);

    var root = new PIXI.Container();
    app.stage.addChild(root);

    // Scaling (fit canvas within viewport)
    var baseScale = 1;

    function getBaseScale() {
      var sx = app.screen.width / CANVAS_W;
      var sy = app.screen.height / CANVAS_H;
      return Math.min(sx, sy);
    }

    function applyTransform() {
      baseScale = getBaseScale();
      root.scale.set(baseScale);
      root.x = (app.screen.width - CANVAS_W * baseScale) / 2;
      root.y = (app.screen.height - CANVAS_H * baseScale) / 2;
    }
    applyTransform();

    // Load scene textures
    var sceneTex = {};
    var sceneFiles = Object.values(SCENES);
    for (var si = 0; si < sceneFiles.length; si++) {
      var file = sceneFiles[si];
      if (!sceneTex[file]) {
        try {
          sceneTex[file] = await PIXI.Assets.load(sdk.assetUrl(file));
        } catch (e) {
          console.warn("Scene load failed:", file, e);
        }
      }
    }

    // Background sprite
    var bgSprite = new PIXI.Sprite(sceneTex["scene-idle.png"]);
    bgSprite.width = CANVAS_W;
    bgSprite.height = CANVAS_H;
    root.addChild(bgSprite);

    // Load mascot sprite sheet (1024x1024 — 4x4 grid = 256x256 per frame)
    var mascotTex = null;
    try {
      mascotTex = await PIXI.Assets.load(sdk.assetUrl("mascot-sprite.png"));
    } catch (e) {
      console.warn("Mascot sprite load failed:", e);
    }

    var FRAME_SIZE = 256;
    var COLS = 4;
    var mascotFrames = [];
    if (mascotTex) {
      // Use nearest-neighbor scaling for pixel art look
      mascotTex.source.scaleMode = "nearest";
      for (var row = 0; row < 4; row++) {
        for (var col = 0; col < COLS; col++) {
          var rect = new PIXI.Rectangle(col * FRAME_SIZE, row * FRAME_SIZE, FRAME_SIZE, FRAME_SIZE);
          mascotFrames.push(new PIXI.Texture({ source: mascotTex.source, frame: rect }));
        }
      }
    }

    // Mascot sprite
    var mascot = null;
    var mascotFrameIdx = 0;
    if (mascotFrames.length > 0) {
      mascot = new PIXI.Sprite(mascotFrames[0]);
      var hb = HITBOXES.idle;
      mascot.x = hb.x * CANVAS_W;
      mascot.y = hb.y * CANVAS_H;
      mascot.width = hb.w * CANVAS_W;
      mascot.height = hb.h * CANVAS_H;
      root.addChild(mascot);
    }

    // Hit area overlay for click
    var hitArea = new PIXI.Graphics();
    hitArea.eventMode = "static";
    hitArea.cursor = "pointer";
    root.addChild(hitArea);

    // Name tag
    var nameTag = new PIXI.Container();
    var nameTagBg = new PIXI.Graphics();
    nameTag.addChild(nameTagBg);
    var nameTagText = new PIXI.Text({ text: "", style: {
      fontFamily: "system-ui, sans-serif",
      fontSize: 20,
      fill: 0xffffff,
      align: "center",
    }});
    nameTag.addChild(nameTagText);
    nameTag.visible = false;
    root.addChild(nameTag);

    // Status chalk text
    var statusText = new PIXI.Text({ text: "", style: {
      fontFamily: "'Segoe Print', 'Comic Sans MS', cursive",
      fontSize: 24,
      fill: 0xe8e8d0,
      letterSpacing: 1,
    }});
    statusText.x = 40;
    statusText.y = 30;
    statusText.alpha = 0.8;
    root.addChild(statusText);

    // State
    var currentAgent = null;

    function getSceneKey(status) {
      if (status === "working" || status === "collaborating") return "working";
      if (status === "blocked") return "sleeping";
      return "idle";
    }

    function updateScene() {
      var agent = currentAgent;
      var status = agent ? (agent.status || "idle") : "idle";
      var scene = getSceneKey(status);

      // Background
      var bgFile = SCENES[status] || SCENES.idle;
      if (sceneTex[bgFile]) bgSprite.texture = sceneTex[bgFile];

      // Mascot position
      var hb = HITBOXES[scene] || HITBOXES.idle;
      if (mascot) {
        mascot.x = hb.x * CANVAS_W;
        mascot.y = hb.y * CANVAS_H;
        mascot.width = hb.w * CANVAS_W;
        mascot.height = hb.h * CANVAS_H;
        mascot.visible = true;
        mascot.alpha = agent ? 1.0 : 0.5;
      }

      // Hit area
      hitArea.clear();
      if (agent) {
        hitArea.rect(hb.x * CANVAS_W, hb.y * CANVAS_H, hb.w * CANVAS_W, hb.h * CANVAS_H);
        hitArea.fill({ color: 0x000000, alpha: 0.001 });
      }

      // Name tag
      if (agent) {
        nameTagText.text = agent.name || "Agent";
        var padX = 12, padY = 4;
        nameTagBg.clear();
        var tw = nameTagText.width + padX * 2;
        var th = nameTagText.height + padY * 2;
        nameTagBg.roundRect(0, 0, tw, th, 8);
        nameTagBg.fill({ color: 0x1e40af, alpha: 0.6 });
        nameTagText.x = padX;
        nameTagText.y = padY;
        nameTag.x = (hb.x + hb.w / 2) * CANVAS_W - tw / 2;
        nameTag.y = hb.y * CANVAS_H - th - 8;
        nameTag.visible = true;
      } else {
        nameTag.visible = false;
      }

      // Status text
      if (agent) {
        var task = agent.currentTask ? (agent.currentTask.title || agent.currentTask) : "";
        statusText.text = task ? status + " — " + task : status;
      } else {
        statusText.text = "Waiting for agent...";
      }
    }

    hitArea.on("pointerdown", function () {
      if (currentAgent) sdk.selectAgent(currentAgent.id);
    });

    function applyAgents(agents) {
      currentAgent = agents && agents.length > 0 ? agents[0] : null;
      updateScene();
    }

    applyAgents(sdk.agents || []);
    sdk.onAgentsChange(function (agents) { applyAgents(agents); });

    // Mascot frame animation (~4 fps)
    if (mascotFrames.length > 0) {
      var lastFrame = performance.now();
      app.ticker.add(function () {
        var now = performance.now();
        if (now - lastFrame >= 250) {
          lastFrame = now;
          mascotFrameIdx = (mascotFrameIdx + 1) % mascotFrames.length;
          if (mascot) mascot.texture = mascotFrames[mascotFrameIdx];
        }
      });
    }

    this._app = app;
    this._applyTransform = applyTransform;
  },

  resize(width, height) {
    var app = this._app;
    if (!app) return;
    app.renderer.resize(width, height);
    this._applyTransform();
  },

  destroy() {
    var app = this._app;
    if (!app) return;
    app.destroy(true, { children: true });
    this._app = null;
  },
};
