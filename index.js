#!/usr/bin/env node
const yargs = require('yargs');
const pkg = require('./package.json');
const config = require('./holmes.config.json');

const getBranches = () => {
  console.log(config.gitlab.projectsId);
};

const branch = {
  command: 'branch',
  aliases: ['b'],
  desc: 'チームが抱えているGitlabのリポジトリからトピックブランチを取得',
  handler: argv => {
    getBranches();
  }
};

yargs
  .command(branch)
  .version('version', 'バージョン情報の表示', `v${pkg.version}`).alias('v', 'version')
  .help('help', 'ヘルプの表示').alias('h', 'help')
  .argv;
