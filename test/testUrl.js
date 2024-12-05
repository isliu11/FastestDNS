const axios = require('axios');
const https = require('https');
const HttpsProxyAgent = require('https-proxy-agent');

async function testUrl(url, proxy = null) {
  console.log(`\n测试URL: ${url}`);
  
  const config = {
    timeout: 30000,
    headers: {
      'Accept': 'application/json',
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
    },
    httpsAgent: new https.Agent({
      rejectUnauthorized: false
    }),
    validateStatus: false // 允许任何状态码
  };

  if (proxy) {
    config.httpsAgent = new HttpsProxyAgent(proxy);
    console.log('使用代理:', proxy);
  }

  try {
    const response = await axios.get(url, config);
    console.log('状态码:', response.status);
    console.log('响应头:', JSON.stringify(response.headers, null, 2));
    
    if (response.status === 200) {
      const data = response.data;
      console.log('数据类型:', typeof data);
      console.log('数据示例:', JSON.stringify(data).slice(0, 200) + '...');
      return true;
    } else {
      console.log('响应内容:', response.data);
      return false;
    }
  } catch (err) {
    console.error('错误详情:', {
      message: err.message,
      code: err.code,
      response: err.response?.data,
      stack: err.stack
    });
    return false;
  }
}

async function main() {
  const urls = [
    'https://download.dnscrypt.info/resolvers-list/json/public-resolvers.json',
    'https://public-dns.info/nameservers.json'
  ];

  for (const url of urls) {
    const success = await testUrl(url, process.env.HTTP_PROXY);
    console.log(`URL ${url} 测试${success ? '成功' : '失败'}\n`);
  }
}

main().catch(console.error);
