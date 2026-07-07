import { writable } from 'svelte/store';

export interface PetInfo {
  id: string;
  name: string;
  species: string;
  breed?: string | null;
  gender?: string | null;
  birth_date?: string | null;
  weight_kg?: number | null;
}

export const selectedPetId = writable<string | null>(null);
export const pets = writable<PetInfo[]>([]);

/** 加载宠物列表 */
export async function loadPets() {
  try {
    const res = await fetch('/api/pets');
    if (res.ok) {
      const data = await res.json();
      pets.set(data);
    }
  } catch {
    // 忽略加载错误
  }
}

/** 获取宠物品种疾病风险 */
export async function getBreedRisks(species: string, breed: string) {
  try {
    const res = await fetch(`/api/pets?action=breed-risks&species=${encodeURIComponent(species)}&breed=${encodeURIComponent(breed)}`);
    if (res.ok) return await res.json();
  } catch { /* ignore */ }
  return [];
}
