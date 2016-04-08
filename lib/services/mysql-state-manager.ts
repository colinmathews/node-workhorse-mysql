import { Promise } from 'es6-promise';
import { Work, WorkResult, StateManager, Workhorse} from 'node-workhorse';
import { MySQL, MySQLConfig } from 'node-mysql2-wrapper';

export default class MySQLStateManager implements StateManager {
  workhorse: Workhorse;
  mysql: MySQL;

  constructor(public config: MySQLConfig) {
    this.mysql = new MySQL(this.config);
  }

  save(work: Work): Promise<any> {
    throw new Error('Not implemented yet');
  }

  saveAll(work: Work[]): Promise<any> {
    throw new Error('Not implemented yet');
  }

  load(id: string): Promise<Work> {
    throw new Error('Not implemented yet');
  }

  loadAll(ids: string[]): Promise<Work[]> {
    throw new Error('Not implemented yet');
  }

  childWorkFinished(work: Work, parent: Work): Promise<boolean> {
    throw new Error('Not implemented yet');
  }
}
