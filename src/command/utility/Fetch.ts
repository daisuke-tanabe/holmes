/*
 * node_modules
 * -------------------------------------------------- */
import { exec } from 'mz/child_process';

/*
 * Fetch
 * -------------------------------------------------- */
export default class Fetch {
  public static promiseExec(url: string, method: string): Promise<any> {
    return new Promise((resolve, reject) => {
      exec(`curl -s ${`-X  ${method}`} ${url}`, (err: Error, stdout: string | Buffer, stderr: string | Buffer) => {
        !err ? resolve(stdout) : reject(stderr);
      });
    });
  }

  /**
   * GETで利用する
   *
   * @param url {string} - エントリーポイントを含んだURL
   */
  public static get(url: string) {
    return Fetch.promiseExec(url, 'GET');
  }

  /**
   * DELETEで利用する
   *
   * @param url {string} - エントリーポイントを含んだURL
   */
  public static delete(url: string) {
    return Fetch.promiseExec(url, 'DELETE');
  }
}
