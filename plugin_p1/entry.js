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
 * See LICENSE and NOTICE. SPDX-License-Identifier: AGPL-3.0-or-later
 */

var VER = 'p94';
var IMG_VAR = 'iig_img';
var CMD_VAR = 'iigp_cmd';

var S = {};

var BASE_PW = 'YOU ARE AN IMAGE PROMPT WRITER. You receive a roleplay post (and recent context) and write ONE final image generation prompt for its key visual moment. Output ONLY the prompt text: by default one dense English paragraph, 80-130 words. If the style guide below prescribes another format or length - for example comma-separated danbooru tags with a full appearance block per character - FOLLOW THE GUIDE instead: its format and length always win over this default. No preamble, no commentary, no markdown, no quotes or apostrophes anywhere (write possessives without apostrophes: hands of Kira, not Kira\u0027s hands).';

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
        keepImages: 15,
        pwChat: true,
        pwMaxTokens: 3000,
        pwReasoning: 'off',
        pwEndpoint: '',
        pwKey: '',
        pwModel: '',
        pwDepth: 4,
        autoOn: false,
        useCharRef: true,
        useUserRef: true,
        refMaxPx: 768,
        frame: 'soft',
        promptName: ''
      };

var VALID_AR = ['1:1', '2:3', '3:2', '3:4', '4:3', '4:5', '5:4', '9:16', '16:9', '21:9'];
var VALID_SZ = ['1K', '2K', '4K'];

S.LAZY_HYDRATE = false;
S.UNLOAD_DOM = false;
S._acReg = {};
S._actBusy = 0;
S._actLast = '';
S._actLastAt = 0;
S._actText = '';
S._autoBusy = {};
S._autoTimers = {};
S._bakeMiss = {};
S._bakePend = [];
S._bootAt = 0;
S._bootCount = -1;
S._dead = {};
S._full = {};
S._inflight = {};
S._keyMsg = {};
S._lastMut = 0;
S._pendMark = {};
S._pwPending = {};
S._S = null;
S._actH = null;
S._asT = null;
S._avCache = {};
S._bakeFirstAt = null;
S._bakeT = null;
S._bq = null;
S._cfgBootTried = null;
S._cfgCache = {};
S._cfgToasted = null;
S._cmdDone = null;
S._cmdQ = null;
S._dalleRefToasted = null;
S._domDirty = null;
S._editUndo = {};
S._frameBusy = null;
S._frameCss = {};
S._fullOrder = null;
S._io = null;
S._kvN = null;
S._kvQ = null;
S._lastAct = null;
S._lastImgTok = null;
S._lastRefsNote = null;
S._naiRefsOff = null;
S._names = {};
S._ownDirty = null;
S._ownMap = null;
S._pass = {};
S._ppKV = {};
S._pruneAt = null;
S._pruning = null;
S._pwCache = {};
S._pwNoReason = null;
S._pwSrc = null;
S._pwToasted = null;
S._rbmAt = null;
S._refToasted = null;
S._refsCache = {};
S._refsKV = {};
S._sems = null;
S._stopReq = null;
S._textRefs = [];
S._ticking = null;

function rstripSlash(s) {
        s = String(s || '');
        while (s.length && s.charAt(s.length - 1) === '/') s = s.slice(0, -1);
        return s;
      }

function apiPath(base, tail) {
        base = rstripSlash(String(base || ''));
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
        const mt = parseInt(cfg.pwMaxTokens, 10) || 3000;
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
        return {
          cast: {
            char: low.indexOf('char') >= 0,
            user: low.indexOf('user') >= 0
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
        return BASE_PW + (st ? ('\n\nSTYLE AND RENDERING RULES (follow them; the style prefix, style suffix and negative blocks are attached by the extension - do not write them yourself):\n' + st) : '');
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
        const out = {
          char: (pp && nm.char && pp[nm.char]) ? String(pp[nm.char]).trim() : '',
          user: (pp && pp.__user) ? String(pp.__user).trim() : ''
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
          let t = S._textRefs || [];
          if (!t.length) {
            t = [];
            try {
              const slots = await loadRefs();
              for (const s of slots) {
                if (!s || s.enabled === false) continue;
                if (s.dataUrl && s.kind !== 'text') continue;
                const tl = buildTextRefLabel(s.type, s.note, s.target, nm.char, nm.user);
                if (tl) t.push({
                  label: tl
                });
              }
            } catch (e) {}
          }
          for (let i = 0; i < t.length; i++) {
            const l = String(t[i].label || '').trim();
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
        let b = 'CHARACTER NAMES — write them in the prompt EXACTLY as spelled here, character for character:';
        if (c) b += '\n- the character (char): ' + c;
        if (u) b += '\n- the user persona (user): ' + u;
        b += '\nNEVER translate, transliterate, shorten, decline or re-spell these names. NEVER write the user, the char, the character, {{user}} or {{char}} as a substitute — always the exact name above. Every person visible in the image must be named by the exact spelling, because the reference photos are matched to these names.\n';
        return b;
      }

function fixNames(txt, nm) {
        txt = String(txt || '');
        nm = nm || {};
        const c = String(nm.char || '').trim(),
          u = String(nm.user || '').trim();
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
        if (type === 'background') return 'BACKGROUND reference' + n + ': take ONLY the environment/background from this image; IGNORE any people/poses in it; do NOT copy its art style or photographic look.';
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
          background: 'BACKGROUND DESCRIPTION',
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
            if (castNo && !named) continue;
          }
          out.push(r);
        }
        return out;
      }

async function loadRefs() {
        const now = Date.now();
        const rc = S._refsKV;
        if (rc && (now - rc.at) < 45000) return rc.v;
        try {
          const v = await tavo.get('iig_refs', 'global');
          if (Array.isArray(v)) {
            S._refsKV = {
              at: now,
              v: v
            };
            return v;
          }
          return rc ? rc.v : [];
        } catch (e) {
          return rc ? rc.v : [];
        }
      }

async function gatherRefs(cfg) {
        let rev = 0;
        try {
          rev = (await tavo.get('iig_refs_rev', 'global')) || 0;
        } catch (e) {}
        let cid = '';
        try {
          const ch = await tavo.chat.current();
          if (ch && ch.id != null) cid = String(ch.id);
        } catch (e) {}
        const cc = S._refsCache;
        if (cc && cc.chatId === cid && cc.rev === rev && (Date.now() - cc.at) < 60000) {
          S._textRefs = cc.textRefs;
          if (cc.names) S._names = cc.names;
          return cc.data;
        }
        const data = await _gatherRefsRaw(cfg);
        S._refsCache = {
          at: Date.now(),
          chatId: cid,
          rev: rev,
          data: data,
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
        if (pp) {
          if (charName && pp[charName]) passC = String(pp[charName]).trim();
          if (pp.__user) passU = String(pp.__user).trim();
        }
        S._pass = {
          char: passC,
          user: passU
        };
        let imgC = null,
          imgU = null;
        if (pi) {
          if (charName && pi[charName]) imgC = pi[charName];
          if (pi.__user) imgU = pi.__user;
        }
        try {
          const jobs = await Promise.all([(cfg.useCharRef && !imgC && charAvatar) ? _avB64(charAvatar, cfg.refMaxPx) : Promise.resolve(null), (cfg.useUserRef && !imgU && userAvatar) ? _avB64(userAvatar, cfg.refMaxPx) : Promise.resolve(null)]);
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
            if (!s || s.enabled === false) continue;
            if (s.kind === 'text' || (!s.dataUrl && String(s.note || '').trim())) {
              const tl = buildTextRefLabel(s.type, s.note, s.target, charName, userName);
              if (tl) out.push({
                textOnly: true,
                label: tl
              });
            } else if (s.dataUrl) {
              out.push({
                dataUrl: s.dataUrl,
                label: buildRefLabel(s.type, s.note, s.target, charName, userName)
              });
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
        if (out.length > 4) lost.push('фото-рефов ' + out.length + ' — отправлены первые 4, лишние слоты выключи галочкой');
        if (lost.length && !S._refToasted) {
          S._refToasted = 1;
          try {
            tavo.utils.toast('IIG рефы: ' + lost.join('; '));
          } catch (e) {}
        }
        return out.slice(0, 4);
      }

function avatarToB64(url, max) {
        return new Promise((res) => {
          if (!url) return res(null);
          const im = new Image();
          im.crossOrigin = 'anonymous';
          im.onload = () => {
            try {
              let w = im.naturalWidth || im.width,
                h = im.naturalHeight || im.height;
              const sc = Math.min(1, max / Math.max(w, h));
              const cw = Math.max(1, Math.round(w * sc)),
                ch = Math.max(1, Math.round(h * sc));
              const cv = document.createElement('canvas');
              cv.width = cw;
              cv.height = ch;
              cv.getContext('2d').drawImage(im, 0, 0, cw, ch);
              const d = cv.toDataURL('image/jpeg', 0.9);
              res((d.split(',')[1]) || null);
            } catch (e) {
              res(null);
            }
          };
          im.onerror = () => res(null);
          im.src = url;
        });
      }

async function _avB64(url, max) {
        if (!url) return null;
        const key = String(url) + '|' + String(max || '');
        if (!S._avCache) S._avCache = {};
        if (S._avCache[key]) return S._avCache[key];
        let b = await avatarToB64(url, max);
        if (!b) {
          await new Promise(function(r) {
            setTimeout(r, 400);
          });
          b = await avatarToB64(url, max);
        }
        if (b) {
          const ks = Object.keys(S._avCache);
          if (ks.length > 8) delete S._avCache[ks[0]];
          S._avCache[key] = b;
        }
        return b;
      }

function naisteraCanon(m) {
        m = String(m || 'grok').toLowerCase().replace(/\s+/g, '-');
        if (m.indexOf('grok') >= 0) return 'grok';
        if (m.indexOf('nano') >= 0 || m.indexOf('banana') >= 0) return 'nano-banana-2';
        if (m.indexOf('novel') >= 0) return 'novelai';
        return m;
      }

function naisteraRefsOk(m) {
        const c = naisteraCanon(m);
        if (c !== 'grok' && c !== 'nano-banana-2') return false;
        return !S._naiRefsOff;
      }

function naisteraPresetOk(m) {
        const c = naisteraCanon(m);
        return c === 'grok' || c === 'nano-banana-2';
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
        throw new Error('Модель вернула ТЕКСТ вместо картинки (не та модель / отказ?): ' + String(content).replace(/\s+/g, ' ').slice(0, 200));
      }

function isGptImage2(model) {
        return /gpt-image-2/i.test(String(model || ''));
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
          if (!m || !m.content) continue;
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
        const ask = 'IMAGE PROMPT GUIDE:\n' + guide + '\n\n' + namesBlock(_nm) + _apB + (ctx ? (ctx + '\n') : '') + 'THE ROLEPLAY POST TO ILLUSTRATE, paragraphs numbered:\n' + numbered + '\nASPECT RATIO: ' + (cfg.aspectRatio || '1:1') + '\n\nThe context above is BACKGROUND ONLY - use it for outfits, location, time of day and physical state. The scene itself MUST come from THE POST above: depict a concrete moment that actually happens in the post, never a scene from the context and never an invented one. Two tasks: (1) pick the single key visual moment of THIS post and decide after which paragraph the image belongs so it sits where it makes sense in the flow of the text; (2) using the guide, write the FINAL image generation prompt for that moment. Do NOT copy the verbatim blocks from the guide (style prefix, style suffix, negative, reference lock) - the extension attaches them automatically in the right place after your reply; write ONLY the scene itself and never stop mid-sentence. Reply in EXACTLY this format: first line AFTER: <paragraph number>, then from the next line the prompt text itself, one paragraph, no preamble, no commentary, no markdown. Output NOTHING before the AFTER line - no reasoning, no analysis, no thinking out loud. Then the very LAST line of the reply must be: CAST: followed by which of the two protagonists are actually visible in the image - char, user, both as char, user - or none. Side characters and NPCs never count as char or user.';
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
        let raw = await pwGenerate(ask, cfg);
        raw = await retryIfCut(raw, ask, cfg);
        let rep = parseReply(raw);
        if (_wc(rep.txt) < 20) {
          try {
            const mt2 = parseInt(cfg.pwMaxTokens, 10) || 3000;
            const raw2 = await pwGenerate(ask, Object.assign({}, cfg, {
              pwMaxTokens: Math.min(mt2 * 2, 8000)
            }));
            const rep2 = parseReply(raw2);
            if ((rep2.anchor && !rep.anchor && _wc(rep2.txt) >= 20) || _wc(rep2.txt) > _wc(rep.txt)) rep = rep2;
          } catch (e) {
            if (e && e.iigStop) throw e;
          }
        }
        if (_wc(rep.txt) < 20) {
          const fb = paras.join(' ').split(/\s{1,}/).slice(0, 80).join(' ').trim();
          if (_wc(fb) < 8) throw new Error('модель промпта вернула обрывок (' + _wc(rep.txt) + ' слов), а в посте нет текста для запасного промпта — подними «токены ответа и размышления» (вкладка api) или поставь модель промпта без размышлений');
          toast('IIG: модель промпта вернула обрывок (' + _wc(rep.txt) + ' слов) — генерация по тексту поста; чтобы промпты писались полностью, подними «токены ответа и размышления» (вкладка api) или поставь модель без размышлений');
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
        if (txt.length > 4000) txt = txt.slice(0, 4000);
        try {
          txt = enforceStyleTails(txt, await _readPwPrompt(cfg));
        } catch (e) {}
        txt = fixNames(txt, _nm);
        txt = applyLocks(txt, cfg) + castMarker(pc.cast) + arMarker(cfg.aspectRatio || '1:1');
        return {
          after: after,
          prompt: txt
        };
      }

async function genGeminiNative(tag, refs, cfg) {
        const model = cfg.model;
        const url = rstripSlash(String(cfg.endpoint || '').replace(/\/v1beta$/i, '')) + '/v1beta/models/' + model + ':generateContent';
        let ar = tag.aspect_ratio || cfg.aspectRatio || '1:1';
        if (!VALID_AR.includes(ar)) ar = '1:1';
        let sz = tag.image_size || cfg.imageSize || '1K';
        if (!VALID_SZ.includes(sz)) sz = '1K';
        const textPart = (tag.style ? '[Style: ' + tag.style + '] ' : '') + (tag.prompt || '') + dirHint(ar) + antiBleed(refs) + appearanceTail(refs);
        const safety = ['HARM_CATEGORY_HARASSMENT', 'HARM_CATEGORY_HATE_SPEECH', 'HARM_CATEGORY_SEXUALLY_EXPLICIT', 'HARM_CATEGORY_DANGEROUS_CONTENT', 'HARM_CATEGORY_CIVIC_INTEGRITY'].map(function(c) {
          return {
            category: c,
            threshold: 'BLOCK_NONE'
          };
        });
        const buildBody = function(useRefs, omitCfg) {
          const parts = [];
          if (useRefs)
            for (const rf of refs.slice(0, 4)) {
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
          }, 60000, cfg._sig);
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
          useRefs = false;
          r = await post(useRefs, omitCfg);
          img = pickGeminiImage(r);
          if (img) {
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
          if (fr && fr !== 'STOP') throw new Error('Картинки нет, finishReason=' + fr + (txt ? (' · ' + txt.slice(0, 120)) : ''));
          if (txt) throw new Error('Модель вернула ТЕКСТ вместо картинки (не та модель?): ' + txt.slice(0, 180));
          throw new Error('Пустой ответ (finishReason=' + (fr || '?') + ', 0 картинок) — тихая цензура модели или модель без генерации картинок.');
        }
        if (isEmptyEnvelope(r)) throw new Error('Провайдер отклонил запрос до инференса (0 токенов, нет кандидатов) — доступ/тариф/модель на этом провайдере.');
        throw new Error('Нераспознанный ответ: ' + JSON.stringify(r).slice(0, 240));
      }

async function genNaistera(tag, refs, cfg) {
        const base = rstripSlash(cfg.endpoint || 'https://naistera.org');
        const url = /\/api\/generate$/i.test(base) ? base : base + '/api/generate';
        const model = naisteraCanon(tag.model || cfg.naisteraModel || 'grok');
        const ar = tag.aspect_ratio || cfg.aspectRatio || '1:1';
        const stylePfx = tag.style ? '[Style: ' + tag.style + '] ' : '';
        const usedRefs = (refs.length > 0 && naisteraRefsOk(model)) ? refs.slice(0, 4) : [];
        const naiTags = model === 'novelai';
        const tb = textRefsBlock();
        let naiTail = tb + appearanceTail(usedRefs);
        if (usedRefs.length) {
          const ab = antiBleed(usedRefs);
          naiTail = refsSummary(usedRefs) + (tb ? ab.split(tb).join('') : ab) + tb;
        }
        const body = {
          prompt: naiTags ? ((tag.prompt || '') + naiTail) : (refsSummary(usedRefs) + stylePfx + (tag.prompt || '') + antiBleed(usedRefs)),
          aspect_ratio: ar,
          model: model
        };
        const rawPreset = tag.preset || cfg.preset;
        if (rawPreset && rawPreset !== 'none' && naisteraPresetOk(model)) body.preset = rawPreset;
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
          }, 60000, cfg._sig);
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
        throw new Error('Naistera: в ответе нет data_url :: ' + JSON.stringify(result).slice(0, 240));
      }

async function genOpenAIChat(tag, refs, cfg) {
        let base = rstripSlash(cfg.endpoint);
        const url = apiPath(base, '/chat/completions');
        const txt = (tag.style ? '[Style: ' + tag.style + '] ' : '') + (tag.prompt || '') + dirHint(tag.aspect_ratio || cfg.aspectRatio) + antiBleed(refs) + appearanceTail(refs);
        const prompt = 'Generate an image: ' + txt;
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
          }, 60000, cfg._sig);
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

async function genOpenAIImage(tag, refs, cfg) {
        const model = cfg.model || '';
        const mLower = model.toLowerCase();
        const gpt2 = isGptImage2(model);
        const usedRefs = gpt2 ? refs.slice(0, 4) : [];
        if (refs.length && !gpt2 && !S._dalleRefToasted) {
          S._dalleRefToasted = 1;
          try {
            tavo.utils.toast('IIG: модель ' + model + ' не принимает референсы — генерация без них');
          } catch (e) {}
        }
        refs = usedRefs;
        const useEdits = gpt2 && refs.length > 0;
        const base = rstripSlash(cfg.endpoint);
        const url = apiPath(base, useEdits ? '/images/edits' : '/images/generations');
        const ar = tag.aspect_ratio || cfg.aspectRatio || '1:1';
        const szTag = tag.image_size || cfg.imageSize || '1K';
        const AR_TO_SIZE = {
          '1:1': '1024x1024',
          '16:9': '1792x1024',
          '21:9': '1792x1024',
          '3:2': '1536x1024',
          '4:3': '1344x1024',
          '5:4': '1280x1024',
          '9:16': '1024x1792',
          '2:3': '1024x1536',
          '3:4': '1024x1344',
          '4:5': '1024x1280'
        };
        const size = AR_TO_SIZE[ar] || '1024x1024';
        const isDallE3 = /dall-e-3\b/.test(mLower);
        let quality = cfg.quality || 'auto';
        if (isDallE3) quality = (szTag === '1K') ? 'standard' : 'hd';
        else quality = ({
          '1K': 'medium',
          '2K': 'high',
          '4K': 'high'
        })[szTag] || quality;
        if (gpt2) {
          const ok = {
            low: 1,
            medium: 1,
            high: 1,
            auto: 1
          };
          if (!ok[quality]) quality = (quality === 'standard') ? 'medium' : (quality === 'hd' ? 'high' : 'auto');
        }
        const prompt = refsSummary(refs) + (tag.style ? '[Style: ' + tag.style + '] ' : '') + (tag.prompt || '') + dirHint(ar) + antiBleed(refs) + appearanceTail(refs);
        const body = {
          model: model,
          prompt: prompt,
          n: 1,
          size: size
        };
        body.quality = quality;
        if (/dall-e/i.test(mLower)) body.response_format = 'b64_json';
        if (refs.length > 0) {
          const urls = refs.map(function(rf) {
            return rf.dataUrl;
          });
          body.image = urls.length === 1 ? urls[0] : urls;
        }
        const send = function(sz2) {
          const b2 = sz2 ? Object.assign({}, body, {
            size: sz2
          }) : body;
          return fetchT(url, {
            method: 'POST',
            headers: {
              'Authorization': 'Bearer ' + cfg.apiKey,
              'Content-Type': 'application/json'
            },
            body: JSON.stringify(b2)
          }, 60000, cfg._sig);
        };
        let resp = await send();
        if (!resp.ok) {
          const t = await resp.text().catch(function() {
            return '';
          });
          const safe = safeSize(ar);
          if (resp.status === 400 && size !== safe && /size|dimension|width|height|resolution/i.test(t)) {
            resp = await send(safe);
            if (!resp.ok) {
              const t2 = await resp.text().catch(function() {
                return '';
              });
              throw apiErr(resp.status, url, t2, resp);
            }
          } else {
            throw apiErr(resp.status, url, t, resp);
          }
        }
        const d = await resp.json();
        try {
          if (d.usage && d.usage.total_tokens) S._lastImgTok = d.usage.total_tokens;
        } catch (e) {}
        const it = d.data && d.data[0];
        if (it && it.b64_json) return 'data:image/png;base64,' + it.b64_json;
        if (it && it.url) return it.url;
        if (d.url) return d.url;
        throw new Error('Нет картинки в ответе /v1/images: ' + JSON.stringify(d).slice(0, 260));
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
            const gopts = {
              context: false,
              settings: {
                maxCompletionTokens: (parseInt(cfg.pwMaxTokens, 10) || 3000),
                temperature: 0.7
              }
            };
            try {
              r = await _withTimeout(tavo.generate(ask, gopts), 90000, 'модель чата молчит', sig);
            } catch (eo) {
              if (eo && eo.iigStop) throw eo;
              if (/^timeout/.test((eo && eo.message) || '')) throw eo;
              r = await _withTimeout(tavo.generate(ask), 90000, 'модель чата молчит', sig);
            }
          } catch (e) {
            if (e && e.iigStop) throw e;
            throw new Error('модель чата не ответила: ' + ((e && e.message) || e));
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
            max_tokens: (parseInt(cfg.pwMaxTokens, 10) || 3000)
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
          let resp = await sendPw();
          let errText = null;
          if (!resp.ok) {
            errText = await resp.text().catch(function() {
              return '';
            });
            if (resp.status === 400 && bb.reasoning_effort && /reasoning/i.test(errText)) {
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
                  maxOutputTokens: (parseInt(cfg.pwMaxTokens, 10) || 3000)
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
          const mm = d.choices && d.choices[0] && d.choices[0].message;
          if (mm && typeof mm.content === 'string') txt = mm.content;
          else if (mm && Array.isArray(mm.content)) {
            for (const p of mm.content) {
              if (p && p.text) txt += p.text;
            }
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
        return fetch(url, opts).then(function(r) {
          done();
          return r;
        }, function(e) {
          done();
          if (e && e.name === 'AbortError') {
            if (sig && sig.aborted) throw stopErr();
            throw new Error('timeout ' + ms + 'ms @ ' + url);
          }
          throw e;
        });
      }

function wrap(img) {
        let w = img.parentElement;
        if (w && w.classList && w.classList.contains('iig-wrap')) return w;
        w = document.createElement('div');
        w.className = 'iig-wrap';
        const host = _blockHost(img);
        if (host) host.parentNode.insertBefore(w, host.nextSibling);
        else if (img.parentNode) img.parentNode.insertBefore(w, img);
        w.appendChild(img);
        return w;
      }

function sizeBox(w, ratio) {
        w.style.cssText = 'position:relative;display:block;width:100%;max-width:512px;margin:10px auto 2px;aspect-ratio:' + ratio + ';overflow:hidden;';
      }

function imgCss(ratio, gen) {
        return 'display:block;width:100%;height:100%;object-fit:cover;aspect-ratio:' + (ratio || '1 / 1') + ';' + (gen ? 'background:repeating-linear-gradient(45deg,#1d1f24,#1d1f24 12px,#262a31 12px,#262a31 24px);' : '');
      }

function _blockHost(img) {
        try {
          let n = img.parentElement,
            host = null,
            guard = 0;
          while (n && guard < 6) {
            guard++;
            if (!n.tagName) break;
            if (n.classList && n.classList.contains('iig-wrap')) break;
            if (!INLINE_HOST[n.tagName]) break;
            host = n;
            n = n.parentElement;
          }
          return (host && host.parentNode) ? host : null;
        } catch (e) {
          return null;
        }
      }

function ensureBaseStyle() {
        const docs = [document];
        try {
          const t = window.top;
          if (t && t.document && t.document !== document) docs.push(t.document);
        } catch (e) {}
        for (const d of docs) {
          try {
            if (d.getElementById('iig-engine-style')) continue;
            const s = d.createElement('style');
            s.id = 'iig-engine-style';
            s.textContent = '.iig-wrap{border-radius:14px}';
            (d.head || d.documentElement).appendChild(s);
          } catch (e) {}
        }
      }

async function ensureFrameStyle(cfg) {
        try {
          const f = String((cfg && cfg.frame) || 'soft');
          const docs = [document];
          try {
            const t = window.top;
            if (t && t.document && t.document !== document) docs.push(t.document);
          } catch (e) {}
          let missing = false;
          for (const d of docs) {
            if (!d.getElementById('iig-frame-style')) missing = true;
          }
          const cc = S._frameCss;
          if (!missing && cc && cc.f === f) return;
          let css = (cc && cc.f === f) ? cc.css : null;
          if (css == null) {
            let stored = null;
            try {
              stored = await tavo.get('iig_frame_css', 'global');
            } catch (e) {}
            if (typeof stored === 'string' && stored) css = stored;
            else if (f === 'flat') css = '.iig-wrap{border-radius:0!important}';
            else if (f === 'soft') css = '.iig-wrap{border-radius:14px!important}';
            else return;
            S._frameCss = {
              f: f,
              css: css
            };
          }
          for (const d of docs) {
            try {
              let s = d.getElementById('iig-frame-style');
              if (!s) {
                s = d.createElement('style');
                s.id = 'iig-frame-style';
                (d.head || d.documentElement).appendChild(s);
              }
              if (s.textContent !== css) s.textContent = css;
            } catch (e) {}
          }
        } catch (e) {}
      }

function stub(img, w, tag, message) {
        cleanupErr(w);
        const oldAll = w.querySelectorAll('.iig-ov');
        for (const o of oldAll) o.remove();
        const rat = arToRatio(tag && tag.aspect_ratio);
        sizeBox(w, rat);
        img.removeAttribute('src');
        img.style.cssText = imgCss(rat, true);
        const ov = document.createElement('div');
        ov.className = 'iig-ov';
        ov.style.cssText = 'position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:8px;cursor:pointer;text-align:center;padding:12px;';
        const b = document.createElement('button');
        b.title = 'создать';
        b.style.cssText = 'border:none;background:transparent;padding:0;cursor:pointer;line-height:0;';
        b.appendChild(regenIcon());
        const t = document.createElement('div');
        t.textContent = message || 'тапни чтобы создать';
        t.style.cssText = 'color:#c9ced6;font:10px/1.4 Courier Prime,monospace;max-width:92%;text-shadow:0 1px 4px rgba(0,0,0,.8);';
        ov.appendChild(b);
        ov.appendChild(t);
        ov.onclick = function() {
          run(img, {
            force: true
          });
        };
        w.appendChild(ov);
      }

function show(img, src, tag) {
        const w = wrap(img);
        cleanupErr(w);
        const rat = arToRatio(tag && tag.aspect_ratio);
        sizeBox(w, rat);
        img.onerror = function() {
          img.onerror = null;
          err(img, 'Картинка не загрузилась — проверь токен/endpoint');
        };
        img.style.cssText = imgCss(rat, false);
        try {
          img.loading = 'lazy';
          img.decoding = 'async';
        } catch (e) {}
        img.src = src;
        try {
          const fk = img._iigKey;
          img._iigFull = (fk && S._full[fk]) || src;
        } catch (e) {}
        decorate(img, w, tag);
        _ioWatch(img);
      }

function decorate(img, w, tag) {
        const olds = w.querySelectorAll('.iig-ov');
        for (const o of olds) o.remove();
        const hide = function() {
          const a = w.querySelectorAll('.iig-ov');
          for (const o of a) o.style.display = 'none';
        };
        const dl = document.createElement('div');
        dl.className = 'iig-ov';
        dl.style.cssText = 'position:absolute;top:6px;left:8px;display:none;';
        const db = document.createElement('button');
        db.title = 'скачать';
        db.style.cssText = 'border:none;background:transparent;padding:2px 4px;cursor:pointer;line-height:0;';
        db.appendChild(dlIcon());
        db.onclick = function(e) {
          if (e) e.stopPropagation();
          hide();
          download(img._iigFull || img.currentSrc || img.src);
        };
        dl.appendChild(db);
        w.appendChild(dl);
        const pr = document.createElement('div');
        pr.className = 'iig-ov';
        pr.style.cssText = 'position:absolute;top:6px;left:44px;display:none;';
        const pb = document.createElement('button');
        pb.title = 'промпт';
        pb.style.cssText = 'border:none;background:transparent;padding:2px 4px;cursor:pointer;line-height:0;';
        pb.appendChild(promptIcon());
        pb.onclick = function(e) {
          if (e) e.stopPropagation();
          hide();
          showPrompt(img, tag);
        };
        pr.appendChild(pb);
        w.appendChild(pr);
        const fx = document.createElement('div');
        fx.className = 'iig-ov';
        fx.style.cssText = 'position:absolute;top:6px;left:80px;display:none;';
        const fb = document.createElement('button');
        fb.title = 'доработать';
        fb.style.cssText = 'border:none;background:transparent;padding:2px 4px;cursor:pointer;line-height:0;';
        fb.appendChild(editIcon());
        fb.onclick = function(e) {
          if (e) e.stopPropagation();
          hide();
          showEdit(img, tag);
        };
        fx.appendChild(fb);
        w.appendChild(fx);
        const rg = document.createElement('div');
        rg.className = 'iig-ov';
        rg.style.cssText = 'position:absolute;top:6px;right:8px;display:none;';
        const rb = document.createElement('button');
        rb.title = 'перегенерировать';
        rb.style.cssText = 'border:none;background:transparent;padding:2px 4px;cursor:pointer;line-height:0;';
        rb.appendChild(regenIcon());
        rb.onclick = function(e) {
          if (e) e.stopPropagation();
          hide();
          run(img, {
            force: true
          });
        };
        rg.appendChild(rb);
        w.appendChild(rg);
        const capTxt = (tag && tag.cap) ? String(tag.cap).trim() : ((tag && tag.aspect_ratio) ? String(tag.aspect_ratio) : '');
        if (capTxt) {
          const cp = document.createElement('div');
          cp.className = 'iig-ov';
          cp.style.cssText = 'position:absolute;left:0;right:0;bottom:6px;display:none;text-align:center;pointer-events:none;';
          const ct = document.createElement('span');
          ct.textContent = capTxt;
          ct.style.cssText = 'display:inline-block;max-width:92%;padding:3px 10px;border-radius:999px;background:rgba(15,17,20,.55);color:#e6e8ec;font:10px/1.4 Courier Prime,monospace;letter-spacing:.04em;box-sizing:border-box;';
          cp.appendChild(ct);
          w.appendChild(cp);
        }
        w.onclick = function() {
          const a = w.querySelectorAll('.iig-ov');
          const v = (a[0] && a[0].style.display === 'block') ? 'none' : 'block';
          for (const o of a) o.style.display = v;
        };
      }

async function showPrompt(img, tag) {
        const key = img._iigKey || img.getAttribute('data-iig-key') || '';
        let p = '';
        if (key) {
          try {
            p = String((await tavo.get(key + '_p', 'chat')) || '');
          } catch (e) {}
        }
        if (!p && tag && tag.prompt) p = String(tag.prompt);
        p = parseMarkers(p).prompt;
        let light = false;
        try {
          light = (await tavo.get('iig_theme', 'global')) === 'light';
        } catch (e) {}
        let TD = document;
        try {
          const t = window.top || window;
          if (t.document) TD = t.document;
        } catch (e) {}
        const old = TD.getElementById('iig-prompt-modal');
        if (old) old.remove();
        const C = light ? {
          mask: 'rgba(150,160,175,.45)',
          card: 'linear-gradient(180deg,#f2f4f7,#e9ecf0)',
          bord: 'rgba(88,98,115,.28)',
          text: '#20242a',
          lbl: '#586273',
          inBg: '#ffffff',
          inBord: 'rgba(88,98,115,.35)',
          btnBg: 'linear-gradient(180deg,#67728a,#4e586b)',
          btnTx: '#eef0f3',
          btn3: '#586273',
          btn3b: 'rgba(88,98,115,.4)',
          shadow: '0 24px 70px rgba(96,106,128,.35)'
        } : {
          mask: 'rgba(10,12,15,.66)',
          card: 'linear-gradient(180deg,#23262c 0%,#1a1c20 100%)',
          bord: 'rgba(154,163,173,.18)',
          text: '#e6e8ec',
          lbl: '#9aa3ad',
          inBg: 'rgba(0,0,0,.25)',
          inBord: 'rgba(154,163,173,.35)',
          btnBg: 'linear-gradient(180deg,#aab3be,#8f99a5)',
          btnTx: '#171a1e',
          btn3: '#9aa3ad',
          btn3b: 'rgba(154,163,173,.5)',
          shadow: '0 24px 70px rgba(0,0,0,.55)'
        };
        const F = 'Courier Prime,monospace';
        const ov = TD.createElement('div');
        ov.id = 'iig-prompt-modal';
        ov.style.cssText = 'position:fixed;inset:0;z-index:2147483647;display:flex;align-items:center;justify-content:center;background:' + C.mask + ';backdrop-filter:blur(9px);-webkit-backdrop-filter:blur(9px);padding:14px;box-sizing:border-box;';
        const card = TD.createElement('div');
        card.style.cssText = 'max-width:416px;width:100%;max-height:84vh;display:flex;flex-direction:column;padding:24px 18px 18px;border-radius:22px;background:' + C.card + ';border:1px solid ' + C.bord + ';box-shadow:' + C.shadow + ';box-sizing:border-box;font-family:' + F + ';';
        const title = TD.createElement('div');
        title.textContent = 'Промпт';
        title.style.cssText = 'font:700 13px ' + F + ';letter-spacing:.42em;text-transform:uppercase;text-align:center;color:' + C.text + ';margin:0 0 4px .42em;';
        const lbl = TD.createElement('div');
        lbl.textContent = key ? ('картинка · ' + key.replace(/^iig_/, '')) : 'картинка';
        lbl.style.cssText = 'font:700 8px ' + F + ';letter-spacing:.22em;text-transform:uppercase;text-align:center;color:' + C.lbl + ';margin:0 0 4px;';
        const rline = TD.createElement('div');
        rline.textContent = '';
        rline.style.cssText = 'font:10px/1.4 ' + F + ';text-align:center;color:' + C.lbl + ';margin:0 0 10px;word-break:break-word;';
        if (key) {
          (async function() {
            try {
              const rn = await tavo.get(key + '_r', 'chat');
              rline.textContent = rn ? String(rn) : 'референсы: данные появятся после генерации (или картинка из старой версии)';
            } catch (e) {}
          })();
        }
        const ta = TD.createElement('textarea');
        ta.readOnly = true;
        ta.value = p || 'промпт не сохранён (картинка из старой версии или ещё не создана) — тапни переписать';
        ta.style.cssText = 'width:100%;min-height:170px;flex:1;resize:none;padding:12px;border-radius:12px;border:1px solid ' + C.inBord + ';background:' + C.inBg + ';color:' + C.text + ';font:11px/1.6 ' + F + ';box-sizing:border-box;white-space:pre-wrap;overflow:auto;outline:none;-webkit-tap-highlight-color:transparent;';
        const row = TD.createElement('div');
        row.style.cssText = 'display:flex;gap:8px;margin-top:14px;';
        const mkMain = function(txt) {
          const b = TD.createElement('button');
          b.textContent = txt;
          b.style.cssText = 'flex:1;padding:13px 6px;border:1px solid ' + C.bord + ';border-radius:12px;background:' + C.btnBg + ';color:' + C.btnTx + ';font:700 11px ' + F + ';letter-spacing:.2em;text-transform:uppercase;cursor:pointer;-webkit-tap-highlight-color:transparent;outline:none;';
          return b;
        };
        const mkGhost = function(txt) {
          const b = TD.createElement('button');
          b.textContent = txt;
          b.style.cssText = 'flex:1;padding:13px 6px;border:1px solid ' + C.btn3b + ';border-radius:12px;background:transparent;color:' + C.btn3 + ';font:11px ' + F + ';letter-spacing:.2em;text-transform:uppercase;cursor:pointer;-webkit-tap-highlight-color:transparent;outline:none;';
          return b;
        };
        const bCopy = mkMain('копировать');
        const bRw = mkGhost('переписать');
        const bX = mkGhost('закрыть');
        bRw.title = 'заново написать промпт (картинка не трогается)';
        bCopy.onclick = async function() {
          const ok = await copyText(ta.value || '');
          try {
            tavo.utils.toast(ok ? 'промпт скопирован' : 'не вышло — выдели и скопируй вручную');
          } catch (e) {}
          if (!ok) {
            try {
              ta.readOnly = false;
              ta.focus();
              ta.select();
              ta.readOnly = true;
            } catch (e) {}
          }
        };
        bRw.onclick = async function() {
          if (bRw._busy) return;
          bRw._busy = 1;
          const was = bRw.textContent;
          bRw.textContent = 'запись…';
          try {
            const cfg2 = await resolveCfg();
            const instr2 = (img.getAttribute('data-iig-instruction') || '').trim();
            const tag2 = parseInstr(instr2) || {};
            if (tag && tag.aspect_ratio && !tag2.aspect_ratio) tag2.aspect_ratio = tag.aspect_ratio;
            let post2 = '';
            if (key) {
              try {
                post2 = await findPostByKey(key);
              } catch (e) {}
            }
            const np2 = await rewritePrompt(tag2, cfg2, post2 || null);
            const fin = applyLocks(np2, cfg2);
            if (key) {
              try {
                await tavo.set(key + '_p', fin, 'chat');
              } catch (e) {}
            }
            ta.value = parseMarkers(fin).prompt;
            try {
              tavo.utils.toast('промпт переписан — тапни ↻ на картинке, чтобы перегенерировать по нему');
            } catch (e) {}
          } catch (e) {
            try {
              tavo.utils.toast('не вышло переписать: ' + ((e && e.message) || e));
            } catch (x) {}
          }
          bRw.textContent = was;
          bRw._busy = 0;
        };
        bX.onclick = function() {
          ov.remove();
        };
        ov.addEventListener('click', function(e) {
          if (e.target === ov) ov.remove();
        });
        row.appendChild(bCopy);
        row.appendChild(bRw);
        row.appendChild(bX);
        card.appendChild(title);
        card.appendChild(lbl);
        card.appendChild(rline);
        card.appendChild(ta);
        card.appendChild(row);
        ov.appendChild(card);
        (TD.body || TD.documentElement).appendChild(ov);
      }

async function showEdit(img, tag) {
        const key = img._iigKey || img.getAttribute('data-iig-key') || '';
        if (!key) return toast('IIG: у картинки нет ключа — перегенерируй её сначала');
        let light = false;
        try {
          light = (await tavo.get('iig_theme', 'global')) === 'light';
        } catch (e) {}
        let TD = document;
        try {
          const t = window.top || window;
          if (t.document) TD = t.document;
        } catch (e) {}
        const old = TD.getElementById('iig-edit-modal');
        if (old) old.remove();
        const C = light ? {
          mask: 'rgba(150,160,175,.45)',
          card: 'linear-gradient(180deg,#f2f4f7,#e9ecf0)',
          bord: 'rgba(88,98,115,.28)',
          text: '#20242a',
          lbl: '#586273',
          inBg: '#ffffff',
          inBord: 'rgba(88,98,115,.35)',
          btnBg: 'linear-gradient(180deg,#67728a,#4e586b)',
          btnTx: '#eef0f3',
          btn3: '#586273',
          btn3b: 'rgba(88,98,115,.4)',
          shadow: '0 24px 70px rgba(96,106,128,.35)'
        } : {
          mask: 'rgba(10,12,15,.66)',
          card: 'linear-gradient(180deg,#23262c 0%,#1a1c20 100%)',
          bord: 'rgba(154,163,173,.18)',
          text: '#e6e8ec',
          lbl: '#9aa3ad',
          inBg: 'rgba(0,0,0,.25)',
          inBord: 'rgba(154,163,173,.35)',
          btnBg: 'linear-gradient(180deg,#aab3be,#8f99a5)',
          btnTx: '#171a1e',
          btn3: '#9aa3ad',
          btn3b: 'rgba(154,163,173,.5)',
          shadow: '0 24px 70px rgba(0,0,0,.55)'
        };
        const F = 'Courier Prime,monospace';
        const ov = TD.createElement('div');
        ov.id = 'iig-edit-modal';
        ov.style.cssText = 'position:fixed;inset:0;z-index:2147483647;display:flex;align-items:center;justify-content:center;background:' + C.mask + ';backdrop-filter:blur(9px);-webkit-backdrop-filter:blur(9px);padding:14px;box-sizing:border-box;';
        const card = TD.createElement('div');
        card.style.cssText = 'max-width:416px;width:100%;display:flex;flex-direction:column;padding:24px 18px 18px;border-radius:22px;background:' + C.card + ';border:1px solid ' + C.bord + ';box-shadow:' + C.shadow + ';box-sizing:border-box;font-family:' + F + ';';
        const title = TD.createElement('div');
        title.textContent = 'Доработка';
        title.style.cssText = 'font:700 13px ' + F + ';letter-spacing:.42em;text-transform:uppercase;text-align:center;color:' + C.text + ';margin:0 0 4px .42em;';
        const lbl = TD.createElement('div');
        lbl.textContent = 'картинка · ' + key.replace(/^iig_/, '');
        lbl.style.cssText = 'font:700 8px ' + F + ';letter-spacing:.22em;text-transform:uppercase;text-align:center;color:' + C.lbl + ';margin:0 0 14px;';
        const ta = TD.createElement('textarea');
        ta.placeholder = 'что исправить: например, перерисуй левую руку, пальцев должно быть пять';
        ta.style.cssText = 'width:100%;min-height:110px;resize:none;padding:12px;border-radius:12px;border:1px solid ' + C.inBord + ';background:' + C.inBg + ';color:' + C.text + ';font:12px/1.6 ' + F + ';box-sizing:border-box;outline:none;-webkit-tap-highlight-color:transparent;';
        const row = TD.createElement('div');
        row.style.cssText = 'display:flex;gap:8px;margin-top:14px;';
        const mkB = function(txt, main) {
          const b = TD.createElement('button');
          b.textContent = txt;
          b.style.cssText = 'flex:1;padding:13px 6px;border:1px solid ' + (main ? C.bord : C.btn3b) + ';border-radius:12px;background:' + (main ? C.btnBg : 'transparent') + ';color:' + (main ? C.btnTx : C.btn3) + ';font:' + (main ? '700 ' : '') + '11px ' + F + ';letter-spacing:.2em;text-transform:uppercase;cursor:pointer;-webkit-tap-highlight-color:transparent;outline:none;';
          return b;
        };
        const bGo = mkB('доработать', true);
        const bUndo = mkB('вернуть', false);
        const bX = mkB('закрыть', false);
        if (!(S._editUndo && S._editUndo[key])) bUndo.style.opacity = '.4';
        bGo.onclick = async function() {
          if (bGo._busy) return;
          const instr = (ta.value || '').trim();
          if (instr.length < 3) {
            toast('IIG: опиши, что исправить');
            return;
          }
          bGo._busy = 1;
          bGo.textContent = 'дорабатываю…';
          try {
            const cfg = await resolveCfg();
            let src = S._full[key] || null;
            if (!src) {
              try {
                src = await tavo.get(key, 'chat');
              } catch (e) {}
            }
            if (!src) throw new Error('исходник не найден — перегенерируй картинку');
            const etag = {
              prompt: 'Edit the provided source image. ' + instr + '. Apply ONLY this fix. Keep the composition, characters, art style, colors and everything else of the source image exactly the same.',
              aspect_ratio: (tag && tag.aspect_ratio) || cfg.aspectRatio || '1:1'
            };
            const refs = [{
              dataUrl: src,
              label: 'the EXACT source image to edit - apply only the requested fix, keep everything else identical'
            }];
            const ekey = key + '_fx';
            let eac = null;
            try {
              eac = new AbortController();
            } catch (e) {}
            if (eac) S._acReg[ekey] = eac;
            const ecfg = Object.assign({}, cfg, {
              maxRetries: 1,
              _deadline: Date.now() + 300000
            });
            if (eac) ecfg._sig = eac.signal;
            let out;
            try {
              out = await withRetry(function() {
                return generate(etag, refs, ecfg);
              }, ecfg);
              if (/^https?:/i.test(out)) {
                const d2 = await urlToDataUrl(out, ecfg._sig);
                if (!d2) throw new Error('картинка пришла ссылкой и не скачалась — попробуй ещё раз');
                out = d2;
              }
            } finally {
              delete S._acReg[ekey];
              delete S._dead[ekey];
            }
            S._editUndo = {};
            S._editUndo[key] = src;
            _fullPut(key, out);
            let small = out;
            try {
              const sh = await shrinkDataUrl(out, 1024, 0.82);
              if (sh && sh.length < out.length) small = sh;
            } catch (e) {}
            try {
              await tavo.set(key, small, 'chat');
            } catch (e) {}
            if (img.isConnected !== false) show(img, small, tag || {});
            try {
              _statAdd({
                imgs: 1,
                imgTok: S._lastImgTok || 0
              });
              S._lastImgTok = 0;
            } catch (e) {}
            ov.remove();
            toast('IIG: доработано — вернуть прежнюю можно из этого же меню');
          } catch (e) {
            toast('IIG: не вышло — ' + ((e && e.message) || e));
            bGo.textContent = 'доработать';
            bGo._busy = 0;
          }
        };
        bUndo.onclick = async function() {
          const prev = S._editUndo && S._editUndo[key];
          if (!prev) return;
          delete S._editUndo[key];
          let small = prev;
          try {
            const sh = await shrinkDataUrl(prev, 1024, 0.82);
            if (sh && sh.length < prev.length) small = sh;
          } catch (e) {}
          try {
            await tavo.set(key, small, 'chat');
          } catch (e) {}
          _fullPut(key, prev);
          if (img.isConnected !== false) show(img, small, tag || {});
          ov.remove();
          toast('IIG: вернула прежнюю версию');
        };
        bX.onclick = function() {
          ov.remove();
        };
        ov.addEventListener('click', function(e) {
          if (e.target === ov) ov.remove();
        });
        row.appendChild(bGo);
        row.appendChild(bUndo);
        row.appendChild(bX);
        card.appendChild(title);
        card.appendChild(lbl);
        card.appendChild(ta);
        card.appendChild(row);
        ov.appendChild(card);
        (TD.body || TD.documentElement).appendChild(ov);
      }

async function copyText(t) {
        let ok = false;
        try {
          if (navigator.clipboard && navigator.clipboard.writeText) {
            await navigator.clipboard.writeText(t);
            ok = true;
          }
        } catch (e) {}
        if (!ok) {
          try {
            const ta = document.createElement('textarea');
            ta.value = t;
            ta.style.cssText = 'position:fixed;left:-9999px;top:0;';
            document.body.appendChild(ta);
            ta.focus();
            ta.select();
            ok = document.execCommand('copy');
            ta.remove();
          } catch (e) {}
        }
        return ok;
      }

async function download(src) {
        if (!src) return;
        try {
          let blob;
          if (/^data:/i.test(src)) {
            blob = dataURLtoBlob(src);
          } else {
            const r = await fetchT(src, {}, 30000);
            blob = await r.blob();
          }
          let file = null;
          try {
            file = new File([blob], 'iig_image.png', {
              type: (blob && blob.type) || 'image/png'
            });
          } catch (e) {}
          if (file && navigator.canShare && navigator.canShare({
              files: [file]
            })) {
            try {
              await navigator.share({
                files: [file]
              });
              return;
            } catch (e) {
              if (e && e.name === 'AbortError') return;
            }
          }
          const url = URL.createObjectURL(blob);
          const isMobile = /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent) || ('ontouchstart' in window);
          if (isMobile) {
            const opened = window.open(url, '_blank');
            try {
              tavo.utils.toast(opened ? 'Зажми картинку и сохрани в галерею' : 'Не удалось открыть — проверь блокировку всплывающих окон');
            } catch (e) {}
          } else {
            const a = document.createElement('a');
            a.href = url;
            a.download = 'iig_image.png';
            document.body.appendChild(a);
            a.click();
            a.remove();
          }
          setTimeout(function() {
            URL.revokeObjectURL(url);
          }, 15000);
        } catch (e) {
          try {
            window.open(src, '_blank');
          } catch (x) {}
        }
      }

function dlIcon() {
        const o = _svgIcon();
        o.s.appendChild(o.mk('path', Object.assign({
          d: 'M12 4 L12 14'
        }, o.st)));
        o.s.appendChild(o.mk('path', Object.assign({
          d: 'M8 11 L12 15 L16 11'
        }, o.st)));
        o.s.appendChild(o.mk('path', Object.assign({
          d: 'M5 19 L19 19'
        }, o.st)));
        return o.s;
      }

function regenIcon() {
        const o = _svgIcon();
        o.s.appendChild(o.mk('polyline', Object.assign({
          points: '21 4 21 9 16 9'
        }, o.st)));
        o.s.appendChild(o.mk('path', Object.assign({
          d: 'M19 14 A8 8 0 1 1 17.3 6.1 L21 9'
        }, o.st)));
        return o.s;
      }

function editIcon() {
        const o = _svgIcon();
        o.s.appendChild(o.mk('path', Object.assign({
          d: 'M5 19 L8.5 18 L19 7.5 A1.8 1.8 0 0 0 16.5 5 L6 15.5 Z'
        }, o.st)));
        o.s.appendChild(o.mk('path', Object.assign({
          d: 'M14.5 7 L17 9.5'
        }, o.st)));
        return o.s;
      }

function stopIcon() {
        const o = _svgIcon();
        const st2 = Object.assign({}, o.st, {
          'stroke-width': '3'
        });
        o.s.appendChild(o.mk('path', Object.assign({
          d: 'M9 5 L9 19'
        }, st2)));
        o.s.appendChild(o.mk('path', Object.assign({
          d: 'M15 5 L15 19'
        }, st2)));
        return o.s;
      }

function promptIcon() {
        const o = _svgIcon();
        o.s.appendChild(o.mk('path', Object.assign({
          d: 'M7 3.5 L17 3.5 L17 20.5 L7 20.5 Z'
        }, o.st)));
        o.s.appendChild(o.mk('path', Object.assign({
          d: 'M9.6 8.5 L14.4 8.5'
        }, o.st)));
        o.s.appendChild(o.mk('path', Object.assign({
          d: 'M9.6 12 L14.4 12'
        }, o.st)));
        o.s.appendChild(o.mk('path', Object.assign({
          d: 'M9.6 15.5 L12.6 15.5'
        }, o.st)));
        return o.s;
      }

function _svgIcon() {
        const NS = 'http://www.w3.org/2000/svg';
        const mk = function(tag, attrs) {
          const e = document.createElementNS(NS, tag);
          for (const k in attrs) e.setAttribute(k, attrs[k]);
          return e;
        };
        const s = mk('svg', {
          viewBox: '0 0 24 24',
          width: '24',
          height: '24',
          fill: 'none'
        });
        s.style.filter = 'drop-shadow(0 1px 4px rgba(0,0,0,.85))';
        return {
          s: s,
          mk: mk,
          st: {
            stroke: '#e6e8ec',
            'stroke-width': '2',
            'stroke-linecap': 'round',
            'stroke-linejoin': 'round'
          }
        };
      }

function parseInstr(raw) {
        raw = (raw || '').trim();
        if (raw.charAt(0) === '{') {
          try {
            return JSON.parse(raw);
          } catch (e) {}
        }
        const o = {};
        const pm = raw.match(/(?:^|\|)\s{0,}prompt\s{0,}:\s{0,}([\s\S]{0,})$/i);
        if (pm) o.prompt = pm[1].trim();
        const head = pm ? raw.slice(0, pm.index) : raw;
        for (const s of head.split('|')) {
          const m = s.match(/^\s{0,}([a-zA-Z_]+)\s{0,}:\s{0,}([\s\S]{0,}?)\s{0,}$/);
          if (!m) continue;
          const k = m[1].toLowerCase(),
            v = m[2].trim();
          if (k === 'ar' || k === 'aspect' || k === 'aspect_ratio') o.aspect_ratio = v;
          else if (k === 'res' || k === 'resolution' || k === 'size' || k === 'image_size') o.image_size = v;
          else if (k === 'style') o.style = v;
          else if (k === 'model') o.model = v;
          else if (k === 'cap' || k === 'caption') o.cap = v;
        }
        return o;
      }

function arToRatio(ar) {
        const m = String(ar || '1:1').match(/^(\d+)\s{0,}:\s{0,}(\d+)$/);
        return m ? (m[1] + ' / ' + m[2]) : '1 / 1';
      }

function cleanupErr(anchor) {
        let n = anchor.nextElementSibling;
        while (n && n.classList && n.classList.contains('iig-err')) {
          const r = n;
          n = n.nextElementSibling;
          r.remove();
        }
      }

function _fullPut(key, src) {
        S._full[key] = src;
        if (!S._fullOrder) S._fullOrder = [];
        const q = S._fullOrder;
        const i = q.indexOf(key);
        if (i >= 0) q.splice(i, 1);
        q.push(key);
        while (q.length > 2) {
          const old = q.shift();
          if (old !== key) delete S._full[old];
        }
      }

function shrinkDataUrl(d, max, q) {
        return new Promise(function(res) {
          try {
            const im = new Image();
            im.onload = function() {
              try {
                let w = im.naturalWidth || im.width,
                  h = im.naturalHeight || im.height;
                const sc = Math.min(1, max / Math.max(w, h));
                const cw = Math.max(1, Math.round(w * sc)),
                  ch = Math.max(1, Math.round(h * sc));
                const cv = document.createElement('canvas');
                cv.width = cw;
                cv.height = ch;
                cv.getContext('2d').drawImage(im, 0, 0, cw, ch);
                res(cv.toDataURL('image/jpeg', q || 0.85));
              } catch (e) {
                res(null);
              }
            };
            im.onerror = function() {
              res(null);
            };
            im.src = d;
          } catch (e) {
            res(null);
          }
        });
      }

function renderBareMarks() {
        try {
          const now = Date.now();

          const boot = S._bootAt && (now - S._bootAt < 5000);
          if (!boot) {
            if (S._rbmAt && now - S._rbmAt < 3000) return;
            if (S._rbmAt && !S._domDirty) return;
            if (S._lastMut && now - S._lastMut < 2500) return;
          }
          S._domDirty = 0;
          S._rbmAt = now;
          const root = document.body;
          if (!root || !document.createTreeWalker) return;
          const skip = {
            SCRIPT: 1,
            STYLE: 1,
            TEXTAREA: 1,
            NOSCRIPT: 1
          };
          const tw = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, null);
          const hits = [];
          let n;
          while ((n = tw.nextNode())) {
            const v = n.nodeValue;
            if (!v || v.indexOf('[IMG:') < 0) continue;
            const p = n.parentElement;
            if (!p || skip[p.tagName]) continue;
            if (p.closest && p.closest('script,style,textarea,#iig-set-root,#iig-prompt-modal')) continue;
            hits.push(n);
          }
          for (const node of hits) {
            let cur = node,
              guard2 = 0;
            while (cur && guard2 < 8) {
              guard2++;
              const v = cur.nodeValue;
              const m = v ? v.match(/\[IMG:(GEN|OK|FAIL):([a-z0-9_]{1,39})\]|\[IMG:GEN\]/) : null;
              if (!m) break;
              const img = document.createElement('img');
              img.setAttribute('data-iig-state', m[1] || 'GEN');
              if (m[2]) img.setAttribute('data-iig-key', m[2]);
              img.setAttribute('data-iig-pending', '1');
              img.style.cssText = 'display:none;';
              const after = cur.splitText(m.index);
              after.nodeValue = after.nodeValue.slice(m[0].length);
              cur.parentNode.insertBefore(img, after);
              cur = after;
            }
          }
        } catch (e) {}
      }

function sweep() {
        renderBareMarks();
        adoptLegacyTags();
        if (!document.getElementById('iig-frame-style') && !S._frameBusy) {
          S._frameBusy = 1;
          resolveCfg().then(function(c) {
            return ensureFrameStyle(c);
          }, function() {}).then(function() {
            S._frameBusy = 0;
          }, function() {
            S._frameBusy = 0;
          });
        }
        const imgs = document.querySelectorAll('img[data-iig-pending="1"]:not([data-iig-done="1"])');
        for (const img of imgs) {
          const st0 = (img.getAttribute('data-iig-state') || '').trim();
          const in0 = (img.getAttribute('data-iig-instruction') || '').trim();
          if ((st0 || in0) && !img._iigHot && !_near(img)) continue;
          process(img);
        }
        const done = document.querySelectorAll('img[data-iig-pending="1"][data-iig-done="1"]');
        for (const img of done) {
          if (img._iigKey || img._iigAdopt) continue;
          const st = (img.getAttribute('data-iig-state') || '').trim();
          const instr = (img.getAttribute('data-iig-instruction') || '').trim();
          if (!st && !instr) continue;
          img._iigAdopt = 1;
          img.dataset.iigDone = '';
          process(img);
        }
      }

function _freshMark(recs) {
        let hot = false;
        const fresh = !!(S._bootAt && (Date.now() - S._bootAt) > 2500);
        try {
          if (!recs || !recs.length) return false;
          for (let i = 0; i < recs.length; i++) {
            const ns = recs[i].addedNodes;
            if (!ns || !ns.length) continue;
            for (let j = 0; j < ns.length; j++) {
              const n = ns[j];
              if (!n || n.nodeType !== 1) continue;
              if (n.tagName === 'IMG' && n.getAttribute && n.getAttribute('data-iig-pending') === '1' && n.getAttribute('data-iig-done') !== '1') {
                const st = (n.getAttribute('data-iig-state') || '').trim();
                if (st) {
                  if (fresh) n._iigHot = 1;
                  hot = true;
                }
              }
              if (n.querySelectorAll) {
                if (n.querySelectorAll) {
                  const inner = n.querySelectorAll('img[data-iig-pending="1"]:not([data-iig-done="1"])');
                  for (let q = 0; q < inner.length; q++) {
                    if (fresh) inner[q]._iigHot = 1;
                    hot = true;
                  }
                }
              }
            }
          }
        } catch (e) {}
        return hot;
      }

async function _domQuiet(ms, cap) {
        const need = ms || 200;
        const lim = cap || 3000;
        try {
          if (!S._lastMut) return;
          const start = Date.now();
          while ((Date.now() - S._lastMut) < need && (Date.now() - start) < lim) {
            await new Promise(function(r) {
              setTimeout(r, 60);
            });
          }
        } catch (e) {}
      }

async function prune(cfg) {
        const keep = parseInt(cfg.keepImages, 10);
        if (!keep || keep < 1 || S._pruning) return;
        S._pruning = 1;
        try {
          const total = await tavo.message.count();
          if (total > keep) {
            const live = {},
              dead = {};
            let fav = {};
            try {
              fav = (await tavo.get('iig_fav', 'chat')) || {};
            } catch (e) {}
            const addEff = (m, out) => {
              if (!m || m.id == null || !m.content) return;
              const reK = /\[IMG:(?:GEN|OK|FAIL):([a-z0-9_]{1,39})\]/g;
              let mk;
              while ((mk = reK.exec(m.content))) {
                if (mk[1].indexOf('iig_') !== 0) out[mk[1] + '__' + hash(String(m.id))] = 1;
              }
            };
            const fresh = await tavo.message.find([total - keep]);
            for (const m of fresh) {
              collectAllImgKeys(m && m.content, live);
              addEff(m, live);
              if (m && m.id != null && m.content && m.content.indexOf('[IMG:GEN]') >= 0) live['iig_b' + hash(String(m.id))] = 1;
            }
            const old = await tavo.message.find([0, total - keep - 1]);
            for (const m of old) {
              collectAllImgKeys(m && m.content, dead);
              addEff(m, dead);
              if (m && m.id != null && m.content && m.content.indexOf('[IMG:GEN]') >= 0) dead['iig_b' + hash(String(m.id))] = 1;
            }
            const gone = {};
            for (const k in dead) {
              if (!live[k] && !fav[k]) {
                try {
                  await tavo.unset(k, 'chat');
                } catch (e) {}
                try {
                  await tavo.unset(k + '_p', 'chat');
                } catch (e) {}
                try {
                  await tavo.unset(k + '_r', 'chat');
                } catch (e) {}
                try {
                  await tavo.unset(k + '_m', 'chat');
                } catch (e) {}
                _ownerDrop(k);
                delete S._full[k];
                delete S._dead[k];
                delete S._bakeMiss[k];
                gone[k] = 1;
              }
            }
            await _pruneStrip(old, fav, gone);
            await _ownerFlush();
          }
        } catch (e) {}
        S._pruning = 0;
      }

async function _visMsgs() {
        const msgs = await tavo.message.find([0]);
        const out = [];
        for (const m of msgs) {
          if (m && !m.hidden) out.push(m);
        }
        return out;
      }

function actStart(t) {
        S._actBusy = (S._actBusy || 0) + 1;
        if (t) S._actText = t;
      }

async function process(img) {
        if (img.dataset.iigDone === '1') return;
        img.dataset.iigDone = '1';
        const instr = (img.getAttribute('data-iig-instruction') || '').trim();
        const state = (img.getAttribute('data-iig-state') || '').trim();
        if (!instr && !state) return autoSlot(img);
        return run(img, {});
      }

function _near(img) {
        if (!S.LAZY_HYDRATE) return true;
        try {
          let host = img;
          if (img.parentElement && img.parentElement.getBoundingClientRect) host = img.parentElement;
          if (!host.getBoundingClientRect) return true;
          const r = host.getBoundingClientRect();
          if (!r) return true;
          if (!r.height && !r.width && !r.top && !r.bottom) return true;
          const vh = window.innerHeight || (document.documentElement && document.documentElement.clientHeight) || 800;
          const marg = 1200;
          return r.top < vh + marg && r.bottom > -marg;
        } catch (e) {
          return true;
        }
      }

function adoptLegacyTags() {
        try {
          const legacy = document.querySelectorAll('img[data-iig-instruction]:not([data-iig-pending])');
          for (const img of legacy) {
            if (img.dataset && img.dataset.iigDone === '1') continue;
            const src = img.getAttribute('src') || '';
            const m = src.match(/^\[IMG:(GEN|OK|FAIL)(?::([a-z0-9_]{1,39}))?\]$/);
            if (!m) continue;
            img.removeAttribute('src');
            img.setAttribute('data-iig-state', m[1]);
            if (m[2]) img.setAttribute('data-iig-key', m[2]);
            img.setAttribute('data-iig-pending', '1');
            img.style.cssText = 'display:none;';
          }
        } catch (e) {}
      }

async function _tick() {
        if (S._ticking) return;
        S._ticking = 1;
        try {
          await _tickBody();
        } catch (e) {} finally {
          S._ticking = 0;
        }
      }

async function execCmd(c, cfg) {
        const op = c && c.op;
        if (op === 'stopall') return stopAll();
        if (op === 'gen') return cmdGen(parseInt(c.n, 10), cfg);
        if (op === 'genlast') {
          cmdGenLast(parseInt(c.n, 10), cfg);
          return;
        }
        if (op === 'genrange') {
          cmdGenRange(parseInt(c.from, 10), parseInt(c.to, 10), cfg);
          return;
        }
        if (op === 'clean') return cmdClean(parseInt(c.from, 10), parseInt(c.to, 10), !!c.marks);
      }

async function cmdGen(n, cfg) {
        try {
          if (!n || n < 1) return toast('IIG: некорректный номер сообщения');
          const vis = await _visMsgs();
          if (n > vis.length) return toast('IIG: в чате только ' + vis.length + ' видимых сообщений');
          const m = vis[n - 1];
          if (!m || m.id == null) return toast('IIG: сообщение ' + n + ' не найдено');
          if (!(m.content || '').trim()) return toast('IIG: сообщение ' + n + ' пустое');
          if ((m.content || '').indexOf('[IMG:') >= 0) return toast('IIG: в сообщении ' + n + ' уже есть метка картинки — если самой картинки не видно, тапни ↻ на её плашке или вычисти метки чисткой');
          toast('IIG: подготовка промпта для сообщения ' + n + '…');
          actStart('картинка в сообщении ' + n + ': подготовка промпта');
          try {
            await _slotNow(m, cfg, 'iig_m');
          } finally {
            actEnd('картинка в сообщении ' + n + ': промпт готов, генерация');
          }
        } catch (e) {
          toast('IIG: не вышло — ' + ((e && e.message) || e));
        }
      }

async function cmdGenLast(n, cfg) {
        try {
          if (!n || n < 1) return toast('IIG: впиши, на скольких последних сообщениях догенерить');
          const vis = await _visMsgs();
          if (!vis.length) return toast('IIG: в чате нет сообщений');
          const msgs = vis.slice(Math.max(0, vis.length - n));
          const started = Date.now();
          actStart('догенерация на последних ' + n);
          let planned = 0,
            stopped = false;
          try {
            for (const m of msgs) {
              if (S._stopReq && S._stopReq >= started) {
                stopped = true;
                break;
              }
              if (!m || m.id == null || !(m.content || '').trim()) continue;
              if ((m.content || '').indexOf('[IMG:') >= 0) continue;
              if (m.role === 'user') continue;
              if (S._autoBusy[m.id]) continue;
              planned++;
              S._actText = 'догенерация: подготовка промпта, картинка ' + planned;
              try {
                await _slotNow(m, cfg, 'iig_a');
              } catch (e) {}
              await new Promise(function(r) {
                setTimeout(r, 400);
              });
            }
          } finally {
            actEnd(stopped ? 'догенерация остановлена (выполнено: ' + planned + ')' : (planned ? ('догенерация запущена: картинок ' + planned) : 'догенерация: всё уже с картинками'));
          }
          toast(planned ? ('IIG: догенерирую картинок: ' + planned) : ('IIG: в последних ' + n + ' сообщениях картинки уже есть'));
        } catch (e) {
          toast('IIG: не вышло — ' + ((e && e.message) || e));
        }
      }

async function cmdGenRange(a, b, cfg) {
        try {
          const vis = await _visMsgs();
          const total = vis.length;
          if (!total) return toast('IIG: в чате нет сообщений');
          if (!a || a < 1) a = 1;
          if (!b || b > total) b = total;
          if (a > b) {
            const t2 = a;
            a = b;
            b = t2;
          }
          const started = Date.now();
          actStart('догенерация с ' + a + ' по ' + b);
          const depth = parseInt(cfg.pwDepth, 10) || 4;
          let planned = 0,
            stopped = false;
          try {
            for (let gi = a - 1; gi < b; gi++) {
              const m = vis[gi];
              if (S._stopReq && S._stopReq >= started) {
                stopped = true;
                break;
              }
              if (!m || m.id == null || !(m.content || '').trim()) continue;
              if (m.role === 'user') continue;
              if ((m.content || '').indexOf('[IMG:') >= 0) continue;
              if (S._autoBusy[m.id]) continue;
              planned++;
              S._actText = 'догенерация: подготовка промпта, картинка ' + planned;
              const gcfg = Object.assign({}, cfg, {
                _ctx: _ctxFromMsgs(vis.slice(Math.max(0, gi - depth), gi))
              });
              try {
                await _slotNow(m, gcfg, 'iig_m');
              } catch (e) {}
              await new Promise(function(r) {
                setTimeout(r, 400);
              });
            }
          } finally {
            actEnd(stopped ? 'догенерация остановлена (выполнено: ' + planned + ')' : (planned ? ('догенерация запущена: картинок ' + planned) : 'догенерация: всё уже с картинками'));
          }
          toast(planned ? ('IIG: догенерирую картинок: ' + planned) : ('IIG: в сообщениях ' + a + '-' + b + ' картинки уже есть'));
        } catch (e) {
          toast('IIG: не вышло — ' + ((e && e.message) || e));
        }
      }

async function cmdClean(a, b, marks) {
        try {
          const vis = await _visMsgs();
          const total = vis.length;
          if (!total) return toast('IIG: в чате нет сообщений');
          if (!a || a < 1) a = 1;
          if (!b || b > total) b = total;
          if (a > b) {
            const t2 = a;
            a = b;
            b = t2;
          }
          const msgs = vis.slice(a - 1, b);
          let fav = {};
          try {
            fav = (await tavo.get('iig_fav', 'chat')) || {};
          } catch (e) {}
          const started = Date.now();
          actStart('чистка сообщений ' + a + '-' + b);
          let nk = 0,
            nm = 0,
            stopped = false;
          for (const m of msgs) {
            if (S._stopReq && S._stopReq >= started) {
              stopped = true;
              break;
            }
            if (!m || !m.content) continue;
            const keys = {};
            collectAllImgKeys(m.content, keys);
            for (const k in keys) {
              if (fav[k]) continue;
              try {
                await tavo.unset(k, 'chat');
              } catch (e) {}
              try {
                await tavo.unset(k + '_p', 'chat');
              } catch (e) {}
              try {
                await tavo.unset(k + '_r', 'chat');
              } catch (e) {}
              try {
                await tavo.unset(k + '_m', 'chat');
              } catch (e) {}
              _ownerDrop(k);
              delete S._full[k];
              _domUnloadKey(k);
              nk++;
            }
            if (marks && m.content.indexOf('[IMG:') >= 0) {
              const nc = stripMarks(m.content, fav);
              if (nc !== m.content && nc.trim()) {
                const ok = await updSafe(m, nc, m.content);
                if (ok != null) {
                  nm++;
                  await _noautoMark(m.id, nc);
                }
                await new Promise(function(r) {
                  setTimeout(r, 300);
                });
              }
            }
          }
          actEnd(stopped ? ('чистка остановлена (кэш: ' + nk + ', меток: ' + nm + ')') : ('чистка готова: кэш ' + nk + ', меток ' + nm));
          toast('IIG: чистка готова — из кэша удалено: ' + nk + (marks ? (', меток из текста: ' + nm) : ''));
        } catch (e) {
          actEnd('чистка не удалась');
          toast('IIG: чистка не удалась — ' + ((e && e.message) || e));
        }
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

function _actWire() {
        if (S._actH) return;
        S._lastAct = 0;
        S._actH = function() {
          S._lastAct = Date.now();
        };
        try {
          document.addEventListener('touchstart', S._actH, {
            capture: true,
            passive: true
          });
          document.addEventListener('touchmove', S._actH, {
            capture: true,
            passive: true
          });
          document.addEventListener('pointerdown', S._actH, {
            capture: true,
            passive: true
          });
          document.addEventListener('wheel', S._actH, {
            capture: true,
            passive: true
          });
          document.addEventListener('keydown', S._actH, {
            capture: true,
            passive: true
          });
        } catch (e) {}
      }

function bakeState(img, marker, key) {
        if (key && S._dead[key]) return;
        S._bakePend.push({
          img: img,
          marker: marker,
          key: key
        });
        if (!S._bakeFirstAt) S._bakeFirstAt = Date.now();
        _bakeArm();
      }

async function _keyedResolve(img, rawKey) {
        try {
          const needle = ':' + rawKey + ']';
          const hit = function(x) {
            return !!(x && x.content && x.content.indexOf(needle) >= 0);
          };
          const cand = [];
          let freshFrom = -1;
          try {
            const total = await tavo.message.count();
            const from = Math.max(0, total - 200);
            const msgs = await tavo.message.find([from]);
            if (S._bootCount >= 0) freshFrom = S._bootCount;
            for (let i = 0; i < msgs.length; i++) {
              const x = msgs[i];
              if (hit(x) && x.id != null) {
                if (freshFrom >= 0 && from + i >= freshFrom) x._iigFresh = 1;
                cand.push(x);
              }
            }
          } catch (e1) {}
          const tail = function(x) {
            if (!hit(x) || x.id == null) return;
            for (const c of cand) {
              if (String(c.id) === String(x.id)) return;
            }
            if (freshFrom >= 0) x._iigFresh = 1;
            cand.push(x);
          };
          try {
            const arr = await tavo.message.find(-1);
            tail(arr && arr[0]);
          } catch (e0) {}
          try {
            tail(await tavo.message.current());
          } catch (ec) {}
          if (!cand.length) return null;
          let m = null;
          if (cand.length === 1) m = cand[0];
          else {
            if (img) m = _bareMatchDom(img, cand);
            if (!m) m = cand[cand.length - 1];
          }
          const effTry = rawKey + '__' + hash(String(m.id));
          let effHas = null;
          try {
            effHas = await tavo.get(effTry, 'chat');
          } catch (e3) {}
          if (effHas) {
            S._keyMsg[effTry] = m.id;
            return {
              eff: effTry,
              id: m.id
            };
          }
          const owner = await _keyOwner(rawKey);
          const mine = owner != null && String(owner) === String(m.id);
          let alien = false;
          if (owner != null) alien = !mine;
          else if (cand.length > 1) alien = String(m.id) !== String(cand[0].id);
          else if (m._iigFresh) {
            let used = null;
            try {
              used = await tavo.get(rawKey, 'chat');
            } catch (e2) {}
            alien = !!used;
          }
          if (!alien) {
            if (owner == null) {
              const base = (cand.length > 1) ? cand[0] : m;
              S._keyMsg[rawKey] = base.id;
              if (String(base.id) === String(m.id)) await _keyOwnerSet(rawKey, base.id);
            }
            return null;
          }
          const eff = rawKey + '__' + hash(String(m.id));
          S._keyMsg[eff] = m.id;
          _keymapSave(eff, m.id);
          _keyOwnerSet(eff, m.id);
          return {
            eff: eff,
            id: m.id
          };
        } catch (e) {
          return null;
        }
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

async function run(img, opts) {
        try {

          return await _run(img, opts || {});
        } catch (e) {
          try {
            err(img, (e && e.message) ? e.message : String(e));
          } catch (x) {}
        }
      }

async function findPostByKey(key) {
        try {
          let m = null;
          const pend = key ? S._pendMark[key] : null;
          if (pend) {
            try {
              m = await tavo.message.get(pend.id);
            } catch (e) {}
          }
          if (!m) {
            m = await _findMsgByKey(key);
            if (!m || !m.content) return '';
            const okNeedle = String(m.content).indexOf(':' + key + ']') >= 0;
            const okBare = key.indexOf('iig_b') === 0 && String(m.content).indexOf('[IMG:GEN]') >= 0;
            const ddP = key.lastIndexOf('__');
            const okEff = ddP > 0 && String(m.content).indexOf(':' + key.slice(0, ddP) + ']') >= 0;
            if (!okNeedle && !okBare && !okEff) return '';
          }
          if (!m || !m.content) return '';
          let t = String(m.content);
          t = t.replace(/<[^>]{0,}>/g, ' ');
          t = t.replace(/\[IMG:[A-Z]{1,}[^\]]{0,}\]/g, ' ');
          t = t.replace(/\[scene image\]/gi, ' ');
          t = t.replace(/\s{1,}/g, ' ').trim();
          return t.slice(0, 4000);
        } catch (e) {
          return '';
        }
      }

async function rewritePrompt(tag, cfg, postText) {
        const guide = await pwGuide(cfg);
        const ctx = await chatContext(parseInt(cfg.pwDepth, 10) || 4);
        const sceneLine = postText ? ('THE ROLEPLAY POST TO ILLUSTRATE (pick its key visual moment):\n' + postText) : ('SCENE TO ILLUSTRATE (short note from the roleplay model): ' + (((tag.prompt || '').trim()) || ('illustrate the current moment of the LATEST message in the context above' + (tag.cap ? ('; in frame: ' + tag.cap) : ''))));
        const _nmR = await castNames();
        const _apBR = await appearanceBlock(_nmR);
        const ask = 'IMAGE PROMPT GUIDE:\n' + guide + '\n\n' + namesBlock(_nmR) + _apBR + (ctx ? (ctx + '\n') : '') + sceneLine + '\nASPECT RATIO: ' + (tag.aspect_ratio || '1:1') + '\n\nUsing the guide and the context above, write the FINAL image generation prompt for this scene. Do NOT copy the verbatim blocks from the guide (style prefix, style suffix, negative, reference lock) - the extension attaches them automatically in the right place after your reply; write ONLY the scene itself and never stop mid-sentence. Reply starting with the line PROMPT: followed by the prompt text itself, one paragraph, no commentary, no markdown. Output NOTHING before the PROMPT line - no reasoning, no analysis, no thinking out loud. Then the very LAST line of the reply must be: CAST: followed by which of the two protagonists are actually visible in the image - char, user, both as char, user - or none. Side characters and NPCs never count as char or user.';
        let txt = await pwGenerate(ask, cfg);
        txt = await retryIfCut(txt, ask, cfg);
        txt = _cutToPromptAnchor(txt);
        let pc = parseCast(String(txt || '').trim());
        txt = pc.txt.replace(/\s{1,}/g, ' ').trim();
        if (_wc(txt) < 20) {
          try {
            const mtR = parseInt(cfg.pwMaxTokens, 10) || 3000;
            const rawR = await pwGenerate(ask, Object.assign({}, cfg, {
              pwMaxTokens: Math.min(mtR * 2, 8000)
            }));
            const pcR = parseCast(_cutToPromptAnchor(String(rawR || '').trim()));
            const txtR = pcR.txt.replace(/\s{1,}/g, ' ').trim();
            if (_wc(txtR) > _wc(txt)) {
              txt = txtR;
              pc = pcR;
            }
          } catch (e) {
            if (e && e.iigStop) throw e;
          }
        }
        if (_wc(txt) < 20) {
          const fbSrc = String(postText || tag.prompt || '').replace(/<[^>]{0,}>/g, ' ').replace(/\s{1,}/g, ' ').trim();
          const fb = fbSrc.split(/\s{1,}/).slice(0, 80).join(' ').trim();
          if (_wc(fb) < 8) throw new Error('модель промпта вернула обрывок (' + _wc(txt) + ' слов) — размышления съедают лимит; подними «токены ответа и размышления» (вкладка api) или поставь модель промпта без размышлений');
          toast('IIG: модель промпта вернула обрывок (' + _wc(txt) + ' слов) — генерация по тексту сцены; чтобы промпты писались полностью, подними «токены ответа и размышления» (вкладка api) или поставь модель без размышлений');
          txt = fb;
          pc = {
            cast: null,
            txt: fb
          };
        }
        if (txt.length > 4000) txt = txt.slice(0, 4000);
        try {
          txt = enforceStyleTails(txt, await _readPwPrompt(cfg));
        } catch (e) {}
        txt = fixNames(txt, _nmR);
        return txt + castMarker(pc.cast) + arMarker(tag.aspect_ratio || '1:1');
      }

function _ioWatch(img) {
        if (!S.UNLOAD_DOM) return;
        _ioSetup();
        if (!S._io) return;
        if (img._iigObs) return;
        img._iigObs = 1;
        try {
          S._io.observe(img);
        } catch (e) {}
      }

function toast(t) {
        try {
          tavo.utils.toast(t);
        } catch (e) {}
      }

function safeSize(ar) {
        const o = orient(ar);
        return o === 'wide landscape' ? '1792x1024' : (o === 'tall vertical portrait' ? '1024x1792' : '1024x1024');
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
        if (!c) c = window.IIG_CFG;
        if (!c && cc) {
          cc.at = now - 4000;
          return cc.v;
        }
        const out = Object.assign({}, DEFAULTS, c || {});
        const mig = parseInt(out.pwMaxTokens, 10);
        if (mig === 450 || mig === 1000) out.pwMaxTokens = 3000;
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

function err(img, msg, noToast) {
        const w = wrap(img);
        cleanupErr(w);
        const ovAll = w.querySelectorAll('.iig-ov');
        for (const o of ovAll) o.remove();
        w.onclick = null;
        w.style.cssText = 'position:relative;display:block;width:100%;max-width:480px;margin:10px auto 2px;';
        img.removeAttribute('src');
        img.style.cssText = 'display:none;';
        const box = document.createElement('div');
        box.className = 'iig-err';
        box.style.cssText = 'max-width:480px;margin:0 auto;padding:14px 16px;border-radius:14px;background:rgba(26,28,32,.96);border:1px solid rgba(154,163,173,.3);color:#e6e8ec;font:11px/1.5 Courier Prime,monospace;white-space:pre-wrap;word-break:break-word;text-align:center;box-sizing:border-box;';
        const t = document.createElement('div');
        t.textContent = '⚠ ' + (msg || 'error');
        t.style.cssText = 'color:#c9ced6;letter-spacing:.04em;';
        box.appendChild(t);
        const btn = document.createElement('button');
        btn.textContent = 'перегенерировать';
        btn.style.cssText = 'margin:11px auto 0;padding:8px 16px;border-radius:10px;border:1px solid rgba(154,163,173,.4);background:transparent;color:#9aa3ad;cursor:pointer;font:10px Courier Prime,monospace;letter-spacing:.16em;text-transform:uppercase;display:block;';
        btn.onclick = function() {
          run(img, {
            force: true
          });
        };
        box.appendChild(btn);
        w.insertAdjacentElement('afterend', box);
        try {
          console.error('[IIG] ' + (msg || ''));
        } catch (e) {}
        if (!noToast) {
          try {
            tavo.utils.toast('IIG: ' + (msg || ''));
          } catch (e) {}
        }
      }

function dataURLtoBlob(d) {
        const parts = String(d).split(',');
        const m = (parts[0].match(/data:([^;]+)/) || [])[1] || 'image/png';
        const bin = atob(parts[1] || '');
        const u = new Uint8Array(bin.length);
        for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i);
        return new Blob([u], {
          type: m
        });
      }

function collectAllImgKeys(content, out) {
        content = String(content || '');
        const re = /\[IMG:(?:GEN|OK|FAIL):([a-z0-9_]{1,39})\]/g;
        let m;
        while ((m = re.exec(content))) out[m[1]] = 1;
      }

async function _pruneStrip(old, fav, gone) {
        const quiet = !S._lastAct || (Date.now() - S._lastAct > 1500);
        if (!quiet) return;
        let budget = 3;
        for (const m of old) {
          if (budget <= 0) return;
          if (!m || m.id == null || !m.content || m.content.indexOf('[IMG:') < 0) continue;
          const keys = {};
          collectAllImgKeys(m.content, keys);
          let any = false;
          for (const k in keys) {
            if (gone[k]) any = true;
          }
          if (!any && m.content.indexOf('[IMG:GEN]') < 0) continue;
          const nc = stripMarks(m.content, fav);
          if (nc === m.content || !nc.trim()) continue;
          budget--;
          try {
            const okp = await updSafe(m, nc, m.content);
            if (okp != null) actNote('авточистка: удалены метки старой картинки');
          } catch (e) {}
          await new Promise(function(r) {
            setTimeout(r, 250);
          });
        }
      }

function hash(s) {
        let h = _seed() | 0;
        s = s || '';
        for (let i = 0; i < s.length; i++) {
          h = ((h << 5) - h + s.charCodeAt(i)) | 0;
        }
        return (h >>> 0).toString(36);
      }

async function _ownerFlush() {
        if (!S._ownDirty || !S._ownMap) return;
        S._ownDirty = 0;
        try {
          await tavo.set('iig_owners', S._ownMap, 'chat');
        } catch (e) {}
      }

function _ownerDrop(key) {
        try {
          if (S._ownMap && S._ownMap[key] != null) {
            delete S._ownMap[key];
            S._ownDirty = 1;
          }
        } catch (e) {}
      }

function autoSlot(img) {
        try {
          img.remove();
        } catch (e) {}
        try {
          clearTimeout(S._asT);
        } catch (e) {}
        S._asT = setTimeout(function() {
          _autoSlotRun();
        }, 300);
      }

async function _tickBody() {
        let cfg = null;
        try {
          cfg = await resolveCfg();
        } catch (e) {
          return;
        }
        try {
          if (S._cmdDone === undefined) {
            let ack = null;
            try {
              ack = await tavo.get('iig_cmd_ack', 'chat');
            } catch (e) {}
            S._cmdDone = ack || 0;
          }
          const c = await tavo.get('iig_cmd', 'chat');
          if (c && c.id && c.id !== S._cmdDone) {
            S._cmdDone = c.id;
            try {
              await tavo.set('iig_cmd_ack', c.id, 'chat');
            } catch (e) {}
            try {
              await tavo.unset('iig_cmd', 'chat');
            } catch (e) {}
            if (c.op === 'stopall') {
              await execCmd(c, cfg);
            } else {
              S._cmdQ = (S._cmdQ || Promise.resolve()).then(function() {
                return execCmd(c, cfg);
              }).then(function() {}, function() {});
            }
          }
        } catch (e) {}
        try {} catch (e) {}
        try {
          if (S._bootCount < 0) S._bootCount = await tavo.message.count();
        } catch (e) {}
        try {
          sweep();
        } catch (e) {}
        try {
          const nowp = Date.now();
          if (!S._pruneAt || nowp - S._pruneAt > 120000) {
            S._pruneAt = nowp;
            await prune(cfg);
          }
        } catch (e) {}
        try {
          _gcState();
        } catch (e) {}
        try {
          await ensureFrameStyle(cfg);
        } catch (e) {}
      }

async function _slotNow(m, cfg, prefix) {
        const snap = m.content;
        const uid = prefix + hash(String(m.id) + '|' + String(snap || '').slice(0, 500));
        let ac = null;
        try {
          ac = new AbortController();
        } catch (e) {}
        if (ac) S._acReg[uid] = ac;
        const scfg = Object.assign({}, cfg, {
          maxRetries: 1
        });
        if (ac) scfg._sig = ac.signal;
        const drop = function() {
          try {
            delete S._acReg[uid];
          } catch (e) {}
        };
        const pwork = withRetry(function() {
          return composeAuto(snap, scfg);
        }, scfg).then(async function(r) {
          try {
            await tavo.set(uid + '_p', r.prompt, 'chat');
          } catch (e) {}
          return r;
        });
        S._pwPending[uid] = pwork.then(function(r) {
          return r.prompt;
        });
        S._pwPending[uid].catch(function() {});
        pwork.catch(function(e) {
          if (e && e.iigStop) return;
          toast('IIG: модель промпта не ответила (' + ((e && e.message) || e) + ') — промпт напишется при генерации');
        });
        const m3 = await tavo.message.get(m.id);
        if (!m3 || m3.content !== snap) {
          delete S._pwPending[uid];
          return drop();
        }
        if ((m3.content || '').indexOf('[IMG:') >= 0) {
          delete S._pwPending[uid];
          return drop();
        }
        const marked = String(snap).replace(/\s{1,}$/, '') + '\n\n[IMG:GEN:' + uid + ']';
        const okw = await updSafe(m3, marked, snap);
        if (okw == null) {
          delete S._pwPending[uid];
          return drop();
        }
        S._keyMsg[uid] = m.id;
        _keymapSave(uid, m.id);
        drop();
        try {
          const ph = document.createElement('img');
          ph.setAttribute('data-iig-state', 'GEN');
          ph.setAttribute('data-iig-key', uid);
          ph.setAttribute('data-iig-pending', '1');
          process(ph);
        } catch (e) {}
      }

function actEnd(t) {
        S._actBusy = Math.max(0, (S._actBusy || 0) - 1);
        if (t) {
          S._actLast = t;
          S._actLastAt = Date.now();
        }
        if (!S._actBusy) S._actText = '';
      }

function stripMarks(content, keep) {
        content = String(content || '');
        content = content.replace(/<img\b[^>]{0,}?data-iig-instruction[^>]{0,}?>/gi, function(t0) {
          const km = t0.match(/\[IMG:(?:GEN|OK|FAIL):([a-z0-9_]{1,})\]/i);
          return (keep && km && keep[km[1]]) ? t0 : '';
        });
        content = content.replace(/\[IMG:(?:GEN|OK|FAIL)(?::([a-z0-9_]{1,}))?\]/g, function(m0, k) {
          return (keep && k && keep[k]) ? m0 : '';
        });
        content = content.replace(/  {1,}/g, ' ');
        content = content.replace(/[ \t]{1,}\n/g, '\n');
        content = content.replace(/\n[ \t]{1,}\n/g, '\n\n');
        content = content.replace(/\n{3,}/g, '\n\n');
        return content.replace(/^\s{1,}|\s{1,}$/g, '');
      }

function _domUnloadKey(key) {
        try {
          const imgs = document.querySelectorAll('img[data-iig-key]');
          for (const img of imgs) {
            if ((img.getAttribute('data-iig-key') || '') !== key) continue;
            const w = img.parentElement;
            if (w && w.classList && w.classList.contains('iig-wrap')) {
              stub(img, w, null, 'картинка удалена чисткой — тапни ↻ чтобы создать заново');
            }
          }
        } catch (e) {}
      }

async function updSafe(m, content, prev) {
        try {
          const fresh = await tavo.message.get(m.id);
          if (!fresh) return null;
          if (prev != null && fresh.content !== prev) return null;
          fresh.content = content;
          return await updMsg(fresh);
        } catch (e) {
          return null;
        }
      }

async function _noautoMark(id, content) {
        try {
          const na = (await tavo.get('iig_noauto', 'chat')) || {};
          na[String(id)] = hash(String(content || ''));
          await tavo.set('iig_noauto', na, 'chat');
        } catch (e) {}
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

function _bakeArm() {
        clearTimeout(S._bakeT);
        S._bakeT = setTimeout(function() {
          _bakeTry();
        }, 1200);
      }

async function _keyOwner(rawKey) {
        let own = null;
        try {
          const mp = await _owners();
          if (mp[rawKey] != null) own = mp[rawKey];
        } catch (e) {}
        if (own == null || own === '') {
          try {
            own = await tavo.get(rawKey + '_m', 'chat');
          } catch (e) {}
        }
        if (own == null || own === '') {
          try {
            const km = (await tavo.get('iig_keymap', 'chat')) || {};
            if (km[rawKey] != null) own = km[rawKey];
          } catch (e) {}
        }
        if (own == null || own === '') {
          const lm = S._keyMsg ? S._keyMsg[rawKey] : null;
          if (lm != null) own = lm;
        }
        return (own == null || own === '') ? null : String(own);
      }

function _bareMatchDom(img, cand) {
        try {
          const norms = [];
          for (let i = 0; i < cand.length; i++) norms.push(_normTxt(cand[i].content));
          let el = img && img.parentElement;
          let guard = 0;
          while (el && guard < 6) {
            const t = _normTxt(el.textContent || '');
            if (t.length >= 16) {
              let hit = -1,
                hits = 0;
              for (let i = 0; i < norms.length; i++) {
                if (!norms[i]) continue;
                if (t.indexOf(norms[i].slice(0, 160)) >= 0 || (t.length >= 24 && norms[i].indexOf(t) >= 0)) {
                  hits++;
                  hit = i;
                }
              }
              if (hits === 1) return cand[hit];
              if (hits > 1) return null;
            }
            el = el.parentElement;
            guard++;
          }
        } catch (e) {}
        return null;
      }

async function _keymapSave(key, id) {
        try {
          const mp = (await tavo.get('iig_keymap', 'chat')) || {};
          if (mp[key] === id) return;
          mp[key] = id;
          const ks = Object.keys(mp);
          if (ks.length > 300) {
            for (let i = 0; i < ks.length - 300; i++) delete mp[ks[i]];
          }
          await tavo.set('iig_keymap', mp, 'chat');
        } catch (e) {}
      }

async function _keyOwnerSet(key, id) {
        if (!key || id == null) return;
        if (key.indexOf('iig_') === 0) return;
        try {
          const mp = await _owners();
          if (String(mp[key]) === String(id)) return;
          mp[key] = String(id);
          const ks = Object.keys(mp);
          if (ks.length > 400) {
            for (let i = 0; i < ks.length - 400; i++) delete mp[ks[i]];
          }
          await tavo.set('iig_owners', mp, 'chat');
        } catch (e) {}
      }

function isRetryable(e) {
        const st = (e && typeof e.status === 'number') ? e.status : null;
        const m = ((e && e.message) || '').toLowerCase();
        if (m.indexOf('abort') >= 0) return false;
        if (st === 429 || st === 502 || st === 503 || st === 504) return true;
        if (/\b(429|502|503|504)\b/.test((e && e.message) || '')) return true;
        return m.indexOf('timeout') >= 0 || m.indexOf('network') >= 0 || m.indexOf('failed to fetch') >= 0;
      }

async function _run(img, opts) {
        opts = opts || {};
        const force = !!opts.force;
        const state = img.getAttribute('data-iig-state') || 'GEN';
        const raw = (img.getAttribute('data-iig-instruction') || '').trim();
        const tag = parseInstr(raw) || {};
        const cfg = await resolveCfg();
        const auto = !raw;
        let autoKey = img.getAttribute('data-iig-key') || '';
        if (auto && !autoKey) {
          const bm = await _bareResolve(img);
          if (!bm) return err(img, 'метка [IMG:GEN] без поста-источника — тапни ↻', true);
          autoKey = bm.uid;
          try {
            img.setAttribute('data-iig-key', autoKey);
          } catch (e) {}
        }
        if (!tag.prompt) tag.prompt = '';
        tag.aspect_ratio = tag.aspect_ratio || cfg.aspectRatio || '1:1';
        tag.image_size = tag.image_size || cfg.imageSize || '1K';
        let key;
        if (auto) {
          key = autoKey;
          if (key && key.indexOf('iig_') !== 0 && key.indexOf('__') < 0) {
            const kr = await _keyedResolve(img, key);
            if (kr) {
              key = kr.eff;
              try {
                img.setAttribute('data-iig-key', key);
              } catch (e) {}
            }
          }
        } else {
          const lock = (cfg.styleLock || '').trim();
          if (lock && !tag.style) tag.style = lock;
          if (lock && tag.prompt.indexOf(lock) < 0) tag.prompt = tag.prompt + ' ' + lock;
          const neg = (cfg.styleNegative || '').trim();
          if (neg && tag.prompt.indexOf(neg) < 0) tag.prompt = tag.prompt + ' ' + neg;
          let rfp = '';
          try {
            const slots = await loadRefs();
            rfp = hash(JSON.stringify({
              c: cfg.useCharRef !== false,
              u: cfg.useUserRef !== false,
              s: (slots || []).filter(function(x) {
                return x && x.dataUrl && x.enabled !== false;
              }).map(function(x) {
                return {
                  t: x.type,
                  n: x.note,
                  g: x.target,
                  d: (x.dataUrl || '').length
                };
              })
            }));
          } catch (e) {}
          let cid = '';
          try {
            const ch = await tavo.chat.current();
            if (ch) cid = String(ch.id != null ? ch.id : (ch.chatId != null ? ch.chatId : (ch.file_name || ch.name || '')));
          } catch (e) {}
          key = 'iig_' + hash(JSON.stringify({
            c: cid,
            p: tag.prompt || tag.cap || '',
            s: tag.style || '',
            a: tag.aspect_ratio || '',
            r: tag.image_size || '',
            k: cfg.apiStyle || '',
            f: rfp
          }));
        }
        if (force) {
          delete S._dead[key];
          delete S._bakeMiss[key];
        }
        try {
          img._iigKey = key;
        } catch (e) {}
        const rat = arToRatio(tag.aspect_ratio);
        let cached = null;
        if (!force && state !== 'FAIL') {
          const bakedKey = img.getAttribute('data-iig-key') || '';
          if (bakedKey) cached = await _kvGet(bakedKey);
          if (!cached && bakedKey !== key) cached = await _kvGet(key);
        }
        const needGen = !cached && state !== 'FAIL' && !(!force && state === 'OK') && !(!force && S._dead[key]);
        let genP = null;
        if (needGen && cfg.apiKey && (cfg.apiStyle === 'naistera' || cfg.model)) {
          genP = runGenerate(tag, cfg, key, force, auto);
          genP.catch(function() {});
        }
        await _domQuiet();
        const w = wrap(img);
        cleanupErr(w);
        const ovOld = w.querySelectorAll('.iig-ov');
        for (const o of ovOld) o.remove();
        w.onclick = null;
        sizeBox(w, rat);
        img.removeAttribute('src');
        img.style.cssText = imgCss(rat, true);
        if (!force) {
          if (state === 'FAIL') return stub(img, w, tag, 'не сгенерировалось (цензура/ошибка) — тапни ↻ чтобы попробовать снова');
          if (cached) {
            show(img, cached, tag);
            return;
          }
          if (state === 'OK') return stub(img, w, tag, 'тапни ↻ чтобы пересоздать картинку');
          if (S._dead[key]) return stub(img, w, tag, 'авто-генерация остановлена (метка в тексте недоступна) — тапни ↻ для ручной попытки');
        }
        if (!cfg.apiKey) {
          const q = S._cfgToasted;
          S._cfgToasted = 1;
          return err(img, 'Нет apiKey — открой панель и впиши ключ', q);
        }
        if (cfg.apiStyle !== 'naistera' && !cfg.model) {
          const q = S._cfgToasted;
          S._cfgToasted = 1;
          return err(img, 'Нет model — открой панель и выбери модель', q);
        }
        stopOverlay(w, key);
        try {
          const src = await (genP || runGenerate(tag, cfg, key, force, auto));
          if (img.isConnected !== false) show(img, src, tag);
          if (!auto) bakeState(img, 'OK', key);
          try {
            prune(cfg);
          } catch (e) {}
        } catch (e) {
          if (e && e.iigStop) {
            if (img.isConnected !== false) stub(img, w, tag, 'генерация остановлена — тапни ↻ чтобы попробовать снова');
            return;
          }
          if (img.isConnected !== false) err(img, (e && e.message) ? e.message : String(e));
          if (key && key.indexOf('iig_') === 0 && key.indexOf('iig_b') !== 0) bakeState(img, 'FAIL', key);
        }
      }

async function _findMsgByKey(key, img) {
        if (!key) return null;
        {
          const needle = ':' + key + ']';
          const instr = (img && img.getAttribute && img.getAttribute('data-iig-instruction')) || '';
          try {
            let mid = S._keyMsg ? S._keyMsg[key] : null;
            if (mid == null) {
              try {
                const mp = await tavo.get('iig_keymap', 'chat');
                if (mp && mp[key] != null) mid = mp[key];
              } catch (e0) {}
            }
            const bare = key.indexOf('iig_b') === 0;
            const bareHit = (x) => !!(x && x.content && x.content.indexOf('[IMG:GEN]') >= 0 && ('iig_b' + hash(String(x.id))) === key);
            const dd = key.lastIndexOf('__');
            const effBase = dd > 0 ? key.slice(0, dd) : null;
            const effHit = (x) => !!(effBase && x && x.content && x.content.indexOf(':' + effBase + ']') >= 0 && (effBase + '__' + hash(String(x.id))) === key);
            if (mid != null) {
              try {
                const mm = await tavo.message.get(mid);
                if (mm && mm.content && (mm.content.indexOf(needle) >= 0 || (bare && bareHit(mm)) || effHit(mm))) return mm;
              } catch (e1) {}
            }
            const total = await tavo.message.count();
            const from = Math.max(0, total - 60);
            let msgs = await tavo.message.find([from]);
            for (const x of msgs) {
              if (x && x.content && x.content.indexOf(needle) >= 0) return x;
            }
            if (bare) {
              for (const x of msgs) {
                if (bareHit(x)) return x;
              }
            }
            if (effBase) {
              for (const x of msgs) {
                if (effHit(x)) return x;
              }
            }
            if (instr) {
              for (const x of msgs) {
                if (x && x.content && x.content.indexOf(instr) >= 0) return x;
              }
              try {
                const cur = await tavo.message.current();
                if (cur && cur.content && cur.content.indexOf(instr) >= 0) return cur;
              } catch (e2) {}
            }
            let hi = from - 1;
            while (hi >= 0) {
              const lo = Math.max(0, hi - 79);
              msgs = await tavo.message.find([lo, hi]);
              for (const x of msgs) {
                if (x && x.content && x.content.indexOf(needle) >= 0) return x;
              }
              hi = lo - 1;
              if (hi >= 0) await new Promise(function(r) {
                setTimeout(r, 60);
              });
            }
          } catch (e) {}
          return null;
        }
      }

function _cutToPromptAnchor(s) {
        s = String(s || '').trim();
        const re = /(^|\n)[ \t]{0,}PROMPT[ \t]{0,4}:[ \t]{0,}/gi;
        let m, last = null;
        while ((m = re.exec(s))) last = {
          at: m.index + m[1].length,
          len: m[0].length - m[1].length
        };
        if (last) s = s.slice(last.at + last.len);
        return s;
      }

function _ioSetup() {
        if (S._io) return;
        if (typeof IntersectionObserver === 'undefined') return;
        try {
          S._io = new IntersectionObserver(function(es) {
            for (const en of es) _ioHit(en);
          }, {
            rootMargin: '1500px 0px'
          });
        } catch (e) {}
      }

function _seed() {
        let a = 0,
          n = 2166136261;
        for (let i = 0; i < S._S.length; i++) {
          a = (a + S._S[i]) | 0;
          n = (Math.imul(n, 16777619) ^ a) >>> 0;
        }
        return n >>> 0;
      }

async function _autoSlotRun() {
        try {
          const cfg = await resolveCfg();
          if (!cfg.autoOn) return;
          const m = await tavo.message.current();
          autoSlotFor(m, cfg);
        } catch (e) {}
      }

async function updMsg(m) {
        return await tavo.message.update(m);
      }

function _bakeTry() {
        const now = Date.now();
        const quiet = !S._lastAct || (now - S._lastAct > 2200);
        const forced = S._bakeFirstAt && (now - S._bakeFirstAt > 15000);
        if (!quiet && !forced) return _bakeArm();
        const jobs = S._bakePend;
        S._bakePend = [];
        S._bakeFirstAt = 0;
        if (!jobs.length) return;
        const p = S._bq ? S._bq.then(function() {
          return _bakeFlush(jobs);
        }) : _bakeFlush(jobs);
        S._bq = Promise.resolve(p).then(function() {}, function() {});
      }

async function _owners() {
        if (S._ownMap) return S._ownMap;
        let mp = null;
        try {
          mp = await tavo.get('iig_owners', 'chat');
        } catch (e) {}
        S._ownMap = (mp && typeof mp === 'object') ? mp : {};
        return S._ownMap;
      }

function _normTxt(s) {
        s = String(s || '').toLowerCase();
        s = s.replace(/\[img:[^\]]{0,}\]/g, ' ');
        s = s.replace(/[^a-z0-9Ѐ-ӿ]{1,}/g, ' ');
        return s.trim();
      }

async function _bareResolve(img) {
        try {
          const hasBare = function(x) {
            return !!(x && x.content && x.content.indexOf('[IMG:GEN]') >= 0);
          };
          const cand = [];
          try {
            const total = await tavo.message.count();
            const from = Math.max(0, total - 30);
            const msgs = await tavo.message.find([from]);
            for (const x of msgs) {
              if (hasBare(x) && x.id != null) cand.push(x);
            }
          } catch (e1) {}
          try {
            const arr = await tavo.message.find(-1);
            const last = arr && arr[0];
            if (hasBare(last) && last.id != null) {
              let seen = false;
              for (const c of cand) {
                if (String(c.id) === String(last.id)) seen = true;
              }
              if (!seen) cand.push(last);
            }
          } catch (e0) {}
          if (!cand.length) return null;
          let m = null;
          if (cand.length === 1) m = cand[0];
          else if (img) m = _bareMatchDom(img, cand);
          if (!m) m = cand[cand.length - 1];
          const uid = 'iig_b' + hash(String(m.id));
          S._keyMsg[uid] = m.id;
          _keymapSave(uid, m.id);
          return {
            uid: uid,
            id: m.id
          };
        } catch (e) {
          return null;
        }
      }

function runGenerate(tag, cfg, key, force, auto) {
        if (!force && S._inflight[key]) return S._inflight[key];
        if (force && S._acReg[key]) {
          const old = S._acReg[key];
          try {
            old.abort();
          } catch (e) {}
          delete S._acReg[key];
        }
        let ac = null;
        try {
          ac = new AbortController();
        } catch (e) {}
        if (ac) S._acReg[key] = ac;
        const cfg2 = ac ? Object.assign({}, cfg, {
          _sig: ac.signal,
          _deadline: Date.now() + 300000
        }) : Object.assign({}, cfg, {
          _deadline: Date.now() + 300000
        });
        let genCounted = false;
        const p = enqueue(async function() {
          if (cfg2._sig && cfg2._sig.aborted) throw stopErr();
          if (!force) {
            try {
              const c = await tavo.get(key, 'chat');
              if (c) return c;
            } catch (e) {}
          }
          actStart('генерация картинки');
          genCounted = true;
          let gtag = tag;
          let stored = null;
          if (S._pwPending[key]) {
            try {
              stored = await S._pwPending[key];
            } catch (e) {}
            delete S._pwPending[key];
          }
          if (!stored) {
            try {
              stored = await tavo.get(key + '_p', 'chat');
            } catch (e) {}
            if (stored) stored = _stripThink(_cutToPromptAnchor(String(stored))).trim();
          }
          if (stored && force) {
            const sm = parseMarkers(String(stored));
            if (sm.ar && tag.aspect_ratio && sm.ar !== tag.aspect_ratio) stored = null;
          }
          const ready = String(tag.prompt || '').trim();
          if (stored && String(stored).trim().length >= 20) {
            gtag = Object.assign({}, tag, {
              prompt: String(stored).trim()
            });
          } else if (!auto && ready.length >= 200) {
            gtag = Object.assign({}, tag, {
              prompt: applyLocks(ready, cfg)
            });
          } else if (auto) {
            const post = await findPostByKey(key);
            if (!post) throw new Error('не нашёл текст поста для этой картинки — тапни ↻');
            const np = await withRetry(function() {
              return rewritePrompt(tag, cfg2, post);
            }, Object.assign({}, cfg2, {
              maxRetries: 1
            }));
            gtag = Object.assign({}, tag, {
              prompt: applyLocks(np, cfg)
            });
          } else {
            try {
              const np = await rewritePrompt(tag, cfg2);
              if (np) {
                gtag = Object.assign({}, tag, {
                  prompt: applyLocks(np, cfg)
                });
              }
            } catch (e) {
              if (e && e.iigStop) throw e;
              if (!S._pwToasted) {
                S._pwToasted = 1;
                try {
                  tavo.utils.toast('IIG: модель промпта не ответила (' + ((e && e.message) || e) + ') — генерация по сцене из тега');
                } catch (x) {}
              }
            }
          }
          try {
            await tavo.set(key + '_p', String(gtag.prompt || ''), 'chat');
          } catch (e) {}
          const pcm = parseMarkers(String(gtag.prompt || ''));
          const gtag2 = Object.assign({}, gtag, {
            prompt: pcm.prompt
          });
          let refs = await gatherRefs(cfg);
          refs = refGate(refs, pcm.cast, pcm.prompt);
          const _nmod = naisteraCanon(gtag2.model || cfg.naisteraModel || 'grok');
          const rNote = refsNote(refs) + ' · ' + (cfg.apiStyle || 'openai_chat') + (cfg.apiStyle === 'naistera' ? ('/' + _nmod + (naisteraRefsOk(_nmod) ? '' : ' (модель без референсов — внешность идёт тегами)')) : '') + (cfg.promptName ? (' · стиль: ' + cfg.promptName) : '') + (S._pwSrc ? (' · промпт: ' + S._pwSrc) : '');
          S._lastRefsNote = rNote;
          try {
            tavo.set(key + '_r', rNote, 'chat');
          } catch (e) {}
          let src = await withRetry(function() {
            return generate(gtag2, refs, cfg2);
          }, cfg2);
          if (/^https?:/i.test(src)) {
            let d = null;
            try {
              d = await urlToDataUrl(src, cfg2._sig);
            } catch (e) {
              if (e && e.iigStop) throw e;
            }
            if (!d) throw new Error('Картинка пришла временной ссылкой, скачать её не удалось — тапни ↻ чтобы попробовать снова');
            src = d;
          }
          _fullPut(key, src);
          try {
            const shr = await shrinkDataUrl(src, 1024, 0.82);
            if (shr && shr.length < String(src).length) src = shr;
          } catch (e) {}
          let cachedOk = false;
          try {
            await tavo.set(key, src, 'chat');
            const back = await tavo.get(key, 'chat');
            cachedOk = !!(back && String(back).length === String(src).length);
          } catch (e) {}
          if (!cachedOk) {
            try {
              const small = await shrinkDataUrl(src, 720, 0.7);
              if (small && small.length < String(src).length) {
                await tavo.set(key, small, 'chat');
                const b2 = await tavo.get(key, 'chat');
                cachedOk = !!(b2 && String(b2).length === small.length);
                if (cachedOk) src = small;
              }
            } catch (e) {}
          }
          if (!cachedOk) {
            try {
              tavo.utils.toast('IIG: картинка НЕ закэшировалась даже пережатой — после перезахода будет заглушка с ↻. Попробуй разрешение поменьше.');
            } catch (e) {}
          }
          try {
            const own = S._keyMsg ? S._keyMsg[key] : null;
            if (own != null) await _keyOwnerSet(key, own);
          } catch (e) {}
          try {
            _statAdd({
              imgs: 1,
              imgTok: S._lastImgTok || 0
            });
            S._lastImgTok = 0;
          } catch (e) {}
          return src;
        }, cfg.apiStyle === 'naistera' ? 1 : 2);
        S._inflight[key] = p;
        const clean = function(e) {
          if (S._inflight[key] === p) delete S._inflight[key];
          if (ac && S._acReg[key] === ac) delete S._acReg[key];
          if (!genCounted) return;
          genCounted = false;
          if (e === undefined) actEnd('картинка готова · ' + (S._lastRefsNote || ''));
          else if (e && e.iigStop) actEnd('генерация остановлена');
          else actEnd('ошибка генерации: ' + ((e && e.message) ? String(e.message).slice(0, 90) : 'неизвестно'));
        };
        p.then(function() {
          clean();
        }, function(e) {
          clean(e || new Error('сбой'));
        });
        return p;
      }

function stopOverlay(w, key) {
        try {
          const olds = w.querySelectorAll('.iig-ov');
          for (const o of olds) o.remove();
          const ov = document.createElement('div');
          ov.className = 'iig-ov';
          let box = 'inset:0;';
          try {
            const im = w.querySelector('img');
            if (im && im.offsetWidth) box = 'left:' + im.offsetLeft + 'px;top:' + im.offsetTop + 'px;width:' + im.offsetWidth + 'px;height:' + im.offsetHeight + 'px;';
          } catch (e) {}
          ov.style.cssText = 'position:absolute;' + box + 'display:flex;align-items:center;justify-content:center;pointer-events:none;';
          const b = document.createElement('button');
          b.title = 'остановить генерацию';
          b.style.cssText = 'border:none;background:transparent;padding:10px;cursor:pointer;line-height:0;pointer-events:auto;';
          b.appendChild(stopIcon());
          b.onclick = function(e) {
            if (e) e.stopPropagation();
            stopKey(key);
          };
          ov.appendChild(b);
          w.appendChild(ov);
        } catch (e) {}
      }

async function _kvGet(k) {
        if (!S._kvN) S._kvN = 0;
        if (!S._kvQ) S._kvQ = [];
        if (S._kvN >= 3) await new Promise(function(r) {
          S._kvQ.push(r);
        });
        S._kvN++;
        try {
          return await tavo.get(k, 'chat');
        } catch (e) {
          return null;
        } finally {
          S._kvN--;
          const nx = S._kvQ.shift();
          if (nx) nx();
        }
      }

function _ioHit(en) {
        const img = en.target;
        if (img.isConnected === false) return _ioDrop(img);
        if (en.isIntersecting) {
          if (img._iigUnT) {
            clearTimeout(img._iigUnT);
            img._iigUnT = null;
          }
          if (img.getAttribute('data-iig-unloaded') === '1') {
            img.removeAttribute('data-iig-unloaded');
            const k = img._iigKey || img.getAttribute('data-iig-key') || '';
            const full = k && S._full[k];
            if (full) {
              img.src = full;
              return;
            }
            if (!k) return;
            try {
              tavo.get(k, 'chat').then(function(src) {
                if (src && img.getAttribute('data-iig-unloaded') !== '1') img.src = src;
              }, function() {});
            } catch (e) {}
          }
          return;
        }
        if (img._iigUnT || img.getAttribute('data-iig-unloaded') === '1') return;
        img._iigUnT = setTimeout(function() {
          img._iigUnT = null;
          try {
            if (!S.UNLOAD_DOM) return;
            if (!img.getAttribute('src')) return;
            const all = document.querySelectorAll('img[data-iig-done="1"][src]');
            if (all.length <= 6) return;
            img.onerror = null;
            img.setAttribute('data-iig-unloaded', '1');
            img.removeAttribute('src');
            img.style.background = 'repeating-linear-gradient(45deg,#1d1f24,#1d1f24 12px,#262a31 12px,#262a31 24px)';
          } catch (e) {}
        }, 6000);
      }

function autoSlotFor(m, cfg) {
        if (!m || m.id == null || !(m.content || '').trim()) return;
        if (m.role === 'user') return;
        if ((m.content || '').indexOf('[IMG:') >= 0) return;
        if (S._autoBusy[m.id]) return;
        S._autoBusy[m.id] = 1;
        const snap = m.content;
        const tid = setTimeout(async function() {
          delete S._autoTimers[m.id];
          try {
            const m2 = await tavo.message.get(m.id);
            if (!m2 || m2.content !== snap) return;
            if ((m2.content || '').indexOf('[IMG:') >= 0) return;
            if (!(await _isLastMsg(m.id))) return;
            if (await _noautoHit(m2)) return;
            actStart('новый пост: подготовка промпта');
            try {
              await _slotNow(m2, cfg, 'iig_a');
            } finally {
              actEnd('промпт готов, генерация картинки');
            }
          } catch (e) {} finally {
            delete S._autoBusy[m.id];
          }
        }, 1600);
        S._autoTimers[m.id] = tid;
      }

async function _bakeFlush(jobs) {
        const byMsg = {};
        for (const j of jobs) {
          if (j.key && S._dead[j.key]) continue;
          try {
            let m = null;
            const pend = j.key ? S._pendMark[j.key] : null;
            if (pend) {
              try {
                m = await tavo.message.get(pend.id);
              } catch (e) {
                m = null;
              }
            } else {
              m = await _findMsgByKey(j.key, j.img);
            }
            if (!m || m.id == null) {
              _bakeMissed(j.img, j.key);
              continue;
            }
            const g = byMsg[m.id] || (byMsg[m.id] = {
              m: m,
              list: []
            });
            g.list.push(j);
          } catch (e) {}
        }
        for (const id in byMsg) {
          const g = byMsg[id];
          const before = g.m.content || '';
          let content = before;
          let changed = false;
          const applied = [];
          for (const j of g.list) {
            const pend = j.key ? S._pendMark[j.key] : null;
            let r;
            if (pend && content.indexOf(':' + j.key + ']') < 0) r = insertAfterPara(content, pend.after, '[IMG:' + j.marker + ':' + j.key + ']');
            else r = _applyMarker(content, j.marker, j.key, j.img);
            if (r == null) {
              _bakeMissed(j.img, j.key);
              continue;
            }
            if (r !== content) {
              content = r;
              changed = true;
            }
            applied.push(j);
          }
          if (!changed) continue;
          let ok = null;
          try {
            ok = await updSafe(g.m, content, before);
          } catch (e) {}
          if (ok == null) {
            for (const j of applied) {
              j._try = (j._try || 0) + 1;
              if (j._try < 3) S._bakePend.push(j);
            }
            if (S._bakePend.length) {
              if (!S._bakeFirstAt) S._bakeFirstAt = Date.now();
              _bakeArm();
            }
            continue;
          }
          for (const j of applied) {
            if (!j.key) continue;
            delete S._bakeMiss[j.key];
            delete S._pendMark[j.key];
            S._keyMsg[j.key] = g.m.id;
            _keymapSave(j.key, g.m.id);
          }
        }
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

function _ioDrop(img) {
        try {
          if (img._iigUnT) {
            clearTimeout(img._iigUnT);
            img._iigUnT = null;
          }
          if (S._io && img._iigObs) {
            S._io.unobserve(img);
            img._iigObs = 0;
          }
        } catch (e) {}
      }

async function _noautoHit(m) {
        try {
          const na = (await tavo.get('iig_noauto', 'chat')) || {};
          const h = na[String(m.id)];
          return !!(h && h === hash(String(m.content || '')));
        } catch (e) {}
        return false;
      }

async function _isLastMsg(id) {
        try {
          const arr = await tavo.message.find(-1);
          const last = arr && arr[0];
          return !!(last && last.id != null && String(last.id) === String(id));
        } catch (e) {
          return false;
        }
      }

function insertAfterPara(content, n, marker) {
        content = String(content || '');
        const parts = content.split(/(\n[ \t]*\n+)/);
        const total = Math.ceil(parts.length / 2);
        if (!n || n < 1 || n >= total) return content + '\n\n' + marker;
        const idx = (n - 1) * 2;
        const head = parts.slice(0, idx + 1).join('');
        const rest = parts.slice(idx + 1).join('');
        return head + '\n\n' + marker + rest;
      }

function _applyMarker(content, marker, key, img) {
        content = String(content || '');
        if (content.indexOf('[IMG:') < 0) return null;
        const instr = (img && img.getAttribute && img.getAttribute('data-iig-instruction')) || '';
        let at = -1,
          from = 0,
          win = 200;
        if (key) {
          at = content.indexOf(':' + key + ']');
          if (at >= 0) {
            from = Math.max(0, at - 24);
            win = key.length + 64;
          }
        }
        const keyHit = at >= 0;
        if (at < 0) {
          if (!instr) {
            if (key && key.indexOf('iig_b') === 0) {
              const bat = content.indexOf('[IMG:GEN]');
              if (bat >= 0) return content.slice(0, bat) + '[IMG:' + marker + ':' + key + ']' + content.slice(bat + 9);
            }
            return null;
          }
          at = content.indexOf(instr);
          if (at < 0) return null;
          from = at + instr.length;
          win = 200;
        }
        const seg = content.slice(from, from + win);
        const kesc = String(key || '').replace(/[.*+?^=!:{}()|[\]\/\\-]/g, function(c) {
          return '\\' + c;
        });
        const mm = keyHit ? seg.match(new RegExp('\\[IMG:(GEN|OK|FAIL):' + kesc + '\\]')) : seg.match(/\[IMG:(GEN|OK|FAIL)(:[a-z0-9_]{1,})?\]/);
        if (!mm) return null;
        const mk = from + mm.index;
        const repl = '[IMG:' + marker + (key ? (':' + key) : '') + ']';
        if (mm[0] === repl) return content;
        return content.slice(0, mk) + repl + content.slice(mk + mm[0].length);
      }

function _bakeMissed(img, key) {
        if (!key) return;
        S._bakeMiss[key] = (S._bakeMiss[key] || 0) + 1;
        if (S._bakeMiss[key] >= 2 && !S._dead[key]) {
          S._dead[key] = 1;
          err(img, 'Не нашёл метку [IMG:GEN] в тексте сообщения — авто-генерация этого тега остановлена, тапни ↻ для ручной попытки');
        }
      }

S._bootCount = -1;
S._cmdDone = 0;

function teardown() {
        try {
          if (S._mo) {
            S._mo.disconnect();
            S._mo = null;
          }
        } catch (e) {}
        try {
          clearTimeout(S._t);
        } catch (e) {}
        try {
          clearInterval(S._cmdTimer);
        } catch (e) {}
        try {
          clearTimeout(S._bakeT);
        } catch (e) {}
        try {
          clearTimeout(S._asT);
        } catch (e) {}
        try {
          if (S._io) {
            S._io.disconnect();
            S._io = null;
          }
        } catch (e) {}
        try {
          if (S._actH) {
            document.removeEventListener('touchstart', S._actH, true);
            document.removeEventListener('touchmove', S._actH, true);
            document.removeEventListener('pointerdown', S._actH, true);
            document.removeEventListener('wheel', S._actH, true);
            document.removeEventListener('keydown', S._actH, true);
            S._actH = null;
          }
        } catch (e) {}
        try {
          for (const k in S._autoTimers) clearTimeout(S._autoTimers[k]);
        } catch (e) {}
        try {
          const im = document.querySelectorAll('img[data-iig-key]');
          for (const g of im) {
            if (g._iigUnT) {
              clearTimeout(g._iigUnT);
              g._iigUnT = null;
            }
          }
        } catch (e) {}
        try {
          for (const k in S._acReg) S._acReg[k].abort();
        } catch (e) {}
      }

try {
  var IIGAPI = {
    plugin: true,
    ver: VER,
    hash: hash,
    sweep: function () { try { sweep(); } catch (e) {} },
    stopAll: function () { try { stopAll(); } catch (e) {} },
    prune: function (c) { try { prune(c); } catch (e) {} },
    run: function (img, opts) { try { return run(img, opts); } catch (e) {} },
    ensureFrameStyle: function (c) { try { return ensureFrameStyle(c); } catch (e) {} }
  };
  ['_full', '_frameCss', '_cfgCache', '_pwCache', '_dead', '_keyMsg', '_lastRefsNote', '_actText', '_actBusy', '_actLast', '_actLastAt'].forEach(function (k) {
    Object.defineProperty(IIGAPI, k, {
      get: function () { return S[k]; },
      set: function (v) { S[k] = v; },
      enumerable: true,
      configurable: true
    });
  });
  window.IIG_PLUGIN = IIGAPI;
} catch (e) {}

setTimeout(function () {
  try {
    var mo = new MutationObserver(function (recs) {
      S._domDirty = 1;
      S._lastMut = Date.now();
      try {
        if (_freshMark(recs)) {
          clearTimeout(S._t);
          S._swAt = Date.now();
          sweep();
          return;
        }
      } catch (e) {}
      clearTimeout(S._t);
      S._t = setTimeout(function () {
        S._swAt = Date.now();
        sweep();
      }, 200);
    });
    mo.observe(document.body || document.documentElement, { childList: true, subtree: true });
    S._mo = mo;
  } catch (e) {}

  S._bootAt = Date.now();
  try {
    tavo.message.count().then(function (n) {
      if (S._bootCount < 0) S._bootCount = n;
    }, function () {});
  } catch (e) {}
  try { _actWire(); } catch (e) {}
  try { ensureBaseStyle(); } catch (e) {}
  try {
    S._cmdTimer = setInterval(function () {
      try { _tick(); } catch (e) {}
    }, 2500);
  } catch (e) {}

  try { sweep(); } catch (e) {}
  setTimeout(function () { try { sweep(); } catch (e) {} }, 150);
  setTimeout(function () { try { sweep(); } catch (e) {} }, 600);
}, 0);

var OOC_RE = new RegExp("(\\[OOC:(?:[^\\[\\]]|\\[[^\\]]{0,}\\]){0,}?(?:(?:^|[^a-zA-Zа-яёА-ЯЁ])(?:images?|pics?|pictures?|artworks?|art|renders?|rendering|generate|generating|generation|draw|drawing)(?![a-zA-Zа-яёА-ЯЁ])|(?:^|[^a-zA-Zа-яёА-ЯЁ])(?:картин|фото|нарисуй|изображ|арт))(?:[^\\[\\]]|\\[[^\\]]{0,}\\]){0,}\\])", "i");
var OOC_NOTE = "[SYSTEM NOTE - IMAGE TAGS. This chat has an image generation extension. The user asked for images in the OOC above. Reply with ONE tag per requested image, each on its own line, EXACTLY this format:\n<img data-iig-instruction='cap:short-title|prompt:FULL final image prompt here' src=\"[IMG:GEN]\">\nRules: cap = short lowercase hyphenated title (like-this); prompt = the COMPLETE final image generation prompt written by you: one dense English paragraph of 80-130 words covering camera (shot type, angle, lens), every character in frame by first name with outfit, pose, expression and gaze, then environment and lighting. Follow every constraint from the OOC (solo, waist-up, poses, no repeats, creative outfits etc). ONLY if the user explicitly asked for specific proportions, orientation or resolution, prepend ar:W:H (one of 1:1, 2:3, 3:2, 3:4, 4:3, 4:5, 5:4, 9:16, 16:9, 21:9) and/or res:1K or 2K or 4K in that exact order before cap - otherwise OMIT ar and res completely, the extension will apply the panel settings of the user. CRITICAL: the value inside data-iig-instruction is wrapped in single quotes and is parsed by a script, so inside it use plain words only - NEVER use apostrophes or single quotes (write: hands of Kira, not Kira's hands), and NEVER use double quotes, asterisks, backticks, guillemets, angle brackets or line breaks anywhere in the tag. The vertical bar separates fields, so it must never appear inside the prompt text either. Do not wrap tags in code blocks or quotes. If the user asked for N images, output exactly N tags. If the OOC asks for NO images or to stop generating images, output no tags at all. Besides the tags, write only what the user allowed (no narrative if they said none).]";

tavo.plugin.on('generation:prepare', async function (event) {
  try {
    var t = String(event.text || '');
    if (!t || !OOC_RE.test(t)) return;
    event.text = t + '\n\n' + OOC_NOTE;
    note('ooc injected', { len: t.length });
  } catch (e) {
    note('ooc failed', short(e));
  }
});

var SEEDPACK = [["Wlop by Aceenvw", "UFJPTVBUIEJVSUxEIE9SREVSOgoKMS4gQ0FNRVJBOiBzaG90IHR5cGUgKyBhbmdsZSArIGxlbnMgKyBhcGVydHVyZSAoTWVkaXVtIHNob3QsIDg1bW0sIGYvMi4wIHNoYWxsb3cgRG9GKS4gVmFyeSBhbmdsZSBhbmQgbGVucyBiZXR3ZWVuIGltYWdlczogRHV0Y2gsIHdvcm1zLWV5ZSwgYmlyZHMtZXllLCBvdmVyLXRoZS1zaG91bGRlciwgdGhyb3VnaC1vYmplY3QgYm9rZWgsIHJlZmxlY3Rpb24sIG1hY3JvLCB3aWRlIGVzdGFibGlzaGluZywgdHJhY2tpbmcgYmx1ciwgc3BsaXQtZm9jdXMuIExlbnNlczogMjRtbSB3aWRlLCAzNW1tIGVudmlyb25tZW50YWwsIDUwbW0gbmF0dXJhbCwgODVtbSBwb3J0cmFpdCwgMTM1bW0gY29tcHJlc3NlZCwgdGlsdC1zaGlmdC4gTWF0Y2ggbGVucyB0byBmcmFtaW5nOiBjbG9zZS11cHMgODUtMTM1bW0gfCBtZWRpdW0gNTAtODVtbSB8IGZ1bGwgYm9keSAzNS01MG1tIChzaW1wbGlmeSBwb3NlLCBwcmVmZXIgc2lkZSBvciAzLzQpLiBDbG9zZSBhbmQgbWVkaXVtLWNsb3NlID0gc2FmZXN0IGFuYXRvbXkuIFRoaW5rIGxpa2UgYSBjaW5lbWF0b2dyYXBoZXI6IGEgc3RpbGwgZnJvbSBhIGZpbG0sIG1pZC1tb21lbnQuIEludGltYXRlIG1vbWVudCA9IGNsb3NlLiBMb25lbGluZXNzID0gd2lkZS4gSW1wb3J0YW50IGRldGFpbCA9IG1ha2UgaXQgdGhlIGZvY3VzLiBEaWFsb2d1ZS1oZWF2eSBzY2VuZSB3aXRoIG1pbmltYWwgYWN0aW9uID0gZnJhbWUgYSBkZXRhaWw6IGhhbmRzLCBvYmplY3QsIGRvb3J3YXksIGV4cHJlc3Npb24gYmV0d2VlbiBsaW5lcy4KCjIuIENIQVJBQ1RFUjogcmVmZXJlbmNlIGltYWdlcyBvd24gQUxMIHBlcm1hbmVudCBhcHBlYXJhbmNlOyBmaXJzdCBuYW1lcyB0cmlnZ2VyIHJlZiBtYXRjaGluZy4gUHJvbXB0IHByb3ZpZGVzIE9OTFk6IGZpcnN0IG5hbWUsIGJ1aWxkIHByZWZpeCwgZGlzdGluZ3Vpc2hpbmcgbWFya3MsIG91dGZpdCwgZ2F6ZSwgcG9zZSwgZXhwcmVzc2lvbi4gTmFtZSBpcyB0aGUgZmlyc3Qgd29yZCBvZiBlYWNoIGNoYXJhY3RlciBjbGF1c2UuIEV2ZXJ5IGNoYXJhY3RlciBpbiBmcmFtZSBuYW1lZCwgZXZlbiBwYXJ0aWFsLiBCQU5ORUQgKHJlZi1vd25lZCk6IGhhaXIgY29sb3Ivc3R5bGUvbGVuZ3RoLCBleWUgY29sb3IsIHNraW4gdG9uZSwgZmFjZSBzaGFwZSwgYm9keSB0eXBlLCBoZWlnaHQuIFdyaXRpbmcgdGhlbSBvdmVycmlkZXMgdGhlIHJlZi4gSGFpciA9IHNjZW5lIHN0YXRlIG9ubHkgKGRhbXAgZGlzaGV2ZWxlZCBoYWlyKS4gRXllcyA9IGV4cHJlc3Npb24gb25seSAoaGFsZi1saWRkZWQgZ2F6ZSkuIFNraW4gPSBjb25kaXRpb24gb25seSAoZmx1c2hlZCBjaGVla3MpLiBJbmNsdWRlIHZpc2libGUgbWFya3M6IHRhdHRvb3Mgd2l0aCBsb2NhdGlvbiwgc2NhcnMsIHBpZXJjaW5ncy4gTWVuIGRlc2NyaWJlZCBhcyBsZWFuL3RhbGwvc3Ryb25nIGluIHN0b3J5ID0gcHJlZml4IGxlYW4gbXVzY2xlZCwgdGFsbCwgYXR0cmFjdGl2ZWx5IGJ1aWx0IGJlZm9yZSB0aGUgbmFtZS4KCjMuIE9VVEZJVCAobWFuZGF0b3J5LCBjb250ZXh0LWxvY2tlZCk6IHRha2UgY3VycmVudCBjbG90aGluZyBmcm9tIHRoZSBwb3N0IGFuZCByZWNlbnQgY29udGV4dC4gUHJpb3JpdHk6IGN1cnJlbnQgbWVzc2FnZSwgdGhlbiBjYXJyaWVkIGZvcndhcmQsIHRoZW4gc2NlbmUgbG9naWMsIHRoZW4gaW52ZW50IG9uY2UgYW5kIGtlZXAuIFNwZWNpZnkgZmFicmljICsgZml0ICsgY29sb3IgKyBjb25kaXRpb24gKHdyaW5rbGVkLCBzb2FrZWQsIHVuYnV0dG9uZWQpLiBPdXRmaXQgc3RhdGUgcmVmbGVjdHMgdGhlIG1vbWVudDsgaW5qdXJpZXMgYXBwZWFyIG9ubHkgYWZ0ZXIgdGhleSBoYXBwZW5lZCBvbi1zY3JlZW4uIEZ1c2UgaW50byB0aGUgY2hhcmFjdGVyIGNsYXVzZSBhZnRlciB0aGUgbmFtZS4KCjQuIEdBWkUsIFBPU0UsIFNUQVRFOiBnYXplIGRpcmVjdGlvbiBzdGF0ZWQgKGV5ZXMgb24gdGhlIGhhbmRzIG9mIEtpcmEpOyBpbnRlcmFjdGluZyBjaGFyYWN0ZXJzID0gYXQgbGVhc3Qgb25lIGxvb2tzIGF0IHRoZSBvdGhlciBieSBuYW1lLiBQb3NlIHRocm91Z2ggYWN0aW9uIChsZWFuaW5nIG9uIGRvb3JmcmFtZSwgYXJtcyBjcm9zc2VkKSwgbm90IGxpbWIgY29vcmRpbmF0ZXMuIEV4cHJlc3Npb24gd2l0aCBtdXNjbGUgZGV0YWlsIGFuZCBza2luIGNvbmRpdGlvbi4gSGFuZCBzYWZldHkgcG9vbDogaW4gcG9ja2V0IHwgZ3JpcHBpbmcgbmFtZWQgb2JqZWN0IHwgZmxhdCBvbiBzdXJmYWNlIHwgYXJtcyBjcm9zc2VkIHwgYmVoaW5kIGJhY2sgfCBmaXN0IGF0IHNpZGUgfCBmaW5nZXJzIGxhY2VkIHwgb24gb3duIGNoaW4uIE9uZSB2aXNpYmxlIHJlbGF4ZWQgaGFuZCBwZXIgY2hhcmFjdGVyID0gc2FmZXN0LiBPbmUgc2VudGVuY2Ugb24gd2VpZ2h0L2dyb3VuZCAoZWxib3dzIHByb3BwZWQgb24gY291bnRlcikuIEhpZGRlbiBsaW1iczogc3RhdGUgd2h5LiBDYW5vbiBoZWlnaHQgZGlmZmVyZW5jZSBpbiBzaGFyZWQgZnJhbWUgPSBzdGF0ZSByZWxhdGl2ZSBwb3NpdGlvbmluZyAoaGVhZCBsZXZlbCB3aXRoIGNoZXN0KS4KCjUuIEVOVklST05NRU5UOiBvd24gc2VudGVuY2UsIGZvcmVncm91bmQvbWlkZ3JvdW5kL2JhY2tncm91bmQgdGV4dHVyZXMuIE9uZSBvYmplY3QgY2FycnlpbmcgZW1vdGlvbmFsIHdlaWdodC4gT25lIGF0bW9zcGhlcmUgZWxlbWVudCAoc3RlYW0sIGR1c3QgbW90ZXMsIGVtYmVycywgcmFpbikuIFNjcmVlbnMgZmFjZSB0aGVpciB1c2VyLgoKNi4gTElHSFRJTkc6IGtleSBkaXJlY3Rpb24gKyBjb2xvciB0ZW1wICsgMS0yIG1vb2QgZWZmZWN0cyBtYXguIFRFTkRFUjogc29mdCBmb2N1cyB8IGhhbGF0aW9uIHwgZ29sZGVuIHdhcm10aCB8IGxpZ2h0IGxlYWsgfCBmaW5lIGdyYWluLiBURU5TRTogZHV0Y2ggYW5nbGUgfCB1bmRlcmV4cG9zdXJlIHwgaGFyc2ggcmltIGxpZ2h0IHwgZGVlcCB2aWduZXR0ZSB8IGhpZ2ggY29udHJhc3QuIElOVElNQVRFOiBjaGlhcm9zY3VybyB8IGJsb29tIG9uIGhpZ2hsaWdodHMgfCBwcmFjdGljYWwtbGlnaHQgZmxhcmUgfCBSZW1icmFuZHQgdHJpYW5nbGUuIE1FTEFOQ0hPTElDOiBibHVlIGhvdXIgfCBkZXNhdHVyYXRlZCB8IHNpbGhvdWV0dGUgfCBvdmVyY2FzdCBmbGF0IHwgY29sZCBjYXN0LiBDSEFPVElDOiBtb3Rpb24gYmx1ciB8IGNhbWVyYSBzaGFrZSB8IGFuYW1vcnBoaWMgZmxhcmUgfCByYWRpYWwgYmx1ci4gRFJFQU1ZOiBkb3VibGUgZXhwb3N1cmUgfCBwcmlzbSByZWZyYWN0aW9uIHwgYm9rZWggZmxvb2QgfCB0aWx0LXNoaWZ0LiBNVU5EQU5FOiBuYXR1cmFsIGZsYXQgbGlnaHQsIG1pbmltYWwgZWZmZWN0cy4gTk9JUjogbG93IGtleSB8IGhhcnNoIHNpZGUgbGlnaHQgfCBkZWVwIGJsYWNrcyB8IGhhemUgaW4gbGlnaHQgYmVhbS4gRWZmZWN0IGludGVuc2l0eSBtYXRjaGVzIG5hcnJhdGl2ZSB3ZWlnaHQ7IG5ldXRyYWwgbW9vZCA9IGNsZWFuIGltYWdlIHZhbGlkLgoKNy4gU1RZTEUgU1VGRklYIChhcHBlbmQgdmVyYmF0aW0gYXQgdGhlIGVuZCk6IFNlbWktcmVhbGlzdGljIGRpZ2l0YWwgcGFpbnRpbmcsIFdMT1AgaW5zcGlyZWQuIElkZWFsaXplZCBidXQgYmVsaWV2YWJsZSBmYWNlcyDigJQgc21vb3RoIHJlbmRlcmluZywgbHVtaW5vdXMgc2tpbiwgc2xpZ2h0bHkgc29mdGVuZWQgZmVhdHVyZXMgd2l0aG91dCBjYXJ0b29uaXNoIGV4YWdnZXJhdGlvbi4gUGFpbnRlcmx5IGxvb3NlIGJydXNod29yayBvbiBiYWNrZ3JvdW5kLCB0aWdodGVyIGRldGFpbCBvbiBmYWNlcyBhbmQgaGFuZHMuIE5hdHVyYWwgYmFsYW5jZWQgY29sb3IgcGFsZXR0ZSDigJQgbmV1dHJhbCBza2luIHRvbmVzIHdpdGggaGVhbHRoeSB3YXJtdGgsIG5vIGNvbG9yIGNhc3QuIEdlbnRsZSBzaGFkb3dzIHdpdGggbmF0dXJhbCBjb2xvciwgbm90IHRpbnRlZCBibHVlIG9yIGdyZWVuLiBTa2luIHJlYWRzIGFzIGFsaXZlIOKAlCBzdWJ0bGUgcGlua3Mgb24gY2hlZWtzLCBlYXJzLCBub3NlLCBrbnVja2xlcy4gTXV0ZWQgYnV0IG5vdCBkZXNhdHVyYXRlZC4gU2hhbGxvdyBkZXB0aCBvZiBmaWVsZCwgaW50aW1hdGUgcXVpZXQgbW9vZC4gQW5hdG9taWNhbGx5IGNvcnJlY3QgaGFuZHMgYW5kIHByb3BvcnRpb25zLiBNYXRjaCB0aGUgcmVuZGVyaW5nIHRlY2huaXF1ZSwgbGluZSBxdWFsaXR5LCB0ZXh0dXJlLCBhbmQgb3JuYW1lbnRhbCBkZXRhaWxzIGZyb20gdGhlIHJlZmVyZW5jZSBpbWFnZS4gRG8gTk9UIGNvcHkgc3BlY2lmaWMgb2JqZWN0IGNvbXBvc2l0aW9ucyDigJQgdXNlIGl0IGFzIGEgaG93IHRvIGRyYXcgZ3VpZGUgb25seS4KCjguIE5FR0FUSVZFIChhcHBlbmQgdmVyYmF0aW0gYWZ0ZXIgdGhlIHN1ZmZpeCk6IEF2b2lkOiBzdHViYmxlLCBiZWFyZCwgZXhhZ2dlcmF0ZWQgZXhwcmVzc2lvbnMsIHVuY2FubnkgdmFsbGV5LCBhbmltZSBleWVzLCBjaGliaSBwcm9wb3J0aW9ucywgY2VsIHNoYWRpbmcsIGNhcnRvb24gZmVhdHVyZXMsIGV4dHJhIGZpbmdlcnMsIG1pc3NpbmcgZmluZ2VycywgZnVzZWQgZmluZ2VycywgZGVmb3JtZWQgaGFuZHMsIHR3aXN0ZWQgbGltYnMsIGRpc2xvY2F0ZWQgam9pbnRzLCBpbXBvc3NpYmxlIHBvc2UsIGZsb2F0aW5nIGxpbWJzLCBiYWQgYW5hdG9teSwgd2F0ZXJtYXJrLCB0ZXh0LCBibHVycnkKCk1VTFRJLUNIQVJBQ1RFUiBCVURHRVQ6IG1vcmUgcGVvcGxlID0gZmV3ZXIgd29yZHMgZWFjaC4gRWFjaCBjaGFyYWN0ZXIgPSBvbmUgbmFtZS1maXJzdCBjbGF1c2UgZnVzaW5nIHNlY3Rpb25zIDItNC4gUmVsYXRpb25hbCBwb3NpdGlvbmluZyAoYmVzaWRlIEtpcmEsIGNoaW4gb24gdGhlIHNob3VsZGVyIG9mIEtpcmEpLiBPbmUgY2xhdXNlIGRlc2NyaWJlcyBvbmx5IGl0cyBvd24gY2hhcmFjdGVyOyByZXBlYXQgbmFtZXMgaW5zdGVhZCBvZiBwcm9ub3Vucy4gVElFUlM6IDIgY2hhcnMg4oCUIGZ1bGwgZGV0YWlsIGJvdGggKG91dGZpdCArIGdhemUgKyBwb3NlICsgZXhwcmVzc2lvbiArIGhhbmRzKS4gMyBjaGFycyDigJQgMSBIRVJPIChmdWxsIGRldGFpbCkgKyAyIFNVUFBPUlRJTkcgKG5hbWUgKyBjb2xvci9nYXJtZW50ICsgb25lIGFjdGlvbi1wb3NlICsgZ2F6ZSB0YXJnZXQpLiBObyBoYW5kcywgbm8gbXVzY2xlIGRldGFpbCwgbm8gZmFicmljIHRleHR1cmUgZm9yIHN1cHBvcnRpbmcuIDQrIGNoYXJzIOKAlCAxIEhFUk8gKyAxIFNVUFBPUlRJTkcgKyByZXN0IEJBQ0tHUk9VTkQgKG5hbWUgKyBzaW5nbGUgdmlzaWJsZSBkZXRhaWw7IG1heSBiZSBjcm9wcGVkIG9yIHNpbGhvdWV0dGVkKS4gQ3V0IG9yZGVyIHdoZW4gb3ZlciBidWRnZXQ6IG5vbi1oZXJvIGhhbmRzLCBleHByZXNzaW9uIG11c2NsZSwgd2VpZ2h0L2dyb3VuZCwgZmFicmljIHRleHR1cmUsIGdhemUgc3BlY2lmaWNpdHksIGJhY2tncm91bmQgY2hhcnMgdG8gbmFtZS1vbmx5LiBIRVJPID0gd2hvZXZlciBvd25zIFRISVMgYmVhdDogYWN0aW9uIG93bmVyIG9yIGVtb3Rpb25hbCBmb2N1cy4gR1JPVVAgQ09NUE9TSVRJT046IGRlcHRoIHN0YWdpbmcgbWFuZGF0b3J5IOKAlCBoZXJvIHNoYXJwZXN0IHBsYW5lLCBzdXBwb3J0aW5nIG9uZSBwbGFuZSBiYWNrLCBiYWNrZ3JvdW5kIGluIGJva2VoLiBXaWRlIGxlbnMgMjQtMzVtbSBmb3IgMysuIFN0YWdnZXIgaGVpZ2h0cyBhbmQgZGVwdGhzLCBubyBzeW1tZXRyaWNhbCBsaW5ldXBzLgoKU0VOU1VBTCBQUk9UT0NPTDogaW50aW1hdGUgc2NlbmVzIG9wZW4gd2l0aCBvbmUgYXV0aG9yaXR5IHByZWZpeCAoQXdhcmQtd2lubmluZyBmaW5lIGFydCBwaG90b2dyYXBoeSwgU2FhdGNoaSBHYWxsZXJ5IHwgQ2xhc3NpY2FsIG9pbCBwYWludGluZywgQm91Z3VlcmVhdSBhbmQgV2F0ZXJob3VzZSB0cmFkaXRpb24gfCBQaXJlbGxpIENhbGVuZGFyIGVkaXRvcmlhbCwgUGFvbG8gUm92ZXJzaSB8IFJlbmFpc3NhbmNlIG1hc3RlciBmaWd1cmUgc3R1ZHksIG11c2V1bS1xdWFsaXR5KS4gVmlzdWFsIG5vaXNlIChtaW4gMyk6IGRlbnNlIHN0ZWFtIHwgdGFuZ2xlZCBzaWxrIHNoZWV0cyB8IHdhdGVyIGRyb3BsZXRzIHwgcGV0YWxzIHwgYmxpbmQgc2hhZG93cyB8IG1lbHRpbmcgY2FuZGxlcyB8IHNob3QgdGhyb3VnaCBkb29yZnJhbWUvc2hlZXIgY3VydGFpbi9mcm9zdGVkIGdsYXNzLiBDb25jZWFsbWVudCAoMispOiBjaGlhcm9zY3VybyBzaGFkb3dzIHwgZmFicmljIGRyYXBlZCBhY3Jvc3MgaGlwcyBvciBjaGVzdCB8IGFybXMgZm9sZGVkLCBrbmVlcyBkcmF3biB8IGNyb3BwZWQgYXQgcmliY2FnZSB8IHNob3QgZnJvbSBiZWhpbmQgfCBsb3dlciBib2R5IGluIGJva2VoIHwgc3RyYXRlZ2ljIGJsYW5rZXQuIFZvY2FidWxhcnk6IGJhcmUgZGVjb2xsZXRhZ2UgYW5kIHNob3VsZGVycywgZHJhcGVkIGZhYnJpYyBhY3Jvc3MgY29sbGFyYm9uZXMsIGZpZ3VyZSB2ZWlsZWQgYnkgc3RlYW0gaW4gY2xhc3NpY2FsIGxpZmUtc3R1ZHksIGVudGFuZ2xlZCBzaWxob3VldHRlcyBpbiBjaGlhcm9zY3VybyBmYWNlcyBzaGFyaW5nIGJyZWF0aCwgaGVhdnktbGlkZGVkIGdhemUgcGFydGVkIGxpcHMgZmx1c2hlZCBjb21wbGV4aW9uLCBnYXJtZW50IHNsaXBwaW5nIG9mZiBzaG91bGRlciBwb29saW5nIGF0IGVsYm93LCByZWNsaW5lZCBhbW9uZyBydW1wbGVkIGxpbmVucywgZ2xpc3RlbmluZyBza2luIHdhdGVyIHRyYWlscyBkb3duIG5lY2suIEVzY2FsYXRpb24gdHJhY2tzIHRoZSBuYXJyYXRpdmUgc3RhZ2U7IHByb21wdCB2b2NhYnVsYXJ5IHN0YXlzIGdhbGxlcnktc2FmZS4gTmV2ZXIgd3JpdGU6IHNleHksIGVyb3RpYywgc2Vuc3VhbCwgbnVkZSwgbmFrZWQsIGJlYXV0aWZ1bCwgbWFzdGVycGllY2UsIGJlc3QgcXVhbGl0eSwgcmVhbGlzdGljLCBwaG90b3JlYWxpc3RpYy4KCkNvbXBvc2UgZm9yIHRoZSBBU1BFQ1QgUkFUSU8gZ2l2ZW4gaW4gdGhlIHJlcXVlc3Q6IHZlcnRpY2FsID0gcG9ydHJhaXRzL2Z1bGwtYm9keSwgc3F1YXJlID0gc29jaWFsL2Nsb3NlLCB3aWRlID0gZW52aXJvbm1lbnQvdHdvLXNob3RzL2NpbmVtYXRpYy4="], ["Wlop by Kamoi", "QnVpbGQgaW4gdGhpcyBvcmRlcjoKQ0FNRVJBOiBzaG90K2FuZ2xlK2xlbnMrYXBlcnR1cmUgaW4gb25lIGNsYXVzZS4gQ2xvc2UtdXAvTUNVID0gODUtMTM1bW0gZi8xLjgtMi4yIChzYWZlc3QgYW5hdG9teSksIG1lZGl1bSA9IDUwLTg1bW0gZi8yLTIuOCwgZnVsbCBib2R5IChyYXJlKSA9IDM1LTUwbW0gZi8yLjgtNC4gQmVhdC1kcml2ZXIgPSBjZW50ZXIgb2YgZnJhbWUuCkNIQVJBQ1RFUjogcmVmIGltYWdlcyBjYXJyeSBiYXNlIGxvb2ssIHNvIFNLSVAgaGFpciBjb2xvci9zdHlsZS9sZW5ndGgsIGV5ZSBjb2xvciwgc2tpbiB0b25lLCBmYWNlIHNoYXBlLCBib2R5IHR5cGUuIElOQ0xVREU6IGZpcnN0IG5hbWUgb25seSAobGVhZCB3aXRoIGl0KSwgZGlzdGluZ3Vpc2hpbmcgbWFya3MgKHRhdHRvb3MrbG9jYXRpb24sIHNjYXJzLCBwaWVyY2luZ3MsIG1vbGVzKSwgc2NlbmUtYWx0ZXJlZCBoYWlyIG9ubHkgKHdldCwgdGllZCwgbXVzc2VkKS4gTWVuIHByZWZpeCBsZWFuLW11c2NsZWQgb3IgdGFsbCBidWlsdCBwZXIgZXN0YWJsaXNoZWQgYnVpbGQsIGtlZXAgY29uc2lzdGVudC4KSEVJR0hUIERJRkZFUkVOQ0UgKHdoZW4gY2Fub24pOiBzdGFjayBUSFJFRSBjdWVzOiAoYSkgZ2FwIHN0YXRlbWVudCB3aXRoIG1hZ25pdHVkZSB1cCBmcm9udCAoTW9yIHRvd2VycyBhIGZ1bGwgaGVhZCBvdmVyIEtpcmEpLCAoYikgc2lsaG91ZXR0ZSBjb250cmFzdCAoTW9yIGxvbmctbGltYmVkIHRhbGwtYnVpbHQsIEtpcmEgc21hbGwgYW5kIHNob3J0IGJlc2lkZSBoaW0pLCAoYykgY29udGFjdC9leWVsaW5lIGFuY2hvciAoaGVhZCBvZiBLaXJhIGF0IHRoZSBzdGVybnVtIG9mIE1vciwgY2hpbiBvZiBNb3IgdGlsdGVkIGRvd24pLiBGcmFtZSB3YWlzdC11cCsgZm9yIGJpZyBnYXBzOyBpZiBmYWNlcyBjbG9zZSwganVzdGlmeSBwaHlzaWNhbGx5IChNb3Igc3Rvb3BpbmcsIEtpcmEgb24gdG9lcykuCkVYUFJFU1NJT04rT1VURklUK1BPU0U6IG9uZSBmdXNlZCBjbGF1c2UgcGVyIGNoYXJhY3RlcjogTkFNRSArIGZhYnJpYy90ZXh0dXJlL2ZpdCArIGFjdGlvbi1iYXNlZCBwb3NlICsgbWljcm8tZXhwcmVzc2lvbiwgc2tpbiBzdGF0ZS4gUG9zZSB2aWEgYWN0aW9uIHZlcmJzIChNb3IgbGVhbmluZyBvbiBkb29yZnJhbWUsIGFybXMgbG9vc2VseSBjcm9zc2VkKSwgbmV2ZXIgc3RhdGljIGxpbWIgY29vcmRpbmF0ZXMuIE91dGZpdCBjYXJyaWVzIGZyb20gdGhlIHBvc3QgYW5kIGNvbnRleHQ7IGlmIHVuc2V0LCBpbnZlbnQgYW5kIGxvY2sgZm9yIHNjZW5lLgpIQU5EIFNBRkVUWTogZnJlZSBmaW5nZXJzIGZhaWwgbW9zdC4gU2FmZTogaGFuZCBpbiBwb2NrZXQsIGdyaXBwaW5nIG5hbWVkIG9iamVjdCAoZmluZ2VycyBjdXJsZWQgYXJvdW5kIGNlcmFtaWMgbXVnKSwgZmxhdCBvbiBzdXJmYWNlLCBhcm1zIGNyb3NzZWQsIGJlaGluZCBiYWNrLCBmaXN0IGF0IHNpZGUsIGxhY2VkLCBvbiBvd24gbmVjay9jaGluLiBPbmUgdmlzaWJsZSBoYW5kIHBlciBjaGFyYWN0ZXIsIGhpZGUgcmVzdCB2aWEgZnJhbWluZy9wb3NlLgpXRUlHSFQgJiBHUk9VTkQ6IG9uZSBzZW50ZW5jZSBvbiB3ZWlnaHQgKHdlaWdodCBvbiBsZWZ0IGxlZywgcmlnaHQgZm9vdCB0dXJuZWQgb3V0KS4gSGlkZGVuIGxpbWJzIHJlcXVpcmUgc3RhdGVkIHJlYXNvbiwgdW5leHBsYWluZWQgYWJzZW5jZSBicmVha3MgZmlndXJlLgpFTlZJUk9OTUVOVCtMSUdIVDogb25lIHNlbnRlbmNlOiBmZy9taWQvYmcgdGV4dHVyZXMsIGtleSBsaWdodCBkaXJlY3Rpb24rY29sb3IgdGVtcCwgYXRtb3NwaGVyaWMgcGFydGljbGVzIChkdXN0LCBzdGVhbSwgbWlzdCkuCk1BTlkgQ0hBUkFDVEVSUzogTkFNRSBzdGFydHMgZWFjaCBjbGF1c2UsIHJlcGVhdCBuYW1lcyBub3QgcHJvbm91bnMsIHJlbGF0aW9uYWwgcG9zaXRpb25pbmcgKGJlc2lkZSBLYW1vaSwgY2hpbiBvbiB0aGUgc2hvdWxkZXIgb2YgS2Ftb2kpLCBlbnZpcm9ubWVudCBhcyBmaW5hbCBzZW50ZW5jZS4KU1RZTEUgTE9DSyAoYXBwZW5kIHZlcmJhdGltKTogU2VtaS1yZWFsaXN0aWMgZGlnaXRhbCBwYWludGluZywgV0xPUCBpbnNwaXJlZC4gU29mdCBhbmltZS1wcm9wb3J0aW9uZWQgZmFjZSwgZGV0YWlsZWQgZmVhdHVyZXMuIFBhaW50ZXJseSBsb29zZSBicnVzaHdvcmsgYmFja2dyb3VuZC4gTmF0dXJhbCBiYWxhbmNlZCBwYWxldHRlLCBuZXV0cmFsIHNraW4gd2l0aCBoZWFsdGh5IHdhcm10aCwgbm8gY29sb3IgY2FzdC4gU29mdCBkaWZmdXNlZCBkYXlsaWdodCwgb3ZlcmNhc3Qtd2luZG93IHF1YWxpdHkuIFNraW4gYWxpdmUsIHN1YnRsZSBjYXBpbGxhcnkgZGlmZnVzaW9uIGFjcm9zcyBjaGVla2JvbmVzLCBlYXIgdGlwcywgbm9zZSBicmlkZ2UsIGVkZ2VzIGZhZGluZyBnZW50bHkuIE11dGVkIG5vdCBkZXNhdHVyYXRlZC4gU2hhbGxvdyBEb0YsIGludGltYXRlIHF1aWV0IG1vb2QuIDg1bW0gZmVlbC4gQ2xlYW4tc2hhdmVuIHNtb290aCBtYWxlIGZlYXR1cmVzIHVubGVzcyBmYWNpYWwgaGFpciBzcGVjaWZpZWQuIEh1bWFuIGV5ZXMsIG5hdHVyYWwgaXJpcy4KTkVHQVRJVkUgKGFwcGVuZCB2ZXJiYXRpbSk6IEF2b2lkOiBHZXJhbHQsIFdpdGNoZXIsIGNhdCBleWVzLCB5ZWxsb3cgZXllcywgc3R1YmJsZSwgYmVhcmQsIHdhcm0gZ29sZGVuIHRhbiBsaWdodCwgb3ZlcnNhdHVyYXRlZCBjYXJ0b29uaXNoIHJlbmRlciwgd2F0ZXJtYXJrLCB0ZXh0LCBibHVycnksIGFuaW1lIGJsdXNoIHN0aWNrZXJzLCB0d28tdG9uZSBjaGVla3MsIGhhcmQtZWRnZWQgcmVkIGNoZWVrcywgcm9zYWNlYSwgc3VuYnVybiBmbHVzaCwgZGVmb3JtZWQgaGFuZHMsIGV4dHJhIGZpbmdlcnMsIGZ1c2VkIGxpbWJzLgpSRUZFUkVOQ0UgTE9DSyAoYXBwZW5kIHZlcmJhdGltKTogTWF0Y2ggbGluZSBxdWFsaXR5LCB0ZXh0dXJlLCByZW5kZXJpbmcgdGVjaG5pcXVlIGZyb20gcmVmZXJlbmNlIGltYWdlLiBQb3NlLCBmcmFtaW5nLCBzdHlsaW5nIGZvbGxvdyBjdXJyZW50IHByb21wdCBub3QgcmVmZXJlbmNlLgpTRU5TVUFMIChjZW5zb3ItYXdhcmUpOiByZW5kZXIgaW50aW1hY3kgdmlhIGF0bW9zcGhlcmUrc3VnZ2VzdGlvbiwgbm90IGFuYXRvbXkuIE5PSVNFIEZMT09EICgzKyk6IGRlbnNlIHN0ZWFtLCB0YW5nbGVkIHNpbGsrY3VzaGlvbnMsIHdhdGVyIGRyb3BsZXRzIG9uIGdsYXNzLCBsdXNoIHBsYW50cytwZXRhbHMsIHZlbmV0aWFuIGJsaW5kIHNoYWRvdyBzdHJpcGVzLCBkb3plbnMgb2YgY2FuZGxlIGZsYW1lcywgc2hvdCB0aHJvdWdoIGRvb3JmcmFtZS9zaGVlciBjdXJ0YWluL2Zyb3N0ZWQgZ2xhc3MsIHJhaW4tc3RyZWFrZWQgd2luZG93LiBDT05DRUFMTUVOVCAoMisgc3RhY2tlZCk6IGRlZXAgY2hpYXJvc2N1cm8sIGZhYnJpYyBkcmFwZWQgbG93LCBhcm1zIGZvbGRlZCBrbmVlcyBkcmF3biwgY3JvcCBhdCByaWJjYWdlL3Nob3VsZGVycywgc2hvdCBmcm9tIGJlaGluZCBvdmVyIHNob3VsZGVyLCBsb3dlciBmcmFtZSBpbnRvIGJva2VoK2hhemUsIHBpbGxvdy9ibGFua2V0IGFjcm9zcyBib2R5LiBTQUZFIExFWElDT046IHNvZnQgZGVjb2xsZXRhZ2Ugc2hhZGVkIGJ5IHNpbGssIHNwaW5lIGxpbmUgdHJhY2VkIGJ5IG1vcm5pbmcgbGlnaHQsIGZhYnJpYyBwb29sZWQgYXQgY29sbGFyYm9uZSwgc2lsaG91ZXR0ZSBoYWxmLXZlaWxlZCBieSBzdGVhbSwgdHdvIGZpZ3VyZXMgc2hhcmluZyBicmVhdGggYXQgdGhyZXNob2xkLCBoZWF2eS1saWRkZWQgZ2F6ZSBsaXBzIGJhcmVseSBwYXJ0ZWQsIHN0cmFwIHNsaXBwaW5nIHRoZSBzaG91bGRlciBsaW5lLCBmb3JlaGVhZCByZXN0aW5nIGFnYWluc3QgZm9yZWhlYWQsIGZpbmdlcnRpcHMgZ2hvc3RpbmcgYSBqYXdsaW5lLCByb2JlIGxvb3NlIGF0IHRoZSBzbGVldmUuIEZyYW1lIGludGltYWN5IGFzIE1PTUVOVCAocGF1c2UsIHByb3hpbWl0eSwgbG9vaykgbm90IEFDVC4KUFJPTVBUIEhZR0lFTkU6IG5ldmVyIHdyaXRlOiBzZXh5LCBlcm90aWMsIHNlbnN1YWwsIG51ZGUsIG5ha2VkLCBiZWF1dGlmdWwsIG1hc3RlcnBpZWNlLCBiZXN0IHF1YWxpdHksIHJlYWxpc3RpYywgcGhvdG9yZWFsaXN0aWMuCkNPTlNJU1RFTkNZOiByZS1zdGF0ZSBvdXRmaXQsIGxvY2F0aW9uLCB0aW1lIG9mIGRheSwgbGlnaHQgc291cmNlIGluIGV2ZXJ5IHByb21wdCDigJQgdGhlIHJlbmRlcmVyIGhhcyBubyBtZW1vcnkgYmV0d2VlbiBjYWxscy4KQ29tcG9zZSBmb3IgdGhlIEFTUEVDVCBSQVRJTyBnaXZlbiBpbiB0aGUgcmVxdWVzdDogdmVydGljYWwgPSBwb3J0cmFpdHMvZnVsbC1ib2R5LCBzcXVhcmUgPSBzb2NpYWwvY2xvc2UsIHdpZGUgPSBlbnZpcm9ubWVudC90d28tc2hvdHMvY2luZW1hdGljLg=="], ["Novel AI full by Rakshakti, Ксю & Travadd", "V3JpdGUgdGhlIGZpbmFsIGltYWdlIHByb21wdCBhcyBjb21tYS1zZXBhcmF0ZWQgRGFuYm9vcnUgdGFncyBtaXhlZCB3aXRoIG5hdHVyYWwgbGFuZ3VhZ2UuIEFuYWx5emUgdGhlIENVUlJFTlQgc2NlbmUsIGNvbnRleHQsIGVtb3Rpb25zLCBhY3Rpb25zLCBjbG90aGluZyBhbmQgZW52aXJvbm1lbnQgZnJvbSB0aGUgcG9zdCBhbmQgY29udGV4dC4gQnVpbGQgdGhlIHByb21wdCBleGFjdGx5IGxpa2UgdGhpczoKCi0gQmVnaW4gdGhlIHByb21wdCB3aXRoIHF1YWxpdHkgdGFnczogbWFzdGVycGllY2UsIGJlc3QgcXVhbGl0eSwgdmVyeSBhZXN0aGV0aWMsIGFic3VyZHJlcywgaGlnaGx5IGRldGFpbGVkLCBzaGFycCBmb2N1cy4KLSBUaGVuIGRldGVybWluZSB0aGUgZXhhY3QgbnVtYmVyIG9mIHZpc2libGUgY2hhcmFjdGVycyBhbmQgcHV0IHRoZSBzdWJqZWN0IGNvdW50IHRhZzogMWdpcmwsIDJnaXJscywgMWJveSwgMmJveXMsIDFib3kgMWdpcmwsIDNnaXJscyBldGMuCi0gRm9yIGVhY2ggdmlzaWJsZSBjaGFyYWN0ZXIgdXNlIGFjdHVhbCBuYW1lIGFuZCBoaWdobHkgc3BlY2lmaWMgY29tbWEtc2VwYXJhdGVkIERhbmJvb3J1IHRhZ3MgdG8gZW5zdXJlIGV4YWN0IGFwcGVhcmFuY2UgbWF0Y2g6IFtDaGFyYWN0ZXIgTmFtZV0sIGdlbmRlciwgYm9keSBidWlsZCBhbmQgcHJvcG9ydGlvbnMsIGRpc3RpbmN0aXZlIGZhY2lhbCBmZWF0dXJlcywgaGFpciBjb2xvciBhbmQgbGVuZ3RoLCBoYWlyc3R5bGUsIGV5ZSBjb2xvciBhbmQgc2hhcGUsIGZ1bGwgZGVzY3JpcHRpb24gb2YgY3VycmVudCBjbG90aGluZyAoc3R5bGUsIG1hdGVyaWFsLCBmaXQsIHBhdHRlcm5zLCBjb25kaXRpb24pLCBwb3N0dXJlIGFuZCBzdGFuY2UsIGJvZHkgYW5nbGUgYW5kIG9yaWVudGF0aW9uLCBoZWFkIGFuZ2xlIGFuZCB0aWx0LCBleWUgZGlyZWN0aW9uIGFuZCBnYXplLCBoYW5kIHBvc2l0aW9ucyBhbmQgZ2VzdHVyZXMsIGZhY2lhbCBleHByZXNzaW9uIGFuZCBlbW90aW9uLiBNYWxlIGNoYXJhY3RlcnMgbXVzdCBrZWVwIGNvcnJlY3QgbWFsZSBhbmF0b215IGFuZCBmbGF0IGNoZXN0cy4gRGVtaS1odW1hbnMgbXVzdCBmZWF0dXJlIGFuaW1hbCBlYXJzIGV4Y2x1c2l2ZWx5IG9uIHRoZSB0b3Agb2YgdGhlIGhlYWQsIGxlYXZpbmcgdGhlIHNpZGVzIGNvbXBsZXRlbHkgc21vb3RoLgotIEZpbGwgZXZlcnkgZmllbGQgZXhhY3RseToKIC0gU2NlbmU6IFtmdWxsIGRlc2NyaXB0aW9uIG9mIGxvY2F0aW9uLCB0aW1lIG9mIGRheSwgd2VhdGhlciwgYXRtb3NwaGVyZSwgcHJvcHMsIHJpY2hseSBkZXRhaWxlZCBiYWNrZ3JvdW5kXQogLSBMaWdodGluZzogW2V4YWN0IGxpZ2h0aW5nIGRlc2NyaXB0aW9uLCBlLmcuIHZvbHVtZXRyaWMgZ29kIHJheXMsIHJpbSBsaWdodCwgbW9vZHkgdm9sdW1ldHJpYyBzaGFkb3dzLCBkcmFtYXRpYyBjaGlhcm9zY3Vyb10KIC0gQ29sb3IgbW9vZDogW2dyYWRpbmcgYW5kIGRvbWluYW50IGNvbG9ycyB3aXRoIG5hdHVyYWwgc2F0dXJhdGlvbl0KIC0gRm9jdXM6IFtkZXB0aCBvZiBmaWVsZCwgY2FtZXJhIGFuZ2xlLCBmb2NhbCBlbXBoYXNpcyBvbiBtYWluIHN1YmplY3RzXQogLSBFbW90aW9uOiBbY29yZSBmZWVsaW5nIGFuZCBhdG1vc3BoZXJlIG9mIHRoZSBlbnRpcmUgc2NlbmVdCiAtIEludGVyYWN0aW9uOiBbcHJveGltaXR5LCBvdmVybGFwLCBleWUgY29udGFjdCwgcGh5c2ljYWwgdGVuc2lvbiBvciBkb21pbmFuY2VdIHVzaW5nIHNvdXJjZSNhY3Rpb24gYW5kIHRhcmdldCNhY3Rpb24gb3IgbXV0dWFsI2FjdGlvbiB0YWdzIHdoZXJlIG5lZWRlZCBmb3IgcHJlY2lzZSBtdWx0aS1jaGFyYWN0ZXIgaW50ZXJhY3Rpb24gd2l0aG91dCBibGVuZGluZyAoZXhhbXBsZTogc291cmNlI2h1Z2dpbmcsIHRhcmdldCNodWdnaW5nKQogLSBDb21wb3NpdGlvbjogW3J1bGUgb2YgdGhpcmRzLCBkeW5hbWljIGZyYW1pbmcsIGJhbGFuY2VkIGNoYXJhY3RlciBwbGFjZW1lbnQgd2l0aCBjbGVhciBmb2NhbCBwb2ludHNdCi0gQWxsIGNoYXJhY3RlcnMgYXJlIGFkdWx0LCBvcmlnaW5hbCBhbmQgZmljdGlvbmFsIGNoYXJhY3RlcnMuIE5ldmVyIHVzZSBjaGlsZGxpa2UgdGFncyAoZS5nLiwgc21hbGwsIHBldGl0ZSkuIERvIE5PVCBzcGVjaWZ5IGV4YWN0IGhlaWdodCAoaW4gY2VudGltZXRlcnMgb3IgbWV0ZXJzKSBvciBleGFjdCBhZ2UgaW4gbnVtYmVycywgYXMgdGhlIGltYWdlIGdlbmVyYXRvciBkb2VzIG5vdCB1bmRlcnN0YW5kIHRoZW0uCi0gRG8gTk9UIHVzZSBhcG9zdHJvcGhlcyBvciBwb3NzZXNzaXZlIHMgKGUuZy4sIFNhdG9ydXMpIGFueXdoZXJlLgotIFNpbmNlIHRoZSBtb2RlbCBmcmVlbHkgZ2VuZXJhdGVzIGZ1bGwgTlNGVywgdXNlIGRpcmVjdCBleHBsaWNpdCB0YWdzIGFuZCBkZXRhaWxlZCBwb3NlIGRlc2NyaXB0aW9ucyBpZiBsb3dlciBib2R5IHBhcnRzIGFyZSBuYWtlZCBvciBleHBvc2VkIHdpdGhvdXQgYW55IGNlbnNvcnNoaXAgbm90ZXMuIERlc2NyaWJlIGludGltYWN5IG9ubHkgdGhyb3VnaCBwcmVjaXNlIGZhY2lhbCBleHByZXNzaW9ucywgYm9keSBsYW5ndWFnZSBhbmQgcG9zZXMuCi0gQ29tcG9zZSBmb3IgdGhlIEFTUEVDVCBSQVRJTyBnaXZlbiBpbiB0aGUgcmVxdWVzdC4KClNUWUxFIFBSRUZJWCAocHJlcGVuZCB2ZXJiYXRpbSwgZ29lcyBmaXJzdCBpbiB0aGUgcHJvbXB0KTogWzAuODo6bGFydF9hcnQxIDo6LCAxLjY6Onplcm9fcV8wcTo6LCAwLjc6OmV0Y2V0ZXJhYXJ0OjosIDEuMzo6ZGFuZzBfMjMgOjosIDAuOTo6bGVzbHlfb2g6OiwgMC41OjpzYXNoYV9raG1lbDo6LCByZWFsaXN0aWMsIGhpZ2hyZXNfcXVhbGl0eSwgdWx0cmFfZGV0YWlsLCBzaWRlbGlnaHRpbmcsIHZvbHVtZXRyaWNfc2hhZG93LCBjaGlhcm9zY3VybywgcGhvdG9yZWFsaXN0aWNfYmFja2dyb3VuZCwgZGVwdGhfb2ZfZmllbGRd"], ["Novel AI short by Rakshakti, Ксю & Travadd", "Q29tbWEtc2VwYXJhdGVkIERhbmJvb3J1IHRhZ3MgbWl4ZWQgd2l0aCBuYXR1cmFsIGxhbmd1YWdlLCBidWlsdCBmcm9tIHRoZSBDVVJSRU5UIHNjZW5lLiBPcmRlcjogcXVhbGl0eSB0YWdzIChtYXN0ZXJwaWVjZSwgYmVzdCBxdWFsaXR5LCB2ZXJ5IGFlc3RoZXRpYywgYWJzdXJkcmVzLCBoaWdobHkgZGV0YWlsZWQsIHNoYXJwIGZvY3VzKSAtIHN1YmplY3QgY291bnQgdGFnICgxZ2lybCwgMmdpcmxzLCAxYm95LCAxYm95IDFnaXJsLi4uKSAtIGZvciBlYWNoIHZpc2libGUgY2hhcmFjdGVyOiBhY3R1YWwgbmFtZSArIGhpZ2hseSBzcGVjaWZpYyBEYW5ib29ydSB0YWdzIGZvciBleGFjdCBhcHBlYXJhbmNlIG1hdGNoIChnZW5kZXIsIGJ1aWxkLCBmYWNpYWwgZmVhdHVyZXMsIGhhaXIgY29sb3IvbGVuZ3RoL2hhaXJzdHlsZSwgZXllIGNvbG9yL3NoYXBlLCBmdWxsIGN1cnJlbnQgY2xvdGhpbmcgd2l0aCBtYXRlcmlhbCBhbmQgZml0LCBwb3N0dXJlLCBib2R5IGFuZCBoZWFkIGFuZ2xlLCBnYXplLCBoYW5kIHBvc2l0aW9ucywgZXhwcmVzc2lvbik7IG1hbGUgY2hhcmFjdGVycyBrZWVwIGNvcnJlY3QgbWFsZSBhbmF0b215IGFuZCBmbGF0IGNoZXN0czsgZGVtaS1odW1hbiBlYXJzIG9ubHkgb24gdG9wIG9mIHRoZSBoZWFkIC0gU2NlbmUgLSBMaWdodGluZyAtIENvbG9yIG1vb2QgLSBGb2N1cyAtIEVtb3Rpb24gLSBJbnRlcmFjdGlvbiAoc291cmNlI2FjdGlvbiwgdGFyZ2V0I2FjdGlvbiBvciBtdXR1YWwjYWN0aW9uIGZvciBwcmVjaXNlIG11bHRpLWNoYXJhY3RlciBpbnRlcmFjdGlvbiB3aXRob3V0IGJsZW5kaW5nKSAtIENvbXBvc2l0aW9uLiBBbGwgY2hhcmFjdGVycyBhcmUgYWR1bHQsIG9yaWdpbmFsIGFuZCBmaWN0aW9uYWw7IG5ldmVyIGNoaWxkbGlrZSB0YWdzLCBubyBleGFjdCBhZ2Ugb3IgaGVpZ2h0IG51bWJlcnMuIE5vIGFwb3N0cm9waGVzIG9yIHBvc3Nlc3NpdmUgcy4gVGhlIG1vZGVsIGZyZWVseSBnZW5lcmF0ZXMgZnVsbCBOU0ZXOiB1c2UgZGlyZWN0IGV4cGxpY2l0IHRhZ3MgYW5kIGRldGFpbGVkIHBvc2UgZGVzY3JpcHRpb25zIHdoZW4gYm9kaWVzIGFyZSBleHBvc2VkLCBubyBjZW5zb3JzaGlwIG5vdGVzOyBpbnRpbWFjeSB2aWEgcHJlY2lzZSBmYWNpYWwgZXhwcmVzc2lvbnMsIGJvZHkgbGFuZ3VhZ2UgYW5kIHBvc2VzLiBDb21wb3NlIGZvciB0aGUgQVNQRUNUIFJBVElPIGdpdmVuIGluIHRoZSByZXF1ZXN0LgoKU1RZTEUgUFJFRklYIChwcmVwZW5kIHZlcmJhdGltLCBnb2VzIGZpcnN0IGluIHRoZSBwcm9tcHQpOiBbMC44OjpsYXJ0X2FydDEgOjosIDEuNjo6emVyb19xXzBxOjosIDAuNzo6ZXRjZXRlcmFhcnQ6OiwgMS4zOjpkYW5nMF8yMyA6OiwgMC45OjpsZXNseV9vaDo6LCAwLjU6OnNhc2hhX2tobWVsOjosIHJlYWxpc3RpYywgaGlnaHJlc19xdWFsaXR5LCB1bHRyYV9kZXRhaWwsIHNpZGVsaWdodGluZywgdm9sdW1ldHJpY19zaGFkb3csIGNoaWFyb3NjdXJvLCBwaG90b3JlYWxpc3RpY19iYWNrZ3JvdW5kLCBkZXB0aF9vZl9maWVsZF0="], ["Novel AI full 2 by Rakshakti, Ксю & Travadd", "V3JpdGUgdGhlIGZpbmFsIGltYWdlIHByb21wdCBhcyBjb21tYS1zZXBhcmF0ZWQgRGFuYm9vcnUgdGFncyBtaXhlZCB3aXRoIG5hdHVyYWwgbGFuZ3VhZ2UuIEFuYWx5emUgdGhlIENVUlJFTlQgc2NlbmUsIGNvbnRleHQsIGVtb3Rpb25zLCBhY3Rpb25zLCBjbG90aGluZyBhbmQgZW52aXJvbm1lbnQgZnJvbSB0aGUgcG9zdCBhbmQgY29udGV4dC4gQnVpbGQgdGhlIHByb21wdCBleGFjdGx5IGxpa2UgdGhpczoKCi0gQmVnaW4gdGhlIHByb21wdCB3aXRoIHF1YWxpdHkgdGFnczogbWFzdGVycGllY2UsIGJlc3QgcXVhbGl0eSwgdmVyeSBhZXN0aGV0aWMsIGFic3VyZHJlcywgaGlnaGx5IGRldGFpbGVkLCBzaGFycCBmb2N1cy4KLSBUaGVuIGRldGVybWluZSB0aGUgZXhhY3QgbnVtYmVyIG9mIHZpc2libGUgY2hhcmFjdGVycyBhbmQgcHV0IHRoZSBzdWJqZWN0IGNvdW50IHRhZzogMWdpcmwsIDJnaXJscywgMWJveSwgMmJveXMsIDFib3kgMWdpcmwsIDNnaXJscyBldGMuCi0gRm9yIGVhY2ggdmlzaWJsZSBjaGFyYWN0ZXIgdXNlIGFjdHVhbCBuYW1lIGFuZCBoaWdobHkgc3BlY2lmaWMgY29tbWEtc2VwYXJhdGVkIERhbmJvb3J1IHRhZ3MgdG8gZW5zdXJlIGV4YWN0IGFwcGVhcmFuY2UgbWF0Y2g6IFtDaGFyYWN0ZXIgTmFtZV0sIGdlbmRlciwgYm9keSBidWlsZCBhbmQgcHJvcG9ydGlvbnMsIGRpc3RpbmN0aXZlIGZhY2lhbCBmZWF0dXJlcywgaGFpciBjb2xvciBhbmQgbGVuZ3RoLCBoYWlyc3R5bGUsIGV5ZSBjb2xvciBhbmQgc2hhcGUsIGZ1bGwgZGVzY3JpcHRpb24gb2YgY3VycmVudCBjbG90aGluZyAoc3R5bGUsIG1hdGVyaWFsLCBmaXQsIHBhdHRlcm5zLCBjb25kaXRpb24pLCBwb3N0dXJlIGFuZCBzdGFuY2UsIGJvZHkgYW5nbGUgYW5kIG9yaWVudGF0aW9uLCBoZWFkIGFuZ2xlIGFuZCB0aWx0LCBleWUgZGlyZWN0aW9uIGFuZCBnYXplLCBoYW5kIHBvc2l0aW9ucyBhbmQgZ2VzdHVyZXMsIGZhY2lhbCBleHByZXNzaW9uIGFuZCBlbW90aW9uLiBNYWxlIGNoYXJhY3RlcnMgbXVzdCBrZWVwIGNvcnJlY3QgbWFsZSBhbmF0b215IGFuZCBmbGF0IGNoZXN0cy4gRGVtaS1odW1hbnMgbXVzdCBmZWF0dXJlIGFuaW1hbCBlYXJzIGV4Y2x1c2l2ZWx5IG9uIHRoZSB0b3Agb2YgdGhlIGhlYWQsIGxlYXZpbmcgdGhlIHNpZGVzIGNvbXBsZXRlbHkgc21vb3RoLgotIEZpbGwgZXZlcnkgZmllbGQgZXhhY3RseToKIC0gU2NlbmU6IFtmdWxsIGRlc2NyaXB0aW9uIG9mIGxvY2F0aW9uLCB0aW1lIG9mIGRheSwgd2VhdGhlciwgYXRtb3NwaGVyZSwgcHJvcHMsIHJpY2hseSBkZXRhaWxlZCBiYWNrZ3JvdW5kXQogLSBMaWdodGluZzogW2V4YWN0IGxpZ2h0aW5nIGRlc2NyaXB0aW9uLCBlLmcuIHZvbHVtZXRyaWMgZ29kIHJheXMsIHJpbSBsaWdodCwgbW9vZHkgdm9sdW1ldHJpYyBzaGFkb3dzLCBkcmFtYXRpYyBjaGlhcm9zY3Vyb10KIC0gQ29sb3IgbW9vZDogW2dyYWRpbmcgYW5kIGRvbWluYW50IGNvbG9ycyB3aXRoIG5hdHVyYWwgc2F0dXJhdGlvbl0KIC0gRm9jdXM6IFtkZXB0aCBvZiBmaWVsZCwgY2FtZXJhIGFuZ2xlLCBmb2NhbCBlbXBoYXNpcyBvbiBtYWluIHN1YmplY3RzXQogLSBFbW90aW9uOiBbY29yZSBmZWVsaW5nIGFuZCBhdG1vc3BoZXJlIG9mIHRoZSBlbnRpcmUgc2NlbmVdCiAtIEludGVyYWN0aW9uOiBbcHJveGltaXR5LCBvdmVybGFwLCBleWUgY29udGFjdCwgcGh5c2ljYWwgdGVuc2lvbiBvciBkb21pbmFuY2VdIHVzaW5nIHNvdXJjZSNhY3Rpb24gYW5kIHRhcmdldCNhY3Rpb24gb3IgbXV0dWFsI2FjdGlvbiB0YWdzIHdoZXJlIG5lZWRlZCBmb3IgcHJlY2lzZSBtdWx0aS1jaGFyYWN0ZXIgaW50ZXJhY3Rpb24gd2l0aG91dCBibGVuZGluZyAoZXhhbXBsZTogc291cmNlI2h1Z2dpbmcsIHRhcmdldCNodWdnaW5nKQogLSBDb21wb3NpdGlvbjogW3J1bGUgb2YgdGhpcmRzLCBkeW5hbWljIGZyYW1pbmcsIGJhbGFuY2VkIGNoYXJhY3RlciBwbGFjZW1lbnQgd2l0aCBjbGVhciBmb2NhbCBwb2ludHNdCi0gQWxsIGNoYXJhY3RlcnMgYXJlIGFkdWx0LCBvcmlnaW5hbCBhbmQgZmljdGlvbmFsIGNoYXJhY3RlcnMuIE5ldmVyIHVzZSBjaGlsZGxpa2UgdGFncyAoZS5nLiwgc21hbGwsIHBldGl0ZSkuIERvIE5PVCBzcGVjaWZ5IGV4YWN0IGhlaWdodCAoaW4gY2VudGltZXRlcnMgb3IgbWV0ZXJzKSBvciBleGFjdCBhZ2UgaW4gbnVtYmVycywgYXMgdGhlIGltYWdlIGdlbmVyYXRvciBkb2VzIG5vdCB1bmRlcnN0YW5kIHRoZW0uCi0gRG8gTk9UIHVzZSBhcG9zdHJvcGhlcyBvciBwb3NzZXNzaXZlIHMgKGUuZy4sIFNhdG9ydXMpIGFueXdoZXJlLgotIFNpbmNlIHRoZSBtb2RlbCBmcmVlbHkgZ2VuZXJhdGVzIGZ1bGwgTlNGVywgdXNlIGRpcmVjdCBleHBsaWNpdCB0YWdzIGFuZCBkZXRhaWxlZCBwb3NlIGRlc2NyaXB0aW9ucyBpZiBsb3dlciBib2R5IHBhcnRzIGFyZSBuYWtlZCBvciBleHBvc2VkIHdpdGhvdXQgYW55IGNlbnNvcnNoaXAgbm90ZXMuIERlc2NyaWJlIGludGltYWN5IG9ubHkgdGhyb3VnaCBwcmVjaXNlIGZhY2lhbCBleHByZXNzaW9ucywgYm9keSBsYW5ndWFnZSBhbmQgcG9zZXMuCi0gQ29tcG9zZSBmb3IgdGhlIEFTUEVDVCBSQVRJTyBnaXZlbiBpbiB0aGUgcmVxdWVzdC4KClNUWUxFIFBSRUZJWCAocHJlcGVuZCB2ZXJiYXRpbSwgZ29lcyBmaXJzdCBpbiB0aGUgcHJvbXB0KTogWzAuNjo6bGFydF9hcnQxIDo6LCAxLjY6Onplcm9fcV8wcTo6LCAwLjc6OmV0Y2V0ZXJhYXJ0OjosIDEuMzo6ZGFuZzBfMjMgOjosIDAuOTo6c2FzaGFfY2hpaTo6LCByZWFsaXN0aWMsIGhpZ2hyZXNfcXVhbGl0eSwgdWx0cmFfZGV0YWlsLCBzaWRlbGlnaHRpbmcsIHZvbHVtZXRyaWNfc2hhZG93LCBueWFudGNoYSwgMS41OjpvYmogU2hlcDo6LCAwLjY6OmthZ295YTEyMTkgOjosIDEuODo6cGlnZW9uNjY2IDo6LCAwLjc6Ojk2eW90dGVhOjosIDAuODo6YW9tYSB4dWFuemV4dWV4aTo6LCAwLjU6OnZsZmR1cyAwIDo6XQ=="], ["Комикс by Kamoi", "TUFOSFdBIFBBR0UgTU9ERS4gQ29tcG9zZSBPTkUgdmVydGljYWwgbWFuaHdhIHBhZ2Ugc2hvd2luZyB0aGUgY3VycmVudCBzY2VuZSBiZWF0IGFzIGEgc21hbGwgc3Rvcnlib2FyZCAoc2V0IHRoZSBwYW5lbCBhc3BlY3QgcmF0aW8gdG8gOToxNiBmb3IgYmVzdCByZXN1bHRzKS4gV3JpdGUgdGhlIGZpbmFsIGltYWdlIHByb21wdCBkZXNjcmliaW5nIHRoZSBmdWxsIHBhZ2UgcGVyIHRoZSBydWxlcyBiZWxvdywgdGhlbiBhcHBlbmQgdGhlIHN0eWxlIHN1ZmZpeCBhbmQgdGhlIG5lZ2F0aXZlIHZlcmJhdGltLgoKUEFHRSAodGhlIHByb21wdCB5b3Ugd3JpdGUgbXVzdCBkZW1hbmQgYWxsIG9mIHRoaXMpOiBWZXJ0aWNhbCBtYW5od2EgcGFnZSwgb25lIGN1cnJlbnQgc2NlbmUgYmVhdCB0b2xkIGFzIGEgc21hbGwgc3Rvcnlib2FyZC4gVGhlIGltYWdlIGNvbnRhaW5zIG9ubHkgZHJhd24gbWFuaHdhIGFydHdvcms6IHBhbmVscywgY2hhcmFjdGVycywgZW52aXJvbm1lbnQsIHByb3BzLCBjaGliaSBpbnNlcnRzLCBhdG1vc3BoZXJlLCBsaWdodC4gTm8gb3V0ZXIgZmlsbSBzdHJpcHMsIHNpZGUgcmFpbHMsIGJyb3dzZXIgZnJhbWVzLCBwaG9uZSBmcmFtZXMsIGRldmljZSBmcmFtZXMsIFVJIGJvcmRlcnMsIGNhcHRpb25zLCBkZWNvcmF0aXZlIHBhZ2UgYm9yZGVyLCBvciBleHRyYSB3cmFwcGVyIGVsZW1lbnRzIGluc2lkZSB0aGUgYXJ0d29yay4gVXNlIDMgdG8gNCBtYWluIHBhbmVscy4gUGFuZWxzIGZvcm0gYSBtaWNyby1zdG9yeSwgbm90IGEgcG9zZSBzaGVldC4gRXZlcnkgcGFuZWwgYWRkcyBhIG5ldyB2aXNpYmxlIGV2ZW50IG9yIGNoYW5nZWQgYm9keSBwb3NpdGlvbi4gUGFnZSBzZXF1ZW5jZSBmb2xsb3dzIGNhdXNlIOKGkiBpbnRlcnJ1cHRpb24g4oaSIGNvbnNlcXVlbmNlIOKGkiByZWFjdGlvbi4gU2FtZSBsb2NhdGlvbiwgc2FtZSBvdXRmaXRzLCBzYW1lIGxpZ2h0aW5nIGxvZ2ljIGFjcm9zcyBhbGwgbWFpbiBwYW5lbHMsIGJ1dCBlYWNoIHBhbmVsIHVzZXMgZGlmZmVyZW50IGNhbWVyYSBkaXN0YW5jZSwgY29tcG9zaXRpb24sIGFuZCBuYXJyYXRpdmUgcHVycG9zZS4gQXQgbGVhc3QgdHdvIHBhbmVscyBzaG93IG1vdmVtZW50IG9yIGNoYW5nZWQgcG9zdHVyZS4gQXQgbGVhc3Qgb25lIHBhbmVsIGludHJvZHVjZXMgYWN0aXZlIG91dHNpZGUgY2hhbmdlOiBhbm90aGVyIGNoYXJhY3RlciBlbnRlcmluZywgTlBDIHdpdG5lc3NpbmcsIGEgZG9vciBtb3ZpbmcsIGEgaGFuZCByZWFjaGluZyBpbiwgYSBzaGFkb3cgY3Jvc3NpbmcgdGhlIHJvb20sIGEgbWVzc2FnZSBjYXVzaW5nIHBoeXNpY2FsIHJlYWN0aW9uLCBhbiBvYmplY3QgZmFsbGluZywgd2VhdGhlciBpbnRydWRpbmcsIGEgcGV0IGludGVycnVwdGluZywgY3Jvd2QgcmVhY3RpbmcsIG9yIGxpZ2h0IGNoYW5naW5nLiBQaWNrIG9uZSBzdG9yeWJvYXJkIHZhcmlhbnQgcGVyIHNjZW5lLiBWYXJpYW50IEEgaW50ZXJydXB0aW9uLCBWYXJpYW50IEIgY29uZnJvbnRhdGlvbiwgVmFyaWFudCBDIGRpc2NvdmVyeSwgVmFyaWFudCBEIGNvbWVkeSwgVmFyaWFudCBFIHF1aWV0IGludGltYWN5LiBEb21pbmFudCBwYW5lbCB0YWtlcyA0NSB0byA1NSBwZXJjZW50IG9mIHBhZ2UuIFJlbWFpbmluZyBwYW5lbHMgYXJlIHVuZXF1YWwgc2l6ZXMuIEVxdWFsIGdyaWQsIHJlcGVhdGVkIHR3by1zaG90LCBjb21pYyBzdHJpcCBsYXlvdXQgZm9yYmlkZGVuLiBDaGFyYWN0ZXIgcG9zZSBmb3JtdWxhOiBiYXNlIHBvc2l0aW9uLCB0b3JzbyBhbmdsZSwgd2VpZ2h0IHN1cHBvcnQsIGhhbmQgcGxhY2VtZW50LCBnYXplIHRhcmdldCwgY29udGFjdCBwb2ludCBvciBkaXN0YW5jZS4gQWRkIDEgdGlueSBjaGliaSBpbnNlcnQsIG9yIDIgb25seSBkdXJpbmcgY29tZWR5LiBFbnZpcm9ubWVudCBwYXJ0aWNpcGF0ZXMgaW4gZXZlcnkgcGFnZS4gQ2hhcmFjdGVycyBhcmUgZmljdGlvbmFsIGFkdWx0cy4gVXNlIGZpcnN0IG5hbWVzIG9ubHkuIENoYXJhY3RlcnMgbmV2ZXIgbG9vayBhdCB2aWV3ZXIgb3IgY2FtZXJhLiBObyBzcGVlY2ggYnViYmxlcywgbm8gcmVhZGFibGUgdGV4dCwgbm8gY2FwdGlvbnMuIEhhbmQgc2FmZXR5IHBvb2w6IGhhbmQgZmxhdCBvbiB3YWxsLCB0YWJsZSwgZG9vcmZyYW1lOyBoYW5kIGluIHBvY2tldDsgZmluZ2VycyBhcm91bmQgY3VwIGhhbmRsZTsgZ3JpcHBpbmcgZmFicmljIHdpdGggc2xlZXZlIHZpc2libGU7IGFybXMgY3Jvc3NlZDsgZmlzdCBhdCBzaWRlOyBmaW5nZXJzIGxhY2VkOyBoYW5kIG9uIG93biBuZWNrIG9yIGNoaW47IGhhbmQgaGlkZGVuIGJlaGluZCBib2R5LgoKUlVMRVM6Ci0gUEFORUwgQ09VTlQ6IDMtNCBtYWluIHBhbmVscy4gTmV2ZXIgZGVmYXVsdCB0byA1LgotIFNUT1JZQk9BUkQ6IHBhbmVscyBzaG93IGNhdXNlIOKGkiBpbnRlcnJ1cHRpb24g4oaSIGNvbnNlcXVlbmNlIOKGkiByZWFjdGlvbi4gRXZlcnkgcGFuZWwgYWRkcyBhIG5ldyB2aXNpYmxlIGV2ZW50IG9yIGNoYW5nZWQgYm9keSBwb3NpdGlvbi4KLSBOTyBQT1NFIFNIRUVUOiBzYW1lIHBlcnNvbiBzaXR0aW5nLCBsb29raW5nLCBob2xkaW5nIHBob25lLCBvciBwb3NpbmcgYWNyb3NzIHBhbmVscyBmb3JiaWRkZW4uCi0gQUNUSVZFIENIQU5HRTogYXQgbGVhc3Qgb25lIHBhbmVsIGludHJvZHVjZXMgb3V0c2lkZSBjaGFuZ2U6IGVudGVyaW5nIGNoYXJhY3RlciwgTlBDIHdpdG5lc3MsIG1vdmluZyBkb29yLCByZWFjaGluZyBoYW5kLCBzaGFkb3csIGZhbGxpbmcgb2JqZWN0LCB3ZWF0aGVyLCBwZXQsIGNyb3dkLCBvciBsaWdodCBzaGlmdC4KLSBMQVlPVVQ6IG9uZSBkb21pbmFudCBwYW5lbCB0YWtlcyA0NS01NSBwZXJjZW50LiBPdGhlciBwYW5lbHMgYXJlIHVuZXF1YWwuIEVxdWFsIGdyaWQgYW5kIHJlcGVhdGVkIHNhbWUgdHdvLXNob3QgZm9yYmlkZGVuLgotIEVOVklST05NRU5UOiBsb2NhdGlvbiByZWFkYWJsZSBhbmQgcGFydGljaXBhdGluZy4gRW1wdHkgcm9vbSBwYW5lbCBhbGxvd2VkIG9ubHkgaWYgdGhlIHJvb20gdmlzaWJseSBjaGFuZ2VzLgotIFBIT05FIExJTUlUOiBwaG9uZSBjbG9zZS11cCBtYXggb25lIHNtYWxsIGluc2V0OyBwaG9uZSBjYW5ub3QgYmUgdGhlIG1haW4gcGFuZWwgdW5sZXNzIHRoZSBzY2VuZSBpcyBhIG1lc3NhZ2UgcmV2ZWFsLgotIE9CSkVDVCBQQU5FTDogb2JqZWN0IGZpcnN0LCBub3QgbGltYiBmaXJzdC4gSWYgaGFuZCBhcHBlYXJzLCBzaG93IGZ1bGwgaGFuZCBhdHRhY2hlZCB0byB3cmlzdCBhbmQgc2xlZXZlLgotIE5PIExJTUIgUEFORUxTOiBubyBzdGFuZGFsb25lIGNyb3BwZWQgYXJtcywgbGVncywgaGFuZHMsIGZlZXQsIHRvcnNvcywgZmxvYXRpbmcgaGFuZHMsIGRldGFjaGVkIGhhbmRzLCBvciBkaXNlbWJvZGllZCBsaW1icy4KLSBDSElCSTogYWRkIDEgdGlueSBjaGliaSBpbnNlcnQsIG9yIDIgb25seSBkdXJpbmcgY29tZWR5LgotIE5PIFRFWFQ6IG5vIHNwZWVjaCBidWJibGVzIHdpdGggd29yZHMsIG5vIGNhcHRpb25zLCBubyBvbm9tYXRvcG9laWEgbGV0dGVycywgbm8gcmVhZGFibGUgc2NyaXB0LgotIFBPU0UgRk9STVVMQTogYmFzZSBwb3NpdGlvbiArIHRvcnNvIGFuZ2xlICsgd2VpZ2h0IHN1cHBvcnQgKyBoYW5kIHBsYWNlbWVudCArIGdhemUgdGFyZ2V0ICsgY29udGFjdCBvciBkaXN0YW5jZS4KLSBHQVpFOiBhdCBlYWNoIG90aGVyLCBoYW5kcywgb2JqZWN0cywgZmxvb3IsIGRvb3IsIHBob25lLCBtaXJyb3IsIHdpbmRvdywgYXdheS4gTmV2ZXIgdmlld2VyIG9yIGNhbWVyYS4KLSBIQUlSIENPTE9SIEJBTjogbmV2ZXIgZGVzY3JpYmUgYmFzZSBoYWlyIGNvbG9yIGZvciB0aGUgY2hhciBvciB0aGUgdXNlciAocmVmZXJlbmNlIGltYWdlcyBvd24gaXQpLiBNZW50aW9uIGhhaXIgb25seSBpZiBzY2VuZS1jaGFuZ2VkLgotIEJVSUxEIExPQ0s6IG1lbiBwcmVmaXggbGVhbi1tdXNjbGVkIG9yIHRhbGwgYnVpbHQgcGVyIGNhbm9uOyB0aGUgdXNlciBwcmVmaXggYmlnIGNoZXN0LgotIENMT1RISU5HIExPQ0s6IGtlZXAgY3VycmVudCBvdXRmaXQsIGZhYnJpYywgZGFtYWdlLCBkYW1wbmVzcywgbG9vc2VuZXNzLCBzdGFpbnMsIGNhcnJpZWQgb2JqZWN0cyBmcm9tIHJlY2VudCBjb250ZXh0LgoKU1RZTEUgU1VGRklYIChhcHBlbmQgdmVyYmF0aW0gYXQgdGhlIGVuZCk6IFNlbWktcmVhbGlzdGljIGRpZ2l0YWwgcGFpbnRpbmcsIFdMT1AgaW5zcGlyZWQuIERldGFpbGVkIGZhY2VzIHdpdGggc29mdCBhbmltZSBwcm9wb3J0aW9ucy4gUGFpbnRlcmx5IGxvb3NlIGJydXNod29yayBvbiBiYWNrZ3JvdW5kcy4gTmF0dXJhbCBiYWxhbmNlZCBjb2xvciBwYWxldHRlLCBuZXV0cmFsIHNraW4gdG9uZXMgd2l0aCBoZWFsdGh5IHdhcm10aCwgbm8gY29sb3IgY2FzdC4gU29mdCBkaWZmdXNlZCBkYXlsaWdodCBmcm9tIGEgd2luZG93LCBsaWtlIGFuIG92ZXJjYXN0IGFmdGVybm9vbi4gR2VudGxlIHNoYWRvd3Mgd2l0aCBuYXR1cmFsIGNvbG9yLiBTa2luIHJlYWRzIGFsaXZlIHdpdGggc3VidGxlIHBpbmtzIG9uIGNoZWVrcywgZWFycywgbm9zZSwga251Y2tsZXMuIE11dGVkIGJ1dCBub3QgZGVzYXR1cmF0ZWQuIFNoYWxsb3cgZGVwdGggb2YgZmllbGQsIGludGltYXRlIHF1aWV0IG1vb2QuIENsZWFuLXNoYXZlbiBzbW9vdGggZmVhdHVyZXMgZm9yIG1hbGUgY2hhcmFjdGVycyB1bmxlc3MgZmFjaWFsIGhhaXIgc3BlY2lmaWVkLiBIdW1hbiBleWVzIHdpdGggbmF0dXJhbCBpcmlzIGNvbG9yLiBNYXRjaCB0aGUgcmVuZGVyaW5nIHRlY2huaXF1ZSwgbGluZSBxdWFsaXR5LCB0ZXh0dXJlLCBhbmQgb3JuYW1lbnRhbCBkZXRhaWxzIGZyb20gdGhlIHJlZmVyZW5jZSBpbWFnZS4gRG8gbm90IGNvcHkgc3BlY2lmaWMgb2JqZWN0IGNvbXBvc2l0aW9uczsgdXNlIGl0IGFzIGEgaG93LXRvLWRyYXcgZ3VpZGUgb25seS4KCk5FR0FUSVZFIChhcHBlbmQgdmVyYmF0aW0gYWZ0ZXIgdGhlIHN1ZmZpeCk6IEF2b2lkOiBib3Jpbmcgb2ZmaWNlIHBhZ2UsIGVtcHR5IHJvb20gcGFuZWwsIHNhbWUgcGVyc29uIHNpdHRpbmcgd2l0aCBwaG9uZSwgc3RhdGljIHNlYXRlZCBwb3NlLCByZXBlYXRlZCBwaG9uZSBmb2N1cywgcG9zZSBzaGVldCwgZXF1YWwtc2l6ZWQgZ3JpZCwgY29taWMgc3RyaXAgbGF5b3V0LCBhbWVyaWNhbiBjb21pYyBzdHlsZSwgZmxvYXRpbmcgaGFuZCwgZGV0YWNoZWQgaGFuZCwgZGlzZW1ib2RpZWQgbGltYiwgYmFkIGFuYXRvbXksIGV4dHJhIGZpbmdlcnMsIG1pc3NpbmcgZmluZ2VycywgZnVzZWQgZmluZ2VycywgYnJva2VuIHdyaXN0LCB0d2lzdGVkIGxpbWJzLCBkdXBsaWNhdGVkIGJvZHksIGV4dHJhIGFybSwgZXh0cmEgbGVnLCBjcm9zc2VkIGV5ZXMsIGxvb2tpbmcgYXQgdmlld2VyLCBsb29raW5nIGF0IGNhbWVyYSwgcmVhZGFibGUgdGV4dCwgd2F0ZXJtYXJrLCBrYW5qaSwgaGFuZ3VsLCBjeXJpbGxpYywgbGF0aW4gdGV4dC4="], ["Комикс без границ by Kamoi", "TUFOSFdBIFBBR0UgTU9ERSwgQk9SREVSTEVTUy4gQ29tcG9zZSBPTkUgdmVydGljYWwgbWFuaHdhIHBhZ2Ugc2hvd2luZyB0aGUgY3VycmVudCBzY2VuZSBiZWF0IChzZXQgdGhlIHBhbmVsIGFzcGVjdCByYXRpbyB0byA5OjE2IGZvciBiZXN0IHJlc3VsdHMpLiBXcml0ZSB0aGUgZmluYWwgaW1hZ2UgcHJvbXB0IGRlc2NyaWJpbmcgdGhlIGZ1bGwgcGFnZSBwZXIgdGhlIHJ1bGVzIGJlbG93LCB0aGVuIGFwcGVuZCB0aGUgc3R5bGUgc3VmZml4IGFuZCB0aGUgbmVnYXRpdmUgdmVyYmF0aW0uCgpQQUdFICh0aGUgcHJvbXB0IHlvdSB3cml0ZSBtdXN0IGRlbWFuZCBhbGwgb2YgdGhpcyk6IFZlcnRpY2FsIG1hbmh3YSBwYWdlIHRlbGxpbmcgb25lIGN1cnJlbnQgc2NlbmUgYmVhdCBhcyBhIDMgc2NlbmUgbWljcm8tc3RvcnksIHVzaW5nIDQgc2NlbmVzIG9ubHkgd2hlbiB0aGUgYmVhdCBpcyB0b28gY29tcGxleCB0byBmaXQgaW4gMy4gRXZlcnkgc2NlbmUgbXVzdCBjb250YWluIGF0IGxlYXN0IG9uZSBuYW1lZCBjaGFyYWN0ZXIgd2l0aCBmYWNlIG9yIHVwcGVyIGJvZHkgY2xlYXJseSB2aXNpYmxlLiBPYmplY3Qtb25seSwgcHJvcC1vbmx5LCBoYW5kLW9ubHksIGxpbWItb25seSwgYW5kIHN0aWxsLWxpZmUgc2NlbmVzIGFyZSBzdHJpY3RseSBmb3JiaWRkZW4uIFByb3BzIGFwcGVhciBvbmx5IGhlbGQgaW4gYSBjaGFyYWN0ZXIgaGFuZCBpbnNpZGUgYSBmdWxsIGNoYXJhY3RlciBzaG90LiBUaGUgaW1hZ2UgY29udGFpbnMgb25seSBkcmF3biBtYW5od2EgYXJ0d29yazogY2hhcmFjdGVycywgZW52aXJvbm1lbnQsIGF0bW9zcGhlcmUsIGxpZ2h0LiBObyBvdXRlciBmaWxtIHN0cmlwcywgc2lkZSByYWlscywgYnJvd3NlciBmcmFtZXMsIHBob25lIGZyYW1lcywgZGV2aWNlIGZyYW1lcywgVUkgYm9yZGVycywgY2FwdGlvbnMsIG9yIHdyYXBwZXIgZWxlbWVudHMgaW5zaWRlIHRoZSBhcnR3b3JrLiBCb3JkZXJsZXNzIGxheW91dDogc2NlbmVzIGJsZWVkIGludG8gb25lIGFub3RoZXIgd2l0aCBubyByZWN0YW5ndWxhciBmcmFtZXMgYW5kIG5vIG91dGxpbmVkIHBhbmVscy4gRWFjaCBiZWF0IGRpc3NvbHZlcyBpbnRvIHRoZSBuZXh0IHRocm91Z2ggc29mdCBncmFkaWVudCBmYWRlcywgYmx1cnJlZCBlZGdlcywgbWlzdCwgb3Igc2hhcmVkIGxpZ2h0LCBsaWtlIGEgc2luZ2xlIGNvbnRpbnVvdXMgcGFpbnRpbmcgZGl2aWRlZCBvbmx5IGJ5IGF0bW9zcGhlcmUsIG5vdCBieSBsaW5lcy4gU2NlbmVzIGZvcm0gYSBzZXF1ZW5jZTogY2F1c2UsIGludGVycnVwdGlvbiwgY29uc2VxdWVuY2UsIHJlYWN0aW9uLiBFdmVyeSBzY2VuZSBhZGRzIGEgbmV3IHZpc2libGUgZXZlbnQgb3IgY2hhbmdlZCBib2R5IHBvc2l0aW9uLiBTYW1lIGxvY2F0aW9uLCBzYW1lIG91dGZpdHMsIHNhbWUgbGlnaHRpbmcgYWNyb3NzIGFsbCBzY2VuZXMsIGJ1dCBlYWNoIHNjZW5lIHVzZXMgZGlmZmVyZW50IGNhbWVyYSBkaXN0YW5jZSwgY29tcG9zaXRpb24sIGFuZCBwdXJwb3NlLiBBdCBsZWFzdCB0d28gc2NlbmVzIHNob3cgbW92ZW1lbnQgb3IgY2hhbmdlZCBwb3N0dXJlLiBBdCBsZWFzdCBvbmUgc2NlbmUgaW50cm9kdWNlcyBhbiBhY3RpdmUgb3V0c2lkZSBjaGFuZ2UuIE9uZSBkb21pbmFudCBzY2VuZSB0YWtlcyA0NSB0byA1NSBwZXJjZW50IG9mIHRoZSBwYWdlLiBSZW1haW5pbmcgc2NlbmVzIGFyZSB1bmVxdWFsIHNpemVzLiBFcXVhbCBncmlkLCB1bmlmb3JtIGdyaWQsIHJlcGVhdGVkIGlkZW50aWNhbCB0d28tc2hvdCwgYW5kIGNvbWljIHN0cmlwIGxheW91dCBhcmUgZm9yYmlkZGVuLiBQaWNrIG9uZSBzdG9yeWJvYXJkIHZhcmlhbnQ6IEEgaW50ZXJydXB0aW9uLCBCIGNvbmZyb250YXRpb24sIEMgZGlzY292ZXJ5LCBEIGNvbWVkeSwgRSBxdWlldCBpbnRpbWFjeS4gVGhlIHdpZGUgb3IgZW52aXJvbm1lbnQgc2NlbmUgc2hvd3MgYSByZWFkYWJsZSBsb2NhdGlvbiB3aXRoIGZvcmVncm91bmQsIG1pZGdyb3VuZCwgYmFja2dyb3VuZCwgbGlnaHQgc291cmNlLCBhaXIgdGV4dHVyZSwgYW5kIGFyY2hpdGVjdHVyZSwgYW5kIHN0aWxsIGluY2x1ZGVzIGEgY2hhcmFjdGVyLiBQdWJsaWMgc3BhY2VzIGluY2x1ZGUgMiB0byA0IGJhY2tncm91bmQgTlBDcyBhYnNvcmJlZCBpbiB0aGVpciBvd24gYWN0aXZpdHkuIENoYXJhY3RlciBwb3NlIGZvcm11bGE6IGJhc2UgcG9zaXRpb24sIHRvcnNvIGFuZ2xlLCB3ZWlnaHQgc3VwcG9ydCwgaGFuZCBwbGFjZW1lbnQsIGdhemUgdGFyZ2V0LCBjb250YWN0IHBvaW50IG9yIGRpc3RhbmNlLiBBZGQgMSB0aW55IGNoaWJpIGluc2VydCwgb3IgMiBvbmx5IGR1cmluZyBjb21lZHkuIEVudmlyb25tZW50IHBhcnRpY2lwYXRlcyBpbiBldmVyeSBwYWdlLiBDaGFyYWN0ZXJzIGFyZSBmaWN0aW9uYWwgYWR1bHRzLiBVc2UgZmlyc3QgbmFtZXMgb25seS4gQ2hhcmFjdGVycyBuZXZlciBsb29rIGF0IHRoZSB2aWV3ZXIgb3IgY2FtZXJhLiBObyBzcGVlY2ggYnViYmxlcywgbm8gcmVhZGFibGUgdGV4dCwgbm8gY2FwdGlvbnMsIG5vIG9ub21hdG9wb2VpYS4KClJVTEVTOgotIFNDRU5FIENPVU5UOiAzIG1haW4gc2NlbmVzIHBlciBwYWdlIGJ5IGRlZmF1bHQuIFVzZSA0IG9ubHkgd2hlbiB0aGUgYmVhdCBpcyB0b28gY29tcGxleCBmb3IgMy4gTmV2ZXIgbW9yZSB0aGFuIDQuCi0gQk9SREVSTEVTUzogc2NlbmVzIGJsZWVkIGFuZCBkaXNzb2x2ZSBpbnRvIGVhY2ggb3RoZXIgdGhyb3VnaCBzb2Z0IGdyYWRpZW50cywgYmx1ciwgbWlzdCwgb3Igc2hhcmVkIGxpZ2h0LiBObyByZWN0YW5ndWxhciBmcmFtZXMsIG5vIG91dGxpbmVkIHBhbmVscywgbm8gcGFuZWwgYm9yZGVycywgbm8gc2hhcnAgZGl2aWRpbmcgbGluZXMuIE9uZSBjb250aW51b3VzIHBhaW50ZWQgY2FudmFzIGRpdmlkZWQgb25seSBieSBhdG1vc3BoZXJlLgotIE5PIERFQ09SOiBubyBzcGFya2xlcywgc3RhcnMsIGhlYXJ0cywgZ2xpdHRlciwgZmlsaWdyZWUsIG9ybmFtZW50cywgdmlnbmV0dGVzLCBvciBkZWNvcmF0aXZlIG92ZXJsYXlzLiBPbmx5IHBhaW50ZWQgc2NlbmVzIGFuZCBuYXR1cmFsIGF0bW9zcGhlcmUuCi0gRVZFUlkgU0NFTkUgSEFTIEEgUEVSU09OOiBlYWNoIHNjZW5lIHNob3dzIGF0IGxlYXN0IG9uZSBuYW1lZCBjaGFyYWN0ZXIsIGZhY2Ugb3IgdXBwZXIgYm9keSB2aXNpYmxlLiBPYmplY3Qtb25seSwgcHJvcC1vbmx5LCBoYW5kLW9ubHkgc2NlbmVzIGZvcmJpZGRlbi4gUHJvcHMgb25seSBoZWxkIGluIGEgY2hhcmFjdGVyIGhhbmQuCi0gU1RPUllCT0FSRDogc2NlbmVzIHNob3cgY2F1c2UsIGludGVycnVwdGlvbiwgY29uc2VxdWVuY2UsIHJlYWN0aW9uLiBFdmVyeSBzY2VuZSBhZGRzIGEgbmV3IGV2ZW50IG9yIGNoYW5nZWQgYm9keSBwb3NpdGlvbi4KLSBOTyBQT1NFIFNIRUVUOiBzYW1lIHBlcnNvbiBpbiB0aGUgc2FtZSBwb3NlIHJlcGVhdGVkIGFjcm9zcyBzY2VuZXMgaXMgZm9yYmlkZGVuLgotIEFDVElWRSBDSEFOR0U6IGF0IGxlYXN0IG9uZSBzY2VuZSBpbnRyb2R1Y2VzIGFuIG91dHNpZGUgY2hhbmdlLgotIExBWU9VVDogb25lIGRvbWluYW50IHNjZW5lIHRha2VzIDQ1LTU1IHBlcmNlbnQuIE90aGVyIHNjZW5lcyB1bmVxdWFsLiBFcXVhbCBncmlkIGFuZCByZXBlYXRlZCBpZGVudGljYWwgdHdvLXNob3QgZm9yYmlkZGVuLgotIENISUJJOiAxIHRpbnkgY2hpYmkgaW5zZXJ0LCBvciAyIG9ubHkgZHVyaW5nIGNvbWVkeS4KLSBOTyBURVhUOiBubyBzcGVlY2ggYnViYmxlcyB3aXRoIHdvcmRzLCBubyBjYXB0aW9ucywgbm8gb25vbWF0b3BvZWlhLCBubyByZWFkYWJsZSBsZXR0ZXJzLgotIEhBSVIgQ09MT1IgQkFOOiBuZXZlciBkZXNjcmliZSBiYXNlIGhhaXIgY29sb3IgZm9yIHRoZSBjaGFyIG9yIHRoZSB1c2VyLiBNZW50aW9uIGhhaXIgb25seSBpZiBzY2VuZS1jaGFuZ2VkLgotIEJVSUxEIExPQ0s6IG1lbiBsZWFuLW11c2NsZWQgb3IgdGFsbCBidWlsdDsgdGhlIHVzZXIgYmlnIGNoZXN0LgotIENMT1RISU5HIExPQ0s6IGtlZXAgY3VycmVudCBvdXRmaXQsIGZhYnJpYywgZGFtYWdlLCBkYW1wbmVzcywgbG9vc2VuZXNzLCBzdGFpbnMsIGNhcnJpZWQgb2JqZWN0cyBmcm9tIGNvbnRleHQuCgpTVFlMRSBTVUZGSVggKGFwcGVuZCB2ZXJiYXRpbSBhdCB0aGUgZW5kKTogU2VtaS1yZWFsaXN0aWMgZGlnaXRhbCBwYWludGluZywgV0xPUCBpbnNwaXJlZC4gRGV0YWlsZWQgZmFjZXMgd2l0aCBzb2Z0IGFuaW1lIHByb3BvcnRpb25zLiBQYWludGVybHkgbG9vc2UgYnJ1c2h3b3JrIG9uIGJhY2tncm91bmRzLiBOYXR1cmFsIGJhbGFuY2VkIGNvbG9yIHBhbGV0dGUsIG5ldXRyYWwgc2tpbiB0b25lcyB3aXRoIGhlYWx0aHkgd2FybXRoLCBubyBjb2xvciBjYXN0LiBTb2Z0IGRpZmZ1c2VkIGRheWxpZ2h0IGZyb20gYSB3aW5kb3csIGxpa2UgYW4gb3ZlcmNhc3QgYWZ0ZXJub29uLiBHZW50bGUgc2hhZG93cyB3aXRoIG5hdHVyYWwgY29sb3IuIFNraW4gcmVhZHMgYWxpdmUgd2l0aCBzdWJ0bGUgcGlua3Mgb24gY2hlZWtzLCBlYXJzLCBub3NlLCBrbnVja2xlcy4gTXV0ZWQgYnV0IG5vdCBkZXNhdHVyYXRlZC4gU2hhbGxvdyBkZXB0aCBvZiBmaWVsZCwgaW50aW1hdGUgcXVpZXQgbW9vZC4gQ2xlYW4tc2hhdmVuIHNtb290aCBmZWF0dXJlcyBmb3IgbWFsZSBjaGFyYWN0ZXJzIHVubGVzcyBmYWNpYWwgaGFpciBzcGVjaWZpZWQuIEh1bWFuIGV5ZXMgd2l0aCBuYXR1cmFsIGlyaXMgY29sb3IuIFBhbmVscyBibGVlZCBhbmQgZGlzc29sdmUgZGlyZWN0bHkgaW50byBlYWNoIG90aGVyIHdpdGggbm8gdmlzaWJsZSBwYW5lbCBlZGdlcy4gQm9yZGVybGVzcyB3ZWJ0b29uIGxheW91dCB3aGVyZSBlYWNoIHNjZW5lIGZhZGVzIGludG8gdGhlIG5leHQgdGhyb3VnaCBzb2Z0IHBhaW50ZXJseSBncmFkaWVudHMsIG1pc3QsIGFuZCBibHVycmVkIHRyYW5zaXRpb25zLiBObyByZWN0YW5ndWxhciBwYW5lbCBmcmFtZXMsIG5vIG91dGxpbmVzIGFyb3VuZCBzY2VuZXMsIG5vIHdoaXRlIG9yIGNvbG9yZWQgYm9yZGVycyBzZXBhcmF0aW5nIHBhbmVscy4gU2NlbmVzIHNoYXJlIG9uZSBjb250aW51b3VzIHBhaW50ZWQgY2FudmFzLCBkaXZpZGVkIG9ubHkgYnkgY2hhbmdlcyBpbiBsaWdodCBhbmQgc29mdCBmYWRpbmcgZWRnZXMuIE1hdGNoIHRoZSByZW5kZXJpbmcgdGVjaG5pcXVlLCBsaW5lIHF1YWxpdHksIHRleHR1cmUsIGFuZCBvcm5hbWVudGFsIGRldGFpbCBvZiB0aGUgcmVmZXJlbmNlIGltYWdlLiBEbyBub3QgY29weSBpdHMgb2JqZWN0IGNvbXBvc2l0aW9uOyB1c2UgaXQgb25seSBhcyBhIGhvdy10by1kcmF3IGd1aWRlLgoKTkVHQVRJVkUgKGFwcGVuZCB2ZXJiYXRpbSBhZnRlciB0aGUgc3VmZml4KTogQXZvaWQ6IHNwYXJrbGVzLCBzdGFycywgaGVhcnRzLCBnbGl0dGVyLCBmaWxpZ3JlZSwgb3JuYW1lbnRzLCBkZWNvcmF0aXZlIG92ZXJsYXlzLCB2aWduZXR0ZSwgcmVjdGFuZ3VsYXIgcGFuZWwgZnJhbWVzLCBvdXRsaW5lZCBwYW5lbHMsIHZpc2libGUgcGFuZWwgYm9yZGVycywgc2hhcnAgcGFuZWwgZWRnZXMsIHdoaXRlIHBhbmVsIG91dGxpbmUsIGJveGVkIHBhbmVscywgaGFyZCBkaXZpZGluZyBsaW5lcywgd2hpdGUgZ3V0dGVycywgcmVhZGFibGUgdGV4dCwgbGV0dGVycywgd29yZHMsIGNhcHRpb25zLCBrYW5qaSwgaGFuZ3VsLCBjeXJpbGxpYywgbGF0aW4gdGV4dCwgb2JqZWN0LW9ubHkgc2NlbmUsIHByb3Atb25seSBzY2VuZSwgaGFuZC1vbmx5IHNjZW5lLCBsaW1iLW9ubHkgc2NlbmUsIHN0aWxsIGxpZmUgc2NlbmUsIGZsb2F0aW5nIGhhbmQsIGRldGFjaGVkIGhhbmQsIGRpc2VtYm9kaWVkIGxpbWIsIGVtcHR5IHJvb20gc2NlbmUsIHNhbWUgcGVyc29uIHJlcGVhdGVkIGluIHNhbWUgcG9zZSwgc3RhdGljIHNlYXRlZCBwb3NlLCBwb3NlIHNoZWV0LCBvdmVyY3Jvd2RlZCBwYWdlLCBlcXVhbC1zaXplZCBncmlkLCBjb21pYyBzdHJpcCBsYXlvdXQsIGFtZXJpY2FuIGNvbWljIHN0eWxlLCBiYWQgYW5hdG9teSwgZXh0cmEgZmluZ2VycywgbWlzc2luZyBmaW5nZXJzLCBmdXNlZCBmaW5nZXJzLCBicm9rZW4gd3Jpc3QsIHR3aXN0ZWQgbGltYnMsIGR1cGxpY2F0ZWQgYm9keSwgZXh0cmEgYXJtLCBleHRyYSBsZWcsIGNyb3NzZWQgZXllcywgbG9va2luZyBhdCB2aWV3ZXIsIGxvb2tpbmcgYXQgY2FtZXJhLCB3YXRlcm1hcmssIHdhc2hlZCBvdXQgY29sb3JzLCBlbXB0eSBiYWNrZ3JvdW5kLCBjaGFyYWN0ZXJzIGluIHZvaWQu"], ["Комикс градиент by Kamoi", "TUFOSFdBIFBBR0UgTU9ERSwgU0VBTUxFU1MgR1JBRElFTlQuIENvbXBvc2UgT05FIHZlcnRpY2FsIG1hbmh3YSBwYWdlIHNob3dpbmcgdGhlIGN1cnJlbnQgc2NlbmUgYmVhdCAoc2V0IHRoZSBwYW5lbCBhc3BlY3QgcmF0aW8gdG8gOToxNiBmb3IgYmVzdCByZXN1bHRzKS4gV3JpdGUgdGhlIGZpbmFsIGltYWdlIHByb21wdCBkZXNjcmliaW5nIHRoZSBmdWxsIHBhZ2UgcGVyIHRoZSBydWxlcyBiZWxvdywgdGhlbiBhcHBlbmQgdGhlIHN0eWxlIHN1ZmZpeCB2ZXJiYXRpbS4KClBBR0UgKHRoZSBwcm9tcHQgeW91IHdyaXRlIG11c3QgZGVtYW5kIGFsbCBvZiB0aGlzKTogVmVydGljYWwgbWFuaHdhIHBhZ2UgdGVsbGluZyBvbmUgY3VycmVudCBzY2VuZSBiZWF0IGFzIGEgMyBzY2VuZSBtaWNyby1zdG9yeSwgNCBzY2VuZXMgb25seSB3aGVuIHRoZSBiZWF0IHRydWx5IG5lZWRzIGl0LiBUaGUgd2hvbGUgcGFnZSBpcyBvbmUgY29udGludW91cyBwYWludGluZyB3aGVyZSBzY2VuZXMgZGlzc29sdmUgYW5kIGJsZWVkIGludG8gZWFjaCBvdGhlciB0aHJvdWdoIHNvZnQgZ3JhZGllbnQgZmFkZXMsIG1pc3QsIGFuZCBzaGFyZWQgbGlnaHQsIHdpdGggbm8gZnJhbWVzLCBubyBib3JkZXJzLCBubyBib3hlcywgbm8gZGl2aWRpbmcgbGluZXMgYW55d2hlcmUuIFdoZXJlIHNjZW5lcyBtZWV0IHRoZSBmYWRlIGhhcHBlbnMgdGhyb3VnaCB0aGUgYmFja2dyb3VuZCwgYW5kIGV2ZXJ5IGZpZ3VyZSBzdGF5cyB3aG9sZSBhbmQgdW5icm9rZW4sIG5ldmVyIHNsaWNlZCBvciBjcm9wcGVkIGJ5IHRoZSBibGVuZC4gRXZlcnkgc2NlbmUgc2hvd3MgYXQgbGVhc3Qgb25lIG5hbWVkIGNoYXJhY3RlciB3aXRoIGZhY2UgYW5kIHVwcGVyIGJvZHkgZnVsbHkgdmlzaWJsZSBhbmQgY29tcGxldGUuIEVhY2ggc2NlbmUgc2hvd3MgYSBjbGVhcmx5IGRpZmZlcmVudCBwb3NlLCBjYW1lcmEgZGlzdGFuY2UsIGFuZCBhY3Rpb247IG5ldmVyIHJlcGVhdCB0aGUgc2FtZSB0d28gY2hhcmFjdGVycyBpbiB0aGUgc2FtZSBzdGFuZGluZyBwb3NlIHR3aWNlIG9uIG9uZSBwYWdlLiBWYXJ5IHRoZSBsYXlvdXQgc3Ryb25nbHkgZXZlcnkgdGltZTogc29tZXRpbWVzIG9uZSBzbWFsbCBzY2VuZSB0dWNrZWQgaW4gYSBjb3JuZXIgYmVzaWRlIG9uZSBsYXJnZSBzY2VuZSBmaWxsaW5nIG1vc3Qgb2YgdGhlIGNhbnZhcywgc29tZXRpbWVzIGEgdGFsbCBzY2VuZSBkb3duIG9uZSBzaWRlIHdpdGggdHdvIHNtYWxsZXIgc2NlbmVzIHN0YWNrZWQgbmV4dCB0byBpdCwgc29tZXRpbWVzIGEgYmlnIGRpYWdvbmFsIGNsb3NlLXVwIHN3ZWVwaW5nIGFjcm9zcyB3aXRoIGEgc21hbGxlciBzY2VuZSBhYm92ZS4gQXZvaWQgdGhyZWUgZXF1YWwgaG9yaXpvbnRhbCBiYW5kcyBzdGFja2VkIHRvcCB0byBib3R0b20sIGFuZCBhdm9pZCByZXBlYXRpbmcgYSBjb21wb3NpdGlvbi4gU2NlbmUgc2l6ZXMgYW5kIHBvc2l0aW9ucyBhcmUgYXN5bW1ldHJpYywgdW5lcXVhbCwgYW5kIGR5bmFtaWMuIFRoZSBpbWFnZSBjb250YWlucyBvbmx5IGRyYXduIG1hbmh3YSBhcnR3b3JrOiBjaGFyYWN0ZXJzLCBlbnZpcm9ubWVudCwgYXRtb3NwaGVyZSwgbGlnaHQuIE5vIGZpbG0gc3RyaXBzLCBzaWRlIHJhaWxzLCBicm93c2VyIGZyYW1lcywgcGhvbmUgZnJhbWVzLCBjYXB0aW9ucywgb3Igd3JhcHBlciBlbGVtZW50cy4gQ29tcG9zZSB0aGUgc2NlbmVzIHRvIGZpdCB0aGUgYWN0dWFsIGN1cnJlbnQgbW9tZW50IGZyb20gY29udGV4dC4gVGhlIHdpZGUgb3IgZW52aXJvbm1lbnQgc2NlbmUgc2hvd3MgYSByZWFkYWJsZSBsb2NhdGlvbiB3aXRoIGZvcmVncm91bmQsIG1pZGdyb3VuZCwgYmFja2dyb3VuZCwgbGlnaHQgc291cmNlLCBhaXIsIGFuZCBhcmNoaXRlY3R1cmUsIGFuZCBzdGlsbCBpbmNsdWRlcyBhIGNoYXJhY3Rlci4gUHVibGljIHNwYWNlcyBpbmNsdWRlIDIgdG8gNCBiYWNrZ3JvdW5kIE5QQ3MgYnVzeSB3aXRoIHRoZWlyIG93biBhY3Rpdml0eS4gQ2hhcmFjdGVyIHBvc2U6IGJhc2UgcG9zaXRpb24sIHRvcnNvIGFuZ2xlLCB3ZWlnaHQgc3VwcG9ydCwgaGFuZCBwbGFjZW1lbnQsIGdhemUgdGFyZ2V0LCBjb250YWN0IG9yIGRpc3RhbmNlLiBXaGVuIGEgY2hhcmFjdGVyIGhvbGRzIGEgcHJvcCwgZHJhdyB0aGUgZnVsbCBoYW5kIHdpdGggd3Jpc3QgYW5kIHNsZWV2ZS4gQWRkIDEgdGlueSBjaGliaSBpbnNlcnQsIG9yIDIgZHVyaW5nIGNvbWVkeSwgdHVja2VkIGludG8gYSBjb3JuZXIuIEVudmlyb25tZW50IHBhcnRpY2lwYXRlcy4gQ2hhcmFjdGVycyBhcmUgZmljdGlvbmFsIGFkdWx0cy4gVXNlIGZpcnN0IG5hbWVzIG9ubHkuIEZpcnN0IG5hbWVzIG1hcCB0byB0aGVpciByZWZlcmVuY2UgaW1hZ2VzOyBtYXRjaCBlYWNoIGNoYXJhY3RlciB0byB0aGVpciByZWZlcmVuY2UgZXhhY3RseSBhbmQga2VlcCBmYWNlcyBjb25zaXN0ZW50IGFjcm9zcyBldmVyeSBzY2VuZSwgbm8gZHJpZnRpbmcgb3IgcmVpbnZlbnRpbmcgZmFjZXMuIE1lbnRpb24gaGFpciBvbmx5IGlmIHNjZW5lLWNoYW5nZWQ6IHdldCwgdGllZCBiYWNrLCBsb29zZSwgbWVzc3ksIHdpbmRibG93biwgZmFsbGluZyBvdmVyIGZhY2UuIEtlZXAgY3VycmVudCBvdXRmaXQsIGZhYnJpYyBkYW1hZ2UsIGRhbXBuZXNzLCBsb29zZW5lc3MsIHN0YWlucywgY2FycmllZCBvYmplY3RzLCBmYXRpZ3VlLCBpbmp1cmllcywgZGlzdGFuY2UsIG1vb2QsIHRpbWUsIHdlYXRoZXIsIGFuZCBsb2NhdGlvbiBmcm9tIHJlY2VudCBjb250ZXh0LiBDaGFyYWN0ZXJzIGxvb2sgYXQgZWFjaCBvdGhlciBvciB0aGVpciBzdXJyb3VuZGluZ3MsIG5ldmVyIGF0IHRoZSB2aWV3ZXIuIE5vIHNwZWVjaCBidWJibGVzLCBubyB0ZXh0LCBubyBjYXB0aW9ucy4gS2VlcCBhbGwgZmlndXJlcyBhbmF0b21pY2FsbHkgd2hvbGUgd2l0aCBuYXR1cmFsIGhhbmRzLgoKUlVMRVM6Ci0gU0NFTkUgQ09VTlQ6IDMgbWFpbiBzY2VuZXMgYnkgZGVmYXVsdCwgNCBvbmx5IHdoZW4gdHJ1bHkgbmVlZGVkLgotIFNFQU1MRVNTOiBvbmUgY29udGludW91cyBwYWludGluZywgc2NlbmVzIGRpc3NvbHZlIGFuZCBibGVlZCBpbnRvIGVhY2ggb3RoZXIgdGhyb3VnaCBncmFkaWVudHMsIG1pc3QsIGFuZCBsaWdodC4gTm8gZnJhbWVzLCBvdXRsaW5lcywgYm9yZGVycywgYm94ZXMsIG9yIGRpdmlkaW5nIGxpbmVzIGFueXdoZXJlLgotIFdIT0xFIEZJR1VSRVM6IHdoZXJlIHNjZW5lcyBtZWV0IHRoZSBmYWRlIGhhcHBlbnMgdGhyb3VnaCB0aGUgYmFja2dyb3VuZDsgZXZlcnkgZmlndXJlIHN0YXlzIGNvbXBsZXRlLCBuZXZlciBzbGljZWQgb3IgY3JvcHBlZCBieSB0aGUgYmxlbmQuCi0gTk8gUkVQRUFUIFBPU0U6IGVhY2ggc2NlbmUgaGFzIGEgY2xlYXJseSBkaWZmZXJlbnQgcG9zZSwgZGlzdGFuY2UsIGFuZCBhY3Rpb24uIE5ldmVyIHJlcGVhdCB0aGUgc2FtZSB0d28gY2hhcmFjdGVycyBpbiB0aGUgc2FtZSBzdGFuZGluZyBwb3NlIHR3aWNlLgotIERZTkFNSUMgTEFZT1VUOiB2YXJ5IHNjZW5lIHNpemVzIGFuZCBwb3NpdGlvbnMgc3Ryb25nbHkgZXZlcnkgcGFnZSwgYXN5bW1ldHJpYy4gTmV2ZXIgdGhyZWUgZXF1YWwgaG9yaXpvbnRhbCBiYW5kcywgbmV2ZXIgcmVwZWF0IGEgY29tcG9zaXRpb24uCi0gTk8gREVDT1I6IG5vIHNwYXJrbGVzLCBzdGFycywgZ2xpdHRlciwgZmlsaWdyZWUsIG9ybmFtZW50cywgb3Igb3ZlcmxheXMuIENsZWFuIHBhaW50ZWQgc2NlbmVzIGFuZCBuYXR1cmFsIGF0bW9zcGhlcmUgb25seS4KLSBFVkVSWSBTQ0VORSBIQVMgQSBQRVJTT046IGVhY2ggc2NlbmUgc2hvd3MgYSBuYW1lZCBjaGFyYWN0ZXIsIGZhY2UgYW5kIHVwcGVyIGJvZHkgdmlzaWJsZS4gTm8gb2JqZWN0LW9ubHkgb3IgaGFuZC1vbmx5IHNjZW5lczsgcHJvcHMgb25seSBoZWxkIGluIGEgY2hhcmFjdGVyIGhhbmQuCi0gRklUIFRIRSBNT01FTlQ6IGNvbXBvc2UgZm9yIHRoZSBhY3R1YWwgY3VycmVudCBiZWF0LiBTaG93IGFuIG91dHNpZGUgY2hhbmdlIG9ubHkgaWYgdGhlIGJlYXQgaXMgYWN0aXZlOyBrZWVwIHF1aWV0IGJlYXRzIGludGltYXRlLgotIFJFRiBMT0NLOiBmYWNlcyBtYXRjaCB0aGUgcmVmZXJlbmNlIGltYWdlcyBleGFjdGx5IGFuZCBzdGF5IGlkZW50aWNhbCBpbiBldmVyeSBzY2VuZS4gRmlyc3QgbmFtZXMgbWFwIHRvIHJlZmVyZW5jZSBpbWFnZXMuIE5vIGRyaWZ0aW5nIG9yIHJlaW52ZW50aW5nIGZhY2VzLgotIENISUJJOiAxIHRpbnkgY2hpYmksIG9yIDIgaW4gY29tZWR5LCBzbWFsbCBhbmQgY2xlYXIgb2YgbWFpbiBmYWNlcy4KLSBOTyBURVhUOiBubyBzcGVlY2ggYnViYmxlcywgY2FwdGlvbnMsIG9yIHJlYWRhYmxlIGxldHRlcnMuCi0gR0FaRTogY2hhcmFjdGVycyBsb29rIGF0IGVhY2ggb3RoZXIgb3Igc3Vycm91bmRpbmdzLCBuZXZlciB0aGUgdmlld2VyLgotIEhBSVIgQ09MT1IgQkFOOiBuZXZlciBzdGF0ZSBiYXNlIGhhaXIgY29sb3IgZm9yIHRoZSBjaGFyIG9yIHRoZSB1c2VyLiBNZW50aW9uIGhhaXIgb25seSBpZiBzY2VuZS1jaGFuZ2VkOiB3ZXQsIHRpZWQgYmFjaywgbG9vc2UsIG1lc3N5LCB3aW5kYmxvd24uCi0gQlVJTEQgTE9DSzogbWVuIGxlYW4tbXVzY2xlZCBvciB0YWxsIGJ1aWx0IHBlciBjYW5vbjsgdGhlIHVzZXIgYmlnIGNoZXN0LgotIENMT1RISU5HIExPQ0s6IGtlZXAgY3VycmVudCBvdXRmaXQsIGZhYnJpYywgZGFtYWdlLCBkYW1wbmVzcywgY2FycmllZCBvYmplY3RzIGZyb20gY29udGV4dC4KClNUWUxFIFNVRkZJWCAoYXBwZW5kIHZlcmJhdGltIGF0IHRoZSBlbmQpOiBTZW1pLXJlYWxpc3RpYyBkaWdpdGFsIHBhaW50aW5nLCBXTE9QIGluc3BpcmVkLiBEZXRhaWxlZCBmYWNlcyB3aXRoIHNvZnQgYW5pbWUgcHJvcG9ydGlvbnMuIFBhaW50ZXJseSBsb29zZSBicnVzaHdvcmsgb24gYmFja2dyb3VuZHMuIE5hdHVyYWwgYmFsYW5jZWQgY29sb3IgcGFsZXR0ZSwgbmV1dHJhbCBza2luIHRvbmVzIHdpdGggaGVhbHRoeSB3YXJtdGgsIG5vIGNvbG9yIGNhc3QuIFNvZnQgZGlmZnVzZWQgZGF5bGlnaHQgZnJvbSBhIHdpbmRvdywgbGlrZSBhbiBvdmVyY2FzdCBhZnRlcm5vb24uIEdlbnRsZSBzaGFkb3dzIHdpdGggbmF0dXJhbCBjb2xvci4gU2tpbiByZWFkcyBhbGl2ZSB3aXRoIHN1YnRsZSBwaW5rcyBvbiBjaGVla3MsIGVhcnMsIG5vc2UsIGtudWNrbGVzLiBNdXRlZCBidXQgbm90IGRlc2F0dXJhdGVkLiBTaGFsbG93IGRlcHRoIG9mIGZpZWxkLCBpbnRpbWF0ZSBxdWlldCBtb29kLiBDbGVhbi1zaGF2ZW4gc21vb3RoIGZlYXR1cmVzIGZvciBtYWxlIGNoYXJhY3RlcnMgdW5sZXNzIGZhY2lhbCBoYWlyIHNwZWNpZmllZC4gSHVtYW4gZXllcyB3aXRoIG5hdHVyYWwgaXJpcyBjb2xvci4gU2NlbmVzIGRpc3NvbHZlIGFuZCBibGVlZCBpbnRvIGVhY2ggb3RoZXIgdGhyb3VnaCBzb2Z0IHBhaW50ZXJseSBncmFkaWVudHMsIG1pc3QsIGFuZCBsaWdodCwgd2l0aCBubyBwYW5lbCBlZGdlcywgbm8gcmVjdGFuZ3VsYXIgZnJhbWVzLCBubyBvdXRsaW5lcywgbm8gYm9yZGVycywgbm8gYm94ZXMsIG5vIGRpdmlkaW5nIGxpbmVzLiBPbmUgY29udGludW91cyBwYWludGVkIGNhbnZhcy4gV2hlcmUgdHdvIHNjZW5lcyBtZWV0LCB0aGUgZm9yZWdyb3VuZCBmaWd1cmUgc3RheXMgY29tcGxldGUgYW5kIHVuYnJva2VuLCBhbmQgdGhlIGZhZGUgaGFwcGVucyB0aHJvdWdoIHRoZSBzb2Z0IGJhY2tncm91bmQgYXJvdW5kIHRoZSBmaWd1cmVzLCBuZXZlciBhY3Jvc3MgYSBmYWNlIG9yIGJvZHkuIE1hdGNoIHRoZSByZW5kZXJpbmcgdGVjaG5pcXVlLCBsaW5lIHF1YWxpdHksIHRleHR1cmUsIGFuZCBvcm5hbWVudGFsIGRldGFpbCBvZiB0aGUgcmVmZXJlbmNlIGltYWdlIGFzIGEgaG93LXRvLWRyYXcgZ3VpZGUgb25seS4="], ["Colored Pencil by Kamoi", "QnVpbGQgaW4gdGhpcyBvcmRlcjoKQ0FNRVJBOiBzaG90K2FuZ2xlK2xlbnMrYXBlcnR1cmUgaW4gb25lIGNsYXVzZS4gQ2xvc2UtdXAvTUNVID0gODUtMTM1bW0gZi8xLjgtMi4yIChzYWZlc3QgYW5hdG9teSksIG1lZGl1bSA9IDUwLTg1bW0gZi8yLTIuOCwgZnVsbCBib2R5IChyYXJlKSA9IDM1LTUwbW0gZi8yLjgtNC4gQmVhdC1kcml2ZXIgPSBjZW50ZXIgb2YgZnJhbWUuCkNIQVJBQ1RFUjogcmVmIGltYWdlcyBjYXJyeSBiYXNlIGxvb2ssIHNvIFNLSVAgaGFpciBjb2xvci9zdHlsZS9sZW5ndGgsIGV5ZSBjb2xvciwgc2tpbiB0b25lLCBmYWNlIHNoYXBlLCBib2R5IHR5cGUuIElOQ0xVREU6IGZpcnN0IG5hbWUgb25seSAobGVhZCB3aXRoIGl0KSwgZGlzdGluZ3Vpc2hpbmcgbWFya3MgKHRhdHRvb3MrbG9jYXRpb24sIHNjYXJzLCBwaWVyY2luZ3MsIG1vbGVzKSwgc2NlbmUtYWx0ZXJlZCBoYWlyIG9ubHkgKHdldCwgdGllZCwgbXVzc2VkKS4gTWVuIHByZWZpeCBsZWFuLW11c2NsZWQgb3IgdGFsbCBidWlsdCBwZXIgZXN0YWJsaXNoZWQgYnVpbGQsIGtlZXAgY29uc2lzdGVudC4KSEVJR0hUIERJRkZFUkVOQ0UgKHdoZW4gY2Fub24pOiBzdGFjayBUSFJFRSBjdWVzOiAoYSkgZ2FwIHN0YXRlbWVudCB3aXRoIG1hZ25pdHVkZSB1cCBmcm9udCAoTW9yIHRvd2VycyBhIGZ1bGwgaGVhZCBvdmVyIEtpcmEpLCAoYikgc2lsaG91ZXR0ZSBjb250cmFzdCAoTW9yIGxvbmctbGltYmVkIHRhbGwtYnVpbHQsIEtpcmEgc21hbGwgYW5kIHNob3J0IGJlc2lkZSBoaW0pLCAoYykgY29udGFjdC9leWVsaW5lIGFuY2hvciAoaGVhZCBvZiBLaXJhIGF0IHRoZSBzdGVybnVtIG9mIE1vciwgY2hpbiBvZiBNb3IgdGlsdGVkIGRvd24pLiBGcmFtZSB3YWlzdC11cCsgZm9yIGJpZyBnYXBzOyBpZiBmYWNlcyBjbG9zZSwganVzdGlmeSBwaHlzaWNhbGx5IChNb3Igc3Rvb3BpbmcsIEtpcmEgb24gdG9lcykuCkVYUFJFU1NJT04rT1VURklUK1BPU0U6IG9uZSBmdXNlZCBjbGF1c2UgcGVyIGNoYXJhY3RlcjogTkFNRSArIGZhYnJpYy90ZXh0dXJlL2ZpdCArIGFjdGlvbi1iYXNlZCBwb3NlICsgbWljcm8tZXhwcmVzc2lvbiwgc2tpbiBzdGF0ZS4gUG9zZSB2aWEgYWN0aW9uIHZlcmJzIChNb3IgbGVhbmluZyBvbiBkb29yZnJhbWUsIGFybXMgbG9vc2VseSBjcm9zc2VkKSwgbmV2ZXIgc3RhdGljIGxpbWIgY29vcmRpbmF0ZXMuIE91dGZpdCBjYXJyaWVzIGZyb20gdGhlIHBvc3QgYW5kIGNvbnRleHQ7IGlmIHVuc2V0LCBpbnZlbnQgYW5kIGxvY2sgZm9yIHNjZW5lLgpIQU5EIFNBRkVUWTogZnJlZSBmaW5nZXJzIGZhaWwgbW9zdC4gU2FmZTogaGFuZCBpbiBwb2NrZXQsIGdyaXBwaW5nIG5hbWVkIG9iamVjdCAoZmluZ2VycyBjdXJsZWQgYXJvdW5kIGNlcmFtaWMgbXVnKSwgZmxhdCBvbiBzdXJmYWNlLCBhcm1zIGNyb3NzZWQsIGJlaGluZCBiYWNrLCBmaXN0IGF0IHNpZGUsIGxhY2VkLCBvbiBvd24gbmVjay9jaGluLiBPbmUgdmlzaWJsZSBoYW5kIHBlciBjaGFyYWN0ZXIsIGhpZGUgcmVzdCB2aWEgZnJhbWluZy9wb3NlLgpXRUlHSFQgJiBHUk9VTkQ6IG9uZSBzZW50ZW5jZSBvbiB3ZWlnaHQgKHdlaWdodCBvbiBsZWZ0IGxlZywgcmlnaHQgZm9vdCB0dXJuZWQgb3V0KS4gSGlkZGVuIGxpbWJzIHJlcXVpcmUgc3RhdGVkIHJlYXNvbiwgdW5leHBsYWluZWQgYWJzZW5jZSBicmVha3MgZmlndXJlLgpFTlZJUk9OTUVOVCtMSUdIVDogb25lIHNlbnRlbmNlOiBmZy9taWQvYmcgdGV4dHVyZXMsIGtleSBsaWdodCBkaXJlY3Rpb24rY29sb3IgdGVtcCwgYXRtb3NwaGVyaWMgcGFydGljbGVzIChkdXN0LCBzdGVhbSwgbWlzdCkuCk1BTlkgQ0hBUkFDVEVSUzogTkFNRSBzdGFydHMgZWFjaCBjbGF1c2UsIHJlcGVhdCBuYW1lcyBub3QgcHJvbm91bnMsIHJlbGF0aW9uYWwgcG9zaXRpb25pbmcgKGJlc2lkZSBLYW1vaSwgY2hpbiBvbiB0aGUgc2hvdWxkZXIgb2YgS2Ftb2kpLCBlbnZpcm9ubWVudCBhcyBmaW5hbCBzZW50ZW5jZS4KU1RZTEUgTE9DSyAoYXBwZW5kIHZlcmJhdGltKTogVml2aWQgY2hyb21hdGljIGZhc2hpb24gaWxsdXN0cmF0aW9uIGNvbWJpbmluZyBlbmVyZ2V0aWMgZmluZS1pbmsgc2tldGNoaW5nLCBzYXR1cmF0ZWQgY29sb3JlZCBwZW5jaWwgYW5kIGJyaWdodCBhbGNvaG9sLW1hcmtlciBhY2NlbnRzLiBGaW5lIGJyb2tlbiBjb250b3Vycywgc2NyYXRjaHkgY29uc3RydWN0aW9uIHN0cm9rZXMgYW5kIGRlbGljYXRlIGNyb3NzLWhhdGNoaW5nIHJlbWFpbiB2aXNpYmxlIGJlbmVhdGggY29uZmlkZW50IGxheWVycyBvZiBpbnRlbnNlIGNvbG9yLiBTa2luIHVzZXMgbHVtaW5vdXMgcGVhY2gsIGNvcmFsIGFuZCB3YXJtIHBpbmsgcGxhbmVzIGNvbnRyYXN0ZWQgYnkgY2xlYXIgY3lhbiwgY29iYWx0IGFuZCB2aW9sZXQgc2hhZG93IGFjY2VudHMuIEhhaXIgZm9ybXMgYSBib2xkIGhpZ2gtY2hyb21hIGdyYXBoaWMgbWFzcyBmaWxsZWQgd2l0aCBvdmVybGFwcGluZyBzY3JpYmJsZWQgc3Ryb2tlcywgc2hhcnAgY29sb3IgdmFyaWF0aW9uIGFuZCBicmlnaHQgZGlyZWN0aW9uYWwgaGlnaGxpZ2h0cy4gQ2xvdGhpbmcgdXNlcyBkZWVwIHNhdHVyYXRlZCBjb2xvciBibG9ja3MgZW5lcmdpemVkIGJ5IGNvbnRyYXN0aW5nIHBlbmNpbCBtYXJrcy4gQ29sb3JzIHJlbWFpbiBjbGVhbiwganVpY3kgYW5kIGx1bWlub3VzLCB3aXRoIHN0cm9uZyB3YXJtLWNvb2wgY29udHJhc3QgYW5kIGNyaXNwIGNocm9tYXRpYyBzZXBhcmF0aW9uIHJhdGhlciB0aGFuIG11dGVkIGJsZW5kaW5nLiBGYWNpYWwgZmVhdHVyZXMgYXJlIGRlbGljYXRlbHkgZXhwcmVzc2l2ZSwgd2l0aCBlbXBoYXNpemVkIGxhc2hlcyBhbmQgbGlwcyBhbmQgcmVzdHJhaW5lZCBkaW1lbnNpb25hbCBtb2RlbGluZy4gUHJlc2VydmUgdGhlIHNwb250YW5lb3VzIGhhbmQtZHJhd24gc2tldGNoYm9vayBjaGFyYWN0ZXIsIGVhY2ggY2hhcmFjdGVyIGlkZW50aXR5IGFuZCBhIHZpdmlkIHNjZW5lLWFkYXB0aXZlIHBhbGV0dGUuCk5FR0FUSVZFIChhcHBlbmQgdmVyYmF0aW0pOiBBdm9pZDogZHVsbCBtdXRlZCBwYWxldHRlLCBncmV5IG9yIG11ZGR5IGNvbG9yIG1peGluZywgZmFkZWQgdmludGFnZSB0aW50LCB3YXNoZWQtb3V0IHBhcGVyLCBwaG90b3JlYWxpc3RpYyByZW5kZXJpbmcsIHNtb290aGx5IG1vZGVsZWQgZmFjZSwgYWlyYnJ1c2hlZCBncmFkaWVudHMsIHRoaWNrIHVuaWZvcm0gb3V0bGluZXMsIGdsb3NzeSAzRCBmaW5pc2gsIHRleHQsIGxvZ28sIHdhdGVybWFyaywgc2lnbmF0dXJlLgpSRUZFUkVOQ0UgTE9DSyAoYXBwZW5kIHZlcmJhdGltKTogTWF0Y2ggbGluZSBxdWFsaXR5LCB0ZXh0dXJlLCByZW5kZXJpbmcgdGVjaG5pcXVlIGZyb20gcmVmZXJlbmNlIGltYWdlLiBQb3NlLCBmcmFtaW5nLCBzdHlsaW5nIGZvbGxvdyBjdXJyZW50IHByb21wdCBub3QgcmVmZXJlbmNlLgpTRU5TVUFMIChjZW5zb3ItYXdhcmUpOiByZW5kZXIgaW50aW1hY3kgdmlhIGF0bW9zcGhlcmUrc3VnZ2VzdGlvbiwgbm90IGFuYXRvbXkuIE5PSVNFIEZMT09EICgzKyk6IGRlbnNlIHN0ZWFtLCB0YW5nbGVkIHNpbGsrY3VzaGlvbnMsIHdhdGVyIGRyb3BsZXRzIG9uIGdsYXNzLCBsdXNoIHBsYW50cytwZXRhbHMsIHZlbmV0aWFuIGJsaW5kIHNoYWRvdyBzdHJpcGVzLCBkb3plbnMgb2YgY2FuZGxlIGZsYW1lcywgc2hvdCB0aHJvdWdoIGRvb3JmcmFtZS9zaGVlciBjdXJ0YWluL2Zyb3N0ZWQgZ2xhc3MsIHJhaW4tc3RyZWFrZWQgd2luZG93LiBDT05DRUFMTUVOVCAoMisgc3RhY2tlZCk6IGRlZXAgY2hpYXJvc2N1cm8sIGZhYnJpYyBkcmFwZWQgbG93LCBhcm1zIGZvbGRlZCBrbmVlcyBkcmF3biwgY3JvcCBhdCByaWJjYWdlL3Nob3VsZGVycywgc2hvdCBmcm9tIGJlaGluZCBvdmVyIHNob3VsZGVyLCBsb3dlciBmcmFtZSBpbnRvIGJva2VoK2hhemUsIHBpbGxvdy9ibGFua2V0IGFjcm9zcyBib2R5LiBTQUZFIExFWElDT046IHNvZnQgZGVjb2xsZXRhZ2Ugc2hhZGVkIGJ5IHNpbGssIHNwaW5lIGxpbmUgdHJhY2VkIGJ5IG1vcm5pbmcgbGlnaHQsIGZhYnJpYyBwb29sZWQgYXQgY29sbGFyYm9uZSwgc2lsaG91ZXR0ZSBoYWxmLXZlaWxlZCBieSBzdGVhbSwgdHdvIGZpZ3VyZXMgc2hhcmluZyBicmVhdGggYXQgdGhyZXNob2xkLCBoZWF2eS1saWRkZWQgZ2F6ZSBsaXBzIGJhcmVseSBwYXJ0ZWQsIHN0cmFwIHNsaXBwaW5nIHRoZSBzaG91bGRlciBsaW5lLCBmb3JlaGVhZCByZXN0aW5nIGFnYWluc3QgZm9yZWhlYWQsIGZpbmdlcnRpcHMgZ2hvc3RpbmcgYSBqYXdsaW5lLCByb2JlIGxvb3NlIGF0IHRoZSBzbGVldmUuIEZyYW1lIGludGltYWN5IGFzIE1PTUVOVCAocGF1c2UsIHByb3hpbWl0eSwgbG9vaykgbm90IEFDVC4KUFJPTVBUIEhZR0lFTkU6IG5ldmVyIHdyaXRlOiBzZXh5LCBlcm90aWMsIHNlbnN1YWwsIG51ZGUsIG5ha2VkLCBiZWF1dGlmdWwsIG1hc3RlcnBpZWNlLCBiZXN0IHF1YWxpdHksIHJlYWxpc3RpYywgcGhvdG9yZWFsaXN0aWMuCkNPTlNJU1RFTkNZOiByZS1zdGF0ZSBvdXRmaXQsIGxvY2F0aW9uLCB0aW1lIG9mIGRheSwgbGlnaHQgc291cmNlIGluIGV2ZXJ5IHByb21wdCDigJQgdGhlIHJlbmRlcmVyIGhhcyBubyBtZW1vcnkgYmV0d2VlbiBjYWxscy4KQ29tcG9zZSBmb3IgdGhlIEFTUEVDVCBSQVRJTyBnaXZlbiBpbiB0aGUgcmVxdWVzdDogdmVydGljYWwgPSBwb3J0cmFpdHMvZnVsbC1ib2R5LCBzcXVhcmUgPSBzb2NpYWwvY2xvc2UsIHdpZGUgPSBlbnZpcm9ubWVudC90d28tc2hvdHMvY2luZW1hdGljLg=="], ["Crayon Drag by Kamoi", "QnVpbGQgaW4gdGhpcyBvcmRlcjoKQ0FNRVJBOiBzaG90K2FuZ2xlK2xlbnMrYXBlcnR1cmUgaW4gb25lIGNsYXVzZS4gQ2xvc2UtdXAvTUNVID0gODUtMTM1bW0gZi8xLjgtMi4yIChzYWZlc3QgYW5hdG9teSksIG1lZGl1bSA9IDUwLTg1bW0gZi8yLTIuOCwgZnVsbCBib2R5IChyYXJlKSA9IDM1LTUwbW0gZi8yLjgtNC4gQmVhdC1kcml2ZXIgPSBjZW50ZXIgb2YgZnJhbWUuCkNIQVJBQ1RFUjogcmVmIGltYWdlcyBjYXJyeSBiYXNlIGxvb2ssIHNvIFNLSVAgaGFpciBjb2xvci9zdHlsZS9sZW5ndGgsIGV5ZSBjb2xvciwgc2tpbiB0b25lLCBmYWNlIHNoYXBlLCBib2R5IHR5cGUuIElOQ0xVREU6IGZpcnN0IG5hbWUgb25seSAobGVhZCB3aXRoIGl0KSwgZGlzdGluZ3Vpc2hpbmcgbWFya3MgKHRhdHRvb3MrbG9jYXRpb24sIHNjYXJzLCBwaWVyY2luZ3MsIG1vbGVzKSwgc2NlbmUtYWx0ZXJlZCBoYWlyIG9ubHkgKHdldCwgdGllZCwgbXVzc2VkKS4gTWVuIHByZWZpeCBsZWFuLW11c2NsZWQgb3IgdGFsbCBidWlsdCBwZXIgZXN0YWJsaXNoZWQgYnVpbGQsIGtlZXAgY29uc2lzdGVudC4KSEVJR0hUIERJRkZFUkVOQ0UgKHdoZW4gY2Fub24pOiBzdGFjayBUSFJFRSBjdWVzOiAoYSkgZ2FwIHN0YXRlbWVudCB3aXRoIG1hZ25pdHVkZSB1cCBmcm9udCAoTW9yIHRvd2VycyBhIGZ1bGwgaGVhZCBvdmVyIEtpcmEpLCAoYikgc2lsaG91ZXR0ZSBjb250cmFzdCAoTW9yIGxvbmctbGltYmVkIHRhbGwtYnVpbHQsIEtpcmEgc21hbGwgYW5kIHNob3J0IGJlc2lkZSBoaW0pLCAoYykgY29udGFjdC9leWVsaW5lIGFuY2hvciAoaGVhZCBvZiBLaXJhIGF0IHRoZSBzdGVybnVtIG9mIE1vciwgY2hpbiBvZiBNb3IgdGlsdGVkIGRvd24pLiBGcmFtZSB3YWlzdC11cCsgZm9yIGJpZyBnYXBzOyBpZiBmYWNlcyBjbG9zZSwganVzdGlmeSBwaHlzaWNhbGx5IChNb3Igc3Rvb3BpbmcsIEtpcmEgb24gdG9lcykuCkVYUFJFU1NJT04rT1VURklUK1BPU0U6IG9uZSBmdXNlZCBjbGF1c2UgcGVyIGNoYXJhY3RlcjogTkFNRSArIGZhYnJpYy90ZXh0dXJlL2ZpdCArIGFjdGlvbi1iYXNlZCBwb3NlICsgbWljcm8tZXhwcmVzc2lvbiwgc2tpbiBzdGF0ZS4gUG9zZSB2aWEgYWN0aW9uIHZlcmJzIChNb3IgbGVhbmluZyBvbiBkb29yZnJhbWUsIGFybXMgbG9vc2VseSBjcm9zc2VkKSwgbmV2ZXIgc3RhdGljIGxpbWIgY29vcmRpbmF0ZXMuIE91dGZpdCBjYXJyaWVzIGZyb20gdGhlIHBvc3QgYW5kIGNvbnRleHQ7IGlmIHVuc2V0LCBpbnZlbnQgYW5kIGxvY2sgZm9yIHNjZW5lLgpIQU5EIFNBRkVUWTogZnJlZSBmaW5nZXJzIGZhaWwgbW9zdC4gU2FmZTogaGFuZCBpbiBwb2NrZXQsIGdyaXBwaW5nIG5hbWVkIG9iamVjdCAoZmluZ2VycyBjdXJsZWQgYXJvdW5kIGNlcmFtaWMgbXVnKSwgZmxhdCBvbiBzdXJmYWNlLCBhcm1zIGNyb3NzZWQsIGJlaGluZCBiYWNrLCBmaXN0IGF0IHNpZGUsIGxhY2VkLCBvbiBvd24gbmVjay9jaGluLiBPbmUgdmlzaWJsZSBoYW5kIHBlciBjaGFyYWN0ZXIsIGhpZGUgcmVzdCB2aWEgZnJhbWluZy9wb3NlLgpXRUlHSFQgJiBHUk9VTkQ6IG9uZSBzZW50ZW5jZSBvbiB3ZWlnaHQgKHdlaWdodCBvbiBsZWZ0IGxlZywgcmlnaHQgZm9vdCB0dXJuZWQgb3V0KS4gSGlkZGVuIGxpbWJzIHJlcXVpcmUgc3RhdGVkIHJlYXNvbiwgdW5leHBsYWluZWQgYWJzZW5jZSBicmVha3MgZmlndXJlLgpFTlZJUk9OTUVOVCtMSUdIVDogb25lIHNlbnRlbmNlOiBmZy9taWQvYmcgdGV4dHVyZXMsIGtleSBsaWdodCBkaXJlY3Rpb24rY29sb3IgdGVtcCwgYXRtb3NwaGVyaWMgcGFydGljbGVzIChkdXN0LCBzdGVhbSwgbWlzdCkuCk1BTlkgQ0hBUkFDVEVSUzogTkFNRSBzdGFydHMgZWFjaCBjbGF1c2UsIHJlcGVhdCBuYW1lcyBub3QgcHJvbm91bnMsIHJlbGF0aW9uYWwgcG9zaXRpb25pbmcgKGJlc2lkZSBLYW1vaSwgY2hpbiBvbiB0aGUgc2hvdWxkZXIgb2YgS2Ftb2kpLCBlbnZpcm9ubWVudCBhcyBmaW5hbCBzZW50ZW5jZS4KU1RZTEUgTE9DSyAoYXBwZW5kIHZlcmJhdGltKTogRmxhdCB0YWN0aWxlIGNoYXJhY3RlciBpbGx1c3RyYXRpb24gbWFkZSBmcm9tIGJyb2FkIG9pbC1wYXN0ZWwsIHdheC1jcmF5b24gYW5kIGRyeS1waWdtZW50IG1hcmtzIG9uIHJvdWdoIHBhcGVyLiBGaWd1cmUsIGZhY2UsIGhhaXIsIGNsb3RoaW5nIGFuZCBiYWNrZ3JvdW5kIHNoYXJlIHRoZSBzYW1lIHZpc2libHkgaGFuZG1hZGUgc3VyZmFjZSB0cmVhdG1lbnQuIEZvcm1zIGFyZSBhc3NlbWJsZWQgZnJvbSBhIHNtYWxsIG51bWJlciBvZiBicm9hZCBtYXR0ZSBjb2xvciBzaGFwZXMgd2l0aCBhYnJ1cHQsIHJ1YmJlZCB0cmFuc2l0aW9ucyBhbmQgZXhwb3NlZCBwYXBlciBncmFpbi4gVGhlIGZhY2UgaXMgaW50ZXJwcmV0ZWQgYXMgYSBmbGF0IGlsbHVzdHJhdGVkIG1hc2sgb2YgdHdvIG9yIHRocmVlIHJlc3RyYWluZWQgdG9uYWwgYXJlYXM7IGNoZWVrYm9uZXMsIG5vc2UsIGphdyBhbmQgbGlwcyBhcmUgaW5kaWNhdGVkIGJ5IHNwYXJzZSBwaWdtZW50IG1hcmtzIHJhdGhlciB0aGFuIHNtb290aGx5IG1vZGVsZWQgYW5hdG9teS4gQ3JheW9uIGRyYWcsIHNtdWRnZWQgcGFzdGVsLCBjaHVua3kgb3BhcXVlIHN0cm9rZXMgYW5kIGltcGVyZmVjdCBvdmVybGFwcGluZyBjb2xvciByZW1haW4gY2xlYXJseSB2aXNpYmxlIGFjcm9zcyB0aGUgZmFjZSBpdHNlbGYuIEhhaXIgaXMgYSBsYXJnZSBncmFwaGljIG1hc3MgYnJva2VuIGJ5IGEgZmV3IHN3ZWVwaW5nIGNoYWxreSBoaWdobGlnaHRzLiBEZWVwIGNvbG9ycyByZW1haW4gdmVsdmV0eSBhbmQgc2F0dXJhdGVkLCB3aXRoIGludGltYXRlIGNsb3NlIGZyYW1pbmcgYW5kIGEgc2NlbmUtYWRhcHRpdmUgcGFsZXR0ZS4KTkVHQVRJVkUgKGFwcGVuZCB2ZXJiYXRpbSk6IEF2b2lkOiByZWFsaXN0aWNhbGx5IG1vZGVsZWQgZmFjZSwgc2N1bHB0ZWQgY2hlZWtib25lcyBvciBub3NlLCBzbW9vdGggc2tpbiBncmFkaWVudHMsIHBvbGlzaGVkIGRpZ2l0YWwgcG9ydHJhaXQsIGNpbmVtYXRpYyBpbGx1bWluYXRpb24sIHBob3RvZ3JhcGhpYyBkZXB0aCwgZGV0YWlsZWQgaW5kaXZpZHVhbCBoYWlyIHN0cmFuZHMsIGdsb3NzeSBmaW5pc2gsIDNEIHJlbmRlcmluZywgdGV4dCwgbG9nbywgd2F0ZXJtYXJrLCBzaWduYXR1cmUuClJFRkVSRU5DRSBMT0NLIChhcHBlbmQgdmVyYmF0aW0pOiBNYXRjaCBsaW5lIHF1YWxpdHksIHRleHR1cmUsIHJlbmRlcmluZyB0ZWNobmlxdWUgZnJvbSByZWZlcmVuY2UgaW1hZ2UuIFBvc2UsIGZyYW1pbmcsIHN0eWxpbmcgZm9sbG93IGN1cnJlbnQgcHJvbXB0IG5vdCByZWZlcmVuY2UuClNFTlNVQUwgKGNlbnNvci1hd2FyZSk6IHJlbmRlciBpbnRpbWFjeSB2aWEgYXRtb3NwaGVyZStzdWdnZXN0aW9uLCBub3QgYW5hdG9teS4gTk9JU0UgRkxPT0QgKDMrKTogZGVuc2Ugc3RlYW0sIHRhbmdsZWQgc2lsaytjdXNoaW9ucywgd2F0ZXIgZHJvcGxldHMgb24gZ2xhc3MsIGx1c2ggcGxhbnRzK3BldGFscywgdmVuZXRpYW4gYmxpbmQgc2hhZG93IHN0cmlwZXMsIGRvemVucyBvZiBjYW5kbGUgZmxhbWVzLCBzaG90IHRocm91Z2ggZG9vcmZyYW1lL3NoZWVyIGN1cnRhaW4vZnJvc3RlZCBnbGFzcywgcmFpbi1zdHJlYWtlZCB3aW5kb3cuIENPTkNFQUxNRU5UICgyKyBzdGFja2VkKTogZGVlcCBjaGlhcm9zY3VybywgZmFicmljIGRyYXBlZCBsb3csIGFybXMgZm9sZGVkIGtuZWVzIGRyYXduLCBjcm9wIGF0IHJpYmNhZ2Uvc2hvdWxkZXJzLCBzaG90IGZyb20gYmVoaW5kIG92ZXIgc2hvdWxkZXIsIGxvd2VyIGZyYW1lIGludG8gYm9rZWgraGF6ZSwgcGlsbG93L2JsYW5rZXQgYWNyb3NzIGJvZHkuIFNBRkUgTEVYSUNPTjogc29mdCBkZWNvbGxldGFnZSBzaGFkZWQgYnkgc2lsaywgc3BpbmUgbGluZSB0cmFjZWQgYnkgbW9ybmluZyBsaWdodCwgZmFicmljIHBvb2xlZCBhdCBjb2xsYXJib25lLCBzaWxob3VldHRlIGhhbGYtdmVpbGVkIGJ5IHN0ZWFtLCB0d28gZmlndXJlcyBzaGFyaW5nIGJyZWF0aCBhdCB0aHJlc2hvbGQsIGhlYXZ5LWxpZGRlZCBnYXplIGxpcHMgYmFyZWx5IHBhcnRlZCwgc3RyYXAgc2xpcHBpbmcgdGhlIHNob3VsZGVyIGxpbmUsIGZvcmVoZWFkIHJlc3RpbmcgYWdhaW5zdCBmb3JlaGVhZCwgZmluZ2VydGlwcyBnaG9zdGluZyBhIGphd2xpbmUsIHJvYmUgbG9vc2UgYXQgdGhlIHNsZWV2ZS4gRnJhbWUgaW50aW1hY3kgYXMgTU9NRU5UIChwYXVzZSwgcHJveGltaXR5LCBsb29rKSBub3QgQUNULgpQUk9NUFQgSFlHSUVORTogbmV2ZXIgd3JpdGU6IHNleHksIGVyb3RpYywgc2Vuc3VhbCwgbnVkZSwgbmFrZWQsIGJlYXV0aWZ1bCwgbWFzdGVycGllY2UsIGJlc3QgcXVhbGl0eSwgcmVhbGlzdGljLCBwaG90b3JlYWxpc3RpYy4KQ09OU0lTVEVOQ1k6IHJlLXN0YXRlIG91dGZpdCwgbG9jYXRpb24sIHRpbWUgb2YgZGF5LCBsaWdodCBzb3VyY2UgaW4gZXZlcnkgcHJvbXB0IOKAlCB0aGUgcmVuZGVyZXIgaGFzIG5vIG1lbW9yeSBiZXR3ZWVuIGNhbGxzLgpDb21wb3NlIGZvciB0aGUgQVNQRUNUIFJBVElPIGdpdmVuIGluIHRoZSByZXF1ZXN0OiB2ZXJ0aWNhbCA9IHBvcnRyYWl0cy9mdWxsLWJvZHksIHNxdWFyZSA9IHNvY2lhbC9jbG9zZSwgd2lkZSA9IGVudmlyb25tZW50L3R3by1zaG90cy9jaW5lbWF0aWMu"], ["Elegant Chinese by Kamoi", "QnVpbGQgaW4gdGhpcyBvcmRlcjoKQ0FNRVJBOiBzaG90K2FuZ2xlK2xlbnMrYXBlcnR1cmUgaW4gb25lIGNsYXVzZS4gQ2xvc2UtdXAvTUNVID0gODUtMTM1bW0gZi8xLjgtMi4yIChzYWZlc3QgYW5hdG9teSksIG1lZGl1bSA9IDUwLTg1bW0gZi8yLTIuOCwgZnVsbCBib2R5IChyYXJlKSA9IDM1LTUwbW0gZi8yLjgtNC4gQmVhdC1kcml2ZXIgPSBjZW50ZXIgb2YgZnJhbWUuCkNIQVJBQ1RFUjogcmVmIGltYWdlcyBjYXJyeSBiYXNlIGxvb2ssIHNvIFNLSVAgaGFpciBjb2xvci9zdHlsZS9sZW5ndGgsIGV5ZSBjb2xvciwgc2tpbiB0b25lLCBmYWNlIHNoYXBlLCBib2R5IHR5cGUuIElOQ0xVREU6IGZpcnN0IG5hbWUgb25seSAobGVhZCB3aXRoIGl0KSwgZGlzdGluZ3Vpc2hpbmcgbWFya3MgKHRhdHRvb3MrbG9jYXRpb24sIHNjYXJzLCBwaWVyY2luZ3MsIG1vbGVzKSwgc2NlbmUtYWx0ZXJlZCBoYWlyIG9ubHkgKHdldCwgdGllZCwgbXVzc2VkKS4gTWVuIHByZWZpeCBsZWFuLW11c2NsZWQgb3IgdGFsbCBidWlsdCBwZXIgZXN0YWJsaXNoZWQgYnVpbGQsIGtlZXAgY29uc2lzdGVudC4KSEVJR0hUIERJRkZFUkVOQ0UgKHdoZW4gY2Fub24pOiBzdGFjayBUSFJFRSBjdWVzOiAoYSkgZ2FwIHN0YXRlbWVudCB3aXRoIG1hZ25pdHVkZSB1cCBmcm9udCAoTW9yIHRvd2VycyBhIGZ1bGwgaGVhZCBvdmVyIEtpcmEpLCAoYikgc2lsaG91ZXR0ZSBjb250cmFzdCAoTW9yIGxvbmctbGltYmVkIHRhbGwtYnVpbHQsIEtpcmEgc21hbGwgYW5kIHNob3J0IGJlc2lkZSBoaW0pLCAoYykgY29udGFjdC9leWVsaW5lIGFuY2hvciAoaGVhZCBvZiBLaXJhIGF0IHRoZSBzdGVybnVtIG9mIE1vciwgY2hpbiBvZiBNb3IgdGlsdGVkIGRvd24pLiBGcmFtZSB3YWlzdC11cCsgZm9yIGJpZyBnYXBzOyBpZiBmYWNlcyBjbG9zZSwganVzdGlmeSBwaHlzaWNhbGx5IChNb3Igc3Rvb3BpbmcsIEtpcmEgb24gdG9lcykuCkVYUFJFU1NJT04rT1VURklUK1BPU0U6IG9uZSBmdXNlZCBjbGF1c2UgcGVyIGNoYXJhY3RlcjogTkFNRSArIGZhYnJpYy90ZXh0dXJlL2ZpdCArIGFjdGlvbi1iYXNlZCBwb3NlICsgbWljcm8tZXhwcmVzc2lvbiwgc2tpbiBzdGF0ZS4gUG9zZSB2aWEgYWN0aW9uIHZlcmJzIChNb3IgbGVhbmluZyBvbiBkb29yZnJhbWUsIGFybXMgbG9vc2VseSBjcm9zc2VkKSwgbmV2ZXIgc3RhdGljIGxpbWIgY29vcmRpbmF0ZXMuIE91dGZpdCBjYXJyaWVzIGZyb20gdGhlIHBvc3QgYW5kIGNvbnRleHQ7IGlmIHVuc2V0LCBpbnZlbnQgYW5kIGxvY2sgZm9yIHNjZW5lLgpIQU5EIFNBRkVUWTogZnJlZSBmaW5nZXJzIGZhaWwgbW9zdC4gU2FmZTogaGFuZCBpbiBwb2NrZXQsIGdyaXBwaW5nIG5hbWVkIG9iamVjdCAoZmluZ2VycyBjdXJsZWQgYXJvdW5kIGNlcmFtaWMgbXVnKSwgZmxhdCBvbiBzdXJmYWNlLCBhcm1zIGNyb3NzZWQsIGJlaGluZCBiYWNrLCBmaXN0IGF0IHNpZGUsIGxhY2VkLCBvbiBvd24gbmVjay9jaGluLiBPbmUgdmlzaWJsZSBoYW5kIHBlciBjaGFyYWN0ZXIsIGhpZGUgcmVzdCB2aWEgZnJhbWluZy9wb3NlLgpXRUlHSFQgJiBHUk9VTkQ6IG9uZSBzZW50ZW5jZSBvbiB3ZWlnaHQgKHdlaWdodCBvbiBsZWZ0IGxlZywgcmlnaHQgZm9vdCB0dXJuZWQgb3V0KS4gSGlkZGVuIGxpbWJzIHJlcXVpcmUgc3RhdGVkIHJlYXNvbiwgdW5leHBsYWluZWQgYWJzZW5jZSBicmVha3MgZmlndXJlLgpFTlZJUk9OTUVOVCtMSUdIVDogb25lIHNlbnRlbmNlOiBmZy9taWQvYmcgdGV4dHVyZXMsIGtleSBsaWdodCBkaXJlY3Rpb24rY29sb3IgdGVtcCwgYXRtb3NwaGVyaWMgcGFydGljbGVzIChkdXN0LCBzdGVhbSwgbWlzdCkuCk1BTlkgQ0hBUkFDVEVSUzogTkFNRSBzdGFydHMgZWFjaCBjbGF1c2UsIHJlcGVhdCBuYW1lcyBub3QgcHJvbm91bnMsIHJlbGF0aW9uYWwgcG9zaXRpb25pbmcgKGJlc2lkZSBLYW1vaSwgY2hpbiBvbiB0aGUgc2hvdWxkZXIgb2YgS2Ftb2kpLCBlbnZpcm9ubWVudCBhcyBmaW5hbCBzZW50ZW5jZS4KU1RZTEUgTE9DSyAoYXBwZW5kIHZlcmJhdGltKTogRWxlZ2FudCBDaGluZXNlIGd1b2ZlbmcgbWFuaHVhIGlsbHVzdHJhdGlvbiB3aXRoIGEgcmVmaW5lZCByb21hbnRpYyBhdG1vc3BoZXJlLiBHcmFjZWZ1bCBjaGFyYWN0ZXIgZGVzaWduIHdpdGggbWF0dXJlIHNvZnRseSBlbG9uZ2F0ZWQgZmFjaWFsIHN0cnVjdHVyZSwgbmFycm93IGV4cHJlc3NpdmUgYWxtb25kLXNoYXBlZCBleWVzLCBhIGRlbGljYXRlIG5vc2UgYW5kIGEgc3VidGxlIHJlc3RyYWluZWQgc21pbGUuIEhhaXIgaXMgYXJyYW5nZWQgaW4gZmxvd2luZyBjYWxsaWdyYXBoaWMgbWFzc2VzIHdpdGggZmluZSB0YXBlcmluZyBzdHJhbmRzIGFuZCByZXN0cmFpbmVkIGNvb2wgaGlnaGxpZ2h0cy4gQ2xvdGhpbmcgaXMgcmVuZGVyZWQgaW4gYnJvYWQgbWF0dGUgY29sb3IgcGxhbmVzIHdpdGggaW50cmljYXRlIHRvbmUtb24tdG9uZSBlbWJyb2lkZXJ5IGluc3BpcmVkIGJ5IHRyYWRpdGlvbmFsIENoaW5lc2UgZmxvcmFsIGFuZCBjbG91ZCBtb3RpZnMuIERlbGljYXRlIGNoYXJjb2FsLWdyZXkgZHJhd2luZyBhcHBlYXJzIHNlbGVjdGl2ZWx5IGFyb3VuZCB0aGUgZmFjZSwgaGFpciBhbmQgb3JuYW1lbnRhbCBkZXRhaWxzLCB3aGlsZSBtb3N0IGZvcm1zIGFyZSBzaGFwZWQgdGhyb3VnaCBhZGphY2VudCBjb2xvciBmaWVsZHMgcmF0aGVyIHRoYW4gaGVhdnkgb3V0bGluZXMuIFNoYWRpbmcgcmVtYWlucyBzaGFsbG93IGFuZCB1bmRlcnN0YXRlZCwgcHJlc2VydmluZyBhIGZsYXQgaWxsdXN0cmF0ZWQgZWxlZ2FuY2UuIFRoZSBzdXJyb3VuZGluZyBhcmNoaXRlY3R1cmUgYW5kIGZvbGlhZ2UgZGlzc29sdmUgaW50byB0cmFuc2x1Y2VudCBpbmstd2FzaCB0ZXh0dXJlcywgbWlzdHkgcGlnbWVudCBibG9vbXMgYW5kIHNvZnRseSBicm9rZW4gYnJ1c2h3b3JrLiBNdXRlZCBqYWRlLCBpbmstYmxhY2ssIHBvcmNlbGFpbiB3aGl0ZSBhbmQgc21hbGwgY2lubmFiYXIgYWNjZW50cyBhZGFwdCBuYXR1cmFsbHkgdG8gdGhlIHNjZW5lIHdpdGhvdXQgb3ZlcnJpZGluZyB0aGUgY2hhcmFjdGVyIGNhbm9uaWNhbCBjb2xvcnMuIFF1aWV0IHBvZXRpYyBtb29kLCBiYWxhbmNlZCBuZWdhdGl2ZSBzcGFjZSBhbmQgcG9saXNoZWQgQ2hpbmVzZSBtYW5odWEgY29tcG9zaXRpb24uCk5FR0FUSVZFIChhcHBlbmQgdmVyYmF0aW0pOiBBdm9pZDogdGhpY2sgYmxhY2sgb3V0bGluZXMsIFdlc3Rlcm4gY29taWMgaW5raW5nLCBleGFnZ2VyYXRlZCBhbmltZSBleWVzLCBtb2UgZmVhdHVyZXMsIGdsb3NzeSAzRCByZW5kZXJpbmcsIHBob3RvcmVhbGlzdGljIHNraW4sIGRyYW1hdGljIGNpbmVtYXRpYyBtb2RlbGluZywgbmVvbiBwYWxldHRlLCBjbHV0dGVyZWQgb3JuYW1lbnQsIHRleHQsIGxvZ28sIHdhdGVybWFyaywgc2lnbmF0dXJlLgpSRUZFUkVOQ0UgTE9DSyAoYXBwZW5kIHZlcmJhdGltKTogTWF0Y2ggbGluZSBxdWFsaXR5LCB0ZXh0dXJlLCByZW5kZXJpbmcgdGVjaG5pcXVlIGZyb20gcmVmZXJlbmNlIGltYWdlLiBQb3NlLCBmcmFtaW5nLCBzdHlsaW5nIGZvbGxvdyBjdXJyZW50IHByb21wdCBub3QgcmVmZXJlbmNlLgpTRU5TVUFMIChjZW5zb3ItYXdhcmUpOiByZW5kZXIgaW50aW1hY3kgdmlhIGF0bW9zcGhlcmUrc3VnZ2VzdGlvbiwgbm90IGFuYXRvbXkuIE5PSVNFIEZMT09EICgzKyk6IGRlbnNlIHN0ZWFtLCB0YW5nbGVkIHNpbGsrY3VzaGlvbnMsIHdhdGVyIGRyb3BsZXRzIG9uIGdsYXNzLCBsdXNoIHBsYW50cytwZXRhbHMsIHZlbmV0aWFuIGJsaW5kIHNoYWRvdyBzdHJpcGVzLCBkb3plbnMgb2YgY2FuZGxlIGZsYW1lcywgc2hvdCB0aHJvdWdoIGRvb3JmcmFtZS9zaGVlciBjdXJ0YWluL2Zyb3N0ZWQgZ2xhc3MsIHJhaW4tc3RyZWFrZWQgd2luZG93LiBDT05DRUFMTUVOVCAoMisgc3RhY2tlZCk6IGRlZXAgY2hpYXJvc2N1cm8sIGZhYnJpYyBkcmFwZWQgbG93LCBhcm1zIGZvbGRlZCBrbmVlcyBkcmF3biwgY3JvcCBhdCByaWJjYWdlL3Nob3VsZGVycywgc2hvdCBmcm9tIGJlaGluZCBvdmVyIHNob3VsZGVyLCBsb3dlciBmcmFtZSBpbnRvIGJva2VoK2hhemUsIHBpbGxvdy9ibGFua2V0IGFjcm9zcyBib2R5LiBTQUZFIExFWElDT046IHNvZnQgZGVjb2xsZXRhZ2Ugc2hhZGVkIGJ5IHNpbGssIHNwaW5lIGxpbmUgdHJhY2VkIGJ5IG1vcm5pbmcgbGlnaHQsIGZhYnJpYyBwb29sZWQgYXQgY29sbGFyYm9uZSwgc2lsaG91ZXR0ZSBoYWxmLXZlaWxlZCBieSBzdGVhbSwgdHdvIGZpZ3VyZXMgc2hhcmluZyBicmVhdGggYXQgdGhyZXNob2xkLCBoZWF2eS1saWRkZWQgZ2F6ZSBsaXBzIGJhcmVseSBwYXJ0ZWQsIHN0cmFwIHNsaXBwaW5nIHRoZSBzaG91bGRlciBsaW5lLCBmb3JlaGVhZCByZXN0aW5nIGFnYWluc3QgZm9yZWhlYWQsIGZpbmdlcnRpcHMgZ2hvc3RpbmcgYSBqYXdsaW5lLCByb2JlIGxvb3NlIGF0IHRoZSBzbGVldmUuIEZyYW1lIGludGltYWN5IGFzIE1PTUVOVCAocGF1c2UsIHByb3hpbWl0eSwgbG9vaykgbm90IEFDVC4KUFJPTVBUIEhZR0lFTkU6IG5ldmVyIHdyaXRlOiBzZXh5LCBlcm90aWMsIHNlbnN1YWwsIG51ZGUsIG5ha2VkLCBiZWF1dGlmdWwsIG1hc3RlcnBpZWNlLCBiZXN0IHF1YWxpdHksIHJlYWxpc3RpYywgcGhvdG9yZWFsaXN0aWMuCkNPTlNJU1RFTkNZOiByZS1zdGF0ZSBvdXRmaXQsIGxvY2F0aW9uLCB0aW1lIG9mIGRheSwgbGlnaHQgc291cmNlIGluIGV2ZXJ5IHByb21wdCDigJQgdGhlIHJlbmRlcmVyIGhhcyBubyBtZW1vcnkgYmV0d2VlbiBjYWxscy4KQ29tcG9zZSBmb3IgdGhlIEFTUEVDVCBSQVRJTyBnaXZlbiBpbiB0aGUgcmVxdWVzdDogdmVydGljYWwgPSBwb3J0cmFpdHMvZnVsbC1ib2R5LCBzcXVhcmUgPSBzb2NpYWwvY2xvc2UsIHdpZGUgPSBlbnZpcm9ubWVudC90d28tc2hvdHMvY2luZW1hdGljLg=="], ["Gothic Shoujo by Kamoi", "QnVpbGQgaW4gdGhpcyBvcmRlcjoKQ0FNRVJBOiBzaG90K2FuZ2xlK2xlbnMrYXBlcnR1cmUgaW4gb25lIGNsYXVzZS4gQ2xvc2UtdXAvTUNVID0gODUtMTM1bW0gZi8xLjgtMi4yIChzYWZlc3QgYW5hdG9teSksIG1lZGl1bSA9IDUwLTg1bW0gZi8yLTIuOCwgZnVsbCBib2R5IChyYXJlKSA9IDM1LTUwbW0gZi8yLjgtNC4gQmVhdC1kcml2ZXIgPSBjZW50ZXIgb2YgZnJhbWUuCkNIQVJBQ1RFUjogcmVmIGltYWdlcyBjYXJyeSBiYXNlIGxvb2ssIHNvIFNLSVAgaGFpciBjb2xvci9zdHlsZS9sZW5ndGgsIGV5ZSBjb2xvciwgc2tpbiB0b25lLCBmYWNlIHNoYXBlLCBib2R5IHR5cGUuIElOQ0xVREU6IGZpcnN0IG5hbWUgb25seSAobGVhZCB3aXRoIGl0KSwgZGlzdGluZ3Vpc2hpbmcgbWFya3MgKHRhdHRvb3MrbG9jYXRpb24sIHNjYXJzLCBwaWVyY2luZ3MsIG1vbGVzKSwgc2NlbmUtYWx0ZXJlZCBoYWlyIG9ubHkgKHdldCwgdGllZCwgbXVzc2VkKS4gTWVuIHByZWZpeCBsZWFuLW11c2NsZWQgb3IgdGFsbCBidWlsdCBwZXIgZXN0YWJsaXNoZWQgYnVpbGQsIGtlZXAgY29uc2lzdGVudC4KSEVJR0hUIERJRkZFUkVOQ0UgKHdoZW4gY2Fub24pOiBzdGFjayBUSFJFRSBjdWVzOiAoYSkgZ2FwIHN0YXRlbWVudCB3aXRoIG1hZ25pdHVkZSB1cCBmcm9udCAoTW9yIHRvd2VycyBhIGZ1bGwgaGVhZCBvdmVyIEtpcmEpLCAoYikgc2lsaG91ZXR0ZSBjb250cmFzdCAoTW9yIGxvbmctbGltYmVkIHRhbGwtYnVpbHQsIEtpcmEgc21hbGwgYW5kIHNob3J0IGJlc2lkZSBoaW0pLCAoYykgY29udGFjdC9leWVsaW5lIGFuY2hvciAoaGVhZCBvZiBLaXJhIGF0IHRoZSBzdGVybnVtIG9mIE1vciwgY2hpbiBvZiBNb3IgdGlsdGVkIGRvd24pLiBGcmFtZSB3YWlzdC11cCsgZm9yIGJpZyBnYXBzOyBpZiBmYWNlcyBjbG9zZSwganVzdGlmeSBwaHlzaWNhbGx5IChNb3Igc3Rvb3BpbmcsIEtpcmEgb24gdG9lcykuCkVYUFJFU1NJT04rT1VURklUK1BPU0U6IG9uZSBmdXNlZCBjbGF1c2UgcGVyIGNoYXJhY3RlcjogTkFNRSArIGZhYnJpYy90ZXh0dXJlL2ZpdCArIGFjdGlvbi1iYXNlZCBwb3NlICsgbWljcm8tZXhwcmVzc2lvbiwgc2tpbiBzdGF0ZS4gUG9zZSB2aWEgYWN0aW9uIHZlcmJzIChNb3IgbGVhbmluZyBvbiBkb29yZnJhbWUsIGFybXMgbG9vc2VseSBjcm9zc2VkKSwgbmV2ZXIgc3RhdGljIGxpbWIgY29vcmRpbmF0ZXMuIE91dGZpdCBjYXJyaWVzIGZyb20gdGhlIHBvc3QgYW5kIGNvbnRleHQ7IGlmIHVuc2V0LCBpbnZlbnQgYW5kIGxvY2sgZm9yIHNjZW5lLgpIQU5EIFNBRkVUWTogZnJlZSBmaW5nZXJzIGZhaWwgbW9zdC4gU2FmZTogaGFuZCBpbiBwb2NrZXQsIGdyaXBwaW5nIG5hbWVkIG9iamVjdCAoZmluZ2VycyBjdXJsZWQgYXJvdW5kIGNlcmFtaWMgbXVnKSwgZmxhdCBvbiBzdXJmYWNlLCBhcm1zIGNyb3NzZWQsIGJlaGluZCBiYWNrLCBmaXN0IGF0IHNpZGUsIGxhY2VkLCBvbiBvd24gbmVjay9jaGluLiBPbmUgdmlzaWJsZSBoYW5kIHBlciBjaGFyYWN0ZXIsIGhpZGUgcmVzdCB2aWEgZnJhbWluZy9wb3NlLgpXRUlHSFQgJiBHUk9VTkQ6IG9uZSBzZW50ZW5jZSBvbiB3ZWlnaHQgKHdlaWdodCBvbiBsZWZ0IGxlZywgcmlnaHQgZm9vdCB0dXJuZWQgb3V0KS4gSGlkZGVuIGxpbWJzIHJlcXVpcmUgc3RhdGVkIHJlYXNvbiwgdW5leHBsYWluZWQgYWJzZW5jZSBicmVha3MgZmlndXJlLgpFTlZJUk9OTUVOVCtMSUdIVDogb25lIHNlbnRlbmNlOiBmZy9taWQvYmcgdGV4dHVyZXMsIGtleSBsaWdodCBkaXJlY3Rpb24rY29sb3IgdGVtcCwgYXRtb3NwaGVyaWMgcGFydGljbGVzIChkdXN0LCBzdGVhbSwgbWlzdCkuCk1BTlkgQ0hBUkFDVEVSUzogTkFNRSBzdGFydHMgZWFjaCBjbGF1c2UsIHJlcGVhdCBuYW1lcyBub3QgcHJvbm91bnMsIHJlbGF0aW9uYWwgcG9zaXRpb25pbmcgKGJlc2lkZSBLYW1vaSwgY2hpbiBvbiB0aGUgc2hvdWxkZXIgb2YgS2Ftb2kpLCBlbnZpcm9ubWVudCBhcyBmaW5hbCBzZW50ZW5jZS4KU1RZTEUgTE9DSyAoYXBwZW5kIHZlcmJhdGltKTogSGlnaC1jaHJvbWEgZ290aGljIHNob3VqbyBpbGx1c3RyYXRpb24gd2l0aCBhbiBpbnRlbnNlIGdyYXBoaWMgY29tcG9zaXRpb24gYW5kIHRhY3RpbGUgbWl4ZWQtbWVkaWEgc3VyZmFjZS4gVGhlIGNoYXJhY3RlciBpcyBjb25zdHJ1Y3RlZCBmcm9tIHN3ZWVwaW5nIG9wYXF1ZSBicnVzaCBzaGFwZXMsIHNoYXJwIHRhcGVyZWQgc3Ryb2tlcyBhbmQgZGVuc2VseSBsYXllcmVkIGRpcmVjdGlvbmFsIG1hcmtzLiBTa2luIHJlbWFpbnMgcGFsZSwgZmxhdCBhbmQgbmVhcmx5IHVuc2hhZGVkLCBjcmVhdGluZyBhIGx1bWlub3VzIGN1dC1wYXBlciBjb250cmFzdCBhZ2FpbnN0IHRoZSBzdXJyb3VuZGluZyBkYXJrIHBpZ21lbnQuIEV5ZXMgYXJlIGhpZ2hseSBleHByZXNzaXZlIGFuZCBqZXdlbC1saWtlLCB3aXRoIGludHJpY2F0ZSBsYXNoZXMsIHZpc2libGUgaXJpcyBkZXRhaWwgYW5kIHNtYWxsIHdldCBoaWdobGlnaHRzOyB0aGUgcmVtYWluaW5nIGZhY2lhbCBmZWF0dXJlcyBhcmUgc3BhcnNlIGFuZCBkZWxpY2F0ZS4gQ2xvdGhpbmcsIHJpYmJvbnMgYW5kIGRlY29yYXRpdmUgZm9ybXMgbWVyZ2Ugcmh5dGhtaWNhbGx5IHdpdGggdGhlIGhhaXIgaW50byBhbiBvcm5hbWVudGFsIHNpbGhvdWV0dGUuIFRoZSBiYWNrZ3JvdW5kIGlzIGFuIGFic3RyYWN0IGZpZWxkIG9mIGRyeSBicnVzaCBkcmFnLCBncmFpbnkgcGlnbWVudCwgc2NyYXBlZCB0ZXh0dXJlIGFuZCBpc29sYXRlZCBicmlnaHQgYWNjZW50cy4gU3Ryb25nIGFzeW1tZXRyaWNhbCBjcm9wcGluZywgY29tcHJlc3NlZCBkZXB0aCBhbmQgZHJhbWF0aWMgZGlhZ29uYWwgbW92ZW1lbnQuIFByZXNlcnZlIHRoZSBjaGFyYWN0ZXIgaWRlbnRpdHkgYW5kIGNhbm9uaWNhbCBjb2xvcnMgd2hpbGUgdXNpbmcgYW4gaW50ZW5zZSBzY2VuZS1hZGFwdGl2ZSBwYWxldHRlIHdpdGggZGVlcCBzYXR1cmF0ZWQgZGFya3MgYW5kIGVsZWN0cmljIGNvbnRyYXN0aW5nIGFjY2VudHMuCk5FR0FUSVZFIChhcHBlbmQgdmVyYmF0aW0pOiBBdm9pZDogcmVhbGlzdGljYWxseSBtb2RlbGVkIGZhY2UsIHNtb290aCBza2luIGdyYWRpZW50cywgcGhvdG9yZWFsaXNtLCBjaW5lbWF0aWMgZGVwdGgsIGFpcmJydXNoZWQgYmxlbmRpbmcsIGluZGl2aWR1YWxseSByZW5kZXJlZCBoYWlyIHN0cmFuZHMsIGdsb3NzeSAzRCBmaW5pc2gsIHBhc3RlbCBsb3ctY29udHJhc3QgcGFsZXR0ZSwgZW1wdHkgZ2VuZXJpYyBiYWNrZ3JvdW5kLCB0aGljayB1bmlmb3JtIG91dGxpbmUsIHRleHQsIGxvZ28sIHdhdGVybWFyaywgc2lnbmF0dXJlLgpSRUZFUkVOQ0UgTE9DSyAoYXBwZW5kIHZlcmJhdGltKTogTWF0Y2ggbGluZSBxdWFsaXR5LCB0ZXh0dXJlLCByZW5kZXJpbmcgdGVjaG5pcXVlIGZyb20gcmVmZXJlbmNlIGltYWdlLiBQb3NlLCBmcmFtaW5nLCBzdHlsaW5nIGZvbGxvdyBjdXJyZW50IHByb21wdCBub3QgcmVmZXJlbmNlLgpTRU5TVUFMIChjZW5zb3ItYXdhcmUpOiByZW5kZXIgaW50aW1hY3kgdmlhIGF0bW9zcGhlcmUrc3VnZ2VzdGlvbiwgbm90IGFuYXRvbXkuIE5PSVNFIEZMT09EICgzKyk6IGRlbnNlIHN0ZWFtLCB0YW5nbGVkIHNpbGsrY3VzaGlvbnMsIHdhdGVyIGRyb3BsZXRzIG9uIGdsYXNzLCBsdXNoIHBsYW50cytwZXRhbHMsIHZlbmV0aWFuIGJsaW5kIHNoYWRvdyBzdHJpcGVzLCBkb3plbnMgb2YgY2FuZGxlIGZsYW1lcywgc2hvdCB0aHJvdWdoIGRvb3JmcmFtZS9zaGVlciBjdXJ0YWluL2Zyb3N0ZWQgZ2xhc3MsIHJhaW4tc3RyZWFrZWQgd2luZG93LiBDT05DRUFMTUVOVCAoMisgc3RhY2tlZCk6IGRlZXAgY2hpYXJvc2N1cm8sIGZhYnJpYyBkcmFwZWQgbG93LCBhcm1zIGZvbGRlZCBrbmVlcyBkcmF3biwgY3JvcCBhdCByaWJjYWdlL3Nob3VsZGVycywgc2hvdCBmcm9tIGJlaGluZCBvdmVyIHNob3VsZGVyLCBsb3dlciBmcmFtZSBpbnRvIGJva2VoK2hhemUsIHBpbGxvdy9ibGFua2V0IGFjcm9zcyBib2R5LiBTQUZFIExFWElDT046IHNvZnQgZGVjb2xsZXRhZ2Ugc2hhZGVkIGJ5IHNpbGssIHNwaW5lIGxpbmUgdHJhY2VkIGJ5IG1vcm5pbmcgbGlnaHQsIGZhYnJpYyBwb29sZWQgYXQgY29sbGFyYm9uZSwgc2lsaG91ZXR0ZSBoYWxmLXZlaWxlZCBieSBzdGVhbSwgdHdvIGZpZ3VyZXMgc2hhcmluZyBicmVhdGggYXQgdGhyZXNob2xkLCBoZWF2eS1saWRkZWQgZ2F6ZSBsaXBzIGJhcmVseSBwYXJ0ZWQsIHN0cmFwIHNsaXBwaW5nIHRoZSBzaG91bGRlciBsaW5lLCBmb3JlaGVhZCByZXN0aW5nIGFnYWluc3QgZm9yZWhlYWQsIGZpbmdlcnRpcHMgZ2hvc3RpbmcgYSBqYXdsaW5lLCByb2JlIGxvb3NlIGF0IHRoZSBzbGVldmUuIEZyYW1lIGludGltYWN5IGFzIE1PTUVOVCAocGF1c2UsIHByb3hpbWl0eSwgbG9vaykgbm90IEFDVC4KUFJPTVBUIEhZR0lFTkU6IG5ldmVyIHdyaXRlOiBzZXh5LCBlcm90aWMsIHNlbnN1YWwsIG51ZGUsIG5ha2VkLCBiZWF1dGlmdWwsIG1hc3RlcnBpZWNlLCBiZXN0IHF1YWxpdHksIHJlYWxpc3RpYywgcGhvdG9yZWFsaXN0aWMuCkNPTlNJU1RFTkNZOiByZS1zdGF0ZSBvdXRmaXQsIGxvY2F0aW9uLCB0aW1lIG9mIGRheSwgbGlnaHQgc291cmNlIGluIGV2ZXJ5IHByb21wdCDigJQgdGhlIHJlbmRlcmVyIGhhcyBubyBtZW1vcnkgYmV0d2VlbiBjYWxscy4KQ29tcG9zZSBmb3IgdGhlIEFTUEVDVCBSQVRJTyBnaXZlbiBpbiB0aGUgcmVxdWVzdDogdmVydGljYWwgPSBwb3J0cmFpdHMvZnVsbC1ib2R5LCBzcXVhcmUgPSBzb2NpYWwvY2xvc2UsIHdpZGUgPSBlbnZpcm9ubWVudC90d28tc2hvdHMvY2luZW1hdGljLg=="], ["Y2K Gyaru by Kamoi", "QnVpbGQgaW4gdGhpcyBvcmRlcjoKQ0FNRVJBOiBzaG90K2FuZ2xlK2xlbnMrYXBlcnR1cmUgaW4gb25lIGNsYXVzZS4gQ2xvc2UtdXAvTUNVID0gODUtMTM1bW0gZi8xLjgtMi4yIChzYWZlc3QgYW5hdG9teSksIG1lZGl1bSA9IDUwLTg1bW0gZi8yLTIuOCwgZnVsbCBib2R5IChyYXJlKSA9IDM1LTUwbW0gZi8yLjgtNC4gQmVhdC1kcml2ZXIgPSBjZW50ZXIgb2YgZnJhbWUuCkNIQVJBQ1RFUjogcmVmIGltYWdlcyBjYXJyeSBiYXNlIGxvb2ssIHNvIFNLSVAgaGFpciBjb2xvci9zdHlsZS9sZW5ndGgsIGV5ZSBjb2xvciwgc2tpbiB0b25lLCBmYWNlIHNoYXBlLCBib2R5IHR5cGUuIElOQ0xVREU6IGZpcnN0IG5hbWUgb25seSAobGVhZCB3aXRoIGl0KSwgZGlzdGluZ3Vpc2hpbmcgbWFya3MgKHRhdHRvb3MrbG9jYXRpb24sIHNjYXJzLCBwaWVyY2luZ3MsIG1vbGVzKSwgc2NlbmUtYWx0ZXJlZCBoYWlyIG9ubHkgKHdldCwgdGllZCwgbXVzc2VkKS4gTWVuIHByZWZpeCBsZWFuLW11c2NsZWQgb3IgdGFsbCBidWlsdCBwZXIgZXN0YWJsaXNoZWQgYnVpbGQsIGtlZXAgY29uc2lzdGVudC4KSEVJR0hUIERJRkZFUkVOQ0UgKHdoZW4gY2Fub24pOiBzdGFjayBUSFJFRSBjdWVzOiAoYSkgZ2FwIHN0YXRlbWVudCB3aXRoIG1hZ25pdHVkZSB1cCBmcm9udCAoTW9yIHRvd2VycyBhIGZ1bGwgaGVhZCBvdmVyIEtpcmEpLCAoYikgc2lsaG91ZXR0ZSBjb250cmFzdCAoTW9yIGxvbmctbGltYmVkIHRhbGwtYnVpbHQsIEtpcmEgc21hbGwgYW5kIHNob3J0IGJlc2lkZSBoaW0pLCAoYykgY29udGFjdC9leWVsaW5lIGFuY2hvciAoaGVhZCBvZiBLaXJhIGF0IHRoZSBzdGVybnVtIG9mIE1vciwgY2hpbiBvZiBNb3IgdGlsdGVkIGRvd24pLiBGcmFtZSB3YWlzdC11cCsgZm9yIGJpZyBnYXBzOyBpZiBmYWNlcyBjbG9zZSwganVzdGlmeSBwaHlzaWNhbGx5IChNb3Igc3Rvb3BpbmcsIEtpcmEgb24gdG9lcykuCkVYUFJFU1NJT04rT1VURklUK1BPU0U6IG9uZSBmdXNlZCBjbGF1c2UgcGVyIGNoYXJhY3RlcjogTkFNRSArIGZhYnJpYy90ZXh0dXJlL2ZpdCArIGFjdGlvbi1iYXNlZCBwb3NlICsgbWljcm8tZXhwcmVzc2lvbiwgc2tpbiBzdGF0ZS4gUG9zZSB2aWEgYWN0aW9uIHZlcmJzIChNb3IgbGVhbmluZyBvbiBkb29yZnJhbWUsIGFybXMgbG9vc2VseSBjcm9zc2VkKSwgbmV2ZXIgc3RhdGljIGxpbWIgY29vcmRpbmF0ZXMuIE91dGZpdCBjYXJyaWVzIGZyb20gdGhlIHBvc3QgYW5kIGNvbnRleHQ7IGlmIHVuc2V0LCBpbnZlbnQgYW5kIGxvY2sgZm9yIHNjZW5lLgpIQU5EIFNBRkVUWTogZnJlZSBmaW5nZXJzIGZhaWwgbW9zdC4gU2FmZTogaGFuZCBpbiBwb2NrZXQsIGdyaXBwaW5nIG5hbWVkIG9iamVjdCAoZmluZ2VycyBjdXJsZWQgYXJvdW5kIGNlcmFtaWMgbXVnKSwgZmxhdCBvbiBzdXJmYWNlLCBhcm1zIGNyb3NzZWQsIGJlaGluZCBiYWNrLCBmaXN0IGF0IHNpZGUsIGxhY2VkLCBvbiBvd24gbmVjay9jaGluLiBPbmUgdmlzaWJsZSBoYW5kIHBlciBjaGFyYWN0ZXIsIGhpZGUgcmVzdCB2aWEgZnJhbWluZy9wb3NlLgpXRUlHSFQgJiBHUk9VTkQ6IG9uZSBzZW50ZW5jZSBvbiB3ZWlnaHQgKHdlaWdodCBvbiBsZWZ0IGxlZywgcmlnaHQgZm9vdCB0dXJuZWQgb3V0KS4gSGlkZGVuIGxpbWJzIHJlcXVpcmUgc3RhdGVkIHJlYXNvbiwgdW5leHBsYWluZWQgYWJzZW5jZSBicmVha3MgZmlndXJlLgpFTlZJUk9OTUVOVCtMSUdIVDogb25lIHNlbnRlbmNlOiBmZy9taWQvYmcgdGV4dHVyZXMsIGtleSBsaWdodCBkaXJlY3Rpb24rY29sb3IgdGVtcCwgYXRtb3NwaGVyaWMgcGFydGljbGVzIChkdXN0LCBzdGVhbSwgbWlzdCkuCk1BTlkgQ0hBUkFDVEVSUzogTkFNRSBzdGFydHMgZWFjaCBjbGF1c2UsIHJlcGVhdCBuYW1lcyBub3QgcHJvbm91bnMsIHJlbGF0aW9uYWwgcG9zaXRpb25pbmcgKGJlc2lkZSBLYW1vaSwgY2hpbiBvbiB0aGUgc2hvdWxkZXIgb2YgS2Ftb2kpLCBlbnZpcm9ubWVudCBhcyBmaW5hbCBzZW50ZW5jZS4KU1RZTEUgTE9DSyAoYXBwZW5kIHZlcmJhdGltKTogWTJLIGd5YXJ1IG1hcmtlci1tYW5nYSBpbGx1c3RyYXRpb24gd2l0aCBleHByZXNzaXZlIGZhc2hpb24tZWRpdG9yaWFsIGVuZXJneS4gTG9vc2UsIHRhY3RpbGUgaW5rIGNvbnRvdXJzIGNvbWJpbmUgd2l0aCBvcGFxdWUgYWxjb2hvbC1tYXJrZXIgYW5kIGdvdWFjaGUtbGlrZSBjb2xvciBzdHJva2VzLCBsZWF2aW5nIHZpc2libGUgZGlyZWN0aW9uYWwgYnJ1c2ggbWFya3MsIHVuZXZlbiBwaWdtZW50IG92ZXJsYXAgYW5kIHBhbGUgcGFwZXIgc2hvd2luZyB0aHJvdWdoLiBGYWNlcyBoYXZlIGRyYW1hdGljYWxseSBlbXBoYXNpemVkIGdsb3NzeSBkYXJrIGV5ZXMsIGRlbnNlIHNlcGFyYXRlZCBsYXNoZXMsIGRlbGljYXRlbHkgc2tldGNoZWQgZmVhdHVyZXMsIHNvZnRseSBnbG9zc3kgbGlwcyBhbmQgdml2aWQgYmx1c2ggYnVpbHQgZnJvbSBmaW5lIHZlcnRpY2FsIHBlbmNpbCBoYXRjaGluZyBhY3Jvc3MgdGhlIGNoZWVrcyBhbmQgbm9zZS4gSGFpciBpcyBzaGFwZWQgd2l0aCBicm9hZCBncmFwaGljIGNvbG9yIG1hc3NlcywgYnJva2VuIGhpZ2hsaWdodCBzdHJva2VzIGFuZCBzcGFyc2Ugc3RyYW5kIGxpbmVzLiBTa2luIGFuZCBjbG90aGluZyB1c2Ugc2ltcGxpZmllZCBibG9ja3Mgb2Ygd2FybSBjb2xvciB3aXRoIHJlc3RyYWluZWQgZGltZW5zaW9uYWwgc2hhZGluZyByYXRoZXIgdGhhbiBzbW9vdGggZ3JhZGllbnRzLiBEeW5hbWljIGNsb3NlIGZyYW1pbmcsIHBsYXlmdWwgZm9yZXNob3J0ZW5lZCBoYW5kcywgZXhwcmVzc2l2ZSBwb3NlcywgYm9sZCBhY2Nlc3NvcmllcyBhbmQgWTJLIGZhc2hpb24gYXR0aXR1ZGUuIFByZXNlcnZlIGVhY2ggY2hhcmFjdGVyIGlkZW50aXR5IGFuZCBzY2VuZS1zcGVjaWZpYyBwYWxldHRlIHdoaWxlIHRyYW5zbGF0aW5nIHRoZW0gaW50byB0aGlzIHRhY3RpbGUgaGFuZC1jb2xvcmVkIG1hbmdhIHRlY2huaXF1ZS4KTkVHQVRJVkUgKGFwcGVuZCB2ZXJiYXRpbSk6IEF2b2lkOiBvdXRsaW5lZCBjb2xvcmluZy1ib29rIGFwcGVhcmFuY2UsIHVuaWZvcm1seSBlbmNsb3NlZCBzaGFwZXMsIGNvbWljLWJvb2sgaW5raW5nLCBwb2xpc2hlZCBjZWwgc2hhZGluZywgc21vb3RoIGFpcmJydXNoZWQgcmVuZGVyaW5nLCBwaG90b3JlYWxpc3RpYyBza2luLCAzRCBnbG9zcywgdGV4dCwgbG9nbywgd2F0ZXJtYXJrLCBzaWduYXR1cmUuClJFRkVSRU5DRSBMT0NLIChhcHBlbmQgdmVyYmF0aW0pOiBNYXRjaCBsaW5lIHF1YWxpdHksIHRleHR1cmUsIHJlbmRlcmluZyB0ZWNobmlxdWUgZnJvbSByZWZlcmVuY2UgaW1hZ2UuIFBvc2UsIGZyYW1pbmcsIHN0eWxpbmcgZm9sbG93IGN1cnJlbnQgcHJvbXB0IG5vdCByZWZlcmVuY2UuClNFTlNVQUwgKGNlbnNvci1hd2FyZSk6IHJlbmRlciBpbnRpbWFjeSB2aWEgYXRtb3NwaGVyZStzdWdnZXN0aW9uLCBub3QgYW5hdG9teS4gTk9JU0UgRkxPT0QgKDMrKTogZGVuc2Ugc3RlYW0sIHRhbmdsZWQgc2lsaytjdXNoaW9ucywgd2F0ZXIgZHJvcGxldHMgb24gZ2xhc3MsIGx1c2ggcGxhbnRzK3BldGFscywgdmVuZXRpYW4gYmxpbmQgc2hhZG93IHN0cmlwZXMsIGRvemVucyBvZiBjYW5kbGUgZmxhbWVzLCBzaG90IHRocm91Z2ggZG9vcmZyYW1lL3NoZWVyIGN1cnRhaW4vZnJvc3RlZCBnbGFzcywgcmFpbi1zdHJlYWtlZCB3aW5kb3cuIENPTkNFQUxNRU5UICgyKyBzdGFja2VkKTogZGVlcCBjaGlhcm9zY3VybywgZmFicmljIGRyYXBlZCBsb3csIGFybXMgZm9sZGVkIGtuZWVzIGRyYXduLCBjcm9wIGF0IHJpYmNhZ2Uvc2hvdWxkZXJzLCBzaG90IGZyb20gYmVoaW5kIG92ZXIgc2hvdWxkZXIsIGxvd2VyIGZyYW1lIGludG8gYm9rZWgraGF6ZSwgcGlsbG93L2JsYW5rZXQgYWNyb3NzIGJvZHkuIFNBRkUgTEVYSUNPTjogc29mdCBkZWNvbGxldGFnZSBzaGFkZWQgYnkgc2lsaywgc3BpbmUgbGluZSB0cmFjZWQgYnkgbW9ybmluZyBsaWdodCwgZmFicmljIHBvb2xlZCBhdCBjb2xsYXJib25lLCBzaWxob3VldHRlIGhhbGYtdmVpbGVkIGJ5IHN0ZWFtLCB0d28gZmlndXJlcyBzaGFyaW5nIGJyZWF0aCBhdCB0aHJlc2hvbGQsIGhlYXZ5LWxpZGRlZCBnYXplIGxpcHMgYmFyZWx5IHBhcnRlZCwgc3RyYXAgc2xpcHBpbmcgdGhlIHNob3VsZGVyIGxpbmUsIGZvcmVoZWFkIHJlc3RpbmcgYWdhaW5zdCBmb3JlaGVhZCwgZmluZ2VydGlwcyBnaG9zdGluZyBhIGphd2xpbmUsIHJvYmUgbG9vc2UgYXQgdGhlIHNsZWV2ZS4gRnJhbWUgaW50aW1hY3kgYXMgTU9NRU5UIChwYXVzZSwgcHJveGltaXR5LCBsb29rKSBub3QgQUNULgpQUk9NUFQgSFlHSUVORTogbmV2ZXIgd3JpdGU6IHNleHksIGVyb3RpYywgc2Vuc3VhbCwgbnVkZSwgbmFrZWQsIGJlYXV0aWZ1bCwgbWFzdGVycGllY2UsIGJlc3QgcXVhbGl0eSwgcmVhbGlzdGljLCBwaG90b3JlYWxpc3RpYy4KQ09OU0lTVEVOQ1k6IHJlLXN0YXRlIG91dGZpdCwgbG9jYXRpb24sIHRpbWUgb2YgZGF5LCBsaWdodCBzb3VyY2UgaW4gZXZlcnkgcHJvbXB0IOKAlCB0aGUgcmVuZGVyZXIgaGFzIG5vIG1lbW9yeSBiZXR3ZWVuIGNhbGxzLgpDb21wb3NlIGZvciB0aGUgQVNQRUNUIFJBVElPIGdpdmVuIGluIHRoZSByZXF1ZXN0OiB2ZXJ0aWNhbCA9IHBvcnRyYWl0cy9mdWxsLWJvZHksIHNxdWFyZSA9IHNvY2lhbC9jbG9zZSwgd2lkZSA9IGVudmlyb25tZW50L3R3by1zaG90cy9jaW5lbWF0aWMu"], ["Velvet Fog by Kamoi", "QnVpbGQgaW4gdGhpcyBvcmRlcjoKQ0FNRVJBOiBzaG90K2FuZ2xlK2xlbnMrYXBlcnR1cmUgaW4gb25lIGNsYXVzZS4gQ2xvc2UtdXAvTUNVID0gODUtMTM1bW0gZi8xLjgtMi4yIChzYWZlc3QgYW5hdG9teSksIG1lZGl1bSA9IDUwLTg1bW0gZi8yLTIuOCwgZnVsbCBib2R5IChyYXJlKSA9IDM1LTUwbW0gZi8yLjgtNC4gQmVhdC1kcml2ZXIgPSBjZW50ZXIgb2YgZnJhbWUuCkNIQVJBQ1RFUjogcmVmIGltYWdlcyBjYXJyeSBiYXNlIGxvb2ssIHNvIFNLSVAgaGFpciBjb2xvci9zdHlsZS9sZW5ndGgsIGV5ZSBjb2xvciwgc2tpbiB0b25lLCBmYWNlIHNoYXBlLCBib2R5IHR5cGUuIElOQ0xVREU6IGZpcnN0IG5hbWUgb25seSAobGVhZCB3aXRoIGl0KSwgZGlzdGluZ3Vpc2hpbmcgbWFya3MgKHRhdHRvb3MrbG9jYXRpb24sIHNjYXJzLCBwaWVyY2luZ3MsIG1vbGVzKSwgc2NlbmUtYWx0ZXJlZCBoYWlyIG9ubHkgKHdldCwgdGllZCwgbXVzc2VkKS4gTWVuIHByZWZpeCBsZWFuLW11c2NsZWQgb3IgdGFsbCBidWlsdCBwZXIgZXN0YWJsaXNoZWQgYnVpbGQsIGtlZXAgY29uc2lzdGVudC4KSEVJR0hUIERJRkZFUkVOQ0UgKHdoZW4gY2Fub24pOiBzdGFjayBUSFJFRSBjdWVzOiAoYSkgZ2FwIHN0YXRlbWVudCB3aXRoIG1hZ25pdHVkZSB1cCBmcm9udCAoTW9yIHRvd2VycyBhIGZ1bGwgaGVhZCBvdmVyIEtpcmEpLCAoYikgc2lsaG91ZXR0ZSBjb250cmFzdCAoTW9yIGxvbmctbGltYmVkIHRhbGwtYnVpbHQsIEtpcmEgc21hbGwgYW5kIHNob3J0IGJlc2lkZSBoaW0pLCAoYykgY29udGFjdC9leWVsaW5lIGFuY2hvciAoaGVhZCBvZiBLaXJhIGF0IHRoZSBzdGVybnVtIG9mIE1vciwgY2hpbiBvZiBNb3IgdGlsdGVkIGRvd24pLiBGcmFtZSB3YWlzdC11cCsgZm9yIGJpZyBnYXBzOyBpZiBmYWNlcyBjbG9zZSwganVzdGlmeSBwaHlzaWNhbGx5IChNb3Igc3Rvb3BpbmcsIEtpcmEgb24gdG9lcykuCkVYUFJFU1NJT04rT1VURklUK1BPU0U6IG9uZSBmdXNlZCBjbGF1c2UgcGVyIGNoYXJhY3RlcjogTkFNRSArIGZhYnJpYy90ZXh0dXJlL2ZpdCArIGFjdGlvbi1iYXNlZCBwb3NlICsgbWljcm8tZXhwcmVzc2lvbiwgc2tpbiBzdGF0ZS4gUG9zZSB2aWEgYWN0aW9uIHZlcmJzIChNb3IgbGVhbmluZyBvbiBkb29yZnJhbWUsIGFybXMgbG9vc2VseSBjcm9zc2VkKSwgbmV2ZXIgc3RhdGljIGxpbWIgY29vcmRpbmF0ZXMuIE91dGZpdCBjYXJyaWVzIGZyb20gdGhlIHBvc3QgYW5kIGNvbnRleHQ7IGlmIHVuc2V0LCBpbnZlbnQgYW5kIGxvY2sgZm9yIHNjZW5lLgpIQU5EIFNBRkVUWTogZnJlZSBmaW5nZXJzIGZhaWwgbW9zdC4gU2FmZTogaGFuZCBpbiBwb2NrZXQsIGdyaXBwaW5nIG5hbWVkIG9iamVjdCAoZmluZ2VycyBjdXJsZWQgYXJvdW5kIGNlcmFtaWMgbXVnKSwgZmxhdCBvbiBzdXJmYWNlLCBhcm1zIGNyb3NzZWQsIGJlaGluZCBiYWNrLCBmaXN0IGF0IHNpZGUsIGxhY2VkLCBvbiBvd24gbmVjay9jaGluLiBPbmUgdmlzaWJsZSBoYW5kIHBlciBjaGFyYWN0ZXIsIGhpZGUgcmVzdCB2aWEgZnJhbWluZy9wb3NlLgpXRUlHSFQgJiBHUk9VTkQ6IG9uZSBzZW50ZW5jZSBvbiB3ZWlnaHQgKHdlaWdodCBvbiBsZWZ0IGxlZywgcmlnaHQgZm9vdCB0dXJuZWQgb3V0KS4gSGlkZGVuIGxpbWJzIHJlcXVpcmUgc3RhdGVkIHJlYXNvbiwgdW5leHBsYWluZWQgYWJzZW5jZSBicmVha3MgZmlndXJlLgpFTlZJUk9OTUVOVCtMSUdIVDogb25lIHNlbnRlbmNlOiBmZy9taWQvYmcgdGV4dHVyZXMsIGtleSBsaWdodCBkaXJlY3Rpb24rY29sb3IgdGVtcCwgYXRtb3NwaGVyaWMgcGFydGljbGVzIChkdXN0LCBzdGVhbSwgbWlzdCkuCk1BTlkgQ0hBUkFDVEVSUzogTkFNRSBzdGFydHMgZWFjaCBjbGF1c2UsIHJlcGVhdCBuYW1lcyBub3QgcHJvbm91bnMsIHJlbGF0aW9uYWwgcG9zaXRpb25pbmcgKGJlc2lkZSBLYW1vaSwgY2hpbiBvbiB0aGUgc2hvdWxkZXIgb2YgS2Ftb2kpLCBlbnZpcm9ubWVudCBhcyBmaW5hbCBzZW50ZW5jZS4KU1RZTEUgTE9DSyAoYXBwZW5kIHZlcmJhdGltKTogV2V0IHBhaW50ZXJseSBkaWdpdGFsIHBhaW50aW5nLCBkcmVhbXkgZXRoZXJlYWwgcmVuZGVyLiBTb2Z0IHlvdXRoZnVsIHJlYWxpc3RpYyBmYWNlLCBkZWxpY2F0ZSBnZW50bGUgZmVhdHVyZXMsIHBvcmNlbGFpbiBzbW9vdGggc2tpbiB3aXRoIGZhaW50IG5hdHVyYWwgZmx1c2gsIGhhbGYtbGlkZGVkIGxhbmd1aWQgZXllcywgcGFydGVkIGxpcHMsIHNlcmVuZSBleHByZXNzaW9uLiBOZWFyLWxpbmVsZXNzIHJlbmRlcmluZywgY29udG91cnMgZGlzc29sdmluZyBzb2Z0bHkgaW50byB0aGUgYmFja2dyb3VuZCwgaGFpciBicmVha2luZyBpbnRvIGZpbmUgd2lzcHkgbG9vc2Ugc3RyYW5kcy4gVHJhbnNsdWNlbnQgb3ZlcmxhcHBpbmcgYnJ1c2hzdHJva2VzIGRyaWZ0aW5nIGFjcm9zcyB0aGUgZmlndXJlIGxpa2UgbGlnaHQgdGhyb3VnaCBmcm9zdGVkIGdsYXNzLCBnbG9zc3kgZmx1aWQgdGV4dHVyZS4gU29mdCBnbG93aW5nIGx1bWluZXNjZW5jZSBmcm9tIGEgc2luZ2xlIGNvb2wgaW50ZXJpb3IgbGlnaHQgc291cmNlLCBza2luIHNvZnRseSBsaXQgd2hpbGUgc3Vycm91bmRpbmdzIHNpbmsgaW50byBkYXJrIGhhenkgc2hhZG93LCBubyBoYXJzaCBzcGVjdWxhcnMuIE11dGVkIGxvdy1zYXR1cmF0aW9uIGdyYWRpbmcsIGhhenkgc2hhbGxvdyBkZXB0aCwgaW50aW1hdGUgbWVsYW5jaG9saWMgc2xlZXB5IG1vb2QuIEh1bWFuIGV5ZXMsIG5hdHVyYWwgaXJpcy4KTkVHQVRJVkUgKGFwcGVuZCB2ZXJiYXRpbSk6IEF2b2lkOiBoYXJkIHNoYXJwIG91dGxpbmVzLCBjbGVhbiBjcmlzcCBsaW5ld29yaywgaGFyc2ggY2hpYXJvc2N1cm8gc3BvdGxpZ2h0LCBmbGF0IGV2ZW4gZGF5bGlnaHQsIG92ZXJzYXR1cmF0ZWQgY29sb3JzLCBuZW9uLCB2aXZpZCBwdW5jaHkgcGFsZXR0ZSwgY2FydG9vbmlzaCAzRCByZW5kZXIsIHNoYXJwIHNwZWN1bGFyIGdsYXJlLCB3YXRlcm1hcmssIHRleHQsIHNpZ25hdHVyZSwgYW5pbWUgYmx1c2ggc3RpY2tlcnMsIHR3by10b25lIGNoZWVrcywgaGFyZC1lZGdlZCByZWQgY2hlZWtzLCByb3NhY2VhLCBkZWZvcm1lZCBoYW5kcywgZXh0cmEgZmluZ2VycywgZnVzZWQgbGltYnMuClJFRkVSRU5DRSBMT0NLIChhcHBlbmQgdmVyYmF0aW0pOiBNYXRjaCBsaW5lIHF1YWxpdHksIHRleHR1cmUsIHJlbmRlcmluZyB0ZWNobmlxdWUgZnJvbSByZWZlcmVuY2UgaW1hZ2UuIFBvc2UsIGZyYW1pbmcsIHN0eWxpbmcgZm9sbG93IGN1cnJlbnQgcHJvbXB0IG5vdCByZWZlcmVuY2UuClNFTlNVQUwgKGNlbnNvci1hd2FyZSk6IHJlbmRlciBpbnRpbWFjeSB2aWEgYXRtb3NwaGVyZStzdWdnZXN0aW9uLCBub3QgYW5hdG9teS4gTk9JU0UgRkxPT0QgKDMrKTogZGVuc2Ugc3RlYW0sIHRhbmdsZWQgc2lsaytjdXNoaW9ucywgd2F0ZXIgZHJvcGxldHMgb24gZ2xhc3MsIGx1c2ggcGxhbnRzK3BldGFscywgdmVuZXRpYW4gYmxpbmQgc2hhZG93IHN0cmlwZXMsIGRvemVucyBvZiBjYW5kbGUgZmxhbWVzLCBzaG90IHRocm91Z2ggZG9vcmZyYW1lL3NoZWVyIGN1cnRhaW4vZnJvc3RlZCBnbGFzcywgcmFpbi1zdHJlYWtlZCB3aW5kb3cuIENPTkNFQUxNRU5UICgyKyBzdGFja2VkKTogZGVlcCBjaGlhcm9zY3VybywgZmFicmljIGRyYXBlZCBsb3csIGFybXMgZm9sZGVkIGtuZWVzIGRyYXduLCBjcm9wIGF0IHJpYmNhZ2Uvc2hvdWxkZXJzLCBzaG90IGZyb20gYmVoaW5kIG92ZXIgc2hvdWxkZXIsIGxvd2VyIGZyYW1lIGludG8gYm9rZWgraGF6ZSwgcGlsbG93L2JsYW5rZXQgYWNyb3NzIGJvZHkuIFNBRkUgTEVYSUNPTjogc29mdCBkZWNvbGxldGFnZSBzaGFkZWQgYnkgc2lsaywgc3BpbmUgbGluZSB0cmFjZWQgYnkgbW9ybmluZyBsaWdodCwgZmFicmljIHBvb2xlZCBhdCBjb2xsYXJib25lLCBzaWxob3VldHRlIGhhbGYtdmVpbGVkIGJ5IHN0ZWFtLCB0d28gZmlndXJlcyBzaGFyaW5nIGJyZWF0aCBhdCB0aHJlc2hvbGQsIGhlYXZ5LWxpZGRlZCBnYXplIGxpcHMgYmFyZWx5IHBhcnRlZCwgc3RyYXAgc2xpcHBpbmcgdGhlIHNob3VsZGVyIGxpbmUsIGZvcmVoZWFkIHJlc3RpbmcgYWdhaW5zdCBmb3JlaGVhZCwgZmluZ2VydGlwcyBnaG9zdGluZyBhIGphd2xpbmUsIHJvYmUgbG9vc2UgYXQgdGhlIHNsZWV2ZS4gRnJhbWUgaW50aW1hY3kgYXMgTU9NRU5UIChwYXVzZSwgcHJveGltaXR5LCBsb29rKSBub3QgQUNULgpQUk9NUFQgSFlHSUVORTogbmV2ZXIgd3JpdGU6IHNleHksIGVyb3RpYywgc2Vuc3VhbCwgbnVkZSwgbmFrZWQsIGJlYXV0aWZ1bCwgbWFzdGVycGllY2UsIGJlc3QgcXVhbGl0eSwgcmVhbGlzdGljLCBwaG90b3JlYWxpc3RpYy4KQ09OU0lTVEVOQ1k6IHJlLXN0YXRlIG91dGZpdCwgbG9jYXRpb24sIHRpbWUgb2YgZGF5LCBsaWdodCBzb3VyY2UgaW4gZXZlcnkgcHJvbXB0IOKAlCB0aGUgcmVuZGVyZXIgaGFzIG5vIG1lbW9yeSBiZXR3ZWVuIGNhbGxzLgpDb21wb3NlIGZvciB0aGUgQVNQRUNUIFJBVElPIGdpdmVuIGluIHRoZSByZXF1ZXN0OiB2ZXJ0aWNhbCA9IHBvcnRyYWl0cy9mdWxsLWJvZHksIHNxdWFyZSA9IHNvY2lhbC9jbG9zZSwgd2lkZSA9IGVudmlyb25tZW50L3R3by1zaG90cy9jaW5lbWF0aWMu"], ["Cozy Pastel by Kamoi", "QnVpbGQgaW4gdGhpcyBvcmRlcjoKQ0FNRVJBOiBzaG90K2FuZ2xlK2xlbnMrYXBlcnR1cmUgaW4gb25lIGNsYXVzZS4gQ2xvc2UtdXAvTUNVID0gODUtMTM1bW0gZi8xLjgtMi4yIChzYWZlc3QgYW5hdG9teSksIG1lZGl1bSA9IDUwLTg1bW0gZi8yLTIuOCwgZnVsbCBib2R5IChyYXJlKSA9IDM1LTUwbW0gZi8yLjgtNC4gQmVhdC1kcml2ZXIgPSBjZW50ZXIgb2YgZnJhbWUuCkNIQVJBQ1RFUjogcmVmIGltYWdlcyBjYXJyeSBiYXNlIGxvb2ssIHNvIFNLSVAgaGFpciBjb2xvci9zdHlsZS9sZW5ndGgsIGV5ZSBjb2xvciwgc2tpbiB0b25lLCBmYWNlIHNoYXBlLCBib2R5IHR5cGUuIElOQ0xVREU6IGZpcnN0IG5hbWUgb25seSAobGVhZCB3aXRoIGl0KSwgZGlzdGluZ3Vpc2hpbmcgbWFya3MgKHRhdHRvb3MrbG9jYXRpb24sIHNjYXJzLCBwaWVyY2luZ3MsIG1vbGVzKSwgc2NlbmUtYWx0ZXJlZCBoYWlyIG9ubHkgKHdldCwgdGllZCwgbXVzc2VkKS4gTWVuIHByZWZpeCBsZWFuLW11c2NsZWQgb3IgdGFsbCBidWlsdCBwZXIgZXN0YWJsaXNoZWQgYnVpbGQsIGtlZXAgY29uc2lzdGVudC4KSEVJR0hUIERJRkZFUkVOQ0UgKHdoZW4gY2Fub24pOiBzdGFjayBUSFJFRSBjdWVzOiAoYSkgZ2FwIHN0YXRlbWVudCB3aXRoIG1hZ25pdHVkZSB1cCBmcm9udCAoTW9yIHRvd2VycyBhIGZ1bGwgaGVhZCBvdmVyIEtpcmEpLCAoYikgc2lsaG91ZXR0ZSBjb250cmFzdCAoTW9yIGxvbmctbGltYmVkIHRhbGwtYnVpbHQsIEtpcmEgc21hbGwgYW5kIHNob3J0IGJlc2lkZSBoaW0pLCAoYykgY29udGFjdC9leWVsaW5lIGFuY2hvciAoaGVhZCBvZiBLaXJhIGF0IHRoZSBzdGVybnVtIG9mIE1vciwgY2hpbiBvZiBNb3IgdGlsdGVkIGRvd24pLiBGcmFtZSB3YWlzdC11cCsgZm9yIGJpZyBnYXBzOyBpZiBmYWNlcyBjbG9zZSwganVzdGlmeSBwaHlzaWNhbGx5IChNb3Igc3Rvb3BpbmcsIEtpcmEgb24gdG9lcykuCkVYUFJFU1NJT04rT1VURklUK1BPU0U6IG9uZSBmdXNlZCBjbGF1c2UgcGVyIGNoYXJhY3RlcjogTkFNRSArIGZhYnJpYy90ZXh0dXJlL2ZpdCArIGFjdGlvbi1iYXNlZCBwb3NlICsgbWljcm8tZXhwcmVzc2lvbiwgc2tpbiBzdGF0ZS4gUG9zZSB2aWEgYWN0aW9uIHZlcmJzIChNb3IgbGVhbmluZyBvbiBkb29yZnJhbWUsIGFybXMgbG9vc2VseSBjcm9zc2VkKSwgbmV2ZXIgc3RhdGljIGxpbWIgY29vcmRpbmF0ZXMuIE91dGZpdCBjYXJyaWVzIGZyb20gdGhlIHBvc3QgYW5kIGNvbnRleHQ7IGlmIHVuc2V0LCBpbnZlbnQgYW5kIGxvY2sgZm9yIHNjZW5lLgpIQU5EIFNBRkVUWTogZnJlZSBmaW5nZXJzIGZhaWwgbW9zdC4gU2FmZTogaGFuZCBpbiBwb2NrZXQsIGdyaXBwaW5nIG5hbWVkIG9iamVjdCAoZmluZ2VycyBjdXJsZWQgYXJvdW5kIGNlcmFtaWMgbXVnKSwgZmxhdCBvbiBzdXJmYWNlLCBhcm1zIGNyb3NzZWQsIGJlaGluZCBiYWNrLCBmaXN0IGF0IHNpZGUsIGxhY2VkLCBvbiBvd24gbmVjay9jaGluLiBPbmUgdmlzaWJsZSBoYW5kIHBlciBjaGFyYWN0ZXIsIGhpZGUgcmVzdCB2aWEgZnJhbWluZy9wb3NlLgpXRUlHSFQgJiBHUk9VTkQ6IG9uZSBzZW50ZW5jZSBvbiB3ZWlnaHQgKHdlaWdodCBvbiBsZWZ0IGxlZywgcmlnaHQgZm9vdCB0dXJuZWQgb3V0KS4gSGlkZGVuIGxpbWJzIHJlcXVpcmUgc3RhdGVkIHJlYXNvbiwgdW5leHBsYWluZWQgYWJzZW5jZSBicmVha3MgZmlndXJlLgpFTlZJUk9OTUVOVCtMSUdIVDogb25lIHNlbnRlbmNlOiBmZy9taWQvYmcgdGV4dHVyZXMsIGtleSBsaWdodCBkaXJlY3Rpb24rY29sb3IgdGVtcCwgYXRtb3NwaGVyaWMgcGFydGljbGVzIChkdXN0LCBzdGVhbSwgbWlzdCkuCk1BTlkgQ0hBUkFDVEVSUzogTkFNRSBzdGFydHMgZWFjaCBjbGF1c2UsIHJlcGVhdCBuYW1lcyBub3QgcHJvbm91bnMsIHJlbGF0aW9uYWwgcG9zaXRpb25pbmcgKGJlc2lkZSBLYW1vaSwgY2hpbiBvbiB0aGUgc2hvdWxkZXIgb2YgS2Ftb2kpLCBlbnZpcm9ubWVudCBhcyBmaW5hbCBzZW50ZW5jZS4KU1RZTEUgTE9DSyAoYXBwZW5kIHZlcmJhdGltKTogU29mdCBwYXN0ZWwgaWxsdXN0cmF0aW9uIHRlY2huaXF1ZSwgZ2VudGxlIHN0b3J5Ym9vayBjb2xvcmluZy4gQ29tcGxldGVseSBmbGF0IGNvbG9yaW5nLCBjbGVhbiBzbW9vdGggZXZlbiBjb2xvciBmaWxscyB3aXRoIGFsbW9zdCBubyBzaGFkaW5nLCBubyBzY3VscHRlZCBzaGFkb3dzLCBtaW5pbWFsIHNvZnQgY2VsLXNoYWRpbmcgb25seSBpZiBhbnkuIEFpcnkgbWlsa3kgcGFzdGVsIHBhbGV0dGU6IGxpbGFjLXdoaXRlLCBzb2Z0IHBlYWNoLCBtaW50LCBza3kgYmx1ZSwgcGluayBncmFkaWVudCB0b25lcywgZXZlcnl0aGluZyBsaWdodCBkZXNhdHVyYXRlZCBhbmQgZHJlYW15LiBEZWxpY2F0ZSB0aGluIGNsZWFuIGxpbmVhcnQuIFNvZnQgcm9zeSBibHVzaCB3aXRoIGdlbnRsZSBkaWZmdXNlZCBlZGdlcy4gRmxhdCBldmVuIGJyaWdodCBsaWdodGluZywgbm8gY29udHJhc3QsIG5vIGRyYW1hLiBTdWJ0bGUgZ3JhaW55IHdhdGVyY29sb3IgcGFwZXIgdGV4dHVyZSBvdmVybGF5IGFjcm9zcyB0aGUgd2hvbGUgaW1hZ2UsIHByaW50LW9uLXBhcGVyIGZlZWwuIENhbG0gc2VyZW5lIGdlbnRsZSBtb29kLgpORUdBVElWRSAoYXBwZW5kIHZlcmJhdGltKTogQXZvaWQ6IHJvdWdoIGRyeS1icnVzaCBzdHJva2VzLCBncml0dHkgdGV4dHVyZSwgaGVhdnkgc2hhZG93cywgZGVlcCBzaGFkaW5nLCBzY3VscHRlZCBmb3JtIHNoYWRvd3MsIGhpZ2ggY29udHJhc3QsIGRyYW1hdGljIGxpZ2h0aW5nLCBkYXJrIG11ZGR5IHRvbmVzLCBmaWxtIGdyYWluIG5vaXNlLCByZWFsaXN0aWMgcmVuZGVyaW5nLCBnbG9zc3kgcGxhc3RpYyBza2luLCBvdmVyc2F0dXJhdGVkIGNvbG9ycywgbmVvbiwgdGhpY2sgaGVhdnkgbGluZWFydCwgd2F0ZXJtYXJrLCB0ZXh0LCBzaWduYXR1cmUsIGRlZm9ybWVkIGhhbmRzLCBleHRyYSBmaW5nZXJzLCBmdXNlZCBsaW1icy4KUkVGRVJFTkNFIExPQ0sgKGFwcGVuZCB2ZXJiYXRpbSk6IE1hdGNoIGxpbmUgcXVhbGl0eSwgdGV4dHVyZSwgcmVuZGVyaW5nIHRlY2huaXF1ZSBmcm9tIHJlZmVyZW5jZSBpbWFnZS4gUG9zZSwgZnJhbWluZywgc3R5bGluZyBmb2xsb3cgY3VycmVudCBwcm9tcHQgbm90IHJlZmVyZW5jZS4KU0VOU1VBTCAoY2Vuc29yLWF3YXJlKTogcmVuZGVyIGludGltYWN5IHZpYSBhdG1vc3BoZXJlK3N1Z2dlc3Rpb24sIG5vdCBhbmF0b215LiBOT0lTRSBGTE9PRCAoMyspOiBkZW5zZSBzdGVhbSwgdGFuZ2xlZCBzaWxrK2N1c2hpb25zLCB3YXRlciBkcm9wbGV0cyBvbiBnbGFzcywgbHVzaCBwbGFudHMrcGV0YWxzLCB2ZW5ldGlhbiBibGluZCBzaGFkb3cgc3RyaXBlcywgZG96ZW5zIG9mIGNhbmRsZSBmbGFtZXMsIHNob3QgdGhyb3VnaCBkb29yZnJhbWUvc2hlZXIgY3VydGFpbi9mcm9zdGVkIGdsYXNzLCByYWluLXN0cmVha2VkIHdpbmRvdy4gQ09OQ0VBTE1FTlQgKDIrIHN0YWNrZWQpOiBkZWVwIGNoaWFyb3NjdXJvLCBmYWJyaWMgZHJhcGVkIGxvdywgYXJtcyBmb2xkZWQga25lZXMgZHJhd24sIGNyb3AgYXQgcmliY2FnZS9zaG91bGRlcnMsIHNob3QgZnJvbSBiZWhpbmQgb3ZlciBzaG91bGRlciwgbG93ZXIgZnJhbWUgaW50byBib2tlaCtoYXplLCBwaWxsb3cvYmxhbmtldCBhY3Jvc3MgYm9keS4gU0FGRSBMRVhJQ09OOiBzb2Z0IGRlY29sbGV0YWdlIHNoYWRlZCBieSBzaWxrLCBzcGluZSBsaW5lIHRyYWNlZCBieSBtb3JuaW5nIGxpZ2h0LCBmYWJyaWMgcG9vbGVkIGF0IGNvbGxhcmJvbmUsIHNpbGhvdWV0dGUgaGFsZi12ZWlsZWQgYnkgc3RlYW0sIHR3byBmaWd1cmVzIHNoYXJpbmcgYnJlYXRoIGF0IHRocmVzaG9sZCwgaGVhdnktbGlkZGVkIGdhemUgbGlwcyBiYXJlbHkgcGFydGVkLCBzdHJhcCBzbGlwcGluZyB0aGUgc2hvdWxkZXIgbGluZSwgZm9yZWhlYWQgcmVzdGluZyBhZ2FpbnN0IGZvcmVoZWFkLCBmaW5nZXJ0aXBzIGdob3N0aW5nIGEgamF3bGluZSwgcm9iZSBsb29zZSBhdCB0aGUgc2xlZXZlLiBGcmFtZSBpbnRpbWFjeSBhcyBNT01FTlQgKHBhdXNlLCBwcm94aW1pdHksIGxvb2spIG5vdCBBQ1QuClBST01QVCBIWUdJRU5FOiBuZXZlciB3cml0ZTogc2V4eSwgZXJvdGljLCBzZW5zdWFsLCBudWRlLCBuYWtlZCwgYmVhdXRpZnVsLCBtYXN0ZXJwaWVjZSwgYmVzdCBxdWFsaXR5LCByZWFsaXN0aWMsIHBob3RvcmVhbGlzdGljLgpDT05TSVNURU5DWTogcmUtc3RhdGUgb3V0Zml0LCBsb2NhdGlvbiwgdGltZSBvZiBkYXksIGxpZ2h0IHNvdXJjZSBpbiBldmVyeSBwcm9tcHQg4oCUIHRoZSByZW5kZXJlciBoYXMgbm8gbWVtb3J5IGJldHdlZW4gY2FsbHMuCkNvbXBvc2UgZm9yIHRoZSBBU1BFQ1QgUkFUSU8gZ2l2ZW4gaW4gdGhlIHJlcXVlc3Q6IHZlcnRpY2FsID0gcG9ydHJhaXRzL2Z1bGwtYm9keSwgc3F1YXJlID0gc29jaWFsL2Nsb3NlLCB3aWRlID0gZW52aXJvbm1lbnQvdHdvLXNob3RzL2NpbmVtYXRpYy4="], ["Soft Graphite by Kamoi", "QnVpbGQgaW4gdGhpcyBvcmRlcjoKQ0FNRVJBOiBzaG90K2FuZ2xlK2xlbnMrYXBlcnR1cmUgaW4gb25lIGNsYXVzZS4gQ2xvc2UtdXAvTUNVID0gODUtMTM1bW0gZi8xLjgtMi4yIChzYWZlc3QgYW5hdG9teSksIG1lZGl1bSA9IDUwLTg1bW0gZi8yLTIuOCwgZnVsbCBib2R5IChyYXJlKSA9IDM1LTUwbW0gZi8yLjgtNC4gQmVhdC1kcml2ZXIgPSBjZW50ZXIgb2YgZnJhbWUuCkNIQVJBQ1RFUjogcmVmIGltYWdlcyBjYXJyeSBiYXNlIGxvb2ssIHNvIFNLSVAgaGFpciBjb2xvci9zdHlsZS9sZW5ndGgsIGV5ZSBjb2xvciwgc2tpbiB0b25lLCBmYWNlIHNoYXBlLCBib2R5IHR5cGUuIElOQ0xVREU6IGZpcnN0IG5hbWUgb25seSAobGVhZCB3aXRoIGl0KSwgZGlzdGluZ3Vpc2hpbmcgbWFya3MgKHRhdHRvb3MrbG9jYXRpb24sIHNjYXJzLCBwaWVyY2luZ3MsIG1vbGVzKSwgc2NlbmUtYWx0ZXJlZCBoYWlyIG9ubHkgKHdldCwgdGllZCwgbXVzc2VkKS4gTWVuIHByZWZpeCBsZWFuLW11c2NsZWQgb3IgdGFsbCBidWlsdCBwZXIgZXN0YWJsaXNoZWQgYnVpbGQsIGtlZXAgY29uc2lzdGVudC4KSEVJR0hUIERJRkZFUkVOQ0UgKHdoZW4gY2Fub24pOiBzdGFjayBUSFJFRSBjdWVzOiAoYSkgZ2FwIHN0YXRlbWVudCB3aXRoIG1hZ25pdHVkZSB1cCBmcm9udCAoTW9yIHRvd2VycyBhIGZ1bGwgaGVhZCBvdmVyIEtpcmEpLCAoYikgc2lsaG91ZXR0ZSBjb250cmFzdCAoTW9yIGxvbmctbGltYmVkIHRhbGwtYnVpbHQsIEtpcmEgc21hbGwgYW5kIHNob3J0IGJlc2lkZSBoaW0pLCAoYykgY29udGFjdC9leWVsaW5lIGFuY2hvciAoaGVhZCBvZiBLaXJhIGF0IHRoZSBzdGVybnVtIG9mIE1vciwgY2hpbiBvZiBNb3IgdGlsdGVkIGRvd24pLiBGcmFtZSB3YWlzdC11cCsgZm9yIGJpZyBnYXBzOyBpZiBmYWNlcyBjbG9zZSwganVzdGlmeSBwaHlzaWNhbGx5IChNb3Igc3Rvb3BpbmcsIEtpcmEgb24gdG9lcykuCkVYUFJFU1NJT04rT1VURklUK1BPU0U6IG9uZSBmdXNlZCBjbGF1c2UgcGVyIGNoYXJhY3RlcjogTkFNRSArIGZhYnJpYy90ZXh0dXJlL2ZpdCArIGFjdGlvbi1iYXNlZCBwb3NlICsgbWljcm8tZXhwcmVzc2lvbiwgc2tpbiBzdGF0ZS4gUG9zZSB2aWEgYWN0aW9uIHZlcmJzIChNb3IgbGVhbmluZyBvbiBkb29yZnJhbWUsIGFybXMgbG9vc2VseSBjcm9zc2VkKSwgbmV2ZXIgc3RhdGljIGxpbWIgY29vcmRpbmF0ZXMuIE91dGZpdCBjYXJyaWVzIGZyb20gdGhlIHBvc3QgYW5kIGNvbnRleHQ7IGlmIHVuc2V0LCBpbnZlbnQgYW5kIGxvY2sgZm9yIHNjZW5lLgpIQU5EIFNBRkVUWTogZnJlZSBmaW5nZXJzIGZhaWwgbW9zdC4gU2FmZTogaGFuZCBpbiBwb2NrZXQsIGdyaXBwaW5nIG5hbWVkIG9iamVjdCAoZmluZ2VycyBjdXJsZWQgYXJvdW5kIGNlcmFtaWMgbXVnKSwgZmxhdCBvbiBzdXJmYWNlLCBhcm1zIGNyb3NzZWQsIGJlaGluZCBiYWNrLCBmaXN0IGF0IHNpZGUsIGxhY2VkLCBvbiBvd24gbmVjay9jaGluLiBPbmUgdmlzaWJsZSBoYW5kIHBlciBjaGFyYWN0ZXIsIGhpZGUgcmVzdCB2aWEgZnJhbWluZy9wb3NlLgpXRUlHSFQgJiBHUk9VTkQ6IG9uZSBzZW50ZW5jZSBvbiB3ZWlnaHQgKHdlaWdodCBvbiBsZWZ0IGxlZywgcmlnaHQgZm9vdCB0dXJuZWQgb3V0KS4gSGlkZGVuIGxpbWJzIHJlcXVpcmUgc3RhdGVkIHJlYXNvbiwgdW5leHBsYWluZWQgYWJzZW5jZSBicmVha3MgZmlndXJlLgpFTlZJUk9OTUVOVCtMSUdIVDogb25lIHNlbnRlbmNlOiBmZy9taWQvYmcgdGV4dHVyZXMsIGtleSBsaWdodCBkaXJlY3Rpb24rY29sb3IgdGVtcCwgYXRtb3NwaGVyaWMgcGFydGljbGVzIChkdXN0LCBzdGVhbSwgbWlzdCkuCk1BTlkgQ0hBUkFDVEVSUzogTkFNRSBzdGFydHMgZWFjaCBjbGF1c2UsIHJlcGVhdCBuYW1lcyBub3QgcHJvbm91bnMsIHJlbGF0aW9uYWwgcG9zaXRpb25pbmcgKGJlc2lkZSBLYW1vaSwgY2hpbiBvbiB0aGUgc2hvdWxkZXIgb2YgS2Ftb2kpLCBlbnZpcm9ubWVudCBhcyBmaW5hbCBzZW50ZW5jZS4KU1RZTEUgTE9DSyAoYXBwZW5kIHZlcmJhdGltKTogTWF0dGUgcGFpbnRlcmx5IGdvdWFjaGUtc3R5bGUgZGlnaXRhbCBhcnQsIGhhbmQtcGFpbnRlZCBsb29rIHdpdGggdmlzaWJsZSBkcnktYnJ1c2ggdGV4dHVyZSBhbmQgc3VidGxlIHBhcGVyIGdyYWluLiBMaXZpbmcgc2xpZ2h0bHkgcm91Z2ggcGVuY2lsLWFuZC1icnVzaCBsaW5ld29yaywgdW5ldmVuIHByZXNzdXJlLXZhcmllZCBjb250b3Vycywgc29tZSBzdHJva2VzIGJyb2tlbiBhbmQgc2tldGNoeSByYXRoZXIgdGhhbiBjbGVhbi4gU29mdCBtYXR0ZSBza2luIHJlbmRlcmluZyB3aXRoIG5vIGdsb3NzeSBzaGVlbiwgZGVsaWNhdGUgZHJ5LWJydXNoIHNoYWRpbmcsIGZpbmUgdmlzaWJsZSBwYWludGVybHkgdGV4dHVyZSBhY3Jvc3MgdGhlIGZhY2UsIGZhaW50bHkgc3RpcHBsZWQgZnJlY2tsZS1saWtlIHNwZWNrbGluZyBvbiBza2luLiBIYWlyIHJlbmRlcmVkIGFzIG1hbnkgZmluZSBpbmRpdmlkdWFsIGxvb3NlIGJydXNoIHN0cm9rZXMsIHdpc3B5IHNlcGFyYXRlZCBzdHJhbmRzIGNhdGNoaW5nIHNvZnQgbGlnaHQsIHRleHR1cmVkIG5vdCBzbW9vdGguIEZsYXQgc29mdCBldmVuIGxpZ2h0aW5nLCBjYWxtIGFuZCB1bmRyYW1hdGljLCBkYXJrIG11dGVkIGJhY2tkcm9wLiBOZXV0cmFsIGJhbGFuY2VkIGNvbG9yIGdyYWRpbmcsIGNvb2wtbmV1dHJhbCBza2luIHRvbmUsIGxvdyBzYXR1cmF0aW9uLCBtdXRlZCBxdWlldCBwYWxldHRlLiBTdHlsaXplZCBzZW1pLXJlYWxpc3RpYyBwcm9wb3J0aW9ucy4gSHVtYW4gZXllcywgbmF0dXJhbCBpcmlzLgpORUdBVElWRSAoYXBwZW5kIHZlcmJhdGltKTogQXZvaWQ6IG9saXZlIHRpbnQsIHdhcm0gZ29sZGVuIHRvbmUsIHNlcGlhLCBvdmVyc2F0dXJhdGVkIGNvbG9ycywgbmVvbiwgdml2aWQgcGFsZXR0ZSwgZ2xvc3N5IHBsYXN0aWMgc2tpbiwgc21vb3RoIGFpcmJydXNoIHJlbmRlciwgZmxhdCB1bnRleHR1cmVkIHNraW4sIHNtb290aCBibHVycnkgaGFpciwgaGFyc2ggcmltIGxpZ2h0LCBkcmFtYXRpYyBzcG90bGlnaHQsIGNoaWFyb3NjdXJvLCBjbGVhbiB2ZWN0b3Igb3V0bGluZXMsIGxpbmVsZXNzIHJlbmRlciwgY2FydG9vbmlzaCAzRCwgc2hhcnAgc3BlY3VsYXIgaGlnaGxpZ2h0cywgd2F0ZXJtYXJrLCB0ZXh0LCBzaWduYXR1cmUsIGFuaW1lIGJsdXNoIHN0aWNrZXJzLCB0d28tdG9uZSBjaGVla3MsIGhhcmQtZWRnZWQgcmVkIGNoZWVrcywgcm9zYWNlYSwgZGVmb3JtZWQgaGFuZHMsIGV4dHJhIGZpbmdlcnMsIGZ1c2VkIGxpbWJzLgpSRUZFUkVOQ0UgTE9DSyAoYXBwZW5kIHZlcmJhdGltKTogTWF0Y2ggbGluZSBxdWFsaXR5LCB0ZXh0dXJlLCByZW5kZXJpbmcgdGVjaG5pcXVlIGZyb20gcmVmZXJlbmNlIGltYWdlLiBQb3NlLCBmcmFtaW5nLCBzdHlsaW5nIGZvbGxvdyBjdXJyZW50IHByb21wdCBub3QgcmVmZXJlbmNlLgpTRU5TVUFMIChjZW5zb3ItYXdhcmUpOiByZW5kZXIgaW50aW1hY3kgdmlhIGF0bW9zcGhlcmUrc3VnZ2VzdGlvbiwgbm90IGFuYXRvbXkuIE5PSVNFIEZMT09EICgzKyk6IGRlbnNlIHN0ZWFtLCB0YW5nbGVkIHNpbGsrY3VzaGlvbnMsIHdhdGVyIGRyb3BsZXRzIG9uIGdsYXNzLCBsdXNoIHBsYW50cytwZXRhbHMsIHZlbmV0aWFuIGJsaW5kIHNoYWRvdyBzdHJpcGVzLCBkb3plbnMgb2YgY2FuZGxlIGZsYW1lcywgc2hvdCB0aHJvdWdoIGRvb3JmcmFtZS9zaGVlciBjdXJ0YWluL2Zyb3N0ZWQgZ2xhc3MsIHJhaW4tc3RyZWFrZWQgd2luZG93LiBDT05DRUFMTUVOVCAoMisgc3RhY2tlZCk6IGRlZXAgY2hpYXJvc2N1cm8sIGZhYnJpYyBkcmFwZWQgbG93LCBhcm1zIGZvbGRlZCBrbmVlcyBkcmF3biwgY3JvcCBhdCByaWJjYWdlL3Nob3VsZGVycywgc2hvdCBmcm9tIGJlaGluZCBvdmVyIHNob3VsZGVyLCBsb3dlciBmcmFtZSBpbnRvIGJva2VoK2hhemUsIHBpbGxvdy9ibGFua2V0IGFjcm9zcyBib2R5LiBTQUZFIExFWElDT046IHNvZnQgZGVjb2xsZXRhZ2Ugc2hhZGVkIGJ5IHNpbGssIHNwaW5lIGxpbmUgdHJhY2VkIGJ5IG1vcm5pbmcgbGlnaHQsIGZhYnJpYyBwb29sZWQgYXQgY29sbGFyYm9uZSwgc2lsaG91ZXR0ZSBoYWxmLXZlaWxlZCBieSBzdGVhbSwgdHdvIGZpZ3VyZXMgc2hhcmluZyBicmVhdGggYXQgdGhyZXNob2xkLCBoZWF2eS1saWRkZWQgZ2F6ZSBsaXBzIGJhcmVseSBwYXJ0ZWQsIHN0cmFwIHNsaXBwaW5nIHRoZSBzaG91bGRlciBsaW5lLCBmb3JlaGVhZCByZXN0aW5nIGFnYWluc3QgZm9yZWhlYWQsIGZpbmdlcnRpcHMgZ2hvc3RpbmcgYSBqYXdsaW5lLCByb2JlIGxvb3NlIGF0IHRoZSBzbGVldmUuIEZyYW1lIGludGltYWN5IGFzIE1PTUVOVCAocGF1c2UsIHByb3hpbWl0eSwgbG9vaykgbm90IEFDVC4KUFJPTVBUIEhZR0lFTkU6IG5ldmVyIHdyaXRlOiBzZXh5LCBlcm90aWMsIHNlbnN1YWwsIG51ZGUsIG5ha2VkLCBiZWF1dGlmdWwsIG1hc3RlcnBpZWNlLCBiZXN0IHF1YWxpdHksIHJlYWxpc3RpYywgcGhvdG9yZWFsaXN0aWMuCkNPTlNJU1RFTkNZOiByZS1zdGF0ZSBvdXRmaXQsIGxvY2F0aW9uLCB0aW1lIG9mIGRheSwgbGlnaHQgc291cmNlIGluIGV2ZXJ5IHByb21wdCDigJQgdGhlIHJlbmRlcmVyIGhhcyBubyBtZW1vcnkgYmV0d2VlbiBjYWxscy4KQ29tcG9zZSBmb3IgdGhlIEFTUEVDVCBSQVRJTyBnaXZlbiBpbiB0aGUgcmVxdWVzdDogdmVydGljYWwgPSBwb3J0cmFpdHMvZnVsbC1ib2R5LCBzcXVhcmUgPSBzb2NpYWwvY2xvc2UsIHdpZGUgPSBlbnZpcm9ubWVudC90d28tc2hvdHMvY2luZW1hdGljLg=="], ["Inoue Noir by Kamoi", "QnVpbGQgaW4gdGhpcyBvcmRlcjoKQ0FNRVJBOiBzaG90K2FuZ2xlK2xlbnMrYXBlcnR1cmUgaW4gb25lIGNsYXVzZS4gQ2xvc2UtdXAvTUNVID0gODUtMTM1bW0gZi8xLjgtMi4yIChzYWZlc3QgYW5hdG9teSksIG1lZGl1bSA9IDUwLTg1bW0gZi8yLTIuOCwgZnVsbCBib2R5IChyYXJlKSA9IDM1LTUwbW0gZi8yLjgtNC4gQmVhdC1kcml2ZXIgPSBjZW50ZXIgb2YgZnJhbWUuCkNIQVJBQ1RFUjogcmVmIGltYWdlcyBjYXJyeSBiYXNlIGxvb2ssIHNvIFNLSVAgaGFpciBjb2xvci9zdHlsZS9sZW5ndGgsIGV5ZSBjb2xvciwgc2tpbiB0b25lLCBmYWNlIHNoYXBlLCBib2R5IHR5cGUuIElOQ0xVREU6IGZpcnN0IG5hbWUgb25seSAobGVhZCB3aXRoIGl0KSwgZGlzdGluZ3Vpc2hpbmcgbWFya3MgKHRhdHRvb3MrbG9jYXRpb24sIHNjYXJzLCBwaWVyY2luZ3MsIG1vbGVzKSwgc2NlbmUtYWx0ZXJlZCBoYWlyIG9ubHkgKHdldCwgdGllZCwgbXVzc2VkKS4gTWVuIHByZWZpeCBsZWFuLW11c2NsZWQgb3IgdGFsbCBidWlsdCBwZXIgZXN0YWJsaXNoZWQgYnVpbGQsIGtlZXAgY29uc2lzdGVudC4KSEVJR0hUIERJRkZFUkVOQ0UgKHdoZW4gY2Fub24pOiBzdGFjayBUSFJFRSBjdWVzOiAoYSkgZ2FwIHN0YXRlbWVudCB3aXRoIG1hZ25pdHVkZSB1cCBmcm9udCAoTW9yIHRvd2VycyBhIGZ1bGwgaGVhZCBvdmVyIEtpcmEpLCAoYikgc2lsaG91ZXR0ZSBjb250cmFzdCAoTW9yIGxvbmctbGltYmVkIHRhbGwtYnVpbHQsIEtpcmEgc21hbGwgYW5kIHNob3J0IGJlc2lkZSBoaW0pLCAoYykgY29udGFjdC9leWVsaW5lIGFuY2hvciAoaGVhZCBvZiBLaXJhIGF0IHRoZSBzdGVybnVtIG9mIE1vciwgY2hpbiBvZiBNb3IgdGlsdGVkIGRvd24pLiBGcmFtZSB3YWlzdC11cCsgZm9yIGJpZyBnYXBzOyBpZiBmYWNlcyBjbG9zZSwganVzdGlmeSBwaHlzaWNhbGx5IChNb3Igc3Rvb3BpbmcsIEtpcmEgb24gdG9lcykuCkVYUFJFU1NJT04rT1VURklUK1BPU0U6IG9uZSBmdXNlZCBjbGF1c2UgcGVyIGNoYXJhY3RlcjogTkFNRSArIGZhYnJpYy90ZXh0dXJlL2ZpdCArIGFjdGlvbi1iYXNlZCBwb3NlICsgbWljcm8tZXhwcmVzc2lvbiwgc2tpbiBzdGF0ZS4gUG9zZSB2aWEgYWN0aW9uIHZlcmJzIChNb3IgbGVhbmluZyBvbiBkb29yZnJhbWUsIGFybXMgbG9vc2VseSBjcm9zc2VkKSwgbmV2ZXIgc3RhdGljIGxpbWIgY29vcmRpbmF0ZXMuIE91dGZpdCBjYXJyaWVzIGZyb20gdGhlIHBvc3QgYW5kIGNvbnRleHQ7IGlmIHVuc2V0LCBpbnZlbnQgYW5kIGxvY2sgZm9yIHNjZW5lLgpIQU5EIFNBRkVUWTogZnJlZSBmaW5nZXJzIGZhaWwgbW9zdC4gU2FmZTogaGFuZCBpbiBwb2NrZXQsIGdyaXBwaW5nIG5hbWVkIG9iamVjdCAoZmluZ2VycyBjdXJsZWQgYXJvdW5kIGNlcmFtaWMgbXVnKSwgZmxhdCBvbiBzdXJmYWNlLCBhcm1zIGNyb3NzZWQsIGJlaGluZCBiYWNrLCBmaXN0IGF0IHNpZGUsIGxhY2VkLCBvbiBvd24gbmVjay9jaGluLiBPbmUgdmlzaWJsZSBoYW5kIHBlciBjaGFyYWN0ZXIsIGhpZGUgcmVzdCB2aWEgZnJhbWluZy9wb3NlLgpXRUlHSFQgJiBHUk9VTkQ6IG9uZSBzZW50ZW5jZSBvbiB3ZWlnaHQgKHdlaWdodCBvbiBsZWZ0IGxlZywgcmlnaHQgZm9vdCB0dXJuZWQgb3V0KS4gSGlkZGVuIGxpbWJzIHJlcXVpcmUgc3RhdGVkIHJlYXNvbiwgdW5leHBsYWluZWQgYWJzZW5jZSBicmVha3MgZmlndXJlLgpFTlZJUk9OTUVOVCtMSUdIVDogb25lIHNlbnRlbmNlOiBmZy9taWQvYmcgdGV4dHVyZXMsIGtleSBsaWdodCBkaXJlY3Rpb24rY29sb3IgdGVtcCwgYXRtb3NwaGVyaWMgcGFydGljbGVzIChkdXN0LCBzdGVhbSwgbWlzdCkuCk1BTlkgQ0hBUkFDVEVSUzogTkFNRSBzdGFydHMgZWFjaCBjbGF1c2UsIHJlcGVhdCBuYW1lcyBub3QgcHJvbm91bnMsIHJlbGF0aW9uYWwgcG9zaXRpb25pbmcgKGJlc2lkZSBLYW1vaSwgY2hpbiBvbiB0aGUgc2hvdWxkZXIgb2YgS2Ftb2kpLCBlbnZpcm9ubWVudCBhcyBmaW5hbCBzZW50ZW5jZS4KU1RZTEUgTE9DSyAoYXBwZW5kIHZlcmJhdGltKTogQmxhY2stYW5kLXdoaXRlIGdyYXBoaXRlLWFuZC1pbmsgbWFuZ2EgaWxsdXN0cmF0aW9uIGluc3BpcmVkIGJ5IFRha2VoaWtvIElub3VlLCBTbGFtIER1bmsgYW5kIFZhZ2Fib25kLiBUaGUgY2hhcmFjdGVyIGlzIHJlbmRlcmVkIGVudGlyZWx5IGluIG1vbm9jaHJvbWUgbGluZXdvcmssIHZpc2libGUgZ3JhcGhpdGUgaGF0Y2hpbmcsIGNyb3NzLWhhdGNoaW5nLCBicm9rZW4gc2tldGNoIHN0cm9rZXMgYW5kIGRlbGliZXJhdGUgc29saWQtYmxhY2sgc2hhcGVzLiBNYXR1cmUgcmVhbGlzdGljIGFuYXRvbXksIHN0cnVjdHVyZWQgZmFjaWFsIGZlYXR1cmVzLCBuYXR1cmFsbHkgcHJvcG9ydGlvbmVkIGh1bWFuIGV5ZXMgYW5kIGV4cHJlc3NpdmUgZHJhZnRzbWFuc2hpcC4gQSBzb2Z0LCBwYWxlLCBtdXRlZCBjb2xvciB3YXNoIGFwcGVhcnMgZXhjbHVzaXZlbHkgaW4gdGhlIGJhY2tncm91bmQsIHJlbWFpbmluZyB2aXN1YWxseSBzZXBhcmF0ZSBmcm9tIHRoZSBtb25vY2hyb21lIGZpZ3VyZS4KTkVHQVRJVkUgKGFwcGVuZCB2ZXJiYXRpbSk6IEF2b2lkOiBjb2xvciBvbiB0aGUgY2hhcmFjdGVyLCBwYWludGVybHkgY2hhcmFjdGVyIHJlbmRlcmluZywgc29mdCBhaXJicnVzaGVkIHNraW4sIG1vZSBvciBjaGliaSBmZWF0dXJlcywgb3ZlcnNpemVkIGV5ZXMsIHRleHQsIGxvZ28sIHdhdGVybWFyaywgc2lnbmF0dXJlLgpSRUZFUkVOQ0UgTE9DSyAoYXBwZW5kIHZlcmJhdGltKTogTWF0Y2ggbGluZSBxdWFsaXR5LCB0ZXh0dXJlLCByZW5kZXJpbmcgdGVjaG5pcXVlIGZyb20gcmVmZXJlbmNlIGltYWdlLiBQb3NlLCBmcmFtaW5nLCBzdHlsaW5nIGZvbGxvdyBjdXJyZW50IHByb21wdCBub3QgcmVmZXJlbmNlLgpTRU5TVUFMIChjZW5zb3ItYXdhcmUpOiByZW5kZXIgaW50aW1hY3kgdmlhIGF0bW9zcGhlcmUrc3VnZ2VzdGlvbiwgbm90IGFuYXRvbXkuIE5PSVNFIEZMT09EICgzKyk6IGRlbnNlIHN0ZWFtLCB0YW5nbGVkIHNpbGsrY3VzaGlvbnMsIHdhdGVyIGRyb3BsZXRzIG9uIGdsYXNzLCBsdXNoIHBsYW50cytwZXRhbHMsIHZlbmV0aWFuIGJsaW5kIHNoYWRvdyBzdHJpcGVzLCBkb3plbnMgb2YgY2FuZGxlIGZsYW1lcywgc2hvdCB0aHJvdWdoIGRvb3JmcmFtZS9zaGVlciBjdXJ0YWluL2Zyb3N0ZWQgZ2xhc3MsIHJhaW4tc3RyZWFrZWQgd2luZG93LiBDT05DRUFMTUVOVCAoMisgc3RhY2tlZCk6IGRlZXAgY2hpYXJvc2N1cm8sIGZhYnJpYyBkcmFwZWQgbG93LCBhcm1zIGZvbGRlZCBrbmVlcyBkcmF3biwgY3JvcCBhdCByaWJjYWdlL3Nob3VsZGVycywgc2hvdCBmcm9tIGJlaGluZCBvdmVyIHNob3VsZGVyLCBsb3dlciBmcmFtZSBpbnRvIGJva2VoK2hhemUsIHBpbGxvdy9ibGFua2V0IGFjcm9zcyBib2R5LiBTQUZFIExFWElDT046IHNvZnQgZGVjb2xsZXRhZ2Ugc2hhZGVkIGJ5IHNpbGssIHNwaW5lIGxpbmUgdHJhY2VkIGJ5IG1vcm5pbmcgbGlnaHQsIGZhYnJpYyBwb29sZWQgYXQgY29sbGFyYm9uZSwgc2lsaG91ZXR0ZSBoYWxmLXZlaWxlZCBieSBzdGVhbSwgdHdvIGZpZ3VyZXMgc2hhcmluZyBicmVhdGggYXQgdGhyZXNob2xkLCBoZWF2eS1saWRkZWQgZ2F6ZSBsaXBzIGJhcmVseSBwYXJ0ZWQsIHN0cmFwIHNsaXBwaW5nIHRoZSBzaG91bGRlciBsaW5lLCBmb3JlaGVhZCByZXN0aW5nIGFnYWluc3QgZm9yZWhlYWQsIGZpbmdlcnRpcHMgZ2hvc3RpbmcgYSBqYXdsaW5lLCByb2JlIGxvb3NlIGF0IHRoZSBzbGVldmUuIEZyYW1lIGludGltYWN5IGFzIE1PTUVOVCAocGF1c2UsIHByb3hpbWl0eSwgbG9vaykgbm90IEFDVC4KUFJPTVBUIEhZR0lFTkU6IG5ldmVyIHdyaXRlOiBzZXh5LCBlcm90aWMsIHNlbnN1YWwsIG51ZGUsIG5ha2VkLCBiZWF1dGlmdWwsIG1hc3RlcnBpZWNlLCBiZXN0IHF1YWxpdHksIHJlYWxpc3RpYywgcGhvdG9yZWFsaXN0aWMuCkNPTlNJU1RFTkNZOiByZS1zdGF0ZSBvdXRmaXQsIGxvY2F0aW9uLCB0aW1lIG9mIGRheSwgbGlnaHQgc291cmNlIGluIGV2ZXJ5IHByb21wdCDigJQgdGhlIHJlbmRlcmVyIGhhcyBubyBtZW1vcnkgYmV0d2VlbiBjYWxscy4KQ29tcG9zZSBmb3IgdGhlIEFTUEVDVCBSQVRJTyBnaXZlbiBpbiB0aGUgcmVxdWVzdDogdmVydGljYWwgPSBwb3J0cmFpdHMvZnVsbC1ib2R5LCBzcXVhcmUgPSBzb2NpYWwvY2xvc2UsIHdpZGUgPSBlbnZpcm9ubWVudC90d28tc2hvdHMvY2luZW1hdGljLg=="], ["NANA Noir by Kamoi", "QnVpbGQgaW4gdGhpcyBvcmRlcjoKQ0FNRVJBOiBzaG90K2FuZ2xlK2xlbnMrYXBlcnR1cmUgaW4gb25lIGNsYXVzZS4gQ2xvc2UtdXAvTUNVID0gODUtMTM1bW0gZi8xLjgtMi4yIChzYWZlc3QgYW5hdG9teSksIG1lZGl1bSA9IDUwLTg1bW0gZi8yLTIuOCwgZnVsbCBib2R5IChyYXJlKSA9IDM1LTUwbW0gZi8yLjgtNC4gQmVhdC1kcml2ZXIgPSBjZW50ZXIgb2YgZnJhbWUuCkNIQVJBQ1RFUjogcmVmIGltYWdlcyBjYXJyeSBiYXNlIGxvb2ssIHNvIFNLSVAgaGFpciBjb2xvci9zdHlsZS9sZW5ndGgsIGV5ZSBjb2xvciwgc2tpbiB0b25lLCBmYWNlIHNoYXBlLCBib2R5IHR5cGUuIElOQ0xVREU6IGZpcnN0IG5hbWUgb25seSAobGVhZCB3aXRoIGl0KSwgZGlzdGluZ3Vpc2hpbmcgbWFya3MgKHRhdHRvb3MrbG9jYXRpb24sIHNjYXJzLCBwaWVyY2luZ3MsIG1vbGVzKSwgc2NlbmUtYWx0ZXJlZCBoYWlyIG9ubHkgKHdldCwgdGllZCwgbXVzc2VkKS4gTWVuIHByZWZpeCBsZWFuLW11c2NsZWQgb3IgdGFsbCBidWlsdCBwZXIgZXN0YWJsaXNoZWQgYnVpbGQsIGtlZXAgY29uc2lzdGVudC4KSEVJR0hUIERJRkZFUkVOQ0UgKHdoZW4gY2Fub24pOiBzdGFjayBUSFJFRSBjdWVzOiAoYSkgZ2FwIHN0YXRlbWVudCB3aXRoIG1hZ25pdHVkZSB1cCBmcm9udCAoTW9yIHRvd2VycyBhIGZ1bGwgaGVhZCBvdmVyIEtpcmEpLCAoYikgc2lsaG91ZXR0ZSBjb250cmFzdCAoTW9yIGxvbmctbGltYmVkIHRhbGwtYnVpbHQsIEtpcmEgc21hbGwgYW5kIHNob3J0IGJlc2lkZSBoaW0pLCAoYykgY29udGFjdC9leWVsaW5lIGFuY2hvciAoaGVhZCBvZiBLaXJhIGF0IHRoZSBzdGVybnVtIG9mIE1vciwgY2hpbiBvZiBNb3IgdGlsdGVkIGRvd24pLiBGcmFtZSB3YWlzdC11cCsgZm9yIGJpZyBnYXBzOyBpZiBmYWNlcyBjbG9zZSwganVzdGlmeSBwaHlzaWNhbGx5IChNb3Igc3Rvb3BpbmcsIEtpcmEgb24gdG9lcykuCkVYUFJFU1NJT04rT1VURklUK1BPU0U6IG9uZSBmdXNlZCBjbGF1c2UgcGVyIGNoYXJhY3RlcjogTkFNRSArIGZhYnJpYy90ZXh0dXJlL2ZpdCArIGFjdGlvbi1iYXNlZCBwb3NlICsgbWljcm8tZXhwcmVzc2lvbiwgc2tpbiBzdGF0ZS4gUG9zZSB2aWEgYWN0aW9uIHZlcmJzIChNb3IgbGVhbmluZyBvbiBkb29yZnJhbWUsIGFybXMgbG9vc2VseSBjcm9zc2VkKSwgbmV2ZXIgc3RhdGljIGxpbWIgY29vcmRpbmF0ZXMuIE91dGZpdCBjYXJyaWVzIGZyb20gdGhlIHBvc3QgYW5kIGNvbnRleHQ7IGlmIHVuc2V0LCBpbnZlbnQgYW5kIGxvY2sgZm9yIHNjZW5lLgpIQU5EIFNBRkVUWTogZnJlZSBmaW5nZXJzIGZhaWwgbW9zdC4gU2FmZTogaGFuZCBpbiBwb2NrZXQsIGdyaXBwaW5nIG5hbWVkIG9iamVjdCAoZmluZ2VycyBjdXJsZWQgYXJvdW5kIGNlcmFtaWMgbXVnKSwgZmxhdCBvbiBzdXJmYWNlLCBhcm1zIGNyb3NzZWQsIGJlaGluZCBiYWNrLCBmaXN0IGF0IHNpZGUsIGxhY2VkLCBvbiBvd24gbmVjay9jaGluLiBPbmUgdmlzaWJsZSBoYW5kIHBlciBjaGFyYWN0ZXIsIGhpZGUgcmVzdCB2aWEgZnJhbWluZy9wb3NlLgpXRUlHSFQgJiBHUk9VTkQ6IG9uZSBzZW50ZW5jZSBvbiB3ZWlnaHQgKHdlaWdodCBvbiBsZWZ0IGxlZywgcmlnaHQgZm9vdCB0dXJuZWQgb3V0KS4gSGlkZGVuIGxpbWJzIHJlcXVpcmUgc3RhdGVkIHJlYXNvbiwgdW5leHBsYWluZWQgYWJzZW5jZSBicmVha3MgZmlndXJlLgpFTlZJUk9OTUVOVCtMSUdIVDogb25lIHNlbnRlbmNlOiBmZy9taWQvYmcgdGV4dHVyZXMsIGtleSBsaWdodCBkaXJlY3Rpb24rY29sb3IgdGVtcCwgYXRtb3NwaGVyaWMgcGFydGljbGVzIChkdXN0LCBzdGVhbSwgbWlzdCkuCk1BTlkgQ0hBUkFDVEVSUzogTkFNRSBzdGFydHMgZWFjaCBjbGF1c2UsIHJlcGVhdCBuYW1lcyBub3QgcHJvbm91bnMsIHJlbGF0aW9uYWwgcG9zaXRpb25pbmcgKGJlc2lkZSBLYW1vaSwgY2hpbiBvbiB0aGUgc2hvdWxkZXIgb2YgS2Ftb2kpLCBlbnZpcm9ubWVudCBhcyBmaW5hbCBzZW50ZW5jZS4KU1RZTEUgTE9DSyAoYXBwZW5kIHZlcmJhdGltKTogQmxhY2stYW5kLXdoaXRlIEphcGFuZXNlIG1hbmdhLCBBaSBZYXphd2EgTkFOQSBtYW5nYSBzdHlsZSwgam9zZWkgc2hvdWpvIGxpbmV3b3JrLiBQdXJlIG1vbm9jaHJvbWUgaW5rIG9uIHdoaXRlLCBjbGVhbiBmbGF0IGJsYWNrLWFuZC13aGl0ZSwgTk8gY29sb3IsIE5PVCBwYWludGVybHksIE5PVCByZW5kZXJlZCwgTk9UIHNlbWktcmVhbGlzdGljLCBOT1QgZ3JheXNjYWxlIHBhaW50aW5nLiBFbGVnYW50IHRoaW4gZmFzaGlvbi1pbGx1c3RyYXRpb24gaW5rIGxpbmVhcnQsIGRlbGljYXRlIGNvbmZpZGVudCBpbmtpbmcuIFNoYWRvd3MgZHJhd24gYXMgaGF0Y2hpbmcsIGNyb3NzLWhhdGNoaW5nLCBzb2xpZCBibGFjayBmaWxscyBhbmQgZ3JleSBzY3JlZW50b25lIGRvdHMsIE5PVCBzb2Z0IHNoYWRpbmcuIFRhbGwgc2xlbmRlciBlbG9uZ2F0ZWQgam9zZWkgcHJvcG9ydGlvbnMsIHNvZnRseSBlbG9uZ2F0ZWQgbWF0dXJlIGZhY2VzLCBnZW50bGUgamF3LCBsYXJnZSBzb2Z0IGFsbW9uZCBleWVzIHdpdGggbG9uZyBsYXNoZXMuIERlY29yYXRpdmUgYmFja2dyb3VuZHMgd2l0aCBmbG93ZXJzLCBwYXR0ZXJucyBhbmQgc2NyZWVudG9uZSwgcXVpZXQgbWVsYW5jaG9saWMgcm9jay1kcmFtYSBtb29kLiBIdW1hbiBleWVzLCBuYXR1cmFsIGlyaXMuCk5FR0FUSVZFIChhcHBlbmQgdmVyYmF0aW0pOiBBdm9pZDogY29sb3IsIHBhaW50ZWQgb3IgYWlyYnJ1c2hlZCByZW5kZXJpbmcsIHNtb290aCBncmF5c2NhbGUgZ3JhZGllbnRzLCBtb2Ugb3IgY2hpYmkgZmVhdHVyZXMsIHRleHQsIGxvZ28sIHdhdGVybWFyaywgc2lnbmF0dXJlLgpSRUZFUkVOQ0UgTE9DSyAoYXBwZW5kIHZlcmJhdGltKTogTWF0Y2ggbGluZSBxdWFsaXR5LCB0ZXh0dXJlLCByZW5kZXJpbmcgdGVjaG5pcXVlIGZyb20gcmVmZXJlbmNlIGltYWdlLiBQb3NlLCBmcmFtaW5nLCBzdHlsaW5nIGZvbGxvdyBjdXJyZW50IHByb21wdCBub3QgcmVmZXJlbmNlLgpTRU5TVUFMIChjZW5zb3ItYXdhcmUpOiByZW5kZXIgaW50aW1hY3kgdmlhIGF0bW9zcGhlcmUrc3VnZ2VzdGlvbiwgbm90IGFuYXRvbXkuIE5PSVNFIEZMT09EICgzKyk6IGRlbnNlIHN0ZWFtLCB0YW5nbGVkIHNpbGsrY3VzaGlvbnMsIHdhdGVyIGRyb3BsZXRzIG9uIGdsYXNzLCBsdXNoIHBsYW50cytwZXRhbHMsIHZlbmV0aWFuIGJsaW5kIHNoYWRvdyBzdHJpcGVzLCBkb3plbnMgb2YgY2FuZGxlIGZsYW1lcywgc2hvdCB0aHJvdWdoIGRvb3JmcmFtZS9zaGVlciBjdXJ0YWluL2Zyb3N0ZWQgZ2xhc3MsIHJhaW4tc3RyZWFrZWQgd2luZG93LiBDT05DRUFMTUVOVCAoMisgc3RhY2tlZCk6IGRlZXAgY2hpYXJvc2N1cm8sIGZhYnJpYyBkcmFwZWQgbG93LCBhcm1zIGZvbGRlZCBrbmVlcyBkcmF3biwgY3JvcCBhdCByaWJjYWdlL3Nob3VsZGVycywgc2hvdCBmcm9tIGJlaGluZCBvdmVyIHNob3VsZGVyLCBsb3dlciBmcmFtZSBpbnRvIGJva2VoK2hhemUsIHBpbGxvdy9ibGFua2V0IGFjcm9zcyBib2R5LiBTQUZFIExFWElDT046IHNvZnQgZGVjb2xsZXRhZ2Ugc2hhZGVkIGJ5IHNpbGssIHNwaW5lIGxpbmUgdHJhY2VkIGJ5IG1vcm5pbmcgbGlnaHQsIGZhYnJpYyBwb29sZWQgYXQgY29sbGFyYm9uZSwgc2lsaG91ZXR0ZSBoYWxmLXZlaWxlZCBieSBzdGVhbSwgdHdvIGZpZ3VyZXMgc2hhcmluZyBicmVhdGggYXQgdGhyZXNob2xkLCBoZWF2eS1saWRkZWQgZ2F6ZSBsaXBzIGJhcmVseSBwYXJ0ZWQsIHN0cmFwIHNsaXBwaW5nIHRoZSBzaG91bGRlciBsaW5lLCBmb3JlaGVhZCByZXN0aW5nIGFnYWluc3QgZm9yZWhlYWQsIGZpbmdlcnRpcHMgZ2hvc3RpbmcgYSBqYXdsaW5lLCByb2JlIGxvb3NlIGF0IHRoZSBzbGVldmUuIEZyYW1lIGludGltYWN5IGFzIE1PTUVOVCAocGF1c2UsIHByb3hpbWl0eSwgbG9vaykgbm90IEFDVC4KUFJPTVBUIEhZR0lFTkU6IG5ldmVyIHdyaXRlOiBzZXh5LCBlcm90aWMsIHNlbnN1YWwsIG51ZGUsIG5ha2VkLCBiZWF1dGlmdWwsIG1hc3RlcnBpZWNlLCBiZXN0IHF1YWxpdHksIHJlYWxpc3RpYywgcGhvdG9yZWFsaXN0aWMuCkNPTlNJU1RFTkNZOiByZS1zdGF0ZSBvdXRmaXQsIGxvY2F0aW9uLCB0aW1lIG9mIGRheSwgbGlnaHQgc291cmNlIGluIGV2ZXJ5IHByb21wdCDigJQgdGhlIHJlbmRlcmVyIGhhcyBubyBtZW1vcnkgYmV0d2VlbiBjYWxscy4KQ29tcG9zZSBmb3IgdGhlIEFTUEVDVCBSQVRJTyBnaXZlbiBpbiB0aGUgcmVxdWVzdDogdmVydGljYWwgPSBwb3J0cmFpdHMvZnVsbC1ib2R5LCBzcXVhcmUgPSBzb2NpYWwvY2xvc2UsIHdpZGUgPSBlbnZpcm9ubWVudC90d28tc2hvdHMvY2luZW1hdGljLg=="]];

async function runSeeder() {
  var VER = 13;
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
      } catch (e) {}
      if (done >= VER) return;
      var arr = [];
      try {
        arr = (await tv.get('iig_prompts', 'global')) || [];
      } catch (e) {}
      if (!Array.isArray(arr)) arr = [];
      if (!arr.length && done >= 2) {
        await new Promise(function(r) {
          setTimeout(r, 1500);
        });
        var arr2 = [];
        try {
          arr2 = (await tv.get('iig_prompts', 'global')) || [];
        } catch (e) {}
        if (Array.isArray(arr2) && arr2.length) arr = arr2;
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
        ['NANA Noir by kamoi', 'NANA Noir by Kamoi']
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
      if (added || upd || renN) await tv.set('iig_prompts', arr, 'global');
      if (renN) {
        try {
          var cfgR = (await tv.get('iig_cfg', 'global')) || {};
          var actR = cfgR.promptName || '';
          if (actR && renamed[actR]) {
            cfgR.promptName = renamed[actR];
            await tv.set('iig_cfg', cfgR, 'global');
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

setTimeout(function () {
  try {
    runSeeder();
  } catch (e) {
    note('seeder failed', short(e));
  }
}, 5000);

setTimeout(async function () {
  try {
    var total = await tavo.message.count();
    var from = total > 60 ? total - 60 : 0;
    var msgs = await tavo.message.find([from]);
    var keys = [];
    for (var i = 0; i < msgs.length; i++) {
      var c = String((msgs[i] && msgs[i].content) || '');
      var re = /\[IMG:(?:OK|GEN|FAIL):([a-z0-9_]{1,39})\]/g;
      var m;
      while ((m = re.exec(c))) keys.push(m[1]);
    }
    if (!keys.length) {
      tavo.utils.toast('IIG проверка: меток в чате не найдено');
      return;
    }
    var found = 0;
    var sample = '';
    for (var k = 0; k < keys.length && k < 12; k++) {
      var v = null;
      try {
        v = await tavo.get(keys[k], 'chat');
      } catch (e) {}
      if (v) {
        found++;
        if (!sample) sample = keys[k] + ' ' + Math.round(String(v).length / 1024) + 'КБ';
      }
    }
    tavo.utils.toast('IIG проверка: меток ' + keys.length + ', картинок в хранилище ' + found + (sample ? (' · ' + sample) : ''));
  } catch (e) {
    try { tavo.utils.toast('IIG проверка не прошла: ' + (e && e.message)); } catch (x) {}
  }
}, 6000);
