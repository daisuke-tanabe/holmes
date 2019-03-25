/**
 * node_modules
 * -------------------------------------------------- */
const util = require('util');
const querystring = require('querystring');
const exec = util.promisify(require('child_process').exec);
const prompts = require("prompts");

/**
 * interface / type
 * -------------------------------------------------- */
export interface Options {
  remove: boolean
  merged: boolean
  unmerged: boolean
}

interface Branch {
  name: string
  merged: boolean
  commit: {
    author_name: string
  }
}

interface MappedProject {
  id: number
  name: string
  branches: PromiseLike<string>
}

interface Config {
  token: string
  domain: string
  projects: Array<{id: number, name: string}>
}


/**
 * Gitlab
 * -------------------------------------------------- */
const config = require('../../../holmes.config.json');
const API_V4 = `https://${config.gitlab.domain}/api/v4`;
const QUERY_PRIVATE_TOKEN = `private_token=${config.gitlab.token}`;
const DOUBLE_BORDER = '==================================================';

export default class Gitlab {
  config: Config;
  options: Options;
  mappedProjects: Array<MappedProject>;

  /**
   * GETでGitlabからデータを取得を行う
   * unfetchモジュールではプロキシに阻まれるのかエラーになるためcurlコマンドを利用した
   *
   * @param {string} entryPoint - Gitlab API(https://docs.gitlab.com/ee/api/)
   */
  fetchAsync(entryPoint: string): PromiseLike<any> {
    const url = `${API_V4}${entryPoint}?${QUERY_PRIVATE_TOKEN}`;
    return new Promise((resolve, reject) => {
      exec(`curl -s ${url}`, (err: Error, stdout: string | Buffer, stderr: string | Buffer) => {
        !err ? resolve(stdout): reject(stderr);
      });
    });
  }

  /**
   * DELETEでGitlabからデータ削除を行う
   * unfetchモジュールではプロキシに阻まれるのかエラーになるためcurlコマンドを利用した
   *
   * @param {string} entryPoint - Gitlab API(https://docs.gitlab.com/ee/api/)
   */
  deleteAsync(entryPoint: string) {
    const url = `${API_V4}${entryPoint}?${QUERY_PRIVATE_TOKEN}`;
    return new Promise((resolve, reject) => {
      exec(`curl -s -X DELETE ${url}`, (err: Error, stdout: string | Buffer, stderr: string | Buffer) => {
        !err ? resolve(stdout): reject(stderr);
      });
    });
  }

  constructor(options: Options) {
    this.options = options;
    this.config = config.gitlab;
    this.mappedProjects = this.mappingProjects(this.config);
    this.options.remove ? this.deleteBranches(this.mappedProjects) : this.printResult(this.mappedProjects);
  }

  /**
   * プロジェクト（リポジトリ）毎にIDと名前、所有するブランチを設定する
   *
   * @param {Config} config - this.config
   */
  mappingProjects(config: Config) {
    const mappedProjects = [];
    for (const { id, name } of config.projects) {
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
  async printResult(mappedProjects: Array<MappedProject>) {
    console.log(`\n${DOUBLE_BORDER}\n`);
    const createBranchesLabel = () => {
      if (this.options.merged) return 'Merged';
      if (this.options.unmerged) return 'Unmerged';
      return 'All';
    };
    const branchesLabel = `${createBranchesLabel()} branches`;
    for (const project of mappedProjects) {
      const { name, branches } = project;
      const branchesData = await branches.then((data) => JSON.parse(data));
      console.log(`▼ ${name}`);
      console.log(`\n[${branchesLabel}]`);
      const filteredBranches = branchesData.filter(({ merged }: Branch) => {
        if (this.options.merged) return merged;
        if (this.options.unmerged) return !merged;
        return true;
      });
      filteredBranches.forEach(({ name, commit }: Branch) => {
        console.log(`- ${name} (Author: ${commit.author_name})`);
      });
      console.log(`\n${DOUBLE_BORDER}\n`);
    }
  }

  /**
   * プロジェクト（リポジトリ）毎にブランチの削除を行う
   *
   * @param {Array<MappedProject>} mappedProjects - マッピングされたプロジェクト
   */
  async deleteBranches(mappedProjects: Array<MappedProject>) {
    console.log(`\n${DOUBLE_BORDER}\n`);
    for (const {id, name, branches} of mappedProjects) {
      console.log(`▼ ${name}`);
      const branchesData = await branches.then((data) => JSON.parse(data));
      const choicesBranches = branchesData.map(({ name, merged, commit }: Branch) => ({
        title: `[${merged ? 'Merged' : 'Unmerged'} branch]${name} - ${commit.author_name}`,
        value: name,
      }));
      const question = [{
        type: 'multiselect',
        name: 'branchesName',
        message: 'スペースで選択（複数可）、エンターで選択されたブランチを削除する',
        choices: choicesBranches
      }];
      const { branchesName } = await prompts(question);
      for (const branchName of branchesName) {
        const data = this.deleteAsync(`/projects/${id}/repository/branches/${querystring.escape(branchName)}`);
        await data.then(() => {
          console.log(`Deleted: ${branchName}`);
        });
      }
      console.log(`\n${DOUBLE_BORDER}\n`);
    }
  }
}
