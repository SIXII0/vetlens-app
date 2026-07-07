import { v4 as uuid } from 'uuid';
import { getDb } from './index';

export interface PetRow {
  id: string;
  name: string;
  species: string;
  breed: string | null;
  gender: string | null;
  birth_date: string | null;
  weight_kg: number | null;
  avatar_path: string | null;
  created_at: string;
  updated_at: string;
}

/** 创建宠物档案 */
export function createPet(data: {
  name: string;
  species: string;
  breed?: string;
  gender?: string;
  birthDate?: string;
  weightKg?: number;
}): PetRow {
  const db = getDb();
  const id = uuid();
  db.prepare(`
    INSERT INTO pets (id, name, species, breed, gender, birth_date, weight_kg)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(id, data.name, data.species, data.breed || null, data.gender || null, data.birthDate || null, data.weightKg || null);

  return db.prepare('SELECT * FROM pets WHERE id = ?').get(id) as PetRow;
}

/** 获取所有宠物 */
export function getAllPets(): PetRow[] {
  const db = getDb();
  return db.prepare('SELECT * FROM pets ORDER BY created_at DESC').all() as PetRow[];
}

/** 获取单个宠物 */
export function getPetById(id: string): PetRow | undefined {
  const db = getDb();
  return db.prepare('SELECT * FROM pets WHERE id = ?').get(id) as PetRow | undefined;
}

/** 更新宠物信息 */
export function updatePet(id: string, data: Partial<{
  name: string;
  species: string;
  breed: string;
  gender: string;
  birthDate: string;
  weightKg: number;
}>): PetRow | undefined {
  const db = getDb();
  const fields: string[] = [];
  const values: unknown[] = [];

  if (data.name !== undefined) { fields.push('name = ?'); values.push(data.name); }
  if (data.species !== undefined) { fields.push('species = ?'); values.push(data.species); }
  if (data.breed !== undefined) { fields.push('breed = ?'); values.push(data.breed); }
  if (data.gender !== undefined) { fields.push('gender = ?'); values.push(data.gender); }
  if (data.birthDate !== undefined) { fields.push('birth_date = ?'); values.push(data.birthDate); }
  if (data.weightKg !== undefined) { fields.push('weight_kg = ?'); values.push(data.weightKg); }

  if (fields.length === 0) return getPetById(id);

  fields.push("updated_at = datetime('now')");
  values.push(id);

  db.prepare(`UPDATE pets SET ${fields.join(', ')} WHERE id = ?`).run(...values);
  return getPetById(id);
}

/** 删除宠物 */
export function deletePet(id: string): boolean {
  const db = getDb();
  const result = db.prepare('DELETE FROM pets WHERE id = ?').run(id);
  return result.changes > 0;
}

/** 获取宠物的品种疾病风险 */
export function getBreedRisks(species: string, breed: string) {
  const db = getDb();
  return db.prepare(
    'SELECT * FROM kb_breed_diseases WHERE species = ? AND breed = ?'
  ).all(species, breed);
}
