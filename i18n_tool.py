#!/usr/bin/env python3
import io, json, re, sys, os
HERE = os.path.dirname(os.path.abspath(__file__))
FILES = {
    'panel': os.path.join(HERE, 'plugin_p2', 'ui', 'panel.html'),
    'image': os.path.join(HERE, 'plugin_p2', 'ui', 'image.html'),
}
DICT = os.path.join(HERE, 'i18n', 'ru_en.json')
SKIP_FUNCS = ['clAskOutfit', 'clAskPlace', 'clGenderOf', 'clAskSummary']
SKIP_CONST_PREFIX = ['CL_EX_', 'CL_EXP_', 'WD_LB_', 'SGAL = [', 'SEEDPACK']
CYR = re.compile('[А-Яа-яЁё]')
TAG = re.compile(r'<[^>]*>')
BEFORE_REGEX = set('(,=:[!&|?{};+-*%<>~^')

def tokens(src):
    i, n = 0, len(src)
    out = []
    last = ''
    while i < n:
        c = src[i]
        if c in '\'"`':
            j = i + 1
            while j < n and src[j] != c:
                if src[j] == '\\': j += 1
                j += 1
            out.append(('str', i, j + 1))
            i = j + 1
            last = 's'
            continue
        if c == '/' and i + 1 < n and src[i + 1] in '/*':
            if src[i + 1] == '/':
                j = src.find('\n', i)
            else:
                j = src.find('*/', i) + 2
            i = j if j > 0 else n
            continue
        if c == '/' and (last in BEFORE_REGEX or last == '' or last == 'k'):
            j = i + 1
            cls = False
            while j < n:
                ch = src[j]
                if ch == '\\': j += 2; continue
                if ch == '[': cls = True
                elif ch == ']': cls = False
                elif ch == '/' and not cls: break
                elif ch == '\n': break
                j += 1
            i = j + 1
            while i < n and src[i].isalpha(): i += 1
            last = 'r'
            continue
        if not c.isspace():
            if c.isalnum() or c == '_' or c == '$' or c == ')' or c == ']' or c == '}':
                word = re.match(r'[A-Za-z0-9_$]+', src[i:])
                if word and word.group(0) in ('return', 'typeof', 'case', 'in', 'of', 'delete', 'void', 'throw'):
                    last = 'k'
                    i += len(word.group(0))
                    continue
                last = 'v'
            else:
                last = c
        i += 1
    return out

def skip_ranges(src):
    rs = []
    for fn in SKIP_FUNCS:
        a = src.find('function ' + fn + '(')
        if a < 0: continue
        b = src.find('\n  }\n', a)
        rs.append((a, b if b > 0 else a, 'all'))
    for pre in SKIP_CONST_PREFIX:
        for m in re.finditer(r'\n  (?:var|const) ' + re.escape(pre), src):
            a = m.start()
            b = src.find(';\n', a)
            rs.append((a, b if b > 0 else a, 'names' if pre.startswith('SGAL') else 'all'))
    return rs

def in_skip(rs, pos, lit):
    for a, b, kind in rs:
        if a <= pos <= b:
            return not (kind == 'names' and ' by ' not in lit)
    return False

def literals(name, wrapped=False):
    src = io.open(FILES[name], encoding='utf-8').read()
    a = src.index('<script>') + 8
    b = src.rindex('</script>')
    script = src[a:b]
    rs = skip_ranges(script)
    out = []
    for kind, s, e in tokens(script):
        lit = script[s:e]
        if lit[0] != "'" or not CYR.search(lit): continue
        if in_skip(rs, s, lit): continue
        if not wrapped and script[max(0, s - 2):s] == 'L(': continue
        out.append((a + s, a + e, lit))
    return src, out

ATTR = re.compile(r'(?:placeholder|title|alt)="([^"]*)"')

def chunks_of(text):
    out = []
    for part in TAG.split(text):
        t = part.strip()
        if CYR.search(t): out.append(t)
    for m in TAG.finditer(text):
        for a in ATTR.finditer(m.group(0)):
            v = a.group(1).strip()
            if CYR.search(v): out.append(v)
    return out

def cmd_extract():
    allc = {}
    for name in FILES:
        _, lits = literals(name, True)
        for _, _, lit in lits:
            for c in chunks_of(lit[1:-1]):
                allc.setdefault(c, []).append(name)
    have = json.load(io.open(DICT, encoding='utf-8')) if os.path.exists(DICT) else {}
    missing = [c for c in sorted(allc) if c not in have]
    print('chunks:', len(allc), 'missing:', len(missing))
    for c in missing: print(c)

def cmd_wrap():
    for name in FILES:
        src, lits = literals(name)
        parts = []
        pos = 0
        for s, e, lit in lits:
            parts.append(src[pos:s])
            parts.append('L(' + lit + ')')
            pos = e
        parts.append(src[pos:])
        io.open(FILES[name], 'w', encoding='utf-8').write(''.join(parts))
        print(name, 'wrapped', len(lits))

def cmd_check():
    have = json.load(io.open(DICT, encoding='utf-8'))
    bad = 0
    for name in FILES:
        _, lits = literals(name, True)
        for _, _, lit in lits:
            for c in chunks_of(lit[1:-1]):
                if c not in have:
                    bad += 1
                    print('нет перевода:', c)
    print('OK' if not bad else ('нет переводов: %d' % bad))
    sys.exit(1 if bad else 0)

def expr_end(sc, i):
    depth = 0
    j = i
    instr = None
    while j < len(sc):
        c = sc[j]
        if instr:
            if c == '\\':
                j += 2
                continue
            if c == instr: instr = None
        elif c in '\'"`': instr = c
        elif c in '[{(': depth += 1
        elif c in ']})':
            depth -= 1
            if depth == 0: return j
        j += 1
    return -1

def cmd_tables():
    src = io.open(FILES['panel'], encoding='utf-8').read()
    a = src.index('<script>') + 8
    b = src.rindex('</script>')
    sc = src[a:b]
    out = []
    pos = 0
    n = 0
    for m in re.finditer(r'\n  var ([A-Za-z_$][A-Za-z0-9_$]*) = ([\[{])', sc):
        i = m.end() - 1
        j = expr_end(sc, i)
        if j < 0 or "L('" not in sc[i:j + 1] or sc[j + 1] != ';': continue
        name = m.group(1)
        if 'langTable(' + name in sc: continue
        out.append(sc[pos:m.start()])
        out.append('\n  var ' + name + ' = ' + m.group(2) + ('];' if m.group(2) == '[' else '};') + '\n  langTable(' + name + ', function() {\n    return ' + sc[i:j + 1] + ';\n  });')
        pos = j + 2
        n += 1
    out.append(sc[pos:])
    io.open(FILES['panel'], 'w', encoding='utf-8').write(src[:a] + ''.join(out) + src[b:])
    print('tables', n)

def cmd_emit():
    have = json.load(io.open(DICT, encoding='utf-8'))
    for name in FILES:
        src = io.open(FILES[name], encoding='utf-8').read()
        _, lits = literals(name, True)
        need = {}
        for _, _, lit in lits:
            for c in chunks_of(lit[1:-1]):
                if c in have: need[c] = have[c]
        body = 'var EN_DICT = ' + json.dumps(need, ensure_ascii=False, separators=(',', ':')) + ';'
        m = re.search(r'var EN_DICT = \{.*?\};', src, re.S)
        if m:
            src = src[:m.start()] + body + src[m.end():]
        else:
            k = src.index('<script>') + 8
            src = src[:k] + '\n  ' + body + src[k:]
        io.open(FILES[name], 'w', encoding='utf-8').write(src)
        print(name, 'dict entries', len(need))

if __name__ == '__main__':
    {'extract': cmd_extract, 'wrap': cmd_wrap, 'check': cmd_check, 'emit': cmd_emit, 'tables': cmd_tables}[sys.argv[1]]()
