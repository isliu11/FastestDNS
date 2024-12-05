const axios = require("axios");
const https = require("https");
const HttpsProxyAgent = require("https-proxy-agent");
const fs = require("fs").promises;
const path = require("path");
const { pipeline } = require("stream/promises");
const { createWriteStream } = require("fs");

// 创建缓存目录
const CACHE_DIR = path.join(__dirname, "../cache");
const CACHE_DURATION = 24 * 60 * 60 * 1000; // 24小时的缓存时间

async function ensureCacheDir() {
  try {
    await fs.mkdir(CACHE_DIR, { recursive: true });
  } catch (err) {
    console.error("创建缓存目录失败:", err);
  }
}

async function downloadJson(url, proxy) {
  const fileName = path.join(
    CACHE_DIR,
    Buffer.from(url).toString("base64") + ".json"
  );

  console.log(`\n开始处理 ${url}`);
  try {
    // 检查缓存
    const stat = await fs.stat(fileName);
    if (Date.now() - stat.mtime.getTime() < CACHE_DURATION) {
      console.log(`使用缓存的数据: ${url}`);
      const data = await fs.readFile(fileName, "utf8");
      return JSON.parse(data);
    }
  } catch (err) {
    console.log("缓存未命中或已��");
  }

  const config = {
    timeout: 30000,
    headers: {
      Accept: "application/json",
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
    },
    httpsAgent: new https.Agent({
      rejectUnauthorized: false,
    }),
    validateStatus: false, // 允许任何状态码
  };

  if (proxy) {
    config.httpsAgent = new HttpsProxyAgent(proxy);
    console.log("使用代理下载:", proxy);
  }

  console.log("开始下载...");
  const response = await axios.get(url, config);

  console.log("状态码:", response.status);
  console.log("响应头:", JSON.stringify(response.headers, null, 2));

  if (response.status === 200) {
    const data = response.data;
    console.log("数据类型:", typeof data);
    console.log("数据示例:", JSON.stringify(data).slice(0, 200) + "...");

    // 确保数据是对象或数组后再写入缓存
    if (typeof data === "object" && data !== null) {
      await fs.writeFile(fileName, JSON.stringify(data, null, 2));
      console.log("下载完成，数据已缓存");
      return data;
    } else {
      throw new Error("响应不是有效的JSON数据");
    }
  } else {
    console.log("响应内容:", response.data);
    throw new Error(`HTTP ${response.status}: ${response.statusText}`);
  }
}

async function fetchWithRetry(url, retries = 3, proxy) {
  await ensureCacheDir();

  for (let i = 0; i < retries; i++) {
    try {
      return await downloadJson(url, proxy);
    } catch (err) {
      console.error(`第 ${i + 1} 次尝试失败:`, {
        message: err.message,
        code: err.code,
        response: err.response?.data,
      });
      if (i === retries - 1) throw err;
      console.log(`将在 ${i + 1}秒后重试...`);
      await new Promise((resolve) => setTimeout(resolve, 1000 * (i + 1)));
    }
  }
}

const SOURCES = [
  {
    url: "https://download.dnscrypt.info/resolvers-list/json/public-resolvers.json",
    transform: (data) => {
      return data
        .map((item) => item.addrs)
        .flat()
        .filter(Boolean)
        .filter((ip) => {
          try {
            // 过滤IPv4地址
            const parts = ip.split(".");
            const flag =
              parts.length === 4 &&
              parts.every((part) => {
                const num = parseInt(part, 10);
                return !isNaN(num) && num >= 0 && num <= 255;
              }) &&
              !ip.includes(":"); // 排除IPv6地址
            if (!flag) console.log("无效的IP地址:", ip);
            return flag;
          } catch (err) {
            console.log("无效的IP地址:", ip);
            return false;
          }
        });
    },
  },
  {
    url: "https://public-dns.info/nameservers.json",
    transform: (data) =>
      data
        .filter(Boolean)
        .filter((item) => {
          // 只选择可靠的IPv4 DNS服务器
          return (
            item.ip &&
            typeof item.ip === "string" && // 确保 ip 是字符串
            !item.ip.includes(":") && // 排除IPv6
            (item.reliability === undefined || item.reliability >= 0.95) && // 可靠性大于95%或未定义
            !item.error // 没有错误标记
          );
        })
        .map((item) => item.ip)
        .filter((ip) => {
          try {
            // 再次验证IP格式
            const parts = ip.split(".");
            const flag =
              parts.length === 4 &&
              parts.every((part) => {
                const num = parseInt(part, 10);
                return !isNaN(num) && num >= 0 && num <= 255;
              });
            if (!flag) console.log("无效的IP地址:", ip);
            return flag;
          } catch (err) {
            console.log("无效的IP地址:", ip);
            return false;
          }
        }),
  },
  {
    url: null,
    transform: () => [
      "8.8.8.8", // Google DNS
      "8.8.4.4", // Google DNS
      "1.1.1.1", // Cloudflare
      "1.0.0.1", // Cloudflare
      "223.5.5.5", // AliDNS
      "223.6.6.6", // AliDNS
      "119.29.29.29", // DNSPod
      "180.76.76.76", // Baidu DNS
      "114.114.114.114", // 114 DNS
    ],
  },
];

async function collectDnsServers(proxy) {
  const servers = new Set();

  for (const source of SOURCES) {
    try {
      if (!source.url) {
        source.transform().forEach((ip) => servers.add(ip));
        continue;
      }

      console.log(`正在获取 ${source.url} 的DNS服务器列表...`);
      const data = await fetchWithRetry(source.url, 3, proxy);
      console.log("获取到的数据类型:", typeof data);
      if (!Array.isArray(data)) {
        console.log("警告: 获取到的数据不是数组");
        continue;
      }
      console.log("数据示例:", JSON.stringify(data).slice(0, 200) + "...");
      const ips = source.transform(data);
      console.log("转换后的IP数量:", ips?.length || 0);
      if (Array.isArray(ips)) {
        console.log(`从 ${source.url} 获取到 ${ips.length} 个DNS服务器`);
        ips.forEach((ip) => servers.add(ip));
      }
    } catch (err) {
      console.error("完整错误信息:", err);
      console.error(
        `从 ${source.url || "内置列表"} 获取DNS服务器列表失败:`,
        err.code === "ECONNRESET"
          ? "连接被重置"
          : err.code === "ETIMEDOUT"
          ? "连接超时"
          : err.message
      );
    }
  }

  if (servers.size === 0) {
    throw new Error("无法获取DNS服务器列表");
  }

  console.log(`总共收集到 ${servers.size} 个唯一的DNS服务器`);
  return Array.from(servers);
}

module.exports = {
  collectDnsServers,
};
