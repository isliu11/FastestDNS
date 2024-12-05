const assert = require('assert').strict;
const { testDnsSpeed } = require('../src/speed-test');
const { collectDnsServers } = require('../src/collector');
const { readJsonFile, writeJsonFile } = require('../src/utils');
const path = require('path');
const fs = require('fs').promises;

async function runTests() {
  console.log('开始运行测试...\n');
  let passed = 0;
  let failed = 0;

  async function test(name, fn) {
    try {
      await fn();
      console.log(`✓ ${name}`);
      passed++;
    } catch (err) {
      console.error(`✗ ${name}`);
      console.error('  错误:', err.message);
      failed++;
    }
  }

  // 测试DNS速度测试功能
  await test('DNS速度测试 - 基本功能', async () => {
    const results = await testDnsSpeed(['8.8.8.8', '1.1.1.1'], {
      testDomain: 'google.com'
    });
    assert(Array.isArray(results), '结果应该是数组');
    assert(results.length > 0, '结果不应为空');
    assert(results[0].ip, '结果应包含IP');
    assert(typeof results[0].rtt === 'number', 'RTT应该是数字');
  });

  // 测试文件读写功能
  await test('文件读写功能', async () => {
    const testFile = path.join(__dirname, 'test.json');
    const testData = { test: 'data' };
    
    await writeJsonFile(testFile, testData);
    const readData = await readJsonFile(testFile);
    assert.deepEqual(readData, testData, '读写的数据应该相同');
    
    await fs.unlink(testFile).catch(() => {}); // 清理测试文件
  });

  // 测试DNS服务器收集功能
  await test('DNS服务器收集 - 内置列表', async () => {
    const servers = await collectDnsServers();
    assert(Array.isArray(servers), '服务器列表应该是数组');
    assert(servers.length > 0, '应该至少有内置的DNS服务器');
    assert(servers.includes('8.8.8.8'), '应该包含Google DNS');
  });

  // 测试IP格式验证
  await test('IP格式验证', async () => {
    const { testDnsSpeed } = require('../src/speed-test');
    const invalidIps = ['invalid', '256.256.256.256', '1.1.1'];
    const validIps = ['8.8.8.8', '1.1.1.1'];
    
    try {
      await testDnsSpeed(invalidIps);
      assert.fail('应该拒绝无效的IP');
    } catch (err) {
      assert(err.message.includes('无效的IP'), '应该提示IP无效');
    }
  });

  console.log(`\n测试完成: ${passed} 通过, ${failed} 失败`);
  
  if (failed > 0) {
    process.exit(1);
  }
}

runTests().catch(err => {
  console.error('���试运行失败:', err);
  process.exit(1);
}); 