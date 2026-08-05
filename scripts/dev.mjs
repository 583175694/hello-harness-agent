import { spawn } from 'node:child_process';
import { createConnection } from 'node:net';

const services = [
  {
    name: 'Web',
    args: ['--filter', '@harness/web', 'dev'],
    port: 4317,
    url: 'http://127.0.0.1:4317/agent',
  },
  {
    name: 'API',
    args: ['--filter', '@harness/api', 'dev'],
    port: 4318,
    url: 'http://127.0.0.1:4318/healthz',
  },
];

const children = [];
let failedService = null;
let shuttingDown = false;

// 返回当前平台可执行的 pnpm 命令名。
function command() {
  return process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm';
}

// 启动一个子服务并转发其标准输出。
function startService(service) {
  const child = spawn(command(), service.args, {
    cwd: process.cwd(),
    env: process.env,
    stdio: ['inherit', 'pipe', 'pipe'],
  });

  children.push(child);
  child.stdout.on('data', (chunk) => process.stdout.write(`[${service.name}] ${chunk}`));
  child.stderr.on('data', (chunk) => process.stderr.write(`[${service.name}] ${chunk}`));
  child.on('error', (error) => {
    failedService = { name: service.name, message: error.message };
  });
  child.on('exit', (code, signal) => {
    if (!shuttingDown && code !== 0) {
      failedService = {
        name: service.name,
        message: signal ? `退出信号 ${signal}` : `退出码 ${code}`,
      };
    }
  });
}

// 检查服务健康地址是否已经可以访问。
async function isReady(url) {
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(1000) });
    return response.ok;
  } catch {
    return false;
  }
}

// 检查本机端口是否已经被占用。
function isPortInUse(port) {
  return new Promise((resolve) => {
    const socket = createConnection({ host: '127.0.0.1', port });
    socket.once('connect', () => {
      socket.destroy();
      resolve(true);
    });
    socket.once('error', () => resolve(false));
  });
}

// 在超时之前轮询服务是否就绪。
async function waitForReady(service, timeoutMs = 60000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (failedService) return false;
    if (await isReady(service.url)) return true;
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  return false;
}

// 停止脚本启动的所有子服务。
function stopChildren() {
  shuttingDown = true;
  for (const child of children) {
    if (!child.killed) child.kill('SIGTERM');
  }
}

// 检查端口、启动服务并输出可访问地址。
async function main() {
  const occupied = [];
  for (const service of services) {
    if (await isPortInUse(service.port)) occupied.push(`${service.name} ${service.port}`);
  }
  if (occupied.length) {
    console.error(`端口已被占用：${occupied.join('、')}。请先停止已有服务后再运行 pnpm dev。`);
    process.exitCode = 1;
    return;
  }

  services.forEach(startService);

  const ready = await Promise.all(services.map((service) => waitForReady(service)));
  if (ready.every(Boolean)) {
    // 给遇到端口冲突的子进程留出报告退出状态的时间。
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  if (!ready.every(Boolean) || failedService) {
    stopChildren();
    if (failedService) {
      console.error(`\n${failedService.name} 启动失败：${failedService.message}`);
    } else {
      console.error('\n服务启动超时，请检查端口和环境配置。');
    }
    process.exitCode = 1;
    return;
  }

  console.log('\n开发服务已启动：');
  console.log(`Web: ${services[0].url}`);
  console.log(`API: ${services[1].url}`);
  console.log('\n按 Ctrl+C 停止 Web 和 API。\n');
}

process.once('SIGINT', () => {
  stopChildren();
});
process.once('SIGTERM', () => {
  stopChildren();
});

void main();
