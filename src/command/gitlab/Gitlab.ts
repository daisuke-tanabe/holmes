/*
 * node_modules
 * -------------------------------------------------- */
import { exec } from 'mz/child_process';
import * as prompts from 'prompts';
import * as querystring from 'querystring';

/*
 * interface / type
 * -------------------------------------------------- */
export interface Options {
  remove: boolean;
  merged: boolean;
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

export default class Gitlab {
  public config: Config;
  public options: Options;
  public mappedProjects: MappedProject[];

  constructor(options: Options) {
    this.options = options;
    this.config = config.gitlab;
    this.mappedProjects = this.mappingProjects(this.config);
    this.options.remove ? this.deleteBranches(this.mappedProjects) : this.printResult(this.mappedProjects);
  }

  /**
   * GETでGitlabからデータを取得を行う
   * unfetchモジュールではプロキシに阻まれるのかエラーになるためcurlコマンドを利用した
   *
   * @param {string} entryPoint - Gitlab API(https://docs.gitlab.com/ee/api/)
   */
  public fetchAsync(entryPoint: string): PromiseLike<any> {
    const url = `${API_V4}${entryPoint}?${QUERY_PRIVATE_TOKEN}`;
    return new Promise((resolve, reject) => {
      exec(`curl -s ${url}`, (err: Error, stdout: string | Buffer, stderr: string | Buffer) => {
        !err ? resolve(stdout) : reject(stderr);
      });
    });
  }

  /**
   * DELETEでGitlabからデータ削除を行う
   * unfetchモジュールではプロキシに阻まれるのかエラーになるためcurlコマンドを利用した
   *
   * @param {string} entryPoint - Gitlab API(https://docs.gitlab.com/ee/api/)
   */
  public deleteAsync(entryPoint: string) {
    const url = `${API_V4}${entryPoint}?${QUERY_PRIVATE_TOKEN}`;
    return new Promise((resolve, reject) => {
      exec(`curl -s -X DELETE ${url}`, (err: Error, stdout: string | Buffer, stderr: string | Buffer) => {
        !err ? resolve(stdout) : reject(stderr);
      });
    });
  }

  /**
   * プロジェクト（リポジトリ）毎にIDと名前、所有するブランチを設定する
   *
   * @param {Config} _config - this.config
   */
  public mappingProjects(_config: Config) {
    const mappedProjects = [];
    for (const { id, name } of _config.projects) {
      const branches = this.fetchAsync(`/projects/${id}/repository/branches`);
      mappedProjects.push({ id, name, branches });
    }
    return mappedProjects;
  }

  /**
   * プロジェクト（リポジトリ）毎にブランチを表示する
   *
   * @param {Array<MappedProject>>} mappedProjects - マッピングされたプロジェクト
   */
  public async printResult(mappedProjects: MappedProject[]) {
    process.stdout.write(`\n${DOUBLE_BORDER}\n`);
    const createBranchesLabel = () => {
      if (this.options.merged) {
        return 'Merged';
      }
      if (this.options.unmerged) {
        return 'Unmerged';
      }
      return 'All';
    };
    const branchesLabel = `${createBranchesLabel()} branches`;
    for (const project of mappedProjects) {
      const { name, branches } = project;
      const branchesData = await branches.then((data) => JSON.parse(data));
      process.stdout.write(`▼ ${name}`);
      process.stdout.write(`\n[${branchesLabel}]`);
      const filteredBranches = branchesData.filter(({ merged }: Branch) => {
        if (this.options.merged) {
          return merged;
        }
        if (this.options.unmerged) {
          return !merged;
        }
        return true;
      });
      filteredBranches.forEach(({ name: branchName, commit }: Branch) => {
        process.stdout.write(`- ${branchName} (Author: ${commit.author_name})`);
      });
      process.stdout.write(`\n${DOUBLE_BORDER}\n`);
    }
  }

  /**
   * プロジェクト（リポジトリ）毎にブランチの削除を行う
   *
   * @param {Array<MappedProject>} mappedProjects - マッピングされたプロジェクト
   */
  public async deleteBranches(mappedProjects: MappedProject[]) {
    process.stdout.write(`\n${DOUBLE_BORDER}\n`);
    for (const { id, name, branches } of mappedProjects) {
      process.stdout.write(`▼ ${name}`);
      const branchesData = await branches.then((data) => JSON.parse(data));
      const choicesBranches = branchesData.map(({ name: branchName, merged, commit }: Branch) => ({
        title: `[${merged ? 'Merged' : 'Unmerged'} branch]${branchName} - ${commit.author_name}`,
        value: branchName,
      }));
      const question = [
        {
          choices: choicesBranches,
          message: 'スペースで選択（複数可）、エンターで選択されたブランチを削除する',
          name: 'branchesName',
          type: 'multiselect',
        },
      ];
      const { branchesName } = await prompts(question);
      for (const branchName of branchesName) {
        const data = this.deleteAsync(`/projects/${id}/repository/branches/${querystring.escape(branchName)}`);
        await data.then(() => {
          process.stdout.write(`Deleted: ${branchName}`);
        });
      }
      process.stdout.write(`\n${DOUBLE_BORDER}\n`);
    }
  }
}
