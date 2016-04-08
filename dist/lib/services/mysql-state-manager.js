"use strict";
var node_mysql2_wrapper_1 = require('node-mysql2-wrapper');
var MySQLStateManager = (function () {
    function MySQLStateManager(config) {
        this.config = config;
        this.mysql = new node_mysql2_wrapper_1.MySQL(this.config);
    }
    MySQLStateManager.prototype.save = function (work) {
        throw new Error('Not implemented yet');
    };
    MySQLStateManager.prototype.saveAll = function (work) {
        throw new Error('Not implemented yet');
    };
    MySQLStateManager.prototype.load = function (id) {
        throw new Error('Not implemented yet');
    };
    MySQLStateManager.prototype.loadAll = function (ids) {
        throw new Error('Not implemented yet');
    };
    MySQLStateManager.prototype.childWorkFinished = function (work, parent) {
        throw new Error('Not implemented yet');
    };
    return MySQLStateManager;
}());
Object.defineProperty(exports, "__esModule", { value: true });
exports.default = MySQLStateManager;
//# sourceMappingURL=mysql-state-manager.js.map