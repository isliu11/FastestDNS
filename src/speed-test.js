const dns = require("dns");
const { promisify } = require("util");
const dnsPacket = require("dns-packet");
const dgram = require("dgram");
const pLimit = require("p-limit");
const cliProgress = require("cli-progress");

const BATCH_SIZE = 100; // 每批测试的DNS服务器数量
const TIMEOUT = 500; // 超时时间(ms)

function isValidIp(ip) {
  if (!ip || typeof ip !== "string") return false;
  const parts = ip.split(".");
  return (
    parts.length === 4 &&
    parts.every((part) => {
      const num = parseInt(part, 10);
      return num >= 0 && num <= 255 && part === num.toString();
    })
  );
}

// 将数组分割成多个批次
function splitIntoBatches(array, size) {
  const batches = [];
  for (let i = 0; i < array.length; i += size) {
    batches.push(array.slice(i, i + size));
  }
  return batches;
}

async function testSingleDns(ip, options = {}) {
  const testDomain = options.testDomain || "google.com";
  return new Promise((resolve, reject) => {
    const socket = dgram.createSocket("udp4");
    let isResolved = false;

    const timeoutId = setTimeout(() => {
      if (isResolved) return;
      isResolved = true;
      socket.close();
      resolve({ ip, rtt: Infinity });
    }, TIMEOUT + 100);

    // 清理函数
    const cleanup = () => {
      clearTimeout(timeoutId);
      socket.close();
    };

    const packet = dnsPacket.encode({
      type: "query",
      id: 1,
      flags: dnsPacket.RECURSION_DESIRED,
      questions: [
        {
          type: "A",
          name: testDomain,
        },
      ],
    });

    const startTime = Date.now();

    socket.on("message", () => {
      if (isResolved) return;
      isResolved = true;
      const rtt = Date.now() - startTime;
      cleanup();
      resolve({ ip, rtt });
    });

    socket.on("error", (err) => {
      if (isResolved) return;
      isResolved = true;
      console.error(`测试 ${ip} 时发生错误:`, err.message);
      cleanup();
      resolve({ ip, rtt: Infinity });
    });

    socket.send(packet, 53, ip, (err) => {
      if (err) {
        if (isResolved) return;
        isResolved = true;
        cleanup();
        resolve({ ip, rtt: Infinity });
      }
    });
  });
}

async function testDnsSpeed(servers, options = {}) {
  if (!Array.isArray(servers) || servers.length === 0) {
    throw new Error("DNS服务器列表不能为空");
  }

  const invalidIps = servers.filter((ip) => !isValidIp(ip));
  if (invalidIps.length > 0) {
    throw new Error(`无效的IP地址: ${invalidIps.join(", ")}`);
  }

  const progressBar = new cliProgress.SingleBar({
    format: "测试进度 [{bar}] {percentage}% | {value}/{total} | 当前: {ip}",
    barCompleteChar: "\u2588",
    barIncompleteChar: "\u2591",
  });

  let completed = 0;
  progressBar.start(servers.length, 0);

  const results = [];
  const batches = splitIntoBatches(servers, BATCH_SIZE);

  for (const batch of batches) {
    const batchPromises = batch.map((ip) =>
      testSingleDns(ip, options).then((result) => {
        completed++;
        progressBar.update(completed, { ip });
        return result;
      })
    );

    const batchResults = await Promise.race([
      Promise.all(batchPromises),
      new Promise((resolve) => setTimeout(() => resolve([]), TIMEOUT + 100)),
    ]);

    results.push(...batchResults.filter((result) => result && result.ip));
  }

  progressBar.stop();
  console.log("\n测试完成！");

  // 按RTT排序并过滤掉超时的结果
  return results
    .filter((result) => result.rtt !== Infinity)
    .sort((a, b) => a.rtt - b.rtt);
}

module.exports = {
  testDnsSpeed,
  isValidIp,
};
