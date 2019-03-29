/*
 * import
 * -------------------------------------------------- */
import { execSync } from 'mz/child_process';
import ora from 'ora';
import prompts from 'prompts';
import querystring from 'querystring';
import config from '../../../holmes.config.json';
import Fetch from '../utility/Fetch';

/*
 * interface / type
 * -------------------------------------------------- */
interface IGitlab {
  config: Config;
  options: Options;
  projects: Project[];
  result: string[];
  exec: () => void;
  mappingBranchesType: (options: Options) => void;
  addBranchesProperty: (config: Config) => void;
  updateBranchRemovalProperty: (projects: Project[]) => void;
  buildResultLog: (projects: Project[]) => void;
  removeBranch: (projects: Project[]) => void;
}

interface Config {
  token: string;
  domain: string;
  projects: Array<{ id: number; name: string }>;
}

export interface Options {
  copy: boolean;
  merged: boolean;
  remove: boolean;
  silent: boolean;
  unmerged: boolean;
}

interface Branch {
  name: string;
  merged: boolean;
  commit: {
    author_name: string;
  };
  removal: boolean;
}

interface Project {
  id: number;
  name: string;
  branches: Branch[];
}

enum StatusCode {
  SUCCESS = 0,
  WARN = 1,
  ERROR = 2,
}

/*
 * Gitlab
 * -------------------------------------------------- */
const API_V4 = `https://${config.gitlab.domain}/api/v4`;
const QUERY_PRIVATE_TOKEN = `private_token=${config.gitlab.token}`;
const DOUBLE_BORDER = '==================================================';
const getApiUrl = (entryPoint: string) => `${API_V4}${entryPoint}?${QUERY_PRIVATE_TOKEN}`;
const spinner = ora();

export default class Gitlab implements IGitlab {
  public readonly config: Config;
  public readonly options: Options;
  public projects: Project[] = [];
  public result: string[] = [];

  constructor(options: Options) {
    this.options = options;
    this.config = config.gitlab;
  }

  /**
   * 各処理を実行するメソッド
   */
  public exec() {
    if (this.options.remove && this.options.copy) {
      process.stdout.write(`${StatusCode[1]}: "remove"オプションが真なら、"copy"オプションは無効です\n`);
    }

    if (this.options.remove && this.options.silent) {
      process.stdout.write(`${StatusCode[1]}: "remove"オプションが真なら、"silent"オプションは無効です\n`);
    }

    (async () => {
      // プロジェクトに紐づいたブランチを追加する
      await this.addBranchesProperty(this.config);

      // removeオプションが有効ならブランチ削除処理
      if (this.options.remove) {
        // 対話してリポジトリ毎のブランチに削除プロパティを追加する
        await this.updateBranchRemovalProperty(this.projects);

        // ブランチ削除を実行する
        await this.removeBranch(this.projects);
        return;
      }

      // 出力データを追加
      await this.buildResultLog(this.projects);

      // 文字の配列を結合
      const result = this.result.join('');

      // 結果をクリップボードにコピーする
      if (this.options.copy) {
        execSync(`cat <<EOF | pbcopy
${result}
EOF`);
      }

      // サイレントモードでなければ結果をコンソールに出力する
      if (!this.options.silent) {
        process.stdout.write(`${result}`);
      }
    })();
  }

  /**
   * オプションに応じたブランチタイプを返す
   */
  public mappingBranchesType(options: Options) {
    const { merged, unmerged } = options;
    if (merged && unmerged) {
      return 'All';
    }
    if (merged) {
      return 'Merged';
    }
    if (unmerged) {
      return 'Unmerged';
    }
    return 'All';
  }

  /**
   * プロジェクトに紐づいたブランチを追加する
   *
   * @param {Config} _config - this.config
   */
  public async addBranchesProperty({ projects }: Config) {
    process.stdout.write('\nブランチデータを取得します...\n\n');

    // configに設定されたプロジェクトのブランチを取得する
    for (const { id, name } of projects) {
      spinner.start('Fetching...');
      const branchesData = await Fetch.get(getApiUrl(`/projects/${id}/repository/branches`)).then(
        (data) => {
          spinner.succeed(`${StatusCode[0]}: got branches data of ${name}`);
          return JSON.parse(data);
        },
        (error) => {
          spinner.fail(`${StatusCode[2]}: could not get branches data of ${name}`);
          process.stdout.write(`${error}\n`);
        },
      );

      // branchに削除用プロパティremovalを追加し
      // optionによってマージ済みか否かでブランチをfilter
      const branches = branchesData
        .map((branch: Branch) => ({ ...branch, removal: false }))
        .filter(({ merged }: Branch) => {
          if (this.options.merged) {
            return merged;
          }
          if (this.options.unmerged) {
            return !merged;
          }
          return true;
        });

      // ブランチが1つでもあるならpushする
      if (branches.length > 0) {
        this.projects.push({ id, name, branches });
      }
    }

    process.stdout.write('\nブランチデータの取得が完了しました\n\n');
  }

  /**
   * 結果データを追加する
   *
   * @param projects {Project[]} - プロジェクト
   */
  public async buildResultLog(projects: Project[]) {
    const branchesLabel = `[${this.mappingBranchesType(this.options)} branches]`;

    // プロジェクト毎にループして結果を取得する
    for (const project of projects) {
      const { name: projectName, branches } = project;
      const newBranches = branches.reduce((list, { name: branchName, commit }) => {
        list += `- ${branchName} (Author: ${commit.author_name})\n`;
        return list;
      }, '');

      // 結果の文字列を足していく
      this.result.push(`${DOUBLE_BORDER}\n
${projectName}\n
${branchesLabel}
${newBranches}\n`);
    }
  }

  /**
   * ブランチの削除プロパティを更新する
   *
   * @param projects {Project[]} - プロジェクト
   */
  public async updateBranchRemovalProperty(projects: Project[]) {
    process.stdout.write(`${DOUBLE_BORDER}\n`);
    const branchesType = this.mappingBranchesType(this.options);
    const branchesLabel = `[${branchesType} branches]`;

    // プロジェクト毎にループしてブランチを表示する
    for (const project of projects) {
      const { name: projectName, branches } = project;

      process.stdout.write(`\n${projectName}\n\n${branchesLabel}\n`);

      // ブランチの選択肢情報を作成する
      const choicesBranches = branches.map(({ name: branchName }) => ({
        title: branchName,
        value: branchName,
      }));

      // 削除したいブランチを選択
      const { removalBranches } = await prompts([
        {
          choices: choicesBranches,
          message: `${projectName}から削除する${branchesType.toLowerCase()}ブランチを選択してください`,
          name: 'removalBranches',
          type: 'multiselect',
        },
      ]);

      // ブランチに削除プロパティを紐付ける
      removalBranches.forEach((branchName: string) => {
        branches.some((branch) => {
          const isEqual = branch.name === branchName;
          if (isEqual) {
            branch.removal = isEqual;
          }
          return isEqual;
        });
      });

      process.stdout.write(`\n${DOUBLE_BORDER}\n`);
    }
  }

  /**
   * ブランチの削除プロパティに従ってブランチを削除する
   *
   * @param projects {Project[]} - プロジェクト
   */
  public async removeBranch(projects: Project[]) {
    // 削除フラグが真になっているブランチを含むプロジェクトだけにする
    const projectContainRemovalBranches = projects.reduce((result: Project[], project: Project) => {
      const branches = project.branches.filter(({ removal }) => removal);
      if (branches.length > 0) {
        result.push({
          ...project,
          branches,
        });
      }
      return result;
    }, []);

    // 削除するブランチがない場合は処理を終了する
    if (projectContainRemovalBranches.length === 0) {
      process.stdout.write('\n削除するブランチが選択されていません\n\n');
      return;
    }

    // 削除が予定されているブランチを表示する
    for (const { name: projectName, branches } of projectContainRemovalBranches) {
      process.stdout.write('\n削除予定ブランチ\n');
      process.stdout.write(`\n[${projectName}]\n`);
      for (const { name: branchName } of branches) {
        process.stdout.write(`- ${branchName}\n`);
      }
      process.stdout.write('\n');
    }

    // 削除前の最終確認と実行を行う
    for (const { id: projectId, name: projectName, branches } of projectContainRemovalBranches) {
      // 削除するか最終確認
      const { isRemove } = await prompts([
        {
          active: 'yes',
          inactive: 'no',
          message: '上記の通りにブランチを削除してよろしいですか？',
          name: 'isRemove',
          type: 'toggle',
        },
      ]);

      // 削除しないならメッセージを表示して終了する
      if (!isRemove) {
        process.stdout.write('\nブランチの削除をキャンセルしました\n\n');
        return;
      }

      // ブランチの削除を行う
      process.stdout.write(`\n[${projectName}]\n`);
      for (const { name: branchName } of branches) {
        spinner.start('Fetching...');
        await Fetch.delete(
          getApiUrl(`/projects/${projectId}/repository/branches/${querystring.escape(branchName)}`),
        ).then(
          () => {
            spinner.succeed(`${StatusCode[0]}: ${branchName}`);
          },
          (error) => {
            spinner.succeed(`${StatusCode[2]}: ${error} - ${branchName}`);
          },
        );
      }

      process.stdout.write('\nブランチの削除が完了しました\n\n');
    }
  }
}
