const fs = require('fs');
const path = require('path');
const P2 = path.resolve(__dirname, '../plugin_p2') + path.sep;
const entrySrc = fs.readFileSync(P2 + 'entry.js', 'utf8');
const clone = v => v === undefined ? undefined : JSON.parse(JSON.stringify(v));
const short = v => String(typeof v === 'string' ? v : JSON.stringify(v)).slice(0, 260);
const tickMs = ms => new Promise(r => setTimeout(r, ms));

function cutFn(src, name) {
  const i = src.indexOf('function ' + name + '(');
  if (i < 0) return '';
  let d = 0, j = src.indexOf('{', i);
  for (; j < src.length; j++) {
    if (src[j] === '{') d++;
    else if (src[j] === '}' && --d === 0) break;
  }
  return src.slice(i, j + 1);
}

const PNG_HEAD = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const JPG_HEAD = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]);
const du = (tag, mime) => 'data:' + (mime || 'image/png') + ';base64,' + Buffer.concat([mime === 'image/jpeg' ? JPG_HEAD : PNG_HEAD, Buffer.from('REF_' + tag + '_END')]).toString('base64');
const SRC_DU = du('SRC');
const FIT_DU = du('FIT', 'image/jpeg');
const MARKED_DU = du('MARKED', 'image/jpeg');
const IMG_OUT = du('OUTPUT');
const L_SRC = 'the EXACT source image to edit - apply only the requested fix, keep everything else identical';
const L_MARK = 'the same source image with a RED outline marking the only area that must change - the outline is a pointer, never reproduce it';
const LIZA_OVER = { user: { name: 'Liza', text: 'LIZA-PASS', img: 'data:image/jpeg;base64,LIZAIMG' } };
const YUKI = { id: 11, name: 'Yuki', avatar: 'https://av.example.com/yuki.png' };
const VLAD = { id: 1, name: 'Vlad', avatar: 'https://av.example.com/vlad.png' };
const GEM = { apiStyle: 'gemini_native', endpoint: 'https://gen.example.com', apiKey: 'k-test', model: 'gemini-img', aspectRatio: '1:1', imageSize: '1K', refMaxPx: 768 };
const NAI = { apiStyle: 'novelai', endpoint: '', apiKey: 'k-test', model: 'nai-diffusion-4-5-full', naiModel: 'nai-diffusion-4-5-full', aspectRatio: '1:1', imageSize: '1K' };

function engine(src) {
  let __x = null;
  let __v = null;
  eval(src + '\n;__x = { get: function (__n) { return eval(__n); }, put: function (__n, __w) { __v = __w; eval(__n + " = __v"); } };');
  return __x;
}

function has(x, n) {
  try { return typeof x.get(n) !== 'undefined'; } catch (e) { return false; }
}

function rig(src, o) {
  o = o || {};
  const store = clone(o.store || {});
  const files = Object.assign({}, o.files || {});
  const reads = [];
  const toasts = [];
  const key = (k, sc) => String(sc || 'chat') + ':' + k;
  const fk = (n, op) => ((op && op.scope) || 'chat') + ':' + String(n);
  const any = () => new Proxy(function () {}, { get: (t, k) => (k === 'then' ? undefined : any()), apply: () => Promise.resolve(null) });
  const own = {
    get: async (k, sc) => { reads.push(key(k, sc)); return key(k, sc) in store ? clone(store[key(k, sc)]) : null; },
    set: async (k, v, sc) => { store[key(k, sc)] = clone(v); },
    unset: async (k, sc) => { delete store[key(k, sc)]; },
    file: {
      load: async (n, op) => (fk(n, op) in files ? files[fk(n, op)] : null),
      save: async (n, c, op) => { files[fk(n, op)] = String(c); return 'files/' + ((op && op.scope) || 'chat') + '/' + n; },
      exists: async (n, op) => fk(n, op) in files,
      delete: async (n, op) => { delete files[fk(n, op)]; },
      url: (n, sc) => 'files/' + (sc || 'chat') + '/' + n,
      list: async () => []
    },
    character: { get: async id => clone((o.chars || {})[id] || null), all: async () => Object.values(o.chars || {}) },
    persona: { get: async id => clone((o.personas || {})[id] || null), all: async () => Object.values(o.personas || {}) },
    chat: { current: async () => ({ id: 91, name: 'тест', characters: [{ id: 1, name: 'Vlad' }], persona: { id: 2, name: 'Liza' } }) },
    utils: new Proxy({ toast: t => { toasts.push(String(t)); } }, { get: (t, k) => (k in t ? t[k] : (k === 'then' ? undefined : any())) })
  };
  global.tavo = new Proxy({}, { get: (t, k) => (k in own ? own[k] : (k === 'then' ? undefined : any())) });
  if (!o.keepWindow) global.window = { addEventListener() {}, removeEventListener() {}, dispatchEvent() {} };
  const x = engine(src);
  const S = x.get('S');
  return { x, S, store, files, reads, toasts, put: (n, v) => x.put(n, v), fn: n => (has(x, n) ? x.get(n) : null) };
}

function editRig(cfg, o) {
  o = o || {};
  const gens = [];
  const marks = [];
  const wishes = [];
  const recs = o.recs || [{ id: 'r1', path: 'files/global/iig_st_r1.png', text: 'у окна', ar: '3:2', style: 'Wlop by Kamoi', who: 'Yuki', prompt: o.prompt || 'girl by the window', req: { text: 'у окна', charId: '', userId: 11, items: [], place: '', style: 'Wlop by Kamoi', ar: '3:2', sz: '2K' }, sz: o.recSz === undefined ? '2K' : o.recSz, at: 1 }];
  if (o.recSz === null) delete recs[0].sz;
  const r = rig(entrySrc, { store: { 'global:iig_studio': recs }, files: { 'global:iig_st_r1.png': SRC_DU }, personas: { 11: YUKI } });
  r.put('resolveCfg', async () => Object.assign({}, cfg));
  r.put('editSrcFit', async (s) => (s === SRC_DU ? FIT_DU : 'WRONG_SRC'));
  r.put('markDraw', async (s, m) => { marks.push({ s: s, m: clone(m) }); return MARKED_DU; });
  r.put('srcDims', async () => ({ w: 1024, h: 1536 }));
  r.put('wishToEnglish', async (w, c, st) => { wishes.push({ w: w, st: st }); return o.wish === undefined ? 'make her smile' : o.wish; });
  r.put('generate', async (tag, refs, c) => {
    gens.push({ tag: clone(tag), refs: (refs || []).map(z => Object.assign({}, z)), cfg: c });
    if (o.refuse && tag.image_size === o.refuse) { const e = new Error('API 400: unsupported parameters: image_size'); e.status = 400; throw e; }
    return IMG_OUT;
  });
  Object.assign(r, { gens, marks, wishes });
  return r;
}


module.exports = {rig, editRig, entrySrc, GEM, SRC_DU, IMG_OUT};
