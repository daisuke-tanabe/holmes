const config = require('../../holmes.config.json');
const { execSync } = require('child_process');
const querystring = require('querystring');
const prompts = require("prompts");

const API_V4 = `https://${config.gitlab.domain}/api/v4`;
const QUERY_PRIVATE_TOKEN = `private_token=${config.gitlab.token}`;

class Gitlab {
  constructor(options) {
    this.options = options;

    const groupsData = this.fetchSync('/groups');
    const projects = this.createProjects(groupsData);
    console.log('\n==================================================\n');
    if (this.options.delete) {
      this.deleteBranches(projects);
    } else {
      this.printResult(projects);
    }
  }

  fetchSync(entryPoint) {
    const url = `${API_V4}${entryPoint}?${QUERY_PRIVATE_TOKEN}`;
    const data = execSync(`curl -s ${url}`).toString();
    return JSON.parse(data);
  }

  deleteSync(entryPoint) {
    const url = `${API_V4}${entryPoint}?${QUERY_PRIVATE_TOKEN}`;
    return execSync(`curl -s -X DELETE ${url}`).toString();
  }

  createProjects(groupsData) {
    const filterBranches = (branches) => {
      return branches.filter((branch) => {
        const { merged } = branch;
        if (this.options.merged) return merged;
        if (this.options.unmerged) return !merged;
        return true;
      })
    };

    return groupsData.map(({id}) => id).reduce((result, id) => {
      const projects = this.fetchSync(`/groups/${id}`).projects;

      projects.forEach((project) => {
        const { id, name, web_url } = project;
        const branchesData = this.fetchSync(`/projects/${id}/repository/branches`);
        const branches = branchesData.map(({ name, merged, protected: _protected, commit }) => ({
          name,
          merged,
          _protected,
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

  printResult(projects) {
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

  deleteBranches(projects) {
    (async () => {
      for (const project of projects) {
        const { id, name, web_url, branches } = project;

        console.log(`▼ ${name}`);
        const ignoredProtectedBranches = branches.filter(({ _protected, merged }) => (!_protected && merged));

        if (ignoredProtectedBranches.length !== 0) {
          const choicesBranches = ignoredProtectedBranches.map(branch => {
            const { name, author } = branch;
            return {
              title: `${name} - ${author}`,
              value: name,
            }
          });

          const question = [
            {
              type: "multiselect",
              name: 'branches',
              message: '削除するブランチをスペースで選択してエンターで決定してください',
              choices: choicesBranches
            }
          ];
          const response = await prompts(question);
          // 削除コマンドテスト
          response.branches.forEach((branch) => {
            const result = this.deleteSync(`/projects/${id}/repository/branches/${querystring.escape(branch)}`);
            // 文字列でundefinedを受け取るので注意
            (result === 'undefined') ?
              console.log(`${branch} を削除しました`) :
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

module.exports = Gitlab;
