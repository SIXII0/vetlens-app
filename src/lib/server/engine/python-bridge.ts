import { execFile } from 'child_process';
import { promisify } from 'util';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { v4 as uuid } from 'uuid';

const execFileAsync = promisify(execFile);
const BRIDGE = path.join(process.cwd(), 'src', 'lib', 'server', 'engine', 'skill_bridge.py');
const PYTHON_PROBE_TIMEOUT_MS = 10_000;
const PIPELINE_TIMEOUT_MS = 300_000;
const XELATEX = path.join(process.env.LOCALAPPDATA || '', 'Programs', 'MiKTeX', 'miktex', 'bin', 'x64');

function unique(values: string[]): string[] {
  return [...new Set(values.filter(Boolean))];
}

async function canRunPython(executable: string): Promise<boolean> {
  if (path.isAbsolute(executable) && (!fs.existsSync(executable) || !fs.statSync(executable).isFile())) return false;
  try {
    const { stdout, stderr } = await execFileAsync(executable, ['--version'], { timeout: PYTHON_PROBE_TIMEOUT_MS });
    return /^Python \d+\.\d+/.test(`${stdout}\n${stderr}`.trim());
  } catch {
    return false;
  }
}

async function wherePython(): Promise<string[]> {
  if (process.platform !== 'win32') return [];
  try {
    const { stdout } = await execFileAsync('where.exe', ['python'], { timeout: PYTHON_PROBE_TIMEOUT_MS });
    return stdout.split(/\r?\n/).map(line => line.trim()).filter(Boolean);
  } catch {
    return [];
  }
}

async function registeredWindowsPython(): Promise<string[]> {
  if (process.platform !== 'win32') return [];
  try {
    const { stdout } = await execFileAsync('reg.exe', ['query', 'HKCU\\Software\\Python\\PythonCore', '/s', '/v', 'ExecutablePath'], { timeout: PYTHON_PROBE_TIMEOUT_MS });
    return stdout.split(/\r?\n/)
      .map(line => line.match(/\sREG_SZ\s+(.+)$/)?.[1].trim() || '')
      .filter(Boolean);
  } catch {
    return [];
  }
}

async function resolvePython(): Promise<string> {
  const explicit = unique([process.env.PYTHON_EXECUTABLE || '', process.env.PYTHON_PATH || '']);
  const virtualEnvironment = process.env.VIRTUAL_ENV
    ? [path.join(process.env.VIRTUAL_ENV, process.platform === 'win32' ? 'Scripts' : 'bin', process.platform === 'win32' ? 'python.exe' : 'python')]
    : [];
  const projectVirtualEnvironment = [path.join(process.cwd(), '.venv', process.platform === 'win32' ? 'Scripts\\python.exe' : 'bin/python')];
  const registeredOnPath = await wherePython();
  const registeredWindows = await registeredWindowsPython();
  const commandNames = process.platform === 'win32' ? ['python.exe', 'python3.exe', 'python', 'python3'] : ['python3', 'python'];

  for (const candidate of unique([...explicit, ...virtualEnvironment, ...projectVirtualEnvironment, ...registeredOnPath, ...registeredWindows, ...commandNames])) {
    if (await canRunPython(candidate)) return candidate;
  }
  throw new Error('No executable Python interpreter found. Set PYTHON_EXECUTABLE or PYTHON_PATH to a valid python executable.');
}

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
    petName: opts.petName || '待确认', hospitalName: opts.hospitalName || '',
    visitDate: opts.visitDate || '', requestText: opts.requestText,
    diagnosis: opts.diagnosis || '', petInfo: opts.petInfo,
    totalAmount: opts.billItems?.reduce((s, i) => s + i.amount, 0) || 0,
    items: (opts.billItems || []).map(i => ({ name: i.name, amount: i.amount })),
  };
  const inputFile = path.join(out, 'input.json');
  fs.writeFileSync(inputFile, JSON.stringify(input, null, 2), 'utf-8');

  const args = [BRIDGE, '--input-data', inputFile, '--output-dir', out,
    '--report-type', opts.reportType || 'auto', '--pet-name', opts.petName || '待确认',
    '--pdf-policy', opts.pdfPolicy || 'required'];
  if (opts.preGeneratedMarkdown) {
    const markdownPath = path.join(out, 'agent.md');
    fs.writeFileSync(markdownPath, opts.preGeneratedMarkdown, 'utf-8');
    args.push('--markdown', markdownPath);
  }

  let buildLog = '';
  try {
    if (!fs.existsSync(BRIDGE) || !fs.statSync(BRIDGE).isFile()) throw new Error(`Python bridge script not found: ${BRIDGE}`);
    if (!fs.existsSync(process.cwd()) || !fs.statSync(process.cwd()).isDirectory()) throw new Error(`Invalid working directory: ${process.cwd()}`);
    const python = await resolvePython();
    const env = { ...process.env };
    if (XELATEX && !env.PATH?.includes(XELATEX)) env.PATH = `${XELATEX}${path.delimiter}${env.PATH || ''}`;
    const skillScripts = path.join(os.homedir(), '.codex', 'skills', 'pet-vault-skill', 'scripts');
    if (fs.existsSync(skillScripts)) env.PYTHONPATH = skillScripts + (env.PYTHONPATH ? path.delimiter + env.PYTHONPATH : '');

    const { stdout, stderr } = await execFileAsync(python, args, {
      cwd: process.cwd(), env, timeout: PIPELINE_TIMEOUT_MS, maxBuffer: 2 * 1024 * 1024,
    });
    buildLog = `[PythonBridge] Python: ${python}\n[PythonBridge] cwd: ${process.cwd()}\n${stdout}\n${stderr}`;
    const pdf = path.join(out, 'report.pdf');
    const markdown = path.join(out, 'report.md');
    return {
      success: fs.existsSync(markdown), reportId: id, outputDir: out,
      pdfPath: fs.existsSync(pdf) ? pdf : undefined, markdownPath: fs.existsSync(markdown) ? markdown : undefined,
      buildLog,
    };
  } catch (error) {
    const childError = error as NodeJS.ErrnoException & { stdout?: string; stderr?: string; code?: number | string; killed?: boolean; signal?: string };
    buildLog += `${childError.stdout || ''}${childError.stderr || ''}`;
    const details = [
      childError.message,
      childError.code !== undefined ? `exit code: ${childError.code}` : '',
      childError.killed ? `timed out after ${PIPELINE_TIMEOUT_MS}ms` : '',
      childError.signal ? `signal: ${childError.signal}` : '',
    ].filter(Boolean).join('; ');
    return { success: false, reportId: id, outputDir: out, buildLog, error: details };
  }
}

export function isPipelineAvailable(): boolean { return fs.existsSync(BRIDGE); }
export function isLatexAvailable(): boolean { return fs.existsSync(path.join(XELATEX, 'xelatex.exe')); }
