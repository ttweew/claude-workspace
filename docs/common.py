import sys
def sub(p, old, new, n=1):
    s = open(p).read(); assert s.count(old) == n, (p, old[:70], s.count(old)); open(p, 'w').write(s.replace(old, new))
def add_row_after(path, prev_no, row):
    s = open(path).read()
    prev = [l for l in s.split('\n') if l.startswith('| ' + str(prev_no) + ' |')][0]
    s = s.replace(prev + '\n', prev + '\n' + row + '\n')
    open(path, 'w').write(s)
def arch_after(key, row):
    p = 'docs/architecture.md'; s = open(p).read()
    line = [l for l in s.split('\n') if key in l][0]
    s = s.replace(line, line + '\n' + row); open(p, 'w').write(s)
def faq_before(summary_text, block):
    sub('help.html', "                    <details>\n                        <summary>" + summary_text + "</summary>", block + "\n                    <details>\n                        <summary>" + summary_text + "</summary>")
