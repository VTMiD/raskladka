// GsCAM/emitter.js
export class GcodeEmitter {
  constructor(post) {
    this.post = post;
    this.lines = [];
    this.lineNo = post.lineNumberStart;
    this.dec = post.decimalPlaces;

    this.lastText = '';
    this.lastX = null;
    this.lastY = null;

    this._lastXnum = null;
    this._lastYnum = null;

    this._contourCounter = 0;
  }

  fmt(v) {
    if (typeof v !== 'number' || !isFinite(v)) v = 0;
    let s = v.toFixed(this.dec);
    const negZero = '-0.' + '0'.repeat(this.dec);
    if (s === negZero) s = '0.' + '0'.repeat(this.dec);
    return s;
  }

  _nextN() {
    const n = 'N' + String(this.lineNo).padStart(4, '0');
    this.lineNo += this.post.lineNumberStep;
    return n;
  }

  numbered(text) {
    this.lines.push(`${this._nextN()} ${text}`);
    return this;
  }

  comment(text) {
    return this.numbered(`(${text})`);
  }

  header(ctx) {
    for (const line of this.post.header(ctx)) this.numbered(line);
    return this;
  }

  partComment(ctx) {
    if (this.post.partComment) this.numbered(this.post.partComment(ctx));
    return this;
  }

  footer() {
    for (const line of this.post.footer) this.numbered(line);
    return this;
  }

  // ИЗМЕНЕНО: Теперь принимает скорость (feedRate) и выводит F-код
  torchOn(feedRate) {
    const cmds = [...this.post.torchOn];
    if (feedRate && feedRate > 0) {
      cmds.push(`F${this.fmt(feedRate)}`);
    }
    for (const cmd of cmds) this.numbered(cmd);
    return this;
  }

  torchOff() {
    for (const cmd of this.post.torchOff) this.numbered(cmd);
    return this;
  }

  leadInStart() {
    this.numbered('(LEAD-IN)');
    return this;
  }

  contourStart() {
    this._contourCounter++;
    const id = this._contourCounter;
    this.numbered(`(CONTOUR-START:${id})`);
    return id;
  }

  contourEnd(id) {
    if (id != null) this.numbered(`(CONTOUR-END:${id})`);
    return this;
  }

  rapid(x, y) {
    this.lastText = 'G00';
    this.numbered('G00');
    this.numbered(`X${this.fmt(x)} Y${this.fmt(y)}`);
    this.lastX = this.fmt(x);
    this.lastY = this.fmt(y);
    this._lastXnum = x;
    this._lastYnum = y;
    return this;
  }

  rapidOnly() {
    this.lastText = 'G00';
    this.lastX = null;
    this.lastY = null;
    this.numbered('G00');
    return this;
  }

  move(x, y) {
    const fx = this.fmt(x);
    const fy = this.fmt(y);
    const parts = [];

    if (this.lastText !== 'G01') {
      parts.push('G01');
      this.lastText = 'G01';
    }
    if (this.lastX !== fx) { parts.push(`X${fx}`); this.lastX = fx; }
    if (this.lastY !== fy) { parts.push(`Y${fy}`); this.lastY = fy; }

    if (parts.length === 0) return this;
    this.numbered(parts.join(' '));
    this._lastXnum = x;
    this._lastYnum = y;
    return this;
  }

  arc(cx, cy, x, y, ccw, arcAngle = null) {
    const I = cx - (this._lastXnum ?? 0);
    const J = cy - (this._lastYnum ?? 0);
    const text = ccw ? 'G03' : 'G02';
    const needText = this.lastText !== text;

    const splitting = arcAngle != null && Math.abs(arcAngle) > 4;

    if (splitting) {
      const midX = cx + (cx - (this._lastXnum ?? 0));
      const midY = cy + (cy - (this._lastYnum ?? 0));

      const parts1 = [];
      if (needText) parts1.push(text);
      parts1.push(`X${this.fmt(midX)}`);
      parts1.push(`Y${this.fmt(midY)}`);
      parts1.push(`I${this.fmt(I)}`);
      parts1.push(`J${this.fmt(J)}`);
      this.numbered(parts1.join(' '));
      this.lastText = text;

      const parts2 = [
        `X${this.fmt(x)}`,
        `Y${this.fmt(y)}`,
        `I${this.fmt(-I)}`,
        `J${this.fmt(-J)}`,
      ];
      this.numbered(parts2.join(' '));
    } else {
      const parts = [];
      if (needText) parts.push(text);
      parts.push(`X${this.fmt(x)}`);
      parts.push(`Y${this.fmt(y)}`);
      parts.push(`I${this.fmt(I)}`);
      parts.push(`J${this.fmt(J)}`);
      this.numbered(parts.join(' '));
      this.lastText = text;
    }

    this._lastXnum = x;
    this._lastYnum = y;
    this.lastX = this.fmt(x);
    this.lastY = this.fmt(y);
    return this;
  }

  toString() {
    return this.lines.join('\n') + '\n';
  }

  toLines() {
    return this.lines.slice();
  }
}