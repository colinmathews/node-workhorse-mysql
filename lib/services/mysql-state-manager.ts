import { Promise } from 'es6-promise';
import { Work, WorkResult, StateManager, Workhorse} from 'node-workhorse';
import { MySQL, MySQLConfig, Column, Execution, insert, update, select, selectOne } from 'node-mysql2-wrapper';

export class SerializeContainer {
  workCols: Column[]
  resultCols: Column[]
  childrenCols: Column[]
}

export function serializeWork(work: Work): SerializeContainer {
  throw new Error('Not implemented yet');
}

export default class MySQLStateManager implements StateManager {
  workhorse: Workhorse;
  sql: MySQL;

  constructor(
    public config: MySQLConfig,
    public workTableName:string = 'work',
    public workResultTableName: string = 'work_result',
    public workChildrenTableName: string = 'work_children') {
    this.sql = new MySQL(this.config);
  }

  save(work: Work): Promise<any> {
    let exec = this.sql.transaction();
    let promise = this.saveOnePromise(exec, work);
    return exec.done(promise);
  }

  private saveOnePromise(exec:Execution, work:Work): Promise<any> {
    let setArgs = {
      work_load_href: work.workLoadHref,
      input_json: JSON.stringify(work.input),
      ancestor_level: work.ancestorLevel,
      parent_id: work.parentID ? parseInt(work.parentID, 10) : null
    };

    if (!work.id) {
      return insert(exec, this.workTableName, [setArgs])
      .then((result) => {
        work.id = result.insertId.toString();
        return work;
      });
    }
    return update(exec, this.workTableName, setArgs, {
      id: parseInt(work.id, 10)
    })
    .then((result) => {
      if (result.affectedRows !== 1) {
        throw new Error(`Expected only one row to be affected by updating work id ${work.id}, but ${result.affectedRows} were updated instead.`);
      }
      return work;
    });
  }

  saveAll(work: Work[]): Promise<any> {
    let exec = this.sql.transaction();
    let promises = work.map((row) => this.saveOnePromise(exec, row));
    let promise = Promise.all(promises);
    return exec.done(promise);
  }

  saveWorkStarted(work: Work): Promise<any> {
    if ((<any>work).resultID) {
      (<any>work.result).id = (<any>work).resultID;
    }

    let exec = this.sql.transaction();
    let promise = this.saveWorkResult(exec, work.result)
    .then(() => {
      (<any>work).resultID = (<any>work.result).id;
      return update(exec, this.workTableName, {
        result_id: (<any>work).resultID
      }, {
        id: parseInt(work.id, 10)
      })
    });
    return exec.done(promise);
  }

  private saveWorkResult(exec:Execution, workResult:WorkResult): Promise<any> {
    let setArgs = {
      started: workResult.started,
      ended: workResult.ended,
      result_json: workResult.result ? JSON.stringify(workResult.result) : null,
      error_message: workResult.error ? workResult.error.message : null,
      error_stack: workResult.error ? workResult.error.stack : null,
      error_type: workResult.error ? workResult.error.name : null,
      error_fields_json: workResult.error ? JSON.stringify(workResult.error) : null,
    };

    if (!(<any>workResult).id) {
      return insert(exec, this.workResultTableName, [setArgs])
      .then((result) => {
        (<any>workResult).id = result.insertId.toString();
      });
    }
    return update(exec, this.workResultTableName, setArgs, {
      id: parseInt((<any>workResult).id, 10)
    })
    .then((result) => {
      if (result.affectedRows !== 1) {
        throw new Error(`Expected only one row to be affected by updating work result id ${(<any>workResult).id}, but ${result.affectedRows} were updated instead.`);
      }
    });
  }

  saveWorkEnded(work: Work): Promise<any> {
    if ((<any>work).resultID) {
      (<any>work.result).id = (<any>work).resultID;
    }

    let exec = this.sql.transaction();
    let promise = this.saveWorkResult(exec, work.result)
      .then(() => {
        (<any>work).resultID = (<any>work.result).id;
      });
    return exec.done(promise);
  }

  saveFinalizerStarted(work: Work): Promise<any> {
    if ((<any>work)) {
      (<any>work.finalizerResult).id = (<any>work).finalizerResultID;
    }

    let exec = this.sql.transaction();
    let promise = this.saveWorkResult(exec, work.finalizerResult)
      .then(() => {
        (<any>work).finalizerResultID = (<any>work.finalizerResult).id;
      });
    return exec.done(promise);
  }

  saveFinalizerEnded(work: Work): Promise<any> {
    if ((<any>work)) {
      (<any>work.finalizerResult).id = (<any>work).finalizerResultID;
    }

    let exec = this.sql.transaction();
    let promise = this.saveWorkResult(exec, work.finalizerResult)
      .then(() => {
        (<any>work).finalizerResultID = (<any>work.finalizerResult).id;
      });
    return exec.done(promise);
  }

  saveCreatedChildren(work: Work): Promise<any> {
    let exec = this.sql.transaction();
    let rows = work.childrenIDs.map((row) => {
      return {
        parent_work_id: parseInt(work.id, 10),
        child_work_id: parseInt(row, 10),
        is_finished: false
      };
    });
    let promise = insert(exec, this.workChildrenTableName, rows);
    return exec.done(promise);
  }

  childWorkFinished(work: Work, parent: Work): Promise<boolean> {
    let exec = this.sql.transaction();
    let promise = update(exec, this.workChildrenTableName, {
      is_finished: true
    }, {
      parent_work_id: parseInt(parent.id, 10),
      child_work_id: parseInt(work.id, 10),
    });
    return exec.done(promise);
  }

  load(id: string): Promise<Work> {
    let exec = this.sql.transaction();
    let work:Work;
    let promise = selectOne(exec, this.workTableName, {
      id: parseInt(id, 10)
    })
    .then((workRow) => {
      if (!workRow) {
        return null;
      }

      work = this.deserializeWork(workRow);
      return this.loadWorkResult(exec, workRow.result_id)
      .then((result) => {
        if (result) {
          work.result = this.deserializeResult(result);
          (<any>work).resultID = (<any>work.result).id;
        }
        return this.loadWorkResult(exec, workRow.finalizer_result_id);
      })
      .then((result) => {
        if (result) {
          work.finalizerResult = this.deserializeResult(result);
          (<any>work).finalizerResultID = (<any>work.finalizerResult).id;
        }
        return this.loadChildren(exec, work);
      });
    });
    return exec.done(promise);
  }

  loadAll(ids: string[]): Promise<Work[]> {
    throw new Error('Not implemented yet');
  }

  private loadWorkResult(exec:Execution, id:number): Promise<WorkResult> {
    if (!id) {
      return Promise.resolve(null);
    }
    return selectOne(exec, this.workResultTableName, {
      id: id
    });
  }

  private loadChildren(exec:Execution, work:Work): Promise<Work> {
    return select(exec, this.workChildrenTableName, {
      parent_work_id: parseInt(work.id, 10)
    })
    .then((result) => {
      work.childrenIDs = result.map((row) => row.child_work_id.toString());
      work.finishedChildrenIDs = result
      .filter((row) => !!row.is_finished)
      .map((row) => row.child_work_id.toString());
      return work;
    });
  }

  private deserializeWork(result:any): Work {
    let work = new Work();
    work.ancestorLevel = result.ancestor_level;
    work.id = result.id.toString();
    work.input = result.input_json ? JSON.parse(result.input_json) : null;
    work.parentID = result.parent_id ? result.parent_id.toString() : null;
    work.workLoadHref = result.work_load_href;
    return work;
  }

  private deserializeResult(result: any): WorkResult {
    let workResult = new WorkResult();
    workResult.ended = result.ended;
    (<any>workResult).id = result.id;
    workResult.result = result.result_json ? JSON.parse(result.result_json) : null;
    workResult.started = result.started;
    if (result.error_message) {
      workResult.error = new Error(result.error_message);
      workResult.error.stack = result.error_stack;
      workResult.error.name = result.error_type;
      let json = result.error_fields_json ? JSON.parse(result.error_fields_json) : null;
      if (json) {
        Object.keys(json).forEach((key) => {
          workResult.error[key] = json[key];
        });
      }
    }
    return workResult;
  }
}
