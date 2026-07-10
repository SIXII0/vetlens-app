import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getDb } from '$lib/server/db/index';

export const GET: RequestHandler = async ({ url }) => {
  const type = url.searchParams.get('type') || 'diseases'; // diseases|drugs|breeds|symptoms
  const q = url.searchParams.get('q') || '';
  const species = url.searchParams.get('species') || '';  // cat|dog
  const category = url.searchParams.get('category') || '';
  const limit = Math.min(parseInt(url.searchParams.get('limit') || '30'), 100);
  const offset = parseInt(url.searchParams.get('offset') || '0');
  const id = url.searchParams.get('id') || '';

  const db = getDb();

  // Detail
  if (id) {
    let table = '';
    if (type === 'diseases') table = 'kb_diseases';
    else if (type === 'drugs') table = 'kb_drugs2';
    else if (type === 'breeds') table = 'kb_breeds2';
    if (table) {
      const row = db.prepare(`SELECT * FROM ${table} WHERE id=? OR slug=?`).get(id, id);
      return json(row || null);
    }
    return json(null);
  }

  // List with search
  let base = '';
  let countQ = '';
  const params: any[] = [];

  if (type === 'diseases') {
    base = 'SELECT id,slug,canonical_name,category,rarity,urgency,species,name_zh,description_zh FROM kb_diseases WHERE 1=1';
    if (q) { base += ' AND (name_zh LIKE ? OR canonical_name LIKE ? OR slug LIKE ?)'; params.push(`%${q}%`, `%${q}%`, `%${q}%`); }
    if (species) { base += ' AND species LIKE ?'; params.push(`%${species}%`); }
    if (category) { base += ' AND category=?'; params.push(category); }
    countQ = `SELECT COUNT(*) as cnt FROM kb_diseases WHERE 1=1${q?' AND (name_zh LIKE ? OR canonical_name LIKE ? OR slug LIKE ?)':''}${species?' AND species LIKE ?':''}${category?' AND category=?':''}`;
  } else if (type === 'drugs') {
    base = 'SELECT id,slug,generic_name,brand_names,drug_class,routes,name_zh,description_zh FROM kb_drugs2 WHERE 1=1';
    if (q) { base += ' AND (name_zh LIKE ? OR generic_name LIKE ? OR brand_names LIKE ?)'; params.push(`%${q}%`, `%${q}%`, `%${q}%`); }
    countQ = `SELECT COUNT(*) as cnt FROM kb_drugs2 WHERE 1=1${q?' AND (name_zh LIKE ? OR generic_name LIKE ? OR brand_names LIKE ?)':''}`;
  } else if (type === 'breeds') {
    base = 'SELECT id,slug,canonical_name,species,size_class,weight_min,weight_max,name_zh,disease_count FROM kb_breeds2 WHERE 1=1';
    if (q) { base += ' AND (name_zh LIKE ? OR canonical_name LIKE ?)'; params.push(`%${q}%`, `%${q}%`); }
    if (species) { base += ' AND species=?'; params.push(species); }
    countQ = `SELECT COUNT(*) as cnt FROM kb_breeds2 WHERE 1=1${q?' AND (name_zh LIKE ? OR canonical_name LIKE ?)':''}${species?' AND species=?':''}`;
  } else if (type === 'symptoms') {
    base = 'SELECT slug,canonical_name,name_zh,disease_count FROM kb_symptoms WHERE 1=1';
    if (q) { base += ' AND (name_zh LIKE ? OR canonical_name LIKE ?)'; params.push(`%${q}%`, `%${q}%`); }
    countQ = `SELECT COUNT(*) as cnt FROM kb_symptoms WHERE 1=1${q?' AND (name_zh LIKE ? OR canonical_name LIKE ?)':''}`;
  } else if (type === 'terms') {
    base = "SELECT id,name,aliases,category,plain_explain,medical_explain,necessity_hint FROM kb_terms WHERE source='builtin'";
    if (q) { base += ' AND (name LIKE ? OR aliases LIKE ? OR plain_explain LIKE ?)'; params.push(`%${q}%`, `%${q}%`, `%${q}%`); }
    countQ = `SELECT COUNT(*) as cnt FROM kb_terms WHERE source='builtin'${q?' AND (name LIKE ? OR aliases LIKE ? OR plain_explain LIKE ?)':''}`;
  } else {
    return json({ error: 'Invalid type' }, { status: 400 });
  }

  const countParams = [...params]; // copy for count query
  const total = (db.prepare(countQ).get(...countParams) as { cnt: number })?.cnt || 0;

  const orderCol = type === 'terms' ? 'name' : 'name_zh';
  base += ` ORDER BY ${orderCol} ASC LIMIT ? OFFSET ?`;
  params.push(limit, offset);
  const rows = db.prepare(base).all(...params);

  return json({ rows, total, limit, offset });
};
