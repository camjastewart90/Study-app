"""Build data/<course>.json from content/<course>/ (course.json + transcribed chunk files).

Usage: python3 scripts/build.py
Each content/<course>/ folder holds course.json (groups/topics) and any number of chunk
JSON files with {"notes": [...], "questions": [...]}. Question ids are a hash of topic +
question text, so progress survives rebuilds as long as the question wording is unchanged.
"""
import glob, hashlib, json, os, sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

def build(folder):
    meta = json.load(open(os.path.join(folder, 'course.json')))
    topics, groups = {}, []
    for g in meta['groups']:
        ids = []
        for tid, title, short in g['topics']:
            topics[tid] = {'id': tid, 'title': title, 'short': short, 'notes': [], 'questions': []}
            ids.append(tid)
        groups.append({'title': g['title'], 'topics': ids})
    seen = set()
    for f in sorted(glob.glob(os.path.join(folder, '*.json'))):
        if f.endswith('course.json'):
            continue
        chunk = json.load(open(f))
        for n in chunk.get('notes', []):
            topics[n['topic']]['notes'].append({'page': n['page'], 'markdown': n['markdown']})
        for q in chunk.get('questions', []):
            qid = hashlib.sha1((q['topic'] + '|' + q['q']).encode()).hexdigest()[:10]
            if qid in seen:
                print('duplicate question skipped:', q['q'], file=sys.stderr)
                continue
            seen.add(qid)
            choices = q.get('choices') or None
            if choices and (len(choices) != 3 or isinstance(q['a'], list) or q['a'] in choices):
                choices = None
            topics[q['topic']]['questions'].append({
                'id': qid, 'topic': q['topic'], 'page': q.get('page'), 'q': q['q'], 'a': q['a'],
                'choices': choices, 'priority': bool(q.get('priority')), 'source': q.get('source', 'book'),
            })
    for t in topics.values():
        t['notes'].sort(key=lambda n: n['page'])
    return {'id': meta['id'], 'title': meta['title'], 'subtitle': meta.get('subtitle', ''),
            'groups': groups, 'topics': list(topics.values())}

def main():
    index = {'courses': []}
    for folder in sorted(glob.glob(os.path.join(ROOT, 'content', '*', ''))):
        course = build(folder)
        name = os.path.basename(os.path.normpath(folder)) + '.json'
        with open(os.path.join(ROOT, 'data', name), 'w') as fh:
            json.dump(course, fh, ensure_ascii=False, separators=(',', ':'))
        index['courses'].append({'id': course['id'], 'title': course['title'], 'file': name})
        for t in course['topics']:
            print(f"{course['id']}/{t['id']:10} notes={len(t['notes']):3} questions={len(t['questions']):3} priority={sum(q['priority'] for q in t['questions'])}")
    with open(os.path.join(ROOT, 'data', 'courses.json'), 'w') as fh:
        json.dump(index, fh, indent=2)

if __name__ == '__main__':
    main()
