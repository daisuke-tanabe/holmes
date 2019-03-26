/*
 * node_modules
 * -------------------------------------------------- */
import { execSync } from 'mz/child_process';
import prompts, { PromptObject } from 'prompts';
import querystring from 'querystring';

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

interface MappedProject {
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
import * as config from '../../../holmes.config.json';
const API_V4 = `https://${config.gitlab.domain}/api/v4`;
const QUERY_PRIVATE_TOKEN = `private_token=${config.gitlab.token}`;
const DOUBLE_BORDER = '==================================================';

import Fetch from '../utility/Fetch';

export default class Gitlab {
  public config: Config;
  public options: Options;
  public mappedProjects: MappedProject[];

  constructor(options: Options) {
    this.options = options;
    this.config = config.gitlab;

    if (this.options.copy && this.options.remove) {
      process.stdout.write('Warning: 削除モードではクリップボードのコピー機能は無効です');
    }

    this.mappedProjects = this.mappingProjects(this.config);
    this.options.remove ? this.deleteBranches(this.mappedProjects) : this.printProjects(this.mappedProjects);
  }

  /**
   * プロジェクト（リポジトリ）毎にIDと名前、所有するブランチを設定する
   *
   * @param {Config} _config - this.config
   */
  public mappingProjects(_config: Config) {
    const mappedProjects = [];
    for (const { id, name } of _config.projects) {
      const branches = Fetch.get(`${API_V4}/projects/${id}/repository/branches?${QUERY_PRIVATE_TOKEN}`);
      mappedProjects.push({ id, name, branches });
    }
    return mappedProjects;
  }

  /**
   * オプションに応じたブランチデータを返す
   *
   * @param branchesData {Branch[]} - プロジェクトIDを使ってAPIから取得したブランチデータ
   */
  public filteringBranches(branchesData: Branch[]) {
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
   *
   */
  filteringBranchesType() {
    if (this.options.merged && this.options.unmerged) {
      return 'All';
    }
    if (this.options.merged) {
      return 'Merged';
    }
    if (this.options.unmerged) {
      return 'Unmerged';
    }
    return 'All';
  }

  /**
   * プロジェクト毎にブランチを表示する
   *
   * @param mappedProjects {Array<MappedProject>>} - マッピングされたプロジェクト
   */
  public async printProjects(mappedProjects: MappedProject[]) {
    const branchesLabel = `[${this.filteringBranchesType()} branches]`;

    // プロジェクト毎にループして結果を取得する
    let result = '';
    for (const project of mappedProjects) {
      const { name: projectName, branches } = project;

      // プロジェクトに紐付いたブランチデータを取得
      const branchesData = await branches.then((data) => JSON.parse(data));

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
    execSync(`cat <<EOF | pbcopy
${result}
EOF`);

    // サイレントモードでなければ結果をコンソールに出力する
    if (!this.options.silent) {
      process.stdout.write(`${result}\n`);
    }
  }

  /**
   * プロジェクト毎にブランチの削除を行う
   *
   * @param mappedProjects {Array<MappedProject>} - マッピングされたプロジェクト
   */
  public async deleteBranches(mappedProjects: MappedProject[]) {
    const branchesLabel = `[${this.filteringBranchesType()} branches]`;

    process.stdout.write(`${DOUBLE_BORDER}\n`);

    // プロジェクト毎にループしてブランチを表示する
    for (const { id, name: projectName, branches } of mappedProjects) {
      process.stdout.write(`\n${projectName}\n\n${branchesLabel}\n`);

      // プロジェクトに紐付いたブランチデータを取得
      const branchesData = await branches.then((data) => JSON.parse(data));

      // オプションの条件でブランチデータをフィルタリングする
      const filteredBranches = this.filteringBranches(branchesData);

      // 選択用ブランチを作成する
      const choicesBranches = filteredBranches.map(({ name: branchName, merged, commit }: Branch) => ({
        title: `${branchName} - ${commit.author_name}`,
        value: branchName,
      }));

      // 選択するブランチがない場合は次のループへ
      if (choicesBranches.length === 0) {
        process.stdout.write('Branches does not exist\n');
        process.stdout.write(`\n${DOUBLE_BORDER}\n`);
        continue;
      }

      // 対話形式の設定と対話の開始
      const question: Array<PromptObject<string>> = [
        {
          choices: choicesBranches,
          message: 'スペースで選択（複数可）、エンターで選択されたブランチを削除する',
          name: 'branchesName',
          type: 'multiselect',
        },
      ];
      const { branchesName } = await prompts(question);

      // 対話で選択されたブランチを削除する処理
      for (const branchName of branchesName) {
        const data = Fetch.delete(
          `${API_V4}/projects/${id}/repository/branches/${querystring.escape(branchName)}?${QUERY_PRIVATE_TOKEN}`,
        );
        await data.then(() => {
          process.stdout.write(`Deleted: ${branchName}\n`);
        });
      }

      process.stdout.write(`\n${DOUBLE_BORDER}\n`);
    }
  }
}
