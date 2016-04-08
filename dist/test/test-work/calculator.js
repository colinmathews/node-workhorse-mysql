"use strict";
var es6_promise_1 = require('es6-promise');
var node_workhorse_1 = require('node-workhorse');
var Calculator = (function () {
    function Calculator() {
        this.errors = [];
    }
    Calculator.prototype.run = function (work) {
        var _this = this;
        return new es6_promise_1.Promise(function (ok, fail) {
            var input = work.input;
            if (typeof (input.x) !== 'number' || typeof (input.y) !== 'number') {
                return fail(new Error('Inputs must be numbers'));
            }
            var children;
            if (input.twice) {
                _this.workhorse.logger.logInsideWork(work, 'Creating child work');
                children = _this.createChildWork(input);
            }
            else if (input.recurse > 0) {
                _this.workhorse.logger.logInsideWork(work, 'Creating child work');
                children = _this.createChildWork(input);
            }
            _this.workhorse.logger.logInsideWork(work, 'Performing addition');
            ok({
                result: input.x + input.y,
                childWork: children
            });
        });
    };
    Calculator.prototype.createChildWork = function (input) {
        var newInput = {
            x: input.errorOnChildRun ? 'purposeful-error' : input.x,
            y: input.y
        };
        if (input.recurse) {
            newInput.recurse = input.recurse - 1;
        }
        return [new node_workhorse_1.Work('working://dist/test/test-work/calculator', newInput)];
    };
    Calculator.prototype.onChildrenDone = function (work) {
        return work.deep(this.workhorse)
            .then(function (deep) {
            return deep.children.reduce(function (result, row) {
                var add = 0;
                if (row.finalizerResult) {
                    add += result + (row.finalizerResult.result || 0);
                }
                add += row.result.result;
                return result + add;
            }, 0);
        });
    };
    return Calculator;
}());
Object.defineProperty(exports, "__esModule", { value: true });
exports.default = Calculator;
//# sourceMappingURL=calculator.js.map