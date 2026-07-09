"""
导入 Peqaboo 知识库数据到 SQLite
用法: python scripts/import_knowledge.py
"""
import json, sqlite3, sys, os

DATA = r'F:\Users\宋泽锋\Desktop\Pet\peqaboo\peqaboo_data'
DB = os.path.join(os.path.dirname(__file__), '..', 'data', 'vetlens.db')

def get_name_i18n(d, key='zh_HK'):
    """提取中文名，优先 zh_HK 再 zh_TW"""
    i18n = d.get('nameI18n', {}) or {}
    name = (i18n.get('zh_HK') or i18n.get('zh_TW') or '')
    # 取 / 分割的第一段作为主名称
    return name.split(' / ')[0].strip() if name else ''

def import_diseases(cursor):
    """导入疾病列表 + 详情"""
    with open(os.path.join(DATA, 'diseases_list.json'), encoding='utf-8') as f:
        diseases = json.load(f)
    with open(os.path.join(DATA, 'diseases_detail.json'), encoding='utf-8') as f:
        details = json.load(f)
    detail_map = {d['id']: d for d in details}

    cursor.execute('''CREATE TABLE IF NOT EXISTS kb_diseases (
        id TEXT PRIMARY KEY, slug TEXT, canonical_name TEXT, category TEXT,
        rarity TEXT, urgency INTEGER, species TEXT,
        name_zh TEXT, description_zh TEXT,
        body_systems TEXT, symptoms TEXT, drugs TEXT, breeds TEXT,
        detail_json TEXT
    )''')
    count = 0
    for d in diseases:
        det = detail_map.get(d['id'], {})
        cursor.execute('INSERT OR REPLACE INTO kb_diseases VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)', (
            d['id'], d['slug'], d['canonicalName'], d.get('category',''),
            d.get('rarity',''), d.get('urgencyLevel',0),
            ','.join(det.get('speciesSlugs',[]) or []),
            get_name_i18n(d) or d['canonicalName'],
            (d.get('descriptionI18n',{}) or {}).get('zh_HK','') or d.get('description',''),
            json.dumps(det.get('bodySystems',[]), ensure_ascii=False),
            json.dumps(det.get('symptoms',[]), ensure_ascii=False),
            json.dumps(det.get('drugTreatments',[]), ensure_ascii=False),
            json.dumps(det.get('breedPredispositions',[]), ensure_ascii=False),
            json.dumps(det, ensure_ascii=False),
        ))
        count += 1
    print(f'  Diseases: {count}')

def import_drugs(cursor):
    """导入药物列表 + 详情"""
    with open(os.path.join(DATA, 'drugs_list.json'), encoding='utf-8') as f:
        drugs = json.load(f)
    with open(os.path.join(DATA, 'drugs_detail.json'), encoding='utf-8') as f:
        details = json.load(f)
    detail_map = {d['id']: d for d in details}

    cursor.execute('''CREATE TABLE IF NOT EXISTS kb_drugs2 (
        id TEXT PRIMARY KEY, slug TEXT, generic_name TEXT, brand_names TEXT,
        drug_class TEXT, routes TEXT, name_zh TEXT, description_zh TEXT,
        indications TEXT, side_effects TEXT, dosing_json TEXT, detail_json TEXT
    )''')
    count = 0
    for d in drugs:
        det = detail_map.get(d['id'], {})
        cursor.execute('INSERT OR REPLACE INTO kb_drugs2 VALUES (?,?,?,?,?,?,?,?,?,?,?,?)', (
            d['id'], d['slug'], d['genericName'],
            json.dumps(d.get('brandNames',[]), ensure_ascii=False),
            d.get('drugClass',''), json.dumps(d.get('administrationRoutes',[]), ensure_ascii=False),
            get_name_i18n(d) or d['genericName'],
            (det.get('descriptionI18n',{}) or {}).get('zh_HK','') or d.get('description',''),
            json.dumps(det.get('indications',[]), ensure_ascii=False),
            json.dumps(det.get('sideEffects',[]), ensure_ascii=False),
            json.dumps(det.get('dosing',{}), ensure_ascii=False),
            json.dumps(det, ensure_ascii=False),
        ))
        count += 1
    print(f'  Drugs: {count}')

def import_breeds(cursor):
    with open(os.path.join(DATA, 'breeds_list.json'), encoding='utf-8') as f:
        breeds = json.load(f)
    cursor.execute('''CREATE TABLE IF NOT EXISTS kb_breeds2 (
        id TEXT PRIMARY KEY, slug TEXT, canonical_name TEXT, species TEXT,
        size_class TEXT, weight_min REAL, weight_max REAL,
        name_zh TEXT, disease_count INTEGER
    )''')
    count = 0
    for b in breeds:
        cursor.execute('INSERT OR REPLACE INTO kb_breeds2 VALUES (?,?,?,?,?,?,?,?,?)', (
            b['id'], b['slug'], b['canonicalName'], b.get('speciesSlug',''),
            b.get('sizeClass',''), b.get('weightKgMin'), b.get('weightKgMax'),
            get_name_i18n(b) or b['canonicalName'], b.get('diseaseCount',0),
        ))
        count += 1
    print(f'  Breeds: {count}')

def import_symptoms(cursor):
    with open(os.path.join(DATA, 'symptoms_list.json'), encoding='utf-8') as f:
        symptoms = json.load(f)
    cursor.execute('''CREATE TABLE IF NOT EXISTS kb_symptoms (
        slug TEXT PRIMARY KEY, canonical_name TEXT, name_zh TEXT, disease_count INTEGER
    )''')
    count = 0
    for s in symptoms:
        cursor.execute('INSERT OR REPLACE INTO kb_symptoms VALUES (?,?,?,?)', (
            s['slug'], s['canonicalName'], get_name_i18n(s) or s['canonicalName'],
            s.get('diseaseCount',0),
        ))
        count += 1
    print(f'  Symptoms: {count}')

if __name__ == '__main__':
    print(f'DB: {DB}')
    conn = sqlite3.connect(DB)
    cur = conn.cursor()
    import_diseases(cur)
    import_drugs(cur)
    import_breeds(cur)
    import_symptoms(cur)
    conn.commit()
    conn.close()
    print('Done!')
