export function makeQrSvg(text, opts = {}) {
  if (typeof qrcode === 'undefined') {
    console.warn('QR: библиотека qrcode-generator не загружена');
    return '';
  }
  try {
    const qr = qrcode(0, 'M');
    qr.addData(String(text));
    qr.make();
    return qr.createSvgTag({
      cellSize: opts.cellSize || 2,
      margin: opts.margin != null ? opts.margin : 0,
      scalable: true,
    });
  } catch (e) {
    console.warn('QR generation failed:', e);
    return '';
  }
}

export function makeBarcodeSvg(text, opts = {}) {
  if (typeof JsBarcode === 'undefined') {
    console.warn('Barcode: библиотека JsBarcode не загружена');
    return '';
  }
  try {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    JsBarcode(svg, String(text), {
      format: opts.format || 'CODE128',
      width: opts.width || 1.2,
      height: opts.height || 36,
      displayValue: false,
      margin: 0,
      background: '#ffffff',
      lineColor: '#000000',
    });
    svg.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
    return svg.outerHTML;
  } catch (e) {
    console.warn('Barcode generation failed:', e);
    return '';
  }
}