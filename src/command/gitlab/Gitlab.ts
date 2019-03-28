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
  projectsContainedBranches: ProjectContainedBranches[];
  projectsContainedRemovalBranches: ProjectContainedRemovalBranches[];
  result: string[];
  exec: () => void;
  filteringBranchesType: (options: Options) => void;
  appendProjects: (config: Config) => void;
  appendResult: (projects: ProjectContainedBranches[]) => void;
  appendReservedBranchesToProjects: (projects: ProjectContainedBranches[]) => void;
  removeBranches: (projects: ProjectContainedRemovalBranches[]) => void;
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
}

interface Project {
  id: number;
  name: string;
}

type ProjectContainedBranches = Project & { branches: Branch[] };

type ProjectContainedRemovalBranches = Project & { branchesName: string[] };

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
  public projectsContainedBranches: ProjectContainedBranches[] = [];
  public projectsContainedRemovalBranches: ProjectContainedRemovalBranches[] = [];
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
      process.stdout.write('WARN: "remove"オプションが真なら、"copy"オプションは無効です\n');
    }

    if (this.options.remove && this.options.silent) {
      process.stdout.write('WARN: "remove"オプションが真なら、"silent"オプションは無効です\n');
    }

    if (this.options.remove && (this.options.merged || this.options.unmerged)) {
      process.stdout.write('ERROR: "remove"オプションが真なら、"merged"及び"unmerged"オプションは有効にできません\n');
      process.exit(1);
    }

    (async () => {
      // this.projectsにデータを追加
      await this.appendProjects(this.config);

      // removeオプションが有効ならブランチ削除処理
      if (this.options.remove) {
        // this.projectsContainedRemovalBranchesにデータを追加
        await this.appendReservedBranchesToProjects(this.projectsContainedBranches);
        await this.removeBranches(this.projectsContainedRemovalBranches);
        return;
      }

      // this.resultにデータを追加
      await this.appendResult(this.projectsContainedBranches);

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
  public filteringBranchesType(options: Options) {
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
   * プロジェクト(this.projects)にデータを追加する
   *
   * @param {Config} _config - this.config
   */
  public async appendProjects({ projects }: Config) {
    process.stdout.write('\nFetching branch data ...\n\n');
    for (const { id, name } of projects) {
      spinner.start('Fetching...');
      const apiUrl = getApiUrl(`/projects/${id}/repository/branches`);
      const branchesData = Fetch.get(apiUrl);
      const branchesJson = await branchesData.then(
        (data) => {
          spinner.succeed(`SUCCESS: got branches data of ${name}`);
          return JSON.parse(data);
        },
        (error) => {
          spinner.fail(`FAILED: could not get branches data of ${name}`);
          process.stdout.write(`${error}\n`);
        },
      );
      const branches = branchesJson.filter(({ merged }: Branch) => {
        if (this.options.merged) {
          return merged;
        }
        if (this.options.unmerged) {
          return !merged;
        }
        return true;
      });
      this.projectsContainedBranches.push({ id, name, branches });
    }

    process.stdout.write('\nCompleted!!\n\n');
  }

  /**
   * 結果(this.result)にデータを追加する
   *
   * @param projects {Project[]} - プロジェクト
   */
  public async appendResult(projects: ProjectContainedBranches[]) {
    const branchesLabel = `[${this.filteringBranchesType(this.options)} branches]`;

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
   * プロジェクト(this.projectsContainedRemovalBranches)に削除予定ブランチを含んだデータを追加する
   *
   * @param projects {Project[]} - プロジェクト
   */
  public async appendReservedBranchesToProjects(projects: ProjectContainedBranches[]) {
    process.stdout.write(`${DOUBLE_BORDER}\n`);
    const branchesType = this.filteringBranchesType(this.options);
    const branchesLabel = `[${branchesType} branches]`;

    // プロジェクト毎にループしてブランチを表示する
    for (const { id: projectId, name: projectName, branches } of projects) {
      process.stdout.write(`\n${projectName}\n\n${branchesLabel}\n`);

      // ブランチの選択肢情報を作成する
      const choicesBranches = branches.map(({ name: branchName }) => ({
        title: branchName,
        value: branchName,
      }));

      // 選択肢できるブランチがなかった場合は次のループへ
      if (choicesBranches.length === 0) {
        process.stdout.write(`"${projectName}"には該当するブランチが存在しません\n`);
        process.stdout.write(`\n${DOUBLE_BORDER}\n`);
        continue;
      }

      // 削除したいブランチを選択
      const { removalBranches } = await prompts([
        {
          choices: choicesBranches,
          message: `${projectName}から削除する${branchesType.toLowerCase()}ブランチを選択してください`,
          name: 'removalBranches',
          type: 'multiselect',
        },
      ]);

      // 削除予定ブランチを含んだプロジェクトを作成
      if (removalBranches.length !== 0) {
        this.projectsContainedRemovalBranches.push({
          branchesName: removalBranches || [],
          id: projectId,
          name: projectName,
        });
      }

      process.stdout.write(`\n${DOUBLE_BORDER}\n`);
    }
  }

  /**
   * プロジェクトデータ(this.projectsContainedRemovalBranches)を元にしてブランチを削除する
   *
   * @param projects {ProjectContainedRemovalBranches[]} - 削除予定ブランチを含んだプロジェクト
   */
  public async removeBranches(projects: ProjectContainedRemovalBranches[]) {
    if (this.projectsContainedRemovalBranches.length === 0) {
      process.stdout.write('\n削除するブランチが選択されていません\n\n');
      return;
    }

    // 削除予定ブランチのリストを表示する
    process.stdout.write('\n削除予定ブランチ\n');
    for (const { name: projectName, branchesName } of projects) {
      process.stdout.write(`\n[${projectName}]\n`);
      for (const branchName of branchesName) {
        process.stdout.write(`- ${branchName}\n`);
      }
    }
    process.stdout.write('\n');

    // 削除するかを最終確認
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
      process.stdout.write('\nブランチの削除を行いませんでした\n\n');
      return;
    }

    // ブランチの削除を行う
    for (const { id: projectId, name: projectName, branchesName } of projects) {
      process.stdout.write(`\n[${projectName}]\n`);

      for (const branchName of branchesName) {
        spinner.start('Fetching...');
        const apiUrl = getApiUrl(`/projects/${projectId}/repository/branches/${querystring.escape(branchName)}`);
        const data = Fetch.delete(apiUrl);
        await data.then(
          () => {
            spinner.succeed(`DELETED: ${branchName}`);
          },
          (error) => {
            spinner.succeed(`FAILED: ${error} - ${branchName}`);
          },
        );
      }
    }

    process.stdout.write('\nCompleted!!\n\n');
  }
}
