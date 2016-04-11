"use strict";
var node_mysql2_wrapper_1 = require('node-mysql2-wrapper');
function createWorkTables(sql, workTableName, workResultTableName, workChildrenTableName) {
    if (workTableName === void 0) { workTableName = 'work'; }
    if (workResultTableName === void 0) { workResultTableName = 'work_result'; }
    if (workChildrenTableName === void 0) { workChildrenTableName = 'work_children'; }
    var exec = sql.transaction();
    var promise = createWorkTable(exec, workTableName)
        .then(function () {
        return createWorkResultTable(exec, workResultTableName);
    })
        .then(function () {
        return createWorkChildrenTable(exec, workChildrenTableName);
    })
        .then(function () {
        return node_mysql2_wrapper_1.addForeignKey(exec, workTableName, ['parent_id'], workTableName, ['id'], 'work_parent_id');
    })
        .then(function () {
        return node_mysql2_wrapper_1.addForeignKey(exec, workTableName, ['result_id'], workResultTableName, ['id'], 'work_result_id');
    })
        .then(function () {
        return node_mysql2_wrapper_1.addForeignKey(exec, workTableName, ['finalizer_result_id'], workResultTableName, ['id'], 'work_finalizer_result_id');
    })
        .then(function () {
        return node_mysql2_wrapper_1.addForeignKey(exec, workChildrenTableName, ['parent_work_id'], workTableName, ['id'], 'work_children_parent_id');
    })
        .then(function () {
        return node_mysql2_wrapper_1.addForeignKey(exec, workChildrenTableName, ['child_work_id'], workTableName, ['id'], 'work_children_child_id');
    });
    return exec.done(promise);
}
Object.defineProperty(exports, "__esModule", { value: true });
exports.default = createWorkTables;
function createWorkTable(sql, tableName) {
    return node_mysql2_wrapper_1.create(sql, tableName, {
        id: {
            definition: 'INT NOT NULL AUTO_INCREMENT',
            isPrimary: true
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
        }
    });
}
function createWorkResultTable(sql, tableName) {
    return node_mysql2_wrapper_1.create(sql, tableName, {
        id: {
            definition: 'INT NOT NULL AUTO_INCREMENT',
            isPrimary: true
        },
        result_json: {
            definition: 'TEXT NULL'
        },
        started: {
            definition: 'TIMESTAMP NULL'
        },
        ended: {
            definition: 'TIMESTAMP NULL'
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
function createWorkChildrenTable(sql, tableName) {
    return node_mysql2_wrapper_1.create(sql, tableName, {
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
//# sourceMappingURL=create-work-tables.js.map