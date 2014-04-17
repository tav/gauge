// Public Domain (-) 2014 The Gauge Authors.
// See the Gauge UNLICENSE file for details.

(function() {

  var root = this;
  var isNode = !!(typeof module !== 'undefined' && module.exports);
  var hasGC = !!(isNode && global.gc);

  var clock,
      highPrecision = true;

  var PENDING = 1,
      RUNNING = 2,
      DONE = 3,
      FAILED = 4;

  if (isNode) {
    var hrtime = process.hrtime;
    clock = function() {
      var time = hrtime();
      return (time[0] * 1e9) + time[1];
    };
  } else {
    var perf = root.performance;
    if (perf && perf.now) {
      clock = function() {
        return perf.now() * 1e6;
      };
    } else {
      highPrecision = false;
      var now = Date.now;
      var latest = now();
      var skew = 0;
      clock = function() {
        var v = now();
        if (v < latest) {
          skew += latest - v + 1;
        }
        latest = v;
        return (v + skew) * 1e6;
      };
    }
  }

  var roundDown10 = function(n) {
    var result = 1,
        tens = 0;
    n = n|0;
    while (n >= 10) {
      n = (n / 10)|0;
      tens++;
    }
    for (var i = 0; i < tens; i++) {
      result *= 10;
    }
    return result;
  };

  var roundUp = function(n) {
    var base = roundDown10(n),
        prospect;
    if (n <= base) {
        return base;
    }
    if (n <= (prospect = (2 * base))) {
        return prospect;
    }
    if (n <= (prospect = (5 * base))) {
        return prospect;
    }
    return 10 * base;
  };

  var render = function(results, overwrite) {
    if (isNode && overwrite) {
      var back = results.length + ("RUNNING ".length);
      for (var i = 0; i < back; i++) {
        write('\b');
      }
    }
    results.forEach(function(test) {
      var resp;
      if (test.state === DONE) {
        resp = ['PASS'];
      } else {
        resp = ['FAIL'];
      }
      if (test.name.length > 24) {
        resp.push(test.name.slice(0, 20) + " ...");
      } else {
        resp.push((test.name + "                        ").slice(0, 24));
      }
      resp.push(("            " + test.n).slice(-10));
      var cost = "" + ((test.elapsed / test.n)|0) + " ns/op";
      if (cost.length <= 18) {
        cost = ("            " + cost).slice(-18)
      }
      resp.push(cost);
      console.log(resp.join('  '));
    });
  };

  var write = function(s) {
    if (isNode) {
      process.stdout.write(s);
    } else {
      if (s !== '\b') {
        console.log(s);
      }
    }
  };

  var run = function(g) {
    var cur,
        i,
        last,
        n,
        perOp,
        tests = g._tests,
        l = tests.length;
    for (i = g._idx; i < l; i++) {
      g._idx = i;
      g._cur = cur = tests[i];
      if (cur.state === PENDING) {
        if (i === 0) {
          write("RUNNING ");
        }
        cur.state = RUNNING;
        runN(g, 1);
        if (cur.async) {
          return;
        }
      }
      if (cur.state === RUNNING) {
        n = cur.n;
        while (cur.state !== FAILED && cur.elapsed < g._duration && n < 1e9) {
          last = n;
          perOp = cur.elapsed / n;
          // console.log("idx: %s, last: %s, perop: %s", i, last, perOp)
          if (perOp === 0) {
            if (highPrecision) {
              n = 1e9;
            } else {
              n = roundUp(last+1);
            }
          } else {
            n = g._duration / perOp;
            if (highPrecision) {
              n = roundUp(Math.max(Math.min(n+((n/2)|0), 100*last), last+1));
            } else {
              n = roundUp(100*last);
            }
          }
          if (n > 1e9) {
            n = 1e9;
          }
          runN(g, n);
          if (cur.async) {
            return;
          }
        }
        if (cur.state === RUNNING) {
          cur.state = DONE;
        }
        write('.');
      }
    }
    g._finished = true;
    render(tests, true);
    if (g._callback !== void 0) {
      g._callback(tests);
    }
  };

  var tryTest = function(g, test) {
    try {
      test.fn(g);
    } catch (_err) {
      // TODO(tav): capture the stack trace.
      test.state = FAILED;
    }
  };

  var runN = function(g, n) {
    if (hasGC) {
      gc();
    }
    var cur = g._cur;
    g.n = cur.n = n;
    g.resetTimer();
    g.startTimer();
    tryTest(g, cur);
    if (cur.async) {
      return;
    }
    g.stopTimer();
  };

  var gauge = function(tests) {
    Object.keys(tests).forEach(function(key) {
      var fn = tests[key];
      gauge.queue.push({
        async: fn.length === 2,
        bytes: 0,
        done: 0,
        elapsed: 0,
        fn: fn,
        n: 0,
        name: key,
        state: PENDING,
        traceback: "",
      });
    });
  };

  gauge.queue = [];
  gauge.render = render;

  gauge.run = function(opts, callback) {
    if (opts === void 0) {
      opts = {};
    }
    var g = new Gauge(opts, callback);
    run(g);
    return g;
  };

  var Gauge = function(opts, callback) {
    this._callback = callback;
    this._cur = gauge.queue[0];
    this._duration = (opts.duration || 500) * 1e6;
    this._finished = false;
    this._idx = 0;
    this._running = false;
    this._start = 0;
    this._timeout = opts.timeout || 3000;
    this._tests = gauge.queue;
    gauge.queue = [];
  };

  Gauge.prototype = {

    done: function() {
      var cur = this._cur;
      cur.done += 1;
      if (cur.done === cur.n) {
        this.stopTimer();
        run(this);
      } else {
        tryTest(this, cur);
      }
    },

    resetTimer: function() {
      if (this._running) {
        this._start = clock();
      }
      this._cur.elapsed = 0;
      this._cur.bytes = 0;
    },

    setBytes: function(n) {
      this._cur.bytes = n;
    },

    startTimer: function() {
      if (!this._running) {
        this._running = true;
        this._start = clock();
      }
    },

    stopTimer: function() {
      if (this._running) {
        this._running = false;
        this._cur.elapsed += clock() - this._start;
      }
    },

  };

  root.gauge = gauge;
  if (isNode) {
     module.exports = gauge;
  }

})();
