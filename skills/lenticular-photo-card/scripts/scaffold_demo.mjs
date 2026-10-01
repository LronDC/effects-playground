#!/usr/bin/env node
// Generate an offline standalone demo using only Node built-ins.
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';

const skillDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const templateDir = path.join(skillDir, 'assets', 'template');
const resources = ['index.html', 'card.css', 'card.js', 'renderer.js', 'initial-images.js'];
const rendererHash = 'f9486664004c0aaef4249d9e33fad844d74466fe7a657a3f07f119687b3d268f';
const usage = 'Usage: node scaffold_demo.mjs OUTPUT_DIR [--image-a FILE] [--image-b FILE] [--title TEXT]';

async function canonicalLocation(target) {
  let current = target;
  const suffix = [];
  while (true) {
    try { return path.join(await fs.realpath(current), ...suffix.reverse()); }
    catch (error) {
      if (error.code !== 'ENOENT') throw error;
      const parent = path.dirname(current);
      if (parent === current) throw error;
      suffix.push(path.basename(current)); current = parent;
    }
  }
}
function inside(root, target) {
  const relative = path.relative(root, target);
  return !relative || (!relative.startsWith('..' + path.sep) && relative !== '..' && !path.isAbsolute(relative));
}
async function imageData(filename) {
  const absolute = path.resolve(filename), ext = path.extname(absolute).toLowerCase();
  const expected = { '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp' }[ext];
  if (!expected) throw new Error('Unsupported image extension: ' + filename + '. Use JPG, PNG or WebP.');
  const stat = await fs.stat(absolute);
  if (!stat.isFile() || !stat.size || stat.size > 32 * 1024 * 1024) throw new Error('Image must be a regular file between 1 byte and 32 MiB: ' + filename);
  const bytes = await fs.readFile(absolute);
  const actual = bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])) ? 'image/png'
    : bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255 ? 'image/jpeg'
      : bytes.toString('ascii', 0, 4) === 'RIFF' && bytes.toString('ascii', 8, 12) === 'WEBP' ? 'image/webp' : null;
  if (actual !== expected) throw new Error('Image signature does not match its extension: ' + filename);
  return 'data:' + actual + ';base64,' + bytes.toString('base64');
}
async function main() {
  const args = process.argv.slice(2), options = {};
  let output;
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--help' || arg === '-h') { console.log(usage); return; }
    if (['--image-a', '--image-b', '--title'].includes(arg)) {
      if (options[arg] !== undefined) throw new Error('Repeated option: ' + arg);
      if (!args[i + 1] || args[i + 1].startsWith('--')) throw new Error('Missing value for ' + arg);
      options[arg] = args[++i];
    } else if (arg.startsWith('-')) throw new Error('Unknown option: ' + arg);
    else if (output) throw new Error('Provide exactly one output directory.');
    else output = path.resolve(arg);
  }
  if (!output) throw new Error(usage);
  const realOutput = await canonicalLocation(output), realSkill = await fs.realpath(skillDir);
  if (inside(realSkill, realOutput)) throw new Error('Choose an output directory outside the skill package; do not bundle personal photos in the skill.');
  if (realOutput === path.parse(realOutput).root) throw new Error('Choose a dedicated output directory, not a filesystem root.');
  const title = options['--title'] === undefined ? 'Lenticular photo card' : options['--title'];
  if (!title.trim() || title.length > 200) throw new Error('Title must contain 1–200 characters.');
  const existing = [];
  for (const name of resources) {
    try { await fs.lstat(path.join(output, name)); existing.push(name); }
    catch (error) { if (error.code !== 'ENOENT') throw error; }
  }
  if (existing.length) throw new Error('Refusing to overwrite existing generated files: ' + existing.join(', ') + '. Choose a new output directory.');
  const content = new Map(await Promise.all(resources.map(async name => [name, await fs.readFile(path.join(templateDir, name))])));
  const actualHash = createHash('sha256').update(content.get('renderer.js')).digest('hex');
  if (actualHash !== rendererHash) throw new Error('The approved renderer checksum changed. Verify the skill package before scaffolding.');
  const initial = { title, a: options['--image-a'] ? await imageData(options['--image-a']) : null, b: options['--image-b'] ? await imageData(options['--image-b']) : null };
  const safeJSON = JSON.stringify(initial).replace(/</g, '\\u003c').replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029');
  content.set('initial-images.js', Buffer.from('/* Offline images explicitly supplied to this generated demo. */\nwindow.LenticularInitialImages = ' + safeJSON + ';\n'));
  await fs.mkdir(output, { recursive: true });
  for (const name of resources) await fs.writeFile(path.join(output, name), content.get(name), { flag: 'wx' });
  console.log('Created ' + path.join(output, 'index.html'));
  console.log('Open index.html directly (file://) or serve this directory over HTTP. No build step.');
  console.log('Default samples are geometric calibration patterns, not photographs.');
}
main().catch(error => { console.error('Scaffold failed: ' + error.message); process.exitCode = 1; });
