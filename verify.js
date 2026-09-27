/* 校验脚本：数据一致性 + 成本计算规则 + 边界情况（node site/verify.js） */
const R = require('./data.js');
const errors = [];

/* 1. 结构完整性：6 款工具 */
const want = ['cursor', 'copilot', 'claude', 'codex', 'windsurf', 'gemini'];
const have = R.tools.map(t => t.id);
want.forEach(w => { if (!have.includes(w)) errors.push(`缺少工具: ${w}`); });
if (R.tools.length !== 6) errors.push(`工具数=${R.tools.length}，应为 6`);

/* 2. 来源引用完整性 */
R.tools.forEach(t => t.plans.forEach(p => {
  if (!R.sources[p.src]) errors.push(`${t.name}/${p.name}: src "${p.src}" 不存在于 sources`);
}));

/* 3. 价格合法性：可购买方案月付价必须为正数；null 表示未公开 */
R.tools.forEach(t => t.plans.forEach(p => {
  if (p.inquiry) { if (p.monthly != null) errors.push(`${t.name}/${p.name}: 询价方案不应有 monthly`); return; }
  if (p.monthly == null) return; // 未公开，允许
  if (typeof p.monthly !== 'number' || p.monthly < 0) errors.push(`${t.name}/${p.name}: monthly 非法值 ${p.monthly}`);
}));

/* 4. 成本计算规则（与 index.html 计算器同一套规则） */
function costFor(t, N) {
  const c = t.calc;
  if (!c || (c.monthlyPrice == null && c.perSeat == null))
    return { ok: false, reason: '团队方案需询价或价格未公开，无法给出有效报价' };
  let monthly;
  const lines = [];
  if (c.perSeat != null) { monthly = c.monthlyPrice + c.perSeat * N; lines.push(`基础 ${c.monthlyPrice} + ${c.perSeat}×${N} 席位 = $${monthly}`); }
  else { monthly = c.monthlyPrice * N; lines.push(`${c.monthlyPrice} × ${N} 席位 = $${monthly}`); }
  if (c.minSeats != null && N < c.minSeats) return { ok: false, reason: `低于最低席位（${c.minSeats}）` };
  const hasAnnual = c.annualMonthly != null;
  const annual = hasAnnual ? c.annualMonthly * 12 * N : monthly * 12; // 未公开年付 → 月付×12 估算
  return { ok: true, monthly, annual, estimated: !hasAnnual, lines };
}

/* 5. 期望值断言（基于官方核实价） */
const byId = Object.fromEntries(R.tools.map(t => [t.id, t]));
const Ns = [5, 20, 50, 1, 100];
const expect = (cond, msg) => { if (!cond) errors.push(msg); };

expect(costFor(byId.cursor, 20).monthly === 40 * 20, `Cursor 20人月付应 $800，实得 ${costFor(byId.cursor, 20).monthly}`);
expect(costFor(byId.cursor, 20).estimated === true, 'Cursor 年付未公开，应标记为估算');
expect(costFor(byId.copilot, 20).monthly === 19 * 20, `Copilot 20人月付应 $380，实得 ${costFor(byId.copilot, 20).monthly}`);
expect(costFor(byId.claude, 20).monthly === 25 * 20, `Claude 20人月付应 $500，实得 ${costFor(byId.claude, 20).monthly}`);
expect(costFor(byId.claude, 20).annual === 20 * 12 * 20, `Claude 20人年付应 $4800，实得 ${costFor(byId.claude, 20).annual}`);
expect(costFor(byId.claude, 20).estimated === false, 'Claude 有官方年付价，不应标记估算');
expect(costFor(byId.windsurf, 20).monthly === 80 + 40 * 20, `Windsurf 20人月付应 $880，实得 ${costFor(byId.windsurf, 20).monthly}`);
expect(Math.abs(costFor(byId.gemini, 20).monthly - 22.8 * 20) < 1e-9, `Gemini 20人月付应 $456，实得 ${costFor(byId.gemini, 20).monthly}`);
expect(costFor(byId.gemini, 20).annual === 19 * 12 * 20, `Gemini 20人年付应 $4560，实得 ${costFor(byId.gemini, 20).annual}`);
expect(costFor(byId.codex, 20).ok === false, 'Codex 团队方案需询价，不应给出报价');

/* 6. 快捷档位输出（5/20/50）+ 边界 1 人 */
Ns.forEach(N => {
  const line = R.tools.map(t => {
    const r = costFor(t, N);
    return r.ok ? `${t.id}=$${r.monthly}/mo` : `${t.id}=N/A`;
  }).join('  ');
  console.log(`N=${String(N).padStart(3)}  ${line}`);
});

/* 7. 汇总 */
if (errors.length) { console.error('\n[FAIL] 校验未通过:'); errors.forEach(e => console.error('  - ' + e)); process.exit(1); }
console.log('\n[PASS] 数据一致性与计算规则校验全部通过（' + R.tools.length + ' 款工具，' +
  R.tools.reduce((a, t) => a + t.plans.length, 0) + ' 个方案，' + Object.keys(R.sources).length + ' 个来源）');
