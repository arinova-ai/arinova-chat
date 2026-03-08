// AVG Classroom v2 — PixiJS Theme for Arinova Office SDK v2
// Anime-style classroom with 6 agent seats, blackboard stats,
// A/B frame animation, name tags, task bubbles, portrait system,
// info dialog, action buttons, pan/zoom/pinch.

var CANVAS_W = 1920;
var CANVAS_H = 1072;

var SEATS = [
  { id: "s1", charId: "char4", label: "Slot 1" },
  { id: "s2", charId: "char1", label: "Slot 2" },
  { id: "s3", charId: "char5", label: "Slot 3" },
  { id: "s4", charId: "char2", label: "Slot 4" },
  { id: "s5", charId: "char6", label: "Slot 5" },
  { id: "s6", charId: "char3", label: "Slot 6" },
];

var SPRITE_MAP = {
  idle:          { suffix: "step2",  suffixB: "step2b" },
  working:       { suffix: "step4",  suffixB: "step4b" },
  collaborating: { suffix: "step3",  suffixB: "step3b" },
  blocked:       { suffix: "step3",  suffixB: "step3b" },
};

var NAMETAG_POSITIONS = {
  s1: { x: 266, y: 940 },
  s2: { x: 641, y: 760 },
  s3: { x: 850, y: 940 },
  s4: { x: 1107, y: 780 },
  s5: { x: 1457, y: 940 },
  s6: { x: 1656, y: 800 },
};

var BUBBLE_POSITIONS = {
  s1: { x: 266, y: 340 },
  s2: { x: 641, y: 270 },
  s3: { x: 850, y: 370 },
  s4: { x: 1107, y: 350 },
  s5: { x: 1457, y: 380 },
  s6: { x: 1656, y: 340 },
};

var SEAT_HITAREAS = {
  s1: { x: 76, y: 385, w: 380, h: 685 },
  s2: { x: 486, y: 316, w: 311, h: 545 },
  s3: { x: 700, y: 415, w: 300, h: 654 },
  s4: { x: 962, y: 402, w: 291, h: 481 },
  s5: { x: 1307, y: 429, w: 300, h: 640 },
  s6: { x: 1456, y: 389, w: 400, h: 556 },
};

var BACK_ROW_CHARS = ["char1", "char2", "char3"];

/** Truncate text to maxLen characters with ellipsis */
function truncate(text, maxLen) {
  if (!text) return "";
  return text.length > maxLen ? text.slice(0, maxLen) + "…" : text;
}

export default {
  async init(sdk, container) {
    var PIXI = await import("https://cdn.jsdelivr.net/npm/pixi.js@8/dist/pixi.min.mjs");

    var app = new PIXI.Application();
    var w = sdk.width || window.innerWidth;
    var h = sdk.height || window.innerHeight;

    await app.init({
      width: w, height: h,
      backgroundColor: 0x0f172a,
      antialias: true,
      resolution: sdk.pixelRatio || window.devicePixelRatio || 1,
      autoDensity: true,
    });
    container.appendChild(app.canvas);

    // Root container with scaling
    var root = new PIXI.Container();
    app.stage.addChild(root);

    // ── Scaling helpers ──────────────────────────────────────
    var userScale = 1;
    var panX = 0, panY = 0;
    var baseScale = 1;

    function getBaseScale() {
      var sx = app.screen.width / CANVAS_W;
      var sy = app.screen.height / CANVAS_H;
      return Math.max(sx, sy);
    }

    function clampPan() {
      var sw = CANVAS_W * baseScale * userScale;
      var sh = CANVAS_H * baseScale * userScale;
      var W = app.screen.width, H = app.screen.height;
      panX = sw <= W ? (W - sw) / 2 : Math.min(0, Math.max(W - sw, panX));
      panY = sh <= H ? (H - sh) / 2 : Math.min(0, Math.max(H - sh, panY));
    }

    function centerPan() {
      var sw = CANVAS_W * baseScale * userScale;
      var sh = CANVAS_H * baseScale * userScale;
      panX = (app.screen.width - sw) / 2;
      panY = (app.screen.height - sh) / 2;
      clampPan();
    }

    function applyTransform() {
      var s = baseScale * userScale;
      root.scale.set(s);
      root.x = panX;
      root.y = panY;
    }

    baseScale = getBaseScale();
    centerPan();
    applyTransform();

    // ── Background ───────────────────────────────────────────
    var bgTex = await PIXI.Assets.load(sdk.assetUrl("bg.jpeg"));
    var bg = new PIXI.Sprite(bgTex);
    bg.width = CANVAS_W;
    bg.height = CANVAS_H;
    root.addChild(bg);

    // ── Blackboard chalk text ────────────────────────────────
    var chalkStyle = {
      fontFamily: "'Segoe Print', 'Comic Sans MS', 'Chalkduster', cursive",
      fontSize: 30,
      fill: 0xe8e8e8,
      letterSpacing: 1,
      lineHeight: 42,
    };

    var chalkContainer = new PIXI.Container();
    root.addChild(chalkContainer);

    var chalkWorking = new PIXI.Text({ text: "Working: 0", style: { ...chalkStyle } });
    chalkWorking.x = 1120; chalkWorking.y = 75; chalkWorking.alpha = 0.85;
    chalkContainer.addChild(chalkWorking);

    var chalkIdle = new PIXI.Text({ text: "Idle: 0", style: { ...chalkStyle } });
    chalkIdle.x = 1120; chalkIdle.y = 120; chalkIdle.alpha = 0.85;
    chalkContainer.addChild(chalkIdle);

    var chalkCollab = new PIXI.Text({ text: "Collaborating: 0", style: { ...chalkStyle } });
    chalkCollab.x = 1120; chalkCollab.y = 165; chalkCollab.alpha = 0.85;
    chalkContainer.addChild(chalkCollab);

    var chalkBlocked = new PIXI.Text({ text: "Blocked: 0", style: { ...chalkStyle } });
    chalkBlocked.x = 1120; chalkBlocked.y = 210; chalkBlocked.alpha = 0.85;
    chalkContainer.addChild(chalkBlocked);

    // ── Load all character textures ──────────────────────────
    var textures = {};
    for (var si = 0; si < SEATS.length; si++) {
      var seat = SEATS[si];
      textures[seat.id] = {};
      var statusKeys = Object.keys(SPRITE_MAP);
      for (var sti = 0; sti < statusKeys.length; sti++) {
        var status = statusKeys[sti];
        var info = SPRITE_MAP[status];
        var urlA = sdk.assetUrl(seat.charId + "-" + info.suffix + ".png");
        var urlB = sdk.assetUrl(seat.charId + "-" + info.suffixB + ".png");
        try {
          var pair = await Promise.all([PIXI.Assets.load(urlA), PIXI.Assets.load(urlB)]);
          textures[seat.id][status] = pair;
        } catch (e) {
          console.warn("Failed to load " + urlA + ": ", e);
        }
      }
    }

    // ── Create overlay sprites (back row first, front row on top) ─
    var overlays = {};
    var backRow = SEATS.filter(function (s) { return BACK_ROW_CHARS.indexOf(s.charId) !== -1; });
    var frontRow = SEATS.filter(function (s) { return BACK_ROW_CHARS.indexOf(s.charId) === -1; });
    var renderOrder = backRow.concat(frontRow);

    for (var oi = 0; oi < renderOrder.length; oi++) {
      var oSeat = renderOrder[oi];
      var firstTex = textures[oSeat.id] && textures[oSeat.id].idle && textures[oSeat.id].idle[0];
      if (!firstTex) continue;
      var sprite = new PIXI.Sprite(firstTex);
      sprite.width = CANVAS_W;
      sprite.height = CANVAS_H;
      sprite.visible = false;
      root.addChild(sprite);
      overlays[oSeat.id] = { sprite: sprite, frameIndex: 0 };
    }

    // ── Agent state tracking ─────────────────────────────────
    var seatAgent = {};
    SEATS.forEach(function (s) { seatAgent[s.id] = null; });

    // ── Name tags ────────────────────────────────────────────
    var nameTags = {};
    for (var ni = 0; ni < SEATS.length; ni++) {
      var nSeat = SEATS[ni];
      var pos = NAMETAG_POSITIONS[nSeat.id];
      if (!pos) continue;

      var tagContainer = new PIXI.Container();
      tagContainer.x = pos.x;
      tagContainer.y = pos.y;

      var tagText = new PIXI.Text({ text: "Not Connected", style: {
        fontFamily: "system-ui, sans-serif",
        fontSize: 22,
        fill: 0xffffff,
        align: "center",
      }});

      var tagBg = new PIXI.Graphics();

      (function (seatId, tt, tbg) {
        nameTags[seatId] = {
          container: tagContainer,
          update: function () {
            var agent = seatAgent[seatId];
            var name = agent ? agent.name : null;
            tt.text = name || "Not Connected";
            tt.style.fill = name ? 0xffffff : 0x94a3b8;
            tbg.clear();
            var tw = tt.width + 16 * 2;
            var th = tt.height + 6 * 2;
            tbg.roundRect(-tw / 2, 0, tw, th, 8);
            tbg.fill({ color: name ? 0x1e40af : 0x374151, alpha: 0.55 });
            tt.x = -tt.width / 2;
            tt.y = 6;
          },
        };
      })(nSeat.id, tagText, tagBg);

      tagContainer.addChild(tagBg);
      tagContainer.addChild(tagText);
      tagContainer.alpha = 0.75;
      nameTags[nSeat.id].update();
      root.addChild(tagContainer);
    }

    // ── Task bubbles (speech bubble above head) ──────────────
    var taskBubbles = {};
    for (var bi = 0; bi < SEATS.length; bi++) {
      var bSeat = SEATS[bi];
      var bPos = BUBBLE_POSITIONS[bSeat.id];
      if (!bPos) continue;

      var bubbleC = new PIXI.Container();
      bubbleC.x = bPos.x;
      bubbleC.y = bPos.y;
      bubbleC.visible = false;

      var bubbleBg = new PIXI.Graphics();
      bubbleC.addChild(bubbleBg);

      var bubbleText = new PIXI.Text({ text: "", style: {
        fontFamily: "system-ui, sans-serif",
        fontSize: 18,
        fill: 0x1e293b,
        wordWrap: true,
        wordWrapWidth: 200,
        align: "center",
      }});
      bubbleC.addChild(bubbleText);

      var tail1 = new PIXI.Graphics();
      tail1.circle(0, 0, 6);
      tail1.fill({ color: 0xffffff, alpha: 0.9 });
      bubbleC.addChild(tail1);

      var tail2 = new PIXI.Graphics();
      tail2.circle(0, 0, 4);
      tail2.fill({ color: 0xffffff, alpha: 0.9 });
      bubbleC.addChild(tail2);

      (function (seatId, bc, bbg, bt, t1, t2) {
        taskBubbles[seatId] = {
          container: bc,
          update: function () {
            var agent = seatAgent[seatId];
            var task = agent && agent.currentTask
              ? (agent.currentTask.title || agent.currentTask)
              : null;
            if (!task) { bc.visible = false; return; }
            bt.text = truncate(task, 30);
            var tw = Math.min(bt.width, 200) + 14 * 2;
            var th = bt.height + 8 * 2;
            bbg.clear();
            bbg.roundRect(-tw / 2, -th, tw, th, 10);
            bbg.fill({ color: 0xffffff, alpha: 0.9 });
            bt.x = -bt.width / 2;
            bt.y = -th + 8;
            t1.x = 0; t1.y = 8;
            t2.x = 6; t2.y = 20;
            bc.visible = true;
          },
        };
      })(bSeat.id, bubbleC, bubbleBg, bubbleText, tail1, tail2);

      bubbleC.alpha = 0.85;
      root.addChild(bubbleC);
    }

    // ── Portrait system ──────────────────────────────────────
    // Load portrait textures
    var portraits = {};
    for (var pi = 0; pi < SEATS.length; pi++) {
      try {
        portraits[SEATS[pi].id] = await PIXI.Assets.load(
          sdk.assetUrl(SEATS[pi].charId + "-portrait.png")
        );
      } catch (e) {
        console.warn("Portrait load failed: " + SEATS[pi].charId, e);
      }
    }

    // Portrait overlay layer (above everything in root)
    var portraitLayer = new PIXI.Container();
    root.addChild(portraitLayer);

    // Dark backdrop (50% opacity)
    var backdrop = new PIXI.Graphics();
    backdrop.rect(0, 0, CANVAS_W, CANVAS_H);
    backdrop.fill({ color: 0x000000, alpha: 0.5 });
    backdrop.visible = false;
    backdrop.eventMode = "static";
    backdrop.cursor = "pointer";
    portraitLayer.addChild(backdrop);

    // Portrait sprite
    var portraitSprite = new PIXI.Sprite();
    portraitSprite.width = CANVAS_W;
    portraitSprite.height = CANVAS_H;
    portraitSprite.visible = false;
    portraitLayer.addChild(portraitSprite);

    // ── Info dialog (right-bottom, 620x380) ──────────────────
    var dialogContainer = new PIXI.Container();
    dialogContainer.visible = false;
    portraitLayer.addChild(dialogContainer);

    var dialogBg = new PIXI.Graphics();
    dialogContainer.addChild(dialogBg);

    var dialogTitle = new PIXI.Text({ text: "", style: {
      fontFamily: "system-ui, sans-serif",
      fontSize: 36,
      fontWeight: "bold",
      fill: 0x60a5fa,
    }});
    dialogContainer.addChild(dialogTitle);

    var dialogText = new PIXI.Text({ text: "", style: {
      fontFamily: "system-ui, sans-serif",
      fontSize: 28,
      fill: 0xffffff,
      wordWrap: true,
      wordWrapWidth: 560,
      lineHeight: 40,
    }});
    dialogContainer.addChild(dialogText);

    // ── Action buttons (left-bottom) ─────────────────────────
    var btnContainer = new PIXI.Container();
    btnContainer.visible = false;
    portraitLayer.addChild(btnContainer);

    function createButton(label, icon, x, y, bw, bh, onClick) {
      var btn = new PIXI.Container();
      btn.x = x; btn.y = y;

      var bbg = new PIXI.Graphics();
      bbg.roundRect(0, 0, bw, bh, 12);
      bbg.fill({ color: 0x1e293b, alpha: 0.95 });
      bbg.stroke({ color: 0x475569, width: 2 });
      btn.addChild(bbg);

      var iconText = new PIXI.Text({ text: icon, style: {
        fontFamily: "system-ui, sans-serif", fontSize: 40, fill: 0xffffff,
      }});
      iconText.x = (bw - iconText.width) / 2;
      iconText.y = 16;
      btn.addChild(iconText);

      var labelText = new PIXI.Text({ text: label, style: {
        fontFamily: "system-ui, sans-serif", fontSize: 22, fill: 0x94a3b8,
      }});
      labelText.x = (bw - labelText.width) / 2;
      labelText.y = bh - 38;
      btn.addChild(labelText);

      btn.eventMode = "static";
      btn.cursor = "pointer";
      btn.on("pointerover", function () { bbg.tint = 0x334155; });
      btn.on("pointerout", function () { bbg.tint = 0xffffff; });
      btn.on("pointerdown", onClick);
      return btn;
    }

    var btnW = 180, btnH = 100, btnGap = 24;
    var btnX = 60;
    var btnY = CANVAS_H - 100 - btnH * 2 - btnGap;
    var portraitOpenSeatId = null;

    var switchBtn = createButton("Switch Agent", "\uD83D\uDD04", btnX, btnY, btnW, btnH, function () {
      if (portraitOpenSeatId) {
        var agent = seatAgent[portraitOpenSeatId];
        if (agent) sdk.selectAgent(agent.id);
        hidePortrait();
      }
    });
    btnContainer.addChild(switchBtn);

    var chatBtn = createButton("Chat", "\uD83D\uDCAC", btnX, btnY + btnH + btnGap, btnW, btnH, function () {
      if (portraitOpenSeatId) {
        var agent = seatAgent[portraitOpenSeatId];
        if (agent) {
          if (typeof sdk.openChat === "function") {
            sdk.openChat(agent.id);
          } else {
            sdk.selectAgent(agent.id);
          }
        }
        hidePortrait();
      }
    });
    btnContainer.addChild(chatBtn);

    // ── Portrait show/hide ───────────────────────────────────
    var portraitOpen = false;

    function drawDialog(seatId) {
      var agent = seatAgent[seatId];
      if (!agent) return;

      var dw = 620, dh = 380;
      var dx = CANVAS_W - dw - 60;
      var dy = CANVAS_H - dh - 60;

      dialogBg.clear();
      dialogBg.roundRect(dx, dy, dw, dh, 16);
      dialogBg.fill({ color: 0x1e293b, alpha: 0.95 });
      dialogBg.stroke({ color: 0x334155, width: 2 });

      dialogTitle.text = agent.name || "Agent";
      dialogTitle.x = dx + 24;
      dialogTitle.y = dy + 20;

      var statusText = agent.status || "idle";
      var modelText = agent.model || "—";
      var taskText = agent.currentTask
        ? (agent.currentTask.title || agent.currentTask || "—")
        : "—";
      var activityText = "—";
      if (agent.recentActivity && agent.recentActivity.length > 0) {
        var ra = agent.recentActivity[0];
        activityText = (ra.time ? ra.time + " — " : "") + ra.text;
      }
      if (agent.currentToolDetail) {
        activityText = agent.currentToolDetail;
      }

      dialogText.text =
        "Status: " + statusText + "\n" +
        "Model: " + modelText + "\n" +
        "Current Task: " + truncate(taskText, 60) + "\n" +
        "Recent Activity: " + truncate(activityText, 60);
      dialogText.x = dx + 24;
      dialogText.y = dy + 68;

      dialogContainer.visible = true;
      btnContainer.visible = true;
    }

    function showPortrait(seatId) {
      var tex = portraits[seatId];
      if (!tex) return;
      portraitSprite.texture = tex;
      portraitSprite.visible = true;
      backdrop.visible = true;
      drawDialog(seatId);
      portraitOpenSeatId = seatId;
      portraitOpen = true;
    }

    function hidePortrait() {
      portraitSprite.visible = false;
      backdrop.visible = false;
      dialogContainer.visible = false;
      btnContainer.visible = false;
      portraitOpenSeatId = null;
      portraitOpen = false;
    }

    backdrop.on("pointerdown", function () { hidePortrait(); });

    // ── Hit areas for click → portrait ───────────────────────
    for (var hi = 0; hi < renderOrder.length; hi++) {
      var hSeat = renderOrder[hi];
      var area = SEAT_HITAREAS[hSeat.id];
      if (!area) continue;
      var hit = new PIXI.Graphics();
      hit.rect(area.x, area.y, area.w, area.h);
      hit.fill({ color: 0x000000, alpha: 0.001 });
      hit.eventMode = "static";
      hit.cursor = "pointer";
      (function (seatId) {
        hit.on("pointerdown", function () {
          var agent = seatAgent[seatId];
          if (!agent) return;
          if (portraitOpen) {
            hidePortrait();
          } else {
            showPortrait(seatId);
          }
        });
      })(hSeat.id);
      root.addChild(hit);
    }

    // ── Update functions ─────────────────────────────────────
    function updateChalkboard() {
      var working = 0, idle = 0, collab = 0, blocked = 0;
      for (var ci = 0; ci < SEATS.length; ci++) {
        var agent = seatAgent[SEATS[ci].id];
        if (!agent) continue;
        var s = agent.status;
        if (s === "working") working++;
        else if (s === "idle") idle++;
        else if (s === "collaborating") collab++;
        else if (s === "blocked") blocked++;
      }
      chalkWorking.text = "Working: " + working;
      chalkIdle.text = "Idle: " + idle;
      chalkCollab.text = "Collaborating: " + collab;
      chalkBlocked.text = "Blocked: " + blocked;
    }

    function updateOverlays() {
      for (var ui = 0; ui < SEATS.length; ui++) {
        var uSeat = SEATS[ui];
        var overlay = overlays[uSeat.id];
        if (!overlay) continue;
        var agent = seatAgent[uSeat.id];
        if (!agent) {
          overlay.sprite.visible = false;
          continue;
        }
        var st = agent.status || "idle";
        if (!SPRITE_MAP[st]) st = "idle";
        var frames = textures[uSeat.id] && textures[uSeat.id][st];
        if (!frames) { overlay.sprite.visible = false; continue; }
        overlay.sprite.texture = frames[overlay.frameIndex % frames.length];
        overlay.sprite.visible = true;
        overlay.sprite.alpha = 1.0;
      }
    }

    function updateAllUI() {
      updateOverlays();
      updateChalkboard();
      for (var ti = 0; ti < SEATS.length; ti++) {
        var id = SEATS[ti].id;
        if (nameTags[id]) nameTags[id].update();
        if (taskBubbles[id]) taskBubbles[id].update();
      }
      // Update portrait dialog if open
      if (portraitOpen && portraitOpenSeatId) {
        drawDialog(portraitOpenSeatId);
      }
    }

    // ── Map sdk.agents to seats ──────────────────────────────
    function applyAgents(agents) {
      for (var ai = 0; ai < SEATS.length; ai++) {
        seatAgent[SEATS[ai].id] = agents[ai] || null;
      }
      updateAllUI();
    }

    applyAgents(sdk.agents || []);

    sdk.onAgentsChange(function (agents) {
      applyAgents(agents);
    });

    // ── A/B frame animation ticker ───────────────────────────
    var lastToggle = performance.now();
    app.ticker.add(function () {
      var now = performance.now();
      if (now - lastToggle >= 2000) {
        lastToggle = now;
        for (var fi = 0; fi < SEATS.length; fi++) {
          var fSeat = SEATS[fi];
          var overlay = overlays[fSeat.id];
          if (!overlay || !overlay.sprite.visible) continue;
          var agent = seatAgent[fSeat.id];
          if (!agent) continue;
          var st = agent.status || "idle";
          if (!SPRITE_MAP[st]) st = "idle";
          var frames = textures[fSeat.id] && textures[fSeat.id][st];
          if (!frames || frames.length < 2) continue;
          overlay.frameIndex = (overlay.frameIndex + 1) % 2;
          overlay.sprite.texture = frames[overlay.frameIndex];
        }
      }
    });

    // ── Pan / Zoom / Pinch ───────────────────────────────────
    var dragging = false, dragStartX = 0, dragStartY = 0, panStartX = 0, panStartY = 0;
    var pinching = false, pinchStartDist = 0, pinchStartScale = 1, pinchMidX = 0, pinchMidY = 0;
    var MIN_SCALE = 0.5, MAX_SCALE = 3;

    var canvas = app.canvas;

    function touchDist(e) {
      var a = e.touches[0], b = e.touches[1];
      return Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
    }

    canvas.addEventListener("touchstart", function (e) {
      if (portraitOpen) return; // Don't pan while portrait is open
      if (e.touches.length === 2) {
        e.preventDefault();
        dragging = false;
        pinching = true;
        pinchStartDist = touchDist(e);
        pinchStartScale = userScale;
        var rect = canvas.getBoundingClientRect();
        pinchMidX = (e.touches[0].clientX + e.touches[1].clientX) / 2 - rect.left;
        pinchMidY = (e.touches[0].clientY + e.touches[1].clientY) / 2 - rect.top;
        panStartX = panX; panStartY = panY;
        return;
      }
      dragging = true;
      dragStartX = e.touches[0].clientX; dragStartY = e.touches[0].clientY;
      panStartX = panX; panStartY = panY;
    }, { passive: false });

    canvas.addEventListener("touchmove", function (e) {
      if (portraitOpen) return;
      if (pinching && e.touches.length === 2) {
        e.preventDefault();
        if (pinchStartDist <= 0) return;
        var dist = touchDist(e);
        var ns = Math.min(MAX_SCALE, Math.max(MIN_SCALE, pinchStartScale * dist / pinchStartDist));
        var rect = canvas.getBoundingClientRect();
        var mx = (e.touches[0].clientX + e.touches[1].clientX) / 2 - rect.left;
        var my = (e.touches[0].clientY + e.touches[1].clientY) / 2 - rect.top;
        panX = mx - (pinchMidX - panStartX) * (ns / pinchStartScale);
        panY = my - (pinchMidY - panStartY) * (ns / pinchStartScale);
        userScale = ns;
        clampPan(); applyTransform();
        return;
      }
      if (!dragging) return;
      e.preventDefault();
      panX = panStartX + (e.touches[0].clientX - dragStartX);
      panY = panStartY + (e.touches[0].clientY - dragStartY);
      clampPan(); applyTransform();
    }, { passive: false });

    canvas.addEventListener("touchend", function (e) {
      if (pinching && e.touches.length < 2) { pinching = false; return; }
      dragging = false;
    });

    canvas.addEventListener("wheel", function (e) {
      if (portraitOpen) return;
      e.preventDefault();
      var factor = e.deltaY > 0 ? 0.9 : 1.1;
      var ns = Math.min(MAX_SCALE, Math.max(MIN_SCALE, userScale * factor));
      var rect = canvas.getBoundingClientRect();
      var cx = e.clientX - rect.left, cy = e.clientY - rect.top;
      panX = cx - (cx - panX) * (ns / userScale);
      panY = cy - (cy - panY) * (ns / userScale);
      userScale = ns;
      clampPan(); applyTransform();
    }, { passive: false });

    // Store references for resize/destroy
    this._app = app;
    this._getBaseScale = getBaseScale;
    this._clampPan = clampPan;
    this._applyTransform = applyTransform;
    this._setBaseScale = function (v) { baseScale = v; };
  },

  resize(width, height) {
    var app = this._app;
    if (!app) return;
    app.renderer.resize(width, height);
    this._setBaseScale(this._getBaseScale());
    this._clampPan();
    this._applyTransform();
  },

  destroy() {
    var app = this._app;
    if (!app) return;
    app.destroy(true, { children: true });
    this._app = null;
  },
};
