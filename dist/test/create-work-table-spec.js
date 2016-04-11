"use strict";
require('source-map-support').install({
    handleUncaughtExceptions: false
});
var path = require('path');
var fs = require('fs');
var chai_1 = require('chai');
var node_mysql2_wrapper_1 = require('node-mysql2-wrapper');
var mysql_state_manager_1 = require('../lib/services/mysql-state-manager');
var create_work_tables_1 = require('../lib/util/create-work-tables');
describe('Create Work tables', function () {
    function getConfig() {
        var jsonPath = path.resolve(__dirname, '../../mysql-config.json');
        if (!fs.existsSync(jsonPath)) {
            throw new Error("Please create a 'mysql-config.json' file in the root directory of this project to test");
        }
        var rawConfig = JSON.parse(fs.readFileSync(jsonPath));
        return new node_mysql2_wrapper_1.MySQLConfig(rawConfig);
    }
    describe('#run', function () {
        var subject;
        var testTableName = 'work_test';
        var testResultTableName = 'work_result_test';
        var testChildrenTableName = 'work_children_test';
        before(function () {
            var config = getConfig();
            subject = new mysql_state_manager_1.default(config);
            var exec = subject.sql.transaction();
            var promise = node_mysql2_wrapper_1.drop(exec, testChildrenTableName, testTableName, testResultTableName);
            return exec.done(promise);
        });
        it('should create the work tables', function () {
            var exec = subject.sql.transaction();
            var promise = create_work_tables_1.default(subject.sql, testTableName, testResultTableName, testChildrenTableName)
                .then(function () {
                return node_mysql2_wrapper_1.insert(exec, testTableName, [{
                        work_load_href: 'hi'
                    }]);
            })
                .then(function () { return exec.query("select * from " + testTableName); });
            return exec.done(promise)
                .then(function (result) {
                chai_1.assert.lengthOf(result, 1);
                chai_1.assert.isOk(result[0].id);
                chai_1.assert.isOk(result[0].work_load_href, 'hi');
            });
        });
    });
});
//# sourceMappingURL=create-work-table-spec.js.map