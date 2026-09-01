const STATUS = {
  PASS: 'PASS',
  DEGRADED: 'DEGRADED',
  NOT_CONFIGURED: 'NOT_CONFIGURED',
  FAIL: 'FAIL'
};

const check = (name, status, detail = '') => ({ name, status, detail });

const summarize = (results) => {
  const counts = Object.values(STATUS).reduce((acc, s) => {
    acc[s] = results.filter((r) => r.status === s).length;
    return acc;
  }, {});
  const overall = results.some((r) => r.status === STATUS.FAIL)
    ? STATUS.FAIL
    : results.some((r) => r.status === STATUS.NOT_CONFIGURED)
      ? STATUS.DEGRADED
      : results.some((r) => r.status === STATUS.DEGRADED)
        ? STATUS.DEGRADED
        : STATUS.PASS;
  return { overall, counts, results };
};

const printResults = (title, results) => {
  console.log(`\n=== ${title} ===`);
  for (const r of results) {
    console.log(`  [${r.status}] ${r.name}${r.detail ? ` — ${r.detail}` : ''}`);
  }
};

const ms = (start) => Number(process.hrtime.bigint() - start) / 1e6;

const timed = async (fn) => {
  const start = process.hrtime.bigint();
  const result = await fn();
  return { result, latencyMs: ms(start) };
};

module.exports = {
  STATUS,
  check,
  summarize,
  printResults,
  timed,
  ms
};
