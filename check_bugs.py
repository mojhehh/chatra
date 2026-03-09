import re
from collections import Counter

with open(r'c:\Users\sebmo\Downloads\chatra\index.html', 'r', encoding='utf-8') as f:
    html = f.read()
    lines = html.split('\n')

# 1. Find duplicate IDs
ids = re.findall(r'id="([^"]+)"', html)
counts = Counter(ids)
dupes = {k: v for k, v in counts.items() if v > 1}
print("=== DUPLICATE IDs ===")
for k, v in sorted(dupes.items()):
    lnums = [i+1 for i, line in enumerate(lines) if f'id="{k}"' in line]
    print(f"  {k}: {v}x at lines {lnums}")
if not dupes:
    print("  None found")

# 2. Find getElementById calls in script.js that don't match HTML IDs
with open(r'c:\Users\sebmo\Downloads\chatra\script.js', 'r', encoding='utf-8') as f:
    script = f.read()

html_ids = set(ids)
js_ids = set(re.findall(r'getElementById\(["\']([^"\']+)["\']\)', script))
missing = js_ids - html_ids
print("\n=== IDs in script.js but NOT in index.html ===")
for mid in sorted(missing):
    # Find line in script.js
    for i, line in enumerate(script.split('\n'), 1):
        if f'getElementById("{mid}")' in line or f"getElementById('{mid}')" in line:
            print(f"  {mid} (script.js line {i})")
            break

# 3. Find forms without action or onsubmit
print("\n=== FORMS without onsubmit prevention ===")
form_pattern = re.compile(r'<form[^>]*>', re.IGNORECASE)
for i, line in enumerate(lines, 1):
    m = form_pattern.search(line)
    if m:
        tag = m.group(0)
        has_action = 'action=' in tag
        has_onsubmit = 'onsubmit=' in tag
        form_id = re.search(r'id="([^"]+)"', tag)
        fid = form_id.group(1) if form_id else "(no id)"
        if not has_action and not has_onsubmit:
            print(f"  Line {i}: form#{fid} - no action or onsubmit")

# 4. Find password fields
print("\n=== PASSWORD FIELDS ===")
for i, line in enumerate(lines, 1):
    if 'type="password"' in line or 'type="text"' in line:
        if 'password' in line.lower() or 'Password' in line:
            stripped = line.strip()
            print(f"  Line {i}: {stripped[:120]}")

# 5. Missing autocomplete on sensitive fields
print("\n=== SENSITIVE INPUTS missing autocomplete='off' ===")
for i, line in enumerate(lines, 1):
    if ('type="password"' in line or 'type="email"' in line) and 'autocomplete' not in line:
        stripped = line.strip()
        print(f"  Line {i}: {stripped[:120]}")

# 6. Labels without for attribute
print("\n=== LABELS without 'for' attribute (in form context) ===")
label_count = 0
for i, line in enumerate(lines, 1):
    stripped = line.strip()
    if stripped.startswith('<label') and 'for=' not in stripped and 'class=' in stripped:
        # Check if it's a wrapping label (contains input)
        # Simple heuristic: if the label doesn't close on same line and doesn't contain <input
        if '<input' not in stripped:
            label_count += 1
            if label_count <= 10:
                print(f"  Line {i}: {stripped[:120]}")
if label_count > 10:
    print(f"  ... and {label_count - 10} more")
