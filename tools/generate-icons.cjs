/** Regenerate the brand PNGs and Windows ICO from the SVG masters. */
const fs = require('node:fs');
const path = require('node:path');
const { Resvg } = require('@resvg/resvg-js');
const root = path.resolve(__dirname, '..');
const resources = path.join(root, 'resources');
const mark = fs.readFileSync(path.join(resources, 'brand', 'mark.svg'), 'utf8').replace(/^\uFEFF/, '');
const body = mark.replace(/^[\s\S]*?<svg[^>]*>/, '').replace(/<\/svg>\s*$/, '');
const icon = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256"><rect width="256" height="256" rx="54" fill="#000000"/><g transform="translate(10 10) scale(.92)">' + body + '</g></svg>';
const wordmark = '<g transform="translate(38 35) scale(.78)">' + body + '</g><text x="270" y="144" fill="#FFFFFF" font-family="Segoe UI,Arial,sans-serif" font-size="76" font-weight="600" letter-spacing="-2.5">PocketBench</text><text x="274" y="186" fill="#999999" font-family="Segoe UI,Arial,sans-serif" font-size="22">Windows &amp; app repair</text>';
const bounds = new Resvg('<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="280">' + wordmark + '</svg>').getBBox();
if (!bounds) throw Error('Wordmark geometry is unavailable');
const lockupWidth = Math.ceil(bounds.x + bounds.width + 48);
const lockup = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + lockupWidth + ' 280"><rect width="' + lockupWidth + '" height="280" fill="#000000"/>' + wordmark + '</svg>';
const png = (svg, width) => new Resvg(svg, { fitTo: { mode: 'width', value: width } }).render().asPng();
fs.writeFileSync(path.join(resources, 'icon.svg'), icon + '\n');
fs.writeFileSync(path.join(resources, 'brand', 'lockup.svg'), lockup + '\n');
const sizes = [16, 20, 24, 32, 40, 48, 64, 128, 256];
const frames = sizes.map(size => ({ size, bytes: png(icon, size) }));
const header = Buffer.alloc(6 + frames.length * 16);
header.writeUInt16LE(1, 2); header.writeUInt16LE(frames.length, 4);
let offset = header.length;
for (const [index, frame] of frames.entries()) {
  if (!frame.bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])) || frame.bytes.readUInt32BE(16) !== frame.size) throw Error('Invalid rasterized icon frame');
  const at = 6 + index * 16; header[at] = frame.size % 256; header[at + 1] = frame.size % 256;
  header.writeUInt16LE(1, at + 4); header.writeUInt16LE(32, at + 6);
  header.writeUInt32LE(frame.bytes.length, at + 8); header.writeUInt32LE(offset, at + 12);
  offset += frame.bytes.length;
}
const ico = Buffer.concat([header, ...frames.map(frame => frame.bytes)]);
if (ico.length !== offset) throw Error('Icon offsets do not match file length');
fs.writeFileSync(path.join(resources, 'icon.ico'), ico);
fs.writeFileSync(path.join(resources, 'icon.png'), frames.at(-1).bytes);
fs.writeFileSync(path.join(resources, 'brand', 'mark.png'), png(mark, 512));
fs.writeFileSync(path.join(resources, 'brand', 'lockup.png'), png(lockup, lockupWidth));
console.log('Exported brand mark, wordmark, and 9 Windows icon sizes.');

