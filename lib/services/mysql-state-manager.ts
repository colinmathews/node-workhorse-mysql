import { Promise } from 'es6-promise';
import { Work, WorkResult, IStateManager, Workhorse} from 'node-workhorse';
import { MySQL, MySQLConfig, Execution, insert, update, select, selectOne } from 'node-mysql2-wrapper';

/**
 * Dates are stored in UTC format, but when they're pulled out
 * of the DB they are interpreted as local times. So we need to push them to UTC.
 */
export function deserializeDate(raw: any): Date {
  'use strict';
  if (!raw) {
    return null;
  }
  let offsetMinutes = raw.getTimezoneOffset();
  return new Date(raw.valueOf() - offsetMinutes * 1000 * 60);
}

export default class MySQLStateManager implements IStateManager {
  workhorse: Workhorse;
  sql: MySQL;

  constructor(
    public config: MySQLConfig,
    public workTableName: string = 'work',
    public workResultTableName: string = 'work_result',
    public workChildrenTableName: string = 'work_children') {
    this.sql = new MySQL(this.config);
  }

  save(work: Work): Promise<any> {
    let exec = this.sql.transaction();
    let promise = this.saveOnePromise(exec, work);
    return exec.done(promise);
  }

  saveAll(work: Work[]): Promise<any> {
    if (work.length === 0) {
      return Promise.resolve();
    }
    let exec = this.sql.transaction();
    let promises = work.map((row) => this.saveOnePromise(exec, row));
    let promise = Promise.all(promises);
    return exec.done(promise);
  }

  saveWorkStarted(work: Work): Promise<any> {
    if ((work as any).resultID) {
      (work.result as any).id = (work as any).resultID;
    }

    let exec = this.sql.transaction();
    let promise = this.saveWorkResult(exec, work.result)
      .then(() => {
        (work as any).resultID = (work.result as any).id;
        return update(
          exec,
          this.workTableName,
          { result_id: (work as any).resultID },
          { id: parseInt(work.id, 10) }
        );
      });
    return exec.done(promise);
  }

  saveWorkEnded(work: Work): Promise<any> {
    if ((work as any).resultID) {
      (work.result as any).id = (work as any).resultID;
    }

    let exec = this.sql.transaction();
    let promise = this.saveWorkResult(exec, work.result)
      .then(() => {
        (work as any).resultID = (work.result as any).id;
      });
    return exec.done(promise);
  }

  saveFinalizerStarted(work: Work): Promise<any> {
    if ((work as any)) {
      (work.finalizerResult as any).id = (work as any).finalizerResultID;
    }

    let exec = this.sql.transaction();
    let promise = this.saveWorkResult(exec, work.finalizerResult)
      .then(() => {
        (work as any).finalizerResultID = (work.finalizerResult as any).id;
        return update(
          exec,
          this.workTableName,
          { finalizer_result_id: (work as any).finalizerResultID },
          { id: parseInt(work.id, 10) }
        );
      });
    return exec.done(promise);
  }

  saveFinalizerEnded(work: Work): Promise<any> {
    if ((work as any)) {
      (work.finalizerResult as any).id = (work as any).finalizerResultID;
    }

    let exec = this.sql.transaction();
    let promise = this.saveWorkResult(exec, work.finalizerResult)
      .then(() => {
        (work as any).finalizerResultID = (work.finalizerResult as any).id;
      });
    return exec.done(promise);
  }

  saveCreatedChildren(work: Work): Promise<any> {
    let rows = work.childrenIDs.map((row) => {
      return {
        parent_work_id: parseInt(work.id, 10),
        child_work_id: parseInt(row, 10),
        is_finished: false
      };
    });
    if (rows.length === 0) {
      return Promise.resolve();
    }
    let exec = this.sql.transaction();
    let promise = insert(exec, this.workChildrenTableName, rows);
    return exec.done(promise);
  }

  childWorkFinished(work: Work, parent: Work): Promise<boolean> {
    let exec = this.sql.transaction();
    let promise = update(
      exec,
      this.workChildrenTableName,
      { is_finished: true },
      {
        parent_work_id: parseInt(parent.id, 10),
        child_work_id: parseInt(work.id, 10),
      }
    );
    return exec.done(promise);
  }

  load(id: string): Promise<Work> {
    let exec = this.sql.transaction();
    let promise = selectOne(exec, this.workTableName, {
      id: parseInt(id, 10)
    })
      .then((workRow) => {
        if (!workRow) {
          return null;
        }
        return this.finishLoadingWork(exec, workRow);
      });
    return exec.done(promise);
  }

  loadAll(ids: string[]): Promise<Work[]> {
    if (ids.length === 0) {
      return Promise.resolve([]);
    }
    let exec = this.sql.transaction();
    let promise = exec.query(`select * from ${this.workTableName} where id in (:ids)`, {
      ids: ids.map((row) => parseInt(row, 10))
    })
      .then((workRows) => {
        let promises = workRows.map((workRow) => this.finishLoadingWork(exec, workRow));
        return Promise.all(promises);
      });
    return exec.done(promise);
  }

  private saveOnePromise(exec: Execution, work: Work): Promise<any> {
    work.updated = new Date();
    let setArgs = {
      updated: work.updated.toISOString(),
      work_load_href: work.workLoadHref,
      input_json: JSON.stringify(work.input),
      ancestor_level: work.ancestorLevel,
      parent_id: work.parentID ? parseInt(work.parentID, 10) : null,
      has_finalizer: work.hasFinalizer ? 1 : 0
    } as any;
    if (!work.id) {
      work.created = new Date();
      setArgs.created = work.created.toISOString();
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
          throw new Error(`Expected only one row to be affected by updating work id ${work.id},` +
            `but ${result.affectedRows} were updated instead.`);
        }
        return work;
      });
  }

  private saveWorkResult(exec: Execution, workResult: WorkResult): Promise<any> {
    let setArgs = {
      started: workResult.started ? workResult.started.toISOString() : null,
      ended: workResult.ended ? workResult.ended.toISOString() : null,
      result_json: workResult.result ? JSON.stringify(workResult.result) : null,
      error_message: workResult.error ? workResult.error.message : null,
      error_stack: workResult.error ? workResult.error.stack : null,
      error_type: workResult.error ? workResult.error.name : null,
      error_fields_json: workResult.error ? JSON.stringify(workResult.error) : null,
    };

    if (!(workResult as any).id) {
      return insert(exec, this.workResultTableName, [setArgs])
        .then((result) => {
          (workResult as any).id = result.insertId;
        });
    }
    return update(exec, this.workResultTableName, setArgs, {
      id: (workResult as any).id
    })
      .then((result) => {
        if (result.affectedRows !== 1) {
          throw new Error('Expected only one row to be affected by updating work result id ' +
            `${(workResult as any).id}, but ${result.affectedRows} were updated instead.`);
        }
      });
  }

  private finishLoadingWork(exec: Execution, workRow: any): Promise<Work> {
    let work = this.deserializeWork(workRow);
    return this.loadWorkResult(exec, workRow.result_id)
      .then((result) => {
        if (result) {
          work.result = this.deserializeResult(result);
          (work as any).resultID = (work.result as any).id;
        }
        return this.loadWorkResult(exec, workRow.finalizer_result_id);
      })
      .then((result) => {
        if (result) {
          work.finalizerResult = this.deserializeResult(result);
          (work as any).finalizerResultID = (work.finalizerResult as any).id;
        }
        return this.loadChildren(exec, work);
      });
  }

  private loadWorkResult(exec: Execution, id: number): Promise<WorkResult> {
    if (!id) {
      return Promise.resolve(null);
    }
    return selectOne(exec, this.workResultTableName, {
      id: id
    });
  }

  private loadChildren(exec: Execution, work: Work): Promise<Work> {
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

  private deserializeWork(result: any): Work {
    let work = new Work();
    work.ancestorLevel = result.ancestor_level;
    work.id = result.id.toString();
    work.input = result.input_json ? JSON.parse(result.input_json) : null;
    work.parentID = result.parent_id ? result.parent_id.toString() : null;
    work.workLoadHref = result.work_load_href;
    work.hasFinalizer = !!result.has_finalizer;
    return work;
  }

  private deserializeResult(result: any): WorkResult {
    let workResult = new WorkResult();
    workResult.ended = deserializeDate(result.ended);
    (workResult as any).id = result.id;
    workResult.result = result.result_json ? JSON.parse(result.result_json) : null;
    workResult.started = deserializeDate(result.started);
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
