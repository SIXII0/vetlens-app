"""
将知识库数据中的繁体中文转换为简体中文
"""
from opencc import OpenCC
import sqlite3, json, os

DB = os.path.join(os.path.dirname(__file__), '..', 'data', 'vetlens.db')
cc = OpenCC('t2s')  # 繁体 → 简体

conn = sqlite3.connect(DB)
cur = conn.cursor()

# ── kb_diseases: name_zh, description_zh ──
rows = cur.execute('SELECT id, name_zh, description_zh FROM kb_diseases').fetchall()
for id, name, desc in rows:
    new_name = cc.convert(name) if name else ''
    new_desc = cc.convert(desc) if desc else ''
    if new_name != name or new_desc != desc:
        cur.execute('UPDATE kb_diseases SET name_zh=?, description_zh=? WHERE id=?', (new_name, new_desc, id))
print(f'Diseases updated')

# ── kb_drugs2: name_zh, description_zh ──
rows = cur.execute('SELECT id, name_zh, description_zh FROM kb_drugs2').fetchall()
for id, name, desc in rows:
    new_name = cc.convert(name) if name else ''
    new_desc = cc.convert(desc) if desc else ''
    if new_name != name or new_desc != desc:
        cur.execute('UPDATE kb_drugs2 SET name_zh=?, description_zh=? WHERE id=?', (new_name, new_desc, id))
print(f'Drugs updated')

# ── kb_breeds2: name_zh ──
rows = cur.execute('SELECT id, name_zh FROM kb_breeds2').fetchall()
for id, name in rows:
    new_name = cc.convert(name) if name else ''
    if new_name != name:
        cur.execute('UPDATE kb_breeds2 SET name_zh=? WHERE id=?', (new_name, id))
print(f'Breeds updated')

# ── kb_symptoms: name_zh ──
rows = cur.execute('SELECT slug, name_zh FROM kb_symptoms').fetchall()
for slug, name in rows:
    new_name = cc.convert(name) if name else ''
    if new_name != name:
        cur.execute('UPDATE kb_symptoms SET name_zh=? WHERE slug=?', (new_name, slug))
print(f'Symptoms updated')

# ── kb_diseases: detail_json 中的相关字段 ──
rows = cur.execute('SELECT id, detail_json FROM kb_diseases WHERE detail_json IS NOT NULL').fetchall()
count = 0
for id, detail in rows:
    try:
        d = json.loads(detail)
        changed = False
        # symptoms, drugs, breeds arrays 中的 name_i18n
        for arr_key in ['symptoms', 'drugTreatments', 'breedPredispositions']:
            for item in d.get(arr_key, []) or []:
                i18n = item.get('nameI18n', {}) or item.get('name_i18n', {}) or {}
                for k in ['zh_HK', 'zh_TW']:
                    if k in i18n:
                        converted = cc.convert(i18n[k])
                        if converted != i18n[k]:
                            i18n[k] = converted
                            changed = True
        # bodySystems
        for bs in d.get('bodySystems', []) or []:
            i18n = bs.get('name_i18n', {}) or {}
            for k in ['zh_HK', 'zh_TW']:
                if k in i18n:
                    converted = cc.convert(i18n[k])
                    if converted != i18n[k]:
                        i18n[k] = converted
                        changed = True
        if changed:
            cur.execute('UPDATE kb_diseases SET detail_json=? WHERE id=?', (json.dumps(d, ensure_ascii=False), id))
            count += 1
    except: pass
print(f'Disease details updated: {count}')

# ── kb_drugs2: detail_json ──
rows = cur.execute('SELECT id, detail_json FROM kb_drugs2 WHERE detail_json IS NOT NULL').fetchall()
count = 0
for id, detail in rows:
    try:
        d = json.loads(detail)
        changed = False
        for k in ['descriptionI18n']:
            i18n = d.get(k, {}) or {}
            for lk in ['zh_HK', 'zh_TW']:
                if lk in i18n:
                    converted = cc.convert(i18n[lk])
                    if converted != i18n[lk]:
                        i18n[lk] = converted
                        changed = True
        for arr in ['indications', 'sideEffects', 'contraindications']:
            items = d.get(arr, []) or []
            for i, item in enumerate(items):
                if isinstance(item, str):
                    converted = cc.convert(item)
                    if converted != item:
                        items[i] = converted
                        changed = True
        if changed:
            cur.execute('UPDATE kb_drugs2 SET detail_json=? WHERE id=?', (json.dumps(d, ensure_ascii=False), id))
            count += 1
    except: pass
print(f'Drug details updated: {count}')

conn.commit()
conn.close()
print('Done!')
