// Run on the deployment host with Node --env-file=.env deploy/smoke-sandbox.cjs.
const { createRequire } = require('node:module');
const path = require('node:path');
const apiRequire = createRequire(path.resolve(__dirname, '../apps/api/package.json'));
const { Sandbox } = apiRequire('@alibaba-group/opensandbox');

async function main() {
  const sandbox = await Sandbox.create({
    connectionConfig: {
      domain: process.env.SANDBOX_DOMAIN,
      apiKey: process.env.SANDBOX_API_KEY,
      protocol: 'http',
      useServerProxy: true,
    },
    image: process.env.SANDBOX_IMAGE,
    timeoutSeconds: 120,
    networkPolicy: { defaultAction: 'deny', egress: [] },
    metadata: { purpose: 'hello-harness-deployment-smoke' },
  });
  try {
    const result = await sandbox.commands.run(
      'echo hello-harness-agent && python3 --version && agent-browser --version && agent-browser open about:blank && agent-browser close',
      { workingDirectory: '/workspace', timeoutSeconds: 60 },
    );
    console.log(JSON.stringify({
      exitCode: result.exitCode,
      stdout: result.logs.stdout.map((entry) => entry.text).join(''),
      stderr: result.logs.stderr.map((entry) => entry.text).join(''),
    }));
    if (result.exitCode !== 0) process.exitCode = 1;
  } finally {
    await sandbox.kill();
    await sandbox.close();
  }
}
main().catch((error) => { console.error(error.message); process.exitCode = 1; });
