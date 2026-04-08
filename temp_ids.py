import re
import pathlib
js = pathlib.Path('frontend/app.js').read_text()
ids = re.findall(r'document.getElementById\(\"([^\"]+)\"\)', js)
print('Total', len(ids))
print('\n'.join(sorted(set(ids))))
