require('source-map-support').install({
  handleUncaughtExceptions: false
});
let path = require('path');
let fs = require('fs');
import { assert } from 'chai';
import { Workhorse, Config, Work, LogLevel } from 'node-workhorse';
import { MySQLConfig, insert, drop } from 'node-mysql2-wrapper';
import MySQLStateManager from '../lib/services/mysql-state-manager';
import createWorkTables from '../lib/util/create-work-tables';

describe('Create Work tables', () => {
  function getConfig() {
    let jsonPath = path.resolve(__dirname, '../../mysql-config.json');
    if (!fs.existsSync(jsonPath)) {
      throw new Error("Please create a 'mysql-config.json' file in the root directory of this project to test")
    }

    let rawConfig = JSON.parse(fs.readFileSync(jsonPath));
    return new MySQLConfig(rawConfig);
  }

  describe('#run', () => {
    let subject: MySQLStateManager;
    let testTableName = 'work_test';
    let testResultTableName = 'work_result_test';
    let testChildrenTableName = 'work_children_test';

    before(function() {
      let config = getConfig();
      subject = new MySQLStateManager(config);
      let exec = subject.sql.transaction();
      let promise = drop(exec, testChildrenTableName, testTableName, testResultTableName);
      return exec.done(promise);
    });

    it('should create the work tables', function() {
      let exec = subject.sql.transaction();

      let promise = createWorkTables(subject.sql, testTableName, testResultTableName, testChildrenTableName)
      .then(() => {
        return insert(exec, testTableName, [{
          work_load_href: 'hi'
        }]);
      })
      .then(() => exec.query(`select * from ${testTableName}`));

      return exec.done(promise)
      .then((result) => {
        assert.lengthOf(result, 1);
        assert.isOk(result[0].id);
        assert.isOk(result[0].work_load_href, 'hi');
      });
    });
  });
});
