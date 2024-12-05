#!/usr/bin/env node

const { program } = require("commander");
const { collectDnsServers } = require("../src/collector");
const { testDnsSpeed } = require("../src/speed-test");
const { readJsonFile, writeJsonFile } = require("../src/utils");
const path = require("path");

const DNS_LIST_FILE = path.join(__dirname, "../data/dns-list.json");

program
  .option("-i, --input <ips>", "输入IP列表进行测速，用逗号分隔")
  .option("-u, --update", "更新DNS服务器列表")
  .option("-d, --domain <domain>", "指定测试域名", "google.com")
  .option(
    "-p, --proxy <proxy>",
    "指定HTTP代理地址，例如: http://127.0.0.1:7890"
  )
  .parse(process.argv);

const options = program.opts();

async function main() {
  console.log("DEBUG: 启动参数:", options);

  if (options.proxy) {
    process.env.HTTP_PROXY = options.proxy;
    process.env.HTTPS_PROXY = options.proxy;
    console.log("使用代理:", options.proxy);
  }

  if (options.update) {
    console.log("正在更新DNS服务器列表...");
    const servers = await collectDnsServers();
    console.log("DEBUG: 收集到的服务器数量:", servers.length);
    await writeJsonFile(DNS_LIST_FILE, servers);
    console.log("DNS服务器列表更新完成！");
    return;
  }

  let dnsServers = [];
  if (options.input) {
    dnsServers = options.input.split(",").map((ip) => ip.trim());
    console.log("DEBUG: 测试的IP列表:", dnsServers);
  } else {
    try {
      dnsServers = await readJsonFile(DNS_LIST_FILE);
    } catch (err) {
      console.log("未找到DNS列表或列表无效，尝试获取新列表...");
      try {
        dnsServers = await collectDnsServers();
        await writeJsonFile(DNS_LIST_FILE, dnsServers);
      } catch (collectErr) {
        console.error("获取DNS列表失败:", collectErr.message);
        console.log("使用内置DNS服务器列表...");
        dnsServers = [
          "8.8.8.8", // Google DNS
          "8.8.4.4", // Google DNS
          "1.1.1.1", // Cloudflare
          "1.0.0.1", // Cloudflare
          "223.5.5.5", // AliDNS
          "223.6.6.6", // AliDNS
        ];
      }
    }
  }

  if (!Array.isArray(dnsServers) || dnsServers.length === 0) {
    console.error("错误: 无法获取有效的DNS服务器列表");
    process.exit(1);
  }

  console.log(`开始测试 ${dnsServers.length} 个DNS服务器...`);
  const results = await testDnsSpeed(dnsServers, {
    testDomain: options.domain,
  });
  console.log("DEBUG: 所有测试结果:", results);
  const topTwo = results.slice(0, 2);

  console.log("\n最快的DNS服务器:");
  topTwo.forEach((result, index) => {
    console.log(`${index + 1}. ${result.ip} (RTT: ${result.rtt}ms)`);
  });
}

main().catch((err) => {
  console.error("程序运行出错:", err.message);
  process.exit(1);
});
