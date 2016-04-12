"use strict";
require('source-map-support').install({
    handleUncaughtExceptions: false
});
var path = require('path');
var fs = require('fs');
var util = require('util');
var chai_1 = require('chai');
var node_workhorse_1 = require('node-workhorse');
var node_mysql2_wrapper_1 = require('node-mysql2-wrapper');
var mysql_state_manager_1 = require('../lib/services/mysql-state-manager');
var create_work_tables_1 = require('../lib/util/create-work-tables');
describe('Work persistence', function () {
    var stateManager;
    var testTableName = 'work_test';
    var testResultTableName = 'work_result_test';
    var testChildrenTableName = 'work_children_test';
    var baseWorkPath = 'working://dist/test/test-work/';
    function getConfig() {
        var jsonPath = path.resolve(__dirname, '../../mysql-config.json');
        if (!fs.existsSync(jsonPath)) {
            throw new Error("Please create a 'mysql-config.json' file in the root directory of this project to test");
        }
        var rawConfig = JSON.parse(fs.readFileSync(jsonPath));
        return new node_mysql2_wrapper_1.MySQLConfig(rawConfig);
    }
    before(function () {
        this.timeout(5000);
        var config = getConfig();
        stateManager = new mysql_state_manager_1.default(config, testTableName, testResultTableName, testChildrenTableName);
        var exec = stateManager.sql.transaction();
        var promise = node_mysql2_wrapper_1.drop(exec, testChildrenTableName, testTableName, testResultTableName);
        return exec.done(promise)
            .then(function () {
            return create_work_tables_1.default(stateManager.sql, testTableName, testResultTableName, testChildrenTableName);
        });
    });
    describe('#run', function () {
        it('should insert a work record', function () {
            var work = new node_workhorse_1.Work('this is a test', { input: { nested: 'hi ' } });
            return stateManager.save(work)
                .then(function () {
                chai_1.assert.isOk(work.id);
                var exec = stateManager.sql.execution();
                var promise = exec.query("select * from " + testTableName + " where id = :id", work);
                return exec.done(promise);
            })
                .then(function (result) {
                chai_1.assert.lengthOf(result, 1);
                chai_1.assert.equal(result[0].work_load_href, 'this is a test');
                chai_1.assert.isNull(result[0].result_id);
            });
        });
        it('should update a work record', function () {
            var work = new node_workhorse_1.Work('this is a test', { input: { nested: 'hi ' } });
            return stateManager.save(work)
                .then(function () {
                work.input = 'again';
                return stateManager.save(work);
            })
                .then(function () {
                chai_1.assert.isOk(work.id);
                var exec = stateManager.sql.execution();
                var promise = exec.query("select * from " + testTableName + " where id = :id", work);
                return exec.done(promise);
            })
                .then(function (result) {
                chai_1.assert.lengthOf(result, 1);
                chai_1.assert.equal(result[0].input_json, JSON.stringify('again'));
                chai_1.assert.isNull(result[0].result_id);
            });
        });
        it('should insert several work records', function () {
            var work1 = new node_workhorse_1.Work('red', 1);
            var work2 = new node_workhorse_1.Work('blue', 1);
            return stateManager.saveAll([work1, work2])
                .then(function () {
                chai_1.assert.isOk(work1.id);
                chai_1.assert.isOk(work2.id);
                chai_1.assert.notEqual(work1.id, work2.id);
            });
        });
        it('should insert a started work result record', function () {
            var work = new node_workhorse_1.Work('this is a test', { testing: 1 });
            work.result = new node_workhorse_1.WorkResult();
            work.result.start();
            return stateManager.save(work)
                .then(function () {
                chai_1.assert.isOk(work.id);
                return stateManager.saveWorkStarted(work);
            })
                .then(function () {
                var exec = stateManager.sql.execution();
                var promise = exec.query("select * from " + testTableName + " where id = :id", work)
                    .then(function (result) {
                    chai_1.assert.lengthOf(result, 1);
                    chai_1.assert.isOk(result[0].result_id);
                    chai_1.assert.equal(result[0].result_id, work.resultID);
                    return exec.query("select * from " + testResultTableName + " where id = :resultID", work);
                })
                    .then(function (result) {
                    chai_1.assert.lengthOf(result, 1);
                    chai_1.assert.isOk(result[0].started);
                    chai_1.assert.isNull(result[0].ended);
                });
                return exec.done(promise);
            });
        });
        it('should insert a finished work result record', function () {
            var work = new node_workhorse_1.Work('this is a test', { testing: 1 });
            work.result = new node_workhorse_1.WorkResult();
            work.result.start();
            return stateManager.save(work)
                .then(function () {
                chai_1.assert.isOk(work.id);
                return stateManager.saveWorkStarted(work);
            })
                .then(function () {
                work.result.end(null, { result: 15 });
                return stateManager.saveWorkEnded(work);
            })
                .then(function () {
                var exec = stateManager.sql.execution();
                var promise = exec.query("select * from " + testTableName + " where id = :id", work)
                    .then(function (result) {
                    chai_1.assert.lengthOf(result, 1);
                    chai_1.assert.isOk(result[0].result_id);
                    chai_1.assert.equal(result[0].result_id, work.resultID);
                    return exec.query("select * from " + testResultTableName + " where id = :resultID", work);
                })
                    .then(function (result) {
                    chai_1.assert.lengthOf(result, 1);
                    chai_1.assert.isOk(result[0].started);
                    chai_1.assert.isOk(result[0].ended);
                    chai_1.assert.equal(result[0].result_json, JSON.stringify({ result: 15 }));
                });
                return exec.done(promise);
            });
        });
        it('should insert child work', function () {
            var work = new node_workhorse_1.Work('this is a test', { testing: 1 });
            var child1 = new node_workhorse_1.Work('child #1', 'goo');
            var child2 = new node_workhorse_1.Work('child #2', 'gaa');
            return stateManager.save(work)
                .then(function () {
                child1.parentID = child2.parentID = work.id;
                return stateManager.saveAll([child1, child2]);
            })
                .then(function (result) {
                work.childrenIDs = result.map(function (row) { return row.id; });
                stateManager.saveCreatedChildren(work);
            })
                .then(function () {
                var exec = stateManager.sql.execution();
                var promise = exec.query("select * from " + testChildrenTableName + " where parent_work_id = :id", work)
                    .then(function (result) {
                    chai_1.assert.lengthOf(result, 2);
                    chai_1.assert.equal(result[0].parent_work_id.toString(), work.id);
                    chai_1.assert.equal(result[1].parent_work_id.toString(), work.id);
                    chai_1.assert.isOk(result[0].child_work_id);
                    chai_1.assert.isOk(result[1].child_work_id);
                    chai_1.assert.notEqual(result[0].child_work_id, result[1].child_work_id);
                });
                return exec.done(promise);
            });
        });
        it('should load work', function () {
            var work = new node_workhorse_1.Work('this is a test', { testing: 1 });
            work.result = new node_workhorse_1.WorkResult();
            var child1 = new node_workhorse_1.Work('child #1', 'goo');
            var child2 = new node_workhorse_1.Work('child #2', 'gaa');
            work.result.start();
            return stateManager.save(work)
                .then(function () {
                child1.parentID = child2.parentID = work.id;
                return stateManager.saveAll([child1, child2]);
            })
                .then(function (result) {
                work.childrenIDs = result.map(function (row) { return row.id; });
                stateManager.saveCreatedChildren(work);
            })
                .then(function (result) {
                return stateManager.saveWorkStarted(work);
            })
                .then(function () {
                work.result.end(null, { result: 15 });
                return stateManager.saveWorkEnded(work);
            })
                .then(function () {
                return stateManager.load(work.id);
            })
                .then(function (result) {
                chai_1.assert.isNotNull(result);
                chai_1.assert.deepEqual(result.childrenIDs, [child1.id, child2.id]);
                chai_1.assert.deepEqual(result.finishedChildrenIDs, []);
                chai_1.assert.deepEqual(result.input, { testing: 1 });
                chai_1.assert.isOk(result.result);
                chai_1.assert.isTrue(util.isDate(result.result.started));
                chai_1.assert.isTrue(util.isDate(result.result.ended));
                chai_1.assert.deepEqual(result.result.result, { result: 15 });
            });
        });
        it('should load work that has errored', function () {
            var work = new node_workhorse_1.Work('this is a test', { testing: 1 });
            var err = new Error('This is a test');
            err.code = 404;
            work.result = new node_workhorse_1.WorkResult();
            work.result.start();
            return stateManager.save(work)
                .then(function (result) {
                return stateManager.saveWorkStarted(work);
            })
                .then(function () {
                work.result.end(err);
                return stateManager.saveWorkEnded(work);
            })
                .then(function () {
                return stateManager.load(work.id);
            })
                .then(function (result) {
                chai_1.assert.isNotNull(result);
                chai_1.assert.isOk(result.result);
                chai_1.assert.isTrue(util.isDate(result.result.started));
                chai_1.assert.isTrue(util.isDate(result.result.ended));
                chai_1.assert.equal(result.result.error.message, err.message);
                chai_1.assert.equal(result.result.error.stack, err.stack);
                chai_1.assert.equal(result.result.error.code, 404);
            });
        });
        it('should load a list of work', function () {
            var work1 = new node_workhorse_1.Work('load all test 1');
            var work2 = new node_workhorse_1.Work('load all test 2');
            work1.result = new node_workhorse_1.WorkResult();
            work2.result = new node_workhorse_1.WorkResult();
            var child1 = new node_workhorse_1.Work('child #1', 'goo');
            var child2 = new node_workhorse_1.Work('child #2', 'gaa');
            work1.result.start();
            return stateManager.save(work1)
                .then(function () {
                return stateManager.save(work2);
            })
                .then(function () {
                child1.parentID = work1.id;
                child2.parentID = work2.id;
                return stateManager.saveAll([child1, child2]);
            })
                .then(function (result) {
                work1.childrenIDs = [child1.id];
                stateManager.saveCreatedChildren(work1);
            })
                .then(function (result) {
                work2.childrenIDs = [child2.id];
                stateManager.saveCreatedChildren(work2);
            })
                .then(function (result) {
                return stateManager.saveWorkStarted(work1);
            })
                .then(function (result) {
                return stateManager.saveWorkStarted(work2);
            })
                .then(function () {
                work1.result.end(null, { wonka: 15 });
                return stateManager.saveWorkEnded(work1);
            })
                .then(function () {
                work2.result.end(null, { wonka: 14 });
                return stateManager.saveWorkEnded(work2);
            })
                .then(function () {
                return stateManager.loadAll([work1.id, work2.id]);
            })
                .then(function (result) {
                chai_1.assert.lengthOf(result, 2);
                chai_1.assert.equal(result[0].id, work1.id);
                chai_1.assert.equal(result[1].id, work2.id);
                chai_1.assert.equal(result[0].result.result.wonka, 15);
                chai_1.assert.equal(result[1].result.result.wonka, 14);
                chai_1.assert.deepEqual(result[0].childrenIDs, [child1.id]);
                chai_1.assert.deepEqual(result[1].childrenIDs, [child2.id]);
            });
        });
    });
});
//# sourceMappingURL=work-persistence-spec.js.map