// Mock canvas getContext and scrollTo to silence jsdom warnings
if (typeof HTMLCanvasElement !== 'undefined') {
  HTMLCanvasElement.prototype.getContext = function () {
    return {
      measureText: function () {
        return { width: 0 };
      },
      fillRect: function () {},
      clearRect: function () {},
      getImageData: function (x, y, w, h) {
        return {
          data: new Array(w * h * 4).fill(0),
        };
      },
      putImageData: function () {},
      createImageData: function () {
        return [];
      },
      setTransform: function () {},
      drawImage: function () {},
      save: function () {},
      restore: function () {},
      beginPath: function () {},
      moveTo: function () {},
      lineTo: function () {},
      closePath: function () {},
      stroke: function () {},
      translate: function () {},
      scale: function () {},
      rotate: function () {},
      arc: function () {},
      fill: function () {},
    };
  };
}

if (typeof window !== 'undefined') {
  // Always override to silence "Not implemented"
  window.scrollTo = function () {};
}