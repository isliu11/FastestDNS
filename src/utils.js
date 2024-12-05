const fs = require('fs').promises;
const path = require('path');

async function readJsonFile(filePath) {
  try {
    const data = await fs.readFile(filePath, 'utf8');
    return JSON.parse(data);
  } catch (err) {
    throw new Error(`读取文件失败: ${err.message}`);
  }
}

async function writeJsonFile(filePath, data) {
  try {
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    await fs.writeFile(filePath, JSON.stringify(data, null, 2));
  } catch (err) {
    throw new Error(`写入文件失败: ${err.message}`);
  }
}

module.exports = {
  readJsonFile,
  writeJsonFile
}; 