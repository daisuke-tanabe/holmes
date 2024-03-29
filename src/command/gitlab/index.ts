/*
 * import
 * -------------------------------------------------- */
import { Argv } from 'yargs';
import Gitlab, { Options } from './Gitlab';

/*
 * command scheme
 * -------------------------------------------------- */
export default {
  builder: (yargs: Argv) => {
    return yargs.options({
      all: {
        alias: 'a',
        boolean: true,
        default: false,
        describe: 'すべてのブランチを表示する',
      },
      copy: {
        alias: 'c',
        boolean: true,
        default: false,
        describe: '結果をクリップボードにコピーする',
      },
      merged: {
        alias: 'm',
        boolean: true,
        default: false,
        describe: '"merged branches"をコンソールに表示する',
      },
      remove: {
        alias: 'r',
        boolean: true,
        default: false,
        describe: '対話形式で"branches"を削除する',
      },
      silent: {
        alias: 's',
        boolean: true,
        default: false,
        describe: '結果をコンソールに表示しない',
      },
      trello: {
        alias: 't',
        boolean: true,
        default: false,
        describe: '結果をTrelloの定期カードに投稿する',
      },
      unmerged: {
        alias: 'u',
        boolean: true,
        default: false,
        describe: '"unmerged branches"をコンソールに表示する',
      },
    });
  },
  command: 'gitlab',
  desc: 'Gitlabの操作を行う',
  handler: (options: Options) => {
    const gitlab = new Gitlab(options);
    gitlab.exec();
  },
};
