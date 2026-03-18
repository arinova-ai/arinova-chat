// Arinova Default — Built-in safe fallback theme (pure Canvas 2D, zero dependencies)
// Agent display is handled by bridge.js overlay (Arinova mascot).
// This theme only renders the scene background.

var CANVAS_W = 1376;
var CANVAS_H = 768;

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

    var bgImg = new Image();
    var bgLoaded = false;
    var self = this;

    function getScale() {
      var sx = canvas.width / CANVAS_W;
      var sy = canvas.height / CANVAS_H;
      return Math.min(sx, sy);
    }

    function draw() {
      if (self._destroyed) return;

      var scale = getScale();
      var ox = (canvas.width - CANVAS_W * scale) / 2;
      var oy = (canvas.height - CANVAS_H * scale) / 2;

      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.fillStyle = "#1a1a2e";
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      if (bgLoaded) {
        ctx.save();
        ctx.translate(ox, oy);
        ctx.scale(scale, scale);
        ctx.drawImage(bgImg, 0, 0, CANVAS_W, CANVAS_H);
        ctx.restore();
      }

      self._raf = requestAnimationFrame(draw);
    }

    bgImg.onload = function () { bgLoaded = true; };
    bgImg.onerror = function () { /* scene fails gracefully */ };
    bgImg.src = sdk.assetUrl("scene-idle.png");

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
