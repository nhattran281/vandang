#!/usr/bin/env python3
import glob
import json
import os
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def three_classic():
    src = open(os.path.join(ROOT, 'vendor', 'three.module.min.js'), encoding='utf-8').read()
    i = src.rfind('export{')
    j = src.rfind('}')
    body, names = src[:i], src[i + 7:j]
    pairs = []
    for item in names.split(','):
        item = item.strip()
        if not item:
            continue
        if ' as ' in item:
            local, public = item.split(' as ')
            pairs.append('%s:%s' % (public.strip(), local.strip()))
        else:
            pairs.append('%s:%s' % (item, item))
    out = 'var THREE=(function(){' + body + '\nreturn {' + ','.join(pairs) + '};})();'
    assert '</script' not in out
    return out


def gsap():
    """GSAP lõi (vendor/gsap.min.js) chèn nguyên văn, giữ dòng bản quyền /*! ... */ ở đầu (giấy phép: vendor/LICENSE-gsap.txt).
    Bản UMD gắn window.gsap; phần hoạt ảnh (src/54-anim.js) dùng biến toàn cục gsap."""
    src = open(os.path.join(ROOT, 'vendor', 'gsap.min.js'), encoding='utf-8').read()
    assert src.startswith('/*!') and 'GreenSock' in src[:400], 'thiếu dòng bản quyền GSAP'
    assert '</script' not in src
    return src


def data():
    """Gom data/*.json và data/maps/*.json thành một hằng DATA nhúng vào bản build."""
    d = {'maps': {}}
    for path in sorted(glob.glob(os.path.join(ROOT, 'data', '*.json'))):
        d[os.path.splitext(os.path.basename(path))[0]] = json.load(open(path, encoding='utf-8'))
    for path in sorted(glob.glob(os.path.join(ROOT, 'data', 'maps', '*.json'))):
        m = json.load(open(path, encoding='utf-8'))
        d['maps'][m['id']] = m
    out = json.dumps(d, ensure_ascii=False, separators=(',', ':'))
    assert '</script' not in out
    return 'const DATA = ' + out + ';'


def game():
    parts = [data()]
    for path in sorted(glob.glob(os.path.join(ROOT, 'src', '*.js'))):
        parts.append(open(path, encoding='utf-8').read())
    code = "(function(){\n'use strict';\n" + '\n'.join(parts) + '\n})();'
    assert '</script' not in code
    return code


def main():
    shell = open(os.path.join(ROOT, 'src', 'shell.html'), encoding='utf-8').read()
    html = shell.replace('/*__THREE__*/', three_classic()).replace('/*__GSAP__*/', gsap()).replace('/*__GAME__*/', game())
    outs = [os.path.join(ROOT, 'index.html')] + sys.argv[1:]
    for out in outs:
        with open(out, 'w', encoding='utf-8') as f:
            f.write(html)
    print('built %d bytes -> %s' % (len(html), ', '.join(outs)))


if __name__ == '__main__':
    main()
