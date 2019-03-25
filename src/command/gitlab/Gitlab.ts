/**
 * node_modules
 * -------------------------------------------------- */
const config = require('../../../holmes.config.json');
const { execSync } = require('child_process');
const querystring = require('querystring');
const prompts = require("prompts");

/**
 * interface / type
 * -------------------------------------------------- */
export interface Options {
  remove: boolean
  merged: boolean
  unmerged: boolean
}

interface MappedProject {
  id: number
  name: string
  branches: Array<{
    name: string
    merged: boolean
    commit: {
      author_name: string
    }
  }>
}

interface Config {
  token: string
  domain: string
  projects: Array<{id: number, name: string}>
}

/**
 * Gitlab
 * -------------------------------------------------- */
const API_V4 = `https://${config.gitlab.domain}/api/v4`;
const QUERY_PRIVATE_TOKEN = `private_token=${config.gitlab.token}`;
const DOUBLE_BORDER = '\n==================================================\n';

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
  static fetchSync(entryPoint: string) {
    const url = `${API_V4}${entryPoint}?${QUERY_PRIVATE_TOKEN}`;
    const data = execSync(`curl -s ${url}`).toString();
    return JSON.parse(data);
  }

  /**
   * DELETEでGitlabからデータ削除を行う
   * unfetchモジュールではプロキシに阻まれるのかエラーになるためcurlコマンドを利用した
   *
   * @param {string} entryPoint - Gitlab API(https://docs.gitlab.com/ee/api/)
   */
  static deleteSync(entryPoint: string) {
    const url = `${API_V4}${entryPoint}?${QUERY_PRIVATE_TOKEN}`;
    return execSync(`curl -s -X DELETE ${url}`).toString();
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
    return config.projects.map(({ id, name }) => {
      const branches = Gitlab.fetchSync(`/projects/${id}/repository/branches`);
      return { id, name, branches };
    });
  }

  /**
   * プロジェクト（リポジトリ）毎にブランチを表示する
   *
   * @param {Array<MappedProject>>} mappedProjects - マッピングされたプロジェクト
   */
  printResult(mappedProjects: Array<MappedProject>) {
    console.log('\n==================================================\n');

    const createBranchesLabel = () => {
      if (this.options.merged) return 'Merged';
      if (this.options.unmerged) return 'Unmerged';
      return 'All';
    };
    const branchesLabel = `${createBranchesLabel()} branches`;

    mappedProjects.forEach((project) => {
      const { name, branches } = project;
      console.log(`▼ ${name}`);
      console.log(`\n[${branchesLabel}]`);

      const filteredBranches = branches.filter(({ merged }) => {
        if (this.options.merged) return merged;
        if (this.options.unmerged) return !merged;
        return true;
      });

      filteredBranches.forEach(({ name, commit }) => {
        console.log(`- ${name} (Author: ${commit.author_name})`);
      });

      console.log('\n==================================================\n');
    });
  }

  /**
   * プロジェクト（リポジトリ）毎にブランチの削除を行う
   *
   * @param {Array<MappedProject>} mappedProjects - マッピングされたプロジェクト
   */
  deleteBranches(mappedProjects: Array<MappedProject>) {
    (async () => {
      for (const { id, name, branches } of mappedProjects) {
        console.log(`▼ ${name}`);
        if (branches.length === 0) {
          console.log(`Not branches${DOUBLE_BORDER}`);
          continue;
        }

        const choicesBranches = branches.map(({ name, merged, commit }) => ({
          title: `[${merged ? 'Merged' : 'Unmerged'} branch]${name} - ${commit.author_name}`,
          value: name,
        }));
        const question = [{
          type: 'multiselect',
          name: 'branchesName',
          message: 'スペースで選択（複数可）、エンターで選択されたブランチを削除する',
          choices: choicesBranches
        }];
        const response = await prompts(question);
        response.branchesName.forEach((branchName: string) => {
          const result = Gitlab.deleteSync(`/projects/${id}/repository/branches/${querystring.escape(branchName)}`);
          // 文字列でundefinedを受け取るので注意
          (result === 'undefined') ?
            console.log(`${branchName} を削除しました`) :
            console.log(`${result.error} 削除に失敗しました`);
          });
        console.log(DOUBLE_BORDER);
      }
    })();
  }
}
