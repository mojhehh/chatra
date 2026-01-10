files_js=['script.js','reset.js','cloudflare-worker/verify-email-worker.js','cloudflare-worker/test-ai.js']
files_css=['style.css']
files_html=['index.html','chatra.html','reset.html']

def count_patterns(path, patterns):
    try:
        s=open(path,'r',encoding='utf-8',errors='ignore').read()
    except Exception as e:
        return {'error':str(e)}
    return {p: s.count(p) for p in patterns}

print('JS remaining counts (// and /*):')
for f in files_js:
    c=count_patterns(f,['//','/*','*/'])
    print(f, c)

print('\nCSS remaining counts (/*):')
for f in files_css:
    c=count_patterns(f,['/*','*/'])
    print(f, c)

print('\nHTML remaining counts (<!--):')
for f in files_html:
    c=count_patterns(f,['<!--','-->'])
    print(f, c)

# Also print a few sample lines where '//' occurs in JS to check false positives
print('\nSample JS lines containing // (context):')
for f in files_js:
    try:
        with open(f,'r',encoding='utf-8',errors='ignore') as fh:
            for i,line in enumerate(fh,1):
                if '//' in line and 'http' not in line and '://' not in line:
                    print(f'{f}:{i}: {line.strip()}')
                    break
    except:
        pass
