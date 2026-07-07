import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { runPetVaultPipeline, isLatexAvailable } from '$lib/server/engine/python-bridge';
import { runAgentPipeline, isAgentPipelineAvailable } from '$lib/server/engine/agent-pipeline';
import { getRecordById } from '$lib/server/db/records';
import { getPetById } from '$lib/server/db/pets';
import { readFileSync, existsSync } from 'fs';

export const POST: RequestHandler = async ({ request }) => {
  try {
    const body = await request.json();
    let items: Array<{name:string;amount:number}> = body.items || [];
    let hospitalName = body.hospitalName, petName = body.petName, visitDate = body.visitDate;
    let petInfo: Record<string,unknown> | undefined;

    if (body.recordId) {
      const rd = getRecordById(body.recordId);
      if (rd) {
        hospitalName = hospitalName || rd.record.hospital_name || undefined;
        visitDate = visitDate || rd.record.visit_date;
        if (!items.length) items = rd.items.map(i=>({name:i.raw_name,amount:i.amount}));
        if (rd.record.pet_id) {
          const pet = getPetById(rd.record.pet_id);
          if (pet) {
            if (!petName) petName = pet.name;
            petInfo = { species:pet.species, breed:pet.breed, gender:pet.gender, birthDate:pet.birth_date, weightKg:pet.weight_kg };
          }
        }
      }
    }
    if (!items.length) return json({ error:'无费用项目' }, { status:400 });

    const total = items.reduce((s,i)=>s+i.amount,0);

    // Agent 管线: DeepSeek 学完全部 skill 知识 → 生成报告 Markdown
    let agentMd: string | undefined;
    if (isAgentPipelineAvailable()) {
      const ar = await runAgentPipeline({ petName: petName||'待确认', hospitalName, visitDate,
        requestText: body.requestText, diagnosis: body.diagnosis, city: body.city, totalAmount: total,
        items, petInfo: petInfo as any });
      if (ar.success) agentMd = ar.reportMarkdown;
    }

    // Python 管线: skill_bridge.py → build_report_markdown 或 Agent Markdown → LaTeX → PDF
    const pr = await runPetVaultPipeline({
      requestText: body.requestText||'账单解释报告', petName: petName||'待确认',
      reportType: body.reportType||'auto', pdfPolicy: body.pdfPolicy||'required',
      billItems: items, hospitalName, visitDate, diagnosis: body.diagnosis, petInfo,
      preGeneratedMarkdown: agentMd,
    });

    let pdfB64: string|undefined;
    if (pr.pdfPath && existsSync(pr.pdfPath)) pdfB64 = readFileSync(pr.pdfPath).toString('base64');

    return json({ success: pr.success, reportId: pr.reportId, pdfBase64: pdfB64,
      agentUsed: !!agentMd, latexAvailable: isLatexAvailable() });
  } catch (e) {
    return json({ success:false, error:`${e}` }, { status:500 });
  }
};

export const GET: RequestHandler = async () => json({ latexAvailable: isLatexAvailable() });
