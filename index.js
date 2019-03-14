#!/usr/bin/env node
const yargs = require('yargs');
const pkg = require('./package.json');
const config = require('./holmes.config.json');
const { execSync } = require('child_process');

const getBranches = () => {
  for (const id of config.gitlab.projectsId) {
    const data = execSync(`curl https://${config.gitlab.domain}/api/v4/projects/${id}/repository/branches?private_token=${config.gitlab.token}`).toString();
    console.log(data);
  }
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
