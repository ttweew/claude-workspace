# 模擬器的小工具：換規則、清空、看還剩哪些資料（管理者身分，不受規則限制）
import json, sys, urllib.request
FS = 'http://127.0.0.1:8080'
DOCS = FS + '/v1/projects/demo-sport/databases/(default)/documents'
def http(method, url, body=None):
    req = urllib.request.Request(url, method=method, data=None if body is None else json.dumps(body).encode(),
                                 headers={'Content-Type': 'application/json', 'Authorization': 'Bearer owner'})
    with urllib.request.urlopen(req) as r: return json.loads(r.read().decode() or '{}')
def rules(text): http('PUT', FS + '/emulator/v1/projects/demo-sport:securityRules', {'rules': {'files': [{'name': 'firestore.rules', 'content': text}]}})
def reset(): http('DELETE', FS + '/emulator/v1/projects/demo-sport/databases/(default)/documents')
def left(parent=DOCS, depth=0):
    out = []
    for c in http('POST', parent + ':listCollectionIds', {}).get('collectionIds', []):
        for d in http('GET', f'{parent}/{c}?showMissing=true').get('documents', []):
            if 'fields' in d: out.append(d['name'].split('/documents/')[1])
            out += left(FS + '/v1/' + d['name'], depth + 1)
    return out
if __name__ == '__main__':
    cmd = sys.argv[1]
    if cmd == 'rules': rules(sys.stdin.read()); print('rules ok')
    elif cmd == 'reset': reset(); print('reset ok')
    elif cmd == 'left': print('剩下的資料：', left())
