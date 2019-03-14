#!/usr/bin/env node
const yargs = require('yargs');
const pkg = require('./package.json');
const config = require('./holmes.config.json');
const { execSync } = require('child_process');

const token = `private_token=${config.gitlab.token}`;

// TODO ブランチを取得するという名の、マージされていないブランチを表示するという曖昧さ
const getBranches = () => {
  // 自身のアカウントに紐づいているgroupsのデータを取得する
  const groupsData = execSync(`curl -s https://${config.gitlab.domain}/api/v4/groups?${token}`).toString();

  // groupsデータからgroupのidを取得する
  const groupsId = JSON.parse(groupsData).map(({id}) => id);

  // groupのidから紐付いているprojectのidから紐付いたブランチをもたせたデータを作成
  const projects = groupsId.reduce((result, id) => {
    const groupData = execSync(`curl -s https://${config.gitlab.domain}/api/v4/groups/${id}?${token}`).toString();
    const projects = JSON.parse(groupData).projects;

    projects.forEach((project) => {
      const { id, name, web_url } = project;
      const branchesData = execSync(`curl -s https://${config.gitlab.domain}/api/v4/projects/${id}/repository/branches?${token}`).toString();
      const branches = JSON.parse(branchesData).map(({ name, merged, commit }) => ({ name, merged, author: commit.author_name }));

      result.push({
        id,
        name,
        web_url,
        branches,
      });
    });
    return result;
  }, []);

  // マージされていないブランチをコンソールに表示する
  projects.forEach((project) => {
    const { id, name, web_url, branches } = project;
    const unmergedBranches = branches.filter(({ merged }) => merged);

    console.log(`[${id}] ${name}`);
    console.log(' merged branches');
    unmergedBranches.forEach(branch => {
      const { name, author } = branch;
      console.log(` - ${name} (Author: ${author})`);
    });
    console.log(`${web_url}\n`);
  });
};

// TODO オプションなどで増やすなどしたほうが命名もよさそう
const branch = {
  command: 'branch',
  aliases: ['b'],
  desc: 'チームが抱えているGitlabのリポジトリからトピックブランチを取得',
  handler: argv => {
    getBranches();
  }
};

// 一応コマンドが追加できる余地は残してみた
yargs
  .command(branch)
  .version('version', 'バージョン情報の表示', `v${pkg.version}`).alias('v', 'version')
  .help('help', 'ヘルプの表示').alias('h', 'help')
  .argv;
