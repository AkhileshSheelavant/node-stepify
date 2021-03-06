var assert = require('assert');
var should = require('should');
var domain = require('domain');

var Stepify = require('../index');

// for test...
var fs = require('fs');
var path = require('path');
var exec = require('child_process').exec;

describe('Step', function() {
    describe('#done()', function() {
        it('should execute without error when nothing or `null` been accessing in', function(done) {
            Stepify()
                .step(function() {
                    var root = this;
                    setTimeout(function() {
                        root.fulfill(1);
                        root.done();
                    }, 300);
                })
                .step(function() {
                    var root = this;
                    fs.readFile(__filename, function(err) {
                        root.done(null);
                    });
                })
                .result(function(r) {
                    r.should.eql([1]);
                    done();
                })
                .run();
        });

        it('should access error to errorHandle', function(done) {
            Stepify()
                .step(function() {
                    var root = this;
                    fs.readdir('./not_exists.js', function(err) {
                        if(err) err = 'Error mock: file was not found.';
                        root.done(err, 1);
                    });
                })
                .step(function() {
                    var root = this;
                    setTimeout(function() {
                        root.done();
                    }, 300);
                })
                .error(function(err) {
                    err.should.equal('Error mock: file was not found.');
                    done();
                })
                .run();
        });

        it('should execute customed callback after async task done', function(done) {
            var c = 0;
            Stepify()
                .step(function() {
                    var root = this;
                    setTimeout(function() {
                        root.done(null, function() {
                            c++;
                            root.next(c);
                        });
                    }, 300);
                })
                .step(function(n) {
                    n.should.equal(1);
                    var root = this;
                    setTimeout(function() {
                        root.done(null, function(x) {
                            root.next(x);
                        }, n + 10);
                    }, 200);
                })
                .step(function(n) {
                    n.should.equal(11);
                    var root = this;
                    setTimeout(function() {
                        root.done();
                    }, 100);
                })
                .result(function() {
                    done();
                })
                .run();
        });

        it('should access extra params to callback', function(done) {
            Stepify()
                .step(function(n) {
                    n.should.equal(300);
                    var root = this;
                    setTimeout(function() {
                        root.done(null, n);
                    }, n);
                }, 300)
                .step(function(n) {
                    n.should.equal(300);
                    var root = this;
                    var n2 = n - 100;
                    setTimeout(function() {
                        root.done(null, function(x) {
                            root.fulfill(x);
                            root.next();
                        }, n2);
                    }, n2);
                })
                .result(function(n) {
                    n.should.eql([200]);
                    done();
                })
                .run();
        });
    });

    describe('#wrap()', function() {
        it('should run as a shortcut of this.done.bind(this) inner stepHandle', function(done) {
            Stepify()
                .step(function() {
                    fs.readdir(__dirname, this.wrap());
                })
                .step(function(list) {
                    list.sort().should.eql(fs.readdirSync(__dirname).sort());
                    fs.readFile(__filename, this.wrap());
                })
                .step(function(fileStr) {
                    fileStr.toString().should.equal(fs.readFileSync(__filename).toString());
                    this.done();
                })
                .result(function() {
                    done();
                })
                .run();
        });
    });

    describe('#fulfill()', function() {
        it('should push step\'s result to finish handle ', function(done) {
            Stepify()
                .task('timer')
                    .step(function(n) {
                        var root = this;
                        setTimeout(function() {
                            root.fulfill(n);
                            root.done(null, n*2);
                        }, n);
                    }, 200)
                    .step(function(n) {
                        var root = this;
                        setTimeout(function() {
                            root.fulfill(n, 'for test');
                            root.done();
                        }, n);
                    })
                .task('fs')
                    .step(function() {
                        var root = this;
                        fs.readFile(__filename, function(err, fileStr) {
                            if(err) root.done(err);
                            root.fulfill({__filename: fileStr.toString()});
                            root.done();
                        });
                    })
                    .step(function() {
                        var root = this;
                        fs.readdir(__dirname, function(err, list) {
                            if(err) root.done(err);
                            root.fulfill(list.sort());
                            root.done();
                        });
                    })
                .result(function(r) {
                    r.should.eql([
                        200,
                        400,
                        'for test',
                        {
                            __filename: fs.readFileSync(__filename).toString()
                        },
                        fs.readdirSync(__dirname).sort()
                    ]);
                    done();
                })
                .run();
        });
    });

    describe('#vars()', function() {
        it('should store variables for task runtime', function(done) {
            Stepify()
                .task('foo')
                    .step(function() {
                        var root = this;
                        setTimeout(function() {
                            root.vars('key', 'value');
                            root.done();
                        }, 200);
                    })
                    .step(function() {
                        this.vars('key').should.equal('value');
                        should.strictEqual(undefined, this.vars('not_exists'));
                        this.done();
                    })
                .pend()
                .step(function() {
                    // variables stored via `vars()` method can only avaiable to this task
                    should.strictEqual(undefined, this.vars('key'));
                    this.done();
                })
                .result(function() {
                    done();
                })
                .run();
        });
    });

    describe('#parallel()', function() {
        var index = path.resolve(__dirname, '../index.js');
        var files = [index, __filename];
        var exed = [];

        it('should support parallel(arr, iterator[, callback]) mode', function(done) {
            Stepify()
                .step('a', function() {
                    exed.push(this.name);
                    this.parallel(files, fs.readFile, {encoding: 'utf8'});
                })
                .step('b', function(list) {
                    exed.push(this.name);

                    list.should.have.length(2);
                    list[0].toString().should.equal(fs.readFileSync(index).toString());
                    list[1].toString().should.equal(fs.readFileSync(__filename).toString());

                    this.parallel(files, fs.readFile, {encoding: 'utf8'}, this.next);
                })
                .step('c', function(list) {
                    list.should.have.length(2);
                    list[0].toString().should.equal(fs.readFileSync(index).toString());
                    list[1].toString().should.equal(fs.readFileSync(__filename).toString());

                    this.parallel(files, fs.readFile, function(results) {
                        exed.push(this.name);
                        results.should.be.an.Array;
                        this.next(results);
                    });
                })
                .step('d', function(list) {
                    list.should.have.length(2);
                    list[0].toString().should.equal(fs.readFileSync(index).toString());
                    list[1].toString().should.equal(fs.readFileSync(__filename).toString());

                    var root = this;

                    setTimeout(function() {
                        exed.push(root.name);
                        root.done();
                    }, 300);
                })
                .result(function() {
                    exed.should.eql(['a', 'b', 'c', 'd']);
                    done();
                })
                .run();
        });

        it('should support parallel(fnArr[, callback]) mode', function(done) {
            Stepify()
                .step('a', function() {
                    this.parallel([
                        function(callback) {
                            fs.readFile(__filename, callback);
                        },
                        function(callback) {
                            setTimeout(function() {
                                callback(null, 'timer return');
                            }, 500);
                        }
                    ]);
                })
                .step('b', function(r) {
                    r.should.be.an.Array;
                    r.should.have.length(2);
                    r[0].toString().should.equal(fs.readFileSync(__filename).toString());
                    r[1].should.equal('timer return');

                    this.parallel([
                        function(callback) {
                            fs.readFile(index, callback);
                        },
                        function(callback) {
                            setTimeout(function() {
                                callback(null, 'timer2 return');
                            }, 500);
                        }
                    ], function(results) {
                        this.next(results);
                    });
                })
                .step('c', function(r) {
                    r.should.be.an.Array;
                    r.should.have.length(2);
                    r[0].toString().should.equal(fs.readFileSync(index).toString());
                    r[1].should.equal('timer2 return');

                    done();
                })
                .run();
        });

        it('should access exceptions into errorHandle when using parallel(arr, iterator[, callback]) mode', function(done) {
            // mocha can not caught errors when working with node v0.8.x
            if(process.version.match(/v0.8/)) return done();

            var d = domain.create();
            var c = 0;

            d.on('error', function(err) {
                c.should.equal(1);
                err.message.should.equal('non_existent.js was not found');
                done();
            });

            d.enter();

            Stepify()
                .step(function() {
                    c++;
                    var mock = files.splice(0);
                    mock.splice(1, 0, 'non_existent.js');
                    this.parallel(mock, fs.readFile, 'utf8');
                })
                .step(function() {
                    // should not step into this step
                    c++;
                })
                .error(function(err) {
                    // rewrite err for testing...
                    if(err) err = 'non_existent.js was not found';
                    throw new Error(err);
                })
                .run();

            d.exit();
        });

        it('should access exceptions into errorHandle when using parallel(arr[, callback]) mode', function(done) {
            // mocha can not caught errors when working with node v0.8.x
            if(process.version.match(/v0.8/)) return done();

            var d = domain.create();
            var c = 0;

            d.on('error', function(err) {
                c.should.equal(1);
                err.message.should.equal('non_existent.js was not found');
                done();
            });

            d.enter();

            Stepify()
                .step(function() {
                    this.parallel([
                        function(callback) {
                            setTimeout(function() {
                                c++;
                                // do some more stuff ...
                                callback(null, 1);
                            }, 10);
                        },
                        function(callback) {
                            c++;
                            fs.readFile('non_existent.js', callback);
                        },
                        function(callback) {
                            setTimeout(function() {
                                c++;
                                callback(null, 1);
                            }, 20);
                        }
                    ]);
                })
                .step(function() {
                    // should not run into this step
                    c++;
                })
                .error(function(err) {
                    // rewrite err for testing...
                    if(err) err = 'non_existent.js was not found';
                    throw new Error(err);
                })
                .run();

            d.exit();
        });
    });

    // Be careful using this method
    describe('#jump()', function() {
        it('should support jump(stepName) mode', function(done) {
            var steps = [];
            Stepify()
                .step('a', function() {
                    steps.push(this.name);
                    this.done();
                })
                .step('b', function() {
                    steps.push(this.name);
                    this.done();
                })
                .step(function() {
                    if(!this.vars('flag')) {
                        this.jump('a');
                        this.vars('flag', 1)
                    } else {
                        this.next();
                    }
                })
                .step('c', function() {
                    steps.push(this.name);
                    this.done();
                })
                .result(function() {
                    steps.should.eql(['a', 'b', 'a', 'b', 'c']);
                    done();
                })
                .run();
        });

        it('should support jump(index) mode', function(done) {
            var steps = [];
            Stepify()
                .step('a', function() {
                    steps.push(this.name);
                    this.done();
                })
                .step('b', function() {
                    steps.push(this.name);
                    this.done();
                })
                .step(function() {
                    if(!this.vars('flag')) {
                        this.jump(1);
                        this.vars('flag', 1)
                    } else {
                        this.next();
                    }
                })
                .step('c', function() {
                    steps.push(this.name);
                    this.done();
                })
                .result(function() {
                    steps.should.eql(['a', 'b', 'b', 'c']);
                    done();
                })
                .run();
        });

        it('should support jump(step) mode', function(done) {
            var steps = [];
            Stepify()
                .step('a', function() {
                    steps.push(this.name);
                    this.done();
                })
                .step('b', function() {
                    steps.push(this.name);
                    this.done();
                })
                .step(function() {
                    if(!this.vars('flag')) {
                        this.jump(-2);
                        this.vars('flag', 1)
                    } else {
                        this.next();
                    }
                })
                .step('c', function() {
                    steps.push(this.name);
                    this.done();
                })
                .result(function() {
                    steps.should.eql(['a', 'b', 'a', 'b', 'c']);
                    done();
                })
                .run();
        });
    });

    describe('#next()', function() {
        it('should pass variables into next step handle', function(done) {
            var steps = [];
            Stepify()
                .step('a', function() {
                    var root = this;
                    setTimeout(function() {
                        steps.push(root.name);
                        root.next();
                    }, 500);
                })
                .step('b', function() {
                    var root = this;
                    setTimeout(function() {
                        steps.push(root.name);
                        root.next('params will be passed to the next step');
                    }, 500);
                })
                .step('c', function(param) {
                    steps.push(this.name);
                    param.should.equal('params will be passed to the next step');
                    this.done();
                })
                .result(function() {
                    steps.should.eql(['a', 'b', 'c']);
                    done();
                })
                .run();
        });
    });

    describe('#end()', function() {
        it('should stop executing the rest tasks(or steps) when end([null]) called', function(done) {
            var c = 0;
            var execd = [];
            Stepify()
                .step(function() {
                    var root = this;
                    setTimeout(function() {
                        c++;
                        execd.push(root.name);
                        root.done();
                    }, 300);
                })
                .step(function() {
                    var root = this;
                    setTimeout(function() {
                        c++;
                        execd.push(root.name);
                        // return root.end(null);
                        root.done(null, function() {
                            root.end();
                        });
                    }, 200);
                })
                .step(function() {
                    var root = this;
                    setTimeout(function() {
                        c++;
                        execd.push(root.name);
                        root.done(null);
                    }, 300);
                })
                .pend()
                .step('foo', function() {
                    var root = this;
                    setTimeout(function() {
                        c++;
                        execd.push(root.name);
                        root.done(null);
                    }, 300);
                })
                .result(function() {
                    c.should.equal(3);
                    execd.should.eql(['_UNAMED_STEP_0', '_UNAMED_STEP_1', 'foo']);
                    done();
                })
                .run();
        });

        it('should access error to errorHandle when end(error) called', function(done) {
            var c = 0;
            var flag = 0;
            Stepify()
                .task('foo')
                    .step(function() {
                        var root = this;
                        setTimeout(function() {
                            c++;
                            root.done();
                        }, 500);
                    })
                    .step(function() {
                        var root = this;
                        setTimeout(function() {
                            c++;
                            root.end(new Error('There sth error.'));
                        }, 200);
                    })
                .task('bar')
                    .step(function() {
                        var root = this;
                        setTimeout(function() {
                            c++;
                            root.done();
                        }, 300);
                    })
                .pend()
                .error(function(err) {
                    flag++;
                    err.message.should.equal('There sth error.');
                    // continue executing when error accuring
                    this.next();
                })
                .result(function() {
                    c.should.equal(3);
                    flag.should.equal(1);
                    done();
                })
                .run();
        });
    });
});
