/*
 * import
 * -------------------------------------------------- */
import { execSync } from 'mz/child_process';
import prompts from 'prompts';
import querystring from 'querystring';
import config from '../../../holmes.config.json';
import Fetch from '../utility/Fetch';

/*
 * interface / type
 * -------------------------------------------------- */
export interface Options {
  copy: boolean;
  merged: boolean;
  remove: boolean;
  silent: boolean;
  unmerged: boolean;
}

export interface Branch {
  name: string;
  merged: boolean;
  commit: {
    author_name: string;
  };
}

export interface Project {
  id: number;
  name: string;
  branches: Branch[];
}

export interface ProjectContainedDeletionReservedBranches {
  id: number;
  name: string;
  branches: string[];
}

export interface Config {
  token: string;
  domain: string;
  projects: Array<{ id: number; name: string }>;
}

/*
 * Gitlab
 * -------------------------------------------------- */
const API_V4 = `https://${config.gitlab.domain}/api/v4`;
const QUERY_PRIVATE_TOKEN = `private_token=${config.gitlab.token}`;
const DOUBLE_BORDER = '==================================================';
const getApiUrl = (entryPoint: string) => `${API_V4}${entryPoint}?${QUERY_PRIVATE_TOKEN}`;

export default class Gitlab {
  private readonly config: Config;
  private readonly options: Options;
  private projects: Project[] = [];
  private projectsContainedRemovalBranches: ProjectContainedDeletionReservedBranches[] = [];
  private result: string[] = [];

  constructor(options: Options) {
    this.options = options;
    this.config = config.gitlab;
  }

  public main() {
    if (this.options.remove && this.options.copy) {
      process.stdout.write('Warning: "remove"オプションが真である時、"copy"オプションは無効です\n');
    }

    if (this.options.remove && this.options.silent) {
      process.stdout.write('Warning: "remove"オプションが真である時、"silent"オプションは無効です\n');
    }

    (async () => {
      // this.projectsの末尾へデータを追加
      await this.appendProjects(this.config);

      // removeオプションが有効ならブランチ削除処理
      if (this.options.remove) {
        await this.appendDeletionReservedBranches(this.projects);
        await this.removeBranches(this.projectsContainedRemovalBranches);
        return;
      }

      // this.resultの末尾へデータを追加
      await this.appendResult(this.projects);

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
        process.stdout.write(`${result}\n`);
      }
    })();
  }

  /**
   * プロジェクトデータ(this.projects)にpushする
   *
   * @param {Config} _config - this.config
   */
  private async appendProjects({ projects }: Config) {
    for (const { id, name } of projects) {
      const apiUrl = getApiUrl(`/projects/${id}/repository/branches`);
      const branchesData = Fetch.get(apiUrl);
      const branchesJson = await branchesData.then(
        (data) => JSON.parse(data),
        (error) => process.stdout.write(`${error}\n`),
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
      this.projects.push({ id, name, branches });
    }
  }

  /**
   * オプションに応じたブランチタイプを返す
   */
  private filteringBranchesType(options: Options) {
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
   * this.resultの末尾に結果を追加する
   *
   * @param projects {Project[]} - プロジェクト
   */
  private async appendResult(projects: Project[]) {
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
${newBranches}
${DOUBLE_BORDER}`);
    }
  }

  /**
   * 削除するブランチを含んだプロジェクトデータ(this.projectsContainedRemovalBranches)にpushする
   *
   * @param projects {Project[]} - プロジェクト
   */
  private async appendDeletionReservedBranches(projects: Project[]) {
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
          branches: removalBranches || [],
          id: projectId,
          name: projectName,
        });
      }

      process.stdout.write(`\n${DOUBLE_BORDER}\n`);
    }
  }

  /**
   * 削除するブランチを含んだプロジェクトデータ(this.projectsContainedRemovalBranches)を元にしてブランチを削除する
   *
   * @param projects {ProjectContainedDeletionReservedBranches[]} - 削除予定ブランチを含んだプロジェクト
   */
  private async removeBranches(projects: ProjectContainedDeletionReservedBranches[]) {
    process.stdout.write(`\n${DOUBLE_BORDER}\n`);
    if (this.projectsContainedRemovalBranches.length === 0) {
      process.stdout.write('\n削除するブランチが選択されていません\n');
      process.stdout.write(`\n${DOUBLE_BORDER}\n`);
      return;
    }

    // 削除予定ブランチのリストを表示する
    process.stdout.write('\n削除予定ブランチ\n');
    for (const { name, branches } of projects) {
      process.stdout.write(`\n[${name}]\n`);
      for (const branch of branches) {
        process.stdout.write(`- ${branch}\n`);
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

    // 削除しないのならメッセージを表示して終了する
    if (!isRemove) {
      process.stdout.write('\nブランチの削除を行いませんでした\n');
      process.stdout.write(`\n${DOUBLE_BORDER}\n`);
      return;
    }

    // ブランチの削除を行う
    for (const { id, name, branches } of projects) {
      process.stdout.write(`\n[${name}]\n`);

      for (const branch of branches) {
        const apiUrl = getApiUrl(`/projects/${id}/repository/branches/${querystring.escape(branch)}`);
        const data = Fetch.delete(apiUrl);
        await data.then(() => process.stdout.write(`Deleted: ${branch}\n`), (error) => process.stdout.write(error));
      }
    }

    process.stdout.write(`\nCompleted!!\n`);
    process.stdout.write(`\n${DOUBLE_BORDER}\n`);
  }
}
