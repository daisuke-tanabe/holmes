const Gitlab =  require('./Gitlab');

module.exports = {
  command: 'gitlab',
  desc: 'チームが抱えているGitlabのリポジトリからトピックブランチを取得',
  builder: yargs => {
    yargs.options({
      delete: {
        alias: 'd',
        boolean: true,
        default: false,
        describe: '対話形式で"branches"を削除する'
      },
      merged: {
        alias: 'm',
        boolean: true,
        default: false,
        describe: '"merged branches"を表示する'
      },
      unmerged: {
        alias: 'u',
        boolean: true,
        default: false,
        describe: '"unmerged branches"を表示する'
      }
    });
  },
  handler: (argv) => {
    new Gitlab(argv);
  }
};
