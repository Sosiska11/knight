import re
import sys

binary_path = '/usr/local/x-ui/bin/xray-linux-amd64'
try:
    with open(binary_path, 'rb') as f:
        data = f.read()
except Exception as e:
    print(f"Error opening binary: {e}")
    sys.exit(1)

# Search for ascii-like strings
strings = re.findall(b'[a-zA-Z0-9_\\-/]{4,35}', data)
ascii_strings = []
for s in strings:
    try:
        ascii_strings.append(s.decode('ascii'))
    except:
        pass

# Search for xhttp related strings
keywords = ['xhttp', 'splithttp', 'get-only', 'getonly', 'downloadonly', 'uploadmethod', 'downloadmethod']
matches = set()
for s in ascii_strings:
    for kw in keywords:
        if kw in s.lower():
            matches.add(s)

print("--- MATCHES ---")
for m in sorted(list(matches)):
    print(m)
