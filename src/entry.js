/**
 * notsosillynotsoimages — Inline Image & Video Generation for SillyTavern
 * Character references, NPC slots, video, iOS compatibility layer.
 *
 * Copyright (C) 2025-2026 aceeenvw
 * Repository: https://github.com/aceeenvw/notsosillynotsoimages
 *
 * Based on SillyImages by 0xl0cal
 * Original: https://github.com/0xl0cal/sillyimages
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
 * GNU Affero General Public License for more details.
 *
 * You should have received a copy of the GNU Affero General Public License
 * along with this program. If not, see <https://www.gnu.org/licenses/>.
 *
 * NOTICE: If you use or adapt any part of this code in your own project,
 * you must retain this copyright notice and provide attribution to the
 * original author (aceeenvw) in a prominent location (file header,
 * README, or UI credits).
 */
/*
 * Tavo adaptation and modifications: Copyright (C) 2026 NotFound_404 / Not_Found.
 * Maintainer: https://github.com/NotFound404dev
 * Modified for Tavo; publication packaging updated 2026-11-03.
 * See LICENSE and CREDITS.md. SPDX-License-Identifier: AGPL-3.0-or-later
 */


var VER = '1.38.0';

var S = {};

var BASE_PW = 'YOU ARE AN IMAGE PROMPT WRITER. You receive a roleplay post (and recent context) and write ONE final image generation prompt for its key visual moment. Output ONLY the prompt text: by default one dense English paragraph, 80-130 words. If the style guide below prescribes another format or length - for example comma-separated danbooru tags with a full appearance block per character - FOLLOW THE GUIDE instead: its format and length always win over this default. No preamble, no commentary, no markdown, no quotes or apostrophes anywhere (write possessives without apostrophes: hands of Kira, not Kira\u0027s hands). Exception: when the style guide asks for speech bubbles or on-image text, keep that text in «» quotes exactly as the style guide shows.';

var DEFAULTS = {
        apiStyle: 'openai_chat',
        endpoint: '',
        apiKey: '',
        model: '',
        aspectRatio: '1:1',
        imageSize: '1K',
        naisteraModel: 'grok',
        preset: 'digital',
        styleLock: '',
        styleNegative: '',
        keepImages: 0,
        pwChat: true,
        pwMaxTokens: 0,
        pwReasoning: 'off',
        pwEndpoint: '',
        pwKey: '',
        pwModel: '',
        pwDepth: 4,
        autoOn: true,
        autoMode: 'new',
        useCharRef: true,
        useUserRef: true,
        refMaxPx: 768,
        frame: 'soft',
        promptName: '',
        naiModel: 'nai-diffusion-4-5-full',
        naiSteps: 28,
        naiScale: 5.5,
        naiSampler: 'k_euler_ancestral',
        naiUc: 0,
        naiRefs: true,
        naiRefMax: 2,
        naiRefStrength: 0.6,
        naiEditStrength: 0.6,
        naiLarge: false,
        naiArtists: '',
        naiNegative: '',
        naiQuality: true,
        naiSeed: 0,
        naiRescale: 0,
        naiNoise: 'karras',
        naiVariety: false,
        naiSmea: false,
        naiSmeaDyn: false
      };

var VALID_AR = ['1:1', '2:3', '3:2', '3:4', '4:3', '4:5', '5:4', '9:16', '16:9', '21:9'];
var VALID_SZ = ['1K', '2K', '4K'];

S._acReg = {};
S._actBusy = 0;
S._actLast = '';
S._actLastAt = 0;
S._actText = '';
S._autoBusy = {};
S._autoTimers = {};
S._bakeMiss = {};
S._dead = {};
S._inflight = {};
S._keyMsg = {};
S._pendMark = {};
S._pwPending = {};
S._S = null;
S._avCache = {};
S._cfgBootTried = null;
S._cfgCache = null;
S._cmdDone = null;
S._cmdDoneP = null;
S._lastImgTok = null;
S._lastRefsNote = null;
S._naiRefsOff = null;
S._names = {};
S._pass = {};
S._ppKV = {};
S._pwCache = {};
S._pwNoReason = null;
S._pwSrc = null;
S._refsCache = {};
S._refsKV = null;
S._sems = null;
S._stopReq = null;
S._textRefs = [];
S._ticking = null;

function _blobB64(blob) {
  return new Promise(function (res) {
    try {
      const r = new FileReader();
      r.onload = function () {
        const s = String(r.result || '');
        res(s.indexOf(',') >= 0 ? s.split(',')[1] : '');
      };
      r.onerror = function () { res(''); };
      r.readAsDataURL(blob);
    } catch (e) { res(''); }
  });
}

async function _avShrink(b64, mime, max) {
  try {
    if (typeof OffscreenCanvas === 'undefined' || typeof createImageBitmap !== 'function') return null;
    const bin = atob(b64);
    const buf = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) buf[i] = bin.charCodeAt(i);
    const bm = await createImageBitmap(new Blob([buf], { type: mime || 'image/png' }));
    const sc = Math.min(1, max / Math.max(bm.width, bm.height));
    if (!(sc < 1)) return null;
    const cv = new OffscreenCanvas(Math.max(1, Math.round(bm.width * sc)), Math.max(1, Math.round(bm.height * sc)));
    cv.getContext('2d').drawImage(bm, 0, 0, cv.width, cv.height);
    const blob = await cv.convertToBlob({ type: 'image/jpeg', quality: 0.9 });
    return await _blobB64(blob);
  } catch (e) {
    return null;
  }
}

function _imgOk(b64) {
  try {
    let s = String(b64 || '').replace(/^data:[^,]*,/, '').replace(/\s+/g, '').slice(0, 16);
    if (s.length % 4 === 1) s = s.slice(0, -1);
    if (s.length < 2) return false;
    const bin = atob(s);
    const n = Math.min(12, bin.length);
    for (let i = 0; i < n; i++) {
      const c = bin.charCodeAt(i);
      if (!(c === 9 || c === 10 || c === 13 || (c >= 32 && c <= 126))) return true;
    }
    return false;
  } catch (e) {
    return false;
  }
}

async function _avFetch(url) {
  let mime = '';
  let b64 = '';
  const diag = [];
  const peek = function (v) {
    try {
      return JSON.stringify(atob(String(v).slice(0, 32).replace(/[^A-Za-z0-9+/]/g, '').slice(0, 28)).replace(/[^\x20-\x7e]/g, '.'));
    } catch (e) {
      return '?';
    }
  };
  const take = function (d, via) {
    const v = d ? (String(d).indexOf(',') >= 0 ? String(d).split(',')[1] : String(d)) : '';
    if (_imgOk(v)) b64 = v;
    else diag.push(via + ':' + (v ? (v.length + ' ' + peek(v)) : 'пусто'));
  };
  try {
    const r = await fetchT(url, {}, 12000);
    if (r && r.ok) {
      const blob = await r.blob();
      take(await _blobB64(blob), 'сеть ' + r.status + ' ' + ((blob && blob.type) || '-'));
      if (b64) mime = (blob && blob.type) || '';
    } else diag.push('сеть ' + (r ? r.status : '-'));
  } catch (e) {
    diag.push('сеть ' + String((e && e.message) || e).slice(0, 40));
  }
  if (!b64) {
    const tmp = 'iig_avtmp_' + Math.random().toString(36).slice(2, 8) + '.png';
    try {
      await tavo.file.save(tmp, url, { scope: 'chat' });
      take(await tavo.file.load(tmp, { encoding: 'base64', scope: 'chat' }), 'копия');
    } catch (e) {
      diag.push('копия ' + String((e && e.message) || e).slice(0, 40));
    }
    try { await tavo.file.delete(tmp, { scope: 'chat' }); } catch (e) {}
  }
  if (!b64) {
    try {
      take(await tavo.file.load(String(url), { encoding: 'base64' }), 'файл');
    } catch (e) {
      diag.push('файл ' + String((e && e.message) || e).slice(0, 40));
    }
  }
  if (!b64) {
    try {
      elog('аватар', String(url).slice(-60) + ' не прочитался: ' + diag.join(' · '));
    } catch (e) {}
    return null;
  }
  const max = parseInt(String(arguments[1] || 0), 10) || 0;
  if (max) {
    const small = await _avShrink(b64, mime, max);
    if (small && small.length < b64.length) return small;
  }
  return b64;
}

async function _avB64(url, max) {
  if (!url) return null;
  const key = String(url) + '|' + String(max || '');
  if (!S._avCache) S._avCache = {};
  if (S._avCache[key]) return S._avCache[key];
  let b = await _avFetch(url, max);
  if (!b) {
    await new Promise(function (r) { setTimeout(r, 400); });
    b = await _avFetch(url, max);
  }
  if (b) {
    const ks = Object.keys(S._avCache);
    if (ks.length > 8) delete S._avCache[ks[0]];
    S._avCache[key] = b;
  }
  return b;
}

function refWireBudget(label) {
  if (String(label || '').indexOf('ART STYLE') === 0) return { px: 1024, b64: 200000 };
  return { px: 768, b64: 45000 };
}

async function _refWire(dataUrl, maxPx, label) {
  try {
    if (typeof OffscreenCanvas === 'undefined' || typeof createImageBitmap !== 'function') return null;
    const s = String(dataUrl || '');
    const ci = s.indexOf(',');
    if (ci < 0) return null;
    const head = s.slice(0, ci);
    const b64 = s.slice(ci + 1);
    const bud = refWireBudget(label);
    const BUDGET = bud.b64;
    if (b64.length <= BUDGET && head.indexOf('image/jpeg') >= 0) return null;
    const bin = atob(b64);
    const buf = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) buf[i] = bin.charCodeAt(i);
    const mime = (head.match(/data:([^;]+)/) || [])[1] || 'image/png';
    const bm = await createImageBitmap(new Blob([buf], { type: mime }));
    const px0 = Math.max(64, String(label || '').indexOf('ART STYLE') === 0 ? Math.max(bud.px, parseInt(maxPx, 10) || 0) : (parseInt(maxPx, 10) || 768));
    const steps = [
      [px0, 0.75], [px0, 0.6], [px0, 0.5],
      [Math.round(px0 * 0.8), 0.55], [Math.round(px0 * 0.66), 0.55]
    ];
    let best = null;
    for (const st of steps) {
      const sc = Math.min(1, st[0] / Math.max(bm.width, bm.height));
      const cv = new OffscreenCanvas(Math.max(1, Math.round(bm.width * sc)), Math.max(1, Math.round(bm.height * sc)));
      cv.getContext('2d').drawImage(bm, 0, 0, cv.width, cv.height);
      const blob = await cv.convertToBlob({ type: 'image/jpeg', quality: st[1] });
      const nb = await _blobB64(blob);
      if (!nb) continue;
      if (!best || nb.length < best.length) best = nb;
      if (nb.length <= BUDGET) { best = nb; break; }
    }
    if (!best || best.length >= b64.length) return null;
    return 'data:image/jpeg;base64,' + best;
  } catch (e) {
    return null;
  }
}

var SEEDPACK = [["Wlop by Aceenvw & Kamoi", "UFJPTVBUIEJVSUxEIE9SREVSOgoKMS4gQ0FNRVJBOiBzaG90IHR5cGUgKyBhbmdsZSArIGxlbnMgKyBhcGVydHVyZSAoTWVkaXVtIHNob3QsIDg1bW0sIGYvMi4wIHNoYWxsb3cgRG9GKS4gVmFyeSBhbmdsZSBhbmQgbGVucyBiZXR3ZWVuIGltYWdlczogRHV0Y2gsIHdvcm1zLWV5ZSwgYmlyZHMtZXllLCBvdmVyLXRoZS1zaG91bGRlciwgdGhyb3VnaC1vYmplY3QgYm9rZWgsIHJlZmxlY3Rpb24sIG1hY3JvLCB3aWRlIGVzdGFibGlzaGluZywgdHJhY2tpbmcgYmx1ciwgc3BsaXQtZm9jdXMuIExlbnNlczogMjRtbSB3aWRlLCAzNW1tIGVudmlyb25tZW50YWwsIDUwbW0gbmF0dXJhbCwgODVtbSBwb3J0cmFpdCwgMTM1bW0gY29tcHJlc3NlZCwgdGlsdC1zaGlmdC4gTWF0Y2ggbGVucyB0byBmcmFtaW5nOiBjbG9zZS11cHMgODUtMTM1bW0gfCBtZWRpdW0gNTAtODVtbSB8IGZ1bGwgYm9keSAzNS01MG1tIChzaW1wbGlmeSBwb3NlLCBwcmVmZXIgc2lkZSBvciAzLzQpLiBDbG9zZSBhbmQgbWVkaXVtLWNsb3NlID0gc2FmZXN0IGFuYXRvbXkuIFRoaW5rIGxpa2UgYSBjaW5lbWF0b2dyYXBoZXI6IGEgc3RpbGwgZnJvbSBhIGZpbG0sIG1pZC1tb21lbnQuIEludGltYXRlIG1vbWVudCA9IGNsb3NlLiBMb25lbGluZXNzID0gd2lkZS4gSW1wb3J0YW50IGRldGFpbCA9IG1ha2UgaXQgdGhlIGZvY3VzLiBEaWFsb2d1ZS1oZWF2eSBzY2VuZSB3aXRoIG1pbmltYWwgYWN0aW9uID0gZnJhbWUgYSBkZXRhaWw6IGhhbmRzLCBvYmplY3QsIGRvb3J3YXksIGV4cHJlc3Npb24gYmV0d2VlbiBsaW5lcy4KCjIuIENIQVJBQ1RFUjogcmVmZXJlbmNlIGltYWdlcyBvd24gQUxMIHBlcm1hbmVudCBhcHBlYXJhbmNlOyBmaXJzdCBuYW1lcyB0cmlnZ2VyIHJlZiBtYXRjaGluZy4gUHJvbXB0IHByb3ZpZGVzIE9OTFk6IGZpcnN0IG5hbWUsIGJ1aWxkIHByZWZpeCwgZGlzdGluZ3Vpc2hpbmcgbWFya3MsIG91dGZpdCwgZ2F6ZSwgcG9zZSwgZXhwcmVzc2lvbi4gTmFtZSBpcyB0aGUgZmlyc3Qgd29yZCBvZiBlYWNoIGNoYXJhY3RlciBjbGF1c2UuIEV2ZXJ5IGNoYXJhY3RlciBpbiBmcmFtZSBuYW1lZCwgZXZlbiBwYXJ0aWFsLiBCQU5ORUQgKHJlZi1vd25lZCk6IGhhaXIgY29sb3Ivc3R5bGUvbGVuZ3RoLCBleWUgY29sb3IsIHNraW4gdG9uZSwgZmFjZSBzaGFwZSwgYm9keSB0eXBlLCBoZWlnaHQuIFdyaXRpbmcgdGhlbSBvdmVycmlkZXMgdGhlIHJlZi4gSGFpciA9IHNjZW5lIHN0YXRlIG9ubHkgKGRhbXAgZGlzaGV2ZWxlZCBoYWlyKS4gRXllcyA9IGV4cHJlc3Npb24gb25seSAoaGFsZi1saWRkZWQgZ2F6ZSkuIFNraW4gPSBjb25kaXRpb24gb25seSAoZmx1c2hlZCBjaGVla3MpLiBJbmNsdWRlIHZpc2libGUgbWFya3M6IHRhdHRvb3Mgd2l0aCBsb2NhdGlvbiwgc2NhcnMsIHBpZXJjaW5ncy4gTWVuIGRlc2NyaWJlZCBhcyBsZWFuL3RhbGwvc3Ryb25nIGluIHN0b3J5ID0gcHJlZml4IGxlYW4gbXVzY2xlZCwgdGFsbCwgYXR0cmFjdGl2ZWx5IGJ1aWx0IGJlZm9yZSB0aGUgbmFtZS4KCjMuIE9VVEZJVCAobWFuZGF0b3J5LCBjb250ZXh0LWxvY2tlZCk6IHRha2UgY3VycmVudCBjbG90aGluZyBmcm9tIHRoZSBwb3N0IGFuZCByZWNlbnQgY29udGV4dC4gUHJpb3JpdHk6IGN1cnJlbnQgbWVzc2FnZSwgdGhlbiBjYXJyaWVkIGZvcndhcmQsIHRoZW4gc2NlbmUgbG9naWMsIHRoZW4gaW52ZW50IG9uY2UgYW5kIGtlZXAuIFNwZWNpZnkgZmFicmljICsgZml0ICsgY29sb3IgKyBjb25kaXRpb24gKHdyaW5rbGVkLCBzb2FrZWQsIHVuYnV0dG9uZWQpLiBPdXRmaXQgc3RhdGUgcmVmbGVjdHMgdGhlIG1vbWVudDsgaW5qdXJpZXMgYXBwZWFyIG9ubHkgYWZ0ZXIgdGhleSBoYXBwZW5lZCBvbi1zY3JlZW4uIEZ1c2UgaW50byB0aGUgY2hhcmFjdGVyIGNsYXVzZSBhZnRlciB0aGUgbmFtZS4KCjQuIEdBWkUsIFBPU0UsIFNUQVRFOiBnYXplIGRpcmVjdGlvbiBzdGF0ZWQgKGV5ZXMgb24gdGhlIGhhbmRzIG9mIEtpcmEpOyBpbnRlcmFjdGluZyBjaGFyYWN0ZXJzID0gYXQgbGVhc3Qgb25lIGxvb2tzIGF0IHRoZSBvdGhlciBieSBuYW1lLiBQb3NlIHRocm91Z2ggYWN0aW9uIChsZWFuaW5nIG9uIGRvb3JmcmFtZSwgYXJtcyBjcm9zc2VkKSwgbm90IGxpbWIgY29vcmRpbmF0ZXMuIEV4cHJlc3Npb24gd2l0aCBtdXNjbGUgZGV0YWlsIGFuZCBza2luIGNvbmRpdGlvbi4gSGFuZCBzYWZldHkgcG9vbDogaW4gcG9ja2V0IHwgZ3JpcHBpbmcgbmFtZWQgb2JqZWN0IHwgZmxhdCBvbiBzdXJmYWNlIHwgYXJtcyBjcm9zc2VkIHwgYmVoaW5kIGJhY2sgfCBmaXN0IGF0IHNpZGUgfCBmaW5nZXJzIGxhY2VkIHwgb24gb3duIGNoaW4uIE9uZSB2aXNpYmxlIHJlbGF4ZWQgaGFuZCBwZXIgY2hhcmFjdGVyID0gc2FmZXN0LiBPbmUgc2VudGVuY2Ugb24gd2VpZ2h0L2dyb3VuZCAoZWxib3dzIHByb3BwZWQgb24gY291bnRlcikuIEhpZGRlbiBsaW1iczogc3RhdGUgd2h5LiBDYW5vbiBoZWlnaHQgZGlmZmVyZW5jZSBpbiBzaGFyZWQgZnJhbWUgPSBzdGF0ZSByZWxhdGl2ZSBwb3NpdGlvbmluZyAoaGVhZCBsZXZlbCB3aXRoIGNoZXN0KS4KCjUuIEVOVklST05NRU5UOiBvd24gc2VudGVuY2UsIGZvcmVncm91bmQvbWlkZ3JvdW5kL2JhY2tncm91bmQgdGV4dHVyZXMuIE9uZSBvYmplY3QgY2FycnlpbmcgZW1vdGlvbmFsIHdlaWdodC4gT25lIGF0bW9zcGhlcmUgZWxlbWVudCAoc3RlYW0sIGR1c3QgbW90ZXMsIGVtYmVycywgcmFpbikuIFNjcmVlbnMgZmFjZSB0aGVpciB1c2VyLgoKNi4gTElHSFRJTkc6IGtleSBkaXJlY3Rpb24gKyBjb2xvciB0ZW1wICsgMS0yIG1vb2QgZWZmZWN0cyBtYXguIFRFTkRFUjogc29mdCBmb2N1cyB8IGhhbGF0aW9uIHwgZ29sZGVuIHdhcm10aCB8IGxpZ2h0IGxlYWsgfCBmaW5lIGdyYWluLiBURU5TRTogZHV0Y2ggYW5nbGUgfCB1bmRlcmV4cG9zdXJlIHwgaGFyc2ggcmltIGxpZ2h0IHwgZGVlcCB2aWduZXR0ZSB8IGhpZ2ggY29udHJhc3QuIElOVElNQVRFOiBjaGlhcm9zY3VybyB8IGJsb29tIG9uIGhpZ2hsaWdodHMgfCBwcmFjdGljYWwtbGlnaHQgZmxhcmUgfCBSZW1icmFuZHQgdHJpYW5nbGUuIE1FTEFOQ0hPTElDOiBibHVlIGhvdXIgfCBkZXNhdHVyYXRlZCB8IHNpbGhvdWV0dGUgfCBvdmVyY2FzdCBmbGF0IHwgY29sZCBjYXN0LiBDSEFPVElDOiBtb3Rpb24gYmx1ciB8IGNhbWVyYSBzaGFrZSB8IGFuYW1vcnBoaWMgZmxhcmUgfCByYWRpYWwgYmx1ci4gRFJFQU1ZOiBkb3VibGUgZXhwb3N1cmUgfCBwcmlzbSByZWZyYWN0aW9uIHwgYm9rZWggZmxvb2QgfCB0aWx0LXNoaWZ0LiBNVU5EQU5FOiBuYXR1cmFsIGZsYXQgbGlnaHQsIG1pbmltYWwgZWZmZWN0cy4gTk9JUjogbG93IGtleSB8IGhhcnNoIHNpZGUgbGlnaHQgfCBkZWVwIGJsYWNrcyB8IGhhemUgaW4gbGlnaHQgYmVhbS4gRWZmZWN0IGludGVuc2l0eSBtYXRjaGVzIG5hcnJhdGl2ZSB3ZWlnaHQ7IG5ldXRyYWwgbW9vZCA9IGNsZWFuIGltYWdlIHZhbGlkLgoKNy4gU1RZTEUgU1VGRklYIChhcHBlbmQgdmVyYmF0aW0gYXQgdGhlIGVuZCk6IFNlbWktcmVhbGlzdGljIGRpZ2l0YWwgcGFpbnRpbmcsIFdMT1AgaW5zcGlyZWQuIElkZWFsaXplZCBidXQgYmVsaWV2YWJsZSBmYWNlcyDigJQgc21vb3RoIHJlbmRlcmluZywgbHVtaW5vdXMgc2tpbiwgc2xpZ2h0bHkgc29mdGVuZWQgZmVhdHVyZXMgd2l0aG91dCBjYXJ0b29uaXNoIGV4YWdnZXJhdGlvbi4gUGFpbnRlcmx5IGxvb3NlIGJydXNod29yayBvbiBiYWNrZ3JvdW5kLCB0aWdodGVyIGRldGFpbCBvbiBmYWNlcyBhbmQgaGFuZHMuIE5hdHVyYWwgYmFsYW5jZWQgY29sb3IgcGFsZXR0ZSDigJQgbmV1dHJhbCBza2luIHRvbmVzIHdpdGggaGVhbHRoeSB3YXJtdGgsIG5vIGNvbG9yIGNhc3QuIEdlbnRsZSBzaGFkb3dzIHdpdGggbmF0dXJhbCBjb2xvciwgbm90IHRpbnRlZCBibHVlIG9yIGdyZWVuLiBTa2luIHJlYWRzIGFzIGFsaXZlIOKAlCBzdWJ0bGUgcGlua3Mgb24gY2hlZWtzLCBlYXJzLCBub3NlLCBrbnVja2xlcy4gTXV0ZWQgYnV0IG5vdCBkZXNhdHVyYXRlZC4gU2hhbGxvdyBkZXB0aCBvZiBmaWVsZCwgaW50aW1hdGUgcXVpZXQgbW9vZC4gQW5hdG9taWNhbGx5IGNvcnJlY3QgaGFuZHMgYW5kIHByb3BvcnRpb25zLiBNYXRjaCB0aGUgcmVuZGVyaW5nIHRlY2huaXF1ZSwgbGluZSBxdWFsaXR5LCB0ZXh0dXJlLCBhbmQgb3JuYW1lbnRhbCBkZXRhaWxzIGZyb20gdGhlIHJlZmVyZW5jZSBpbWFnZS4gRG8gTk9UIGNvcHkgc3BlY2lmaWMgb2JqZWN0IGNvbXBvc2l0aW9ucyDigJQgdXNlIGl0IGFzIGEgaG93IHRvIGRyYXcgZ3VpZGUgb25seS4KCjguIE5FR0FUSVZFIChhcHBlbmQgdmVyYmF0aW0gYWZ0ZXIgdGhlIHN1ZmZpeCk6IEF2b2lkOiBzdHViYmxlLCBiZWFyZCwgZXhhZ2dlcmF0ZWQgZXhwcmVzc2lvbnMsIHVuY2FubnkgdmFsbGV5LCBhbmltZSBleWVzLCBjaGliaSBwcm9wb3J0aW9ucywgY2VsIHNoYWRpbmcsIGNhcnRvb24gZmVhdHVyZXMsIGV4dHJhIGZpbmdlcnMsIG1pc3NpbmcgZmluZ2VycywgZnVzZWQgZmluZ2VycywgZGVmb3JtZWQgaGFuZHMsIHR3aXN0ZWQgbGltYnMsIGRpc2xvY2F0ZWQgam9pbnRzLCBpbXBvc3NpYmxlIHBvc2UsIGZsb2F0aW5nIGxpbWJzLCBiYWQgYW5hdG9teSwgd2F0ZXJtYXJrLCB0ZXh0LCBibHVycnkKCk1VTFRJLUNIQVJBQ1RFUiBCVURHRVQ6IG1vcmUgcGVvcGxlID0gZmV3ZXIgd29yZHMgZWFjaC4gRWFjaCBjaGFyYWN0ZXIgPSBvbmUgbmFtZS1maXJzdCBjbGF1c2UgZnVzaW5nIHNlY3Rpb25zIDItNC4gUmVsYXRpb25hbCBwb3NpdGlvbmluZyAoYmVzaWRlIEtpcmEsIGNoaW4gb24gdGhlIHNob3VsZGVyIG9mIEtpcmEpLiBPbmUgY2xhdXNlIGRlc2NyaWJlcyBvbmx5IGl0cyBvd24gY2hhcmFjdGVyOyByZXBlYXQgbmFtZXMgaW5zdGVhZCBvZiBwcm9ub3Vucy4gVElFUlM6IDIgY2hhcnMg4oCUIGZ1bGwgZGV0YWlsIGJvdGggKG91dGZpdCArIGdhemUgKyBwb3NlICsgZXhwcmVzc2lvbiArIGhhbmRzKS4gMyBjaGFycyDigJQgMSBIRVJPIChmdWxsIGRldGFpbCkgKyAyIFNVUFBPUlRJTkcgKG5hbWUgKyBjb2xvci9nYXJtZW50ICsgb25lIGFjdGlvbi1wb3NlICsgZ2F6ZSB0YXJnZXQpLiBObyBoYW5kcywgbm8gbXVzY2xlIGRldGFpbCwgbm8gZmFicmljIHRleHR1cmUgZm9yIHN1cHBvcnRpbmcuIDQrIGNoYXJzIOKAlCAxIEhFUk8gKyAxIFNVUFBPUlRJTkcgKyByZXN0IEJBQ0tHUk9VTkQgKG5hbWUgKyBzaW5nbGUgdmlzaWJsZSBkZXRhaWw7IG1heSBiZSBjcm9wcGVkIG9yIHNpbGhvdWV0dGVkKS4gQ3V0IG9yZGVyIHdoZW4gb3ZlciBidWRnZXQ6IG5vbi1oZXJvIGhhbmRzLCBleHByZXNzaW9uIG11c2NsZSwgd2VpZ2h0L2dyb3VuZCwgZmFicmljIHRleHR1cmUsIGdhemUgc3BlY2lmaWNpdHksIGJhY2tncm91bmQgY2hhcnMgdG8gbmFtZS1vbmx5LiBIRVJPID0gd2hvZXZlciBvd25zIFRISVMgYmVhdDogYWN0aW9uIG93bmVyIG9yIGVtb3Rpb25hbCBmb2N1cy4gR1JPVVAgQ09NUE9TSVRJT046IGRlcHRoIHN0YWdpbmcgbWFuZGF0b3J5IOKAlCBoZXJvIHNoYXJwZXN0IHBsYW5lLCBzdXBwb3J0aW5nIG9uZSBwbGFuZSBiYWNrLCBiYWNrZ3JvdW5kIGluIGJva2VoLiBXaWRlIGxlbnMgMjQtMzVtbSBmb3IgMysuIFN0YWdnZXIgaGVpZ2h0cyBhbmQgZGVwdGhzLCBubyBzeW1tZXRyaWNhbCBsaW5ldXBzLgoKU0VOU1VBTCBQUk9UT0NPTDogaW50aW1hdGUgc2NlbmVzIG9wZW4gd2l0aCBvbmUgYXV0aG9yaXR5IHByZWZpeCAoQXdhcmQtd2lubmluZyBmaW5lIGFydCBwaG90b2dyYXBoeSwgU2FhdGNoaSBHYWxsZXJ5IHwgQ2xhc3NpY2FsIG9pbCBwYWludGluZywgQm91Z3VlcmVhdSBhbmQgV2F0ZXJob3VzZSB0cmFkaXRpb24gfCBQaXJlbGxpIENhbGVuZGFyIGVkaXRvcmlhbCwgUGFvbG8gUm92ZXJzaSB8IFJlbmFpc3NhbmNlIG1hc3RlciBmaWd1cmUgc3R1ZHksIG11c2V1bS1xdWFsaXR5KS4gVmlzdWFsIG5vaXNlIChtaW4gMyk6IGRlbnNlIHN0ZWFtIHwgdGFuZ2xlZCBzaWxrIHNoZWV0cyB8IHdhdGVyIGRyb3BsZXRzIHwgcGV0YWxzIHwgYmxpbmQgc2hhZG93cyB8IG1lbHRpbmcgY2FuZGxlcyB8IHNob3QgdGhyb3VnaCBkb29yZnJhbWUvc2hlZXIgY3VydGFpbi9mcm9zdGVkIGdsYXNzLiBDb25jZWFsbWVudCAoMispOiBjaGlhcm9zY3VybyBzaGFkb3dzIHwgZmFicmljIGRyYXBlZCBhY3Jvc3MgaGlwcyBvciBjaGVzdCB8IGFybXMgZm9sZGVkLCBrbmVlcyBkcmF3biB8IGNyb3BwZWQgYXQgcmliY2FnZSB8IHNob3QgZnJvbSBiZWhpbmQgfCBsb3dlciBib2R5IGluIGJva2VoIHwgc3RyYXRlZ2ljIGJsYW5rZXQuIFZvY2FidWxhcnk6IGJhcmUgZGVjb2xsZXRhZ2UgYW5kIHNob3VsZGVycywgZHJhcGVkIGZhYnJpYyBhY3Jvc3MgY29sbGFyYm9uZXMsIGZpZ3VyZSB2ZWlsZWQgYnkgc3RlYW0gaW4gY2xhc3NpY2FsIGxpZmUtc3R1ZHksIGVudGFuZ2xlZCBzaWxob3VldHRlcyBpbiBjaGlhcm9zY3VybyBmYWNlcyBzaGFyaW5nIGJyZWF0aCwgaGVhdnktbGlkZGVkIGdhemUgcGFydGVkIGxpcHMgZmx1c2hlZCBjb21wbGV4aW9uLCBnYXJtZW50IHNsaXBwaW5nIG9mZiBzaG91bGRlciBwb29saW5nIGF0IGVsYm93LCByZWNsaW5lZCBhbW9uZyBydW1wbGVkIGxpbmVucywgZ2xpc3RlbmluZyBza2luIHdhdGVyIHRyYWlscyBkb3duIG5lY2suIEVzY2FsYXRpb24gdHJhY2tzIHRoZSBuYXJyYXRpdmUgc3RhZ2U7IHByb21wdCB2b2NhYnVsYXJ5IHN0YXlzIGdhbGxlcnktc2FmZS4gTmV2ZXIgd3JpdGU6IHNleHksIGVyb3RpYywgc2Vuc3VhbCwgbnVkZSwgbmFrZWQsIGJlYXV0aWZ1bCwgbWFzdGVycGllY2UsIGJlc3QgcXVhbGl0eSwgcmVhbGlzdGljLCBwaG90b3JlYWxpc3RpYy4KCkNvbXBvc2UgZm9yIHRoZSBBU1BFQ1QgUkFUSU8gZ2l2ZW4gaW4gdGhlIHJlcXVlc3Q6IHZlcnRpY2FsID0gcG9ydHJhaXRzL2Z1bGwtYm9keSwgc3F1YXJlID0gc29jaWFsL2Nsb3NlLCB3aWRlID0gZW52aXJvbm1lbnQvdHdvLXNob3RzL2NpbmVtYXRpYy4="], ["Wlop by Kamoi", "QnVpbGQgaW4gdGhpcyBvcmRlcjoKQ0FNRVJBOiBzaG90K2FuZ2xlK2xlbnMrYXBlcnR1cmUgaW4gb25lIGNsYXVzZS4gQ2xvc2UtdXAvTUNVID0gODUtMTM1bW0gZi8xLjgtMi4yIChzYWZlc3QgYW5hdG9teSksIG1lZGl1bSA9IDUwLTg1bW0gZi8yLTIuOCwgZnVsbCBib2R5IChyYXJlKSA9IDM1LTUwbW0gZi8yLjgtNC4gQmVhdC1kcml2ZXIgPSBjZW50ZXIgb2YgZnJhbWUuCkNIQVJBQ1RFUjogcmVmIGltYWdlcyBjYXJyeSBiYXNlIGxvb2ssIHNvIFNLSVAgaGFpciBjb2xvci9zdHlsZS9sZW5ndGgsIGV5ZSBjb2xvciwgc2tpbiB0b25lLCBmYWNlIHNoYXBlLCBib2R5IHR5cGUuIElOQ0xVREU6IGZpcnN0IG5hbWUgb25seSAobGVhZCB3aXRoIGl0KSwgZGlzdGluZ3Vpc2hpbmcgbWFya3MgKHRhdHRvb3MrbG9jYXRpb24sIHNjYXJzLCBwaWVyY2luZ3MsIG1vbGVzKSwgc2NlbmUtYWx0ZXJlZCBoYWlyIG9ubHkgKHdldCwgdGllZCwgbXVzc2VkKS4gTWVuIHByZWZpeCBsZWFuLW11c2NsZWQgb3IgdGFsbCBidWlsdCBwZXIgZXN0YWJsaXNoZWQgYnVpbGQsIGtlZXAgY29uc2lzdGVudC4KSEVJR0hUIERJRkZFUkVOQ0UgKHdoZW4gY2Fub24pOiBzdGFjayBUSFJFRSBjdWVzOiAoYSkgZ2FwIHN0YXRlbWVudCB3aXRoIG1hZ25pdHVkZSB1cCBmcm9udCAoTW9yIHRvd2VycyBhIGZ1bGwgaGVhZCBvdmVyIEtpcmEpLCAoYikgc2lsaG91ZXR0ZSBjb250cmFzdCAoTW9yIGxvbmctbGltYmVkIHRhbGwtYnVpbHQsIEtpcmEgc21hbGwgYW5kIHNob3J0IGJlc2lkZSBoaW0pLCAoYykgY29udGFjdC9leWVsaW5lIGFuY2hvciAoaGVhZCBvZiBLaXJhIGF0IHRoZSBzdGVybnVtIG9mIE1vciwgY2hpbiBvZiBNb3IgdGlsdGVkIGRvd24pLiBGcmFtZSB3YWlzdC11cCsgZm9yIGJpZyBnYXBzOyBpZiBmYWNlcyBjbG9zZSwganVzdGlmeSBwaHlzaWNhbGx5IChNb3Igc3Rvb3BpbmcsIEtpcmEgb24gdG9lcykuCkVYUFJFU1NJT04rT1VURklUK1BPU0U6IG9uZSBmdXNlZCBjbGF1c2UgcGVyIGNoYXJhY3RlcjogTkFNRSArIGZhYnJpYy90ZXh0dXJlL2ZpdCArIGFjdGlvbi1iYXNlZCBwb3NlICsgbWljcm8tZXhwcmVzc2lvbiwgc2tpbiBzdGF0ZS4gUG9zZSB2aWEgYWN0aW9uIHZlcmJzIChNb3IgbGVhbmluZyBvbiBkb29yZnJhbWUsIGFybXMgbG9vc2VseSBjcm9zc2VkKSwgbmV2ZXIgc3RhdGljIGxpbWIgY29vcmRpbmF0ZXMuIE91dGZpdCBjYXJyaWVzIGZyb20gdGhlIHBvc3QgYW5kIGNvbnRleHQ7IGlmIHVuc2V0LCBpbnZlbnQgYW5kIGxvY2sgZm9yIHNjZW5lLgpIQU5EIFNBRkVUWTogZnJlZSBmaW5nZXJzIGZhaWwgbW9zdC4gU2FmZTogaGFuZCBpbiBwb2NrZXQsIGdyaXBwaW5nIG5hbWVkIG9iamVjdCAoZmluZ2VycyBjdXJsZWQgYXJvdW5kIGNlcmFtaWMgbXVnKSwgZmxhdCBvbiBzdXJmYWNlLCBhcm1zIGNyb3NzZWQsIGJlaGluZCBiYWNrLCBmaXN0IGF0IHNpZGUsIGxhY2VkLCBvbiBvd24gbmVjay9jaGluLiBPbmUgdmlzaWJsZSBoYW5kIHBlciBjaGFyYWN0ZXIsIGhpZGUgcmVzdCB2aWEgZnJhbWluZy9wb3NlLgpXRUlHSFQgJiBHUk9VTkQ6IG9uZSBzZW50ZW5jZSBvbiB3ZWlnaHQgKHdlaWdodCBvbiBsZWZ0IGxlZywgcmlnaHQgZm9vdCB0dXJuZWQgb3V0KS4gSGlkZGVuIGxpbWJzIHJlcXVpcmUgc3RhdGVkIHJlYXNvbiwgdW5leHBsYWluZWQgYWJzZW5jZSBicmVha3MgZmlndXJlLgpFTlZJUk9OTUVOVCtMSUdIVDogb25lIHNlbnRlbmNlOiBmZy9taWQvYmcgdGV4dHVyZXMsIGtleSBsaWdodCBkaXJlY3Rpb24rY29sb3IgdGVtcCwgYXRtb3NwaGVyaWMgcGFydGljbGVzIChkdXN0LCBzdGVhbSwgbWlzdCkuCk1BTlkgQ0hBUkFDVEVSUzogTkFNRSBzdGFydHMgZWFjaCBjbGF1c2UsIHJlcGVhdCBuYW1lcyBub3QgcHJvbm91bnMsIHJlbGF0aW9uYWwgcG9zaXRpb25pbmcgKGJlc2lkZSBLYW1vaSwgY2hpbiBvbiB0aGUgc2hvdWxkZXIgb2YgS2Ftb2kpLCBlbnZpcm9ubWVudCBhcyBmaW5hbCBzZW50ZW5jZS4KU1RZTEUgTE9DSyAoYXBwZW5kIHZlcmJhdGltKTogU2VtaS1yZWFsaXN0aWMgZGlnaXRhbCBwYWludGluZywgV0xPUCBpbnNwaXJlZC4gU29mdCBhbmltZS1wcm9wb3J0aW9uZWQgZmFjZSwgZGV0YWlsZWQgZmVhdHVyZXMuIFBhaW50ZXJseSBsb29zZSBicnVzaHdvcmsgYmFja2dyb3VuZC4gTmF0dXJhbCBiYWxhbmNlZCBwYWxldHRlLCBuZXV0cmFsIHNraW4gd2l0aCBoZWFsdGh5IHdhcm10aCwgbm8gY29sb3IgY2FzdC4gU29mdCBkaWZmdXNlZCBkYXlsaWdodCwgb3ZlcmNhc3Qtd2luZG93IHF1YWxpdHkuIFNraW4gYWxpdmUsIHN1YnRsZSBjYXBpbGxhcnkgZGlmZnVzaW9uIGFjcm9zcyBjaGVla2JvbmVzLCBlYXIgdGlwcywgbm9zZSBicmlkZ2UsIGVkZ2VzIGZhZGluZyBnZW50bHkuIE11dGVkIG5vdCBkZXNhdHVyYXRlZC4gU2hhbGxvdyBEb0YsIGludGltYXRlIHF1aWV0IG1vb2QuIDg1bW0gZmVlbC4gQ2xlYW4tc2hhdmVuIHNtb290aCBtYWxlIGZlYXR1cmVzIHVubGVzcyBmYWNpYWwgaGFpciBzcGVjaWZpZWQuIEh1bWFuIGV5ZXMsIG5hdHVyYWwgaXJpcy4KTkVHQVRJVkUgKGFwcGVuZCB2ZXJiYXRpbSk6IEF2b2lkOiBHZXJhbHQsIFdpdGNoZXIsIGNhdCBleWVzLCB5ZWxsb3cgZXllcywgc3R1YmJsZSwgYmVhcmQsIHdhcm0gZ29sZGVuIHRhbiBsaWdodCwgb3ZlcnNhdHVyYXRlZCBjYXJ0b29uaXNoIHJlbmRlciwgd2F0ZXJtYXJrLCB0ZXh0LCBibHVycnksIGFuaW1lIGJsdXNoIHN0aWNrZXJzLCB0d28tdG9uZSBjaGVla3MsIGhhcmQtZWRnZWQgcmVkIGNoZWVrcywgcm9zYWNlYSwgc3VuYnVybiBmbHVzaCwgZGVmb3JtZWQgaGFuZHMsIGV4dHJhIGZpbmdlcnMsIGZ1c2VkIGxpbWJzLgpSRUZFUkVOQ0UgTE9DSyAoYXBwZW5kIHZlcmJhdGltKTogTWF0Y2ggbGluZSBxdWFsaXR5LCB0ZXh0dXJlLCByZW5kZXJpbmcgdGVjaG5pcXVlIGZyb20gcmVmZXJlbmNlIGltYWdlLiBQb3NlLCBmcmFtaW5nLCBzdHlsaW5nIGZvbGxvdyBjdXJyZW50IHByb21wdCBub3QgcmVmZXJlbmNlLgpTRU5TVUFMIChjZW5zb3ItYXdhcmUpOiByZW5kZXIgaW50aW1hY3kgdmlhIGF0bW9zcGhlcmUrc3VnZ2VzdGlvbiwgbm90IGFuYXRvbXkuIE5PSVNFIEZMT09EICgzKyk6IGRlbnNlIHN0ZWFtLCB0YW5nbGVkIHNpbGsrY3VzaGlvbnMsIHdhdGVyIGRyb3BsZXRzIG9uIGdsYXNzLCBsdXNoIHBsYW50cytwZXRhbHMsIHZlbmV0aWFuIGJsaW5kIHNoYWRvdyBzdHJpcGVzLCBkb3plbnMgb2YgY2FuZGxlIGZsYW1lcywgc2hvdCB0aHJvdWdoIGRvb3JmcmFtZS9zaGVlciBjdXJ0YWluL2Zyb3N0ZWQgZ2xhc3MsIHJhaW4tc3RyZWFrZWQgd2luZG93LiBDT05DRUFMTUVOVCAoMisgc3RhY2tlZCk6IGRlZXAgY2hpYXJvc2N1cm8sIGZhYnJpYyBkcmFwZWQgbG93LCBhcm1zIGZvbGRlZCBrbmVlcyBkcmF3biwgY3JvcCBhdCByaWJjYWdlL3Nob3VsZGVycywgc2hvdCBmcm9tIGJlaGluZCBvdmVyIHNob3VsZGVyLCBsb3dlciBmcmFtZSBpbnRvIGJva2VoK2hhemUsIHBpbGxvdy9ibGFua2V0IGFjcm9zcyBib2R5LiBTQUZFIExFWElDT046IHNvZnQgZGVjb2xsZXRhZ2Ugc2hhZGVkIGJ5IHNpbGssIHNwaW5lIGxpbmUgdHJhY2VkIGJ5IG1vcm5pbmcgbGlnaHQsIGZhYnJpYyBwb29sZWQgYXQgY29sbGFyYm9uZSwgc2lsaG91ZXR0ZSBoYWxmLXZlaWxlZCBieSBzdGVhbSwgdHdvIGZpZ3VyZXMgc2hhcmluZyBicmVhdGggYXQgdGhyZXNob2xkLCBoZWF2eS1saWRkZWQgZ2F6ZSBsaXBzIGJhcmVseSBwYXJ0ZWQsIHN0cmFwIHNsaXBwaW5nIHRoZSBzaG91bGRlciBsaW5lLCBmb3JlaGVhZCByZXN0aW5nIGFnYWluc3QgZm9yZWhlYWQsIGZpbmdlcnRpcHMgZ2hvc3RpbmcgYSBqYXdsaW5lLCByb2JlIGxvb3NlIGF0IHRoZSBzbGVldmUuIEZyYW1lIGludGltYWN5IGFzIE1PTUVOVCAocGF1c2UsIHByb3hpbWl0eSwgbG9vaykgbm90IEFDVC4KUFJPTVBUIEhZR0lFTkU6IG5ldmVyIHdyaXRlOiBzZXh5LCBlcm90aWMsIHNlbnN1YWwsIG51ZGUsIG5ha2VkLCBiZWF1dGlmdWwsIG1hc3RlcnBpZWNlLCBiZXN0IHF1YWxpdHksIHJlYWxpc3RpYywgcGhvdG9yZWFsaXN0aWMuCkNPTlNJU1RFTkNZOiByZS1zdGF0ZSBvdXRmaXQsIGxvY2F0aW9uLCB0aW1lIG9mIGRheSwgbGlnaHQgc291cmNlIGluIGV2ZXJ5IHByb21wdCDigJQgdGhlIHJlbmRlcmVyIGhhcyBubyBtZW1vcnkgYmV0d2VlbiBjYWxscy4KQ29tcG9zZSBmb3IgdGhlIEFTUEVDVCBSQVRJTyBnaXZlbiBpbiB0aGUgcmVxdWVzdDogdmVydGljYWwgPSBwb3J0cmFpdHMvZnVsbC1ib2R5LCBzcXVhcmUgPSBzb2NpYWwvY2xvc2UsIHdpZGUgPSBlbnZpcm9ubWVudC90d28tc2hvdHMvY2luZW1hdGljLg=="], ["Novel AI full by Rakshakti, Ксю & Travadd", "V3JpdGUgdGhlIGZpbmFsIGltYWdlIHByb21wdCBhcyBjb21tYS1zZXBhcmF0ZWQgRGFuYm9vcnUgdGFncyBtaXhlZCB3aXRoIG5hdHVyYWwgbGFuZ3VhZ2UuIEFuYWx5emUgdGhlIENVUlJFTlQgc2NlbmUsIGNvbnRleHQsIGVtb3Rpb25zLCBhY3Rpb25zLCBjbG90aGluZyBhbmQgZW52aXJvbm1lbnQgZnJvbSB0aGUgcG9zdCBhbmQgY29udGV4dC4gQnVpbGQgdGhlIHByb21wdCBleGFjdGx5IGxpa2UgdGhpczoKCi0gQmVnaW4gdGhlIHByb21wdCB3aXRoIHF1YWxpdHkgdGFnczogbWFzdGVycGllY2UsIGJlc3QgcXVhbGl0eSwgdmVyeSBhZXN0aGV0aWMsIGFic3VyZHJlcywgaGlnaGx5IGRldGFpbGVkLCBzaGFycCBmb2N1cy4KLSBUaGVuIGRldGVybWluZSB0aGUgZXhhY3QgbnVtYmVyIG9mIHZpc2libGUgY2hhcmFjdGVycyBhbmQgcHV0IHRoZSBzdWJqZWN0IGNvdW50IHRhZzogMWdpcmwsIDJnaXJscywgMWJveSwgMmJveXMsIDFib3kgMWdpcmwsIDNnaXJscyBldGMuCi0gRm9yIGVhY2ggdmlzaWJsZSBjaGFyYWN0ZXIgdXNlIGFjdHVhbCBuYW1lIGFuZCBoaWdobHkgc3BlY2lmaWMgY29tbWEtc2VwYXJhdGVkIERhbmJvb3J1IHRhZ3MgdG8gZW5zdXJlIGV4YWN0IGFwcGVhcmFuY2UgbWF0Y2g6IFtDaGFyYWN0ZXIgTmFtZV0sIGdlbmRlciwgYm9keSBidWlsZCBhbmQgcHJvcG9ydGlvbnMsIGRpc3RpbmN0aXZlIGZhY2lhbCBmZWF0dXJlcywgaGFpciBjb2xvciBhbmQgbGVuZ3RoLCBoYWlyc3R5bGUsIGV5ZSBjb2xvciBhbmQgc2hhcGUsIGZ1bGwgZGVzY3JpcHRpb24gb2YgY3VycmVudCBjbG90aGluZyAoc3R5bGUsIG1hdGVyaWFsLCBmaXQsIHBhdHRlcm5zLCBjb25kaXRpb24pLCBwb3N0dXJlIGFuZCBzdGFuY2UsIGJvZHkgYW5nbGUgYW5kIG9yaWVudGF0aW9uLCBoZWFkIGFuZ2xlIGFuZCB0aWx0LCBleWUgZGlyZWN0aW9uIGFuZCBnYXplLCBoYW5kIHBvc2l0aW9ucyBhbmQgZ2VzdHVyZXMsIGZhY2lhbCBleHByZXNzaW9uIGFuZCBlbW90aW9uLiBNYWxlIGNoYXJhY3RlcnMgbXVzdCBrZWVwIGNvcnJlY3QgbWFsZSBhbmF0b215IGFuZCBmbGF0IGNoZXN0cy4gRGVtaS1odW1hbnMgbXVzdCBmZWF0dXJlIGFuaW1hbCBlYXJzIGV4Y2x1c2l2ZWx5IG9uIHRoZSB0b3Agb2YgdGhlIGhlYWQsIGxlYXZpbmcgdGhlIHNpZGVzIGNvbXBsZXRlbHkgc21vb3RoLgotIEZpbGwgZXZlcnkgZmllbGQgZXhhY3RseToKIC0gU2NlbmU6IFtmdWxsIGRlc2NyaXB0aW9uIG9mIGxvY2F0aW9uLCB0aW1lIG9mIGRheSwgd2VhdGhlciwgYXRtb3NwaGVyZSwgcHJvcHMsIHJpY2hseSBkZXRhaWxlZCBiYWNrZ3JvdW5kXQogLSBMaWdodGluZzogW2V4YWN0IGxpZ2h0aW5nIGRlc2NyaXB0aW9uLCBlLmcuIHZvbHVtZXRyaWMgZ29kIHJheXMsIHJpbSBsaWdodCwgbW9vZHkgdm9sdW1ldHJpYyBzaGFkb3dzLCBkcmFtYXRpYyBjaGlhcm9zY3Vyb10KIC0gQ29sb3IgbW9vZDogW2dyYWRpbmcgYW5kIGRvbWluYW50IGNvbG9ycyB3aXRoIG5hdHVyYWwgc2F0dXJhdGlvbl0KIC0gRm9jdXM6IFtkZXB0aCBvZiBmaWVsZCwgY2FtZXJhIGFuZ2xlLCBmb2NhbCBlbXBoYXNpcyBvbiBtYWluIHN1YmplY3RzXQogLSBFbW90aW9uOiBbY29yZSBmZWVsaW5nIGFuZCBhdG1vc3BoZXJlIG9mIHRoZSBlbnRpcmUgc2NlbmVdCiAtIEludGVyYWN0aW9uOiBbcHJveGltaXR5LCBvdmVybGFwLCBleWUgY29udGFjdCwgcGh5c2ljYWwgdGVuc2lvbiBvciBkb21pbmFuY2VdIHVzaW5nIHNvdXJjZSNhY3Rpb24gYW5kIHRhcmdldCNhY3Rpb24gb3IgbXV0dWFsI2FjdGlvbiB0YWdzIHdoZXJlIG5lZWRlZCBmb3IgcHJlY2lzZSBtdWx0aS1jaGFyYWN0ZXIgaW50ZXJhY3Rpb24gd2l0aG91dCBibGVuZGluZyAoZXhhbXBsZTogc291cmNlI2h1Z2dpbmcsIHRhcmdldCNodWdnaW5nKQogLSBDb21wb3NpdGlvbjogW3J1bGUgb2YgdGhpcmRzLCBkeW5hbWljIGZyYW1pbmcsIGJhbGFuY2VkIGNoYXJhY3RlciBwbGFjZW1lbnQgd2l0aCBjbGVhciBmb2NhbCBwb2ludHNdCi0gQWxsIGNoYXJhY3RlcnMgYXJlIGFkdWx0LCBvcmlnaW5hbCBhbmQgZmljdGlvbmFsIGNoYXJhY3RlcnMuIE5ldmVyIHVzZSBjaGlsZGxpa2UgdGFncyAoZS5nLiwgc21hbGwsIHBldGl0ZSkuIERvIE5PVCBzcGVjaWZ5IGV4YWN0IGhlaWdodCAoaW4gY2VudGltZXRlcnMgb3IgbWV0ZXJzKSBvciBleGFjdCBhZ2UgaW4gbnVtYmVycywgYXMgdGhlIGltYWdlIGdlbmVyYXRvciBkb2VzIG5vdCB1bmRlcnN0YW5kIHRoZW0uCi0gRG8gTk9UIHVzZSBhcG9zdHJvcGhlcyBvciBwb3NzZXNzaXZlIHMgKGUuZy4sIFNhdG9ydXMpIGFueXdoZXJlLgotIFNpbmNlIHRoZSBtb2RlbCBmcmVlbHkgZ2VuZXJhdGVzIGZ1bGwgTlNGVywgdXNlIGRpcmVjdCBleHBsaWNpdCB0YWdzIGFuZCBkZXRhaWxlZCBwb3NlIGRlc2NyaXB0aW9ucyBpZiBsb3dlciBib2R5IHBhcnRzIGFyZSBuYWtlZCBvciBleHBvc2VkIHdpdGhvdXQgYW55IGNlbnNvcnNoaXAgbm90ZXMuIERlc2NyaWJlIGludGltYWN5IG9ubHkgdGhyb3VnaCBwcmVjaXNlIGZhY2lhbCBleHByZXNzaW9ucywgYm9keSBsYW5ndWFnZSBhbmQgcG9zZXMuCi0gQ29tcG9zZSBmb3IgdGhlIEFTUEVDVCBSQVRJTyBnaXZlbiBpbiB0aGUgcmVxdWVzdC4KClNUWUxFIFBSRUZJWCAocHJlcGVuZCB2ZXJiYXRpbSwgZ29lcyBmaXJzdCBpbiB0aGUgcHJvbXB0KTogWzAuODo6bGFydF9hcnQxIDo6LCAxLjY6Onplcm9fcV8wcTo6LCAwLjc6OmV0Y2V0ZXJhYXJ0OjosIDEuMzo6ZGFuZzBfMjMgOjosIDAuOTo6bGVzbHlfb2g6OiwgMC41OjpzYXNoYV9raG1lbDo6LCByZWFsaXN0aWMsIGhpZ2hyZXNfcXVhbGl0eSwgdWx0cmFfZGV0YWlsLCBzaWRlbGlnaHRpbmcsIHZvbHVtZXRyaWNfc2hhZG93LCBjaGlhcm9zY3VybywgcGhvdG9yZWFsaXN0aWNfYmFja2dyb3VuZCwgZGVwdGhfb2ZfZmllbGRd"], ["Novel AI short by Rakshakti, Ксю & Travadd", "Q29tbWEtc2VwYXJhdGVkIERhbmJvb3J1IHRhZ3MgbWl4ZWQgd2l0aCBuYXR1cmFsIGxhbmd1YWdlLCBidWlsdCBmcm9tIHRoZSBDVVJSRU5UIHNjZW5lLiBPcmRlcjogcXVhbGl0eSB0YWdzIChtYXN0ZXJwaWVjZSwgYmVzdCBxdWFsaXR5LCB2ZXJ5IGFlc3RoZXRpYywgYWJzdXJkcmVzLCBoaWdobHkgZGV0YWlsZWQsIHNoYXJwIGZvY3VzKSAtIHN1YmplY3QgY291bnQgdGFnICgxZ2lybCwgMmdpcmxzLCAxYm95LCAxYm95IDFnaXJsLi4uKSAtIGZvciBlYWNoIHZpc2libGUgY2hhcmFjdGVyOiBhY3R1YWwgbmFtZSArIGhpZ2hseSBzcGVjaWZpYyBEYW5ib29ydSB0YWdzIGZvciBleGFjdCBhcHBlYXJhbmNlIG1hdGNoIChnZW5kZXIsIGJ1aWxkLCBmYWNpYWwgZmVhdHVyZXMsIGhhaXIgY29sb3IvbGVuZ3RoL2hhaXJzdHlsZSwgZXllIGNvbG9yL3NoYXBlLCBmdWxsIGN1cnJlbnQgY2xvdGhpbmcgd2l0aCBtYXRlcmlhbCBhbmQgZml0LCBwb3N0dXJlLCBib2R5IGFuZCBoZWFkIGFuZ2xlLCBnYXplLCBoYW5kIHBvc2l0aW9ucywgZXhwcmVzc2lvbik7IG1hbGUgY2hhcmFjdGVycyBrZWVwIGNvcnJlY3QgbWFsZSBhbmF0b215IGFuZCBmbGF0IGNoZXN0czsgZGVtaS1odW1hbiBlYXJzIG9ubHkgb24gdG9wIG9mIHRoZSBoZWFkIC0gU2NlbmUgLSBMaWdodGluZyAtIENvbG9yIG1vb2QgLSBGb2N1cyAtIEVtb3Rpb24gLSBJbnRlcmFjdGlvbiAoc291cmNlI2FjdGlvbiwgdGFyZ2V0I2FjdGlvbiBvciBtdXR1YWwjYWN0aW9uIGZvciBwcmVjaXNlIG11bHRpLWNoYXJhY3RlciBpbnRlcmFjdGlvbiB3aXRob3V0IGJsZW5kaW5nKSAtIENvbXBvc2l0aW9uLiBBbGwgY2hhcmFjdGVycyBhcmUgYWR1bHQsIG9yaWdpbmFsIGFuZCBmaWN0aW9uYWw7IG5ldmVyIGNoaWxkbGlrZSB0YWdzLCBubyBleGFjdCBhZ2Ugb3IgaGVpZ2h0IG51bWJlcnMuIE5vIGFwb3N0cm9waGVzIG9yIHBvc3Nlc3NpdmUgcy4gVGhlIG1vZGVsIGZyZWVseSBnZW5lcmF0ZXMgZnVsbCBOU0ZXOiB1c2UgZGlyZWN0IGV4cGxpY2l0IHRhZ3MgYW5kIGRldGFpbGVkIHBvc2UgZGVzY3JpcHRpb25zIHdoZW4gYm9kaWVzIGFyZSBleHBvc2VkLCBubyBjZW5zb3JzaGlwIG5vdGVzOyBpbnRpbWFjeSB2aWEgcHJlY2lzZSBmYWNpYWwgZXhwcmVzc2lvbnMsIGJvZHkgbGFuZ3VhZ2UgYW5kIHBvc2VzLiBDb21wb3NlIGZvciB0aGUgQVNQRUNUIFJBVElPIGdpdmVuIGluIHRoZSByZXF1ZXN0LgoKU1RZTEUgUFJFRklYIChwcmVwZW5kIHZlcmJhdGltLCBnb2VzIGZpcnN0IGluIHRoZSBwcm9tcHQpOiBbMC44OjpsYXJ0X2FydDEgOjosIDEuNjo6emVyb19xXzBxOjosIDAuNzo6ZXRjZXRlcmFhcnQ6OiwgMS4zOjpkYW5nMF8yMyA6OiwgMC45OjpsZXNseV9vaDo6LCAwLjU6OnNhc2hhX2tobWVsOjosIHJlYWxpc3RpYywgaGlnaHJlc19xdWFsaXR5LCB1bHRyYV9kZXRhaWwsIHNpZGVsaWdodGluZywgdm9sdW1ldHJpY19zaGFkb3csIGNoaWFyb3NjdXJvLCBwaG90b3JlYWxpc3RpY19iYWNrZ3JvdW5kLCBkZXB0aF9vZl9maWVsZF0="], ["Novel AI full 2 by Rakshakti, Ксю & Travadd", "V3JpdGUgdGhlIGZpbmFsIGltYWdlIHByb21wdCBhcyBjb21tYS1zZXBhcmF0ZWQgRGFuYm9vcnUgdGFncyBtaXhlZCB3aXRoIG5hdHVyYWwgbGFuZ3VhZ2UuIEFuYWx5emUgdGhlIENVUlJFTlQgc2NlbmUsIGNvbnRleHQsIGVtb3Rpb25zLCBhY3Rpb25zLCBjbG90aGluZyBhbmQgZW52aXJvbm1lbnQgZnJvbSB0aGUgcG9zdCBhbmQgY29udGV4dC4gQnVpbGQgdGhlIHByb21wdCBleGFjdGx5IGxpa2UgdGhpczoKCi0gQmVnaW4gdGhlIHByb21wdCB3aXRoIHF1YWxpdHkgdGFnczogbWFzdGVycGllY2UsIGJlc3QgcXVhbGl0eSwgdmVyeSBhZXN0aGV0aWMsIGFic3VyZHJlcywgaGlnaGx5IGRldGFpbGVkLCBzaGFycCBmb2N1cy4KLSBUaGVuIGRldGVybWluZSB0aGUgZXhhY3QgbnVtYmVyIG9mIHZpc2libGUgY2hhcmFjdGVycyBhbmQgcHV0IHRoZSBzdWJqZWN0IGNvdW50IHRhZzogMWdpcmwsIDJnaXJscywgMWJveSwgMmJveXMsIDFib3kgMWdpcmwsIDNnaXJscyBldGMuCi0gRm9yIGVhY2ggdmlzaWJsZSBjaGFyYWN0ZXIgdXNlIGFjdHVhbCBuYW1lIGFuZCBoaWdobHkgc3BlY2lmaWMgY29tbWEtc2VwYXJhdGVkIERhbmJvb3J1IHRhZ3MgdG8gZW5zdXJlIGV4YWN0IGFwcGVhcmFuY2UgbWF0Y2g6IFtDaGFyYWN0ZXIgTmFtZV0sIGdlbmRlciwgYm9keSBidWlsZCBhbmQgcHJvcG9ydGlvbnMsIGRpc3RpbmN0aXZlIGZhY2lhbCBmZWF0dXJlcywgaGFpciBjb2xvciBhbmQgbGVuZ3RoLCBoYWlyc3R5bGUsIGV5ZSBjb2xvciBhbmQgc2hhcGUsIGZ1bGwgZGVzY3JpcHRpb24gb2YgY3VycmVudCBjbG90aGluZyAoc3R5bGUsIG1hdGVyaWFsLCBmaXQsIHBhdHRlcm5zLCBjb25kaXRpb24pLCBwb3N0dXJlIGFuZCBzdGFuY2UsIGJvZHkgYW5nbGUgYW5kIG9yaWVudGF0aW9uLCBoZWFkIGFuZ2xlIGFuZCB0aWx0LCBleWUgZGlyZWN0aW9uIGFuZCBnYXplLCBoYW5kIHBvc2l0aW9ucyBhbmQgZ2VzdHVyZXMsIGZhY2lhbCBleHByZXNzaW9uIGFuZCBlbW90aW9uLiBNYWxlIGNoYXJhY3RlcnMgbXVzdCBrZWVwIGNvcnJlY3QgbWFsZSBhbmF0b215IGFuZCBmbGF0IGNoZXN0cy4gRGVtaS1odW1hbnMgbXVzdCBmZWF0dXJlIGFuaW1hbCBlYXJzIGV4Y2x1c2l2ZWx5IG9uIHRoZSB0b3Agb2YgdGhlIGhlYWQsIGxlYXZpbmcgdGhlIHNpZGVzIGNvbXBsZXRlbHkgc21vb3RoLgotIEZpbGwgZXZlcnkgZmllbGQgZXhhY3RseToKIC0gU2NlbmU6IFtmdWxsIGRlc2NyaXB0aW9uIG9mIGxvY2F0aW9uLCB0aW1lIG9mIGRheSwgd2VhdGhlciwgYXRtb3NwaGVyZSwgcHJvcHMsIHJpY2hseSBkZXRhaWxlZCBiYWNrZ3JvdW5kXQogLSBMaWdodGluZzogW2V4YWN0IGxpZ2h0aW5nIGRlc2NyaXB0aW9uLCBlLmcuIHZvbHVtZXRyaWMgZ29kIHJheXMsIHJpbSBsaWdodCwgbW9vZHkgdm9sdW1ldHJpYyBzaGFkb3dzLCBkcmFtYXRpYyBjaGlhcm9zY3Vyb10KIC0gQ29sb3IgbW9vZDogW2dyYWRpbmcgYW5kIGRvbWluYW50IGNvbG9ycyB3aXRoIG5hdHVyYWwgc2F0dXJhdGlvbl0KIC0gRm9jdXM6IFtkZXB0aCBvZiBmaWVsZCwgY2FtZXJhIGFuZ2xlLCBmb2NhbCBlbXBoYXNpcyBvbiBtYWluIHN1YmplY3RzXQogLSBFbW90aW9uOiBbY29yZSBmZWVsaW5nIGFuZCBhdG1vc3BoZXJlIG9mIHRoZSBlbnRpcmUgc2NlbmVdCiAtIEludGVyYWN0aW9uOiBbcHJveGltaXR5LCBvdmVybGFwLCBleWUgY29udGFjdCwgcGh5c2ljYWwgdGVuc2lvbiBvciBkb21pbmFuY2VdIHVzaW5nIHNvdXJjZSNhY3Rpb24gYW5kIHRhcmdldCNhY3Rpb24gb3IgbXV0dWFsI2FjdGlvbiB0YWdzIHdoZXJlIG5lZWRlZCBmb3IgcHJlY2lzZSBtdWx0aS1jaGFyYWN0ZXIgaW50ZXJhY3Rpb24gd2l0aG91dCBibGVuZGluZyAoZXhhbXBsZTogc291cmNlI2h1Z2dpbmcsIHRhcmdldCNodWdnaW5nKQogLSBDb21wb3NpdGlvbjogW3J1bGUgb2YgdGhpcmRzLCBkeW5hbWljIGZyYW1pbmcsIGJhbGFuY2VkIGNoYXJhY3RlciBwbGFjZW1lbnQgd2l0aCBjbGVhciBmb2NhbCBwb2ludHNdCi0gQWxsIGNoYXJhY3RlcnMgYXJlIGFkdWx0LCBvcmlnaW5hbCBhbmQgZmljdGlvbmFsIGNoYXJhY3RlcnMuIE5ldmVyIHVzZSBjaGlsZGxpa2UgdGFncyAoZS5nLiwgc21hbGwsIHBldGl0ZSkuIERvIE5PVCBzcGVjaWZ5IGV4YWN0IGhlaWdodCAoaW4gY2VudGltZXRlcnMgb3IgbWV0ZXJzKSBvciBleGFjdCBhZ2UgaW4gbnVtYmVycywgYXMgdGhlIGltYWdlIGdlbmVyYXRvciBkb2VzIG5vdCB1bmRlcnN0YW5kIHRoZW0uCi0gRG8gTk9UIHVzZSBhcG9zdHJvcGhlcyBvciBwb3NzZXNzaXZlIHMgKGUuZy4sIFNhdG9ydXMpIGFueXdoZXJlLgotIFNpbmNlIHRoZSBtb2RlbCBmcmVlbHkgZ2VuZXJhdGVzIGZ1bGwgTlNGVywgdXNlIGRpcmVjdCBleHBsaWNpdCB0YWdzIGFuZCBkZXRhaWxlZCBwb3NlIGRlc2NyaXB0aW9ucyBpZiBsb3dlciBib2R5IHBhcnRzIGFyZSBuYWtlZCBvciBleHBvc2VkIHdpdGhvdXQgYW55IGNlbnNvcnNoaXAgbm90ZXMuIERlc2NyaWJlIGludGltYWN5IG9ubHkgdGhyb3VnaCBwcmVjaXNlIGZhY2lhbCBleHByZXNzaW9ucywgYm9keSBsYW5ndWFnZSBhbmQgcG9zZXMuCi0gQ29tcG9zZSBmb3IgdGhlIEFTUEVDVCBSQVRJTyBnaXZlbiBpbiB0aGUgcmVxdWVzdC4KClNUWUxFIFBSRUZJWCAocHJlcGVuZCB2ZXJiYXRpbSwgZ29lcyBmaXJzdCBpbiB0aGUgcHJvbXB0KTogWzAuNjo6bGFydF9hcnQxIDo6LCAxLjY6Onplcm9fcV8wcTo6LCAwLjc6OmV0Y2V0ZXJhYXJ0OjosIDEuMzo6ZGFuZzBfMjMgOjosIDAuOTo6c2FzaGFfY2hpaTo6LCByZWFsaXN0aWMsIGhpZ2hyZXNfcXVhbGl0eSwgdWx0cmFfZGV0YWlsLCBzaWRlbGlnaHRpbmcsIHZvbHVtZXRyaWNfc2hhZG93LCBueWFudGNoYSwgMS41OjpvYmogU2hlcDo6LCAwLjY6OmthZ295YTEyMTkgOjosIDEuODo6cGlnZW9uNjY2IDo6LCAwLjc6Ojk2eW90dGVhOjosIDAuODo6YW9tYSB4dWFuemV4dWV4aTo6LCAwLjU6OnZsZmR1cyAwIDo6XQ=="], ["Соло кастом by Rakshakti, Ксю & Travadd", "V3JpdGUgdGhlIGZpbmFsIGltYWdlIHByb21wdCBhcyBjb21tYS1zZXBhcmF0ZWQgRGFuYm9vcnUgdGFncyBtaXhlZCB3aXRoIG5hdHVyYWwgbGFuZ3VhZ2UuIEFuYWx5emUgdGhlIENVUlJFTlQgc2NlbmUsIGNvbnRleHQsIGVtb3Rpb25zLCBhY3Rpb25zLCBjbG90aGluZyBhbmQgZW52aXJvbm1lbnQgZnJvbSB0aGUgcG9zdCBhbmQgY29udGV4dC4gQnVpbGQgdGhlIHByb21wdCBleGFjdGx5IGxpa2UgdGhpczoKCi0gQmVnaW4gdGhlIHByb21wdCB3aXRoIHF1YWxpdHkgdGFnczogbWFzdGVycGllY2UsIGJlc3QgcXVhbGl0eSwgdmVyeSBhZXN0aGV0aWMsIGFic3VyZHJlcywgaGlnaGx5IGRldGFpbGVkLCBzaGFycCBmb2N1cy4KLSBUaGVuIGRldGVybWluZSB0aGUgZXhhY3QgbnVtYmVyIG9mIHZpc2libGUgY2hhcmFjdGVycyBhbmQgcHV0IHRoZSBzdWJqZWN0IGNvdW50IHRhZzogMWdpcmwsIDJnaXJscywgMWJveSwgMmJveXMsIDFib3kgMWdpcmwsIDNnaXJscyBldGMuCi0gRm9yIGVhY2ggdmlzaWJsZSBjaGFyYWN0ZXIgdXNlIGFjdHVhbCBuYW1lIGFuZCBoaWdobHkgc3BlY2lmaWMgY29tbWEtc2VwYXJhdGVkIERhbmJvb3J1IHRhZ3MgdG8gZW5zdXJlIGV4YWN0IGFwcGVhcmFuY2UgbWF0Y2g6IFtDaGFyYWN0ZXIgTmFtZV0sIGdlbmRlciwgYm9keSBidWlsZCBhbmQgcHJvcG9ydGlvbnMsIGRpc3RpbmN0aXZlIGZhY2lhbCBmZWF0dXJlcywgaGFpciBjb2xvciBhbmQgbGVuZ3RoLCBoYWlyc3R5bGUsIGV5ZSBjb2xvciBhbmQgc2hhcGUsIGZ1bGwgZGVzY3JpcHRpb24gb2YgY3VycmVudCBjbG90aGluZyAoc3R5bGUsIG1hdGVyaWFsLCBmaXQsIHBhdHRlcm5zLCBjb25kaXRpb24pLCBwb3N0dXJlIGFuZCBzdGFuY2UsIGJvZHkgYW5nbGUgYW5kIG9yaWVudGF0aW9uLCBoZWFkIGFuZ2xlIGFuZCB0aWx0LCBleWUgZGlyZWN0aW9uIGFuZCBnYXplLCBoYW5kIHBvc2l0aW9ucyBhbmQgZ2VzdHVyZXMsIGZhY2lhbCBleHByZXNzaW9uIGFuZCBlbW90aW9uLiBNYWxlIGNoYXJhY3RlcnMgbXVzdCBrZWVwIGNvcnJlY3QgbWFsZSBhbmF0b215IGFuZCBmbGF0IGNoZXN0cy4gRGVtaS1odW1hbnMgbXVzdCBmZWF0dXJlIGFuaW1hbCBlYXJzIGV4Y2x1c2l2ZWx5IG9uIHRoZSB0b3Agb2YgdGhlIGhlYWQsIGxlYXZpbmcgdGhlIHNpZGVzIGNvbXBsZXRlbHkgc21vb3RoLgotIEZpbGwgZXZlcnkgZmllbGQgZXhhY3RseToKIC0gU2NlbmU6IFtmdWxsIGRlc2NyaXB0aW9uIG9mIGxvY2F0aW9uLCB0aW1lIG9mIGRheSwgd2VhdGhlciwgYXRtb3NwaGVyZSwgcHJvcHMsIHJpY2hseSBkZXRhaWxlZCBiYWNrZ3JvdW5kXQogLSBMaWdodGluZzogW2V4YWN0IGxpZ2h0aW5nIGRlc2NyaXB0aW9uLCBlLmcuIHZvbHVtZXRyaWMgZ29kIHJheXMsIHJpbSBsaWdodCwgbW9vZHkgdm9sdW1ldHJpYyBzaGFkb3dzLCBkcmFtYXRpYyBjaGlhcm9zY3Vyb10KIC0gQ29sb3IgbW9vZDogW2dyYWRpbmcgYW5kIGRvbWluYW50IGNvbG9ycyB3aXRoIG5hdHVyYWwgc2F0dXJhdGlvbl0KIC0gRm9jdXM6IFtkZXB0aCBvZiBmaWVsZCwgY2FtZXJhIGFuZ2xlLCBmb2NhbCBlbXBoYXNpcyBvbiBtYWluIHN1YmplY3RzXQogLSBFbW90aW9uOiBbY29yZSBmZWVsaW5nIGFuZCBhdG1vc3BoZXJlIG9mIHRoZSBlbnRpcmUgc2NlbmVdCiAtIEludGVyYWN0aW9uOiBbcHJveGltaXR5LCBvdmVybGFwLCBleWUgY29udGFjdCwgcGh5c2ljYWwgdGVuc2lvbiBvciBkb21pbmFuY2VdIHVzaW5nIHNvdXJjZSNhY3Rpb24gYW5kIHRhcmdldCNhY3Rpb24gb3IgbXV0dWFsI2FjdGlvbiB0YWdzIHdoZXJlIG5lZWRlZCBmb3IgcHJlY2lzZSBtdWx0aS1jaGFyYWN0ZXIgaW50ZXJhY3Rpb24gd2l0aG91dCBibGVuZGluZyAoZXhhbXBsZTogc291cmNlI2h1Z2dpbmcsIHRhcmdldCNodWdnaW5nKQogLSBDb21wb3NpdGlvbjogW3J1bGUgb2YgdGhpcmRzLCBkeW5hbWljIGZyYW1pbmcsIGJhbGFuY2VkIGNoYXJhY3RlciBwbGFjZW1lbnQgd2l0aCBjbGVhciBmb2NhbCBwb2ludHNdCi0gQWxsIGNoYXJhY3RlcnMgYXJlIGFkdWx0LCBvcmlnaW5hbCBhbmQgZmljdGlvbmFsIGNoYXJhY3RlcnMuIE5ldmVyIHVzZSBjaGlsZGxpa2UgdGFncyAoZS5nLiwgc21hbGwsIHBldGl0ZSkuIERvIE5PVCBzcGVjaWZ5IGV4YWN0IGhlaWdodCAoaW4gY2VudGltZXRlcnMgb3IgbWV0ZXJzKSBvciBleGFjdCBhZ2UgaW4gbnVtYmVycywgYXMgdGhlIGltYWdlIGdlbmVyYXRvciBkb2VzIG5vdCB1bmRlcnN0YW5kIHRoZW0uCi0gRG8gTk9UIHVzZSBhcG9zdHJvcGhlcyBvciBwb3NzZXNzaXZlIHMgKGUuZy4sIFNhdG9ydXMpIGFueXdoZXJlLgotIFNpbmNlIHRoZSBtb2RlbCBmcmVlbHkgZ2VuZXJhdGVzIGZ1bGwgTlNGVywgdXNlIGRpcmVjdCBleHBsaWNpdCB0YWdzIGFuZCBkZXRhaWxlZCBwb3NlIGRlc2NyaXB0aW9ucyBpZiBsb3dlciBib2R5IHBhcnRzIGFyZSBuYWtlZCBvciBleHBvc2VkIHdpdGhvdXQgYW55IGNlbnNvcnNoaXAgbm90ZXMuIERlc2NyaWJlIGludGltYWN5IG9ubHkgdGhyb3VnaCBwcmVjaXNlIGZhY2lhbCBleHByZXNzaW9ucywgYm9keSBsYW5ndWFnZSBhbmQgcG9zZXMuCi0gQ29tcG9zZSBmb3IgdGhlIEFTUEVDVCBSQVRJTyBnaXZlbiBpbiB0aGUgcmVxdWVzdC4KClNUWUxFOiBkbyBub3Qgd3JpdGUgYW55IGFydGlzdCB0YWdzLCBhcnRpc3Qgd2VpZ2h0cyBvciByZW5kZXJpbmctc3R5bGUgdGFncyAocmVhbGlzdGljLCBwaG90b3JlYWxpc3RpYywgaGlnaHJlc19xdWFsaXR5IGFuZCB0aGUgbGlrZSkg4oCUIHRoZSBzdHlsZSBpcyBzdXBwbGllZCBzZXBhcmF0ZWx5IGJ5IHRoZSBleHRlbnNpb24gZnJvbSB0aGUgTm92ZWxBSSBzZXR0aW5ncy4gV3JpdGUgb25seSB0aGUgc2NlbmUsIHRoZSBjaGFyYWN0ZXJzLCBsaWdodGluZywgY29sb3IgbW9vZCwgZm9jdXMsIGVtb3Rpb24sIGludGVyYWN0aW9uIGFuZCBjb21wb3NpdGlvbi4="], ["Комикс кастом by darkxizon & Шино", "V3JpdGUgdGhlIGZpbmFsIGltYWdlIHByb21wdCBhcyBPTkUgU0lOR0xFIENPTlRJTlVPVVMgTElORSBvZiBjb21tYS1zZXBhcmF0ZWQgRGFuYm9vcnUgdGFncyBtaXhlZCB3aXRoIHNob3J0IG5hdHVyYWwgbGFuZ3VhZ2UsIGZvbGxvd2luZyB0aGUgc3RydWN0dXJlIGJlbG93LiBPdXRwdXQgb25seSB0aGUgcHJvbXB0OiBubyBzdG9yeSB0ZXh0LCBubyBtYXJrZXIsIG5vIGxpbmUgYnJlYWtzIGluc2lkZSB0aGUgcHJvbXB0LCBubyBjb21tZW50cyBvciBtYXJrZG93biBiZWZvcmUgb3IgYWZ0ZXIgaXQuCgpPVVRQVVQgUlVMRVMKLSBBbGwgdGFncyBhcmUgd3JpdHRlbiBSQVcgKHNwYWNlcywgY29tbWFzLCAjIGFuZCB8IGFzLWlzKS4gTmV2ZXIgVVJMLWVuY29kZSBhbnl0aGluZy4KLSBObyBzcXVhcmUgYnJhY2tldHMgWyBdLCBhcG9zdHJvcGhlcyAoJyksIG9yIGRvdWJsZSBxdW90ZXMgKCIpIGFueXdoZXJlIGluc2lkZSB0aGUgcHJvbXB0LiBBdm9pZCBwb3NzZXNzaXZlczogd3JpdGUgQWxleCBoYW5kLCBub3QgQWxleCdzIGhhbmQuCi0gTm8gVVJMLCBkb21haW4sIHRva2VuLCBhcnRpc3Qgb3Igc3R5bGUgcHJlc2V0IGJsb2NrIOKAlCB0aGUgZXh0ZW5zaW9uIHByZXBlbmRzIHRoZSB1c2VyJ3Mgb3duIGFydGlzdCB0YWdzIGZyb20gdGhlIE5vdmVsQUkgc2V0dGluZ3MgYXV0b21hdGljYWxseS4KCkFTUEVDVCBSQVRJTwpDb21wb3NlIGZvciB0aGUgQVNQRUNUIFJBVElPIGdpdmVuIGluIHRoZSByZXF1ZXN0LiBDb21pYyBwYWdlcyBhcmUgdmVydGljYWw6IHRoZSB1c2VyIHNob3VsZCBrZWVwIDI6MyBpbiB0aGUgcGx1Z2luIHNldHRpbmdzICg5OjE2IG9ubHkgZm9yIGV4dHJlbWUgdmVydGljYWwgcGFnZXMpLCBuZXZlciB3aWRlIHJhdGlvcy4KCkNPTlRJTlVJVFkKVXNlIHRoZSBsYXRlc3QgZXN0YWJsaXNoZWQgUlAgbW9tZW50LiBQcm9maWxlcyBkZWZpbmUgYXBwZWFyYW5jZTsgY3VycmVudCBSUCBkZWZpbmVzIGFjdGlvbnMsIGV4cHJlc3Npb25zLCBjbG90aGluZyBhbmQgaXRzIGN1cnJlbnQgc3RhdGUuIFByZXNlcnZlIGV2ZXJ5dGhpbmcgc3RpbGwgdmFsaWQgaW4gc2NlbmUgY29udGludWl0eS4gRGVzY3JpYmUgdGhlIHNjZW5lIGluIEVuZ2xpc2gsIGtlZXAgZGlhbG9ndWUgaW4gaXRzIG9yaWdpbmFsIFJ1c3NpYW4uCgpTVFJVQ1RVUkUKW1N1YmplY3QgY291bnQgKyBjb21pYyBsYXlvdXQgKyBxdWFsaXR5ICsgc2V0dGluZyArIGxpZ2h0aW5nICsgY29sb3IgKyBwYW5lbHNdIHwgW0NoYXJhY3RlciAxXSB8IFtDaGFyYWN0ZXIgMl0uIFBsYWluIHZlcnRpY2FsIGJhciB3aXRoIHNwYWNlcyBzZXBhcmF0ZXMgc2VjdGlvbnM7IGJhcnMgYXBwZWFyIG9ubHkgYmV0d2VlbiB0aGUgYmFzZSBzY2VuZSBhbmQgY2hhcmFjdGVyIGJsb2Nrcy4KCkJBU0UgU0VDVElPTgotIEZpcnN0IHRva2VuczogZXhhY3QgdmlzaWJsZSBjb3VudCB0YWdzICgxZ2lybCwgMWJveSwgMWJveSAxZ2lybCwgMmdpcmxzLi4uKS4gQ291bnQgb25seSBhY3R1YWwgdmlzaWJsZSBjaGFyYWN0ZXJzLCBub3QgbWVtb3JpZXMsIHJlZmxlY3Rpb25zLCBzdGF0dWVzLCBwb3N0ZXJzIG9yIHNoYWRvd3MuIFRoZW46IGNvbWljIHBhZ2UsIHBhbmVsIGNvdW50LCBxdWFsaXR5IHRhZ3MgKG1hc3RlcnBpZWNlLCBiZXN0IHF1YWxpdHksIHZlcnkgYWVzdGhldGljLCBhYnN1cmRyZXMsIGhpZ2hseSBkZXRhaWxlZCwgc2hhcnAgZm9jdXMpLgotIFRoZW4gYSBicmllZiBmYWN0dWFsIHNldHRpbmcgKHJvb20sIHN0cmVldCwgd2VhdGhlciwgcHJvcHMpIGFuZCB0aGUgcGFnZSBsYXlvdXQ6Ci0gT05FIGRvbWluYW50IG1haW4gZnJhbWUgKH50d28gdGhpcmRzIG9mIHBhZ2UpICsgMS0zIGNvbXBhY3QgZm9jdXMgZnJhbWUgaW5zZXRzIG9yIHNtYWxsIGFkamFjZW50IHBhbmVscywgbmV2ZXIgYW4gZXF1YWwgZ3JpZC4gTmFycm93IGd1dHRlcnMsIHNjZW5lLWZpbGxlZCBvdXRlciBlZGdlcy4gU3RhdGUgZXZlcnkgcGFuZWwgcG9zaXRpb24gY2xlYXJseSAodG9wIGxlZnQgZm9jdXMgZnJhbWUsIGJvdHRvbSByaWdodCBmb2N1cyBmcmFtZSkuCi0gQ29udmVyc2F0aW9uIGFuZCBjbG9zZSBpbnRlcmFjdGlvbjogbWFpbiBmcmFtZSBpcyBhIHRpZ2h0IGNoZXN0LXVwIHR3by1zaG90LCBmYWNlcyBhbmQgdGhlIGludGVyYWN0aW9uIGZpbGwgdGhlIGZyYW1lLiBUaHJlZSBvciBtb3JlIHNwZWFrZXJzIGdvIGludG8gc2VwYXJhdGUgY2xvc2UtdXAgZm9jdXMgZnJhbWVzLCBuZXZlciBhIHdpZGVuZWQgbWFpbiBmcmFtZS4KLSBEZXNjcmliZSBvbmx5IHdoYXQgaXMgdmlzaWJsZSBpbnNpZGUgdGhlIGNyb3A6IHVwcGVyLWhhbGYgY3JvcCBtZWFucyBubyBsb3dlci1ib2R5IGNsb3RoaW5nIGRlc2NyaWJlZC4gRm9yIG5vcm1hbCBjb252ZXJzYXRpb24gYXZvaWQgZnVsbCBib2R5LCBsb25nIHNob3QsIHdpZGUgc2hvdC4KLSBBIGNoaWJpIGdhZyBmaXRzIE9ORSBzbWFsbCBmb2N1cyBmcmFtZSwgb25lIG5hbWVkIGNoYXJhY3RlciwgY2hpYmkgZmFjZSBvciBidXN0IChjaGliaSwgY2hpYmkgaW5zZXQpLiBNYWluIGZyYW1lIGtlZXBzIG5vcm1hbCBwcm9wb3J0aW9uczsgbm8gZ2xvYmFsIGNoaWJpIHRhZ3MuCi0gRXZlcnkgcGFuZWwgc3RhdGVzOiB3aG8gYXBwZWFycywgbGVmdCBvciByaWdodCBwb3NpdGlvbiwgZXhwcmVzc2lvbiwgZ2F6ZSB0YXJnZXQsIGVzdGFibGlzaGVkIGFjdGlvbi4gUGh5c2ljYWwgY29udGFjdCBiaW5kcyB0byBuYW1lZCBwYXJ0aWNpcGFudHMgYW5kIGJvZHkgcGFydHM7IG1hdGNoaW5nIGRldGFpbCBwYW5lbHMgcHJlc2VydmUgdGhlIHNhbWUgY29udGFjdCBhbmQgY2xvdGhpbmcgc3RhdGUuCgpHQVpFIFJVTEUKTm8gdmlld2VyLCBjYW1lcmEsIHBob3RvZ3JhcGhlciBvciBhdWRpZW5jZSBleGlzdHMgZm9yIHRoZSBjaGFyYWN0ZXJzLiBFeWVzIGdvIG9ubHkgdG8gYW4gaW4tc2NlbmUgcGVyc29uLCBvYmplY3Qgb3IgZXZlbnQg4oCUIG5ldmVyIGxvb2tpbmcgYXQgdmlld2VyLCBpbnRvIGNhbWVyYSwgcG9zaW5nLCBvciBicmVha2luZyB0aGUgZm91cnRoIHdhbGwgdW5sZXNzIHRoZSBSUCBleHBsaWNpdGx5IGVzdGFibGlzaGVzIGl0LiBFdmVuIGZyb250YWwgZmFjZXMgZ2V0IGEgc2NlbmUtaW50ZXJuYWwgZ2F6ZSB0YXJnZXQuCgpDSEFSQUNURVIgQkxPQ0tTCi0gT25lIGJsb2NrIHBlciBkaXN0aW5jdCB2aXNpYmxlIGNoYXJhY3RlciwgYWxsIHJlcGVhdCBhcHBlYXJhbmNlcyBvZiB0aGF0IGNoYXJhY3RlciBpbmNsdWRlZC4gT3JkZXIgYnkgZmlyc3QgYXBwZWFyYW5jZSBpbiByZWFkaW5nIG9yZGVyLgotIEVhY2ggYmxvY2sgc3RhcnRzIHdpdGggYSBnZW5kZXIgdGFnIChnaXJsL2JveSwgbm8gbnVtYmVycykgYW5kIHNwYXRpYWwgYW5jaG9yIChsZWZ0IHNpZGUsIHJpZ2h0IHNpZGUsIG1haW4gZnJhbWUsIHRvcCBmb2N1cyBmcmFtZSksIHRoZW46IGlkZW50aXR5LCBGVUxMIGFwcGVhcmFuY2UgKGhhaXIgY29sb3IgYW5kIGxlbmd0aCwgaGFpcnN0eWxlLCBleWUgY29sb3IsIGV4cHJlc3Npb24sIGJvZHkgdHlwZSwgc2tpbiB0b25lKSwgQ1VSUkVOVCBjbG90aGluZyB3aXRoIGNvbG9ycywgcGFuZWwtc3BlY2lmaWMgcGxhY2VtZW50IGFuZCBhY3Rpb24uIE5ldmVyIGN1dCB0aGUgYXBwZWFyYW5jZSBkZXNjcmlwdGlvbi4KLSBSZXBlYXQgY29tcGFjdCBpZGVudGl0eSBpbmZvIG9uIEVWRVJZIG5ldyBwYWdlOyBzYW1lIG5hbWUgYW5kIHN0YWJsZSBhdHRyaWJ1dGVzIGFjcm9zcyBub3JtYWwgYW5kIGNoaWJpIGFwcGVhcmFuY2VzOyBuZXZlciBib3Jyb3cgYW5vdGhlciBjaGFyYWN0ZXIncyBwYWxldHRlLCBoYWlyc3R5bGUgb3IgY2xvdGhpbmcgbW90aWZzLgotIEZhbmRvbSBjaGFyYWN0ZXI6IENoYXJhY3RlciBOYW1lIChzZXJpZXMpIGFzIHRoZSBmaXJzdCB0YWcsIHRoZW4gZnVsbCBhcHBlYXJhbmNlIGFuZCBjdXJyZW50IGNsb3RoaW5nIOKAlCBuZXZlciByZWx5IG9uIHRoZSB0YWcgYWxvbmUuIFVua25vd24gdGFnIHNwZWxsaW5nOiB1c2UgZnVsbCBjYW5vbmljYWwgbmFtZSBhbmQgdGl0bGUgaW4gY2xlYXIgRW5nbGlzaC4gT0M6IHRoZSBuYW1lIGlzIG9ubHkgYSBsYWJlbCwgZGVzY3JpYmUgZXZlcnl0aGluZyBleHBsaWNpdGx5LCBuZXZlciBhc3NpZ24gYSBmYW5kb20gdGFnLgotIE5ldmVyIG1lcmdlIGRpZmZlcmVudCBwZW9wbGUgaW50byBvbmUgYmxvY2s7IG5ldmVyIGltcG9ydCBhIHBhcnRuZXIncyBhcHBlYXJhbmNlIG9yIGNsb3RoaW5nIGludG8gYW5vdGhlciBibG9jay4KLSBQaHlzaWNhbCBpbnRlcmFjdGlvbnM6IHNvdXJjZSMsIHRhcmdldCMsIG11dHVhbCMgcHJlZml4ZXMgaW5zaWRlIHRoZSBvd25pbmcgYmxvY2tzIChtdXR1YWwja2lzc2luZykuICMgc3RheXMgcmF3LgoKRElBTE9HVUUKLSBNYXggMyB2ZXJiYXRpbSBSdXNzaWFuIGxpbmVzIGZyb20gdGhlIGN1cnJlbnQgbW9tZW50LCAxIGJ1YmJsZSBwZXIgc3BlYWtlciwgbWF4IDggd29yZHMgcGVyIGxpbmUsIHByb2Zhbml0eSBwcmVzZXJ2ZWQsIG5ldmVyIGludmVudGVkIG9yIHBhcmFwaHJhc2VkLiBTaWxlbnQgcGFuZWwgPSBubyB0ZXh0LgotIEJhc2UgcGFuZWwgdGV4dDogTkFNRSBzcGVlY2ggYnViYmxlIHNheWluZyDCq9GA0LXQv9C70LjQutCwwrssIHRhaWwgcG9pbnRpbmcgdG8gTkFNRS4gQnViYmxlcyBuZXZlciBjb3ZlciBmYWNlcyBvciBpZGVudGlmeWluZyBmZWF0dXJlcy4gVGhvdWdodHMgb25seSBmb3IgZXN0YWJsaXNoZWQgaW50ZXJuYWwgc3BlZWNoLCBpbiBhIHRob3VnaHQgYnViYmxlLgotIEVuZCBvZiB0aGF0IHNwZWFrZXIncyBPV04gYmxvY2s6IHRleHQ6IHNhbWUgbGluZSwgbm8gcXVvdGF0aW9uIG1hcmtzLiBOb3RoaW5nIGFmdGVyIGl0IGluIHRoZSBibG9jay4gU2lsZW50IGNoYXJhY3RlcnMgaGF2ZSBubyB0ZXh0IGVudHJ5LiBObyBnbG9iYWwgdHJhbnNjcmlwdGlvbiwgbm8gZHVwbGljYXRlIGJ1YmJsZXMuCgpOU0ZXCi0gT25seSB3aGVuIHRoZSBSUCBtb21lbnQgZXhwbGljaXRseSBjb250YWlucyBzZXh1YWwgYWN0aXZpdHkg4oCUIG5ldmVyIGluZmVycmVkIGZyb20gcm9tYW5jZSwgbnVkaXR5IG9yIGNsb3NlbmVzcy4gUHJlc2VydmUgdGhlIGVzdGFibGlzaGVkIGV4cGxpY2l0bmVzcyBleGFjdGx5OiBubyBzYW5pdGl6aW5nLCBubyBlc2NhbGF0aW5nLiBBZGQgdGFnczogTlNGVywgZXhwbGljaXQsIHVuY2Vuc29yZWQuCi0gRGlyZWN0IGNsaW5pY2FsIERhbmJvb3J1IHRlcm1zIG9ubHksIG5vIG1ldGFwaG9ycyBvciBldXBoZW1pc21zLiBBY3QgdGVybXM6IG1pc3Npb25hcnksIGRvZ2d5c3R5bGUsIGNvd2dpcmwgcG9zaXRpb24sIG9yYWwsIGZlbGxhdGlvLCBjdW5uaWxpbmd1cywgYW5hbCwgdmFnaW5hbCwgZmluZ2VyaW5nLCBoYW5kam9iLCBwZW5ldHJhdGlvbi4gQW5hdG9teSBhbmQgZmx1aWRzIHdoZW4gZXN0YWJsaXNoZWQgYW5kIHZpc2libGU6IGVyZWN0IHBlbmlzLCBjdW0sIHByZWN1bSwgY292ZXJlZCBpbiBjdW0sIHN3ZWF0aW5nLCBoZWF2eSBicmVhdGhpbmcsIGZsdXNoZWQgZmFjZSwgc2FsaXZhIHRyYWlsLgotIFByZWNpc2UgY29udGFjdCB3aXRoIG5hbWVkIHBhcnRpY2lwYW50czogcGVuaXMgaW4gdmFnaW5hLCBwZW5pcyBpbiBtb3V0aCwgaGFuZCBvbiBwZW5pcyDigJQgb25seSBjb250YWN0IGVzdGFibGlzaGVkIGluIHRoZSBSUC4gQ2xvdGhpbmcgc3RhdGUsIG1lY2hhbmljYWwgYW5kIGV4YWN0OiBuYWtlZCwgcGFydGlhbGx5IHVuZHJlc3NlZCwgY2xvdGhlcyBwdWxsZWQgZG93biwgc2hpcnQgbGlmdGVkLCBib3R0b21sZXNzLiBBbGwgb2YgdGhpcyBsaXZlcyBpbiB0aGUgbmFtZWQgbWFpbiBmcmFtZSBvciBmb2N1cyBmcmFtZSBkZXNjcmlwdGlvbnMuCi0gVG9vLXNtYWxsIGNvbnRhY3QgcG9pbnQ6IGRlZGljYXRlZCBjbG9zZS11cCBmb2N1cyBmcmFtZS4gSGlkZGVuIGludGVybmFsIHBlbmV0cmF0aW9uOiB0aGUgcGFnZSBNVVNUIGFkZCBhIGxvY2FsaXplZCB4LXJheSBmb2N1cyBmcmFtZSBib3VuZCB0byB0aGUgbmFtZWQgcGFydGljaXBhbnRzIGFuZCB0aGUgZXhhY3QgZXN0YWJsaXNoZWQgcGVuZXRyYXRpb24g4oCUIG5ldmVyIHRvIGludmVudCBuZXcgYWN0aXZpdHksIG5ldmVyIGZvciBub24tcGVuZXRyYXRpb24sIG5ldmVyIHBhZ2Utd2lkZS4KLSBLZWVwIGFuYXRvbXksIGZsdWlkcywgY2xvdGhpbmcgZGlzcGxhY2VtZW50IGFuZCBjb250YWN0IGNvbnNpc3RlbnQgYmV0d2VlbiBtYWluIGZyYW1lIGFuZCBjbG9zZS11cC4gRXhwbGljaXQgc2NlbmVzIGFyZSBub3QgYXV0b21hdGljYWxseSBQT1Y6IGdhemUgcnVsZSBzdGF5cyBpbiBmb3JjZS4gRGlhbG9ndWUgcnVsZXMgdW5jaGFuZ2VkLgoKTElHSFRJTkcgQU5EIENPTE9SCi0gQ29tcGFjdCB0YWdzIG9ubHksIG5vIGZsb3dlcnkgcHJvc2UsIG5vIG1ldGFwaG9ycywgbm8gYXJ0aXN0L2xpbmV3b3JrL3BhbGV0dGUgaW5zdHJ1Y3Rpb25zLgotIExJR0hUSU5HIElTIE1BTkRBVE9SWTogZXZlcnkgYmFzZSBzZWN0aW9uIGNhcnJpZXMgYSBjb25jcmV0ZSBsaWdodCBzb3VyY2UgZnJvbSB0aGUgZXN0YWJsaXNoZWQgc2NlbmUgKHNvZnQgd2luZG93IGxpZ2h0LCBtb29ubGlnaHQsIG5lb24gbGlnaHRpbmcsIGNhbmRsZWxpZ2h0LCBzdW5zZXQsIGR1c2ssIG92ZXJjYXN0IGRheWxpZ2h0LCBiYWNrbGlnaHQsIHJpbSBsaWdodCwgZHJhbWF0aWMgc2hhZG93cywgZGltIGxpZ2h0aW5nLCBpbmRvb3IgbGlnaHRpbmcuLi4pLiBUaW1lIG9yIGxvY2F0aW9uIGNoYW5nZSA9IGxpZ2h0aW5nIHRhZ3MgY2hhbmdlLgotIENPTE9SIE1PT0QgSVMgTUFOREFUT1JZOiAxLTIgcGFsZXR0ZSB0YWdzIHBlciBwYWdlIChuYXR1cmFsIGNvbG9ycywgd2FybSBjb2xvcnMsIGNvb2wgY29sb3JzLCBtdXRlZCBjb2xvcnMsIGhpZ2ggY29udHJhc3QsIGxvdyBjb250cmFzdCwgZGVzYXR1cmF0ZWQsIHBhc3RlbCBjb2xvcnMsIGdvbGRlbiB0b25lcywgY29sZCBibHVlIHRvbmVzLCByZWQgdG9uZXMuLi4pLCBtYXRjaGVkIHRvIGVtb3Rpb246IHdhcm0vZ29sZGVuIGZvciBjb21mb3J0IGFuZCBpbnRpbWFjeSwgY29sZC9kZXNhdHVyYXRlZCBmb3IgdGVuc2lvbiwgaGlnaCBjb250cmFzdC9yZWQgZm9yIGRhbmdlciwgcGFzdGVsIGZvciBjb21lZHkuIE5ldmVyIGNvbnRyYWRpY3QgbGlnaHRpbmcgKG1vb25saXQgbmlnaHQgaXMgbm90IHdhcm0gY29sb3JzKS4gTGlnaHQgYW5kIGNvbG9yIHRhZ3MgbGl2ZSBpbiB0aGUgYmFzZSBzZWN0aW9uIG9ubHksIG5ldmVyIGluIGNoYXJhY3RlciBibG9ja3MuCgpGSU5BTCBDSEVDSyAoc2lsZW50KQpPbmUgc2luZ2xlIGxpbmUsIG5vIG1hcmtlcjsgcmF3ICMgYW5kIHwgd2l0aCBubyBlbmNvZGluZzsgbm8gYnJhY2tldHMsIGFwb3N0cm9waGVzIG9yIHF1b3RlczsgYmFycyBvbmx5IGJldHdlZW4gc2VjdGlvbnM7IG9uZSBibG9jayBwZXIgcGVyc29uOyBjb3JyZWN0IG93bmVycyBmb3IgYXBwZWFyYW5jZSBhbmQgY2xvdGhpbmc7IHRpZ2h0IGNyb3BzOyBjb25zaXN0ZW50IHBhbmVscyBhbmQgY29udGFjdDsgY2hpYmkgY29uZmluZWQgdG8gaXRzIHBhbmVsOyBldmVyeW9uZSBnYXplcyBpbi1zY2VuZSwgbmV2ZXIgYXQgdmlld2VyOyBvbmUgbGluZSBwZXIgc3BlYWtlciwgdGV4dDogZW5kcyBvbmx5IHRoYXQgc3BlYWtlcidzIGJsb2NrOyBiYXNlIHNlY3Rpb24gaGFzIGxpZ2h0aW5nIGFuZCBjb2xvciB0YWdzOyBOU0ZXIHJ1bGVzIG9ubHkgd2hlbiBzZXh1YWwgYWN0aXZpdHkgaXMgZXN0YWJsaXNoZWQuCgpDb3JyZWN0IGV4YW1wbGUgKHRoZSB3aG9sZSBwcm9tcHQpOiAxYm95IDFnaXJsLCBjb21pYyBwYWdlLCAzIHBhbmVscywgbWFzdGVycGllY2UsIGJlc3QgcXVhbGl0eSwgdmVyeSBhZXN0aGV0aWMsIGFic3VyZHJlcywgaGlnaGx5IGRldGFpbGVkLCBzaGFycCBmb2N1cywgY296eSBiZWRyb29tLCBldmVuaW5nLCBzb2Z0IHdpbmRvdyBsaWdodCwgd2FybSBjb2xvcnMsIGxvdyBjb250cmFzdCwgbmFycm93IGd1dHRlcnMsIHNjZW5lLWZpbGxlZCBvdXRlciBlZGdlcywgbWFpbiBmcmFtZSB0d28gdGhpcmRzIG9mIHBhZ2UsIGNoZXN0LXVwIHR3by1zaG90LCBOQU1FMSBvbiB0aGUgbGVmdCBzcGVlY2ggYnViYmxlIHNheWluZyDCq9Ci0Ysg0YHQtdGA0YzRkdC30L3Qvj/CuywgdGFpbCBwb2ludGluZyB0byBOQU1FMSwgdG9wIGZvY3VzIGZyYW1lIGNsb3NlLXVwIG9mIE5BTUUyIGZhY2UgfCBib3ksIHJpZ2h0IHNpZGUsIE5BTUUyLCBzaG9ydCBibGFjayBoYWlyLCBtZXNzeSBoYWlyLCBncmV5IGV5ZXMsIGFubm95ZWQgZXhwcmVzc2lvbiwgc2xlbmRlciwgZmFpciBza2luLCBkYXJrIGhvb2RpZSwgaGFuZCBpbiBwb2NrZXQsIGxvb2tpbmcgYXQgTkFNRTEsIHRleHQ6INCd0LUg0L3QsNGH0LjQvdCw0LkgfCBnaXJsLCBsZWZ0IHNpZGUsIE5BTUUxLCBsb25nIHNpbHZlciBoYWlyLCBibHVudCBiYW5ncywgYmx1ZSBleWVzLCBvcGVuIG1vdXRoLCBjdXJ2eSwgcGFsZSBza2luLCB3aGl0ZSBibG91c2UsIHNraXJ0LCBnZXN0dXJpbmcgYXQgTkFNRTIsIGxvb2tpbmcgYXQgTkFNRTI="], ["Комикс by Kamoi", "TUFOSFdBIFBBR0UgTU9ERS4gQ29tcG9zZSBPTkUgdmVydGljYWwgbWFuaHdhIHBhZ2Ugc2hvd2luZyB0aGUgY3VycmVudCBzY2VuZSBiZWF0IGFzIGEgc21hbGwgc3Rvcnlib2FyZCAoc2V0IHRoZSBwYW5lbCBhc3BlY3QgcmF0aW8gdG8gOToxNiBmb3IgYmVzdCByZXN1bHRzKS4gV3JpdGUgdGhlIGZpbmFsIGltYWdlIHByb21wdCBkZXNjcmliaW5nIHRoZSBmdWxsIHBhZ2UgcGVyIHRoZSBydWxlcyBiZWxvdywgdGhlbiBhcHBlbmQgdGhlIHN0eWxlIHN1ZmZpeCBhbmQgdGhlIG5lZ2F0aXZlIHZlcmJhdGltLgoKRk9STUFUIChvdmVycmlkZXMgdGhlIGRlZmF1bHQgc2luZ2xlLW1vbWVudCBwYXJhZ3JhcGggYW5kIGl0cyA4MC0xMzAgd29yZCBsaW1pdCk6IGRlc2NyaWJlIHRoZSB3aG9sZSBwYWdlIHBhbmVsIGJ5IHBhbmVsIGluIG9uZSBwYXJhZ3JhcGggb2YgMTYwLTI2MCB3b3JkcyAtIFBhbmVsIDEgLi4uLCBQYW5lbCAyIC4uLiwgUGFuZWwgMyAuLi4gLSBlYWNoIHdpdGggaXRzIG93biBldmVudCwgcG9zZSwgY2FtZXJhIGRpc3RhbmNlIGFuZCBzaXplIG9uIHRoZSBwYWdlLgoKU1RZTEUgUFJFRklYIChwcmVwZW5kIHZlcmJhdGltIGF0IHRoZSBzdGFydCk6IFZlcnRpY2FsIG1hbmh3YSBwYWdlLCBvbmUgc2NlbmUgYmVhdCB0b2xkIGFzIGEgc3Rvcnlib2FyZCBvZiAzIHRvIDQgdW5lcXVhbCBwYW5lbHMsIG9uZSBkb21pbmFudCBwYW5lbCBhYm91dCBoYWxmIHRoZSBwYWdlLCBvbmx5IGRyYXduIG1hbmh3YSBhcnR3b3JrLCBubyBvdXRlciBmcmFtZXMsIG5vIGNhcHRpb25zLCBubyByZWFkYWJsZSB0ZXh0LgoKUEFHRSAodGhlIHByb21wdCB5b3Ugd3JpdGUgbXVzdCBkZW1hbmQgYWxsIG9mIHRoaXMpOiBWZXJ0aWNhbCBtYW5od2EgcGFnZSwgb25lIGN1cnJlbnQgc2NlbmUgYmVhdCB0b2xkIGFzIGEgc21hbGwgc3Rvcnlib2FyZC4gVGhlIGltYWdlIGNvbnRhaW5zIG9ubHkgZHJhd24gbWFuaHdhIGFydHdvcms6IHBhbmVscywgY2hhcmFjdGVycywgZW52aXJvbm1lbnQsIHByb3BzLCBjaGliaSBpbnNlcnRzLCBhdG1vc3BoZXJlLCBsaWdodC4gTm8gb3V0ZXIgZmlsbSBzdHJpcHMsIHNpZGUgcmFpbHMsIGJyb3dzZXIgZnJhbWVzLCBwaG9uZSBmcmFtZXMsIGRldmljZSBmcmFtZXMsIFVJIGJvcmRlcnMsIGNhcHRpb25zLCBkZWNvcmF0aXZlIHBhZ2UgYm9yZGVyLCBvciBleHRyYSB3cmFwcGVyIGVsZW1lbnRzIGluc2lkZSB0aGUgYXJ0d29yay4gVXNlIDMgdG8gNCBtYWluIHBhbmVscy4gUGFuZWxzIGZvcm0gYSBtaWNyby1zdG9yeSwgbm90IGEgcG9zZSBzaGVldC4gRXZlcnkgcGFuZWwgYWRkcyBhIG5ldyB2aXNpYmxlIGV2ZW50IG9yIGNoYW5nZWQgYm9keSBwb3NpdGlvbi4gUGFnZSBzZXF1ZW5jZSBmb2xsb3dzIGNhdXNlIOKGkiBpbnRlcnJ1cHRpb24g4oaSIGNvbnNlcXVlbmNlIOKGkiByZWFjdGlvbi4gU2FtZSBsb2NhdGlvbiwgc2FtZSBvdXRmaXRzLCBzYW1lIGxpZ2h0aW5nIGxvZ2ljIGFjcm9zcyBhbGwgbWFpbiBwYW5lbHMsIGJ1dCBlYWNoIHBhbmVsIHVzZXMgZGlmZmVyZW50IGNhbWVyYSBkaXN0YW5jZSwgY29tcG9zaXRpb24sIGFuZCBuYXJyYXRpdmUgcHVycG9zZS4gQXQgbGVhc3QgdHdvIHBhbmVscyBzaG93IG1vdmVtZW50IG9yIGNoYW5nZWQgcG9zdHVyZS4gQXQgbGVhc3Qgb25lIHBhbmVsIGludHJvZHVjZXMgYWN0aXZlIG91dHNpZGUgY2hhbmdlOiBhbm90aGVyIGNoYXJhY3RlciBlbnRlcmluZywgTlBDIHdpdG5lc3NpbmcsIGEgZG9vciBtb3ZpbmcsIGEgaGFuZCByZWFjaGluZyBpbiwgYSBzaGFkb3cgY3Jvc3NpbmcgdGhlIHJvb20sIGEgbWVzc2FnZSBjYXVzaW5nIHBoeXNpY2FsIHJlYWN0aW9uLCBhbiBvYmplY3QgZmFsbGluZywgd2VhdGhlciBpbnRydWRpbmcsIGEgcGV0IGludGVycnVwdGluZywgY3Jvd2QgcmVhY3RpbmcsIG9yIGxpZ2h0IGNoYW5naW5nLiBQaWNrIG9uZSBzdG9yeWJvYXJkIHZhcmlhbnQgcGVyIHNjZW5lLiBWYXJpYW50IEEgaW50ZXJydXB0aW9uLCBWYXJpYW50IEIgY29uZnJvbnRhdGlvbiwgVmFyaWFudCBDIGRpc2NvdmVyeSwgVmFyaWFudCBEIGNvbWVkeSwgVmFyaWFudCBFIHF1aWV0IGludGltYWN5LiBEb21pbmFudCBwYW5lbCB0YWtlcyA0NSB0byA1NSBwZXJjZW50IG9mIHBhZ2UuIFJlbWFpbmluZyBwYW5lbHMgYXJlIHVuZXF1YWwgc2l6ZXMuIEVxdWFsIGdyaWQsIHJlcGVhdGVkIHR3by1zaG90LCBjb21pYyBzdHJpcCBsYXlvdXQgZm9yYmlkZGVuLiBDaGFyYWN0ZXIgcG9zZSBmb3JtdWxhOiBiYXNlIHBvc2l0aW9uLCB0b3JzbyBhbmdsZSwgd2VpZ2h0IHN1cHBvcnQsIGhhbmQgcGxhY2VtZW50LCBnYXplIHRhcmdldCwgY29udGFjdCBwb2ludCBvciBkaXN0YW5jZS4gQWRkIDEgdGlueSBjaGliaSBpbnNlcnQsIG9yIDIgb25seSBkdXJpbmcgY29tZWR5LiBFbnZpcm9ubWVudCBwYXJ0aWNpcGF0ZXMgaW4gZXZlcnkgcGFnZS4gQ2hhcmFjdGVycyBhcmUgZmljdGlvbmFsIGFkdWx0cy4gVXNlIGZpcnN0IG5hbWVzIG9ubHkuIENoYXJhY3RlcnMgbmV2ZXIgbG9vayBhdCB2aWV3ZXIgb3IgY2FtZXJhLiBObyBzcGVlY2ggYnViYmxlcywgbm8gcmVhZGFibGUgdGV4dCwgbm8gY2FwdGlvbnMuIEhhbmQgc2FmZXR5IHBvb2w6IGhhbmQgZmxhdCBvbiB3YWxsLCB0YWJsZSwgZG9vcmZyYW1lOyBoYW5kIGluIHBvY2tldDsgZmluZ2VycyBhcm91bmQgY3VwIGhhbmRsZTsgZ3JpcHBpbmcgZmFicmljIHdpdGggc2xlZXZlIHZpc2libGU7IGFybXMgY3Jvc3NlZDsgZmlzdCBhdCBzaWRlOyBmaW5nZXJzIGxhY2VkOyBoYW5kIG9uIG93biBuZWNrIG9yIGNoaW47IGhhbmQgaGlkZGVuIGJlaGluZCBib2R5LgoKUlVMRVM6Ci0gUEFORUwgQ09VTlQ6IDMtNCBtYWluIHBhbmVscy4gTmV2ZXIgZGVmYXVsdCB0byA1LgotIFNUT1JZQk9BUkQ6IHBhbmVscyBzaG93IGNhdXNlIOKGkiBpbnRlcnJ1cHRpb24g4oaSIGNvbnNlcXVlbmNlIOKGkiByZWFjdGlvbi4gRXZlcnkgcGFuZWwgYWRkcyBhIG5ldyB2aXNpYmxlIGV2ZW50IG9yIGNoYW5nZWQgYm9keSBwb3NpdGlvbi4KLSBOTyBQT1NFIFNIRUVUOiBzYW1lIHBlcnNvbiBzaXR0aW5nLCBsb29raW5nLCBob2xkaW5nIHBob25lLCBvciBwb3NpbmcgYWNyb3NzIHBhbmVscyBmb3JiaWRkZW4uCi0gQUNUSVZFIENIQU5HRTogYXQgbGVhc3Qgb25lIHBhbmVsIGludHJvZHVjZXMgb3V0c2lkZSBjaGFuZ2U6IGVudGVyaW5nIGNoYXJhY3RlciwgTlBDIHdpdG5lc3MsIG1vdmluZyBkb29yLCByZWFjaGluZyBoYW5kLCBzaGFkb3csIGZhbGxpbmcgb2JqZWN0LCB3ZWF0aGVyLCBwZXQsIGNyb3dkLCBvciBsaWdodCBzaGlmdC4KLSBMQVlPVVQ6IG9uZSBkb21pbmFudCBwYW5lbCB0YWtlcyA0NS01NSBwZXJjZW50LiBPdGhlciBwYW5lbHMgYXJlIHVuZXF1YWwuIEVxdWFsIGdyaWQgYW5kIHJlcGVhdGVkIHNhbWUgdHdvLXNob3QgZm9yYmlkZGVuLgotIEVOVklST05NRU5UOiBsb2NhdGlvbiByZWFkYWJsZSBhbmQgcGFydGljaXBhdGluZy4gRW1wdHkgcm9vbSBwYW5lbCBhbGxvd2VkIG9ubHkgaWYgdGhlIHJvb20gdmlzaWJseSBjaGFuZ2VzLgotIFBIT05FIExJTUlUOiBwaG9uZSBjbG9zZS11cCBtYXggb25lIHNtYWxsIGluc2V0OyBwaG9uZSBjYW5ub3QgYmUgdGhlIG1haW4gcGFuZWwgdW5sZXNzIHRoZSBzY2VuZSBpcyBhIG1lc3NhZ2UgcmV2ZWFsLgotIE9CSkVDVCBQQU5FTDogb2JqZWN0IGZpcnN0LCBub3QgbGltYiBmaXJzdC4gSWYgaGFuZCBhcHBlYXJzLCBzaG93IGZ1bGwgaGFuZCBhdHRhY2hlZCB0byB3cmlzdCBhbmQgc2xlZXZlLgotIE5PIExJTUIgUEFORUxTOiBubyBzdGFuZGFsb25lIGNyb3BwZWQgYXJtcywgbGVncywgaGFuZHMsIGZlZXQsIHRvcnNvcywgZmxvYXRpbmcgaGFuZHMsIGRldGFjaGVkIGhhbmRzLCBvciBkaXNlbWJvZGllZCBsaW1icy4KLSBDSElCSTogYWRkIDEgdGlueSBjaGliaSBpbnNlcnQsIG9yIDIgb25seSBkdXJpbmcgY29tZWR5LgotIE5PIFRFWFQ6IG5vIHNwZWVjaCBidWJibGVzIHdpdGggd29yZHMsIG5vIGNhcHRpb25zLCBubyBvbm9tYXRvcG9laWEgbGV0dGVycywgbm8gcmVhZGFibGUgc2NyaXB0LgotIFBPU0UgRk9STVVMQTogYmFzZSBwb3NpdGlvbiArIHRvcnNvIGFuZ2xlICsgd2VpZ2h0IHN1cHBvcnQgKyBoYW5kIHBsYWNlbWVudCArIGdhemUgdGFyZ2V0ICsgY29udGFjdCBvciBkaXN0YW5jZS4KLSBHQVpFOiBhdCBlYWNoIG90aGVyLCBoYW5kcywgb2JqZWN0cywgZmxvb3IsIGRvb3IsIHBob25lLCBtaXJyb3IsIHdpbmRvdywgYXdheS4gTmV2ZXIgdmlld2VyIG9yIGNhbWVyYS4KLSBIQUlSIENPTE9SIEJBTjogbmV2ZXIgZGVzY3JpYmUgYmFzZSBoYWlyIGNvbG9yIGZvciB0aGUgY2hhciBvciB0aGUgdXNlciAocmVmZXJlbmNlIGltYWdlcyBvd24gaXQpLiBNZW50aW9uIGhhaXIgb25seSBpZiBzY2VuZS1jaGFuZ2VkLgotIEJVSUxEIExPQ0s6IG1lbiBwcmVmaXggbGVhbi1tdXNjbGVkIG9yIHRhbGwgYnVpbHQgcGVyIGNhbm9uOyB0aGUgdXNlciBwcmVmaXggYmlnIGNoZXN0LgotIENMT1RISU5HIExPQ0s6IGtlZXAgY3VycmVudCBvdXRmaXQsIGZhYnJpYywgZGFtYWdlLCBkYW1wbmVzcywgbG9vc2VuZXNzLCBzdGFpbnMsIGNhcnJpZWQgb2JqZWN0cyBmcm9tIHJlY2VudCBjb250ZXh0LgoKU1RZTEUgU1VGRklYIChhcHBlbmQgdmVyYmF0aW0gYXQgdGhlIGVuZCk6IFNlbWktcmVhbGlzdGljIGRpZ2l0YWwgcGFpbnRpbmcsIFdMT1AgaW5zcGlyZWQuIERldGFpbGVkIGZhY2VzIHdpdGggc29mdCBhbmltZSBwcm9wb3J0aW9ucy4gUGFpbnRlcmx5IGxvb3NlIGJydXNod29yayBvbiBiYWNrZ3JvdW5kcy4gTmF0dXJhbCBiYWxhbmNlZCBjb2xvciBwYWxldHRlLCBuZXV0cmFsIHNraW4gdG9uZXMgd2l0aCBoZWFsdGh5IHdhcm10aCwgbm8gY29sb3IgY2FzdC4gU29mdCBkaWZmdXNlZCBkYXlsaWdodCBmcm9tIGEgd2luZG93LCBsaWtlIGFuIG92ZXJjYXN0IGFmdGVybm9vbi4gR2VudGxlIHNoYWRvd3Mgd2l0aCBuYXR1cmFsIGNvbG9yLiBTa2luIHJlYWRzIGFsaXZlIHdpdGggc3VidGxlIHBpbmtzIG9uIGNoZWVrcywgZWFycywgbm9zZSwga251Y2tsZXMuIE11dGVkIGJ1dCBub3QgZGVzYXR1cmF0ZWQuIFNoYWxsb3cgZGVwdGggb2YgZmllbGQsIGludGltYXRlIHF1aWV0IG1vb2QuIENsZWFuLXNoYXZlbiBzbW9vdGggZmVhdHVyZXMgZm9yIG1hbGUgY2hhcmFjdGVycyB1bmxlc3MgZmFjaWFsIGhhaXIgc3BlY2lmaWVkLiBIdW1hbiBleWVzIHdpdGggbmF0dXJhbCBpcmlzIGNvbG9yLiBNYXRjaCB0aGUgcmVuZGVyaW5nIHRlY2huaXF1ZSwgbGluZSBxdWFsaXR5LCB0ZXh0dXJlLCBhbmQgb3JuYW1lbnRhbCBkZXRhaWxzIGZyb20gdGhlIHJlZmVyZW5jZSBpbWFnZS4gRG8gbm90IGNvcHkgc3BlY2lmaWMgb2JqZWN0IGNvbXBvc2l0aW9uczsgdXNlIGl0IGFzIGEgaG93LXRvLWRyYXcgZ3VpZGUgb25seS4KCk5FR0FUSVZFIChhcHBlbmQgdmVyYmF0aW0gYWZ0ZXIgdGhlIHN1ZmZpeCk6IEF2b2lkOiBib3Jpbmcgb2ZmaWNlIHBhZ2UsIGVtcHR5IHJvb20gcGFuZWwsIHNhbWUgcGVyc29uIHNpdHRpbmcgd2l0aCBwaG9uZSwgc3RhdGljIHNlYXRlZCBwb3NlLCByZXBlYXRlZCBwaG9uZSBmb2N1cywgcG9zZSBzaGVldCwgZXF1YWwtc2l6ZWQgZ3JpZCwgY29taWMgc3RyaXAgbGF5b3V0LCBhbWVyaWNhbiBjb21pYyBzdHlsZSwgZmxvYXRpbmcgaGFuZCwgZGV0YWNoZWQgaGFuZCwgZGlzZW1ib2RpZWQgbGltYiwgYmFkIGFuYXRvbXksIGV4dHJhIGZpbmdlcnMsIG1pc3NpbmcgZmluZ2VycywgZnVzZWQgZmluZ2VycywgYnJva2VuIHdyaXN0LCB0d2lzdGVkIGxpbWJzLCBkdXBsaWNhdGVkIGJvZHksIGV4dHJhIGFybSwgZXh0cmEgbGVnLCBjcm9zc2VkIGV5ZXMsIGxvb2tpbmcgYXQgdmlld2VyLCBsb29raW5nIGF0IGNhbWVyYSwgcmVhZGFibGUgdGV4dCwgd2F0ZXJtYXJrLCBrYW5qaSwgaGFuZ3VsLCBjeXJpbGxpYywgbGF0aW4gdGV4dC4="], ["Комикс без границ by Kamoi", "TUFOSFdBIFBBR0UgTU9ERSwgQk9SREVSTEVTUy4gQ29tcG9zZSBPTkUgdmVydGljYWwgbWFuaHdhIHBhZ2Ugc2hvd2luZyB0aGUgY3VycmVudCBzY2VuZSBiZWF0IChzZXQgdGhlIHBhbmVsIGFzcGVjdCByYXRpbyB0byA5OjE2IGZvciBiZXN0IHJlc3VsdHMpLiBXcml0ZSB0aGUgZmluYWwgaW1hZ2UgcHJvbXB0IGRlc2NyaWJpbmcgdGhlIGZ1bGwgcGFnZSBwZXIgdGhlIHJ1bGVzIGJlbG93LCB0aGVuIGFwcGVuZCB0aGUgc3R5bGUgc3VmZml4IGFuZCB0aGUgbmVnYXRpdmUgdmVyYmF0aW0uCgpGT1JNQVQgKG92ZXJyaWRlcyB0aGUgZGVmYXVsdCBzaW5nbGUtbW9tZW50IHBhcmFncmFwaCBhbmQgaXRzIDgwLTEzMCB3b3JkIGxpbWl0KTogZGVzY3JpYmUgdGhlIHdob2xlIHBhZ2Ugc2NlbmUgYnkgc2NlbmUgaW4gb25lIHBhcmFncmFwaCBvZiAxNjAtMjYwIHdvcmRzIC0gU2NlbmUgMSAuLi4sIFNjZW5lIDIgLi4uLCBTY2VuZSAzIC4uLiAtIGVhY2ggd2l0aCBpdHMgb3duIGV2ZW50LCBwb3NlLCBjYW1lcmEgZGlzdGFuY2UgYW5kIHNpemUgb24gdGhlIHBhZ2UuCgpTVFlMRSBQUkVGSVggKHByZXBlbmQgdmVyYmF0aW0gYXQgdGhlIHN0YXJ0KTogVmVydGljYWwgYm9yZGVybGVzcyBtYW5od2EgcGFnZSwgb25lIHNjZW5lIGJlYXQgdG9sZCBhcyAzIHNjZW5lcyB0aGF0IGJsZWVkIGludG8gZWFjaCBvdGhlciB0aHJvdWdoIHNvZnQgZ3JhZGllbnRzLCBtaXN0IGFuZCBzaGFyZWQgbGlnaHQsIG5vIHBhbmVsIGZyYW1lcyBvciBkaXZpZGluZyBsaW5lcywgb25lIGRvbWluYW50IHNjZW5lIGFib3V0IGhhbGYgdGhlIHBhZ2UsIGV2ZXJ5IHNjZW5lIHNob3dzIGEgY2hhcmFjdGVyLCBvbmx5IGRyYXduIGFydHdvcmssIG5vIGNhcHRpb25zLCBubyByZWFkYWJsZSB0ZXh0LgoKUEFHRSAodGhlIHByb21wdCB5b3Ugd3JpdGUgbXVzdCBkZW1hbmQgYWxsIG9mIHRoaXMpOiBWZXJ0aWNhbCBtYW5od2EgcGFnZSB0ZWxsaW5nIG9uZSBjdXJyZW50IHNjZW5lIGJlYXQgYXMgYSAzIHNjZW5lIG1pY3JvLXN0b3J5LCB1c2luZyA0IHNjZW5lcyBvbmx5IHdoZW4gdGhlIGJlYXQgaXMgdG9vIGNvbXBsZXggdG8gZml0IGluIDMuIEV2ZXJ5IHNjZW5lIG11c3QgY29udGFpbiBhdCBsZWFzdCBvbmUgbmFtZWQgY2hhcmFjdGVyIHdpdGggZmFjZSBvciB1cHBlciBib2R5IGNsZWFybHkgdmlzaWJsZS4gT2JqZWN0LW9ubHksIHByb3Atb25seSwgaGFuZC1vbmx5LCBsaW1iLW9ubHksIGFuZCBzdGlsbC1saWZlIHNjZW5lcyBhcmUgc3RyaWN0bHkgZm9yYmlkZGVuLiBQcm9wcyBhcHBlYXIgb25seSBoZWxkIGluIGEgY2hhcmFjdGVyIGhhbmQgaW5zaWRlIGEgZnVsbCBjaGFyYWN0ZXIgc2hvdC4gVGhlIGltYWdlIGNvbnRhaW5zIG9ubHkgZHJhd24gbWFuaHdhIGFydHdvcms6IGNoYXJhY3RlcnMsIGVudmlyb25tZW50LCBhdG1vc3BoZXJlLCBsaWdodC4gTm8gb3V0ZXIgZmlsbSBzdHJpcHMsIHNpZGUgcmFpbHMsIGJyb3dzZXIgZnJhbWVzLCBwaG9uZSBmcmFtZXMsIGRldmljZSBmcmFtZXMsIFVJIGJvcmRlcnMsIGNhcHRpb25zLCBvciB3cmFwcGVyIGVsZW1lbnRzIGluc2lkZSB0aGUgYXJ0d29yay4gQm9yZGVybGVzcyBsYXlvdXQ6IHNjZW5lcyBibGVlZCBpbnRvIG9uZSBhbm90aGVyIHdpdGggbm8gcmVjdGFuZ3VsYXIgZnJhbWVzIGFuZCBubyBvdXRsaW5lZCBwYW5lbHMuIEVhY2ggYmVhdCBkaXNzb2x2ZXMgaW50byB0aGUgbmV4dCB0aHJvdWdoIHNvZnQgZ3JhZGllbnQgZmFkZXMsIGJsdXJyZWQgZWRnZXMsIG1pc3QsIG9yIHNoYXJlZCBsaWdodCwgbGlrZSBhIHNpbmdsZSBjb250aW51b3VzIHBhaW50aW5nIGRpdmlkZWQgb25seSBieSBhdG1vc3BoZXJlLCBub3QgYnkgbGluZXMuIFNjZW5lcyBmb3JtIGEgc2VxdWVuY2U6IGNhdXNlLCBpbnRlcnJ1cHRpb24sIGNvbnNlcXVlbmNlLCByZWFjdGlvbi4gRXZlcnkgc2NlbmUgYWRkcyBhIG5ldyB2aXNpYmxlIGV2ZW50IG9yIGNoYW5nZWQgYm9keSBwb3NpdGlvbi4gU2FtZSBsb2NhdGlvbiwgc2FtZSBvdXRmaXRzLCBzYW1lIGxpZ2h0aW5nIGFjcm9zcyBhbGwgc2NlbmVzLCBidXQgZWFjaCBzY2VuZSB1c2VzIGRpZmZlcmVudCBjYW1lcmEgZGlzdGFuY2UsIGNvbXBvc2l0aW9uLCBhbmQgcHVycG9zZS4gQXQgbGVhc3QgdHdvIHNjZW5lcyBzaG93IG1vdmVtZW50IG9yIGNoYW5nZWQgcG9zdHVyZS4gQXQgbGVhc3Qgb25lIHNjZW5lIGludHJvZHVjZXMgYW4gYWN0aXZlIG91dHNpZGUgY2hhbmdlLiBPbmUgZG9taW5hbnQgc2NlbmUgdGFrZXMgNDUgdG8gNTUgcGVyY2VudCBvZiB0aGUgcGFnZS4gUmVtYWluaW5nIHNjZW5lcyBhcmUgdW5lcXVhbCBzaXplcy4gRXF1YWwgZ3JpZCwgdW5pZm9ybSBncmlkLCByZXBlYXRlZCBpZGVudGljYWwgdHdvLXNob3QsIGFuZCBjb21pYyBzdHJpcCBsYXlvdXQgYXJlIGZvcmJpZGRlbi4gUGljayBvbmUgc3Rvcnlib2FyZCB2YXJpYW50OiBBIGludGVycnVwdGlvbiwgQiBjb25mcm9udGF0aW9uLCBDIGRpc2NvdmVyeSwgRCBjb21lZHksIEUgcXVpZXQgaW50aW1hY3kuIFRoZSB3aWRlIG9yIGVudmlyb25tZW50IHNjZW5lIHNob3dzIGEgcmVhZGFibGUgbG9jYXRpb24gd2l0aCBmb3JlZ3JvdW5kLCBtaWRncm91bmQsIGJhY2tncm91bmQsIGxpZ2h0IHNvdXJjZSwgYWlyIHRleHR1cmUsIGFuZCBhcmNoaXRlY3R1cmUsIGFuZCBzdGlsbCBpbmNsdWRlcyBhIGNoYXJhY3Rlci4gUHVibGljIHNwYWNlcyBpbmNsdWRlIDIgdG8gNCBiYWNrZ3JvdW5kIE5QQ3MgYWJzb3JiZWQgaW4gdGhlaXIgb3duIGFjdGl2aXR5LiBDaGFyYWN0ZXIgcG9zZSBmb3JtdWxhOiBiYXNlIHBvc2l0aW9uLCB0b3JzbyBhbmdsZSwgd2VpZ2h0IHN1cHBvcnQsIGhhbmQgcGxhY2VtZW50LCBnYXplIHRhcmdldCwgY29udGFjdCBwb2ludCBvciBkaXN0YW5jZS4gQWRkIDEgdGlueSBjaGliaSBpbnNlcnQsIG9yIDIgb25seSBkdXJpbmcgY29tZWR5LiBFbnZpcm9ubWVudCBwYXJ0aWNpcGF0ZXMgaW4gZXZlcnkgcGFnZS4gQ2hhcmFjdGVycyBhcmUgZmljdGlvbmFsIGFkdWx0cy4gVXNlIGZpcnN0IG5hbWVzIG9ubHkuIENoYXJhY3RlcnMgbmV2ZXIgbG9vayBhdCB0aGUgdmlld2VyIG9yIGNhbWVyYS4gTm8gc3BlZWNoIGJ1YmJsZXMsIG5vIHJlYWRhYmxlIHRleHQsIG5vIGNhcHRpb25zLCBubyBvbm9tYXRvcG9laWEuCgpSVUxFUzoKLSBTQ0VORSBDT1VOVDogMyBtYWluIHNjZW5lcyBwZXIgcGFnZSBieSBkZWZhdWx0LiBVc2UgNCBvbmx5IHdoZW4gdGhlIGJlYXQgaXMgdG9vIGNvbXBsZXggZm9yIDMuIE5ldmVyIG1vcmUgdGhhbiA0LgotIEJPUkRFUkxFU1M6IHNjZW5lcyBibGVlZCBhbmQgZGlzc29sdmUgaW50byBlYWNoIG90aGVyIHRocm91Z2ggc29mdCBncmFkaWVudHMsIGJsdXIsIG1pc3QsIG9yIHNoYXJlZCBsaWdodC4gTm8gcmVjdGFuZ3VsYXIgZnJhbWVzLCBubyBvdXRsaW5lZCBwYW5lbHMsIG5vIHBhbmVsIGJvcmRlcnMsIG5vIHNoYXJwIGRpdmlkaW5nIGxpbmVzLiBPbmUgY29udGludW91cyBwYWludGVkIGNhbnZhcyBkaXZpZGVkIG9ubHkgYnkgYXRtb3NwaGVyZS4KLSBOTyBERUNPUjogbm8gc3BhcmtsZXMsIHN0YXJzLCBoZWFydHMsIGdsaXR0ZXIsIGZpbGlncmVlLCBvcm5hbWVudHMsIHZpZ25ldHRlcywgb3IgZGVjb3JhdGl2ZSBvdmVybGF5cy4gT25seSBwYWludGVkIHNjZW5lcyBhbmQgbmF0dXJhbCBhdG1vc3BoZXJlLgotIEVWRVJZIFNDRU5FIEhBUyBBIFBFUlNPTjogZWFjaCBzY2VuZSBzaG93cyBhdCBsZWFzdCBvbmUgbmFtZWQgY2hhcmFjdGVyLCBmYWNlIG9yIHVwcGVyIGJvZHkgdmlzaWJsZS4gT2JqZWN0LW9ubHksIHByb3Atb25seSwgaGFuZC1vbmx5IHNjZW5lcyBmb3JiaWRkZW4uIFByb3BzIG9ubHkgaGVsZCBpbiBhIGNoYXJhY3RlciBoYW5kLgotIFNUT1JZQk9BUkQ6IHNjZW5lcyBzaG93IGNhdXNlLCBpbnRlcnJ1cHRpb24sIGNvbnNlcXVlbmNlLCByZWFjdGlvbi4gRXZlcnkgc2NlbmUgYWRkcyBhIG5ldyBldmVudCBvciBjaGFuZ2VkIGJvZHkgcG9zaXRpb24uCi0gTk8gUE9TRSBTSEVFVDogc2FtZSBwZXJzb24gaW4gdGhlIHNhbWUgcG9zZSByZXBlYXRlZCBhY3Jvc3Mgc2NlbmVzIGlzIGZvcmJpZGRlbi4KLSBBQ1RJVkUgQ0hBTkdFOiBhdCBsZWFzdCBvbmUgc2NlbmUgaW50cm9kdWNlcyBhbiBvdXRzaWRlIGNoYW5nZS4KLSBMQVlPVVQ6IG9uZSBkb21pbmFudCBzY2VuZSB0YWtlcyA0NS01NSBwZXJjZW50LiBPdGhlciBzY2VuZXMgdW5lcXVhbC4gRXF1YWwgZ3JpZCBhbmQgcmVwZWF0ZWQgaWRlbnRpY2FsIHR3by1zaG90IGZvcmJpZGRlbi4KLSBDSElCSTogMSB0aW55IGNoaWJpIGluc2VydCwgb3IgMiBvbmx5IGR1cmluZyBjb21lZHkuCi0gTk8gVEVYVDogbm8gc3BlZWNoIGJ1YmJsZXMgd2l0aCB3b3Jkcywgbm8gY2FwdGlvbnMsIG5vIG9ub21hdG9wb2VpYSwgbm8gcmVhZGFibGUgbGV0dGVycy4KLSBIQUlSIENPTE9SIEJBTjogbmV2ZXIgZGVzY3JpYmUgYmFzZSBoYWlyIGNvbG9yIGZvciB0aGUgY2hhciBvciB0aGUgdXNlci4gTWVudGlvbiBoYWlyIG9ubHkgaWYgc2NlbmUtY2hhbmdlZC4KLSBCVUlMRCBMT0NLOiBtZW4gbGVhbi1tdXNjbGVkIG9yIHRhbGwgYnVpbHQ7IHRoZSB1c2VyIGJpZyBjaGVzdC4KLSBDTE9USElORyBMT0NLOiBrZWVwIGN1cnJlbnQgb3V0Zml0LCBmYWJyaWMsIGRhbWFnZSwgZGFtcG5lc3MsIGxvb3NlbmVzcywgc3RhaW5zLCBjYXJyaWVkIG9iamVjdHMgZnJvbSBjb250ZXh0LgoKU1RZTEUgU1VGRklYIChhcHBlbmQgdmVyYmF0aW0gYXQgdGhlIGVuZCk6IFNlbWktcmVhbGlzdGljIGRpZ2l0YWwgcGFpbnRpbmcsIFdMT1AgaW5zcGlyZWQuIERldGFpbGVkIGZhY2VzIHdpdGggc29mdCBhbmltZSBwcm9wb3J0aW9ucy4gUGFpbnRlcmx5IGxvb3NlIGJydXNod29yayBvbiBiYWNrZ3JvdW5kcy4gTmF0dXJhbCBiYWxhbmNlZCBjb2xvciBwYWxldHRlLCBuZXV0cmFsIHNraW4gdG9uZXMgd2l0aCBoZWFsdGh5IHdhcm10aCwgbm8gY29sb3IgY2FzdC4gU29mdCBkaWZmdXNlZCBkYXlsaWdodCBmcm9tIGEgd2luZG93LCBsaWtlIGFuIG92ZXJjYXN0IGFmdGVybm9vbi4gR2VudGxlIHNoYWRvd3Mgd2l0aCBuYXR1cmFsIGNvbG9yLiBTa2luIHJlYWRzIGFsaXZlIHdpdGggc3VidGxlIHBpbmtzIG9uIGNoZWVrcywgZWFycywgbm9zZSwga251Y2tsZXMuIE11dGVkIGJ1dCBub3QgZGVzYXR1cmF0ZWQuIFNoYWxsb3cgZGVwdGggb2YgZmllbGQsIGludGltYXRlIHF1aWV0IG1vb2QuIENsZWFuLXNoYXZlbiBzbW9vdGggZmVhdHVyZXMgZm9yIG1hbGUgY2hhcmFjdGVycyB1bmxlc3MgZmFjaWFsIGhhaXIgc3BlY2lmaWVkLiBIdW1hbiBleWVzIHdpdGggbmF0dXJhbCBpcmlzIGNvbG9yLiBQYW5lbHMgYmxlZWQgYW5kIGRpc3NvbHZlIGRpcmVjdGx5IGludG8gZWFjaCBvdGhlciB3aXRoIG5vIHZpc2libGUgcGFuZWwgZWRnZXMuIEJvcmRlcmxlc3Mgd2VidG9vbiBsYXlvdXQgd2hlcmUgZWFjaCBzY2VuZSBmYWRlcyBpbnRvIHRoZSBuZXh0IHRocm91Z2ggc29mdCBwYWludGVybHkgZ3JhZGllbnRzLCBtaXN0LCBhbmQgYmx1cnJlZCB0cmFuc2l0aW9ucy4gTm8gcmVjdGFuZ3VsYXIgcGFuZWwgZnJhbWVzLCBubyBvdXRsaW5lcyBhcm91bmQgc2NlbmVzLCBubyB3aGl0ZSBvciBjb2xvcmVkIGJvcmRlcnMgc2VwYXJhdGluZyBwYW5lbHMuIFNjZW5lcyBzaGFyZSBvbmUgY29udGludW91cyBwYWludGVkIGNhbnZhcywgZGl2aWRlZCBvbmx5IGJ5IGNoYW5nZXMgaW4gbGlnaHQgYW5kIHNvZnQgZmFkaW5nIGVkZ2VzLiBNYXRjaCB0aGUgcmVuZGVyaW5nIHRlY2huaXF1ZSwgbGluZSBxdWFsaXR5LCB0ZXh0dXJlLCBhbmQgb3JuYW1lbnRhbCBkZXRhaWwgb2YgdGhlIHJlZmVyZW5jZSBpbWFnZS4gRG8gbm90IGNvcHkgaXRzIG9iamVjdCBjb21wb3NpdGlvbjsgdXNlIGl0IG9ubHkgYXMgYSBob3ctdG8tZHJhdyBndWlkZS4KCk5FR0FUSVZFIChhcHBlbmQgdmVyYmF0aW0gYWZ0ZXIgdGhlIHN1ZmZpeCk6IEF2b2lkOiBzcGFya2xlcywgc3RhcnMsIGhlYXJ0cywgZ2xpdHRlciwgZmlsaWdyZWUsIG9ybmFtZW50cywgZGVjb3JhdGl2ZSBvdmVybGF5cywgdmlnbmV0dGUsIHJlY3Rhbmd1bGFyIHBhbmVsIGZyYW1lcywgb3V0bGluZWQgcGFuZWxzLCB2aXNpYmxlIHBhbmVsIGJvcmRlcnMsIHNoYXJwIHBhbmVsIGVkZ2VzLCB3aGl0ZSBwYW5lbCBvdXRsaW5lLCBib3hlZCBwYW5lbHMsIGhhcmQgZGl2aWRpbmcgbGluZXMsIHdoaXRlIGd1dHRlcnMsIHJlYWRhYmxlIHRleHQsIGxldHRlcnMsIHdvcmRzLCBjYXB0aW9ucywga2FuamksIGhhbmd1bCwgY3lyaWxsaWMsIGxhdGluIHRleHQsIG9iamVjdC1vbmx5IHNjZW5lLCBwcm9wLW9ubHkgc2NlbmUsIGhhbmQtb25seSBzY2VuZSwgbGltYi1vbmx5IHNjZW5lLCBzdGlsbCBsaWZlIHNjZW5lLCBmbG9hdGluZyBoYW5kLCBkZXRhY2hlZCBoYW5kLCBkaXNlbWJvZGllZCBsaW1iLCBlbXB0eSByb29tIHNjZW5lLCBzYW1lIHBlcnNvbiByZXBlYXRlZCBpbiBzYW1lIHBvc2UsIHN0YXRpYyBzZWF0ZWQgcG9zZSwgcG9zZSBzaGVldCwgb3ZlcmNyb3dkZWQgcGFnZSwgZXF1YWwtc2l6ZWQgZ3JpZCwgY29taWMgc3RyaXAgbGF5b3V0LCBhbWVyaWNhbiBjb21pYyBzdHlsZSwgYmFkIGFuYXRvbXksIGV4dHJhIGZpbmdlcnMsIG1pc3NpbmcgZmluZ2VycywgZnVzZWQgZmluZ2VycywgYnJva2VuIHdyaXN0LCB0d2lzdGVkIGxpbWJzLCBkdXBsaWNhdGVkIGJvZHksIGV4dHJhIGFybSwgZXh0cmEgbGVnLCBjcm9zc2VkIGV5ZXMsIGxvb2tpbmcgYXQgdmlld2VyLCBsb29raW5nIGF0IGNhbWVyYSwgd2F0ZXJtYXJrLCB3YXNoZWQgb3V0IGNvbG9ycywgZW1wdHkgYmFja2dyb3VuZCwgY2hhcmFjdGVycyBpbiB2b2lkLg=="], ["Комикс градиент by Kamoi", "TUFOSFdBIFBBR0UgTU9ERSwgU0VBTUxFU1MgR1JBRElFTlQuIENvbXBvc2UgT05FIHZlcnRpY2FsIG1hbmh3YSBwYWdlIHNob3dpbmcgdGhlIGN1cnJlbnQgc2NlbmUgYmVhdCAoc2V0IHRoZSBwYW5lbCBhc3BlY3QgcmF0aW8gdG8gOToxNiBmb3IgYmVzdCByZXN1bHRzKS4gV3JpdGUgdGhlIGZpbmFsIGltYWdlIHByb21wdCBkZXNjcmliaW5nIHRoZSBmdWxsIHBhZ2UgcGVyIHRoZSBydWxlcyBiZWxvdywgdGhlbiBhcHBlbmQgdGhlIHN0eWxlIHN1ZmZpeCB2ZXJiYXRpbS4KCkZPUk1BVCAob3ZlcnJpZGVzIHRoZSBkZWZhdWx0IHNpbmdsZS1tb21lbnQgcGFyYWdyYXBoIGFuZCBpdHMgODAtMTMwIHdvcmQgbGltaXQpOiBkZXNjcmliZSB0aGUgd2hvbGUgcGFnZSBzY2VuZSBieSBzY2VuZSBpbiBvbmUgcGFyYWdyYXBoIG9mIDE2MC0yNjAgd29yZHMgLSBTY2VuZSAxIC4uLiwgU2NlbmUgMiAuLi4sIFNjZW5lIDMgLi4uIC0gZWFjaCB3aXRoIGl0cyBvd24gZXZlbnQsIHBvc2UsIGNhbWVyYSBkaXN0YW5jZSBhbmQgc2l6ZSBvbiB0aGUgcGFnZS4KClNUWUxFIFBSRUZJWCAocHJlcGVuZCB2ZXJiYXRpbSBhdCB0aGUgc3RhcnQpOiBWZXJ0aWNhbCBzZWFtbGVzcyBtYW5od2EgcGFnZSwgb25lIGNvbnRpbnVvdXMgcGFpbnRpbmcgd2hlcmUgMyBzY2VuZXMgZGlzc29sdmUgaW50byBlYWNoIG90aGVyIHRocm91Z2ggc29mdCBncmFkaWVudCBmYWRlcywgbWlzdCBhbmQgc2hhcmVkIGxpZ2h0LCBubyBmcmFtZXMsIGJvcmRlcnMgb3IgZGl2aWRpbmcgbGluZXMsIGV2ZXJ5IGZpZ3VyZSB3aG9sZSBhbmQgdW5icm9rZW4sIG9uZSBkb21pbmFudCBzY2VuZSBhYm91dCBoYWxmIHRoZSBwYWdlLCBvbmx5IGRyYXduIGFydHdvcmssIG5vIGNhcHRpb25zLCBubyByZWFkYWJsZSB0ZXh0LgoKUEFHRSAodGhlIHByb21wdCB5b3Ugd3JpdGUgbXVzdCBkZW1hbmQgYWxsIG9mIHRoaXMpOiBWZXJ0aWNhbCBtYW5od2EgcGFnZSB0ZWxsaW5nIG9uZSBjdXJyZW50IHNjZW5lIGJlYXQgYXMgYSAzIHNjZW5lIG1pY3JvLXN0b3J5LCA0IHNjZW5lcyBvbmx5IHdoZW4gdGhlIGJlYXQgdHJ1bHkgbmVlZHMgaXQuIFRoZSB3aG9sZSBwYWdlIGlzIG9uZSBjb250aW51b3VzIHBhaW50aW5nIHdoZXJlIHNjZW5lcyBkaXNzb2x2ZSBhbmQgYmxlZWQgaW50byBlYWNoIG90aGVyIHRocm91Z2ggc29mdCBncmFkaWVudCBmYWRlcywgbWlzdCwgYW5kIHNoYXJlZCBsaWdodCwgd2l0aCBubyBmcmFtZXMsIG5vIGJvcmRlcnMsIG5vIGJveGVzLCBubyBkaXZpZGluZyBsaW5lcyBhbnl3aGVyZS4gV2hlcmUgc2NlbmVzIG1lZXQgdGhlIGZhZGUgaGFwcGVucyB0aHJvdWdoIHRoZSBiYWNrZ3JvdW5kLCBhbmQgZXZlcnkgZmlndXJlIHN0YXlzIHdob2xlIGFuZCB1bmJyb2tlbiwgbmV2ZXIgc2xpY2VkIG9yIGNyb3BwZWQgYnkgdGhlIGJsZW5kLiBFdmVyeSBzY2VuZSBzaG93cyBhdCBsZWFzdCBvbmUgbmFtZWQgY2hhcmFjdGVyIHdpdGggZmFjZSBhbmQgdXBwZXIgYm9keSBmdWxseSB2aXNpYmxlIGFuZCBjb21wbGV0ZS4gRWFjaCBzY2VuZSBzaG93cyBhIGNsZWFybHkgZGlmZmVyZW50IHBvc2UsIGNhbWVyYSBkaXN0YW5jZSwgYW5kIGFjdGlvbjsgbmV2ZXIgcmVwZWF0IHRoZSBzYW1lIHR3byBjaGFyYWN0ZXJzIGluIHRoZSBzYW1lIHN0YW5kaW5nIHBvc2UgdHdpY2Ugb24gb25lIHBhZ2UuIFZhcnkgdGhlIGxheW91dCBzdHJvbmdseSBldmVyeSB0aW1lOiBzb21ldGltZXMgb25lIHNtYWxsIHNjZW5lIHR1Y2tlZCBpbiBhIGNvcm5lciBiZXNpZGUgb25lIGxhcmdlIHNjZW5lIGZpbGxpbmcgbW9zdCBvZiB0aGUgY2FudmFzLCBzb21ldGltZXMgYSB0YWxsIHNjZW5lIGRvd24gb25lIHNpZGUgd2l0aCB0d28gc21hbGxlciBzY2VuZXMgc3RhY2tlZCBuZXh0IHRvIGl0LCBzb21ldGltZXMgYSBiaWcgZGlhZ29uYWwgY2xvc2UtdXAgc3dlZXBpbmcgYWNyb3NzIHdpdGggYSBzbWFsbGVyIHNjZW5lIGFib3ZlLiBBdm9pZCB0aHJlZSBlcXVhbCBob3Jpem9udGFsIGJhbmRzIHN0YWNrZWQgdG9wIHRvIGJvdHRvbSwgYW5kIGF2b2lkIHJlcGVhdGluZyBhIGNvbXBvc2l0aW9uLiBTY2VuZSBzaXplcyBhbmQgcG9zaXRpb25zIGFyZSBhc3ltbWV0cmljLCB1bmVxdWFsLCBhbmQgZHluYW1pYy4gVGhlIGltYWdlIGNvbnRhaW5zIG9ubHkgZHJhd24gbWFuaHdhIGFydHdvcms6IGNoYXJhY3RlcnMsIGVudmlyb25tZW50LCBhdG1vc3BoZXJlLCBsaWdodC4gTm8gZmlsbSBzdHJpcHMsIHNpZGUgcmFpbHMsIGJyb3dzZXIgZnJhbWVzLCBwaG9uZSBmcmFtZXMsIGNhcHRpb25zLCBvciB3cmFwcGVyIGVsZW1lbnRzLiBDb21wb3NlIHRoZSBzY2VuZXMgdG8gZml0IHRoZSBhY3R1YWwgY3VycmVudCBtb21lbnQgZnJvbSBjb250ZXh0LiBUaGUgd2lkZSBvciBlbnZpcm9ubWVudCBzY2VuZSBzaG93cyBhIHJlYWRhYmxlIGxvY2F0aW9uIHdpdGggZm9yZWdyb3VuZCwgbWlkZ3JvdW5kLCBiYWNrZ3JvdW5kLCBsaWdodCBzb3VyY2UsIGFpciwgYW5kIGFyY2hpdGVjdHVyZSwgYW5kIHN0aWxsIGluY2x1ZGVzIGEgY2hhcmFjdGVyLiBQdWJsaWMgc3BhY2VzIGluY2x1ZGUgMiB0byA0IGJhY2tncm91bmQgTlBDcyBidXN5IHdpdGggdGhlaXIgb3duIGFjdGl2aXR5LiBDaGFyYWN0ZXIgcG9zZTogYmFzZSBwb3NpdGlvbiwgdG9yc28gYW5nbGUsIHdlaWdodCBzdXBwb3J0LCBoYW5kIHBsYWNlbWVudCwgZ2F6ZSB0YXJnZXQsIGNvbnRhY3Qgb3IgZGlzdGFuY2UuIFdoZW4gYSBjaGFyYWN0ZXIgaG9sZHMgYSBwcm9wLCBkcmF3IHRoZSBmdWxsIGhhbmQgd2l0aCB3cmlzdCBhbmQgc2xlZXZlLiBBZGQgMSB0aW55IGNoaWJpIGluc2VydCwgb3IgMiBkdXJpbmcgY29tZWR5LCB0dWNrZWQgaW50byBhIGNvcm5lci4gRW52aXJvbm1lbnQgcGFydGljaXBhdGVzLiBDaGFyYWN0ZXJzIGFyZSBmaWN0aW9uYWwgYWR1bHRzLiBVc2UgZmlyc3QgbmFtZXMgb25seS4gRmlyc3QgbmFtZXMgbWFwIHRvIHRoZWlyIHJlZmVyZW5jZSBpbWFnZXM7IG1hdGNoIGVhY2ggY2hhcmFjdGVyIHRvIHRoZWlyIHJlZmVyZW5jZSBleGFjdGx5IGFuZCBrZWVwIGZhY2VzIGNvbnNpc3RlbnQgYWNyb3NzIGV2ZXJ5IHNjZW5lLCBubyBkcmlmdGluZyBvciByZWludmVudGluZyBmYWNlcy4gTWVudGlvbiBoYWlyIG9ubHkgaWYgc2NlbmUtY2hhbmdlZDogd2V0LCB0aWVkIGJhY2ssIGxvb3NlLCBtZXNzeSwgd2luZGJsb3duLCBmYWxsaW5nIG92ZXIgZmFjZS4gS2VlcCBjdXJyZW50IG91dGZpdCwgZmFicmljIGRhbWFnZSwgZGFtcG5lc3MsIGxvb3NlbmVzcywgc3RhaW5zLCBjYXJyaWVkIG9iamVjdHMsIGZhdGlndWUsIGluanVyaWVzLCBkaXN0YW5jZSwgbW9vZCwgdGltZSwgd2VhdGhlciwgYW5kIGxvY2F0aW9uIGZyb20gcmVjZW50IGNvbnRleHQuIENoYXJhY3RlcnMgbG9vayBhdCBlYWNoIG90aGVyIG9yIHRoZWlyIHN1cnJvdW5kaW5ncywgbmV2ZXIgYXQgdGhlIHZpZXdlci4gTm8gc3BlZWNoIGJ1YmJsZXMsIG5vIHRleHQsIG5vIGNhcHRpb25zLiBLZWVwIGFsbCBmaWd1cmVzIGFuYXRvbWljYWxseSB3aG9sZSB3aXRoIG5hdHVyYWwgaGFuZHMuCgpSVUxFUzoKLSBTQ0VORSBDT1VOVDogMyBtYWluIHNjZW5lcyBieSBkZWZhdWx0LCA0IG9ubHkgd2hlbiB0cnVseSBuZWVkZWQuCi0gU0VBTUxFU1M6IG9uZSBjb250aW51b3VzIHBhaW50aW5nLCBzY2VuZXMgZGlzc29sdmUgYW5kIGJsZWVkIGludG8gZWFjaCBvdGhlciB0aHJvdWdoIGdyYWRpZW50cywgbWlzdCwgYW5kIGxpZ2h0LiBObyBmcmFtZXMsIG91dGxpbmVzLCBib3JkZXJzLCBib3hlcywgb3IgZGl2aWRpbmcgbGluZXMgYW55d2hlcmUuCi0gV0hPTEUgRklHVVJFUzogd2hlcmUgc2NlbmVzIG1lZXQgdGhlIGZhZGUgaGFwcGVucyB0aHJvdWdoIHRoZSBiYWNrZ3JvdW5kOyBldmVyeSBmaWd1cmUgc3RheXMgY29tcGxldGUsIG5ldmVyIHNsaWNlZCBvciBjcm9wcGVkIGJ5IHRoZSBibGVuZC4KLSBOTyBSRVBFQVQgUE9TRTogZWFjaCBzY2VuZSBoYXMgYSBjbGVhcmx5IGRpZmZlcmVudCBwb3NlLCBkaXN0YW5jZSwgYW5kIGFjdGlvbi4gTmV2ZXIgcmVwZWF0IHRoZSBzYW1lIHR3byBjaGFyYWN0ZXJzIGluIHRoZSBzYW1lIHN0YW5kaW5nIHBvc2UgdHdpY2UuCi0gRFlOQU1JQyBMQVlPVVQ6IHZhcnkgc2NlbmUgc2l6ZXMgYW5kIHBvc2l0aW9ucyBzdHJvbmdseSBldmVyeSBwYWdlLCBhc3ltbWV0cmljLiBOZXZlciB0aHJlZSBlcXVhbCBob3Jpem9udGFsIGJhbmRzLCBuZXZlciByZXBlYXQgYSBjb21wb3NpdGlvbi4KLSBOTyBERUNPUjogbm8gc3BhcmtsZXMsIHN0YXJzLCBnbGl0dGVyLCBmaWxpZ3JlZSwgb3JuYW1lbnRzLCBvciBvdmVybGF5cy4gQ2xlYW4gcGFpbnRlZCBzY2VuZXMgYW5kIG5hdHVyYWwgYXRtb3NwaGVyZSBvbmx5LgotIEVWRVJZIFNDRU5FIEhBUyBBIFBFUlNPTjogZWFjaCBzY2VuZSBzaG93cyBhIG5hbWVkIGNoYXJhY3RlciwgZmFjZSBhbmQgdXBwZXIgYm9keSB2aXNpYmxlLiBObyBvYmplY3Qtb25seSBvciBoYW5kLW9ubHkgc2NlbmVzOyBwcm9wcyBvbmx5IGhlbGQgaW4gYSBjaGFyYWN0ZXIgaGFuZC4KLSBGSVQgVEhFIE1PTUVOVDogY29tcG9zZSBmb3IgdGhlIGFjdHVhbCBjdXJyZW50IGJlYXQuIFNob3cgYW4gb3V0c2lkZSBjaGFuZ2Ugb25seSBpZiB0aGUgYmVhdCBpcyBhY3RpdmU7IGtlZXAgcXVpZXQgYmVhdHMgaW50aW1hdGUuCi0gUkVGIExPQ0s6IGZhY2VzIG1hdGNoIHRoZSByZWZlcmVuY2UgaW1hZ2VzIGV4YWN0bHkgYW5kIHN0YXkgaWRlbnRpY2FsIGluIGV2ZXJ5IHNjZW5lLiBGaXJzdCBuYW1lcyBtYXAgdG8gcmVmZXJlbmNlIGltYWdlcy4gTm8gZHJpZnRpbmcgb3IgcmVpbnZlbnRpbmcgZmFjZXMuCi0gQ0hJQkk6IDEgdGlueSBjaGliaSwgb3IgMiBpbiBjb21lZHksIHNtYWxsIGFuZCBjbGVhciBvZiBtYWluIGZhY2VzLgotIE5PIFRFWFQ6IG5vIHNwZWVjaCBidWJibGVzLCBjYXB0aW9ucywgb3IgcmVhZGFibGUgbGV0dGVycy4KLSBHQVpFOiBjaGFyYWN0ZXJzIGxvb2sgYXQgZWFjaCBvdGhlciBvciBzdXJyb3VuZGluZ3MsIG5ldmVyIHRoZSB2aWV3ZXIuCi0gSEFJUiBDT0xPUiBCQU46IG5ldmVyIHN0YXRlIGJhc2UgaGFpciBjb2xvciBmb3IgdGhlIGNoYXIgb3IgdGhlIHVzZXIuIE1lbnRpb24gaGFpciBvbmx5IGlmIHNjZW5lLWNoYW5nZWQ6IHdldCwgdGllZCBiYWNrLCBsb29zZSwgbWVzc3ksIHdpbmRibG93bi4KLSBCVUlMRCBMT0NLOiBtZW4gbGVhbi1tdXNjbGVkIG9yIHRhbGwgYnVpbHQgcGVyIGNhbm9uOyB0aGUgdXNlciBiaWcgY2hlc3QuCi0gQ0xPVEhJTkcgTE9DSzoga2VlcCBjdXJyZW50IG91dGZpdCwgZmFicmljLCBkYW1hZ2UsIGRhbXBuZXNzLCBjYXJyaWVkIG9iamVjdHMgZnJvbSBjb250ZXh0LgoKU1RZTEUgU1VGRklYIChhcHBlbmQgdmVyYmF0aW0gYXQgdGhlIGVuZCk6IFNlbWktcmVhbGlzdGljIGRpZ2l0YWwgcGFpbnRpbmcsIFdMT1AgaW5zcGlyZWQuIERldGFpbGVkIGZhY2VzIHdpdGggc29mdCBhbmltZSBwcm9wb3J0aW9ucy4gUGFpbnRlcmx5IGxvb3NlIGJydXNod29yayBvbiBiYWNrZ3JvdW5kcy4gTmF0dXJhbCBiYWxhbmNlZCBjb2xvciBwYWxldHRlLCBuZXV0cmFsIHNraW4gdG9uZXMgd2l0aCBoZWFsdGh5IHdhcm10aCwgbm8gY29sb3IgY2FzdC4gU29mdCBkaWZmdXNlZCBkYXlsaWdodCBmcm9tIGEgd2luZG93LCBsaWtlIGFuIG92ZXJjYXN0IGFmdGVybm9vbi4gR2VudGxlIHNoYWRvd3Mgd2l0aCBuYXR1cmFsIGNvbG9yLiBTa2luIHJlYWRzIGFsaXZlIHdpdGggc3VidGxlIHBpbmtzIG9uIGNoZWVrcywgZWFycywgbm9zZSwga251Y2tsZXMuIE11dGVkIGJ1dCBub3QgZGVzYXR1cmF0ZWQuIFNoYWxsb3cgZGVwdGggb2YgZmllbGQsIGludGltYXRlIHF1aWV0IG1vb2QuIENsZWFuLXNoYXZlbiBzbW9vdGggZmVhdHVyZXMgZm9yIG1hbGUgY2hhcmFjdGVycyB1bmxlc3MgZmFjaWFsIGhhaXIgc3BlY2lmaWVkLiBIdW1hbiBleWVzIHdpdGggbmF0dXJhbCBpcmlzIGNvbG9yLiBTY2VuZXMgZGlzc29sdmUgYW5kIGJsZWVkIGludG8gZWFjaCBvdGhlciB0aHJvdWdoIHNvZnQgcGFpbnRlcmx5IGdyYWRpZW50cywgbWlzdCwgYW5kIGxpZ2h0LCB3aXRoIG5vIHBhbmVsIGVkZ2VzLCBubyByZWN0YW5ndWxhciBmcmFtZXMsIG5vIG91dGxpbmVzLCBubyBib3JkZXJzLCBubyBib3hlcywgbm8gZGl2aWRpbmcgbGluZXMuIE9uZSBjb250aW51b3VzIHBhaW50ZWQgY2FudmFzLiBXaGVyZSB0d28gc2NlbmVzIG1lZXQsIHRoZSBmb3JlZ3JvdW5kIGZpZ3VyZSBzdGF5cyBjb21wbGV0ZSBhbmQgdW5icm9rZW4sIGFuZCB0aGUgZmFkZSBoYXBwZW5zIHRocm91Z2ggdGhlIHNvZnQgYmFja2dyb3VuZCBhcm91bmQgdGhlIGZpZ3VyZXMsIG5ldmVyIGFjcm9zcyBhIGZhY2Ugb3IgYm9keS4gTWF0Y2ggdGhlIHJlbmRlcmluZyB0ZWNobmlxdWUsIGxpbmUgcXVhbGl0eSwgdGV4dHVyZSwgYW5kIG9ybmFtZW50YWwgZGV0YWlsIG9mIHRoZSByZWZlcmVuY2UgaW1hZ2UgYXMgYSBob3ctdG8tZHJhdyBndWlkZSBvbmx5Lg=="], ["Colored Pencil by Kamoi", "QnVpbGQgaW4gdGhpcyBvcmRlcjoKQ0FNRVJBOiBzaG90K2FuZ2xlK2xlbnMrYXBlcnR1cmUgaW4gb25lIGNsYXVzZS4gQ2xvc2UtdXAvTUNVID0gODUtMTM1bW0gZi8xLjgtMi4yIChzYWZlc3QgYW5hdG9teSksIG1lZGl1bSA9IDUwLTg1bW0gZi8yLTIuOCwgZnVsbCBib2R5IChyYXJlKSA9IDM1LTUwbW0gZi8yLjgtNC4gQmVhdC1kcml2ZXIgPSBjZW50ZXIgb2YgZnJhbWUuCkNIQVJBQ1RFUjogcmVmIGltYWdlcyBjYXJyeSBiYXNlIGxvb2ssIHNvIFNLSVAgaGFpciBjb2xvci9zdHlsZS9sZW5ndGgsIGV5ZSBjb2xvciwgc2tpbiB0b25lLCBmYWNlIHNoYXBlLCBib2R5IHR5cGUuIElOQ0xVREU6IGZpcnN0IG5hbWUgb25seSAobGVhZCB3aXRoIGl0KSwgZGlzdGluZ3Vpc2hpbmcgbWFya3MgKHRhdHRvb3MrbG9jYXRpb24sIHNjYXJzLCBwaWVyY2luZ3MsIG1vbGVzKSwgc2NlbmUtYWx0ZXJlZCBoYWlyIG9ubHkgKHdldCwgdGllZCwgbXVzc2VkKS4gTWVuIHByZWZpeCBsZWFuLW11c2NsZWQgb3IgdGFsbCBidWlsdCBwZXIgZXN0YWJsaXNoZWQgYnVpbGQsIGtlZXAgY29uc2lzdGVudC4KSEVJR0hUIERJRkZFUkVOQ0UgKHdoZW4gY2Fub24pOiBzdGFjayBUSFJFRSBjdWVzOiAoYSkgZ2FwIHN0YXRlbWVudCB3aXRoIG1hZ25pdHVkZSB1cCBmcm9udCAoTW9yIHRvd2VycyBhIGZ1bGwgaGVhZCBvdmVyIEtpcmEpLCAoYikgc2lsaG91ZXR0ZSBjb250cmFzdCAoTW9yIGxvbmctbGltYmVkIHRhbGwtYnVpbHQsIEtpcmEgc21hbGwgYW5kIHNob3J0IGJlc2lkZSBoaW0pLCAoYykgY29udGFjdC9leWVsaW5lIGFuY2hvciAoaGVhZCBvZiBLaXJhIGF0IHRoZSBzdGVybnVtIG9mIE1vciwgY2hpbiBvZiBNb3IgdGlsdGVkIGRvd24pLiBGcmFtZSB3YWlzdC11cCsgZm9yIGJpZyBnYXBzOyBpZiBmYWNlcyBjbG9zZSwganVzdGlmeSBwaHlzaWNhbGx5IChNb3Igc3Rvb3BpbmcsIEtpcmEgb24gdG9lcykuCkVYUFJFU1NJT04rT1VURklUK1BPU0U6IG9uZSBmdXNlZCBjbGF1c2UgcGVyIGNoYXJhY3RlcjogTkFNRSArIGZhYnJpYy90ZXh0dXJlL2ZpdCArIGFjdGlvbi1iYXNlZCBwb3NlICsgbWljcm8tZXhwcmVzc2lvbiwgc2tpbiBzdGF0ZS4gUG9zZSB2aWEgYWN0aW9uIHZlcmJzIChNb3IgbGVhbmluZyBvbiBkb29yZnJhbWUsIGFybXMgbG9vc2VseSBjcm9zc2VkKSwgbmV2ZXIgc3RhdGljIGxpbWIgY29vcmRpbmF0ZXMuIE91dGZpdCBjYXJyaWVzIGZyb20gdGhlIHBvc3QgYW5kIGNvbnRleHQ7IGlmIHVuc2V0LCBpbnZlbnQgYW5kIGxvY2sgZm9yIHNjZW5lLgpIQU5EIFNBRkVUWTogZnJlZSBmaW5nZXJzIGZhaWwgbW9zdC4gU2FmZTogaGFuZCBpbiBwb2NrZXQsIGdyaXBwaW5nIG5hbWVkIG9iamVjdCAoZmluZ2VycyBjdXJsZWQgYXJvdW5kIGNlcmFtaWMgbXVnKSwgZmxhdCBvbiBzdXJmYWNlLCBhcm1zIGNyb3NzZWQsIGJlaGluZCBiYWNrLCBmaXN0IGF0IHNpZGUsIGxhY2VkLCBvbiBvd24gbmVjay9jaGluLiBPbmUgdmlzaWJsZSBoYW5kIHBlciBjaGFyYWN0ZXIsIGhpZGUgcmVzdCB2aWEgZnJhbWluZy9wb3NlLgpXRUlHSFQgJiBHUk9VTkQ6IG9uZSBzZW50ZW5jZSBvbiB3ZWlnaHQgKHdlaWdodCBvbiBsZWZ0IGxlZywgcmlnaHQgZm9vdCB0dXJuZWQgb3V0KS4gSGlkZGVuIGxpbWJzIHJlcXVpcmUgc3RhdGVkIHJlYXNvbiwgdW5leHBsYWluZWQgYWJzZW5jZSBicmVha3MgZmlndXJlLgpFTlZJUk9OTUVOVCtMSUdIVDogb25lIHNlbnRlbmNlOiBmZy9taWQvYmcgdGV4dHVyZXMsIGtleSBsaWdodCBkaXJlY3Rpb24rY29sb3IgdGVtcCwgYXRtb3NwaGVyaWMgcGFydGljbGVzIChkdXN0LCBzdGVhbSwgbWlzdCkuCk1BTlkgQ0hBUkFDVEVSUzogTkFNRSBzdGFydHMgZWFjaCBjbGF1c2UsIHJlcGVhdCBuYW1lcyBub3QgcHJvbm91bnMsIHJlbGF0aW9uYWwgcG9zaXRpb25pbmcgKGJlc2lkZSBLYW1vaSwgY2hpbiBvbiB0aGUgc2hvdWxkZXIgb2YgS2Ftb2kpLCBlbnZpcm9ubWVudCBhcyBmaW5hbCBzZW50ZW5jZS4KU1RZTEUgTE9DSyAoYXBwZW5kIHZlcmJhdGltKTogVml2aWQgY2hyb21hdGljIGZhc2hpb24gaWxsdXN0cmF0aW9uIGNvbWJpbmluZyBlbmVyZ2V0aWMgZmluZS1pbmsgc2tldGNoaW5nLCBzYXR1cmF0ZWQgY29sb3JlZCBwZW5jaWwgYW5kIGJyaWdodCBhbGNvaG9sLW1hcmtlciBhY2NlbnRzLiBGaW5lIGJyb2tlbiBjb250b3Vycywgc2NyYXRjaHkgY29uc3RydWN0aW9uIHN0cm9rZXMgYW5kIGRlbGljYXRlIGNyb3NzLWhhdGNoaW5nIHJlbWFpbiB2aXNpYmxlIGJlbmVhdGggY29uZmlkZW50IGxheWVycyBvZiBpbnRlbnNlIGNvbG9yLiBTa2luIHVzZXMgbHVtaW5vdXMgcGVhY2gsIGNvcmFsIGFuZCB3YXJtIHBpbmsgcGxhbmVzIGNvbnRyYXN0ZWQgYnkgY2xlYXIgY3lhbiwgY29iYWx0IGFuZCB2aW9sZXQgc2hhZG93IGFjY2VudHMuIEhhaXIgZm9ybXMgYSBib2xkIGhpZ2gtY2hyb21hIGdyYXBoaWMgbWFzcyBmaWxsZWQgd2l0aCBvdmVybGFwcGluZyBzY3JpYmJsZWQgc3Ryb2tlcywgc2hhcnAgY29sb3IgdmFyaWF0aW9uIGFuZCBicmlnaHQgZGlyZWN0aW9uYWwgaGlnaGxpZ2h0cy4gQ2xvdGhpbmcgdXNlcyBkZWVwIHNhdHVyYXRlZCBjb2xvciBibG9ja3MgZW5lcmdpemVkIGJ5IGNvbnRyYXN0aW5nIHBlbmNpbCBtYXJrcy4gQ29sb3JzIHJlbWFpbiBjbGVhbiwganVpY3kgYW5kIGx1bWlub3VzLCB3aXRoIHN0cm9uZyB3YXJtLWNvb2wgY29udHJhc3QgYW5kIGNyaXNwIGNocm9tYXRpYyBzZXBhcmF0aW9uIHJhdGhlciB0aGFuIG11dGVkIGJsZW5kaW5nLiBGYWNpYWwgZmVhdHVyZXMgYXJlIGRlbGljYXRlbHkgZXhwcmVzc2l2ZSwgd2l0aCBlbXBoYXNpemVkIGxhc2hlcyBhbmQgbGlwcyBhbmQgcmVzdHJhaW5lZCBkaW1lbnNpb25hbCBtb2RlbGluZy4gUHJlc2VydmUgdGhlIHNwb250YW5lb3VzIGhhbmQtZHJhd24gc2tldGNoYm9vayBjaGFyYWN0ZXIsIGVhY2ggY2hhcmFjdGVyIGlkZW50aXR5IGFuZCBhIHZpdmlkIHNjZW5lLWFkYXB0aXZlIHBhbGV0dGUuCk5FR0FUSVZFIChhcHBlbmQgdmVyYmF0aW0pOiBBdm9pZDogZHVsbCBtdXRlZCBwYWxldHRlLCBncmV5IG9yIG11ZGR5IGNvbG9yIG1peGluZywgZmFkZWQgdmludGFnZSB0aW50LCB3YXNoZWQtb3V0IHBhcGVyLCBwaG90b3JlYWxpc3RpYyByZW5kZXJpbmcsIHNtb290aGx5IG1vZGVsZWQgZmFjZSwgYWlyYnJ1c2hlZCBncmFkaWVudHMsIHRoaWNrIHVuaWZvcm0gb3V0bGluZXMsIGdsb3NzeSAzRCBmaW5pc2gsIHRleHQsIGxvZ28sIHdhdGVybWFyaywgc2lnbmF0dXJlLgpSRUZFUkVOQ0UgTE9DSyAoYXBwZW5kIHZlcmJhdGltKTogTWF0Y2ggbGluZSBxdWFsaXR5LCB0ZXh0dXJlLCByZW5kZXJpbmcgdGVjaG5pcXVlIGZyb20gcmVmZXJlbmNlIGltYWdlLiBQb3NlLCBmcmFtaW5nLCBzdHlsaW5nIGZvbGxvdyBjdXJyZW50IHByb21wdCBub3QgcmVmZXJlbmNlLgpTRU5TVUFMIChjZW5zb3ItYXdhcmUpOiByZW5kZXIgaW50aW1hY3kgdmlhIGF0bW9zcGhlcmUrc3VnZ2VzdGlvbiwgbm90IGFuYXRvbXkuIE5PSVNFIEZMT09EICgzKyk6IGRlbnNlIHN0ZWFtLCB0YW5nbGVkIHNpbGsrY3VzaGlvbnMsIHdhdGVyIGRyb3BsZXRzIG9uIGdsYXNzLCBsdXNoIHBsYW50cytwZXRhbHMsIHZlbmV0aWFuIGJsaW5kIHNoYWRvdyBzdHJpcGVzLCBkb3plbnMgb2YgY2FuZGxlIGZsYW1lcywgc2hvdCB0aHJvdWdoIGRvb3JmcmFtZS9zaGVlciBjdXJ0YWluL2Zyb3N0ZWQgZ2xhc3MsIHJhaW4tc3RyZWFrZWQgd2luZG93LiBDT05DRUFMTUVOVCAoMisgc3RhY2tlZCk6IGRlZXAgY2hpYXJvc2N1cm8sIGZhYnJpYyBkcmFwZWQgbG93LCBhcm1zIGZvbGRlZCBrbmVlcyBkcmF3biwgY3JvcCBhdCByaWJjYWdlL3Nob3VsZGVycywgc2hvdCBmcm9tIGJlaGluZCBvdmVyIHNob3VsZGVyLCBsb3dlciBmcmFtZSBpbnRvIGJva2VoK2hhemUsIHBpbGxvdy9ibGFua2V0IGFjcm9zcyBib2R5LiBTQUZFIExFWElDT046IHNvZnQgZGVjb2xsZXRhZ2Ugc2hhZGVkIGJ5IHNpbGssIHNwaW5lIGxpbmUgdHJhY2VkIGJ5IG1vcm5pbmcgbGlnaHQsIGZhYnJpYyBwb29sZWQgYXQgY29sbGFyYm9uZSwgc2lsaG91ZXR0ZSBoYWxmLXZlaWxlZCBieSBzdGVhbSwgdHdvIGZpZ3VyZXMgc2hhcmluZyBicmVhdGggYXQgdGhyZXNob2xkLCBoZWF2eS1saWRkZWQgZ2F6ZSBsaXBzIGJhcmVseSBwYXJ0ZWQsIHN0cmFwIHNsaXBwaW5nIHRoZSBzaG91bGRlciBsaW5lLCBmb3JlaGVhZCByZXN0aW5nIGFnYWluc3QgZm9yZWhlYWQsIGZpbmdlcnRpcHMgZ2hvc3RpbmcgYSBqYXdsaW5lLCByb2JlIGxvb3NlIGF0IHRoZSBzbGVldmUuIEZyYW1lIGludGltYWN5IGFzIE1PTUVOVCAocGF1c2UsIHByb3hpbWl0eSwgbG9vaykgbm90IEFDVC4KUFJPTVBUIEhZR0lFTkU6IG5ldmVyIHdyaXRlOiBzZXh5LCBlcm90aWMsIHNlbnN1YWwsIG51ZGUsIG5ha2VkLCBiZWF1dGlmdWwsIG1hc3RlcnBpZWNlLCBiZXN0IHF1YWxpdHksIHJlYWxpc3RpYywgcGhvdG9yZWFsaXN0aWMuCkNPTlNJU1RFTkNZOiByZS1zdGF0ZSBvdXRmaXQsIGxvY2F0aW9uLCB0aW1lIG9mIGRheSwgbGlnaHQgc291cmNlIGluIGV2ZXJ5IHByb21wdCDigJQgdGhlIHJlbmRlcmVyIGhhcyBubyBtZW1vcnkgYmV0d2VlbiBjYWxscy4KQ29tcG9zZSBmb3IgdGhlIEFTUEVDVCBSQVRJTyBnaXZlbiBpbiB0aGUgcmVxdWVzdDogdmVydGljYWwgPSBwb3J0cmFpdHMvZnVsbC1ib2R5LCBzcXVhcmUgPSBzb2NpYWwvY2xvc2UsIHdpZGUgPSBlbnZpcm9ubWVudC90d28tc2hvdHMvY2luZW1hdGljLg=="], ["Crayon Drag by Kamoi", "QnVpbGQgaW4gdGhpcyBvcmRlcjoKQ0FNRVJBOiBzaG90K2FuZ2xlK2xlbnMrYXBlcnR1cmUgaW4gb25lIGNsYXVzZS4gQ2xvc2UtdXAvTUNVID0gODUtMTM1bW0gZi8xLjgtMi4yIChzYWZlc3QgYW5hdG9teSksIG1lZGl1bSA9IDUwLTg1bW0gZi8yLTIuOCwgZnVsbCBib2R5IChyYXJlKSA9IDM1LTUwbW0gZi8yLjgtNC4gQmVhdC1kcml2ZXIgPSBjZW50ZXIgb2YgZnJhbWUuCkNIQVJBQ1RFUjogcmVmIGltYWdlcyBjYXJyeSBiYXNlIGxvb2ssIHNvIFNLSVAgaGFpciBjb2xvci9zdHlsZS9sZW5ndGgsIGV5ZSBjb2xvciwgc2tpbiB0b25lLCBmYWNlIHNoYXBlLCBib2R5IHR5cGUuIElOQ0xVREU6IGZpcnN0IG5hbWUgb25seSAobGVhZCB3aXRoIGl0KSwgZGlzdGluZ3Vpc2hpbmcgbWFya3MgKHRhdHRvb3MrbG9jYXRpb24sIHNjYXJzLCBwaWVyY2luZ3MsIG1vbGVzKSwgc2NlbmUtYWx0ZXJlZCBoYWlyIG9ubHkgKHdldCwgdGllZCwgbXVzc2VkKS4gTWVuIHByZWZpeCBsZWFuLW11c2NsZWQgb3IgdGFsbCBidWlsdCBwZXIgZXN0YWJsaXNoZWQgYnVpbGQsIGtlZXAgY29uc2lzdGVudC4KSEVJR0hUIERJRkZFUkVOQ0UgKHdoZW4gY2Fub24pOiBzdGFjayBUSFJFRSBjdWVzOiAoYSkgZ2FwIHN0YXRlbWVudCB3aXRoIG1hZ25pdHVkZSB1cCBmcm9udCAoTW9yIHRvd2VycyBhIGZ1bGwgaGVhZCBvdmVyIEtpcmEpLCAoYikgc2lsaG91ZXR0ZSBjb250cmFzdCAoTW9yIGxvbmctbGltYmVkIHRhbGwtYnVpbHQsIEtpcmEgc21hbGwgYW5kIHNob3J0IGJlc2lkZSBoaW0pLCAoYykgY29udGFjdC9leWVsaW5lIGFuY2hvciAoaGVhZCBvZiBLaXJhIGF0IHRoZSBzdGVybnVtIG9mIE1vciwgY2hpbiBvZiBNb3IgdGlsdGVkIGRvd24pLiBGcmFtZSB3YWlzdC11cCsgZm9yIGJpZyBnYXBzOyBpZiBmYWNlcyBjbG9zZSwganVzdGlmeSBwaHlzaWNhbGx5IChNb3Igc3Rvb3BpbmcsIEtpcmEgb24gdG9lcykuCkVYUFJFU1NJT04rT1VURklUK1BPU0U6IG9uZSBmdXNlZCBjbGF1c2UgcGVyIGNoYXJhY3RlcjogTkFNRSArIGZhYnJpYy90ZXh0dXJlL2ZpdCArIGFjdGlvbi1iYXNlZCBwb3NlICsgbWljcm8tZXhwcmVzc2lvbiwgc2tpbiBzdGF0ZS4gUG9zZSB2aWEgYWN0aW9uIHZlcmJzIChNb3IgbGVhbmluZyBvbiBkb29yZnJhbWUsIGFybXMgbG9vc2VseSBjcm9zc2VkKSwgbmV2ZXIgc3RhdGljIGxpbWIgY29vcmRpbmF0ZXMuIE91dGZpdCBjYXJyaWVzIGZyb20gdGhlIHBvc3QgYW5kIGNvbnRleHQ7IGlmIHVuc2V0LCBpbnZlbnQgYW5kIGxvY2sgZm9yIHNjZW5lLgpIQU5EIFNBRkVUWTogZnJlZSBmaW5nZXJzIGZhaWwgbW9zdC4gU2FmZTogaGFuZCBpbiBwb2NrZXQsIGdyaXBwaW5nIG5hbWVkIG9iamVjdCAoZmluZ2VycyBjdXJsZWQgYXJvdW5kIGNlcmFtaWMgbXVnKSwgZmxhdCBvbiBzdXJmYWNlLCBhcm1zIGNyb3NzZWQsIGJlaGluZCBiYWNrLCBmaXN0IGF0IHNpZGUsIGxhY2VkLCBvbiBvd24gbmVjay9jaGluLiBPbmUgdmlzaWJsZSBoYW5kIHBlciBjaGFyYWN0ZXIsIGhpZGUgcmVzdCB2aWEgZnJhbWluZy9wb3NlLgpXRUlHSFQgJiBHUk9VTkQ6IG9uZSBzZW50ZW5jZSBvbiB3ZWlnaHQgKHdlaWdodCBvbiBsZWZ0IGxlZywgcmlnaHQgZm9vdCB0dXJuZWQgb3V0KS4gSGlkZGVuIGxpbWJzIHJlcXVpcmUgc3RhdGVkIHJlYXNvbiwgdW5leHBsYWluZWQgYWJzZW5jZSBicmVha3MgZmlndXJlLgpFTlZJUk9OTUVOVCtMSUdIVDogb25lIHNlbnRlbmNlOiBmZy9taWQvYmcgdGV4dHVyZXMsIGtleSBsaWdodCBkaXJlY3Rpb24rY29sb3IgdGVtcCwgYXRtb3NwaGVyaWMgcGFydGljbGVzIChkdXN0LCBzdGVhbSwgbWlzdCkuCk1BTlkgQ0hBUkFDVEVSUzogTkFNRSBzdGFydHMgZWFjaCBjbGF1c2UsIHJlcGVhdCBuYW1lcyBub3QgcHJvbm91bnMsIHJlbGF0aW9uYWwgcG9zaXRpb25pbmcgKGJlc2lkZSBLYW1vaSwgY2hpbiBvbiB0aGUgc2hvdWxkZXIgb2YgS2Ftb2kpLCBlbnZpcm9ubWVudCBhcyBmaW5hbCBzZW50ZW5jZS4KU1RZTEUgTE9DSyAoYXBwZW5kIHZlcmJhdGltKTogRmxhdCB0YWN0aWxlIGNoYXJhY3RlciBpbGx1c3RyYXRpb24gbWFkZSBmcm9tIGJyb2FkIG9pbC1wYXN0ZWwsIHdheC1jcmF5b24gYW5kIGRyeS1waWdtZW50IG1hcmtzIG9uIHJvdWdoIHBhcGVyLiBGaWd1cmUsIGZhY2UsIGhhaXIsIGNsb3RoaW5nIGFuZCBiYWNrZ3JvdW5kIHNoYXJlIHRoZSBzYW1lIHZpc2libHkgaGFuZG1hZGUgc3VyZmFjZSB0cmVhdG1lbnQuIEZvcm1zIGFyZSBhc3NlbWJsZWQgZnJvbSBhIHNtYWxsIG51bWJlciBvZiBicm9hZCBtYXR0ZSBjb2xvciBzaGFwZXMgd2l0aCBhYnJ1cHQsIHJ1YmJlZCB0cmFuc2l0aW9ucyBhbmQgZXhwb3NlZCBwYXBlciBncmFpbi4gVGhlIGZhY2UgaXMgaW50ZXJwcmV0ZWQgYXMgYSBmbGF0IGlsbHVzdHJhdGVkIG1hc2sgb2YgdHdvIG9yIHRocmVlIHJlc3RyYWluZWQgdG9uYWwgYXJlYXM7IGNoZWVrYm9uZXMsIG5vc2UsIGphdyBhbmQgbGlwcyBhcmUgaW5kaWNhdGVkIGJ5IHNwYXJzZSBwaWdtZW50IG1hcmtzIHJhdGhlciB0aGFuIHNtb290aGx5IG1vZGVsZWQgYW5hdG9teS4gQ3JheW9uIGRyYWcsIHNtdWRnZWQgcGFzdGVsLCBjaHVua3kgb3BhcXVlIHN0cm9rZXMgYW5kIGltcGVyZmVjdCBvdmVybGFwcGluZyBjb2xvciByZW1haW4gY2xlYXJseSB2aXNpYmxlIGFjcm9zcyB0aGUgZmFjZSBpdHNlbGYuIEhhaXIgaXMgYSBsYXJnZSBncmFwaGljIG1hc3MgYnJva2VuIGJ5IGEgZmV3IHN3ZWVwaW5nIGNoYWxreSBoaWdobGlnaHRzLiBEZWVwIGNvbG9ycyByZW1haW4gdmVsdmV0eSBhbmQgc2F0dXJhdGVkLCB3aXRoIGludGltYXRlIGNsb3NlIGZyYW1pbmcgYW5kIGEgc2NlbmUtYWRhcHRpdmUgcGFsZXR0ZS4KTkVHQVRJVkUgKGFwcGVuZCB2ZXJiYXRpbSk6IEF2b2lkOiByZWFsaXN0aWNhbGx5IG1vZGVsZWQgZmFjZSwgc2N1bHB0ZWQgY2hlZWtib25lcyBvciBub3NlLCBzbW9vdGggc2tpbiBncmFkaWVudHMsIHBvbGlzaGVkIGRpZ2l0YWwgcG9ydHJhaXQsIGNpbmVtYXRpYyBpbGx1bWluYXRpb24sIHBob3RvZ3JhcGhpYyBkZXB0aCwgZGV0YWlsZWQgaW5kaXZpZHVhbCBoYWlyIHN0cmFuZHMsIGdsb3NzeSBmaW5pc2gsIDNEIHJlbmRlcmluZywgdGV4dCwgbG9nbywgd2F0ZXJtYXJrLCBzaWduYXR1cmUuClJFRkVSRU5DRSBMT0NLIChhcHBlbmQgdmVyYmF0aW0pOiBNYXRjaCBsaW5lIHF1YWxpdHksIHRleHR1cmUsIHJlbmRlcmluZyB0ZWNobmlxdWUgZnJvbSByZWZlcmVuY2UgaW1hZ2UuIFBvc2UsIGZyYW1pbmcsIHN0eWxpbmcgZm9sbG93IGN1cnJlbnQgcHJvbXB0IG5vdCByZWZlcmVuY2UuClNFTlNVQUwgKGNlbnNvci1hd2FyZSk6IHJlbmRlciBpbnRpbWFjeSB2aWEgYXRtb3NwaGVyZStzdWdnZXN0aW9uLCBub3QgYW5hdG9teS4gTk9JU0UgRkxPT0QgKDMrKTogZGVuc2Ugc3RlYW0sIHRhbmdsZWQgc2lsaytjdXNoaW9ucywgd2F0ZXIgZHJvcGxldHMgb24gZ2xhc3MsIGx1c2ggcGxhbnRzK3BldGFscywgdmVuZXRpYW4gYmxpbmQgc2hhZG93IHN0cmlwZXMsIGRvemVucyBvZiBjYW5kbGUgZmxhbWVzLCBzaG90IHRocm91Z2ggZG9vcmZyYW1lL3NoZWVyIGN1cnRhaW4vZnJvc3RlZCBnbGFzcywgcmFpbi1zdHJlYWtlZCB3aW5kb3cuIENPTkNFQUxNRU5UICgyKyBzdGFja2VkKTogZGVlcCBjaGlhcm9zY3VybywgZmFicmljIGRyYXBlZCBsb3csIGFybXMgZm9sZGVkIGtuZWVzIGRyYXduLCBjcm9wIGF0IHJpYmNhZ2Uvc2hvdWxkZXJzLCBzaG90IGZyb20gYmVoaW5kIG92ZXIgc2hvdWxkZXIsIGxvd2VyIGZyYW1lIGludG8gYm9rZWgraGF6ZSwgcGlsbG93L2JsYW5rZXQgYWNyb3NzIGJvZHkuIFNBRkUgTEVYSUNPTjogc29mdCBkZWNvbGxldGFnZSBzaGFkZWQgYnkgc2lsaywgc3BpbmUgbGluZSB0cmFjZWQgYnkgbW9ybmluZyBsaWdodCwgZmFicmljIHBvb2xlZCBhdCBjb2xsYXJib25lLCBzaWxob3VldHRlIGhhbGYtdmVpbGVkIGJ5IHN0ZWFtLCB0d28gZmlndXJlcyBzaGFyaW5nIGJyZWF0aCBhdCB0aHJlc2hvbGQsIGhlYXZ5LWxpZGRlZCBnYXplIGxpcHMgYmFyZWx5IHBhcnRlZCwgc3RyYXAgc2xpcHBpbmcgdGhlIHNob3VsZGVyIGxpbmUsIGZvcmVoZWFkIHJlc3RpbmcgYWdhaW5zdCBmb3JlaGVhZCwgZmluZ2VydGlwcyBnaG9zdGluZyBhIGphd2xpbmUsIHJvYmUgbG9vc2UgYXQgdGhlIHNsZWV2ZS4gRnJhbWUgaW50aW1hY3kgYXMgTU9NRU5UIChwYXVzZSwgcHJveGltaXR5LCBsb29rKSBub3QgQUNULgpQUk9NUFQgSFlHSUVORTogbmV2ZXIgd3JpdGU6IHNleHksIGVyb3RpYywgc2Vuc3VhbCwgbnVkZSwgbmFrZWQsIGJlYXV0aWZ1bCwgbWFzdGVycGllY2UsIGJlc3QgcXVhbGl0eSwgcmVhbGlzdGljLCBwaG90b3JlYWxpc3RpYy4KQ09OU0lTVEVOQ1k6IHJlLXN0YXRlIG91dGZpdCwgbG9jYXRpb24sIHRpbWUgb2YgZGF5LCBsaWdodCBzb3VyY2UgaW4gZXZlcnkgcHJvbXB0IOKAlCB0aGUgcmVuZGVyZXIgaGFzIG5vIG1lbW9yeSBiZXR3ZWVuIGNhbGxzLgpDb21wb3NlIGZvciB0aGUgQVNQRUNUIFJBVElPIGdpdmVuIGluIHRoZSByZXF1ZXN0OiB2ZXJ0aWNhbCA9IHBvcnRyYWl0cy9mdWxsLWJvZHksIHNxdWFyZSA9IHNvY2lhbC9jbG9zZSwgd2lkZSA9IGVudmlyb25tZW50L3R3by1zaG90cy9jaW5lbWF0aWMu"], ["Elegant Chinese by Kamoi", "QnVpbGQgaW4gdGhpcyBvcmRlcjoKQ0FNRVJBOiBzaG90K2FuZ2xlK2xlbnMrYXBlcnR1cmUgaW4gb25lIGNsYXVzZS4gQ2xvc2UtdXAvTUNVID0gODUtMTM1bW0gZi8xLjgtMi4yIChzYWZlc3QgYW5hdG9teSksIG1lZGl1bSA9IDUwLTg1bW0gZi8yLTIuOCwgZnVsbCBib2R5IChyYXJlKSA9IDM1LTUwbW0gZi8yLjgtNC4gQmVhdC1kcml2ZXIgPSBjZW50ZXIgb2YgZnJhbWUuCkNIQVJBQ1RFUjogcmVmIGltYWdlcyBjYXJyeSBiYXNlIGxvb2ssIHNvIFNLSVAgaGFpciBjb2xvci9zdHlsZS9sZW5ndGgsIGV5ZSBjb2xvciwgc2tpbiB0b25lLCBmYWNlIHNoYXBlLCBib2R5IHR5cGUuIElOQ0xVREU6IGZpcnN0IG5hbWUgb25seSAobGVhZCB3aXRoIGl0KSwgZGlzdGluZ3Vpc2hpbmcgbWFya3MgKHRhdHRvb3MrbG9jYXRpb24sIHNjYXJzLCBwaWVyY2luZ3MsIG1vbGVzKSwgc2NlbmUtYWx0ZXJlZCBoYWlyIG9ubHkgKHdldCwgdGllZCwgbXVzc2VkKS4gTWVuIHByZWZpeCBsZWFuLW11c2NsZWQgb3IgdGFsbCBidWlsdCBwZXIgZXN0YWJsaXNoZWQgYnVpbGQsIGtlZXAgY29uc2lzdGVudC4KSEVJR0hUIERJRkZFUkVOQ0UgKHdoZW4gY2Fub24pOiBzdGFjayBUSFJFRSBjdWVzOiAoYSkgZ2FwIHN0YXRlbWVudCB3aXRoIG1hZ25pdHVkZSB1cCBmcm9udCAoTW9yIHRvd2VycyBhIGZ1bGwgaGVhZCBvdmVyIEtpcmEpLCAoYikgc2lsaG91ZXR0ZSBjb250cmFzdCAoTW9yIGxvbmctbGltYmVkIHRhbGwtYnVpbHQsIEtpcmEgc21hbGwgYW5kIHNob3J0IGJlc2lkZSBoaW0pLCAoYykgY29udGFjdC9leWVsaW5lIGFuY2hvciAoaGVhZCBvZiBLaXJhIGF0IHRoZSBzdGVybnVtIG9mIE1vciwgY2hpbiBvZiBNb3IgdGlsdGVkIGRvd24pLiBGcmFtZSB3YWlzdC11cCsgZm9yIGJpZyBnYXBzOyBpZiBmYWNlcyBjbG9zZSwganVzdGlmeSBwaHlzaWNhbGx5IChNb3Igc3Rvb3BpbmcsIEtpcmEgb24gdG9lcykuCkVYUFJFU1NJT04rT1VURklUK1BPU0U6IG9uZSBmdXNlZCBjbGF1c2UgcGVyIGNoYXJhY3RlcjogTkFNRSArIGZhYnJpYy90ZXh0dXJlL2ZpdCArIGFjdGlvbi1iYXNlZCBwb3NlICsgbWljcm8tZXhwcmVzc2lvbiwgc2tpbiBzdGF0ZS4gUG9zZSB2aWEgYWN0aW9uIHZlcmJzIChNb3IgbGVhbmluZyBvbiBkb29yZnJhbWUsIGFybXMgbG9vc2VseSBjcm9zc2VkKSwgbmV2ZXIgc3RhdGljIGxpbWIgY29vcmRpbmF0ZXMuIE91dGZpdCBjYXJyaWVzIGZyb20gdGhlIHBvc3QgYW5kIGNvbnRleHQ7IGlmIHVuc2V0LCBpbnZlbnQgYW5kIGxvY2sgZm9yIHNjZW5lLgpIQU5EIFNBRkVUWTogZnJlZSBmaW5nZXJzIGZhaWwgbW9zdC4gU2FmZTogaGFuZCBpbiBwb2NrZXQsIGdyaXBwaW5nIG5hbWVkIG9iamVjdCAoZmluZ2VycyBjdXJsZWQgYXJvdW5kIGNlcmFtaWMgbXVnKSwgZmxhdCBvbiBzdXJmYWNlLCBhcm1zIGNyb3NzZWQsIGJlaGluZCBiYWNrLCBmaXN0IGF0IHNpZGUsIGxhY2VkLCBvbiBvd24gbmVjay9jaGluLiBPbmUgdmlzaWJsZSBoYW5kIHBlciBjaGFyYWN0ZXIsIGhpZGUgcmVzdCB2aWEgZnJhbWluZy9wb3NlLgpXRUlHSFQgJiBHUk9VTkQ6IG9uZSBzZW50ZW5jZSBvbiB3ZWlnaHQgKHdlaWdodCBvbiBsZWZ0IGxlZywgcmlnaHQgZm9vdCB0dXJuZWQgb3V0KS4gSGlkZGVuIGxpbWJzIHJlcXVpcmUgc3RhdGVkIHJlYXNvbiwgdW5leHBsYWluZWQgYWJzZW5jZSBicmVha3MgZmlndXJlLgpFTlZJUk9OTUVOVCtMSUdIVDogb25lIHNlbnRlbmNlOiBmZy9taWQvYmcgdGV4dHVyZXMsIGtleSBsaWdodCBkaXJlY3Rpb24rY29sb3IgdGVtcCwgYXRtb3NwaGVyaWMgcGFydGljbGVzIChkdXN0LCBzdGVhbSwgbWlzdCkuCk1BTlkgQ0hBUkFDVEVSUzogTkFNRSBzdGFydHMgZWFjaCBjbGF1c2UsIHJlcGVhdCBuYW1lcyBub3QgcHJvbm91bnMsIHJlbGF0aW9uYWwgcG9zaXRpb25pbmcgKGJlc2lkZSBLYW1vaSwgY2hpbiBvbiB0aGUgc2hvdWxkZXIgb2YgS2Ftb2kpLCBlbnZpcm9ubWVudCBhcyBmaW5hbCBzZW50ZW5jZS4KU1RZTEUgTE9DSyAoYXBwZW5kIHZlcmJhdGltKTogRWxlZ2FudCBDaGluZXNlIGd1b2ZlbmcgbWFuaHVhIGlsbHVzdHJhdGlvbiB3aXRoIGEgcmVmaW5lZCByb21hbnRpYyBhdG1vc3BoZXJlLiBHcmFjZWZ1bCBjaGFyYWN0ZXIgZGVzaWduIHdpdGggbWF0dXJlIHNvZnRseSBlbG9uZ2F0ZWQgZmFjaWFsIHN0cnVjdHVyZSwgbmFycm93IGV4cHJlc3NpdmUgYWxtb25kLXNoYXBlZCBleWVzLCBhIGRlbGljYXRlIG5vc2UgYW5kIGEgc3VidGxlIHJlc3RyYWluZWQgc21pbGUuIEhhaXIgaXMgYXJyYW5nZWQgaW4gZmxvd2luZyBjYWxsaWdyYXBoaWMgbWFzc2VzIHdpdGggZmluZSB0YXBlcmluZyBzdHJhbmRzIGFuZCByZXN0cmFpbmVkIGNvb2wgaGlnaGxpZ2h0cy4gQ2xvdGhpbmcgaXMgcmVuZGVyZWQgaW4gYnJvYWQgbWF0dGUgY29sb3IgcGxhbmVzIHdpdGggaW50cmljYXRlIHRvbmUtb24tdG9uZSBlbWJyb2lkZXJ5IGluc3BpcmVkIGJ5IHRyYWRpdGlvbmFsIENoaW5lc2UgZmxvcmFsIGFuZCBjbG91ZCBtb3RpZnMuIERlbGljYXRlIGNoYXJjb2FsLWdyZXkgZHJhd2luZyBhcHBlYXJzIHNlbGVjdGl2ZWx5IGFyb3VuZCB0aGUgZmFjZSwgaGFpciBhbmQgb3JuYW1lbnRhbCBkZXRhaWxzLCB3aGlsZSBtb3N0IGZvcm1zIGFyZSBzaGFwZWQgdGhyb3VnaCBhZGphY2VudCBjb2xvciBmaWVsZHMgcmF0aGVyIHRoYW4gaGVhdnkgb3V0bGluZXMuIFNoYWRpbmcgcmVtYWlucyBzaGFsbG93IGFuZCB1bmRlcnN0YXRlZCwgcHJlc2VydmluZyBhIGZsYXQgaWxsdXN0cmF0ZWQgZWxlZ2FuY2UuIFRoZSBzdXJyb3VuZGluZyBhcmNoaXRlY3R1cmUgYW5kIGZvbGlhZ2UgZGlzc29sdmUgaW50byB0cmFuc2x1Y2VudCBpbmstd2FzaCB0ZXh0dXJlcywgbWlzdHkgcGlnbWVudCBibG9vbXMgYW5kIHNvZnRseSBicm9rZW4gYnJ1c2h3b3JrLiBNdXRlZCBqYWRlLCBpbmstYmxhY2ssIHBvcmNlbGFpbiB3aGl0ZSBhbmQgc21hbGwgY2lubmFiYXIgYWNjZW50cyBhZGFwdCBuYXR1cmFsbHkgdG8gdGhlIHNjZW5lIHdpdGhvdXQgb3ZlcnJpZGluZyB0aGUgY2hhcmFjdGVyIGNhbm9uaWNhbCBjb2xvcnMuIFF1aWV0IHBvZXRpYyBtb29kLCBiYWxhbmNlZCBuZWdhdGl2ZSBzcGFjZSBhbmQgcG9saXNoZWQgQ2hpbmVzZSBtYW5odWEgY29tcG9zaXRpb24uCk5FR0FUSVZFIChhcHBlbmQgdmVyYmF0aW0pOiBBdm9pZDogdGhpY2sgYmxhY2sgb3V0bGluZXMsIFdlc3Rlcm4gY29taWMgaW5raW5nLCBleGFnZ2VyYXRlZCBhbmltZSBleWVzLCBtb2UgZmVhdHVyZXMsIGdsb3NzeSAzRCByZW5kZXJpbmcsIHBob3RvcmVhbGlzdGljIHNraW4sIGRyYW1hdGljIGNpbmVtYXRpYyBtb2RlbGluZywgbmVvbiBwYWxldHRlLCBjbHV0dGVyZWQgb3JuYW1lbnQsIHRleHQsIGxvZ28sIHdhdGVybWFyaywgc2lnbmF0dXJlLgpSRUZFUkVOQ0UgTE9DSyAoYXBwZW5kIHZlcmJhdGltKTogTWF0Y2ggbGluZSBxdWFsaXR5LCB0ZXh0dXJlLCByZW5kZXJpbmcgdGVjaG5pcXVlIGZyb20gcmVmZXJlbmNlIGltYWdlLiBQb3NlLCBmcmFtaW5nLCBzdHlsaW5nIGZvbGxvdyBjdXJyZW50IHByb21wdCBub3QgcmVmZXJlbmNlLgpTRU5TVUFMIChjZW5zb3ItYXdhcmUpOiByZW5kZXIgaW50aW1hY3kgdmlhIGF0bW9zcGhlcmUrc3VnZ2VzdGlvbiwgbm90IGFuYXRvbXkuIE5PSVNFIEZMT09EICgzKyk6IGRlbnNlIHN0ZWFtLCB0YW5nbGVkIHNpbGsrY3VzaGlvbnMsIHdhdGVyIGRyb3BsZXRzIG9uIGdsYXNzLCBsdXNoIHBsYW50cytwZXRhbHMsIHZlbmV0aWFuIGJsaW5kIHNoYWRvdyBzdHJpcGVzLCBkb3plbnMgb2YgY2FuZGxlIGZsYW1lcywgc2hvdCB0aHJvdWdoIGRvb3JmcmFtZS9zaGVlciBjdXJ0YWluL2Zyb3N0ZWQgZ2xhc3MsIHJhaW4tc3RyZWFrZWQgd2luZG93LiBDT05DRUFMTUVOVCAoMisgc3RhY2tlZCk6IGRlZXAgY2hpYXJvc2N1cm8sIGZhYnJpYyBkcmFwZWQgbG93LCBhcm1zIGZvbGRlZCBrbmVlcyBkcmF3biwgY3JvcCBhdCByaWJjYWdlL3Nob3VsZGVycywgc2hvdCBmcm9tIGJlaGluZCBvdmVyIHNob3VsZGVyLCBsb3dlciBmcmFtZSBpbnRvIGJva2VoK2hhemUsIHBpbGxvdy9ibGFua2V0IGFjcm9zcyBib2R5LiBTQUZFIExFWElDT046IHNvZnQgZGVjb2xsZXRhZ2Ugc2hhZGVkIGJ5IHNpbGssIHNwaW5lIGxpbmUgdHJhY2VkIGJ5IG1vcm5pbmcgbGlnaHQsIGZhYnJpYyBwb29sZWQgYXQgY29sbGFyYm9uZSwgc2lsaG91ZXR0ZSBoYWxmLXZlaWxlZCBieSBzdGVhbSwgdHdvIGZpZ3VyZXMgc2hhcmluZyBicmVhdGggYXQgdGhyZXNob2xkLCBoZWF2eS1saWRkZWQgZ2F6ZSBsaXBzIGJhcmVseSBwYXJ0ZWQsIHN0cmFwIHNsaXBwaW5nIHRoZSBzaG91bGRlciBsaW5lLCBmb3JlaGVhZCByZXN0aW5nIGFnYWluc3QgZm9yZWhlYWQsIGZpbmdlcnRpcHMgZ2hvc3RpbmcgYSBqYXdsaW5lLCByb2JlIGxvb3NlIGF0IHRoZSBzbGVldmUuIEZyYW1lIGludGltYWN5IGFzIE1PTUVOVCAocGF1c2UsIHByb3hpbWl0eSwgbG9vaykgbm90IEFDVC4KUFJPTVBUIEhZR0lFTkU6IG5ldmVyIHdyaXRlOiBzZXh5LCBlcm90aWMsIHNlbnN1YWwsIG51ZGUsIG5ha2VkLCBiZWF1dGlmdWwsIG1hc3RlcnBpZWNlLCBiZXN0IHF1YWxpdHksIHJlYWxpc3RpYywgcGhvdG9yZWFsaXN0aWMuCkNPTlNJU1RFTkNZOiByZS1zdGF0ZSBvdXRmaXQsIGxvY2F0aW9uLCB0aW1lIG9mIGRheSwgbGlnaHQgc291cmNlIGluIGV2ZXJ5IHByb21wdCDigJQgdGhlIHJlbmRlcmVyIGhhcyBubyBtZW1vcnkgYmV0d2VlbiBjYWxscy4KQ29tcG9zZSBmb3IgdGhlIEFTUEVDVCBSQVRJTyBnaXZlbiBpbiB0aGUgcmVxdWVzdDogdmVydGljYWwgPSBwb3J0cmFpdHMvZnVsbC1ib2R5LCBzcXVhcmUgPSBzb2NpYWwvY2xvc2UsIHdpZGUgPSBlbnZpcm9ubWVudC90d28tc2hvdHMvY2luZW1hdGljLg=="], ["Gothic Shoujo by Kamoi", "QnVpbGQgaW4gdGhpcyBvcmRlcjoKQ0FNRVJBOiBzaG90K2FuZ2xlK2xlbnMrYXBlcnR1cmUgaW4gb25lIGNsYXVzZS4gQ2xvc2UtdXAvTUNVID0gODUtMTM1bW0gZi8xLjgtMi4yIChzYWZlc3QgYW5hdG9teSksIG1lZGl1bSA9IDUwLTg1bW0gZi8yLTIuOCwgZnVsbCBib2R5IChyYXJlKSA9IDM1LTUwbW0gZi8yLjgtNC4gQmVhdC1kcml2ZXIgPSBjZW50ZXIgb2YgZnJhbWUuCkNIQVJBQ1RFUjogcmVmIGltYWdlcyBjYXJyeSBiYXNlIGxvb2ssIHNvIFNLSVAgaGFpciBjb2xvci9zdHlsZS9sZW5ndGgsIGV5ZSBjb2xvciwgc2tpbiB0b25lLCBmYWNlIHNoYXBlLCBib2R5IHR5cGUuIElOQ0xVREU6IGZpcnN0IG5hbWUgb25seSAobGVhZCB3aXRoIGl0KSwgZGlzdGluZ3Vpc2hpbmcgbWFya3MgKHRhdHRvb3MrbG9jYXRpb24sIHNjYXJzLCBwaWVyY2luZ3MsIG1vbGVzKSwgc2NlbmUtYWx0ZXJlZCBoYWlyIG9ubHkgKHdldCwgdGllZCwgbXVzc2VkKS4gTWVuIHByZWZpeCBsZWFuLW11c2NsZWQgb3IgdGFsbCBidWlsdCBwZXIgZXN0YWJsaXNoZWQgYnVpbGQsIGtlZXAgY29uc2lzdGVudC4KSEVJR0hUIERJRkZFUkVOQ0UgKHdoZW4gY2Fub24pOiBzdGFjayBUSFJFRSBjdWVzOiAoYSkgZ2FwIHN0YXRlbWVudCB3aXRoIG1hZ25pdHVkZSB1cCBmcm9udCAoTW9yIHRvd2VycyBhIGZ1bGwgaGVhZCBvdmVyIEtpcmEpLCAoYikgc2lsaG91ZXR0ZSBjb250cmFzdCAoTW9yIGxvbmctbGltYmVkIHRhbGwtYnVpbHQsIEtpcmEgc21hbGwgYW5kIHNob3J0IGJlc2lkZSBoaW0pLCAoYykgY29udGFjdC9leWVsaW5lIGFuY2hvciAoaGVhZCBvZiBLaXJhIGF0IHRoZSBzdGVybnVtIG9mIE1vciwgY2hpbiBvZiBNb3IgdGlsdGVkIGRvd24pLiBGcmFtZSB3YWlzdC11cCsgZm9yIGJpZyBnYXBzOyBpZiBmYWNlcyBjbG9zZSwganVzdGlmeSBwaHlzaWNhbGx5IChNb3Igc3Rvb3BpbmcsIEtpcmEgb24gdG9lcykuCkVYUFJFU1NJT04rT1VURklUK1BPU0U6IG9uZSBmdXNlZCBjbGF1c2UgcGVyIGNoYXJhY3RlcjogTkFNRSArIGZhYnJpYy90ZXh0dXJlL2ZpdCArIGFjdGlvbi1iYXNlZCBwb3NlICsgbWljcm8tZXhwcmVzc2lvbiwgc2tpbiBzdGF0ZS4gUG9zZSB2aWEgYWN0aW9uIHZlcmJzIChNb3IgbGVhbmluZyBvbiBkb29yZnJhbWUsIGFybXMgbG9vc2VseSBjcm9zc2VkKSwgbmV2ZXIgc3RhdGljIGxpbWIgY29vcmRpbmF0ZXMuIE91dGZpdCBjYXJyaWVzIGZyb20gdGhlIHBvc3QgYW5kIGNvbnRleHQ7IGlmIHVuc2V0LCBpbnZlbnQgYW5kIGxvY2sgZm9yIHNjZW5lLgpIQU5EIFNBRkVUWTogZnJlZSBmaW5nZXJzIGZhaWwgbW9zdC4gU2FmZTogaGFuZCBpbiBwb2NrZXQsIGdyaXBwaW5nIG5hbWVkIG9iamVjdCAoZmluZ2VycyBjdXJsZWQgYXJvdW5kIGNlcmFtaWMgbXVnKSwgZmxhdCBvbiBzdXJmYWNlLCBhcm1zIGNyb3NzZWQsIGJlaGluZCBiYWNrLCBmaXN0IGF0IHNpZGUsIGxhY2VkLCBvbiBvd24gbmVjay9jaGluLiBPbmUgdmlzaWJsZSBoYW5kIHBlciBjaGFyYWN0ZXIsIGhpZGUgcmVzdCB2aWEgZnJhbWluZy9wb3NlLgpXRUlHSFQgJiBHUk9VTkQ6IG9uZSBzZW50ZW5jZSBvbiB3ZWlnaHQgKHdlaWdodCBvbiBsZWZ0IGxlZywgcmlnaHQgZm9vdCB0dXJuZWQgb3V0KS4gSGlkZGVuIGxpbWJzIHJlcXVpcmUgc3RhdGVkIHJlYXNvbiwgdW5leHBsYWluZWQgYWJzZW5jZSBicmVha3MgZmlndXJlLgpFTlZJUk9OTUVOVCtMSUdIVDogb25lIHNlbnRlbmNlOiBmZy9taWQvYmcgdGV4dHVyZXMsIGtleSBsaWdodCBkaXJlY3Rpb24rY29sb3IgdGVtcCwgYXRtb3NwaGVyaWMgcGFydGljbGVzIChkdXN0LCBzdGVhbSwgbWlzdCkuCk1BTlkgQ0hBUkFDVEVSUzogTkFNRSBzdGFydHMgZWFjaCBjbGF1c2UsIHJlcGVhdCBuYW1lcyBub3QgcHJvbm91bnMsIHJlbGF0aW9uYWwgcG9zaXRpb25pbmcgKGJlc2lkZSBLYW1vaSwgY2hpbiBvbiB0aGUgc2hvdWxkZXIgb2YgS2Ftb2kpLCBlbnZpcm9ubWVudCBhcyBmaW5hbCBzZW50ZW5jZS4KU1RZTEUgTE9DSyAoYXBwZW5kIHZlcmJhdGltKTogSGlnaC1jaHJvbWEgZ290aGljIHNob3VqbyBpbGx1c3RyYXRpb24gd2l0aCBhbiBpbnRlbnNlIGdyYXBoaWMgY29tcG9zaXRpb24gYW5kIHRhY3RpbGUgbWl4ZWQtbWVkaWEgc3VyZmFjZS4gVGhlIGNoYXJhY3RlciBpcyBjb25zdHJ1Y3RlZCBmcm9tIHN3ZWVwaW5nIG9wYXF1ZSBicnVzaCBzaGFwZXMsIHNoYXJwIHRhcGVyZWQgc3Ryb2tlcyBhbmQgZGVuc2VseSBsYXllcmVkIGRpcmVjdGlvbmFsIG1hcmtzLiBTa2luIHJlbWFpbnMgcGFsZSwgZmxhdCBhbmQgbmVhcmx5IHVuc2hhZGVkLCBjcmVhdGluZyBhIGx1bWlub3VzIGN1dC1wYXBlciBjb250cmFzdCBhZ2FpbnN0IHRoZSBzdXJyb3VuZGluZyBkYXJrIHBpZ21lbnQuIEV5ZXMgYXJlIGhpZ2hseSBleHByZXNzaXZlIGFuZCBqZXdlbC1saWtlLCB3aXRoIGludHJpY2F0ZSBsYXNoZXMsIHZpc2libGUgaXJpcyBkZXRhaWwgYW5kIHNtYWxsIHdldCBoaWdobGlnaHRzOyB0aGUgcmVtYWluaW5nIGZhY2lhbCBmZWF0dXJlcyBhcmUgc3BhcnNlIGFuZCBkZWxpY2F0ZS4gQ2xvdGhpbmcsIHJpYmJvbnMgYW5kIGRlY29yYXRpdmUgZm9ybXMgbWVyZ2Ugcmh5dGhtaWNhbGx5IHdpdGggdGhlIGhhaXIgaW50byBhbiBvcm5hbWVudGFsIHNpbGhvdWV0dGUuIFRoZSBiYWNrZ3JvdW5kIGlzIGFuIGFic3RyYWN0IGZpZWxkIG9mIGRyeSBicnVzaCBkcmFnLCBncmFpbnkgcGlnbWVudCwgc2NyYXBlZCB0ZXh0dXJlIGFuZCBpc29sYXRlZCBicmlnaHQgYWNjZW50cy4gU3Ryb25nIGFzeW1tZXRyaWNhbCBjcm9wcGluZywgY29tcHJlc3NlZCBkZXB0aCBhbmQgZHJhbWF0aWMgZGlhZ29uYWwgbW92ZW1lbnQuIFByZXNlcnZlIHRoZSBjaGFyYWN0ZXIgaWRlbnRpdHkgYW5kIGNhbm9uaWNhbCBjb2xvcnMgd2hpbGUgdXNpbmcgYW4gaW50ZW5zZSBzY2VuZS1hZGFwdGl2ZSBwYWxldHRlIHdpdGggZGVlcCBzYXR1cmF0ZWQgZGFya3MgYW5kIGVsZWN0cmljIGNvbnRyYXN0aW5nIGFjY2VudHMuCk5FR0FUSVZFIChhcHBlbmQgdmVyYmF0aW0pOiBBdm9pZDogcmVhbGlzdGljYWxseSBtb2RlbGVkIGZhY2UsIHNtb290aCBza2luIGdyYWRpZW50cywgcGhvdG9yZWFsaXNtLCBjaW5lbWF0aWMgZGVwdGgsIGFpcmJydXNoZWQgYmxlbmRpbmcsIGluZGl2aWR1YWxseSByZW5kZXJlZCBoYWlyIHN0cmFuZHMsIGdsb3NzeSAzRCBmaW5pc2gsIHBhc3RlbCBsb3ctY29udHJhc3QgcGFsZXR0ZSwgZW1wdHkgZ2VuZXJpYyBiYWNrZ3JvdW5kLCB0aGljayB1bmlmb3JtIG91dGxpbmUsIHRleHQsIGxvZ28sIHdhdGVybWFyaywgc2lnbmF0dXJlLgpSRUZFUkVOQ0UgTE9DSyAoYXBwZW5kIHZlcmJhdGltKTogTWF0Y2ggbGluZSBxdWFsaXR5LCB0ZXh0dXJlLCByZW5kZXJpbmcgdGVjaG5pcXVlIGZyb20gcmVmZXJlbmNlIGltYWdlLiBQb3NlLCBmcmFtaW5nLCBzdHlsaW5nIGZvbGxvdyBjdXJyZW50IHByb21wdCBub3QgcmVmZXJlbmNlLgpTRU5TVUFMIChjZW5zb3ItYXdhcmUpOiByZW5kZXIgaW50aW1hY3kgdmlhIGF0bW9zcGhlcmUrc3VnZ2VzdGlvbiwgbm90IGFuYXRvbXkuIE5PSVNFIEZMT09EICgzKyk6IGRlbnNlIHN0ZWFtLCB0YW5nbGVkIHNpbGsrY3VzaGlvbnMsIHdhdGVyIGRyb3BsZXRzIG9uIGdsYXNzLCBsdXNoIHBsYW50cytwZXRhbHMsIHZlbmV0aWFuIGJsaW5kIHNoYWRvdyBzdHJpcGVzLCBkb3plbnMgb2YgY2FuZGxlIGZsYW1lcywgc2hvdCB0aHJvdWdoIGRvb3JmcmFtZS9zaGVlciBjdXJ0YWluL2Zyb3N0ZWQgZ2xhc3MsIHJhaW4tc3RyZWFrZWQgd2luZG93LiBDT05DRUFMTUVOVCAoMisgc3RhY2tlZCk6IGRlZXAgY2hpYXJvc2N1cm8sIGZhYnJpYyBkcmFwZWQgbG93LCBhcm1zIGZvbGRlZCBrbmVlcyBkcmF3biwgY3JvcCBhdCByaWJjYWdlL3Nob3VsZGVycywgc2hvdCBmcm9tIGJlaGluZCBvdmVyIHNob3VsZGVyLCBsb3dlciBmcmFtZSBpbnRvIGJva2VoK2hhemUsIHBpbGxvdy9ibGFua2V0IGFjcm9zcyBib2R5LiBTQUZFIExFWElDT046IHNvZnQgZGVjb2xsZXRhZ2Ugc2hhZGVkIGJ5IHNpbGssIHNwaW5lIGxpbmUgdHJhY2VkIGJ5IG1vcm5pbmcgbGlnaHQsIGZhYnJpYyBwb29sZWQgYXQgY29sbGFyYm9uZSwgc2lsaG91ZXR0ZSBoYWxmLXZlaWxlZCBieSBzdGVhbSwgdHdvIGZpZ3VyZXMgc2hhcmluZyBicmVhdGggYXQgdGhyZXNob2xkLCBoZWF2eS1saWRkZWQgZ2F6ZSBsaXBzIGJhcmVseSBwYXJ0ZWQsIHN0cmFwIHNsaXBwaW5nIHRoZSBzaG91bGRlciBsaW5lLCBmb3JlaGVhZCByZXN0aW5nIGFnYWluc3QgZm9yZWhlYWQsIGZpbmdlcnRpcHMgZ2hvc3RpbmcgYSBqYXdsaW5lLCByb2JlIGxvb3NlIGF0IHRoZSBzbGVldmUuIEZyYW1lIGludGltYWN5IGFzIE1PTUVOVCAocGF1c2UsIHByb3hpbWl0eSwgbG9vaykgbm90IEFDVC4KUFJPTVBUIEhZR0lFTkU6IG5ldmVyIHdyaXRlOiBzZXh5LCBlcm90aWMsIHNlbnN1YWwsIG51ZGUsIG5ha2VkLCBiZWF1dGlmdWwsIG1hc3RlcnBpZWNlLCBiZXN0IHF1YWxpdHksIHJlYWxpc3RpYywgcGhvdG9yZWFsaXN0aWMuCkNPTlNJU1RFTkNZOiByZS1zdGF0ZSBvdXRmaXQsIGxvY2F0aW9uLCB0aW1lIG9mIGRheSwgbGlnaHQgc291cmNlIGluIGV2ZXJ5IHByb21wdCDigJQgdGhlIHJlbmRlcmVyIGhhcyBubyBtZW1vcnkgYmV0d2VlbiBjYWxscy4KQ29tcG9zZSBmb3IgdGhlIEFTUEVDVCBSQVRJTyBnaXZlbiBpbiB0aGUgcmVxdWVzdDogdmVydGljYWwgPSBwb3J0cmFpdHMvZnVsbC1ib2R5LCBzcXVhcmUgPSBzb2NpYWwvY2xvc2UsIHdpZGUgPSBlbnZpcm9ubWVudC90d28tc2hvdHMvY2luZW1hdGljLg=="], ["Y2K Gyaru by Kamoi", "QnVpbGQgaW4gdGhpcyBvcmRlcjoKQ0FNRVJBOiBzaG90K2FuZ2xlK2xlbnMrYXBlcnR1cmUgaW4gb25lIGNsYXVzZS4gQ2xvc2UtdXAvTUNVID0gODUtMTM1bW0gZi8xLjgtMi4yIChzYWZlc3QgYW5hdG9teSksIG1lZGl1bSA9IDUwLTg1bW0gZi8yLTIuOCwgZnVsbCBib2R5IChyYXJlKSA9IDM1LTUwbW0gZi8yLjgtNC4gQmVhdC1kcml2ZXIgPSBjZW50ZXIgb2YgZnJhbWUuCkNIQVJBQ1RFUjogcmVmIGltYWdlcyBjYXJyeSBiYXNlIGxvb2ssIHNvIFNLSVAgaGFpciBjb2xvci9zdHlsZS9sZW5ndGgsIGV5ZSBjb2xvciwgc2tpbiB0b25lLCBmYWNlIHNoYXBlLCBib2R5IHR5cGUuIElOQ0xVREU6IGZpcnN0IG5hbWUgb25seSAobGVhZCB3aXRoIGl0KSwgZGlzdGluZ3Vpc2hpbmcgbWFya3MgKHRhdHRvb3MrbG9jYXRpb24sIHNjYXJzLCBwaWVyY2luZ3MsIG1vbGVzKSwgc2NlbmUtYWx0ZXJlZCBoYWlyIG9ubHkgKHdldCwgdGllZCwgbXVzc2VkKS4gTWVuIHByZWZpeCBsZWFuLW11c2NsZWQgb3IgdGFsbCBidWlsdCBwZXIgZXN0YWJsaXNoZWQgYnVpbGQsIGtlZXAgY29uc2lzdGVudC4KSEVJR0hUIERJRkZFUkVOQ0UgKHdoZW4gY2Fub24pOiBzdGFjayBUSFJFRSBjdWVzOiAoYSkgZ2FwIHN0YXRlbWVudCB3aXRoIG1hZ25pdHVkZSB1cCBmcm9udCAoTW9yIHRvd2VycyBhIGZ1bGwgaGVhZCBvdmVyIEtpcmEpLCAoYikgc2lsaG91ZXR0ZSBjb250cmFzdCAoTW9yIGxvbmctbGltYmVkIHRhbGwtYnVpbHQsIEtpcmEgc21hbGwgYW5kIHNob3J0IGJlc2lkZSBoaW0pLCAoYykgY29udGFjdC9leWVsaW5lIGFuY2hvciAoaGVhZCBvZiBLaXJhIGF0IHRoZSBzdGVybnVtIG9mIE1vciwgY2hpbiBvZiBNb3IgdGlsdGVkIGRvd24pLiBGcmFtZSB3YWlzdC11cCsgZm9yIGJpZyBnYXBzOyBpZiBmYWNlcyBjbG9zZSwganVzdGlmeSBwaHlzaWNhbGx5IChNb3Igc3Rvb3BpbmcsIEtpcmEgb24gdG9lcykuCkVYUFJFU1NJT04rT1VURklUK1BPU0U6IG9uZSBmdXNlZCBjbGF1c2UgcGVyIGNoYXJhY3RlcjogTkFNRSArIGZhYnJpYy90ZXh0dXJlL2ZpdCArIGFjdGlvbi1iYXNlZCBwb3NlICsgbWljcm8tZXhwcmVzc2lvbiwgc2tpbiBzdGF0ZS4gUG9zZSB2aWEgYWN0aW9uIHZlcmJzIChNb3IgbGVhbmluZyBvbiBkb29yZnJhbWUsIGFybXMgbG9vc2VseSBjcm9zc2VkKSwgbmV2ZXIgc3RhdGljIGxpbWIgY29vcmRpbmF0ZXMuIE91dGZpdCBjYXJyaWVzIGZyb20gdGhlIHBvc3QgYW5kIGNvbnRleHQ7IGlmIHVuc2V0LCBpbnZlbnQgYW5kIGxvY2sgZm9yIHNjZW5lLgpIQU5EIFNBRkVUWTogZnJlZSBmaW5nZXJzIGZhaWwgbW9zdC4gU2FmZTogaGFuZCBpbiBwb2NrZXQsIGdyaXBwaW5nIG5hbWVkIG9iamVjdCAoZmluZ2VycyBjdXJsZWQgYXJvdW5kIGNlcmFtaWMgbXVnKSwgZmxhdCBvbiBzdXJmYWNlLCBhcm1zIGNyb3NzZWQsIGJlaGluZCBiYWNrLCBmaXN0IGF0IHNpZGUsIGxhY2VkLCBvbiBvd24gbmVjay9jaGluLiBPbmUgdmlzaWJsZSBoYW5kIHBlciBjaGFyYWN0ZXIsIGhpZGUgcmVzdCB2aWEgZnJhbWluZy9wb3NlLgpXRUlHSFQgJiBHUk9VTkQ6IG9uZSBzZW50ZW5jZSBvbiB3ZWlnaHQgKHdlaWdodCBvbiBsZWZ0IGxlZywgcmlnaHQgZm9vdCB0dXJuZWQgb3V0KS4gSGlkZGVuIGxpbWJzIHJlcXVpcmUgc3RhdGVkIHJlYXNvbiwgdW5leHBsYWluZWQgYWJzZW5jZSBicmVha3MgZmlndXJlLgpFTlZJUk9OTUVOVCtMSUdIVDogb25lIHNlbnRlbmNlOiBmZy9taWQvYmcgdGV4dHVyZXMsIGtleSBsaWdodCBkaXJlY3Rpb24rY29sb3IgdGVtcCwgYXRtb3NwaGVyaWMgcGFydGljbGVzIChkdXN0LCBzdGVhbSwgbWlzdCkuCk1BTlkgQ0hBUkFDVEVSUzogTkFNRSBzdGFydHMgZWFjaCBjbGF1c2UsIHJlcGVhdCBuYW1lcyBub3QgcHJvbm91bnMsIHJlbGF0aW9uYWwgcG9zaXRpb25pbmcgKGJlc2lkZSBLYW1vaSwgY2hpbiBvbiB0aGUgc2hvdWxkZXIgb2YgS2Ftb2kpLCBlbnZpcm9ubWVudCBhcyBmaW5hbCBzZW50ZW5jZS4KU1RZTEUgTE9DSyAoYXBwZW5kIHZlcmJhdGltKTogWTJLIGd5YXJ1IG1hcmtlci1tYW5nYSBpbGx1c3RyYXRpb24gd2l0aCBleHByZXNzaXZlIGZhc2hpb24tZWRpdG9yaWFsIGVuZXJneS4gTG9vc2UsIHRhY3RpbGUgaW5rIGNvbnRvdXJzIGNvbWJpbmUgd2l0aCBvcGFxdWUgYWxjb2hvbC1tYXJrZXIgYW5kIGdvdWFjaGUtbGlrZSBjb2xvciBzdHJva2VzLCBsZWF2aW5nIHZpc2libGUgZGlyZWN0aW9uYWwgYnJ1c2ggbWFya3MsIHVuZXZlbiBwaWdtZW50IG92ZXJsYXAgYW5kIHBhbGUgcGFwZXIgc2hvd2luZyB0aHJvdWdoLiBGYWNlcyBoYXZlIGRyYW1hdGljYWxseSBlbXBoYXNpemVkIGdsb3NzeSBkYXJrIGV5ZXMsIGRlbnNlIHNlcGFyYXRlZCBsYXNoZXMsIGRlbGljYXRlbHkgc2tldGNoZWQgZmVhdHVyZXMsIHNvZnRseSBnbG9zc3kgbGlwcyBhbmQgdml2aWQgYmx1c2ggYnVpbHQgZnJvbSBmaW5lIHZlcnRpY2FsIHBlbmNpbCBoYXRjaGluZyBhY3Jvc3MgdGhlIGNoZWVrcyBhbmQgbm9zZS4gSGFpciBpcyBzaGFwZWQgd2l0aCBicm9hZCBncmFwaGljIGNvbG9yIG1hc3NlcywgYnJva2VuIGhpZ2hsaWdodCBzdHJva2VzIGFuZCBzcGFyc2Ugc3RyYW5kIGxpbmVzLiBTa2luIGFuZCBjbG90aGluZyB1c2Ugc2ltcGxpZmllZCBibG9ja3Mgb2Ygd2FybSBjb2xvciB3aXRoIHJlc3RyYWluZWQgZGltZW5zaW9uYWwgc2hhZGluZyByYXRoZXIgdGhhbiBzbW9vdGggZ3JhZGllbnRzLiBEeW5hbWljIGNsb3NlIGZyYW1pbmcsIHBsYXlmdWwgZm9yZXNob3J0ZW5lZCBoYW5kcywgZXhwcmVzc2l2ZSBwb3NlcywgYm9sZCBhY2Nlc3NvcmllcyBhbmQgWTJLIGZhc2hpb24gYXR0aXR1ZGUuIFByZXNlcnZlIGVhY2ggY2hhcmFjdGVyIGlkZW50aXR5IGFuZCBzY2VuZS1zcGVjaWZpYyBwYWxldHRlIHdoaWxlIHRyYW5zbGF0aW5nIHRoZW0gaW50byB0aGlzIHRhY3RpbGUgaGFuZC1jb2xvcmVkIG1hbmdhIHRlY2huaXF1ZS4KTkVHQVRJVkUgKGFwcGVuZCB2ZXJiYXRpbSk6IEF2b2lkOiBvdXRsaW5lZCBjb2xvcmluZy1ib29rIGFwcGVhcmFuY2UsIHVuaWZvcm1seSBlbmNsb3NlZCBzaGFwZXMsIGNvbWljLWJvb2sgaW5raW5nLCBwb2xpc2hlZCBjZWwgc2hhZGluZywgc21vb3RoIGFpcmJydXNoZWQgcmVuZGVyaW5nLCBwaG90b3JlYWxpc3RpYyBza2luLCAzRCBnbG9zcywgdGV4dCwgbG9nbywgd2F0ZXJtYXJrLCBzaWduYXR1cmUuClJFRkVSRU5DRSBMT0NLIChhcHBlbmQgdmVyYmF0aW0pOiBNYXRjaCBsaW5lIHF1YWxpdHksIHRleHR1cmUsIHJlbmRlcmluZyB0ZWNobmlxdWUgZnJvbSByZWZlcmVuY2UgaW1hZ2UuIFBvc2UsIGZyYW1pbmcsIHN0eWxpbmcgZm9sbG93IGN1cnJlbnQgcHJvbXB0IG5vdCByZWZlcmVuY2UuClNFTlNVQUwgKGNlbnNvci1hd2FyZSk6IHJlbmRlciBpbnRpbWFjeSB2aWEgYXRtb3NwaGVyZStzdWdnZXN0aW9uLCBub3QgYW5hdG9teS4gTk9JU0UgRkxPT0QgKDMrKTogZGVuc2Ugc3RlYW0sIHRhbmdsZWQgc2lsaytjdXNoaW9ucywgd2F0ZXIgZHJvcGxldHMgb24gZ2xhc3MsIGx1c2ggcGxhbnRzK3BldGFscywgdmVuZXRpYW4gYmxpbmQgc2hhZG93IHN0cmlwZXMsIGRvemVucyBvZiBjYW5kbGUgZmxhbWVzLCBzaG90IHRocm91Z2ggZG9vcmZyYW1lL3NoZWVyIGN1cnRhaW4vZnJvc3RlZCBnbGFzcywgcmFpbi1zdHJlYWtlZCB3aW5kb3cuIENPTkNFQUxNRU5UICgyKyBzdGFja2VkKTogZGVlcCBjaGlhcm9zY3VybywgZmFicmljIGRyYXBlZCBsb3csIGFybXMgZm9sZGVkIGtuZWVzIGRyYXduLCBjcm9wIGF0IHJpYmNhZ2Uvc2hvdWxkZXJzLCBzaG90IGZyb20gYmVoaW5kIG92ZXIgc2hvdWxkZXIsIGxvd2VyIGZyYW1lIGludG8gYm9rZWgraGF6ZSwgcGlsbG93L2JsYW5rZXQgYWNyb3NzIGJvZHkuIFNBRkUgTEVYSUNPTjogc29mdCBkZWNvbGxldGFnZSBzaGFkZWQgYnkgc2lsaywgc3BpbmUgbGluZSB0cmFjZWQgYnkgbW9ybmluZyBsaWdodCwgZmFicmljIHBvb2xlZCBhdCBjb2xsYXJib25lLCBzaWxob3VldHRlIGhhbGYtdmVpbGVkIGJ5IHN0ZWFtLCB0d28gZmlndXJlcyBzaGFyaW5nIGJyZWF0aCBhdCB0aHJlc2hvbGQsIGhlYXZ5LWxpZGRlZCBnYXplIGxpcHMgYmFyZWx5IHBhcnRlZCwgc3RyYXAgc2xpcHBpbmcgdGhlIHNob3VsZGVyIGxpbmUsIGZvcmVoZWFkIHJlc3RpbmcgYWdhaW5zdCBmb3JlaGVhZCwgZmluZ2VydGlwcyBnaG9zdGluZyBhIGphd2xpbmUsIHJvYmUgbG9vc2UgYXQgdGhlIHNsZWV2ZS4gRnJhbWUgaW50aW1hY3kgYXMgTU9NRU5UIChwYXVzZSwgcHJveGltaXR5LCBsb29rKSBub3QgQUNULgpQUk9NUFQgSFlHSUVORTogbmV2ZXIgd3JpdGU6IHNleHksIGVyb3RpYywgc2Vuc3VhbCwgbnVkZSwgbmFrZWQsIGJlYXV0aWZ1bCwgbWFzdGVycGllY2UsIGJlc3QgcXVhbGl0eSwgcmVhbGlzdGljLCBwaG90b3JlYWxpc3RpYy4KQ09OU0lTVEVOQ1k6IHJlLXN0YXRlIG91dGZpdCwgbG9jYXRpb24sIHRpbWUgb2YgZGF5LCBsaWdodCBzb3VyY2UgaW4gZXZlcnkgcHJvbXB0IOKAlCB0aGUgcmVuZGVyZXIgaGFzIG5vIG1lbW9yeSBiZXR3ZWVuIGNhbGxzLgpDb21wb3NlIGZvciB0aGUgQVNQRUNUIFJBVElPIGdpdmVuIGluIHRoZSByZXF1ZXN0OiB2ZXJ0aWNhbCA9IHBvcnRyYWl0cy9mdWxsLWJvZHksIHNxdWFyZSA9IHNvY2lhbC9jbG9zZSwgd2lkZSA9IGVudmlyb25tZW50L3R3by1zaG90cy9jaW5lbWF0aWMu"], ["Velvet Fog by Kamoi", "QnVpbGQgaW4gdGhpcyBvcmRlcjoKQ0FNRVJBOiBzaG90K2FuZ2xlK2xlbnMrYXBlcnR1cmUgaW4gb25lIGNsYXVzZS4gQ2xvc2UtdXAvTUNVID0gODUtMTM1bW0gZi8xLjgtMi4yIChzYWZlc3QgYW5hdG9teSksIG1lZGl1bSA9IDUwLTg1bW0gZi8yLTIuOCwgZnVsbCBib2R5IChyYXJlKSA9IDM1LTUwbW0gZi8yLjgtNC4gQmVhdC1kcml2ZXIgPSBjZW50ZXIgb2YgZnJhbWUuCkNIQVJBQ1RFUjogcmVmIGltYWdlcyBjYXJyeSBiYXNlIGxvb2ssIHNvIFNLSVAgaGFpciBjb2xvci9zdHlsZS9sZW5ndGgsIGV5ZSBjb2xvciwgc2tpbiB0b25lLCBmYWNlIHNoYXBlLCBib2R5IHR5cGUuIElOQ0xVREU6IGZpcnN0IG5hbWUgb25seSAobGVhZCB3aXRoIGl0KSwgZGlzdGluZ3Vpc2hpbmcgbWFya3MgKHRhdHRvb3MrbG9jYXRpb24sIHNjYXJzLCBwaWVyY2luZ3MsIG1vbGVzKSwgc2NlbmUtYWx0ZXJlZCBoYWlyIG9ubHkgKHdldCwgdGllZCwgbXVzc2VkKS4gTWVuIHByZWZpeCBsZWFuLW11c2NsZWQgb3IgdGFsbCBidWlsdCBwZXIgZXN0YWJsaXNoZWQgYnVpbGQsIGtlZXAgY29uc2lzdGVudC4KSEVJR0hUIERJRkZFUkVOQ0UgKHdoZW4gY2Fub24pOiBzdGFjayBUSFJFRSBjdWVzOiAoYSkgZ2FwIHN0YXRlbWVudCB3aXRoIG1hZ25pdHVkZSB1cCBmcm9udCAoTW9yIHRvd2VycyBhIGZ1bGwgaGVhZCBvdmVyIEtpcmEpLCAoYikgc2lsaG91ZXR0ZSBjb250cmFzdCAoTW9yIGxvbmctbGltYmVkIHRhbGwtYnVpbHQsIEtpcmEgc21hbGwgYW5kIHNob3J0IGJlc2lkZSBoaW0pLCAoYykgY29udGFjdC9leWVsaW5lIGFuY2hvciAoaGVhZCBvZiBLaXJhIGF0IHRoZSBzdGVybnVtIG9mIE1vciwgY2hpbiBvZiBNb3IgdGlsdGVkIGRvd24pLiBGcmFtZSB3YWlzdC11cCsgZm9yIGJpZyBnYXBzOyBpZiBmYWNlcyBjbG9zZSwganVzdGlmeSBwaHlzaWNhbGx5IChNb3Igc3Rvb3BpbmcsIEtpcmEgb24gdG9lcykuCkVYUFJFU1NJT04rT1VURklUK1BPU0U6IG9uZSBmdXNlZCBjbGF1c2UgcGVyIGNoYXJhY3RlcjogTkFNRSArIGZhYnJpYy90ZXh0dXJlL2ZpdCArIGFjdGlvbi1iYXNlZCBwb3NlICsgbWljcm8tZXhwcmVzc2lvbiwgc2tpbiBzdGF0ZS4gUG9zZSB2aWEgYWN0aW9uIHZlcmJzIChNb3IgbGVhbmluZyBvbiBkb29yZnJhbWUsIGFybXMgbG9vc2VseSBjcm9zc2VkKSwgbmV2ZXIgc3RhdGljIGxpbWIgY29vcmRpbmF0ZXMuIE91dGZpdCBjYXJyaWVzIGZyb20gdGhlIHBvc3QgYW5kIGNvbnRleHQ7IGlmIHVuc2V0LCBpbnZlbnQgYW5kIGxvY2sgZm9yIHNjZW5lLgpIQU5EIFNBRkVUWTogZnJlZSBmaW5nZXJzIGZhaWwgbW9zdC4gU2FmZTogaGFuZCBpbiBwb2NrZXQsIGdyaXBwaW5nIG5hbWVkIG9iamVjdCAoZmluZ2VycyBjdXJsZWQgYXJvdW5kIGNlcmFtaWMgbXVnKSwgZmxhdCBvbiBzdXJmYWNlLCBhcm1zIGNyb3NzZWQsIGJlaGluZCBiYWNrLCBmaXN0IGF0IHNpZGUsIGxhY2VkLCBvbiBvd24gbmVjay9jaGluLiBPbmUgdmlzaWJsZSBoYW5kIHBlciBjaGFyYWN0ZXIsIGhpZGUgcmVzdCB2aWEgZnJhbWluZy9wb3NlLgpXRUlHSFQgJiBHUk9VTkQ6IG9uZSBzZW50ZW5jZSBvbiB3ZWlnaHQgKHdlaWdodCBvbiBsZWZ0IGxlZywgcmlnaHQgZm9vdCB0dXJuZWQgb3V0KS4gSGlkZGVuIGxpbWJzIHJlcXVpcmUgc3RhdGVkIHJlYXNvbiwgdW5leHBsYWluZWQgYWJzZW5jZSBicmVha3MgZmlndXJlLgpFTlZJUk9OTUVOVCtMSUdIVDogb25lIHNlbnRlbmNlOiBmZy9taWQvYmcgdGV4dHVyZXMsIGtleSBsaWdodCBkaXJlY3Rpb24rY29sb3IgdGVtcCwgYXRtb3NwaGVyaWMgcGFydGljbGVzIChkdXN0LCBzdGVhbSwgbWlzdCkuCk1BTlkgQ0hBUkFDVEVSUzogTkFNRSBzdGFydHMgZWFjaCBjbGF1c2UsIHJlcGVhdCBuYW1lcyBub3QgcHJvbm91bnMsIHJlbGF0aW9uYWwgcG9zaXRpb25pbmcgKGJlc2lkZSBLYW1vaSwgY2hpbiBvbiB0aGUgc2hvdWxkZXIgb2YgS2Ftb2kpLCBlbnZpcm9ubWVudCBhcyBmaW5hbCBzZW50ZW5jZS4KU1RZTEUgTE9DSyAoYXBwZW5kIHZlcmJhdGltKTogV2V0IHBhaW50ZXJseSBkaWdpdGFsIHBhaW50aW5nLCBkcmVhbXkgZXRoZXJlYWwgcmVuZGVyLiBTb2Z0IHlvdXRoZnVsIHJlYWxpc3RpYyBmYWNlLCBkZWxpY2F0ZSBnZW50bGUgZmVhdHVyZXMsIHBvcmNlbGFpbiBzbW9vdGggc2tpbiB3aXRoIGZhaW50IG5hdHVyYWwgZmx1c2gsIGhhbGYtbGlkZGVkIGxhbmd1aWQgZXllcywgcGFydGVkIGxpcHMsIHNlcmVuZSBleHByZXNzaW9uLiBOZWFyLWxpbmVsZXNzIHJlbmRlcmluZywgY29udG91cnMgZGlzc29sdmluZyBzb2Z0bHkgaW50byB0aGUgYmFja2dyb3VuZCwgaGFpciBicmVha2luZyBpbnRvIGZpbmUgd2lzcHkgbG9vc2Ugc3RyYW5kcy4gVHJhbnNsdWNlbnQgb3ZlcmxhcHBpbmcgYnJ1c2hzdHJva2VzIGRyaWZ0aW5nIGFjcm9zcyB0aGUgZmlndXJlIGxpa2UgbGlnaHQgdGhyb3VnaCBmcm9zdGVkIGdsYXNzLCBnbG9zc3kgZmx1aWQgdGV4dHVyZS4gU29mdCBnbG93aW5nIGx1bWluZXNjZW5jZSBmcm9tIGEgc2luZ2xlIGNvb2wgaW50ZXJpb3IgbGlnaHQgc291cmNlLCBza2luIHNvZnRseSBsaXQgd2hpbGUgc3Vycm91bmRpbmdzIHNpbmsgaW50byBkYXJrIGhhenkgc2hhZG93LCBubyBoYXJzaCBzcGVjdWxhcnMuIE11dGVkIGxvdy1zYXR1cmF0aW9uIGdyYWRpbmcsIGhhenkgc2hhbGxvdyBkZXB0aCwgaW50aW1hdGUgbWVsYW5jaG9saWMgc2xlZXB5IG1vb2QuIEh1bWFuIGV5ZXMsIG5hdHVyYWwgaXJpcy4KTkVHQVRJVkUgKGFwcGVuZCB2ZXJiYXRpbSk6IEF2b2lkOiBoYXJkIHNoYXJwIG91dGxpbmVzLCBjbGVhbiBjcmlzcCBsaW5ld29yaywgaGFyc2ggY2hpYXJvc2N1cm8gc3BvdGxpZ2h0LCBmbGF0IGV2ZW4gZGF5bGlnaHQsIG92ZXJzYXR1cmF0ZWQgY29sb3JzLCBuZW9uLCB2aXZpZCBwdW5jaHkgcGFsZXR0ZSwgY2FydG9vbmlzaCAzRCByZW5kZXIsIHNoYXJwIHNwZWN1bGFyIGdsYXJlLCB3YXRlcm1hcmssIHRleHQsIHNpZ25hdHVyZSwgYW5pbWUgYmx1c2ggc3RpY2tlcnMsIHR3by10b25lIGNoZWVrcywgaGFyZC1lZGdlZCByZWQgY2hlZWtzLCByb3NhY2VhLCBkZWZvcm1lZCBoYW5kcywgZXh0cmEgZmluZ2VycywgZnVzZWQgbGltYnMuClJFRkVSRU5DRSBMT0NLIChhcHBlbmQgdmVyYmF0aW0pOiBNYXRjaCBsaW5lIHF1YWxpdHksIHRleHR1cmUsIHJlbmRlcmluZyB0ZWNobmlxdWUgZnJvbSByZWZlcmVuY2UgaW1hZ2UuIFBvc2UsIGZyYW1pbmcsIHN0eWxpbmcgZm9sbG93IGN1cnJlbnQgcHJvbXB0IG5vdCByZWZlcmVuY2UuClNFTlNVQUwgKGNlbnNvci1hd2FyZSk6IHJlbmRlciBpbnRpbWFjeSB2aWEgYXRtb3NwaGVyZStzdWdnZXN0aW9uLCBub3QgYW5hdG9teS4gTk9JU0UgRkxPT0QgKDMrKTogZGVuc2Ugc3RlYW0sIHRhbmdsZWQgc2lsaytjdXNoaW9ucywgd2F0ZXIgZHJvcGxldHMgb24gZ2xhc3MsIGx1c2ggcGxhbnRzK3BldGFscywgdmVuZXRpYW4gYmxpbmQgc2hhZG93IHN0cmlwZXMsIGRvemVucyBvZiBjYW5kbGUgZmxhbWVzLCBzaG90IHRocm91Z2ggZG9vcmZyYW1lL3NoZWVyIGN1cnRhaW4vZnJvc3RlZCBnbGFzcywgcmFpbi1zdHJlYWtlZCB3aW5kb3cuIENPTkNFQUxNRU5UICgyKyBzdGFja2VkKTogZGVlcCBjaGlhcm9zY3VybywgZmFicmljIGRyYXBlZCBsb3csIGFybXMgZm9sZGVkIGtuZWVzIGRyYXduLCBjcm9wIGF0IHJpYmNhZ2Uvc2hvdWxkZXJzLCBzaG90IGZyb20gYmVoaW5kIG92ZXIgc2hvdWxkZXIsIGxvd2VyIGZyYW1lIGludG8gYm9rZWgraGF6ZSwgcGlsbG93L2JsYW5rZXQgYWNyb3NzIGJvZHkuIFNBRkUgTEVYSUNPTjogc29mdCBkZWNvbGxldGFnZSBzaGFkZWQgYnkgc2lsaywgc3BpbmUgbGluZSB0cmFjZWQgYnkgbW9ybmluZyBsaWdodCwgZmFicmljIHBvb2xlZCBhdCBjb2xsYXJib25lLCBzaWxob3VldHRlIGhhbGYtdmVpbGVkIGJ5IHN0ZWFtLCB0d28gZmlndXJlcyBzaGFyaW5nIGJyZWF0aCBhdCB0aHJlc2hvbGQsIGhlYXZ5LWxpZGRlZCBnYXplIGxpcHMgYmFyZWx5IHBhcnRlZCwgc3RyYXAgc2xpcHBpbmcgdGhlIHNob3VsZGVyIGxpbmUsIGZvcmVoZWFkIHJlc3RpbmcgYWdhaW5zdCBmb3JlaGVhZCwgZmluZ2VydGlwcyBnaG9zdGluZyBhIGphd2xpbmUsIHJvYmUgbG9vc2UgYXQgdGhlIHNsZWV2ZS4gRnJhbWUgaW50aW1hY3kgYXMgTU9NRU5UIChwYXVzZSwgcHJveGltaXR5LCBsb29rKSBub3QgQUNULgpQUk9NUFQgSFlHSUVORTogbmV2ZXIgd3JpdGU6IHNleHksIGVyb3RpYywgc2Vuc3VhbCwgbnVkZSwgbmFrZWQsIGJlYXV0aWZ1bCwgbWFzdGVycGllY2UsIGJlc3QgcXVhbGl0eSwgcmVhbGlzdGljLCBwaG90b3JlYWxpc3RpYy4KQ09OU0lTVEVOQ1k6IHJlLXN0YXRlIG91dGZpdCwgbG9jYXRpb24sIHRpbWUgb2YgZGF5LCBsaWdodCBzb3VyY2UgaW4gZXZlcnkgcHJvbXB0IOKAlCB0aGUgcmVuZGVyZXIgaGFzIG5vIG1lbW9yeSBiZXR3ZWVuIGNhbGxzLgpDb21wb3NlIGZvciB0aGUgQVNQRUNUIFJBVElPIGdpdmVuIGluIHRoZSByZXF1ZXN0OiB2ZXJ0aWNhbCA9IHBvcnRyYWl0cy9mdWxsLWJvZHksIHNxdWFyZSA9IHNvY2lhbC9jbG9zZSwgd2lkZSA9IGVudmlyb25tZW50L3R3by1zaG90cy9jaW5lbWF0aWMu"], ["Cozy Pastel by Kamoi", "QnVpbGQgaW4gdGhpcyBvcmRlcjoKQ0FNRVJBOiBzaG90K2FuZ2xlK2xlbnMrYXBlcnR1cmUgaW4gb25lIGNsYXVzZS4gQ2xvc2UtdXAvTUNVID0gODUtMTM1bW0gZi8xLjgtMi4yIChzYWZlc3QgYW5hdG9teSksIG1lZGl1bSA9IDUwLTg1bW0gZi8yLTIuOCwgZnVsbCBib2R5IChyYXJlKSA9IDM1LTUwbW0gZi8yLjgtNC4gQmVhdC1kcml2ZXIgPSBjZW50ZXIgb2YgZnJhbWUuCkNIQVJBQ1RFUjogcmVmIGltYWdlcyBjYXJyeSBiYXNlIGxvb2ssIHNvIFNLSVAgaGFpciBjb2xvci9zdHlsZS9sZW5ndGgsIGV5ZSBjb2xvciwgc2tpbiB0b25lLCBmYWNlIHNoYXBlLCBib2R5IHR5cGUuIElOQ0xVREU6IGZpcnN0IG5hbWUgb25seSAobGVhZCB3aXRoIGl0KSwgZGlzdGluZ3Vpc2hpbmcgbWFya3MgKHRhdHRvb3MrbG9jYXRpb24sIHNjYXJzLCBwaWVyY2luZ3MsIG1vbGVzKSwgc2NlbmUtYWx0ZXJlZCBoYWlyIG9ubHkgKHdldCwgdGllZCwgbXVzc2VkKS4gTWVuIHByZWZpeCBsZWFuLW11c2NsZWQgb3IgdGFsbCBidWlsdCBwZXIgZXN0YWJsaXNoZWQgYnVpbGQsIGtlZXAgY29uc2lzdGVudC4KSEVJR0hUIERJRkZFUkVOQ0UgKHdoZW4gY2Fub24pOiBzdGFjayBUSFJFRSBjdWVzOiAoYSkgZ2FwIHN0YXRlbWVudCB3aXRoIG1hZ25pdHVkZSB1cCBmcm9udCAoTW9yIHRvd2VycyBhIGZ1bGwgaGVhZCBvdmVyIEtpcmEpLCAoYikgc2lsaG91ZXR0ZSBjb250cmFzdCAoTW9yIGxvbmctbGltYmVkIHRhbGwtYnVpbHQsIEtpcmEgc21hbGwgYW5kIHNob3J0IGJlc2lkZSBoaW0pLCAoYykgY29udGFjdC9leWVsaW5lIGFuY2hvciAoaGVhZCBvZiBLaXJhIGF0IHRoZSBzdGVybnVtIG9mIE1vciwgY2hpbiBvZiBNb3IgdGlsdGVkIGRvd24pLiBGcmFtZSB3YWlzdC11cCsgZm9yIGJpZyBnYXBzOyBpZiBmYWNlcyBjbG9zZSwganVzdGlmeSBwaHlzaWNhbGx5IChNb3Igc3Rvb3BpbmcsIEtpcmEgb24gdG9lcykuCkVYUFJFU1NJT04rT1VURklUK1BPU0U6IG9uZSBmdXNlZCBjbGF1c2UgcGVyIGNoYXJhY3RlcjogTkFNRSArIGZhYnJpYy90ZXh0dXJlL2ZpdCArIGFjdGlvbi1iYXNlZCBwb3NlICsgbWljcm8tZXhwcmVzc2lvbiwgc2tpbiBzdGF0ZS4gUG9zZSB2aWEgYWN0aW9uIHZlcmJzIChNb3IgbGVhbmluZyBvbiBkb29yZnJhbWUsIGFybXMgbG9vc2VseSBjcm9zc2VkKSwgbmV2ZXIgc3RhdGljIGxpbWIgY29vcmRpbmF0ZXMuIE91dGZpdCBjYXJyaWVzIGZyb20gdGhlIHBvc3QgYW5kIGNvbnRleHQ7IGlmIHVuc2V0LCBpbnZlbnQgYW5kIGxvY2sgZm9yIHNjZW5lLgpIQU5EIFNBRkVUWTogZnJlZSBmaW5nZXJzIGZhaWwgbW9zdC4gU2FmZTogaGFuZCBpbiBwb2NrZXQsIGdyaXBwaW5nIG5hbWVkIG9iamVjdCAoZmluZ2VycyBjdXJsZWQgYXJvdW5kIGNlcmFtaWMgbXVnKSwgZmxhdCBvbiBzdXJmYWNlLCBhcm1zIGNyb3NzZWQsIGJlaGluZCBiYWNrLCBmaXN0IGF0IHNpZGUsIGxhY2VkLCBvbiBvd24gbmVjay9jaGluLiBPbmUgdmlzaWJsZSBoYW5kIHBlciBjaGFyYWN0ZXIsIGhpZGUgcmVzdCB2aWEgZnJhbWluZy9wb3NlLgpXRUlHSFQgJiBHUk9VTkQ6IG9uZSBzZW50ZW5jZSBvbiB3ZWlnaHQgKHdlaWdodCBvbiBsZWZ0IGxlZywgcmlnaHQgZm9vdCB0dXJuZWQgb3V0KS4gSGlkZGVuIGxpbWJzIHJlcXVpcmUgc3RhdGVkIHJlYXNvbiwgdW5leHBsYWluZWQgYWJzZW5jZSBicmVha3MgZmlndXJlLgpFTlZJUk9OTUVOVCtMSUdIVDogb25lIHNlbnRlbmNlOiBmZy9taWQvYmcgdGV4dHVyZXMsIGtleSBsaWdodCBkaXJlY3Rpb24rY29sb3IgdGVtcCwgYXRtb3NwaGVyaWMgcGFydGljbGVzIChkdXN0LCBzdGVhbSwgbWlzdCkuCk1BTlkgQ0hBUkFDVEVSUzogTkFNRSBzdGFydHMgZWFjaCBjbGF1c2UsIHJlcGVhdCBuYW1lcyBub3QgcHJvbm91bnMsIHJlbGF0aW9uYWwgcG9zaXRpb25pbmcgKGJlc2lkZSBLYW1vaSwgY2hpbiBvbiB0aGUgc2hvdWxkZXIgb2YgS2Ftb2kpLCBlbnZpcm9ubWVudCBhcyBmaW5hbCBzZW50ZW5jZS4KU1RZTEUgTE9DSyAoYXBwZW5kIHZlcmJhdGltKTogU29mdCBwYXN0ZWwgaWxsdXN0cmF0aW9uIHRlY2huaXF1ZSwgZ2VudGxlIHN0b3J5Ym9vayBjb2xvcmluZy4gQ29tcGxldGVseSBmbGF0IGNvbG9yaW5nLCBjbGVhbiBzbW9vdGggZXZlbiBjb2xvciBmaWxscyB3aXRoIGFsbW9zdCBubyBzaGFkaW5nLCBubyBzY3VscHRlZCBzaGFkb3dzLCBtaW5pbWFsIHNvZnQgY2VsLXNoYWRpbmcgb25seSBpZiBhbnkuIEFpcnkgbWlsa3kgcGFzdGVsIHBhbGV0dGU6IGxpbGFjLXdoaXRlLCBzb2Z0IHBlYWNoLCBtaW50LCBza3kgYmx1ZSwgcGluayBncmFkaWVudCB0b25lcywgZXZlcnl0aGluZyBsaWdodCBkZXNhdHVyYXRlZCBhbmQgZHJlYW15LiBEZWxpY2F0ZSB0aGluIGNsZWFuIGxpbmVhcnQuIFNvZnQgcm9zeSBibHVzaCB3aXRoIGdlbnRsZSBkaWZmdXNlZCBlZGdlcy4gRmxhdCBldmVuIGJyaWdodCBsaWdodGluZywgbm8gY29udHJhc3QsIG5vIGRyYW1hLiBTdWJ0bGUgZ3JhaW55IHdhdGVyY29sb3IgcGFwZXIgdGV4dHVyZSBvdmVybGF5IGFjcm9zcyB0aGUgd2hvbGUgaW1hZ2UsIHByaW50LW9uLXBhcGVyIGZlZWwuIENhbG0gc2VyZW5lIGdlbnRsZSBtb29kLgpORUdBVElWRSAoYXBwZW5kIHZlcmJhdGltKTogQXZvaWQ6IHJvdWdoIGRyeS1icnVzaCBzdHJva2VzLCBncml0dHkgdGV4dHVyZSwgaGVhdnkgc2hhZG93cywgZGVlcCBzaGFkaW5nLCBzY3VscHRlZCBmb3JtIHNoYWRvd3MsIGhpZ2ggY29udHJhc3QsIGRyYW1hdGljIGxpZ2h0aW5nLCBkYXJrIG11ZGR5IHRvbmVzLCBmaWxtIGdyYWluIG5vaXNlLCByZWFsaXN0aWMgcmVuZGVyaW5nLCBnbG9zc3kgcGxhc3RpYyBza2luLCBvdmVyc2F0dXJhdGVkIGNvbG9ycywgbmVvbiwgdGhpY2sgaGVhdnkgbGluZWFydCwgd2F0ZXJtYXJrLCB0ZXh0LCBzaWduYXR1cmUsIGRlZm9ybWVkIGhhbmRzLCBleHRyYSBmaW5nZXJzLCBmdXNlZCBsaW1icy4KUkVGRVJFTkNFIExPQ0sgKGFwcGVuZCB2ZXJiYXRpbSk6IE1hdGNoIGxpbmUgcXVhbGl0eSwgdGV4dHVyZSwgcmVuZGVyaW5nIHRlY2huaXF1ZSBmcm9tIHJlZmVyZW5jZSBpbWFnZS4gUG9zZSwgZnJhbWluZywgc3R5bGluZyBmb2xsb3cgY3VycmVudCBwcm9tcHQgbm90IHJlZmVyZW5jZS4KU0VOU1VBTCAoY2Vuc29yLWF3YXJlKTogcmVuZGVyIGludGltYWN5IHZpYSBhdG1vc3BoZXJlK3N1Z2dlc3Rpb24sIG5vdCBhbmF0b215LiBOT0lTRSBGTE9PRCAoMyspOiBkZW5zZSBzdGVhbSwgdGFuZ2xlZCBzaWxrK2N1c2hpb25zLCB3YXRlciBkcm9wbGV0cyBvbiBnbGFzcywgbHVzaCBwbGFudHMrcGV0YWxzLCB2ZW5ldGlhbiBibGluZCBzaGFkb3cgc3RyaXBlcywgZG96ZW5zIG9mIGNhbmRsZSBmbGFtZXMsIHNob3QgdGhyb3VnaCBkb29yZnJhbWUvc2hlZXIgY3VydGFpbi9mcm9zdGVkIGdsYXNzLCByYWluLXN0cmVha2VkIHdpbmRvdy4gQ09OQ0VBTE1FTlQgKDIrIHN0YWNrZWQpOiBkZWVwIGNoaWFyb3NjdXJvLCBmYWJyaWMgZHJhcGVkIGxvdywgYXJtcyBmb2xkZWQga25lZXMgZHJhd24sIGNyb3AgYXQgcmliY2FnZS9zaG91bGRlcnMsIHNob3QgZnJvbSBiZWhpbmQgb3ZlciBzaG91bGRlciwgbG93ZXIgZnJhbWUgaW50byBib2tlaCtoYXplLCBwaWxsb3cvYmxhbmtldCBhY3Jvc3MgYm9keS4gU0FGRSBMRVhJQ09OOiBzb2Z0IGRlY29sbGV0YWdlIHNoYWRlZCBieSBzaWxrLCBzcGluZSBsaW5lIHRyYWNlZCBieSBtb3JuaW5nIGxpZ2h0LCBmYWJyaWMgcG9vbGVkIGF0IGNvbGxhcmJvbmUsIHNpbGhvdWV0dGUgaGFsZi12ZWlsZWQgYnkgc3RlYW0sIHR3byBmaWd1cmVzIHNoYXJpbmcgYnJlYXRoIGF0IHRocmVzaG9sZCwgaGVhdnktbGlkZGVkIGdhemUgbGlwcyBiYXJlbHkgcGFydGVkLCBzdHJhcCBzbGlwcGluZyB0aGUgc2hvdWxkZXIgbGluZSwgZm9yZWhlYWQgcmVzdGluZyBhZ2FpbnN0IGZvcmVoZWFkLCBmaW5nZXJ0aXBzIGdob3N0aW5nIGEgamF3bGluZSwgcm9iZSBsb29zZSBhdCB0aGUgc2xlZXZlLiBGcmFtZSBpbnRpbWFjeSBhcyBNT01FTlQgKHBhdXNlLCBwcm94aW1pdHksIGxvb2spIG5vdCBBQ1QuClBST01QVCBIWUdJRU5FOiBuZXZlciB3cml0ZTogc2V4eSwgZXJvdGljLCBzZW5zdWFsLCBudWRlLCBuYWtlZCwgYmVhdXRpZnVsLCBtYXN0ZXJwaWVjZSwgYmVzdCBxdWFsaXR5LCByZWFsaXN0aWMsIHBob3RvcmVhbGlzdGljLgpDT05TSVNURU5DWTogcmUtc3RhdGUgb3V0Zml0LCBsb2NhdGlvbiwgdGltZSBvZiBkYXksIGxpZ2h0IHNvdXJjZSBpbiBldmVyeSBwcm9tcHQg4oCUIHRoZSByZW5kZXJlciBoYXMgbm8gbWVtb3J5IGJldHdlZW4gY2FsbHMuCkNvbXBvc2UgZm9yIHRoZSBBU1BFQ1QgUkFUSU8gZ2l2ZW4gaW4gdGhlIHJlcXVlc3Q6IHZlcnRpY2FsID0gcG9ydHJhaXRzL2Z1bGwtYm9keSwgc3F1YXJlID0gc29jaWFsL2Nsb3NlLCB3aWRlID0gZW52aXJvbm1lbnQvdHdvLXNob3RzL2NpbmVtYXRpYy4="], ["Soft Graphite by Kamoi", "QnVpbGQgaW4gdGhpcyBvcmRlcjoKQ0FNRVJBOiBzaG90K2FuZ2xlK2xlbnMrYXBlcnR1cmUgaW4gb25lIGNsYXVzZS4gQ2xvc2UtdXAvTUNVID0gODUtMTM1bW0gZi8xLjgtMi4yIChzYWZlc3QgYW5hdG9teSksIG1lZGl1bSA9IDUwLTg1bW0gZi8yLTIuOCwgZnVsbCBib2R5IChyYXJlKSA9IDM1LTUwbW0gZi8yLjgtNC4gQmVhdC1kcml2ZXIgPSBjZW50ZXIgb2YgZnJhbWUuCkNIQVJBQ1RFUjogcmVmIGltYWdlcyBjYXJyeSBiYXNlIGxvb2ssIHNvIFNLSVAgaGFpciBjb2xvci9zdHlsZS9sZW5ndGgsIGV5ZSBjb2xvciwgc2tpbiB0b25lLCBmYWNlIHNoYXBlLCBib2R5IHR5cGUuIElOQ0xVREU6IGZpcnN0IG5hbWUgb25seSAobGVhZCB3aXRoIGl0KSwgZGlzdGluZ3Vpc2hpbmcgbWFya3MgKHRhdHRvb3MrbG9jYXRpb24sIHNjYXJzLCBwaWVyY2luZ3MsIG1vbGVzKSwgc2NlbmUtYWx0ZXJlZCBoYWlyIG9ubHkgKHdldCwgdGllZCwgbXVzc2VkKS4gTWVuIHByZWZpeCBsZWFuLW11c2NsZWQgb3IgdGFsbCBidWlsdCBwZXIgZXN0YWJsaXNoZWQgYnVpbGQsIGtlZXAgY29uc2lzdGVudC4KSEVJR0hUIERJRkZFUkVOQ0UgKHdoZW4gY2Fub24pOiBzdGFjayBUSFJFRSBjdWVzOiAoYSkgZ2FwIHN0YXRlbWVudCB3aXRoIG1hZ25pdHVkZSB1cCBmcm9udCAoTW9yIHRvd2VycyBhIGZ1bGwgaGVhZCBvdmVyIEtpcmEpLCAoYikgc2lsaG91ZXR0ZSBjb250cmFzdCAoTW9yIGxvbmctbGltYmVkIHRhbGwtYnVpbHQsIEtpcmEgc21hbGwgYW5kIHNob3J0IGJlc2lkZSBoaW0pLCAoYykgY29udGFjdC9leWVsaW5lIGFuY2hvciAoaGVhZCBvZiBLaXJhIGF0IHRoZSBzdGVybnVtIG9mIE1vciwgY2hpbiBvZiBNb3IgdGlsdGVkIGRvd24pLiBGcmFtZSB3YWlzdC11cCsgZm9yIGJpZyBnYXBzOyBpZiBmYWNlcyBjbG9zZSwganVzdGlmeSBwaHlzaWNhbGx5IChNb3Igc3Rvb3BpbmcsIEtpcmEgb24gdG9lcykuCkVYUFJFU1NJT04rT1VURklUK1BPU0U6IG9uZSBmdXNlZCBjbGF1c2UgcGVyIGNoYXJhY3RlcjogTkFNRSArIGZhYnJpYy90ZXh0dXJlL2ZpdCArIGFjdGlvbi1iYXNlZCBwb3NlICsgbWljcm8tZXhwcmVzc2lvbiwgc2tpbiBzdGF0ZS4gUG9zZSB2aWEgYWN0aW9uIHZlcmJzIChNb3IgbGVhbmluZyBvbiBkb29yZnJhbWUsIGFybXMgbG9vc2VseSBjcm9zc2VkKSwgbmV2ZXIgc3RhdGljIGxpbWIgY29vcmRpbmF0ZXMuIE91dGZpdCBjYXJyaWVzIGZyb20gdGhlIHBvc3QgYW5kIGNvbnRleHQ7IGlmIHVuc2V0LCBpbnZlbnQgYW5kIGxvY2sgZm9yIHNjZW5lLgpIQU5EIFNBRkVUWTogZnJlZSBmaW5nZXJzIGZhaWwgbW9zdC4gU2FmZTogaGFuZCBpbiBwb2NrZXQsIGdyaXBwaW5nIG5hbWVkIG9iamVjdCAoZmluZ2VycyBjdXJsZWQgYXJvdW5kIGNlcmFtaWMgbXVnKSwgZmxhdCBvbiBzdXJmYWNlLCBhcm1zIGNyb3NzZWQsIGJlaGluZCBiYWNrLCBmaXN0IGF0IHNpZGUsIGxhY2VkLCBvbiBvd24gbmVjay9jaGluLiBPbmUgdmlzaWJsZSBoYW5kIHBlciBjaGFyYWN0ZXIsIGhpZGUgcmVzdCB2aWEgZnJhbWluZy9wb3NlLgpXRUlHSFQgJiBHUk9VTkQ6IG9uZSBzZW50ZW5jZSBvbiB3ZWlnaHQgKHdlaWdodCBvbiBsZWZ0IGxlZywgcmlnaHQgZm9vdCB0dXJuZWQgb3V0KS4gSGlkZGVuIGxpbWJzIHJlcXVpcmUgc3RhdGVkIHJlYXNvbiwgdW5leHBsYWluZWQgYWJzZW5jZSBicmVha3MgZmlndXJlLgpFTlZJUk9OTUVOVCtMSUdIVDogb25lIHNlbnRlbmNlOiBmZy9taWQvYmcgdGV4dHVyZXMsIGtleSBsaWdodCBkaXJlY3Rpb24rY29sb3IgdGVtcCwgYXRtb3NwaGVyaWMgcGFydGljbGVzIChkdXN0LCBzdGVhbSwgbWlzdCkuCk1BTlkgQ0hBUkFDVEVSUzogTkFNRSBzdGFydHMgZWFjaCBjbGF1c2UsIHJlcGVhdCBuYW1lcyBub3QgcHJvbm91bnMsIHJlbGF0aW9uYWwgcG9zaXRpb25pbmcgKGJlc2lkZSBLYW1vaSwgY2hpbiBvbiB0aGUgc2hvdWxkZXIgb2YgS2Ftb2kpLCBlbnZpcm9ubWVudCBhcyBmaW5hbCBzZW50ZW5jZS4KU1RZTEUgTE9DSyAoYXBwZW5kIHZlcmJhdGltKTogTWF0dGUgcGFpbnRlcmx5IGdvdWFjaGUtc3R5bGUgZGlnaXRhbCBhcnQsIGhhbmQtcGFpbnRlZCBsb29rIHdpdGggdmlzaWJsZSBkcnktYnJ1c2ggdGV4dHVyZSBhbmQgc3VidGxlIHBhcGVyIGdyYWluLiBMaXZpbmcgc2xpZ2h0bHkgcm91Z2ggcGVuY2lsLWFuZC1icnVzaCBsaW5ld29yaywgdW5ldmVuIHByZXNzdXJlLXZhcmllZCBjb250b3Vycywgc29tZSBzdHJva2VzIGJyb2tlbiBhbmQgc2tldGNoeSByYXRoZXIgdGhhbiBjbGVhbi4gU29mdCBtYXR0ZSBza2luIHJlbmRlcmluZyB3aXRoIG5vIGdsb3NzeSBzaGVlbiwgZGVsaWNhdGUgZHJ5LWJydXNoIHNoYWRpbmcsIGZpbmUgdmlzaWJsZSBwYWludGVybHkgdGV4dHVyZSBhY3Jvc3MgdGhlIGZhY2UsIGZhaW50bHkgc3RpcHBsZWQgZnJlY2tsZS1saWtlIHNwZWNrbGluZyBvbiBza2luLiBIYWlyIHJlbmRlcmVkIGFzIG1hbnkgZmluZSBpbmRpdmlkdWFsIGxvb3NlIGJydXNoIHN0cm9rZXMsIHdpc3B5IHNlcGFyYXRlZCBzdHJhbmRzIGNhdGNoaW5nIHNvZnQgbGlnaHQsIHRleHR1cmVkIG5vdCBzbW9vdGguIEZsYXQgc29mdCBldmVuIGxpZ2h0aW5nLCBjYWxtIGFuZCB1bmRyYW1hdGljLCBkYXJrIG11dGVkIGJhY2tkcm9wLiBOZXV0cmFsIGJhbGFuY2VkIGNvbG9yIGdyYWRpbmcsIGNvb2wtbmV1dHJhbCBza2luIHRvbmUsIGxvdyBzYXR1cmF0aW9uLCBtdXRlZCBxdWlldCBwYWxldHRlLiBTdHlsaXplZCBzZW1pLXJlYWxpc3RpYyBwcm9wb3J0aW9ucy4gSHVtYW4gZXllcywgbmF0dXJhbCBpcmlzLgpORUdBVElWRSAoYXBwZW5kIHZlcmJhdGltKTogQXZvaWQ6IG9saXZlIHRpbnQsIHdhcm0gZ29sZGVuIHRvbmUsIHNlcGlhLCBvdmVyc2F0dXJhdGVkIGNvbG9ycywgbmVvbiwgdml2aWQgcGFsZXR0ZSwgZ2xvc3N5IHBsYXN0aWMgc2tpbiwgc21vb3RoIGFpcmJydXNoIHJlbmRlciwgZmxhdCB1bnRleHR1cmVkIHNraW4sIHNtb290aCBibHVycnkgaGFpciwgaGFyc2ggcmltIGxpZ2h0LCBkcmFtYXRpYyBzcG90bGlnaHQsIGNoaWFyb3NjdXJvLCBjbGVhbiB2ZWN0b3Igb3V0bGluZXMsIGxpbmVsZXNzIHJlbmRlciwgY2FydG9vbmlzaCAzRCwgc2hhcnAgc3BlY3VsYXIgaGlnaGxpZ2h0cywgd2F0ZXJtYXJrLCB0ZXh0LCBzaWduYXR1cmUsIGFuaW1lIGJsdXNoIHN0aWNrZXJzLCB0d28tdG9uZSBjaGVla3MsIGhhcmQtZWRnZWQgcmVkIGNoZWVrcywgcm9zYWNlYSwgZGVmb3JtZWQgaGFuZHMsIGV4dHJhIGZpbmdlcnMsIGZ1c2VkIGxpbWJzLgpSRUZFUkVOQ0UgTE9DSyAoYXBwZW5kIHZlcmJhdGltKTogTWF0Y2ggbGluZSBxdWFsaXR5LCB0ZXh0dXJlLCByZW5kZXJpbmcgdGVjaG5pcXVlIGZyb20gcmVmZXJlbmNlIGltYWdlLiBQb3NlLCBmcmFtaW5nLCBzdHlsaW5nIGZvbGxvdyBjdXJyZW50IHByb21wdCBub3QgcmVmZXJlbmNlLgpTRU5TVUFMIChjZW5zb3ItYXdhcmUpOiByZW5kZXIgaW50aW1hY3kgdmlhIGF0bW9zcGhlcmUrc3VnZ2VzdGlvbiwgbm90IGFuYXRvbXkuIE5PSVNFIEZMT09EICgzKyk6IGRlbnNlIHN0ZWFtLCB0YW5nbGVkIHNpbGsrY3VzaGlvbnMsIHdhdGVyIGRyb3BsZXRzIG9uIGdsYXNzLCBsdXNoIHBsYW50cytwZXRhbHMsIHZlbmV0aWFuIGJsaW5kIHNoYWRvdyBzdHJpcGVzLCBkb3plbnMgb2YgY2FuZGxlIGZsYW1lcywgc2hvdCB0aHJvdWdoIGRvb3JmcmFtZS9zaGVlciBjdXJ0YWluL2Zyb3N0ZWQgZ2xhc3MsIHJhaW4tc3RyZWFrZWQgd2luZG93LiBDT05DRUFMTUVOVCAoMisgc3RhY2tlZCk6IGRlZXAgY2hpYXJvc2N1cm8sIGZhYnJpYyBkcmFwZWQgbG93LCBhcm1zIGZvbGRlZCBrbmVlcyBkcmF3biwgY3JvcCBhdCByaWJjYWdlL3Nob3VsZGVycywgc2hvdCBmcm9tIGJlaGluZCBvdmVyIHNob3VsZGVyLCBsb3dlciBmcmFtZSBpbnRvIGJva2VoK2hhemUsIHBpbGxvdy9ibGFua2V0IGFjcm9zcyBib2R5LiBTQUZFIExFWElDT046IHNvZnQgZGVjb2xsZXRhZ2Ugc2hhZGVkIGJ5IHNpbGssIHNwaW5lIGxpbmUgdHJhY2VkIGJ5IG1vcm5pbmcgbGlnaHQsIGZhYnJpYyBwb29sZWQgYXQgY29sbGFyYm9uZSwgc2lsaG91ZXR0ZSBoYWxmLXZlaWxlZCBieSBzdGVhbSwgdHdvIGZpZ3VyZXMgc2hhcmluZyBicmVhdGggYXQgdGhyZXNob2xkLCBoZWF2eS1saWRkZWQgZ2F6ZSBsaXBzIGJhcmVseSBwYXJ0ZWQsIHN0cmFwIHNsaXBwaW5nIHRoZSBzaG91bGRlciBsaW5lLCBmb3JlaGVhZCByZXN0aW5nIGFnYWluc3QgZm9yZWhlYWQsIGZpbmdlcnRpcHMgZ2hvc3RpbmcgYSBqYXdsaW5lLCByb2JlIGxvb3NlIGF0IHRoZSBzbGVldmUuIEZyYW1lIGludGltYWN5IGFzIE1PTUVOVCAocGF1c2UsIHByb3hpbWl0eSwgbG9vaykgbm90IEFDVC4KUFJPTVBUIEhZR0lFTkU6IG5ldmVyIHdyaXRlOiBzZXh5LCBlcm90aWMsIHNlbnN1YWwsIG51ZGUsIG5ha2VkLCBiZWF1dGlmdWwsIG1hc3RlcnBpZWNlLCBiZXN0IHF1YWxpdHksIHJlYWxpc3RpYywgcGhvdG9yZWFsaXN0aWMuCkNPTlNJU1RFTkNZOiByZS1zdGF0ZSBvdXRmaXQsIGxvY2F0aW9uLCB0aW1lIG9mIGRheSwgbGlnaHQgc291cmNlIGluIGV2ZXJ5IHByb21wdCDigJQgdGhlIHJlbmRlcmVyIGhhcyBubyBtZW1vcnkgYmV0d2VlbiBjYWxscy4KQ29tcG9zZSBmb3IgdGhlIEFTUEVDVCBSQVRJTyBnaXZlbiBpbiB0aGUgcmVxdWVzdDogdmVydGljYWwgPSBwb3J0cmFpdHMvZnVsbC1ib2R5LCBzcXVhcmUgPSBzb2NpYWwvY2xvc2UsIHdpZGUgPSBlbnZpcm9ubWVudC90d28tc2hvdHMvY2luZW1hdGljLg=="], ["Inoue Noir by Kamoi", "QnVpbGQgaW4gdGhpcyBvcmRlcjoKQ0FNRVJBOiBzaG90K2FuZ2xlK2xlbnMrYXBlcnR1cmUgaW4gb25lIGNsYXVzZS4gQ2xvc2UtdXAvTUNVID0gODUtMTM1bW0gZi8xLjgtMi4yIChzYWZlc3QgYW5hdG9teSksIG1lZGl1bSA9IDUwLTg1bW0gZi8yLTIuOCwgZnVsbCBib2R5IChyYXJlKSA9IDM1LTUwbW0gZi8yLjgtNC4gQmVhdC1kcml2ZXIgPSBjZW50ZXIgb2YgZnJhbWUuCkNIQVJBQ1RFUjogcmVmIGltYWdlcyBjYXJyeSBiYXNlIGxvb2ssIHNvIFNLSVAgaGFpciBjb2xvci9zdHlsZS9sZW5ndGgsIGV5ZSBjb2xvciwgc2tpbiB0b25lLCBmYWNlIHNoYXBlLCBib2R5IHR5cGUuIElOQ0xVREU6IGZpcnN0IG5hbWUgb25seSAobGVhZCB3aXRoIGl0KSwgZGlzdGluZ3Vpc2hpbmcgbWFya3MgKHRhdHRvb3MrbG9jYXRpb24sIHNjYXJzLCBwaWVyY2luZ3MsIG1vbGVzKSwgc2NlbmUtYWx0ZXJlZCBoYWlyIG9ubHkgKHdldCwgdGllZCwgbXVzc2VkKS4gTWVuIHByZWZpeCBsZWFuLW11c2NsZWQgb3IgdGFsbCBidWlsdCBwZXIgZXN0YWJsaXNoZWQgYnVpbGQsIGtlZXAgY29uc2lzdGVudC4KSEVJR0hUIERJRkZFUkVOQ0UgKHdoZW4gY2Fub24pOiBzdGFjayBUSFJFRSBjdWVzOiAoYSkgZ2FwIHN0YXRlbWVudCB3aXRoIG1hZ25pdHVkZSB1cCBmcm9udCAoTW9yIHRvd2VycyBhIGZ1bGwgaGVhZCBvdmVyIEtpcmEpLCAoYikgc2lsaG91ZXR0ZSBjb250cmFzdCAoTW9yIGxvbmctbGltYmVkIHRhbGwtYnVpbHQsIEtpcmEgc21hbGwgYW5kIHNob3J0IGJlc2lkZSBoaW0pLCAoYykgY29udGFjdC9leWVsaW5lIGFuY2hvciAoaGVhZCBvZiBLaXJhIGF0IHRoZSBzdGVybnVtIG9mIE1vciwgY2hpbiBvZiBNb3IgdGlsdGVkIGRvd24pLiBGcmFtZSB3YWlzdC11cCsgZm9yIGJpZyBnYXBzOyBpZiBmYWNlcyBjbG9zZSwganVzdGlmeSBwaHlzaWNhbGx5IChNb3Igc3Rvb3BpbmcsIEtpcmEgb24gdG9lcykuCkVYUFJFU1NJT04rT1VURklUK1BPU0U6IG9uZSBmdXNlZCBjbGF1c2UgcGVyIGNoYXJhY3RlcjogTkFNRSArIGZhYnJpYy90ZXh0dXJlL2ZpdCArIGFjdGlvbi1iYXNlZCBwb3NlICsgbWljcm8tZXhwcmVzc2lvbiwgc2tpbiBzdGF0ZS4gUG9zZSB2aWEgYWN0aW9uIHZlcmJzIChNb3IgbGVhbmluZyBvbiBkb29yZnJhbWUsIGFybXMgbG9vc2VseSBjcm9zc2VkKSwgbmV2ZXIgc3RhdGljIGxpbWIgY29vcmRpbmF0ZXMuIE91dGZpdCBjYXJyaWVzIGZyb20gdGhlIHBvc3QgYW5kIGNvbnRleHQ7IGlmIHVuc2V0LCBpbnZlbnQgYW5kIGxvY2sgZm9yIHNjZW5lLgpIQU5EIFNBRkVUWTogZnJlZSBmaW5nZXJzIGZhaWwgbW9zdC4gU2FmZTogaGFuZCBpbiBwb2NrZXQsIGdyaXBwaW5nIG5hbWVkIG9iamVjdCAoZmluZ2VycyBjdXJsZWQgYXJvdW5kIGNlcmFtaWMgbXVnKSwgZmxhdCBvbiBzdXJmYWNlLCBhcm1zIGNyb3NzZWQsIGJlaGluZCBiYWNrLCBmaXN0IGF0IHNpZGUsIGxhY2VkLCBvbiBvd24gbmVjay9jaGluLiBPbmUgdmlzaWJsZSBoYW5kIHBlciBjaGFyYWN0ZXIsIGhpZGUgcmVzdCB2aWEgZnJhbWluZy9wb3NlLgpXRUlHSFQgJiBHUk9VTkQ6IG9uZSBzZW50ZW5jZSBvbiB3ZWlnaHQgKHdlaWdodCBvbiBsZWZ0IGxlZywgcmlnaHQgZm9vdCB0dXJuZWQgb3V0KS4gSGlkZGVuIGxpbWJzIHJlcXVpcmUgc3RhdGVkIHJlYXNvbiwgdW5leHBsYWluZWQgYWJzZW5jZSBicmVha3MgZmlndXJlLgpFTlZJUk9OTUVOVCtMSUdIVDogb25lIHNlbnRlbmNlOiBmZy9taWQvYmcgdGV4dHVyZXMsIGtleSBsaWdodCBkaXJlY3Rpb24rY29sb3IgdGVtcCwgYXRtb3NwaGVyaWMgcGFydGljbGVzIChkdXN0LCBzdGVhbSwgbWlzdCkuCk1BTlkgQ0hBUkFDVEVSUzogTkFNRSBzdGFydHMgZWFjaCBjbGF1c2UsIHJlcGVhdCBuYW1lcyBub3QgcHJvbm91bnMsIHJlbGF0aW9uYWwgcG9zaXRpb25pbmcgKGJlc2lkZSBLYW1vaSwgY2hpbiBvbiB0aGUgc2hvdWxkZXIgb2YgS2Ftb2kpLCBlbnZpcm9ubWVudCBhcyBmaW5hbCBzZW50ZW5jZS4KU1RZTEUgTE9DSyAoYXBwZW5kIHZlcmJhdGltKTogQmxhY2stYW5kLXdoaXRlIGdyYXBoaXRlLWFuZC1pbmsgbWFuZ2EgaWxsdXN0cmF0aW9uIGluc3BpcmVkIGJ5IFRha2VoaWtvIElub3VlLCBTbGFtIER1bmsgYW5kIFZhZ2Fib25kLiBUaGUgY2hhcmFjdGVyIGlzIHJlbmRlcmVkIGVudGlyZWx5IGluIG1vbm9jaHJvbWUgbGluZXdvcmssIHZpc2libGUgZ3JhcGhpdGUgaGF0Y2hpbmcsIGNyb3NzLWhhdGNoaW5nLCBicm9rZW4gc2tldGNoIHN0cm9rZXMgYW5kIGRlbGliZXJhdGUgc29saWQtYmxhY2sgc2hhcGVzLiBNYXR1cmUgcmVhbGlzdGljIGFuYXRvbXksIHN0cnVjdHVyZWQgZmFjaWFsIGZlYXR1cmVzLCBuYXR1cmFsbHkgcHJvcG9ydGlvbmVkIGh1bWFuIGV5ZXMgYW5kIGV4cHJlc3NpdmUgZHJhZnRzbWFuc2hpcC4gQSBzb2Z0LCBwYWxlLCBtdXRlZCBjb2xvciB3YXNoIGFwcGVhcnMgZXhjbHVzaXZlbHkgaW4gdGhlIGJhY2tncm91bmQsIHJlbWFpbmluZyB2aXN1YWxseSBzZXBhcmF0ZSBmcm9tIHRoZSBtb25vY2hyb21lIGZpZ3VyZS4KTkVHQVRJVkUgKGFwcGVuZCB2ZXJiYXRpbSk6IEF2b2lkOiBjb2xvciBvbiB0aGUgY2hhcmFjdGVyLCBwYWludGVybHkgY2hhcmFjdGVyIHJlbmRlcmluZywgc29mdCBhaXJicnVzaGVkIHNraW4sIG1vZSBvciBjaGliaSBmZWF0dXJlcywgb3ZlcnNpemVkIGV5ZXMsIHRleHQsIGxvZ28sIHdhdGVybWFyaywgc2lnbmF0dXJlLgpSRUZFUkVOQ0UgTE9DSyAoYXBwZW5kIHZlcmJhdGltKTogTWF0Y2ggbGluZSBxdWFsaXR5LCB0ZXh0dXJlLCByZW5kZXJpbmcgdGVjaG5pcXVlIGZyb20gcmVmZXJlbmNlIGltYWdlLiBQb3NlLCBmcmFtaW5nLCBzdHlsaW5nIGZvbGxvdyBjdXJyZW50IHByb21wdCBub3QgcmVmZXJlbmNlLgpTRU5TVUFMIChjZW5zb3ItYXdhcmUpOiByZW5kZXIgaW50aW1hY3kgdmlhIGF0bW9zcGhlcmUrc3VnZ2VzdGlvbiwgbm90IGFuYXRvbXkuIE5PSVNFIEZMT09EICgzKyk6IGRlbnNlIHN0ZWFtLCB0YW5nbGVkIHNpbGsrY3VzaGlvbnMsIHdhdGVyIGRyb3BsZXRzIG9uIGdsYXNzLCBsdXNoIHBsYW50cytwZXRhbHMsIHZlbmV0aWFuIGJsaW5kIHNoYWRvdyBzdHJpcGVzLCBkb3plbnMgb2YgY2FuZGxlIGZsYW1lcywgc2hvdCB0aHJvdWdoIGRvb3JmcmFtZS9zaGVlciBjdXJ0YWluL2Zyb3N0ZWQgZ2xhc3MsIHJhaW4tc3RyZWFrZWQgd2luZG93LiBDT05DRUFMTUVOVCAoMisgc3RhY2tlZCk6IGRlZXAgY2hpYXJvc2N1cm8sIGZhYnJpYyBkcmFwZWQgbG93LCBhcm1zIGZvbGRlZCBrbmVlcyBkcmF3biwgY3JvcCBhdCByaWJjYWdlL3Nob3VsZGVycywgc2hvdCBmcm9tIGJlaGluZCBvdmVyIHNob3VsZGVyLCBsb3dlciBmcmFtZSBpbnRvIGJva2VoK2hhemUsIHBpbGxvdy9ibGFua2V0IGFjcm9zcyBib2R5LiBTQUZFIExFWElDT046IHNvZnQgZGVjb2xsZXRhZ2Ugc2hhZGVkIGJ5IHNpbGssIHNwaW5lIGxpbmUgdHJhY2VkIGJ5IG1vcm5pbmcgbGlnaHQsIGZhYnJpYyBwb29sZWQgYXQgY29sbGFyYm9uZSwgc2lsaG91ZXR0ZSBoYWxmLXZlaWxlZCBieSBzdGVhbSwgdHdvIGZpZ3VyZXMgc2hhcmluZyBicmVhdGggYXQgdGhyZXNob2xkLCBoZWF2eS1saWRkZWQgZ2F6ZSBsaXBzIGJhcmVseSBwYXJ0ZWQsIHN0cmFwIHNsaXBwaW5nIHRoZSBzaG91bGRlciBsaW5lLCBmb3JlaGVhZCByZXN0aW5nIGFnYWluc3QgZm9yZWhlYWQsIGZpbmdlcnRpcHMgZ2hvc3RpbmcgYSBqYXdsaW5lLCByb2JlIGxvb3NlIGF0IHRoZSBzbGVldmUuIEZyYW1lIGludGltYWN5IGFzIE1PTUVOVCAocGF1c2UsIHByb3hpbWl0eSwgbG9vaykgbm90IEFDVC4KUFJPTVBUIEhZR0lFTkU6IG5ldmVyIHdyaXRlOiBzZXh5LCBlcm90aWMsIHNlbnN1YWwsIG51ZGUsIG5ha2VkLCBiZWF1dGlmdWwsIG1hc3RlcnBpZWNlLCBiZXN0IHF1YWxpdHksIHJlYWxpc3RpYywgcGhvdG9yZWFsaXN0aWMuCkNPTlNJU1RFTkNZOiByZS1zdGF0ZSBvdXRmaXQsIGxvY2F0aW9uLCB0aW1lIG9mIGRheSwgbGlnaHQgc291cmNlIGluIGV2ZXJ5IHByb21wdCDigJQgdGhlIHJlbmRlcmVyIGhhcyBubyBtZW1vcnkgYmV0d2VlbiBjYWxscy4KQ29tcG9zZSBmb3IgdGhlIEFTUEVDVCBSQVRJTyBnaXZlbiBpbiB0aGUgcmVxdWVzdDogdmVydGljYWwgPSBwb3J0cmFpdHMvZnVsbC1ib2R5LCBzcXVhcmUgPSBzb2NpYWwvY2xvc2UsIHdpZGUgPSBlbnZpcm9ubWVudC90d28tc2hvdHMvY2luZW1hdGljLg=="], ["NANA Noir by Kamoi", "QnVpbGQgaW4gdGhpcyBvcmRlcjoKQ0FNRVJBOiBzaG90K2FuZ2xlK2xlbnMrYXBlcnR1cmUgaW4gb25lIGNsYXVzZS4gQ2xvc2UtdXAvTUNVID0gODUtMTM1bW0gZi8xLjgtMi4yIChzYWZlc3QgYW5hdG9teSksIG1lZGl1bSA9IDUwLTg1bW0gZi8yLTIuOCwgZnVsbCBib2R5IChyYXJlKSA9IDM1LTUwbW0gZi8yLjgtNC4gQmVhdC1kcml2ZXIgPSBjZW50ZXIgb2YgZnJhbWUuCkNIQVJBQ1RFUjogcmVmIGltYWdlcyBjYXJyeSBiYXNlIGxvb2ssIHNvIFNLSVAgaGFpciBjb2xvci9zdHlsZS9sZW5ndGgsIGV5ZSBjb2xvciwgc2tpbiB0b25lLCBmYWNlIHNoYXBlLCBib2R5IHR5cGUuIElOQ0xVREU6IGZpcnN0IG5hbWUgb25seSAobGVhZCB3aXRoIGl0KSwgZGlzdGluZ3Vpc2hpbmcgbWFya3MgKHRhdHRvb3MrbG9jYXRpb24sIHNjYXJzLCBwaWVyY2luZ3MsIG1vbGVzKSwgc2NlbmUtYWx0ZXJlZCBoYWlyIG9ubHkgKHdldCwgdGllZCwgbXVzc2VkKS4gTWVuIHByZWZpeCBsZWFuLW11c2NsZWQgb3IgdGFsbCBidWlsdCBwZXIgZXN0YWJsaXNoZWQgYnVpbGQsIGtlZXAgY29uc2lzdGVudC4KSEVJR0hUIERJRkZFUkVOQ0UgKHdoZW4gY2Fub24pOiBzdGFjayBUSFJFRSBjdWVzOiAoYSkgZ2FwIHN0YXRlbWVudCB3aXRoIG1hZ25pdHVkZSB1cCBmcm9udCAoTW9yIHRvd2VycyBhIGZ1bGwgaGVhZCBvdmVyIEtpcmEpLCAoYikgc2lsaG91ZXR0ZSBjb250cmFzdCAoTW9yIGxvbmctbGltYmVkIHRhbGwtYnVpbHQsIEtpcmEgc21hbGwgYW5kIHNob3J0IGJlc2lkZSBoaW0pLCAoYykgY29udGFjdC9leWVsaW5lIGFuY2hvciAoaGVhZCBvZiBLaXJhIGF0IHRoZSBzdGVybnVtIG9mIE1vciwgY2hpbiBvZiBNb3IgdGlsdGVkIGRvd24pLiBGcmFtZSB3YWlzdC11cCsgZm9yIGJpZyBnYXBzOyBpZiBmYWNlcyBjbG9zZSwganVzdGlmeSBwaHlzaWNhbGx5IChNb3Igc3Rvb3BpbmcsIEtpcmEgb24gdG9lcykuCkVYUFJFU1NJT04rT1VURklUK1BPU0U6IG9uZSBmdXNlZCBjbGF1c2UgcGVyIGNoYXJhY3RlcjogTkFNRSArIGZhYnJpYy90ZXh0dXJlL2ZpdCArIGFjdGlvbi1iYXNlZCBwb3NlICsgbWljcm8tZXhwcmVzc2lvbiwgc2tpbiBzdGF0ZS4gUG9zZSB2aWEgYWN0aW9uIHZlcmJzIChNb3IgbGVhbmluZyBvbiBkb29yZnJhbWUsIGFybXMgbG9vc2VseSBjcm9zc2VkKSwgbmV2ZXIgc3RhdGljIGxpbWIgY29vcmRpbmF0ZXMuIE91dGZpdCBjYXJyaWVzIGZyb20gdGhlIHBvc3QgYW5kIGNvbnRleHQ7IGlmIHVuc2V0LCBpbnZlbnQgYW5kIGxvY2sgZm9yIHNjZW5lLgpIQU5EIFNBRkVUWTogZnJlZSBmaW5nZXJzIGZhaWwgbW9zdC4gU2FmZTogaGFuZCBpbiBwb2NrZXQsIGdyaXBwaW5nIG5hbWVkIG9iamVjdCAoZmluZ2VycyBjdXJsZWQgYXJvdW5kIGNlcmFtaWMgbXVnKSwgZmxhdCBvbiBzdXJmYWNlLCBhcm1zIGNyb3NzZWQsIGJlaGluZCBiYWNrLCBmaXN0IGF0IHNpZGUsIGxhY2VkLCBvbiBvd24gbmVjay9jaGluLiBPbmUgdmlzaWJsZSBoYW5kIHBlciBjaGFyYWN0ZXIsIGhpZGUgcmVzdCB2aWEgZnJhbWluZy9wb3NlLgpXRUlHSFQgJiBHUk9VTkQ6IG9uZSBzZW50ZW5jZSBvbiB3ZWlnaHQgKHdlaWdodCBvbiBsZWZ0IGxlZywgcmlnaHQgZm9vdCB0dXJuZWQgb3V0KS4gSGlkZGVuIGxpbWJzIHJlcXVpcmUgc3RhdGVkIHJlYXNvbiwgdW5leHBsYWluZWQgYWJzZW5jZSBicmVha3MgZmlndXJlLgpFTlZJUk9OTUVOVCtMSUdIVDogb25lIHNlbnRlbmNlOiBmZy9taWQvYmcgdGV4dHVyZXMsIGtleSBsaWdodCBkaXJlY3Rpb24rY29sb3IgdGVtcCwgYXRtb3NwaGVyaWMgcGFydGljbGVzIChkdXN0LCBzdGVhbSwgbWlzdCkuCk1BTlkgQ0hBUkFDVEVSUzogTkFNRSBzdGFydHMgZWFjaCBjbGF1c2UsIHJlcGVhdCBuYW1lcyBub3QgcHJvbm91bnMsIHJlbGF0aW9uYWwgcG9zaXRpb25pbmcgKGJlc2lkZSBLYW1vaSwgY2hpbiBvbiB0aGUgc2hvdWxkZXIgb2YgS2Ftb2kpLCBlbnZpcm9ubWVudCBhcyBmaW5hbCBzZW50ZW5jZS4KU1RZTEUgTE9DSyAoYXBwZW5kIHZlcmJhdGltKTogQmxhY2stYW5kLXdoaXRlIEphcGFuZXNlIG1hbmdhLCBBaSBZYXphd2EgTkFOQSBtYW5nYSBzdHlsZSwgam9zZWkgc2hvdWpvIGxpbmV3b3JrLiBQdXJlIG1vbm9jaHJvbWUgaW5rIG9uIHdoaXRlLCBjbGVhbiBmbGF0IGJsYWNrLWFuZC13aGl0ZSwgTk8gY29sb3IsIE5PVCBwYWludGVybHksIE5PVCByZW5kZXJlZCwgTk9UIHNlbWktcmVhbGlzdGljLCBOT1QgZ3JheXNjYWxlIHBhaW50aW5nLiBFbGVnYW50IHRoaW4gZmFzaGlvbi1pbGx1c3RyYXRpb24gaW5rIGxpbmVhcnQsIGRlbGljYXRlIGNvbmZpZGVudCBpbmtpbmcuIFNoYWRvd3MgZHJhd24gYXMgaGF0Y2hpbmcsIGNyb3NzLWhhdGNoaW5nLCBzb2xpZCBibGFjayBmaWxscyBhbmQgZ3JleSBzY3JlZW50b25lIGRvdHMsIE5PVCBzb2Z0IHNoYWRpbmcuIFRhbGwgc2xlbmRlciBlbG9uZ2F0ZWQgam9zZWkgcHJvcG9ydGlvbnMsIHNvZnRseSBlbG9uZ2F0ZWQgbWF0dXJlIGZhY2VzLCBnZW50bGUgamF3LCBsYXJnZSBzb2Z0IGFsbW9uZCBleWVzIHdpdGggbG9uZyBsYXNoZXMuIERlY29yYXRpdmUgYmFja2dyb3VuZHMgd2l0aCBmbG93ZXJzLCBwYXR0ZXJucyBhbmQgc2NyZWVudG9uZSwgcXVpZXQgbWVsYW5jaG9saWMgcm9jay1kcmFtYSBtb29kLiBIdW1hbiBleWVzLCBuYXR1cmFsIGlyaXMuCk5FR0FUSVZFIChhcHBlbmQgdmVyYmF0aW0pOiBBdm9pZDogY29sb3IsIHBhaW50ZWQgb3IgYWlyYnJ1c2hlZCByZW5kZXJpbmcsIHNtb290aCBncmF5c2NhbGUgZ3JhZGllbnRzLCBtb2Ugb3IgY2hpYmkgZmVhdHVyZXMsIHRleHQsIGxvZ28sIHdhdGVybWFyaywgc2lnbmF0dXJlLgpSRUZFUkVOQ0UgTE9DSyAoYXBwZW5kIHZlcmJhdGltKTogTWF0Y2ggbGluZSBxdWFsaXR5LCB0ZXh0dXJlLCByZW5kZXJpbmcgdGVjaG5pcXVlIGZyb20gcmVmZXJlbmNlIGltYWdlLiBQb3NlLCBmcmFtaW5nLCBzdHlsaW5nIGZvbGxvdyBjdXJyZW50IHByb21wdCBub3QgcmVmZXJlbmNlLgpTRU5TVUFMIChjZW5zb3ItYXdhcmUpOiByZW5kZXIgaW50aW1hY3kgdmlhIGF0bW9zcGhlcmUrc3VnZ2VzdGlvbiwgbm90IGFuYXRvbXkuIE5PSVNFIEZMT09EICgzKyk6IGRlbnNlIHN0ZWFtLCB0YW5nbGVkIHNpbGsrY3VzaGlvbnMsIHdhdGVyIGRyb3BsZXRzIG9uIGdsYXNzLCBsdXNoIHBsYW50cytwZXRhbHMsIHZlbmV0aWFuIGJsaW5kIHNoYWRvdyBzdHJpcGVzLCBkb3plbnMgb2YgY2FuZGxlIGZsYW1lcywgc2hvdCB0aHJvdWdoIGRvb3JmcmFtZS9zaGVlciBjdXJ0YWluL2Zyb3N0ZWQgZ2xhc3MsIHJhaW4tc3RyZWFrZWQgd2luZG93LiBDT05DRUFMTUVOVCAoMisgc3RhY2tlZCk6IGRlZXAgY2hpYXJvc2N1cm8sIGZhYnJpYyBkcmFwZWQgbG93LCBhcm1zIGZvbGRlZCBrbmVlcyBkcmF3biwgY3JvcCBhdCByaWJjYWdlL3Nob3VsZGVycywgc2hvdCBmcm9tIGJlaGluZCBvdmVyIHNob3VsZGVyLCBsb3dlciBmcmFtZSBpbnRvIGJva2VoK2hhemUsIHBpbGxvdy9ibGFua2V0IGFjcm9zcyBib2R5LiBTQUZFIExFWElDT046IHNvZnQgZGVjb2xsZXRhZ2Ugc2hhZGVkIGJ5IHNpbGssIHNwaW5lIGxpbmUgdHJhY2VkIGJ5IG1vcm5pbmcgbGlnaHQsIGZhYnJpYyBwb29sZWQgYXQgY29sbGFyYm9uZSwgc2lsaG91ZXR0ZSBoYWxmLXZlaWxlZCBieSBzdGVhbSwgdHdvIGZpZ3VyZXMgc2hhcmluZyBicmVhdGggYXQgdGhyZXNob2xkLCBoZWF2eS1saWRkZWQgZ2F6ZSBsaXBzIGJhcmVseSBwYXJ0ZWQsIHN0cmFwIHNsaXBwaW5nIHRoZSBzaG91bGRlciBsaW5lLCBmb3JlaGVhZCByZXN0aW5nIGFnYWluc3QgZm9yZWhlYWQsIGZpbmdlcnRpcHMgZ2hvc3RpbmcgYSBqYXdsaW5lLCByb2JlIGxvb3NlIGF0IHRoZSBzbGVldmUuIEZyYW1lIGludGltYWN5IGFzIE1PTUVOVCAocGF1c2UsIHByb3hpbWl0eSwgbG9vaykgbm90IEFDVC4KUFJPTVBUIEhZR0lFTkU6IG5ldmVyIHdyaXRlOiBzZXh5LCBlcm90aWMsIHNlbnN1YWwsIG51ZGUsIG5ha2VkLCBiZWF1dGlmdWwsIG1hc3RlcnBpZWNlLCBiZXN0IHF1YWxpdHksIHJlYWxpc3RpYywgcGhvdG9yZWFsaXN0aWMuCkNPTlNJU1RFTkNZOiByZS1zdGF0ZSBvdXRmaXQsIGxvY2F0aW9uLCB0aW1lIG9mIGRheSwgbGlnaHQgc291cmNlIGluIGV2ZXJ5IHByb21wdCDigJQgdGhlIHJlbmRlcmVyIGhhcyBubyBtZW1vcnkgYmV0d2VlbiBjYWxscy4KQ29tcG9zZSBmb3IgdGhlIEFTUEVDVCBSQVRJTyBnaXZlbiBpbiB0aGUgcmVxdWVzdDogdmVydGljYWwgPSBwb3J0cmFpdHMvZnVsbC1ib2R5LCBzcXVhcmUgPSBzb2NpYWwvY2xvc2UsIHdpZGUgPSBlbnZpcm9ubWVudC90d28tc2hvdHMvY2luZW1hdGljLg=="]];

function rstripSlash(s) {
        s = String(s || '');
        while (s.length && s.charAt(s.length - 1) === '/') s = s.slice(0, -1);
        return s;
      }

function apiPath(base, tail) {
        base = apiBase(base);
        const l = base.toLowerCase();
        if (l.indexOf(tail.toLowerCase()) >= 0) return base;
        if (/\/v1(beta)?$/i.test(l)) return base + tail;
        return base + '/v1' + tail;
      }

function googleHeaderHost(endpoint) {
        try {
          const h = new URL(endpoint, location.href).hostname.toLowerCase();
          return h === 'googleapis.com' || h.endsWith('.googleapis.com');
        } catch (e) {
          return false;
        }
      }

function splitDataUrl(d) {
        const m = String(d || '').match(/^data:([^;]+);base64,([\s\S]+)$/);
        return m ? {
          mime: m[1],
          b64: m[2]
        } : {
          mime: 'image/jpeg',
          b64: String(d || '').replace(/^data:[^,]{0,},/, '')
        };
      }

function _stripThink(s) {
        s = String(s || '');
        s = s.replace(/<(think|thinking|reasoning|reflection)>[\s\S]*?<\/\1>/gi, ' ');
        s = s.replace(/^[\s\S]*?<\/(think|thinking|reasoning|reflection)>/i, ' ');
        s = s.replace(/<(think|thinking|reasoning|reflection)>[\s\S]*$/i, ' ');
        return s.replace(/^\s{1,}/, '');
      }

function _wc(s) {
        s = String(s || '').trim();
        return s ? s.split(/\s{1,}/).length : 0;
      }

function looksCut(s) {
        s = String(s || '').replace(/\s{1,}$/, '');
        if (s.length < 60) return false;
        if (/CAST[ \t]{0,}:[ \t]{0,}[a-zA-Z, ]{1,}[ \t.;!]{0,}$/.test(s)) return false;
        const tail = s.charAt(s.length - 1);
        return !(tail === '.' || tail === '!' || tail === '?' || tail === ']');
      }

async function retryIfCut(raw, ask, cfg) {
        if (!looksCut(raw)) return raw;
        const mt = pwTokensFor(cfg);
        const cfg2 = Object.assign({}, cfg, {
          pwMaxTokens: Math.min(mt * 2, 8000)
        });
        try {
          const again = await pwGenerate(ask, cfg2);
          const a2 = String(again || '').trim();
          if (a2.length >= 20 && !looksCut(a2)) return a2;
          if (a2.length > String(raw || '').trim().length) return a2;
        } catch (e) {
          if (e && e.iigStop) throw e;
        }
        return raw;
      }

function parseCast(txt) {
        const s = String(txt || '');
        const m = s.match(/(^|\n)[ \t]{0,}CAST[ \t]{0,}:[ \t]{0,}([a-zA-Z, ]{1,})[ \t.;!]{0,}[\s]{0,}$/);
        if (!m) return {
          cast: null,
          txt: s
        };
        const low = m[2].toLowerCase();
        const cIn = low.indexOf('char') >= 0;
        const uIn = low.indexOf('user') >= 0;
        const allIn = !cIn && !uIn && /\bnone\b/.test(low) ? false : /\b(both|all)\b/.test(low);
        if (!allIn && !cIn && !uIn && !/\bnone\b/.test(low)) return {
          cast: null,
          txt: s.slice(0, m.index)
        };
        return {
          cast: {
            char: allIn || cIn,
            user: allIn || uIn
          },
          txt: s.slice(0, m.index)
        };
      }

function parseMarkers(s) {
        s = String(s || '');
        let cast = null,
          ar = '';
        while (true) {
          let m = s.match(/[ \t]{0,}\[CAST:([a-z, ]{0,})\][ \t]{0,}$/i);
          if (m) {
            const low = m[1].toLowerCase();
            cast = {
              char: low.indexOf('char') >= 0,
              user: low.indexOf('user') >= 0
            };
            s = s.slice(0, m.index);
            continue;
          }
          m = s.match(/[ \t]{0,}\[AR:(\d{1,2}:\d{1,2})\][ \t]{0,}$/i);
          if (m) {
            ar = m[1];
            s = s.slice(0, m.index);
            continue;
          }
          break;
        }
        return {
          cast: cast,
          ar: ar,
          prompt: s.replace(/\s{1,}$/, '')
        };
      }

function castMarker(cast) {
        if (!cast) return '';
        const who = [];
        if (cast.char) who.push('char');
        if (cast.user) who.push('user');
        return ' [CAST:' + (who.length ? who.join(',') : 'none') + ']';
      }

function arMarker(ar) {
        ar = String(ar || '');
        return /^\d{1,2}:\d{1,2}$/.test(ar) ? (' [AR:' + ar + ']') : '';
      }

function applyLocks(txt, cfg) {
        const pm = parseMarkers(String(txt || ''));
        let t = pm.prompt;
        const lk = (cfg.styleLock || '').trim();
        if (lk && t.indexOf(lk) < 0) t = t + ' ' + lk;
        const ng = (cfg.styleNegative || '').trim();
        if (ng && t.indexOf(ng) < 0) t = t + ' Avoid: ' + ng + '.';
        return t + castMarker(pm.cast) + arMarker(pm.ar);
      }

function dirHint(ar) {
        if (!ar) return '';
        return ' [OUTPUT IMAGE ASPECT RATIO: exactly ' + ar + ', ' + orient(ar) + ' orientation. Compose for and fill the entire ' + ar + ' frame edge to edge, no borders, no letterboxing; do not output a square unless ' + ar + ' is 1:1.]';
      }

function _styleBlocks(st, head) {
        const out = [];
        if (!st) return out;
        const any = '(STYLE PREFIX|STYLE SUFFIX|STYLE LOCK|NEGATIVE|REFERENCE LOCK)';
        const re = new RegExp('^[ \\t]{0,}(?:\\d{1,2}\\.[ \\t]{0,})?' + head + '\\b[^:]{0,120}:[ \\t]{0,}([\\s\\S]{0,})', 'i');
        const stop = new RegExp('^(?:\\d{1,2}\\.[ \\t]{0,})?' + any + '\\b', 'i');
        const lines = String(st).split('\n');
        for (let i = 0; i < lines.length; i++) {
          const m = lines[i].match(re);
          if (!m) continue;
          let body = (m[m.length - 1] || '').trim();
          if (!body) {
            let j = i;
            while (!body && j + 1 < lines.length) {
              j++;
              const ln = String(lines[j] || '').trim();
              if (stop.test(ln)) break;
              body = ln;
            }
          }
          body = body.replace(/\s{1,}/g, ' ').trim();
          if (body.length >= 10) out.push(body);
        }
        return out;
      }

function _styleTails(st) {
        return _styleBlocks(st, '(STYLE SUFFIX|STYLE LOCK|NEGATIVE|REFERENCE LOCK)');
      }

function _stylePrefixes(st) {
        return _styleBlocks(st, '(STYLE PREFIX)');
      }

function enforceStyleTails(t, st) {
        try {
          t = String(t || '');
          const pres = _stylePrefixes(st);
          for (let i = pres.length - 1; i >= 0; i--) {
            const pre = pres[i];
            const h = pre.slice(0, 24);
            const at = t.indexOf(h);
            if (at === 0) continue;
            if (at > 0) {
              if (t.substr(at, pre.length) !== pre) continue;
              t = (t.slice(0, at) + t.slice(at + pre.length)).replace(/\s{2,}/g, ' ').trim();
            }
            t = pre + ' ' + t;
          }
          const tails = _styleTails(st);
          for (const tail of tails) {
            const head = tail.slice(0, 24);
            if (t.indexOf(head) >= 0) continue;
            t = t + ' ' + tail;
          }
        } catch (e) {}
        return t;
      }

async function _readPwPrompt(cfg) {
        S._refLost = [];
        let rev = 0;
        try {
          rev = (await tavo.get('iig_pw_rev', 'global')) || 0;
        } catch (e) {}
        const cc = S._pwCache;
        if (cc && rev && cc.rev === rev) return cc.text;
        const wantStyle = !!(cfg && String(cfg.promptName || '').trim());
        const tries = (rev || wantStyle) ? 3 : 1;
        let txt = '';
        let readOk = false;
        for (let a = 0; a < tries; a++) {
          try {
            txt = String((await tavo.get('iig_pw_prompt', 'global')) || '');
            readOk = true;
          } catch (e) {
            txt = '';
          }
          if (txt) break;
          if (a < tries - 1) await new Promise(function(r) {
            setTimeout(r, 700);
          });
        }
        if (txt) {
          S._pwCache = {
            rev: rev,
            text: txt
          };
          return txt;
        }
        if (rev && !wantStyle && readOk) {
          S._pwCache = {
            rev: rev,
            text: ''
          };
          return '';
        }
        if (cc && cc.text) return cc.text;
        if (wantStyle) throw new Error('методичка стиля не прочиталась из хранилища — тапни ↻ или пересохрани панель');
        return '';
      }

async function pwGuide(cfg) {
        const st = await _readPwPrompt(cfg);
        if (!st) return BASE_PW;
        if (await pwOwn(cfg)) {
          return BASE_PW + '\n\nSTYLE AND RENDERING RULES - THIS GUIDE IS AUTHORITATIVE. Follow it exactly as written: its structure, order, wording, tag format and length win over every default above. If it prescribes fixed blocks - style prefix, style suffix, quality tags, artist weights, negative list, reference lock - WRITE THEM YOURSELF, verbatim and in the place the guide puts them. The extension adds nothing of its own:\n' + st;
        }
        return BASE_PW + '\n\nSTYLE AND RENDERING RULES (follow them; the style prefix, style suffix and negative blocks are attached by the extension - do not write them yourself):\n' + st;
      }

async function castNames() {
        const n = S._names;
        if (n && (n.char || n.user)) return n;
        let charName = '',
          userName = '';
        try {
          const chat = await tavo.chat.current();
          let c = chat && chat.characters && chat.characters[0] ? chat.characters[0] : null;
          if (c) charName = c.name || '';
          if (chat && chat.persona) {
            if (chat.persona.name) userName = chat.persona.name;
            else if (chat.persona.id != null) {
              try {
                const p = await tavo.persona.get(chat.persona.id);
                if (p) userName = p.name || '';
              } catch (e1) {}
            }
          }
        } catch (e) {}
        S._names = {
          char: charName,
          user: userName
        };
        return S._names;
      }

async function castPass() {
        const p = S._pass;
        if (p && (p.char || p.user)) return p;
        let pp = null;
        const pk = S._ppKV;
        if (pk && (Date.now() - pk.at) < 45000) pp = pk.pp;
        else {
          let pi = null,
            okKV = true;
          try {
            pp = await tavo.get('iig_passports', 'global');
          } catch (e) {
            okKV = false;
          }
          try {
            pi = await tavo.get('iig_pp_imgs', 'global');
          } catch (e) {
            okKV = false;
          }
          if (okKV) S._ppKV = {
            at: Date.now(),
            pp: pp,
            pi: pi
          };
          else pp = pp || (pk ? pk.pp : null);
        }
        const nm = await castNames();
        pp = (await ppOverlay(pp, null, nm))[0];
        const out = {
          char: (pp && nm.char && pp[nm.char]) ? String(pp[nm.char]).trim() : '',
          user: String(ppUser(pp, nm.user) || '').trim()
        };
        S._pass = out;
        return out;
      }

async function appearanceBlock(nm) {
        try {
          nm = nm || {};
          const ps = await castPass();
          const lines = [];
          if (ps.char) lines.push('- ' + (nm.char || 'the char') + ' (char): ' + ps.char);
          if (ps.user) lines.push('- ' + (nm.user || 'the user') + ' (user): ' + ps.user);
          let t = [];
          if (!t.length) {
            t = [];
            try {
              const slots = await loadRefs();
              for (const s of slots) {
                if (!s) continue;
            if (s.enabled === false) {
              const _nm = String(s.note || '').trim() || String(s.type || 'слот');
              S._refLost.push('реф «' + _nm.slice(0, 24) + '» — выключен');
              continue;
            }
                if (s.dataUrl && s.kind !== 'text' && !s.ward) continue;
                const tl = buildTextRefLabel(s.type, s.note, s.target, nm.char, nm.user);
                if (tl) t.push({
                  label: tl,
                  ward: !!s.ward,
                  tgt: s.target,
                  type: s.type
                });
              }
            } catch (e) {}
          }
          for (let i = 0; i < t.length; i++) {
            let l = String(t[i].label || '').trim();
            if (l && t[i].ward && t[i].type !== 'background' && t[i].type !== 'npc') {
              const ow = t[i].tgt === 'user' ? (nm.user || 'the user') : (t[i].tgt === 'char' ? (nm.char || 'the char') : '');
              if (ow) l += ' (worn only by ' + ow + '; if that person is not in the picture, ignore this item)';
            }
            if (l) lines.push('- ' + l);
          }
          if (!lines.length) return '';
          return 'APPEARANCE DATA (authoritative - this is how these characters actually look):\n' + lines.join('\n') + '\nWrite these traits into the prompt for every character who is visible, in the exact format your style guide requires (if it asks for danbooru tags, convert the description into tags). Never invent appearance traits that are not listed here, and never give one character the traits of another.\n';
        } catch (e) {
          return '';
        }
      }

function namesBlock(nm) {
        nm = nm || {};
        const c = String(nm.char || '').trim(),
          u = String(nm.user || '').trim();
        if (!c && !u) return '';
        let b = S._enOn ? 'CHARACTER NAMES — write them in the prompt with EXACT spelling, but in Latin letters: transliterate Cyrillic names (Лиза → Liza); never copy Cyrillic:' : 'CHARACTER NAMES — write them in the prompt EXACTLY as spelled here, character for character:';
        if (c) b += '\n- the character (char): ' + c;
        if (u) b += '\n- the user persona (user): ' + u;
        b += '\nTake the gender, age group and role of each person from the roleplay text and the appearance data below; never assume anyone is a girl or a man by default.';
        b += (S._enOn ? '\nNEVER translate, shorten, decline or re-spell these names; the only allowed change is writing a Cyrillic name in Latin letters.' : '\nNEVER translate, transliterate, shorten, decline or re-spell these names.') + ' NEVER write the user, the char, the character, {{user}} or {{char}} as a substitute — always the exact name above. When the char or the user is visible, name them by this exact spelling, because the reference photos are matched to these names. Other people in the post (side characters, NPCs) keep their own names or descriptions from the post: never rename them into the char or the user, and never put the char or the user into a scene where the post does not show them.\n';
        return b;
      }

function fixNames(txt, nm) {
        txt = String(txt || '');
        nm = nm || {};
        const c = enName(String(nm.char || '').trim()),
          u = enName(String(nm.user || '').trim());
        const rep = function(t, re, to) {
          if (!to) return t;
          return t.replace(re, to);
        };
        txt = rep(txt, /\{\{\s{0,2}user\s{0,2}\}\}/gi, u);
        txt = rep(txt, /\{\{\s{0,2}char\s{0,2}\}\}/gi, c);
        txt = rep(txt, /\bthe user persona\b/gi, u);
        txt = rep(txt, /\bthe user\b/gi, u);
        txt = rep(txt, /\bthe char\b/gi, c);
        txt = rep(txt, /\bthe main character\b/gi, c);
        return txt;
      }

function identityLabel(kind, charName, userName) {
        const me = (kind === 'user') ? ('the user' + (userName ? ' ' + userName : '')) : ('the char' + (charName ? ' ' + charName : ''));
        const other = (kind === 'user') ? ('the char' + (charName ? ' ' + charName : '')) : ('the user' + (userName ? ' ' + userName : ''));
        return 'IDENTITY of ' + me + ': this photo shows exactly how ' + me + ' looks — face, gender, hair, eye color, skin tone, body. Depict ' + me + ' with THIS exact appearance whenever they are in frame. Do NOT give any of these traits to ' + other + ' or anyone else, and do NOT copy the art style of this photo.';
      }

function buildRefLabel(type, note, target, charName, userName) {
        note = (note || '').trim();
        const n = note ? (' (' + note + ')') : '';
        if (type === 'style') return 'ART STYLE reference' + n + ': copy ONLY the rendering technique, brushwork and color treatment from this image; IGNORE its subjects, characters, poses, composition and background.';
        if (type === 'npc') return 'NPC reference' + n + ': use this ONLY for a separate background/NPC character; do NOT apply it to the main characters; do NOT copy its art style.';
        if (type === 'background') return 'LOCATION where this scene takes place' + n + ': close-up fragments of the real place, as a reference for how it looks. The scene happens inside this place; the characters and the moment from the prompt are the subject of the picture.';
        if (type === 'object') return 'OBJECT reference' + n + ': take ONLY the object from this image; IGNORE everything else; do NOT copy its art style.';
        const noun = {
          outfit: 'the outfit / clothing',
          hair: 'the hairstyle',
          nails: 'the nails / manicure',
          face: 'the face',
          pose: 'the pose / body position',
          body: 'the body shape',
          other: 'one specific detail'
        };
        const thing = noun[type] || 'one specific detail';
        let who = '',
          other = '';
        const bound = {
          outfit: 1,
          hair: 1,
          nails: 1,
          face: 1,
          pose: 1,
          body: 1
        };
        if (bound[type]) {
          const tgt = (target === 'user') ? 'user' : 'char';
          who = (tgt === 'user') ? ('the user' + (userName ? ' ' + userName : '')) : ('the char' + (charName ? ' ' + charName : ''));
          other = (tgt === 'user') ? ('the char' + (charName ? ' ' + charName : '')) : ('the user' + (userName ? ' ' + userName : ''));
        }
        let label = 'reference for ' + thing.toUpperCase() + n + ': take ONLY ' + thing + ' from this image';
        if (who) label += ' and apply it ONLY to ' + who + '. Do NOT apply it to ' + other + ' — ' + other + ' keeps their own ' + thing + ' completely unchanged';
        label += '. IGNORE everything else in this reference (its face, body, hair, pose, clothing, background) except ' + thing + ', and do NOT copy its art style or photographic realism.';
        return label;
      }

function buildTextRefLabel(type, note, target, charName, userName) {
        note = String(note || '').trim();
        if (!note) return '';
        const kinds = {
          npc: 'NPC DESCRIPTION',
          outfit: 'OUTFIT DESCRIPTION',
          hair: 'HAIRSTYLE DESCRIPTION',
          nails: 'NAILS DESCRIPTION',
          face: 'FACE DESCRIPTION',
          pose: 'POSE DESCRIPTION',
          body: 'BODY DESCRIPTION',
          background: 'LOCATION DESCRIPTION',
          style: 'ART STYLE NOTE',
          object: 'OBJECT DESCRIPTION',
          other: 'DETAIL DESCRIPTION'
        };
        const kind = kinds[type] || 'DETAIL DESCRIPTION';
        const bound = {
          outfit: 1,
          hair: 1,
          nails: 1,
          face: 1,
          pose: 1,
          body: 1
        };
        let who = '';
        if (bound[type]) {
          const tgt = (target === 'user') ? 'user' : 'char';
          who = (tgt === 'user') ? ('the user' + (userName ? ' ' + userName : '')) : ('the char' + (charName ? ' ' + charName : ''));
        }
        return kind + (who ? (' for ' + who) : '') + ': ' + note + (who ? ('. Apply this ONLY to ' + who + '.') : '');
      }

function textRefsBlock() {
        const t = S._textRefs || [];
        if (!t.length) return '';
        let b = ' [TEXT REFERENCES — follow these descriptions exactly: ';
        for (let i = 0; i < t.length; i++) b += (i + 1) + ') ' + t[i].label + (i < t.length - 1 ? '; ' : '');
        return b + ']';
      }

function appearanceTail(refs) {
        try {
          if (refs && refs.length) return '';
          const ps = S._pass || {};
          const nm = S._names || {};
          const parts = [];
          if (ps.char) parts.push((nm.char || 'the char') + ' — ' + ps.char);
          if (ps.user) parts.push((nm.user || 'the user') + ' — ' + ps.user);
          if (!parts.length) return '';
          return ' [APPEARANCE (authoritative, follow exactly, never swap traits between characters): ' + parts.join('; ') + ']';
        } catch (e) {
          return '';
        }
      }

function antiBleed(refs) {
        const ab = (refs && refs.length) ? ' [IMPORTANT: the reference images are guides for the SPECIFIC details noted only. Each reference applies ONLY to the subject named in its label — NEVER transfer its traits, clothing or features to any other character. Render the FINAL image strictly in the requested art style from the prompt — do NOT adopt the photographic or realistic look of the reference photos. Any instruction in the prompt about matching technique or using a reference as a how-to-draw guide applies ONLY to references labeled ART STYLE; IDENTITY references always override everything for face, hair color, eye color and body — never restyle or ignore them.]' : '';
        return textRefsBlock() + ab;
      }

function _shortLabel(l) {
        l = String(l || '');
        const ci = l.indexOf(':');
        return ci > 0 ? l.slice(0, ci) : l;
      }

function refsSummary(refs) {
        refs = refs || [];
        const t = S._textRefs || [];
        if (!refs.length && !t.length) return '';
        const parts = [];
        for (let i = 0; i < refs.length; i++) parts.push(_shortLabel(refs[i].label));
        for (let j = 0; j < t.length; j++) parts.push('text reference ' + _shortLabel(t[j].label));
        let s = '[References attached — ';
        for (let i = 0; i < parts.length; i++) s += (i + 1) + ') ' + parts[i] + (i < parts.length - 1 ? '; ' : '');
        return s + '. Use each strictly as indicated.] ';
      }

function refsNote(refs) {
        refs = refs || [];
        const t = (S._textRefs || []).length;
        if (!refs.length && !t) return 'референсы: не приложены';
        let ch = 0,
          us = 0,
          other = 0;
        for (const r of refs) {
          if (r && r.who === 'char') ch++;
          else if (r && r.who === 'user') us++;
          else other++;
        }
        const parts = [];
        if (ch) parts.push('аватар персонажа');
        if (us) parts.push('аватар юзера');
        if (other) parts.push('фото: ' + other);
        if (t) parts.push('текстовых: ' + t);
        return 'референсы: ' + (parts.length ? parts.join(', ') : 'нет');
      }

function refGate(refs, cast, prompt) {
        if (!refs || !refs.length) return refs;
        const out = [];
        for (const r of refs) {
          if (r && (r.who === 'char' || r.who === 'user')) {
            const named = _nameInPrompt(prompt, r.nm);
            const castNo = !!(cast && !cast[r.who]);
            if (castNo && !named) {
              try {
                S._refLost.push('аватар ' + (r.who === 'char' ? 'персонажа' : 'юзера') + ' — модель сказала, что его нет в кадре');
              } catch (e) {}
              continue;
            }
          }
          out.push(r);
        }
        return out;
      }

async function loadRefs0() {
        const now = Date.now();
        let rev = 0;
        try {
          rev = (await tavo.get('iig_refs_rev', 'global')) || 0;
        } catch (e) {}
        const rc = S._refsKV;
        if (rc && rc.rev === rev && (now - rc.at) < 45000) return rc.v;
        const tries = rev ? 3 : 1;
        for (let a = 0; a < tries; a++) {
          try {
            const v = await tavo.get('iig_refs', 'global');
            if (Array.isArray(v)) {

              for (const s0 of v) {
                if (s0 && typeof s0.enabled === 'string') s0.enabled = !/^\s*false\s*$/i.test(s0.enabled);
              }
              S._refsKV = { at: now, rev: rev, v: v };
              return v;
            }
          } catch (e) {}
          if (a < tries - 1) await new Promise(function (r) { setTimeout(r, 600); });
        }
        try {
          if (rev && (!rc || !(rc.v || []).length)) S._refLost.push('слоты рефов не прочитались из хранилища — тапни ↻');
        } catch (e) {}
        return rc ? rc.v : [];
      }

async function gatherRefs(cfg) {
        S._refLost = [];
        let rev = 0;
        try {
          rev = (await tavo.get('iig_refs_rev', 'global')) || 0;
        } catch (e) {}
        let cid = '';
        try {
          const ch = await tavo.chat.current();
          if (ch && ch.id != null) cid = String(ch.id);
        } catch (e) {}
        const ck = (cfg && cfg.useCharRef ? 1 : 0) + '|' + (cfg && cfg.useUserRef ? 1 : 0);
        const cc = S._refsCache;
        if (cc && cc.chatId === cid && cc.rev === rev && cc.ck === ck && (Date.now() - cc.at) < 60000) {
          S._textRefs = cc.textRefs;
          if (cc.names) S._names = cc.names;
          for (const _l of (cc.lost || [])) S._refLost.push(_l);
          return cc.data;
        }
        const data = await _gatherRefsRaw(cfg);
        S._refsCache = {
          at: Date.now(),
          chatId: cid,
          rev: rev,
          ck: ck,
          data: data,
          lost: (S._refLost || []).slice(),
          textRefs: S._textRefs || [],
          names: S._names || null
        };
        return data;
      }

async function _gatherRefsRaw(cfg) {
        const out = [];
        const lost = [];
        let charName = '',
          userName = '',
          charAvatar = null,
          userAvatar = null;
        try {
          const chat = await tavo.chat.current();
          let c = chat && chat.characters && chat.characters[0] ? chat.characters[0] : null;
          if (c && c.id != null && !c.avatar) c = await tavo.character.get(c.id);
          if (c) {
            charName = c.name || '';
            charAvatar = c.avatar || null;
          }
          let p = null;
          if (chat && chat.persona && chat.persona.id != null) p = await tavo.persona.get(chat.persona.id);
          if (!p) {
            try {
              const list = await tavo.persona.all();
              let cand = null;
              for (const x of list) {
                if (x && (x.active || x.isActive)) {
                  cand = x;
                  break;
                }
              }
              if (!cand && list && list.length) cand = list[0];
              if (cand) {
                p = (cand.avatar !== undefined || cand.name) ? cand : null;
                if (!p || cand.avatar === undefined) {
                  try {
                    p = await tavo.persona.get(cand.id);
                  } catch (e2) {
                    p = p || cand;
                  }
                }
              }
            } catch (e) {}
          }
          if (p) {
            userName = p.name || '';
            userAvatar = p.avatar || null;
          }
        } catch (e) {}
        S._names = {
          char: charName || '',
          user: userName || ''
        };
        let passC = '',
          passU = '';
        let pp = null,
          pi = null;
        const pk = S._ppKV;
        if (pk && (Date.now() - pk.at) < 45000) {
          pp = pk.pp;
          pi = pk.pi;
        } else {
          let okKV = true;
          try {
            pp = await tavo.get('iig_passports', 'global');
          } catch (e) {
            okKV = false;
          }
          try {
            pi = await tavo.get('iig_pp_imgs', 'global');
          } catch (e) {
            okKV = false;
          }
          if (okKV) S._ppKV = {
            at: Date.now(),
            pp: pp,
            pi: pi
          };
          else if (pk) {
            pp = pp || pk.pp;
            pi = pi || pk.pi;
          }
        }
        const ovr = await ppOverlay(pp, pi, { char: charName, user: userName });
        pp = ovr[0];
        pi = ovr[1];
        if (pp) {
          if (charName && pp[charName]) passC = String(pp[charName]).trim();
          passU = String(ppUser(pp, userName) || '').trim();
        }
        S._pass = {
          char: passC,
          user: passU
        };
        let imgC = null,
          imgU = null;
        if (pi) {
          if (charName && pi[charName]) imgC = pi[charName];
          imgU = ppUser(pi, userName);
        }
        try {
          const jobs = await Promise.all([(cfg.useCharRef && !imgC && charAvatar) ? _avB64(charAvatar, cfg.refMaxPx) : Promise.resolve(null), (cfg.useUserRef && !imgU && userAvatar) ? _avB64(userAvatar, cfg.refMaxPx) : Promise.resolve(null)]);
          if (!cfg.useCharRef) S._refLost.push('аватар персонажа — выключен в паспортах');
          if (!cfg.useUserRef) S._refLost.push('аватар юзера — выключен в паспортах');
          if (cfg.useCharRef) {
            const duC = imgC || (jobs[0] ? ('data:image/jpeg;base64,' + jobs[0]) : null);
            if (duC) out.push({
              who: 'char',
              nm: charName || '',
              dataUrl: duC,
              label: identityLabel('char', charName, userName) + (passC ? (' APPEARANCE NOTES for this character (authoritative, follow exactly): ' + passC) : '')
            });
            else {
              lost.push('аватар char недоступен');
              if (passC) out.push({
                textOnly: true,
                who: 'char',
                nm: charName || '',
                label: 'APPEARANCE of the char ' + (charName || '') + ' (authoritative, follow exactly): ' + passC
              });
            }
          }
          if (cfg.useUserRef) {
            const duU = imgU || (jobs[1] ? ('data:image/jpeg;base64,' + jobs[1]) : null);
            if (duU) out.push({
              who: 'user',
              nm: userName || '',
              dataUrl: duU,
              label: identityLabel('user', charName, userName) + (passU ? (' APPEARANCE NOTES for this character (authoritative, follow exactly): ' + passU) : '')
            });
            else {
              lost.push('аватар user недоступен');
              if (passU) out.push({
                textOnly: true,
                who: 'user',
                nm: userName || '',
                label: 'APPEARANCE of the user ' + (userName || '') + ' (authoritative, follow exactly): ' + passU
              });
            }
          }
        } catch (e) {}
        try {
          const slots = await loadRefs();
          for (const s of slots) {
            if (!s) continue;
            if (s.enabled === false) {
              const _nm = String(s.note || '').trim() || String(s.type || 'слот');
              S._refLost.push('реф «' + _nm.slice(0, 24) + '» — выключен');
              continue;
            }
            if (s.kind === 'text' || (!s.dataUrl && String(s.note || '').trim())) {
              const tl = buildTextRefLabel(s.type, s.note, s.target, charName, userName);
              if (tl) out.push({
                textOnly: true,
                label: tl,
                note: s.note,
                rtype: s.type,
                tgt: s.target
              });
            } else if (s.dataUrl) {
              out.push({
                dataUrl: s.dataUrl,
                label: buildRefLabel(s.type, s.note, s.target, charName, userName),
                note: s.note,
                rtype: s.type,
                tgt: s.target
              });
              if (s.ward) {
                const tw = buildTextRefLabel(s.type, s.note, s.target, charName, userName);
                if (tw) out.push({
                  textOnly: true,
                  label: tw,
                  note: s.note,
                  rtype: s.type,
                  tgt: s.target
                });
              }
            }
          }
        } catch (e) {}
        const ptxt = [];
        for (let oi = out.length - 1; oi >= 0; oi--) {
          if (out[oi].textOnly) {
            ptxt.unshift(out[oi]);
            out.splice(oi, 1);
          }
        }
        S._textRefs = ptxt;
        for (const _l of lost) S._refLost.push(_l);
        for (let wi = 0; wi < out.length; wi++) {
          if (!out[wi] || !out[wi].dataUrl) continue;
          try {
            const wd = await _refWire(out[wi].dataUrl, cfg && cfg.refMaxPx, out[wi].label);
            if (wd) out[wi] = Object.assign({}, out[wi], { dataUrl: wd });
          } catch (eW) {}
        }
        return out;
      }

function naisteraCanon(m) {
        m = String(m || 'grok').toLowerCase().replace(/\s+/g, '-');
        if (m.indexOf('grok') >= 0) return 'grok';
        if (['nano-banana-2', 'nano-banana-2-lite', 'novelai-v4.5', 'novelai-v5', 'novelai-v5-medium'].indexOf(m) >= 0) return m;
        if (m.indexOf('nano') >= 0 || m.indexOf('banana') >= 0) return m.indexOf('lite') >= 0 ? 'nano-banana-2-lite' : 'nano-banana-2';
        if (m.indexOf('novel') >= 0) {
          if (m.indexOf('medium') >= 0) return 'novelai-v5-medium';
          if (/4[.-]?5/.test(m)) return 'novelai-v4.5';
          if (/5/.test(m)) return 'novelai-v5';
          return 'novelai';
        }
        return m;
      }

function naisteraRefsOk(m) {
        const c = naisteraCanon(m);
        if (c !== 'grok' && c.indexOf('nano-banana-2') !== 0) return false;
        return !S._naiRefsOff;
      }

function naisteraPresetOk(m) {
        const c = naisteraCanon(m);
        return c === 'grok' || c.indexOf('nano-banana-2') === 0;
      }

function pickGeminiImage(r) {
        const cands = Array.isArray(r.candidates) ? r.candidates : [];
        if (cands.length) {
          const ps = (cands[0].content && cands[0].content.parts) || [];
          for (const p of ps) {
            if (p.inlineData) return 'data:' + p.inlineData.mimeType + ';base64,' + p.inlineData.data;
            if (p.inline_data) return 'data:' + p.inline_data.mime_type + ';base64,' + p.inline_data.data;
          }
        }
        const da = Array.isArray(r.data) ? r.data : null;
        if (da && da[0]) {
          if (da[0].b64_json) return 'data:image/png;base64,' + da[0].b64_json;
          if (da[0].url) return da[0].url;
        }
        return null;
      }

function isEmptyEnvelope(r) {
        if (!r || typeof r !== 'object') return false;
        if (r.error || r.promptFeedback || r.prompt_feedback) return false;
        if (Array.isArray(r.candidates) && r.candidates.length) return false;
        const um = r.usageMetadata || r.usage_metadata || {};
        const zero = um.promptTokenCount === 0 || um.prompt_token_count === 0;
        const nullc = r.candidates === null || r.candidates === undefined;
        return !!(zero && nullc);
      }

function parseImageFromContent(content) {
        content = content || '';
        const b64 = content.match(/data:image\/[^;]+;base64,([A-Za-z0-9+\/=]+)/);
        if (b64) return 'data:image/png;base64,' + b64[1];
        const pure = content.match(/[A-Za-z0-9+\/=]{1000,}/);
        if (pure) {
          let d = pure[0].replace(/[^A-Za-z0-9+\/=]/g, '');
          const pad = d.length % 4;
          if (pad) d += '===='.slice(0, 4 - pad);
          return 'data:image/png;base64,' + d;
        }
        const u = content.match(/https?:\/\/[^\s)\]"'<>]+\.(png|jpg|jpeg|gif|webp)(\?[^\s)\]"'<>]{0,})?/i);
        if (u) return u[0];
        const any = content.match(/https?:\/\/[^\s)\]"'<>]+/i);
        if (any) {
          let s = any[0];
          while (s.length && ')]"\''.indexOf(s.charAt(s.length - 1)) >= 0) s = s.slice(0, -1);
          return s;
        }
        const eTxt = new Error('Модель вернула ТЕКСТ вместо картинки (не та модель / отказ?): ' + String(content).replace(/\s+/g, ' ').slice(0, 200));
        eTxt.iigTextResp = 1;
        throw eTxt;
      }

function apiErr(status, url, text, resp) {
        const e = new Error('API ' + status + ' @ ' + url + ' :: ' + String(text || '').slice(0, 300));
        e.status = status;
        if (resp) {
          const ra = retryAfterMs(resp);
          if (ra) e.retryAfterMs = ra;
        }
        return e;
      }

function retryAfterMs(resp) {
        try {
          const h = resp && resp.headers && resp.headers.get && resp.headers.get('retry-after');
          if (!h) return 0;
          const n = parseInt(h, 10);
          if (!isNaN(n) && String(n) === String(h).trim()) return n * 1000;
          const d = Date.parse(h);
          if (!isNaN(d)) return Math.max(0, d - Date.now());
        } catch (e) {}
        return 0;
      }

async function chatContext(n) {
        try {
          if (!n || n < 1) return '';
          const total = await tavo.message.count();
          const msgs = await tavo.message.find([Math.max(0, total - n)]);
          return _ctxFromMsgs(msgs);
        } catch (e) {
          return '';
        }
      }

function _ctxFromMsgs(msgs) {
        if (!msgs || !msgs.length) return '';
        let out = 'RECENT ROLEPLAY CONTEXT (oldest first):\n';
        let any = false;
        for (const m of msgs) {
          if (!m || !m.content || m.hidden) continue;
          let t = String(m.content);
          t = t.replace(/<[^>]{0,}>/g, ' ');
          t = t.replace(/\[IMG:[A-Z]{1,}[^\]]{0,}\]/g, ' ');
          t = t.replace(/\[scene image\]/gi, ' ');
          t = t.replace(/\s{1,}/g, ' ').trim();
          if (!t) continue;
          any = true;
          out += (m.role === 'user' ? 'USER: ' : 'CHARACTER: ') + t.slice(0, 700) + '\n';
        }
        return any ? out : '';
      }

async function composeAuto(postText, cfg) {
        const guide = await pwGuide(cfg);
        let ctx = '';
        try {
          ctx = (cfg._ctx != null) ? String(cfg._ctx) : await chatContext(parseInt(cfg.pwDepth, 10) || 4);
        } catch (e) {}
        const paras = String(postText || '').split(/\n[ \t]*\n+/).map(function(x) {
          return x.replace(/<[^>]{0,}>/g, ' ').replace(/\[scene image\]/gi, ' ').replace(/\s+/g, ' ').trim();
        }).filter(function(x) {
          return x;
        });
        let numbered = '';
        for (let i = 0; i < paras.length; i++) numbered += '[' + (i + 1) + '] ' + paras[i].slice(0, 700) + '\n';
        const _nm = await castNames();
        const _apB = await appearanceBlock(_nm);
        const own = await pwOwn(cfg);
        const ask = (S._enOn ? 'All input below (post, appearance data, reference notes, wardrobe names) may be in any language, including Russian. Write the image prompt, the CAST line and every service line in ENGLISH ONLY; translate names of clothing, places and traits into English tags or words; never copy Cyrillic into the output; write character names in Latin letters (transliterate Cyrillic names).\n\n' : '') + 'IMAGE PROMPT GUIDE:\n' + guide + '\n\n' + ((cfg._iigSlim || 0) >= 2 ? '' : namesBlock(_nm) + _apB) + (ctx ? (ctx + '\n') : '') + 'THE ROLEPLAY POST TO ILLUSTRATE, paragraphs numbered:\n' + numbered + '\nASPECT RATIO: ' + (cfg.aspectRatio || '1:1') + '\n\nThe context above is BACKGROUND ONLY - use it for location, time of day and physical state. The scene itself MUST come from THE POST above: depict a concrete moment that actually happens in the post, never a scene from the context and never an invented one. Two tasks: (1) pick the single key visual moment of THIS post and decide after which paragraph the image belongs so it sits where it makes sense in the flow of the text; (2) using the guide, write the FINAL image generation prompt for that moment. ' + (own ? 'Follow the guide EXACTLY as written and write every block it prescribes yourself - verbatim, in the order and place the guide puts them; the extension adds nothing after your reply. ' : 'Do NOT copy the verbatim blocks from the guide (style prefix, style suffix, negative, reference lock) - the extension attaches them automatically in the right place after your reply. ') + 'Write ONLY the scene itself and never stop mid-sentence. Reply in EXACTLY this format: first line AFTER: <paragraph number>, then from the next line the prompt text itself, one paragraph, no preamble, no commentary, no markdown. Output NOTHING before the AFTER line - no reasoning, no analysis, no thinking out loud. Then the very LAST line of the reply must be: ' + (naiMode(cfg) ? 'CAST: followed by who of the two protagonists is present in THIS scene: char, user, both, or none. Decide ONLY by the scene: this post and the previous posts above make it clear who is in the scene and who they are, whatever grammatical person the text uses; a protagonist is present when the scene shows them there - acting, speaking, being looked at, touched or addressed - even if their name is never written. Whether a photo, an avatar or a passport exists for someone never affects this decision, and every protagonist in CAST must be drawn in the picture.' : 'CAST: followed by which of the two protagonists are actually visible in the image - char, user, both as char, user - or none.') + ' Side characters and NPCs never count as char or user.';
        const parseReply = (raw0) => {
          let after0 = 0,
            t0 = String(raw0 || '').trim();
          const are = /(^|\n)[ \t]{0,}AFTER[ \t]{0,4}:[ \t]{0,4}\d/gi;
          let am, lastAt = -1,
            anyA = false;
          while ((am = are.exec(t0))) {
            anyA = true;
            lastAt = am.index + am[1].length;
          }
          if (lastAt > 0) t0 = t0.slice(lastAt);
          const m0 = t0.match(/^[^A-Za-z0-9]{0,6}AFTER\s{0,4}:\s{0,4}(\d{1,3})[^\n]{0,80}(\n{1,3}|$)/i);
          if (m0) {
            after0 = parseInt(m0[1], 10) || 0;
            t0 = t0.slice(m0[0].length);
          } else if (/^[^A-Za-z0-9]{0,6}AFTER\s{0,4}:/i.test(t0)) {
            const nl = t0.indexOf('\n');
            const head = nl >= 0 ? t0.slice(0, nl) : t0;
            const dm = head.match(/(\d{1,3})/);
            if (dm) after0 = parseInt(dm[1], 10) || 0;
            t0 = nl >= 0 ? t0.slice(nl + 1) : '';
          }
          const pc0 = parseCast(t0);
          return {
            after: after0,
            cast: pc0.cast,
            anchor: anyA,
            txt: pc0.txt.replace(/\s{1,}/g, ' ').trim()
          };
        };
        let raw;
        let cutTwice = 0;
        let cutTok = 0;
        try {
          try {
            raw = await pwGenerate(ask, cfg);
          } catch (eCut) {
            if (!(eCut && eCut.iigCut)) throw eCut;
            const userTok = parseInt(cfg.pwMaxTokens, 10);
            if (userTok > 0) {
              cutTok = userTok;
              raw = '';
              cutTwice = 1;
            } else {
              cutTok = Math.min(Math.max(pwTokensFor(cfg) * 2, 6000), 8000);
              try {
                raw = await pwGenerate(ask, Object.assign({}, cfg, { pwMaxTokens: cutTok }));
              } catch (eCut2) {
                if (!(eCut2 && eCut2.iigCut)) throw eCut2;
                raw = '';
                cutTwice = 1;
              }
            }
          }
          S._pwSlimOk = cfg._iigSlim || 0;
        } catch (e400) {
          if (!(e400 && (e400.status === 400 || e400.iigPwTimeout))) throw e400;
          const lvl = cfg._iigSlim || 0;
          if (lvl >= 2) {
            e400.message = 'провайдер отверг даже урезанный промпт-запрос (похоже на фильтр содержимого у роутера — смени модель промпта или провайдера) · ' + e400.message;
            throw e400;
          }
          return composeAuto(postText, Object.assign({}, cfg, { _ctx: '', _iigSlim: lvl + 1 }));
        }
        raw = await retryIfCut(raw, ask, cfg);
        let rep = parseReply(raw);
        if (!cutTwice && _wc(rep.txt) < pwMinWords(cfg, cfg._sideBox)) {
          try {
            const mt2 = pwTokensFor(cfg);
            const raw2 = await pwGenerate(ask + '\n\nYour previous answer had only ' + _wc(rep.txt) + ' words in the prompt paragraph. Write the full prompt paragraph again, at least 40 words, keep the same format.', Object.assign({}, cfg, {
              pwMaxTokens: parseInt(cfg.pwMaxTokens, 10) > 0 ? mt2 : Math.min(mt2 * 2, 8000)
            }));
            const rep2 = parseReply(raw2);
            if ((rep2.anchor && !rep.anchor && _wc(rep2.txt) >= pwMinWords(cfg, cfg._sideBox)) || _wc(rep2.txt) > _wc(rep.txt)) rep = rep2;
          } catch (e) {
            if (e && e.iigStop) throw e;
          }
        }
        const wcP = _wc(rep.txt);
        if (wcP < pwMinWords(cfg, cfg._sideBox)) {
          const fb = paras.join(' ').split(/\s{1,}/).slice(0, 80).join(' ').trim();
          const cutMsg = cutTwice ? ('модель промпта не дописала ответ: размышления съели лимит токенов (пробовали ' + cutTok + ') — подними «токены ответа» во вкладке api или поставь модель промпта без размышлений') : '';
          if (_wc(fb) < 8) throw new Error(cutMsg || ('модель промпта вернула обрывок (' + _wc(rep.txt) + ' слов), а в посте нет текста для запасного промпта — подними «токены ответа и размышления» (вкладка api) или поставь модель промпта без размышлений'));
          if (cutMsg) toast('IIG: ' + cutMsg + ' · генерация по тексту поста');
          else toast('IIG: модель промпта вернула обрывок (' + _wc(rep.txt) + ' слов) — генерация по тексту поста; чтобы промпты писались полностью, подними «токены ответа и размышления» (вкладка api) или поставь модель без размышлений');
          rep = {
            after: 0,
            cast: null,
            anchor: false,
            txt: fb
          };
        }
        const after = rep.after;
        const pc = {
          cast: rep.cast
        };
        let txt = rep.txt;

        if (!own) {
          try {
            txt = enforceStyleTails(txt, await _readPwPrompt(cfg));
          } catch (e) {}
        }
        txt = fixNames(txt, _nm);
        txt = applyLocks(txt, cfg) + castMarker(pc.cast) + arMarker(cfg.aspectRatio || '1:1');
        const outC = {
          after: after,
          prompt: txt,
          wc: wcP
        };
        if (cutTwice) outC.cut = { tokens: cutTok, why: 'reasoning' };
        return outC;
      }

async function genGeminiNative(tag, refs, cfg) {
        const model = cfg.model;
        const url = apiBase(String(cfg.endpoint || '')).replace(/\/v1beta$/i, '') + '/v1beta/models/' + model + ':generateContent';
        let ar = tag.aspect_ratio || cfg.aspectRatio || '1:1';
        if (!VALID_AR.includes(ar)) ar = '1:1';
        let sz = tag.image_size || cfg.imageSize || '1K';
        if (!VALID_SZ.includes(sz)) sz = '1K';
        const textPart = cfg._edit ? (tag.prompt || '') : ((tag.style ? '[Style: ' + tag.style + '] ' : '') + (tag.prompt || '') + dirHint(ar) + antiBleed(refs) + appearanceTail(refs));
        const safety = ['HARM_CATEGORY_HARASSMENT', 'HARM_CATEGORY_HATE_SPEECH', 'HARM_CATEGORY_SEXUALLY_EXPLICIT', 'HARM_CATEGORY_DANGEROUS_CONTENT', 'HARM_CATEGORY_CIVIC_INTEGRITY'].map(function(c) {
          return {
            category: c,
            threshold: 'BLOCK_NONE'
          };
        });
        const buildBody = function(useRefs, omitCfg) {
          const parts = [];
          if (useRefs)
            for (const rf of refs) {
              parts.push({
                text: '[Reference image — ' + rf.label + ']'
              });
              const mm = splitDataUrl(rf.dataUrl);
              parts.push({
                inlineData: {
                  mimeType: mm.mime,
                  data: mm.b64
                }
              });
            }
          parts.push({
            text: textPart
          });
          const gen = {
            responseModalities: ['TEXT', 'IMAGE']
          };
          if (!omitCfg) gen.imageConfig = {
            aspectRatio: ar,
            imageSize: sz
          };
          return {
            contents: [{
              role: 'user',
              parts: parts
            }],
            generationConfig: gen,
            safetySettings: safety
          };
        };
        const hdrs = {
          'Authorization': 'Bearer ' + cfg.apiKey,
          'Content-Type': 'application/json'
        };
        if (googleHeaderHost(cfg.endpoint)) hdrs['x-goog-api-key'] = cfg.apiKey;
        const post = async function(useRefs, omitCfg) {
          const resp = await fetchT(url, {
            method: 'POST',
            headers: hdrs,
            body: JSON.stringify(buildBody(useRefs, omitCfg))
          }, GEN_TIMEOUT, cfg._sig);
          if (!resp.ok) {
            const t = await resp.text().catch(function() {
              return '';
            });
            throw apiErr(resp.status, url, t, resp);
          }
          return resp.json();
        };
        let useRefs = refs.length > 0,
          omitCfg = false;
        let r = await post(useRefs, omitCfg);
        let img = pickGeminiImage(r);
        if (!img && isEmptyEnvelope(r)) {
          r = await post(useRefs, omitCfg);
          img = pickGeminiImage(r);
        }
        if (!img && isEmptyEnvelope(r) && !omitCfg) {
          omitCfg = true;
          r = await post(useRefs, omitCfg);
          img = pickGeminiImage(r);
        }
        if (!img && isEmptyEnvelope(r) && useRefs) {
          if (cfg._edit) throw new Error(EDIT_SRC_LOST);
          useRefs = false;
          r = await post(useRefs, omitCfg);
          img = pickGeminiImage(r);
          if (img) {
            try {
              S._refLost = (S._refLost || []).concat(['провайдер не принял референсы после трёх пустых ответов — картинка нарисована без них']);
            } catch (e) {}
            try {
              tavo.utils.toast('IIG: провайдер не принял референсы — картинка БЕЗ них (внешность может уехать). Тапни ↻ чтобы попробовать с рефами.');
            } catch (e) {}
          }
        }
        if (img) {
          try {
            const um = r.usageMetadata || r.usage_metadata || {};
            const tk = (um.promptTokenCount || um.prompt_token_count || 0) + (um.candidatesTokenCount || um.candidates_token_count || 0);
            if (tk) S._lastImgTok = tk;
          } catch (e) {}
          return img;
        }
        if (r.error && (r.error.message || r.error.code != null)) throw new Error('Ошибка провайдера: ' + (r.error.message || '') + ' (code=' + (r.error.code != null ? r.error.code : (r.error.status || 'n/a')) + ')');
        const pf = r.promptFeedback || r.prompt_feedback;
        if (pf && (pf.blockReason || pf.block_reason)) throw new Error('Цензура: промпт заблокирован (' + (pf.blockReason || pf.block_reason) + ')');
        const cands = Array.isArray(r.candidates) ? r.candidates : [];
        if (cands.length) {
          const fr = cands[0].finishReason || cands[0].finish_reason || '';
          if (/^(IMAGE_SAFETY|SAFETY|PROHIBITED_CONTENT|RECITATION|BLOCKLIST|SPII)$/i.test(fr)) throw new Error('Цензура (image): ' + fr + ' — смягчи промпт');
          let txt = '';
          for (const p of ((cands[0].content && cands[0].content.parts) || [])) {
            if (p.text) txt += p.text;
          }
          if (fr && fr !== 'STOP') throw new Error('Картинки нет, finishReason=' + fr + (txt ? (' · ' + secMask(txt).slice(0, 120)) : ''));
          if (txt) {
            const eTxt2 = new Error('Модель вернула ТЕКСТ вместо картинки (не та модель?): ' + secMask(txt).slice(0, 180));
            eTxt2.iigTextResp = 1;
            throw eTxt2;
          }
          throw new Error('Пустой ответ (finishReason=' + (fr || '?') + ', 0 картинок) — тихая цензура модели или модель без генерации картинок.');
        }
        if (isEmptyEnvelope(r)) throw new Error('Провайдер отклонил запрос до инференса (0 токенов, нет кандидатов) — доступ/тариф/модель на этом провайдере.');
        throw new Error('Нераспознанный ответ: ' + secMask(JSON.stringify(r)).slice(0, 240));
      }

async function genNaistera(tag, refs, cfg) {
        const base = naisteraBase(cfg.endpoint);
        const url = /\/api\/generate$/i.test(base) ? base : base + '/api/generate';
        const model = naisteraCanon(tag.model || cfg.naisteraModel || 'grok');
        const ar = tag.aspect_ratio || cfg.aspectRatio || '1:1';
        const stylePfx = tag.style ? '[Style: ' + tag.style + '] ' : '';
        const usedRefs = (refs.length > 0 && naisteraRefsOk(model)) ? refs : [];
        if (refs.length && !usedRefs.length) {
          try {
            S._refLost = (S._refLost || []).concat(['фото (' + refs.length + ') — модель ' + model + ' их не принимает, внешность ушла тегами']);
          } catch (e) {}
        }
        const naiTags = model.indexOf('novelai') === 0;
        const tb = textRefsBlock();
        let naiTail = naiPlainTail();
        if (usedRefs.length) {
          const ab = antiBleed(usedRefs);
          naiTail = refsSummary(usedRefs) + (tb ? ab.split(tb).join('') : ab) + tb;
        }
        const body = {
          prompt: naiTags ? ((tag.prompt || '') + naiTail) : (cfg._edit ? (refsSummaryEdit(usedRefs) + (tag.prompt || '')) : (refsSummary(usedRefs) + stylePfx + (tag.prompt || '') + antiBleed(usedRefs) + appearanceTail([]))),
          aspect_ratio: ar,
          model: model
        };
        const rawPreset = tag.preset || cfg.preset;
        if (rawPreset && rawPreset !== 'none' && naisteraPresetOk(model)) body.preset = rawPreset;
        const negN = naisteraNegOk(model) ? String(cfg.styleNegative || '').trim() : '';
        if (negN) body.negative_prompt = negN;
        if (usedRefs.length > 0) body.reference_images = usedRefs.map(function(rf) {
          return rf.dataUrl;
        });
        const send = function(b) {
          return fetchT(url, {
            method: 'POST',
            headers: {
              'Authorization': 'Bearer ' + cfg.apiKey,
              'Content-Type': 'application/json'
            },
            body: JSON.stringify(b)
          }, GEN_TIMEOUT, cfg._sig);
        };
        let resp;
        try {
          resp = await send(body);
        } catch (e) {
          if (e && e.iigStop) throw e;
          throw new Error('Сеть/CORS при запросе ' + url + ' :: ' + ((e && e.message) || 'Failed to fetch'));
        }
        if (!resp.ok) {
          const text = await resp.text().catch(function() {
            return '';
          });
          let parsed = null;
          try {
            parsed = JSON.parse(text);
          } catch (e) {}
          const refsRejected = !!body.reference_images && ((parsed && parsed.reason === 'grok_refs_temporarily_unavailable') || (resp.status >= 400 && resp.status < 500 && /reference|reference_images|image_input|not supported|unsupported/i.test(String(text || ''))));
          if (refsRejected) {
            if (cfg._edit) throw new Error(EDIT_SRC_LOST);
            if (naiTags) {
              S._naiRefsOff = 1;
              try {
                tavo.utils.toast('Naistera: модель novelai не приняла референсы — до перезахода генерация по тексту, внешность идёт тегами из паспортов');
              } catch (e) {}
            } else {
              try {
                tavo.utils.toast('Naistera: референсы временно недоступны — генерация без них');
              } catch (e) {}
            }
            delete body.reference_images;
            body.prompt = naiTags ? (tag.prompt || '') : (stylePfx + (tag.prompt || ''));
            resp = await send(body);
            if (!resp.ok) {
              const t2 = await resp.text().catch(function() {
                return '';
              });
              const e2 = apiErr(resp.status, url, t2);
              e2.retryAfterMs = retryAfterMs(resp);
              throw e2;
            }
          } else {
            const e = apiErr(resp.status, url, text);
            e.retryAfterMs = retryAfterMs(resp);
            throw e;
          }
        }
        const result = await resp.json();
        if (result && result.data_url) return result.data_url;
        if (result && result.url) return result.url;
        throw new Error('Naistera: в ответе нет data_url :: ' + secMask(JSON.stringify(result)).slice(0, 240));
      }

async function genOpenAIChat(tag, refs, cfg) {
        let base = rstripSlash(cfg.endpoint);
        const url = apiPath(base, '/chat/completions');
        const txt = cfg._edit ? (tag.prompt || '') : ((tag.style ? '[Style: ' + tag.style + '] ' : '') + (tag.prompt || '') + dirHint(tag.aspect_ratio || cfg.aspectRatio) + antiBleed(refs) + appearanceTail(refs));
        const prompt = cfg._edit ? txt : ('Generate an image: ' + txt);
        let content;
        if (refs.length > 0) {
          content = [];
          for (const rf of refs) {
            content.push({
              type: 'text',
              text: '[Reference image — ' + rf.label + ']'
            });
            content.push({
              type: 'image_url',
              image_url: {
                url: rf.dataUrl
              }
            });
          }
          content.push({
            type: 'text',
            text: prompt
          });
        } else {
          content = prompt;
        }
        const body = {
          model: cfg.model,
          messages: [{
            role: 'user',
            content: content
          }],
          modalities: ['image', 'text']
        };
        const send = function(b) {
          return fetchT(url, {
            method: 'POST',
            headers: {
              'Authorization': 'Bearer ' + cfg.apiKey,
              'Content-Type': 'application/json'
            },
            body: JSON.stringify(b)
          }, GEN_TIMEOUT, cfg._sig);
        };
        let resp = await send(body);
        if (!resp.ok && resp.status === 400) {
          const t0 = await resp.text().catch(() => '');
          if (/modalit/i.test(t0)) {
            delete body.modalities;
            resp = await send(body);
          } else throw apiErr(400, url, t0);
        }
        if (!resp.ok) {
          const t = await resp.text().catch(() => '');
          throw apiErr(resp.status, url, t, resp);
        }
        const d = await resp.json();
        try {
          if (d.usage && d.usage.total_tokens) S._lastImgTok = d.usage.total_tokens;
        } catch (e) {}
        const msg = d.choices && d.choices[0] && d.choices[0].message;
        if (msg && Array.isArray(msg.images) && msg.images[0]) {
          const im = msg.images[0];
          const uu = (im.image_url && im.image_url.url) || im.url;
          if (uu) return uu;
        }
        let c = msg ? msg.content : '';
        if (Array.isArray(c)) c = c.map(p => (p && (p.text || (p.image_url && p.image_url.url))) || '').join('\n');
        return parseImageFromContent(c || JSON.stringify(d));
      }

async function generate(tag, refs, cfg) {
        if (cfg.apiStyle === 'naistera') return genNaistera(tag, refs, cfg);
        if (cfg.apiStyle === 'openai_image') return genOpenAIImage(tag, refs, cfg);
        if (cfg.apiStyle === 'gemini_native') return genGeminiNative(tag, refs, cfg);
        return genOpenAIChat(tag, refs, cfg);
      }

async function pwGenerate(ask, cfg) {
        let txt = '';
        S._pwSrc = (cfg.pwChat !== false) ? 'модель чата' : ('своя: ' + (cfg.pwModel || '?'));
        const sig = cfg._sig || null;
        if (sig && sig.aborted) throw stopErr();
        if (cfg.pwChat !== false) {
          let r = null;
          try {
            const pwLim = S._pwWaitMs || 90000;
            const gopts = {
              context: false,
              timeout: pwLim,
              settings: {
                maxCompletionTokens: pwTokensFor(cfg),
                temperature: 0.7
              }
            };
            let last = null;
            const tries = (cfg._iigSlim || 0) > 0 ? 1 : 2;
            for (let a = 0; a < tries; a++) {
              try {
                r = await _withTimeout(a === 0 ? tavo.generate(ask, gopts) : tavo.generate(ask, { timeout: pwLim }), 90000, 'модель чата молчит', sig);
                last = null;
                break;
              } catch (eo) {
                if (eo && eo.iigStop) throw eo;
                if (/^timeout/.test((eo && eo.message) || '')) throw eo;
                last = eo;
                if (a + 1 < tries) await new Promise(function(res) {
                  setTimeout(res, 2500);
                });
                if (sig && sig.aborted) throw stopErr();
              }
            }
            if (last) throw last;
          } catch (e) {
            if (e && e.iigStop) throw e;
            const eW = new Error('модель чата не ответила: ' + ((e && e.message) || e));
            if (/\b400\b/.test(String((e && e.message) || ''))) eW.status = 400;
            if (/could not complete the request|internal error|generation failed/i.test(String((e && e.message) || ''))) eW.iigPwTimeout = 1;
            if (/^timeout/.test(String((e && e.message) || ''))) eW.iigPwTimeout = true;
            throw eW;
          }
          if (r == null) r = '';
          if (typeof r === 'string') txt = r;
          else if (typeof r === 'object') txt = String(r.text || r.content || r.message || r.result || '');
          else txt = String(r);
          try {
            _statAdd({
              pwCalls: 1
            });
          } catch (e) {}
          if (!_stripThink(txt).trim()) {
            const eE = new Error(PW_CHAT_EMPTY);
            eE.iigCut = true;
            elog('модель чата', eE);
            throw eE;
          }
        } else {
          const model = (cfg.pwModel || '').trim();
          const base = rstripSlash((cfg.pwEndpoint || '').trim());
          const key = (cfg.pwKey || '').trim();
          if (!model || !base || !key) throw new Error('впиши адрес, ключ и модель промпта (вкладка api) или переключи на модель чата');
          const l = base.toLowerCase();
          const url = l.indexOf('/chat/completions') >= 0 ? base : (/\/v1(beta)?$/i.test(l) ? base + '/chat/completions' : base + '/v1/chat/completions');
          const bb = {
            model: model,
            messages: [{
              role: 'user',
              content: ask
            }],
            stream: false,
            max_tokens: pwTokensFor(cfg)
          };
          if ((cfg.pwReasoning || 'off') !== 'auto' && !S._pwNoReason) bb.reasoning_effort = 'low';
          const sendPw = function() {
            return fetchT(url, {
              method: 'POST',
              headers: {
                'Authorization': 'Bearer ' + key,
                'Content-Type': 'application/json'
              },
              body: JSON.stringify(bb)
            }, 45000, sig);
          };
          let resp = null;
          let tpw = 0;
          for (;;) {
            try {
              resp = await sendPw();
            } catch (ePw) {
              if (ePw && ePw.iigStop) throw ePw;
              const mPw = String((ePw && ePw.message) || '').toLowerCase();

              if (mPw.indexOf('timeout') >= 0) {
                ePw.iigPwTimeout = 1;
                throw ePw;
              }
              const rPw = mPw.indexOf('failed to fetch') >= 0 || mPw.indexOf('load failed') >= 0 || mPw.indexOf('network') >= 0;
              if (!rPw || tpw >= 2) throw ePw;
              tpw++;
              await new Promise(function(rW) { setTimeout(rW, 1200 * tpw); });
              continue;
            }
            if (resp && !resp.ok && (resp.status === 429 || resp.status === 502 || resp.status === 503 || resp.status === 504) && tpw < 2) {
              tpw++;
              await new Promise(function(rW) { setTimeout(rW, 1500 * tpw); });
              continue;
            }
            break;
          }
          let errText = null;
          if (!resp.ok) {
            errText = await resp.text().catch(function() {
              return '';
            });
            if (resp.status === 400 && bb.reasoning_effort) {
              delete bb.reasoning_effort;
              resp = await sendPw();
              if (!resp.ok) errText = await resp.text().catch(function() {
                return '';
              });
              else {
                errText = null;
                S._pwNoReason = 1;
              }
            }
          }
          if (!resp.ok) {
            const t = errText || '';
            if ((resp.status === 400 || resp.status === 404) && /model name is required|INVALID_ARGUMENT/i.test(t)) {
              const root = rstripSlash(base.replace(/\/v1beta[\s\S]{0,}$/i, '').replace(/\/chat\/completions$/i, '').replace(/\/v1$/i, ''));
              const gurl = root + '/v1beta/models/' + encodeURIComponent(model) + ':generateContent';
              const gh = {
                'Authorization': 'Bearer ' + key,
                'Content-Type': 'application/json'
              };
              if (googleHeaderHost(root)) gh['x-goog-api-key'] = key;
              const gbody = {
                contents: [{
                  role: 'user',
                  parts: [{
                    text: ask
                  }]
                }],
                generationConfig: {
                  maxOutputTokens: pwTokensFor(cfg)
                }
              };
              if ((cfg.pwReasoning || 'off') !== 'auto') gbody.generationConfig.thinkingConfig = {
                thinkingBudget: 0
              };
              let r2 = await fetchT(gurl, {
                method: 'POST',
                headers: gh,
                body: JSON.stringify(gbody)
              }, 45000, sig);
              if (!r2.ok && r2.status === 400 && gbody.generationConfig.thinkingConfig) {
                const tx = await r2.text().catch(function() {
                  return '';
                });
                if (/thinking/i.test(tx)) {
                  delete gbody.generationConfig.thinkingConfig;
                  r2 = await fetchT(gurl, {
                    method: 'POST',
                    headers: gh,
                    body: JSON.stringify(gbody)
                  }, 45000, sig);
                } else {
                  throw apiErr(400, gurl, tx);
                }
              }
              if (!r2.ok) {
                const t2 = await r2.text().catch(function() {
                  return '';
                });
                throw apiErr(r2.status, gurl, t2);
              }
              const d2 = await r2.json();
              let g = '';
              try {
                const ps = (d2.candidates && d2.candidates[0] && d2.candidates[0].content && d2.candidates[0].content.parts) || [];
                for (const pp of ps) {
                  if (pp.text) g += pp.text;
                }
              } catch (e2) {}
              g = _stripThink(g);
              if (!String(g).trim()) throw new Error('пустой ответ от ' + gurl);
              return String(g);
            }
            throw apiErr(resp.status, url, t, resp);
          }
          const d = await resp.json();
          try {
            if (d.usage) _statAdd({
              pwTokIn: d.usage.prompt_tokens || 0,
              pwTokOut: d.usage.completion_tokens || 0
            });
          } catch (e) {}
          const ch0 = d.choices && d.choices[0];
          const mm = ch0 && ch0.message;
          const finR = (ch0 && typeof ch0.finish_reason === 'string') ? ch0.finish_reason : '';
          const rsnC = (mm && typeof mm.reasoning_content === 'string') ? mm.reasoning_content : '';
          if (mm && typeof mm.content === 'string') txt = mm.content;
          else if (mm && Array.isArray(mm.content)) {
            for (const p of mm.content) {
              if (p && p.text) txt += p.text;
            }
          }
          const tCut = _stripThink(String(txt || '')).trim();
          if ((!tCut && String(rsnC || '').trim()) || (finR === 'length' && _wc(tCut) < 20)) {
            const eCut = new Error('модель промпта не дописала ответ (лимит токенов: размышления съели лимит) — подними «токены ответа и размышления» во вкладке api или поставь модель без размышлений');
            eCut.iigCut = true;
            throw eCut;
          }
        }
        return _stripThink(txt);
      }

function _withTimeout(p, ms, label, sig) {
        let t = null;
        let onAb = null;
        const guard = new Promise(function(res, rej) {
          t = setTimeout(function() {
            rej(new Error('timeout ' + Math.round(ms / 1000) + 'с: ' + label));
          }, ms);
          if (sig) {
            if (sig.aborted) return rej(stopErr());
            onAb = function() {
              rej(stopErr());
            };
            try {
              sig.addEventListener('abort', onAb);
            } catch (e) {}
          }
        });
        const fin = function() {
          clearTimeout(t);
          if (sig && onAb) {
            try {
              sig.removeEventListener('abort', onAb);
            } catch (e) {}
          }
        };
        return Promise.race([p, guard]).then(function(v) {
          fin();
          return v;
        }, function(e) {
          fin();
          throw e;
        });
      }

function _nameInPrompt(prompt, name) {
        name = String(name || '').trim().split(/\s{1,}/)[0].toLowerCase();
        if (name.length < 2) return true;
        const p = String(prompt || '').toLowerCase();
        const forms = [name, _translit(name)];
        for (const f of forms) {
          if (!f) continue;
          if (p.indexOf(f) >= 0) return true;
          if (f.length >= 4) {
            const stem = f.slice(0, Math.max(3, f.length - 1));
            if (p.indexOf(stem) >= 0) return true;
          }
        }
        return false;
      }

function _translit(s) {
        const M = {
          '\u0430': 'a',
          '\u0431': 'b',
          '\u0432': 'v',
          '\u0433': 'g',
          '\u0434': 'd',
          '\u0435': 'e',
          '\u0451': 'e',
          '\u0436': 'zh',
          '\u0437': 'z',
          '\u0438': 'i',
          '\u0439': 'y',
          '\u043a': 'k',
          '\u043b': 'l',
          '\u043c': 'm',
          '\u043d': 'n',
          '\u043e': 'o',
          '\u043f': 'p',
          '\u0440': 'r',
          '\u0441': 's',
          '\u0442': 't',
          '\u0443': 'u',
          '\u0444': 'f',
          '\u0445': 'h',
          '\u0446': 'ts',
          '\u0447': 'ch',
          '\u0448': 'sh',
          '\u0449': 'sch',
          '\u044a': '',
          '\u044b': 'y',
          '\u044c': '',
          '\u044d': 'e',
          '\u044e': 'yu',
          '\u044f': 'ya'
        };
        let o = '';
        s = String(s || '').toLowerCase();
        for (let i = 0; i < s.length; i++) o += (M[s.charAt(i)] != null ? M[s.charAt(i)] : s.charAt(i));
        return o;
      }

function fetchT(url, opts, ms, sig) {
        opts = opts || {};
        ms = ms || 60000;
        if (sig && sig.aborted) return Promise.reject(stopErr());
        let ac = null;
        try {
          ac = new AbortController();
        } catch (e) {}
        if (ac) opts.signal = ac.signal;
        let ab = null;
        if (ac && sig) {
          ab = function() {
            try {
              ac.abort();
            } catch (e) {}
          };
          try {
            sig.addEventListener('abort', ab);
          } catch (e) {}
        }
        const tm = ac ? setTimeout(function() {
          try {
            ac.abort();
          } catch (e) {}
        }, ms) : null;
        const done = function() {
          if (tm) clearTimeout(tm);
          if (ab) {
            try {
              sig.removeEventListener('abort', ab);
            } catch (e) {}
          }
        };
        const t0 = Date.now();
        return fetch(url, opts).then(function(r) {
          done();
          return r;
        }, function(e) {
          done();
          if (e && e.name === 'AbortError') {
            if (sig && sig.aborted) throw stopErr();
            throw new Error('timeout ' + ms + 'ms @ ' + url);
          }
          let kb = 0;
          try {
            const b = opts.body;
            kb = b ? Math.round((b.byteLength || b.size || String(b).length) / 1024) : 0;
          } catch (x) {}
          const e2 = new Error(((e && e.message) || 'Failed to fetch') + ' · тело ' + kb + ' КБ, оборвалось через ' + Math.round((Date.now() - t0) / 1000) + ' с');
          if (e && e.name) e2.name = e.name;
          throw e2;
        });
      }

function actStart(t) {
        S._actBusy = (S._actBusy || 0) + 1;
        if (t) S._actText = t;
      }

function stopAll() {
        S._stopReq = Date.now();
        let n = 0;
        for (const k in S._acReg) {
          stopKey(k);
          n++;
        }
        for (const id in S._autoTimers) {
          try {
            clearTimeout(S._autoTimers[id]);
          } catch (e) {}
          delete S._autoTimers[id];
          delete S._autoBusy[id];
        }
        const q = drainQueue();
        S._pwPending = {};
        S._actBusy = 0;
        S._actText = '';
        actNote('остановлено вручную');
        const parts = [];
        if (n) parts.push('остановлено генераций: ' + n);
        if (q) parts.push('снято из очереди: ' + q);
        toast(parts.length ? ('IIG: ' + parts.join(', ')) : 'IIG: активных генераций не было');
      }

function _gcState() {
        const cap = function(o, n) {
          try {
            const ks = Object.keys(o || {});
            if (ks.length <= n) return;
            for (let i = 0; i < ks.length - n; i++) delete o[ks[i]];
          } catch (e) {}
        };
        cap(S._dead, 300);
        cap(S._bakeMiss, 300);
        cap(S._pendMark, 100);
        cap(S._keyMsg, 300);
      }

async function urlToDataUrl(u, sig) {
        const r = await fetchT(u, {}, 30000, sig);
        if (!r.ok) throw new Error('fetch ' + r.status);
        const b = await r.blob();
        return await new Promise(function(res, rej) {
          const fr = new FileReader();
          fr.onload = function() {
            res(fr.result && String(fr.result).length > 100 ? fr.result : null);
          };
          fr.onerror = function() {
            rej(new Error('read fail'));
          };
          fr.readAsDataURL(b);
        });
      }

async function withRetry(fn, cfg) {
        const max = (cfg.maxRetries != null) ? cfg.maxRetries : 3;
        const base = (cfg.retryDelay != null) ? cfg.retryDelay : 1500;
        let last;
        for (let a = 0; a <= Math.max(max, 0); a++) {
          if (cfg._sig && cfg._sig.aborted) throw stopErr();
          if (cfg._deadline && Date.now() > cfg._deadline) throw (last || new Error('генерация не уложилась в отведённое время'));
          try {
            return await fn(a);
          } catch (e) {
            last = e;
            if (e && e.iigTextResp && a >= 1) throw e;
            const up = e && (e.status === 502 || e.status === 503 || e.status === 504);
            const rl = e && e.status === 429;
            const effMax = (up || rl) ? Math.max(max, 3) : max;
            if (!isRetryable(e) || a >= effMax) throw e;
            if (cfg._deadline && Date.now() > cfg._deadline) throw e;
            let wait;
            if (e && e.retryAfterMs) wait = e.retryAfterMs;
            else if (rl) wait = Math.max(base, 2500) * Math.pow(2, a);
            else wait = base * Math.pow(2, a);
            wait = Math.min(wait, 12000);
            await new Promise(function(r) {
              setTimeout(r, wait);
            });
          }
        }
        throw last;
      }

function toast(t) {
        try {
          tavo.utils.toast(t);
        } catch (e) {}
      }

function stopErr() {
        const e = new Error('abort: остановлено кнопкой стоп');
        e.iigStop = 1;
        return e;
      }

function _statAdd(add) {
        const upd = function(scope, name) {
          return tavo.get(name, scope).then(function(s) {
            s = s || {};
            for (const k in add) s[k] = (s[k] || 0) + add[k];
            return tavo.set(name, s, scope);
          });
        };
        try {
          upd('chat', 'iig_stats').catch(function() {});
        } catch (e) {}
      }

async function resolveCfg() {
        const now = Date.now();
        const cc = S._cfgCache;
        if (cc && (now - cc.at) < 8000) return cc.v;
        let c = null;
        try {
          c = await tavo.get('iig_cfg', 'global');
        } catch (e) {}
        if (!c && !cc && !S._cfgBootTried) {
          S._cfgBootTried = 1;
          for (let a = 0; a < 2 && !c; a++) {
            await new Promise(function(r) {
              setTimeout(r, 350 + a * 450);
            });
            try {
              c = await tavo.get('iig_cfg', 'global');
            } catch (e) {}
          }
        }
        if (!c && typeof window !== 'undefined' && window.IIG_CFG) c = window.IIG_CFG;
        if (c && (typeof c !== 'object' || Array.isArray(c))) throw new Error(SEC_CFG_BAD);
        if (!c && cc) {
          cc.at = now - 4000;
          return cc.v;
        }
        if (!c) {
          let cana = 'c' + Date.now() + Math.random().toString(36).slice(2, 6);
          let canaOk = false;
          try {
            await tavo.set('iig_cfg_canary', cana, 'global');
            canaOk = ((await tavo.get('iig_cfg_canary', 'global')) === cana);
          } catch (e) {
            canaOk = false;
          }
          if (!canaOk) throw new Error('настройки не прочитались (хранилище ещё не готово) — тапни ↻');
        }
        const out = Object.assign({}, DEFAULTS, c || {});
        if (c && c.autoMode == null && c.autoOn != null) out.autoMode = c.autoOn ? 'all' : 'off';
        const tainted = normCfg(out);
        const mig = parseInt(out.pwMaxTokens, 10);
        if (mig === 450 || mig === 1000) out.pwMaxTokens = 3000;
        if (tainted && c && !S._cfgHealed) {
          S._cfgHealed = 1;
          try {
            await healCfgKeys(out);
          } catch (e) {}
          try {
            await cfgWriteSafe(out);
          } catch (e) {}
          try {
            await tavo.set('iig_cfg_tamper', { at: Date.now(), fields: cfgTaintFields(c) }, 'global');
          } catch (e) {}
          actNote('конфиг приехал битым (строки вместо булевых) — исправила и записала обратно');
        }
        if (c) S._cfgCache = {
          at: now,
          v: out
        };
        return out;
      }

function orient(ar) {
        const m = String(ar || '').match(/^(\d+)\s{0,}:\s{0,}(\d+)$/);
        if (!m) return 'square';
        const w = +m[1],
          h = +m[2];
        return w > h ? 'wide landscape' : (w < h ? 'tall vertical portrait' : 'square');
      }

function actEnd(t) {
        S._actBusy = Math.max(0, (S._actBusy || 0) - 1);
        if (t) {
          S._actLast = t;
          S._actLastAt = Date.now();
        }
        if (!S._actBusy) S._actText = '';
      }

function stopKey(key) {
        if (!key) return;
        const ac = S._acReg[key];
        if (ac) {
          try {
            ac.abort();
          } catch (e) {}
        }
        delete S._acReg[key];
        delete S._pwPending[key];
        delete S._pendMark[key];
        S._dead[key] = 1;
      }

function drainQueue() {
        let n = 0;
        try {
          for (const nm in (S._sems || {})) {
            const sem = S._sems[nm];
            const q = sem.q || [];
            sem.q = [];
            for (let i = 0; i < q.length; i++) {
              n++;
              try {
                q[i].kill();
              } catch (e) {}
            }
          }
        } catch (e) {}
        return n;
      }

function actNote(t) {
        S._actLast = String(t || '');
        S._actLastAt = Date.now();
      }

function isRetryable(e) {
        const st = (e && typeof e.status === 'number') ? e.status : null;
        const m = ((e && e.message) || '').toLowerCase();
        if (m.indexOf('abort') >= 0) return false;
        if (e && e.iigTextResp) return true;
        if (st === 429 || st === 502 || st === 503 || st === 504) return true;
        if (/\b(429|502|503|504)\b/.test((e && e.message) || '')) return true;
        return m.indexOf('timeout') >= 0 || m.indexOf('network') >= 0 || m.indexOf('failed to fetch') >= 0 || m.indexOf('load failed') >= 0;
      }

function enqueue(fn, lim) {
        const slow = (lim === 1);
        if (!S._sems) S._sems = {};
        const nm = slow ? 'one' : 'many';
        if (!S._sems[nm]) S._sems[nm] = {
          n: 0,
          q: [],
          lim: slow ? 1 : 2
        };
        const sem = S._sems[nm];
        const next = function() {
          if (sem.n < sem.lim && sem.q.length) {
            const j = sem.q.shift();
            j.go();
          }
        };
        const run = function(res, rej) {
          sem.n++;
          Promise.resolve().then(fn).then(function(v) {
            sem.n--;
            next();
            res(v);
          }, function(e) {
            sem.n--;
            next();
            rej(e);
          });
        };
        return new Promise(function(res, rej) {
          if (sem.n < sem.lim) run(res, rej);
          else sem.q.push({
            go: function() {
              run(res, rej);
            },
            kill: function() {
              rej(stopErr());
            }
          });
        });
      }

async function runSeeder() {
  var VER = 17;
  var S = SEEDPACK;

  function b64txt(b) {
    try {
      return decodeURIComponent(escape(atob(b)));
    } catch (e) {
      try {
        return atob(b);
      } catch (x) {
        return '';
      }
    }
  }

  function h32(s) {
    var h = 2166136261;
    s = String(s || '');
    for (var i = 0; i < s.length; i++) {
      h = ((h << 5) - h + s.charCodeAt(i)) | 0;
    }
    return (h >>> 0).toString(36);
  }
  (async function() {
    try {
      var tv = tavo;
      var done = 0;
      try {
        done = (await tv.get('iig_seed_pack', 'global')) || 0;
      } catch (e) {
        return;
      }
      if (done >= VER) return;
      var arr = [];
      var arrOk = false;
      try {
        arr = (await tv.get('iig_prompts', 'global')) || [];
        arrOk = true;
      } catch (e) {}
      if (!Array.isArray(arr)) arr = [];

      if (!arrOk || !arr.length) {
        await new Promise(function(r) {
          setTimeout(r, 1500);
        });
        var done2 = null;
        try {
          done2 = await tv.get('iig_seed_pack', 'global');
        } catch (e) {
          return;
        }
        if ((done2 || 0) >= VER) return;
        if ((done2 || 0) > done) done = done2 || 0;
        var hsh2 = null;
        try {
          hsh2 = await tv.get('iig_seed_hashes', 'global');
        } catch (e) {}
        var arr2 = null;
        try {
          arr2 = await tv.get('iig_prompts', 'global');
          arrOk = true;
        } catch (e) {}
        if (Array.isArray(arr2) && arr2.length) arr = arr2;
        if (!arrOk) return;
        if (!arr.length && done >= 2) return;
        if (!arr.length && hsh2 && typeof hsh2 === 'object') {
          for (var hk2 in hsh2) return;
        }

        try {
          var cana = 'c' + Date.now();
          await tv.set('iig_seed_canary', cana, 'global');
          if ((await tv.get('iig_seed_canary', 'global')) !== cana) return;
        } catch (e) {
          return;
        }
      }
      var hashes = {};
      try {
        hashes = (await tv.get('iig_seed_hashes', 'global')) || {};
      } catch (e) {}
      if (!hashes || typeof hashes !== 'object') hashes = {};
      var RENAMES = [
        ['Naistera', 'Novel AI'],
        ['Wlop \u0431\u043e\u043b\u044c\u0448\u043e\u0439', 'Wlop by Aceenvw'],
        ['Wlop \u043c\u0430\u043b\u0435\u043d\u044c\u043a\u0438\u0439', 'Wlop by Kamoi'],
        ['Novel AI \u0448\u043e\u0440\u0442', 'Novel AI short by Rakshakti, \u041a\u0441\u044e & Travadd'],
        ['Novel AI', 'Novel AI full by Rakshakti, \u041a\u0441\u044e & Travadd'],
        ['\u041a\u043e\u043c\u0438\u043a\u0441 \u0431\u0435\u0437 \u0433\u0440\u0430\u043d\u0438\u0446', '\u041a\u043e\u043c\u0438\u043a\u0441 \u0431\u0435\u0437 \u0433\u0440\u0430\u043d\u0438\u0446 by Kamoi'],
        ['\u041a\u043e\u043c\u0438\u043a\u0441 \u0433\u0440\u0430\u0434\u0438\u0435\u043d\u0442', '\u041a\u043e\u043c\u0438\u043a\u0441 \u0433\u0440\u0430\u0434\u0438\u0435\u043d\u0442 by Kamoi'],
        ['\u041a\u043e\u043c\u0438\u043a\u0441', '\u041a\u043e\u043c\u0438\u043a\u0441 by Kamoi'],
        ['Colored Pencil', 'Colored Pencil by Kamoi'],
        ['Crayon Drag', 'Crayon Drag by Kamoi'],
        ['Elegant Chinese', 'Elegant Chinese by Kamoi'],
        ['Gothic Shoujo', 'Gothic Shoujo by Kamoi'],
        ['Y2K Gyaru', 'Y2K Gyaru by Kamoi'],
        ['Velvet Fog', 'Velvet Fog by Kamoi'],
        ['Cozy Pastel', 'Cozy Pastel by Kamoi'],
        ['Soft Graphite', 'Soft Graphite by Kamoi'],
        ['Inoue Noir', 'Inoue Noir by Kamoi'],
        ['NANA Noir', 'NANA Noir by Kamoi'],
        ['Wlop by aceenvw', 'Wlop by Aceenvw'],
        ['Wlop by kamoi', 'Wlop by Kamoi'],
        ['\u041a\u043e\u043c\u0438\u043a\u0441 \u0431\u0435\u0437 \u0433\u0440\u0430\u043d\u0438\u0446 by kamoi', '\u041a\u043e\u043c\u0438\u043a\u0441 \u0431\u0435\u0437 \u0433\u0440\u0430\u043d\u0438\u0446 by Kamoi'],
        ['\u041a\u043e\u043c\u0438\u043a\u0441 \u0433\u0440\u0430\u0434\u0438\u0435\u043d\u0442 by kamoi', '\u041a\u043e\u043c\u0438\u043a\u0441 \u0433\u0440\u0430\u0434\u0438\u0435\u043d\u0442 by Kamoi'],
        ['\u041a\u043e\u043c\u0438\u043a\u0441 by kamoi', '\u041a\u043e\u043c\u0438\u043a\u0441 by Kamoi'],
        ['Colored Pencil by kamoi', 'Colored Pencil by Kamoi'],
        ['Crayon Drag by kamoi', 'Crayon Drag by Kamoi'],
        ['Elegant Chinese by kamoi', 'Elegant Chinese by Kamoi'],
        ['Gothic Shoujo by kamoi', 'Gothic Shoujo by Kamoi'],
        ['Y2K Gyaru by kamoi', 'Y2K Gyaru by Kamoi'],
        ['Velvet Fog by kamoi', 'Velvet Fog by Kamoi'],
        ['Cozy Pastel by kamoi', 'Cozy Pastel by Kamoi'],
        ['Soft Graphite by kamoi', 'Soft Graphite by Kamoi'],
        ['Inoue Noir by kamoi', 'Inoue Noir by Kamoi'],
        ['NANA Noir by kamoi', 'NANA Noir by Kamoi'],
        ['Wlop by Aceenvw', 'Wlop by Aceenvw & Kamoi'],
        ['NovelAI custom by Rakshakti, Ксю & Travadd', 'Соло кастом by Rakshakti, Ксю & Travadd'],
        ['Соло by Rakshakti, Ксю & Travadd', 'Соло кастом by Rakshakti, Ксю & Travadd'],
        ['Комикс by darkxizon & Шино', 'Комикс кастом by darkxizon & Шино']
      ];
      var renamed = {};
      for (var rn = 0; rn < RENAMES.length; rn++) {
        var oldNm = RENAMES[rn][0],
          newNm = RENAMES[rn][1];
        var hasNew = false,
          oldEnt = null;
        for (var ri = 0; ri < arr.length; ri++) {
          if (!arr[ri]) continue;
          if (arr[ri].name === newNm) hasNew = true;
          if (arr[ri].name === oldNm) oldEnt = arr[ri];
        }
        if (oldEnt && !hasNew) {
          oldEnt.name = newNm;
          renamed[oldNm] = newNm;
          if (hashes[oldNm]) {
            hashes[newNm] = hashes[oldNm];
            delete hashes[oldNm];
          }
        }
      }
      var have = {};
      for (var i = 0; i < arr.length; i++) {
        if (arr[i] && arr[i].name) have[arr[i].name] = arr[i];
      }
      var added = 0,
        upd = 0,
        kept = 0,
        touched = {};
      var insPos = arr.length;
      for (var w = 0; w < arr.length; w++) {
        if (arr[w] && String(arr[w].name || '').indexOf('Wlop') === 0) insPos = w + 1;
      }
      for (var w2 = 0; w2 < arr.length; w2++) {
        if (arr[w2] && String(arr[w2].name || '').indexOf('Novel AI') === 0) insPos = w2 + 1;
      }
      for (var j = 0; j < S.length; j++) {
        var nm = S[j][0];
        var t = b64txt(S[j][1]);
        if (!t) continue;
        var ex = have[nm];
        if (!ex) {
          arr.splice(insPos, 0, {
            name: nm,
            text: t
          });
          insPos++;
          hashes[nm] = h32(t);
          added++;
          touched[nm] = 1;
          continue;
        }
        if (ex.text === t) {
          hashes[nm] = h32(t);
          continue;
        }
        if (hashes[nm] && hashes[nm] === h32(ex.text)) {
          ex.text = t;
          hashes[nm] = h32(t);
          upd++;
          touched[nm] = 1;
        } else {
          kept++;
        }
      }
      var renN = 0;
      for (var rk in renamed) renN++;
      if (added || upd || renN) {
        try {
          var bak0 = await tv.get('iig_prompts', 'global');
          if (Array.isArray(bak0) && bak0.length) await tv.set('iig_prompts_bak', bak0, 'global');
        } catch (e) {}
        await tv.set('iig_prompts', arr, 'global');
      }
      if (renN) {
        try {
          var cfgR = (await tv.get('iig_cfg', 'global')) || {};
          var actR = cfgR.promptName || '';
          if (actR && renamed[actR]) {
            cfgR.promptName = renamed[actR];
            await cfgWriteSafe(cfgR);
          }
        } catch (e) {}
      }
      try {
        await tv.set('iig_seed_hashes', hashes, 'global');
      } catch (e) {}
      await tv.set('iig_seed_pack', VER, 'global');
      if (upd) {
        try {
          var cfg = (await tv.get('iig_cfg', 'global')) || {};
          var act = cfg.promptName || '';
          if (act && touched[act]) {
            var cur = have[act];
            if (cur && cur.text) {
              await tv.set('iig_pw_prompt', cur.text, 'global');
              await tv.set('iig_pw_rev', Date.now(), 'global');
            }
          }
        } catch (e) {}
      }
      if (added || upd || kept) {
        try {
          var parts = [];
          if (added) parts.push('добавлено: ' + added);
          if (upd) parts.push('обновлено: ' + upd);
          if (kept) parts.push('твои правки сохранены: ' + kept);
          tv.utils.toast('IIG промпты — ' + parts.join(', '));
        } catch (e) {}
      }
    } catch (e) {}
  })();
}

var AUTO_MIN_LEN = 40;
var GEN_DEADLINE = 300000;

var GEN_TIMEOUT = 240000;

var BOOT_ID = Math.random().toString(36).slice(2) + Date.now().toString(36);
var BOOT_AT = Date.now();

function cmpVer(a, b) {
  const pa = String(a || '').split('.');
  const pb = String(b || '').split('.');
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const d = (parseInt(pa[i], 10) || 0) - (parseInt(pb[i], 10) || 0);
    if (d) return d > 0 ? 1 : -1;
  }
  return 0;
}

function h32(s) {
  s = String(s || '');
  let n = 2166136261;
  for (let i = 0; i < s.length; i++) n = Math.imul(n ^ s.charCodeAt(i), 16777619) >>> 0;
  return n.toString(36);
}

function normText(s) {
  return String(s || '')
    .replace(/<[^>]{0,}>/g, ' ')
    .replace(/[^0-9A-Za-z\u0400-\u04FF]+/g, ' ')
    .trim().toLowerCase().slice(0, 600);
}

var MARK_RE = /<!--\s*iig:([a-z0-9_]{4,40})\s*-->/i;

function marksOf(content) {
  const out = [];
  const re = new RegExp(MARK_RE.source, 'gi');
  const s = String(content == null ? '' : content);
  let m = re.exec(s);
  while (m) {
    out.push(m[1].toLowerCase());
    m = re.exec(s);
  }
  return out;
}

function textKey(content) {
  const all = marksOf(content);
  if (all.length) return all[all.length - 1];
  return h32(normText(content));
}

function foreignMarks(content, earlier) {
  const mine = marksOf(content);
  if (!mine.length || !Array.isArray(earlier) || !earlier.length) return [];
  const seen = {};
  for (const e of earlier) {
    for (const k of marksOf(e)) seen[k] = 1;
  }
  const out = [];
  for (const k of mine) {
    if (seen[k] === 1 && out.indexOf(k) < 0) out.push(k);
  }
  return out;
}

async function earlierTexts(id) {
  try {
    const cnt = await tavo.message.count();
    const from = cnt > 40 ? cnt - 40 : 0;
    const arr = (await tavo.message.find([from])) || [];
    const out = [];
    let hit = false;
    for (const x of arr) {
      if (x && x.id === id) {
        hit = true;
        break;
      }
    }
    for (const x of arr) {
      if (!x) continue;
      if (x.id === id) break;
      if (!hit && !(Number(x.id) < Number(id))) continue;
      out.push(String(x.content == null ? '' : x.content));
    }
    return out;
  } catch (e) {
    return [];
  }
}

function markKey() {
  const abc = 'abcdefghijklmnopqrstuvwxyz0123456789';
  let s = 'k';
  for (let i = 0; i < 8; i++) s += abc.charAt(Math.floor(Math.random() * abc.length));
  return s;
}

function stripMark(s) {
  return String(s || '').replace(new RegExp(MARK_RE.source, 'gi'), ' ').trim();
}

async function ensureMark(msg, earlier) {
  try {
    if (!msg || msg.id == null) return false;
    if (msg.hidden === true) return false;
    const c = String(msg.content || '');

    if (!c.trim()) return false;
    const bad = foreignMarks(c, earlier);
    let c2 = c;
    if (bad.length) {
      c2 = c.replace(new RegExp(MARK_RE.source, 'gi'), function (all, k) {
        return bad.indexOf(String(k).toLowerCase()) >= 0 ? '' : all;
      }).replace(/\s+$/, '');
    }
    if (!MARK_RE.test(c2)) c2 = c2.replace(/\s+$/, '') + '\n\n<!--iig:' + markKey() + '-->';
    if (c2 === c) return false;
    try {
      await tavo.message.update({ id: msg.id, content: c2 });
    } catch (e) {
      await tavo.message.update(msg.id, { content: c2 });
    }
    msg.content = c2;
    return true;
  } catch (e) {
    return false;
  }
}

async function stripMarkText(id) {
  try {
    const m = await msgById(id);
    if (!m || m.content == null) return false;
    const c = String(m.content);
    if (!MARK_RE.test(c)) return false;
    const c2 = c.replace(new RegExp(MARK_RE.source, 'gi'), '').replace(/\s+$/, '');
    try {
      await tavo.message.update({ id: m.id, content: c2 });
    } catch (e) {
      await tavo.message.update(m.id, { content: c2 });
    }
    try {
      m.content = c2;
    } catch (e) {}
    return true;
  } catch (e) {
    return false;
  }
}

async function chatVirgin() {
  try {
    const cnt = await tavo.message.count();
    if (cnt > 8) return false;
    const arr = (await tavo.message.find([0])) || [];
    for (const m of arr) {
      if (m && m.role === 'user' && !m.hidden) return false;
    }
    return true;
  } catch (e) {
    return false;
  }
}

function fileNameFor(tk) {
  return 'iig_' + tk + '.png';
}

function sideNameFor(tk) {
  return 'iig_' + tk + '.json';
}

function keyFor(id) {
  return 'iig_m' + id;
}

function mvar(id) {
  return { scope: 'message', id: id };
}

async function imgGet(id) {
  try {
    const v = await tavo.get(keyFor(id), 'chat');
    if (v && v.state) return v;
  } catch (e) {}
  try {
    const old = await tavo.get('iig_img', mvar(id));
    if (old && old.state) {

      try {
        if (await tavo.get(keyFor(id) + '_x', 'chat')) return null;
      } catch (e) {}
      try {
        await tavo.set(keyFor(id), old, 'chat');
      } catch (e) {}
      return old;
    }
  } catch (e) {}
  return null;
}

function vmSeed(id, v) {
  try {
    if (!v || v.state !== 'ok' || !v.path) return;
    S._vmQ = (S._vmQ || Promise.resolve()).then(async function () {
      let m = S._vmMap;
      if (!m) {
        try {
          m = (await tavo.get('iig_vm', 'chat')) || {};
        } catch (e) {
          m = {};
        }
        S._vmMap = m;
      }
      const e0 = m[id];
      if (e0 && e0.p === v.path && e0.tk === (v.tk || '')) return;
      delete m[id];
      m[id] = { tk: v.tk || '', p: v.path, ar: v.ar || '' };
      const ks = Object.keys(m);
      for (let i = 0; i < ks.length - 12; i++) delete m[ks[i]];
      await tavo.set('iig_vm', m, 'chat');
    }).catch(function () {});
  } catch (e) {}
}

function reSeenDrop(id) {
  if (!S._reSeen) return;
  for (const k in S._reSeen) {
    if (k.indexOf(id + '|') === 0) delete S._reSeen[k];
  }
}

async function imgSet(id, v) {
  reSeenDrop(id);
  try {
    v = await rrDecorate(id, v);
  } catch (e) {}
  try {
    await tavo.set(keyFor(id), v, 'chat');
  } catch (e) {}
  try {
    vmSeed(id, v);
    if (S._vmQ) await S._vmQ;
  } catch (e) {}
  ringSoon();
}

function ringSoon() {
  if (S._ringT) return;
  S._ringT = setTimeout(function () {
    S._ringT = 0;
    ringFragments();
  }, 120);
}

async function imgClear(id, deep) {
  reSeenDrop(id);
  try {
    await tavo.unset(keyFor(id), 'chat');
  } catch (e) {}
  if (deep) {
    try {
      if ((await tavo.get('iig_img', mvar(id))) != null) await tavo.unset('iig_img', mvar(id));
    } catch (e) {}
    return;
  }
  try {
    const old = await tavo.get('iig_img', mvar(id));
    if (old != null) await tavo.set(keyFor(id) + '_x', 1, 'chat');
  } catch (e) {}
}

function skey(id, suf) {
  return keyFor(id) + '_' + suf;
}

async function sGet(id, suf, legacy) {
  try {
    const v = await tavo.get(skey(id, suf), 'chat');
    if (v != null && v !== '') return v;
  } catch (e) {}
  try {
    const o = await tavo.get(legacy, mvar(id));
    if (o != null && o !== '') return o;
  } catch (e) {}
  return null;
}

async function autoNote(id, skipped) {
  try {

    const sig = String(id) + '|' + String(skipped || '');
    if (S._anSig === sig) return;
    S._anSig = sig;
    await tavo.set('iigp_auto_last', {
      id: id,
      at: Date.now(),
      skipped: skipped || ''
    }, 'global');
  } catch (e) {}
}

async function msgById(id) {
  try {
    const m = await tavo.message.get(id);
    if (m) return m;
  } catch (e) {}
  try {
    const cnt = await tavo.message.count();
    const from = cnt > 60 ? cnt - 60 : 0;
    const arr = await tavo.message.find([from]);
    for (const x of (arr || [])) {
      if (x && x.id === id) return x;
    }
  } catch (e) {}
  return null;
}

var CFG_BOOLS = ['autoOn', 'autoUser', 'pwChat', 'useCharRef', 'useUserRef', 'naiRefs', 'naiLarge', 'naiQuality', 'naiVariety', 'naiSmea', 'naiSmeaDyn'];

var CFG_NUMS = ['pwMaxTokens', 'pwDepth', 'refMaxPx', 'keepImages', 'naiSteps', 'naiUc', 'naiRefMax', 'naiSeed'];

function normCfg(out) {
  let tainted = false;
  for (const k of CFG_BOOLS) {
    const v = out[k];
    if (typeof v === 'string') {
      out[k] = !/^\s*false\s*$/i.test(v);
      tainted = true;
    }
  }
  for (const k of CFG_NUMS) {
    const v = out[k];
    if (typeof v === 'string' && v.trim() !== '') {
      const n = parseInt(v, 10);
      if (!isNaN(n)) {
        out[k] = n;
        tainted = true;
      }
    }
  }
  return tainted;
}

async function healCfgKeys(out) {
  const md = vaultState().mode;
  const keys = vaultKeys(S._vaultSecret || '');
  if (keys && (md === 'on' || md === 'sealed')) {
    await vaultHealSeals(out);
    if (vaultArmed() || S._vaultHas) return;
  }
  await healOpenKeys(out);
}

async function healOpenKeys(out) {
  const fix = async function (field, store, pfield) {
    const cur = String(out[field] || '');
    if (cur.length < 20) return;
    let arr = null;
    try {
      arr = await tavo.get(store, 'global');
    } catch (e) {}
    if (!Array.isArray(arr)) return;
    secNotePresets(arr, pfield);
    for (const p of arr) {
      const full = String((p && p[pfield]) || '');
      if (full.length > cur.length && full.indexOf(cur) === 0) {
        out[field] = full;
        return;
      }
    }
  };
  await fix('apiKey', 'iig_presets', 'apiKey');
  await fix('pwKey', 'iig_pw_presets', 'pwKey');
}

function sizeRefused(e) {
  const low = String((e && e.message) || e || '').toLowerCase();
  return (e && e.status === 400) && (low.indexOf('unsupported parameters') >= 0 || low.indexOf('invalid request for this model') >= 0);
}

const genGeminiNative0 = genGeminiNative;
genGeminiNative = async function (tag, refs, cfg) {
  const sz = String((tag && tag.image_size) || (cfg && cfg.imageSize) || '1K');
  const key = String((cfg && cfg.model) || '') + '|' + sz;
  if (cfg && cfg._szAuto === false) return genGeminiNative0(tag, refs, cfg);
  if (sz !== '1K' && S._szNo && S._szNo[key]) {
    return genGeminiNative0(Object.assign({}, tag, { image_size: '1K' }), refs, Object.assign({}, cfg, { imageSize: '1K' }));
  }
  try {
    return await genGeminiNative0(tag, refs, cfg);
  } catch (e) {
    if (!sizeRefused(e)) throw e;
    if (sz === '1K') {
      e.message = String(e.message) + ' · провайдер не принял параметры запроса этой модели: проверь на главной «Кадр и качество» (формат кадра) и модель';
      throw e;
    }
    S._szNo = S._szNo || {};
    S._szNo[key] = 1;
    actNote('провайдер не принял размер ' + sz + ' у ' + (String((cfg && cfg.model) || '') || 'модели') + ' — рисую в 1K');
    try {
      toast('IIG: модель не принимает размер ' + sz + ' — картинка в 1K; на главной в «Кадр и качество» поставь 1K, чтобы не ждать лишний запрос');
    } catch (e2) {}
    return genGeminiNative0(Object.assign({}, tag, { image_size: '1K' }), refs, Object.assign({}, cfg, { imageSize: '1K' }));
  }
};

const EDIT_SRC_LOST = 'провайдер не принял исходную картинку — без неё вышла бы другая картинка; попробуй ещё раз или другую модель';
const EDIT_NO_REFS = 'эта модель не умеет дорабатывать по картинке — выбери модель с референсами';
const PW_CHAT_EMPTY = 'модель чата вернула пустой ответ — размышления съели лимит токенов или сработал фильтр';
const NST_STYLE_LOST = 'реф стиля не уходит в NovelAI через Наистеру — стиль с картинки берёт только подключение NovelAI (official)';
const AB_STYLE_OLD = 'Render the FINAL image strictly in the requested art style from the prompt — do NOT adopt the photographic or realistic look of the reference photos.';
const AB_STYLE_NEW = 'Render the FINAL image in the art style of the ART STYLE reference image(s): copy their rendering technique, linework, shading and color treatment; style words in the prompt only support it. Do NOT adopt the photographic look of the other reference photos.';

function isStyleLabel(l) {
  return String(l || '').indexOf('ART STYLE') === 0;
}

function styleFirst(refs) {
  const list = Array.isArray(refs) ? refs : [];
  const st = [];
  const rest = [];
  for (const r of list) {
    if (r && isStyleLabel(r.label)) st.push(r);
    else rest.push(r);
  }
  return st.length ? st.concat(rest) : list;
}

function refsSummaryEdit(refs) {
  const t0 = S._textRefs;
  S._textRefs = [];
  try {
    return refsSummary(refs);
  } finally {
    S._textRefs = t0;
  }
}

const antiBleedSty0 = antiBleed;
antiBleed = function (refs) {
  const s = antiBleedSty0(refs);
  const any = Array.isArray(refs) && refs.some(function (r) { return r && isStyleLabel(r.label); });
  return any ? s.split(AB_STYLE_OLD).join(AB_STYLE_NEW) : s;
};

const shortLabelSty0 = _shortLabel;
_shortLabel = function (l) {
  if (isStyleLabel(l)) return l;
  return shortLabelSty0(l);
};

const genGeminiEdit0 = genGeminiNative;
genGeminiNative = async function (tag, refs, cfg) {
  if (cfg && cfg._edit && !(refs && refs.length)) throw new Error(EDIT_SRC_LOST);
  return genGeminiEdit0(tag, styleFirst(refs || []), cfg);
};

const genOpenAIChatEdit0 = genOpenAIChat;
genOpenAIChat = async function (tag, refs, cfg) {
  if (cfg && cfg._edit && !(refs && refs.length)) throw new Error(EDIT_SRC_LOST);
  return genOpenAIChatEdit0(tag, styleFirst(refs || []), cfg);
};

const genNaisteraEdit0 = genNaistera;
genNaistera = async function (tag, refs, cfg) {
  const list = styleFirst(refs || []);
  const model = naisteraCanon((tag && tag.model) || (cfg && cfg.naisteraModel) || 'grok');
  if (cfg && cfg._edit) {
    if (!naisteraRefsOk(model)) throw new Error(EDIT_NO_REFS);
    if (!list.length) throw new Error(EDIT_SRC_LOST);
  }
  if (model.indexOf('novelai') === 0 && list.some(function (r) { return r && (isStyleLabel(r.label) || r.rtype === 'style'); })) {
    try {
      S._refLost = (S._refLost || []).concat([NST_STYLE_LOST]);
    } catch (e) {}
  }
  return genNaisteraEdit0(tag, list, cfg);
};

const genNaisteraNai0 = genNaistera;
genNaistera = async function (tag, refs, cfg) {
  const m = naisteraCanon((tag && tag.model) || (cfg && cfg.naisteraModel) || '');
  if (m.indexOf('novelai') !== 0) return genNaisteraNai0(tag, refs, cfg);
  const arts = naiClean((cfg && cfg.naiArtists) || '');
  naiArtNote(cfg);
  const neg = [String((cfg && cfg.styleNegative) || '').trim(), naiClean((cfg && cfg.naiNegative) || '')].filter(function (x) {
    return !!x;
  }).join(', ');
  const cp = naiCaptions(tag, cfg);
  const para = naiClean(String((tag && tag.prompt) || ''));
  const fold = cp.chars.map(function (c) { return naiFoldCaption(c.caption, para); }).concat(cp.base).filter(function (x) { return !!x; });
  const negOk = naisteraNegOk(m);
  const negFlat = negOk ? '' : naiFlatWeights(neg);
  const negTail = (!negOk && negFlat) ? (', -1::' + negFlat + ' ::') : '';
  const tag2 = Object.assign({}, tag, { prompt: (arts ? (arts + ', ') : '') + para + (fold.length ? (', ' + fold.join(', ')) : '') + negTail });
  const cfg2 = Object.assign({}, cfg, { styleNegative: negOk ? neg : '' });
  if (cp.chars.length > 0) S._naiNote = 'Naistera NovelAI: подписей персонажей ' + cp.chars.length + ' (в промпте)';
  S._naiFold = 1;
  try {
    return await genNaisteraNai0(tag2, refs, cfg2);
  } catch (e) {
    if (e && (e.status === 400 || e.status === 422) && hasCyr(tag2.prompt + ' ' + neg)) throw naiRuErr(tag2.prompt + ' ' + neg, e.status, naiRawMsg(e));
    throw e;
  } finally {
    S._naiFold = 0;
  }
};

const naiPlainTailFold0 = naiPlainTail;
naiPlainTail = function () {
  if (S._naiFold) return '';
  return naiPlainTailFold0();
};

function errText(e) {
  if (e && e.iigRu) return String(e.message);
  const raw = (e && e.message) ? String(e.message) : String(e);
  const low = raw.toLowerCase();
  const st = (e && typeof e.status === 'number') ? e.status : null;
  const tail = ' · ' + raw.slice(0, 160);
  if (low.indexOf('no providers') >= 0) return 'у провайдера сейчас нет свободных серверов под эту модель — это не поломка плагина: попробуй позже или смени модель в панели' + tail;
  if (st === 401 || low.indexOf('invalid api key') >= 0 || low.indexOf('invalid_api_key') >= 0) return 'провайдер не принял ключ — проверь ключ в панели (вкладка api)' + tail;
  if (st === 402 || low.indexOf('insufficient') >= 0) return 'у ключа кончился баланс' + tail;
  if (low.indexOf('model_not_found') >= 0 || low.indexOf('model not found') >= 0 || low.indexOf('无可用渠道') >= 0 || /model .{0,60}(does not exist|not exist|is not available|unknown)/.test(low)) return 'модель не найдена у провайдера для этого ключа: у роутеров ключ привязан к группе моделей — возьми модель из списка «обзор» (он показывает только доступные ключу) или сделай на сайте роутера ключ с нужной группой' + tail;
  if (st === 429) return 'провайдер притормаживает (лимит запросов) — подожди минуту и повтори' + tail;
  if (st === 503 || st === 502 || st === 504) return 'провайдер временно недоступен — повтор через минуту-другую обычно помогает' + tail;
  if (low.indexOf('could not complete the request') >= 0 || low.indexOf('internal error') >= 0) return 'модель чата в Tavo вернула внутреннюю ошибку — это ответ Tavo и провайдера чата, не плагина: плагин повторил и урезал запрос; тапни ↻ позже или переключи промпт на свою модель (вкладка api)' + tail;
  if ((raw.indexOf('модель чата не ответила') >= 0 && low.indexOf('timeout') >= 0) || (e && e.iigCut && raw.indexOf('модель чата') === 0)) return 'модель чата не написала промпт для картинки (не успела или вернула пустой ответ) — генератор картинок тут ни при чём: тапни ↻ позже, подними время ожидания или токены ответа модели промпта во вкладке api либо переключи промпт на своё подключение' + tail;
  if (low.indexOf('timeout') >= 0) return 'провайдер не успел нарисовать за ' + Math.round(GEN_TIMEOUT / 60000) + ' мин — тапни ↻ или возьми модель побыстрее' + tail;

  if (low.indexOf('load failed') >= 0 || low.indexOf('failed to fetch') >= 0 || low.indexOf('сеть/cors') >= 0) {
    const sm = raw.match(/оборвалось через (\d+) с/);
    const km = raw.match(/тело (\d+) КБ/);
    if (sm && parseInt(sm[1], 10) <= 2 && km && parseInt(km[1], 10) < 200) {
      return 'запрос оборвался сразу, хотя он маленький — так бывает в двух случаях: провайдер недоступен из твоей сети (нужен VPN или другая сеть) или его защита отвергла сам запрос (фильтр содержимого, лимит размера) и ответила так, что приложение ответа не видит. Тест в панели шлёт короткую безобидную фразу, поэтому он может проходить. Что попробовать: для промпта — «модель чата» во вкладке api (идёт через приложение, а не напрямую); другая модель или провайдер; на время выключить фото в паспортах' + tail;
    }
    return 'сеть телефона не доставила запрос провайдеру — это не поломка плагина: либо провайдер заблокирован (нужен VPN или другая сеть), либо сеть режет большой запрос с фото-рефами (на время можно выключить фото в паспортах). В хвосте размер тела и секунды до обрыва: мгновенно = хост недоступен, через минуту = сеть или фон роняют долгий запрос' + tail;
  }
  return raw.slice(0, 240);
}

var ELOG_CAP = 60;
function naiClean(s) {
  return String(s || '')
    .replace(/[\[\]{}]/g, ', ')
    .replace(/\s+/g, ' ')
    .replace(/\s*,(?:\s*,)*\s*/g, ', ')
    .replace(/^[\s,;.]+/, '')
    .replace(/[\s,;.]+$/, '')
    .trim();
}

function naiNumTail(seg) {
  let i = seg.length;
  while (i > 0 && seg.charAt(i - 1) === ' ') i--;
  const end = i;
  let digits = 0;
  let dots = 0;
  while (i > 0) {
    const ch = seg.charAt(i - 1);
    if (ch >= '0' && ch <= '9') digits++;
    else if (ch === '.' && dots === 0) dots++;
    else break;
    i--;
  }
  if (!digits) return seg;
  if (i > 0 && seg.charAt(i - 1) === '-') i--;
  let j = i;
  while (j > 0) {
    const sp = seg.charAt(j - 1);
    if (sp !== ' ' && sp !== '\n' && sp !== '\t') break;
    j--;
  }
  if (j > 0) {
    const pre = seg.charAt(j - 1);
    if (pre !== ',' && pre !== ';') return seg;
  }
  return end > i ? seg.slice(0, i) : seg;
}

function naiFlatWeights(s) {
  const parts = String(s == null ? '' : s).split('::');
  if (parts.length < 2) return naiClean(parts[0]);
  const out = [];
  for (let i = 0; i < parts.length; i++) {
    out.push(i < parts.length - 1 ? naiNumTail(parts[i]) : parts[i]);
  }
  return naiClean(out.join(', '));
}

function naiReal(cfg) {
  if (!cfg || typeof cfg !== 'object') return false;
  if (cfg.apiStyle === 'novelai') return true;
  return cfg.apiStyle === 'naistera' && naiMode(cfg);
}

const NAI_NO_ARTISTS = 'художники NovelAI не заданы (вкладка промпты, блок NovelAI) — стиль задаёт только промпт';

function naiArtNote(cfg) {
  if (!naiReal(cfg) || naiClean((cfg && cfg.naiArtists) || '')) return;
  if (!Array.isArray(S._refLost)) S._refLost = [];
  if (S._refLost.indexOf(NAI_NO_ARTISTS) < 0) S._refLost.push(NAI_NO_ARTISTS);
}

function naiTags(s) {
  return naiClean(s).split(',').map(function (x) {
    return x.trim();
  }).filter(function (x) {
    return !!x;
  });
}

function naiCountTag(t) {
  return /^(\d{1,2})(girl|boy|other)s?$/i.test(String(t || '').trim());
}

function naiFoldCaption(caption, paragraph) {
  const para = naiTags(paragraph);
  const have = {};
  let paraCount = false;
  for (const t of para) {
    have[t.toLowerCase()] = 1;
    if (naiCountTag(t)) paraCount = true;
  }
  const out = [];
  let cutCount = false;
  for (const t of naiTags(caption)) {
    const k = t.toLowerCase();
    if (have[k] === 1) continue;
    if (paraCount && !cutCount && naiCountTag(t)) {
      cutCount = true;
      continue;
    }
    if (out.some(function (x) { return x.toLowerCase() === k; })) continue;
    out.push(t);
  }
  return out.join(', ');
}

function naiTagLike(s) {
  const t = String(s == null ? '' : s).trim();
  if (!t) return false;
  const low = t.toLowerCase();
  if (low.indexOf('reference image') >= 0 || low.indexOf('match the') >= 0 || low.indexOf('do not') >= 0) return false;
  if (t.split('. ').length - 1 > 1) return false;
  const words = t.split(/\s+/).filter(function (x) { return !!x; }).length;
  const commas = t.split(',').length - 1;
  return words <= 8 || commas * 8 >= words;
}

function naiAvoidCut(s) {
  const t = String(s == null ? '' : s);
  const k = t.toLowerCase().indexOf('avoid:');
  if (k < 0) return { keep: t.trim(), neg: '' };
  return { keep: t.slice(0, k).trim().replace(/[\s,;.]+$/, ''), neg: t.slice(k + 6).trim() };
}

function naiStyleTails(st, cfg) {
  const prefixes = [];
  const tails = [];
  const negs = [];
  let dropped = false;
  for (const p of _styleBlocks(st, '(STYLE PREFIX)')) {
    const cut = naiAvoidCut(p);
    if (cut.neg) negs.push(cut.neg);
    if (!cut.keep) continue;
    if (naiTagLike(cut.keep)) prefixes.push(cut.keep);
    else dropped = true;
  }
  for (const p of _styleBlocks(st, '(STYLE SUFFIX)')) {
    const cut = naiAvoidCut(p);
    if (cut.neg) negs.push(cut.neg);
    if (!cut.keep) continue;
    if (naiTagLike(cut.keep)) tails.push(cut.keep);
    else dropped = true;
  }
  for (const p of _styleBlocks(st, '(NEGATIVE)')) {
    const cut = naiAvoidCut(p);
    const n = cut.neg || cut.keep;
    if (n) negs.push(n);
  }
  if (_styleBlocks(st, '(REFERENCE LOCK|STYLE LOCK)').length) dropped = true;
  if (dropped) {
    const nm = String((cfg && cfg.promptName) || '').trim() || 'базовый';
    const note = 'стиль «' + nm + '» написан для других моделей — его оформление к NovelAI не ушло';
    if (!Array.isArray(S._refLost)) S._refLost = [];
    if (S._refLost.indexOf(note) < 0) S._refLost.push(note);
  }
  return { prefixes: prefixes, tails: tails, negative: naiClean(negs.map(function (x) {
    return String(x).replace(/\.(\s+|$)/g, ', ');
  }).join(', ')) };
}

function naiEnforce(t, st, cfg) {
  t = String(t || '');
  const nt = naiStyleTails(st, cfg);
  for (let i = nt.prefixes.length - 1; i >= 0; i--) {
    const pre = nt.prefixes[i];
    if (t.indexOf(pre) === 0) continue;
    const at = t.indexOf(pre);
    if (at > 0) t = (t.slice(0, at) + t.slice(at + pre.length)).replace(/\s{2,}/g, ' ').trim();
    t = pre + ', ' + t;
  }
  for (const tail of nt.tails) {
    if (t.indexOf(tail.slice(0, 24)) >= 0) continue;
    t = t.replace(/[\s,;.]+$/, '') + ', ' + tail;
  }
  if (nt.negative && cfg && typeof cfg === 'object') {
    const have = naiTags(cfg.styleNegative || '');
    const low = have.map(function (x) { return x.toLowerCase(); });
    for (const n of naiTags(nt.negative)) {
      if (low.indexOf(n.toLowerCase()) < 0) {
        have.push(n);
        low.push(n.toLowerCase());
      }
    }
    cfg.styleNegative = have.join(', ');
  }
  return t;
}

var NAI_CUSTOM_STYLES = ['Соло кастом by Rakshakti, Ксю & Travadd', 'Комикс кастом by darkxizon & Шино'];

function naiCustomStyle(cfg) {
  const nm = String((cfg && cfg.promptName) || '').trim().toLowerCase();
  if (!nm) return false;
  for (let i = 0; i < NAI_CUSTOM_STYLES.length; i++) {
    if (NAI_CUSTOM_STYLES[i].toLowerCase() === nm) return true;
  }
  return false;
}

function naiCustomBlock(cfg) {
  if (cfg && cfg.apiStyle === 'novelai' && naiCustomStyle(cfg) && !naiClean(cfg.naiArtists || '')) return 'стиль «' + cfg.promptName + '» задаёт художников только полем «Художники и стиль» — заполни его во вкладке «промпты», блок NovelAI, иначе он не работает';
  return '';
}

function naiMode(cfg, model) {
  if (!cfg || typeof cfg !== 'object') return false;
  if (cfg.apiStyle === 'novelai') return true;
  if (cfg.apiStyle === 'tensor') return !(cfg.ta && cfg.ta.tags === false);
  if (cfg.apiStyle === 'naistera') return naisteraCanon(model || cfg.naisteraModel || '').indexOf('novelai') === 0;
  return false;
}

function hasCyr(s) {
  return /[Ѐ-ӿ]/.test(String(s == null ? '' : s));
}

const NAI_RU_FAIL = 'NovelAI не принял запрос, а в нём есть русский текст';

function naiRuErr(sent, status, raw) {
  const t = String(sent == null ? '' : sent).replace(/\s+/g, ' ');
  const k = t.search(/[Ѐ-ӿ]/);
  const a = Math.max(0, k - 12);
  const frag = k >= 0 ? t.slice(a, a + 40).trim() : '';
  const e = new Error(NAI_RU_FAIL + ': «' + frag + '» — пиши промпт, паспорта, негатив и художников на английском или включи на главной галочку «переводить русские заметки на английский перед отправкой в NovelAI»' + ' · ' + String(raw == null ? '' : raw).slice(0, 120));
  e.status = status;
  e.iigRu = 1;
  return e;
}

function naiRawMsg(e) {
  const s = String((e && e.message) || '');
  const k = s.indexOf(' :: ');
  const t = k >= 0 ? s.slice(k + 4) : s;
  let m = '';
  try {
    const j = JSON.parse(t);
    m = String((j && (j.message || (j.error && j.error.message))) || '');
  } catch (x) {}
  return naiSafeMsg(m || t);
}

function enSync(cfg) {
  if (cfg && typeof cfg === 'object') S._enOn = naiMode(cfg) && !!cfg.translateRu;
}

const resolveCfgEn0 = resolveCfg;
resolveCfg = async function () {
  const c = await resolveCfgEn0.apply(this, arguments);
  enSync(c);
  return c;
};

var CMD_KEY_LS = 'iig_cmd_key';
var CMD_FREE = ['stopall', 'undo', 'rrsel', 'toboard'];
var CMD_PAID = ['regen', 'more', 'rewrite', 'edit', 'restyle', 'upscale'];
var CMD_RL_POST_MS = 20000;
var CMD_RL_MIN = 6;
var CMD_RL_FREE = 10;
var CMD_DIAG_MS = 120000;
var FRAG_LS_KEY = 'iig_frag_ls';
var FRAG_LS_MS = 86400000;
var CMD_FRESH_MS = 120000;
var GENLAST_MAX = 10;
var SEC_HOST_ERR = 'адрес подключения изменился не из панели — ключ не отправлен: открой панель, вкладка api, проверь адрес и нажми «сохранить»; если адрес верный, а ошибка повторяется — перезапусти Tavo';
var SEC_CFG_BAD = 'настройки плагина повреждены (iig_cfg не объект) — открой панель и нажми «сохранить»';
var SEC_HIDE = '[скрыто]';

function secOrigin(u) {
  const s = String(u == null ? '' : u).trim();
  if (!s) return '';
  try {
    const base = (typeof location !== 'undefined' && location && location.href) ? location.href : undefined;
    const o = new URL(s, base).origin;
    return (!o || o === 'null') ? '' : o.toLowerCase();
  } catch (e) {
    return '';
  }
}

function secApiHost(c) {
  const st = String((c && c.apiStyle) || DEFAULTS.apiStyle);
  if (st === 'novelai') return secOrigin(NAI_HOST);
  if (st === 'tensor') return secOrigin(TA_HOST);
  if (st === 'naistera') return secOrigin(naisteraBase(c && c.endpoint));
  return secOrigin(apiBase(c && c.endpoint));
}

function secPwHost(c) {
  let b = rstripSlash(String((c && c.pwEndpoint) || '').trim());
  if (b && b.indexOf('://') < 0) b = 'https://' + b;
  return secOrigin(b);
}

function secHosts() {
  return S._secHosts || (S._secHosts = { api: '', apiHost: '', pw: '', pwHost: '', seen: {} });
}

function secBind(c) {
  if (!c || typeof c !== 'object') return;
  const m = secHosts();
  if (!m.seen || typeof m.seen !== 'object') m.seen = {};
  const a = String(c.apiKey || '').trim();
  const p = String(c.pwKey || '').trim();
  if (a && !m.seen['a' + a]) m.seen['a' + a] = secApiHost(c) || '-';
  if (p && !m.seen['p' + p]) m.seen['p' + p] = secPwHost(c) || '-';
  m.api = a;
  m.apiHost = a ? m.seen['a' + a] : '';
  m.pw = p;
  m.pwHost = p ? m.seen['p' + p] : '';
}

function secRebind(cfg) {
  if (!cfg || typeof cfg !== 'object') return;
  const m = secHosts();
  if (!m.seen || typeof m.seen !== 'object') m.seen = {};
  const a = String(cfg.apiKey || '').trim();
  const p = String(cfg.pwKey || '').trim();
  if (a) m.seen['a' + a] = secApiHost(cfg) || '-';
  if (p) m.seen['p' + p] = secPwHost(cfg) || '-';
  m.api = a;
  m.apiHost = a ? m.seen['a' + a] : '';
  m.pw = p;
  m.pwHost = p ? m.seen['p' + p] : '';
}

function secNotePresets(arr, f) {
  if (!Array.isArray(arr)) return;
  const k = f === 'pwKey' ? 'pw' : 'api';
  const pk = S._secPresetKeys || (S._secPresetKeys = { api: [], pw: [] });
  const out = [];
  for (const p of arr) {
    const v = p && typeof p[f] === 'string' ? p[f].trim() : '';
    if (v) out.push(v);
  }
  pk[k] = out;
}

function secKeys() {
  const m = secHosts();
  const out = [m.api, m.pw];
  const pk = S._secPresetKeys;
  if (pk) for (const k of ['api', 'pw']) if (Array.isArray(pk[k])) for (const v of pk[k]) out.push(v);
  return out.filter(function (x) { return typeof x === 'string' && x.length >= 8; });
}

function secMask(s) {
  let t = String(s == null ? '' : s);
  if (!t) return t;
  t = t.replace(/([?&#;]\s*(?:key|token|api_key|apikey|access_token|auth)\s*=\s*)[^&#\s"'<>]*/gi, '$1' + SEC_HIDE);
  t = t.replace(/\bsk-[A-Za-z0-9_-]{8,}/g, SEC_HIDE).replace(/\bpst-[A-Za-z0-9_-]{8,}/g, SEC_HIDE).replace(/AIza[0-9A-Za-z_-]{20,}/g, SEC_HIDE);
  let ks = [];
  try {
    ks = secKeys();
  } catch (e) {}
  ks.sort(function (a, b) { return b.length - a.length; });
  for (const k of ks) if (t.indexOf(k) >= 0) t = t.split(k).join(SEC_HIDE);
  return t;
}

function secHdrVals(h) {
  const out = [];
  const take = function (k, v) {
    const n = String(k || '').toLowerCase();
    if (n !== 'authorization' && n !== 'x-goog-api-key') return;
    let s = String(v == null ? '' : v).trim();
    if (n === 'authorization') s = s.replace(/^bearer\s+/i, '').trim();
    if (s) out.push(s);
  };
  if (!h || typeof h !== 'object') return out;
  if (typeof h.forEach === 'function' && !Array.isArray(h)) {
    try {
      h.forEach(function (v, k) { take(k, v); });
    } catch (e) {}
    return out;
  }
  if (Array.isArray(h)) {
    for (const p of h) if (Array.isArray(p)) take(p[0], p[1]);
    return out;
  }
  for (const k in h) take(k, h[k]);
  return out;
}

function secGuard(url, opts) {
  const vals = secHdrVals(opts && opts.headers);
  if (!vals.length) return null;
  const m = secHosts();
  const o = secOrigin(url);
  for (const v of vals) {
    const hosts = [];
    if (m.api && v === m.api) hosts.push(m.apiHost);
    if (m.pw && v === m.pw) hosts.push(m.pwHost);
    if (!hosts.length) continue;
    if (!o || hosts.indexOf(o) < 0) {
      const e = new Error(SEC_HOST_ERR);
      e.iigHost = 1;
      return e;
    }
  }
  return null;
}

function cmdLs() {
  try {
    if (typeof window === 'undefined' || !window) return null;
    const ls = window.localStorage;
    if (!ls) return null;
    ls.getItem(CMD_KEY_LS);
    return ls;
  } catch (e) {
    return null;
  }
}

function cfgTaintFields(c) {
  const out = [];
  if (!c || typeof c !== 'object') return out;
  for (const k of CFG_BOOLS) if (typeof c[k] === 'string') out.push(k);
  for (const k of CFG_NUMS) if (typeof c[k] === 'string' && c[k].trim() !== '' && !isNaN(parseInt(c[k], 10))) out.push(k);
  return out;
}

const resolveCfgSec0 = resolveCfg;
resolveCfg = async function () {
  const c = await resolveCfgSec0.apply(this, arguments);
  if (c && typeof c === 'object' && S._vaultMode == null) secBind(c);
  return c;
};

const fetchTSec0 = fetchT;
fetchT = function (url, opts, ms, sig) {
  const bad = secGuard(url, opts);
  if (bad) return Promise.reject(bad);
  return fetchTSec0(url, opts, ms, sig).catch(function (e) {
    try {
      if (e && typeof e.message === 'string') e.message = secMask(e.message);
    } catch (x) {}
    throw e;
  });
};

const apiErrSec0 = apiErr;
apiErr = function (status, url, text, resp) {
  const e = apiErrSec0.call(this, status, secMask(url), secMask(String(text == null ? '' : text)), resp);
  try {
    e.message = secMask(e.message);
  } catch (x) {}
  return e;
};

const parseImageSec0 = parseImageFromContent;
parseImageFromContent = function (content) {
  try {
    return parseImageSec0(content);
  } catch (e) {
    if (e && e.iigTextResp) e.message = 'Модель вернула ТЕКСТ вместо картинки (не та модель / отказ?): ' + secMask(String(content)).replace(/\s+/g, ' ').slice(0, 200);
    throw e;
  }
};

const actNoteSec0 = actNote;
actNote = function (t) {
  const m = secMask(t);
  const r = actNoteSec0(m);
  try {
    const log = Array.isArray(S._actLog) ? S._actLog : (S._actLog = []);
    log.push({ at: Date.now(), text: String(m == null ? '' : m).slice(0, 300) });
    if (log.length > 30) log.splice(0, log.length - 30);
  } catch (e) {}
  return r;
};

const actEndSec0 = actEnd;
actEnd = function (t) {
  return actEndSec0(t ? secMask(t) : t);
};

function secRand() {
  let s = '';
  try {
    const c = (typeof crypto !== 'undefined' && crypto && crypto.getRandomValues) ? crypto : null;
    if (c) {
      const a = new Uint8Array(24);
      c.getRandomValues(a);
      for (let i = 0; i < a.length; i++) s += ('0' + a[i].toString(16)).slice(-2);
    }
  } catch (e) {
    s = '';
  }
  while (s.length < 48) s += Math.random().toString(16).slice(2);
  return s.slice(0, 48);
}

var SHA_K = [0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5, 0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174, 0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da, 0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967, 0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85, 0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070, 0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3, 0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2];

function utf8Bytes(s) {
  s = String(s);
  var out = [];
  for (var i = 0; i < s.length; i++) {
    var c = s.charCodeAt(i);
    if (c >= 0xd800 && c <= 0xdbff && i + 1 < s.length) {
      var d = s.charCodeAt(i + 1);
      if (d >= 0xdc00 && d <= 0xdfff) {
        c = 0x10000 + ((c - 0xd800) << 10) + (d - 0xdc00);
        i++;
      } else c = 0xfffd;
    } else if (c >= 0xd800 && c <= 0xdfff) c = 0xfffd;
    if (c < 0x80) out.push(c);
    else if (c < 0x800) out.push(0xc0 | (c >> 6), 0x80 | (c & 63));
    else if (c < 0x10000) out.push(0xe0 | (c >> 12), 0x80 | ((c >> 6) & 63), 0x80 | (c & 63));
    else out.push(0xf0 | (c >> 18), 0x80 | ((c >> 12) & 63), 0x80 | ((c >> 6) & 63), 0x80 | (c & 63));
  }
  return out;
}

function sha256Bytes(bytes) {
  var m = bytes.slice();
  var bl = bytes.length * 8;
  m.push(0x80);
  while (m.length % 64 !== 56) m.push(0);
  var hi = Math.floor(bl / 0x100000000), lo = bl >>> 0;
  m.push((hi >>> 24) & 255, (hi >>> 16) & 255, (hi >>> 8) & 255, hi & 255, (lo >>> 24) & 255, (lo >>> 16) & 255, (lo >>> 8) & 255, lo & 255);
  var h = [0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19];
  var w = new Array(64);
  var ror = function(x, n) {
    return (x >>> n) | (x << (32 - n));
  };
  for (var p = 0; p < m.length; p += 64) {
    for (var t = 0; t < 16; t++) w[t] = (m[p + 4 * t] << 24) | (m[p + 4 * t + 1] << 16) | (m[p + 4 * t + 2] << 8) | m[p + 4 * t + 3];
    for (t = 16; t < 64; t++) {
      var s0 = ror(w[t - 15], 7) ^ ror(w[t - 15], 18) ^ (w[t - 15] >>> 3);
      var s1 = ror(w[t - 2], 17) ^ ror(w[t - 2], 19) ^ (w[t - 2] >>> 10);
      w[t] = (w[t - 16] + s0 + w[t - 7] + s1) | 0;
    }
    var a = h[0], b = h[1], c = h[2], d = h[3], e = h[4], f = h[5], g = h[6], k = h[7];
    for (t = 0; t < 64; t++) {
      var t1 = (k + (ror(e, 6) ^ ror(e, 11) ^ ror(e, 25)) + ((e & f) ^ (~e & g)) + SHA_K[t] + w[t]) | 0;
      var t2 = ((ror(a, 2) ^ ror(a, 13) ^ ror(a, 22)) + ((a & b) ^ (a & c) ^ (b & c))) | 0;
      k = g;
      g = f;
      f = e;
      e = (d + t1) | 0;
      d = c;
      c = b;
      b = a;
      a = (t1 + t2) | 0;
    }
    h[0] = (h[0] + a) | 0;
    h[1] = (h[1] + b) | 0;
    h[2] = (h[2] + c) | 0;
    h[3] = (h[3] + d) | 0;
    h[4] = (h[4] + e) | 0;
    h[5] = (h[5] + f) | 0;
    h[6] = (h[6] + g) | 0;
    h[7] = (h[7] + k) | 0;
  }
  var out = [];
  for (var q = 0; q < 8; q++) out.push((h[q] >>> 24) & 255, (h[q] >>> 16) & 255, (h[q] >>> 8) & 255, h[q] & 255);
  return out;
}

function hmacHex(key, msg) {
  var kb = utf8Bytes(key);
  if (kb.length > 64) kb = sha256Bytes(kb);
  while (kb.length < 64) kb.push(0);
  var ip = [], op = [];
  for (var i = 0; i < 64; i++) {
    ip.push(kb[i] ^ 0x36);
    op.push(kb[i] ^ 0x5c);
  }
  var inner = sha256Bytes(ip.concat(utf8Bytes(msg)));
  var r = sha256Bytes(op.concat(inner));
  var s = '';
  for (var j = 0; j < r.length; j++) s += (r[j] < 16 ? '0' : '') + r[j].toString(16);
  return s;
}

function cmdCanon(v, top) {
  if (v === null || v === undefined) return 'null';
  if (Array.isArray(v)) {
    var a = [];
    for (var i = 0; i < v.length; i++) a.push(cmdCanon(v[i], false));
    return '[' + a.join(',') + ']';
  }
  if (typeof v === 'object') {
    var ks = Object.keys(v).sort();
    var b = [];
    for (var j = 0; j < ks.length; j++) {
      if (v[ks[j]] === undefined || typeof v[ks[j]] === 'function') continue;
      if (top && ks[j] === 'sig') continue;
      b.push(JSON.stringify(ks[j]) + ':' + cmdCanon(v[ks[j]], false));
    }
    return '{' + b.join(',') + '}';
  }
  if (typeof v === 'number' && !isFinite(v)) return 'null';
  return JSON.stringify(v);
}

var VAULT_FILE = 'iig_vault.key';
var VAULT_SEALS_FILE = 'iig_vault.seals';
var VAULT_VAR = 'iig_vault';
var VAULT_PFX = 'iigs2.';
var VAULT_TTL = 8000;
var VAULT_PASS_MS = 300000;
var VAULT_FILE_MS = 60000;
var VAULT_MISS_MS = 1000;
var VAULT_FS_WAIT = 2500;
var VAULT_NULL_MAX = 10;
var VAULT_CANARY = 'iig_cfg_canary';
var VAULT_SEAL_MAX = 8192;
var VAULT_B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
var VAULT_LOCKED_ERR = 'ключ API не найден — открой панель, вкладка api, и введи его заново';
var VAULT_NOFS_ERR = 'хранилище Tavo недоступно — ключи сейчас не читаются, перезапусти Tavo';
var VAULT_NORAND_ERR = 'устройство не даёт случайных чисел — ключи не сохраняются';
var VAULT_FOREIGN = 'в настройках появился ключ не из панели — проигнорирован';
var VAULT_LISTS = [
  { name: 'iig_presets', key: 'apiKey', seal: 'apiKeySeal', slot: 'preset:', map: 'presets', snap: 'presets', main: true },
  { name: 'iig_presets_bak', key: 'apiKey', seal: 'apiKeySeal', slot: 'preset:', map: 'presets', snap: 'presetsBak', main: false },
  { name: 'iig_pw_presets', key: 'pwKey', seal: 'pwKeySeal', slot: 'pwpreset:', map: 'pwPresets', snap: 'pw', main: true },
  { name: 'iig_pw_presets_bak', key: 'pwKey', seal: 'pwKeySeal', slot: 'pwpreset:', map: 'pwPresets', snap: 'pwBak', main: false }
];

function vaultRandom(n) {
  try {
    const c = (typeof crypto !== 'undefined' && crypto && typeof crypto.getRandomValues === 'function') ? crypto : null;
    if (!c) return null;
    const a = new Uint8Array(n);
    c.getRandomValues(a);
    return a;
  } catch (e) {
    return null;
  }
}

function vaultHex(b) {
  let s = '';
  for (let i = 0; i < b.length; i++) s += (b[i] < 16 ? '0' : '') + b[i].toString(16);
  return s;
}

function vaultHexOk(s) {
  return typeof s === 'string' && /^[0-9a-f]{64}$/.test(s);
}

function vaultMacBytes(key, bytes) {
  let kb = utf8Bytes(key);
  if (kb.length > 64) kb = sha256Bytes(kb);
  while (kb.length < 64) kb.push(0);
  const ip = [];
  const op = [];
  for (let i = 0; i < 64; i++) {
    ip.push(kb[i] ^ 0x36);
    op.push(kb[i] ^ 0x5c);
  }
  return sha256Bytes(op.concat(sha256Bytes(ip.concat(bytes))));
}

function vaultB64(b) {
  let s = '';
  for (let i = 0; i < b.length; i += 3) {
    const n = (b[i] << 16) | ((i + 1 < b.length ? b[i + 1] : 0) << 8) | (i + 2 < b.length ? b[i + 2] : 0);
    s += VAULT_B64.charAt((n >> 18) & 63) + VAULT_B64.charAt((n >> 12) & 63);
    if (i + 1 < b.length) s += VAULT_B64.charAt((n >> 6) & 63);
    if (i + 2 < b.length) s += VAULT_B64.charAt(n & 63);
  }
  return s;
}

function vaultUnb64(s) {
  if (typeof s !== 'string' || !/^[A-Za-z0-9_-]*$/.test(s) || s.length % 4 === 1) return null;
  const out = [];
  let acc = 0;
  let bits = 0;
  for (let i = 0; i < s.length; i++) {
    acc = (acc << 6) | VAULT_B64.indexOf(s.charAt(i));
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      out.push((acc >> bits) & 255);
    }
    acc &= (1 << bits) - 1;
  }
  return out;
}

function vaultUtf8(bytes) {
  if (typeof TextDecoder !== 'undefined') return new TextDecoder('utf-8', { fatal: true }).decode(Uint8Array.from(bytes));
  let s = '';
  for (let i = 0; i < bytes.length; i++) s += '%' + (bytes[i] < 16 ? '0' : '') + bytes[i].toString(16);
  return decodeURIComponent(s);
}

function vaultKeys(secret) {
  if (!vaultHexOk(secret)) return null;
  const kc = S._vaultKeysC;
  if (kc && kc.s === secret) return kc.k;
  const k = {
    Kenc: hmacHex(secret, 'iig-vault-v2|enc'),
    Kmac: hmacHex(secret, 'iig-vault-v2|mac'),
    fp: hmacHex(secret, 'iig-vault-v2|fp').slice(0, 16)
  };
  S._vaultKeysC = { s: secret, k: k };
  return k;
}

function vaultFp() {
  const k = vaultKeys(S._vaultSecret || '');
  return k ? k.fp : '';
}

function vaultStream(kenc, nonce, n) {
  const out = [];
  for (let i = 0; out.length < n; i++) {
    const blk = vaultMacBytes(kenc, nonce.concat([(i >>> 24) & 255, (i >>> 16) & 255, (i >>> 8) & 255, i & 255]));
    for (let j = 0; j < blk.length && out.length < n; j++) out.push(blk[j]);
  }
  return out;
}

function vaultTag(keys, slot, nonce, ct) {
  return vaultMacBytes(keys.Kmac, utf8Bytes('iigs2|' + slot + '|').concat(nonce, ct));
}

function vaultSeal(slot, o, keys) {
  if (!keys || typeof keys !== 'object' || !keys.Kenc || !keys.Kmac) throw new Error('ключи сейчас не сохраняются');
  const r = vaultRandom(16);
  if (!r) throw new Error(VAULT_NORAND_ERR);
  const src = (o && typeof o === 'object') ? o : {};
  const nonce = Array.from(r);
  const pt = utf8Bytes(JSON.stringify({
    k: String(src.k == null ? '' : src.k),
    h: String(src.h == null ? '' : src.h).toLowerCase(),
    s: String(src.s == null ? '' : src.s),
    t: Date.now()
  }));
  const ks = vaultStream(keys.Kenc, nonce, pt.length);
  const ct = [];
  for (let i = 0; i < pt.length; i++) ct.push(pt[i] ^ ks[i]);
  return VAULT_PFX + vaultB64(nonce.concat(ct, vaultTag(keys, String(slot), nonce, ct)));
}

function vaultOpen(slot, seal, keys) {
  try {
    if (!keys || typeof keys !== 'object' || !keys.Kenc || !keys.Kmac) return null;
    if (typeof slot !== 'string' || typeof seal !== 'string') return null;
    if (seal.indexOf(VAULT_PFX) !== 0 || seal.length > VAULT_SEAL_MAX) return null;
    const raw = vaultUnb64(seal.slice(VAULT_PFX.length));
    if (!raw || raw.length < 16 + 2 + 32) return null;
    const nonce = raw.slice(0, 16);
    const ct = raw.slice(16, raw.length - 32);
    const tag = raw.slice(raw.length - 32);
    const want = vaultTag(keys, slot, nonce, ct);
    let d = 0;
    for (let i = 0; i < 32; i++) d |= want[i] ^ tag[i];
    if (d !== 0) return null;
    const ks = vaultStream(keys.Kenc, nonce, ct.length);
    const pt = [];
    for (let i = 0; i < ct.length; i++) pt.push(ct[i] ^ ks[i]);
    const o = JSON.parse(vaultUtf8(pt));
    if (!o || typeof o !== 'object' || typeof o.k !== 'string' || typeof o.h !== 'string' || typeof o.s !== 'string') return null;
    return { k: o.k, h: o.h, s: o.s, t: (typeof o.t === 'number' && isFinite(o.t)) ? o.t : 0 };
  } catch (e) {
    return null;
  }
}

function vaultSealOf(x) {
  return (typeof x === 'string' && x.indexOf(VAULT_PFX) === 0) ? x : '';
}

function vaultStr(x) {
  return (typeof x === 'string' && x.trim()) ? x : '';
}

function vaultMetaSeals(meta) {
  const out = { api: '', pw: '', presets: {}, pwPresets: {} };
  const s = (meta && typeof meta === 'object' && meta.seals && typeof meta.seals === 'object') ? meta.seals : null;
  if (!s) return out;
  out.api = vaultSealOf(s.api);
  out.pw = vaultSealOf(s.pw);
  for (const m of ['presets', 'pwPresets']) {
    const src = s[m];
    if (!src || typeof src !== 'object' || Array.isArray(src)) continue;
    for (const nm of Object.keys(src)) if (vaultSealOf(src[nm])) out[m][nm] = src[nm];
  }
  return out;
}

async function vaultSnap() {
  const out = { err: false, ready: false, nulls: 0 };
  const names = { cfg: 'iig_cfg', presets: 'iig_presets', presetsBak: 'iig_presets_bak', pw: 'iig_pw_presets', pwBak: 'iig_pw_presets_bak', meta: VAULT_VAR };
  let seen = false;
  for (const k of Object.keys(names)) {
    let v;
    try {
      v = await tavo.get(names[k], 'global');
    } catch (e) {
      out[k] = null;
      out.err = true;
      continue;
    }
    const isList = k === 'presets' || k === 'presetsBak' || k === 'pw' || k === 'pwBak';
    if (v === null) {
      out.nulls++;
      if (isList) out.nullLists = (out.nullLists || 0) + 1;
    }
    const ok = isList ? Array.isArray(v) : (!!v && typeof v === 'object' && !Array.isArray(v));
    if (ok) seen = true;
    out[k] = ok ? v : null;
  }
  if (out.err) return out;
  if (seen) S._vaultStoreOk = 1;
  if (out.nulls && !S._vaultStoreOk) {
    const cana = 'v' + Date.now() + Math.random().toString(36).slice(2, 8);
    let good = false;
    try {
      await tavo.set(VAULT_CANARY, cana, 'global');
      good = (await tavo.get(VAULT_CANARY, 'global')) === cana;
    } catch (e) {
      good = false;
    }
    if (good) S._vaultStoreOk = 1;
  }
  out.ready = !out.nulls || !!S._vaultStoreOk;
  if (!out.ready) return out;
  out.copy = await vaultCopyRead();
  return out;
}

async function vaultCopyRead() {
  const f = vaultFile();
  if (!f) return undefined;
  const gone = function () {
    if (!S._vaultFsAt) S._vaultFsAt = Date.now();
    if (S._vaultCopyFile === null) return null;
    if (!S._vaultCopyFile) {
      S._vaultCopyNone = (S._vaultCopyNone || 0) + 1;
      if (S._vaultCopyNone < 2) return undefined;
      S._vaultCopyFile = null;
      return null;
    }
    S._vaultCopyGone = (S._vaultCopyGone || 0) + 1;
    if (S._vaultCopyGone < 3) return undefined;
    S._vaultCopyFile = null;
    return null;
  };
  try {
    if (typeof f.exists === 'function' && !(await f.exists(VAULT_SEALS_FILE, { scope: 'global' }))) return gone();
    const t = vaultTxt(await f.load(VAULT_SEALS_FILE, { scope: 'global' }));
    if (!t) return gone();
    const o = JSON.parse(t);
    if (!o || typeof o !== 'object' || Array.isArray(o)) return undefined;
    S._vaultCopyFile = o;
    S._vaultCopyGone = 0;
    S._vaultCopyNone = 0;
    S._vaultFsOk = 1;
    return o;
  } catch (e) {
    return undefined;
  }
}

function vaultCopyOf(snap) {
  if (snap && snap.copy) return vaultMetaSeals({ seals: snap.copy });
  if (snap && snap.copy === undefined && S._vaultCopy) return S._vaultCopy;
  return vaultMetaSeals(snap && snap.meta);
}

function vaultCopyMerge(base, live, keys) {
  const b = vaultMetaSeals({ seals: base || {} });
  const l = vaultMetaSeals({ seals: live || {} });
  const out = { api: l.api || (vaultOpen('cfg.api', b.api, keys) ? b.api : ''), pw: l.pw || (vaultOpen('cfg.pw', b.pw, keys) ? b.pw : ''), presets: {}, pwPresets: {} };
  for (const m of [['presets', 'preset:'], ['pwPresets', 'pwpreset:']]) {
    for (const nm of Object.keys(b[m[0]])) if (vaultOpen(m[1] + nm, b[m[0]][nm], keys)) out[m[0]][nm] = b[m[0]][nm];
    for (const nm of Object.keys(l[m[0]])) out[m[0]][nm] = l[m[0]][nm];
  }
  return out;
}

async function vaultCopyPut(seals) {
  const f = vaultFile();
  if (!f) return null;
  const src = seals || {};
  const o = { v: 2, api: vaultSealOf(src.api), pw: vaultSealOf(src.pw), presets: {}, pwPresets: {}, at: Date.now() };
  for (const m of ['presets', 'pwPresets']) {
    const x = src[m];
    if (x && typeof x === 'object') for (const nm of Object.keys(x)) if (vaultSealOf(x[nm])) o[m][nm] = x[nm];
  }
  try {
    await f.save(VAULT_SEALS_FILE, JSON.stringify(o), { scope: 'global' });
  } catch (e) {
    return null;
  }
  S._vaultCopyFile = o;
  return o;
}

async function vaultCopySync(snap, live, keys) {
  if (!snap || snap.copy === undefined) return;
  const want = vaultCopyMerge(snap.copy, live, keys);
  if (snap.copy && vaultSealsSame(want, snap.copy)) return;
  snap.copy = (await vaultCopyPut(want)) || snap.copy;
}

function vaultSealsLive(snap, keys, base) {
  const b = base || { api: '', pw: '', presets: {}, pwPresets: {} };
  const out = { api: b.api || '', pw: b.pw || '', presets: Object.assign({}, b.presets), pwPresets: Object.assign({}, b.pwPresets) };
  const c = snap && snap.cfg;
  if (c) {
    out.api = vaultOpen('cfg.api', vaultSealOf(c.apiKeySeal), keys) ? c.apiKeySeal : '';
    out.pw = vaultOpen('cfg.pw', vaultSealOf(c.pwKeySeal), keys) ? c.pwKeySeal : '';
  }
  for (const L of VAULT_LISTS) {
    if (!L.main || !snap || !snap[L.snap]) continue;
    const m = {};
    for (const it of snap[L.snap]) {
      if (!it || typeof it !== 'object') continue;
      const nm = String(it.name == null ? '' : it.name);
      if (vaultOpen(L.slot + nm, vaultSealOf(it[L.seal]), keys)) m[nm] = it[L.seal];
    }
    out[L.map] = m;
  }
  return out;
}

function vaultSealsSame(a, b) {
  const n = function (x) {
    const o = vaultMetaSeals({ seals: x || {} });
    const srt = function (m) {
      const r = {};
      for (const k of Object.keys(m).sort()) r[k] = m[k];
      return r;
    };
    return JSON.stringify([o.api, o.pw, srt(o.presets), srt(o.pwPresets)]);
  };
  return n(a) === n(b);
}

function vaultAnyOpens(snap, keys) {
  if (!snap || !keys) return false;
  const c = snap.cfg;
  if (c && (vaultOpen('cfg.api', vaultSealOf(c.apiKeySeal), keys) || vaultOpen('cfg.pw', vaultSealOf(c.pwKeySeal), keys))) return true;
  for (const L of VAULT_LISTS) {
    if (!L.main || !snap[L.snap]) continue;
    for (const it of snap[L.snap]) {
      if (it && typeof it === 'object' && vaultOpen(L.slot + String(it.name == null ? '' : it.name), vaultSealOf(it[L.seal]), keys)) return true;
    }
  }
  for (const ms of [vaultMetaSeals(snap.meta), snap.copy ? vaultMetaSeals({ seals: snap.copy }) : null]) {
    if (!ms) continue;
    if (vaultOpen('cfg.api', ms.api, keys) || vaultOpen('cfg.pw', ms.pw, keys)) return true;
    for (const nm of Object.keys(ms.presets)) if (vaultOpen('preset:' + nm, ms.presets[nm], keys)) return true;
    for (const nm of Object.keys(ms.pwPresets)) if (vaultOpen('pwpreset:' + nm, ms.pwPresets[nm], keys)) return true;
  }
  return false;
}

async function vaultFixFp(snap, keys) {
  if (!snap || snap.err || !snap.ready || !keys || !snap.meta) return;
  if (!snap.meta.fp || snap.meta.fp === keys.fp) return;
  if (!vaultAnyOpens(snap, keys) && vaultAnySeals(snap)) return;
  const meta = Object.assign({}, snap.meta, { v: 2, fp: keys.fp });
  await vaultMetaPut(meta);
  snap.meta = meta;
}

function vaultAnySeals(snap) {
  if (!snap) return false;
  for (const ms of [vaultMetaSeals(snap.meta), vaultMetaSeals({ seals: snap.copy || {} })]) {
    if (ms.api || ms.pw || Object.keys(ms.presets).length || Object.keys(ms.pwPresets).length) return true;
  }
  if (snap.cfg && (vaultSealOf(snap.cfg.apiKeySeal) || vaultSealOf(snap.cfg.pwKeySeal))) return true;
  for (const L of VAULT_LISTS) {
    if (!L.main || !snap[L.snap]) continue;
    for (const p of snap[L.snap]) if (p && typeof p === 'object' && vaultSealOf(p[L.seal])) return true;
  }
  return false;
}

function vaultHasOpen(snap) {
  if (!snap) return false;
  if (snap.cfg && (vaultStr(snap.cfg.apiKey) || vaultStr(snap.cfg.pwKey))) return true;
  for (const L of VAULT_LISTS) {
    if (!L.main || !snap[L.snap]) continue;
    for (const p of snap[L.snap]) if (p && typeof p === 'object' && vaultStr(p[L.key])) return true;
  }
  return false;
}

function vaultNote(snap) {
  if (!snap || snap.err || !snap.ready) return;
  S._vaultMeta = snap.meta;
  if (snap.copy !== undefined || !S._vaultCopy) S._vaultCopy = vaultCopyOf(snap);
  S._vaultHas = vaultAnySeals(snap);
  const keys = vaultKeys(S._vaultSecret || '');
  S._vaultOpens = keys ? vaultAnyOpens(snap, keys) : false;
}

function vaultKeep(s) {
  S._vaultSecret = s;
  S._vaultSecretAt = Date.now();
  return s;
}

function vaultNofs() {
  S._vaultFs = 'nofs';
  return vaultKeep('');
}

function vaultTxt(x) {
  if (x == null) return '';
  try {
    if (typeof Uint8Array !== 'undefined' && x instanceof Uint8Array) return vaultUtf8(Array.from(x)).trim();
    if (typeof ArrayBuffer !== 'undefined' && x instanceof ArrayBuffer) return vaultUtf8(Array.from(new Uint8Array(x))).trim();
  } catch (e) {
    return '';
  }
  return String(x).trim();
}

function vaultFile() {
  const f = (typeof tavo !== 'undefined' && tavo && tavo.file && typeof tavo.file === 'object') ? tavo.file : null;
  if (!f || typeof f.load !== 'function' || typeof f.save !== 'function') return null;
  return f;
}

async function vaultCreate() {
  if (S._vaultMaking) return S._vaultMaking;
  S._vaultMaking = (async function () {
    const f = vaultFile();
    if (!f) return vaultNofs();
    const r = vaultRandom(32);
    if (!r) {
      S._vaultNoRand = 1;
      return vaultKeep('');
    }
    S._vaultNoRand = 0;
    try {
      if (typeof f.exists === 'function' && (await f.exists(VAULT_FILE, { scope: 'global' }))) {
        const old = vaultTxt(await f.load(VAULT_FILE, { scope: 'global' }));
        if (vaultHexOk(old)) {
          S._vaultFs = 'ok';
          S._vaultFsOk = 1;
          return vaultKeep(old);
        }
      }
      await f.save(VAULT_FILE, vaultHex(r), { scope: 'global' });
      const back = vaultTxt(await f.load(VAULT_FILE, { scope: 'global' }));
      if (!vaultHexOk(back)) return vaultNofs();
      S._vaultFs = 'ok';
      return vaultKeep(back);
    } catch (e) {
      return vaultNofs();
    }
  })();
  try {
    return await S._vaultMaking;
  } finally {
    S._vaultMaking = null;
  }
}

async function vaultSecret(force) {
  const now = Date.now();
  const cur = S._vaultSecret || '';
  if (cur && !force) return cur;
  if (force !== 'now' && S._vaultSecretAt && now - S._vaultSecretAt < (cur ? VAULT_FILE_MS : VAULT_MISS_MS)) return cur;
  S._vaultSecretAt = now;
  const f = vaultFile();
  if (!f) return cur || vaultNofs();
  let has = true;
  try {
    if (typeof f.exists === 'function') has = !!(await f.exists(VAULT_FILE, { scope: 'global' }));
  } catch (e) {
    return cur || vaultNofs();
  }
  let txt = '';
  if (has) {
    try {
      txt = vaultTxt(await f.load(VAULT_FILE, { scope: 'global' }));
    } catch (e) {
      return cur || vaultNofs();
    }
  }
  if (vaultHexOk(txt)) {
    S._vaultFs = 'ok';
    S._vaultFsOk = 1;
    S._vaultMissAt = 0;
    return vaultKeep(txt);
  }
  if (cur) return cur;
  S._vaultFs = 'ok';
  if (!S._vaultFsAt) S._vaultFsAt = now;
  if (!has && !S._vaultMissAt) S._vaultMissAt = now;
  return vaultKeep('');
}

async function vaultMissing() {
  const f = vaultFile();
  if (!f) return false;
  try {
    if (typeof f.exists === 'function' && (await f.exists(VAULT_FILE, { scope: 'global' }))) return false;
    const t = vaultTxt(await f.load(VAULT_FILE, { scope: 'global' }));
    return !t;
  } catch (e) {
    return false;
  }
}

function vaultFsSettled() {
  if (S._vaultFsOk) return true;
  return !!(S._vaultFsAt && Date.now() - S._vaultFsAt >= VAULT_FS_WAIT);
}

function vaultListsPending(snap) {
  if (!snap || !snap.nullLists) {
    S._vaultNullSeen = 0;
    return false;
  }
  S._vaultNullSeen = (S._vaultNullSeen || 0) + 1;
  return S._vaultNullSeen < VAULT_NULL_MAX;
}

async function vaultMayCreate(snap) {
  if (S._vaultSecret || S._vaultFs !== 'ok' || S._vaultMade) return false;
  if (!snap || !snap.ready || snap.copy === undefined || vaultAnySeals(snap)) return false;
  if (snap.meta && vaultStr(snap.meta.fp)) return false;
  if (!vaultFsSettled()) {
    S._vaultWaitAt = (S._vaultFsAt || Date.now()) + VAULT_FS_WAIT;
    return false;
  }
  const now = Date.now();
  if (!S._vaultMissAt) {
    S._vaultMissAt = now;
    return false;
  }
  if (now - S._vaultMissAt < VAULT_MISS_MS) return false;
  if (!(await vaultMissing())) {
    S._vaultMissAt = 0;
    S._vaultSecretAt = 0;
    return false;
  }
  return true;
}

async function vaultInit() {
  const s = await vaultSecret('now');
  if (s || S._vaultFs !== 'ok') return s;
  const snap = await vaultSnap();
  if (!snap.ready) return '';
  vaultNote(snap);
  if (vaultAnySeals(snap)) return '';
  if (!(await vaultMissing())) return '';
  S._vaultMade = 1;
  return vaultCreate();
}

function vaultState() {
  const fp = vaultFp();
  if (S._vaultFs === 'nofs') return { mode: 'nofs', fp: fp };
  const meta = (S._vaultMeta && typeof S._vaultMeta === 'object') ? S._vaultMeta : null;
  if (S._vaultHas && (!fp || (meta && meta.fp && meta.fp !== fp && !S._vaultOpens))) return { mode: 'locked', fp: fp };
  if (meta && meta.sealedBoot && !meta.committedAt) return { mode: 'sealed', fp: fp };
  return { mode: 'on', fp: fp };
}

function vaultArmed() {
  if (vaultState().mode !== 'on') return false;
  const meta = S._vaultMeta;
  return !!(meta && typeof meta === 'object' && meta.committedAt);
}

async function cfgWriteSafe(obj) {
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return;
  if (S._vaultMode == null && !S._vaultBusy) {
    try {
      await vaultReady(true);
    } catch (e) {}
  }
  const o = Object.assign({}, obj);
  if (vaultArmed()) {
    delete o.apiKey;
    delete o.pwKey;
  }
  await tavo.set('iig_cfg', o, 'global');
  S._cfgCache = null;
}

function vaultSealsOf(snap, keys) {
  const out = { presets: {}, pwPresets: {} };
  const ms = vaultCopyOf(snap);
  const c = snap && snap.cfg;
  const a = (c && vaultOpen('cfg.api', vaultSealOf(c.apiKeySeal), keys)) ? c.apiKeySeal : (vaultOpen('cfg.api', ms.api, keys) ? ms.api : '');
  const p = (c && vaultOpen('cfg.pw', vaultSealOf(c.pwKeySeal), keys)) ? c.pwKeySeal : (vaultOpen('cfg.pw', ms.pw, keys) ? ms.pw : '');
  if (a) out.api = a;
  if (p) out.pw = p;
  for (const L of VAULT_LISTS) {
    if (!L.main || !snap || !snap[L.snap]) continue;
    for (const it of snap[L.snap]) {
      if (!it || typeof it !== 'object') continue;
      const nm = String(it.name == null ? '' : it.name);
      if (vaultOpen(L.slot + nm, vaultSealOf(it[L.seal]), keys)) out[L.map][nm] = it[L.seal];
    }
  }
  if (!Object.keys(out.presets).length) delete out.presets;
  if (!Object.keys(out.pwPresets).length) delete out.pwPresets;
  return out;
}

async function vaultMetaPut(meta) {
  await tavo.set(VAULT_VAR, meta, 'global');
  S._vaultMeta = meta;
}

async function vaultStageA(snap, keys) {
  S._vaultStageA = BOOT_ID;
  const seals = { presets: {}, pwPresets: {} };
  const meta = { v: 2, fp: keys.fp, sealedBoot: BOOT_ID, sealedAt: Date.now(), committedAt: 0, seals: seals };
  const ms = vaultCopyOf(snap);
  const pick = function (slot, own, cp) {
    for (const sl of [own, cp]) if (vaultOpen(slot, vaultSealOf(sl), keys)) return sl;
    return '';
  };
  let cfgNew = null;
  let cfgCh = false;
  if (snap.cfg) {
    const c = Object.assign({}, snap.cfg);
    const m = Object.assign({}, DEFAULTS, c);
    if (cfgTaintFields(c).length) {
      try {
        await healOpenKeys(c);
      } catch (e) {}
    }
    const a = vaultStr(c.apiKey);
    if (a) {
      const had = pick('cfg.api', c.apiKeySeal, ms.api);
      const nv = had || vaultSeal('cfg.api', { k: a, h: secApiHost(m), s: String(m.apiStyle || DEFAULTS.apiStyle || '') }, keys);
      if (nv !== c.apiKeySeal) cfgCh = true;
      c.apiKeySeal = nv;
      seals.api = nv;
    }
    const p = vaultStr(c.pwKey);
    if (p) {
      const had = pick('cfg.pw', c.pwKeySeal, ms.pw);
      const nv = had || vaultSeal('cfg.pw', { k: p, h: secPwHost(m), s: 'pw' }, keys);
      if (nv !== c.pwKeySeal) cfgCh = true;
      c.pwKeySeal = nv;
      seals.pw = nv;
    }
    cfgNew = c;
  }
  const lists = {};
  for (const L of VAULT_LISTS) {
    if (!L.main || !snap[L.snap]) continue;
    let ch = false;
    const arr = snap[L.snap].map(function (it) {
      if (!it || typeof it !== 'object') return it;
      const k = vaultStr(it[L.key]);
      if (!k) return it;
      const nm = String(it.name == null ? '' : it.name);
      const had = pick(L.slot + nm, it[L.seal], ms[L.map][nm]);
      if (had) {
        seals[L.map][nm] = had;
        if (had === it[L.seal]) return it;
        const o2 = Object.assign({}, it);
        o2[L.seal] = had;
        ch = true;
        return o2;
      }
      const o = Object.assign({}, it);
      const isPw = L.key === 'pwKey';
      o[L.seal] = vaultSeal(L.slot + nm, { k: k, h: isPw ? secPwHost(o) : secApiHost(o), s: isPw ? 'pw' : String(o.apiStyle || DEFAULTS.apiStyle || '') }, keys);
      seals[L.map][nm] = o[L.seal];
      ch = true;
      return o;
    });
    lists[L.snap] = { arr: arr, ch: ch };
  }
  await vaultCopySync(snap, seals, keys);
  if (cfgNew) {
    if (cfgCh) await cfgWriteSafe(cfgNew);
    snap.cfg = cfgNew;
  }
  for (const L of VAULT_LISTS) {
    const x = lists[L.snap];
    if (!x) continue;
    if (x.ch) await tavo.set(L.name, x.arr, 'global');
    snap[L.snap] = x.arr;
  }
  meta.sealedAt = Date.now();
  await vaultMetaPut(meta);
  snap.meta = meta;
  S._vaultHas = true;
  S._vaultStagedA = 1;
  return true;
}

async function vaultStageB(snap, keys) {
  const ms = vaultCopyOf(snap);
  let foreign = 0;
  const own = function (slot, seal) {
    const s = vaultSealOf(seal);
    return (s && vaultOpen(slot, s, keys)) ? s : '';
  };
  const judge = function (slot, seal, open) {
    if (!open) return;
    const o = vaultOpen(slot, vaultSealOf(seal), keys);
    if (!o || o.k !== open) foreign++;
  };
  if (snap.cfg) {
    const cfg = Object.assign({}, snap.cfg);
    for (const f of [['apiKeySeal', 'cfg.api', 'api', 'apiKey'], ['pwKeySeal', 'cfg.pw', 'pw', 'pwKey']]) {
      if (!own(f[1], cfg[f[0]]) && ms[f[2]] && vaultOpen(f[1], ms[f[2]], keys)) cfg[f[0]] = ms[f[2]];
      judge(f[1], cfg[f[0]], vaultStr(cfg[f[3]]));
      delete cfg[f[3]];
    }
    if (JSON.stringify(cfg) !== JSON.stringify(snap.cfg)) await cfgWriteSafe(cfg);
    snap.cfg = cfg;
  }
  for (const L of VAULT_LISTS) {
    const arr = snap[L.snap];
    if (!arr) continue;
    const out = arr.map(function (it) {
      if (!it || typeof it !== 'object') return it;
      const nm = String(it.name == null ? '' : it.name);
      const o = Object.assign({}, it);
      if (L.main && !own(L.slot + nm, o[L.seal]) && ms[L.map][nm] && vaultOpen(L.slot + nm, ms[L.map][nm], keys)) o[L.seal] = ms[L.map][nm];
      if (L.main) judge(L.slot + nm, o[L.seal], vaultStr(o[L.key]));
      delete o[L.key];
      return o;
    });
    if (JSON.stringify(out) !== JSON.stringify(arr)) await tavo.set(L.name, out, 'global');
    snap[L.snap] = out;
  }
  if (foreign) elog('ключи', VAULT_FOREIGN);
  await vaultCopySync(snap, vaultSealsLive(snap, keys, ms), keys);
  const old = (snap.meta && typeof snap.meta === 'object') ? snap.meta : {};
  const meta = { v: 2, fp: keys.fp, sealedBoot: old.sealedBoot || '', sealedAt: old.sealedAt || 0, committedAt: Date.now(), seals: vaultSealsOf(snap, keys) };
  await vaultMetaPut(meta);
  snap.meta = meta;
  return true;
}

async function vaultEnsureMeta(snap, keys) {
  if (!keys || snap.err || !snap.ready) return;
  const meta = snap.meta;
  if (meta && meta.v === 2 && meta.fp === keys.fp) return;
  if (meta && meta.fp && meta.fp !== keys.fp) {
    if (vaultAnySeals(snap)) return;
  }
  if (meta && meta.sealedBoot && !meta.committedAt) return;
  if (vaultHasOpen(snap) && !(meta && meta.committedAt)) return;
  const m2 = { v: 2, fp: keys.fp, committedAt: (meta && meta.committedAt) || Date.now(), seals: vaultSealsOf(snap, keys) };
  await vaultMetaPut(m2);
  snap.meta = m2;
}

function vaultOpenNoSeal(snap, keys) {
  if (!snap || !keys) return false;
  const ms = vaultCopyOf(snap);
  const c = snap.cfg;
  if (c) {
    if (vaultStr(c.apiKey) && !vaultOpen('cfg.api', vaultSealOf(c.apiKeySeal), keys) && !vaultOpen('cfg.api', ms.api, keys)) return true;
    if (vaultStr(c.pwKey) && !vaultOpen('cfg.pw', vaultSealOf(c.pwKeySeal), keys) && !vaultOpen('cfg.pw', ms.pw, keys)) return true;
  }
  for (const L of VAULT_LISTS) {
    if (!L.main || !snap[L.snap]) continue;
    for (const it of snap[L.snap]) {
      if (!it || typeof it !== 'object' || !vaultStr(it[L.key])) continue;
      const nm = String(it.name == null ? '' : it.name);
      if (!vaultOpen(L.slot + nm, vaultSealOf(it[L.seal]), keys) && !vaultOpen(L.slot + nm, ms[L.map][nm], keys)) return true;
    }
  }
  return false;
}

function vaultRetrySoon(ms) {
  if (S._vaultRetryT) return;
  S._vaultRetryT = setTimeout(function () {
    S._vaultRetryT = null;
    vaultReady(true).catch(function () {});
  }, ms);
}

async function vaultPass(force) {
  const md0 = vaultState().mode;
  let secret = await vaultSecret(force === 'now' ? 'now' : (!!force || !S._vaultSecret || md0 === 'locked' || md0 === 'nofs'));
  let keys = vaultKeys(secret);
  const snap = await vaultSnap();
  if (!snap.ready) return false;
  vaultNote(snap);
  if (!secret && S._vaultFs === 'ok') {
    if (!(await vaultMayCreate(snap))) return false;
    S._vaultMade = 1;
    secret = await vaultCreate();
    keys = vaultKeys(secret);
    vaultNote(snap);
  }
  const st = vaultState();
  let ok = true;
  if (keys && (st.mode === 'on' || st.mode === 'sealed')) {
    try {
      await vaultFixFp(snap, keys);
      const meta = (snap.meta && typeof snap.meta === 'object') ? snap.meta : null;
      const done = !!(meta && meta.committedAt);
      const held = !!(meta && meta.sealedBoot && !meta.committedAt);
      if (snap.copy === undefined && !done) {
        vaultRetrySoon(VAULT_TTL);
        ok = false;
      } else if (held && meta.sealedBoot === BOOT_ID && !vaultOpenNoSeal(snap, keys)) {
        ok = true;
      } else if (!meta && S._vaultStageA === BOOT_ID && vaultHasOpen(snap)) {
        ok = !vaultListsPending(snap);
        if (ok) await vaultStageA(snap, keys);
      } else if (!done && vaultAnyOpens(snap, keys)) {
        ok = vaultListsPending(snap) ? false : await vaultStageB(snap, keys);
      } else if (!done && vaultHasOpen(snap)) {
        if ((!snap.copy && !vaultFsSettled()) || vaultListsPending(snap)) {
          if (!vaultFsSettled()) S._vaultWaitAt = (S._vaultFsAt || Date.now()) + VAULT_FS_WAIT;
          ok = false;
        } else {
          await vaultStageA(snap, keys);
        }
      } else {
        await vaultEnsureMeta(snap, keys);
      }
      if (ok) await vaultGuard(snap, keys, vaultArmed());
      if (snap.copy === undefined) vaultRetrySoon(VAULT_TTL);
    } catch (e) {
      ok = false;
      elog('ключи', secMask((e && e.message) ? e.message : 'ключи не сохранились'));
    }
  }
  vaultNote(snap);
  S._vaultOpenCache = vaultCacheBuild(snap, keys);
  return ok;
}

function vaultCfgPlan(c, keys, ms, armed) {
  const out = Object.assign({}, c);
  let need = false;
  let foreign = 0;
  for (const f of [['apiKey', 'apiKeySeal', 'cfg.api', 'api'], ['pwKey', 'pwKeySeal', 'cfg.pw', 'pw']]) {
    const seal = vaultSealOf(out[f[1]]);
    let o = seal ? vaultOpen(f[2], seal, keys) : null;
    if (!o && ms[f[3]]) {
      const o2 = vaultOpen(f[2], ms[f[3]], keys);
      if (o2) {
        out[f[1]] = ms[f[3]];
        o = o2;
        need = true;
      }
    }
    if (armed && vaultStr(out[f[0]])) {
      if (!o || o.k !== out[f[0]]) foreign++;
      delete out[f[0]];
      need = true;
    }
  }
  return { need: need, out: out, foreign: foreign };
}

async function vaultGuardCfg(c, keys, ms, armed) {
  if (!c || typeof c !== 'object' || !keys) return c;
  if (!vaultCfgPlan(c, keys, ms, armed).need) return c;
  let fresh = null;
  try {
    fresh = await tavo.get('iig_cfg', 'global');
  } catch (e) {
    return c;
  }
  if (!fresh || typeof fresh !== 'object' || Array.isArray(fresh)) return c;
  const q = vaultCfgPlan(fresh, keys, ms, armed);
  if (!q.need) return fresh;
  await cfgWriteSafe(q.out);
  if (q.foreign) elog('ключи', VAULT_FOREIGN);
  return q.out;
}

async function vaultWatch(c) {
  if (!c || typeof c !== 'object' || S._vaultWatched === c) return;
  S._vaultWatched = c;
  if (!S._vaultMigDone) return;
  const keys = vaultKeys(S._vaultSecret || '');
  if (!keys) return;
  const md = vaultState().mode;
  if (md !== 'on' && md !== 'sealed') return;
  const mem = S._vaultCopy || vaultMetaSeals(null);
  let miss = false;
  for (const f of [['apiKeySeal', 'cfg.api', 'api'], ['pwKeySeal', 'cfg.pw', 'pw']]) {
    if (vaultOpen(f[1], vaultSealOf(c[f[0]]), keys)) continue;
    if (vaultSealOf(c[f[0]]) || mem[f[2]]) miss = true;
  }
  let ms = vaultMetaSeals(null);
  if (miss) {
    const cp = await vaultCopyRead();
    if (cp !== undefined) {
      ms = vaultMetaSeals({ seals: cp || {} });
      S._vaultCopy = ms;
    } else {
      vaultRetrySoon(VAULT_TTL);
    }
  }
  await vaultGuardCfg(c, keys, ms, vaultArmed());
}

async function vaultGuard(snap, keys, armed) {
  if (!snap || snap.err || !snap.ready || !keys) return;
  const ms = snap.copy === undefined ? vaultMetaSeals(null) : vaultCopyOf(snap);
  const after = Object.assign({}, snap);
  let foreign = 0;
  if (snap.cfg) after.cfg = await vaultGuardCfg(snap.cfg, keys, ms, armed);
  for (const L of VAULT_LISTS) {
    const arr = snap[L.snap];
    if (!arr) continue;
    let ch = false;
    const out = arr.map(function (it) {
      if (!it || typeof it !== 'object') return it;
      const nm = String(it.name == null ? '' : it.name);
      let o = null;
      let cp = null;
      const seal = vaultSealOf(it[L.seal]);
      if (seal) o = vaultOpen(L.slot + nm, seal, keys);
      if (L.main && !o && ms[L.map][nm]) {
        const o2 = vaultOpen(L.slot + nm, ms[L.map][nm], keys);
        if (o2) {
          cp = Object.assign({}, it);
          cp[L.seal] = ms[L.map][nm];
          o = o2;
        }
      }
      if (armed && vaultStr(it[L.key])) {
        if (!o || o.k !== it[L.key]) foreign++;
        cp = cp || Object.assign({}, it);
        delete cp[L.key];
      }
      if (!cp) return it;
      ch = true;
      return cp;
    });
    if (ch) await tavo.set(L.name, out, 'global');
    after[L.snap] = out;
  }
  if (foreign) elog('ключи', VAULT_FOREIGN);
  for (const k of ['cfg', 'presets', 'presetsBak', 'pw', 'pwBak']) if (k in after) snap[k] = after[k];
  await vaultCopySync(snap, vaultSealsLive(snap, keys, ms), keys);
}

function vaultOpenFirst(slot, list, keys) {
  for (const s of list) {
    const o = vaultOpen(slot, vaultSealOf(s), keys);
    if (o) return o;
  }
  return null;
}

function vaultCacheBuild(snap, keys) {
  const oc = { at: Date.now(), presets: {}, pwPresets: {} };
  if (!keys || !snap || snap.err) return oc;
  const ms = vaultCopyOf(snap);
  for (const L of VAULT_LISTS) {
    if (!L.main || !snap[L.snap]) continue;
    for (const it of snap[L.snap]) {
      if (!it || typeof it !== 'object') continue;
      const nm = String(it.name == null ? '' : it.name);
      const o = vaultOpenFirst(L.slot + nm, [it[L.seal], ms[L.map][nm]], keys);
      if (o && o.k) oc[L.map][nm] = o.k;
    }
  }
  return oc;
}

async function vaultReady(force) {
  const t = Date.now();
  if (!force && S._vaultOpenCache && t < (S._vaultNextAt || 0)) return;
  while (S._vaultBusy) {
    try {
      await S._vaultBusy;
    } catch (e) {}
    if ((S._vaultPassAt || 0) >= t) return;
  }
  const p = (async function () {
    const from = Date.now();
    let ok = false;
    try {
      ok = await vaultPass(force);
    } catch (e) {
      ok = false;
    }
    if (ok) {
      S._vaultMigDone = true;
      S._vaultTries = 0;
      const md = vaultState().mode;
      S._vaultNextAt = Date.now() + ((md === 'locked' || md === 'nofs') ? VAULT_FILE_MS : VAULT_PASS_MS);
    } else {
      const n = (S._vaultTries || 0) + 1;
      S._vaultTries = n;
      let pause = n <= 20 ? Math.min(400 + 400 * n, 30000) : VAULT_PASS_MS;
      if (S._vaultWaitAt && S._vaultWaitAt > Date.now()) pause = Math.min(pause, S._vaultWaitAt - Date.now() + 50);
      S._vaultWaitAt = 0;
      S._vaultNextAt = Date.now() + pause;
      if (n <= 20 && !S._vaultRetryT) {
        S._vaultRetryT = setTimeout(function () {
          S._vaultRetryT = null;
          vaultReady(true).catch(function () {});
        }, pause + 50);
      }
    }
    if (!S._vaultOpenCache) S._vaultOpenCache = { at: from, presets: {}, pwPresets: {} };
    S._vaultPassAt = from;
  })();
  S._vaultBusy = p;
  try {
    return await p;
  } finally {
    if (S._vaultBusy === p) S._vaultBusy = null;
  }
}

function vaultPreHost(c, kind, key) {
  const m = secHosts();
  if (!m.seen || typeof m.seen !== 'object') m.seen = {};
  const k = String(key == null ? '' : key).trim();
  if (!k) return '';
  if (!m.seen[kind + k]) m.seen[kind + k] = (kind === 'a' ? secApiHost(c) : secPwHost(c)) || '-';
  return m.seen[kind + k];
}

function vaultApply(c) {
  const o = Object.assign({}, c);
  const st = vaultState();
  S._vaultMode = st.mode;
  const m = secHosts();
  const keys = vaultKeys(S._vaultSecret || '');
  let ak = '';
  let ah = '';
  let pk = '';
  let ph = '';
  if (st.mode === 'nofs' || st.mode === 'locked') {
    o._vaultErr = st.mode === 'nofs' ? VAULT_NOFS_ERR : VAULT_LOCKED_ERR;
  } else if (!keys) {
    if (S._vaultNoRand) o._vaultErr = VAULT_NORAND_ERR;
    else if (!S._vaultMeta && !S._vaultHas && !S._vaultMigDone) {
      ak = vaultStr(c.apiKey);
      ah = vaultPreHost(c, 'a', ak);
      pk = vaultStr(c.pwKey);
      ph = vaultPreHost(c, 'p', pk);
    }
  } else {
    const ms = S._vaultCopy || vaultMetaSeals(S._vaultMeta);
    const a = vaultOpenFirst('cfg.api', [o.apiKeySeal, ms.api], keys);
    const p = vaultOpenFirst('cfg.pw', [o.pwKeySeal, ms.pw], keys);
    if (a && a.k) {
      ak = a.k;
      ah = a.h || '-';
    }
    if (p && p.k) {
      pk = p.k;
      ph = p.h || '-';
    }
    const sl = st.mode === 'sealed';
    const lostA = !a && !!(vaultSealOf(o.apiKeySeal) || ms.api || (sl && vaultStr(c.apiKey)));
    const lostP = !p && o.pwChat === false && !!(vaultSealOf(o.pwKeySeal) || ms.pw || (sl && vaultStr(c.pwKey)));
    if (lostA || lostP) o._vaultErr = VAULT_LOCKED_ERR;
  }
  o.apiKey = ak;
  o.pwKey = pk;
  m.api = ak.trim();
  m.apiHost = m.api ? ah : '';
  m.pw = pk.trim();
  m.pwHost = m.pw ? ph : '';
  const oc = S._vaultOpenCache;
  if (oc) {
    const vals = function (x) {
      const r = [];
      for (const k in (x || {})) if (typeof x[k] === 'string' && x[k].trim()) r.push(x[k].trim());
      return r;
    };
    S._secPresetKeys = { api: vals(oc.presets), pw: vals(oc.pwPresets) };
  }
  return o;
}

async function vaultHealSeals(out) {
  const keys = vaultKeys(S._vaultSecret || '');
  if (!keys || !out || typeof out !== 'object') return;
  const ms = S._vaultCopy || vaultMetaSeals(S._vaultMeta);
  const plan = [
    { seal: 'apiKeySeal', slot: 'cfg.api', mk: 'api', list: VAULT_LISTS[0], host: secApiHost },
    { seal: 'pwKeySeal', slot: 'cfg.pw', mk: 'pw', list: VAULT_LISTS[2], host: secPwHost }
  ];
  for (const P of plan) {
    if (vaultOpen(P.slot, vaultSealOf(out[P.seal]), keys)) continue;
    if (ms[P.mk] && vaultOpen(P.slot, ms[P.mk], keys)) {
      out[P.seal] = ms[P.mk];
      continue;
    }
    let arr = null;
    try {
      arr = await tavo.get(P.list.name, 'global');
    } catch (e) {}
    if (!Array.isArray(arr)) continue;
    const want = P.host(out);
    const hit = {};
    let one = null;
    for (const it of arr) {
      if (!it || typeof it !== 'object') continue;
      if (P.mk === 'api' && String(it.apiStyle || DEFAULTS.apiStyle) !== String(out.apiStyle || DEFAULTS.apiStyle)) continue;
      const o = vaultOpen(P.list.slot + String(it.name == null ? '' : it.name), vaultSealOf(it[P.list.seal]), keys);
      if (!o || !o.k || !want || o.h !== want) continue;
      if (!hit[o.k]) {
        hit[o.k] = 1;
        one = one ? 'many' : o;
      }
    }
    if (!one || one === 'many') continue;
    try {
      out[P.seal] = vaultSeal(P.slot, { k: one.k, h: one.h, s: one.s }, keys);
    } catch (e) {}
  }
}

async function vaultReset() {
  const snap = await vaultSnap();
  if (snap.err || !snap.ready) return false;
  if (snap.cfg && ('apiKeySeal' in snap.cfg || 'pwKeySeal' in snap.cfg)) {
    const c = Object.assign({}, snap.cfg);
    delete c.apiKeySeal;
    delete c.pwKeySeal;
    await cfgWriteSafe(c);
  }
  for (const L of VAULT_LISTS) {
    const arr = snap[L.snap];
    if (!arr) continue;
    let ch = false;
    const out = arr.map(function (it) {
      if (!it || typeof it !== 'object' || !(L.seal in it)) return it;
      const o = Object.assign({}, it);
      delete o[L.seal];
      ch = true;
      return o;
    });
    if (ch) await tavo.set(L.name, out, 'global');
  }
  const f = vaultFile();
  if (f && typeof f.delete === 'function') {
    try {
      await f.delete(VAULT_FILE, { scope: 'global' });
    } catch (e) {}
  }
  vaultKeep('');
  S._vaultKeysC = null;
  S._vaultMade = 1;
  const secret = await vaultCreate();
  const keys = vaultKeys(secret);
  await vaultMetaPut({ v: 2, fp: keys ? keys.fp : '', committedAt: Date.now(), seals: {} });
  await vaultCopyPut({});
  S._vaultCopy = vaultMetaSeals(null);
  S._vaultMissAt = 0;
  S._vaultHas = false;
  S._vaultOpenCache = null;
  S._cfgCache = null;
  return true;
}

const resolveCfgVault0 = resolveCfg;
resolveCfg = async function () {
  try {
    await vaultReady();
  } catch (e) {}
  const c = await resolveCfgVault0.apply(this, arguments);
  if (!c || typeof c !== 'object') return c;
  try {
    await vaultWatch(c);
  } catch (e) {}
  return vaultApply(c);
};

function cmdKey() {
  const ls = cmdLs();
  if (ls) {
    try {
      let t = ls.getItem(CMD_KEY_LS);
      if (typeof t !== 'string' || !/^[0-9a-f]{48}$/.test(t)) {
        t = secRand();
        ls.setItem(CMD_KEY_LS, t);
        if (ls.getItem(CMD_KEY_LS) !== t) t = '';
      }
      try {
        ls.removeItem('iig_cmd_tok');
      } catch (e) {}
      if (t) return t;
    } catch (e) {}
    return '';
  }
  if (!S._cmdKeyMem) S._cmdKeyMem = secRand();
  return S._cmdKeyMem;
}

function cmdSigOk(c) {
  const k = cmdKey();
  if (!k || typeof c.sig !== 'string' || !/^[0-9a-f]{64}$/.test(c.sig)) return false;
  return hmacHex(k, cmdCanon(c, true)) === c.sig;
}

function cmdFresh(c) {
  if (!c || typeof c !== 'object') return 'не объект';
  const at = c.at;
  if (typeof at !== 'number' || !isFinite(at) || Math.abs(Date.now() - at) > CMD_FRESH_MS) return 'нет свежей метки at';
  return '';
}

function cmdSigned(c) {
  if (typeof c.sig !== 'string' || !c.sig) return '';
  const now = Date.now();
  const seen = S._sigSeen || (S._sigSeen = {});
  for (const k in seen) if (now - seen[k] > CMD_FRESH_MS + 10000) delete seen[k];
  if (seen[c.sig]) return 'повтор подписанной команды';
  if (!cmdSigOk(c)) return 'подпись не сошлась';
  seen[c.sig] = now;
  return 'ok';
}

async function cmdGateImg(c) {
  const f = cmdFresh(c);
  if (f) return f;
  const sg = cmdSigned(c);
  if (sg === 'ok') return '';
  if (sg) return sg;
  const op = String(c.op || '');
  if (op === 'stopall') return '';
  const free = CMD_FREE.indexOf(op) >= 0;
  if (!free && CMD_PAID.indexOf(op) < 0) return 'операция только с подписью';
  if (op === 'regen' && String(c.prompt || '').trim()) return 'свой промпт только с подписью';
  let m = null;
  try {
    m = await msgById(c.id);
  } catch (e) {}
  if (!m || m.id == null) return 'поста нет в текущем чате';
  const now = Date.now();
  if (free) {
    if (op === 'rrsel') return '';
    S._rlFree = (S._rlFree || []).filter(function (t) { return now - t < 60000; });
    if (S._rlFree.length >= CMD_RL_FREE) return 'частота: ' + op + ' не больше ' + CMD_RL_FREE + ' в минуту';
    S._rlFree.push(now);
    return '';
  }
  if (fragLsFresh()) return 'фрагменты видят хранилище — платная команда без подписи';
  if (m.role !== 'assistant' || m.hidden) return 'не пост персонажа';
  const rp = S._rlPost || (S._rlPost = {});
  for (const k in rp) if (now - rp[k] > CMD_RL_POST_MS) delete rp[k];
  if (rp[c.id]) return 'частота: на пост не чаще раза в ' + Math.round(CMD_RL_POST_MS / 1000) + ' с';
  S._rlAll = (S._rlAll || []).filter(function (t) { return now - t < 60000; });
  const wgt = op === 'more' ? 3 : 1;
  if (S._rlAll.length + wgt > CMD_RL_MIN) return 'частота: не больше ' + CMD_RL_MIN + ' генераций в минуту';
  rp[c.id] = now;
  for (let i = 0; i < wgt; i++) S._rlAll.push(now);
  return '';
}

function fragLsFresh() {
  const ls = cmdLs();
  if (!ls) return false;
  try {
    const t = parseInt(ls.getItem(FRAG_LS_KEY), 10);
    const d = Date.now() - t;
    return isFinite(t) && d >= -60000 && d < FRAG_LS_MS;
  } catch (e) {
    return false;
  }
}

function cmdGatePanel(c) {
  const f = cmdFresh(c);
  if (f) return { why: f };
  const sg = cmdSigned(c);
  if (sg === 'ok') return { why: '', signed: true };
  if (sg) return { why: sg };
  if (c.op === 'diag') {
    const now = Date.now();
    if (S._diagUnsAt && now - S._diagUnsAt < CMD_DIAG_MS) return { why: 'diag без подписи не чаще раза в ' + Math.round(CMD_DIAG_MS / 60000) + ' мин' };
    S._diagUnsAt = now;
    return { why: '', signed: false };
  }
  if (!cmdLs()) return { why: '', signed: false };
  return { why: 'нет подписи панели' };
}

const errTextSec0 = errText;
errText = function (e) {
  if (e && typeof e === 'object') {
    const e2 = Object.assign({}, e, { message: secMask((e.message != null) ? String(e.message) : String(e)) });
    if (typeof e.status === 'number') e2.status = e.status;
    return secMask(errTextSec0(e2));
  }
  return secMask(errTextSec0(secMask(e)));
};

const elogSec0 = elog;
elog = function (where, err) {
  const t = (err && err.message) ? String(err.message) : String(err || '');
  return elogSec0(secMask(String(where || '')), secMask(t));
};

const imgSetSec0 = imgSet;
imgSet = function (id, v) {
  if (v && typeof v === 'object' && (typeof v.error === 'string' || typeof v.note === 'string')) {
    v = Object.assign({}, v);
    if (typeof v.error === 'string') v.error = secMask(v.error);
    if (typeof v.note === 'string') v.note = secMask(v.note);
  }
  return imgSetSec0(id, v);
};

function cmdDrop(c, why) {
  try {
    elog('команда отброшена', String((c && c.op) || '?').slice(0, 20) + ': ' + why);
  } catch (e) {}
}

function naiPlainTail() {
  const parts = [];
  const t = S._textRefs || [];
  for (let i = 0; i < t.length; i++) {
    const n = naiClean(t[i] && t[i].note != null ? t[i].note : '');
    if (n) parts.push(n);
  }
  const ps = S._pass || {};
  const c = naiClean(ps.char);
  const u = naiClean(ps.user);
  if (c) parts.push(c);
  if (u) parts.push(u);
  if (!parts.length) return '';
  return ', ' + parts.join(', ');
}

function apiBase(s) {
  let b = rstripSlash(String(s || '').trim());
  if (b && b.indexOf('://') < 0) b = 'https://' + b;
  for (let i = 0; i < 4; i++) {
    const n = rstripSlash(b
      .replace(/\/v1beta\/models\/[^/]*:[a-z]+$/i, '')
      .replace(/\/(chat\/completions|completions|images\/generations|images\/edits|images\/variations|api\/generate)$/i, ''));
    if (n === b) break;
    b = n;
  }
  return b;
}

const PP_OVER_MS = 4000;
const PLACE_REF_PX = 384;
const PLACE_CELL_PX = 240;
const PLACE_GAP_PX = 12;
const PLACE_CROPS = [[0, 0.05, 0.3, 0.7], [0.25, 0.25, 0.55, 0.75], [0.55, 0.1, 0.85, 0.6], [0.6, 0.55, 1, 1]];

async function ppOver() {
  const k = S._ppOver;
  if (k && (Date.now() - k.at) < PP_OVER_MS) return k.v;
  let v = null;
  try {
    v = await tavo.get('iig_pp_over', 'chat');
  } catch (e) {
    return k ? k.v : null;
  }
  S._ppOver = { at: Date.now(), v: (v && typeof v === 'object') ? v : null };
  return S._ppOver.v;
}

async function ppOverlay(pp, pi, nm) {
  const ov = await ppOver();
  if (!ov || !nm) return [pp, pi];
  const o = {};
  const i = {};
  for (const k in (pp || {})) o[k] = pp[k];
  for (const k in (pi || {})) i[k] = pi[k];
  const uN = String(nm.user || '').trim();
  const cN = String(nm.char || '').trim();
  if (ov.user && uN) {
    if (ov.user.text) o['__user:' + uN] = String(ov.user.text);
    if (ov.user.img) i['__user:' + uN] = String(ov.user.img);
  }
  if (ov.char && cN) {
    if (ov.char.text) o[cN] = String(ov.char.text);
    if (ov.char.img) i[cN] = String(ov.char.img);
  }
  return [o, i];
}

async function shrinkDu(du, maxPx) {
  try {
    if (typeof OffscreenCanvas === 'undefined' || typeof createImageBitmap !== 'function') return du;
    const s = String(du || '');
    const ci = s.indexOf(',');
    if (ci < 0) return du;
    const bin = atob(s.slice(ci + 1));
    const buf = new Uint8Array(bin.length);
    for (let k = 0; k < bin.length; k++) buf[k] = bin.charCodeAt(k);
    const mime = (s.slice(0, ci).match(/data:([^;]+)/) || [])[1] || 'image/png';
    const bm = await createImageBitmap(new Blob([buf], { type: mime }));
    const sc = Math.min(1, maxPx / Math.max(bm.width, bm.height));
    if (sc >= 1) return du;
    const cv = new OffscreenCanvas(Math.max(1, Math.round(bm.width * sc)), Math.max(1, Math.round(bm.height * sc)));
    cv.getContext('2d').drawImage(bm, 0, 0, cv.width, cv.height);
    const blob = await cv.convertToBlob({ type: 'image/jpeg', quality: 0.7 });
    const b64 = await new Promise(function (res, rej) {
      const fr = new FileReader();
      fr.onload = function () {
        res(String(fr.result || ''));
      };
      fr.onerror = rej;
      fr.readAsDataURL(blob);
    });
    return b64 && b64.indexOf('data:') === 0 ? b64 : du;
  } catch (e) {
    return du;
  }
}

async function placeSheet(path) {
  const m = S._placeImg || (S._placeImg = {});
  const hit = m[path];
  if (hit && hit.du) return hit.du;
  const du = await wardImg(path);
  let out = '';
  if (typeof OffscreenCanvas !== 'undefined' && typeof createImageBitmap === 'function') {
    try {
      const s = String(du || '');
      const ci = s.indexOf(',');
      const bin = atob(s.slice(ci + 1));
      const buf = new Uint8Array(bin.length);
      for (let k = 0; k < bin.length; k++) buf[k] = bin.charCodeAt(k);
      const mime = (s.slice(0, ci).match(/data:([^;]+)/) || [])[1] || 'image/png';
      const bm = await createImageBitmap(new Blob([buf], { type: mime }));
      const cols = 2;
      const rows = Math.ceil(PLACE_CROPS.length / cols);
      const cv = new OffscreenCanvas(cols * PLACE_CELL_PX + (cols + 1) * PLACE_GAP_PX, rows * PLACE_CELL_PX + (rows + 1) * PLACE_GAP_PX);
      const g = cv.getContext('2d');
      g.fillStyle = '#ececec';
      g.fillRect(0, 0, cv.width, cv.height);
      for (let i = 0; i < PLACE_CROPS.length; i++) {
        const r = PLACE_CROPS[i];
        const sx = Math.round(bm.width * r[0]);
        const sy = Math.round(bm.height * r[1]);
        const sw = Math.max(1, Math.round(bm.width * (r[2] - r[0])));
        const sh = Math.max(1, Math.round(bm.height * (r[3] - r[1])));
        const sc = Math.min(1, PLACE_CELL_PX / Math.max(sw, sh));
        const dw = Math.max(1, Math.round(sw * sc));
        const dh = Math.max(1, Math.round(sh * sc));
        const x = PLACE_GAP_PX + (i % cols) * (PLACE_CELL_PX + PLACE_GAP_PX) + Math.round((PLACE_CELL_PX - dw) / 2);
        const y = PLACE_GAP_PX + Math.floor(i / cols) * (PLACE_CELL_PX + PLACE_GAP_PX) + Math.round((PLACE_CELL_PX - dh) / 2);
        g.drawImage(bm, sx, sy, sw, sh, x, y, dw, dh);
      }
      const blob = await cv.convertToBlob({ type: 'image/jpeg', quality: 0.72 });
      out = await new Promise(function (res, rej) {
        const fr = new FileReader();
        fr.onload = function () {
          res(String(fr.result || ''));
        };
        fr.onerror = rej;
        fr.readAsDataURL(blob);
      });
      if (out.indexOf('data:') !== 0) out = '';
    } catch (e) {
      out = '';
    }
  }
  if (!out) {
    out = await shrinkDu(du, PLACE_REF_PX);
    S._refLost.push('локация: лист фрагментов не собрался — ушла целиком');
  }
  const keys = Object.keys(m);
  if (keys.length >= 8) delete m[keys[0]];
  m[path] = { du: out, at: Date.now() };
  return out;
}

function placeSlots(it, du, note) {
  if (!du && !note) return [];
  return [{ kind: du ? '' : 'text', dataUrl: du || '', type: 'background', note: note, target: 'char', enabled: true, ward: 1 }];
}

function ppUser(pp, userName) {
  if (!pp || typeof pp !== 'object') return null;
  const nm = String(userName || '').trim();
  const k = '__user:' + nm;
  if (nm && Object.prototype.hasOwnProperty.call(pp, k)) return pp[k] || null;
  for (const x in pp) if (x.indexOf('__user:') === 0) return null;
  return pp.__user || null;
}

function naisteraBase(ep) {
  let s = String(ep || '').trim();
  if (s && s.indexOf('://') < 0) s = 'https://' + s;
  s = rstripSlash(s.replace(/^http:\/\//i, 'https://'));
  if (!/^https:\/\/[^/]*naistera/i.test(s)) return 'https://naistera.org';
  return s;
}

function oaiFamily(model) {
  const m = String(model || '').toLowerCase();
  if (/dall-e-2/.test(m)) return 'dalle2';
  if (/dall-e-3/.test(m)) return 'dalle3';
  return 'gpt';
}

function oaiSize(model, ar) {
  const fam = oaiFamily(model);
  if (fam === 'dalle2') return '1024x1024';
  const p = String(ar || '1:1').split(':');
  const w = parseFloat(p[0]) || 1;
  const h = parseFloat(p[1]) || 1;
  if (w === h) return '1024x1024';
  if (fam === 'dalle3') return w > h ? '1792x1024' : '1024x1792';
  return w > h ? '1536x1024' : '1024x1536';
}

function oaiQuality(model, sz) {
  const fam = oaiFamily(model);
  if (fam === 'dalle2') return '';
  if (fam === 'dalle3') return (sz === '1K') ? 'standard' : 'hd';
  return ({ '1K': 'low', '2K': 'medium', '4K': 'high' })[sz || '2K'] || 'medium';
}

function oaiBytes(s) {
  try {
    return new TextEncoder().encode(String(s));
  } catch (e) {}
  const b = unescape(encodeURIComponent(String(s)));
  const u = new Uint8Array(b.length);
  for (let i = 0; i < b.length; i++) u[i] = b.charCodeAt(i) & 255;
  return u;
}

function oaiB64Bytes(b64) {
  const bin = atob(String(b64 || ''));
  const u = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i);
  return u;
}

function oaiForm(fields, files) {
  const bnd = '----iig' + Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
  const parts = [];
  for (let i = 0; i < fields.length; i++) {
    parts.push(oaiBytes('--' + bnd + '\r\nContent-Disposition: form-data; name="' + fields[i][0] + '"\r\n\r\n' + fields[i][1] + '\r\n'));
  }
  for (let j = 0; j < files.length; j++) {
    const f = files[j];
    parts.push(oaiBytes('--' + bnd + '\r\nContent-Disposition: form-data; name="' + f.field + '"; filename="' + f.name + '"\r\nContent-Type: ' + f.mime + '\r\n\r\n'));
    parts.push(f.bytes);
    parts.push(oaiBytes('\r\n'));
  }
  parts.push(oaiBytes('--' + bnd + '--\r\n'));
  let n = 0;
  for (let k = 0; k < parts.length; k++) n += parts[k].length;
  const buf = new Uint8Array(n);
  let o = 0;
  for (let k = 0; k < parts.length; k++) {
    buf.set(parts[k], o);
    o += parts[k].length;
  }
  return { boundary: bnd, body: buf };
}

async function genOpenAIImage(tag, refs, cfg) {
  const model = cfg.model || '';
  const fam = oaiFamily(model);
  const all = styleFirst(refs || []);
  if (cfg._edit && fam !== 'gpt') throw new Error(EDIT_NO_REFS);
  if (cfg._edit && !all.length) throw new Error(EDIT_SRC_LOST);
  const used = (fam === 'gpt') ? all : [];
  if (all.length && !used.length) {
    try {
      S._refLost = (S._refLost || []).concat(['фото (' + all.length + ') — модель ' + model + ' их не принимает, внешность ушла тегами']);
    } catch (e) {}
  }
  const ar = tag.aspect_ratio || cfg.aspectRatio || '1:1';
  const size = oaiSize(model, ar);
  const quality = oaiQuality(model, tag.image_size || cfg.imageSize || '1K');
  let prompt = cfg._edit ? (refsSummaryEdit(used) + (tag.prompt || '')) : (refsSummary(used) + (tag.style ? '[Style: ' + tag.style + '] ' : '') + (tag.prompt || '') + dirHint(ar) + antiBleed(used) + appearanceTail(used));
  const cap = fam === 'dalle3' ? 4000 : (fam === 'dalle2' ? 1000 : 0);
  if (cap && prompt.length > cap) {
    prompt = prompt.slice(0, cap).replace(/\s+\S*$/, '');
    S._refLost.push('промпт урезан до ' + cap + ' знаков — лимит ' + model);
  }
  const base = rstripSlash(cfg.endpoint);
  const url = apiPath(base, used.length ? '/images/edits' : '/images/generations');
  const send = function (sz) {
    if (used.length) {
      const fields = [['model', model], ['prompt', prompt], ['n', '1'], ['size', sz]];
      if (quality) fields.push(['quality', quality]);
      const files = [];
      for (let i = 0; i < used.length; i++) {
        const d = splitDataUrl(used[i].dataUrl);
        if (!d || !d.b64) continue;
        const ext = String(d.mime || 'image/png').split('/')[1] || 'png';
        files.push({ field: 'image[]', name: 'ref' + (i + 1) + '.' + ext.split('+')[0], mime: d.mime || 'image/png', bytes: oaiB64Bytes(d.b64) });
      }
      const fm = oaiForm(fields, files);
      return fetchT(url, {
        method: 'POST',
        headers: {
          'Authorization': 'Bearer ' + cfg.apiKey,
          'Content-Type': 'multipart/form-data; boundary=' + fm.boundary
        },
        body: fm.body
      }, GEN_TIMEOUT, cfg._sig);
    }
    const body = { model: model, prompt: prompt, n: 1, size: sz };
    if (quality) body.quality = quality;
    if (fam !== 'gpt') body.response_format = 'b64_json';
    return fetchT(url, {
      method: 'POST',
      headers: {
        'Authorization': 'Bearer ' + cfg.apiKey,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(body)
    }, GEN_TIMEOUT, cfg._sig);
  };
  let resp = await send(size);
  if (!resp.ok && resp.status === 400 && size !== '1024x1024') {
    const t0 = await resp.text().catch(function () {
      return '';
    });
    if (/size|dimension|width|height|resolution/i.test(t0)) resp = await send('1024x1024');
    else throw apiErr(400, url, t0);
  }
  if (!resp.ok) {
    const t = await resp.text().catch(function () {
      return '';
    });
    throw apiErr(resp.status, url, t, resp);
  }
  const d = await resp.json();
  try {
    if (d.usage && d.usage.total_tokens) S._lastImgTok = d.usage.total_tokens;
  } catch (e) {}
  const it = d.data && d.data[0];
  if (it && it.b64_json) return 'data:image/png;base64,' + it.b64_json;
  if (it && it.url) return it.url;
  if (d.url) return d.url;
  throw new Error('Нет картинки в ответе картиночного API: ' + secMask(JSON.stringify(d)).slice(0, 260));
}

const NAI_HOST = 'https://image.novelai.net';
const NAI_MODELS = [['nai-diffusion-4-5-full', 'NAI 4.5 Full (референсы лиц)'], ['nai-diffusion-4-5-curated', 'NAI 4.5 Curated'], ['nai-diffusion-5-full', 'NAI V5 Full'], ['nai-diffusion-5-curated', 'NAI V5 Curated'], ['nai-diffusion-4-full', 'NAI 4 Full'], ['nai-diffusion-4-curated-preview', 'NAI 4 Curated'], ['nai-diffusion-3', 'NAI 3']];
const NAI_SAMPLERS = ['k_euler_ancestral', 'k_euler', 'k_dpmpp_2s_ancestral', 'k_dpmpp_2m', 'k_dpmpp_2m_sde', 'k_dpmpp_sde'];
const NAI_FEATHER_PX = 12;
const NAI_ERODE_PX = 24;
const NAI_MAX_AREA = 1048576;
const NAI_MAX_OUT = 64 * 1024 * 1024;

function naiNum(v, lo, hi, def) {
  const n = parseFloat(v);
  if (v == null || v === '' || isNaN(n)) return def;
  return Math.min(hi, Math.max(lo, n));
}

function naiModelKind(model) {
  const m = String(model || '');
  if (/^nai-diffusion-3/.test(m)) return 'v3';
  if (/^nai-diffusion-5-/.test(m)) return 'v5';
  return 'v4';
}

function naiInpaintModel(model) {
  const m = String(model || '');
  if (/-inpainting$/.test(m)) return m;
  if (m === 'nai-diffusion-4-5-full') return 'nai-diffusion-4-5-full-inpainting';
  if (m === 'nai-diffusion-4-5-curated') return 'nai-diffusion-4-5-curated-inpainting';
  if (m === 'nai-diffusion-4-full') return 'nai-diffusion-4-full-inpainting';
  if (m === 'nai-diffusion-4-curated-preview') return 'nai-diffusion-4-curated-inpainting';
  if (m === 'nai-diffusion-3') return 'nai-diffusion-3-inpainting';
  return '';
}

const NAI_DIMS = { '1:1': [1024, 1024], '2:3': [832, 1216], '3:4': [896, 1152], '4:5': [896, 1088], '9:16': [768, 1344], '3:2': [1216, 832], '4:3': [1152, 896], '5:4': [1088, 896], '16:9': [1344, 768], '21:9': [1536, 640] };
const NAI_DIMS_LARGE = { '1:1': [1472, 1472], '2:3': [1024, 1536], '3:2': [1536, 1024] };

function naiDims(ar, large) {
  let a = String(ar || '').trim();
  if (!NAI_DIMS[a]) a = '1:1';
  if (large) {
    const lg = NAI_DIMS_LARGE[a];
    if (lg) return { w: lg[0], h: lg[1] };
  }
  const d = NAI_DIMS[a];
  return { w: d[0], h: d[1] };
}

function naiFitDims(w, h) {
  w = Math.max(1, Number(w) || 1);
  h = Math.max(1, Number(h) || 1);
  const r = w / h;
  const sc = Math.min(1, Math.sqrt(NAI_MAX_AREA / (w * h)));
  const W0 = Math.max(64, Math.round(w * sc / 64) * 64);
  const H0 = Math.max(64, Math.round(h * sc / 64) * 64);
  if (W0 * H0 <= NAI_MAX_AREA && Math.abs(W0 / H0 - r) / r <= 0.1) return { w: W0, h: H0 };
  let best = null;
  for (let H = 64; H <= H0; H += 64) {
    let W = Math.min(W0, Math.max(64, Math.round(H * r / 64) * 64));
    while (W * H > NAI_MAX_AREA && W > 64) W -= 64;
    if (W * H > NAI_MAX_AREA) continue;
    const err = Math.abs(W / H - r) / r;
    const good = err <= 0.1;
    if (!best || (good && (!best.good || W * H > best.w * best.h)) || (!good && !best.good && err < best.err)) {
      best = { w: W, h: H, err: err, good: good };
    }
  }
  return best ? { w: best.w, h: best.h } : { w: 64, h: 64 };
}

function naiCanvasFor(w, h) {
  const r = (Number(w) || 1) / (Number(h) || 1);
  if (r < 0.9) return { w: 1024, h: 1536 };
  if (r > 1.1) return { w: 1536, h: 1024 };
  return { w: 1472, h: 1472 };
}

function naiCanvasOk() {
  return typeof OffscreenCanvas !== 'undefined' && typeof createImageBitmap === 'function';
}

async function naiBitmap(du) {
  const s = String(du || '');
  const comma = s.indexOf(',');
  const b64 = comma >= 0 ? s.slice(comma + 1) : s;
  const mime = comma >= 0 ? ((s.slice(0, comma).match(/data:([^;]+)/) || [])[1] || 'image/png') : 'image/png';
  const bin = atob(b64);
  const buf = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) buf[i] = bin.charCodeAt(i);
  return await createImageBitmap(new Blob([buf], { type: mime }));
}

async function naiPng(cv) {
  return await _blobB64(await cv.convertToBlob({ type: 'image/png' }));
}

async function naiPadRef(dataUrl) {
  try {
    if (!naiCanvasOk()) return '';
    const bm = await naiBitmap(dataUrl);
    const c = naiCanvasFor(bm.width, bm.height);
    const cv = new OffscreenCanvas(c.w, c.h);
    const g = cv.getContext('2d');
    g.fillStyle = '#000000';
    g.fillRect(0, 0, c.w, c.h);
    const sc = Math.min(c.w / bm.width, c.h / bm.height);
    const dw = Math.max(1, Math.round(bm.width * sc));
    const dh = Math.max(1, Math.round(bm.height * sc));
    g.drawImage(bm, Math.round((c.w - dw) / 2), Math.round((c.h - dh) / 2), dw, dh);
    return (await naiPng(cv)) || '';
  } catch (e) {
    return '';
  }
}

async function naiMask(w, h, strokes) {
  try {
    if (typeof OffscreenCanvas === 'undefined') return '';
    const cv = new OffscreenCanvas(w, h);
    const g = cv.getContext('2d');
    g.fillStyle = '#000000';
    g.fillRect(0, 0, w, h);
    g.fillStyle = '#ffffff';
    for (const st of (strokes || [])) {
      if (!Array.isArray(st) || !st.length) continue;
      if (st.length <= 2) {
        let x0 = 1, y0 = 1, x1 = 0, y1 = 0;
        for (const p of st) {
          x0 = Math.min(x0, p[0]);
          y0 = Math.min(y0, p[1]);
          x1 = Math.max(x1, p[0]);
          y1 = Math.max(y1, p[1]);
        }
        const px = w * 0.02;
        const py = h * 0.02;
        g.fillRect(x0 * w - px, y0 * h - py, (x1 - x0) * w + 2 * px, (y1 - y0) * h + 2 * py);
        continue;
      }
      g.beginPath();
      for (let i = 0; i < st.length; i++) {
        if (i) g.lineTo(st[i][0] * w, st[i][1] * h);
        else g.moveTo(st[i][0] * w, st[i][1] * h);
      }
      g.closePath();
      g.fill();
    }
    return (await naiPng(cv)) || '';
  } catch (e) {
    return '';
  }
}

function naiBoxBlur(src, W, H, R) {
  const tmp = new Float32Array(W * H);
  const out = new Float32Array(W * H);
  for (let y = 0; y < H; y++) {
    const row = y * W;
    let sum = 0;
    for (let x = -R; x <= R; x++) sum += src[row + Math.min(W - 1, Math.max(0, x))];
    for (let x = 0; x < W; x++) {
      tmp[row + x] = sum / (2 * R + 1);
      sum += src[row + Math.min(W - 1, x + R + 1)] - src[row + Math.max(0, x - R)];
    }
  }
  for (let x = 0; x < W; x++) {
    let sum = 0;
    for (let y = -R; y <= R; y++) sum += tmp[Math.min(H - 1, Math.max(0, y)) * W + x];
    for (let y = 0; y < H; y++) {
      out[y * W + x] = sum / (2 * R + 1);
      sum += tmp[Math.min(H - 1, y + R + 1) * W + x] - tmp[Math.max(0, y - R) * W + x];
    }
  }
  return out;
}

function naiMaskAlpha(md, W, H) {
  const m = new Float32Array(W * H);
  for (let i = 0; i < m.length; i++) m[i] = md[i * 4] / 255;
  const er = naiBoxBlur(m, W, H, NAI_ERODE_PX);
  for (let i = 0; i < er.length; i++) er[i] = er[i] >= 0.99 ? 1 : 0;
  return naiBoxBlur(er, W, H, NAI_FEATHER_PX);
}

async function naiBlend(srcDu, outDu, maskDu) {
  try {
    if (!naiCanvasOk()) return outDu;
    const ob = await naiBitmap(outDu);
    const sb = await naiBitmap(srcDu);
    const mb = await naiBitmap(String(maskDu || '').indexOf('data:') === 0 ? maskDu : 'data:image/png;base64,' + maskDu);
    const W = ob.width;
    const H = ob.height;
    const draw = function (bm) {
      const cv = new OffscreenCanvas(W, H);
      const g = cv.getContext('2d');
      g.drawImage(bm, 0, 0, W, H);
      return g.getImageData(0, 0, W, H);
    };
    const o = draw(ob);
    const s = draw(sb);
    const m = draw(mb);
    const od = o.data;
    const sd = s.data;
    const md = m.data;
    const ma = naiMaskAlpha(md, W, H);
    for (let i = 0; i < od.length; i += 4) {
      const a = ma[i >> 2];
      od[i] = Math.round(od[i] * a + sd[i] * (1 - a));
      od[i + 1] = Math.round(od[i + 1] * a + sd[i + 1] * (1 - a));
      od[i + 2] = Math.round(od[i + 2] * a + sd[i + 2] * (1 - a));
      od[i + 3] = 255;
    }
    const cv = new OffscreenCanvas(W, H);
    cv.getContext('2d').putImageData(o, 0, 0);
    const b64 = await naiPng(cv);
    return b64 ? ('data:image/png;base64,' + b64) : outDu;
  } catch (e) {
    return outDu;
  }
}

const NAI_LBASE = [3, 4, 5, 6, 7, 8, 9, 10, 11, 13, 15, 17, 19, 23, 27, 31, 35, 43, 51, 59, 67, 83, 99, 115, 131, 163, 195, 227, 258];
const NAI_LEXT = [0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 2, 2, 2, 2, 3, 3, 3, 3, 4, 4, 4, 4, 5, 5, 5, 5, 0];
const NAI_DBASE = [1, 2, 3, 4, 5, 7, 9, 13, 17, 25, 33, 49, 65, 97, 129, 193, 257, 385, 513, 769, 1025, 1537, 2049, 3073, 4097, 6145, 8193, 12289, 16385, 24577];
const NAI_DEXT = [0, 0, 0, 0, 1, 1, 2, 2, 3, 3, 4, 4, 5, 5, 6, 6, 7, 7, 8, 8, 9, 9, 10, 10, 11, 11, 12, 12, 13, 13];
const NAI_CLORD = [16, 17, 18, 0, 8, 7, 9, 6, 10, 5, 11, 4, 12, 3, 13, 2, 14, 1, 15];

function naiInflateJs(src) {
  const bad = function () {
    return new Error('NovelAI: ответ не распакован');
  };
  let pos = 0;
  let bitBuf = 0;
  let bitCnt = 0;
  let out = new Uint8Array(Math.min(NAI_MAX_OUT, Math.max(65536, src.length * 4)));
  let olen = 0;
  const room = function (n) {
    if (olen + n <= out.length) return;
    if (olen + n > NAI_MAX_OUT) throw bad();
    let cap = out.length * 2;
    while (cap < olen + n) cap *= 2;
    const nb = new Uint8Array(Math.min(cap, NAI_MAX_OUT));
    nb.set(out.subarray(0, olen));
    out = nb;
  };
  const bits = function (n) {
    while (bitCnt < n) {
      if (pos >= src.length) throw bad();
      bitBuf |= src[pos++] << bitCnt;
      bitCnt += 8;
    }
    const v = bitBuf & ((1 << n) - 1);
    bitBuf >>>= n;
    bitCnt -= n;
    return v;
  };
  const build = function (lens, n) {
    const count = new Uint16Array(16);
    const sym = new Uint16Array(n);
    for (let i = 0; i < n; i++) count[lens[i]]++;
    count[0] = 0;
    let left = 1;
    for (let l = 1; l < 16; l++) {
      left = left * 2 - count[l];
      if (left < 0) throw bad();
    }
    const offs = new Uint16Array(16);
    for (let l = 1; l < 15; l++) offs[l + 1] = offs[l] + count[l];
    for (let i = 0; i < n; i++) if (lens[i]) sym[offs[lens[i]]++] = i;
    return { count: count, sym: sym };
  };
  const decode = function (h) {
    let code = 0;
    let first = 0;
    let index = 0;
    for (let l = 1; l < 16; l++) {
      code |= bits(1);
      const c = h.count[l];
      if (code < first + c) return h.sym[index + code - first];
      index += c;
      first = (first + c) << 1;
      code <<= 1;
    }
    throw bad();
  };
  const codes = function (lh, dh) {
    for (;;) {
      let s = decode(lh);
      if (s < 256) {
        room(1);
        out[olen++] = s;
        continue;
      }
      if (s === 256) return;
      s -= 257;
      if (s >= 29) throw bad();
      const len = NAI_LBASE[s] + bits(NAI_LEXT[s]);
      const ds = decode(dh);
      if (ds >= 30) throw bad();
      const dist = NAI_DBASE[ds] + bits(NAI_DEXT[ds]);
      if (dist > olen) throw bad();
      room(len);
      for (let k = 0; k < len; k++) {
        out[olen] = out[olen - dist];
        olen++;
      }
    }
  };
  let fixL = null;
  let fixD = null;
  let last = 0;
  while (!last) {
    last = bits(1);
    const type = bits(2);
    if (type === 0) {
      bitBuf = 0;
      bitCnt = 0;
      if (pos + 4 > src.length) throw bad();
      const len = src[pos] | (src[pos + 1] << 8);
      const nlen = src[pos + 2] | (src[pos + 3] << 8);
      pos += 4;
      if (len !== (~nlen & 0xffff)) throw bad();
      if (pos + len > src.length) throw bad();
      room(len);
      out.set(src.subarray(pos, pos + len), olen);
      olen += len;
      pos += len;
    } else if (type === 1) {
      if (!fixL) {
        const l = new Uint8Array(288);
        for (let i = 0; i < 288; i++) l[i] = i < 144 ? 8 : (i < 256 ? 9 : (i < 280 ? 7 : 8));
        const d = new Uint8Array(30);
        d.fill(5);
        fixL = build(l, 288);
        fixD = build(d, 30);
      }
      codes(fixL, fixD);
    } else if (type === 2) {
      const nlit = bits(5) + 257;
      const ndist = bits(5) + 1;
      const ncode = bits(4) + 4;
      if (nlit > 286 || ndist > 30) throw bad();
      const cl = new Uint8Array(19);
      for (let i = 0; i < ncode; i++) cl[NAI_CLORD[i]] = bits(3);
      const ch = build(cl, 19);
      const lens = new Uint8Array(nlit + ndist);
      let i = 0;
      while (i < nlit + ndist) {
        const sym = decode(ch);
        if (sym < 16) {
          lens[i++] = sym;
          continue;
        }
        let val = 0;
        let rep;
        if (sym === 16) {
          if (!i) throw bad();
          val = lens[i - 1];
          rep = 3 + bits(2);
        } else if (sym === 17) rep = 3 + bits(3);
        else rep = 11 + bits(7);
        if (i + rep > nlit + ndist) throw bad();
        while (rep--) lens[i++] = val;
      }
      if (!lens[256]) throw bad();
      codes(build(lens.subarray(0, nlit), nlit), build(lens.subarray(nlit), ndist));
    } else throw bad();
  }
  return out.slice(0, olen);
}

async function naiInflateDs(bytes) {
  const ds = new DecompressionStream('deflate-raw');
  const w = ds.writable.getWriter();
  w.write(bytes).catch(function () {});
  w.close().catch(function () {});
  const r = ds.readable.getReader();
  const parts = [];
  let n = 0;
  for (;;) {
    const x = await r.read();
    if (x.done) break;
    n += x.value.length;
    if (n > NAI_MAX_OUT) {
      try {
        r.cancel();
      } catch (e) {}
      throw new Error('NovelAI: ответ не распакован');
    }
    parts.push(x.value);
  }
  const out = new Uint8Array(n);
  let o = 0;
  for (const p of parts) {
    out.set(p, o);
    o += p.length;
  }
  return out;
}

async function naiInflate(bytes) {
  const src = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  if (typeof DecompressionStream !== 'undefined') {
    try {
      return await naiInflateDs(src);
    } catch (e) {}
  }
  return naiInflateJs(src);
}

async function naiUnzip(buf) {
  const bad = function () {
    return new Error('NovelAI: ответ не распакован');
  };
  const u = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  const n = u.length;
  const sig = function (at, b2, b3) {
    return at >= 0 && at + 4 <= n && u[at] === 0x50 && u[at + 1] === 0x4b && u[at + 2] === b2 && u[at + 3] === b3;
  };
  const u16 = function (at) {
    return u[at] | (u[at + 1] << 8);
  };
  const u32 = function (at) {
    return (u[at] | (u[at + 1] << 8) | (u[at + 2] << 16) | (u[at + 3] << 24)) >>> 0;
  };
  if (n < 30 || !sig(0, 3, 4)) throw bad();
  let lho = 0;
  let method = u16(8);
  let csize = u32(18);
  const flags = u16(6);
  let known = !(flags & 8);
  for (let i = n - 22; i >= 0 && i >= n - 22 - 65535; i--) {
    if (!sig(i, 5, 6)) continue;
    const cd = u32(i + 16);
    if (cd + 46 <= n && sig(cd, 1, 2)) {
      method = u16(cd + 10);
      csize = u32(cd + 20);
      lho = u32(cd + 42);
      known = true;
    }
    break;
  }
  if (lho + 30 > n || !sig(lho, 3, 4)) throw bad();
  const start = lho + 30 + u16(lho + 26) + u16(lho + 28);
  if (start > n) throw bad();
  const end = known ? start + csize : n;
  if (end > n || end < start) throw bad();
  const data = u.subarray(start, end);
  if (method === 0) return data.slice();
  if (method === 8) {
    try {
      return await naiInflate(data);
    } catch (e) {
      throw bad();
    }
  }
  throw bad();
}

function naiB64(bytes) {
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) {
    s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  }
  return btoa(s);
}

function naiSafeMsg(s) {
  return String(s || '').replace(/<[^>]*>/g, ' ').replace(/[<>]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 200);
}

var NAI_NOISES = ['karras', 'native', 'exponential', 'polyexponential'];

const NAI_CHARS_MAX = 4;
const NAI_OWN_CHARS = ['Комикс кастом by darkxizon & Шино'];

function naiOwnChars(cfg) {
  const nm = String((cfg && cfg.promptName) || '').trim().toLowerCase();
  if (!nm) return false;
  for (const x of NAI_OWN_CHARS) if (x.toLowerCase() === nm) return true;
  return false;
}
const NAI_OWN_CHARS_TAIL = ' This style has its own page format: the prompt paragraph keeps everything the style guide puts there - the page and panel layout, the composition of every panel, the scene, lighting and the subject count - and EVERY speech bubble with its text in «» quotes and the tail pointing to the speaker, exactly as the style guide shows. CHAR lines hold appearance, clothing, expression and pose only, never dialogue, bubbles or on-image text; the text: field of the style guide stays in the prompt paragraph next to its bubble.';
const NAI_CHAR_CAP = 600;
const NAI_CENTER = { x: 0.5, y: 0.5 };

function naiCharsOn(cfg) {
  return naiMode(cfg) && !(cfg.apiStyle === 'novelai' && naiModelKind(cfg.naiModel || 'nai-diffusion-4-5-full') === 'v3');
}

function naiCharGuide(cfg) {
  if (!naiCharsOn(cfg)) return '';
  const base = 'CHAR: char|user|npc | Name | tags - one CHAR line for EACH person visible in the image: the char, the user and side characters from the appearance data, at most ' + NAI_CHARS_MAX + ' lines in total, in the order they stand in the frame from left to right. The first field says who it is (char, user or npc), the second is the exact name, the third is comma-separated English Danbooru tags for that one person only: gender tag first (1girl, 1boy or 1other), then the age group (adult, mature female, old man and the like), then their appearance from the APPEARANCE DATA translated into English Danbooru tags, then their current clothing, expression and pose. Never give the tags of one person to another person. Write no CHAR line for anyone who is not in the frame.';
  if (naiOwnChars(cfg)) return base + NAI_OWN_CHARS_TAIL;
  return base + ' In the prompt paragraph keep only the subject count (for example 1boy, 1girl), the names, the scene, lighting, composition and the interaction tags (source#..., target#..., mutual#...); do not repeat the detailed appearance of these people there. The prompt paragraph must still contain at least 20 comma-separated tags for the scene, setting, lighting, composition and action.';
}

function pwMinWords(cfg, side) {
  return (side && Array.isArray(side.chars) && side.chars.length > 0) ? 8 : 20;
}

function pwCutText(n) {
  return 'модель промпта не дописала ответ: размышления съели лимит токенов (пробовали ' + (Number(n) || 0) + ') — подними «токены ответа» во вкладке api или поставь модель промпта без размышлений';
}

function pwTokensFor(cfg) {
  const n = parseInt(cfg && cfg.pwMaxTokens, 10);
  if (isFinite(n) && n > 0) return n;
  if (cfg && cfg.pwChat !== false) return 6000;
  return /reasoner|r1|thinking|think/i.test(String((cfg && cfg.pwModel) || '')) ? 6000 : 3000;
}

function parseNaiChars(lines) {
  const out = [];
  for (const ln0 of (Array.isArray(lines) ? lines : [])) {
    const ln = String(ln0 == null ? '' : ln0).trim().replace(/^[ \t>*-]{0,4}CHAR[ \t]{0,2}:/, '');
    const parts = ln.split('|');
    if (parts.length < 3) continue;
    const who = parts[0].trim().toLowerCase();
    if (who !== 'char' && who !== 'user' && who !== 'npc') continue;
    const caption = naiClean(parts.slice(2).join(', ')).slice(0, NAI_CHAR_CAP);
    if (!caption) continue;
    out.push({ who: who, name: parts[1].trim().slice(0, 60), caption: caption });
    if (out.length >= NAI_CHARS_MAX) break;
  }
  return out;
}

function naiCastChars(chars, cast) {
  return (Array.isArray(chars) ? chars : []).filter(function (c) {
    if (!c || !c.caption) return false;
    if (c.who === 'char' || c.who === 'user') return !cast || cast[c.who] !== false;
    return true;
  });
}

function naiCastOf(tag) {
  if (tag && tag.cast !== undefined) return tag.cast || null;
  try {
    return parseMarkers(String((tag && tag.prompt) || '')).cast || null;
  } catch (e) {
    return null;
  }
}

function naiCaptions(tag, cfg) {
  tag = tag || {};
  const cast = naiCastOf(tag);
  const names = (tag.names && typeof tag.names === 'object') ? tag.names : (S._names || {});
  const src = Array.isArray(tag.chars) ? tag.chars : [];
  let chars = [];
  if (src.length) {
    chars = naiCastChars(src.map(function (c) {
      return c ? { who: c.who, name: String(c.name || ''), caption: naiClean(c.caption).slice(0, NAI_CHAR_CAP) } : null;
    }), cast);
  } else {
    const ps = S._pass || {};
    for (const who of ['char', 'user']) {
      const v = naiClean(ps[who]).slice(0, NAI_CHAR_CAP);
      if (!v || (cast && cast[who] === false)) continue;
      chars.push({ who: who, name: '', caption: v });
    }
  }
  chars = chars.slice(0, NAI_CHARS_MAX);
  const base = [];
  const t = S._textRefs || [];
  for (let i = 0; i < t.length; i++) {
    const r = t[i] || {};
    const n = naiClean(r.note != null ? r.note : '');
    if (!n) continue;
    const tg = (r.tgt === 'char' || r.tgt === 'user') && (!r.rtype || REF_BOUND[r.rtype]) ? r.tgt : '';
    if (!tg) {
      base.push(n);
      continue;
    }
    const nmT = String((names && names[tg]) || '').trim();
    let hit = null;
    for (const c of chars) {
      if (c.who === tg) {
        hit = c;
        break;
      }
    }
    if (hit) {
      hit.caption = (hit.caption + ', ' + n).slice(0, NAI_CHAR_CAP);
      continue;
    }
    if (!Array.isArray(S._refLost)) S._refLost = [];
    if (cast && cast[tg] === false) {
      S._refLost.push('реф «' + String(r.note || '').slice(0, 40) + '» — ' + (tg === 'user' ? 'юзера' : 'персонажа') + ' нет в кадре');
      continue;
    }
    if (chars.length >= NAI_CHARS_MAX) {
      S._refLost.push('реф «' + String(r.note || '').slice(0, 40) + '» — у NovelAI уже ' + NAI_CHARS_MAX + ' подписи персонажей, места нет');
      continue;
    }
    chars.push({ who: tg, name: nmT, caption: n.slice(0, NAI_CHAR_CAP) });
  }
  return { chars: chars, base: base };
}

function naiBody(tag, cfg, extra) {
  tag = tag || {};
  cfg = cfg || {};
  let model = cfg.naiModel || 'nai-diffusion-4-5-full';
  const kind = naiModelKind(model);
  const arts = naiClean(cfg.naiArtists || '');
  const body0 = naiClean(tag.prompt || '');
  const cap = naiCaptions(tag, cfg);
  const flat = kind === 'v3' || !!tag._naiFlat;
  const tail = flat ? cap.base.concat(cap.chars.map(function (c) {
    return c.caption;
  })) : cap.base;
  const input = (arts ? (arts + ', ') : '') + body0 + (tail.length ? ', ' + tail.join(', ') : '');
  const charCaps = flat ? [] : cap.chars.map(function (c) {
    return { char_caption: c.caption, centers: [Object.assign({}, NAI_CENTER)] };
  });
  const negParts = [];
  for (const ng of [String(cfg.styleNegative || ''), String(cfg.naiNegative || '')]) {
    if (!ng) continue;
    negParts.push(ng);
  }
  const negative = negParts.join(', ');
  const seedN = Number(cfg.naiSeed);
  const seed = (Number.isInteger(seedN) && seedN > 0 && seedN <= 4294967295) ? seedN : Math.floor(Math.random() * 4294967289);
  const noise = NAI_NOISES.indexOf(cfg.naiNoise) >= 0 ? cfg.naiNoise : 'karras';
  const d = naiDims(tag.aspect_ratio || cfg.aspectRatio, cfg.naiLarge);
  const sampler = NAI_SAMPLERS.indexOf(cfg.naiSampler) >= 0 ? cfg.naiSampler : 'k_euler_ancestral';
  const uc = parseInt(cfg.naiUc, 10);
  const p = {
    width: d.w,
    height: d.h,
    scale: naiNum(cfg.naiScale, 0, 10, 5.5),
    sampler: sampler,
    steps: Math.round(naiNum(cfg.naiSteps, 1, 50, 28)),
    seed: seed,
    n_samples: 1,
    ucPreset: (uc >= 0 && uc <= 4) ? uc : 0,
    qualityToggle: cfg.naiQuality === undefined ? true : !!cfg.naiQuality,
    negative_prompt: negative,
    noise_schedule: noise,
    cfg_rescale: naiNum(cfg.naiRescale, 0, 1, 0),
    dynamic_thresholding: false,
    legacy: false,
    add_original_image: true
  };
  if (kind !== 'v5') {
    p.controlnet_strength = 1;
    p.legacy_v3_extend = false;
  }
  if (cfg.naiVariety) p.skip_cfg_above_sigma = 19;
  if (kind === 'v3') {
    p.sm = !!cfg.naiSmea;
    p.sm_dyn = !!cfg.naiSmeaDyn;
  } else {
    p.params_version = kind === 'v5' ? 4 : 3;
    p.use_coords = false;
    p.legacy_uc = false;
    p.normalize_reference_strength_multiple = true;
    p.deliberate_euler_ancestral_bug = false;
    p.prefer_brownian = true;
    p.v4_prompt = { caption: { base_caption: input, char_captions: charCaps }, use_coords: false, use_order: true };
    p.v4_negative_prompt = { caption: { base_caption: negative, char_captions: charCaps.map(function () {
      return { char_caption: '', centers: [Object.assign({}, NAI_CENTER)] };
    }) }, legacy_uc: false };
  }
  let action = 'generate';
  const ex = Object.assign({}, extra || {});
  if (ex.action) action = ex.action;
  if (ex.model) model = ex.model;
  delete ex.action;
  delete ex.model;
  Object.assign(p, ex);
  return { input: input, model: model, action: action, parameters: p };
}

function naiRefsPick(refs, cfg) {
  cfg = cfg || {};
  const model = cfg.naiModel || 'nai-diffusion-4-5-full';
  const photo = (refs || []).filter(function (r) {
    return r && r.dataUrl && !r.textOnly;
  });
  if (!cfg.naiRefs || naiModelKind(model) !== 'v4' || model !== 'nai-diffusion-4-5-full') {
    if (!photo.length) return { use: [], lost: [] };
    return { use: [], lost: [cfg.naiRefs ? 'NovelAI: фото-референсы идут только на 4.5 full' : 'NovelAI: референсы лиц выключены в настройках'] };
  }
  const max = Math.round(naiNum(cfg.naiRefMax, 1, 4, 2));
  const kindOf = function (r) {
    if (r.who === 'char' || r.who === 'user' || r.rtype === 'npc' || r.rtype === 'face') return 'character';
    if (r.rtype === 'style' || isStyleLabel(r.label)) return 'style';
    return '';
  };
  const faceCap = (max >= 2 && photo.some(function (r) { return kindOf(r) === 'style'; })) ? max - 1 : max;
  const use = [];
  const lost = [];
  let faces = 0;
  for (const r of photo) {
    const label = refName(r).slice(0, 24);
    const kind = kindOf(r);
    if (!kind) {
      lost.push('реф «' + label + '» — NovelAI принимает картинками только лица и стиль');
      continue;
    }
    if (use.length >= max || (kind === 'character' && faces >= faceCap)) {
      lost.push('реф «' + label + '» — больше лимита референсов NovelAI (' + max + ')');
      continue;
    }
    if (kind === 'character') faces++;
    use.push({ dataUrl: r.dataUrl, kind: kind, label: label });
  }
  return { use: use, lost: lost };
}

async function naiFitSrc(du) {
  try {
    if (!naiCanvasOk()) return null;
    const bm = await naiBitmap(du);
    const d = naiFitDims(bm.width, bm.height);
    const cv = new OffscreenCanvas(d.w, d.h);
    cv.getContext('2d').drawImage(bm, 0, 0, d.w, d.h);
    const b64 = await naiPng(cv);
    if (!b64) return null;
    return { du: 'data:image/png;base64,' + b64, b64: b64, w: d.w, h: d.h };
  } catch (e) {
    return null;
  }
}

function naiSentText(body) {
  const p = (body && body.parameters) || {};
  const v4 = p.v4_prompt && p.v4_prompt.caption;
  const cc = (v4 && Array.isArray(v4.char_captions)) ? v4.char_captions : [];
  return [String((body && body.input) || '')].concat(cc.map(function (c) {
    return String((c && c.char_caption) || '');
  })).concat([String(p.negative_prompt || '')]).join(' ');
}

function naiCapCount(body) {
  const v4 = body && body.parameters && body.parameters.v4_prompt;
  const cc = v4 && v4.caption && v4.caption.char_captions;
  return Array.isArray(cc) ? cc.length : 0;
}

function naiFaceOrder(refs, chars) {
  const ord = (Array.isArray(chars) ? chars : []).map(function (c) {
    return c && c.who;
  });
  const list = Array.isArray(refs) ? refs : [];
  if (!ord.length) return list;
  const rank = function (r) {
    const w = r && (r.who === 'char' || r.who === 'user') ? r.who : (r && r.rtype === 'npc' ? 'npc' : '');
    const i = w ? ord.indexOf(w) : -1;
    return i >= 0 ? i : ord.length;
  };
  return list.map(function (r, i) {
    return { r: r, k: rank(r), i: i };
  }).sort(function (a, b) {
    return (a.k - b.k) || (a.i - b.i);
  }).map(function (x) {
    return x.r;
  });
}

async function genNovelAI(tag, refs, cfg) {
  S._naiNote = '';
  if (!cfg.apiKey) throw new Error('нет токена NovelAI — открой панель, вкладка api');
  if (!Array.isArray(S._refLost)) S._refLost = [];
  const model = cfg.naiModel || 'nai-diffusion-4-5-full';
  const extra = {};
  const edit = tag && tag._edit;
  let fit = null;
  let maskB64 = '';
  if (edit && edit.src) {
    fit = await naiFitSrc(edit.src);
    if (!fit) throw new Error('NovelAI: исходник не подготовился для доработки');
    const seed = Math.floor(Math.random() * 4294967289);
    extra.width = fit.w;
    extra.height = fit.h;
    extra.image = fit.b64;
    extra.seed = seed;
    const strokes = (Array.isArray(edit.strokes) && edit.strokes.length) ? edit.strokes : null;
    const inp = strokes ? naiInpaintModel(model) : '';
    if (strokes && inp) {
      maskB64 = await naiMask(fit.w, fit.h, strokes);
      if (!maskB64) S._refLost.push('NovelAI: маска не построилась — правка по всей картинке');
    }
    if (maskB64) {
      extra.action = 'infill';
      extra.model = inp;
      extra.mask = maskB64;
      extra.strength = naiNum(cfg.naiEditStrength, 0.1, 0.99, 0.7);
      extra.add_original_image = true;
    } else {
      if (strokes && !inp) S._refLost.push('V5: маска не поддерживается');
      extra.action = 'img2img';
      extra.strength = naiNum(cfg.naiEditStrength, 0.1, 0.99, 0.6);
      extra.noise = 0;
      extra.extra_noise_seed = seed;
    }
  } else {
    const picked = naiRefsPick(naiFaceOrder(refs, tag && tag.chars), cfg);
    for (const l of picked.lost) S._refLost.push(l);
    const imgs = [];
    const descs = [];
    for (const u of picked.use) {
      const b = await naiPadRef(u.dataUrl);
      if (!b) {
        S._refLost.push('реф «' + u.label + '» — не удалось подготовить для NovelAI');
        continue;
      }
      imgs.push(b);
      descs.push({ caption: { base_caption: u.kind, char_captions: [] }, legacy_uc: false });
    }
    if (imgs.length) {
      const str = naiNum(cfg.naiRefStrength, 0.1, 1, 0.6);
      extra.director_reference_images = imgs;
      extra.director_reference_descriptions = descs;
      extra.director_reference_strength_values = imgs.map(function () { return str; });
      extra.director_reference_secondary_strength_values = imgs.map(function () { return 0.5; });
      extra.director_reference_information_extracted = imgs.map(function () { return 1; });
      S._naiNote = 'NovelAI: референсов ' + imgs.length + ' × 5 Anlas';
    }
  }
  let body = naiBody(tag, cfg, extra);
  const note0 = S._naiNote;
  const nCaps = naiCapCount(body);
  if (nCaps) S._naiNote = (note0 ? note0 + ' · ' : '') + 'NovelAI: подписей персонажей ' + nCaps;
  const url = NAI_HOST + '/ai/generate-image';
  let resp;
  let flatDone = false;
  for (;;) {
    try {
      resp = await fetchT(url, {
        method: 'POST',
        headers: {
          'Authorization': 'Bearer ' + cfg.apiKey,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(body)
      }, GEN_TIMEOUT, cfg._sig);
    } catch (e) {
      if (e && e.iigStop) throw e;
      throw new Error('Сеть/CORS при запросе ' + url + ' :: ' + ((e && e.message) || 'Failed to fetch'));
    }
    if (resp.ok || resp.status !== 400 || flatDone || !naiCapCount(body)) break;
    flatDone = true;
    S._refLost.push('NovelAI: раздельные подписи персонажей отклонены — ушли общим промптом');
    S._naiNote = note0;
    body = naiBody(Object.assign({}, tag, { _naiFlat: 1 }), cfg, Object.assign({}, extra, { seed: body.parameters.seed }));
  }
  if (!resp.ok) {
    const text = await resp.text().catch(function () {
      return '';
    });
    let m = '';
    try {
      const j = JSON.parse(text);
      m = String((j && j.message) || '');
    } catch (e) {}
    m = naiSafeMsg(m || text);
    const st = resp.status;
    const sentRu = naiSentText(body);
    if ((st === 400 || st === 422) && hasCyr(sentRu)) throw naiRuErr(sentRu, st, m || ('HTTP ' + st));
    let head = 'NovelAI: ' + (m || ('HTTP ' + st));
    if (st === 401) head = 'NovelAI: токен не принят';
    else if (st === 402) head = 'NovelAI: нужна активная подписка';
    else if (st === 429) head = 'NovelAI: занято — одна генерация за раз';
    const e = apiErr(st, url, m, resp);
    e.message = head + ' · ' + e.message;
    if (st === 429) e.retryAfterMs = retryAfterMs(resp) || 4000;
    throw e;
  }
  const buf = await resp.arrayBuffer();
  const u = new Uint8Array(buf);
  if (!(u.length >= 2 && u[0] === 0x50 && u[1] === 0x4b)) {
    let m = '';
    try {
      m = String(JSON.parse(new TextDecoder().decode(u)).message || '');
    } catch (e) {}
    throw new Error('NovelAI: ' + (naiSafeMsg(m) || 'в ответе нет картинки'));
  }
  const png = await naiUnzip(buf);
  const outDu = 'data:image/png;base64,' + naiB64(png);
  if (maskB64 && fit) return await naiBlend(fit.du, outDu, maskB64);
  return outDu;
}

function elog(where, err) {
  try {
    let t = (err && err.message) ? String(err.message) : String(err || '');
    t = t.trim().slice(0, 300);
    if (!t) return;
    const w = String(where || '').slice(0, 80);
    S._elQ = (S._elQ || Promise.resolve()).then(async function () {
      let arr = null;
      try {
        arr = await tavo.get('iig_errlog', 'global');
      } catch (e) {
        return;
      }
      if (!Array.isArray(arr)) arr = [];
      const last = arr.length ? arr[arr.length - 1] : null;
      if (last && last.t === t && last.w === w) {
        last.n = (last.n || 1) + 1;
        last.at = Date.now();
      } else {
        arr.push({ at: Date.now(), v: VER, w: w, t: t });
        if (arr.length > ELOG_CAP) arr = arr.slice(arr.length - ELOG_CAP);
      }
      await tavo.set('iig_errlog', arr, 'global');
    }).catch(function () {});
  } catch (e) {}
}

var RX_NAME = 'Картинки · чистка меток (движок)';
var RX_MARK = '/<!--\\s*iig:[a-z0-9_]{1,40}\\s*-->/gi';
var RX_LEGACY = '/<img\\b[^>]*?data-iig-instruction[\\s\\S]*?>|\\[IMG:(?:GEN|OK|FAIL)(?::[a-z0-9_]{1,})?\\]/gi';

async function rxSaveGid(id) {
  try {
    await tavo.set('iig_rx_gid', { id: id, at: Date.now() }, 'global');
  } catch (e) {}
}

async function ensureCleanRegex() {
  if (S._rxDone || S._rxBusy) return;
  if (S._rxScanFail && Date.now() - S._rxScanFail < 60000) return;
  S._rxBusy = 1;
  try {
    if (!tavo.regex || !tavo.regex.find) {
      S._rxDone = 1;
      return;
    }

    let kvOk = true;
    let saved = null;
    try {
      saved = await tavo.get('iig_rx_gid', 'global');
    } catch (e) {
      kvOk = false;
    }
    if (saved && saved.id != null && tavo.regex.get) {
      let g0 = null;
      try {
        g0 = await tavo.regex.get(saved.id);
      } catch (e) {
        S._rxScanFail = Date.now();
        return;
      }
      if (g0 && JSON.stringify(g0.entries || []).indexOf('iig:') >= 0) {
        S._rxGid = g0.id;
        S._rxDone = 1;
        return;
      }
    }

    let found = null;
    let sure = false;
    if (tavo.regex.all) {
      try {
        const all = await tavo.regex.all();
        if (Array.isArray(all)) {
          sure = true;
          for (const g of all) {
            if (!g) continue;
            let full = g;
            if (!g.entries || typeof g.entries === 'number') {
              try {
                full = await tavo.regex.get(g.id);
              } catch (e0) {

                full = null;
                sure = false;
              }
            }
            const src = JSON.stringify((full && full.entries) || []);
            if (src.indexOf('iig:') >= 0 || (full && full.name === RX_NAME)) {
              found = full;
              break;
            }
          }
        }
      } catch (e) {
        sure = false;
      }
    }
    if (!found) {
      try {
        const a = await tavo.regex.find(RX_NAME, { match: 'exact' });
        found = (a && a[0]) || null;
        if (!tavo.regex.all) sure = true;
      } catch (e) {
        if (!tavo.regex.all) sure = false;
      }
    }
    if (found && JSON.stringify((found.entries || []).map(function (e) {
      return e.findRegex;
    })).indexOf('iig:') >= 0) {
      S._rxGid = found.id;
      S._rxDone = 1;
      await rxSaveGid(found.id);
      return;
    }
    if (!found && (!kvOk || !sure)) {

      S._rxScanFail = Date.now();
      return;
    }
    const ask = await tavo.get('iig_rx_ask', 'global');
    if (ask && ask.at && Date.now() - ask.at < 86400000 && !ask.ok) return;

    await tavo.set('iig_rx_ask', { at: Date.now() }, 'global');

    const entries = [
      { identifier: 'iig-clean-mark', name: 'метка картинки — не для модели', findRegex: RX_MARK, replaceString: '', trimStrings: [], placements: ['char', 'user'], timing: 'send', substitution: 'none', enabled: true },
      { identifier: 'iig-clean-legacy', name: 'наследие v53: [IMG:...] и OOC-инструкция', findRegex: RX_LEGACY, replaceString: '', trimStrings: [], placements: ['char', 'user'], timing: 'send', substitution: 'none', enabled: true }
    ];
    if (found) {
      found.entries = entries;
      await tavo.regex.update(found);
      S._rxGid = found.id;
      S._rxDone = 1;
    } else {
      const id = await tavo.regex.create({ name: RX_NAME, entries: entries });
      if (id != null) {
        S._rxGid = id;
        S._rxDone = 1;
      }
    }
    if (S._rxDone) {
      await rxSaveGid(S._rxGid);
      try {
        await tavo.set('iig_rx_ask', { at: Date.now(), ok: 1 }, 'global');
      } catch (e) {}
    }
  } catch (e) {} finally {
    S._rxBusy = 0;
  }
}

function chatRegexIds(ch) {
  if (!ch) return null;
  const src = Array.isArray(ch.regexIds) ? ch.regexIds : (Array.isArray(ch.regexes) ? ch.regexes.map(function (r) {
    return r && r.id;
  }) : null);
  if (!src) return null;
  const out = [];
  for (const x of src) if (x != null && out.indexOf(x) < 0) out.push(x);
  return out;
}

async function rxBoundCheck() {
  try {
    S._rxUnbound = 0;
    const ch = await tavo.chat.current();
    const have = chatRegexIds(ch);
    if (S._rxGid != null && have && have.indexOf(S._rxGid) >= 0) return;
    const list = (ch && ch.regexes) || [];
    for (const r of list) {
      if (r && r.name === RX_NAME) return;
    }
    S._rxUnbound = 1;
  } catch (e) {}
}

function withPersona(ch, p) {
  try {
    if (ch && ch.persona && ch.persona.id != null) p.personaId = ch.persona.id;
    else if (ch && ch.personaId != null) p.personaId = ch.personaId;
  } catch (e) {}
  return p;
}

async function bindDiag(kind, why) {
  try {
    S._bindDiag = S._bindDiag || {};
    const d = S._bindDiag;
    d[kind] = why;
    d.at = Date.now();
    d.v = VER;
    d.gid = S._rxGid == null ? null : S._rxGid;
    d.rxDone = S._rxDone || 0;
    d.rxBusy = S._rxBusy || 0;
    d.rxScanFail = S._rxScanFail || 0;
    const sig = kind + '|' + why;
    if (S._bindDiagSig === sig) return;
    S._bindDiagSig = sig;
    await tavo.set('iig_bind_diag', d, 'global');
  } catch (e) {}
}

async function rxEnsureBound() {
  let ch = null;
  try {
    await rxBoundCheck();
    if (!S._rxUnbound) return bindDiag('rx', 'bound');
    if (!tavo.regex || !tavo.regex.find || !tavo.chat || !tavo.chat.update) return bindDiag('rx', 'no-api');
    ch = await tavo.chat.current();
    if (!ch || ch.id == null) return bindDiag('rx', 'no-chat');
    S._rxBindFail = S._rxBindFail || {};
    if (S._rxBindFail[ch.id] && Date.now() - S._rxBindFail[ch.id] < 600000) return bindDiag('rx', 'fail-memo chat ' + ch.id);

    if (S._rxGid == null) await ensureCleanRegex();
    const gid = S._rxGid;
    if (gid == null) {
      S._rxBndAt = Date.now() - 240000;
      return bindDiag('rx', 'no-gid');
    }

    const chNow = await tavo.chat.current();
    if (!chNow || chNow.id !== ch.id) return bindDiag('rx', 'chat-switched');
    const known = chatRegexIds(chNow);
    if (!known) return bindDiag('rx', 'read-fail: regexIds=' + JSON.stringify(chNow.regexIds) + ' regexes=' + JSON.stringify(chNow.regexes));
    const ids = known.filter(function (x) {
      return x !== gid;
    });
    ids.push(gid);

    let form = 'regexIds';
    await tavo.chat.update(withPersona(chNow, { regexIds: ids }));
    await rxBoundCheck();
    if (S._rxUnbound) {
      form = 'regexes';
      await tavo.chat.update(withPersona(chNow, { regexes: ids }));
      await rxBoundCheck();
    }
    if (S._rxUnbound) {
      S._rxBindFail[ch.id] = Date.now();
      return bindDiag('rx', 'updated-still-unbound chat ' + ch.id + ' ids ' + JSON.stringify(ids));
    }
    return bindDiag('rx', 'updated via ' + form + ' chat ' + ch.id + ' ids ' + JSON.stringify(ids));
  } catch (e) {
    elog('привязка чистки к чату', e);
    try {
      const ch2 = ch || (await tavo.chat.current());
      if (ch2 && ch2.id != null) {
        S._rxBindFail = S._rxBindFail || {};
        S._rxBindFail[ch2.id] = Date.now();
      }
    } catch (e2) {}
    return bindDiag('rx', 'error: ' + String((e && e.message) || e).slice(0, 120));
  }
}

var WARD_TYPES = { outfit: 'outfit', hair: 'hair', makeup: 'face' };

async function wardItems(rev) {
  const c = S._wardKV;
  if (c && c.rev === rev && (Date.now() - c.at) < 45000) return c.v;
  let v = null;
  try {
    v = await tavo.get('iig_wardrobe', 'global');
  } catch (e) {
    return c ? c.v : [];
  }
  if (!Array.isArray(v)) v = [];
  S._wardKV = { at: Date.now(), rev: rev, v: v };
  return v;
}

async function wardWorn(rev) {
  const c = S._wardWornKV;
  if (c && c.rev === rev && (Date.now() - c.at) < 45000) return c.v;
  let v = null;
  try {
    v = await tavo.get('iig_ward_worn', 'global');
  } catch (e) {
    return c ? c.v : {};
  }
  if (!v || typeof v !== 'object') v = {};
  S._wardWornKV = { at: Date.now(), rev: rev, v: v };
  return v;
}

async function wardImg(path) {
  const m = S._wardImg || (S._wardImg = {});
  const hit = m[path];
  if (hit && hit.du) return hit.du;
  const du = await tavo.file.load(path, { encoding: 'dataUrl' });
  if (!du || String(du).indexOf('data:') !== 0 || !_imgOk(du)) throw new Error('файл пуст');
  const keys = Object.keys(m);
  if (keys.length >= 12) delete m[keys[0]];
  m[path] = { du: String(du), at: Date.now() };
  return m[path].du;
}

function wardSlot(it, du) {
  const owner = it.owner === 'user' ? 'user' : (it.owner === 'npc' ? 'npc' : 'char');
  const type = owner === 'npc' ? 'npc' : (WARD_TYPES[it.cat] || 'outfit');
  let note = String(it.tag || it.name || '').trim();
  if (owner === 'npc' && it.ownerName) note = String(it.ownerName).trim() + ': ' + note;
  const slot = {
    kind: du ? '' : 'text',
    dataUrl: du || '',
    type: type,
    note: note,
    target: owner === 'user' ? 'user' : 'char',
    enabled: true,
    ward: 1
  };
  if (owner === 'npc') slot.item = 1;
  return slot;
}

function wardRefMode(it) {
  const m = it && it.ref;
  return (m === 'text' || m === 'off') ? m : 'full';
}

function wardNameKey(s) {
  return String(s || '').trim().toLowerCase().replace(/\s+/g, ' ');
}

const CAST_TITLE = /^(the|mr|mrs|ms|miss|dr|sir|lady|lord|бармен|мистер|миссис|мисс|доктор|сэр|леди|лорд|господин|госпожа)$/;

function castNameKey(name) {
  const t = wardNameKey(name).split(' ').map(function (w) {
    return w.replace(/^[.,;:!?"'«»()]+|[.,;:!?"'«»()]+$/g, '');
  }).filter(Boolean);
  if (t.length > 1 && CAST_TITLE.test(t[0])) t.shift();
  return t.join(' ');
}

function castSame(a, b) {
  const x = castNameKey(a);
  const y = castNameKey(b);
  if (!x || !y) return false;
  if (x === y) return true;
  if (y.length >= 3 && (' ' + x + ' ').indexOf(' ' + y + ' ') >= 0) return true;
  return x.length >= 3 && (' ' + y + ' ').indexOf(' ' + x + ' ') >= 0;
}

function castFind(list, name) {
  return (list || []).find(function (x) {
    return x && castSame(x.name, name);
  });
}

function wardOwnerOk(it, nm) {
  if (!it || it.owner === 'npc') return true;
  const mine = wardNameKey(it.ownerName);
  if (!mine) return true;
  const cur = wardNameKey(it.owner === 'user' ? (nm && nm.user) : (nm && nm.char));
  return !!cur && cur === mine;
}

async function wardRefs() {
  let rev = 0;
  try {
    rev = (await tavo.get('iig_refs_rev', 'global')) || 0;
  } catch (e) {}
  const worn = await wardWorn(rev);
  const ids = Object.keys(worn).filter(function (k) {
    return worn[k];
  });
  if (!ids.length) return [];
  const items = await wardItems(rev);
  let nm = S._names;
  if (!nm || (!nm.user && !nm.char)) {
    try {
      nm = await castNames();
    } catch (e) {
      nm = nm || {};
    }
  }
  const out = [];
  for (const it of items) {
    if (!it || ids.indexOf(String(it.id)) < 0) continue;
    if (!wardOwnerOk(it, nm)) continue;
    const mode = wardRefMode(it);
    if (mode === 'off') continue;
    let du = '';
    if (it.img && mode === 'full') {
      try {
        du = await wardImg(it.img);
      } catch (e) {
        S._refLost.push('шкаф: фото «' + String(it.name || '').slice(0, 24) + '» не прочиталось — реф уехал текстом');
      }
    }
    const s = wardSlot(it, du);
    if (!s.note && !du) continue;
    out.push(s);
  }
  return out;
}

function refScopeOk(s, cur) {
  const sc = String((s && s.scope) || '');
  if (!sc) return true;
  const k = sc.indexOf(':');
  if (k < 0) return true;
  const kind = sc.slice(0, k);
  const val = sc.slice(k + 1);
  if (kind === 'chat') return cur.chatId !== '' && cur.chatId === val;
  if (kind === 'char') return wardNameKey(cur.char) === wardNameKey(val);
  if (kind === 'user') return wardNameKey(cur.user) === wardNameKey(val);
  return true;
}

async function refScopeNow() {
  let chatId = '';
  let chars = [];
  try {
    const ch = await tavo.chat.current();
    if (ch && ch.id != null) chatId = String(ch.id);
    if (ch && Array.isArray(ch.characters)) chars = ch.characters;
  } catch (e) {}
  let nm = {};
  try {
    nm = await castNames();
  } catch (e) {}
  return { chatId: chatId, char: nm.char || '', user: nm.user || '', chars: chars };
}

async function groupRefs(cur, cfg) {
  if (!cur.chars || cur.chars.length < 2) return [];
  const text = String(S._castPost || '').toLowerCase();
  if (!text) return [];
  const key = cur.chatId + '|' + cur.chars.map(function (c) {
    return c && c.id;
  }).join(',');
  let kv = S._grpKV;
  if (!kv || kv.key !== key || (Date.now() - kv.at) > 120000) {
    let pp = null;
    try {
      pp = await tavo.get('iig_passports', 'global');
    } catch (e) {}
    const list = [];
    for (const c0 of cur.chars.slice(1, 5)) {
      if (!c0 || c0.id == null) continue;
      let c = c0;
      if (!c.name || !(c.avatar || (c.data && c.data.avatar))) {
        try {
          c = (await tavo.character.get(c0.id)) || c0;
        } catch (e) {}
      }
      const name = String(c0.name || (c && c.name) || '').trim();
      if (!name) continue;
      let du = '';
      try {
        const av = c.avatar || (c.data && c.data.avatar) || '';
        const b = av ? await _avB64(av, (cfg && cfg.refMaxPx) || 768) : '';
        if (b) du = 'data:image/jpeg;base64,' + b;
      } catch (e) {}
      list.push({ name: name, dataUrl: du, pass: (pp && pp[name]) ? String(pp[name]).trim() : '' });
    }
    kv = { key: key, at: Date.now(), list: list };
    S._grpKV = kv;
  }
  const out = [];
  for (const x of kv.list) {
    if (text.indexOf(x.name.toLowerCase()) < 0) continue;
    if (!x.dataUrl && !x.pass) continue;
    const note = x.name + (x.pass ? (': ' + x.pass) : ' - a separate person, keep this face only for ' + x.name);
    out.push({ kind: x.dataUrl ? '' : 'text', dataUrl: x.dataUrl || '', type: 'npc', note: note, target: 'char', enabled: true, ward: x.pass ? 1 : 0, pass: 1 });
    if (out.length >= 3) break;
  }
  return out;
}

async function loadRefs() {
  const all = await loadRefs0();
  let cur = null;
  try {
    cur = await refScopeNow();
  } catch (e) {}
  const v = cur ? all.filter(function (s) {
    return refScopeOk(s, cur);
  }) : all;
  if (S._stSlots) {
    const who = S._stWho || {};
    return (S._stNoOwn ? [] : v.filter(function (s) {
      return stOwnRefOk(s, who);
    })).concat(S._stSlots);
  }
  let w = [];
  try {
    w = await wardRefs();
  } catch (e) {}
  try {
    w = w.concat(await worldRefs());
  } catch (e) {}
  try {
    w = w.concat(await castRefs());
  } catch (e) {}
  try {
    if (cur) w = w.concat(await groupRefs(cur, S._cfgCache && S._cfgCache.v));
  } catch (e) {}
  return w.length ? npcDedup(v.concat(w)) : npcDedup(v);
}

function npcDedup(list) {
  const arr = Array.isArray(list) ? list : [];
  const groups = [];
  const at = [];
  arr.forEach(function (s, i) {
    if (!s || s.type !== 'npc' || s.item || s.enabled === false) return;
    const nm = refNpcName(s);
    if (!castNameKey(nm)) return;
    const rank = s.dataUrl ? (s.pass ? 2 : 1) : 0;
    let g = null;
    for (const x of groups) {
      if (castSame(x.nm, nm)) {
        g = x;
        break;
      }
    }
    if (!g) {
      g = { nm: nm, first: i, pick: i, rank: rank };
      groups.push(g);
    } else if (rank > g.rank) {
      g.pick = i;
      g.rank = rank;
    }
    at[i] = g;
  });
  const out = [];
  arr.forEach(function (s, i) {
    const g = at[i];
    if (!g) out.push(s);
    else if (g.first === i) out.push(arr[g.pick]);
  });
  return out;
}

async function wardEnsureBound() {
  let ch = null;
  try {
    if (!tavo.chat || !tavo.chat.update) return bindDiag('ward', 'no-api');
    let lb = null;
    try {
      lb = await tavo.get('iig_ward_lb', 'global');
    } catch (e) {
      return bindDiag('ward', 'lb-read-fail');
    }
    if (!lb || lb.id == null) return bindDiag('ward', 'no-lb');
    ch = await tavo.chat.current();
    if (!ch || ch.id == null) return bindDiag('ward', 'no-chat');
    const have = [];
    const src = Array.isArray(ch.lorebookIds) ? ch.lorebookIds : (ch.lorebooks || []).map(function (x) {
      return x && x.id;
    });
    for (const x of src) if (x != null && have.indexOf(x) < 0) have.push(x);
    if (have.indexOf(lb.id) >= 0) return bindDiag('ward', 'bound');
    S._wardBindFail = S._wardBindFail || {};
    if (S._wardBindFail[ch.id] && Date.now() - S._wardBindFail[ch.id] < 600000) return bindDiag('ward', 'fail-memo chat ' + ch.id);
    let book = null;
    try {
      book = (tavo.lorebook && tavo.lorebook.get) ? await tavo.lorebook.get(lb.id) : null;
    } catch (e) {}
    if (!book) {
      S._wardBindFail[ch.id] = Date.now();
      return bindDiag('ward', 'book-missing ' + lb.id);
    }
    const want = have.concat([lb.id]);
    const liveHas = async function () {
      const now = await tavo.chat.current();
      if (!now || now.id !== ch.id) return true;
      const cur = Array.isArray(now.lorebookIds) ? now.lorebookIds : (now.lorebooks || []).map(function (x) {
        return x && x.id != null ? x.id : x;
      });
      return cur.indexOf(lb.id) >= 0;
    };
    let form = 'lorebookIds';
    await tavo.chat.update(withPersona(ch, { lorebookIds: want }));
    if (!(await liveHas())) {
      form = 'lorebooks';
      await tavo.chat.update(withPersona(ch, { lorebooks: want }));
      if (!(await liveHas())) {
        S._wardBindFail[ch.id] = Date.now();
        return bindDiag('ward', 'updated-still-unbound chat ' + ch.id + ' ids ' + JSON.stringify(want));
      }
    }
    actNote('лорбук картинок «' + String(book.name || lb.name || '') + '» привязан к чату');
    return bindDiag('ward', 'updated via ' + form + ' chat ' + ch.id + ' ids ' + JSON.stringify(want));
  } catch (e) {
    elog('привязка лорбука картинок к чату', e);
    try {
      if (ch && ch.id != null) {
        S._wardBindFail = S._wardBindFail || {};
        S._wardBindFail[ch.id] = Date.now();
      }
    } catch (e2) {}
    return bindDiag('ward', 'error: ' + String((e && e.message) || e).slice(0, 120));
  }
}

function wardBindTick() {
  if (S._wardBndAt && Date.now() - S._wardBndAt < 300000) return;
  S._wardBndAt = Date.now();
  wardEnsureBound();
}

function autoMode(cfg) {
  const m = String((cfg && cfg.autoMode) || '').trim();
  if (m === 'all' || m === 'new' || m === 'off') return m;
  return (cfg && cfg.autoOn) ? 'all' : 'off';
}

function refLostNote() {
  const a = (S._refLost || []).filter(Boolean);
  if (!a.length) return '';
  const seen = {};
  const out = [];
  for (const x of a) {
    const k = String(x);
    if (seen[k]) continue;
    seen[k] = 1;
    out.push(k);
  }
  return ' · не уехало: ' + out.join('; ');
}

function pwSrcNote(cfg) {
  if (!cfg || cfg.pwChat !== false) return 'модель чата';
  const m = String((cfg && cfg.pwModel) || '').trim();
  return 'своё подключение (' + (m || 'модель не выбрана') + ')';
}

async function pwStyleText(cfg) {
  const name = String((cfg && cfg.promptName) || '').trim();
  if (!name) return null;
  let rev = 0;
  try {
    rev = (await tavo.get('iig_pw_rev', 'global')) || 0;
  } catch (e) {}
  const now = Date.now();
  const c = S._styleKV;
  if (c && c.name === name && c.rev === rev && (now - c.at) < 30000) return c.v;
  let arr = null;
  try {
    arr = await tavo.get('iig_prompts', 'global');
  } catch (e) {
    return null;
  }
  if (!Array.isArray(arr)) return null;
  const p = arr.find(function (x) {
    return x && x.name === name;
  });
  const v = p ? { text: String(p.text || ''), own: typeof p.own === 'boolean' ? p.own : null, name: name } : null;
  S._styleKV = { at: now, name: name, rev: rev, v: v };
  return v;
}

async function pwOwn(cfg) {
  if (cfg && typeof cfg._own === 'boolean') return cfg._own;
  const name = String((cfg && cfg.promptName) || '').trim();
  const now = Date.now();
  if (S._ownAt && now - S._ownAt < 8000 && S._ownFor === name) return S._own;
  let own = null;
  try {
    const v = await tavo.get('iig_pw_own', 'global');
    if (typeof v === 'boolean') own = v;
  } catch (e) {}

  if (own === null) {
    own = name ? !SEEDPACK.some(function (x) {
      return x && x[0] === name;
    }) : false;
  }
  S._own = own;
  S._ownFor = name;
  S._ownAt = now;
  return own;
}

const pwOwn0 = pwOwn;
pwOwn = async function (cfg) {
  if (cfg && typeof cfg._own === 'boolean') return cfg._own;
  let st = null;
  try {
    st = await pwStyleText(cfg);
  } catch (e) {}
  if (st && typeof st.own === 'boolean') return st.own;
  return pwOwn0(cfg);
};

async function visMsgs() {
  const out = [];
  try {
    const arr = (await tavo.message.find([0])) || [];
    for (const m of arr) {
      if (m && !m.hidden) out.push(m);
    }
  } catch (e) {}
  return out;
}

function directAsk(txt) {
  txt = String(txt || '');
  if (!/\[\s*OOC\b/i.test(txt)) return '';
  if (!/картин|изображени|нарисуй|сгенерируй|генерац|arts?\b|generate\s+an?\s+(image|pic|art)|image\s+generation|draw\s+/i.test(txt)) return '';

  if (/(?:(?:^|[^0-9A-Za-zЀ-ӿ])(?:не|без)(?![Ѐ-ӿ])|\bno\b|\bnot\b|\bdon'?t\b|\bwithout\b)[^.!?\n]{0,32}?(?:картин|изображ|рисуй|генер|image|pic\b|art\b|draw)/i.test(txt)) return '';

  return txt.replace(/\[\s*OOC:?/gi, ' ').replace(/\]/g, ' ').replace(/\s+/g, ' ').trim();
}

async function userAskBefore(id) {
  try {
    const cnt = await tavo.message.count();
    const from = cnt > 60 ? cnt - 60 : 0;
    const arr = (await tavo.message.find([from])) || [];
    let seen = false;
    for (let i = arr.length - 1; i >= 0; i--) {
      const m = arr[i];
      if (!m) continue;
      if (!seen) {
        if (m.id === id) seen = true;
        continue;
      }
      if (m.hidden) continue;
      if (m.role === 'user') return directAsk(m.content);
      return '';
    }
  } catch (e) {}
  return '';
}

async function lastAssistant() {
  try {
    const cnt = await tavo.message.count();
    if (!cnt) return null;
    const from = cnt > 6 ? cnt - 6 : 0;
    const arr = await tavo.message.find([from]);
    for (let i = (arr || []).length - 1; i >= 0; i--) {
      const m = arr[i];
      if (m && m.role === 'assistant' && !m.hidden) return m;
    }
  } catch (e) {}
  return null;
}

function rrFile(id, n, at) {
  const t = Math.floor(Number(at));
  return 'iig_rr' + id + '_' + n + '_' + (t > 0 ? t : Date.now()).toString(36) + '.png';
}

function rrBase(p) {
  return String(p || '').split('/').pop();
}

function rrIsStash(p) {
  return rrBase(p).indexOf('iig_rr') === 0;
}

async function rrIds() {
  if (S._rrIds) return S._rrIds;
  let v = null;
  try {
    v = await tavo.get('iig_rr_ids', 'chat');
  } catch (e) {
    return [];
  }
  S._rrIds = Array.isArray(v) ? v.slice() : [];
  return S._rrIds;
}

async function rrIdsSave() {
  try {
    await tavo.set('iig_rr_ids', (S._rrIds || []).slice(), 'chat');
  } catch (e) {}
}

async function rrGet(id) {
  if (!S._rr) S._rr = {};
  if (S._rr[id] !== undefined) return S._rr[id];
  let v = null;
  try {
    v = await tavo.get(skey(id, 'rr'), 'chat');
  } catch (e) {
    return null;
  }
  S._rr[id] = (v && v.tk && Array.isArray(v.list)) ? v : null;
  return S._rr[id];
}

async function rrPut(id, L) {
  if (!S._rr) S._rr = {};
  S._rr[id] = L;
  try {
    await tavo.set(skey(id, 'rr'), L, 'chat');
  } catch (e) {}
  const ids = await rrIds();
  if (ids.indexOf(id) < 0) {
    ids.push(id);
    await rrIdsSave();
  }
}

async function rrForget(id) {
  if (!S._rr) S._rr = {};
  S._rr[id] = null;
  try {
    await tavo.unset(skey(id, 'rr'), 'chat');
  } catch (e) {}
  const ids = await rrIds();
  const k = ids.indexOf(id);
  if (k >= 0) {
    ids.splice(k, 1);
    await rrIdsSave();
  }
}

async function rrWipeFiles(L, keepPath) {
  if (!L || !Array.isArray(L.list)) return;
  for (const e of L.list) {
    if (!e || !e.p || e.p === keepPath || !rrIsStash(e.p)) continue;
    try {
      await tavo.file.delete(rrBase(e.p), { scope: 'chat' });
    } catch (e2) {}
  }
}

async function rrDrop(id) {
  const L = await rrGet(id);
  await rrForget(id);
  await rrWipeFiles(L, '');
}

async function rrDecorate(id, v) {
  if (!v || v.state !== 'ok' || !v.path) return v;
  const ids = await rrIds();
  let rr = null;
  if (ids.indexOf(id) >= 0) {
    const L = await rrGet(id);
    if (L && L.tk === v.tk && L.list.length > 1) {
      for (let k = 0; k < L.list.length; k++) {
        if (L.list[k] && L.list[k].p === v.path) rr = { i: k, n: L.list.length };
      }
    }
  }
  if (!rr && !v.rr) return v;
  const out = Object.assign({}, v);
  if (rr) out.rr = rr;
  else delete out.rr;
  return out;
}

async function rrBegin(id, tk, prev) {
  if (!prev || prev.state !== 'ok' || !prev.path || !tk) return null;
  let L = await rrGet(id);
  if (prev.tk && prev.tk !== tk) {
    if (L) await rrDrop(id);
    return null;
  }
  if (L && L.tk !== tk) {
    await rrDrop(id);
    L = null;
  }
  if (L) L = { tk: L.tk, seq: L.seq || 0, list: L.list.slice() };
  else L = { tk: tk, seq: 0, list: [{ p: prev.path, at: prev.at || 0, ar: prev.ar || '', prompt: prev.prompt || '', note: prev.note || '', chars: Array.isArray(prev.chars) ? prev.chars : [] }] };
  const canon = fileNameFor(tk);
  for (let k = L.list.length - 1; k >= 0; k--) {
    const e = L.list[k];
    if (!e || rrBase(e.p) !== canon) continue;
    let saved = '';
    try {
      const bytes = await imgBytes(e.p);
      if (bytes) {
        L.seq++;
        const nm = rrFile(id, L.seq, e.at);
        await tavo.file.save(nm, bytes, { scope: 'chat' });
        saved = 'files/chat/' + nm;
      }
    } catch (e2) {}
    if (saved) L.list[k] = Object.assign({}, e, { p: saved });
    else L.list.splice(k, 1);
  }
  return L;
}

async function rrEnd(id, L, entry) {
  if (!L) return;
  L.list.push(entry);
  await rrPut(id, L);
}

async function rrSelect(id, i) {
  if (S._inflight[keyFor(id)]) return;
  const L = await rrGet(id);
  const cur = await imgGet(id);
  if (!L || !cur || cur.state !== 'ok' || cur.tk !== L.tk) return;
  const e = L.list[i];
  if (!e || !e.p) return;
  await imgSet(id, {
    state: 'ok',
    key: keyFor(id),
    tk: L.tk,
    path: e.p,
    ar: e.ar || cur.ar || '',
    at: e.at || Date.now(),
    prompt: e.prompt || '',
    note: e.note || ''
  });
  try {
    if (e.prompt) {
      await tavo.set(skey(id, 'p'), e.prompt, 'chat');
      await tavo.set(skey(id, 'nc'), Array.isArray(e.chars) ? e.chars : [], 'chat');
      await tavo.set(skey(id, 'ptk'), L.tk, 'chat');
      await tavo.set(skey(id, 'ps'), 0, 'chat');
      await tavo.set(skey(id, 'pf'), 0, 'chat');
    }
    if (e.note) await tavo.set(skey(id, 'r'), e.note, 'chat');
  } catch (e2) {}
  ringFragments();
}

async function rrCollapse(id) {
  if (S._inflight[keyFor(id)]) return;
  const L = await rrGet(id);
  if (!L) {
    await rrForget(id);
    return;
  }
  const cur = await imgGet(id);
  if (!cur || cur.state !== 'ok' || cur.tk !== L.tk || !cur.path) {
    await rrDrop(id);
    return;
  }
  const canon = fileNameFor(L.tk);
  let path = cur.path;
  let keep = '';
  if (rrBase(cur.path) !== canon) {
    try {
      const bytes = await imgBytes(cur.path);
      if (bytes) {
        const p2 = await tavo.file.save(canon, bytes, { scope: 'chat' });
        if (p2) path = p2;
        await tavo.file.save(sideNameFor(L.tk), JSON.stringify({ prompt: cur.prompt || '', note: cur.note || '', ar: cur.ar || '' }), { scope: 'chat' });
      }
    } catch (e) {}
    if (path === cur.path) keep = cur.path;
  }
  await rrForget(id);
  const next = Object.assign({}, cur, { path: path });
  if (path !== cur.path) next.at = Date.now();
  delete next.rr;
  await imgSet(id, next);
  await rrWipeFiles(L, keep);
}

async function rrCollapseAll(exceptId) {
  if (S._rrBusy) return;
  S._rrBusy = 1;
  let n = 0;
  try {
    const ids = (await rrIds()).slice();
    for (const id of ids) {
      if (id === exceptId) continue;
      await rrCollapse(id);
      n++;
    }
  } catch (e) {} finally {
    S._rrBusy = 0;
  }
  if (n) ringFragments();
}

async function setPromptFor(id, text) {
  const prompt = String(text || '').trim();
  if (!prompt) return toast('IIG: промпт пуст — не сохранён');
  const msg = await msgById(id);
  if (!msg) return toast('IIG: пост не найден');
  await tavo.set(skey(id, 'p'), prompt, 'chat');
  try {
    await tavo.set(skey(id, 'nc'), [], 'chat');
    await tavo.set(skey(id, 'ps'), 0, 'chat');
    await tavo.set(skey(id, 'pf'), 0, 'chat');
  } catch (e) {}
  try {
    await tavo.set(skey(id, 'ptk'), textKey(msg.content), 'chat');
  } catch (e) {}
  actNote('промпт поста ' + id + ' сохранён — ↻ нарисует по нему');
}

async function worldRefs() {
  let rev = 0;
  try {
    rev = (await tavo.get('iig_refs_rev', 'global')) || 0;
  } catch (e) {}
  let c = S._worldKV;
  if (!c || c.rev !== rev || (Date.now() - c.at) >= 45000) {
    let on = null;
    let items = [];
    try {
      on = await tavo.get('iig_world_on', 'global');
    } catch (e) {
      return [];
    }
    if (!on || typeof on !== 'object') on = {};
    const any = Object.keys(on).some(function (k) {
      return on[k];
    });
    if (any) {
      try {
        items = await tavo.get('iig_world', 'global');
      } catch (e) {
        return [];
      }
    }
    if (!Array.isArray(items)) items = [];
    c = { at: Date.now(), rev: rev, on: on, items: items };
    S._worldKV = c;
  }
  let nm = S._names;
  const out = [];
  for (const it of c.items) {
    if (!it || !c.on[String(it.id)]) continue;
    if (it.owner === 'char' || it.owner === 'user') {
      if (!nm || (!nm.user && !nm.char)) {
        try {
          nm = await castNames();
        } catch (e) {
          nm = nm || {};
        }
      }
      if (!wardOwnerOk(it, nm)) continue;
    }
    const mode = wardRefMode(it);
    if (mode === 'off') continue;
    let du = '';
    if (it.img && mode === 'full') {
      try {
        du = await placeSheet(it.img);
      } catch (e) {
        S._refLost.push('мир: фото «' + String(it.name || '').slice(0, 24) + '» не прочиталось — реф уехал текстом');
      }
    }
    const note = String(it.tag || it.name || '').trim();
    if (!note && !du) continue;
    for (const s of placeSlots(it, du, note)) out.push(s);
  }
  return out;
}

var ST_KEEP = 24;

const _readPwPrompt0 = _readPwPrompt;
_readPwPrompt = async function (cfg) {
  if (cfg && typeof cfg._guideText === 'string' && cfg._guideText) return cfg._guideText;
  let st = null;
  try {
    st = await pwStyleText(cfg);
  } catch (e) {}
  if (st && st.text) return st.text;
  return _readPwPrompt0(cfg);
};

function stJob(id, o) {
  return Promise.resolve(tavo.set('iig_st_job', Object.assign({ id: id, at: Date.now() }, o), 'global')).catch(function () {});
}

async function stQuiet() {
  for (let i = 0; i < 240; i++) {
    if (!Object.keys(S._inflight).length) return true;
    await new Promise(function (r) {
      setTimeout(r, 500);
    });
  }
  return false;
}

async function stStyle(cfg2, name) {
  name = String(name || '').trim();
  if (!name) return '';
  let list = null;
  try {
    list = await tavo.get('iig_prompts', 'global');
  } catch (e) {}
  if (!Array.isArray(list)) return '';
  for (const p of list) {
    if (!p || p.name !== name || !p.text) continue;
    cfg2._guideText = String(p.text);
    cfg2.promptName = name;
    cfg2.styleNegative = String(p.neg || '');
    cfg2._own = typeof p.own === 'boolean' ? p.own : !SEEDPACK.some(function (x) {
      return x && x[0] === name;
    });
    return name;
  }
  return '';
}

async function stSlots(itemIds, placeId) {
  const out = [];
  const places = [];
  const want = Array.isArray(itemIds) ? itemIds.map(String) : [];
  if (want.length) {
    let items = [];
    try {
      items = (await tavo.get('iig_wardrobe', 'global')) || [];
    } catch (e) {}
    for (const it of (Array.isArray(items) ? items : [])) {
      if (!it || want.indexOf(String(it.id)) < 0) continue;
      const mode = wardRefMode(it);
      if (mode === 'off') continue;
      let du = '';
      if (it.img && mode === 'full') {
        try {
          du = await wardImg(it.img);
        } catch (e) {}
      }
      const s = wardSlot(it, du);
      if (s.note || du) out.push(s);
    }
  }
  if (placeId != null && placeId !== '') {
    let world = [];
    try {
      world = (await tavo.get('iig_world', 'global')) || [];
    } catch (e) {}
    for (const it of (Array.isArray(world) ? world : [])) {
      if (!it || String(it.id) !== String(placeId)) continue;
      const mode = wardRefMode(it);
      if (mode === 'off') continue;
      let du = '';
      if (it.img && mode === 'full') {
        try {
          du = await placeSheet(it.img);
        } catch (e) {}
      }
      const note = String(it.tag || it.name || '').trim();
      if (!note && !du) continue;
      places.push(String(it.name || it.tag || '').trim());
      for (const s of placeSlots(it, du, note)) out.push(s);
    }
  }
  return { slots: out, places: places };
}

function stScene(c, nm, places) {
  const who = [];
  if (c.cast) who.push(String(c.cast));
  if (nm.char) who.push(nm.char);
  if (nm.user) who.push(nm.user);
  let t = String(c.text || '').trim();
  t += '\n\nIn frame: ' + (who.length ? (who.join(' and ') + ' - nobody else.') : 'no people at all, only the place and objects.');
  if (places.length) t += '\nLocation: ' + places.join(', ') + '. Describe this setting in the prompt in your own words; the characters are inside it.';
  return t;
}

const castNames0 = castNames;
castNames = async function () {
  if (S._stCast) return S._names;
  return castNames0();
};

const castPass0 = castPass;
castPass = async function () {
  if (S._stCast) return S._pass;
  return castPass0();
};

async function stWho(c) {
  const who = { char: null, user: null };
  const pick = async function (api, id) {
    if (id == null || id === '' || !api || typeof api.get !== 'function') return null;
    try {
      const o = await api.get(id);
      if (o && o.name) return { name: String(o.name), avatar: o.avatar || (o.data && o.data.avatar) || null };
    } catch (e) {}
    return null;
  };
  who.char = await pick(tavo.character, c.charId);
  who.user = await pick(tavo.persona, c.userId);
  return who;
}

async function stPassports() {
  let pp = null;
  let pi = null;
  try {
    pp = await tavo.get('iig_passports', 'global');
  } catch (e) {}
  try {
    pi = await tavo.get('iig_pp_imgs', 'global');
  } catch (e) {}
  return [pp && typeof pp === 'object' ? pp : null, pi && typeof pi === 'object' ? pi : null];
}

async function stRefs(cfg, who) {
  S._refLost = [];
  const out = [];
  const stP = await stPassports();
  const pp = stP[0];
  const pi = stP[1];
  const cN = who.char ? who.char.name : '';
  const uN = who.user ? who.user.name : '';
  const passC = (pp && cN && pp[cN]) ? String(pp[cN]).trim() : '';
  const passU = uN ? String(ppUser(pp, uN) || '').trim() : '';
  S._names = { char: cN, user: uN };
  S._pass = { char: passC, user: passU };
  for (const kind of ['char', 'user']) {
    const w = who[kind];
    if (!w) continue;
    const pass = kind === 'char' ? passC : passU;
    let du = kind === 'char' ? ((pi && cN && pi[cN]) || null) : (pi ? ppUser(pi, uN) : null);
    if (!du && w.avatar) {
      try {
        const b = await _avB64(w.avatar, cfg.refMaxPx);
        if (b) du = 'data:image/jpeg;base64,' + b;
      } catch (e) {}
    }
    if (du) {
      out.push({ who: kind, nm: w.name, dataUrl: du, label: identityLabel(kind, cN, uN) + (pass ? (' APPEARANCE NOTES for this character (authoritative, follow exactly): ' + pass) : '') });
    } else {
      S._refLost.push('аватар ' + kind + ' недоступен');
      if (pass) out.push({ textOnly: true, who: kind, nm: w.name, label: 'APPEARANCE of the ' + kind + ' ' + w.name + ' (authoritative, follow exactly): ' + pass });
    }
  }
  let slots = [];
  try {
    slots = await loadRefs();
  } catch (e) {}
  for (const s of slots) {
    if (!s || s.enabled === false) continue;
    if (s.kind === 'text' || (!s.dataUrl && String(s.note || '').trim())) {
      const tl = buildTextRefLabel(s.type, s.note, s.target, cN, uN);
      if (tl) out.push({ textOnly: true, label: tl, note: s.note, rtype: s.type, tgt: s.target, ward: !!s.ward });
    } else if (s.dataUrl) {
      out.push({ dataUrl: s.dataUrl, label: buildRefLabel(s.type, s.note, s.target, cN, uN), rtype: s.type, tgt: s.target, note: s.note });
      if (s.ward) {
        const tw = buildTextRefLabel(s.type, s.note, s.target, cN, uN);
        if (tw) out.push({ textOnly: true, label: tw, note: s.note, rtype: s.type, tgt: s.target, ward: !!s.ward });
      }
    }
  }
  const ptxt = [];
  for (let oi = out.length - 1; oi >= 0; oi--) {
    if (out[oi].textOnly) {
      ptxt.unshift(out[oi]);
      out.splice(oi, 1);
    }
  }
  S._textRefs = ptxt;
  for (let wi = 0; wi < out.length; wi++) {
    try {
      const wd = await _refWire(out[wi].dataUrl, cfg && cfg.refMaxPx, out[wi].label);
      if (wd) out[wi] = Object.assign({}, out[wi], { dataUrl: wd });
    } catch (eW) {}
  }
  return out;
}

async function stIndexAdd(rec) {
  let list = [];
  try {
    list = (await tavo.get('iig_studio', 'global')) || [];
  } catch (e) {
    return;
  }
  if (!Array.isArray(list)) list = [];
  list.unshift(rec);
  while (list.length > ST_KEEP) {
    const old = list.pop();
    const nm = String((old && old.path) || '').split('/').pop();
    if (nm.indexOf('iig_st_') === 0) {
      try {
        await tavo.file.delete(nm, { scope: 'global' });
      } catch (e) {}
    }
  }
  await tavo.set('iig_studio', list, 'global');
}

const ST_UP_PROMPT = 'Upscale and enhance the provided source image. Increase resolution, sharpness, texture fidelity and fine detail. Keep the composition, characters, faces, expressions, pose, colors, lighting, art style and every element EXACTLY the same - do not add, remove, restyle or reinterpret anything.';
const ST_UP_REF = 'the EXACT source image to upscale - reproduce it identically at higher resolution and detail';
const ST_UP_SRC_PX = 1024;

function stWardSlotsForFrame(slots, who) {
  const out = [];
  for (const s of (slots || [])) {
    if (!s) continue;
    if (s.type === 'background' || s.type === 'npc') {
      out.push(s);
      continue;
    }
    const target = s.target === 'user' ? 'user' : 'char';
    if (!(who && who[target])) continue;
    const note = String(s.note || '').trim();
    out.push(Object.assign({}, s, { target: target, note: note + (s.dataUrl ? ' - the person modelling it in the photo is NOT in this picture, only the item is' : '') }));
  }
  return out;
}

function stOwnRefOk(s, who) {
  if (!s) return false;
  if (s.type === 'background' || s.type === 'style' || s.type === 'object' || s.type === 'npc' || s.type === 'other') return true;
  const target = s.target === 'user' ? 'user' : 'char';
  return target === 'user' ? !!who.user : !!who.char;
}

function stUpscaleRun(c) {
  S._stQ = (S._stQ || Promise.resolve()).then(function () {
    return stUpscaleJob(c);
  }, function () {
    return stUpscaleJob(c);
  });
  return S._stQ;
}

async function stUpscaleJob(c) {
  const jobId = String((c && c.jid) || Date.now().toString(36)).replace(/[^0-9a-z]/gi, '').toLowerCase() || Date.now().toString(36);
  let ac = null;
  actStart('студия: улучшаю качество');
  try {
    await stJob(jobId, { state: 'image', k: 1, n: 1 });
    if (!(await stQuiet())) throw new Error('в чате всё ещё идёт генерация — попробуй позже');
    const cfg = await resolveCfg();
    if (cfg._vaultErr) throw new Error(cfg._vaultErr);
    if (!cfg.apiKey) throw new Error('нет ключа — открой панель, вкладка api');
    if (cfg.apiStyle === 'novelai') {
      const naiNo = 'NovelAI: улучшение размера не поддерживается — используй доработку';
      toast(naiNo);
      await stJob(jobId, { state: 'error', error: naiNo });
      actEnd('студия: ' + naiNo);
      return;
    }
    let list = [];
    try {
      list = (await tavo.get('iig_studio', 'global')) || [];
    } catch (e) {}
    const rec = (Array.isArray(list) ? list : []).find(function (x) {
      return x && String(x.id) === String(c.rid != null ? c.rid : c.id);
    });
    if (!rec || !rec.path) throw new Error('картинка не найдена в студии');
    const nm = String(rec.path).split('/').pop();
    let src = await tavo.file.load(nm, { encoding: 'dataUrl', scope: 'global' });
    if (!src || !_imgOk(src)) throw new Error('файл картинки не прочитался');
    try {
      const comma = src.indexOf(',');
      const head = src.slice(0, comma);
      const mime = (head.match(/data:([^;]+)/) || [])[1] || 'image/png';
      const small = await _avShrink(src.slice(comma + 1), mime, ST_UP_SRC_PX);
      if (small) src = 'data:image/jpeg;base64,' + small;
    } catch (e) {}
    try {
      ac = new AbortController();
    } catch (e) {}
    if (ac) S._acReg.iig_studio = ac;
    const ar = VALID_AR.indexOf(rec.ar) >= 0 ? rec.ar : (cfg.aspectRatio || '1:1');
    const cur = rec.up || rec.sz || cfg.imageSize || '1K';
    const sz = nextSize(cur);
    const key = (cfg.model || '') + '|' + sz;
    let downgraded = !!(S._szNo && S._szNo[key]);
    const ecfg = Object.assign({}, cfg, { maxRetries: 2, _deadline: Date.now() + GEN_DEADLINE, _szAuto: false, aspectRatio: ar });
    if (ac) ecfg._sig = ac.signal;
    let erefs = [{ dataUrl: src, label: ST_UP_REF }];
    let etag = { prompt: ST_UP_PROMPT, aspect_ratio: ar, image_size: downgraded ? (cfg.imageSize || '1K') : sz };
    if (taMode(cfg)) {
      ecfg.ta = taNorm(c.ta || rec.ta || cfg.ta);
      erefs = [];
      etag = { prompt: String(rec.prompt || ''), aspect_ratio: ar, image_size: sz, _taUp: { src: src }, _taManual: 1, _taKey: jobId };
    }
    let out;
    try {
      out = await withRetry(function () {
        return generate(etag, erefs, ecfg);
      }, ecfg);
    } catch (e0) {
      if (downgraded || !sizeRefused(e0) || taMode(cfg)) throw e0;
      S._szNo = S._szNo || {};
      S._szNo[key] = 1;
      downgraded = true;
      out = await withRetry(function () {
        return generate(Object.assign({}, etag, { image_size: cfg.imageSize || '1K' }), erefs, ecfg);
      }, ecfg);
    }
    const tamU = taMode(cfg) ? taTake(jobId) : null;
    if (/^https?:/i.test(String(out))) {
      const d = await urlToDataUrl(out, ecfg._sig);
      if (!d) throw new Error('картинка пришла ссылкой, скачать не удалось');
      out = d;
    }
    const path = await tavo.file.save('iig_st_' + jobId + '.png', out, { scope: 'global' });
    await stIndexAdd(Object.assign({
      id: jobId,
      path: String(path),
      text: rec.text || '',
      ar: ar,
      style: rec.style || '',
      who: rec.who || '',
      prompt: rec.prompt || '',
      req: rec.req || null,
      up: taMode(cfg) ? ('x' + ecfg.ta.hrScale) : (downgraded ? (rec.up || null) : sz),
      from: rec.id,
      prov: String(cfg.apiStyle || ''),
      ta: taMode(cfg) ? taNoKeys(ecfg.ta) : null,
      note: S._naiNote || '',
      at: Date.now()
    }, taMode(cfg) ? { tam: tamU } : {}));
    await stJob(jobId, { state: 'ok', ids: [jobId] });
    actEnd(taMode(cfg) ? ('студия: улучшено в ' + ecfg.ta.hrScale + ' раза' + (S._naiNote ? ' · ' + S._naiNote : '')) : (downgraded ? ('студия: модель не даёт ' + sz + ' — улучшена детализация без роста размера') : ('студия: улучшено до ' + sz)));
    try {
      _statAdd({ imgs: 1, imgTok: S._lastImgTok || 0 });
      S._lastImgTok = 0;
    } catch (e) {}
  } catch (e) {
    const t = errText(e);
    await stJob(jobId, { state: 'error', error: t });
    elog('студия · улучшение', t);
    actEnd('студия: улучшить не вышло — ' + String(t).slice(0, 90));
  } finally {
    if (ac && S._acReg.iig_studio === ac) delete S._acReg.iig_studio;
  }
}

const ST_EDIT_REF = 'the EXACT source image to edit - apply only the requested fix, keep everything else identical';
const ST_EDIT_MARK_REF = 'the same source image with a RED outline marking the only area that must change - the outline is a pointer, never reproduce it';
const ST_EDIT_MAX_STROKES = 6;
const ST_EDIT_MAX_PTS = 80;

function stMarkNorm(mark) {
  if (!Array.isArray(mark)) return null;
  const out = [];
  let same = mark.length <= ST_EDIT_MAX_STROKES;
  for (const st of mark) {
    if (out.length >= ST_EDIT_MAX_STROKES) break;
    if (!Array.isArray(st)) {
      same = false;
      continue;
    }
    if (st.length > ST_EDIT_MAX_PTS) same = false;
    const pts = [];
    for (const p of st) {
      if (pts.length >= ST_EDIT_MAX_PTS) break;
      const x = Array.isArray(p) ? p[0] : NaN;
      const y = Array.isArray(p) ? p[1] : NaN;
      if (typeof x !== 'number' || typeof y !== 'number' || !(x >= 0 && x <= 1 && y >= 0 && y <= 1) || p.length !== 2) {
        same = false;
        continue;
      }
      pts.push([x, y]);
    }
    if (pts.length >= 2) out.push(pts);
    else same = false;
  }
  if (!out.length) return null;
  return same ? mark : out;
}

function stEditRun(c) {
  S._stQ = (S._stQ || Promise.resolve()).then(function () {
    return stEditJob(c);
  }, function () {
    return stEditJob(c);
  });
  return S._stQ;
}

async function stEditJob(c) {
  c = c || {};
  const jobId = String(c.jid || Date.now().toString(36)).replace(/[^0-9a-z]/gi, '').toLowerCase() || Date.now().toString(36);
  let ac = null;
  actStart('студия: дорабатываю картинку');
  try {
    if (c.map && !(await worldMapChatMatches(c.map))) throw new Error('чат сменился — доработка отменена');
    await stJob(jobId, { state: 'image', k: 1, n: 1 });
    const text = String(c.text == null ? '' : c.text).trim().slice(0, c.map ? 64000 : 2000);
    if (text.length < 3) throw new Error('опиши, что исправить');
    if (!(await stQuiet())) throw new Error('в чате всё ещё идёт генерация — попробуй позже');
    const cfg = await resolveCfg();
    if (cfg._vaultErr) throw new Error(cfg._vaultErr);
    if (!cfg.apiKey) throw new Error('нет ключа — открой панель, вкладка api');
    let list = [];
    try {
      list = (await tavo.get('iig_studio', 'global')) || [];
    } catch (e) {}
    let rec = (Array.isArray(list) ? list : []).find(function (x) {
      return x && String(x.id) === String(c.rid != null ? c.rid : c.id);
    });
    if (c.map) {
      const maps = await tavo.get('iig_world_maps', 'global');
      const source = (Array.isArray(maps) ? maps : []).find(m => m && c.map.source && m.id === c.map.source.id && m.path === c.map.source.path);
      if (!source) throw new Error('исходная карта больше не доступна');
      rec = { id: source.id, path: source.path, ar: source.ar || '4:3', prompt: source.prompt || c.map.prompt || '', text: '', style: '', who: '' };
    }
    if (!rec || !rec.path) throw new Error('картинка не найдена в студии');
    const nm = String(rec.path).split('/').pop();
    let src = await tavo.file.load(nm, { encoding: 'dataUrl', scope: 'global' });
    if (!src || !_imgOk(src)) throw new Error('файл картинки не прочитался');
    src = await editSrcFit(src);
    const wishEn = c.map ? text : await wishToEnglish(text, cfg, cfg.apiStyle);
    const mark = stMarkNorm(c.mark);
    const sz = VALID_SZ.indexOf(c.sz) >= 0 ? c.sz : (VALID_SZ.indexOf(rec.sz) >= 0 ? rec.sz : (cfg.imageSize || '1K'));
    const ar = VALID_AR.indexOf(rec.ar) >= 0 ? rec.ar : (cfg.aspectRatio || '1:1');
    try {
      ac = new AbortController();
    } catch (e) {}
    if (ac) S._acReg.iig_studio = ac;
    const ecfg = Object.assign({}, cfg, { maxRetries: 2, _deadline: Date.now() + GEN_DEADLINE, _szAuto: false, _edit: true, aspectRatio: ar });
    if (ac) ecfg._sig = ac.signal;
    if (taMode(cfg)) ecfg.ta = taNorm(c.ta || rec.ta || cfg.ta);
    const ePrompt = mark
      ? ('Edit the provided source image. The user marked ONE area: it spans ' + markBox(mark) + '. Inside that area only: ' + wishEn + '. Everything outside the marked area stays exactly the same: composition, characters, art style, colors. If a copy of the image with a red outline is attached, the outline only points at the area - never draw the outline in the result.')
      : ('Edit the provided source image. ' + wishEn + '. Apply ONLY this fix. Keep the composition, characters, art style, colors and everything else of the source image exactly the same.');
    const key = (cfg.model || '') + '|' + sz;
    let downgraded = !!(S._szNo && S._szNo[key]);
    const etag = { prompt: ePrompt, aspect_ratio: ar, image_size: downgraded ? (cfg.imageSize || '1K') : sz };
    let erefs;
    if (cfg.apiStyle === 'novelai' || taMode(cfg)) {
      erefs = [];
      const rpm = parseMarkers(String(rec.prompt || ''));
      etag._edit = { src: src, strokes: mark || null };
      if (taMode(cfg)) etag._taKey = jobId;
      etag.prompt = rpm.prompt + ', ' + naiClean(wishEn);
      etag.cast = rpm.cast || null;
      etag.chars = naiCastChars([], etag.cast);
    } else {
      erefs = [{ dataUrl: src, label: ST_EDIT_REF }];
      if (mark) {
        const marked = await markDraw(src, mark);
        if (marked) erefs.push({ dataUrl: marked, label: ST_EDIT_MARK_REF });
      }
    }
    let out;
    try {
      out = await withRetry(function () {
        return generate(etag, erefs, ecfg);
      }, ecfg);
    } catch (e0) {
      if (downgraded || !sizeRefused(e0) || sz === (cfg.imageSize || '1K')) throw e0;
      S._szNo = S._szNo || {};
      S._szNo[key] = 1;
      downgraded = true;
      out = await withRetry(function () {
        return generate(Object.assign({}, etag, { image_size: cfg.imageSize || '1K' }), erefs, ecfg);
      }, ecfg);
    }
    const tamE = taMode(cfg) ? taTake(jobId) : null;
    if (/^https?:/i.test(String(out))) {
      const d = await urlToDataUrl(out, ecfg._sig);
      if (!d) throw new Error('картинка пришла ссылкой, скачать не удалось');
      out = d;
    }
    const dimsO = await srcDims(out);
    const arO = (dimsO ? arNearest(dimsO.w, dimsO.h) : '') || ar;
    const path = await tavo.file.save('iig_st_' + jobId + '.png', out, { scope: 'global' });
    if (!path) throw new Error('файл не сохранился');
    await stIndexAdd(Object.assign({
      id: jobId,
      path: String(path),
      text: rec.text || '',
      ar: arO,
      style: rec.style || '',
      who: rec.who || '',
      prompt: rec.prompt || '',
      req: rec.req || null,
      sz: downgraded ? (cfg.imageSize || '1K') : sz,
      up: rec.up || null,
      from: rec.id,
      edited: true,
      edit: text.slice(0, 400),
      prov: String(cfg.apiStyle || ''),
      ta: taMode(cfg) ? taNoKeys(ecfg.ta) : null,
      note: S._naiNote || '',
      at: Date.now()
    }, taMode(cfg) ? { tam: tamE } : {}));
    if (c.map) await mapDone(c, { id: jobId, path: String(path) });
    await stJob(jobId, { state: 'ok', ids: [jobId] });
    actEnd(downgraded ? ('студия: модель не даёт ' + sz + ' — доработано в ' + (cfg.imageSize || '1K')) : 'студия: доработано');
    try {
      _statAdd({ imgs: 1, imgTok: S._lastImgTok || 0 });
      S._lastImgTok = 0;
    } catch (e) {}
  } catch (e) {
    const t = errText(e);
    if (c.map) worldMapError(c.map, t);
    await stJob(jobId, { state: 'error', error: t });
    elog('студия · доработка', t);
    actEnd('студия: доработать не вышло — ' + String(t).slice(0, 90));
  } finally {
    if (ac && S._acReg.iig_studio === ac) delete S._acReg.iig_studio;
  }
}

function studioRun(c) {
  S._stQ = (S._stQ || Promise.resolve()).then(function () {
    return studioJob(c);
  }, function () {
    return studioJob(c);
  });
  return S._stQ;
}

async function studioJob(c) {
  const jobId = String((c && c.jid) || Date.now().toString(36)).replace(/[^0-9a-z]/gi, '').toLowerCase() || Date.now().toString(36);
  let release = function () {};
  S._stLock = new Promise(function (r) {
    release = r;
  });
  let ac = null;
  let ph = 'промпт';
  const made = [];
  let stWarn = '';
  actStart('студия: готовлю картинку');
  try {
    if (c.map && !(await worldMapChatMatches(c.map))) throw new Error('чат сменился — генерация карты отменена');
    await stJob(jobId, { state: 'prompt' });
    if (!(await stQuiet())) throw new Error('в чате всё ещё идёт генерация — попробуй позже');
    const cfg = await resolveCfg();
    if (cfg._vaultErr) throw new Error(cfg._vaultErr);
    if (!cfg.apiKey) throw new Error('нет ключа — открой панель, вкладка api');
    if (cfg.apiStyle !== 'naistera' && cfg.apiStyle !== 'novelai' && cfg.apiStyle !== 'tensor' && !cfg.model) throw new Error('не выбрана модель — открой панель, вкладка api');
    try {
      ac = new AbortController();
    } catch (e) {}
    if (ac) S._acReg.iig_studio = ac;
    const ar = VALID_AR.indexOf(c.ar) >= 0 ? c.ar : (cfg.aspectRatio || '1:1');
    const sz = VALID_SZ.indexOf(c.sz) >= 0 ? c.sz : (cfg.imageSize || '1K');
    const count = Math.max(1, Math.min(4, parseInt(c.n, 10) || 1));
    const fr = (c.fr && typeof c.fr === 'object') ? c.fr : {};
    const cfg2 = Object.assign({}, cfg, { _deadline: Date.now() + GEN_DEADLINE * count, _ctx: '', aspectRatio: ar, _frOn: 1, frShot: String(fr.shot || ''), frAngle: String(fr.angle || ''), frTod: String(fr.tod || '') });
    if (ac) cfg2._sig = ac.signal;
    if (taMode(cfg)) cfg2.ta = taNorm(c.ta || cfg.ta);
    const taManual = taMode(cfg) && !!c.taManual && !!String(c.prompt || '').trim();
    const styleName = await stStyle(cfg2, c.style);
    const nbs = naiCustomBlock(cfg2);
    if (nbs) throw new Error(nbs);
    const picked = await stSlots(c.items, c.place);
    const who = await stWho(c);
    S._stWho = who;
    S._stSlots = stWardSlotsForFrame(picked.slots, who);
    const names = { char: who.char ? who.char.name : '', user: who.user ? who.user.name : '' };
    S._stCast = 1;
    S._stNoOwn = c.refs === 0 || c.refs === '0' || c.refs === false;
    const refs = await stRefs(cfg2, who);
    let prompt = String(c.prompt || '').trim();
    let stChars = [];
    if (!prompt) {
      const comp = await composeAuto(stScene(c, names, picked.places), cfg2);
      prompt = String((comp && comp.prompt) || '').trim();
      if (_wc(prompt) < 8) throw new Error('промпт не собрался');
      stChars = parseNaiChars((comp && comp.side && comp.side.chars) || []);
    }
    ph = 'генерация';
    const pcm = parseMarkers(prompt);
    const stCastW = { char: !!who.char, user: !!who.user };
    const gtag = { prompt: pcm.prompt, aspect_ratio: ar, image_size: sz, cast: stCastW, names: names };
    if (taManual) gtag._taManual = 1;
    if (naiMode(cfg2)) gtag.chars = naiCastChars(stChars, stCastW);
    const refsUsed = [];
    for (const r of refs) {
      if (!r) continue;
      const lab = _shortLabel(r.label || '').replace(/\s+/g, ' ').trim().slice(0, 48);
      if (lab && refsUsed.indexOf(lab) < 0) refsUsed.push(lab);
      if (refsUsed.length >= 12) break;
    }
    const req = {
      text: String(c.text || '').slice(0, 2000),
      charId: c.charId != null ? c.charId : '',
      userId: c.userId != null ? c.userId : '',
      items: Array.isArray(c.items) ? c.items.slice(0, 20) : [],
      place: c.place || '',
      style: String(c.style || ''),
      ar: ar,
      refs: S._stNoOwn ? 0 : 1,
      sz: sz
    };
    let szReal = sz;
    for (let k = 0; k < count; k++) {
      await stJob(jobId, { state: 'image', k: k + 1, n: count, ids: made.slice() });
      const id = count > 1 ? (jobId + 'abcd'.charAt(k)) : jobId;
      const taKey = jobId + 'abcd'.charAt(k);
      if (taMode(cfg)) gtag._taKey = taKey;
      let src = null;
      let lostS = null;
      try {
        src = await withRetry(function () {
          return generate(gtag, refs, cfg2);
        }, cfg2);
      } catch (eG) {
        if (!(taMode(cfg) && taLost(eG))) throw eG;
        lostS = eG;
      }
      const tamS = taMode(cfg) ? taTake(taKey) : null;
      if (lostS) {
        elog('студия · генерация', lostS.message);
        await stIndexAdd({
          id: id,
          path: '',
          url: lostS.taUrl,
          urlExp: lostS.taExp,
          jobId: String(lostS.taJobId || ''),
          text: req.text.slice(0, 400),
          ar: ar,
          style: styleName || String(cfg.promptName || ''),
          who: [names.char, names.user].filter(Boolean).join(' и '),
          prompt: pcm.prompt,
          refs: refsUsed,
          req: req,
          sz: sz,
          prov: String(cfg.apiStyle || ''),
          ta: taNoKeys(cfg2.ta),
          tam: tamS,
          note: taLostNote(lostS),
          at: Date.now()
        });
        made.push(id);
        stWarn = 'TA_IMG_CORS';
        await stJob(jobId, { state: 'image', k: k + 1, n: count, ids: made.slice(), warn: stWarn });
        continue;
      }
      if (/^https?:/i.test(String(src))) {
        const d = await urlToDataUrl(src, cfg2._sig);
        if (!d) throw new Error('картинка пришла ссылкой, скачать не удалось');
        src = d;
      }
      szReal = (S._szNo && S._szNo[(cfg.model || '') + '|' + sz]) ? (cfg.imageSize || '1K') : sz;
      req.sz = szReal;
      const path = await tavo.file.save('iig_st_' + id + '.png', src, { scope: 'global' });
      if (!path) throw new Error('файл не сохранился');
      await stIndexAdd(Object.assign({
        id: id,
        path: String(path),
        text: req.text.slice(0, 400),
        ar: ar,
        style: styleName || String(cfg.promptName || ''),
        who: [names.char, names.user].filter(Boolean).join(' и '),
        prompt: pcm.prompt,
        refs: refsUsed,
        req: req,
        sz: szReal,
        prov: String(cfg.apiStyle || ''),
        ta: taMode(cfg) ? taNoKeys(cfg2.ta) : null,
        note: S._naiNote || '',
        at: Date.now()
      }, taMode(cfg) ? { tam: tamS } : {}));
      made.push(id);
      await stJob(jobId, { state: 'image', k: k + 1, n: count, ids: made.slice() });
      const recNow = { id: id, path: String(path) };
      if (c.cast) await castPortraitDone(c, recNow);
      if (c.map) await mapDone(c, recNow);
      if (c.item) await itemDone(c, recNow);
      try {
        _statAdd({ imgs: 1, imgTok: S._lastImgTok || 0 });
        S._lastImgTok = 0;
      } catch (e) {}
    }
    await stJob(jobId, stWarn ? { state: 'ok', ids: made, warn: stWarn } : { state: 'ok', ids: made });
    actEnd('студия: ' + (made.length > 1 ? ('готово картинок: ' + made.length) : 'картинка готова') + (szReal !== sz ? (' · модель не даёт ' + sz + ' — нарисовано в ' + szReal) : ''));
  } catch (e) {
    const stopped = !!(e && e.iigStop);
    const t = stopped ? 'остановлено кнопкой стоп' : ((ph === 'промпт' && String(errText(e)).indexOf('промпт-модель') !== 0 ? 'промпт-модель: ' : '') + errText(e));
    if (c.map) worldMapError(c.map, t);
    if (!stopped) elog('студия · ' + ph, errText(e));
    await stJob(jobId, { state: 'error', error: t, ids: made });
    actEnd(stopped ? 'студия: остановлено' : ('студия: не вышло — ' + String(t).slice(0, 90)));
  } finally {
    S._stSlots = null;
    S._stWho = null;
    S._stCast = 0;
    S._stNoOwn = false;
    S._refsCache = null;
    S._textRefs = [];
    S._names = {};
    S._pass = {};
    if (ac && S._acReg.iig_studio === ac) delete S._acReg.iig_studio;
    S._stLock = null;
    release();
  }
}

async function moreFor(id) {
  const t0 = Date.now();
  for (let i = 0; i < 3; i++) {
    await runFor(id, { force: true });
    if (S._stopReq && S._stopReq >= t0) break;
    const v = await imgGet(id);
    if (!v || v.state !== 'ok') break;
  }
}

function runFor(id, opts) {
  opts = opts || {};
  const force = !!opts.force;
  const key = keyFor(id);
  let acMine = null;
  if (!force && S._inflight[key]) return S._inflight[key];
  if (S._acReg[key]) {
    if (!force) return S._inflight[key] || Promise.resolve(null);
    try {
      S._acReg[key].abort();
    } catch (e) {}
    delete S._acReg[key];
  }
  let counted = false;
  const p = (async function () {
    if (S._stLock) {
      try {
        await S._stLock;
      } catch (eL) {}
    }
    let cfg;
    try {
      cfg = await resolveCfg();
    } catch (eCfg) {
      await imgSet(id, { state: 'error', error: (eCfg && eCfg.message) ? String(eCfg.message) : 'настройки не прочитались — тапни ↻', at: Date.now() });
      return null;
    }
    if (cfg._vaultErr) {
      await imgSet(id, { state: 'error', error: cfg._vaultErr, at: Date.now() });
      return null;
    }
    if (!cfg.apiKey) {
      await imgSet(id, { state: 'error', error: 'нет ключа — открой панель, вкладка api', at: Date.now() });
      return null;
    }
    if (cfg.apiStyle !== 'naistera' && cfg.apiStyle !== 'novelai' && cfg.apiStyle !== 'tensor' && !cfg.model) {
      await imgSet(id, { state: 'error', error: 'не выбрана модель — открой панель, вкладка api', at: Date.now() });
      return null;
    }
    const nb = naiCustomBlock(cfg);
    if (nb) {
      await imgSet(id, { state: 'error', error: nb, at: Date.now() });
      return null;
    }
    const msg = await msgById(id);
    if (!msg) {
      await imgSet(id, { state: 'error', error: 'пост не найден', at: Date.now() });
      return null;
    }

    let chat0 = null;
    try {
      chat0 = ((await tavo.chat.current()) || {}).id;
    } catch (e) {}
    const sameChat = async function () {
      if (chat0 == null) return true;
      try {
        const cN = await tavo.chat.current();
        return !cN || cN.id == null || cN.id === chat0;
      } catch (e) {
        return true;
      }
    };

    let ph = 'генерация';
    let ac = null;
    try {
      ac = new AbortController();
    } catch (e) {}
    if (ac) {
      S._acReg[key] = ac;
      acMine = ac;
    }
    const cfg2 = Object.assign({}, cfg, { _deadline: Date.now() + GEN_DEADLINE + pwWaitMs(cfg) });
    let placeNone = false;
    let sideNote = '';
    if (ac) cfg2._sig = ac.signal;

    if (opts.style) await stStyle(cfg2, opts.style);
    S._castPost = String(msg.content || '');
    if (!(await chatVirgin())) await ensureMark(msg, await earlierTexts(msg.id));
    const tk = textKey(msg.content);
    const ar = opts.ar || cfg.aspectRatio || '1:1';
    const arS = (function () {
      if (cfg.apiStyle !== 'novelai') return ar;
      const d = naiDims(ar, cfg.naiLarge);
      return d.w + ':' + d.h;
    })();

    const prev0 = await imgGet(id);
    const back = async function (err) {
      if (prev0 && prev0.state === 'ok' && prev0.path) {
        await imgSet(id, prev0);
        if (err) toast('IIG: перегенерация не вышла — картинка осталась прежней (' + err + ')');
        return true;
      }
      return false;
    };
    const tag = {
      prompt: '',
      aspect_ratio: ar,
      image_size: cfg.imageSize || '1K'
    };

    actStart('готовлю картинку');
    counted = true;

    const lim = (cfg.apiStyle === 'naistera' || cfg.apiStyle === 'novelai') ? 1 : 2;
    try {
      return await enqueue(async function () {

      S._pwSlimOk = 0;
      let prompt = String(opts.prompt || '').trim();
      let fromSaved = false;
      let nc0 = [];
      try {
        const ncS = await tavo.get(skey(id, 'nc'), 'chat');
        if (Array.isArray(ncS)) nc0 = ncS;
      } catch (e) {}
      if (!prompt && !opts.fresh) {
        try {
          const sp = await sGet(id, 'p', 'iig_p');
          if (sp) prompt = String(sp).trim();
        } catch (e) {}
        if (prompt) {

          let ptk = null;
          try {
            ptk = await tavo.get(skey(id, 'ptk'), 'chat');
          } catch (e) {}
          if (ptk && ptk !== tk) prompt = '';
          else if (!opts.manual) {
            let pf = 0;
            try {
              pf = Number(await tavo.get(skey(id, 'pf'), 'chat')) || 0;
            } catch (e) {}
            fromSaved = pf !== 1;
            try {
              S._pwSlimOk = Number(await tavo.get(skey(id, 'ps'), 'chat')) || 0;
            } catch (e) {
              S._pwSlimOk = 0;
            }
          }
        }
      }
      let chars = (!opts.prompt && prompt) ? nc0 : [];
      if (!opts.manual && _wc(prompt) < pwMinWords(cfg, { chars: chars })) {

        await imgSet(id, { state: 'prompt', key: key, tk: tk, ar: arS, at: Date.now() });
        let scene = opts.direct ? String(opts.direct) : stripMark(msg.content);
        if (opts.wish) scene += '\n\nWHAT THE USER WANTS TO SEE IN THIS PICTURE (mandatory - it decides the moment, the focus and the details): ' + String(opts.wish).slice(0, 600);
        ph = 'промпт';

        S._pwSlimOk = 0;
        fromSaved = false;
        const sb = (chat0 != null && S._slimBy) ? S._slimBy[chat0] : null;
        if (sb && sb.lvl && (Date.now() - sb.at) < 600000 && cfg2._iigSlim == null) {
          cfg2._iigSlim = 1;
        }
        if (cfg2._iigSlim) cfg2._ctx = '';
        const c = await composeAuto(scene, cfg2);
        if (c && c.fallback && c.cut && (cfg2.apiStyle === 'naistera' || cfg2.apiStyle === 'openai_image' || cfg2.apiStyle === 'novelai')) {
          throw new Error(pwCutText(c.cut.tokens));
        }
        if (c && c.fallback && (cfg2.apiStyle === 'naistera' || cfg2.apiStyle === 'openai_image' || cfg2.apiStyle === 'novelai')) {
          throw new Error('модель промпта вернула обрывок вместо промпта (в абзаце ' + (c.wc || 0) + ' слов, строк CHAR ' + ((c.side && Array.isArray(c.side.chars)) ? c.side.chars.length : 0) + ') — рисовать по сырому тексту поста на этой модели картинок бессмысленно (выйдет случайная картинка). Подними «токены ответа», выключи размышления или увеличь время ожидания промпта во вкладке api и тапни ↻');
        }
        if (S._pwSlimOk >= 2) {
          toast('IIG: промпт написан в урезанном режиме — без внешности и текстовых рефов: полный запрос провайдер отверг или не успел. На этой картинке внешность может не совпасть');
          actNote('промпт поста ' + id + ' написан без внешности и текстовых рефов (урезанный запрос) — причина в провайдере промпта; увеличь время ожидания или смени модель промпта');
        }
        const sideOk = !!(c && c.side && (cfg2.sideWear || cfg2.sidePlace) && !opts.range && (await sideIsLast(id)));
        let wornH = null;
        if (sideOk && cfg2.sideWear && c.side.wear) {
          try {
            wornH = await sideWearApply(c.side.wear, cfg2);
            if (wornH && wornH.applied) sideWearBook(wornH);
          } catch (eW) {}
          sideNote = sideWearNote(wornH, cfg2);
        }
        if (c && c.side && cfg2.sidePlace && c.side.place) {
          if (/^none\.?$/i.test(String(c.side.place).trim())) placeNone = true;
          else if (sideOk) try {
            await sidePlaceApply(c.side.place);
          } catch (eP) {}
        }
        if (c && c.side && (sideOk || (cfg2.sideCast && c.side.npc))) await sideLogPut(id, c.side, wornH);
        sideHandle(id, c && c.side, cfg2);
        try {
          if (chat0 != null) {
            S._slimBy = S._slimBy || {};
            if (S._pwSlimOk) S._slimBy[chat0] = { lvl: 1, at: Date.now() };
            else delete S._slimBy[chat0];
          }
        } catch (eSl) {}
        prompt = String((c && c.prompt) || '').trim();
        chars = parseNaiChars((c && c.side && c.side.chars) || []);
      }
      if (_wc(prompt) < (opts.manual ? 1 : 8)) {
        ph = 'промпт';
        throw new Error('промпт не собрался');
      }
      ph = 'генерация';
      try {
        await tavo.set(skey(id, 'p'), prompt, 'chat');
        await tavo.set(skey(id, 'nc'), chars, 'chat');
        await tavo.set(skey(id, 'ptk'), tk, 'chat');
        await tavo.set(skey(id, 'ps'), S._pwSlimOk || 0, 'chat');
      } catch (e) {}

      const pcm = parseMarkers(prompt);
      if (naiMode(cfg) && fromSaved && pcm.cast && !pcm.cast.char && !pcm.cast.user) pcm.cast = null;
      if (naiMode(cfg) && fromSaved && pcm.cast && !!pcm.cast.char !== !!pcm.cast.user) {
        let nmS = null;
        try {
          nmS = await castNames();
        } catch (e) {}
        const nmM = nmS ? nmS[pcm.cast.char ? 'user' : 'char'] : '';
        if (nmM && refNamedIn(stripMark(msg.content), nmM)) pcm.cast = null;
      }
      pcm.cast = castFromChars(pcm.cast, chars);
      let refs = await gatherRefs(cfg);
      refs = refGate2(refs, pcm.cast, pcm.prompt, await castNames());
      try {
        await tavo.set(skey(id, 'pf'), 0, 'chat');
      } catch (e) {}
      if (placeNone) refs = placeGate(refs);
      const gtag = Object.assign({}, tag, { prompt: pcm.prompt });
      if (naiMode(cfg)) {
        gtag.chars = naiCastChars(chars, pcm.cast);
        gtag.cast = pcm.cast || null;
      }
      S._naiChars = gtag.chars || null;
      const nmod = naisteraCanon(gtag.model || cfg.naisteraModel || 'grok');
      const rBase = refsNote(refs) + ' · ' + (cfg.apiStyle || 'openai_chat') +
        (cfg.apiStyle === 'naistera' ? ('/' + nmod + (naisteraRefsOk(nmod) ? '' : ' (модель без референсов — внешность идёт тегами)')) : '') +
        (cfg.apiStyle === 'novelai' ? ('/' + (cfg.naiModel || 'nai-diffusion-4-5-full')) : '') +
        ' · промпт: ' + pwSrcNote(cfg) + ' · стиль: ' + (String(cfg.promptName || '').trim() || 'базовый');
      const rNote = rBase + (sideNote ? ' · ' + sideNote : '') + refLostNote();
      S._lastRefsNote = rNote;
      try {
        await tavo.set(skey(id, 'r'), rNote, 'chat');
      } catch (e) {}

      await imgSet(id, { state: 'image', key: key, tk: tk, ar: arS, at: Date.now(), prompt: prompt, note: rNote });
      S._naiNote = '';
      if (taMode(cfg2)) gtag._taKey = 'm' + id;
      let src = null;
      let lostC = null;
      try {
        src = await withRetry(function () {
          return generate(gtag, refs, cfg2);
        }, cfg2);
      } catch (eG) {
        if (!(taMode(cfg2) && taLost(eG))) throw eG;
        lostC = eG;
      }
      S._naiChars = null;
      const tamC = taMode(cfg2) ? taTake('m' + id) : null;
      if (lostC) {
        elog('генерация · пост ' + id, lostC.message);
        const noteL = rBase + (sideNote ? ' · ' + sideNote : '') + refLostNote() + ' · ' + taLostNote(lostC);
        try {
          await tavo.set(skey(id, 'r'), noteL, 'chat');
        } catch (e) {}
        if (!(await sameChat())) {
          toast('IIG: чат сменился во время генерации — картинка поста ' + id + ' не записана');
          return null;
        }
        await imgSet(id, {
          state: 'ok',
          key: key,
          tk: tk,
          path: '',
          url: lostC.taUrl,
          urlExp: lostC.taExp,
          ar: (tamC && tamC.w > 0 && tamC.h > 0) ? (tamC.w + ':' + tamC.h) : arS,
          at: Date.now(),
          prompt: prompt,
          note: noteL,
          tam: tamC
        });
        return '';
      }

      const rFinal = rBase + (sideNote ? ' · ' + sideNote : '') + refLostNote() + (S._naiNote ? ' · ' + S._naiNote : '');
      try {
        if (rFinal !== rNote) await tavo.set(skey(id, 'r'), rFinal, 'chat');
      } catch (e) {}

      if (!(await sameChat())) {
        toast('IIG: чат сменился во время генерации — картинка поста ' + id + ' не записана');
        return null;
      }

      const rrL = await rrBegin(id, tk, prev0 ? Object.assign({}, prev0, { chars: nc0 }) : prev0);

      const dimsF = await imgDims(src);
      const arF = (dimsF && dimsF.w >= 64 && dimsF.h >= 64) ? (dimsF.w + ':' + dimsF.h) : ar;
      const path = await saveImage(tk, src, cfg2, { prompt: prompt, note: rFinal, ar: arF });
      const at1 = Date.now();
      await rrEnd(id, rrL, { p: path, at: at1, ar: arF, prompt: prompt, note: rFinal, chars: chars });
      await imgSet(id, Object.assign({
        state: 'ok',
        key: key,
        tk: tk,
        path: path,
        ar: arF,
        at: at1,
        prompt: prompt,
        note: rFinal
      }, taMode(cfg2) ? { tam: tamC } : {}));
      await goneForget(tk);
      await pinOutsideWindow(id, msg, tk, cfg);
      try {
        if (await tavo.get(skey(id, 'x'), 'chat')) await tavo.unset(skey(id, 'x'), 'chat');
      } catch (e) {}
      try {
        _statAdd({ imgs: 1, imgTok: S._lastImgTok || 0 });
        S._lastImgTok = 0;
      } catch (e) {}
        return path;
      }, lim);
    } catch (e) {

      if (S._inflight[key] !== p) return null;

      if (!(await sameChat())) return null;
      if (e && e.iigStop) {

        if (!(await back(''))) {
          await imgSet(id, {
            state: 'error',
            key: key,
            ar: ar,
            at: Date.now(),
            stopped: 1,
            error: 'остановлено кнопкой стоп — тапни ↻, если картинка нужна'
          });
        }
        return null;
      }
      elog(ph + ' · пост ' + id, errText(e));
      if (await back((e && e.message) ? String(e.message).slice(0, 90) : 'сбой')) return null;
      await imgSet(id, {
        state: 'error',
        key: key,
        ar: ar,
        at: Date.now(),
        error: (ph === 'промпт' && String(errText(e)).indexOf('промпт-модель') !== 0 ? 'промпт-модель: ' : '') + errText(e)
      });
      return null;
    }
  })();
  S._inflight[key] = p;
  const done = function (e) {
    if (S._inflight[key] === p) delete S._inflight[key];

    if (acMine && S._acReg[key] === acMine) delete S._acReg[key];
    if (!counted) return;
    counted = false;
    if (e === undefined) actEnd('картинка готова · ' + (S._lastRefsNote || ''));
    else if (e && e.iigStop) actEnd('генерация остановлена');
    else actEnd('ошибка генерации: ' + ((e && e.message) ? String(e.message).slice(0, 90) : 'неизвестно'));
  };
  p.then(function () {
    done();
  }, function (e) {
    done(e || new Error('сбой'));
  });
  return p;
}

async function imgBytes(path) {
  const f = String(path || '');
  const name = f.split('/').pop();
  if (!name) return '';
  const first = f.indexOf('files/global/') === 0 ? 'global' : 'chat';
  for (const sc of [first, first === 'chat' ? 'global' : 'chat']) {
    try {
      const d = await tavo.file.load(name, { encoding: 'dataUrl', scope: sc });
      if (d) return String(d).indexOf('data:') === 0 ? String(d) : ('data:image/png;base64,' + d);
    } catch (e) {}
  }
  return '';
}

const EDIT_SRC_MAX_PX = 2048;
const EDIT_SRC_MAX_B64 = 7000000;

async function editSrcFit(src) {
  try {
    if (typeof OffscreenCanvas === 'undefined' || typeof createImageBitmap !== 'function') return src;
    const s = String(src || '');
    const comma = s.indexOf(',');
    if (comma < 0) return src;
    const mime = (s.slice(0, comma).match(/data:([^;]+)/) || [])[1] || 'image/png';
    const b64 = s.slice(comma + 1);
    const bin = atob(b64);
    const buf = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) buf[i] = bin.charCodeAt(i);
    const bm = await createImageBitmap(new Blob([buf], { type: mime }));
    const big = Math.max(bm.width, bm.height);
    let side = Math.min(big, EDIT_SRC_MAX_PX);
    if (side >= big && b64.length <= EDIT_SRC_MAX_B64) return src;
    const draw = async function (n, type, q) {
      const sc = n / big;
      const cv = new OffscreenCanvas(Math.max(1, Math.round(bm.width * sc)), Math.max(1, Math.round(bm.height * sc)));
      cv.getContext('2d').drawImage(bm, 0, 0, cv.width, cv.height);
      return await _blobB64(await cv.convertToBlob(q ? { type: type, quality: q } : { type: type }));
    };
    let out = side < big ? await draw(side, 'image/png') : b64;
    let png = side < big;
    while (out && out.length > EDIT_SRC_MAX_B64 && side > 1024) {
      side = Math.max(1024, Math.round(side * 0.75));
      out = await draw(side, 'image/png');
      png = true;
    }
    if (!out) return src;
    if (out.length > EDIT_SRC_MAX_B64) {
      const j = await draw(side, 'image/jpeg', 0.92);
      return j ? ('data:image/jpeg;base64,' + j) : src;
    }
    return png ? ('data:image/png;base64,' + out) : src;
  } catch (e) {
    return src;
  }
}

function arNearest(w, h) {
  w = Number(w) || 0;
  h = Number(h) || 0;
  if (!(w > 0) || !(h > 0)) return '';
  const r = Math.log(w / h);
  let best = '';
  let bd = Infinity;
  for (const a of VALID_AR) {
    const m = String(a).match(/^(\d+):(\d+)$/);
    if (!m) continue;
    const d = Math.abs(r - Math.log(parseInt(m[1], 10) / parseInt(m[2], 10)));
    if (d < bd) {
      bd = d;
      best = a;
    }
  }
  return best;
}

function arReq(ar, cfg) {
  const a = String(ar || '');
  if (VALID_AR.indexOf(a) >= 0) return a;
  const m = a.match(/^(\d+):(\d+)$/);
  const n = m ? arNearest(parseInt(m[1], 10), parseInt(m[2], 10)) : '';
  return n || (cfg && cfg.aspectRatio) || '1:1';
}

function imgDimsBytes(x, full) {
  if (x instanceof Uint8Array) return x;
  if (x instanceof ArrayBuffer) return new Uint8Array(x);
  if (typeof x !== 'string') return null;
  const s = x;
  const comma = s.indexOf(',');
  if (s.indexOf('data:') !== 0 || comma < 0) return null;
  let bin = '';
  try {
    const clean = (full ? s.slice(comma + 1) : s.slice(comma + 1, comma + 1 + 87384)).replace(/[^A-Za-z0-9+/]/g, '');
    bin = atob(clean.slice(0, clean.length - (clean.length % 4)));
  } catch (e) {
    return null;
  }
  const u = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i);
  return u;
}

function imgDimsOf(x) {
  const b = imgDimsBytes(x, false);
  const r = imgDimsParse(b);
  if (r || typeof x !== 'string' || !b || b[0] !== 0xff || b[1] !== 0xd8) return r;
  return imgDimsParse(imgDimsBytes(x, true));
}

function imgDimsParse(b) {
  if (!b || b.length < 24) return null;
  const be16 = function (i) {
    return (b[i] << 8) | b[i + 1];
  };
  const be32 = function (i) {
    return ((b[i] << 24) >>> 0) + (b[i + 1] << 16) + (b[i + 2] << 8) + b[i + 3];
  };
  const le16 = function (i) {
    return b[i] | (b[i + 1] << 8);
  };
  const le24 = function (i) {
    return b[i] | (b[i + 1] << 8) | (b[i + 2] << 16);
  };
  const ok = function (w, h) {
    return (w > 0 && h > 0 && w <= 65535 && h <= 65535) ? { w: w, h: h } : null;
  };
  if (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47 && b[12] === 0x49 && b[13] === 0x48 && b[14] === 0x44 && b[15] === 0x52) return ok(be32(16), be32(20));
  if (b[0] === 0xff && b[1] === 0xd8) {
    let i = 2;
    while (i + 9 < b.length) {
      if (b[i] !== 0xff) {
        i++;
        continue;
      }
      const m = b[i + 1];
      if (m === 0xff) {
        i++;
        continue;
      }
      if (m === 0xd8 || m === 0x01 || (m >= 0xd0 && m <= 0xd7)) {
        i += 2;
        continue;
      }
      const len = be16(i + 2);
      if (m === 0xc0 || m === 0xc1 || m === 0xc2) return ok(be16(i + 7), be16(i + 5));
      if (len < 2) return null;
      i += 2 + len;
    }
    return null;
  }
  if (b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 && b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50 && b.length >= 30) {
    const t = String.fromCharCode(b[12], b[13], b[14], b[15]);
    if (t === 'VP8X') return ok(le24(24) + 1, le24(27) + 1);
    if (t === 'VP8 ' && b[23] === 0x9d && b[24] === 0x01 && b[25] === 0x2a) return ok(le16(26) & 0x3fff, le16(28) & 0x3fff);
    if (t === 'VP8L' && b[20] === 0x2f) {
      const v = b[21] | (b[22] << 8) | (b[23] << 16) | (b[24] << 24);
      return ok((v & 0x3fff) + 1, ((v >>> 14) & 0x3fff) + 1);
    }
  }
  return null;
}

async function imgDims(src) {
  let hd = null;
  try {
    hd = imgDimsOf(src);
  } catch (e0) {
    hd = null;
  }
  return hd || srcDims(src);
}

async function srcDims(src) {
  try {
    if (typeof createImageBitmap !== 'function') return null;
    const s = String(src || '');
    const comma = s.indexOf(',');
    if (comma < 0) return null;
    const mime = (s.slice(0, comma).match(/data:([^;]+)/) || [])[1] || 'image/png';
    const bin = atob(s.slice(comma + 1));
    const buf = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) buf[i] = bin.charCodeAt(i);
    const bm = await createImageBitmap(new Blob([buf], { type: mime }));
    const out = (bm && bm.width > 0 && bm.height > 0) ? { w: bm.width, h: bm.height } : null;
    try {
      if (bm && bm.close) bm.close();
    } catch (e1) {}
    return out;
  } catch (e) {
    return null;
  }
}

const WISH_ASIS = 'пожелание не переведено — ушло как есть';
const WISH_MAX = 300;
const WISH_PRE_LINE = /^(sure|ok(ay)?|here|translation|translated|output|result|tags|prompt)\b[^:\n]{0,60}:\s*$/i;
const WISH_PRE = /^(sure|ok(ay)?|here|translation|translated|output|result|tags|prompt)\b[^:\n]{0,60}:\s*/i;

async function wishToEnglish(wish, cfg, style) {
  const w = String(wish == null ? '' : wish).trim();
  if (!S._enOn || !hasCyr(w)) return w;
  let t = '';
  try {
    t = await wishTranslate(w, cfg, style);
  } catch (e) {
    t = '';
  }
  if (t) return t;
  if (!Array.isArray(S._refLost)) S._refLost = [];
  if (S._refLost.indexOf(WISH_ASIS) < 0) S._refLost.push(WISH_ASIS);
  return w;
}

async function wishTranslate(w, cfg, style) {
  const nai = style === 'novelai' || naiMode(cfg);
  const ask = 'Translate the user\'s image edit request into English — for NovelAI as comma-separated Danbooru tags, otherwise as one short English sentence. Output only the translation.' + (nai ? ' If the request removes something, output tags for what should be visible in that place instead (the background, surface or clothing behind it); never output tags of the removed thing.' : '') + '\n\nTARGET: ' + (nai ? 'NovelAI - comma-separated Danbooru tags' : 'image model - one short English sentence') + '\n\nREQUEST:\n' + w.slice(0, 600);
  const raw = await pwGenerate0(ask, cfg);
  let t = typeof raw === 'string' ? raw : String((raw && (raw.text || raw.content)) || '');
  t = t.replace(/<think(?:ing)?>[\s\S]*?<\/think(?:ing)?>/gi, ' ');
  const lines = t.split(/\r?\n/).map(function (x) { return x.trim(); }).filter(function (x) {
    return x && !/^\(.*\)$/.test(x) && !WISH_PRE_LINE.test(x);
  });
  t = (lines.length ? lines[0] : '').replace(WISH_PRE, '').replace(/\s+/g, ' ').trim();
  t = t.replace(/^["'`«“„]+|["'`»”]+$/g, '').trim().slice(0, WISH_MAX).trim();
  if (nai) t = naiClean(t);
  return t;
}

async function img2imgRun(id, ePrompt, opts) {
  opts = opts || {};
  const key = keyFor(id);
  if (S._inflight[key]) return toast('IIG: по этому посту уже идёт генерация — подожди');

  let phDone = function () {};
  const phP = new Promise(function (r) { phDone = r; });
  S._inflight[key] = phP;
  const phDrop = function () {
    if (S._inflight[key] === phP) delete S._inflight[key];
    phDone(null);
  };
  try {
  const cfg = await resolveCfg();
  if (cfg._vaultErr) { phDrop(); return toast('IIG: ' + cfg._vaultErr); }
  if (!cfg.apiKey) { phDrop(); return toast('IIG: нет ключа — открой панель, вкладка api'); }
  if (cfg.apiStyle === 'novelai' && opts.size) { phDrop(); return toast('NovelAI: улучшение размера не поддерживается — используй доработку'); }
  const v = await imgGet(id);
  if (!v || v.state !== 'ok' || !v.path) { phDrop(); return toast('IIG: исходник не найден — сгенерируй картинку сначала'); }
  let src = await imgBytes(v.path);
  if (!src) { phDrop(); return toast('IIG: исходник не прочитался — перегенерируй картинку'); }
  let wishEn = '';
  if (opts.wish) {
    wishEn = await wishToEnglish(opts.wish, cfg, cfg.apiStyle);
    if (cfg.apiStyle !== 'novelai') ePrompt = String(ePrompt).split(String(opts.wish)).join(wishEn);
  }
  let ncE = [];
  try {
    const ncS = await tavo.get(skey(id, 'nc'), 'chat');
    if (Array.isArray(ncS)) ncE = ncS;
  } catch (e) {}
  src = await editSrcFit(src);
  let ac = null;
  try {
    ac = new AbortController();
  } catch (e) {}
  if (ac) S._acReg[key] = ac;

  let eChat0 = null;
  try {
    eChat0 = ((await tavo.chat.current()) || {}).id;
  } catch (e) {}
  const eSameChat = async function () {
    if (eChat0 == null) return true;
    try {
      const cN = await tavo.chat.current();
      return !cN || cN.id == null || cN.id === eChat0;
    } catch (e) {
      return true;
    }
  };
  const ecfg = Object.assign({}, cfg, { maxRetries: 2, _deadline: Date.now() + GEN_DEADLINE, _szAuto: !opts.size, _edit: true });
  if (ac) ecfg._sig = ac.signal;
  const dims = await srcDims(src);
  const ar = arReq((dims ? arNearest(dims.w, dims.h) : '') || v.ar, cfg);
  const etag = {
    prompt: ePrompt,
    aspect_ratio: ar,
    image_size: opts.size || cfg.imageSize || '1K'
  };
  const nai = cfg.apiStyle === 'novelai';
  const erefs = nai ? [] : [{
    dataUrl: src,
    label: opts.refLabel || 'the EXACT source image to edit - apply only the requested fix, keep everything else identical'
  }];
  if (nai) {
    etag._edit = { src: src, strokes: opts.mark || null };
    const vpm = parseMarkers(String(v.prompt || ''));
    etag.prompt = vpm.prompt + ', ' + naiClean(wishEn);
    etag.chars = naiCastChars(ncE, vpm.cast);
    etag.cast = vpm.cast || null;
  } else if (opts.mark) {
    const marked = await markDraw(src, opts.mark);
    if (marked) erefs.push({ dataUrl: marked, label: 'the same source image with a RED outline marking the only area that must change - the outline is a pointer, never reproduce it' });
  }
  actStart(opts.actLabel || 'дорабатываю картинку');
  const lim = (cfg.apiStyle === 'naistera' || cfg.apiStyle === 'novelai') ? 1 : 2;
  const p = (async function () {
    await imgSet(id, Object.assign({}, v, { state: 'image', at: Date.now() }));
    try {
      let out;
      let downgraded = false;
      if (!Array.isArray(S._refLost)) S._refLost = [];
      const naiLost = S._refLost;
      const naiLost0 = naiLost.length;
      try {
        out = await enqueue(function () {
          return withRetry(function () {
            return generate(etag, erefs, ecfg);
          }, ecfg);
        }, lim);
      } catch (e0) {

        if (!(opts.size && /API 400/.test(String((e0 && e0.message) || '')))) throw e0;
        downgraded = true;
        try {
          S._szNo = S._szNo || {};
          S._szNo[(cfg.model || '') + '|' + opts.size] = 1;
        } catch (e1) {}
        const etag2 = Object.assign({}, etag, { image_size: cfg.imageSize || '1K' });
        out = await enqueue(function () {
          return withRetry(function () {
            return generate(etag2, erefs, ecfg);
          }, ecfg);
        }, lim);
      }
      if (!(await eSameChat())) {
        toast('IIG: чат сменился во время доработки — результат не записан (пост ' + id + ')');
        actEnd('доработка не записана — чат сменился');
        return;
      }

      try {
        const un = 'iig_u' + id + '.png';
        await tavo.file.save(un, src, { scope: 'chat' });
        await tavo.set(skey(id, 'u'), { path: 'files/chat/' + un, prompt: v.prompt || '', chars: ncE }, 'chat');
      } catch (e) {}
      let noteE = v.note || '';
      if (nai) {
        const added = naiLost.slice(naiLost0).filter(Boolean);
        if (added.length) {
          actNote('доработка NovelAI: ' + added.join('; '));
          noteE = noteE + ' · ' + added.join(' · ');
        }
        if (S._naiNote) noteE = noteE + ' · ' + S._naiNote;
      }
      const mE = await msgById(id);
      const tkE = v.tk || textKey(String((mE || {}).content || ''));
      const rrL = await rrBegin(id, tkE, Object.assign({}, v, { chars: ncE }));
      const dimsO = await imgDims(out);
      const arO = (dimsO && dimsO.w >= 64 && dimsO.h >= 64) ? (dimsO.w + ':' + dimsO.h) : ar;
      const path = await saveImage(tkE, out, ecfg, { prompt: v.prompt || '', note: noteE, ar: arO });
      const at1 = Date.now();
      await rrEnd(id, rrL, { p: path, at: at1, ar: arO, prompt: v.prompt || '', note: noteE, chars: ncE });
      await imgSet(id, Object.assign({}, v, nai ? { note: noteE } : {}, dimsO ? { ar: arO } : {}, { state: 'ok', path: path, at: at1, edited: true, up: (downgraded ? v.up : opts.size) || v.up || null }));
      await pinOutsideWindow(id, mE, tkE, cfg);
      actEnd(downgraded
        ? ('модель не даёт ' + opts.size + ' — улучшена детализация без роста размера')
        : (opts.okLabel || 'доработано — «вернуть» в том же меню отменит правку'));
    } catch (e) {

      if (await eSameChat()) await imgSet(id, v);
      if (e && e.iigStop) actEnd((opts.actLabel || 'доработка') + ' остановлена');
      else {
        const t = (e && e.message) ? String(e.message).slice(0, 120) : 'сбой';
        elog((opts.actLabel || 'доработка') + ' · пост ' + id, errText(e));
        actEnd((opts.actLabel || 'доработка') + ' не вышла: ' + t);
        toast('IIG: не вышло — ' + t);
      }
    } finally {
      if (S._acReg[key] === ac) delete S._acReg[key];
    }
  })();
  S._inflight[key] = p;
  phDone(null);
  p.then(function () {
    if (S._inflight[key] === p) delete S._inflight[key];
  }, function () {
    if (S._inflight[key] === p) delete S._inflight[key];
  });
  return p;
  } catch (e0) {

    phDrop();
    throw e0;
  }
}

var FRAME_SHOT = {
  close: 'close-up portrait, face and shoulders fill the frame',
  waist: 'medium shot from the waist up',
  full: 'full-body shot, the whole figure visible from head to toe',
  wide: 'wide establishing shot, figures small inside the environment'
};
var FRAME_ANGLE = {
  high: 'high angle, camera looking down',
  low: 'low angle, camera looking up',
  shoulder: 'over-the-shoulder shot',
  pov: 'first-person point of view',
  side: 'side view, profile'
};
var FRAME_TOD = {
  morning: 'early morning light',
  day: 'bright daylight',
  sunset: 'golden hour, sunset light',
  night: 'night, dark sky, moonlight or artificial light'
};

function frameBits(cfg) {
  const out = [];
  if (!cfg || !cfg._frOn) return out;
  if (FRAME_SHOT[cfg.frShot]) out.push(FRAME_SHOT[cfg.frShot]);
  if (FRAME_ANGLE[cfg.frAngle]) out.push(FRAME_ANGLE[cfg.frAngle]);
  if (FRAME_TOD[cfg.frTod]) out.push(FRAME_TOD[cfg.frTod]);
  return out;
}

function pwWaitMs(cfg) {
  const s = parseInt(cfg && cfg.pwWait, 10) || 0;
  return (s >= 60 && s <= 600) ? s * 1000 : 0;
}

const _withTimeout0 = _withTimeout;
_withTimeout = function (p, ms, label, sig) {
  if (S._pwWaitMs && ms === 90000) ms = S._pwWaitMs;
  return _withTimeout0(p, ms, label, sig);
};

const fetchT0 = fetchT;
fetchT = function (url, opts, ms, sig) {
  if (S._pwWaitMs && ms === 45000) ms = S._pwWaitMs;
  return fetchT0(url, opts, ms, sig);
};

function refName(r) {
  const t = String((r && (r.nm || r.note || r.label || r.who)) || 'реф').replace(/\s+/g, ' ').trim();
  return t.slice(0, 40);
}

const TA_HOST = 'https://ap-east-1.tensorart.cloud';
const TA_KEY = 'iig_ta';
var TA_POLL_MS = 2500;
const TA_UPLOAD_EXPIRE_S = 3600;
const TA_UPLOAD_TIMEOUT = 90000;
const TA_API_TIMEOUT = 45000;
const TA_LORA_MAX = 6;
const TA_EMB_MAX = 4;
const TA_KEY_MAX = 128;
const TA_PROMPT_MAX = 4000;
const TA_NEG_MAX = 1500;
const TA_UP_DENOISE = 0.2;
const TA_MASK_BLUR = 4;
const TA_INPAINT_PAD = 32;
const TA_SAMPLERS = ['Euler a', 'Euler', 'LMS', 'LMS Karras', 'DDIM', 'LCM', 'Heun', 'DPM fast', 'DPM2', 'DPM2 a', 'DPM2 Karras', 'DPM2 a Karras', 'DPM++ 2S a', 'DPM++ 2M', 'DPM++ SDE', 'DPM++ 2S a Karras', 'DPM++ 2M Karras', 'DPM++ SDE Karras', 'DPM++ 2M SDE', 'DPM++ 2M SDE Karras', 'Restart', 'DPM++ 2M SDE Exponential', 'DPM++ 2M SDE Heun', 'DPM++ 2M SDE Heun Karras', 'DPM++ 2M SDE Heun Exponential', 'DPM++ 2M SGM Uniform', 'DPM++ 3M SDE', 'DPM++ 3M SDE Karras', 'DPM++ 3M SDE Exponential', 'euler_dy', 'euler_smea_dy'];
const TA_KSAMPLERS = [['DPM++ 2M SDE Exponential', 'dpmpp_2m_sde_gpu', 'exponential'], ['DPM++ 2M SDE Karras', 'dpmpp_2m_sde_gpu', 'karras'], ['DPM++ 2M SDE', 'dpmpp_2m_sde_gpu', 'normal'], ['DDIM', 'ddim', 'normal'], ['Restart', 'restart', 'normal'], ['DPM fast', 'dpm_fast', 'normal'], ['DPM++ 2M', 'dpmpp_2m', 'normal'], ['DPM++ 2M Karras', 'dpmpp_2m', 'karras'], ['DPM++ 2M SGM Uniform', 'dpmpp_2m', 'sgm_uniform'], ['DPM++ 2M SDE Heun', 'dpmpp_2m_sde_gpu', 'normal'], ['DPM++ 2M SDE Heun Exponential', 'dpmpp_2m_sde_gpu', 'exponential'], ['DPM++ 2M SDE Heun Karras', 'dpmpp_2m_sde_gpu', 'karras'], ['DPM++ 2S a', 'dpmpp_2s_ancestral', 'normal'], ['DPM++ 2S a Karras', 'dpmpp_2s_ancestral', 'karras'], ['DPM++ 3M SDE', 'dpmpp_3m_sde_gpu', 'sgm_uniform'], ['DPM++ 3M SDE Exponential', 'dpmpp_3m_sde_gpu', 'exponential'], ['DPM++ 3M SDE Karras', 'dpmpp_3m_sde_gpu', 'karras'], ['DPM++ SDE', 'dpmpp_sde_gpu', 'normal'], ['DPM++ SDE Karras', 'dpmpp_sde_gpu', 'karras'], ['DPM2', 'dpm_2', 'normal'], ['DPM2 Karras', 'dpm_2', 'karras'], ['DPM2 a', 'dpm_2_ancestral', 'normal'], ['DPM2 a Karras', 'dpm_2_ancestral', 'karras'], ['Euler', 'euler', 'normal'], ['Euler a', 'euler_ancestral', 'normal'], ['Heun', 'heun', 'normal'], ['LMS', 'lms', 'normal'], ['LMS Karras', 'lms', 'karras'], ['LCM', 'lcm', 'sgm_uniform'], ['euler_dy', 'euler_dy', 'normal'], ['euler_smea_dy', 'euler_smea_dy', 'normal']];
const TA_SCHEDS = ['', 'simple', 'beta', 'normal', 'karras', 'sgm_uniform', 'exponential', 'ddim_uniform', 'linear_quadratic'];
const TA_VAES = ['Automatic', 'None', 'vae-ft-mse-840000-ema-pruned.ckpt', 'kl-f8-anime.ckpt', 'kl-f8-anime2.ckpt', 'YOZORA.vae.pt', 'orangemix.vae.pt', 'blessed2.vae.pt', 'animevae.pt', 'ClearVAE.safetensors', 'pastel-waifu-diffusion.vae.pt', 'cute_vae.safetensors', 'sdxl_vae.safetensors', 'sdxl-vae-fp16-fix.safetensors', 'xlVAEC_c91.safetensors', 'lastpiecexlVAE_baseonA0897.safetensors', 'playground-v2.5-fp16-vae.safetensors', 'ae.sft', 'pixel_space', 'qwen_image_2.1_vae_bf16.safetensors'];
const TA_UPSCALERS = ['None', 'Latent', 'Latent (antialiased)', 'Latent (bicubic)', 'Latent (bicubic antialiased)', 'Latent (nearest)', 'Latent (nearest-exact)', 'Lanczos', 'Nearest', '4x-UltraSharp', '4x_foolhardy_Remacri', 'ESRGAN_4x', 'R-ESRGAN 4x+', 'R-ESRGAN 4x+ Anime6B', '4x_NMKD-Siax_200k', '4x-AnimeSharp', '4x_NMKD-Superscale-SP_178000_G', 'SwinIR_4x', '2x_APISR_RRDB_GAN_generator', '4x_APISR_GRL_GAN_generator', 'DAT_x2.pth', 'DAT_x3.pth', 'DAT_x4.pth'];
const TA_AD_MODELS = ['face_yolov8s.pt', 'face_yolov9c.pt', 'face_yolov8m.pt', 'face_yolov8n.pt', 'face_yolov8n_v2.pt', 'hand_yolov8s.pt', 'hand_yolov9c.pt', 'hand_yolov8n.pt', 'person_yolov8n-seg.pt', 'person_yolov8m-seg.pt', 'person_yolov8s-seg.pt', 'mediapipe_face_full', 'mediapipe_face_mesh', 'mediapipe_face_short', 'None'];
const TA_MODES = ['txt2img', 'img2img', 'inpaint', 'upscale'];
const TA_BASES = { sd: 0.5, xl: 1, hd: 1.25 };
const TA_HR_SCALES = [1.25, 1.5, 1.75, 2];
const TA_AD_TEXT_MAX = 500;
const TA_DIMS = { '1:1': [1024, 1024], '2:3': [832, 1216], '3:2': [1216, 832], '3:4': [896, 1152], '4:3': [1152, 896], '4:5': [896, 1088], '5:4': [1088, 896], '9:16': [768, 1344], '16:9': [1344, 768], '21:9': [1536, 640] };
const TA_DIM_MIN = 512;
const TA_DIM_MAX = 1536;
const TA_SEED_MAX = 4294967295;
const TA_NO_PHOTO_REFS = 'Tensor Art: фото-рефы не отправляются — внешность идёт текстом';
const TA_NO_MASK = 'Tensor Art: маска не построилась — правка по всей картинке';
const TA_KEY_BAD = 'Tensor Art: ключ не принят — проверь ключ API на tams.tensor.art';
const TA_NO_CREDITS = 'Tensor Art: кредиты TAMS закончились — пополни на tams.tensor.art';
const TA_NO_KEY = 'нет ключа Tensor Art — открой панель, вкладка api';
const TA_NO_CKPT = 'Tensor Art: не указан чекпоинт — открой студию, блок Tensor Art';
const TA_DL_TRIES = 3;
const TA_DL_PAUSE = 1500;
const TA_URL_TTL = 3600 * 1000;
const TA_HOST_TRIES = 2;

function taMode(cfg) {
  return !!cfg && typeof cfg === 'object' && cfg.apiStyle === 'tensor';
}

function taId(s) {
  const m = String(s == null ? '' : s).match(/(\d{6,25})/);
  return m ? m[1] : '';
}

function taPick(v, list, def) {
  const s = String(v == null ? '' : v).trim();
  return list.indexOf(s) >= 0 ? s : def;
}

function taBool(v, def) {
  if (v === true || v === 'true' || v === 1 || v === '1') return true;
  if (v === false || v === 'false' || v === 0 || v === '0') return false;
  return def;
}

function taKeyStr(v) {
  return (typeof v === 'string' || typeof v === 'number') ? String(v).trim().slice(0, TA_KEY_MAX) : '';
}

function taList(arr, max) {
  const out = [];
  const src = Array.isArray(arr) ? arr : [];
  for (const l of src) {
    if (out.length >= max) break;
    const obj = !!l && typeof l === 'object';
    const id = taId(obj ? l.id : l);
    if (!id) continue;
    out.push({ id: id, w: naiNum(obj ? l.w : null, 0.05, 2, 1), key: obj ? taKeyStr(l.key) : '' });
  }
  return out;
}

function taSide(v) {
  const n = Number(v);
  if (!isFinite(n) || n <= 0) return 0;
  return taRound64(n);
}

function taEnsd(v) {
  const n = parseInt(v, 10);
  return (Number.isInteger(n) && n > 0 && n <= TA_SEED_MAX) ? n : 0;
}

function taNoKeys(ta) {
  if (!ta || typeof ta !== 'object') return ta;
  const strip = function (arr) {
    return (Array.isArray(arr) ? arr : []).map(function (l) {
      return { id: l.id, w: l.w, key: '' };
    });
  };
  return Object.assign({}, ta, { ckptKey: '', loras: strip(ta.loras), embeds: strip(ta.embeds) });
}

function taMask(cfg, text) {
  let t = String(text == null ? '' : text);
  const ta = (cfg && cfg.ta) || {};
  const keys = [ta.ckptKey].concat((ta.loras || []).map(function (l) { return l && l.key; }), (ta.embeds || []).map(function (l) { return l && l.key; }));
  for (const k of keys) {
    if (typeof k === 'string' && k.length >= 3) t = t.split(k).join('***');
  }
  return t;
}

function taTake(key) {
  const by = S._taBy;
  if (!key || !by || typeof by !== 'object') return null;
  const v = Object.prototype.hasOwnProperty.call(by, key) ? by[key] : null;
  delete by[key];
  return v || null;
}

function taKsName(s) {
  return String(s == null ? '' : s).trim().toLowerCase().replace(/_gpu$/, '');
}

function taSamplerCanon(sampler, sched) {
  const s = String(sampler == null ? '' : sampler).trim();
  const sc = String(sched == null ? '' : sched).trim().toLowerCase();
  const keep = (sc === 'simple' || sc === 'beta') ? sc : '';
  if (!s) return { sampler: '', sched: keep };
  if (TA_SAMPLERS.indexOf(s) >= 0) return { sampler: s, sched: keep };
  const k = taKsName(s);
  const want = (TA_SCHEDS.indexOf(sc) > 0 && !keep) ? sc : 'normal';
  let hit = null;
  let near = null;
  let any = null;
  for (const p of TA_KSAMPLERS) {
    if (taKsName(p[1]) !== k) continue;
    if (!any) any = p;
    if (!near && p[2] === 'normal') near = p;
    if (!hit && p[2] === want) hit = p;
  }
  const got = hit || near || any;
  if (got) return { sampler: got[0], sched: keep };
  const low = s.toLowerCase();
  for (const o of TA_SAMPLERS) if (o.toLowerCase() === low) return { sampler: o, sched: keep };
  return { sampler: '', sched: keep };
}

function taNorm(o) {
  const t = (o && typeof o === 'object') ? o : {};
  const seedN = parseInt(t.seed, 10);
  const sc = taSamplerCanon(t.sampler, t.sched);
  return {
    ckpt: taId(t.ckpt),
    ckptKey: taKeyStr(t.ckptKey),
    loras: taList(t.loras, TA_LORA_MAX),
    embeds: taList(t.embeds, TA_EMB_MAX),
    vae: taPick(t.vae, TA_VAES, 'Automatic'),
    sampler: sc.sampler,
    sched: sc.sched,
    steps: Math.round(naiNum(t.steps, 1, 60, 25)),
    cfg: naiNum(t.cfg, 0, 30, 7),
    clip: Math.round(naiNum(t.clip, 1, 12, 2)),
    seed: (Number.isInteger(seedN) && seedN > 0 && seedN <= TA_SEED_MAX) ? seedN : 0,
    guidance: naiNum(t.guidance, 0, 20, 0),
    base: Object.prototype.hasOwnProperty.call(TA_BASES, String(t.base)) ? String(t.base) : 'xl',
    w: taSide(t.w),
    h: taSide(t.h),
    ensd: taEnsd(t.ensd),
    neg: String(t.neg == null ? '' : t.neg).slice(0, TA_NEG_MAX),
    hires: taBool(t.hires, false),
    upscaler: taPick(t.upscaler, TA_UPSCALERS, '4x-UltraSharp'),
    hrScale: TA_HR_SCALES.indexOf(Number(t.hrScale)) >= 0 ? Number(t.hrScale) : 1.5,
    hrSteps: Math.round(naiNum(t.hrSteps, 1, 60, 15)),
    hrDenoise: naiNum(t.hrDenoise, 0, 1, 0.35),
    ad: taBool(t.ad, false),
    adModel: taPick(t.adModel, TA_AD_MODELS, 'face_yolov8s.pt'),
    adDenoise: naiNum(t.adDenoise, 0, 1, 0.4),
    adConf: naiNum(t.adConf, 0.05, 1, 0.5),
    adPrompt: String(t.adPrompt == null ? '' : t.adPrompt).trim().slice(0, TA_AD_TEXT_MAX),
    adNeg: String(t.adNeg == null ? '' : t.adNeg).trim().slice(0, TA_AD_TEXT_MAX),
    edit: naiNum(t.edit, 0.05, 1, 0.55),
    tags: taBool(t.tags, true),
    prompt: String(t.prompt == null ? '' : t.prompt).trim().slice(0, TA_PROMPT_MAX),
    mode: taPick(t.mode, TA_MODES, 'txt2img'),
    n: Math.round(naiNum(t.n, 1, 4, 1))
  };
}

async function taStored() {
  const c = S._taCache;
  if (c && Date.now() - c.at < 8000) return c.v;
  let v = null;
  try {
    v = await tavo.get(TA_KEY, 'global');
  } catch (e) {
    return c ? c.v : null;
  }
  S._taCache = { at: Date.now(), v: v };
  return v;
}

function taRound64(n) {
  return Math.min(TA_DIM_MAX, Math.max(TA_DIM_MIN, Math.round(n / 64) * 64));
}

function taDims(ar, base) {
  let a = String(ar || '').trim();
  if (!TA_DIMS[a]) a = '1:1';
  const k = TA_BASES[base] || 1;
  const d = TA_DIMS[a];
  return { w: taRound64(d[0] * k), h: taRound64(d[1] * k) };
}

function taReqId() {
  let hex = '';
  try {
    const u = new Uint8Array(16);
    crypto.getRandomValues(u);
    for (let i = 0; i < u.length; i++) hex += (u[i] < 16 ? '0' : '') + u[i].toString(16);
  } catch (e) {
    hex = '';
  }
  while (hex.length < 32) hex += Math.floor(Math.random() * 16).toString(16);
  return hex.slice(0, 32);
}

function taSeed() {
  let n = 0;
  try {
    const u = new Uint32Array(1);
    crypto.getRandomValues(u);
    n = u[0];
  } catch (e) {
    n = 0;
  }
  if (!(n >= 1 && n <= TA_SEED_MAX)) n = Math.floor(Math.random() * TA_SEED_MAX) + 1;
  return Math.min(TA_SEED_MAX, Math.max(1, n));
}

function taPromptText(tag, cfg) {
  tag = tag || {};
  const ta = cfg.ta || taNorm(null);
  let body = tag._taRaw ? String(tag.prompt || '').trim() : naiClean(tag.prompt || '');
  if (!tag._taManual) {
    let tail = [];
    if (ta.tags) {
      const cap = naiCaptions(tag, cfg);
      tail = cap.chars.map(function (c) {
        return c.caption;
      }).concat(cap.base);
    } else {
      const plain = naiPlainTail();
      if (plain) tail = [plain.replace(/^,\s*/, '')];
    }
    if (tail.length) body = (body ? body + ', ' : '') + tail.join(', ');
  }
  const neg = tag._taRaw ? String(ta.neg || '').trim() : naiClean([String(cfg.styleNegative || ''), ta.neg].filter(Boolean).join(', '));
  return { prompt: body.slice(0, TA_PROMPT_MAX), negative: neg };
}

function taDiffusion(tag, cfg, dims, denoise) {
  const ta = cfg.ta;
  const pt = taPromptText(tag, cfg);
  const d = {
    width: dims.w,
    height: dims.h,
    prompts: [{ text: pt.prompt }],
    negativePrompts: pt.negative ? [{ text: pt.negative }] : [],
    sdModel: ta.ckpt,
    sdVae: ta.vae,
    steps: ta.steps,
    cfgScale: ta.cfg,
    clipSkip: ta.clip
  };
  const sc = taSamplerCanon(ta.sampler, ta.sched);
  if (sc.sampler) d.sampler = sc.sampler;
  if (sc.sched === 'simple' || sc.sched === 'beta') d.scheduleName = sc.sched;
  if (ta.guidance > 0) d.guidance = ta.guidance;
  if (ta.ensd > 0) d.etaNoiseSeedDelta = ta.ensd;
  if (denoise != null) d.denoisingStrength = denoise;
  if (ta.ckptKey) d.modelAccessKey = ta.ckptKey;
  if (ta.loras.length) {
    d.lora = { items: ta.loras.map(function (l) {
      const it = { loraModel: l.id, weight: l.w };
      if (l.key) it.loraAccessKey = l.key;
      return it;
    }) };
  }
  if (ta.embeds && ta.embeds.length) {
    d.embedding = { items: ta.embeds.map(function (l) {
      const it = { model: l.id, weight: l.w };
      if (l.key) it.embeddingAccessKey = l.key;
      return it;
    }) };
  }
  return d;
}

function taStages(tag, cfg, io) {
  const ta = cfg.ta;
  const init = { count: 1, seed: ta.seed > 0 ? ta.seed : taSeed() };
  if (io && io.rid) init.imageResourceId = io.rid;
  const stages = [{ type: 'INPUT_INITIALIZE', inputInitialize: init }];
  const dims = (io && io.w) ? { w: io.w, h: io.h } : ((ta.w > 0 && ta.h > 0) ? { w: ta.w, h: ta.h } : taDims(tag.aspect_ratio || cfg.aspectRatio, ta.base));
  if (io && io.up) {
    stages.push({ type: 'DIFFUSION', diffusion: taDiffusion(tag, cfg, dims, TA_UP_DENOISE) });
    stages.push({ type: 'IMAGE_TO_UPSCALER', imageToUpscaler: { hrUpscaler: ta.upscaler, hrScale: ta.hrScale, hrSecondPassSteps: ta.hrSteps, denoisingStrength: ta.hrDenoise } });
    return stages;
  }
  if (io && io.mask) {
    stages.push({ type: 'IMAGE_TO_INPAINT', imageToInpaint: {
      resizeMode: 'DEFAULT',
      maskImageResourceId: io.mask,
      maskBlur: TA_MASK_BLUR,
      inpaintingFill: 'ORIGINAL',
      inpaintFullRes: true,
      inpaintFullResPadding: TA_INPAINT_PAD,
      diffusion: taDiffusion(tag, cfg, dims, ta.edit)
    } });
    return stages;
  }
  if (io && io.rid) {
    stages.push({ type: 'DIFFUSION', diffusion: taDiffusion(tag, cfg, dims, ta.edit) });
  } else {
    stages.push({ type: 'DIFFUSION', diffusion: taDiffusion(tag, cfg, dims, null) });
    if (ta.hires) stages.push({ type: 'IMAGE_TO_UPSCALER', imageToUpscaler: { hrUpscaler: ta.upscaler, hrScale: ta.hrScale, hrSecondPassSteps: ta.hrSteps, denoisingStrength: ta.hrDenoise } });
  }
  if (ta.ad) {
    const adArg = {
      adModel: ta.adModel,
      adConfidence: ta.adConf,
      adDilateErode: 4,
      adDenoisingStrength: ta.adDenoise,
      adInpaintOnlyMasked: true,
      adInpaintOnlyMaskedPadding: 32
    };
    if (ta.adPrompt) adArg.adPrompt = [{ text: ta.adPrompt }];
    if (ta.adNeg) adArg.adNegativePrompt = [{ text: ta.adNeg }];
    stages.push({ type: 'IMAGE_TO_ADETAILER', imageToAdetailer: { args: [adArg] } });
  }
  return stages;
}

function taStage(stages, type) {
  for (const st of (stages || [])) if (st && st.type === type) return st;
  return null;
}

function taCopyList(arr) {
  return (Array.isArray(arr) ? arr : []).map(function (l) {
    return { id: l.id, w: l.w, key: '' };
  });
}

function taUsed(cfg, stages) {
  const ta = taNorm(cfg && cfg.ta);
  const ini = taStage(stages, 'INPUT_INITIALIZE');
  const init = (ini && ini.inputInitialize) || {};
  const inp = taStage(stages, 'IMAGE_TO_INPAINT');
  const dif = taStage(stages, 'DIFFUSION');
  const d = (inp && inp.imageToInpaint && inp.imageToInpaint.diffusion) || (dif && dif.diffusion) || {};
  const ups = taStage(stages, 'IMAGE_TO_UPSCALER');
  const u = (ups && ups.imageToUpscaler) || null;
  const ads = taStage(stages, 'IMAGE_TO_ADETAILER');
  const a = (ads && ads.imageToAdetailer && Array.isArray(ads.imageToAdetailer.args) && ads.imageToAdetailer.args[0]) || null;
  let mode = 'txt2img';
  if (inp) mode = 'inpaint';
  else if (init.imageResourceId && u) mode = 'upscale';
  else if (init.imageResourceId) mode = 'img2img';
  const negs = Array.isArray(d.negativePrompts) ? d.negativePrompts : [];
  const pr = Array.isArray(d.prompts) ? d.prompts : [];
  return {
    v: 1,
    at: Date.now(),
    ckpt: String(d.sdModel || ta.ckpt),
    loras: taCopyList(ta.loras),
    embeds: taCopyList(ta.embeds),
    vae: String(d.sdVae || ta.vae),
    sampler: String(d.sampler || ''),
    sched: String(d.scheduleName || ''),
    steps: d.steps != null ? d.steps : ta.steps,
    cfg: d.cfgScale != null ? d.cfgScale : ta.cfg,
    clip: d.clipSkip != null ? d.clipSkip : ta.clip,
    seed: Number(init.seed) > 0 ? Number(init.seed) : 0,
    guidance: d.guidance > 0 ? d.guidance : 0,
    base: ta.base,
    w: d.width || 0,
    h: d.height || 0,
    neg: String((negs[0] && negs[0].text) || ''),
    negTa: ta.neg,
    ensd: d.etaNoiseSeedDelta > 0 ? d.etaNoiseSeedDelta : 0,
    prompt: String((pr[0] && pr[0].text) || ''),
    hires: mode === 'txt2img' && !!u,
    upscaler: u ? String(u.hrUpscaler || ta.upscaler) : ta.upscaler,
    hrScale: u ? u.hrScale : ta.hrScale,
    hrSteps: u ? u.hrSecondPassSteps : ta.hrSteps,
    hrDenoise: u ? u.denoisingStrength : ta.hrDenoise,
    ad: !!a,
    adModel: a ? String(a.adModel || ta.adModel) : ta.adModel,
    adDenoise: a ? a.adDenoisingStrength : ta.adDenoise,
    adConf: a ? a.adConfidence : ta.adConf,
    adPrompt: (a && Array.isArray(a.adPrompt) && a.adPrompt[0]) ? String(a.adPrompt[0].text || '') : '',
    adNeg: (a && Array.isArray(a.adNegativePrompt) && a.adNegativePrompt[0]) ? String(a.adNegativePrompt[0].text || '') : '',
    tags: ta.tags,
    mode: mode
  };
}

function taErrMsg(text) {
  let m = '';
  try {
    const j = JSON.parse(text);
    m = String((j && (j.message || (j.error && j.error.message))) || '');
    if (j && j.tips) m = (m ? m + ' · ' : '') + String(j.tips);
  } catch (e) {}
  return naiSafeMsg(m || String(text || '')).slice(0, 200);
}

function taBodyCut(text) {
  return String(text == null ? '' : text).replace(/<[^>]*>/g, ' ').replace(/[<>]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 300);
}

function taHttpErr(st, url, m, resp, body) {
  const low = String(m || '').toLowerCase();
  let head = 'Tensor Art: ' + (m || ('HTTP ' + st));
  if (st === 401 || (st === 404 && (low.indexOf('unauthorized') >= 0 || low.indexOf('app not found') >= 0)) || low.indexOf('invalid authorization') >= 0) head = TA_KEY_BAD;
  else if (st === 402 || low.indexOf('insufficient') >= 0 || low.indexOf('credit') >= 0 || low.indexOf('balance') >= 0) head = TA_NO_CREDITS;
  else if (st === 429) head = 'Tensor Art: лимит запросов — пауза';
  else if (st === 400) head = 'Tensor Art: запрос отклонён — ' + (m || 'HTTP 400');
  const e = apiErr(st, url, body || m, resp);
  e.message = head + ' · ' + e.message;
  if (head === TA_KEY_BAD) e.iigKeyBad = 1;
  if (st === 429) e.retryAfterMs = retryAfterMs(resp) || 3000;
  return e;
}

async function taJson(cfg, path, body) {
  const url = TA_HOST + path;
  const opts = {
    method: body ? 'POST' : 'GET',
    headers: { 'Authorization': 'Bearer ' + cfg.apiKey, 'Accept': 'application/json' }
  };
  if (body) {
    opts.headers['Content-Type'] = 'application/json';
    opts.body = JSON.stringify(body);
  }
  let resp;
  try {
    resp = await fetchT(url, opts, TA_API_TIMEOUT, cfg._sig);
  } catch (e) {
    if (e && e.iigStop) throw e;
    throw new Error('Сеть/CORS при запросе ' + url + ' :: ' + ((e && e.message) || 'Failed to fetch'));
  }
  const text = await resp.text().catch(function () {
    return '';
  });
  if (!resp.ok) throw taHttpErr(resp.status, url, taMask(cfg, taErrMsg(text)), resp, resp.status === 400 ? taMask(cfg, taBodyCut(text)) : '');
  try {
    return JSON.parse(text);
  } catch (e) {
    throw new Error('Tensor Art: ответ не разобрался (' + path + ')');
  }
}

function taBytes(b64) {
  const bin = atob(String(b64 || ''));
  const u = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i);
  return u;
}

async function taUpload(cfg, b64, mime) {
  const r = await taJson(cfg, '/v1/resource/image', { expireSec: TA_UPLOAD_EXPIRE_S });
  if (!r || !r.putUrl || !r.resourceId) throw new Error('Tensor Art: сервер не дал адрес для загрузки исходника');
  if (!/^https:\/\//i.test(String(r.putUrl))) throw new Error('Tensor Art: адрес загрузки не https');
  const hdrs = {};
  const given = (r.headers && typeof r.headers === 'object') ? r.headers : {};
  for (const k in given) if (typeof given[k] === 'string') hdrs[k] = given[k];
  let hasCt = false;
  for (const k in hdrs) if (k.toLowerCase() === 'content-type') hasCt = true;
  if (!hasCt) hdrs['Content-Type'] = mime || 'image/png';
  let p;
  try {
    p = await fetchT(String(r.putUrl), { method: 'PUT', headers: hdrs, body: taBytes(b64) }, TA_UPLOAD_TIMEOUT, cfg._sig);
  } catch (e) {
    if (e && e.iigStop) throw e;
    throw new Error('Tensor Art: исходник не загрузился (сеть/CORS хранилища) :: ' + ((e && e.message) || 'Failed to fetch'));
  }
  if (!p.ok) throw new Error('Tensor Art: исходник не загрузился (HTTP ' + p.status + ')');
  return String(r.resourceId);
}

async function taJpegB64(pngB64) {
  try {
    if (!naiCanvasOk()) return '';
    const bm = await naiBitmap('data:image/png;base64,' + pngB64);
    const cv = new OffscreenCanvas(bm.width, bm.height);
    cv.getContext('2d').drawImage(bm, 0, 0);
    return (await _blobB64(await cv.convertToBlob({ type: 'image/jpeg', quality: 0.95 }))) || '';
  } catch (e) {
    return '';
  }
}

function taSleep(ms, sig) {
  return new Promise(function (res, rej) {
    if (sig && sig.aborted) return rej(stopErr());
    let t = null;
    const onAb = function () {
      if (t) clearTimeout(t);
      rej(stopErr());
    };
    t = setTimeout(function () {
      try {
        if (sig) sig.removeEventListener('abort', onAb);
      } catch (e) {}
      res();
    }, ms);
    try {
      if (sig) sig.addEventListener('abort', onAb);
    } catch (e) {}
  });
}

function taJobErr(job, cfg) {
  const fi = (job && job.failedInfo) || {};
  const reason = taMask(cfg, naiSafeMsg(String(fi.reason || ''))).slice(0, 200);
  let raw = '';
  try {
    raw = JSON.stringify(fi);
  } catch (e0) {
    raw = '';
  }
  raw = (raw && raw !== '{}') ? taMask(cfg, taBodyCut(raw)) : '';
  const e = new Error('Tensor Art: задание не выполнено' + (reason ? ' — ' + reason : '') + (job && job.status === 'CANCELED' ? ' (отменено)' : '') + (raw ? ' :: ' + raw : ''));
  if (fi.code === 'TRANSITORY_ERROR') {
    e.status = 503;
    e.taTransitory = 1;
  }
  return e;
}

function taUrlExp(url, now) {
  const u = String(url || '');
  const t0 = now || Date.now();
  const ex = u.match(/[?&]X-Amz-Expires=(\d{1,7})(?:&|$)/i);
  if (!ex) return t0 + TA_URL_TTL;
  const sec = parseInt(ex[1], 10);
  const dt = u.match(/[?&]X-Amz-Date=(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z(?:&|$)/i);
  if (dt) {
    const base = Date.UTC(+dt[1], +dt[2] - 1, +dt[3], +dt[4], +dt[5], +dt[6]);
    if (isFinite(base) && base > 0) return base + sec * 1000;
  }
  return t0 + sec * 1000;
}

function taHhmm(ms) {
  try {
    const d = new Date(ms);
    const p = function (n) {
      return (n < 10 ? '0' : '') + n;
    };
    return p(d.getHours()) + ':' + p(d.getMinutes());
  } catch (e) {
    return '';
  }
}

function taNetFail(e) {
  if (!e) return false;
  if (e.name === 'TypeError') return true;
  const m = String(e.message || '').toLowerCase();
  return m.indexOf('failed to fetch') >= 0 || m.indexOf('load failed') >= 0 || m.indexOf('networkerror') >= 0 || m.indexOf('cors') >= 0 || m.indexOf('timeout') >= 0 || m.indexOf('пустой ответ') >= 0;
}

function taImgOk(du) {
  const s = typeof du === 'string' ? du : '';
  if (s.indexOf('data:') !== 0) return false;
  let dims = null;
  try {
    dims = imgDimsOf(s);
  } catch (e) {
    dims = null;
  }
  return !!dims || /^data:image\/(png|jpeg|jpg|webp|gif);/i.test(s);
}

async function taFetchImg(url, cfg) {
  const du = await urlToDataUrl(url, cfg && cfg._sig);
  if (!du) throw new Error('Tensor Art: пустой ответ хранилища');
  return String(du);
}

function taShortUrl(u) {
  const s = String(u || '');
  let t = '';
  try {
    const x = new URL(s);
    t = x.host + x.pathname;
  } catch (e) {
    t = s.replace(/^[a-z]+:\/\//i, '').split('#')[0].split('?')[0];
  }
  return t.slice(0, 120);
}

function taWhy(e) {
  const m = String((e && e.message) || 'сбой').trim().replace(/^fetch (\d+)$/, 'HTTP $1').replace(/^Tensor Art: /, '');
  return m.slice(0, 80);
}

async function taHostFetch(url, cfg) {
  const u = String(url || '');
  cfg = cfg || {};
  if (!/^https:\/\//i.test(u)) throw new Error('Tensor Art: ссылка не https');
  if (cfg._sig && cfg._sig.aborted) throw stopErr();
  const nm = 'iig_ta_dl_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6).padEnd(4, '0') + '.png';
  const p = await tavo.file.save(nm, u, { scope: 'tmp' });
  if (typeof p !== 'string' || !p) throw new Error('Tensor Art: хост не вернул путь файла');
  let du = '';
  try {
    du = await tavo.file.load(p, { encoding: 'dataUrl' });
  } finally {
    try {
      await tavo.file.delete(p);
    } catch (e) {
      elog('tensor · tmp', e);
    }
  }
  let dims = null;
  try {
    dims = taImgOk(du) ? imgDimsOf(String(du)) : null;
  } catch (e) {
    dims = null;
  }
  if (!dims) throw new Error('Tensor Art: хост скачал не картинку');
  return String(du);
}

async function taDownload(url, cfg) {
  const u = String(url || '');
  cfg = cfg || {};
  let last = null;
  let hostErr = null;
  for (let h = 0; h < TA_HOST_TRIES; h++) {
    if (h) await taSleep(TA_DL_PAUSE, cfg._sig);
    try {
      return await taHostFetch(u, cfg);
    } catch (e) {
      if (e && e.iigStop) throw e;
      if (!hostErr) hostErr = e;
      last = e;
      if (!/^https:\/\//i.test(u)) break;
    }
  }
  const hsWhy = hostErr ? ' · хост: ' + taWhy(hostErr) : '';
  let net = false;
  for (let a = 0; a < TA_DL_TRIES; a++) {
    if (a) await taSleep(TA_DL_PAUSE, cfg._sig);
    try {
      return await taFetchImg(u, cfg);
    } catch (e) {
      if (e && e.iigStop) throw e;
      last = e;
      net = taNetFail(e);
    }
  }
  const exp = taUrlExp(u);
  const jid = cfg._taJob != null ? String(cfg._taJob) : '';
  const cr = cfg._taCredits != null ? cfg._taCredits : null;
  let err;
  if (net) {
    err = new Error('Tensor Art: картинка готова (' + (jid ? 'задание ' + jid : 'задание') + (cr != null ? ', списано ' + cr : '') + '), но хранилище Tensor закрыто для приложений (нет CORS) или не ответило вовремя — скачать не удалось' + hsWhy + '. Ссылка живёт час, полная ссылка — в записи студии / кнопка «открыть ссылку»: ' + taShortUrl(u));
    err.code = 'TA_IMG_CORS';
    err.iigRu = 1;
  } else {
    err = new Error('Tensor Art: картинка готова, но не скачалась — ' + String((last && last.message) || 'сбой').slice(0, 120) + hsWhy);
  }
  err.iigNoRetry = true;
  err.taUrl = u;
  err.taExp = exp;
  err.url = u;
  err.jobId = jid;
  err.credits = cr;
  err.expiresAt = exp;
  if (jid) err.taJobId = jid;
  if (cr != null) err.taCredits = cr;
  throw err;
}

function taLostNote(e) {
  const cr = e && e.taCredits != null ? e.taCredits : null;
  return 'Tensor Art: ' + (cr != null ? 'списано кредитов ' + cr + ' · ' : '') + 'картинка не скачалась — показана по ссылке до ' + taHhmm(e && e.taExp);
}

function taLost(e) {
  return !!(e && e.code === 'TA_IMG_CORS' && /^https:\/\//i.test(String(e.taUrl || '')));
}

async function taPoll(cfg, jobId) {
  let lastNote = '';
  for (;;) {
    if (cfg._sig && cfg._sig.aborted) throw stopErr();
    if (cfg._deadline && Date.now() > cfg._deadline) throw new Error('Tensor Art: картинка не пришла за отведённое время (задание ' + jobId + ')');
    await taSleep(TA_POLL_MS, cfg._sig);
    const r = await taJson(cfg, '/v1/jobs/' + encodeURIComponent(jobId));
    const job = (r && r.job) || {};
    const st = String(job.status || '');
    if (st === 'SUCCESS') return job;
    if (st === 'FAILED' || st === 'CANCELED') throw taJobErr(job, cfg);
    let note = '';
    if (st === 'WAITING' && job.waitingInfo) note = 'Tensor Art: очередь — место ' + (job.waitingInfo.queueRank != null ? job.waitingInfo.queueRank : '?') + ' из ' + (job.waitingInfo.queueLen != null ? job.waitingInfo.queueLen : '?');
    else if (st === 'RUNNING') note = 'Tensor Art: рисует';
    if (note && note !== lastNote) {
      lastNote = note;
      actNote(note);
    }
  }
}

async function taSource(cfg, src, strokes) {
  const fit = await naiFitSrc(src);
  if (!fit) throw new Error('Tensor Art: исходник не подготовился для доработки');
  const io = { w: fit.w, h: fit.h, rid: await taUpload(cfg, fit.b64, 'image/png'), mask: '' };
  if (Array.isArray(strokes) && strokes.length) {
    const mb = await naiMask(fit.w, fit.h, strokes);
    if (mb) {
      const jb = await taJpegB64(mb);
      io.mask = await taUpload(cfg, jb || mb, jb ? 'image/jpeg' : 'image/png');
    } else {
      S._refLost.push(TA_NO_MASK);
    }
  }
  return io;
}

async function genTensor(tag, refs, cfg) {
  S._naiNote = '';
  S._taLast = null;
  if (!cfg.apiKey) throw new Error(TA_NO_KEY);
  if (!Array.isArray(S._refLost)) S._refLost = [];
  cfg.ta = taNorm(cfg.ta || await taStored());
  if (!cfg.ta.ckpt) throw new Error(TA_NO_CKPT);
  const photo = (refs || []).filter(function (r) {
    return r && r.dataUrl && !r.textOnly;
  });
  if (photo.length && S._refLost.indexOf(TA_NO_PHOTO_REFS) < 0) S._refLost.push(TA_NO_PHOTO_REFS);
  let io = null;
  const edit = tag && tag._edit;
  const up = tag && tag._taUp;
  if (edit && edit.src) io = await taSource(cfg, edit.src, edit.strokes);
  else if (up && up.src) {
    io = await taSource(cfg, up.src, null);
    io.up = 1;
  }
  const body = { requestId: taReqId(), stages: taStages(tag || {}, cfg, io) };
  const made = await taJson(cfg, '/v1/jobs', body);
  const jid = made && made.job && made.job.id;
  if (jid == null || jid === '') throw new Error('Tensor Art: задание не создано — ' + taMask(cfg, String(JSON.stringify(made || {}))).slice(0, 160));
  actNote('Tensor Art: задание ' + String(jid) + ' принято');
  let credits = null;
  try {
    const job = await taPoll(cfg, String(jid));
    const img = job.successInfo && Array.isArray(job.successInfo.images) ? job.successInfo.images[0] : null;
    if (job.credits != null) credits = job.credits;
    if (!img || !img.url) throw new Error('Tensor Art: в ответе нет картинки');
    const tam = taUsed(cfg, body.stages);
    S._taLast = tam;
    if (tag && typeof tag._taKey === 'string' && tag._taKey) {
      if (!S._taBy || typeof S._taBy !== 'object') S._taBy = {};
      S._taBy[tag._taKey] = tam;
    }
    if (job.credits != null) S._naiNote = 'Tensor Art: списано кредитов ' + job.credits;
    S._lastImgTok = 0;
    return await taDownload(String(img.url), Object.assign({}, cfg, { _taJob: String(jid), _taCredits: credits }));
  } catch (e) {
    if (e && typeof e === 'object' && !e.taTransitory) {
      e.iigNoRetry = true;
      e.taJobId = String(jid);
      if (credits != null) e.taCredits = credits;
    }
    throw e;
  }
}

function taCreditsOf(r) {
  const v = (r && r.credits != null) ? r.credits : ((r && r.job && r.job.credits != null) ? r.job.credits : null);
  const n = Number(v);
  return (v != null && v !== '' && isFinite(n)) ? n : null;
}

async function taCredits(cfg, stages) {
  const r = await taJson(cfg, '/v1/jobs/credits', { requestId: taReqId(), stages: stages });
  return taCreditsOf(r);
}

async function taCostRun(c) {
  c = c || {};
  const id = String(c.jid || c.id || '').slice(0, 60);
  let credits = null;
  let error = '';
  try {
    const cfg = await resolveCfg();
    if (cfg._vaultErr) throw new Error(cfg._vaultErr);
    if (!taMode(cfg)) throw new Error('подключение не Tensor Art');
    if (!cfg.apiKey) throw new Error(TA_NO_KEY);
    const mode = TA_MODES.indexOf(c.mode) >= 0 ? c.mode : 'txt2img';
    const cfg2 = Object.assign({}, cfg, { ta: taNorm(c.ta || cfg.ta) });
    if (!cfg2.ta.ckpt) throw new Error(TA_NO_CKPT);
    const tag = { prompt: cfg2.ta.prompt || 'preview', aspect_ratio: cfg.aspectRatio || '1:1', _taManual: 1 };
    const io = mode === 'upscale' ? { up: 1 } : null;
    credits = await taCredits(cfg2, taStages(tag, cfg2, io));
  } catch (e) {
    error = String(errText(e) || 'сбой').slice(0, 400);
  }
  try {
    await tavo.set('iig_ta_cost', { id: id, credits: credits, error: error, at: Date.now() }, 'global');
  } catch (e) {
    elog('tensor · оценка', e);
  }
}

const TX_SRC_MAX = 4 * 1024 * 1024;
const TX_CHAT_NAME = /^iig_[a-z0-9_]{1,80}\.(png|jpe?g|webp)$/i;

async function tensorSrc(src) {
  const s = (src && typeof src === 'object') ? src : {};
  if (s.kind === 'studio') {
    let list = [];
    try {
      list = (await tavo.get('iig_studio', 'global')) || [];
    } catch (e) {}
    const rec = (Array.isArray(list) ? list : []).find(function (x) {
      return x && String(x.id) === String(s.id);
    });
    if (!rec || !rec.path) throw new Error('исходник не найден в студии');
    const nm = String(rec.path).split('/').pop();
    const du = await tavo.file.load(nm, { encoding: 'dataUrl', scope: 'global' });
    if (!du || !_imgOk(du)) throw new Error('файл исходника не прочитался');
    return { du: String(du), ref: { kind: 'studio', id: String(rec.id) } };
  }
  if (s.kind === 'chat') {
    const p = String(s.path || '');
    const m = p.match(/^files\/(chat|global)\/([^/]+)$/);
    if (!m || !TX_CHAT_NAME.test(m[2])) throw new Error('исходник из чата: имя файла не подходит');
    const du = await imgBytes('files/' + m[1] + '/' + m[2]);
    if (!du || !_imgOk(du)) throw new Error('картинка чата не прочиталась');
    return { du: String(du), ref: { kind: 'chat', path: 'files/' + m[1] + '/' + m[2] } };
  }
  if (s.kind === 'data') {
    const d = typeof s.dataUrl === 'string' ? s.dataUrl : '';
    const m = d.match(/^data:image\/(png|jpeg|webp);base64,([A-Za-z0-9+/=]+)$/);
    if (!m) throw new Error('файл не картинка PNG, JPEG или WebP');
    if (Math.floor(m[2].length * 3 / 4) > TX_SRC_MAX) throw new Error('файл больше 4 МБ');
    if (!_imgOk(d)) throw new Error('файл не картинка');
    return { du: d, ref: { kind: 'data' } };
  }
  throw new Error('не выбран исходник');
}

function tensorRun(c) {
  S._stQ = (S._stQ || Promise.resolve()).then(function () {
    return tensorJob(c);
  }, function () {
    return tensorJob(c);
  });
  return S._stQ;
}

async function tensorJob(c) {
  c = c || {};
  const jobId = String(c.jid || Date.now().toString(36)).replace(/[^0-9a-z]/gi, '').toLowerCase().slice(0, 40) || Date.now().toString(36);
  const mode = TA_MODES.indexOf(c.mode) >= 0 ? c.mode : 'txt2img';
  const count = Math.max(1, Math.min(4, parseInt(c.n, 10) || 1));
  const made = [];
  let warn = '';
  let ac = null;
  let release = function () {};
  S._stLock = new Promise(function (r) {
    release = r;
  });
  actStart('Tensor Art: ' + mode);
  try {
    await stJob(jobId, { state: 'image', k: 1, n: count, ids: [] });
    let src = '';
    let srcRef = null;
    const mark = mode === 'inpaint' ? stMarkNorm(c.mark) : null;
    if (mode === 'inpaint' && !mark) throw new Error('для Inpaint нарисуй маску');
    if (mode !== 'txt2img') {
      const got = await tensorSrc(c.src);
      src = got.du;
      srcRef = got.ref;
    }
    if (!(await stQuiet())) throw new Error('в чате всё ещё идёт генерация — попробуй позже');
    const cfg = await resolveCfg();
    if (cfg._vaultErr) throw new Error(cfg._vaultErr);
    if (!taMode(cfg)) throw new Error('подключение не Tensor Art — выбери «Tensor Art» на вкладке api');
    if (!cfg.apiKey) throw new Error(TA_NO_KEY);
    const ta = taNorm(Object.assign({}, (c.ta && typeof c.ta === 'object') ? c.ta : {}, { tags: false, mode: mode, n: count }));
    if (!ta.ckpt) throw new Error(TA_NO_CKPT);
    if (mode === 'txt2img' && !ta.prompt) throw new Error('промпт пуст');
    if (src) src = await editSrcFit(src);
    try {
      ac = new AbortController();
    } catch (e) {}
    if (ac) S._acReg.iig_studio = ac;
    const ar = (ta.w > 0 && ta.h > 0) ? (arNearest(ta.w, ta.h) || '1:1') : (cfg.aspectRatio || '1:1');
    const req = { mode: mode, n: count, ta: taNoKeys(ta) };
    for (let k = 0; k < count; k++) {
      await stJob(jobId, { state: 'image', k: k + 1, n: count, ids: made.slice() });
      const id = count > 1 ? (jobId + 'abcd'.charAt(k)) : jobId;
      const seed = ta.seed > 0 ? (((ta.seed - 1 + k) % TA_SEED_MAX) + 1) : taSeed();
      const taK = Object.assign({}, ta, { seed: seed });
      const cfg2 = Object.assign({}, cfg, { maxRetries: 2, _deadline: Date.now() + GEN_DEADLINE, _szAuto: false, aspectRatio: ar, styleNegative: '', ta: taK });
      if (ac) cfg2._sig = ac.signal;
      const tag = { prompt: ta.prompt, aspect_ratio: ar, image_size: '1K', _taManual: 1, _taRaw: 1, _taKey: id };
      if (mode === 'img2img') tag._edit = { src: src, strokes: null };
      else if (mode === 'inpaint') tag._edit = { src: src, strokes: mark };
      else if (mode === 'upscale') tag._taUp = { src: src };
      S._naiNote = '';
      let out = null;
      let lost = null;
      try {
        out = await withRetry(function () {
          return generate(tag, [], cfg2);
        }, cfg2);
      } catch (eG) {
        if (!taLost(eG)) throw eG;
        lost = eG;
      }
      const tam = taTake(id);
      if (tam) tam.mode = mode;
      if (lost) {
        elog('tensor · ' + mode, lost.message);
        const recL = {
          id: id,
          path: '',
          url: lost.taUrl,
          urlExp: lost.taExp,
          jobId: String(lost.taJobId || ''),
          prov: 'tensor',
          mode: mode,
          text: ta.prompt.slice(0, 200),
          prompt: ta.prompt,
          ar: (tam && tam.w > 0 && tam.h > 0) ? (tam.w + ':' + tam.h) : ar,
          req: req,
          tam: tam,
          note: taLostNote(lost),
          at: Date.now()
        };
        if (srcRef) recL.src = srcRef;
        await stIndexAdd(recL);
        made.push(id);
        warn = 'TA_IMG_CORS';
        await stJob(jobId, { state: 'image', k: k + 1, n: count, ids: made.slice(), warn: warn });
        continue;
      }
      if (/^https?:/i.test(String(out))) {
        const d = await urlToDataUrl(out, cfg2._sig);
        if (!d) throw new Error('картинка пришла ссылкой, скачать не удалось');
        out = d;
      }
      const dims = await imgDims(out);
      const arO = (dims && dims.w >= 64 && dims.h >= 64) ? (dims.w + ':' + dims.h) : ((tam && tam.w > 0 && tam.h > 0) ? (tam.w + ':' + tam.h) : ar);
      const path = await tavo.file.save('iig_st_' + id + '.png', out, { scope: 'global' });
      if (!path) throw new Error('файл не сохранился');
      const rec = {
        id: id,
        path: String(path),
        prov: 'tensor',
        mode: mode,
        text: ta.prompt.slice(0, 200),
        prompt: ta.prompt,
        ar: arO,
        req: req,
        tam: tam,
        note: S._naiNote || '',
        at: Date.now()
      };
      if (srcRef) rec.src = srcRef;
      await stIndexAdd(rec);
      made.push(id);
      await stJob(jobId, { state: 'image', k: k + 1, n: count, ids: made.slice() });
      try {
        _statAdd({ imgs: 1, imgTok: 0 });
      } catch (e) {}
    }
    await stJob(jobId, warn ? { state: 'ok', ids: made, warn: warn } : { state: 'ok', ids: made });
    actEnd('Tensor Art: ' + (made.length > 1 ? ('готово картинок: ' + made.length) : 'картинка готова') + (S._naiNote ? ' · ' + S._naiNote : ''));
  } catch (e) {
    const stopped = !!(e && e.iigStop);
    const t = stopped ? 'остановлено кнопкой стоп' : errText(e);
    if (!stopped) elog('tensor · ' + mode, t);
    await stJob(jobId, { state: 'error', error: t, ids: made });
    actEnd(stopped ? 'Tensor Art: остановлено' : ('Tensor Art: не вышло — ' + String(t).slice(0, 90)));
  } finally {
    if (ac && S._acReg.iig_studio === ac) delete S._acReg.iig_studio;
    S._stLock = null;
    release();
  }
}

const isRetryableTa0 = isRetryable;
isRetryable = function (e) {
  if (e && e.iigNoRetry) return false;
  return isRetryableTa0(e);
};

const resolveCfgTa0 = resolveCfg;
resolveCfg = async function () {
  const c = await resolveCfgTa0.apply(this, arguments);
  if (taMode(c) && !c.ta) c.ta = taNorm(await taStored());
  return c;
};

const generateNai0 = generate;
generate = async function (tag, refs, cfg) {
  if (cfg.apiStyle === 'novelai') {
    naiArtNote(cfg);
    return genNovelAI(tag, refs, cfg);
  }
  if (cfg.apiStyle === 'tensor') return genTensor(tag, refs, cfg);
  return generateNai0(tag, refs, cfg);
};

const generate0 = generate;
generate = function (tag, refs, cfg) {
  const ok = [];
  const bad = [];
  for (const r of (refs || [])) {
    if (r && _imgOk(r.dataUrl)) ok.push(r);
    else bad.push(r);
  }
  if (bad.length) {
    const names = bad.map(refName);
    S._refLost = (S._refLost || []).concat(names.map(function (n) {
      return 'реф «' + n + '» — файл не картинка, не отправлен';
    }));
    actNote('рефы без картинки не отправлены: ' + names.join(', '));
    elog('рефы', 'не картинка: ' + names.join(', ') + ' · начало: ' + bad.map(function (r) {
      return String((r && r.dataUrl) || '').slice(0, 48);
    }).join(' | '));
  }
  return generate0(tag, ok, cfg);
};

const EN_EXTRA = { 'і': 'i', 'І': 'I', 'ї': 'yi', 'Ї': 'Yi', 'є': 'ye', 'Є': 'Ye', 'ґ': 'g', 'Ґ': 'G', 'ў': 'u', 'Ў': 'U', 'ё': 'yo', 'Ё': 'Yo' };

function enName(n) {
  const s = String(n || '').trim();
  if (!S._enOn || !hasCyr(s)) return s;
  let t = '';
  try {
    t = String(_translit(s.replace(/[іІїЇєЄґҐўЎёЁ]/g, function (ch) { return EN_EXTRA[ch]; })) || '').replace(/(^|[\s\-'])([a-z])/g, function (m, a, b) { return a + b.toUpperCase(); }).trim();
  } catch (e) {
    t = '';
  }
  return t && !hasCyr(t) ? t : '';
}

function enNamePairs(refs, names) {
  const nm = names || S._names || {};
  const src = [nm.char, nm.user];
  for (const r of (refs || [])) {
    if (r && r.rtype === 'npc') src.push(refNpcName(r));
  }
  const pairs = [];
  const seen = {};
  for (const raw of src) {
    const full = String(raw || '').replace(/\s+/g, ' ').trim();
    if (!full || !hasCyr(full) || full.length > 60) continue;
    const cands = [full].concat(full.split(' ').filter(function (w) { return w.length >= 3; }));
    for (const c of cands) {
      if (seen[c] || !hasCyr(c)) continue;
      const t = enName(c);
      if (!t) continue;
      seen[c] = 1;
      pairs.push([c, t]);
    }
  }
  pairs.sort(function (a, b) { return b[0].length - a[0].length; });
  return pairs;
}

function enNamesFix(s, refs, names) {
  let o = String(s == null ? '' : s);
  if (!S._enOn || !hasCyr(o)) return o;
  for (const pr of enNamePairs(refs, names)) o = o.split(pr[0]).join(pr[1]);
  return o;
}

function enLabelCyr(r) {
  return !!(r && hasCyr(r.label));
}
function enLabelsFix(list, refs, names) {
  return list.map(function (r) {
    return enLabelCyr(r) ? Object.assign({}, r, { label: enNamesFix(r.label, refs, names) }) : r;
  });
}
const generateEn0 = generate;
generate = async function (tag, refs, cfg) {
  enSync(cfg);
  if (S._enOn) {
    const tagCyr = !!(tag && typeof tag === 'object') && (hasCyr(tag.prompt) || (Array.isArray(tag.chars) && tag.chars.some(function (c) { return c && hasCyr(c.caption); })));
    const refCyr = Array.isArray(refs) && refs.some(enLabelCyr);
    const txt = Array.isArray(S._textRefs) ? S._textRefs : [];
    const txtCyr = txt.some(enLabelCyr);
    if (tagCyr || refCyr || txtCyr) {
      let names = S._names;
      if (!(names && (names.char || names.user))) {
        try {
          names = await castNames();
        } catch (e) {
          names = null;
        }
      }
      if (tagCyr) {
        tag = Object.assign({}, tag);
        tag.prompt = enNamesFix(tag.prompt, refs, names);
        if (Array.isArray(tag.chars)) {
          tag.chars = tag.chars.map(function (c) {
            return (c && hasCyr(c.caption)) ? Object.assign({}, c, { caption: enNamesFix(c.caption, refs, names) }) : c;
          });
        }
      }
      if (refCyr) refs = enLabelsFix(refs, refs, names);
      if (txtCyr) S._textRefs = enLabelsFix(txt, refs, names);
    }
  }
  return generateEn0(tag, refs, cfg);
};

appearanceTail = function (refs) {
  try {
    if (refs && refs.length) return '';
    const ps = S._pass || {};
    const nm = S._names || {};
    const parts = [];
    for (const who of ['char', 'user']) {
      const p = String(ps[who] || '').trim();
      if (!p) continue;
      parts.push((enName(nm[who]) || ('the ' + who)) + ' — ' + p);
    }
    if (!parts.length) return '';
    return ' [APPEARANCE (authoritative, follow exactly, never swap traits between characters): ' + parts.join('; ') + ']';
  } catch (e) {
    return '';
  }
};

function pwLatinShare(s) {
  const lat = (String(s).match(/[A-Za-z]/g) || []).length;
  const cyr = (String(s).match(/[Ѐ-ӿ]/g) || []).length;
  return (lat + cyr) ? lat / (lat + cyr) : 0;
}

function pwUnwrap(raw) {
  let t = String(raw || '');
  if (/(^|\n)[ \t]{0,}AFTER[ \t]{0,4}:/i.test(t)) return t;
  t = t.replace(/<think(?:ing)?>[\s\S]*?<\/think(?:ing)?>/gi, '').trim();
  const lab = t.match(/(?:^|\n)[ \t>*#-]{0,6}(?:FINAL |IMAGE )?PROMPT[ \t]{0,3}:[ \t]{0,}/gi);
  if (lab) {
    const last = lab[lab.length - 1];
    t = t.slice(t.lastIndexOf(last) + last.length).trim();
  }
  const paras = t.split(/\n[ \t]*\n+/).map(function (x) {
    return x.trim();
  }).filter(Boolean);
  if (paras.length < 2) return t;
  const good = paras.filter(function (p) {
    return /^[ \t]{0,}CAST[ \t]{0,2}:/i.test(p) || (pwLatinShare(p) >= 0.7 && _wc(p) >= 15);
  });
  const hasBody = good.some(function (p) {
    return !/^[ \t]{0,}CAST[ \t]{0,2}:/i.test(p);
  });
  if (!hasBody || good.length === paras.length) return t;
  return good.join('\n\n');
}

const REF_BOUND = { outfit: 1, hair: 1, nails: 1, face: 1, pose: 1, body: 1 };

function refNpcName(r) {
  const n = String((r && r.note) || '');
  const k = n.indexOf(':');
  return (k > 0 ? n.slice(0, k) : n.split(' - ')[0]).trim();
}

function placeGate(refs) {
  const keep = [];
  let cut = 0;
  for (const r of (refs || [])) {
    if (r && r.rtype === 'background') {
      cut++;
      continue;
    }
    keep.push(r);
  }
  if (cut) S._refLost.push('локация — модель сказала, что сцена не в известной локации (PLACE: none)');
  return keep;
}

function castFromChars(cast, chars) {
  if (!cast || typeof cast !== 'object') return cast;
  const out = Object.assign({}, cast);
  for (const c of (Array.isArray(chars) ? chars : [])) {
    if (c && c.caption && (c.who === 'char' || c.who === 'user')) out[c.who] = true;
  }
  return out;
}

function refNamedIn(text, nm) {
  if (_nameInPrompt(text, nm)) return true;
  const k = castNameKey(nm).split(' ')[0];
  return k.length >= 2 && String(text || '').toLowerCase().indexOf(k) >= 0;
}

const refGate0 = refGate;
refGate = function (refs, cast, prompt) {
  if (!refs || !refs.length || !cast) return refs;
  if (!Array.isArray(S._refLost)) S._refLost = [];
  const text = String(prompt || '') + '\n' + String(S._castPost || '');
  const out = [];
  for (const r of refs) {
    if (r && (r.who === 'char' || r.who === 'user')) {
      const nmE = enName(r.nm);
      if (cast[r.who] !== false || refNamedIn(text, r.nm) || (nmE && nmE !== r.nm && refNamedIn(text, nmE))) out.push(r);
      else if (refGate0([r], cast, text).length) out.push(r);
      continue;
    }
    out.push(r);
  }
  return out;
};

function refGate2(refs, cast, prompt, names) {
  if (!cast || typeof cast !== 'object') return refs;
  if (S._pwSlimOk >= 2) {
    if (!Array.isArray(S._refLost)) S._refLost = [];
    S._refLost.push('гейт кадра выключен — промпт написан в урезанном режиме');
    return refs;
  }
  if (!Array.isArray(S._refLost)) S._refLost = [];
  const tText = String(prompt || '') + '\n' + String(S._castPost || '');
  const tKeep = [];
  for (const r of (Array.isArray(S._textRefs) ? S._textRefs : [])) {
    if (r && (r.tgt === 'char' || r.tgt === 'user') && (r.rtype == null || REF_BOUND[r.rtype]) && cast[r.tgt] === false) {
      const nmT = names ? names[r.tgt] : '';
      if (!(nmT && refNamedIn(tText, nmT))) {
        S._refLost.push('реф «' + String(r.note || '').slice(0, 40) + '» — ' + (r.tgt === 'user' ? 'юзера' : 'персонажа') + ' нет в кадре');
        continue;
      }
    }
    tKeep.push(r);
  }
  S._textRefs = tKeep;
  const out = refGate(refs, cast, prompt);
  if (!out || !out.length) return out;
  const keep = [];
  for (const r of out) {
    if (r && r.rtype === 'npc') {
      const nm = refNpcName(r);
      if (nm && !_nameInPrompt(prompt, nm) && !_nameInPrompt(String(S._castPost || ''), nm)) {
        S._refLost.push('NPC ' + nm + ' — ни в промпте, ни в посте его нет');
        continue;
      }
    } else if (r && r.tgt && REF_BOUND[r.rtype]) {
      const who = r.tgt === 'user' ? 'user' : 'char';
      const nm = who === 'user' ? (names && names.user) : (names && names.char);
      if (!cast[who] && !(nm && refNamedIn(String(prompt || '') + '\n' + String(S._castPost || ''), nm))) {
        S._refLost.push('реф «' + String(r.note || r.rtype).slice(0, 24) + '» — ' + (who === 'user' ? 'юзера' : 'персонажа') + ' нет в кадре');
        continue;
      }
    }
    keep.push(r);
  }
  return keep;
}

function sideAny(cfg) {
  return !!(cfg && (cfg.sideWear || cfg.sideCast || cfg.sidePlace));
}

const SIDE_PLACES_MAX = 24;

async function sidePlaces() {
  let items = [];
  try {
    items = (await tavo.get('iig_world', 'global')) || [];
  } catch (e) {
    return [];
  }
  let nm = {};
  try {
    nm = await castNames();
  } catch (e) {}
  const out = [];
  for (const it of (Array.isArray(items) ? items : [])) {
    if (!it || !String(it.name || '').trim()) continue;
    if ((it.owner === 'char' || it.owner === 'user') && !wardOwnerOk(it, nm)) continue;
    out.push(it);
    if (out.length >= SIDE_PLACES_MAX) break;
  }
  return out;
}

async function sidePlaceApply(line) {
  const name = String(line || '').trim();
  if (!name || /^none\.?$/i.test(name)) return null;
  const places = await sidePlaces();
  const hit = places.find(function (p) {
    return wardNameKey(p.name) === wardNameKey(name);
  });
  if (!hit) return null;
  let on = null;
  try {
    on = await tavo.get('iig_world_on', 'global');
  } catch (e) {
    return null;
  }
  if (!on || typeof on !== 'object') on = {};
  const id = String(hit.id);
  if (on[id] && Object.keys(on).filter(function (k) {
    return on[k];
  }).length === 1) return null;
  const next = {};
  next[id] = 1;
  try {
    await tavo.set('iig_world_on', next, 'global');
    await tavo.set('iig_refs_rev', Date.now(), 'global');
  } catch (e) {
    return null;
  }
  S._worldKV = null;
  S._refsCache = null;
  try {
    window.dispatchEvent(new CustomEvent('iig-place', { detail: { on: next, name: String(hit.name) } }));
  } catch (e) {}
  actNote('доски: место действия теперь «' + hit.name + '» — звёздочка локации переставлена по посту');
  toast('IIG: место действия теперь «' + hit.name + '»');
  return { id: id, name: String(hit.name) };
}

async function sideWardrobe() {
  let rev = 0;
  try {
    rev = (await tavo.get('iig_refs_rev', 'global')) || 0;
  } catch (e) {}
  let items = [];
  try {
    items = await wardItems(rev);
  } catch (e) {}
  let nm = {};
  try {
    nm = await castNames();
  } catch (e) {}
  const out = [];
  for (const it of (Array.isArray(items) ? items : [])) {
    if (!it || it.owner === 'npc' || !String(it.name || '').trim()) continue;
    if (!wardNameKey(it.ownerName) || !wardOwnerOk(it, nm)) continue;
    out.push(it);
    if (out.length >= 24) break;
  }
  return out;
}

async function sideGuide(cfg) {
  const nm = await castNames();
  const cN = nm.char || 'the character';
  const uN = nm.user || 'the user';
  const lines = [];
  if (cfg.sideWear) {
    const items = await sideWardrobe();
    if (items.length) {
      const by = {};
      for (const it of items) (by[it.ownerName] = by[it.ownerName] || []).push(String(it.name).trim());
      const list = Object.keys(by).map(function (k) {
        return k + ': ' + by[k].join(' | ');
      }).join(' ; ');
      lines.push('WEAR: which items from the WARDROBE LIST the listed people are clearly wearing or have just put on in this post, as Owner=item; Owner=item - copy owner and item names exactly from the list. Write WEAR: none when the post does not show or mention their clothing, hair or makeup. Name only items that THIS post itself names or clearly describes; never take clothing from the context above. WARDROBE LIST: ' + list);
    }
  }
  if (cfg.sidePlace) {
    const places = await sidePlaces();
    if (places.length) {
      lines.push('PLACE: which location from the LOCATION LIST the scene of this post happens in, exactly one name copied from the list (the name before the parentheses, never the description), or none when the post does not place the scene in any of them. LOCATION LIST: ' + places.map(function (p) {
        const d = String(p.tag || '').trim().replace(/\s+/g, ' ').slice(0, 160);
        return String(p.name).trim() + (d ? (' (' + d + ')') : '');
      }).join(' | '));
    }
  }
  if (cfg.sideCast) {
    let known = '';
    try {
      known = ((await castGet()) || []).filter(function (x) {
        return x.on !== false;
      }).slice(0, 30).map(function (x) {
        const d = String(x.desc || '').replace(/\s+/g, ' ').trim().slice(0, 80);
        return String(x.name).trim() + (d ? (' (' + d + ')') : '');
      }).join(' | ');
    } catch (e) {}
    lines.push('NPC: named side characters visibly present in this post, never ' + cN + ' and never ' + uN + ', at most 3, as Name=short English appearance (age, build, hair, face, clothes); Name=... Write NPC: none when there are none' +
      (known ? (' KNOWN NPCS (when a side character is one of these, copy the name EXACTLY as listed and never rename or re-describe them; invent a new name only for a genuinely new person): ' + known) : ''));
  }
  if (!lines.length) return '';
  return '\n\nSERVICE LINES (mandatory): after the prompt paragraph and before the final CAST line output these lines, each on its own line, starting exactly with the capital keyword and a colon, nothing else on those lines:\n' + lines.join('\n');
}

function sideSplit(raw, box) {
  const keep = [];
  const chars = [];
  for (const ln of String(raw || '').split('\n')) {
    const mc = ln.match(/^[ \t>*-]{0,4}(CHAR[ \t]{0,2}:.*)$/);
    if (mc) {
      chars.push(mc[1].trim());
      continue;
    }
    const m = ln.match(/^[ \t>*-]{0,4}(WEAR|PLACE|NPC)[ \t]{0,2}:(.*)$/);
    if (m) {
      box[m[1].toLowerCase()] = m[2].trim();
      continue;
    }
    keep.push(ln);
  }
  if (chars.length || !Array.isArray(box.chars)) box.chars = chars;
  return keep.join('\n');
}

const pwGenerate0 = pwGenerate;
pwGenerate = async function (ask, cfg) {
  let raw = '';
  S._pwWaitMs = pwWaitMs(cfg);
  try {
    raw = await pwGenerate0(ask, cfg);
  } catch (e) {
    const m = String((e && e.message) || '').toLowerCase();
    if (cfg && cfg.pwChat === false && !(e && e.status) && (m.indexOf('failed to fetch') >= 0 || m.indexOf('load failed') >= 0) && (cfg._iigSlim || 0) < 2) e.status = 400;
    throw e;
  } finally {
    S._pwWaitMs = 0;
  }
  if (typeof raw !== 'string') return raw;
  if (cfg && cfg._sideBox) raw = sideSplit(raw, cfg._sideBox);
  return pwUnwrap(raw);
};

const SIDE_HEAD = '\n\nSERVICE LINES (mandatory): after the prompt paragraph and before the final CAST line output these lines, each on its own line, starting exactly with the capital keyword and a colon, nothing else on those lines:\n';
const pwGuide0 = pwGuide;
pwGuide = async function (cfg) {
  let g = await pwGuide0(cfg);
  const bits = frameBits(cfg);
  if (bits.length) g += '\n\nCAMERA OVERRIDE (mandatory for this image, overrides any framing, angle or time-of-day rule above): ' + bits.join('; ') + '.';
  if (cfg && cfg._sideBox) {
    let sg = '';
    try {
      sg = await sideGuide(cfg);
    } catch (e) {}
    const ncg = naiCharGuide(cfg);
    if (ncg) sg = sg ? (sg + '\n' + ncg) : (SIDE_HEAD + ncg);
    g += sg;
  }
  return g;
};

const toast0 = toast;
toast = function (t) {
  if (/^IIG: модель промпта (вернула обрывок|не дописала ответ)/.test(String(t))) {
    S._pwFellBack = Date.now();
    if (S._pwFbHold) {
      S._pwFbToast = String(t);
      return;
    }
  }
  return toast0(t);
};

const toastSec0 = toast;
toast = function (t) {
  return toastSec0(secMask(t));
};

const enforceStyleTailsNai0 = enforceStyleTails;
enforceStyleTails = function (t, st) {
  const cfg = S._naiStyleCfg;
  if (cfg && naiReal(cfg)) {
    try {
      return naiEnforce(t, st, cfg);
    } catch (e) {
      return String(t || '');
    }
  }
  return enforceStyleTailsNai0(t, st);
};

const composeAuto0 = composeAuto;
composeAuto = async function (postText, cfg) {
  if (cfg && cfg._inCompose) return composeAuto0(postText, cfg);
  enSync(cfg);
  const ncOn = naiCharsOn(cfg);
  const sideOn = !S._stCast && sideAny(cfg);
  const side = (ncOn || sideOn) ? {} : null;
  const cfgC = Object.assign({}, cfg, { _inCompose: 1 });
  if (S._stCast) {
    cfgC.sideWear = false;
    cfgC.sidePlace = false;
    cfgC.sideCast = false;
  }
  if (side) {
    cfgC._sideBox = side;
  }
  S._pwFellBack = 0;
  S._pwFbHold = 1;
  S._pwFbToast = '';
  let c = null;
  const styleCfg0 = S._naiStyleCfg;
  S._naiStyleCfg = naiReal(cfg) ? cfg : null;
  try {
    c = await composeAuto0(postText, cfgC);
  } finally {
    S._pwFbHold = 0;
    S._naiStyleCfg = styleCfg0 || null;
  }
  const fbToast = S._pwFbToast;
  S._pwFbToast = '';
  if (c && side) c.side = side;
  if (c && c.prompt && S._pwFellBack && naiReal(cfg)) {
    S._pwFellBack = 0;
    const why = c.cut ? ('размышления съели лимит токенов (пробовали ' + (Number(c.cut.tokens) || 0) + ')') : ('ответ ' + (c.wc || 0) + ' слов');
    const t = 'промпт-модель не написала промпт (' + why + ') — для NovelAI нужен теговый промпт; проверь модель промпта на вкладке api';
    elog('промпт', t);
    const eF = new Error(t);
    eF.code = 'PW_NAI_FALLBACK';
    eF.iigRu = 1;
    throw eF;
  }
  if (c && c.prompt && S._pwFellBack) {
    S._pwFellBack = 0;
    if (fbToast) toast0(fbToast);
    elog('промпт', 'запасной промпт из текста поста · источник: ' + String(S._pwSrc || '?') + ' · причина: ' + (c.cut ? 'размышления съели лимит токенов' : ('ответ модели ' + (c.wc || 0) + ' слов')));
    c.fallback = true;
    c.prompt = 'Draw this scene as a picture, with no written text, letters or captions anywhere in the image: ' + c.prompt;
  }
  S._pwFellBack = 0;
  const bits = frameBits(cfg);
  if (!bits.length || !c || !c.prompt) return c;
  const full = String(c.prompt);
  const m = full.match(/((?:[ \t]*\[(?:CAST|AR):[^\]]*\][ \t]*)+)$/i);
  const body = (m ? full.slice(0, m.index) : full).trim().replace(/[.,;\s]+$/, '');
  c.prompt = body + (naiMode(cfg) ? (', ' + bits.join(', ')) : ('. Camera: ' + bits.join('; ') + '.')) + (m ? m[1] : '');
  return c;
};

function naisteraNegOk(m) {
  const c = naisteraCanon(m);
  return c === 'novelai-v4.5' || c === 'novelai-v5';
}

const applyLocks0 = applyLocks;
applyLocks = function (txt, cfg) {
  if (!naiMode(cfg)) return applyLocks0(txt, cfg);
  const pm = parseMarkers(String(txt || ''));
  let t = pm.prompt;
  const lk = (cfg.styleLock || '').trim();
  if (lk && t.indexOf(lk) < 0) t = t.replace(/[\s,;]+$/, '') + ', ' + lk;
  return t + castMarker(pm.cast) + arMarker(pm.ar);
};

function refNoteName(r) {
  const s = String((r && r.note) || '').replace(/\s+/g, ' ').trim();
  if (!s) return '';
  if (r.rtype === 'npc') {
    const k = s.indexOf(':');
    if (k > 0) return s.slice(0, k).trim();
  }
  return s.slice(0, 24).trim();
}

refsNote = function (refs) {
  refs = Array.isArray(refs) ? refs : [];
  const tr = Array.isArray(S._textRefs) ? S._textRefs : [];
  const ps = S._pass || {};
  const nm = S._names || {};
  const pass = [];
  const cN = String(nm.char || '').trim();
  const uN = String(nm.user || '').trim();
  if (String(ps.char || '').trim()) pass.push('персонаж' + (cN ? ' ' + cN : ''));
  if (String(ps.user || '').trim()) pass.push('юзер' + (uN ? ' ' + uN : ''));
  const tx = tr.filter(function (t) {
    return !(t && (t.who === 'char' || t.who === 'user'));
  });
  if (!refs.length && !tx.length && !pass.length) return 'референсы: не приложены';
  let ch = 0;
  let us = 0;
  let phN = 0;
  const ph = [];
  for (const r of refs) {
    if (r && r.who === 'char') ch++;
    else if (r && r.who === 'user') us++;
    else {
      phN++;
      const n = refNoteName(r);
      if (n) ph.push(n);
    }
  }
  const tn = [];
  for (const t of tx) {
    const n = refNoteName(t);
    if (n) tn.push(n);
  }
  const parts = [];
  if (ch) parts.push('аватар персонажа');
  if (us) parts.push('аватар юзера');
  if (phN) parts.push('фото: ' + phN + (ph.length ? ' (' + ph.join(', ') + ')' : ''));
  if (tx.length) parts.push('текстовых: ' + tx.length + (tn.length ? ' (' + tn.join(', ') + ')' : ''));
  parts.push('паспорта: ' + (pass.length ? pass.join(', ') : 'нет'));
  return 'референсы: ' + parts.join(', ');
};

function sidePairs(s) {
  const out = [];
  s = String(s || '').trim();
  if (!s || /^none\.?$/i.test(s)) return out;
  for (const part of s.split(';')) {
    const k = part.indexOf('=');
    if (k <= 0) continue;
    const a = part.slice(0, k).trim();
    const b = part.slice(k + 1).trim();
    if (a && b) out.push([a, b]);
  }
  return out;
}

async function wardUnworn() {
  try {
    const u = await tavo.get('iig_ward_unworn', 'global');
    return (u && typeof u === 'object' && !Array.isArray(u)) ? u : {};
  } catch (e) {
    return {};
  }
}

function sideWearStrictOn(cfg) {
  return !(cfg && (cfg.sideWearStrict === false || cfg.sideWearStrict === 'false'));
}

async function sideWear(line, cfg) {
  const raw = String(line == null ? '' : line).trim().slice(0, 400);
  const none = { on: [], off: [], raw: raw, reason: 'none', names: [], owner: '', changed: false, sig: '|' };
  const pairs = sidePairs(line);
  if (!pairs.length) return none;
  if (!cfg) {
    try {
      cfg = await resolveCfg();
    } catch (e) {
      cfg = null;
    }
  }
  const strict = sideWearStrictOn(cfg);
  const items = await sideWardrobe();
  let rev = 0;
  try {
    rev = (await tavo.get('iig_refs_rev', 'global')) || 0;
  } catch (e) {}
  const worn = await wardWorn(rev);
  const unworn = await wardUnworn();
  const postK = wardNameKey(S._castPost || '');
  const inPost = function (it) {
    const nk = wardNameKey(it.name);
    return !!nk && postK.indexOf(nk) >= 0;
  };
  const held = [];
  const skipped = [];
  const on = [];
  const names = [];
  let owner = '';
  let allPost = true;
  for (const p of pairs) {
    for (const it of items) {
      if (wardNameKey(it.ownerName) !== wardNameKey(p[0]) || wardNameKey(it.name) !== wardNameKey(p[1])) continue;
      const named = inPost(it);
      if (unworn[String(it.id)] && !named) {
        const hn = String(it.name || '').trim();
        if (held.indexOf(hn) < 0) held.push(hn);
        continue;
      }
      if (strict && !named) {
        const sn = String(it.name || '').trim();
        if (skipped.indexOf(sn) < 0) skipped.push(sn);
        continue;
      }
      if (!named) allPost = false;
      if (on.indexOf(String(it.id)) < 0) {
        on.push(String(it.id));
        names.push(String(it.name).trim());
        owner = owner || String(it.ownerName);
      }
    }
  }
  if (held.length) {
    try {
      actNote('доски: «' + held.join('», «') + '» снята вручную — не возвращаю, пока пост её не назовёт');
    } catch (e) {}
  }
  if (!on.length) return Object.assign({}, none, { skipped: skipped });
  const off = [];
  for (const it of items) {
    const id = String(it.id);
    if (!worn[id] || on.indexOf(id) >= 0 || unworn[id]) continue;
    const rival = items.some(function (x) {
      return on.indexOf(String(x.id)) >= 0 && x.cat === it.cat && wardNameKey(x.ownerName) === wardNameKey(it.ownerName);
    });
    if (rival) off.push(id);
  }
  const fresh = on.filter(function (id) {
    return !worn[id];
  });
  return { on: on, off: off, raw: raw, reason: allPost ? 'post' : 'context', names: names, owner: owner, changed: !!(fresh.length || off.length), skipped: skipped, sig: on.slice().sort().join(',') + '|' + off.slice().sort().join(',') };
}

function popHost() {
  let h = document.getElementById('iig-pop-host');
  if (!h) {
    h = document.createElement('div');
    h.id = 'iig-pop-host';
    h.style.cssText = 'position:fixed;left:10px;right:10px;top:calc(var(--tavo-inset-top-bar,0px) + 10px);z-index:2147483600;display:flex;flex-direction:column;align-items:center;gap:8px;pointer-events:none;';
    (document.body || document.documentElement).appendChild(h);
  }
  return h;
}

function popCard(o) {
  try {
    if (typeof document === 'undefined' || !document.createElement) return null;
    const F = 'Courier Prime,monospace';
    const card = document.createElement('div');
    card.className = 'iig-pop';
    card.style.cssText = 'pointer-events:auto;width:100%;max-width:420px;box-sizing:border-box;padding:18px 16px 14px;border-radius:16px;background:#1f2227;border:1px solid rgba(154,163,173,.3);box-shadow:none;color:#e6e8ec;font:12px/1.5 ' + F + ';';
    const head = document.createElement('div');
    head.style.cssText = 'display:flex;align-items:center;gap:10px;margin:0 0 8px;';
    if (o.avatar) {
      const av = document.createElement('img');
      av.alt = '';
      av.src = o.avatar;
      av.style.cssText = 'width:34px;height:34px;border-radius:50%;object-fit:cover;flex:0 0 auto;';
      head.appendChild(av);
    }
    const ttl = document.createElement('div');
    ttl.style.cssText = 'flex:1 1 auto;min-width:0;font:700 12px/1.3 ' + F + ';letter-spacing:.06em;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;';
    ttl.textContent = o.title || '';
    head.appendChild(ttl);
    const x = document.createElement('button');
    x.type = 'button';
    x.textContent = '×';
    x.title = 'закрыть';
    x.style.cssText = 'flex:0 0 auto;width:30px;height:30px;border-radius:50%;border:1px solid rgba(154,163,173,.35);background:transparent;color:#9aa3ad;font:16px/1 ' + F + ';cursor:pointer;';
    const close = function () {
      try {
        card.remove();
      } catch (e) {}
    };
    x.onclick = close;
    head.appendChild(x);
    card.appendChild(head);
    if (o.img) {
      const im = document.createElement('img');
      im.alt = '';
      im.src = o.img;
      im.style.cssText = 'display:block;width:100%;max-height:46vh;object-fit:contain;border-radius:12px;background:#15171a;cursor:pointer;';
      im.onclick = function () {
        try {
          tavo.utils.preview(o.img);
        } catch (e) {}
      };
      card.appendChild(im);
    }
    if (o.text) {
      const tx = document.createElement('div');
      tx.style.cssText = 'margin:8px 2px 0;white-space:pre-wrap;word-break:break-word;';
      tx.textContent = o.text;
      card.appendChild(tx);
    }
    if (o.note) {
      const nt = document.createElement('div');
      nt.style.cssText = 'margin:6px 2px 0;font-size:9px;letter-spacing:.08em;color:#9aa3ad;';
      nt.textContent = o.note;
      card.appendChild(nt);
    }
    if (o.actions && o.actions.length) {
      const row = document.createElement('div');
      row.style.cssText = 'display:flex;gap:8px;margin-top:10px;';
      for (const a of o.actions) {
        const b = document.createElement('button');
        b.type = 'button';
        b.textContent = a[0];
        b.style.cssText = 'flex:1;padding:11px 8px;border-radius:10px;border:1px solid rgba(154,163,173,.4);background:transparent;color:#9aa3ad;font:700 9px/1 ' + F + ';letter-spacing:.14em;text-transform:uppercase;cursor:pointer;';
        b.onclick = function () {
          close();
          try {
            a[1]();
          } catch (e) {}
        };
        row.appendChild(b);
      }
      card.appendChild(row);
    }
    popHost().appendChild(card);
    return card;
  } catch (e) {
    return null;
  }
}

function wardBookEntry(it) {
  const who = String(it.ownerName || '').trim() || (it.owner === 'user' ? 'юзер' : (it.owner === 'char' ? 'персонаж' : 'NPC'));
  const cats = { outfit: 'одежда', hair: 'причёска', makeup: 'макияж' };
  const label = String(it.name || '').trim() || cats[it.cat] || cats.outfit;
  return {
    identifier: 'iig-ward-' + it.id,
    name: 'Шкаф · ' + who + ' · ' + label,
    content: String(it.lore || '').trim() || (who + ' сейчас: ' + (String(it.name || it.tag || '').trim() || label)),
    enabled: true,
    strategy: 'constant',
    keywords: [],
    secondaryKeywords: [],
    secondaryKeywordStrategy: 'none',
    scanDepth: 4,
    caseSensitive: false,
    matchWholeWord: false,
    injectionPosition: 'atDepth',
    injectionDepth: 2,
    injectionRole: 'system',
    probability: 100,
    sticky: 0,
    cooldown: 0,
    delay: 0
  };
}

async function wardBookSync(items, on, off) {
  let ref = null;
  try {
    ref = await tavo.get('iig_ward_lb', 'global');
  } catch (e) {
    return 'skip';
  }
  if (!ref || ref.id == null || !tavo.lorebook || typeof tavo.lorebook.get !== 'function' || typeof tavo.lorebook.update !== 'function') return 'skip';
  const lb = await tavo.lorebook.get(ref.id);
  if (!lb) return 'skip';
  const entries = Array.isArray(lb.entries) ? lb.entries.slice() : [];
  const at = {};
  for (let i = 0; i < entries.length; i++) if (entries[i] && entries[i].identifier) at[String(entries[i].identifier)] = i;
  let changed = false;
  for (const id of off) {
    const k = at['iig-ward-' + id];
    if (k == null || entries[k].enabled === false) continue;
    entries[k] = Object.assign({}, entries[k], { enabled: false });
    changed = true;
  }
  for (const id of on) {
    const k = at['iig-ward-' + id];
    if (k != null) {
      if (entries[k].enabled === true) continue;
      entries[k] = Object.assign({}, entries[k], { enabled: true });
      changed = true;
      continue;
    }
    const it = items.find(function (x) {
      return String(x.id) === String(id);
    });
    if (!it) continue;
    entries.push(wardBookEntry(it));
    changed = true;
  }
  if (!changed) return 'same';
  lb.entries = entries;
  await tavo.lorebook.update(lb);
  return 'done';
}

async function sideWearApply(line, cfg) {
  const hint = await sideWear(line, cfg);
  if (!hint) return null;
  hint.applied = false;
  if (!hint.on.length || !hint.changed) return hint;
  let worn = null;
  try {
    worn = await tavo.get('iig_ward_worn', 'global');
  } catch (e) {
    return null;
  }
  const next = Object.assign({}, (worn && typeof worn === 'object') ? worn : {});
  for (const id of hint.on) next[id] = 1;
  for (const id of hint.off) delete next[id];
  try {
    await tavo.set('iig_ward_worn', next, 'global');
    await tavo.set('iig_refs_rev', Date.now(), 'global');
  } catch (e) {
    return null;
  }
  S._wardWornKV = null;
  S._refsCache = null;
  try {
    const un = await wardUnworn();
    let ch = false;
    for (const id of hint.on) {
      if (Object.prototype.hasOwnProperty.call(un, id)) {
        delete un[id];
        ch = true;
      }
    }
    if (ch) await tavo.set('iig_ward_unworn', un, 'global');
  } catch (e) {}
  try {
    window.dispatchEvent(new CustomEvent('iig-worn', { detail: { worn: next } }));
  } catch (e) {}
  actNote('доски: ' + hint.owner + ' теперь в «' + hint.names.join('», «') + '» — звёздочки переставлены ' + (hint.reason === 'post' ? 'по посту' : 'по контексту'));
  toast('IIG: ' + hint.owner + ' теперь в «' + hint.names.join('», «') + '» — звёздочки переставлены');
  hint.applied = true;
  return hint;
}

function sideWearBook(hint) {
  S._sideQ = (S._sideQ || Promise.resolve()).then(async function () {
    const items = await sideWardrobe();
    try {
      await wardBookSync(items, hint.on, hint.off);
    } catch (e) {
      toast('IIG: записи лорбука картинок не переключились — открой «доски» и тапни звёздочку у вещи');
    }
  }).catch(function () {});
}

async function castGet() {
  let v = null;
  try {
    v = await tavo.get('iig_cast', 'chat');
  } catch (e) {
    return null;
  }
  return Array.isArray(v) ? v.filter(function (x) {
    return x && x.name;
  }) : [];
}

async function sideCastNote(line, id) {
  const pairs = sidePairs(line);
  if (!pairs.length) return;
  const list = await castGet();
  if (!list) return;
  let nm = {};
  try {
    nm = await castNames();
  } catch (e) {}
  const fresh = [];
  for (const p of pairs.slice(0, 3)) {
    if (!castNameKey(p[0]) || castSame(p[0], nm.char) || castSame(p[0], nm.user)) continue;
    const hit = castFind(list, p[0]);
    if (hit) {
      hit.seen = (hit.seen || 0) + 1;
      continue;
    }
    if (list.length >= 30) continue;
    const rec = { name: p[0].slice(0, 60), desc: p[1].slice(0, 400), on: true, img: '', seen: 1, at: Date.now(), src: 'post' };
    if (id != null) rec.post = id;
    list.push(rec);
    fresh.push(rec.name);
  }
  try {
    await tavo.set('iig_cast', list, 'chat');
  } catch (e) {}
  if (!fresh.length) return;
  actNote('паспорта NPC: запомнен ' + fresh.join(', '));
  toast('IIG: запомнен NPC: ' + fresh.join(', '));
  try {
    window.dispatchEvent(new CustomEvent('iig-cast'));
  } catch (e) {}
}

async function castRefs() {
  const text = String(S._castPost || '').toLowerCase();
  if (!text) return [];
  const list = await castGet();
  if (!list || !list.length) return [];
  let nmC = null;
  try {
    nmC = await castNames();
  } catch (e) {}
  const out = [];
  for (const x of list) {
    const desc = String(x.desc || '').trim();
    if (x.on === false || (!desc && !x.img)) continue;
    if (nmC && ((nmC.char && castSame(x.name, nmC.char)) || (nmC.user && castSame(x.name, nmC.user)))) continue;
    if (text.indexOf(String(x.name).toLowerCase()) < 0) continue;
    let du = '';
    if (x.img) {
      try {
        du = await wardImg(x.img);
      } catch (e) {}
    }
    if (!du && !desc) continue;
    const note = x.name + (desc ? (': ' + desc) : ' - a separate person, keep this face only for ' + x.name);
    out.push({ kind: du ? '' : 'text', dataUrl: du || '', type: 'npc', note: note, target: 'char', enabled: true, ward: 1, pass: 1 });
    if (out.length >= 4) break;
  }
  return out;
}

async function castPortraitDone(c, rec) {
  const list = await castGet();
  if (!list) return;
  const hit = castFind(list, c.cast);
  if (!hit) return;
  const old = String(hit.img || '').split('/').pop();
  let kept = '';
  try {
    const du = await tavo.file.load('iig_st_' + rec.id + '.png', { encoding: 'dataUrl', scope: 'global' });
    if (du) kept = String((await tavo.file.save('iig_cast_' + Date.now().toString(36) + '.png', du, { scope: 'global' })) || '');
  } catch (e) {}
  hit.img = kept || rec.path;
  if (kept && old.indexOf('iig_cast_') === 0) {
    try {
      await tavo.file.delete(old, { scope: 'global' });
    } catch (e) {}
  }
  try {
    await tavo.set('iig_cast', list, 'chat');
    await tavo.set('iig_refs_rev', Date.now(), 'global');
  } catch (e) {}
  madeEmit({ kind: 'npc', name: hit.name, path: hit.img });
}

const NPC_SCAN_MAX = 12;
const NPC_SCAN_CHARS = 4;
const NPC_SCAN_TOTAL = 16000;
const NPC_SCAN_FIELD = 5000;
const NPC_SCAN_ENTRY = 1500;
const NPC_SCAN_BOOK = 8000;

function npcScanClip(s, n) {
  s = String(s || '').replace(/\s+/g, ' ').trim();
  return s.length > n ? s.slice(0, n) : s;
}

function npcScanEntries(entries) {
  const out = [];
  let total = 0;
  for (const e of (Array.isArray(entries) ? entries : [])) {
    if (!e || e.enabled === false) continue;
    if (/^iig-/.test(String(e.identifier || ''))) continue;
    const t = npcScanClip(e.content, NPC_SCAN_ENTRY);
    if (!t) continue;
    out.push(t);
    total += t.length;
    if (total > NPC_SCAN_BOOK) break;
  }
  return out.join('\n');
}

async function npcScanMaterials() {
  const parts = [];
  const src = [];
  S._scanSrc = src;
  let chat = null;
  try {
    chat = await tavo.chat.current();
  } catch (e) {}
  const chars = (chat && Array.isArray(chat.characters)) ? chat.characters : [];
  for (const c0 of chars.slice(0, NPC_SCAN_CHARS)) {
    if (!c0 || c0.id == null) continue;
    let c = null;
    try {
      c = await tavo.character.get(c0.id);
    } catch (e) {}
    const d = (c && c.data) || c || {};
    const nm = String((c && c.name) || c0.name || '').trim();
    const txt = [d.description, d.personality, d.scenario, d.first_mes].map(function (x) {
      return npcScanClip(x, NPC_SCAN_FIELD);
    }).filter(Boolean).join('\n');
    if (txt) parts.push('CHARACTER CARD (' + nm + '):\n' + txt);
    src.push('карточка ' + nm + (txt ? '' : ' (пусто)'));
    const bt = npcScanEntries(d.character_book && d.character_book.entries);
    if (bt) parts.push('CHARACTER LOREBOOK (' + nm + '):\n' + bt);
  }
  if (chat && chat.persona && chat.persona.id != null) {
    let p = null;
    try {
      p = await tavo.persona.get(chat.persona.id);
    } catch (e) {}
    const pd = npcScanClip((p && (p.description || (p.data && p.data.description))) || '', NPC_SCAN_FIELD);
    if (pd) parts.push('USER PERSONA (' + String((p && p.name) || '') + '):\n' + pd);
    src.push('персона ' + String((p && p.name) || '') + (pd ? '' : ' (пусто)'));
  }
  const ids = chat ? (Array.isArray(chat.lorebookIds) ? chat.lorebookIds : (chat.lorebooks || []).map(function (x) {
    return x && x.id;
  })) : [];
  for (const id of ids.slice(0, 6)) {
    if (id == null) continue;
    let lb = null;
    try {
      lb = await tavo.lorebook.get(id);
    } catch (e) {}
    if (!lb) {
      src.push('лорбук #' + id + ' (не прочитался)');
      continue;
    }
    if (lb.name === 'Лорбук картинок' || lb.name === 'Шкаф · Картинки') continue;
    const t = npcScanEntries(lb.entries);
    if (t) parts.push('LOREBOOK (' + String(lb.name || '') + '):\n' + t);
    src.push('лорбук ' + String(lb.name || '') + (t ? (' (' + (Array.isArray(lb.entries) ? lb.entries.length : 0) + ')') : ' (пусто)'));
  }
  return parts.join('\n\n').slice(0, NPC_SCAN_TOTAL);
}

function npcScanAsk(nm, text) {
  const cN = nm.char || 'the main character';
  const uN = nm.user || 'the user';
  return 'You read roleplay materials and extract the supporting cast. List the named side characters (NPCs) that appear in the materials below, other than ' + cN + ' (the main character) and ' + uN + ' (the user). Skip unnamed groups and generic roles. At most ' + NPC_SCAN_MAX + '. For each one write one line exactly as Name=appearance, where appearance is a short English visual description (age, build, hair, face, clothes) of 8 to 30 words; when the materials give no appearance, invent one that fits the role and the setting. Output only these lines, one per line, no numbering, no headings, no commentary. If there are no such characters, output exactly: none\n\nMATERIALS:\n' + text;
}

function npcScanParse(raw, skip, maxLen) {
  const out = [];
  const seen = {};
  const lim = maxLen || 400;
  const lineRe = new RegExp('^([^=:]{1,60}?)\\s*[=:]\\s*(.{3,' + lim + '})$');
  const t = String(raw || '').replace(/<think(?:ing)?>[\s\S]*?<\/think(?:ing)?>/gi, '');
  for (const ln0 of t.split('\n')) {
    const ln = ln0.replace(/^[ \t>*#\-\d.)]+/, '').trim();
    const m = ln.match(lineRe);
    if (!m) continue;
    const name = m[1].replace(/^["'«]+|["'»]+$/g, '').trim();
    const key = wardNameKey(name);
    if (!key || seen[key] || skip[key]) continue;
    if (/^(none|npc|npcs|name|characters?|cast)$/i.test(name)) continue;
    seen[key] = 1;
    out.push([name.slice(0, 60), m[2].trim().slice(0, lim)]);
    if (out.length >= NPC_SCAN_MAX) break;
  }
  return out;
}

async function castScan(c) {
  const sid = String((c && c.sid) || '').replace(/[^0-9a-z]/gi, '').slice(0, 20) || ('sc' + Date.now().toString(36));
  const put = async function (st) {
    try {
      await tavo.set('iig_cast_scan', Object.assign({ sid: sid, at: Date.now() }, st), 'chat');
    } catch (e) {}
  };
  await put({ state: 'run' });
  actStart('поиск NPC в карточке');
  try {
    const cfg = await resolveCfg();
    const nm = await castNames();
    const list = await castGet();
    if (!list) throw new Error('паспорта NPC этого чата не прочитались');
    const text = await npcScanMaterials();
    if (!text) throw new Error('в карточке персонажа, персоне и лорбуках нет текста');
    const raw = await pwGenerate0(npcScanAsk(nm, text), cfg);
    const skip = {};
    skip[wardNameKey(nm.char)] = 1;
    skip[wardNameKey(nm.user)] = 1;
    for (const x of list) skip[wardNameKey(x.name)] = 1;
    const found = npcScanParse(typeof raw === 'string' ? raw : String((raw && (raw.text || raw.content)) || ''), skip);
    const names = [];
    for (const f of found) {
      if (list.length >= 30) break;
      list.push({ name: f[0], desc: f[1], on: true, img: '', seen: 0, at: Date.now(), src: 'scan' });
      names.push(f[0]);
    }
    if (names.length) {
      await tavo.set('iig_cast', list, 'chat');
      try {
        await tavo.set('iig_refs_rev', Date.now(), 'global');
      } catch (e) {}
    }
    await put({ state: 'ok', names: names });
    actEnd(names.length ? ('найдено NPC: ' + names.join(', ')) : 'новых NPC в карточке не нашлось');
  } catch (e) {
    const t = String((e && e.message) || e).slice(0, 160);
    await put({ state: 'error', error: t });
    elog('поиск NPC', t);
    actEnd('поиск NPC не вышел: ' + t.slice(0, 90));
  }
}

const PLACE_SCAN_MAX = 12;
const PLACE_SCAN_DESC = 1200;

function placeScanAsk(have, text) {
  return 'You read roleplay materials and extract the LOCATIONS of the world: named places where scenes happen - rooms, buildings, streets, landscapes, towns, vehicles. List every location that is named or clearly described in the materials below.' + (have.length ? (' Skip these, they are already known: ' + have.join(', ') + '.') : '') + ' For each location write exactly one line in the form "Name = description". The name is the location name as the materials call it, in the original language, 1 to 5 words. The description is English prose of 40 to 90 words written for an image generator: what kind of place it is, architecture or landscape, key objects, materials and surfaces, light and time of day when known, colors and atmosphere. No people, no events, no character names, no opinions. Up to ' + PLACE_SCAN_MAX + ' lines and nothing else. If the materials name no locations, write NONE.\n\nMATERIALS:\n' + text;
}

async function placeScan(c) {
  const sid = String((c && c.sid) || '').replace(/[^0-9a-z]/gi, '').slice(0, 20) || ('pl' + Date.now().toString(36));
  const put = async function (st) {
    try {
      await tavo.set('iig_place_scan', Object.assign({ sid: sid, at: Date.now() }, st), 'chat');
    } catch (e) {}
  };
  await put({ state: 'run' });
  actStart('поиск локаций в лорбуке');
  try {
    const cfg = await resolveCfg();
    const have = (Array.isArray(c && c.have) ? c.have : []).map(function (x) {
      return String(x || '').trim().slice(0, 60);
    }).filter(Boolean).slice(0, 60);
    const text = await npcScanMaterials();
    if (!text) throw new Error('в карточке персонажа, персоне и лорбуках нет текста');
    const raw = await pwGenerate0(placeScanAsk(have, text), cfg);
    const skip = {};
    for (const h of have) skip[wardNameKey(h)] = 1;
    const found = npcScanParse(typeof raw === 'string' ? raw : String((raw && (raw.text || raw.content)) || ''), skip, PLACE_SCAN_DESC).filter(function (f) {
      return !/^(location|locations|place|places|setting|settings|none)$/i.test(f[0]);
    });
    const places = found.map(function (f) {
      return { name: f[0], desc: f[1] };
    });
    await put({ state: 'ok', places: places, src: (S._scanSrc || []).slice(0, 12), raw: places.length ? '' : secMask(String(typeof raw === 'string' ? raw : JSON.stringify(raw))).slice(0, 300) });
    actEnd(places.length ? ('найдено локаций: ' + places.map(function (p) {
      return p.name;
    }).join(', ')) : 'новых локаций в лорбуке не нашлось');
  } catch (e) {
    const t = String((e && e.message) || e).slice(0, 160);
    await put({ state: 'error', error: t });
    elog('поиск локаций', t);
    actEnd('поиск локаций не вышел: ' + t.slice(0, 90));
  }
}

const DIAG_CELL = 96;
const DIAG_SHEET_COLS = 6;
const DIAG_SHEET_CELL = 288;
const DIAG_TILE_COLS = 8;
const DIAG_TILES_MAX = 64;
const DIAG_LOAD_MS = 20000;

function diagCanvas(w, h) {
  const cv = document.createElement('canvas');
  cv.width = w;
  cv.height = h;
  return cv;
}

function diagLoad(src, ms) {
  return new Promise(function (res) {
    const t0 = Date.now();
    let over = false;
    const im = new Image();
    const done = function (ok, err) {
      if (over) return;
      over = true;
      res({ im: im, ok: ok, err: err || '', ms: Date.now() - t0 });
    };
    setTimeout(function () {
      done(false, 'timeout');
    }, ms);
    im.onload = function () {
      if (typeof im.decode === 'function') im.decode().then(function () {
        done(true);
      }, function (e) {
        done(true, 'decode: ' + String((e && e.message) || e).slice(0, 60));
      });
      else done(true);
    };
    im.onerror = function () {
      done(false, 'error');
    };
    im.src = src;
  });
}

function diagBlank(ctx, x, y, w, h) {
  try {
    const d = ctx.getImageData(x, y, w, h).data;
    let first = null;
    let same = true;
    for (let i = 0; i < d.length; i += 4 * 97) {
      const v = d[i] + '|' + d[i + 1] + '|' + d[i + 2] + '|' + d[i + 3];
      if (first === null) first = v;
      else if (v !== first) {
        same = false;
        break;
      }
    }
    return same;
  } catch (e) {
    return false;
  }
}

function diagRawDraw(src, sx, sy, sw, sh) {
  return new Promise(function (res) {
    let over = false;
    const done = function (v) {
      if (over) return;
      over = true;
      res(v);
    };
    setTimeout(function () {
      done('timeout');
    }, DIAG_LOAD_MS);
    const im = new Image();
    im.onload = function () {
      try {
        const cv = diagCanvas(DIAG_CELL, DIAG_CELL);
        const ctx = cv.getContext('2d');
        ctx.drawImage(im, sx, sy, sw || im.naturalWidth, sh || im.naturalHeight, 0, 0, DIAG_CELL, DIAG_CELL);
        done(diagBlank(ctx, 0, 0, DIAG_CELL, DIAG_CELL) ? 'blank' : 'ok');
      } catch (e) {
        done('draw: ' + String((e && e.message) || e).slice(0, 60));
      }
    };
    im.onerror = function () {
      done('error');
    };
    im.src = src;
  });
}

async function diagSave(name, cv) {
  try {
    await tavo.file.delete(name, { scope: 'global' });
  } catch (e) {}
  return String((await tavo.file.save(name, cv.toDataURL('image/jpeg', 0.7), { scope: 'global' })) || '');
}

async function diagSheet(out) {
  const base = new URL('/plugins/com.notfound404.tavo-images/previews/', location.href).href;
  const url = base + 'styles.jpg?v=' + Date.now();
  const r = await fetch(url);
  out.status = r.status;
  const bl = await r.blob();
  out.bytes = bl.size;
  const blobUrl = URL.createObjectURL(bl);
  out.rawDrawAtLoad = await diagRawDraw(blobUrl, 0, 0, DIAG_SHEET_CELL, DIAG_SHEET_CELL);
  const L = await diagLoad(blobUrl, DIAG_LOAD_MS);
  out.loaded = L.ok;
  out.loadErr = L.err;
  out.ms = L.ms;
  if (!L.ok) return;
  out.w = L.im.naturalWidth;
  out.h = L.im.naturalHeight;
  const rows = Math.max(1, Math.ceil(out.h / DIAG_SHEET_CELL));
  const cv = diagCanvas(DIAG_SHEET_COLS * DIAG_CELL, rows * DIAG_CELL);
  const ctx = cv.getContext('2d');
  const blank = [];
  for (let i = 0; i < DIAG_SHEET_COLS * rows; i++) {
    const cx = i % DIAG_SHEET_COLS;
    const cy = Math.floor(i / DIAG_SHEET_COLS);
    ctx.drawImage(L.im, cx * DIAG_SHEET_CELL, cy * DIAG_SHEET_CELL, DIAG_SHEET_CELL, DIAG_SHEET_CELL, cx * DIAG_CELL, cy * DIAG_CELL, DIAG_CELL, DIAG_CELL);
    if (diagBlank(ctx, cx * DIAG_CELL, cy * DIAG_CELL, DIAG_CELL, DIAG_CELL)) blank.push(i);
  }
  out.blankCells = blank;
  out.file = await diagSave('iig_diag_sgal.jpg', cv);
}

async function diagTiles(out) {
  const list = (await tavo.character.all()) || [];
  const items = list.slice(0, DIAG_TILES_MAX);
  const rows = Math.max(1, Math.ceil(items.length / DIAG_TILE_COLS));
  const cv = diagCanvas(DIAG_TILE_COLS * DIAG_CELL, rows * DIAG_CELL);
  const ctx = cv.getContext('2d');
  ctx.fillStyle = '#333';
  ctx.fillRect(0, 0, cv.width, cv.height);
  const res = [];
  for (let i = 0; i < items.length; i++) {
    const it = items[i] || {};
    const name = String(it.name || '').slice(0, 20);
    let av = it.avatar || (it.data && it.data.avatar) || '';
    if (!av && it.id != null) {
      try {
        const full = await tavo.character.get(it.id);
        av = (full && (full.avatar || (full.data && full.data.avatar))) || '';
      } catch (e) {}
    }
    const x = (i % DIAG_TILE_COLS) * DIAG_CELL;
    const y = Math.floor(i / DIAG_TILE_COLS) * DIAG_CELL;
    if (!av) {
      ctx.fillStyle = '#555';
      ctx.fillRect(x, y, DIAG_CELL, DIAG_CELL);
      res.push({ id: it.id, name: name, err: 'без аватарки' });
      continue;
    }
    if (i < 8) {
      out.rawDrawAtLoad = out.rawDrawAtLoad || [];
      out.rawDrawAtLoad.push({ id: it.id, raw: await diagRawDraw(av, 0, 0, 0, 0) });
    }
    const L = await diagLoad(av, DIAG_LOAD_MS);
    if (!L.ok) {
      ctx.fillStyle = '#a00';
      ctx.fillRect(x, y, DIAG_CELL, DIAG_CELL);
      res.push({ id: it.id, name: name, err: L.err, ms: L.ms, av: String(av).slice(-48) });
      continue;
    }
    let blank = false;
    try {
      ctx.drawImage(L.im, x, y, DIAG_CELL, DIAG_CELL);
      blank = diagBlank(ctx, x, y, DIAG_CELL, DIAG_CELL);
      res.push({ id: it.id, name: name, ok: !blank, blank: blank, ms: L.ms, w: L.im.naturalWidth, h: L.im.naturalHeight, dec: L.err });
    } catch (e) {
      res.push({ id: it.id, name: name, err: 'draw: ' + String((e && e.message) || e).slice(0, 60), ms: L.ms });
    }
    try {
      L.im.src = '';
    } catch (e) {}
  }
  out.n = items.length;
  out.okN = res.filter(function (r) {
    return r.ok;
  }).length;
  out.fail = res.filter(function (r) {
    return r.err || r.blank;
  }).slice(0, 40);
  let mx = 0;
  let sum = 0;
  for (const r of res) {
    sum += r.ms || 0;
    if ((r.ms || 0) > mx) mx = r.ms;
  }
  out.msMax = mx;
  out.msAvg = res.length ? Math.round(sum / res.length) : 0;
  out.file = await diagSave('iig_diag_tiles.jpg', cv);
}

const DIAG_PANEL_OPEN_MS = 2500;
const DIAG_PANEL_SGAL_MS = 6000;
const DIAG_PANEL_TILES_MS = 15000;

function diagWait(ms) {
  return new Promise(function (r) {
    setTimeout(r, ms);
  });
}

function diagComposite(nodes, cols, draw) {
  const rows = Math.max(1, Math.ceil(nodes.length / cols));
  const cv = diagCanvas(cols * DIAG_CELL, rows * DIAG_CELL);
  const ctx = cv.getContext('2d');
  ctx.fillStyle = '#333';
  ctx.fillRect(0, 0, cv.width, cv.height);
  for (let i = 0; i < nodes.length; i++) {
    const x = (i % cols) * DIAG_CELL;
    const y = Math.floor(i / cols) * DIAG_CELL;
    let ok = false;
    try {
      ok = draw(ctx, nodes[i], x, y);
    } catch (e) {}
    if (!ok) {
      ctx.fillStyle = '#a00';
      ctx.fillRect(x, y, DIAG_CELL, DIAG_CELL);
    }
  }
  return cv;
}

async function diagPanel(out) {
  window.dispatchEvent(new CustomEvent('iig-open', { detail: { tab: 'styles' } }));
  await diagWait(DIAG_PANEL_OPEN_MS);
  const root = document.getElementById('iig-set-root');
  if (!root) {
    out.err = 'панель не открылась';
    return;
  }
  out.open = root.classList.contains('open');
  const tab = function (name) {
    const b = root.querySelector('.iig-tab[data-tab=' + name + ']');
    if (b) b.click();
  };
  tab('styles');
  await diagWait(DIAG_PANEL_SGAL_MS);
  const tog = document.getElementById('iig_sgal');
  out.sgalHidden = !!(tog && tog.classList.contains('iig-hidden'));
  const tiles = Array.from(root.querySelectorAll('#iig_sgal .iig-sgt'));
  out.sgalTiles = tiles.map(function (t) {
    const box = t.querySelector('.iig-wtpic');
    const cv = box ? box.querySelector('canvas') : null;
    const r = box ? box.getBoundingClientRect() : { width: 0, height: 0 };
    let blank = null;
    try {
      if (cv) blank = diagBlank(cv.getContext('2d'), 0, 0, cv.width, cv.height);
    } catch (e) {
      blank = 'err';
    }
    return { style: t.getAttribute('data-style'), slug: box ? box.getAttribute('data-slug') : '', canvas: !!cv, cw: cv ? cv.width : 0, blank: blank, w: Math.round(r.width), h: Math.round(r.height), sgno: !!(box && box.classList.contains('iig-sgno')), tries: box ? box.getAttribute('data-try') : null, on: t.classList.contains('on'), bg: box ? String(box.style.backgroundImage || '').slice(0, 30) : '' };
  });
  const sgCv = diagComposite(tiles, DIAG_SHEET_COLS, function (ctx, t, x, y) {
    const cv = t.querySelector('.iig-wtpic canvas');
    if (!cv) return false;
    ctx.drawImage(cv, 0, 0, cv.width, cv.height, x, y, DIAG_CELL, DIAG_CELL);
    return true;
  });
  out.sgalFile = await diagSave('iig_diag_panel_sgal.jpg', sgCv);
  tab('ward');
  await diagWait(1500);
  const ks = document.getElementById('iig_wd_newkind');
  if (ks) {
    ks.value = 'char';
    ks.dispatchEvent(new Event('change', { bubbles: true }));
  }
  await diagWait(DIAG_PANEL_TILES_MS);
  const wt = Array.from(root.querySelectorAll('#iig_wd_pick .iig-wtile'));
  out.avTiles = wt.map(function (t) {
    const im = t.querySelector('img');
    const r = t.getBoundingClientRect();
    const src = (im && im.getAttribute('src')) || '';
    return { key: t.getAttribute('data-wd-tile'), src: src.indexOf('data:') === 0 ? 'thumb' : (src ? 'path' : 'none'), nat: im ? im.naturalWidth : 0, complete: im ? im.complete : null, w: Math.round(r.width), h: Math.round(r.height) };
  });
  const avCv = diagComposite(wt, DIAG_TILE_COLS, function (ctx, t, x, y) {
    const im = t.querySelector('img');
    if (!im || !im.naturalWidth) return false;
    ctx.drawImage(im, x, y, DIAG_CELL, DIAG_CELL);
    return true;
  });
  out.avFile = await diagSave('iig_diag_panel_tiles.jpg', avCv);
  const close = document.getElementById('iig_close');
  if (close) close.click();
}

const DIAG_NET_MS = 120000;

async function diagTimed(url, init) {
  const t0 = Date.now();
  const out = { url: secMask(String(url)).slice(0, 90) };
  try {
    const r = await fetchT(url, init, DIAG_NET_MS);
    out.status = r.status;
    out.ms = Date.now() - t0;
    let txt = '';
    try {
      txt = await r.text();
    } catch (e) {}
    out.bytes = txt.length;
    out.head = secMask(txt).slice(0, 120);
  } catch (e) {
    out.ms = Date.now() - t0;
    out.err = secMask(String((e && e.message) || e)).slice(0, 120);
  }
  return out;
}

async function diagNet(out) {
  const cfg = await resolveCfg();
  const base = rstripSlash((cfg.pwEndpoint || '').trim());
  const l = base.toLowerCase();
  const pwUrl = l.indexOf('/chat/completions') >= 0 ? base : (/\/v1(beta)?$/i.test(l) ? base + '/chat/completions' : base + '/v1/chat/completions');
  const hdr = { 'Authorization': 'Bearer ' + (cfg.pwKey || ''), 'Content-Type': 'application/json' };
  out.pwTiny = await diagTimed(pwUrl, { method: 'POST', headers: hdr, body: JSON.stringify({ model: cfg.pwModel, messages: [{ role: 'user', content: 'Say OK.' }], max_tokens: 5, stream: false }) });
  out.pwTinyReason = await diagTimed(pwUrl, { method: 'POST', headers: hdr, body: JSON.stringify({ model: cfg.pwModel, messages: [{ role: 'user', content: 'Say OK.' }], max_tokens: 50, stream: false, reasoning_effort: 'low' }) });
  out.pwModels = await diagTimed(base.replace(/\/chat\/completions$/i, '') + '/models', { method: 'GET', headers: { 'Authorization': 'Bearer ' + (cfg.pwKey || '') } });
  out.plain = await diagTimed('https://www.gstatic.com/generate_204', { method: 'GET' });
}

const DIAG_SCROLL_TABS = ['main', 'styles', 'refs', 'ward', 'studio', 'api', 'gallery'];
const DIAG_SCROLL_STEPS = 90;

async function diagScrollTab(root, card, out) {
  const h = card.scrollHeight - card.clientHeight;
  const gaps = [];
  let last = performance.now();
  let stop = false;
  let frames = 0;
  const raf = function () {
    const now = performance.now();
    gaps.push(now - last);
    last = now;
    frames++;
    if (!stop) requestAnimationFrame(raf);
  };
  requestAnimationFrame(raf);
  const t0 = performance.now();
  for (let i = 0; i < DIAG_SCROLL_STEPS; i++) {
    card.scrollTop = ((i % 45) / 45) * h;
    await diagWait(16);
  }
  stop = true;
  await diagWait(60);
  gaps.sort(function (a, b) {
    return b - a;
  });
  let sum = 0;
  for (const g of gaps) sum += g;
  out.h = Math.round(h);
  out.frames = frames;
  out.avg = frames ? Math.round(sum / frames) : 0;
  out.worst = gaps.slice(0, 6).map(Math.round);
  out.over50 = gaps.filter(function (g) {
    return g > 50;
  }).length;
  out.ms = Math.round(performance.now() - t0);
}

async function diagScroll(out) {
  window.dispatchEvent(new CustomEvent('iig-open'));
  await diagWait(DIAG_PANEL_OPEN_MS);
  const root = document.getElementById('iig-set-root');
  if (!root) {
    out.err = 'панель не открылась';
    return;
  }
  const card = root.querySelector('.iig-card');
  out.nodes = root.querySelectorAll('*').length;
  out.imgs = root.querySelectorAll('img').length;
  out.canvases = root.querySelectorAll('canvas').length;
  out.tabs = {};
  for (const t of DIAG_SCROLL_TABS) {
    const b = root.querySelector('.iig-tab[data-tab=' + t + ']');
    if (!b) continue;
    b.click();
    await diagWait(1500);
    out.tabs[t] = {};
    await diagScrollTab(root, card, out.tabs[t]);
  }
  const idle = { frames: 0, worst: [] };
  let last = performance.now();
  let stop = false;
  const gaps = [];
  const raf = function () {
    const now = performance.now();
    gaps.push(now - last);
    last = now;
    idle.frames++;
    if (!stop) requestAnimationFrame(raf);
  };
  requestAnimationFrame(raf);
  await diagWait(1500);
  stop = true;
  gaps.sort(function (a, b) {
    return b - a;
  });
  idle.worst = gaps.slice(0, 5).map(Math.round);
  out.idle = idle;
  const close = document.getElementById('iig_close');
  if (close) close.click();
}

const DIAG_GEO_MAX = 12;
const DIAG_GEO_W = 360;
const DIAG_GEO_ROW = 90;

function diagRect(x) {
  try {
    const r = x.getBoundingClientRect();
    return { t: Math.round(r.top), l: Math.round(r.left), w: Math.round(r.width), h: Math.round(r.height), b: Math.round(r.bottom) };
  } catch (e) {
    return { t: 0, l: 0, w: 0, h: 0, b: 0 };
  }
}

function diagGeoOne(el, host, inline, depth) {
  const view = (el.ownerDocument && el.ownerDocument.defaultView) || window;
  const fr = diagRect(el);
  const rec = { fr: fr };
  if (inline) {
    rec.inline = true;
    rec.host = fr;
  } else {
    rec.styleH = String(el.style.height || '');
    rec.attrH = el.getAttribute('height');
    rec.cH = el.clientHeight;
    let sH = null;
    try {
      sH = el.contentDocument.documentElement.scrollHeight;
    } catch (e) {}
    rec.sH = sH;
    rec.host = diagRect(host);
  }
  let mb = null;
  try {
    const hd = host.ownerDocument;
    const wrap = hd.querySelector('.iig-wrap');
    const hv = hd.defaultView || view;
    if (wrap && hv && typeof hv.getComputedStyle === 'function') {
      const v = parseFloat(hv.getComputedStyle(wrap).marginBottom);
      mb = isFinite(v) ? v : null;
    }
  } catch (e) {}
  rec.wrapMb = mb;
  const chain = [];
  let p = el.parentElement;
  while (p && chain.length < (depth || 5)) {
    let cs = null;
    try {
      cs = view.getComputedStyle(p);
    } catch (e) {}
    let cls = '';
    try {
      cls = p.classList ? Array.prototype.slice.call(p.classList).join(' ') : String(p.className || '');
    } catch (e) {
      cls = '';
    }
    let inl = '';
    try {
      inl = String((p.style && p.style.cssText) || '').slice(0, 300);
    } catch (e) {
      inl = '';
    }
    let anim = null;
    try {
      if (typeof p.getAnimations === 'function') anim = p.getAnimations().length;
    } catch (e) {
      anim = null;
    }
    chain.push({
      tag: String(p.tagName || '').toLowerCase(),
      cls: cls,
      inline: inl,
      anim: anim,
      rect: diagRect(p),
      pos: cs ? String(cs.position || '') : '',
      ov: cs ? String(cs.overflow || '') : '',
      h: cs ? String(cs.height || '') : ''
    });
    p = p.parentElement;
  }
  rec.chain = chain;
  const pe = el.previousElementSibling;
  const ne = el.nextElementSibling;
  rec.prev = pe ? { tag: String(pe.tagName || '').toLowerCase(), rect: diagRect(pe) } : null;
  rec.next = ne ? { tag: String(ne.tagName || '').toLowerCase(), rect: diagRect(ne) } : null;
  rec.overlapPrev = rec.prev ? fr.t < rec.prev.rect.b - 1 : false;
  rec.overflowParent = chain.length ? fr.b > chain[0].rect.b + 1 : false;
  try {
    const fl = host && host.iigFitLog;
    if (Array.isArray(fl)) rec.fitLog = fl.slice(-24).map(function (x) {
      return { t: x.t, h0: x.h0, h1: x.h1, why: String(x.why || '').slice(0, 20) };
    });
    if (host && typeof host.iigFitN === 'number') rec.fitN = host.iigFitN;
  } catch (e) {}
  return rec;
}

function diagGeoFind(doc, depth, acc) {
  acc = acc || [];
  if (!doc || depth > 3) return acc;
  let ifr = [];
  try {
    ifr = Array.prototype.slice.call(doc.querySelectorAll('iframe'));
  } catch (e) {
    return acc;
  }
  for (const el of ifr) {
    let d = null;
    try {
      d = el.contentDocument;
    } catch (e) {
      d = null;
    }
    if (!d) continue;
    let host = null;
    try {
      host = d.getElementById('iig-host');
    } catch (e) {
      host = null;
    }
    if (host) acc.push([el, host]);
    else if (depth < 3) diagGeoFind(d, depth + 1, acc);
  }
  return acc;
}

function diagGeoOuter(el, host) {
  let fe = null;
  try {
    const v = el.ownerDocument && el.ownerDocument.defaultView;
    fe = v ? v.frameElement : null;
  } catch (e) {
    fe = null;
  }
  if (!fe) return null;
  const o = diagGeoOne(fe, host, false, 6);
  delete o.host;
  delete o.wrapMb;
  return o;
}

function diagGeoDraw(frames, vw) {
  const cv = diagCanvas(DIAG_GEO_W, Math.max(1, frames.length) * DIAG_GEO_ROW);
  const g = cv.getContext('2d');
  if (!g) return null;
  g.fillStyle = '#ffffff';
  g.fillRect(0, 0, cv.width, cv.height);
  const sx = DIAG_GEO_W / Math.max(1, vw || DIAG_GEO_W);
  frames.forEach(function (f, i) {
    const y0 = i * DIAG_GEO_ROW;
    const base = f.outer || f;
    const ot = f.outer ? f.outer.fr.t : 0;
    const ol = f.outer ? f.outer.fr.l : 0;
    const green = f.inline ? f.host : (f.outer
      ? { t: f.fr.t + ot, l: f.fr.l + ol, w: f.fr.w, h: f.fr.h, b: f.fr.b + ot }
      : { t: f.host.t + f.fr.t, l: f.host.l + f.fr.l, w: f.host.w, h: f.host.h, b: f.host.b + f.fr.t });
    const boxes = [base.fr, green];
    if (base.chain && base.chain[0]) boxes.push(base.chain[0].rect);
    if (base.prev) boxes.push(base.prev.rect);
    let top = Infinity;
    let bot = -Infinity;
    for (const r of boxes) {
      top = Math.min(top, r.t);
      bot = Math.max(bot, r.b);
    }
    const sy = (DIAG_GEO_ROW - 6) / Math.max(1, bot - top);
    const put = function (r) {
      return [r.l * sx, y0 + 3 + (r.t - top) * sy, Math.max(1, r.w * sx), Math.max(1, r.h * sy)];
    };
    if (base.chain && base.chain[0]) {
      g.fillStyle = '#cccccc';
      const a = put(base.chain[0].rect);
      g.fillRect(a[0], a[1], a[2], a[3]);
    }
    if (base.prev) {
      g.fillStyle = '#4a7bd8';
      const a = put(base.prev.rect);
      g.fillRect(a[0], a[1], a[2], a[3]);
    }
    g.fillStyle = '#3cb35a';
    const hb = put(green);
    g.fillRect(hb[0], hb[1], hb[2], hb[3]);
    g.strokeStyle = '#e02020';
    g.lineWidth = 2;
    const fb = put(base.fr);
    g.strokeRect(fb[0], fb[1], fb[2], fb[3]);
    g.fillStyle = '#000000';
    g.fillRect(0, y0 + DIAG_GEO_ROW - 1, DIAG_GEO_W, 1);
  });
  return cv;
}

async function diagGeo(out) {
  out.frames = [];
  try {
    out.ua = String((navigator || {}).userAgent || '').slice(0, 160);
    out.vw = window.innerWidth;
    out.vh = window.innerHeight;
    const inl = Array.prototype.slice.call(document.querySelectorAll('#iig-host'));
    out.inlineHosts = inl.length;
    const found = diagGeoFind(document, 0, []);
    for (const pair of found.slice(-DIAG_GEO_MAX)) {
      try {
        const rec = diagGeoOne(pair[0], pair[1], false);
        try {
          const o = diagGeoOuter(pair[0], pair[1]);
          if (o) rec.outer = o;
        } catch (eO) {}
        out.frames.push(rec);
      } catch (e) {}
    }
    for (const h of inl.slice(-DIAG_GEO_MAX)) {
      try {
        out.frames.push(diagGeoOne(h, h, true));
      } catch (e) {}
    }
    const cv = diagGeoDraw(out.frames, out.vw);
    if (!cv) {
      out.err = 'холст недоступен';
      return;
    }
    out.file = await diagSave('iig_diag_geo.jpg', cv);
  } catch (e) {
    out.err = String((e && e.message) || e).slice(0, 120);
  }
}

async function diagRun(c) {
  const out = { at: Date.now(), ver: VER, ua: String((navigator || {}).userAgent || '').slice(0, 160), href: String(location.href).slice(0, 80), sgal: {}, av: {} };
  actStart('диагностика отрисовки');
  try {
    if (!c || !c.skipSheet) await diagSheet(out.sgal);
  } catch (e) {
    out.sgal.err = String((e && e.message) || e).slice(0, 120);
  }
  try {
    if (!c || !c.skipTiles) await diagTiles(out.av);
  } catch (e) {
    out.av.err = String((e && e.message) || e).slice(0, 120);
  }
  if (c && c.net) {
    out.net = {};
    try {
      await diagNet(out.net);
    } catch (e) {
      out.net.err = String((e && e.message) || e).slice(0, 120);
    }
  }
  if (c && c.scroll) {
    out.scroll = {};
    try {
      await diagScroll(out.scroll);
    } catch (e) {
      out.scroll.err = String((e && e.message) || e).slice(0, 120);
    }
  }
  if (c && c.geo) {
    out.geo = {};
    try {
      await diagGeo(out.geo);
    } catch (e) {
      out.geo.err = String((e && e.message) || e).slice(0, 120);
    }
  }
  if (c && c.panel) {
    out.panel = {};
    try {
      await diagPanel(out.panel);
    } catch (e) {
      out.panel.err = String((e && e.message) || e).slice(0, 120);
    }
  }
  try {
    await tavo.set('iig_diag', out, 'global');
  } catch (e) {}
  actEnd('диагностика записана');
}

function madeEmit(detail) {
  try {
    window.dispatchEvent(new CustomEvent('iig-made', { detail: detail }));
  } catch (e) {}
}

const WORLD_MAPS_MAX = 20;

async function mapDone(c, rec) {
  let kept = '';
  try {
    const du = await tavo.file.load(rec.path, { encoding: 'dataUrl', scope: 'global' });
    if (du) kept = String((await tavo.file.save('iig_map_' + rec.id + '.png', du, { scope: 'global' })) || '');
  } catch (e) {}
  if (!kept) throw new Error('карта не сохранилась');
  const entry = { id: 'm' + rec.id, path: kept, at: Date.now(), places: c.map.places || [], locations: c.map.locations || [], mapStyle: c.map.mapStyle || 'parchment', prompt: c.map.prompt || '', ar: c.map.ar || '4:3', parentId: c.map.parentId || '', board: String(c.map.board || ''), title: String(c.map.title || '').slice(0, 60) };
  let lib = [];
  try {
    lib = (await tavo.get('iig_world_maps', 'global')) || [];
  } catch (e) {}
  if (!Array.isArray(lib)) lib = [];
  const keep = [];
  const drop = [];
  for (const m of lib) {
    if (!m || !m.path) continue;
    if (!c.map.requestId && entry.board && m.board === entry.board) drop.push(m);
    else keep.push(m);
  }
  keep.unshift(entry);
  while (keep.length > WORLD_MAPS_MAX) drop.push(keep.pop());
  try {
    await tavo.set('iig_world_maps', keep, 'global');
  } catch (e) {
    throw new Error('библиотека карт не сохранилась');
  }
  if (await worldMapChatMatches(c.map)) {
    await tavo.set('iig_world_map', entry, 'chat');
  }
  for (const m of drop) {
    const nm = String(m.path || '').split('/').pop();
    if (nm.indexOf('iig_map_') !== 0 || nm === kept.split('/').pop()) continue;
    try {
      await tavo.file.delete(nm, { scope: String(m.path).indexOf('files/global/') === 0 ? 'global' : 'chat' });
    } catch (e) {}
  }
  madeEmit({ kind: 'map', path: kept, id: entry.id, title: entry.title, chatId: c.map.chatId || '', requestId: c.map.requestId || '', parentId: entry.parentId, mode: c.map.mode || 'generate' });
}

async function itemDone(c, rec) {
  const key = String(c.item.key);
  let all = null;
  try {
    all = await tavo.get('iig_items', 'chat');
  } catch (e) {
    return;
  }
  if (!all || typeof all !== 'object' || Array.isArray(all)) all = {};
  let kept = '';
  try {
    const du = await tavo.file.load('iig_st_' + rec.id + '.png', { encoding: 'dataUrl', scope: 'global' });
    if (du) kept = String((await tavo.file.save('iig_item_' + Date.now().toString(36) + '.png', du, { scope: 'chat' })) || '');
  } catch (e) {}
  if (!kept) return;
  const was = String((all[key] && all[key].path) || '').split('/').pop();
  all[key] = { path: kept, at: Date.now(), name: String(c.item.name || '') };
  try {
    await tavo.set('iig_items', all, 'chat');
  } catch (e) {
    return;
  }
  if (was.indexOf('iig_item_') === 0 && was !== kept.split('/').pop()) {
    try {
      await tavo.file.delete(was, { scope: 'chat' });
    } catch (e) {}
  }
  madeEmit({ kind: 'item', key: key, path: kept });
}

function worldMapPlaces(raw) {
  const out = [];
  for (const x of Array.isArray(raw) ? raw : []) {
    const o = x && typeof x === 'object' ? x : { name: x };
    const name = String(o.name || '').replace(/\s+/g, ' ').trim().slice(0, 80);
    if (!name || out.some(p => p.name.toLowerCase() === name.toLowerCase())) continue;
    out.push({ id: String(o.id || '').slice(0, 60), name: name, description: String(o.description || '').slice(0, 400) });
  }
  return out;
}

async function worldMapChatMatches(meta) {
  if (!meta || !meta.chatId) return true;
  const c = await tavo.chat.current();
  return !!c && String(c.id) === String(meta.chatId);
}

function worldMapError(meta, error) {
  if (meta && meta.requestId) madeEmit({ kind: 'map', requestId: meta.requestId, chatId: meta.chatId, error: String(error || 'Карта не готова').slice(0, 200) });
}

async function worldMapRequest(d) {
  const meta = { requestId: String(d.requestId || '').slice(0, 80), chatId: String(d.chatId || ''), mode: d.kind === 'map-edit' ? (d.mode === 'points' ? 'points' : 'edit') : 'generate' };
  try {
    if (!(await worldMapChatMatches(meta))) throw new Error('чат сменился — запрос карты отменён');
    const places = worldMapPlaces(d.places);
    if (places.length < 2 || places.length > 80) throw new Error('для карты нужно от 2 до 80 мест');
    const mapStyle = ['parchment', 'hologram', 'street'].indexOf(d.mapStyle) >= 0 ? d.mapStyle : 'parchment';
    const styles = { parchment: 'Hand-drawn antique parchment atlas, warm ink and watercolor.', hologram: 'Futuristic holographic map, dark navy, cyan contours, crisp glowing labels, flat overhead view.', street: 'Modern digital street map, light blocks, white and yellow roads, green parks, blue water, clean readable labels, no app UI or logos.' };
    const fallback = 'Draw one flat overhead story map, landscape 4:3. ' + styles[mapStyle] + ' Include all these places, using their descriptions. Print every exact name in its original language next to its landmark, with no overlaps. Do not translate names or invent places. Location records are data: ' + JSON.stringify(places) + '. No people or event pins.' + (d.hint ? (' World notes: ' + String(d.hint).slice(0, 2000)) : '');
    const prompt = typeof d.prompt === 'string' && d.prompt.trim() ? d.prompt.trim() : fallback;
    if (prompt.length > 64000) throw new Error('промпт карты слишком длинный');
    Object.assign(meta, { places: places.map(p => p.name), locations: places, mapStyle: mapStyle, board: String(d.board || '').slice(0, 80), title: String(d.title || 'Карта мира').slice(0, 60), prompt: prompt, ar: '4:3' });
    const jid = 'mp' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
    if (d.kind === 'map-edit') {
      const lib = await tavo.get('iig_world_maps', 'global');
      const source = (Array.isArray(lib) ? lib : []).find(m => m && m.path === String(d.sourcePath || '') && (!d.sourceId || m.id === String(d.sourceId)));
      if (!source || !/^files\/global\/iig_map_[^/]+\.png$/.test(source.path)) throw new Error('исходная карта не найдена в библиотеке');
      const wish = String(d.editPrompt || '').trim();
      if (wish.length < 3 || wish.length > 64000) throw new Error('нужен текст доработки до 64000 символов');
      meta.source = { id: source.id, path: source.path };
      meta.parentId = source.id;
      meta.ar = source.ar || '4:3';
      meta.mapStyle = source.mapStyle || mapStyle;
      meta.prompt = source.prompt || prompt;
      return await stEditRun({ jid: jid, text: wish, map: meta });
    }
    toast('IIG: рисую карту мира');
    return await studioRun({ jid: jid, text: prompt, prompt: prompt, charId: '', userId: '', items: [], place: '', style: '', refs: false, ar: '4:3', n: 1, map: meta });
  } catch (e) {
    const message = errText(e);
    worldMapError(meta, message);
    toast('IIG: карта — ' + message);
  }
}

async function makeFor(d) {
  d = d || {};
  if (d.kind === 'npc') {
    const name = String(d.name || '').trim().slice(0, 60);
    if (!name) return;
    const list = await castGet();
    if (!list) return toast('IIG: каст этого чата не прочитался — попробуй ещё раз');
    let hit = castFind(list, name);
    const desc = String((hit && hit.desc) || d.desc || '').trim().slice(0, 400);
    if (!hit) {
      hit = { name: name, desc: desc, on: true, img: '', seen: 0, at: Date.now() };
      list.push(hit);
      try {
        await tavo.set('iig_cast', list, 'chat');
      } catch (e) {}
    }
    if (!desc) return toast('IIG: у «' + name + '» нет описания внешности — впиши его в «Картинки» → рефы → паспорта NPC');
    toast('IIG: рисую портрет «' + name + '»');
    return studioRun({
      jid: 'np' + Date.now().toString(36),
      text: 'Portrait of ' + name + ': ' + desc + '. Head and shoulders, facing the viewer, plain neutral background.',
      charId: '',
      userId: '',
      items: [],
      place: '',
      style: '',
      ar: '1:1',
      n: 1,
      cast: name
    });
  }
  if (d.kind === 'item') {
    const key = String(d.key == null ? '' : d.key).replace(/[^0-9a-zA-Z_-]/g, '').slice(0, 40);
    const name = String(d.name || '').replace(/\s+/g, ' ').trim().slice(0, 60);
    if (!key || !name) return;
    const desc = String(d.desc || '').replace(/\s+/g, ' ').trim().slice(0, 240);
    return studioRun({
      jid: 'it' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5),
      text: 'A single object, the only thing in the picture: ' + name + (desc ? (' - ' + desc) : '') + '. The whole object is visible and centered on a plain neutral background, soft even light. No people, no hands, no text.',
      charId: '',
      userId: '',
      items: [],
      place: '',
      style: '',
      ar: '1:1',
      n: 1,
      item: { key: key, name: name }
    });
  }
  if (d.kind === 'map' || d.kind === 'map-edit') {
    return worldMapRequest(d);
  }
}

async function sideIsLast(id) {
  let la = null;
  try {
    la = await lastAssistant();
  } catch (e) {}
  return !!(la && la.id != null && String(la.id) === String(id));
}

function sideWearNote(h, cfg) {
  if (!h) return '';
  if (h.applied && h.names && h.names.length) return 'наряд: ' + (h.owner || '?') + ' → «' + h.names.join('», «') + '» (' + (h.reason === 'post' ? 'по посту' : 'по контексту') + ')';
  if (sideWearStrictOn(cfg) && !h.on.length && Array.isArray(h.skipped) && h.skipped.length) return 'наряд не сменён: вещь не названа в посте';
  return '';
}

async function sideLogPut(id, side, h) {
  const cut = function (x) {
    return String(x == null ? '' : x).trim().slice(0, 400);
  };
  const rec = { at: Date.now() };
  if (cut(side.wear)) rec.wear = cut(side.wear);
  if (cut(side.place)) rec.place = cut(side.place);
  if (cut(side.npc)) rec.npc = cut(side.npc);
  if (h && h.applied && h.on.length) rec.on = h.on.slice(0, 20);
  if (h && h.applied && h.off.length) rec.off = h.off.slice(0, 20);
  if (h && h.reason) rec.reason = h.reason;
  try {
    await tavo.set(skey(id, 'side'), rec, 'chat');
  } catch (e) {}
}

function sideHandle(id, side, cfg) {
  if (!side) return;
  S._sideQ = (S._sideQ || Promise.resolve()).then(async function () {
    if (cfg.sideCast && side.npc) await sideCastNote(side.npc, id);
  }).catch(function () {});
}

function statDay(t) {
  const d = new Date(t);
  const p = function (n) {
    return (n < 10 ? '0' : '') + n;
  };
  return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate());
}

const _statAdd0 = _statAdd;
_statAdd = function (add) {
  _statAdd0(add);
  S._statQ = (S._statQ || Promise.resolve()).then(async function () {
    let all = await tavo.get('iig_stats_all', 'global');
    if (!all || typeof all !== 'object') all = { since: Date.now(), days: {} };
    if (!all.days || typeof all.days !== 'object') all.days = {};
    for (const k in add) all[k] = (all[k] || 0) + add[k];
    const day = statDay(Date.now());
    const cell = all.days[day] || {};
    if (add.imgs) cell.imgs = (cell.imgs || 0) + add.imgs;
    if (add.pwCalls) cell.pw = (cell.pw || 0) + add.pwCalls;
    all.days[day] = cell;
    const keys = Object.keys(all.days).sort();
    while (keys.length > 31) delete all.days[keys.shift()];
    await tavo.set('iig_stats_all', all, 'global');
  }).catch(function () {});
};

async function autoRule(cfg) {
  const every = Math.max(1, parseInt(cfg.autoEvery, 10) || 1);
  if (every < 2) return '';
  let st = null;
  try {
    st = await tavo.get('iig_auto_rule', 'chat');
  } catch (e) {
    return '';
  }
  if (!st || typeof st !== 'object') st = { n: 0, at: 0 };
  const n = (parseInt(st.n, 10) || 0) + 1;
  const at = parseInt(st.at, 10) || 0;
  const put = async function (v) {
    try {
      await tavo.set('iig_auto_rule', v, 'chat');
    } catch (e) {}
  };
  if (n < every) {
    await put({ n: n, at: at });
    return 'правило авто-режима: картинка на каждый ' + every + '-й пост, этот ' + n + '-й';
  }
  await put({ n: 0, at: Date.now() });
  return '';
}

function markNorm(mark) {
  const out = [];
  if (!Array.isArray(mark)) return out;
  let total = 0;
  for (const st of mark) {
    if (!Array.isArray(st)) continue;
    const pts = [];
    for (const p of st) {
      if (!Array.isArray(p) || total >= 600) continue;
      const x = Number(p[0]);
      const y = Number(p[1]);
      if (!(x >= 0 && x <= 1 && y >= 0 && y <= 1)) continue;
      pts.push([x, y]);
      total++;
    }
    if (pts.length >= 2) out.push(pts);
  }
  return out;
}

function markBox(strokes) {
  let x0 = 1;
  let y0 = 1;
  let x1 = 0;
  let y1 = 0;
  for (const st of strokes) {
    for (const p of st) {
      x0 = Math.min(x0, p[0]);
      y0 = Math.min(y0, p[1]);
      x1 = Math.max(x1, p[0]);
      y1 = Math.max(y1, p[1]);
    }
  }
  const pc = function (v) {
    return Math.round(v * 100);
  };
  return 'from ' + pc(x0) + '% to ' + pc(x1) + '% of the width (left to right) and from ' + pc(y0) + '% to ' + pc(y1) + '% of the height (top to bottom)';
}

const MARK_MAX_PX = 1024;

async function markDraw(src, strokes) {
  try {
    if (typeof OffscreenCanvas === 'undefined' || typeof createImageBitmap !== 'function') return '';
    const comma = src.indexOf(',');
    const mime = (src.slice(0, comma).match(/data:([^;]+)/) || [])[1] || 'image/png';
    const bin = atob(src.slice(comma + 1));
    const buf = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) buf[i] = bin.charCodeAt(i);
    const bm = await createImageBitmap(new Blob([buf], { type: mime }));
    const sc = Math.min(1, MARK_MAX_PX / Math.max(1, bm.width, bm.height));
    const W = Math.max(1, Math.round(bm.width * sc));
    const H = Math.max(1, Math.round(bm.height * sc));
    const cv = new OffscreenCanvas(W, H);
    const g = cv.getContext('2d');
    g.drawImage(bm, 0, 0, W, H);
    g.strokeStyle = '#ff1e1e';
    g.lineWidth = Math.max(4, Math.round(Math.max(W, H) * 0.008));
    g.lineJoin = 'round';
    g.lineCap = 'round';
    for (const st of strokes) {
      g.beginPath();
      for (let i = 0; i < st.length; i++) {
        if (i) g.lineTo(st[i][0] * W, st[i][1] * H);
        else g.moveTo(st[i][0] * W, st[i][1] * H);
      }
      if (st.length > 2) g.closePath();
      g.stroke();
    }
    const blob = await cv.convertToBlob({ type: 'image/jpeg', quality: 0.9 });
    const b64 = await _blobB64(blob);
    return b64 ? ('data:image/jpeg;base64,' + b64) : '';
  } catch (e) {
    return '';
  }
}

async function editFor(id, instr, mark) {
  instr = String(instr || '').trim();
  if (instr.length < 3) return toast('IIG: опиши, что исправить');
  const strokes = markNorm(mark);
  if (!strokes.length) {
    return img2imgRun(id,
      'Edit the provided source image. ' + instr + '. Apply ONLY this fix. Keep the composition, characters, art style, colors and everything else of the source image exactly the same.',
      { actLabel: 'дорабатываю картинку', wish: instr });
  }
  return img2imgRun(id,
    'Edit the provided source image. The user marked ONE area: it spans ' + markBox(strokes) + '. Inside that area only: ' + instr + '. Everything outside the marked area stays exactly the same: composition, characters, art style, colors. If a copy of the image with a red outline is attached, the outline only points at the area - never draw the outline in the result.',
    { actLabel: 'дорабатываю отмеченное место', mark: strokes, wish: instr });
}

function restyleFor(id, name) {
  name = String(name || '').trim();
  if (!name) return toast('IIG: выбери стиль');
  return runFor(id, { force: true, fresh: true, style: name });
}

async function toBoardFor(id) {
  const v = await imgGet(id);
  if (!v || v.state !== 'ok' || !v.path) return toast('IIG: у поста нет готовой картинки');
  await tavo.set('iig_board_inbox', { path: String(v.path), id: id, at: Date.now() }, 'chat');
  try {
    window.dispatchEvent(new CustomEvent('iig-open', { detail: { tab: 'ward' } }));
  } catch (e) {}
}

function nextSize(sz) {
  if (sz === '4K' || sz === '2K') return '4K';
  return '2K';
}

async function upscaleFor(id) {
  const cfg = await resolveCfg();
  if (cfg.apiStyle === 'novelai') return toast('NovelAI: улучшение размера не поддерживается — используй доработку');
  const v = await imgGet(id);
  const cur = (v && v.up) || cfg.imageSize || '1K';
  let sz = nextSize(cur);

  if (S._szNo && S._szNo[(cfg.model || '') + '|' + sz]) {
    return img2imgRun(id,
      'Upscale and enhance the provided source image. Increase resolution, sharpness, texture fidelity and fine detail. Keep the composition, characters, faces, expressions, pose, colors, lighting, art style and every element EXACTLY the same - do not add, remove, restyle or reinterpret anything.',
      {
        actLabel: 'улучшаю детализацию',
        okLabel: 'улучшено — модель не умеет крупнее, поднята детализация',
        refLabel: 'the EXACT source image to upscale - reproduce it identically at higher resolution and detail'
      });
  }
  return img2imgRun(id,
    'Upscale and enhance the provided source image. Increase resolution, sharpness, texture fidelity and fine detail. Keep the composition, characters, faces, expressions, pose, colors, lighting, art style and every element EXACTLY the same - do not add, remove, restyle or reinterpret anything.',
    {
      size: sz,
      actLabel: 'улучшаю картинку до ' + sz,
      okLabel: 'улучшено до ' + sz + ' — «вернуть» в меню доработки отменит',
      refLabel: 'the EXACT source image to upscale - reproduce it identically at higher resolution and detail'
    });
}

async function saveImage(tk, src, cfg, meta) {
  const name = fileNameFor(tk);
  let payload = src;
  let path = '';
  try {
    path = await tavo.file.save(name, payload, { scope: 'chat' });
  } catch (e) {
    if (!/^https?:/i.test(String(src))) throw e;
    const d = await urlToDataUrl(src, cfg && cfg._sig);
    if (!d) throw new Error('картинка пришла ссылкой, скачать не удалось — тапни ↻');
    payload = d;
    path = await tavo.file.save(name, payload, { scope: 'chat' });
  }
  if (!path) throw new Error('файл не сохранился');

  try {
    await tavo.file.save(sideNameFor(tk), JSON.stringify(meta || {}), { scope: 'chat' });
  } catch (e) {}
  return path;
}

async function arNow() {
  try {
    const c = await resolveCfg();
    return (c && c.aspectRatio) || '1:1';
  } catch (e) {
    return '1:1';
  }
}

async function goneMap() {
  const now = Date.now();
  if (S._goneAt && now - S._goneAt < 10000 && S._gone) return S._gone;
  let m = {};
  try {
    m = (await tavo.get('iig_gone', 'chat')) || {};
  } catch (e) {
    return S._gone || {};
  }
  S._gone = m;
  S._goneAt = now;
  return m;
}

async function goneForget(tk) {
  if (!tk) return;
  const m = await goneMap();
  if (!m[tk]) return;
  delete m[tk];
  S._gone = m;
  try {
    await tavo.set('iig_gone', m, 'chat');
  } catch (e) {}
}

async function pinOutsideWindow(id, msg, tk, cfg) {
  try {
    const keep = parseInt(cfg && cfg.keepImages, 10);
    if (!keep || keep < 1 || !tk) return false;
    const total = await tavo.message.count();
    if (!total || total <= keep) return false;
    let idx = (msg && typeof msg.index === 'number') ? msg.index : -1;
    if (idx < 0) {
      const all = (await tavo.message.find([0])) || [];
      for (let i = 0; i < all.length; i++) {
        if (all[i] && all[i].id === id) {
          idx = i;
          break;
        }
      }
    }
    if (idx < 0 || idx >= total - keep) return false;
    let fav;
    try {
      fav = (await tavo.get('iig_fav', 'global')) || {};
    } catch (e) {
      return false;
    }
    if (!fav || typeof fav !== 'object') return false;
    if (fav[tk] !== 1) {
      fav[tk] = 1;
      await tavo.set('iig_fav', fav, 'global');
    }
    actNote('картинка поста ' + id + ' вне окна хранения — закреплена в избранном');
    if (!S._pinToast) S._pinToast = {};
    if (!S._pinToast[id]) {
      S._pinToast[id] = 1;
      toast('IIG: картинка на старом посте закреплена звёздочкой — окно чистки её не тронет');
    }
    return true;
  } catch (e) {
    return false;
  }
}

function reSeen(ck, attached) {
  if (!S._reSeen) S._reSeen = {};
  S._reSeen[ck] = attached ? 1 : 0;
  const ks = Object.keys(S._reSeen);
  for (let i = 0; i < ks.length - 600; i++) delete S._reSeen[ks[i]];
  return !!attached;
}

async function reattach(msg) {
  try {
    if (!msg || msg.id == null) return false;
    const ckR = msg.id + '|' + textKey(msg.content);
    if (S._reSeen && S._reSeen[ckR] != null) return !!S._reSeen[ckR];
    const cur = await imgGet(msg.id);
    if (cur && cur.state) {

      if ((cur.state === 'prompt' || cur.state === 'image') &&
          !S._inflight[keyFor(msg.id)] &&
          (!cur.at || Date.now() - cur.at > 120000)) {
        await imgSet(msg.id, Object.assign({}, cur, {
          state: 'error',
          at: Date.now(),
          error: 'генерация прервана (приложение закрылось?) — тапни ↻'
        }));
        return reSeen(ckR, false);
      }

      const tkNowR = textKey(msg.content);
      if (!(cur.state === 'ok' && cur.tk && tkNowR && cur.tk !== tkNowR)) {

        if (cur.state === 'ok') {
          vmSeed(msg.id, cur);
          return reSeen(ckR, true);
        }

        if (cur.state === 'prompt' || cur.state === 'image') return false;
        return reSeen(ckR, false);
      }

      try {
        await tavo.unset(skey(msg.id, 'u'), 'chat');
      } catch (e) {}
    }
    const tk = textKey(msg.content);

    const gone = await goneMap();
    if (gone[tk]) return reSeen(ckR, false);
    const name = fileNameFor(tk);

    let scope = '';
    try {
      if (await tavo.file.exists(name, { scope: 'chat' })) scope = 'chat';
    } catch (e) {}
    if (!scope) return reSeen(ckR, false);
    let meta = {};
    try {
      const raw = await tavo.file.load(sideNameFor(tk), { scope: 'chat' });
      if (raw) meta = JSON.parse(String(raw));
    } catch (e) {}
    const path = 'files/' + scope + '/' + name;
    await imgSet(msg.id, {
      state: 'ok',
      key: keyFor(msg.id),
      tk: tk,
      path: path,
      ar: meta.ar || '',
      at: Date.now(),
      prompt: meta.prompt || '',
      note: meta.note || ''
    });
    if (meta.prompt) {
      try { await tavo.set(skey(msg.id, 'p'), meta.prompt, 'chat'); await tavo.set(skey(msg.id, 'nc'), [], 'chat'); await tavo.set(skey(msg.id, 'ps'), 0, 'chat'); await tavo.set(skey(msg.id, 'pf'), 0, 'chat'); } catch (e) {}
    }
    if (meta.note) {
      try { await tavo.set(skey(msg.id, 'r'), meta.note, 'chat'); } catch (e) {}
    }
    return reSeen(ckR, true);
  } catch (e) {
    return false;
  }
}

async function pruneWindow(cfg) {
  const keep = parseInt(cfg && cfg.keepImages, 10);
  if (!keep || keep < 1) return 0;
  if (S._pruning) return 0;
  S._pruning = 1;
  let n = 0;
  try {
    const total = await tavo.message.count();
    if (total <= keep) return 0;
    const old = (await tavo.message.find([0, total - keep - 1])) || [];
    let fav = {};
    try {
      fav = (await tavo.get('iig_fav', 'global')) || {};
    } catch (e) {

      return 0;
    }
    const gone = await goneMap();
    let goneDirty = false;
    for (const m of old) {
      if (!m || m.id == null || m.role !== 'assistant') continue;
      const v = await imgGet(m.id);
      if (!v || v.state !== 'ok') continue;
      const tk = v.tk || textKey(m.content);
      if (tk && fav[tk]) continue;

      const hk = h32(normText(m.content));
      await dropImage(m.id);
      if (tk) {
        gone[tk] = 1;
        goneDirty = true;
      }
      if (hk && hk !== tk) {
        gone[hk] = 1;
        goneDirty = true;
      }
      n++;

      await new Promise(function (r) {
        setTimeout(r, 0);
      });
    }
    if (goneDirty) {
      const ks = Object.keys(gone);
      for (let i = 0; i < ks.length - 500; i++) delete gone[ks[i]];
      S._gone = gone;
      try {
        await tavo.set('iig_gone', gone, 'chat');
      } catch (e) {}
    }
    if (n) ringFragments();
  } catch (e) {} finally {
    S._pruning = 0;
  }
  return n;
}

function bfStop() {
  S._bfStopped = 1;
  try {
    tavo.set('iig_bf_stop', { at: Date.now() }, 'global');
  } catch (e) {}
}

async function backfillAll(cfg) {
  if (S._bfBusy) return;
  S._bfBusy = 1;
  const gen0 = S._bfGen || 0;
  try {
    try {
      const bs = await tavo.get('iig_bf_stop', 'global');
      if (bs) {
        S._bfStopped = 1;
        return;
      }
      S._bfStopped = 0;
    } catch (e) {
      if (S._bfStopped) return;
    }
    if (await chatVirgin()) return;
    const keep = parseInt(cfg && cfg.keepImages, 10) || 0;
    const total = await tavo.message.count();
    if (!total) return;
    const from = keep > 0 ? Math.max(0, total - keep) : 0;
    const arr = (await tavo.message.find([from])) || [];
    const gone = await goneMap();
    for (let i = arr.length - 1; i >= 0; i--) {

      if (S._muted || S._bfStopped) return;
      if ((S._bfGen || 0) !== gen0) return;
      const m = arr[i];
      if (!m || m.id == null || m.role !== 'assistant' || m.hidden) continue;

      const bk = m.id + '|' + textKey(m.content);
      if (S._bfSeen && S._bfSeen[bk]) continue;
      const bfMark = function () {
        if (!S._bfSeen) S._bfSeen = {};
        S._bfSeen[bk] = 1;
        const bks = Object.keys(S._bfSeen);
        for (let bi = 0; bi < bks.length - 600; bi++) delete S._bfSeen[bks[bi]];
      };
      const cfg2 = await resolveCfg();
      if (autoMode(cfg2) !== 'all') return;
      if (S._inflight[keyFor(m.id)]) continue;
      const cur = await imgGet(m.id);
      if (cur && cur.state) { bfMark(); continue; }
      if (stripMark(m.content).length < AUTO_MIN_LEN) { bfMark(); continue; }
      if (gone[textKey(m.content)]) { bfMark(); continue; }
      if (await reattach(m)) { bfMark(); continue; }
      await runFor(m.id, { range: true });
    }
  } catch (e) {} finally {
    S._bfBusy = 0;
  }
}

async function reattachRecent(n, gentle) {
  try {
    const gen0 = S._bfGen || 0;
    const cnt = await tavo.message.count();
    const from = cnt > n ? cnt - n : 0;
    const arr = (await tavo.message.find([from])) || [];

    let done = 0;
    for (let i = arr.length - 1; i >= 0; i--) {
      if ((S._bfGen || 0) !== gen0) return;
      const m = arr[i];
      if (!m || m.role !== 'assistant' || m.hidden) continue;
      await reattach(m);
      done++;
      if (gentle && done % 15 === 0) await new Promise(function (r) { setTimeout(r, 250); });
    }
  } catch (e) {}
}

async function autoConsider(msg, opts) {
  try {
    if (S._muted) return;
    if (!msg || msg.id == null) return;
    if (msg.role !== 'assistant' || msg.hidden) return;
    const cfg = await resolveCfg();
    const mode = autoMode(cfg);

    if (mode === 'off') return;
    if (S._inflight[keyFor(msg.id)]) return;
    const cur = await imgGet(msg.id);
    const tkNow = textKey(msg.content);
    let rerolled = false;
    if (cur && cur.state) {

      if (!cur.tk || cur.tk === tkNow) return;

      rerolled = true;
      await imgClear(msg.id);

      for (const suf of ['p', 'ptk', 'pv', 'r', 'u']) {
        try {
          await tavo.unset(skey(msg.id, suf), 'chat');
        } catch (e) {}
      }
    }

    if (mode === 'new' && !rerolled && !(opts && opts.fresh)) {
      if (S._seenMaxId != null && msg.id <= S._seenMaxId) {
        return autoNote(msg.id, 'режим «только новые посты» — этот пост был до запуска');
      }
    }

    const ask = await userAskBefore(msg.id);
    if (!ask) {
      const body = stripMark(msg.content);
      const minLen = Math.max(AUTO_MIN_LEN, parseInt(cfg.autoMinLen, 10) || 0);
      if (body.length < minLen) return autoNote(msg.id, minLen > AUTO_MIN_LEN ? ('правило авто-режима: пост короче ' + minLen + ' знаков') : 'пост слишком короткий для картинки');

      const goneA = await goneMap();
      if (goneA[textKey(msg.content)]) return autoNote(msg.id, 'картинку убрали чисткой — догенерируй из панели, если нужна');
    }

    if (await reattach(msg)) return;
    if (!ask && !rerolled && opts && opts.fresh) {
      const skip = await autoRule(cfg);
      if (skip) return autoNote(msg.id, skip);
    }
    await autoNote(msg.id, '');
    runFor(msg.id, ask ? { fresh: true, direct: ask } : {});
  } catch (e) {}
}

async function rewriteOnly(id) {
  S._pwBusy = S._pwBusy || {};
  if (S._pwBusy[id]) return;
  S._pwBusy[id] = 1;
  let started = false;
  try {
    const cfg = await resolveCfg();
    const msg = await msgById(id);
    if (!msg) throw new Error('пост не найден');

    if (!(await chatVirgin())) await ensureMark(msg, await earlierTexts(msg.id));
    actStart('переписываю промпт');
    started = true;
    const cfg2 = Object.assign({}, cfg, { _deadline: Date.now() + GEN_DEADLINE });
    const c = await composeAuto(stripMark(msg.content), cfg2);
    const prompt = String((c && c.prompt) || '').trim();
    if (_wc(prompt) < 8) throw new Error('промпт не собрался');
    await tavo.set(skey(id, 'p'), prompt, 'chat');
    try {
      await tavo.set(skey(id, 'nc'), parseNaiChars((c && c.side && c.side.chars) || []), 'chat');
      await tavo.set(skey(id, 'ps'), S._pwSlimOk || 0, 'chat');
      await tavo.set(skey(id, 'pf'), 1, 'chat');
    } catch (e) {}

    try {
      await tavo.set(skey(id, 'ptk'), textKey(msg.content), 'chat');
    } catch (e) {}
    const cur = await imgGet(id);
    if (cur && cur.state) {
      cur.prompt = prompt;
      cur.pat = Date.now();
      await imgSet(id, cur);
    }
    actEnd('промпт переписан — тапни ↻ на картинке');
    started = false;

  } catch (e) {
    const t = (e && e.message) ? String(e.message).slice(0, 120) : 'сбой';
    elog('переписать промпт · пост ' + id, t);
    if (started) actEnd('переписать промпт не вышло: ' + t);
    toast('IIG: не вышло переписать — ' + t);
  } finally {
    delete S._pwBusy[id];
  }
}

async function cmdFromImage(c) {
  const id = c && c.id;
  if (id == null) return;
  if (c.op === 'stopall') {
    bfStop();
    return stopAll();
  }
  if (c.op === 'regen') {
    const mp = String(c.prompt || '').trim();
    const wish = String(c.wish || '').trim();
    if (wish && !mp) return runFor(id, { force: true, fresh: true, wish: wish });
    return runFor(id, mp ? { force: true, prompt: mp, manual: true } : { force: true });
  }
  if (c.op === 'setprompt') return setPromptFor(id, c.text);
  if (c.op === 'rrsel') return rrSelect(id, parseInt(c.i, 10));
  if (c.op === 'more') return moreFor(id);
  if (c.op === 'rewrite') return rewriteOnly(id);
  if (c.op === 'edit') {
    return editFor(id, c.text, c.mark);
  }
  if (c.op === 'restyle') return restyleFor(id, c.style);
  if (c.op === 'toboard') return toBoardFor(id);
  if (c.op === 'upscale') {
    return upscaleFor(id);
  }
  if (c.op === 'undo') {
    let u = null;
    try {
      u = await sGet(id, 'u', 'iig_undo');
    } catch (e) {}
    if (!u || !u.path) return toast('IIG: возвращать нечего');
    if (u.prompt) {
      try {
        await tavo.set(skey(id, 'p'), u.prompt, 'chat');
        await tavo.set(skey(id, 'nc'), Array.isArray(u.chars) ? u.chars : [], 'chat');
        await tavo.set(skey(id, 'ps'), 0, 'chat');
        await tavo.set(skey(id, 'pf'), 0, 'chat');
      } catch (e) {}
    }
    const cur = await imgGet(id);

    let path = u.path;
    const utk = (cur && cur.tk) || '';

    if (u.prompt && utk) {
      try {
        await tavo.set(skey(id, 'ptk'), utk, 'chat');
      } catch (e) {}
    }
    if (utk) {
      try {
        const bytes = await imgBytes(u.path);
        if (bytes) {
          const p2 = await tavo.file.save(fileNameFor(utk), bytes, { scope: 'chat' });
          if (p2) path = p2;
          try {
            await tavo.file.save(fileNameFor(utk), bytes, { scope: 'global' });
          } catch (e) {}
          if (path !== u.path) {
            try {
              await tavo.file.delete('iig_u' + id + '.png', { scope: 'chat' });
            } catch (e) {}
          }
        }
      } catch (e) {}
    }
    await imgSet(id, {
      state: 'ok',
      key: keyFor(id),
      tk: utk || undefined,
      path: path,
      ar: (cur && cur.ar) || '1:1',
      at: Date.now(),
      prompt: u.prompt || '',
      note: (cur && cur.note) || ''
    });
    try {
      await tavo.unset(skey(id, 'u'), 'chat');
    } catch (e) {}
  }
}

async function cmdFromPanel(c, gate) {
  if (!c || !c.op) return;
  if (c.op === 'rebind') {
    if (!((gate && gate.signed === true) || !cmdLs())) return cmdDrop(c, 'rebind без подписи');
    S._cfgCache = null;
    S._vaultOpenCache = null;
    await resolveCfg();
    return;
  }
  if (c.op === 'vaultinit') {
    if (!((gate && gate.signed === true) || !cmdLs())) return cmdDrop(c, 'vaultinit без подписи');
    await vaultInit();
    S._vaultOpenCache = null;
    S._cfgCache = null;
    await vaultReady(true);
    return;
  }
  if (c.op === 'vaultreset') {
    if (!((gate && gate.signed === true) || !cmdLs())) return cmdDrop(c, 'vaultreset без подписи');
    await vaultReady(true);
    if (vaultState().mode !== 'locked') return cmdDrop(c, 'vaultreset только когда ключ API не найден');
    await vaultReset();
    await vaultReady(true);
    return;
  }
  if (c.op === 'studio') return studioRun(c);
  if (c.op === 'castscan') return castScan(c);
  if (c.op === 'placescan') return placeScan(c);
  if (c.op === 'stup') return stUpscaleRun(c);
  if (c.op === 'stedit') return stEditRun(c);
  if (c.op === 'tensor') return tensorRun(c);
  if (c.op === 'tacost') return taCostRun(c);
  if (c.op === 'diag') return diagRun(c);
  if (c.op === 'stopall') {
    bfStop();
    return stopAll();
  }
  if (c.op === 'genlast') {
    const n = c.n == null ? 1 : c.n;
    if (typeof n !== 'number' || !Number.isInteger(n) || n < 1 || n > GENLAST_MAX) return toast('IIG: genlast — n должно быть целым от 1 до ' + GENLAST_MAX);
    const cnt = await tavo.message.count();
    const from = cnt > n * 3 ? cnt - n * 3 : 0;
    const arr = (await tavo.message.find([from])) || [];
    const pick = [];
    for (let i = arr.length - 1; i >= 0 && pick.length < n; i--) {
      const m = arr[i];
      if (m && m.role === 'assistant' && !m.hidden) pick.push(m);
    }
    for (const m of pick.reverse()) await runFor(m.id, { force: true, range: true });
    return;
  }

  if (c.op === 'genrange') {
    const okN = function (x) { return typeof x === 'number' && Number.isInteger(x) && x >= 1; };
    if (!okN(c.from) || !okN(c.to)) return toast('IIG: догенерация без диапазона «с — по» отклонена');
  }
  if (c.op === 'gen' || c.op === 'genrange') {
    const vis = await visMsgs();
    if (!vis.length) return toast('IIG: в чате нет сообщений');
    const cut = function (x, def) {
      let n = parseInt(x, 10);
      if (!n || n < 1) n = def;
      if (n > vis.length) n = vis.length;
      return n;
    };
    if (c.op === 'gen') {
      const m = vis[cut(c.n, 1) - 1];
      if (!m || m.id == null) return toast('IIG: сообщение не найдено');

      if (m.role !== 'assistant' || m.hidden) return toast('IIG: №' + cut(c.n, 1) + ' — пост юзера; картинки рисуются на посты персонажа');
      return runFor(m.id, { force: true });
    }
    let a = cut(c.from, 1);
    let b = cut(c.to, vis.length);
    if (a > b) {
      const t = a;
      a = b;
      b = t;
    }
    const arr = vis.slice(a - 1, b);
    if (c.op === 'genrange') {

      S._stopReq = null;
      actStart('догенерация ' + a + '-' + b);
      let n = 0;
      try {
        for (const m of arr) {
          if (!m || m.role !== 'assistant' || m.hidden) continue;
          const cur = await imgGet(m.id);
          if (cur && cur.state === 'ok') continue;
          if (await reattach(m)) continue;
          await runFor(m.id, { range: true });
          n++;
          if (S._stopReq) break;
        }
      } catch (e) {}
      actEnd('догенерация ' + a + '-' + b + ': сделано ' + n);
      return;
    }
  }
}

async function dropImage(id) {
  const v = await imgGet(id);
  const had = !!(v && v.state);
  let tk = (v && v.tk) || '';
  if (!tk) {
    const m = await msgById(id);
    if (m) tk = textKey(m.content);
  }
  if (tk) {
    try { await tavo.file.delete(fileNameFor(tk), { scope: 'chat' }); } catch (e) {}
    try { await tavo.file.delete(sideNameFor(tk), { scope: 'chat' }); } catch (e) {}
  }
  await imgClear(id, true);
  try {
    S._vmQ = (S._vmQ || Promise.resolve()).then(async function () {
      const mvm = S._vmMap || (await tavo.get('iig_vm', 'chat'));
      if (mvm && mvm[id]) {
        delete mvm[id];
        S._vmMap = mvm;
        await tavo.set('iig_vm', mvm, 'chat');
      }
    }).catch(function () {});
    await S._vmQ;
  } catch (e) {}
  try {
    await rrDrop(id);
  } catch (e) {}
  for (const suf of ['p', 'ptk', 'pv', 'r', 'u', 'x']) {
    try {
      await tavo.unset(skey(id, suf), 'chat');
    } catch (e) {}
  }
  try {
    await tavo.file.delete('iig_u' + id + '.png', { scope: 'chat' });
  } catch (e) {}
  for (const k of ['iig_p', 'iig_r', 'iig_undo']) {
    try {
      if ((await tavo.get(k, mvar(id))) != null) await tavo.unset(k, mvar(id));
    } catch (e) {}
  }

  try {
    await stripMarkText(id);
  } catch (e) {}
  return had;
}

function cmdRun(pr, what) {
  try {
    Promise.resolve(pr).catch(function (e) {
      const t = (e && e.message) ? String(e.message).slice(0, 120) : 'сбой';
      elog('команда ' + what, t);
      toast('IIG: не вышло — ' + t);
    });
  } catch (e) {}
}

async function cmdPump(light) {
  if (S._muted) return;
  if (S._pumping) return;
  S._pumping = 1;
  try {

    try {
      const q = await tavo.get('iigp_cmdq', 'global');
      if (Array.isArray(q) && q.length) {
        S._evAt = Date.now();
        try {
          await tavo.unset('iigp_cmdq', 'global');
        } catch (e) {}
        if (!S._cmdSeen) S._cmdSeen = {};
        for (const c of q) {
          const cid = c && (c.cid || c.at);
          if (!cid || S._cmdSeen[cid]) continue;
          S._cmdSeen[cid] = 1;
          const why = await cmdGateImg(c);
          if (why) {
            cmdDrop(c, why);
            continue;
          }
          cmdRun(cmdFromImage(c), (c && c.op) || '?');
        }
        const ks = Object.keys(S._cmdSeen);
        for (let i = 0; i < ks.length - 40; i++) delete S._cmdSeen[ks[i]];
      }
    } catch (e) {}
    if (light) return;
    try {
      const c = await tavo.get('iigp_cmd', 'global');
      if (c && c.at && c.at !== S._cmdDone) {
        S._evAt = Date.now();
        S._cmdDone = c.at;
        try {
          await tavo.unset('iigp_cmd', 'global');
        } catch (e) {}
        const why = await cmdGateImg(c);
        if (why) cmdDrop(c, why);
        else cmdRun(cmdFromImage(c), (c && c.op) || '?');
      }
    } catch (e) {}
    try {
      const c2 = await tavo.get('iig_cmd', 'chat');
      if (c2 && c2.id && c2.id !== S._cmdDoneP) {
        S._evAt = Date.now();
        S._cmdDoneP = c2.id;
        const g = cmdGatePanel(c2);
        const why = g.why;
        if (!why) {
          try {
            await tavo.set('iig_cmd_ack', c2.id, 'chat');
          } catch (e) {}
        }
        try {
          const cNow = await tavo.get('iig_cmd', 'chat');
          if (!cNow || cNow.id === c2.id) await tavo.unset('iig_cmd', 'chat');
        } catch (e) {}
        if (!why && c2.op === 'diag' && !g.signed) {
          c2.net = 0;
          c2.skipTiles = 1;
          c2.panel = 0;
        }
        if (why) cmdDrop(c2, why);
        else cmdRun(cmdFromPanel(c2, g), (c2 && c2.op) || '?');
      }
    } catch (e) {}
  } finally {
    S._pumping = 0;
  }
}

async function tickBody() {

  try {
    if (S._mutedByNewer) return;
    if (S._muted) {
      const hb = await tavo.get('iig_hb', 'global');
      if (hb && hb.at && (Date.now() - hb.at) < 30000 && hb.boot !== BOOT_ID) return;
      S._muted = 0;
      S._hbSig = null;
      try {
        await tavo.set('iig_boot', { id: BOOT_ID, at: Date.now(), ver: VER }, 'global');
      } catch (e) {}
    } else {
      const b = await tavo.get('iig_boot', 'global');
      if (b && b.id && b.id !== BOOT_ID) {
        const c = cmpVer(b.ver, VER);
        if (c > 0) {

          S._mutedByNewer = 1;
          S._muted = 1;
          return;
        }
        if (c === 0 && (b.at || 0) > BOOT_AT) {
          S._muted = 1;
          return;
        }

        S._hbSig = null;
        await tavo.set('iig_boot', { id: BOOT_ID, at: BOOT_AT, ver: VER }, 'global');
      } else if (!b || b.id !== BOOT_ID) {
        await tavo.set('iig_boot', { id: BOOT_ID, at: BOOT_AT, ver: VER }, 'global');
      }
    }
  } catch (e) {}
  let cfg = null;
  try {
    cfg = await resolveCfg();
  } catch (e) {
    return;
  }

  try {
    ensureCleanRegex();
  } catch (e) {}
  try {
    if (!S._rxBndAt || Date.now() - S._rxBndAt > 300000) {
      S._rxBndAt = Date.now();
      rxEnsureBound();
    }
  } catch (e) {}
  try {
    wardBindTick();
  } catch (e) {}
  await cmdPump();
  try {
    const nowR = Date.now();
    if (!S._reAt || nowR - S._reAt > (tickActive() ? 60000 : 300000)) {
      S._reAt = nowR;
      await reattachRecent(40);
    }
  } catch (e) {}
  try {
    if (autoMode(cfg) !== 'off') {
      const m = await lastAssistant();

      if (S._seenMaxId == null) S._seenMaxId = m ? m.id : 0;
      if (m) await autoConsider(m);
    }
  } catch (e) {}

  try {
    if (autoMode(cfg) === 'all' && (!S._bfAt || Date.now() - S._bfAt > 90000)) {
      S._bfAt = Date.now();
      backfillAll(cfg);
    }
  } catch (e) {}

  try {
    if (parseInt(cfg && cfg.keepImages, 10) > 0 &&
        (!S._pruneAt || Date.now() - S._pruneAt > 60000)) {
      S._pruneAt = Date.now();
      pruneWindow(cfg);
    }
  } catch (e) {}
  try {
    _gcState();
  } catch (e) {}

  try {
    const hb = {
      at: 0,
      ver: VER,
      boot: BOOT_ID,
      _actBusy: S._actBusy || 0,
      _actText: S._actText || '',
      _actLast: S._actLast || '',
      _actLastAt: S._actLastAt || 0,
      _actLog: (Array.isArray(S._actLog) ? S._actLog : []).slice(-8)
    };
    const sig = JSON.stringify(hb);
    if (sig !== S._hbSig || !S._hbAt || Date.now() - S._hbAt > 12000) {
      hb.at = Date.now();
      await tavo.set('iig_hb', hb, 'global');
      S._hbSig = sig;
      S._hbAt = hb.at;
    }
  } catch (e) {}
}

function tickActive() {
  try {
    if (Object.keys(S._inflight || {}).length) return true;
  } catch (e) {}
  return !!(S._evAt && Date.now() - S._evAt < 60000);
}

async function tick(auto) {
  if (S._ticking) return;
  S._ticking = 1;
  try {
    if (auto && !tickActive() && S._lastFull && Date.now() - S._lastFull < 30000) {

      if (!S._pumpAt || Date.now() - S._pumpAt > 4000) {
        S._pumpAt = Date.now();
        await cmdPump(1);
      }
      return;
    }
    S._lastFull = Date.now();
    await tickBody();
  } catch (e) {} finally {
    S._ticking = 0;
  }
}

function fullMsg(m) {
  if (m && m.content != null) return Promise.resolve(m);
  return Promise.resolve(msgById(m.id)).catch(function () {
    return null;
  });
}

tavo.plugin.on('message:added', function (event) {
  try {
    S._evAt = Date.now();
    const m = event && event.message;
    if (!m || m.id == null) return;
    if (!S._muted) rrCollapseAll(m.id);

    if (m.isUser || m.role === 'user') {
      if (!S._muted) {
        try {
          rxEnsureBound();
        } catch (e0) {}
        try {
          wardBindTick();
        } catch (e0) {}
      }
      return;
    }
    fullMsg(m).then(function (full) {
      if (full) autoConsider(full, { fresh: true });
    }, function () {});
  } catch (e) {}
});

function ringFragments() {
  try {
    if (typeof window !== 'undefined' && typeof localStorage !== 'undefined') {
      localStorage.setItem('iig_rev', String(Date.now()));
    }
  } catch (e) {}
}

tavo.plugin.on('message:updated', function (event) {
  try {

    if (S._muted) return;
    const m = event && event.message;
    if (!m || m.id == null || m.role !== 'assistant' || m.hidden) return;
    if (!S._updT) S._updT = {};
    if (S._updT[m.id]) clearTimeout(S._updT[m.id]);
    S._updT[m.id] = setTimeout(function () {
      delete S._updT[m.id];
      fullMsg(m).then(function (full) {
        if (!full) return;
        reattach(full).then(function (okNow) {
          ringFragments();
          if (okNow) return;
          lastAssistant().then(function (la) {
            if (la && la.id === full.id) autoConsider(full);
          }, function () {});
        }, function () {});
      }, function () {});
    }, 350);
  } catch (e) {}
});

tavo.plugin.on('generation:prepare', function (event) {
  try {
    if (S._muted || !S._rxUnbound) return;
    if (!event || typeof event.text !== 'string') return;
    event.text += '\n\n(system note: comments like <!--iig:xxxx--> in the chat history are technical anchors of an image plugin. Ignore them completely and never write such comments yourself.)';
  } catch (e) {}
});

tavo.plugin.on('message:deleted', function (event) {
  try {
    const m = event && event.message;
    if (m && m.id != null) dropImage(m.id);
  } catch (e) {}
});

tavo.plugin.on('chat:opened', function () {
  try {
    S._evAt = Date.now();
    S._cfgCache = null;
    S._refsCache = null;
    S._gone = null;
    S._goneAt = 0;
    S._seenMaxId = null;
    S._reAt = 0;

    S._names = {};
    S._pass = {};
    S._vmMap = null;
    S._rxBndAt = 0;
    S._wardBndAt = 0;
    S._bfAt = 0;
    S._bfGen = (S._bfGen || 0) + 1;
    S._reSeen = {};
    S._bfSeen = {};
    S._rr = {};
    S._rrIds = null;

    if (S._muted) return;
    rxEnsureBound();
    wardBindTick();

    S._reAt = Date.now();
    reattachRecent(120, 1);
    tick();
  } catch (e) {}
});

setInterval(function () {
  try {
    tick(true);
  } catch (e) {}
}, 4000);

try {
  if (typeof window !== 'undefined' && window.addEventListener) {
    window.addEventListener('storage', function (ev) {
      if (!ev || ev.key !== 'iig_ping') return;
      S._pushOk = 1;
      S._evAt = Date.now();
      try {
        cmdPump();
      } catch (e) {}
    });
    window.addEventListener('iig-cfg', function () {
      S._cfgCache = null;
      S._refsCache = null;
      S._refsKV = null;
    });
    window.addEventListener('iig-map-capabilities', function (ev) {
      if (!S._muted && !S._mutedByNewer && ev && ev.detail) ev.detail.version = 1;
    });
    window.addEventListener('iig-make', function (ev) {
      if (S._muted || S._mutedByNewer) return;
      cmdRun(makeFor(ev && ev.detail), 'make');
    });
    window.addEventListener('iig-seed-get', function (ev) {
      try {
        const d = ev && ev.detail;
        if (!d || !d.name) return;
        d.found = false;
        for (const s of SEEDPACK) {
          if (s[0] !== d.name) continue;
          d.text = decodeURIComponent(escape(atob(s[1])));
          d.found = true;
        }
      } catch (e) {}
    });
    window.addEventListener('iig-ping', function () {
      S._pushOk = 1;
      S._evAt = Date.now();
      try {
        cmdPump();
      } catch (e) {}
    });
  }
} catch (e) {}

try {
  tavo.plugin.on('inputActions:open', function () {
    try { window.dispatchEvent(new CustomEvent('iig-open')); } catch (e) {}
  });
} catch (e) {}

try {
  cmdKey();
} catch (e) {}

var PUMP_BOOT_AT = Date.now();
function pumpLoop() {
  try {
    if (S._pushOk) return;
    S._pumpAt = Date.now();
    const hot = (Date.now() - PUMP_BOOT_AT < 15000) ||
      (S._evAt && Date.now() - S._evAt < 30000);
    cmdPump(hot ? 0 : 1);
    setTimeout(pumpLoop, hot ? 1000 : 2500);
  } catch (e) {
    setTimeout(pumpLoop, 2500);
  }
}
pumpLoop();

setTimeout(function () {
  try {
    tick();
  } catch (e) {}
}, 800);

setTimeout(function () {
  try {
    runSeeder();
  } catch (e) {}
}, 5000);
