import { Work, IStateManager, Workhorse } from 'node-workhorse';
import { MySQL, MySQLConfig } from 'node-mysql2-wrapper';
/**
 * Dates are stored in UTC format, but when they're pulled out
 * of the DB they are interpreted as local times. So we need to push them to UTC.
 */
export declare function deserializeDate(raw: any): Date;
export default class MySQLStateManager implements IStateManager {
    config: MySQLConfig;
    workTableName: string;
    workResultTableName: string;
    workChildrenTableName: string;
    workhorse: Workhorse;
    sql: MySQL;
    constructor(config: MySQLConfig, workTableName?: string, workResultTableName?: string, workChildrenTableName?: string);
    save(work: Work): Promise<any>;
    saveAll(work: Work[]): Promise<any>;
    saveWorkStarted(work: Work): Promise<any>;
    saveWorkEnded(work: Work): Promise<any>;
    saveFinalizerStarted(work: Work): Promise<any>;
    saveFinalizerEnded(work: Work): Promise<any>;
    saveCreatedChildren(work: Work): Promise<any>;
    childWorkFinished(work: Work, parent: Work): Promise<boolean>;
    load(id: string): Promise<Work>;
    loadAll(ids: string[]): Promise<Work[]>;
    private saveOnePromise(exec, work);
    private saveWorkResult(exec, workResult);
    private finishLoadingWork(exec, workRow);
    private loadWorkResult(exec, id);
    private loadChildren(exec, work);
    private deserializeWork(result);
    private deserializeResult(result);
}
