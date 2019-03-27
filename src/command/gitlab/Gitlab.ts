/*
 * import
 * -------------------------------------------------- */
import { execSync } from 'mz/child_process';
import prompts from 'prompts';
import querystring from 'querystring';
import * as config from '../../../holmes.config.json';
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
  branches: PromiseLike<string>;
}

interface Config {
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

  constructor(options: Options) {
    this.options = options;
    this.config = config.gitlab;

    if (this.options.copy && this.options.remove) {
      process.stdout.write('Warning: 削除モードではクリップボードのコピー機能は無効です');
    }

    const mappedProjects = this.mappingProjects(this.config);
    this.options.remove ? this.deleteBranches(mappedProjects) : this.printProjects(mappedProjects);
  }

  /**
   * プロジェクト（リポジトリ）毎にマッピング
   *
   * @param {Config} _config - this.config
   */
  private mappingProjects({ projects }: Config) {
    return projects.map(({ id, name }) => {
      const apiUrl = getApiUrl(`/projects/${id}/repository/branches`);
      const branches = Fetch.get(apiUrl);
      return { id, name, branches };
    });
  }

  /**
   * 選択肢ブランチのマッピング
   *
   * @param branches
   */
  private mappingChoicesBranches(branches: Branch[]) {
    return branches.map(({ name: branchName, merged, commit }: Branch) => ({
      title: `${branchName} - ${commit.author_name}`,
      value: branchName,
    }));
  }

  /**
   * オプションに応じたブランチデータを返す
   *
   * @param branchesData {Branch[]} - プロジェクトIDを使ってAPIから取得したブランチデータ
   */
  private filteringBranches(branchesData: Branch[]) {
    return branchesData.filter(({ merged }) => {
      if (this.options.merged) {
        return merged;
      }
      if (this.options.unmerged) {
        return !merged;
      }
      return true;
    });
  }

  /**
   * オプションに応じたブランチタイプを返す
   */
  private filteringBranchesType() {
    const { merged, unmerged } = this.options;
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
   * プロジェクト毎にブランチを表示する
   *
   * @param projects {Project[]} - マッピングされたプロジェクト
   */
  private async printProjects(projects: Project[]) {
    const branchesLabel = `[${this.filteringBranchesType()} branches]`;

    // プロジェクト毎にループして結果を取得する
    let result = '';
    for (const project of projects) {
      const { name: projectName, branches } = project;

      // プロジェクトに紐付いたブランチデータを取得
      const branchesData = await branches.then((data) => JSON.parse(data), (error) => process.stdout.write(error));

      // オプションの条件でブランチデータをフィルタリングする
      const filteredBranches = this.filteringBranches(branchesData);

      // ブランチリストを作成
      const branchesList = filteredBranches.reduce((list, { name: branchName, commit }) => {
        list += `- ${branchName} (Author: ${commit.author_name})\n`;
        return list;
      }, '');

      // 結果の文字列を足していく
      result += `${DOUBLE_BORDER}\n
${projectName}\n
${branchesLabel}
${branchesList}
${DOUBLE_BORDER}`;
    }

    // クリップボードにコピーする
    if (this.options.copy) {
      execSync(`cat <<EOF | pbcopy
${result}
EOF`);
    }

    // サイレントモードでなければ結果をコンソールに出力する
    if (!this.options.silent) {
      process.stdout.write(`${result}\n`);
    }
  }

  /**
   * プロジェクト毎にブランチの削除を行う
   *
   * @param projects {Project[]} - マッピングされたプロジェクト
   */
  private async deleteBranches(projects: Project[]) {
    const branchesLabel = `[${this.filteringBranchesType()} branches]`;

    process.stdout.write(`${DOUBLE_BORDER}\n`);

    // プロジェクト毎にループしてブランチを表示する
    for (const { id, name: projectName, branches } of projects) {
      process.stdout.write(`\n${projectName}\n\n${branchesLabel}\n`);

      // プロジェクトに紐付いたブランチデータを取得
      const branchesData = await branches.then((data) => JSON.parse(data));

      // オプションの条件でブランチデータをフィルタリング
      const filteredBranches = this.filteringBranches(branchesData);

      // 選択肢ブランチのマッピング
      const mappedChoicesBranches = this.mappingChoicesBranches(filteredBranches);

      // 選択肢ブランチがなかった場合は次のループへ
      if (mappedChoicesBranches.length === 0) {
        process.stdout.write('Branches does not exist\n');
        process.stdout.write(`\n${DOUBLE_BORDER}\n`);
        continue;
      }

      // 対話形式の設定
      const { branchesName } = await prompts([
        {
          choices: mappedChoicesBranches,
          message: 'スペースで選択（複数可）、エンターで選択されたブランチを削除する',
          name: 'branchesName',
          type: 'multiselect',
        },
      ]);

      // 対話で選択されたブランチを削除する処理
      for (const branchName of branchesName) {
        const apiUrl = getApiUrl(`/projects/${id}/repository/branches/${querystring.escape(branchName)}`);
        const data = Fetch.delete(apiUrl);
        await data.then(() => process.stdout.write(`Deleted: ${branchName}\n`), (error) => process.stdout.write(error));
      }

      process.stdout.write(`\n${DOUBLE_BORDER}\n`);
    }
  }
}
