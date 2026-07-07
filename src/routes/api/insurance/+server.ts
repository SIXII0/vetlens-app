import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getAllPolicies, createPolicy, getPolicyById, deletePolicy } from '$lib/server/db/insurance';

export const GET: RequestHandler = async ({ url }) => {
  const id = url.searchParams.get('id');
  const petId = url.searchParams.get('petId') || undefined;

  if (id) {
    const policy = getPolicyById(id);
    if (!policy) return json({ error: '保单不存在' }, { status: 404 });
    return json(policy);
  }

  const policies = getAllPolicies(petId);
  return json(policies);
};

export const POST: RequestHandler = async ({ request }) => {
  const body = await request.json();
  const policy = createPolicy({
    petId: body.petId,
    company: body.company,
    productName: body.productName,
    policyNumber: body.policyNumber,
    effectiveDate: body.effectiveDate,
    expiryDate: body.expiryDate,
    waitingPeriod: body.waitingPeriod,
    deductible: body.deductible,
    reimbursementRate: body.reimbursementRate,
    annualLimit: body.annualLimit,
    rawTermsText: body.rawTermsText,
    structuredTerms: body.structuredTerms,
  });
  return json(policy, { status: 201 });
};

export const DELETE: RequestHandler = async ({ request }) => {
  const body = await request.json();
  const { id } = body;
  if (!id) return json({ error: '缺少保单ID' }, { status: 400 });

  const deleted = deletePolicy(id);
  if (deleted) return json({ success: true });
  return json({ error: '保单不存在' }, { status: 404 });
};
