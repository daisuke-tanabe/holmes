const config = require('../holmes.config.json');
const { execSync } = require('child_process');

const commandHandler = (options) => {
  const { merged: _merged, unmerged: _unmerged } = options;

  const fetchSync = (entryPoint) => {
    const url = `https://${config.gitlab.domain}/api/v4${entryPoint}?private_token=${config.gitlab.token}`;
    const data = execSync(`curl -s ${url}`);
    return JSON.parse(data.toString());
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
        const branches = branchesData.map(({ name, merged, commit }) => ({ name, merged, author: commit.author_name }));
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
  printResult(projects);
};

module.exports = {
  command: 'gitlab',
  desc: 'チームが抱えているGitlabのリポジトリからトピックブランチを取得',
  builder: yargs => {
    yargs.options({
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
