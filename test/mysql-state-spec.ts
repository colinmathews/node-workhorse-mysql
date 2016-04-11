require('source-map-support').install({
  handleUncaughtExceptions: false
});
let path = require('path');
let fs = require('fs');
let util = require('util');
import { assert } from 'chai';
import { Workhorse, Config, Work, WorkResult, LogLevel } from 'node-workhorse';
import { MySQLConfig, drop } from 'node-mysql2-wrapper';
import MySQLStateManager from '../lib/services/mysql-state-manager';
import createWorkTables from '../lib/util/create-work-tables';

describe('MySQL', () => {
  let stateManager: MySQLStateManager;
  let testTableName = 'work_test';
  let testResultTableName = 'work_result_test';
  let testChildrenTableName = 'work_children_test';
  let baseWorkPath = 'working://dist/test/test-work/';

  function getConfig() {
    let jsonPath = path.resolve(__dirname, '../../mysql-config.json');
    if (!fs.existsSync(jsonPath)) {
      throw new Error("Please create a 'mysql-config.json' file in the root directory of this project to test")
    }

    let rawConfig = JSON.parse(fs.readFileSync(jsonPath));
    return new MySQLConfig(rawConfig);
  }

  before(function() {
    this.timeout(5000);
    let config = getConfig();
    stateManager = new MySQLStateManager(config, testTableName, testResultTableName, testChildrenTableName);
    let exec = stateManager.sql.transaction();
    let promise = drop(exec, testChildrenTableName, testTableName, testResultTableName);
    return exec.done(promise)
    .then(() => {
      return createWorkTables(stateManager.sql, testTableName, testResultTableName, testChildrenTableName);
    });
  });

  describe('#serialize-work', () => {
    it('should insert a work record', function() {
      let work = new Work('this is a test', { input: { nested: 'hi ' } });
      return stateManager.save(work)
      .then(() => {
        assert.isOk(work.id);
        let exec = stateManager.sql.execution();
        let promise = exec.query(`select * from ${testTableName} where id = :id`, work);
        return exec.done(promise);
      })
      .then((result) => {
        assert.lengthOf(result, 1);
        assert.equal(result[0].work_load_href, 'this is a test');
        assert.isNull(result[0].result_id);
      });
    });

    it('should update a work record', function() {
      let work = new Work('this is a test', { input: { nested: 'hi ' } });
      return stateManager.save(work)
      .then(() => {
        work.input = 'again';
        return stateManager.save(work);
      })
      .then(() => {
        assert.isOk(work.id);
        let exec = stateManager.sql.execution();
        let promise = exec.query(`select * from ${testTableName} where id = :id`, work);
        return exec.done(promise);
      })
      .then((result) => {
        assert.lengthOf(result, 1);
        assert.equal(result[0].input_json, JSON.stringify('again'));
        assert.isNull(result[0].result_id);
      });
    });

    it('should insert several work records', function() {
      let work1 = new Work('red', 1);
      let work2 = new Work('blue', 1);
      return stateManager.saveAll([work1, work2])
      .then(() => {
        assert.isOk(work1.id);
        assert.isOk(work2.id);
        assert.notEqual(work1.id, work2.id);
      });
    });

    it('should insert a started work result record', function() {
      let work = new Work('this is a test', { testing: 1 });
      work.result = new WorkResult();
      work.result.start();
      return stateManager.save(work)
      .then(() => {
        assert.isOk(work.id);
        return stateManager.saveWorkStarted(work);
      })
      .then(() => {
        let exec = stateManager.sql.execution();
        let promise = exec.query(`select * from ${testTableName} where id = :id`, work)
        .then((result) => {
          assert.lengthOf(result, 1);
          assert.isOk(result[0].result_id);
          assert.equal(result[0].result_id, (<any>work).resultID);
          return exec.query(`select * from ${testResultTableName} where id = :resultID`, work)
        })
        .then((result) => {
          assert.lengthOf(result, 1);
          assert.isOk(result[0].started);
          assert.isNull(result[0].ended);
        });
        return exec.done(promise);
      });
    });

    it('should insert a finished work result record', function() {
      let work = new Work('this is a test', { testing: 1 });
      work.result = new WorkResult();
      work.result.start();
      return stateManager.save(work)
      .then(() => {
        assert.isOk(work.id);
        return stateManager.saveWorkStarted(work);
      })
      .then(() => {
        work.result.end(null, { result: 15 });
        return stateManager.saveWorkEnded(work);
      })
      .then(() => {
        let exec = stateManager.sql.execution();
        let promise = exec.query(`select * from ${testTableName} where id = :id`, work)
        .then((result) => {
          assert.lengthOf(result, 1);
          assert.isOk(result[0].result_id);
          assert.equal(result[0].result_id, (<any>work).resultID);
          return exec.query(`select * from ${testResultTableName} where id = :resultID`, work)
        })
        .then((result) => {
          assert.lengthOf(result, 1);
          assert.isOk(result[0].started);
          assert.isOk(result[0].ended);
          assert.equal(result[0].result_json, JSON.stringify({ result: 15 }));
        });
        return exec.done(promise);
      });
    });

    it('should insert child work', function() {
      let work = new Work('this is a test', { testing: 1 });
      let child1 = new Work('child #1', 'goo');
      let child2 = new Work('child #2', 'gaa');
      return stateManager.save(work)
      .then(() => {
        child1.parentID = child2.parentID = work.id;
        return stateManager.saveAll([child1, child2]);
      })
      .then((result) => {
        work.childrenIDs = result.map((row) => row.id);
        stateManager.saveCreatedChildren(work)
      })
      .then(() => {
        let exec = stateManager.sql.execution();
        let promise = exec.query(`select * from ${testChildrenTableName} where parent_work_id = :id`, work)
        .then((result) => {
          assert.lengthOf(result, 2);
          assert.equal(result[0].parent_work_id.toString(), work.id);
          assert.equal(result[1].parent_work_id.toString(), work.id);
          assert.isOk(result[0].child_work_id);
          assert.isOk(result[1].child_work_id);
          assert.notEqual(result[0].child_work_id, result[1].child_work_id);
        });
        return exec.done(promise);
      });
    });

    it('should load work', function() {
      let work = new Work('this is a test', { testing: 1 });
      work.result = new WorkResult();
      let child1 = new Work('child #1', 'goo');
      let child2 = new Work('child #2', 'gaa');
      work.result.start();
      return stateManager.save(work)
      .then(() => {
        child1.parentID = child2.parentID = work.id;
        return stateManager.saveAll([child1, child2]);
      })
      .then((result) => {
        work.childrenIDs = result.map((row) => row.id);
        stateManager.saveCreatedChildren(work)
      })
      .then((result) => {
        return stateManager.saveWorkStarted(work);
      })
      .then(() => {
        work.result.end(null, { result: 15 });
        return stateManager.saveWorkEnded(work);
      })
      .then(() => {
        return stateManager.load(work.id);
      })
      .then((result) => {
        assert.isNotNull(result);
        assert.deepEqual(result.childrenIDs, [child1.id, child2.id]);
        assert.deepEqual(result.finishedChildrenIDs, []);
        assert.deepEqual(result.input, { testing: 1 });
        assert.isOk(result.result);
        assert.isTrue(util.isDate(result.result.started));
        assert.isTrue(util.isDate(result.result.ended));
        assert.deepEqual(result.result.result, { result: 15 });
      });
    });

    it('should load work that has errored', function() {
      let work = new Work('this is a test', { testing: 1 });
      let err = new Error('This is a test');
      (<any>err).code = 404;
      work.result = new WorkResult();
      work.result.start();
      return stateManager.save(work)
      .then((result) => {
        return stateManager.saveWorkStarted(work);
      })
      .then(() => {
        work.result.end(err);
        return stateManager.saveWorkEnded(work);
      })
      .then(() => {
        return stateManager.load(work.id);
      })
      .then((result) => {
        assert.isNotNull(result);
        assert.isOk(result.result);
        assert.isTrue(util.isDate(result.result.started));
        assert.isTrue(util.isDate(result.result.ended));
        assert.equal(result.result.error.message, err.message);
        assert.equal(result.result.error.stack, err.stack);
        assert.equal((<any>result.result.error).code, 404);
      });
    });
  });

  describe('#run', () => {
    let subject: Workhorse;
    before(function() {
      let config = getConfig();
      subject = new Workhorse(new Config({
        stateManager: stateManager
      }));
    });

    xit('should add two numbers', function() {
      this.timeout(20000);
      return subject.run(`${baseWorkPath}calculator`, { x: 1, y: 2 })
        .then((work: Work) => {
          assert.isNotNull(work.result);
          assert.equal(work.result.result, 3);
        });
    });

    xit('should recurse a few times', function() {
      this.timeout(95000);
      return subject.run(`${baseWorkPath}calculator`, { x: 1, y: 2, recurse: 3 })
        .then((work: Work) => {
          return subject.state.load(work.id)
            .then((work) => {
              return work.deep(subject);
            });
        })
        .then((deep) => {
          assert.isNotNull(deep.result);
          assert.equal(deep.finalizerResult.result, 9);
          assert.equal(deep.ancestorLevel, 0);
          assert.equal(deep.children[0].ancestorLevel, 1);
          assert.equal(deep.children[0].children[0].ancestorLevel, 2);
          assert.equal(deep.children[0].children[0].children[0].ancestorLevel, 3);
          assert.isTrue(deep.finalizerResult.ended >= deep.children[0].children[0].children[0].result.ended);
        });
    });

    xit('should spawn child work test', function() {
      this.timeout(60000);
      return subject.run(`${baseWorkPath}calculator`, { x: 1, y: 2, twice: true })
        .then((work: Work) => {
          return subject.state.load(work.id);
        })
        .then((work: Work) => {
          assert.isNotNull(work.result);
          assert.equal(work.result.result, 3);
          assert.lengthOf(work.childrenIDs, 1);
          assert.lengthOf(work.finishedChildrenIDs, 1);
        });
    });
  });
});
