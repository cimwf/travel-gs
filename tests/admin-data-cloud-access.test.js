#!/usr/bin/env node

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const adminRoot = path.resolve(root, '..', 'travel-be-gs', 'src');
const extensions = new Set(['.ts', '.tsx']);
const files = [];

function walk(directory) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) walk(fullPath);
    else if (extensions.has(path.extname(entry.name))) files.push(fullPath);
  }
}

walk(adminRoot);
const directDatabaseFiles = files.filter((file) => /\.collection\s*\(/.test(fs.readFileSync(file, 'utf8')));
assert.deepStrictEqual(directDatabaseFiles, [], `后台仍存在客户端数据库直连：${directDatabaseFiles.join(', ')}`);

const handler = fs.readFileSync(path.join(root, 'cloudfunctions', 'api', 'handlers', 'adminData.js'), 'utf8');
const apiIndex = fs.readFileSync(path.join(root, 'cloudfunctions', 'api', 'index.js'), 'utf8');
assert(handler.includes("places: { collection: 'places'"));
assert(handler.includes("images: { collection: 'beImages'"));
assert(handler.includes('requireEditor(data.adminId)'));
assert(apiIndex.includes("case 'admin/dataList'"));
assert(apiIndex.includes("case 'admin/login'"));

console.log('PASS admin frontend uses cloud functions instead of direct database access');
