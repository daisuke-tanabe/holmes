const config = require('../../../holmes.config.json');
const { execSync } = require('child_process');
const querystring = require('querystring');
const prompts = require("prompts");

const API_V4 = `https://${config.gitlab.domain}/api/v4`;
const QUERY_PRIVATE_TOKEN = `private_token=${config.gitlab.token}`;

interface GroupData {
  id: number
  name: string
  path: string
  description: string
  visibility: string
  lfs_enabled: boolean
  avatar_url: string
  web_url: string
  request_access_enabled: boolean
  full_name: string
  full_path: string
  file_template_project_id: number
  parent_id: null
}

interface BranchData {
  name: string
  merged: boolean
  protected: boolean
  author: string
  commit: {
    author_email: string
    author_name: string
    authored_date: string
    committed_date: string
    committer_email: string
    committer_name: string
    id: string
    short_id: string
    title: string
    message: string
    parent_ids: string[]
  }
}

interface Branch {
  name: string
  merged: boolean
  preserved: boolean
  author: string
}

interface Project {
  id: number
  name: string
  web_url: string
  branches: Branch[]
}

interface Options {
  remove: boolean
  merged: boolean
  unmerged: boolean
}

export default class Gitlab {
  private _options!: Options;

  constructor(options: Options) {
    this.options = options;

    const groupsData = Gitlab.fetchSync('/groups');
    const projects = this.createProjects(groupsData);

    console.log('\n==================================================\n');
    this.options.remove ? this.deleteBranches(projects) : this.printResult(projects);
  }

  get options(): Options {
    return this._options;
  }

  set options(options: Options) {
    this._options = options;
  }

  static fetchSync(entryPoint: string) {
    const url = `${API_V4}${entryPoint}?${QUERY_PRIVATE_TOKEN}`;
    const data = execSync(`curl -s ${url}`).toString();
    return JSON.parse(data);
  }

  static deleteSync(entryPoint: string) {
    const url = `${API_V4}${entryPoint}?${QUERY_PRIVATE_TOKEN}`;
    return execSync(`curl -s -X DELETE ${url}`).toString();
  }

  createProjects(groupsData: GroupData[]): Project[] {
    const filterBranches = (branches: BranchData[]): BranchData[] => {
      return branches.filter((branch: BranchData) => {
        const { merged } = branch;
        if (this.options.merged) return merged;
        if (this.options.unmerged) return !merged;
        return true;
      })
    };

    return groupsData.map(({ id }: { id: number }) => id).reduce((result: Project[], id: number) => {
      const projects = Gitlab.fetchSync(`/groups/${id}`).projects;

      projects.forEach((project:Project) => {
        const { id, name, web_url } = project;
        const branchesData = Gitlab.fetchSync(`/projects/${id}/repository/branches`);
        const branches = branchesData.map(({ name, merged, protected: preserved, commit }: BranchData) => ({
          name,
          merged,
          preserved,
          author: commit.author_name
        }));
        const shouldFilter = !(this.options.merged === this.options.unmerged);

        result.push({
          id,
          name,
          web_url,
          branches: shouldFilter ? filterBranches(branches) : branches,
        });
      });

      return result;
    }, []);
  }

  printResult(projects: Project[]) {
    const createBranchesLabel = () => {
      if (this.options.merged) return 'Merged';
      if (this.options.unmerged) return 'Unmerged';
      return 'All'
    };
    const branchesLabel = `${createBranchesLabel()} branches`;

    projects.forEach((project) => {
      const { name, web_url, branches } = project;

      console.log(`▼ ${name}`);
      console.log(`\n[${branchesLabel}]`);
      branches.forEach(branch => {
        const { name, author } = branch;
        console.log(`- ${name} (Author: ${author})`);
      });
      console.log(`\n${web_url}`);
      console.log('\n==================================================\n');
    });
  };

  deleteBranches(projects: Project[]) {
    (async () => {
      for (const project of projects) {
        const { id, name, web_url, branches } = project;

        console.log(`▼ ${name}`);
        const ignoredProtectedBranches = branches.filter(({ preserved, merged }: { preserved: boolean, merged: boolean }) => (!preserved && merged));

        if (ignoredProtectedBranches.length !== 0) {
          const choicesBranches = ignoredProtectedBranches.map((branch: { name: string, author: string}) => {
            const { name, author } = branch;
            return {
              title: `${name} - ${author}`,
              value: name,
            }
          });

          const question = [
            {
              type: "multiselect",
              name: 'branchesName',
              message: '削除するブランチをスペースで選択してエンターで決定してください',
              choices: choicesBranches
            }
          ];
          const response = await prompts(question);
          // 削除コマンドテスト
          response.branchesName.forEach((branchName: string) => {
            const result = Gitlab.deleteSync(`/projects/${id}/repository/branches/${querystring.escape(branchName)}`);
            // 文字列でundefinedを受け取るので注意
            (result === 'undefined') ?
              console.log(`${branchName} を削除しました`) :
              console.log(`${result.error} 削除に失敗しました`);
          })
        } else {
          console.log('Not branches');
        }
        console.log(`\n${web_url}`);
        console.log('\n==================================================\n');
      }
    })();
  }
}
