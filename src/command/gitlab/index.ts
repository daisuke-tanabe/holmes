import Gitlab from './Gitlab';
import { Argv } from 'yargs';

module.exports = {
  command: 'gitlab',
  desc: 'チームが抱えているGitlabのリポジトリからトピックブランチを取得',
  builder: (yargs: Argv) => {
    yargs.options({
      remove: {
        alias: 'r',
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
  handler: ({ remove, merged, unmerged }: { remove: boolean, merged: boolean, unmerged: boolean }) => {
    new Gitlab({ remove, merged, unmerged });
  }
};
