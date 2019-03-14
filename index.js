#!/usr/bin/env node
const yargs = require('yargs');
const pkg = require('./package.json');

yargs
  .version('version', 'バージョン情報の表示', `v${pkg.version}`).alias('v', 'version')
  .help('help', 'ヘルプの表示').alias('h', 'help')
  .argv;
