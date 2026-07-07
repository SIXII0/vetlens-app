import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getAllPets, createPet, getPetById, updatePet, deletePet } from '$lib/server/db/pets';

export const GET: RequestHandler = async ({ url }) => {
  const id = url.searchParams.get('id');
  if (id) {
    const pet = getPetById(id);
    if (!pet) return json({ error: '宠物不存在' }, { status: 404 });
    return json(pet);
  }
  const pets = getAllPets();
  return json(pets);
};

export const POST: RequestHandler = async ({ request }) => {
  const body = await request.json();
  const pet = createPet({
    name: body.name,
    species: body.species,
    breed: body.breed,
    gender: body.gender,
    birthDate: body.birthDate,
    weightKg: body.weightKg
  });
  return json(pet, { status: 201 });
};

export const PUT: RequestHandler = async ({ request }) => {
  const body = await request.json();
  const { id, ...data } = body;
  if (!id) return json({ error: '缺少宠物ID' }, { status: 400 });

  const pet = updatePet(id, data);
  if (!pet) return json({ error: '宠物不存在' }, { status: 404 });
  return json(pet);
};

export const DELETE: RequestHandler = async ({ request }) => {
  const body = await request.json();
  const { id } = body;
  if (!id) return json({ error: '缺少宠物ID' }, { status: 400 });

  const deleted = deletePet(id);
  if (deleted) return json({ success: true });
  return json({ error: '宠物不存在' }, { status: 404 });
};
