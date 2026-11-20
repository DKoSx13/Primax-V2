"""Export a Trace Viewer timeline without request bodies, credentials or cookies."""
import json
import sys
from pathlib import Path
from zipfile import ZIP_DEFLATED, ZipFile


def export(source, destination):
    with ZipFile(source) as original, ZipFile(destination, 'x', ZIP_DEFLATED) as public:
        events = []
        for line in original.read('trace.trace').splitlines():
            event = json.loads(line)
            kind = event['type']
            if kind == 'context-options':
                event['options'] = {}
            elif kind == 'before':
                event['params'] = {k: v for k, v in event['params'].items()
                                   if k in ('selector', 'url') and isinstance(v, str)}
                event.pop('title', None)
            elif kind == 'after':
                event.pop('result', None)
            elif kind == 'console':
                event['args'] = []
            elif kind not in ('input', 'event'):
                continue
            events.append(json.dumps(event, ensure_ascii=False))
        public.writestr('trace.trace', '\n'.join(events) + '\n')
        public.writestr('trace.network', '')


if __name__ == '__main__':
    export(Path(sys.argv[1]), Path(sys.argv[2]))
