import re, sys
ROOT='/home/user/mms-platform/'
_files={}
def _get(p):
    if p not in _files: _files[p]=open(ROOT+p).read()
    return _files[p]
def rep(p, old, new, count=1):
    s=_get(p)
    pat=r'\s+'.join(re.escape(w) for w in old.split())
    m=list(re.finditer(pat,s))
    if len(m)!=count:
        print(f'FAIL {p}: {len(m)} matches for: {old[:90]!r}'); sys.exit(1)
    s=re.sub(pat, lambda _: new, s)
    _files[p]=s
def save():
    for p,s in _files.items(): open(ROOT+p,'w').write(s)
    print('saved', len(_files), 'files')
