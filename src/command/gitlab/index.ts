/**
 * node_modules
 * -------------------------------------------------- */
import Gitlab, { Options } from './Gitlab';
import { Argv } from 'yargs';

/**
 * command scheme
 * -------------------------------------------------- */
module.exports = {
  command: 'gitlab',
  desc: 'Gitlabの操作を行う',
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
  handler: ({ remove, merged, unmerged }: Options) => {
    new Gitlab({ remove, merged, unmerged });
  }
};
