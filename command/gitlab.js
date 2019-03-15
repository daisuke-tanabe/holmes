const config = require('../holmes.config.json');
const { execSync } = require('child_process');
const querystring = require('querystring');
const prompts = require("prompts");

const commandHandler = (options) => {
  const { delete: _delete, merged: _merged, unmerged: _unmerged } = options;

  const fetchSync = (entryPoint) => {
    const url = `https://${config.gitlab.domain}/api/v4${entryPoint}?private_token=${config.gitlab.token}`;
    const data = execSync(`curl -s ${url}`).toString();
    return JSON.parse(data);
  };

  const deleteSync = (entryPoint) => {
    const url = `https://${config.gitlab.domain}/api/v4${entryPoint}?private_token=${config.gitlab.token}`;
    return execSync(`curl -s -X DELETE ${url}`).toString();
  };

  const createProjects = (groupsData) => {
    const filterBranches = (branches) => {
      return branches.filter((branch) => {
        const { merged } = branch;
        if (_merged) return merged;
        if (_unmerged) return !merged;
        return true;
      })
    };

    return groupsData.map(({id}) => id).reduce((result, id) => {
      const projects = fetchSync(`/groups/${id}`).projects;

      projects.forEach((project) => {
        const { id, name, web_url } = project;
        const branchesData = fetchSync(`/projects/${id}/repository/branches`);
        const branches = branchesData.map(({ name, merged, protected, commit }) => ({
          name,
          merged,
          protected,
          author: commit.author_name
        }));
        const shouldFilter = !(_merged === _unmerged);

        result.push({
          id,
          name,
          web_url,
          branches: shouldFilter ? filterBranches(branches) : branches,
        });
      });

      return result;
    }, []);
  };

  const printResult = (projects) => {
    const createBranchesLabel = () => {
      if (_merged) return 'Merged';
      if (_unmerged) return 'Unmerged';
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

  const groupsData = fetchSync('/groups');
  const projects = createProjects(groupsData);

  console.log('\n==================================================\n');

  if (_delete) {
    (async () => {;
      for (const project of projects) {
        const { id, name, web_url, branches } = project;

        console.log(`▼ ${name}`);
        const ignoredProtectedBranches = branches.filter(({ protected, merged }) => (!protected && merged));

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
              name: 'delete_branches',
              message: '削除するブランチをスペースで選択してエンターで決定してください',
              choices: choicesBranches
            }
          ];
          const response = await prompts(question);
          // 削除コマンドテスト
          for (const branch of response.delete_branches) {
            const result = deleteSync(`/projects/${id}/repository/branches/${querystring.escape(branch)}`);
            // 文字列でundefinedを受け取るので注意
            if (result === 'undefined') {
              console.log(`${branch} を削除しました`);
            } else {
              console.log(`${result.error} 削除に失敗しました`)
            }
          }
        } else {
          console.log('Not branches');
        }

        console.log(`\n${web_url}`);
        console.log('\n==================================================\n');
      }
    })();

    return;
  }

  printResult(projects);
};

module.exports = {
  command: 'gitlab',
  desc: 'チームが抱えているGitlabのリポジトリからトピックブランチを取得',
  builder: yargs => {
    yargs.options({
      delete: {
        alias: 'd',
        boolean: true,
        default: false,
        describe: '対話形式で"branches"を削除する'
      },
      merged: {
        alias: 'm',
        boolean: true,
        default: false,
        describe: '"merged branches"を表示する'
      },
      unmerged: {
        alias: 'u',
        boolean: true,
        default: false,
        describe: '"unmerged branches"を表示する'
      }
    });
  },
  handler: (argv) => {
    commandHandler(argv);
  }
};
