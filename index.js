#!/usr/bin/env node
const yargs = require('yargs');
const pkg = require('./package.json');
const config = require('./holmes.config.json');
const { execSync } = require('child_process');

const token = `private_token=${config.gitlab.token}`;

// TODO ブランチを取得するという名の、マージされていないブランチを表示するという曖昧さ
const getBranches = (argv) => {
  // const { merged, m, unmerged, u } = argv;

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

  projects.forEach((project) => {
    const { id, name, web_url, branches } = project;
    const mergedBranches = branches.filter(({ merged }) => merged);
    const unmergedBranches = branches.filter(({ merged }) => !merged);

    console.log(`[${id}] ${name} - ${web_url}`);

    // マージされているブランチを表示する
    console.log(' merged branches');
    mergedBranches.forEach(branch => {
      const { name, author } = branch;
      console.log(` - ${name} (Author: ${author})`);
    });

    // マージされていないブランチを表示する
    console.log('\n unmerged branches');
    unmergedBranches.forEach(branch => {
      const { name, author } = branch;
      console.log(` - ${name} (Author: ${author})`);
    });

    console.log('\n==================================================\n');
  });
};

// TODO オプションなどで増やすなどしたほうが命名もよさそう
const gitlab = {
  command: 'gitlab',
  desc: 'チームが抱えているGitlabのリポジトリからトピックブランチを取得',
  builder: yargs => {
    yargs.options({
      merged: {
        alias: 'm',
        default: false,
        describe: '"merged branches"を表示する'
      },
      unmerged: {
        alias: 'u',
        default: false,
        describe: '"unmerged branches"を表示する'
      }
    });
  },
  handler: argv => {
    console.log(argv);
    getBranches(argv);
  }
};

// 一応コマンドが追加できる余地は残してみた
yargs
  .command(gitlab)
  .version('version', 'バージョン情報の表示', `v${pkg.version}`).alias('v', 'version')
  .help('help', 'ヘルプの表示').alias('h', 'help')
  .argv;
