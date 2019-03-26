#!/usr/bin/env node

/*
 * node_modules
 * -------------------------------------------------- */
import yargs from 'yargs';
import pkg from '../package.json';
import gitlab from './command/gitlab';

/*
 * yargs
 * -------------------------------------------------- */
// tslint:disable-next-line
yargs
  .command(gitlab)
  .version('version', 'バージョン情報の表示', `v${pkg.version}`)
  .alias('v', 'version')
  .help('help', 'ヘルプの表示')
  .alias('h', 'help').argv;
