import re, json, io, os, sys
from pathlib import Path

HERE = Path(__file__).resolve().parent

SRC = str(HERE / "plugin_p1/entry.js")
TAIL = str(HERE / "tail_p95.js")
OUT = str(HERE / "plugin_p2/entry.js")

src = io.open(SRC, encoding="utf-8").read()

def spans(text):
    out = {}
    for m in re.finditer(r'(?:^|\n)(?:async\s+)?function\s+([A-Za-z_$][\w$]*)\s*\(', text):
        name = m.group(1)
        i = text.index('{', m.end() - 1)
        d = 0; j = i; q = None; esc = False
        while j < len(text):
            c = text[j]
            if q:
                if esc: esc = False
                elif c == '\\': esc = True
                elif c == q: q = None
            else:
                if c in '"\'`': q = c
                elif c == '{': d += 1
                elif c == '}':
                    d -= 1
                    if d == 0: break
            j += 1
        start = m.start() + 1 if text[m.start()] == '\n' else m.start()
        out[name] = (start, j + 1)
    return out

F = spans(src)
names = set(F)
bodies = {n: src[a:b] for n, (a, b) in F.items()}

def callees(body):
    found = set(x for x in re.findall(r'(?<![\w$.])([A-Za-z_$][\w$]*)\s*\(', body) if x in names)
    local = set(re.findall(r'(?:const|let|var|function)\s+([A-Za-z_$][\w$]*)', body))
    return found - local

ROOTS = [
    "resolveCfg", "composeAuto", "generate", "gatherRefs", "loadRefs", "withRetry", "enqueue",
    "fetchT", "_withTimeout", "stopErr", "isRetryable", "urlToDataUrl", "chatContext",
    "_statAdd", "toast", "actStart", "actEnd", "actNote", "stopAll", "stopKey", "drainQueue",
    "pwGenerate", "applyLocks", "parseMarkers", "naisteraCanon", "naisteraRefsOk", "refGate",
    "refsNote", "_wc", "_gcState", "runSeeder",
]
BAN = set("""
_actWire _applyMarker _autoSlotRun _bakeArm _bakeFlush _bakeMissed _bakeTry _bareMatchDom
_bareResolve _blockHost _domQuiet _domUnloadKey _findMsgByKey _freshMark _fullPut _ioDrop _ioHit
_ioSetup _ioWatch _isLastMsg _keyOwner _keyOwnerSet _keyedResolve _keymapSave _near _noautoMark
_normTxt _ownerDrop _ownerFlush _owners _pruneStrip _run _slotNow _svgIcon _tick _tickBody
_visMsgs adoptLegacyTags autoSlot autoSlotFor bakeState cleanupErr cmdClean cmdGen cmdGenLast
cmdGenRange copyText decorate dlIcon download editIcon ensureBaseStyle ensureFrameStyle err
execCmd findPostByKey imgCss insertAfterPara process promptIcon prune regenIcon renderBareMarks
run runGenerate show showEdit showPrompt sizeBox stopIcon stopOverlay stripMarks stub sweep
teardown updMsg updSafe wrap avatarToB64 _avB64 shrinkDataUrl _kvGet collectAllImgKeys
dataURLtoBlob rewritePrompt genOpenAIImage isGptImage2
""".split())

seen = set(); stack = list(ROOTS)
while stack:
    n = stack.pop()
    if n in seen or n not in bodies: continue
    seen.add(n)
    for c in callees(bodies[n]):
        if c in BAN: continue
        stack.append(c)

missing = {}
for n in sorted(seen):
    miss = [c for c in sorted(callees(bodies[n])) if c not in seen]
    if miss: missing[n] = miss
REPLACED = {"_avB64", "genOpenAIImage"}
hard = {n: [c for c in m if c not in REPLACED] for n, m in missing.items()}
hard = {n: m for n, m in hard.items() if m}
if hard:
    print("ОБРЫВ ГРАФА — эти вызовы уходят в пустоту:")
    for n, m in hard.items(): print("   %-22s -> %s" % (n, ", ".join(m)))
    sys.exit(1)

PATCHES = [
    ("          prompt: naiTags ? ((tag.prompt || '') + naiTail) : (refsSummary(usedRefs) + stylePfx + (tag.prompt || '') + antiBleed(usedRefs)),\n",
     "          prompt: naiTags ? ((tag.prompt || '') + naiTail) : (refsSummary(usedRefs) + stylePfx + (tag.prompt || '') + antiBleed(usedRefs) + appearanceTail([])),\n"),
    ("              const tl = buildTextRefLabel(s.type, s.note, s.target, charName, userName);\n"
     "              if (tl) out.push({\n"
     "                textOnly: true,\n"
     "                label: tl\n"
     "              });\n",
     "              const tl = buildTextRefLabel(s.type, s.note, s.target, charName, userName);\n"
     "              if (tl) out.push({\n"
     "                textOnly: true,\n"
     "                label: tl,\n"
     "                note: s.note\n"
     "              });\n"),
    ("        let naiTail = tb + appearanceTail(usedRefs);\n",
     "        let naiTail = naiPlainTail();\n"),
    ("function apiPath(base, tail) {\n"
     "        base = rstripSlash(String(base || ''));\n",
     "function apiPath(base, tail) {\n"
     "        base = apiBase(base);\n"),
    ("        const url = rstripSlash(String(cfg.endpoint || '').replace(/\\/v1beta$/i, '')) + '/v1beta/models/' + model + ':generateContent';\n",
     "        const url = apiBase(String(cfg.endpoint || '')).replace(/\\/v1beta$/i, '') + '/v1beta/models/' + model + ':generateContent';\n"),
    ("      var done = 0;\n"
     "      try {\n"
     "        done = (await tv.get('iig_seed_pack', 'global')) || 0;\n"
     "      } catch (e) {}\n"
     "      if (done >= VER) return;",
     "      var done = 0;\n"
     "      try {\n"
     "        done = (await tv.get('iig_seed_pack', 'global')) || 0;\n"
     "      } catch (e) {\n"
     "        return;\n"
     "      }\n"
     "      if (done >= VER) return;"),
    ("      var arr = [];\n"
     "      try {\n"
     "        arr = (await tv.get('iig_prompts', 'global')) || [];\n"
     "      } catch (e) {}\n"
     "      if (!Array.isArray(arr)) arr = [];\n"
     "      if (!arr.length && done >= 2) {\n"
     "        await new Promise(function(r) {\n"
     "          setTimeout(r, 1500);\n"
     "        });\n"
     "        var arr2 = [];\n"
     "        try {\n"
     "          arr2 = (await tv.get('iig_prompts', 'global')) || [];\n"
     "        } catch (e) {}\n"
     "        if (Array.isArray(arr2) && arr2.length) arr = arr2;\n"
     "      }",
     "      var arr = [];\n"
     "      var arrOk = false;\n"
     "      try {\n"
     "        arr = (await tv.get('iig_prompts', 'global')) || [];\n"
     "        arrOk = true;\n"
     "      } catch (e) {}\n"
     "      if (!Array.isArray(arr)) arr = [];\n"
     "      /* Репорт 30.08 («IIG промпты — добавлено: 18» на каждом буте):\n"
     "         холодный стор отдаёт null УСПЕШНО, без исключения — done=0,\n"
     "         список «пуст», и посев с нуля перезаписывал живой список одними\n"
     "         сидами. Пустоту подтверждаем перечиткой через паузу: отметка\n"
     "         посева, хэши прежнего посева, сам список. */\n"
     "      if (!arrOk || !arr.length) {\n"
     "        await new Promise(function(r) {\n"
     "          setTimeout(r, 1500);\n"
     "        });\n"
     "        var done2 = null;\n"
     "        try {\n"
     "          done2 = await tv.get('iig_seed_pack', 'global');\n"
     "        } catch (e) {\n"
     "          return;\n"
     "        }\n"
     "        if ((done2 || 0) >= VER) return;\n"
     "        if ((done2 || 0) > done) done = done2 || 0;\n"
     "        var hsh2 = null;\n"
     "        try {\n"
     "          hsh2 = await tv.get('iig_seed_hashes', 'global');\n"
     "        } catch (e) {}\n"
     "        var arr2 = null;\n"
     "        try {\n"
     "          arr2 = await tv.get('iig_prompts', 'global');\n"
     "          arrOk = true;\n"
     "        } catch (e) {}\n"
     "        if (Array.isArray(arr2) && arr2.length) arr = arr2;\n"
     "        if (!arrOk) return;\n"
     "        if (!arr.length && done >= 2) return;\n"
     "        if (!arr.length && hsh2 && typeof hsh2 === 'object') {\n"
     "          for (var hk2 in hsh2) return;\n"
     "        }\n"
     "        /* Канарейка (репорт 30.08 вечер: тост «добавлено 18» при входе\n"
     "           в чат = холодный старт прямо в чат, стор отдаёт null «успешно»\n"
     "           и через паузу). Пишем маркер и перечитываем: круг не замкнулся\n"
     "           — стор не готов, в этот запуск не сеем вовсе. */\n"
     "        try {\n"
     "          var cana = 'c' + Date.now();\n"
     "          await tv.set('iig_seed_canary', cana, 'global');\n"
     "          if ((await tv.get('iig_seed_canary', 'global')) !== cana) return;\n"
     "        } catch (e) {\n"
     "          return;\n"
     "        }\n"
     "      }"),
    ("      if (added || upd || renN) await tv.set('iig_prompts', arr, 'global');",
     "      if (added || upd || renN) {\n"
     "        try {\n"
     "          var bak0 = await tv.get('iig_prompts', 'global');\n"
     "          if (Array.isArray(bak0) && bak0.length) await tv.set('iig_prompts_bak', bak0, 'global');\n"
     "        } catch (e) {}\n"
     "        await tv.set('iig_prompts', arr, 'global');\n"
     "      }"),

    ("}, 60000, cfg._sig);", "}, GEN_TIMEOUT, cfg._sig);"),
    ("async function loadRefs() {\n", "async function loadRefs0() {\n"),
    ("                if (s.dataUrl && s.kind !== 'text') continue;\n",
     "                if (s.dataUrl && s.kind !== 'text' && !s.ward) continue;\n"),
    ("            } else if (s.dataUrl) {\n"
     "              out.push({\n"
     "                dataUrl: s.dataUrl,\n"
     "                label: buildRefLabel(s.type, s.note, s.target, charName, userName)\n"
     "              });\n"
     "            }\n",
     "            } else if (s.dataUrl) {\n"
     "              out.push({\n"
     "                dataUrl: s.dataUrl,\n"
     "                label: buildRefLabel(s.type, s.note, s.target, charName, userName)\n"
     "              });\n"
     "              if (s.ward) {\n"
     "                const tw = buildTextRefLabel(s.type, s.note, s.target, charName, userName);\n"
     "                if (tw) out.push({\n"
     "                  textOnly: true,\n"
     "                  label: tw,\n"
     "                  note: s.note\n"
     "                });\n"
     "              }\n"
     "            }\n"),
    ("        if (txt.length > 4000) txt = txt.slice(0, 4000);\n", ""),
    ("            try {\n              r = await _withTimeout(tavo.generate(ask, gopts), 90000, 'модель чата молчит', sig);\n            } catch (eo) {\n              if (eo && eo.iigStop) throw eo;\n              if (/^timeout/.test((eo && eo.message) || '')) throw eo;\n              r = await _withTimeout(tavo.generate(ask), 90000, 'модель чата молчит', sig);\n            }\n", "            let last = null;\n            const tries = (cfg._iigSlim || 0) > 0 ? 1 : 2;\n            for (let a = 0; a < tries; a++) {\n              try {\n                r = await _withTimeout(a === 0 ? tavo.generate(ask, gopts) : tavo.generate(ask), 90000, 'модель чата молчит', sig);\n                last = null;\n                break;\n              } catch (eo) {\n                if (eo && eo.iigStop) throw eo;\n                if (/^timeout/.test((eo && eo.message) || '')) throw eo;\n                last = eo;\n                if (a + 1 < tries) await new Promise(function(res) {\n                  setTimeout(res, 2500);\n                });\n                if (sig && sig.aborted) throw stopErr();\n              }\n            }\n            if (last) throw last;\n"),
    ("        const nm = await castNames();\n        const out = {\n          char: (pp && nm.char && pp[nm.char]) ? String(pp[nm.char]).trim() : '',",
     "        const nm = await castNames();\n        pp = (await ppOverlay(pp, null, nm))[0];\n        const out = {\n          char: (pp && nm.char && pp[nm.char]) ? String(pp[nm.char]).trim() : '',"),
    ("        if (pp) {\n          if (charName && pp[charName]) passC = String(pp[charName]).trim();",
     "        const ovr = await ppOverlay(pp, pi, { char: charName, user: userName });\n        pp = ovr[0];\n        pi = ovr[1];\n        if (pp) {\n          if (charName && pp[charName]) passC = String(pp[charName]).trim();"),
    ("          background: 'BACKGROUND DESCRIPTION',", "          background: 'LOCATION DESCRIPTION',"),
    ("          user: (pp && pp.__user) ? String(pp.__user).trim() : ''",
     "          user: String(ppUser(pp, nm.user) || '').trim()"),
    ("          if (pp.__user) passU = String(pp.__user).trim();",
     "          passU = String(ppUser(pp, userName) || '').trim();"),
    ("          if (pi.__user) imgU = pi.__user;",
     "          imgU = ppUser(pi, userName);"),
    ("Every person visible in the image must be named by the exact spelling, because the reference photos are matched to these names.",
     "When the char or the user is visible, name them by this exact spelling, because the reference photos are matched to these names. Other people in the post (side characters, NPCs) keep their own names or descriptions from the post: never rename them into the char or the user, and never put the char or the user into a scene where the post does not show them."),
    ("        b += '\\nNEVER translate, transliterate, shorten, decline or re-spell these names.",
     "        b += '\\nTake the gender, age group and role of each person from the roleplay text and the appearance data below; never assume anyone is a girl or a man by default.';\n        b += '\\nNEVER translate, transliterate, shorten, decline or re-spell these names."),
    ("        const base = rstripSlash(cfg.endpoint || 'https://naistera.org');",
     "        const base = naisteraBase(cfg.endpoint);"),
    ("        return fetch(url, opts).then(function(r) {\n          done();\n          return r;\n        }, function(e) {\n          done();\n          if (e && e.name === 'AbortError') {\n            if (sig && sig.aborted) throw stopErr();\n            throw new Error('timeout ' + ms + 'ms @ ' + url);\n          }\n          throw e;\n        });",
     "        const t0 = Date.now();\n"
     "        return fetch(url, opts).then(function(r) {\n          done();\n          return r;\n        }, function(e) {\n          done();\n          if (e && e.name === 'AbortError') {\n            if (sig && sig.aborted) throw stopErr();\n            throw new Error('timeout ' + ms + 'ms @ ' + url);\n          }\n"
     "          let kb = 0;\n"
     "          try {\n            const b = opts.body;\n            kb = b ? Math.round((b.byteLength || b.size || String(b).length) / 1024) : 0;\n          } catch (x) {}\n"
     "          const e2 = new Error(((e && e.message) || 'Failed to fetch') + ' · тело ' + kb + ' КБ, оборвалось через ' + Math.round((Date.now() - t0) / 1000) + ' с');\n"
     "          if (e && e.name) e2.name = e.name;\n"
     "          throw e2;\n        });"),
    ("          if (cfg.useCharRef) {\n            const duC = imgC || (jobs[0] ? ('data:image/jpeg;base64,' + jobs[0]) : null);",
     "          if (!cfg.useCharRef) S._refLost.push('аватар персонажа — выключен в паспортах');\n"
     "          if (!cfg.useUserRef) S._refLost.push('аватар юзера — выключен в паспортах');\n"
     "          if (cfg.useCharRef) {\n            const duC = imgC || (jobs[0] ? ('data:image/jpeg;base64,' + jobs[0]) : null);"),
    ("        const cc = S._refsCache;\n        if (cc && cc.chatId === cid && cc.rev === rev && (Date.now() - cc.at) < 60000) {",
     "        const ck = (cfg && cfg.useCharRef ? 1 : 0) + '|' + (cfg && cfg.useUserRef ? 1 : 0);\n"
     "        const cc = S._refsCache;\n"
     "        if (cc && cc.chatId === cid && cc.rev === rev && cc.ck === ck && (Date.now() - cc.at) < 60000) {"),
    ("        S._refsCache = {\n          at: Date.now(),\n          chatId: cid,\n          rev: rev,",
     "        S._refsCache = {\n          at: Date.now(),\n          chatId: cid,\n          rev: rev,\n          ck: ck,"),
    ("        if (cc && cc.chatId === cid && cc.rev === rev && cc.ck === ck && (Date.now() - cc.at) < 60000) {\n          S._textRefs = cc.textRefs;\n          if (cc.names) S._names = cc.names;\n          return cc.data;\n        }",
     "        if (cc && cc.chatId === cid && cc.rev === rev && cc.ck === ck && (Date.now() - cc.at) < 60000) {\n          S._textRefs = cc.textRefs;\n          if (cc.names) S._names = cc.names;\n          for (const _l of (cc.lost || [])) S._refLost.push(_l);\n          return cc.data;\n        }"),
    ("          ck: ck,\n          data: data,", "          ck: ck,\n          data: data,\n          lost: (S._refLost || []).slice(),"),
    ("          let t = S._textRefs || [];\n          if (!t.length) {\n",
     "          let t = [];\n          if (!t.length) {\n"),
    ("        if (lost.length && !S._refToasted) {\n"
     "          S._refToasted = 1;\n"
     "          try {\n"
     "            tavo.utils.toast('IIG рефы: ' + lost.join('; '));\n"
     "          } catch (e) {}\n"
     "        }\n", ""),

    ("        let rev = 0;\n        try {", "        S._refLost = [];\n        let rev = 0;\n        try {"),
    ("            if (!s || s.enabled === false) continue;",
     "            if (!s) continue;\n"
     "            if (s.enabled === false) {\n"
     "              const _nm = String(s.note || '').trim() || String(s.type || 'слот');\n"
     "              S._refLost.push('реф «' + _nm.slice(0, 24) + '» — выключен');\n"
     "              continue;\n"
     "            }"),
    ("        S._textRefs = ptxt;\n",
     "        S._textRefs = ptxt;\n"
     "        for (const _l of lost) S._refLost.push(_l);\n"),
    ("            const castNo = !!(cast && !cast[r.who]);\n            if (castNo && !named) continue;",
     "            const castNo = !!(cast && !cast[r.who]);\n"
     "            if (castNo && !named) {\n"
     "              try {\n"
     "                S._refLost.push('аватар ' + (r.who === 'char' ? 'персонажа' : 'юзера') + ' — модель сказала, что его нет в кадре');\n"
     "              } catch (e) {}\n"
     "              continue;\n"
     "            }"),

    ("        if (out.length > 4) lost.push('фото-рефов ' + out.length + ' — отправлены первые 4, лишние слоты выключи галочкой');\n", ""),
    ("        return out.slice(0, 4);\n      }", "        return out;\n      }"),
    ("            for (const rf of refs.slice(0, 4)) {", "            for (const rf of refs) {"),
    ("        const usedRefs = (refs.length > 0 && naisteraRefsOk(model)) ? refs.slice(0, 4) : [];",
     "        const usedRefs = (refs.length > 0 && naisteraRefsOk(model)) ? refs : [];\n"
     "        if (refs.length && !usedRefs.length) {\n"
     "          try {\n"
     "            S._refLost = (S._refLost || []).concat(['фото (' + refs.length + ') — модель ' + model + ' их не принимает, внешность ушла тегами']);\n"
     "          } catch (e) {}\n"
     "        }"),

    ("        const st = await _readPwPrompt(cfg);\n"
     "        return BASE_PW + (st ? ('\\n\\nSTYLE AND RENDERING RULES (follow them; the style prefix, style suffix and negative blocks are attached by the extension - do not write them yourself):\\n' + st) : '');",
     "        const st = await _readPwPrompt(cfg);\n"
     "        if (!st) return BASE_PW;\n"
     "        if (await pwOwn(cfg)) {\n"
     "          return BASE_PW + '\\n\\nSTYLE AND RENDERING RULES - THIS GUIDE IS AUTHORITATIVE. Follow it exactly as written: its structure, order, wording, tag format and length win over every default above. If it prescribes fixed blocks - style prefix, style suffix, quality tags, artist weights, negative list, reference lock - WRITE THEM YOURSELF, verbatim and in the place the guide puts them. The extension adds nothing of its own:\\n' + st;\n"
     "        }\n"
     "        return BASE_PW + '\\n\\nSTYLE AND RENDERING RULES (follow them; the style prefix, style suffix and negative blocks are attached by the extension - do not write them yourself):\\n' + st;"),
    ("        const _apB = await appearanceBlock(_nm);\n        const ask = 'IMAGE PROMPT GUIDE:",
     "        const _apB = await appearanceBlock(_nm);\n        const own = await pwOwn(cfg);\n        const ask = 'IMAGE PROMPT GUIDE:"),
    ("Do NOT copy the verbatim blocks from the guide (style prefix, style suffix, negative, reference lock) - the extension attaches them automatically in the right place after your reply; write ONLY the scene itself and never stop mid-sentence. Reply in EXACTLY this format:",
     "' + (own ? 'Follow the guide EXACTLY as written and write every block it prescribes yourself - verbatim, in the order and place the guide puts them; the extension adds nothing after your reply. ' : 'Do NOT copy the verbatim blocks from the guide (style prefix, style suffix, negative, reference lock) - the extension attaches them automatically in the right place after your reply. ') + 'Write ONLY the scene itself and never stop mid-sentence. Reply in EXACTLY this format:"),
    ("        try {\n          txt = enforceStyleTails(txt, await _readPwPrompt(cfg));\n        } catch (e) {}",
     "        /* Своей методичке хвосты не клеим: она уже сказала модели, что и где\n"
     "           писать, а повторная склейка давала дубли блоков (v10, «промпт-суп»). */\n"
     "        if (!own) {\n"
     "          try {\n"
     "            txt = enforceStyleTails(txt, await _readPwPrompt(cfg));\n"
     "          } catch (e) {}\n"
     "        }"),
    ("        if (!c) c = window.IIG_CFG;",
     "        if (!c && typeof window !== 'undefined' && window.IIG_CFG) c = window.IIG_CFG;\n"
     "        if (c && (typeof c !== 'object' || Array.isArray(c))) throw new Error(SEC_CFG_BAD);"),
    ("        const out = Object.assign({}, DEFAULTS, c || {});\n"
     "        const mig = parseInt(out.pwMaxTokens, 10);\n"
     "        if (mig === 450 || mig === 1000) out.pwMaxTokens = 3000;\n",
     "        const out = Object.assign({}, DEFAULTS, c || {});\n"
     "        const tainted = normCfg(out);\n"
     "        const mig = parseInt(out.pwMaxTokens, 10);\n"
     "        if (mig === 450 || mig === 1000) out.pwMaxTokens = 3000;\n"
     "        if (tainted && c && !S._cfgHealed) {\n"
     "          S._cfgHealed = 1;\n"
     "          try {\n"
     "            await healCfgKeys(out);\n"
     "          } catch (e) {}\n"
     "          try {\n"
     "            await cfgWriteSafe(out);\n"
     "          } catch (e) {}\n"
     "          try {\n"
     "            await tavo.set('iig_cfg_tamper', { at: Date.now(), fields: cfgTaintFields(c) }, 'global');\n"
     "          } catch (e) {}\n"
     "          actNote('конфиг приехал битым (строки вместо булевых) — исправила и записала обратно');\n"
     "        }\n"),
    ("        const out = Object.assign({}, DEFAULTS, c || {});\n"
     "        const tainted = normCfg(out);\n",
     "        const out = Object.assign({}, DEFAULTS, c || {});\n"
     "        if (c && c.autoMode == null && c.autoOn != null) out.autoMode = c.autoOn ? 'all' : 'off';\n"
     "        const tainted = normCfg(out);\n"),
    ("        const out = Object.assign({}, DEFAULTS, c || {});\n"
     "        if (c && c.autoMode == null && c.autoOn != null) out.autoMode = c.autoOn ? 'all' : 'off';\n",
     "        if (!c) {\n"
     "          let cana = 'c' + Date.now() + Math.random().toString(36).slice(2, 6);\n"
     "          let canaOk = false;\n"
     "          try {\n"
     "            await tavo.set('iig_cfg_canary', cana, 'global');\n"
     "            canaOk = ((await tavo.get('iig_cfg_canary', 'global')) === cana);\n"
     "          } catch (e) {\n"
     "            canaOk = false;\n"
     "          }\n"
     "          if (!canaOk) throw new Error('настройки не прочитались (хранилище ещё не готово) — тапни ↻');\n"
     "        }\n"
     "        const out = Object.assign({}, DEFAULTS, c || {});\n"
     "        if (c && c.autoMode == null && c.autoOn != null) out.autoMode = c.autoOn ? 'all' : 'off';\n"),
    ("        for (const m of msgs) {\n          if (!m || !m.content) continue;",
     "        for (const m of msgs) {\n          if (!m || !m.content || m.hidden) continue;"),
    ("        const now = Date.now();\n"
     "        const rc = S._refsKV;\n"
     "        if (rc && (now - rc.at) < 45000) return rc.v;\n"
     "        try {\n"
     "          const v = await tavo.get('iig_refs', 'global');\n"
     "          if (Array.isArray(v)) {\n"
     "            S._refsKV = {\n"
     "              at: now,\n"
     "              v: v\n"
     "            };\n"
     "            return v;\n"
     "          }\n"
     "          return rc ? rc.v : [];\n"
     "        } catch (e) {\n"
     "          return rc ? rc.v : [];\n"
     "        }\n"
     "      }",
     "        const now = Date.now();\n"
     "        let rev = 0;\n"
     "        try {\n"
     "          rev = (await tavo.get('iig_refs_rev', 'global')) || 0;\n"
     "        } catch (e) {}\n"
     "        const rc = S._refsKV;\n"
     "        if (rc && rc.rev === rev && (now - rc.at) < 45000) return rc.v;\n"
     "        const tries = rev ? 3 : 1;\n"
     "        for (let a = 0; a < tries; a++) {\n"
     "          try {\n"
     "            const v = await tavo.get('iig_refs', 'global');\n"
     "            if (Array.isArray(v)) {\n"
     "              /* Порча 15.08: enabled приезжал строкой 'True'/'False' —\n"
     "                 строка 'False' truthy, и выключенный слот ехал в генерацию. */\n"
     "              for (const s0 of v) {\n"
     "                if (s0 && typeof s0.enabled === 'string') s0.enabled = !/^\\s*false\\s*$/i.test(s0.enabled);\n"
     "              }\n"
     "              S._refsKV = { at: now, rev: rev, v: v };\n"
     "              return v;\n"
     "            }\n"
     "          } catch (e) {}\n"
     "          if (a < tries - 1) await new Promise(function (r) { setTimeout(r, 600); });\n"
     "        }\n"
     "        try {\n"
     "          if (rev && (!rc || !(rc.v || []).length)) S._refLost.push('слоты рефов не прочитались из хранилища — тапни ↻');\n"
     "        } catch (e) {}\n"
     "        return rc ? rc.v : [];\n"
     "      }"),

    ("if (resp.status === 400 && bb.reasoning_effort && /reasoning/i.test(errText)) {",
     "if (resp.status === 400 && bb.reasoning_effort) {"),
    ("        throw new Error('Модель вернула ТЕКСТ вместо картинки (не та модель / отказ?): ' + String(content).replace(/\\s+/g, ' ').slice(0, 200));",
     "        const eTxt = new Error('Модель вернула ТЕКСТ вместо картинки (не та модель / отказ?): ' + String(content).replace(/\\s+/g, ' ').slice(0, 200));\n"
     "        eTxt.iigTextResp = 1;\n"
     "        throw eTxt;"),
    ("          if (txt) throw new Error('Модель вернула ТЕКСТ вместо картинки (не та модель?): ' + txt.slice(0, 180));",
     "          if (txt) {\n"
     "            const eTxt2 = new Error('Модель вернула ТЕКСТ вместо картинки (не та модель?): ' + txt.slice(0, 180));\n"
     "            eTxt2.iigTextResp = 1;\n"
     "            throw eTxt2;\n"
     "          }"),
    ("        if (m.indexOf('abort') >= 0) return false;",
     "        if (m.indexOf('abort') >= 0) return false;\n"
     "        if (e && e.iigTextResp) return true;"),
    ("            last = e;",
     "            last = e;\n"
     "            if (e && e.iigTextResp && a >= 1) throw e;"),

    ("        let raw = await pwGenerate(ask, cfg);",
     "        let raw;\n"
     "        try {\n"
     "          raw = await pwGenerate(ask, cfg);\n"
     "          S._pwSlimOk = cfg._iigSlim || 0;\n"
     "        } catch (e400) {\n"
     "          if (!(e400 && (e400.status === 400 || e400.iigPwTimeout))) throw e400;\n"
     "          const lvl = cfg._iigSlim || 0;\n"
     "          if (lvl >= 2) {\n"
     "            e400.message = 'провайдер отверг даже урезанный промпт-запрос (похоже на фильтр содержимого у роутера — смени модель промпта или провайдера) · ' + e400.message;\n"
     "            throw e400;\n"
     "          }\n"
     "          return composeAuto(postText, Object.assign({}, cfg, { _ctx: '', _iigSlim: lvl + 1 }));\n"
     "        }"),
    ("+ namesBlock(_nm) + _apB +",
     "+ ((cfg._iigSlim || 0) >= 2 ? '' : namesBlock(_nm) + _apB) +"),
    ("            throw new Error('модель чата не ответила: ' + ((e && e.message) || e));",
     "            const eW = new Error('модель чата не ответила: ' + ((e && e.message) || e));\n"
     "            if (/\\b400\\b/.test(String((e && e.message) || ''))) eW.status = 400;\n"
     "            if (/could not complete the request|internal error|generation failed/i.test(String((e && e.message) || ''))) eW.iigPwTimeout = 1;\n"
     "            throw eW;"),

    ("        return m.indexOf('timeout') >= 0 || m.indexOf('network') >= 0 || m.indexOf('failed to fetch') >= 0;",
     "        return m.indexOf('timeout') >= 0 || m.indexOf('network') >= 0 || m.indexOf('failed to fetch') >= 0 || m.indexOf('load failed') >= 0;"),

    ("        for (const _l of lost) S._refLost.push(_l);\n        return out;",
     "        for (const _l of lost) S._refLost.push(_l);\n"
     "        for (let wi = 0; wi < out.length; wi++) {\n"
     "          if (!out[wi] || !out[wi].dataUrl) continue;\n"
     "          try {\n"
     "            const wd = await _refWire(out[wi].dataUrl, cfg && cfg.refMaxPx, out[wi].label);\n"
     "            if (wd) out[wi] = Object.assign({}, out[wi], { dataUrl: wd });\n"
     "          } catch (eW) {}\n"
     "        }\n"
     "        return out;"),

    ("          let resp = await sendPw();",
     "          let resp = null;\n"
     "          let tpw = 0;\n"
     "          for (;;) {\n"
     "            try {\n"
     "              resp = await sendPw();\n"
     "            } catch (ePw) {\n"
     "              if (ePw && ePw.iigStop) throw ePw;\n"
     "              const mPw = String((ePw && ePw.message) || '').toLowerCase();\n"
     "              /* Таймаут НЕ повторяем тем же запросом: живой след 30.08 —\n"
     "                 фильтр роутера браузерный запрос не отшивает, а ВЕШАЕТ\n"
     "                 (с сервера тот же аск даёт мгновенный 400). Три полных\n"
     "                 повтора по 45с только тянули время. Помечаем — лестница\n"
     "                 деградации сразу пробует урезанный аск. */\n"
     "              if (mPw.indexOf('timeout') >= 0) {\n"
     "                ePw.iigPwTimeout = 1;\n"
     "                throw ePw;\n"
     "              }\n"
     "              const rPw = mPw.indexOf('failed to fetch') >= 0 || mPw.indexOf('load failed') >= 0 || mPw.indexOf('network') >= 0;\n"
     "              if (!rPw || tpw >= 2) throw ePw;\n"
     "              tpw++;\n"
     "              await new Promise(function(rW) { setTimeout(rW, 1200 * tpw); });\n"
     "              continue;\n"
     "            }\n"
     "            if (resp && !resp.ok && (resp.status === 429 || resp.status === 502 || resp.status === 503 || resp.status === 504) && tpw < 2) {\n"
     "              tpw++;\n"
     "              await new Promise(function(rW) { setTimeout(rW, 1500 * tpw); });\n"
     "              continue;\n"
     "            }\n"
     "            break;\n"
     "          }"),

    ("        if (m.indexOf('nano') >= 0 || m.indexOf('banana') >= 0) return 'nano-banana-2';\n"
     "        if (m.indexOf('novel') >= 0) return 'novelai';\n",
     "        if (['nano-banana-2', 'nano-banana-2-lite', 'novelai-v4.5', 'novelai-v5', 'novelai-v5-medium'].indexOf(m) >= 0) return m;\n"
     "        if (m.indexOf('nano') >= 0 || m.indexOf('banana') >= 0) return m.indexOf('lite') >= 0 ? 'nano-banana-2-lite' : 'nano-banana-2';\n"
     "        if (m.indexOf('novel') >= 0) {\n"
     "          if (m.indexOf('medium') >= 0) return 'novelai-v5-medium';\n"
     "          if (/4[.-]?5/.test(m)) return 'novelai-v4.5';\n"
     "          if (/5/.test(m)) return 'novelai-v5';\n"
     "          return 'novelai';\n"
     "        }\n"),
    ("        if (c !== 'grok' && c !== 'nano-banana-2') return false;\n",
     "        if (c !== 'grok' && c.indexOf('nano-banana-2') !== 0) return false;\n"),
    ("        return c === 'grok' || c === 'nano-banana-2';\n",
     "        return c === 'grok' || c.indexOf('nano-banana-2') === 0;\n"),
    ("        const naiTags = model === 'novelai';\n",
     "        const naiTags = model.indexOf('novelai') === 0;\n"),
    ("        if (rawPreset && rawPreset !== 'none' && naisteraPresetOk(model)) body.preset = rawPreset;\n",
     "        if (rawPreset && rawPreset !== 'none' && naisteraPresetOk(model)) body.preset = rawPreset;\n"
     "        const negN = naisteraNegOk(model) ? String(cfg.styleNegative || '').trim() : '';\n"
     "        if (negN) body.negative_prompt = negN;\n"),
    ("        const textPart = (tag.style ? '[Style: ' + tag.style + '] ' : '') + (tag.prompt || '') + dirHint(ar) + antiBleed(refs) + appearanceTail(refs);\n",
     "        const textPart = cfg._edit ? (tag.prompt || '') : ((tag.style ? '[Style: ' + tag.style + '] ' : '') + (tag.prompt || '') + dirHint(ar) + antiBleed(refs) + appearanceTail(refs));\n"),
    ("        if (!img && isEmptyEnvelope(r) && useRefs) {\n          useRefs = false;\n",
     "        if (!img && isEmptyEnvelope(r) && useRefs) {\n          if (cfg._edit) throw new Error(EDIT_SRC_LOST);\n          useRefs = false;\n"),
    ("        const txt = (tag.style ? '[Style: ' + tag.style + '] ' : '') + (tag.prompt || '') + dirHint(tag.aspect_ratio || cfg.aspectRatio) + antiBleed(refs) + appearanceTail(refs);\n        const prompt = 'Generate an image: ' + txt;\n",
     "        const txt = cfg._edit ? (tag.prompt || '') : ((tag.style ? '[Style: ' + tag.style + '] ' : '') + (tag.prompt || '') + dirHint(tag.aspect_ratio || cfg.aspectRatio) + antiBleed(refs) + appearanceTail(refs));\n        const prompt = cfg._edit ? txt : ('Generate an image: ' + txt);\n"),
    ("          prompt: naiTags ? ((tag.prompt || '') + naiTail) : (refsSummary(usedRefs) + stylePfx + (tag.prompt || '') + antiBleed(usedRefs) + appearanceTail([])),\n",
     "          prompt: naiTags ? ((tag.prompt || '') + naiTail) : (cfg._edit ? (refsSummaryEdit(usedRefs) + (tag.prompt || '')) : (refsSummary(usedRefs) + stylePfx + (tag.prompt || '') + antiBleed(usedRefs) + appearanceTail([]))),\n"),
    ("          if (refsRejected) {\n            if (naiTags) {\n",
     "          if (refsRejected) {\n            if (cfg._edit) throw new Error(EDIT_SRC_LOST);\n            if (naiTags) {\n"),
    ("            const gopts = {\n              context: false,\n              settings: {\n",
     "            const pwLim = S._pwWaitMs || 90000;\n            const gopts = {\n              context: false,\n              timeout: pwLim,\n              settings: {\n"),
    ("a === 0 ? tavo.generate(ask, gopts) : tavo.generate(ask)",
     "a === 0 ? tavo.generate(ask, gopts) : tavo.generate(ask, { timeout: pwLim })"),
    ("            if (/could not complete the request|internal error|generation failed/i.test(String((e && e.message) || ''))) eW.iigPwTimeout = 1;\n",
     "            if (/could not complete the request|internal error|generation failed/i.test(String((e && e.message) || ''))) eW.iigPwTimeout = 1;\n"
     "            if (/^timeout/.test(String((e && e.message) || ''))) eW.iigPwTimeout = true;\n"),
    ("          else txt = String(r);\n          try {\n            _statAdd({\n              pwCalls: 1\n            });\n          } catch (e) {}\n",
     "          else txt = String(r);\n          try {\n            _statAdd({\n              pwCalls: 1\n            });\n          } catch (e) {}\n"
     "          if (!_stripThink(txt).trim()) {\n"
     "            const eE = new Error(PW_CHAT_EMPTY);\n"
     "            eE.iigCut = true;\n"
     "            elog('модель чата', eE);\n"
     "            throw eE;\n"
     "          }\n"),

]
for old, new in PATCHES:
    hit = [n for n in seen if old in bodies[n]]
    if not hit:
        print("ПРАВКА НЕ НАШЛА МЕСТА: " + old.strip()[:70]); sys.exit(1)
    for n in hit:
        bodies[n] = bodies[n].replace(old, new)

DOM = re.compile(r'\bdocument\b|\bwindow\b|MutationObserver|IntersectionObserver|new Image\(|'
                 r'createElement|querySelector|getElementById|NodeFilter|getBoundingClientRect|localStorage')
dirty = []
for n in sorted(seen):
    for line in bodies[n].split("\n"):
        if "typeof window !== 'undefined'" in line: continue
        if DOM.search(line): dirty.append((n, line.strip()[:120]))
if dirty:
    print("В headless-ядро просочился DOM:")
    for n, l in dirty: print("   %-22s %s" % (n, l))
    sys.exit(1)

head_end = min(a for a, b in F.values())
head = src[:head_end]
import json as _json
_MVER = _json.load(io.open(str(HERE / "plugin_p2/manifest.json"), encoding="utf-8"))["version"]
head = head.replace("var VER = 'p94';", "var VER = '%s';" % _MVER)
head = head.replace("S._cfgCache = {};", "S._cfgCache = null;   /* аудит P1-5: {} убивал last-known-good и бут-ретраи */")
head = head.replace("S._refsKV = {};", "S._refsKV = null;     /* аудит P1-6: {} возвращал undefined вместо [] */")
for dead in ["S.LAZY_HYDRATE = false;\n", "S.UNLOAD_DOM = false;\n"]:
    head = head.replace(dead, "")
head = head.replace("var IMG_VAR = 'iig_img';\nvar CMD_VAR = 'iigp_cmd';\n", "")
head = head.replace("S._cmdDone = null;", "S._cmdDone = null;\nS._cmdDoneP = null;")
DEAD_STATE = [
    "_bakePend", "_bootAt", "_bootCount", "_full", "_lastMut", "_actH", "_asT",
    "_bakeFirstAt", "_bakeT", "_bq", "_cfgToasted", "_cmdQ", "_domDirty",
    "_editUndo", "_frameBusy", "_frameCss", "_fullOrder", "_io", "_kvN",
    "_kvQ", "_lastAct", "_ownDirty", "_ownMap", "_pruneAt", "_pruning",
    "_pwToasted", "_rbmAt",
]
for _f in DEAD_STATE:
    head, _n = re.subn(r'(?m)^S\.' + _f + r' = [^;\n]+;\n', '', head)
    if _n != 1:
        print("МЁРТВОЕ ПОЛЕ НЕ НАШЛОСЬ В ШАПКЕ: S.%s" % _f); sys.exit(1)
head = re.sub(r'^/\*.*?\*/\n', '''/*
 * Картинки → плагин Tavo, v0.95. Движок headless: ни document, ни window.
 * Ядро (промпт-конвейер, стили, референсы, провайдеры) взято из Pic_v53
 * ДОСЛОВНО скриптом build_p95.py по графу вызовов, показ живёт во фрагментах.
 * В текст поста не пишется ничего: якорь картинки — сам фрагмент сообщения.
 */
''', head, count=1, flags=re.S)

AV = """
/* Замена avatarToB64 из v53: там аватарка уменьшалась через <canvas>, а его
   в headless-контексте нет — из-за этого в сборке 0.25 не уехало НИ ОДНОГО
   рефа. Тянем байты сетью, уменьшаем через OffscreenCanvas, если он есть,
   и деградируем до оригинального размера, если нет. */
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
    let s = String(b64 || '').replace(/^data:[^,]*,/, '').replace(/\\s+/g, '').slice(0, 16);
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
      return JSON.stringify(atob(String(v).slice(0, 32).replace(/[^A-Za-z0-9+/]/g, '').slice(0, 28)).replace(/[^\\x20-\\x7e]/g, '.'));
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

/* Пережать фото-реф «на провод» (v1.1.36, решение юзера 30.08): сети юзеров
   рвут большие аплоады (репорт: 188КБ с двумя рефами = стабильный «Load
   failed», мелочь проходит). Пиксели по возможности не трогаем — сначала
   лесенка JPEG-качества на родном refMaxPx, размер падает только если
   совсем не влезает. Цель ~45000 символов base64 (~34КБ) на реф. Хранилище
   не трогается — жмётся только исходящий запрос. Не вышло легче — шлём как
   было (fail-open). */
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
"""

covered = []
for n in seen:
    covered.append(F[n])
def top_level_decls(text, spans_all):
    busy = sorted(spans_all)
    out = {}
    pos = 0
    gaps = []
    for a, b in busy:
        if a > pos: gaps.append((pos, a))
        pos = max(pos, b)
    if pos < len(text): gaps.append((pos, len(text)))
    for ga, gb in gaps:
        chunk = text[ga:gb]
        for m in re.finditer(r'(?:^|\n)(var|const|let)\s+([A-Za-z_$][\w$]*)\s*=', chunk):
            i = ga + m.start() + (1 if chunk[m.start()] == '\n' else 0)
            j = ga + m.end()
            d = 0; q = None; esc = False
            while j < len(text):
                c = text[j]
                if q:
                    if esc: esc = False
                    elif c == '\\': esc = True
                    elif c == q: q = None
                else:
                    if c in '"\'`': q = c
                    elif c in '([{': d += 1
                    elif c in ')]}': d -= 1
                    elif c == ';' and d <= 0: break
                j += 1
            out[m.group(2)] = text[i:j + 1]
    return out

DECLS = top_level_decls(src, list(F.values()) + [(0, min(a for a, b in F.values()))])
need = []
for name, code in DECLS.items():
    if name in ('VER', 'IMG_VAR', 'CMD_VAR', 'BASE_PW', 'DEFAULTS', 'VALID_AR', 'VALID_SZ'): continue
    if any(re.search(r'(?<![\w$.])' + re.escape(name) + r'(?![\w$])', bodies[n]) for n in seen):
        need.append((name, code))
if need:
    print("добраны константы: " + ", ".join(n for n, _ in need))

order = sorted(seen, key=lambda n: F[n][0])
parts = [head, AV, "\n"]
for _n, _code in need:
    parts.append(_code.rstrip() + "\n\n")
for n in order:
    parts.append(bodies[n].rstrip() + "\n\n")
parts.append(io.open(TAIL, encoding="utf-8").read())
out = "".join(parts)

TEXT_PATCHES = [
    ("JSON.stringify(r).slice(0, 240)", "secMask(JSON.stringify(r)).slice(0, 240)"),
    ("JSON.stringify(d).slice(0, 260)", "secMask(JSON.stringify(d)).slice(0, 260)"),
    ("raw: places.length ? '' : String(typeof raw === 'string' ? raw : JSON.stringify(raw)).slice(0, 300)",
     "raw: places.length ? '' : secMask(String(typeof raw === 'string' ? raw : JSON.stringify(raw))).slice(0, 300)"),
    ("(txt ? (' · ' + txt.slice(0, 120)) : '')", "(txt ? (' · ' + secMask(txt).slice(0, 120)) : '')"),
    ("(не та модель?): ' + txt.slice(0, 180)", "(не та модель?): ' + secMask(txt).slice(0, 180)"),
    ("JSON.stringify(result).slice(0, 240)", "secMask(JSON.stringify(result)).slice(0, 240)"),
    ("        autoOn: false,\n", "        autoOn: true,\n        autoMode: 'new',\n"),
    ("        keepImages: 15,\n", "        keepImages: 0,\n"),
    ("S._dalleRefToasted = null;\n", ""),
    ("S._refToasted = null;\n", ""),
    ('''var SEEDPACK = [["Wlop by Aceenvw",''', '''var SEEDPACK = [["Wlop by Aceenvw & Kamoi",'''),
    ("  var VER = 13;\n", "  var VER = 17;\n"),
    ('"], ["Комикс by Kamoi", "',
     '"], ["Соло кастом by Rakshakti, Ксю & Travadd", "'
     "V3JpdGUgdGhlIGZpbmFsIGltYWdlIHByb21wdCBhcyBjb21tYS1zZXBhcmF0ZWQgRGFuYm9vcnUgdGFncyBtaXhlZCB3aXRoIG5h"
     "dHVyYWwgbGFuZ3VhZ2UuIEFuYWx5emUgdGhlIENVUlJFTlQgc2NlbmUsIGNvbnRleHQsIGVtb3Rpb25zLCBhY3Rpb25zLCBjbG90"
     "aGluZyBhbmQgZW52aXJvbm1lbnQgZnJvbSB0aGUgcG9zdCBhbmQgY29udGV4dC4gQnVpbGQgdGhlIHByb21wdCBleGFjdGx5IGxp"
     "a2UgdGhpczoKCi0gQmVnaW4gdGhlIHByb21wdCB3aXRoIHF1YWxpdHkgdGFnczogbWFzdGVycGllY2UsIGJlc3QgcXVhbGl0eSwg"
     "dmVyeSBhZXN0aGV0aWMsIGFic3VyZHJlcywgaGlnaGx5IGRldGFpbGVkLCBzaGFycCBmb2N1cy4KLSBUaGVuIGRldGVybWluZSB0"
     "aGUgZXhhY3QgbnVtYmVyIG9mIHZpc2libGUgY2hhcmFjdGVycyBhbmQgcHV0IHRoZSBzdWJqZWN0IGNvdW50IHRhZzogMWdpcmws"
     "IDJnaXJscywgMWJveSwgMmJveXMsIDFib3kgMWdpcmwsIDNnaXJscyBldGMuCi0gRm9yIGVhY2ggdmlzaWJsZSBjaGFyYWN0ZXIg"
     "dXNlIGFjdHVhbCBuYW1lIGFuZCBoaWdobHkgc3BlY2lmaWMgY29tbWEtc2VwYXJhdGVkIERhbmJvb3J1IHRhZ3MgdG8gZW5zdXJl"
     "IGV4YWN0IGFwcGVhcmFuY2UgbWF0Y2g6IFtDaGFyYWN0ZXIgTmFtZV0sIGdlbmRlciwgYm9keSBidWlsZCBhbmQgcHJvcG9ydGlv"
     "bnMsIGRpc3RpbmN0aXZlIGZhY2lhbCBmZWF0dXJlcywgaGFpciBjb2xvciBhbmQgbGVuZ3RoLCBoYWlyc3R5bGUsIGV5ZSBjb2xv"
     "ciBhbmQgc2hhcGUsIGZ1bGwgZGVzY3JpcHRpb24gb2YgY3VycmVudCBjbG90aGluZyAoc3R5bGUsIG1hdGVyaWFsLCBmaXQsIHBh"
     "dHRlcm5zLCBjb25kaXRpb24pLCBwb3N0dXJlIGFuZCBzdGFuY2UsIGJvZHkgYW5nbGUgYW5kIG9yaWVudGF0aW9uLCBoZWFkIGFu"
     "Z2xlIGFuZCB0aWx0LCBleWUgZGlyZWN0aW9uIGFuZCBnYXplLCBoYW5kIHBvc2l0aW9ucyBhbmQgZ2VzdHVyZXMsIGZhY2lhbCBl"
     "eHByZXNzaW9uIGFuZCBlbW90aW9uLiBNYWxlIGNoYXJhY3RlcnMgbXVzdCBrZWVwIGNvcnJlY3QgbWFsZSBhbmF0b215IGFuZCBm"
     "bGF0IGNoZXN0cy4gRGVtaS1odW1hbnMgbXVzdCBmZWF0dXJlIGFuaW1hbCBlYXJzIGV4Y2x1c2l2ZWx5IG9uIHRoZSB0b3Agb2Yg"
     "dGhlIGhlYWQsIGxlYXZpbmcgdGhlIHNpZGVzIGNvbXBsZXRlbHkgc21vb3RoLgotIEZpbGwgZXZlcnkgZmllbGQgZXhhY3RseToK"
     "IC0gU2NlbmU6IFtmdWxsIGRlc2NyaXB0aW9uIG9mIGxvY2F0aW9uLCB0aW1lIG9mIGRheSwgd2VhdGhlciwgYXRtb3NwaGVyZSwg"
     "cHJvcHMsIHJpY2hseSBkZXRhaWxlZCBiYWNrZ3JvdW5kXQogLSBMaWdodGluZzogW2V4YWN0IGxpZ2h0aW5nIGRlc2NyaXB0aW9u"
     "LCBlLmcuIHZvbHVtZXRyaWMgZ29kIHJheXMsIHJpbSBsaWdodCwgbW9vZHkgdm9sdW1ldHJpYyBzaGFkb3dzLCBkcmFtYXRpYyBj"
     "aGlhcm9zY3Vyb10KIC0gQ29sb3IgbW9vZDogW2dyYWRpbmcgYW5kIGRvbWluYW50IGNvbG9ycyB3aXRoIG5hdHVyYWwgc2F0dXJh"
     "dGlvbl0KIC0gRm9jdXM6IFtkZXB0aCBvZiBmaWVsZCwgY2FtZXJhIGFuZ2xlLCBmb2NhbCBlbXBoYXNpcyBvbiBtYWluIHN1Ympl"
     "Y3RzXQogLSBFbW90aW9uOiBbY29yZSBmZWVsaW5nIGFuZCBhdG1vc3BoZXJlIG9mIHRoZSBlbnRpcmUgc2NlbmVdCiAtIEludGVy"
     "YWN0aW9uOiBbcHJveGltaXR5LCBvdmVybGFwLCBleWUgY29udGFjdCwgcGh5c2ljYWwgdGVuc2lvbiBvciBkb21pbmFuY2VdIHVz"
     "aW5nIHNvdXJjZSNhY3Rpb24gYW5kIHRhcmdldCNhY3Rpb24gb3IgbXV0dWFsI2FjdGlvbiB0YWdzIHdoZXJlIG5lZWRlZCBmb3Ig"
     "cHJlY2lzZSBtdWx0aS1jaGFyYWN0ZXIgaW50ZXJhY3Rpb24gd2l0aG91dCBibGVuZGluZyAoZXhhbXBsZTogc291cmNlI2h1Z2dp"
     "bmcsIHRhcmdldCNodWdnaW5nKQogLSBDb21wb3NpdGlvbjogW3J1bGUgb2YgdGhpcmRzLCBkeW5hbWljIGZyYW1pbmcsIGJhbGFu"
     "Y2VkIGNoYXJhY3RlciBwbGFjZW1lbnQgd2l0aCBjbGVhciBmb2NhbCBwb2ludHNdCi0gQWxsIGNoYXJhY3RlcnMgYXJlIGFkdWx0"
     "LCBvcmlnaW5hbCBhbmQgZmljdGlvbmFsIGNoYXJhY3RlcnMuIE5ldmVyIHVzZSBjaGlsZGxpa2UgdGFncyAoZS5nLiwgc21hbGws"
     "IHBldGl0ZSkuIERvIE5PVCBzcGVjaWZ5IGV4YWN0IGhlaWdodCAoaW4gY2VudGltZXRlcnMgb3IgbWV0ZXJzKSBvciBleGFjdCBh"
     "Z2UgaW4gbnVtYmVycywgYXMgdGhlIGltYWdlIGdlbmVyYXRvciBkb2VzIG5vdCB1bmRlcnN0YW5kIHRoZW0uCi0gRG8gTk9UIHVz"
     "ZSBhcG9zdHJvcGhlcyBvciBwb3NzZXNzaXZlIHMgKGUuZy4sIFNhdG9ydXMpIGFueXdoZXJlLgotIFNpbmNlIHRoZSBtb2RlbCBm"
     "cmVlbHkgZ2VuZXJhdGVzIGZ1bGwgTlNGVywgdXNlIGRpcmVjdCBleHBsaWNpdCB0YWdzIGFuZCBkZXRhaWxlZCBwb3NlIGRlc2Ny"
     "aXB0aW9ucyBpZiBsb3dlciBib2R5IHBhcnRzIGFyZSBuYWtlZCBvciBleHBvc2VkIHdpdGhvdXQgYW55IGNlbnNvcnNoaXAgbm90"
     "ZXMuIERlc2NyaWJlIGludGltYWN5IG9ubHkgdGhyb3VnaCBwcmVjaXNlIGZhY2lhbCBleHByZXNzaW9ucywgYm9keSBsYW5ndWFn"
     "ZSBhbmQgcG9zZXMuCi0gQ29tcG9zZSBmb3IgdGhlIEFTUEVDVCBSQVRJTyBnaXZlbiBpbiB0aGUgcmVxdWVzdC4KClNUWUxFOiBk"
     "byBub3Qgd3JpdGUgYW55IGFydGlzdCB0YWdzLCBhcnRpc3Qgd2VpZ2h0cyBvciByZW5kZXJpbmctc3R5bGUgdGFncyAocmVhbGlz"
     "dGljLCBwaG90b3JlYWxpc3RpYywgaGlnaHJlc19xdWFsaXR5IGFuZCB0aGUgbGlrZSkg4oCUIHRoZSBzdHlsZSBpcyBzdXBwbGll"
     "ZCBzZXBhcmF0ZWx5IGJ5IHRoZSBleHRlbnNpb24gZnJvbSB0aGUgTm92ZWxBSSBzZXR0aW5ncy4gV3JpdGUgb25seSB0aGUgc2Nl"
     "bmUsIHRoZSBjaGFyYWN0ZXJzLCBsaWdodGluZywgY29sb3IgbW9vZCwgZm9jdXMsIGVtb3Rpb24sIGludGVyYWN0aW9uIGFuZCBj"
     "b21wb3NpdGlvbi4="
     '"], ["Комикс кастом by darkxizon & Шино", "'
     "V3JpdGUgdGhlIGZpbmFsIGltYWdlIHByb21wdCBhcyBPTkUgU0lOR0xFIENPTlRJTlVPVVMgTElORSBvZiBjb21tYS1zZXBhcmF0"
     "ZWQgRGFuYm9vcnUgdGFncyBtaXhlZCB3aXRoIHNob3J0IG5hdHVyYWwgbGFuZ3VhZ2UsIGZvbGxvd2luZyB0aGUgc3RydWN0dXJl"
     "IGJlbG93LiBPdXRwdXQgb25seSB0aGUgcHJvbXB0OiBubyBzdG9yeSB0ZXh0LCBubyBtYXJrZXIsIG5vIGxpbmUgYnJlYWtzIGlu"
     "c2lkZSB0aGUgcHJvbXB0LCBubyBjb21tZW50cyBvciBtYXJrZG93biBiZWZvcmUgb3IgYWZ0ZXIgaXQuCgpPVVRQVVQgUlVMRVMK"
     "LSBBbGwgdGFncyBhcmUgd3JpdHRlbiBSQVcgKHNwYWNlcywgY29tbWFzLCAjIGFuZCB8IGFzLWlzKS4gTmV2ZXIgVVJMLWVuY29k"
     "ZSBhbnl0aGluZy4KLSBObyBzcXVhcmUgYnJhY2tldHMgWyBdLCBhcG9zdHJvcGhlcyAoJyksIG9yIGRvdWJsZSBxdW90ZXMgKCIp"
     "IGFueXdoZXJlIGluc2lkZSB0aGUgcHJvbXB0LiBBdm9pZCBwb3NzZXNzaXZlczogd3JpdGUgQWxleCBoYW5kLCBub3QgQWxleCdz"
     "IGhhbmQuCi0gTm8gVVJMLCBkb21haW4sIHRva2VuLCBhcnRpc3Qgb3Igc3R5bGUgcHJlc2V0IGJsb2NrIOKAlCB0aGUgZXh0ZW5z"
     "aW9uIHByZXBlbmRzIHRoZSB1c2VyJ3Mgb3duIGFydGlzdCB0YWdzIGZyb20gdGhlIE5vdmVsQUkgc2V0dGluZ3MgYXV0b21hdGlj"
     "YWxseS4KCkFTUEVDVCBSQVRJTwpDb21wb3NlIGZvciB0aGUgQVNQRUNUIFJBVElPIGdpdmVuIGluIHRoZSByZXF1ZXN0LiBDb21p"
     "YyBwYWdlcyBhcmUgdmVydGljYWw6IHRoZSB1c2VyIHNob3VsZCBrZWVwIDI6MyBpbiB0aGUgcGx1Z2luIHNldHRpbmdzICg5OjE2"
     "IG9ubHkgZm9yIGV4dHJlbWUgdmVydGljYWwgcGFnZXMpLCBuZXZlciB3aWRlIHJhdGlvcy4KCkNPTlRJTlVJVFkKVXNlIHRoZSBs"
     "YXRlc3QgZXN0YWJsaXNoZWQgUlAgbW9tZW50LiBQcm9maWxlcyBkZWZpbmUgYXBwZWFyYW5jZTsgY3VycmVudCBSUCBkZWZpbmVz"
     "IGFjdGlvbnMsIGV4cHJlc3Npb25zLCBjbG90aGluZyBhbmQgaXRzIGN1cnJlbnQgc3RhdGUuIFByZXNlcnZlIGV2ZXJ5dGhpbmcg"
     "c3RpbGwgdmFsaWQgaW4gc2NlbmUgY29udGludWl0eS4gRGVzY3JpYmUgdGhlIHNjZW5lIGluIEVuZ2xpc2gsIGtlZXAgZGlhbG9n"
     "dWUgaW4gaXRzIG9yaWdpbmFsIFJ1c3NpYW4uCgpTVFJVQ1RVUkUKW1N1YmplY3QgY291bnQgKyBjb21pYyBsYXlvdXQgKyBxdWFs"
     "aXR5ICsgc2V0dGluZyArIGxpZ2h0aW5nICsgY29sb3IgKyBwYW5lbHNdIHwgW0NoYXJhY3RlciAxXSB8IFtDaGFyYWN0ZXIgMl0u"
     "IFBsYWluIHZlcnRpY2FsIGJhciB3aXRoIHNwYWNlcyBzZXBhcmF0ZXMgc2VjdGlvbnM7IGJhcnMgYXBwZWFyIG9ubHkgYmV0d2Vl"
     "biB0aGUgYmFzZSBzY2VuZSBhbmQgY2hhcmFjdGVyIGJsb2Nrcy4KCkJBU0UgU0VDVElPTgotIEZpcnN0IHRva2VuczogZXhhY3Qg"
     "dmlzaWJsZSBjb3VudCB0YWdzICgxZ2lybCwgMWJveSwgMWJveSAxZ2lybCwgMmdpcmxzLi4uKS4gQ291bnQgb25seSBhY3R1YWwg"
     "dmlzaWJsZSBjaGFyYWN0ZXJzLCBub3QgbWVtb3JpZXMsIHJlZmxlY3Rpb25zLCBzdGF0dWVzLCBwb3N0ZXJzIG9yIHNoYWRvd3Mu"
     "IFRoZW46IGNvbWljIHBhZ2UsIHBhbmVsIGNvdW50LCBxdWFsaXR5IHRhZ3MgKG1hc3RlcnBpZWNlLCBiZXN0IHF1YWxpdHksIHZl"
     "cnkgYWVzdGhldGljLCBhYnN1cmRyZXMsIGhpZ2hseSBkZXRhaWxlZCwgc2hhcnAgZm9jdXMpLgotIFRoZW4gYSBicmllZiBmYWN0"
     "dWFsIHNldHRpbmcgKHJvb20sIHN0cmVldCwgd2VhdGhlciwgcHJvcHMpIGFuZCB0aGUgcGFnZSBsYXlvdXQ6Ci0gT05FIGRvbWlu"
     "YW50IG1haW4gZnJhbWUgKH50d28gdGhpcmRzIG9mIHBhZ2UpICsgMS0zIGNvbXBhY3QgZm9jdXMgZnJhbWUgaW5zZXRzIG9yIHNt"
     "YWxsIGFkamFjZW50IHBhbmVscywgbmV2ZXIgYW4gZXF1YWwgZ3JpZC4gTmFycm93IGd1dHRlcnMsIHNjZW5lLWZpbGxlZCBvdXRl"
     "ciBlZGdlcy4gU3RhdGUgZXZlcnkgcGFuZWwgcG9zaXRpb24gY2xlYXJseSAodG9wIGxlZnQgZm9jdXMgZnJhbWUsIGJvdHRvbSBy"
     "aWdodCBmb2N1cyBmcmFtZSkuCi0gQ29udmVyc2F0aW9uIGFuZCBjbG9zZSBpbnRlcmFjdGlvbjogbWFpbiBmcmFtZSBpcyBhIHRp"
     "Z2h0IGNoZXN0LXVwIHR3by1zaG90LCBmYWNlcyBhbmQgdGhlIGludGVyYWN0aW9uIGZpbGwgdGhlIGZyYW1lLiBUaHJlZSBvciBt"
     "b3JlIHNwZWFrZXJzIGdvIGludG8gc2VwYXJhdGUgY2xvc2UtdXAgZm9jdXMgZnJhbWVzLCBuZXZlciBhIHdpZGVuZWQgbWFpbiBm"
     "cmFtZS4KLSBEZXNjcmliZSBvbmx5IHdoYXQgaXMgdmlzaWJsZSBpbnNpZGUgdGhlIGNyb3A6IHVwcGVyLWhhbGYgY3JvcCBtZWFu"
     "cyBubyBsb3dlci1ib2R5IGNsb3RoaW5nIGRlc2NyaWJlZC4gRm9yIG5vcm1hbCBjb252ZXJzYXRpb24gYXZvaWQgZnVsbCBib2R5"
     "LCBsb25nIHNob3QsIHdpZGUgc2hvdC4KLSBBIGNoaWJpIGdhZyBmaXRzIE9ORSBzbWFsbCBmb2N1cyBmcmFtZSwgb25lIG5hbWVk"
     "IGNoYXJhY3RlciwgY2hpYmkgZmFjZSBvciBidXN0IChjaGliaSwgY2hpYmkgaW5zZXQpLiBNYWluIGZyYW1lIGtlZXBzIG5vcm1h"
     "bCBwcm9wb3J0aW9uczsgbm8gZ2xvYmFsIGNoaWJpIHRhZ3MuCi0gRXZlcnkgcGFuZWwgc3RhdGVzOiB3aG8gYXBwZWFycywgbGVm"
     "dCBvciByaWdodCBwb3NpdGlvbiwgZXhwcmVzc2lvbiwgZ2F6ZSB0YXJnZXQsIGVzdGFibGlzaGVkIGFjdGlvbi4gUGh5c2ljYWwg"
     "Y29udGFjdCBiaW5kcyB0byBuYW1lZCBwYXJ0aWNpcGFudHMgYW5kIGJvZHkgcGFydHM7IG1hdGNoaW5nIGRldGFpbCBwYW5lbHMg"
     "cHJlc2VydmUgdGhlIHNhbWUgY29udGFjdCBhbmQgY2xvdGhpbmcgc3RhdGUuCgpHQVpFIFJVTEUKTm8gdmlld2VyLCBjYW1lcmEs"
     "IHBob3RvZ3JhcGhlciBvciBhdWRpZW5jZSBleGlzdHMgZm9yIHRoZSBjaGFyYWN0ZXJzLiBFeWVzIGdvIG9ubHkgdG8gYW4gaW4t"
     "c2NlbmUgcGVyc29uLCBvYmplY3Qgb3IgZXZlbnQg4oCUIG5ldmVyIGxvb2tpbmcgYXQgdmlld2VyLCBpbnRvIGNhbWVyYSwgcG9z"
     "aW5nLCBvciBicmVha2luZyB0aGUgZm91cnRoIHdhbGwgdW5sZXNzIHRoZSBSUCBleHBsaWNpdGx5IGVzdGFibGlzaGVzIGl0LiBF"
     "dmVuIGZyb250YWwgZmFjZXMgZ2V0IGEgc2NlbmUtaW50ZXJuYWwgZ2F6ZSB0YXJnZXQuCgpDSEFSQUNURVIgQkxPQ0tTCi0gT25l"
     "IGJsb2NrIHBlciBkaXN0aW5jdCB2aXNpYmxlIGNoYXJhY3RlciwgYWxsIHJlcGVhdCBhcHBlYXJhbmNlcyBvZiB0aGF0IGNoYXJh"
     "Y3RlciBpbmNsdWRlZC4gT3JkZXIgYnkgZmlyc3QgYXBwZWFyYW5jZSBpbiByZWFkaW5nIG9yZGVyLgotIEVhY2ggYmxvY2sgc3Rh"
     "cnRzIHdpdGggYSBnZW5kZXIgdGFnIChnaXJsL2JveSwgbm8gbnVtYmVycykgYW5kIHNwYXRpYWwgYW5jaG9yIChsZWZ0IHNpZGUs"
     "IHJpZ2h0IHNpZGUsIG1haW4gZnJhbWUsIHRvcCBmb2N1cyBmcmFtZSksIHRoZW46IGlkZW50aXR5LCBGVUxMIGFwcGVhcmFuY2Ug"
     "KGhhaXIgY29sb3IgYW5kIGxlbmd0aCwgaGFpcnN0eWxlLCBleWUgY29sb3IsIGV4cHJlc3Npb24sIGJvZHkgdHlwZSwgc2tpbiB0"
     "b25lKSwgQ1VSUkVOVCBjbG90aGluZyB3aXRoIGNvbG9ycywgcGFuZWwtc3BlY2lmaWMgcGxhY2VtZW50IGFuZCBhY3Rpb24uIE5l"
     "dmVyIGN1dCB0aGUgYXBwZWFyYW5jZSBkZXNjcmlwdGlvbi4KLSBSZXBlYXQgY29tcGFjdCBpZGVudGl0eSBpbmZvIG9uIEVWRVJZ"
     "IG5ldyBwYWdlOyBzYW1lIG5hbWUgYW5kIHN0YWJsZSBhdHRyaWJ1dGVzIGFjcm9zcyBub3JtYWwgYW5kIGNoaWJpIGFwcGVhcmFu"
     "Y2VzOyBuZXZlciBib3Jyb3cgYW5vdGhlciBjaGFyYWN0ZXIncyBwYWxldHRlLCBoYWlyc3R5bGUgb3IgY2xvdGhpbmcgbW90aWZz"
     "LgotIEZhbmRvbSBjaGFyYWN0ZXI6IENoYXJhY3RlciBOYW1lIChzZXJpZXMpIGFzIHRoZSBmaXJzdCB0YWcsIHRoZW4gZnVsbCBh"
     "cHBlYXJhbmNlIGFuZCBjdXJyZW50IGNsb3RoaW5nIOKAlCBuZXZlciByZWx5IG9uIHRoZSB0YWcgYWxvbmUuIFVua25vd24gdGFn"
     "IHNwZWxsaW5nOiB1c2UgZnVsbCBjYW5vbmljYWwgbmFtZSBhbmQgdGl0bGUgaW4gY2xlYXIgRW5nbGlzaC4gT0M6IHRoZSBuYW1l"
     "IGlzIG9ubHkgYSBsYWJlbCwgZGVzY3JpYmUgZXZlcnl0aGluZyBleHBsaWNpdGx5LCBuZXZlciBhc3NpZ24gYSBmYW5kb20gdGFn"
     "LgotIE5ldmVyIG1lcmdlIGRpZmZlcmVudCBwZW9wbGUgaW50byBvbmUgYmxvY2s7IG5ldmVyIGltcG9ydCBhIHBhcnRuZXIncyBh"
     "cHBlYXJhbmNlIG9yIGNsb3RoaW5nIGludG8gYW5vdGhlciBibG9jay4KLSBQaHlzaWNhbCBpbnRlcmFjdGlvbnM6IHNvdXJjZSMs"
     "IHRhcmdldCMsIG11dHVhbCMgcHJlZml4ZXMgaW5zaWRlIHRoZSBvd25pbmcgYmxvY2tzIChtdXR1YWwja2lzc2luZykuICMgc3Rh"
     "eXMgcmF3LgoKRElBTE9HVUUKLSBNYXggMyB2ZXJiYXRpbSBSdXNzaWFuIGxpbmVzIGZyb20gdGhlIGN1cnJlbnQgbW9tZW50LCAx"
     "IGJ1YmJsZSBwZXIgc3BlYWtlciwgbWF4IDggd29yZHMgcGVyIGxpbmUsIHByb2Zhbml0eSBwcmVzZXJ2ZWQsIG5ldmVyIGludmVu"
     "dGVkIG9yIHBhcmFwaHJhc2VkLiBTaWxlbnQgcGFuZWwgPSBubyB0ZXh0LgotIEJhc2UgcGFuZWwgdGV4dDogTkFNRSBzcGVlY2gg"
     "YnViYmxlIHNheWluZyDCq9GA0LXQv9C70LjQutCwwrssIHRhaWwgcG9pbnRpbmcgdG8gTkFNRS4gQnViYmxlcyBuZXZlciBjb3Zl"
     "ciBmYWNlcyBvciBpZGVudGlmeWluZyBmZWF0dXJlcy4gVGhvdWdodHMgb25seSBmb3IgZXN0YWJsaXNoZWQgaW50ZXJuYWwgc3Bl"
     "ZWNoLCBpbiBhIHRob3VnaHQgYnViYmxlLgotIEVuZCBvZiB0aGF0IHNwZWFrZXIncyBPV04gYmxvY2s6IHRleHQ6IHNhbWUgbGlu"
     "ZSwgbm8gcXVvdGF0aW9uIG1hcmtzLiBOb3RoaW5nIGFmdGVyIGl0IGluIHRoZSBibG9jay4gU2lsZW50IGNoYXJhY3RlcnMgaGF2"
     "ZSBubyB0ZXh0IGVudHJ5LiBObyBnbG9iYWwgdHJhbnNjcmlwdGlvbiwgbm8gZHVwbGljYXRlIGJ1YmJsZXMuCgpOU0ZXCi0gT25s"
     "eSB3aGVuIHRoZSBSUCBtb21lbnQgZXhwbGljaXRseSBjb250YWlucyBzZXh1YWwgYWN0aXZpdHkg4oCUIG5ldmVyIGluZmVycmVk"
     "IGZyb20gcm9tYW5jZSwgbnVkaXR5IG9yIGNsb3NlbmVzcy4gUHJlc2VydmUgdGhlIGVzdGFibGlzaGVkIGV4cGxpY2l0bmVzcyBl"
     "eGFjdGx5OiBubyBzYW5pdGl6aW5nLCBubyBlc2NhbGF0aW5nLiBBZGQgdGFnczogTlNGVywgZXhwbGljaXQsIHVuY2Vuc29yZWQu"
     "Ci0gRGlyZWN0IGNsaW5pY2FsIERhbmJvb3J1IHRlcm1zIG9ubHksIG5vIG1ldGFwaG9ycyBvciBldXBoZW1pc21zLiBBY3QgdGVy"
     "bXM6IG1pc3Npb25hcnksIGRvZ2d5c3R5bGUsIGNvd2dpcmwgcG9zaXRpb24sIG9yYWwsIGZlbGxhdGlvLCBjdW5uaWxpbmd1cywg"
     "YW5hbCwgdmFnaW5hbCwgZmluZ2VyaW5nLCBoYW5kam9iLCBwZW5ldHJhdGlvbi4gQW5hdG9teSBhbmQgZmx1aWRzIHdoZW4gZXN0"
     "YWJsaXNoZWQgYW5kIHZpc2libGU6IGVyZWN0IHBlbmlzLCBjdW0sIHByZWN1bSwgY292ZXJlZCBpbiBjdW0sIHN3ZWF0aW5nLCBo"
     "ZWF2eSBicmVhdGhpbmcsIGZsdXNoZWQgZmFjZSwgc2FsaXZhIHRyYWlsLgotIFByZWNpc2UgY29udGFjdCB3aXRoIG5hbWVkIHBh"
     "cnRpY2lwYW50czogcGVuaXMgaW4gdmFnaW5hLCBwZW5pcyBpbiBtb3V0aCwgaGFuZCBvbiBwZW5pcyDigJQgb25seSBjb250YWN0"
     "IGVzdGFibGlzaGVkIGluIHRoZSBSUC4gQ2xvdGhpbmcgc3RhdGUsIG1lY2hhbmljYWwgYW5kIGV4YWN0OiBuYWtlZCwgcGFydGlh"
     "bGx5IHVuZHJlc3NlZCwgY2xvdGhlcyBwdWxsZWQgZG93biwgc2hpcnQgbGlmdGVkLCBib3R0b21sZXNzLiBBbGwgb2YgdGhpcyBs"
     "aXZlcyBpbiB0aGUgbmFtZWQgbWFpbiBmcmFtZSBvciBmb2N1cyBmcmFtZSBkZXNjcmlwdGlvbnMuCi0gVG9vLXNtYWxsIGNvbnRh"
     "Y3QgcG9pbnQ6IGRlZGljYXRlZCBjbG9zZS11cCBmb2N1cyBmcmFtZS4gSGlkZGVuIGludGVybmFsIHBlbmV0cmF0aW9uOiB0aGUg"
     "cGFnZSBNVVNUIGFkZCBhIGxvY2FsaXplZCB4LXJheSBmb2N1cyBmcmFtZSBib3VuZCB0byB0aGUgbmFtZWQgcGFydGljaXBhbnRz"
     "IGFuZCB0aGUgZXhhY3QgZXN0YWJsaXNoZWQgcGVuZXRyYXRpb24g4oCUIG5ldmVyIHRvIGludmVudCBuZXcgYWN0aXZpdHksIG5l"
     "dmVyIGZvciBub24tcGVuZXRyYXRpb24sIG5ldmVyIHBhZ2Utd2lkZS4KLSBLZWVwIGFuYXRvbXksIGZsdWlkcywgY2xvdGhpbmcg"
     "ZGlzcGxhY2VtZW50IGFuZCBjb250YWN0IGNvbnNpc3RlbnQgYmV0d2VlbiBtYWluIGZyYW1lIGFuZCBjbG9zZS11cC4gRXhwbGlj"
     "aXQgc2NlbmVzIGFyZSBub3QgYXV0b21hdGljYWxseSBQT1Y6IGdhemUgcnVsZSBzdGF5cyBpbiBmb3JjZS4gRGlhbG9ndWUgcnVs"
     "ZXMgdW5jaGFuZ2VkLgoKTElHSFRJTkcgQU5EIENPTE9SCi0gQ29tcGFjdCB0YWdzIG9ubHksIG5vIGZsb3dlcnkgcHJvc2UsIG5v"
     "IG1ldGFwaG9ycywgbm8gYXJ0aXN0L2xpbmV3b3JrL3BhbGV0dGUgaW5zdHJ1Y3Rpb25zLgotIExJR0hUSU5HIElTIE1BTkRBVE9S"
     "WTogZXZlcnkgYmFzZSBzZWN0aW9uIGNhcnJpZXMgYSBjb25jcmV0ZSBsaWdodCBzb3VyY2UgZnJvbSB0aGUgZXN0YWJsaXNoZWQg"
     "c2NlbmUgKHNvZnQgd2luZG93IGxpZ2h0LCBtb29ubGlnaHQsIG5lb24gbGlnaHRpbmcsIGNhbmRsZWxpZ2h0LCBzdW5zZXQsIGR1"
     "c2ssIG92ZXJjYXN0IGRheWxpZ2h0LCBiYWNrbGlnaHQsIHJpbSBsaWdodCwgZHJhbWF0aWMgc2hhZG93cywgZGltIGxpZ2h0aW5n"
     "LCBpbmRvb3IgbGlnaHRpbmcuLi4pLiBUaW1lIG9yIGxvY2F0aW9uIGNoYW5nZSA9IGxpZ2h0aW5nIHRhZ3MgY2hhbmdlLgotIENP"
     "TE9SIE1PT0QgSVMgTUFOREFUT1JZOiAxLTIgcGFsZXR0ZSB0YWdzIHBlciBwYWdlIChuYXR1cmFsIGNvbG9ycywgd2FybSBjb2xv"
     "cnMsIGNvb2wgY29sb3JzLCBtdXRlZCBjb2xvcnMsIGhpZ2ggY29udHJhc3QsIGxvdyBjb250cmFzdCwgZGVzYXR1cmF0ZWQsIHBh"
     "c3RlbCBjb2xvcnMsIGdvbGRlbiB0b25lcywgY29sZCBibHVlIHRvbmVzLCByZWQgdG9uZXMuLi4pLCBtYXRjaGVkIHRvIGVtb3Rp"
     "b246IHdhcm0vZ29sZGVuIGZvciBjb21mb3J0IGFuZCBpbnRpbWFjeSwgY29sZC9kZXNhdHVyYXRlZCBmb3IgdGVuc2lvbiwgaGln"
     "aCBjb250cmFzdC9yZWQgZm9yIGRhbmdlciwgcGFzdGVsIGZvciBjb21lZHkuIE5ldmVyIGNvbnRyYWRpY3QgbGlnaHRpbmcgKG1v"
     "b25saXQgbmlnaHQgaXMgbm90IHdhcm0gY29sb3JzKS4gTGlnaHQgYW5kIGNvbG9yIHRhZ3MgbGl2ZSBpbiB0aGUgYmFzZSBzZWN0"
     "aW9uIG9ubHksIG5ldmVyIGluIGNoYXJhY3RlciBibG9ja3MuCgpGSU5BTCBDSEVDSyAoc2lsZW50KQpPbmUgc2luZ2xlIGxpbmUs"
     "IG5vIG1hcmtlcjsgcmF3ICMgYW5kIHwgd2l0aCBubyBlbmNvZGluZzsgbm8gYnJhY2tldHMsIGFwb3N0cm9waGVzIG9yIHF1b3Rl"
     "czsgYmFycyBvbmx5IGJldHdlZW4gc2VjdGlvbnM7IG9uZSBibG9jayBwZXIgcGVyc29uOyBjb3JyZWN0IG93bmVycyBmb3IgYXBw"
     "ZWFyYW5jZSBhbmQgY2xvdGhpbmc7IHRpZ2h0IGNyb3BzOyBjb25zaXN0ZW50IHBhbmVscyBhbmQgY29udGFjdDsgY2hpYmkgY29u"
     "ZmluZWQgdG8gaXRzIHBhbmVsOyBldmVyeW9uZSBnYXplcyBpbi1zY2VuZSwgbmV2ZXIgYXQgdmlld2VyOyBvbmUgbGluZSBwZXIg"
     "c3BlYWtlciwgdGV4dDogZW5kcyBvbmx5IHRoYXQgc3BlYWtlcidzIGJsb2NrOyBiYXNlIHNlY3Rpb24gaGFzIGxpZ2h0aW5nIGFu"
     "ZCBjb2xvciB0YWdzOyBOU0ZXIHJ1bGVzIG9ubHkgd2hlbiBzZXh1YWwgYWN0aXZpdHkgaXMgZXN0YWJsaXNoZWQuCgpDb3JyZWN0"
     "IGV4YW1wbGUgKHRoZSB3aG9sZSBwcm9tcHQpOiAxYm95IDFnaXJsLCBjb21pYyBwYWdlLCAzIHBhbmVscywgbWFzdGVycGllY2Us"
     "IGJlc3QgcXVhbGl0eSwgdmVyeSBhZXN0aGV0aWMsIGFic3VyZHJlcywgaGlnaGx5IGRldGFpbGVkLCBzaGFycCBmb2N1cywgY296"
     "eSBiZWRyb29tLCBldmVuaW5nLCBzb2Z0IHdpbmRvdyBsaWdodCwgd2FybSBjb2xvcnMsIGxvdyBjb250cmFzdCwgbmFycm93IGd1"
     "dHRlcnMsIHNjZW5lLWZpbGxlZCBvdXRlciBlZGdlcywgbWFpbiBmcmFtZSB0d28gdGhpcmRzIG9mIHBhZ2UsIGNoZXN0LXVwIHR3"
     "by1zaG90LCBOQU1FMSBvbiB0aGUgbGVmdCBzcGVlY2ggYnViYmxlIHNheWluZyDCq9Ci0Ysg0YHQtdGA0YzRkdC30L3Qvj/Cuywg"
     "dGFpbCBwb2ludGluZyB0byBOQU1FMSwgdG9wIGZvY3VzIGZyYW1lIGNsb3NlLXVwIG9mIE5BTUUyIGZhY2UgfCBib3ksIHJpZ2h0"
     "IHNpZGUsIE5BTUUyLCBzaG9ydCBibGFjayBoYWlyLCBtZXNzeSBoYWlyLCBncmV5IGV5ZXMsIGFubm95ZWQgZXhwcmVzc2lvbiwg"
     "c2xlbmRlciwgZmFpciBza2luLCBkYXJrIGhvb2RpZSwgaGFuZCBpbiBwb2NrZXQsIGxvb2tpbmcgYXQgTkFNRTEsIHRleHQ6INCd"
     "0LUg0L3QsNGH0LjQvdCw0LkgfCBnaXJsLCBsZWZ0IHNpZGUsIE5BTUUxLCBsb25nIHNpbHZlciBoYWlyLCBibHVudCBiYW5ncywg"
     "Ymx1ZSBleWVzLCBvcGVuIG1vdXRoLCBjdXJ2eSwgcGFsZSBza2luLCB3aGl0ZSBibG91c2UsIHNraXJ0LCBnZXN0dXJpbmcgYXQg"
     "TkFNRTIsIGxvb2tpbmcgYXQgTkFNRTI="
     '"], ["Комикс by Kamoi", "'),
    ("              if (tl) out.push({\n                textOnly: true,\n                label: tl,\n                note: s.note\n              });",
     "              if (tl) out.push({\n                textOnly: true,\n                label: tl,\n                note: s.note,\n                rtype: s.type,\n                tgt: s.target\n              });"),
    ("              out.push({\n                dataUrl: s.dataUrl,\n                label: buildRefLabel(s.type, s.note, s.target, charName, userName)\n              });",
     "              out.push({\n                dataUrl: s.dataUrl,\n                label: buildRefLabel(s.type, s.note, s.target, charName, userName),\n                note: s.note,\n                rtype: s.type,\n                tgt: s.target\n              });"),
    ("                if (tw) out.push({\n                  textOnly: true,\n                  label: tw,\n                  note: s.note\n                });",
     "                if (tw) out.push({\n                  textOnly: true,\n                  label: tw,\n                  note: s.note,\n                  rtype: s.type,\n                  tgt: s.target\n                });"),
    ("        if (type === 'background') return 'BACKGROUND reference' + n + ': take ONLY the environment/background from this image; IGNORE any people/poses in it; do NOT copy its art style or photographic look.';",
     "        if (type === 'background') return 'LOCATION where this scene takes place' + n + ': close-up fragments of the real place, as a reference for how it looks. The scene happens inside this place; the characters and the moment from the prompt are the subject of the picture.';"),
    ("        ['NANA Noir by kamoi', 'NANA Noir by Kamoi']\n",
     "        ['NANA Noir by kamoi', 'NANA Noir by Kamoi'],\n"
     "        ['Wlop by Aceenvw', 'Wlop by Aceenvw & Kamoi'],\n"
     "        ['NovelAI custom by Rakshakti, Ксю & Travadd', 'Соло кастом by Rakshakti, Ксю & Travadd'],\n"
     "        ['Соло by Rakshakti, Ксю & Travadd', 'Соло кастом by Rakshakti, Ксю & Travadd'],\n"
     "        ['Комикс by darkxizon & Шино', 'Комикс кастом by darkxizon & Шино']\n"),
    ("        promptName: ''\n      };",
     "        promptName: '',\n"
     "        naiModel: 'nai-diffusion-4-5-full',\n"
     "        naiSteps: 28,\n"
     "        naiScale: 5.5,\n"
     "        naiSampler: 'k_euler_ancestral',\n"
     "        naiUc: 0,\n"
     "        naiRefs: true,\n"
     "        naiRefMax: 2,\n"
     "        naiRefStrength: 0.6,\n"
     "        naiEditStrength: 0.6,\n"
     "        naiLarge: false,\n"
     "        naiArtists: '',\n"
     "        naiNegative: '',\n"
     "        naiQuality: true,\n"
     "        naiSeed: 0,\n"
     "        naiRescale: 0,\n"
     "        naiNoise: 'karras',\n"
     "        naiVariety: false,\n"
     "        naiSmea: false,\n"
     "        naiSmeaDyn: false\n"
     "      };"),
    ("        const low = m[2].toLowerCase();\n"
     "        return {\n"
     "          cast: {\n"
     "            char: low.indexOf('char') >= 0,\n"
     "            user: low.indexOf('user') >= 0\n"
     "          },\n"
     "          txt: s.slice(0, m.index)\n"
     "        };",
     "        const low = m[2].toLowerCase();\n"
     "        const cIn = low.indexOf('char') >= 0;\n"
     "        const uIn = low.indexOf('user') >= 0;\n"
     "        const allIn = !cIn && !uIn && /\\bnone\\b/.test(low) ? false : /\\b(both|all)\\b/.test(low);\n"
     "        if (!allIn && !cIn && !uIn && !/\\bnone\\b/.test(low)) return {\n"
     "          cast: null,\n"
     "          txt: s.slice(0, m.index)\n"
     "        };\n"
     "        return {\n"
     "          cast: {\n"
     "            char: allIn || cIn,\n"
     "            user: allIn || uIn\n"
     "          },\n"
     "          txt: s.slice(0, m.index)\n"
     "        };"),
    ("CAST: followed by which of the two protagonists are actually visible in the image - char, user, both as char, user - or none.",
     "' + (naiMode(cfg) ? 'CAST: followed by who of the two protagonists is present in THIS scene: char, user, both, or none. Decide ONLY by the scene: this post and the previous posts above make it clear who is in the scene and who they are, whatever grammatical person the text uses; a protagonist is present when the scene shows them there - acting, speaking, being looked at, touched or addressed - even if their name is never written. Whether a photo, an avatar or a passport exists for someone never affects this decision, and every protagonist in CAST must be drawn in the picture.' : 'CAST: followed by which of the two protagonists are actually visible in the image - char, user, both as char, user - or none.') + '"),
    ("          if (img) {\n"
     "            try {\n"
     "              tavo.utils.toast('IIG: провайдер не принял референсы",
     "          if (img) {\n"
     "            try {\n"
     "              S._refLost = (S._refLost || []).concat(['провайдер не принял референсы после трёх пустых ответов — картинка нарисована без них']);\n"
     "            } catch (e) {}\n"
     "            try {\n"
     "              tavo.utils.toast('IIG: провайдер не принял референсы"),
    ("        const ask = 'IMAGE PROMPT GUIDE:\\n' + guide + '\\n\\n' + ((cfg._iigSlim",
     "        const ask = (S._enOn ? 'All input below (post, appearance data, reference notes, wardrobe names) may be in any language, including Russian. Write the image prompt, the CAST line and every service line in ENGLISH ONLY; translate names of clothing, places and traits into English tags or words; never copy Cyrillic into the output; write character names in Latin letters (transliterate Cyrillic names).\\n\\n' : '') + 'IMAGE PROMPT GUIDE:\\n' + guide + '\\n\\n' + ((cfg._iigSlim"),
    ("        let b = 'CHARACTER NAMES — write them in the prompt EXACTLY as spelled here, character for character:';",
     "        let b = S._enOn ? 'CHARACTER NAMES — write them in the prompt with EXACT spelling, but in Latin letters: transliterate Cyrillic names (Лиза → Liza); never copy Cyrillic:' : 'CHARACTER NAMES — write them in the prompt EXACTLY as spelled here, character for character:';"),
    ("        b += '\\nNEVER translate, transliterate, shorten, decline or re-spell these names.",
     "        b += (S._enOn ? '\\nNEVER translate, shorten, decline or re-spell these names; the only allowed change is writing a Cyrillic name in Latin letters.' : '\\nNEVER translate, transliterate, shorten, decline or re-spell these names.') + '"),
    ("        const c = String(nm.char || '').trim(),\n          u = String(nm.user || '').trim();\n        const rep = function(t, re, to) {",
     "        const c = enName(String(nm.char || '').trim()),\n          u = enName(String(nm.user || '').trim());\n        const rep = function(t, re, to) {"),
    ("        let raw;\n        try {\n          raw = await pwGenerate(ask, cfg);\n          S._pwSlimOk = cfg._iigSlim || 0;\n",
     "        let raw;\n        let cutTwice = 0;\n        let cutTok = 0;\n        try {\n"
     "          try {\n"
     "            raw = await pwGenerate(ask, cfg);\n"
     "          } catch (eCut) {\n"
     "            if (!(eCut && eCut.iigCut)) throw eCut;\n"
     "            const userTok = parseInt(cfg.pwMaxTokens, 10);\n"
     "            if (userTok > 0) {\n"
     "              cutTok = userTok;\n"
     "              raw = '';\n"
     "              cutTwice = 1;\n"
     "            } else {\n"
     "              cutTok = Math.min(Math.max(pwTokensFor(cfg) * 2, 6000), 8000);\n"
     "              try {\n"
     "                raw = await pwGenerate(ask, Object.assign({}, cfg, { pwMaxTokens: cutTok }));\n"
     "              } catch (eCut2) {\n"
     "                if (!(eCut2 && eCut2.iigCut)) throw eCut2;\n"
     "                raw = '';\n"
     "                cutTwice = 1;\n"
     "              }\n"
     "            }\n"
     "          }\n"
     "          S._pwSlimOk = cfg._iigSlim || 0;\n"),
    ("        if (_wc(rep.txt) < 20) {\n          try {\n            const mt2 = parseInt(cfg.pwMaxTokens, 10) || 3000;\n            const raw2 = await pwGenerate(ask, Object.assign({}, cfg, {\n              pwMaxTokens: Math.min(mt2 * 2, 8000)\n            }));",
     "        if (!cutTwice && _wc(rep.txt) < pwMinWords(cfg, cfg._sideBox)) {\n          try {\n            const mt2 = pwTokensFor(cfg);\n            const raw2 = await pwGenerate(ask + '\\n\\nYour previous answer had only ' + _wc(rep.txt) + ' words in the prompt paragraph. Write the full prompt paragraph again, at least 40 words, keep the same format.', Object.assign({}, cfg, {\n              pwMaxTokens: parseInt(cfg.pwMaxTokens, 10) > 0 ? mt2 : Math.min(mt2 * 2, 8000)\n            }));"),
    ("_wc(rep2.txt) >= 20) || _wc(rep2.txt) > _wc(rep.txt)) rep = rep2;",
     "_wc(rep2.txt) >= pwMinWords(cfg, cfg._sideBox)) || _wc(rep2.txt) > _wc(rep.txt)) rep = rep2;"),
    ("        if (_wc(rep.txt) < 20) {\n          const fb = ",
     "        const wcP = _wc(rep.txt);\n        if (wcP < pwMinWords(cfg, cfg._sideBox)) {\n          const fb = "),
    ("          if (_wc(fb) < 8) throw new Error('модель промпта вернула обрывок (' + _wc(rep.txt) + ' слов), а в посте нет текста для запасного промпта — подними «токены ответа и размышления» (вкладка api) или поставь модель промпта без размышлений');\n          toast('IIG: модель промпта вернула обрывок (' + _wc(rep.txt) + ' слов) — генерация по тексту поста;",
     "          const cutMsg = cutTwice ? ('модель промпта не дописала ответ: размышления съели лимит токенов (пробовали ' + cutTok + ') — подними «токены ответа» во вкладке api или поставь модель промпта без размышлений') : '';\n          if (_wc(fb) < 8) throw new Error(cutMsg || ('модель промпта вернула обрывок (' + _wc(rep.txt) + ' слов), а в посте нет текста для запасного промпта — подними «токены ответа и размышления» (вкладка api) или поставь модель промпта без размышлений'));\n          if (cutMsg) toast('IIG: ' + cutMsg + ' · генерация по тексту поста');\n          else toast('IIG: модель промпта вернула обрывок (' + _wc(rep.txt) + ' слов) — генерация по тексту поста;"),
    ("        return {\n          after: after,\n          prompt: txt\n        };\n      }\n\nasync function genGeminiNative",
     "        const outC = {\n          after: after,\n          prompt: txt,\n          wc: wcP\n        };\n        if (cutTwice) outC.cut = { tokens: cutTok, why: 'reasoning' };\n        return outC;\n      }\n\nasync function genGeminiNative"),
    ("maxCompletionTokens: (parseInt(cfg.pwMaxTokens, 10) || 3000)", "maxCompletionTokens: pwTokensFor(cfg)"),
    ("          const mm = d.choices && d.choices[0] && d.choices[0].message;",
     "          const ch0 = d.choices && d.choices[0];\n"
     "          const mm = ch0 && ch0.message;\n"
     "          const finR = (ch0 && typeof ch0.finish_reason === 'string') ? ch0.finish_reason : '';\n"
     "          const rsnC = (mm && typeof mm.reasoning_content === 'string') ? mm.reasoning_content : '';"),
    ("              if (p && p.text) txt += p.text;\n            }\n          }\n        }\n        return _stripThink(txt);",
     "              if (p && p.text) txt += p.text;\n            }\n          }\n"
     "          const tCut = _stripThink(String(txt || '')).trim();\n"
     "          if ((!tCut && String(rsnC || '').trim()) || (finR === 'length' && _wc(tCut) < 20)) {\n"
     "            const eCut = new Error('модель промпта не дописала ответ (лимит токенов: размышления съели лимит) — подними «токены ответа и размышления» во вкладке api или поставь модель без размышлений');\n"
     "            eCut.iigCut = true;\n"
     "            throw eCut;\n"
     "          }\n"
     "        }\n        return _stripThink(txt);"),
    ("max_tokens: (parseInt(cfg.pwMaxTokens, 10) || 3000)", "max_tokens: pwTokensFor(cfg)"),
    ("maxOutputTokens: (parseInt(cfg.pwMaxTokens, 10) || 3000)", "maxOutputTokens: pwTokensFor(cfg)"),
    ("        const mt = parseInt(cfg.pwMaxTokens, 10) || 3000;", "        const mt = pwTokensFor(cfg);"),
    ("            const l = String(t[i].label || '').trim();\n            if (l) lines.push('- ' + l);",
     "            let l = String(t[i].label || '').trim();\n"
     "            if (l && t[i].ward && t[i].type !== 'background' && t[i].type !== 'npc') {\n"
     "              const ow = t[i].tgt === 'user' ? (nm.user || 'the user') : (t[i].tgt === 'char' ? (nm.char || 'the char') : '');\n"
     "              if (ow) l += ' (worn only by ' + ow + '; if that person is not in the picture, ignore this item)';\n"
     "            }\n"
     "            if (l) lines.push('- ' + l);"),
    ("                if (tl) t.push({\n                  label: tl\n                });",
     "                if (tl) t.push({\n                  label: tl,\n                  ward: !!s.ward,\n                  tgt: s.target,\n                  type: s.type\n                });"),
    ("not Kira\\u0027s hands).",
     "not Kira\\u0027s hands). Exception: when the style guide asks for speech bubbles or on-image text, keep that text in «» quotes exactly as the style guide shows."),
    ("BACKGROUND ONLY - use it for outfits, location", "BACKGROUND ONLY - use it for location"),
    ("        pwMaxTokens: 3000,\n        pwReasoning: 'off',", "        pwMaxTokens: 0,\n        pwReasoning: 'off',"),
    ("            await tv.set('iig_cfg', cfgR, 'global');\n", "            await cfgWriteSafe(cfgR);\n"),
]
TEXT_ONCE = 25
for old, new in TEXT_PATCHES[-TEXT_ONCE:]:
    if out.count(old) != 1:
        print("ПРАВКА ПО ТЕКСТУ ДОЛЖНА ВСТРЕТИТЬСЯ РОВНО ОДИН РАЗ: %s" % old.strip()[:70]); sys.exit(1)
for old, new in TEXT_PATCHES:
    if old not in out:
        print("ПРАВКА ПО ТЕКСТУ НЕ НАШЛА МЕСТА: %s" % old.strip()); sys.exit(1)
    out = out.replace(old, new)
COMIC_SEEDS = {
    "Комикс by Kamoi": (
        "FORMAT (overrides the default single-moment paragraph and its 80-130 word limit): "
        "describe the whole page panel by panel in one paragraph of 160-260 words - Panel 1 ..., "
        "Panel 2 ..., Panel 3 ... - each with its own event, pose, camera distance and size on the page.",
        "STYLE PREFIX (prepend verbatim at the start): Vertical manhwa page, one scene beat told as a "
        "storyboard of 3 to 4 unequal panels, one dominant panel about half the page, only drawn manhwa "
        "artwork, no outer frames, no captions, no readable text."),
    "Комикс без границ by Kamoi": (
        "FORMAT (overrides the default single-moment paragraph and its 80-130 word limit): "
        "describe the whole page scene by scene in one paragraph of 160-260 words - Scene 1 ..., "
        "Scene 2 ..., Scene 3 ... - each with its own event, pose, camera distance and size on the page.",
        "STYLE PREFIX (prepend verbatim at the start): Vertical borderless manhwa page, one scene beat told "
        "as 3 scenes that bleed into each other through soft gradients, mist and shared light, no panel "
        "frames or dividing lines, one dominant scene about half the page, every scene shows a character, "
        "only drawn artwork, no captions, no readable text."),
    "Комикс градиент by Kamoi": (
        "FORMAT (overrides the default single-moment paragraph and its 80-130 word limit): "
        "describe the whole page scene by scene in one paragraph of 160-260 words - Scene 1 ..., "
        "Scene 2 ..., Scene 3 ... - each with its own event, pose, camera distance and size on the page.",
        "STYLE PREFIX (prepend verbatim at the start): Vertical seamless manhwa page, one continuous painting "
        "where 3 scenes dissolve into each other through soft gradient fades, mist and shared light, no "
        "frames, borders or dividing lines, every figure whole and unbroken, one dominant scene about half "
        "the page, only drawn artwork, no captions, no readable text."),
}
import base64 as _b64
for _nm, (_fmt, _pre) in COMIC_SEEDS.items():
    _key = '["%s", "' % _nm
    _at = out.find(_key)
    if _at < 0:
        print("СИД НЕ НАЙДЕН: %s" % _nm); sys.exit(1)
    _a = _at + len(_key); _b = out.index('"', _a)
    _txt = _b64.b64decode(out[_a:_b]).decode("utf-8")
    if _txt.count("\n\nPAGE (") != 1 or "STYLE PREFIX" in _txt:
        print("СИД БЕЗ ЯКОРЯ PAGE ИЛИ УЖЕ С ПРЕФИКСОМ: %s" % _nm); sys.exit(1)
    _txt = _txt.replace("\n\nPAGE (", "\n\n" + _fmt + "\n\n" + _pre + "\n\nPAGE (", 1)
    out = out[:_a] + _b64.b64encode(_txt.encode("utf-8")).decode("ascii") + out[_b:]
if ", 60000, cfg._sig)" in out:
    print("ОСТАЛСЯ 60-СЕКУНДНЫЙ ТАЙМАУТ НА ЗАПРОСЕ ГЕНЕРАЦИИ"); sys.exit(1)
if out.count("GEN_TIMEOUT, cfg._sig") < 3:
    print("GEN_TIMEOUT не дошёл до всех трёх путей генерации"); sys.exit(1)
_LKEYW = {'return', 'typeof', 'case', 'in', 'of', 'new', 'delete', 'void', 'instanceof', 'do', 'else', 'yield', 'await', 'throw'}
def _lp_prev(js, i):
    j = i - 1
    while j >= 0 and js[j] in ' \t\r\n': j -= 1
    if j < 0: return ''
    if js[j].isalnum() or js[j] in '_$':
        k = j
        while k >= 0 and (js[k].isalnum() or js[k] in '_$'): k -= 1
        return js[k + 1:j + 1]
    return js[j]
def _lp_comments(js):
    res = []; i = 0; n = len(js)
    while i < n:
        c = js[i]
        if c == '/' and i + 1 < n and js[i + 1] == '/':
            j = js.find('\n', i); j = n if j < 0 else j
            res.append((i, j, js[i:j])); i = j; continue
        if c == '/' and i + 1 < n and js[i + 1] == '*':
            j = js.find('*/', i + 2); j = n if j < 0 else j + 2
            res.append((i, j, js[i:j])); i = j; continue
        if c in ('"', "'"):
            q = c; i += 1
            while i < n:
                if js[i] == '\\': i += 2; continue
                if js[i] == q: break
                i += 1
            i += 1; continue
        if c == '`':
            i += 1
            while i < n:
                if js[i] == '\\': i += 2; continue
                if js[i] == '`': break
                if js[i] == '$' and i + 1 < n and js[i + 1] == '{':
                    d = 1; i += 2
                    while i < n and d:
                        if js[i] == '{': d += 1
                        elif js[i] == '}': d -= 1
                        i += 1
                    continue
                i += 1
            i += 1; continue
        if c == '/':
            pv = _lp_prev(js, i)
            if pv in _LKEYW or pv == '' or (len(pv) == 1 and pv in '(,=:[!&|?{};+-*%~^<>'):
                i += 1; incls = False
                while i < n:
                    if js[i] == '\\': i += 2; continue
                    if js[i] == '[': incls = True
                    elif js[i] == ']': incls = False
                    elif js[i] == '/' and not incls: break
                    elif js[i] == '\n': break
                    i += 1
                i += 1; continue
        i += 1
    return res
def _lp_strip(js):
    cut = [(a, b) for (a, b, t) in _lp_comments(js)]
    parts = []; pos = 0
    for (a, b) in cut:
        parts.append(js[pos:a]); pos = b
    parts.append(js[pos:])
    s = ''.join(parts)
    s = re.sub(r'[ \t]+\n', '\n', s)
    s = re.sub(r'\n{3,}', '\n\n', s)
    return s
_before = len(out)
out = (HERE / "LICENSE_HEADER.txt").read_text(encoding="utf-8") + _lp_strip(out)
print("комментарии вычищены из сборки: %d КБ" % ((_before - len(out)) // 1024))

io.open(OUT, "w", encoding="utf-8").write(out)
print("перенесено функций ядра: %d" % len(seen))
print("выброшено (DOM, метки, запись в текст): %d" % len(names - seen))
print("записано: %s (%d КБ)" % (OUT, len(out.encode("utf-8")) // 1024))
