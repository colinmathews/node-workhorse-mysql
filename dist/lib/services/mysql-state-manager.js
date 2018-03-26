"use strict";
var es6_promise_1 = require('es6-promise');
var node_workhorse_1 = require('node-workhorse');
var node_mysql2_wrapper_1 = require('node-mysql2-wrapper');
/**
 * Dates are stored in UTC format, but when they're pulled out
 * of the DB they are interpreted as local times. So we need to push them to UTC.
 */
function deserializeDate(raw) {
    'use strict';
    if (!raw) {
        return null;
    }
    var offsetMinutes = raw.getTimezoneOffset();
    return new Date(raw.valueOf() - offsetMinutes * 1000 * 60);
}
exports.deserializeDate = deserializeDate;
var MySQLStateManager = (function () {
    function MySQLStateManager(config, workTableName, workResultTableName, workChildrenTableName) {
        if (workTableName === void 0) { workTableName = 'work'; }
        if (workResultTableName === void 0) { workResultTableName = 'work_result'; }
        if (workChildrenTableName === void 0) { workChildrenTableName = 'work_children'; }
        this.config = config;
        this.workTableName = workTableName;
        this.workResultTableName = workResultTableName;
        this.workChildrenTableName = workChildrenTableName;
        this.sql = new node_mysql2_wrapper_1.MySQL(this.config);
    }
    MySQLStateManager.prototype.save = function (work) {
        var exec = this.sql.transaction();
        var promise = this.saveOnePromise(exec, work);
        return exec.done(promise);
    };
    MySQLStateManager.prototype.saveAll = function (work) {
        var _this = this;
        if (work.length === 0) {
            return es6_promise_1.Promise.resolve();
        }
        var exec = this.sql.transaction();
        var promises = work.map(function (row) { return _this.saveOnePromise(exec, row); });
        var promise = es6_promise_1.Promise.all(promises);
        return exec.done(promise);
    };
    MySQLStateManager.prototype.saveWorkStarted = function (work) {
        var _this = this;
        if (work.resultID) {
            work.result.id = work.resultID;
        }
        var exec = this.sql.transaction();
        var promise = this.saveWorkResult(exec, work.result)
            .then(function () {
            work.resultID = work.result.id;
            return node_mysql2_wrapper_1.update(exec, _this.workTableName, { result_id: work.resultID }, { id: parseInt(work.id, 10) });
        });
        return exec.done(promise);
    };
    MySQLStateManager.prototype.saveWorkEnded = function (work) {
        if (work.resultID) {
            work.result.id = work.resultID;
        }
        var exec = this.sql.transaction();
        var promise = this.saveWorkResult(exec, work.result)
            .then(function () {
            work.resultID = work.result.id;
        });
        return exec.done(promise);
    };
    MySQLStateManager.prototype.saveFinalizerStarted = function (work) {
        var _this = this;
        if (work) {
            work.finalizerResult.id = work.finalizerResultID;
        }
        var exec = this.sql.transaction();
        var promise = this.saveWorkResult(exec, work.finalizerResult)
            .then(function () {
            work.finalizerResultID = work.finalizerResult.id;
            return node_mysql2_wrapper_1.update(exec, _this.workTableName, { finalizer_result_id: work.finalizerResultID }, { id: parseInt(work.id, 10) });
        });
        return exec.done(promise);
    };
    MySQLStateManager.prototype.saveFinalizerEnded = function (work) {
        if (work) {
            work.finalizerResult.id = work.finalizerResultID;
        }
        var exec = this.sql.transaction();
        var promise = this.saveWorkResult(exec, work.finalizerResult)
            .then(function () {
            work.finalizerResultID = work.finalizerResult.id;
        });
        return exec.done(promise);
    };
    MySQLStateManager.prototype.saveCreatedChildren = function (work) {
        var rows = work.childrenIDs.map(function (row) {
            return {
                parent_work_id: parseInt(work.id, 10),
                child_work_id: parseInt(row, 10),
                is_finished: false
            };
        });
        if (rows.length === 0) {
            return es6_promise_1.Promise.resolve();
        }
        var exec = this.sql.transaction();
        var promise = node_mysql2_wrapper_1.insert(exec, this.workChildrenTableName, rows);
        return exec.done(promise);
    };
    MySQLStateManager.prototype.childWorkFinished = function (work, parent) {
        var exec = this.sql.transaction();
        var promise = node_mysql2_wrapper_1.update(exec, this.workChildrenTableName, { is_finished: true }, {
            parent_work_id: parseInt(parent.id, 10),
            child_work_id: parseInt(work.id, 10),
        });
        return exec.done(promise);
    };
    MySQLStateManager.prototype.load = function (id) {
        var _this = this;
        var exec = this.sql.transaction();
        var promise = node_mysql2_wrapper_1.selectOne(exec, this.workTableName, {
            id: parseInt(id, 10)
        })
            .then(function (workRow) {
            if (!workRow) {
                return null;
            }
            return _this.finishLoadingWork(exec, workRow);
        });
        return exec.done(promise);
    };
    MySQLStateManager.prototype.loadAll = function (ids) {
        var _this = this;
        if (ids.length === 0) {
            return es6_promise_1.Promise.resolve([]);
        }
        var exec = this.sql.transaction();
        var promise = exec.query("select * from " + this.workTableName + " where id in (:ids)", {
            ids: ids.map(function (row) { return parseInt(row, 10); })
        })
            .then(function (workRows) {
            var promises = workRows.map(function (workRow) { return _this.finishLoadingWork(exec, workRow); });
            return es6_promise_1.Promise.all(promises);
        });
        return exec.done(promise);
    };
    MySQLStateManager.prototype.saveOnePromise = function (exec, work) {
        work.updated = new Date();
        var setArgs = {
            updated: work.updated.toISOString(),
            work_load_href: work.workLoadHref,
            input_json: JSON.stringify(work.input),
            ancestor_level: work.ancestorLevel,
            parent_id: work.parentID ? parseInt(work.parentID, 10) : null,
            has_finalizer: work.hasFinalizer ? 1 : 0
        };
        if (!work.id) {
            work.created = new Date();
            setArgs.created = work.created.toISOString();
            return node_mysql2_wrapper_1.insert(exec, this.workTableName, [setArgs])
                .then(function (result) {
                work.id = result.insertId.toString();
                return work;
            });
        }
        return node_mysql2_wrapper_1.update(exec, this.workTableName, setArgs, {
            id: parseInt(work.id, 10)
        })
            .then(function (result) {
            if (result.affectedRows !== 1) {
                throw new Error(("Expected only one row to be affected by updating work id " + work.id + ",") +
                    ("but " + result.affectedRows + " were updated instead."));
            }
            return work;
        });
    };
    MySQLStateManager.prototype.saveWorkResult = function (exec, workResult) {
        var setArgs = {
            started: workResult.started ? workResult.started.toISOString() : null,
            ended: workResult.ended ? workResult.ended.toISOString() : null,
            result_json: workResult.result ? JSON.stringify(workResult.result) : null,
            error_message: workResult.error ? workResult.error.message : null,
            error_stack: workResult.error ? workResult.error.stack : null,
            error_type: workResult.error ? workResult.error.name : null,
            error_fields_json: workResult.error ? JSON.stringify(workResult.error) : null,
        };
        if (!workResult.id) {
            return node_mysql2_wrapper_1.insert(exec, this.workResultTableName, [setArgs])
                .then(function (result) {
                workResult.id = result.insertId;
            });
        }
        return node_mysql2_wrapper_1.update(exec, this.workResultTableName, setArgs, {
            id: workResult.id
        })
            .then(function (result) {
            if (result.affectedRows !== 1) {
                throw new Error('Expected only one row to be affected by updating work result id ' +
                    (workResult.id + ", but " + result.affectedRows + " were updated instead."));
            }
        });
    };
    MySQLStateManager.prototype.finishLoadingWork = function (exec, workRow) {
        var _this = this;
        var work = this.deserializeWork(workRow);
        return this.loadWorkResult(exec, workRow.result_id)
            .then(function (result) {
            if (result) {
                work.result = _this.deserializeResult(result);
                work.resultID = work.result.id;
            }
            return _this.loadWorkResult(exec, workRow.finalizer_result_id);
        })
            .then(function (result) {
            if (result) {
                work.finalizerResult = _this.deserializeResult(result);
                work.finalizerResultID = work.finalizerResult.id;
            }
            return _this.loadChildren(exec, work);
        });
    };
    MySQLStateManager.prototype.loadWorkResult = function (exec, id) {
        if (!id) {
            return es6_promise_1.Promise.resolve(null);
        }
        return node_mysql2_wrapper_1.selectOne(exec, this.workResultTableName, {
            id: id
        });
    };
    MySQLStateManager.prototype.loadChildren = function (exec, work) {
        return node_mysql2_wrapper_1.select(exec, this.workChildrenTableName, {
            parent_work_id: parseInt(work.id, 10)
        })
            .then(function (result) {
            work.childrenIDs = result.map(function (row) { return row.child_work_id.toString(); });
            work.finishedChildrenIDs = result
                .filter(function (row) { return !!row.is_finished; })
                .map(function (row) { return row.child_work_id.toString(); });
            return work;
        });
    };
    MySQLStateManager.prototype.deserializeWork = function (result) {
        var work = new node_workhorse_1.Work();
        work.ancestorLevel = result.ancestor_level;
        work.id = result.id.toString();
        work.input = result.input_json ? JSON.parse(result.input_json) : null;
        work.parentID = result.parent_id ? result.parent_id.toString() : null;
        work.workLoadHref = result.work_load_href;
        work.hasFinalizer = !!result.has_finalizer;
        return work;
    };
    MySQLStateManager.prototype.deserializeResult = function (result) {
        var workResult = new node_workhorse_1.WorkResult();
        workResult.ended = deserializeDate(result.ended);
        workResult.id = result.id;
        workResult.result = result.result_json ? JSON.parse(result.result_json) : null;
        workResult.started = deserializeDate(result.started);
        if (result.error_message) {
            workResult.error = new Error(result.error_message);
            workResult.error.stack = result.error_stack;
            workResult.error.name = result.error_type;
            var json_1 = result.error_fields_json ? JSON.parse(result.error_fields_json) : null;
            if (json_1) {
                Object.keys(json_1).forEach(function (key) {
                    workResult.error[key] = json_1[key];
                });
            }
        }
        return workResult;
    };
    return MySQLStateManager;
}());
Object.defineProperty(exports, "__esModule", { value: true });
exports.default = MySQLStateManager;
//# sourceMappingURL=mysql-state-manager.js.map