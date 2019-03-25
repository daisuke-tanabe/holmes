/*
 * node_modules
 * -------------------------------------------------- */
import { Argv } from 'yargs';
import Gitlab, { Options } from './Gitlab';

/*
 * command scheme
 * -------------------------------------------------- */
export default {
  builder: (yargs: Argv) => {
    yargs.options({
      merged: {
        alias: 'm',
        boolean: true,
        default: false,
        describe: '"merged branches"を表示する',
      },
      remove: {
        alias: 'r',
        boolean: true,
        default: false,
        describe: '対話形式で"branches"を削除する',
      },
      unmerged: {
        alias: 'u',
        boolean: true,
        default: false,
        describe: '"unmerged branches"を表示する',
      },
    });
  },
  command: 'gitlab',
  desc: 'Gitlabの操作を行う',
  handler: ({ remove, merged, unmerged }: Options) => {
    new Gitlab({ remove, merged, unmerged });
  },
};
