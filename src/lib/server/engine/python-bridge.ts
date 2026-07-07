import { execFile } from 'child_process';
import { promisify } from 'util';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { v4 as uuid } from 'uuid';

const execFileAsync = promisify(execFile);
const BRIDGE = path.join(process.cwd(), 'src', 'lib', 'server', 'engine', 'skill_bridge.py');

function findPython(): string {
  if (process.env.PYTHON_PATH && fs.existsSync(process.env.PYTHON_PATH)) return process.env.PYTHON_PATH;
  for (const d of ['C:','D:','E:','F:']) for (const v of ['Python313','Python312','Python311']) {
    const p = path.join(d, v, 'python.exe'); if (fs.existsSync(p)) return p;
  }
  return 'python';
}
const PYTHON = findPython();
const XELATEX = path.join(process.env.LOCALAPPDATA||'', 'Programs','MiKTeX','miktex','bin','x64');
console.log(`[PythonBridge] ${PYTHON}`);

export interface PipelineOptions {
  requestText: string; petName?: string; reportType?: string; pdfPolicy?: string;
  billItems?: Array<{name:string;amount:number}>; hospitalName?: string;
  visitDate?: string; diagnosis?: string; petInfo?: Record<string,unknown>;
  preGeneratedMarkdown?: string;
}
export interface PipelineResult {
  success: boolean; reportId: string; outputDir: string;
  pdfPath?: string; markdownPath?: string; buildLog: string; error?: string;
}

export async function runPetVaultPipeline(opts: PipelineOptions): Promise<PipelineResult> {
  const id = uuid();
  const out = path.join(os.tmpdir(), `vetlens-skill-${id}`);
  fs.mkdirSync(out, { recursive: true });

  const input: Record<string,unknown> = {
    petName: opts.petName||'待确认', hospitalName: opts.hospitalName||'',
    visitDate: opts.visitDate||'', requestText: opts.requestText,
    diagnosis: opts.diagnosis||'', petInfo: opts.petInfo,
    totalAmount: opts.billItems?.reduce((s,i)=>s+i.amount,0)||0,
    items: (opts.billItems||[]).map(i=>({name:i.name,amount:i.amount})),
  };
  const inputFile = path.join(out, 'input.json');
  fs.writeFileSync(inputFile, JSON.stringify(input,null,2),'utf-8');

  const args = [BRIDGE, '--input-data', inputFile, '--output-dir', out,
    '--report-type', opts.reportType||'auto', '--pet-name', opts.petName||'待确认',
    '--pdf-policy', opts.pdfPolicy||'required'];

  if (opts.preGeneratedMarkdown) {
    const mp = path.join(out, 'agent.md');
    fs.writeFileSync(mp, opts.preGeneratedMarkdown,'utf-8');
    args.push('--markdown', mp);
  }

  try {
    const env = {...process.env};
    if (XELATEX && !env.PATH?.includes(XELATEX)) env.PATH = `${XELATEX}${path.delimiter}${env.PATH||''}`;
    const { stdout, stderr } = await execFileAsync(PYTHON, args, { env, timeout: 300_000, maxBuffer: 2*1024*1024 });
    const pdf = path.join(out, 'report.pdf'); const md = path.join(out, 'report.md');
    return { success: fs.existsSync(md), reportId: id, outputDir: out,
      pdfPath: fs.existsSync(pdf)?pdf:undefined, markdownPath: fs.existsSync(md)?md:undefined,
      buildLog: stdout+'\n'+stderr };
  } catch(e) {
    return { success: false, reportId: id, outputDir: out, buildLog: '', error: `${e}` };
  }
}

export function isPipelineAvailable(): boolean { return fs.existsSync(BRIDGE); }
export function isLatexAvailable(): boolean {
  return fs.existsSync(path.join(XELATEX,'xelatex.exe'));
}
