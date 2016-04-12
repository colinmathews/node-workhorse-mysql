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
describe('MySQLStateManager', function () {
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
        var subject;
        before(function () {
            var config = getConfig();
            subject = new node_workhorse_1.Workhorse(new node_workhorse_1.Config({
                stateManager: stateManager
            }));
        });
        it('should add two numbers', function () {
            this.timeout(20000);
            return subject.run(baseWorkPath + "calculator", { x: 1, y: 2 })
                .then(function (work) {
                chai_1.assert.isNotNull(work.result);
                chai_1.assert.equal(work.result.result, 3);
            });
        });
        it('should recurse a few times', function () {
            this.timeout(95000);
            return subject.run(baseWorkPath + "calculator", { x: 1, y: 2, recurse: 3 })
                .then(function (work) {
                return subject.state.load(work.id)
                    .then(function (work) {
                    return work.deep(subject);
                });
            })
                .then(function (deep) {
                chai_1.assert.isNotNull(deep.result);
                chai_1.assert.equal(deep.finalizerResult.result, 9);
                chai_1.assert.equal(deep.ancestorLevel, 0);
                chai_1.assert.equal(deep.children[0].ancestorLevel, 1);
                chai_1.assert.equal(deep.children[0].children[0].ancestorLevel, 2);
                chai_1.assert.equal(deep.children[0].children[0].children[0].ancestorLevel, 3);
                chai_1.assert.isTrue(deep.finalizerResult.ended >= deep.children[0].children[0].children[0].result.ended);
            });
        });
        it('should spawn child work test', function () {
            this.timeout(60000);
            return subject.run(baseWorkPath + "calculator", { x: 1, y: 2, twice: true })
                .then(function (work) {
                return subject.state.load(work.id);
            })
                .then(function (work) {
                chai_1.assert.isNotNull(work.result);
                chai_1.assert.equal(work.result.result, 3);
                chai_1.assert.lengthOf(work.childrenIDs, 1);
                chai_1.assert.lengthOf(work.finishedChildrenIDs, 1);
                chai_1.assert.isNotNull(work.finalizerResult);
                chai_1.assert.equal(work.finalizerResult.result, 3);
            });
        });
    });
});
//# sourceMappingURL=mysql-state-spec.js.map