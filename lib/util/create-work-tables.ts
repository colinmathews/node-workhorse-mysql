import { Promise } from 'es6-promise';
import { MySQL, Execution, create, addForeignKey } from 'node-mysql2-wrapper';

export default function createWorkTables(
  sql: MySQL,
  workTableName: string = 'work',
  workResultTableName: string = 'work_result',
  workChildrenTableName: string = 'work_children'): Promise<any> {
  'use strict';

  let exec = sql.transaction();
  let promise = createWorkTable(exec, workTableName)
  .then(() => {
    return createWorkResultTable(exec, workResultTableName);
  })
  .then(() => {
    return createWorkChildrenTable(exec, workChildrenTableName);
  })
  .then(() => {
    return addForeignKey(exec, workTableName, ['parent_id'], workTableName, ['id'], `${workTableName}_parent_id`);
  })
  .then(() => {
    return addForeignKey(exec, workTableName, ['result_id'], workResultTableName, ['id'], `${workTableName}_result_id`);
  })
  .then(() => {
    return addForeignKey(exec, workTableName, ['finalizer_result_id'], workResultTableName, ['id'], `${workTableName}_finalizer_result_id`);
  })
  .then(() => {
    return addForeignKey(exec, workChildrenTableName, ['parent_work_id'], workTableName, ['id'], `${workChildrenTableName}_parent_id`);
  })
  .then(() => {
    return addForeignKey(exec, workChildrenTableName, ['child_work_id'], workTableName, ['id'], `${workChildrenTableName}_child_id`);
  });

  return exec.done(promise);
}

function createWorkTable(sql: Execution, tableName: string): Promise<any> {
  'use strict';
  return create(sql, tableName, {
    id: {
      definition: 'INT NOT NULL AUTO_INCREMENT',
      isPrimary: true
    },
    created: {
      definition: 'TIMESTAMP(3) NOT NULL'
    },
    updated: {
      definition: 'TIMESTAMP(3) NOT NULL'
    },
    work_load_href: {
      definition: 'VARCHAR(1024) NOT NULL'
    },
    input_json: {
      definition: 'TEXT NULL'
    },
    result_id: {
      definition: 'INT NULL'
    },
    finalizer_result_id: {
      definition: 'INT NULL'
    },
    parent_id: {
      definition: 'INT NULL'
    },
    ancestor_level: {
      definition: 'INT NOT NULL'
    },
    has_finalizer: {
      definition: 'TINYINT NOT NULL'
    }
  });
}

function createWorkResultTable(sql: Execution, tableName: string): Promise<any> {
  'use strict';
  return create(sql, tableName, {
    id: {
      definition: 'INT NOT NULL AUTO_INCREMENT',
      isPrimary: true
    },
    result_json: {
      definition: 'TEXT NULL'
    },
    started: {
      definition: 'TIMESTAMP(3) NULL'
    },
    ended: {
      definition: 'TIMESTAMP(3) NULL'
    },
    error_message: {
      definition: 'TEXT NULL'
    },
    error_stack: {
      definition: 'TEXT NULL'
    },
    error_type: {
      definition: 'VARCHAR(64) NULL'
    },
    error_fields_json: {
      definition: 'TEXT NULL'
    }
  });
}

function createWorkChildrenTable(sql: Execution, tableName: string): Promise<any> {
  'use strict';
  return create(sql, tableName, {
    parent_work_id: {
      definition: 'INT NOT NULL',
      isPrimary: true
    },
    child_work_id: {
      definition: 'INT NOT NULL',
      isPrimary: true
    },
    is_finished: {
      definition: 'BOOL NOT NULL DEFAULT 0'
    }
  });
}
