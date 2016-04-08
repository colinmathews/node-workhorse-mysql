require('source-map-support').install({
  handleUncaughtExceptions: false
});
let path = require('path');
let fs = require('fs');
import { assert } from 'chai';
import { Workhorse, Config, Work, LogLevel } from 'node-workhorse';
import { MySQLConfig } from 'node-mysql2-wrapper';
import MySQLStateManager from '../lib/services/mysql-state-manager';

// TODO: Create specs for serialization/deserialization

describe('MySQL', () => {
  let baseWorkPath = 'working://dist/test/test-work/';

  function getConfig() {
    let jsonPath = path.resolve(__dirname, '../../mysql-config.json');
    if (!fs.existsSync(jsonPath)) {
      throw new Error("Please create a 'mysql-config.json' file in the root directory of this project to test")
    }

    let rawConfig = JSON.parse(fs.readFileSync(jsonPath));
    return new MySQLConfig(rawConfig);
  }

  describe('#run', () => {
    let subject: Workhorse;
    before(function() {
      let config = getConfig();
      subject = new Workhorse(new Config({
        stateManager: new MySQLStateManager(config)
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
