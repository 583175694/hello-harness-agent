import { readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';

type Verdict = 'pass' | 'fail' | 'unknown';

export type JudgeCalibrationReport = {
  input: string;
  labeled: number;
  agreement: number;
  cohenKappa: number;
  severeFalsePasses: number;
  calibrated: boolean;
  confusion: Record<Verdict, Record<Verdict, number>>;
};

export async function calibrateContextJudge(
  inputPath: string,
  outputPath?: string,
): Promise<JudgeCalibrationReport> {
  const rows = parseCsv(await readFile(inputPath, 'utf8'));
  const [header, ...values] = rows;
  if (!header) throw new Error('人工复核 CSV 为空。');
  const judgeIndex = header.indexOf('judgeVerdict');
  const humanIndex = header.indexOf('人工结论');
  if (judgeIndex < 0 || humanIndex < 0)
    throw new Error('人工复核 CSV 缺少 judgeVerdict 或 人工结论 列。');
  const pairs = values.flatMap((row) => {
    const judge = verdict(row[judgeIndex]);
    const human = verdict(row[humanIndex]);
    return judge && human ? [{ judge, human }] : [];
  });
  if (!pairs.length) throw new Error('人工复核 CSV 尚无可用于校准的标注。');
  const labels: Verdict[] = ['pass', 'fail', 'unknown'];
  const confusion = Object.fromEntries(
    labels.map((human) => [human, Object.fromEntries(labels.map((judge) => [judge, 0]))]),
  ) as JudgeCalibrationReport['confusion'];
  for (const pair of pairs) confusion[pair.human][pair.judge] += 1;
  const agreement = pairs.filter((pair) => pair.judge === pair.human).length / pairs.length;
  const humanCounts = Object.fromEntries(
    labels.map((label) => [label, pairs.filter((pair) => pair.human === label).length]),
  ) as Record<Verdict, number>;
  const judgeCounts = Object.fromEntries(
    labels.map((label) => [label, pairs.filter((pair) => pair.judge === label).length]),
  ) as Record<Verdict, number>;
  const expected = labels.reduce(
    (total, label) =>
      total + (humanCounts[label] / pairs.length) * (judgeCounts[label] / pairs.length),
    0,
  );
  const cohenKappa = expected === 1 ? 1 : (agreement - expected) / (1 - expected);
  const severeFalsePasses = pairs.filter(
    (pair) => pair.human === 'fail' && pair.judge === 'pass',
  ).length;
  const report: JudgeCalibrationReport = {
    input: inputPath,
    labeled: pairs.length,
    agreement,
    cohenKappa,
    severeFalsePasses,
    calibrated: (agreement >= 0.85 || cohenKappa >= 0.7) && severeFalsePasses === 0,
    confusion,
  };
  const requested = outputPath ?? join(dirname(inputPath), 'judge-calibration.json');
  const target = requested.endsWith('.json') ? requested : `${requested}.json`;
  await writeFile(target, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  await writeFile(
    target.replace(/\.json$/u, '.md'),
    `# Context Judge Calibration\n\n- Labeled: ${report.labeled}\n- Agreement: ${(agreement * 100).toFixed(1)}%\n- Cohen's kappa: ${cohenKappa.toFixed(3)}\n- Severe false passes: ${severeFalsePasses}\n- Calibrated: ${report.calibrated ? 'YES' : 'NO'}\n`,
    'utf8',
  );
  return report;
}

function verdict(value: string | undefined): Verdict | undefined {
  const normalized = value?.trim().toLocaleLowerCase('zh-CN');
  if (['pass', '通过'].includes(normalized ?? '')) return 'pass';
  if (['fail', '失败', '不通过'].includes(normalized ?? '')) return 'fail';
  if (['unknown', '未知', '不确定'].includes(normalized ?? '')) return 'unknown';
  return undefined;
}

// 支持引号、逗号和多行回答，不用按换行直接切分人工复核 CSV。
export function parseCsv(source: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;
  for (let index = 0; index < source.length; index += 1) {
    const character = source[index];
    if (quoted && character === '"' && source[index + 1] === '"') {
      field += '"';
      index += 1;
    } else if (character === '"') quoted = !quoted;
    else if (character === ',' && !quoted) {
      row.push(field);
      field = '';
    } else if ((character === '\n' || character === '\r') && !quoted) {
      if (character === '\r' && source[index + 1] === '\n') index += 1;
      row.push(field);
      if (row.some((value) => value.length)) rows.push(row);
      row = [];
      field = '';
    } else field += character;
  }
  if (field || row.length) {
    row.push(field);
    rows.push(row);
  }
  if (quoted) throw new Error('人工复核 CSV 包含未闭合引号。');
  return rows;
}
